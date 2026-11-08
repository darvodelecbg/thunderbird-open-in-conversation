import zipfile, pathlib

root = pathlib.Path(__file__).parent
out = root / "open-in-conversation.xpi"
files = [
    "manifest.json",
    "background.js",
    "options.html",
    "options.js",
    "api/schema.json",
    "api/implementation.js",
    "_locales/en/messages.json",
    "_locales/bg/messages.json",
]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(root / f, f)
print(out)
