# Replaces one weapon's GLB inside js/data/WeaponModels.js (keeps every other entry byte-identical).
#   python3 tools/update_weapon_glb.py "Demonic Fury" out/demonic_fury.glb [...more name/path pairs]
import base64, json, re, sys
OUT = "android/app/src/main/assets/js/data/WeaponModels.js"
src = open(OUT).read()
args = sys.argv[1:]
for name, path in zip(args[::2], args[1::2]):
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    pat = re.compile(r'("%s":\s*")[^"]*(")' % re.escape(name))
    if pat.search(src):
        src = pat.sub(lambda m: m.group(1) + b64 + m.group(2), src, count=1)
    else:
        src = src.replace("window.DR_WEAPON_GLB = {", "window.DR_WEAPON_GLB = {\n" + json.dumps(name) + ": " + json.dumps(b64) + ",", 1)
    print("updated", name, len(b64))
open(OUT, "w").write(src)
