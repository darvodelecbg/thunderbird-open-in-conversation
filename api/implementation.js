/* Open In Conversation - Thunderbird 128+ port.
 *
 * Thunderbird's thread pane routes Enter, double-click and middle-click through
 * threadPane._onItemActivate() (about3Pane.js), which ends in cmd_openMessage.
 * We wrap that method: when the selected message is indexed by the global
 * search (Gloda) we run cmd_openConversation instead, which is the same thing
 * the context menu entry "Open Message in Conversation" does.
 * Drafts, templates and middle-click keep the stock behaviour.
 */
"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

const LISTENER_ID = "open_in_conversation@hartz.io";
const MESSENGER = "chrome://messenger/content/messenger.xhtml";

// about:3pane windows we patched -> original _onItemActivate
const patched = new Map();
// messenger windows -> tab monitor we registered
const monitors = new Map();
// browsers we attached a load listener to
const hooked = new WeakSet();

function log(...args) {
  console.log("[Open In Conversation]", ...args);
}

function patch3Pane(win) {
  try {
    if (!win || patched.has(win) || win.location?.href != "about:3pane") {
      return;
    }
    const tp = win.threadPane;
    const cc = win.commandController;
    if (!tp || !cc || typeof tp._onItemActivate != "function") {
      return;
    }
    const orig = tp._onItemActivate;
    tp._onItemActivate = function (event) {
      try {
        const middle = event?.button == 1;
        const folder =
          win.gFolder || win.gDBView?.hdrForFirstSelectedMessage?.folder;
        const special =
          folder?.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true) ||
          folder?.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true);
        if (!middle && !special && cc.isCommandEnabled("cmd_openConversation")) {
          cc.doCommand("cmd_openConversation", event);
          return undefined;
        }
      } catch (e) {
        console.error("[Open In Conversation]", e);
      }
      return orig.call(this, event);
    };
    patched.set(win, orig);
    win.addEventListener("unload", () => patched.delete(win), { once: true });
    log("patched", win.location.href);
  } catch (e) {
    console.error("[Open In Conversation] patch failed", e);
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
