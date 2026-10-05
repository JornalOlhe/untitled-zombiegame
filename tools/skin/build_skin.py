# Builds the survivor's HD block skin (256x256, Minecraft 64x64 layout at 4x) from the supplied
# model sheet: every face is sampled from the matching orthographic view (FRONT/LEFT/BACK/RIGHT)
# exactly as it is seen from outside, then pixel-quantised. A hat layer carries the hair volume.
#   python3 tools/skin/build_skin.py <sheet.png> <out_skin.png>
import sys
from PIL import Image

sheet = Image.open(sys.argv[1]).convert("RGBA")
S = 4  # 64-layout unit -> pixels (256x256 HD skin)
skin = Image.new("RGBA", (64 * S, 64 * S), (0, 0, 0, 0))

# view-space boxes (sheet pixels)
V = {
    "front": {"head": (75, 41, 175, 141), "body": (75, 146, 164, 276), "armR": (26, 145, 66, 280), "armL": (166, 145, 206, 280), "legR": (62, 276, 117, 445), "legL": (125, 276, 180, 445)},
    "back": {"head": (412, 41, 512, 141), "body": (418, 146, 506, 276), "armL": (371, 145, 414, 280), "armR": (508, 145, 549, 280), "legL": (400, 276, 452, 445), "legR": (467, 276, 520, 445)},
    "left": {"head": (245, 41, 345, 141), "arm": (268, 145, 314, 280), "leg": (270, 276, 325, 445), "body": (275, 146, 310, 276)},
    "right": {"head": (580, 41, 682, 141), "arm": (603, 145, 656, 280), "leg": (595, 276, 662, 445), "body": (612, 146, 648, 276)},
}

def face(box, w, h, flip=False):
    im = sheet.crop(box).resize((w * S, h * S), Image.BOX)
    return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im

def solid(w, h, col):
    return Image.new("RGBA", (w * S, h * S), col)

def put(im, x, y):
    skin.paste(im, (x * S, y * S))

def avg(box):
    c = sheet.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0))
    return c

hair = avg((440, 50, 490, 90))
skincol = avg((100, 170, 140, 220))
pants = avg((80, 330, 110, 380))
sole = (226, 226, 220, 255)

def part(ox, oy, w, h, d, faces):
    # standard box unwrap: top/bottom row then right, front, left, back
    put(faces["top"], ox + d, oy); put(faces["bottom"], ox + d + w, oy)
    put(faces["right"], ox, oy + d); put(faces["front"], ox + d, oy + d)
    put(faces["left"], ox + d + w, oy + d); put(faces["back"], ox + 2 * d + w, oy + d)

F, B, L, R = V["front"], V["back"], V["left"], V["right"]
# head 8x8x8
part(0, 0, 8, 8, 8, {"top": solid(8, 8, hair), "bottom": solid(8, 8, skincol), "front": face(F["head"], 8, 8),
                     "back": face(B["head"], 8, 8), "left": face(L["head"], 8, 8), "right": face(R["head"], 8, 8)})
# body 8x12x4
part(16, 16, 8, 12, 4, {"top": solid(8, 4, skincol), "bottom": solid(8, 4, pants), "front": face(F["body"], 8, 12),
                        "back": face(B["body"], 8, 12), "left": face(L["body"], 4, 12), "right": face(R["body"], 4, 12)})
# arms 4x12x4 (right arm at 40,16 ; left arm at 32,48)
for (ox, oy), k, side in (((40, 16), "armR", "right"), ((32, 48), "armL", "left")):
    out = face((L if side == "left" else R)["arm"], 4, 12)
    part(ox, oy, 4, 12, 4, {"top": solid(4, 4, skincol), "bottom": solid(4, 4, skincol), "front": face(F[k], 4, 12),
                            "back": face(B[k], 4, 12), side: out, ("right" if side == "left" else "left"): out.transpose(Image.FLIP_LEFT_RIGHT)})
# legs 4x12x4 (right leg 0,16 ; left leg 16,48)
for (ox, oy), k, side in (((0, 16), "legR", "right"), ((16, 48), "legL", "left")):
    out = face((L if side == "left" else R)["leg"], 4, 12)
    part(ox, oy, 4, 12, 4, {"top": solid(4, 4, pants), "bottom": solid(4, 4, sole), "front": face(F[k], 4, 12),
                            "back": face(B[k], 4, 12), side: out, ("right" if side == "left" else "left"): out.transpose(Image.FLIP_LEFT_RIGHT)})

# hat layer (32,0): hair only, sampled from slightly larger boxes so the volume overhangs the head
def hairmask(im, keep_rows=None):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            dark = max(r, g, b) < 75 and abs(r - b) < 25
            if not dark or (keep_rows is not None and y >= keep_rows):
                px[x, y] = (0, 0, 0, 0)
    return im

def grow(box, f=0.06):
    x0, y0, x1, y1 = box; dx = (x1 - x0) * f; dy = (y1 - y0) * f
    return (int(x0 - dx), int(y0 - dy), int(x1 + dx), int(y1 + dy * 0.2))

part(32, 0, 8, 8, 8, {"top": solid(8, 8, hair),
                      "bottom": solid(8, 8, (0, 0, 0, 0)),
                      "front": hairmask(face(grow(F["head"]), 8, 8), keep_rows=int(8 * S * 0.36)),
                      "back": hairmask(face(grow(B["head"]), 8, 8)),
                      "left": hairmask(face(grow(L["head"]), 8, 8), keep_rows=int(8 * S * 0.75)),
                      "right": hairmask(face(grow(R["head"]), 8, 8), keep_rows=int(8 * S * 0.75))})
skin.save(sys.argv[2])
print("skin", skin.size, "hair", hair, "skin", skincol)
