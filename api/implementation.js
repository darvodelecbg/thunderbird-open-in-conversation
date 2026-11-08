/* Open In Conversation - Thunderbird 128+ port.
 *
 * Thunderbird's thread pane routes Enter, double-click and middle-click through
 * threadPane._onItemActivate() (about3Pane.js), which ends in cmd_openMessage.
 * We wrap that method per 3-pane tab. When the trigger is enabled in the
 * options and the selected message is indexed by the global search (Gloda), we
 * open its conversation, the same view as the context menu entry
 * "Open Message in Conversation". Drafts and templates always keep the stock
 * behaviour. With "skipSingle" on, a conversation that holds just one message
 * (no replies in any folder) opens as a plain message.
 */
"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { ConversationOpener } = ChromeUtils.importESModule(
  "resource:///modules/ConversationOpener.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/Gloda.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

const LISTENER_ID = "open_in_conversation@hartz.io";
const MESSENGER = "chrome://messenger/content/messenger.xhtml";
const TAG = "[Open In Conversation]";
// about3Pane.js declares this as a const, so it is not reachable as a window property.
const MSG_VIEW_FLAG_DUMMY = 0x20000000;

let options = {
  onEnter: true,
  onDoubleClick: true,
  onMiddleClick: false,
  skipSingle: true,
};

// about:3pane windows we patched -> original _onItemActivate
const patched = new Map();
// messenger windows -> tab monitor we registered
const monitors = new Map();
// browsers we attached a load listener to
const hooked = new WeakSet();

function triggerEnabled(event) {
  if (!event) {
    return true;
  }
  if (event.button == 1) {
    return options.onMiddleClick;
  }
  if (event.type == "dblclick") {
    return options.onDoubleClick;
  }
  if (event.key == "Enter") {
    return options.onEnter;
  }
  return true;
}

function isSpecialFolder(win) {
  const folder = win.gFolder || win.gDBView?.hdrForFirstSelectedMessage?.folder;
  return (
    folder?.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true) ||
    folder?.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)
  );
}

/**
 * Count the messages of the Gloda conversation the header belongs to.
 * Resolves to 0 when Gloda does not know the message.
 */
function conversationSize(hdr) {
  return new Promise(resolve => {
    const listener = {
      onItemsAdded() {},
      onItemsModified() {},
      onItemsRemoved() {},
      onQueryCompleted(collection) {
        try {
          const msg = collection.items[0];
          if (!msg?.conversation) {
            resolve(0);
            return;
          }
          msg.conversation.getMessagesCollection({
            onItemsAdded() {},
            onItemsModified() {},
            onItemsRemoved() {},
            onQueryCompleted(all) {
              resolve(all.items.length);
            },
          });
        } catch (e) {
          console.error(TAG, e);
          resolve(0);
        }
      },
    };
    try {
      Gloda.getMessageCollectionForHeader(hdr, listener);
    } catch (e) {
      console.error(TAG, e);
      resolve(0);
    }
  });
}

/**
 * Open the current selection of an about:3pane window: conversation when
 * possible (and, with skipSingle, worth it), else the plain message(s).
 *
 * @param {Window} win - the about:3pane window
 * @param {Event} [event] - the activating event, if any
 * @param {boolean} [force] - ignore the trigger options (keyboard shortcut)
 * @returns {boolean} whether we handled the activation
 */
async function openSelection(win, event, force) {
  const cc = win.commandController;
  const hdrs = win.gDBView?.getSelectedMsgHdrs() ?? [];
  const openPlain = () =>
    MailUtils.displayMessages(
      hdrs,
      win.gViewWrapper,
      win.top.document.getElementById("tabmail"),
      event?.button == 1,
      event?.shiftKey
    );

  if (
    !hdrs.length ||
    isSpecialFolder(win) ||
    (!force && !triggerEnabled(event)) ||
    !cc.isCommandEnabled("cmd_openConversation")
  ) {
    return false;
  }
  if (options.skipSingle && !force) {
    // A collapsed thread with children in this folder needs no Gloda lookup.
    let inFolder = 0;
    try {
      inFolder = win.gDBView.getThreadContainingIndex(
        win.threadTree.selectedIndex
      ).numChildren;
    } catch (e) {
      // not a threaded view
    }
    if (inFolder <= 1) {
      const size = await conversationSize(hdrs[0]);
      if (size <= 1) {
        openPlain();
        return true;
      }
    }
  }
  new ConversationOpener(win).openConversationForMessages(hdrs);
  return true;
}

function patch3Pane(win) {
  try {
    if (!win || patched.has(win) || win.location?.href != "about:3pane") {
      return;
    }
    const tp = win.threadPane;
    if (
      !tp ||
      !win.commandController ||
      typeof tp._onItemActivate != "function"
    ) {
      return;
    }
    const orig = tp._onItemActivate;
    tp._onItemActivate = function (event) {
      try {
        const index = win.threadTree.selectedIndex;
        if (
          index >= 0 &&
          !(win.gDBView.getFlagsAt(index) & MSG_VIEW_FLAG_DUMMY) &&
          !isSpecialFolder(win) &&
          triggerEnabled(event) &&
          win.commandController.isCommandEnabled("cmd_openConversation")
        ) {
          // The single-message rule asks Gloda asynchronously; its fallback
          // to the plain message happens inside openSelection.
          openSelection(win, event, false).catch(e => console.error(TAG, e));
          return undefined;
        }
      } catch (e) {
        console.error(TAG, e);
      }
      return orig.call(this, event);
    };
    patched.set(win, orig);
    win.addEventListener("unload", () => patched.delete(win), { once: true });
  } catch (e) {
    console.error(TAG, "patch failed", e);
  }
}

function unpatch3Pane(win) {
  const orig = patched.get(win);
  if (orig && win.threadPane) {
    win.threadPane._onItemActivate = orig;
  }
  patched.delete(win);
}

function hookTab(tab) {
  const browser = tab?.chromeBrowser;
  if (!browser || tab.mode?.name != "mail3PaneTab") {
    return;
  }
  patch3Pane(browser.contentWindow);
  if (!hooked.has(browser)) {
    hooked.add(browser);
    // about:3pane may still be loading, or get reloaded later.
    browser.addEventListener(
      "load",
      () => patch3Pane(browser.contentWindow),
      true
    );
  }
}

function hookWindow(win) {
  const tabmail = win.document.getElementById("tabmail");
  if (!tabmail) {
    return;
  }
  for (const tab of tabmail.tabInfo) {
    hookTab(tab);
  }
  const monitor = {
    monitorName: LISTENER_ID,
    onTabTitleChanged() {},
    onTabSwitched() {},
    onTabOpened(tab) {
      hookTab(tab);
    },
    onTabClosing() {},
    onTabPersist() {
      return null;
    },
    onTabRestored() {},
  };
  tabmail.registerTabMonitor(monitor);
  monitors.set(win, monitor);
}

function unhookWindow(win) {
  const monitor = monitors.get(win);
  const tabmail = win.document?.getElementById("tabmail");
  if (monitor && tabmail) {
    tabmail.unregisterTabMonitor(monitor);
  }
  monitors.delete(win);
}

function start() {
  ExtensionSupport.registerWindowListener(LISTENER_ID, {
    chromeURLs: [MESSENGER],
    onLoadWindow: hookWindow,
    onUnloadWindow: unhookWindow,
  });
}

function stop() {
  ExtensionSupport.unregisterWindowListener(LISTENER_ID);
  for (const win of [...monitors.keys()]) {
    unhookWindow(win);
  }
  for (const win of [...patched.keys()]) {
    unpatch3Pane(win);
  }
}

this.openInConversation = class extends ExtensionCommon.ExtensionAPI {
  getAPI() {
    return {
      openInConversation: {
        async enable() {
          start();
        },
        async setOptions(opts) {
          options = { ...options, ...opts };
        },
        async openSelected() {
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          const pane =
            win?.document.getElementById("tabmail")?.currentAbout3Pane;
          if (!pane) {
            return;
          }
          const taken = await openSelection(pane, null, true);
          if (!taken) {
            pane.commandController.doCommand("cmd_openMessage");
          }
        },
      },
    };
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    stop();
  }
};
