// The add-on's logic lives in the experiment API (api/implementation.js).
// This page feeds it the saved options and wires the keyboard shortcut.

const DEFAULTS = {
  onEnter: true,
  onDoubleClick: true,
  onMiddleClick: false,
  skipSingle: true,
};

async function pushOptions() {
  const stored = await browser.storage.local.get(DEFAULTS);
  await browser.openInConversation.setOptions({ ...DEFAULTS, ...stored });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area == "local") {
    pushOptions();
  }
});

browser.commands.onCommand.addListener(name => {
  if (name == "open-conversation") {
    browser.openInConversation.openSelected();
  }
});

(async () => {
  await browser.openInConversation.enable();
  await pushOptions();
})();
