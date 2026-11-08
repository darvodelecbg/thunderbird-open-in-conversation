import zipfile, pathlib
root = pathlib.Path(__file__).parent
out = root / "open-in-conversation.xpi"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in ["manifest.json", "background.js", "api/schema.json", "api/implementation.js"]:
        z.write(root / f, f)
print(out)
