"""Embed generated JPEGs (tools/map_textures_gen.py output dir) into js/data/MapTextures.js.
usage: python3 tools/embed_map_textures.py <dir> name1 name2 ...   (names without .jpg)"""
import base64, re, sys
P = "android/app/src/main/assets/js/data/MapTextures.js"
d, names = sys.argv[1], sys.argv[2:]
s = open(P).read()
for n in names:
    uri = "data:image/jpeg;base64," + base64.b64encode(open(f"{d}/{n}.jpg", "rb").read()).decode()
    pat = re.compile(r'(  "%s":\s*)"data:image/jpeg;base64,[^"]*"' % re.escape(n))
    if pat.search(s): s = pat.sub(lambda m: m.group(1) + '"' + uri + '"', s)
    else:
        s = s.rstrip(); assert s.endswith("});"); s = s[:-3] + f'  "{n}": "{uri}",\n' + "});\n"
open(P, "w").write(s)
print("embedded", len(names))
