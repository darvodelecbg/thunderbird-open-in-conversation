const DEFAULTS = {
  onEnter: true,
  onDoubleClick: true,
  onMiddleClick: false,
  skipSingle: true,
};

for (const el of document.querySelectorAll("[data-i18n]")) {
  el.textContent = browser.i18n.getMessage(el.dataset.i18n);
}

(async () => {
  const stored = await browser.storage.local.get(DEFAULTS);
  for (const key of Object.keys(DEFAULTS)) {
    const box = document.getElementById(key);
    box.checked = stored[key];
    box.addEventListener("change", () =>
      browser.storage.local.set({ [key]: box.checked })
    );
  }
  const cmds = await browser.commands.getAll();
  const cmd = cmds.find(c => c.name == "open-conversation");
  document.getElementById("shortcutHint").textContent = browser.i18n.getMessage(
    "optShortcutHint",
    cmd?.shortcut || "-"
  );
})();
