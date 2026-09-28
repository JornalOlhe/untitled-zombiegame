# Dead Recoil — weapon models built directly from the WEAPON UV TEMPLATE sheets.
#
# Every part of a weapon is cut out of the template page (its side-view face), its silhouette is
# extracted and the part is extruded into a pixel relief ("voxel item" style): the side faces show
# the template pixels exactly, the thickness is bevelled one step at the edges and the walls take
# the colour of the edge pixels. Coplanar pixels are greedy-merged, so a part is a few hundred
# triangles. Parts are assembled from tools/blender/weapon_parts.json (positions in the game's
# viewmodel frame: x right, y up, -z forward; grip near z=0).
#
# Run:  TEMPLATE_DIR=<dir with the template pages> python3 tools/blender/weapons_from_templates.py <out_dir> [slug ...]
# then  python3 tools/pack_weapons.py <out_dir>
import json, math, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = json.load(open(os.path.join(HERE, "weapon_parts.json")))
TEMPLATE_DIR = os.environ.get("TEMPLATE_DIR", os.path.join(HERE, "..", "templates"))
PPM = 110  # template pixels per metre after resampling (keeps the chunky pixel-art look)

_pages = {}


def page(name):
    if name not in _pages:
        _pages[name] = np.asarray(Image.open(os.path.join(TEMPLATE_DIR, SPEC["pages"][name])).convert("RGB")).astype(np.float32) / 255.0
    return _pages[name]


def cut(part):
    """Crop the part's face from its page and return (rgb, mask) tight to the silhouette."""
    img = page(part["pg"])
    x0, y0, x1, y1 = part["box"]
    rgb = img[y0:y1, x0:x1]
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    bg = part.get("bg", 0.84)
    if part.get("dark"):  # artwork over a dark background: keep the bright / saturated pixels
        fg = (lum > part.get("light", 0.6)) | ((sat > part.get("sat", 0.25)) & (lum > part.get("min", 0.3)))
    else:
        fg = (lum < bg) | (sat > part.get("sat", 0.2))
    for x0_, y0_, x1_, y1_ in part.get("clear", []):  # rectangles (crop-relative) to drop
        fg[y0_:y1_, x0_:x1_] = False
    fg = nd.binary_opening(fg, structure=np.ones((part.get("open", 3),) * 2))
    lab, n = nd.label(fg)
    if n == 0:
        raise SystemExit("empty part " + json.dumps(part))
    sizes = nd.sum(fg, lab, range(1, n + 1))
    keep = part.get("keep", 1)
    order = np.argsort(sizes)[::-1][:keep]
    mask = np.isin(lab, order + 1)
    mask = nd.binary_fill_holes(mask)
    mask = nd.binary_erosion(mask, iterations=part.get("erode", 1)) | (mask & (lum < 0.55))  # drop the dashed-outline halo
    ys, xs = np.nonzero(mask)
    rgb, mask = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1], mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    k = part.get("rot90", 0)
    if k:
        rgb, mask = np.rot90(rgb, k), np.rot90(mask, k)
    if part.get("flip"):
        rgb, mask = rgb[:, ::-1], mask[:, ::-1]
    if part.get("flipv"):
        rgb, mask = rgb[::-1], mask[::-1]
    return np.ascontiguousarray(rgb), np.ascontiguousarray(mask)


def resample(rgb, mask, W, H):
    im = Image.fromarray((rgb * 255).astype(np.uint8)).resize((W, H), Image.BOX)
    mk = Image.fromarray((mask * 255).astype(np.uint8)).resize((W, H), Image.BOX)
    col = np.asarray(im).astype(np.float32) / 255.0
    m = np.asarray(mk).astype(np.float32) / 255.0 > 0.5
    # Pixels at the silhouette edge inherit the colour of an inner neighbour (no white fringe).
    if m.any():
        idx = nd.distance_transform_edt(~m, return_distances=False, return_indices=True)
        col = col[idx[0], idx[1]]
    return col, m


def greedy(mask):
    """Greedy rectangles covering `mask` (row-major): list of (r0, c0, r1, c1) exclusive."""
    m = mask.copy()
    H, W = m.shape
    out = []
    for r in range(H):
        c = 0
        while c < W:
            if not m[r, c]:
                c += 1
                continue
            c1 = c
            while c1 < W and m[r, c1]:
                c1 += 1
            r1 = r + 1
            while r1 < H and m[r1, c:c1].all():
                r1 += 1
            m[r:r1, c:c1] = False
            out.append((r, c, r1, c1))
            c = c1
    return out


class Builder:
    def __init__(self):
        self.pos, self.uv, self.idx, self.node = [], [], [], []
        self.tiles = []  # (rgb, emit) per part, packed later

    def quad(self, p, uv, node):
        b = len(self.pos)
        self.pos += p
        self.uv += uv
        self.idx.append((b, b + 1, b + 2, b + 3))
        self.node.append(node)

    def part(self, part, glow):
        rgb, mask = cut(part)
        h0, w0 = mask.shape
        axis = part.get("axis", "z")
        L = part["L"]
        W = max(2, int(round(L * PPM)))
        H = max(1, int(round(part["H"] * PPM))) if part.get("H") else max(1, int(round(W * h0 / w0)))
        col, m = resample(rgb, mask, W, H)
        if os.environ.get("DEBUG_DIR"):
            dbg = np.concatenate([col * m[..., None] + (1 - m[..., None]) * np.array([1, 0, 1]), np.repeat(m[..., None], 3, 2).astype(np.float32)], 1)
            Image.fromarray((dbg * 255).astype(np.uint8)).resize((dbg.shape[1] * 4, dbg.shape[0] * 4), Image.NEAREST).save(
                os.path.join(os.environ["DEBUG_DIR"], "%s_%d.png" % (part.get("_slug", "x"), len(self.tiles))))
        Hm = L * H / W  # metres
        t = part.get("t", 0.05)
        edt = nd.distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]
        bevel = part.get("bevel", 0.7)
        level = np.where(edt <= 1.0, bevel, 1.0)
        level[~m] = 0
        # emission: bright, saturated template pixels on glowing weapons
        hsv_v = col.max(2)
        hsv_s = (col.max(2) - col.min(2)) / np.maximum(hsv_v, 1e-4)
        emit = np.zeros_like(col)
        if glow:
            g = (hsv_v > part.get("gv", 0.82)) & (hsv_s > part.get("gs", 0.45)) & m
            emit[g] = col[g]
        tile = len(self.tiles)
        self.tiles.append((col, emit))
        node = part.get("node", "body")
        cx, cy, cz = part["c"]
        ang = math.radians(part.get("tilt", 0))  # rotation in the y-z plane (positive = muzzle up)
        ca, sa = math.cos(ang), math.sin(ang)

        def world(a, b, c):
            # a: along the image's width (metres, left -> right), b: up the image, c: thickness (+x)
            if axis == "x":  # flat piece facing the camera: width -> +x, thickness -> z
                return (cx + a, cy + b, cz + c)
            if axis == "z":
                y, z = b, -a
            else:  # vertical part: image left = top (+y), image top = forward (-z)
                y, z = -a, -b
            y, z = y * ca - z * sa, y * sa + z * ca
            return (cx + c, cy + y, cz + z)

        def A(i):
            return (i / W - 0.5) * L

        def B(j):
            return (0.5 - j / H) * Hm

        uvq = lambda i0, j0, i1, j1: [(tile, i0, j1), (tile, i1, j1), (tile, i1, j0), (tile, i0, j0)]
        for lv in (bevel, 1.0):
            sel = m & np.isclose(level, lv)
            d = t / 2 * lv
            for (r0, c0, r1, c1) in greedy(sel):
                a0, a1, b0, b1 = A(c0), A(c1), B(r1), B(r0)
                # +x face (as seen from the right) and -x face
                self.quad([world(a0, b0, d), world(a1, b0, d), world(a1, b1, d), world(a0, b1, d)], uvq(c0, r0, c1, r1), node)
                self.quad([world(a1, b0, -d), world(a0, b0, -d), world(a0, b1, -d), world(a1, b1, -d)],
                          [(tile, c1, r1), (tile, c0, r1), (tile, c0, r0), (tile, c1, r0)], node)
        # Walls between a pixel and a lower (or empty) neighbour, both sides. Runs of wall pixels
        # with the same depth step along a row/column become one quad (texture from the run's
        # middle pixel), which keeps the triangle count low.
        dep = np.where(m, level * t / 2, 0.0)
        src = np.pad(dep, 1)
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nb = src[1 + dr:1 + dr + H, 1 + dc:1 + dc + W]
            wall = m & (dep > nb + 1e-9)
            horizontal = dr != 0
            outer = range(H) if horizontal else range(W)
            for o in outer:
                inner = W if horizontal else H
                k = 0
                while k < inner:
                    r, c = (o, k) if horizontal else (k, o)
                    if not wall[r, c]:
                        k += 1
                        continue
                    key = (dep[r, c], nb[r, c])
                    k1 = k
                    while k1 < inner:
                        rr, cc = (o, k1) if horizontal else (k1, o)
                        if not wall[rr, cc] or (dep[rr, cc], nb[rr, cc]) != key:
                            break
                        k1 += 1
                    d_hi, d_lo = key
                    if dr == -1:
                        e = [(A(k), B(o)), (A(k1), B(o))]
                    elif dr == 1:
                        e = [(A(k1), B(o + 1)), (A(k), B(o + 1))]
                    elif dc == -1:
                        e = [(A(o), B(k1)), (A(o), B(k))]
                    else:
                        e = [(A(o + 1), B(k)), (A(o + 1), B(k1))]
                    mid = (k + k1) // 2
                    pr, pc = (o, mid) if horizontal else (mid, o)
                    tc = [(tile, pc + 0.5, pr + 0.5)] * 4
                    (pa, pb), (qa, qb) = e
                    for sgn in (1, -1):
                        quad = [world(pa, pb, sgn * d_lo), world(qa, qb, sgn * d_lo), world(qa, qb, sgn * d_hi), world(pa, pb, sgn * d_hi)]
                        if sgn < 0:
                            quad = quad[::-1]
                        self.quad(quad, tc, node)
                    k = k1

    def pack(self):
        """Shelf-pack the part images into one atlas; returns (atlas, emit, uv-mapper)."""
        order = sorted(range(len(self.tiles)), key=lambda i: -self.tiles[i][0].shape[0])
        for AW in (128, 256, 512, 1024, 2048):
            x = y = rowh = 0
            ok, at = True, {}
            for i in order:
                h, w = self.tiles[i][0].shape[:2]
                if x + w + 2 > AW:
                    x, y, rowh = 0, y + rowh, 0
                if w + 2 > AW or y + h + 2 > AW:
                    ok = False
                    break
                at[i] = (x + 1, y + 1)
                x += w + 2
                rowh = max(rowh, h + 2)
            if ok:
                break
        atlas = np.zeros((AW, AW, 3), np.float32)
        emit = np.zeros((AW, AW, 3), np.float32)
        for i, (x0, y0) in at.items():
            col, em = self.tiles[i]
            h, w = col.shape[:2]
            atlas[y0 - 1:y0 + h + 1, x0 - 1:x0 + w + 1] = np.pad(col, ((1, 1), (1, 1), (0, 0)), mode="edge")
            emit[y0 - 1:y0 + h + 1, x0 - 1:x0 + w + 1] = np.pad(em, ((1, 1), (1, 1), (0, 0)), mode="edge")
        uvs = [((at[t][0] + i) / AW, 1 - (at[t][1] + j) / AW) for (t, i, j) in self.uv]
        return atlas, emit, uvs, AW


def g2b(p):  # game frame (y up, -z forward) -> Blender (z up)
    return (p[0], -p[2], p[1])


def build(slug, spec):
    import bpy, bmesh
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    b = Builder()
    for part in spec["parts"]:
        part["_slug"] = slug
        b.part(part, spec.get("glow", False))
    atlas, emit, uvs, AW = b.pack()

    def to_image(name, arr):
        img = bpy.data.images.get(name)
        if img:
            bpy.data.images.remove(img)
        img = bpy.data.images.new(name, AW, AW, alpha=False)
        rgba = np.ones((AW, AW, 4), np.float32)
        rgba[..., :3] = arr[::-1]
        img.pixels.foreach_set(rgba.ravel())
        img.update()
        img.pack()
        return img

    col_img = to_image(slug + "_albedo", atlas)
    has_emit = emit.max() > 0
    em_img = to_image(slug + "_emit", emit) if has_emit else None
    mat = bpy.data.materials.new("M_" + slug)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = col_img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = spec.get("rough", 0.6)
    bsdf.inputs["Metallic"].default_value = spec.get("metal", 0.2)
    if em_img:
        et = nt.nodes.new("ShaderNodeTexImage")
        et.image = em_img
        et.interpolation = "Closest"
        nt.links.new(et.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 2.0
    objs = []
    for node in sorted(set(b.node)):
        me = bpy.data.meshes.new(slug + "_" + node)
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        vmap = {}
        for fi, tri in enumerate(b.idx):
            if b.node[fi] != node:
                continue
            vs = []
            for vi in tri:
                vs.append(bm.verts.new(g2b(b.pos[vi])))
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
            for loop, vi in zip(f.loops, tri):
                loop[uvl].uv = uvs[vi]
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(node if node in ("mag", "pump", "pin") else slug, me)
        ob.data.materials.append(mat)
        bpy.context.scene.collection.objects.link(ob)
        objs.append(ob)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(OUT, slug + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_materials="EXPORT", export_image_format="AUTO")
    print("built", slug, len(b.idx), "tris", os.path.getsize(path), "bytes")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.endswith(".py")]
    OUT = args[0] if args else "weapons_out"
    os.makedirs(OUT, exist_ok=True)
    only = set(args[1:])
    for slug, spec in SPEC["weapons"].items():
        if only and slug not in only:
            continue
        build(slug, spec)
