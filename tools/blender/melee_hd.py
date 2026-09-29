# Dead Recoil — HD melee rebuild (real 3D, not pixel-extruded planes).
#
# Every blade / ornament is a SOLID: its outline comes from the weapon's UV template, and its
# thickness follows the distance to the outline (thick spine / core, tapering bevel down to a thin
# edge), so it has front, back, side walls and a lens cross-section — it never disappears when seen
# edge-on. Shafts and grips are lathed/lofted (round or octagonal) with raised wraps and collars.
# Materials are PBR: albedo cut from the template, a normal map derived from the template relief,
# per-part roughness/metallic, and an emissive map for the glowing parts.
#
# Frame: game viewmodel frame (x right, y up, -z forward, grip near y=0). Objects are built in that
# frame and a root rotation maps it to Blender z-up for the glTF export (export_yup).
#
# Run:  python3 tools/blender/melee_hd.py <out_dir> [slug ...]
#       python3 tools/blender/turntable.py sheet.png <out_dir>/*.glb
#       python3 tools/update_weapon_glb.py "<Weapon Name>" <out_dir>/<slug>.glb
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
from PIL import Image
from scipy import ndimage as nd

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(HERE, "..", "templates")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/melee_hd"
ONLY = set(sys.argv[2:])
os.makedirs(OUT, exist_ok=True)
_pages = {}


def page(name):
    if name not in _pages:
        _pages[name] = np.asarray(Image.open(os.path.join(TPL, name)).convert("RGB")).astype(np.float32) / 255.0
    return _pages[name]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)


# ---------------------------------------------------------------- textures / materials
def np_image(name, rgb, alpha=None):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = rgb
    if alpha is not None:
        rgba[..., 3] = alpha
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.update()
    img.pack()
    img.file_format = "JPEG"
    return img


def normal_from(rgb, strength=2.5):
    """Tangent-space normal map from the template's own shading (dark grooves read as recesses)."""
    h = nd.gaussian_filter(rgb.mean(2), 0.8)
    gx = nd.sobel(h, axis=1) * strength
    gy = nd.sobel(h, axis=0) * strength
    n = np.stack([-gx, gy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def material(name, albedo=None, color=(0.5, 0.5, 0.5), rough=0.55, metal=0.0, normal=None, nstr=1.0,
             emit=None, emit_color=None, emit_strength=2.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], out.inputs[0])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if albedo is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = np_image(name + "_albedo", albedo)
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*color, 1)
    if normal is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = np_image(name + "_normal", normal)
        t.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nstr
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if emit is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = np_image(name + "_emit", emit)
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emit_strength
    elif emit_color is not None:
        b.inputs["Emission Color"].default_value = (*emit_color, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def shrink(arr, maxpx):
    h, w = arr.shape[:2]
    k = min(1.0, maxpx / max(h, w))
    if k >= 1:
        return arr
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    im = im.resize((max(2, int(w * k)), max(2, int(h * k))), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def glow_mask(rgb, hue="red"):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if hue == "red":
        m = (r > 0.62) & (r - np.maximum(g, b) > 0.35)
    elif hue == "blue":
        m = (b > 0.62) & (b - r > 0.25)
    else:
        m = rgb.mean(2) > 0.85
    return nd.gaussian_filter(m.astype(np.float32), 0.7)


# ---------------------------------------------------------------- geometry
def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def from_bm(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return link(ob)


def clean_halo(rgb, mask, tint=(0.55, 0.04, 0.05), band=7):
    """Glow halos painted over white paper read as pink/white on the model: push them to the glow hue."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    near_edge = nd.distance_transform_edt(mask) < band  # the halo is paper glow hugging the outline
    halo = near_edge & (r > 0.8) & (g > 0.5) & (b > 0.5) & (np.abs(g - b) < 0.14)
    out = rgb.copy()
    out[halo] = np.array(tint) * 0.6 + rgb[halo] * np.array((0.4, 0.05, 0.05))
    return out


def cut_component(pg, box, bg_lum=0.8, bg_sat=0.18, pick="largest", grow=1):
    """Crop `box` from the template page and keep the chosen connected silhouette."""
    img = page(pg)
    x0, y0, x1, y1 = box
    rgb = img[y0:y1, x0:x1].copy()
    lum, sat = rgb.mean(2), rgb.max(2) - rgb.min(2)
    fg = (lum < bg_lum) | (sat > bg_sat)
    fg = nd.binary_opening(fg, iterations=1)
    fg = nd.binary_fill_holes(fg)
    lab, n = nd.label(fg)
    if n == 0:
        raise ValueError("empty cut %s" % (box,))
    sizes = nd.sum(fg, lab, range(1, n + 1))
    mask = lab == (int(np.argmax(sizes)) + 1)
    if grow:
        mask = nd.binary_closing(mask, iterations=grow)
        mask = nd.binary_fill_holes(mask)
    ys, xs = np.nonzero(mask)
    sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    return rgb[sl], mask[sl]


def solid(name, rgb, mask, mpp, tmax, tmin=0.12, falloff=0.35, step=None, mat=None, cells=36, ratio=0.5, profile="lens"):
    """Inflated solid from a silhouette.

    Thickness = tmax * lerp(tmin, 1, smoothstep(dist / (falloff * maxdist))) — a lens that is thick
    in the body and bevels down to a thin (not zero) edge; the outline gets real side walls.
    Local frame: x = image right, y = image up, z = thickness.
    """
    H, W = mask.shape
    step = step or max(2, int(round(max(H, W) / cells)))
    dist = nd.distance_transform_edt(mask)
    md = max(dist.max(), 1.0)
    k = np.clip(dist / (falloff * md), 0, 1)
    k = k * k * (3 - 2 * k)
    th = tmax * (tmin + (1 - tmin) * k)
    if profile == "spine":
        # blade grind: flat thick spine along the TOP of the image, primary bevel down to a thin edge
        rows_idx = np.arange(H)[:, None]
        top = np.where(mask.any(0), mask.argmax(0), 0)[None, :]
        bot = np.where(mask.any(0), H - 1 - mask[::-1].argmax(0), 1)[None, :]
        v = np.clip((bot - rows_idx) / np.maximum(bot - top, 1), 0, 1)
        g = np.clip(v / 0.55, 0, 1)
        th = tmax * (tmin + (1 - tmin) * g ** 0.9)
    rows, cols = (H + step - 1) // step, (W + step - 1) // step
    cell = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            blk = mask[r * step:(r + 1) * step, c * step:(c + 1) * step]
            cell[r, c] = blk.mean() > 0.45
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    vf, vb = {}, {}
    # corner thickness: sample dist near the corner, boundary corners get the thin edge
    def corner(i, j, side):
        store = vf if side > 0 else vb
        if (i, j) in store:
            return store[(i, j)]
        y, x = min(i * step, H - 1), min(j * step, W - 1)
        y0, y1, x0, x1 = max(0, y - 1), min(H, y + 2), max(0, x - 1), min(W, x + 2)
        t = th[y0:y1, x0:x1].max() if mask[y0:y1, x0:x1].any() else tmax * tmin
        boundary = not (0 < i < rows and 0 < j < cols and cell[max(i - 1, 0):i + 1, max(j - 1, 0):j + 1].all())
        if boundary and profile != "spine":
            t = tmax * tmin
        v = bm.verts.new((j * step * mpp, -i * step * mpp, side * t / 2))
        store[(i, j)] = v
        return v

    def uvs(face, ij):
        for loop, (i, j) in zip(face.loops, ij):
            loop[uv].uv = (min(j * step, W) / W, 1 - min(i * step, H) / H)

    for r in range(rows):
        for c in range(cols):
            if not cell[r, c]:
                continue
            ij = [(r + 1, c), (r + 1, c + 1), (r, c + 1), (r, c)]
            f = bm.faces.new([corner(i, j, 1) for i, j in ij])
            uvs(f, ij)
            ijb = ij[::-1]
            f = bm.faces.new([corner(i, j, -1) for i, j in ijb])
            uvs(f, ijb)
    # side walls on outline edges
    for r in range(rows):
        for c in range(cols):
            if not cell[r, c]:
                continue
            for (dr, dc), (a, b_) in (((-1, 0), ((r, c), (r, c + 1))), ((1, 0), ((r + 1, c + 1), (r + 1, c))),
                                      ((0, -1), ((r + 1, c), (r, c))), ((0, 1), ((r, c + 1), (r + 1, c + 1)))):
                rr, cc = r + dr, c + dc
                if 0 <= rr < rows and 0 <= cc < cols and cell[rr, cc]:
                    continue
                f = bm.faces.new([corner(*a, 1), corner(*b_, 1), corner(*b_, -1), corner(*a, -1)])
                for loop, (i, j) in zip(f.loops, (a, b_, b_, a)):
                    loop[uv].uv = (min(j * step, W) / W, 1 - min(i * step, H) / H)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    # smooth the staircase outline a little (keeps the silhouette, removes the pixel steps)
    edge = [v for v in bm.verts if any(len(e.link_faces) and any(abs(f.normal.z) < 0.5 for f in e.link_faces) for e in v.link_edges)]
    bmesh.ops.smooth_vert(bm, verts=edge, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=False)
    bmesh.ops.smooth_vert(bm, verts=edge, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=False)
    ob = from_bm(name, bm, mat)
    if ratio < 1:
        decimate(ob, ratio)
    return ob


def poly_mask(pts, ppm):
    """Rasterise an outline given in metres (x along the blade, y up) to a mask; returns mask, origin."""
    from PIL import ImageDraw
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y1 = min(xs), max(ys)
    W, H = int((max(xs) - x0) * ppm) + 2, int((y1 - min(ys)) * ppm) + 2
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).polygon([((x - x0) * ppm, (y1 - y) * ppm) for x, y in pts], fill=255)
    return np.asarray(im) > 127, (x0, y1)


def fit_tex(rgb, shape):
    h, w = shape
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def strip(pg, box, trim=0.06):
    """Texture strip from a template box, trimmed of the white cut lines around it."""
    img = page(pg)
    x0, y0, x1, y1 = box
    rgb = img[y0:y1, x0:x1]
    fg = (rgb.mean(2) < 0.86) | ((rgb.max(2) - rgb.min(2)) > 0.2)
    ys, xs = np.nonzero(fg)
    rgb = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = rgb.shape[:2]
    return rgb[int(h * trim):h - int(h * trim), int(w * trim * 0.3):w - int(w * trim * 0.3)]


def blade(name, pts, tex, mat, tmax, ppm=420, tmin=0.08, profile="spine", cells=48, ratio=0.5):
    """Solid blade from a metre outline; local x = along blade, y = across (spine on top), z = thickness."""
    mask, (ox, oy) = poly_mask(pts, ppm)
    ob = solid(name, fit_tex(tex, mask.shape), mask, 1 / ppm, tmax=tmax, tmin=tmin, mat=mat, cells=cells, ratio=ratio, profile=profile)
    ob.data.transform(Matrix.Translation((ox, oy, 0)))
    return ob


def to_game(ob, m3, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Remap local axes with a 3x3 (columns = game axes of local x, y, z), then rotate/translate."""
    M = Matrix(m3).to_4x4()
    ob.data.transform(M)
    place(ob, loc, rot)
    return ob


# local x→game +y (blade points up the viewmodel), local y→game -x, local z→game +z
BLADE_UP = ((0, -1, 0), (1, 0, 0), (0, 0, 1))
# local x→game +y, local y→game +x... for blades whose spine should face +x
BLADE_UP_R = ((0, 1, 0), (1, 0, 0), (0, 0, -1))


def decimate(ob, ratio):
    mod = ob.modifiers.new("dec", "DECIMATE")
    mod.ratio = ratio
    wn = ob.modifiers.new("wn", "WEIGHTED_NORMAL")
    wn.keep_sharp = True


def lathe(name, profile, mat, seg=12, axis="y", uv_repeat=1.0, oct=False):
    """Surface of revolution along +y. profile = [(y, r), ...] bottom→top."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rings = []
    for y, r in profile:
        ring = []
        for s in range(seg + 1):
            a = 2 * math.pi * s / seg
            rr = r / math.cos(math.pi / seg) if oct else r
            ring.append(bm.verts.new((math.cos(a) * rr, y, math.sin(a) * rr)) if s < seg else ring[0])
        rings.append(ring)
    y0, y1 = profile[0][0], profile[-1][0]
    for k in range(len(rings) - 1):
        for s in range(seg):
            f = bm.faces.new([rings[k][s], rings[k][s + 1], rings[k + 1][s + 1], rings[k + 1][s]])
            vs = [(profile[k][0] - y0) / max(y1 - y0, 1e-6) * uv_repeat, (profile[k + 1][0] - y0) / max(y1 - y0, 1e-6) * uv_repeat]
            for loop, (u, v) in zip(f.loops, ((s / seg, vs[0]), ((s + 1) / seg, vs[0]), ((s + 1) / seg, vs[1]), (s / seg, vs[1]))):
                loop[uvl].uv = (u, v)
    # caps
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        vs = ring[:seg]
        f = bm.faces.new(vs[::-1] if rev else vs)
        for loop in f.loops:
            loop[uvl].uv = (0.5 + loop.vert.co.x * 2, 0.5 + loop.vert.co.z * 2)
    return from_bm(name, bm, mat)


def torus(name, R, r, mat, seg=12, rseg=6):
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    grid = [[bm.verts.new(((R + r * math.cos(b)) * math.cos(a), r * math.sin(b), (R + r * math.cos(b)) * math.sin(a)))
             for b in (2 * math.pi * j / rseg for j in range(rseg))] for a in (2 * math.pi * i / seg for i in range(seg))]
    for i in range(seg):
        for j in range(rseg):
            f = bm.faces.new([grid[i][j], grid[(i + 1) % seg][j], grid[(i + 1) % seg][(j + 1) % rseg], grid[i][(j + 1) % rseg]])
            for loop in f.loops:
                loop[uvl].uv = (i / seg, j / rseg)
    return from_bm(name, bm, mat)


def gem(name, rx, ry, rz, mat, sides=6):
    """Faceted crystal (bipyramid with a girdle)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    top, bot = bm.verts.new((0, ry, 0)), bm.verts.new((0, -ry, 0))
    ring = [bm.verts.new((math.cos(2 * math.pi * i / sides) * rx, 0.15 * ry, math.sin(2 * math.pi * i / sides) * rz)) for i in range(sides)]
    ring2 = [bm.verts.new((math.cos(2 * math.pi * i / sides) * rx, -0.15 * ry, math.sin(2 * math.pi * i / sides) * rz)) for i in range(sides)]
    for i in range(sides):
        j = (i + 1) % sides
        for vs in ((top, ring[j], ring[i]), (ring[i], ring[j], ring2[j], ring2[i]), (bot, ring2[i], ring2[j])):
            f = bm.faces.new(vs)
            for loop in f.loops:
                loop[uvl].uv = (0.5 + loop.vert.co.x, 0.5 + loop.vert.co.y)
    ob = from_bm(name, bm, mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, order="XYZ"):
    ob.location = loc
    ob.rotation_mode = order
    ob.rotation_euler = [math.radians(a) for a in rot]
    ob.scale = (scale,) * 3 if isinstance(scale, (int, float)) else scale
    return ob


def plane_to_yz(ob, px_anchor, mpp, at, flip=False, tilt=0.0):
    """Stand an image-plane solid in the game YZ plane (thickness along x).
    Image +x → game -z (forward) unless flip; image +y → game +y. px_anchor (x, y) lands on `at`."""
    ax, ay = px_anchor
    ob.data.transform(Matrix.Translation((-ax * mpp, ay * mpp, 0)))
    sgn = 1 if flip else -1
    # local x→(0,0,sgn) game, local y→(0,1,0), local z→(sgn?,0,0)
    m = Matrix(((0, 0, -sgn, 0), (0, 1, 0, 0), (sgn, 0, 0, 0), (0, 0, 0, 1)))
    ob.data.transform(m)
    ob.data.transform(Matrix.Rotation(math.radians(tilt), 4, "X"))
    ob.location = at
    return ob


def export(slug, objs):
    root = bpy.data.objects.new(slug + "_root", None)
    link(root)
    for o in objs:
        o.parent = root
    root.rotation_euler = (math.radians(90), 0, 0)  # game (y up, z back) → Blender (z up)
    bpy.context.view_layer.update()
    # apply transforms and join into one mesh per material-group node "HD_<slug>"
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in objs:
        for m in o.modifiers:
            pass
    bpy.ops.object.convert(target="MESH")  # applies modifiers
    for o in objs:
        print("  part", o.name, sum(len(p.vertices) - 2 for p in o.data.polygons))
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = "HD_" + slug
    bpy.data.objects.remove(root)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    path = os.path.join(OUT, slug + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
                              export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=86)
    print("exported", slug, "tris", tris, "bytes", os.path.getsize(path))
    return path


# ================================================================ 22 DEMONIC FURY (scythe)
def demonic_fury():
    reset()
    PG = "demonic_fury.jpg"
    objs = []
    SZ = -0.23  # shaft line (z) — same frame as the previous model so grips stay put
    # --- blade: outer UV silhouette, thick bone spine along the top arc, thin glowing inner edge
    rgb, mask = cut_component(PG, (13, 149, 468, 490))
    rgb = clean_halo(rgb, mask)
    mpp = 0.86 / rgb.shape[1]
    alb = shrink(rgb, 512)
    mat = material("DF_blade", albedo=alb, rough=0.42, metal=0.35, normal=normal_from(alb, 3.0), nstr=0.9,
                   emit=shrink(glow_mask(rgb)[..., None] * np.array((1.0, 0.07, 0.04)), 512), emit_strength=1.6)
    ob = solid("blade", rgb, mask, mpp, tmax=0.05, tmin=0.08, falloff=0.45, mat=mat, cells=56, ratio=0.45)
    # image right edge (core end) sits at the head; the tip goes forward (-z) and down
    plane_to_yz(ob, (rgb.shape[1] - 30, 70), mpp, (0, 1.04, SZ + 0.02), tilt=-6)
    objs.append(ob)
    # --- central core (skull mask with the glowing ring) as a chunky solid on the head
    rgb, mask = cut_component(PG, (42, 505, 313, 855))
    rgb = clean_halo(rgb, mask)
    alb = shrink(rgb, 384)
    mat = material("DF_core", albedo=alb, rough=0.5, metal=0.25, normal=normal_from(alb, 3.0), nstr=1.0,
                   emit=shrink(glow_mask(rgb)[..., None] * np.array((1.0, 0.07, 0.04)), 384), emit_strength=1.8)
    mppc = 0.22 / rgb.shape[1]
    ob = solid("core", rgb, mask, mppc, tmax=0.11, tmin=0.18, falloff=0.5, mat=mat, cells=30)
    plane_to_yz(ob, (rgb.shape[1] / 2, rgb.shape[0] * 0.42), mppc, (0, 0.99, SZ + 0.01))
    objs.append(ob)
    # --- shaft: lathed with the handle UV strip (wrapped red cloth + bone bands)
    strip, _ = cut_component(PG, (465, 521, 533, 976), grow=0)
    alb = shrink(strip, 256)
    mat = material("DF_shaft", albedo=alb, rough=0.62, metal=0.1, normal=normal_from(alb, 2.5), nstr=1.0)
    prof = [(-0.52, 0.012), (-0.5, 0.024), (-0.46, 0.028), (-0.2, 0.024), (0.2, 0.022), (0.6, 0.021), (0.9, 0.024), (0.95, 0.03)]
    ob = lathe("shaft", prof, mat, seg=10, uv_repeat=3.0)
    ob.location = (0, 0, SZ)
    objs.append(ob)
    # --- vertebrae collars + back spikes (bone), and a gripped wrap
    bone = material("DF_bone", color=(0.4, 0.3, 0.23), rough=0.55, metal=0.05)
    for i in range(9):
        y = 0.14 + i * 0.085
        v = lathe("vert%d" % i, [(-0.013, 0.026), (-0.006, 0.036), (0.006, 0.036), (0.013, 0.026)], bone, seg=8, oct=True)
        v.location = (0, y, SZ)
        objs.append(v)
    # back spikes: curved bone horns (lathed cones bent backwards), one per vertebra
    horn_mat = material("DF_horn", color=(0.42, 0.3, 0.24), rough=0.5, metal=0.05)
    for i in range(8):
        y = 0.18 + i * 0.085
        L = 0.075 - i * 0.004
        h = lathe("spike%d" % i, [(0, 0.011), (L * 0.45, 0.007), (L * 0.8, 0.003), (L, 0.0004)], horn_mat, seg=6)
        place(h, (0, y, SZ + 0.02), (62, 0, 0))
        objs.append(h)
    # --- grip wrap + pommel
    wrap = material("DF_wrap", color=(0.32, 0.05, 0.06), rough=0.8)
    for k in range(6):
        t = lathe("wrap%d" % k, [(-0.008, 0.026), (0.008, 0.029), (0.016, 0.026)], wrap, seg=10)
        t.location = (0, -0.16 + k * 0.034, SZ)
        t.rotation_euler = (math.radians(12), 0, 0)
        objs.append(t)
    red = material("DF_crystal", color=(0.5, 0.02, 0.03), rough=0.15, metal=0.0, emit_color=(1.0, 0.1, 0.06), emit_strength=2.5)
    pm = gem("pommel_gem", 0.03, 0.05, 0.03, red)
    pm.location = (0, -0.57, SZ)
    objs.append(pm)
    cap = lathe("pommel", [(-0.03, 0.02), (-0.01, 0.034), (0.02, 0.03), (0.03, 0.022)], bone, seg=8, oct=True)
    cap.location = (0, -0.5, SZ)
    objs.append(cap)
    # --- chain with the red crystal hanging from the head
    iron = material("DF_chain", color=(0.24, 0.2, 0.18), rough=0.35, metal=0.85)
    cy = 0.9
    for i in range(6):
        l = torus("link%d" % i, 0.012, 0.0035, iron, seg=10, rseg=5)
        l.location = (0.035, cy - i * 0.02, SZ - 0.07)
        l.rotation_euler = (0, math.radians(90 if i % 2 else 0), math.radians(90))
        objs.append(l)
    cr = gem("chain_crystal", 0.02, 0.045, 0.02, red)
    cr.location = (0.035, cy - 6 * 0.02 - 0.035, SZ - 0.07)
    objs.append(cr)
    # --- torn cloth ribbons at the butt (thin solids cut from the cloth UV, so they have real edges)
    rgb, mask = cut_component(PG, (441, 1018, 532, 1234))
    alb = shrink(rgb, 256)
    cloth = material("DF_cloth", albedo=alb, rough=0.9, normal=normal_from(alb, 1.5), nstr=0.6)
    for k, (x, lean, L) in enumerate(((-0.02, 8, 0.36), (0.02, -10, 0.28))):
        mppr = L / rgb.shape[0]
        c = solid("cloth%d" % k, rgb, mask, mppr, tmax=0.006, tmin=0.5, falloff=0.3, mat=cloth, cells=24, ratio=0.6)
        plane_to_yz(c, (rgb.shape[1] / 2, 0), mppr, (x, -0.47, SZ + 0.01), tilt=lean)
        objs.append(c)
    return export("demonic_fury", objs)


# ================================================================ 01 MACHETE
def machete():
    reset()
    P1 = "weapons_p1.jpg"
    Z = -0.23
    objs = []
    steel = strip(P1, (100, 255, 300, 310))
    alb = shrink(steel, 512)
    bm = material("MA_blade", albedo=alb, rough=0.32, metal=0.85, normal=normal_from(alb, 1.2), nstr=0.35)
    # outline (x along the blade from the bolster, y across; spine on top y≈+0.035, edge at y≈-0.07)
    pts = [(0.0, 0.03), (0.6, 0.036), (0.7, 0.05), (0.76, 0.045), (0.8, 0.02), (0.79, -0.02), (0.74, -0.058),
           (0.62, -0.074), (0.3, -0.07), (0.05, -0.066), (0.0, -0.06)]
    b = blade("blade", pts, steel, bm, tmax=0.02, tmin=0.12)
    to_game(b, BLADE_UP, (0.0, 0.045, Z), (0, 0, -7))
    objs.append(b)
    # handle: wood with black bands (template HANDLE strip), octagonal, swelled grip
    wood = strip(P1, (22, 385, 170, 440))
    alb = shrink(wood, 256)
    hm = material("MA_handle", albedo=alb, rough=0.7, metal=0.0, normal=normal_from(alb, 1.5), nstr=0.6)
    prof = [(-0.29, 0.024), (-0.27, 0.028), (-0.2, 0.026), (-0.12, 0.024), (-0.04, 0.025), (0.02, 0.023), (0.035, 0.02)]
    h = lathe("handle", prof, hm, seg=8, oct=True, uv_repeat=1.0)
    h.scale = (1.0, 1.0, 0.8)
    h.location = (0, 0, Z)
    objs.append(h)
    black = material("MA_black", color=(0.05, 0.05, 0.055), rough=0.45, metal=0.6)
    for y in (-0.245, -0.16, -0.07):
        r = lathe("band%.2f" % y, [(-0.009, 0.026), (-0.004, 0.029), (0.004, 0.029), (0.009, 0.026)], black, seg=8, oct=True)
        r.scale = (1, 1, 0.82)
        r.location = (0, y, Z)
        objs.append(r)
    bol = lathe("bolster", [(-0.012, 0.028), (0.0, 0.036), (0.016, 0.034), (0.022, 0.026)], black, seg=8, oct=True)
    bol.scale = (1.5, 1, 0.7)
    bol.location = (0.0, 0.03, Z)
    objs.append(bol)
    cap = lathe("pommel", [(-0.02, 0.012), (-0.012, 0.03), (0.01, 0.031), (0.018, 0.027)], black, seg=8, oct=True)
    cap.scale = (1, 1, 0.85)
    cap.location = (0, -0.3, Z)
    objs.append(cap)
    steelm = material("MA_rivet", color=(0.7, 0.7, 0.72), rough=0.3, metal=1.0)
    for y in (-0.2, -0.11):
        for sd in (-1, 1):
            rv = lathe("rivet", [(-0.003, 0.006), (0.0, 0.007), (0.003, 0.005)], steelm, seg=6)
            rv.rotation_euler = (math.radians(90), 0, 0)
            rv.location = (0, y, Z + sd * 0.0215)
            objs.append(rv)
    return export("machete", objs)


# ================================================================ 08 BLOODFANG
def bloodfang():
    reset()
    P2 = "weapons_p2.jpg"
    Z = -0.23
    objs = []
    steel = strip(P2, (28, 228, 268, 268))
    alb = shrink(steel, 512)
    bm = material("BF_blade", albedo=alb, rough=0.28, metal=0.85, normal=normal_from(alb, 1.2), nstr=0.35)
    # fighting blade: straight spine with serrations near the guard, clipped tip, wide belly
    pts = [(0.0, 0.036)]
    for i in range(5):  # saw teeth on the spine
        x = 0.03 + i * 0.03
        pts += [(x, 0.036), (x + 0.012, 0.052), (x + 0.02, 0.036)]
    pts += [(0.32, 0.038), (0.4, 0.03), (0.47, 0.0), (0.44, -0.035), (0.34, -0.062), (0.15, -0.066), (0.0, -0.058)]
    b = blade("blade", pts, steel, bm, tmax=0.022, tmin=0.12)
    to_game(b, BLADE_UP, (0.0, 0.05, Z), (0, 0, -7))
    objs.append(b)
    # fuller: a dark recessed groove on both faces (thin solid slightly sunk into the blade)
    dark = material("BF_fuller", color=(0.35, 0.36, 0.38), rough=0.25, metal=0.9)
    for sd in (-1, 1):
        f = blade("fuller", [(0.03, 0.012), (0.28, 0.012), (0.3, 0.0), (0.28, -0.008), (0.03, -0.008)], np.full((4, 4, 3), 0.4), dark, tmax=0.0016, tmin=0.6, profile="lens", cells=20, ratio=1)
        to_game(f, BLADE_UP, (0.0, 0.05, Z + sd * 0.0075), (0, 0, -7))
        objs.append(f)
    guardm = material("BF_guard", color=(0.07, 0.07, 0.075), rough=0.4, metal=0.7)
    g = lathe("guard", [(-0.018, 0.03), (-0.01, 0.04), (0.01, 0.04), (0.018, 0.03)], guardm, seg=4, oct=True)
    g.scale = (2.2, 1, 0.85)
    g.rotation_euler = (0, math.radians(45), 0)
    g.location = (0, 0.028, Z)
    objs.append(g)
    wood = strip(P2, (70, 350, 190, 395))
    alb = shrink(wood, 256)
    hm = material("BF_handle", albedo=alb, rough=0.72, normal=normal_from(alb, 1.5), nstr=0.6)
    h = lathe("handle", [(-0.2, 0.024), (-0.17, 0.027), (-0.1, 0.025), (-0.03, 0.027), (0.01, 0.024)], hm, seg=8, oct=True)
    h.scale = (1, 1, 0.85)
    h.location = (0, 0, Z)
    objs.append(h)
    for y in (-0.15, -0.09, -0.03):
        r = lathe("wrap", [(-0.006, 0.025), (0.0, 0.029), (0.006, 0.025)], guardm, seg=8, oct=True)
        r.scale = (1, 1, 0.85)
        r.location = (0, y, Z)
        objs.append(r)
    red = material("BF_pommel", color=(0.45, 0.03, 0.04), rough=0.3, metal=0.6)
    p = lathe("pommel", [(-0.02, 0.014), (-0.012, 0.032), (0.012, 0.032), (0.02, 0.024)], red, seg=8, oct=True)
    p.location = (0, -0.215, Z)
    objs.append(p)
    return export("bloodfang", objs)


# ================================================================ 19 DAWN SPEAR
def dawn_spear():
    reset()
    P3 = "weapons_p3.jpg"
    Z = -0.23
    objs = []
    shaft_tex = strip(P3, (20, 800, 480, 852))
    alb = shrink(shaft_tex, 512)
    sm = material("DS_shaft", albedo=alb, rough=0.35, metal=0.5, normal=normal_from(alb, 1.2), nstr=0.4)
    s_ = lathe("shaft", [(-0.36, 0.017), (0.0, 0.019), (0.5, 0.019), (0.74, 0.018)], sm, seg=12, uv_repeat=1.0)
    s_.location = (0, 0, Z)
    objs.append(s_)
    gold = material("DS_gold", color=(0.95, 0.7, 0.25), rough=0.28, metal=1.0)
    blue = material("DS_gem", color=(0.1, 0.35, 1.0), rough=0.1, emit_color=(0.25, 0.6, 1.0), emit_strength=2.5)
    for y, big in ((-0.3, 1), (-0.05, 0), (0.25, 0), (0.5, 0), (0.7, 1)):
        c = lathe("collar", [(-0.02 - big * 0.01, 0.022), (-0.012, 0.029 + big * 0.006), (0.012, 0.029 + big * 0.006), (0.02 + big * 0.01, 0.022)], gold, seg=8, oct=True)
        c.location = (0, y, Z)
        objs.append(c)
        if not big:
            for a in range(4):
                gm = gem("gem", 0.009, 0.012, 0.006, blue, sides=4)
                ang = a * math.pi / 2
                place(gm, (math.cos(ang) * 0.03, y, Z + math.sin(ang) * 0.03), (0, -math.degrees(ang), 90))
                objs.append(gm)
    # spearhead: gold socket + winged guard + silver leaf blade with a gold midrib (diamond section)
    head = material("DS_blade", color=(0.86, 0.88, 0.92), rough=0.22, metal=0.95)
    sock = lathe("socket", [(0.0, 0.021), (0.05, 0.026), (0.09, 0.03), (0.11, 0.024)], gold, seg=8, oct=True)
    sock.location = (0, 0.74, Z)
    objs.append(sock)
    leaf = [(0.0, 0.0), (0.03, 0.07), (0.14, 0.085), (0.26, 0.06), (0.44, 0.0), (0.26, -0.06), (0.14, -0.085), (0.03, -0.07)]
    L = blade("leaf", leaf, np.full((4, 4, 3), 0.85), head, tmax=0.03, tmin=0.08, profile="lens", cells=40, ratio=0.6)
    to_game(L, ((0, 1, 0), (1, 0, 0), (0, 0, 1)), (0, 0.84, Z))
    objs.append(L)
    rib = blade("midrib", [(0.0, 0.0), (0.02, 0.018), (0.3, 0.008), (0.38, 0.0), (0.3, -0.008), (0.02, -0.018)], np.full((4, 4, 3), 0.9), gold, tmax=0.04, tmin=0.25, profile="lens", cells=30, ratio=0.7)
    to_game(rib, ((0, 1, 0), (1, 0, 0), (0, 0, 1)), (0, 0.845, Z))
    objs.append(rib)
    for sd in (-1, 1):  # swept wings under the blade
        wng = blade("wing", [(0.0, 0.0), (0.06, 0.03), (0.13, 0.09), (0.09, 0.1), (0.04, 0.05), (0.0, 0.025)], np.full((4, 4, 3), 0.8), gold, tmax=0.022, tmin=0.2, profile="lens", cells=20, ratio=0.7)
        to_game(wng, ((0, 1, 0), (sd, 0, 0), (0, 0, 1)), (sd * 0.02, 0.8, Z))
        objs.append(wng)
    core = gem("core", 0.022, 0.03, 0.018, blue, sides=6)
    core.location = (0, 0.82, Z)
    objs.append(core)
    # butt spike
    sp = lathe("butt", [(0.0, 0.024), (0.02, 0.028), (0.06, 0.014), (0.1, 0.001)], gold, seg=8, oct=True)
    sp.rotation_euler = (math.radians(180), 0, 0)
    sp.location = (0, -0.36, Z)
    objs.append(sp)
    return export("dawn_spear", objs)


# ================================================================ 11 FROSTBITE (ice staff, melee)
def frostbite():
    reset()
    Z = -0.23
    objs = []
    steel = material("FB_shaft", color=(0.3, 0.38, 0.46), rough=0.35, metal=0.8)
    white = material("FB_band", color=(0.85, 0.9, 0.95), rough=0.4, metal=0.3)
    grip = material("FB_grip", color=(0.05, 0.06, 0.07), rough=0.8)
    ice = material("FB_ice", color=(0.55, 0.85, 1.0), rough=0.05, metal=0.0, emit_color=(0.35, 0.75, 1.0), emit_strength=1.6)
    ice2 = material("FB_ice2", color=(0.85, 0.96, 1.0), rough=0.05, emit_color=(0.6, 0.9, 1.0), emit_strength=1.2)
    s_ = lathe("shaft", [(-0.37, 0.016), (0.0, 0.018), (0.72, 0.017), (0.76, 0.02)], steel, seg=10)
    s_.location = (0, 0, Z)
    objs.append(s_)
    for y in (0.15, 0.35, 0.55):
        b = lathe("band", [(-0.01, 0.019), (-0.004, 0.023), (0.004, 0.023), (0.01, 0.019)], white, seg=10)
        b.location = (0, y, Z)
        objs.append(b)
    g = lathe("grip", [(-0.15, 0.022), (-0.1, 0.024), (0.0, 0.024), (0.05, 0.022)], grip, seg=10)
    g.location = (0, 0, Z)
    objs.append(g)
    cap = lathe("cap", [(-0.03, 0.01), (-0.02, 0.026), (0.01, 0.026), (0.02, 0.02)], steel, seg=8, oct=True)
    cap.location = (0, -0.37, Z)
    objs.append(cap)
    # head: four curled prongs gripping an ice crystal cluster
    cup = lathe("cup", [(0.0, 0.02), (0.03, 0.036), (0.05, 0.034)], steel, seg=8, oct=True)
    cup.location = (0, 0.76, Z)
    objs.append(cup)
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        pr = lathe("prong", [(0.0, 0.009), (0.08, 0.007), (0.13, 0.004), (0.16, 0.001)], white, seg=6)
        place(pr, (math.cos(ang) * 0.03, 0.8, Z + math.sin(ang) * 0.03), (math.sin(ang) * 22, 0, -math.cos(ang) * 22))
        objs.append(pr)
    main = gem("crystal", 0.04, 0.12, 0.04, ice, sides=6)
    main.location = (0, 0.93, Z)
    objs.append(main)
    for k, (dx, dz, tilt, s) in enumerate(((0.035, 0.0, -25, 0.6), (-0.03, 0.02, 22, 0.55), (0.0, -0.035, 0, 0.5), (0.01, 0.035, 0, 0.45))):
        c = gem("shard%d" % k, 0.02 * s / 0.5, 0.07 * s / 0.5, 0.02 * s / 0.5, ice2, sides=5)
        place(c, (dx, 0.9, Z + dz), (tilt if dz else 0, 0, -tilt if dx else 0))
        objs.append(c)
    return export("frostbite", objs)


BUILDS = {"demonic_fury": demonic_fury, "machete": machete, "bloodfang": bloodfang, "dawn_spear": dawn_spear, "frostbite": frostbite}
for slug, fn in BUILDS.items():
    if not ONLY or slug in ONLY:
        fn()
