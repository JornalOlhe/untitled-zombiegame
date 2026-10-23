# Dead Recoil — firearms rebuilt as real 3D block models (v65).
#
# The old firearms were side-view cut-outs of the template hero renders extruded a few cm: thin
# "cardboard" guns that looked flat in first person. These are built like the template hero renders
# themselves: chunky boxes and octagonal prisms with bevelled edges (receiver, handguard, barrel,
# magazine, stock, grip, sights, rails, vents, glow strips), each material with its own pixel-art
# tile (panel seams, grain, wear) so they keep the game's blocky look.
#
# Frame: game viewmodel frame — x right, y up, -z forward (muzzle), grip near z = 0. The
# magazine / pump are separate nodes named "mag" / "pump" (the game animates them).
#
# Run:  python3 tools/blender/firearms_hd.py <out_dir> [slug ...]
#       python3 tools/update_weapon_glb.py "MP5" <out_dir>/mp5.glb ...
import bpy, bmesh, math, os, sys, random
import numpy as np
from mathutils import Matrix, Vector

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/firearms_hd"
ONLY = set(sys.argv[2:])
os.makedirs(OUT, exist_ok=True)
TILE = 0.1  # metres per texture tile
PX = 40     # pixels per tile → 4 px / cm (chunky pixels, nearest-filtered in game)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- pixel textures
def tile_tex(kind, base, seed):
    rnd = np.random.default_rng(seed)
    b = np.array(base, np.float32)
    img = np.ones((PX, PX, 3), np.float32) * b
    n = rnd.normal(0, 1, (PX, PX, 1)).astype(np.float32)
    if kind == "wood":
        rows = np.cumsum(rnd.normal(0, 0.6, PX))
        grain = (np.sin(np.arange(PX)[:, None] * 0.9 + rows[None, :] * 0.0 + rnd.normal(0, 0.4, (PX, 1))) * 0.5 + 0.5)
        img *= (0.82 + 0.22 * grain[..., None])
        img *= 1 + n * 0.035
    elif kind == "glow":
        img *= 1 + n * 0.05
        return np.clip(img, 0, 1)
    else:
        img *= 1 + n * (0.05 if kind != "rubber" else 0.08)
        if kind in ("metal", "paint"):
            # panel seams every half tile, a lit edge under each seam, sparse wear specks
            # one soft seam per tile edge (a hard grid every 5 cm read as a checkerboard)
            img[0, :] *= 0.78
            img[:, 0] *= 0.78
            img[1, :] *= 1.06
            specks = rnd.random((PX, PX)) < (0.018 if kind == "metal" else 0.03)
            img[specks] = np.minimum(1, img[specks] * 1.6 + 0.05)
        if kind == "rubber":
            img[::3, ::3] *= 0.75  # grip stipple
    return np.clip(img, 0, 1)


_mats = {}


def mat(key):
    if key in _mats:
        return _mats[key]
    spec = PAL[key]
    kind, base = spec[0], spec[1]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bs.outputs[0], out.inputs[0])
    tex = tile_tex(kind, base, abs(hash(key)) % 9999)
    img = bpy.data.images.new(key + "_px", PX, PX)
    rgba = np.ones((PX, PX, 4), np.float32)
    rgba[..., :3] = tex
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.pack()
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.interpolation = "Closest"
    nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = spec[2] if len(spec) > 2 else 0.6
    bs.inputs["Metallic"].default_value = spec[3] if len(spec) > 3 else 0.2
    if kind == "glow":
        bs.inputs["Emission Color"].default_value = (*base, 1)
        bs.inputs["Emission Strength"].default_value = 1.0
        nt.links.new(t.outputs["Color"], bs.inputs["Emission Color"])
    _mats[key] = m
    return m


PAL = {
    "blk": ("metal", (0.15, 0.155, 0.165), 0.55, 0.3),
    "dgr": ("metal", (0.27, 0.275, 0.29), 0.5, 0.3),
    "gry": ("metal", (0.34, 0.35, 0.37), 0.45, 0.35),
    "stl": ("metal", (0.56, 0.58, 0.6), 0.35, 0.35),
    "rub": ("rubber", (0.09, 0.09, 0.095), 0.85, 0.0),
    "wood": ("wood", (0.46, 0.27, 0.13), 0.7, 0.0),
    "dwood": ("wood", (0.3, 0.17, 0.09), 0.7, 0.0),
    "tan": ("paint", (0.62, 0.52, 0.34), 0.7, 0.05),
    "red": ("paint", (0.62, 0.06, 0.05), 0.55, 0.1),
    "dred": ("paint", (0.36, 0.04, 0.04), 0.6, 0.1),
    "olive": ("paint", (0.3, 0.33, 0.18), 0.7, 0.05),
    "white": ("paint", (0.86, 0.86, 0.84), 0.5, 0.05),
    "gold": ("metal", (0.86, 0.63, 0.18), 0.3, 0.35),
    "brass": ("metal", (0.8, 0.6, 0.24), 0.35, 0.35),
    "navy": ("metal", (0.12, 0.15, 0.24), 0.5, 0.35),
    "ice": ("paint", (0.72, 0.84, 0.92), 0.4, 0.1),
    "g_red": ("glow", (1.0, 0.14, 0.08)),
    "g_org": ("glow", (1.0, 0.5, 0.1)),
    "g_pur": ("glow", (0.72, 0.25, 1.0)),
    "g_blu": ("glow", (0.2, 0.6, 1.0)),
    "g_ice": ("glow", (0.55, 0.92, 1.0)),
    "g_gold": ("glow", (1.0, 0.82, 0.3)),
    "lens": ("glow", (0.85, 0.15, 0.1)),
}


# ---------------------------------------------------------------- geometry kit
class Gun:
    def __init__(self, slug):
        self.slug = slug
        self.objs = {"body": [], "mag": [], "pump": []}

    def _add(self, bm, key, node, bevel):
        if bevel:
            edges = [e for e in bm.edges]
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", profile=0.5)
        uv = bm.loops.layers.uv.new("UVMap")
        bm.normal_update()
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            u_i, v_i = [(2, 1), (0, 2), (2, 1)][ax] if ax != 2 else (0, 1)
            for l in f.loops:
                co = l.vert.co
                l[uv].uv = (co[u_i] / TILE, co[v_i] / TILE)
        me = bpy.data.meshes.new(key)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(key, me)
        me.materials.append(mat(key))
        bpy.context.scene.collection.objects.link(ob)
        self.objs[node].append(ob)
        return ob

    def box(self, key, x0, x1, y0, y1, z0, z1, node="body", bevel=0.0035, rx=0.0, pivot=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        S = Matrix.Diagonal(((x1 - x0), (y1 - y0), (z1 - z0), 1))
        T = Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        bmesh.ops.transform(bm, matrix=T @ S, verts=bm.verts)
        if rx:
            p = Vector(pivot or ((x0 + x1) / 2, y1, (z0 + z1) / 2))
            bmesh.ops.rotate(bm, verts=bm.verts, cent=p, matrix=Matrix.Rotation(math.radians(rx), 3, "X"))
        b = min(bevel, (x1 - x0) * 0.3, (y1 - y0) * 0.3, (z1 - z0) * 0.3)
        return self._add(bm, key, node, b if b > 0.0008 else 0)

    def sym(self, key, w, y0, y1, z0, z1, **kw):
        return self.box(key, -w, w, y0, y1, z0, z1, **kw)

    def prism(self, key, r, z0, z1, y=0.0, x=0.0, sides=8, node="body", bevel=0.0025):
        """Octagonal (blocky) prism along z."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=r, radius2=r, depth=abs(z1 - z0))
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / sides, 3, "Z"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, (z0 + z1) / 2))
        return self._add(bm, key, node, bevel if r > 0.008 else 0)

    def rail(self, key, w, y, z0, z1, step=0.02):
        self.sym(key, w, y, y + 0.008, z0, z1, bevel=0.002)
        z = z0 + 0.004
        while z + 0.01 < z1:
            self.sym(key, w + 0.002, y + 0.008, y + 0.016, z, z + 0.01, bevel=0.0015)
            z += step

    def vents(self, key, w, y0, y1, z0, z1, n=4):
        """Slots cut into the side of a handguard (dark insets on both sides)."""
        L = (z1 - z0) / n
        for i in range(n):
            a, b = z0 + i * L + L * 0.2, z0 + (i + 1) * L - L * 0.2
            self.box(key, -w - 0.002, -w + 0.004, y0, y1, a, b, bevel=0.001)
            self.box(key, w - 0.004, w + 0.002, y0, y1, a, b, bevel=0.001)

    def strip(self, key, w, y0, y1, z0, z1, side_only=True):
        """Glow strip on both sides."""
        self.box(key, -w - 0.003, -w + 0.002, y0, y1, z0, z1, bevel=0.001)
        self.box(key, w - 0.002, w + 0.003, y0, y1, z0, z1, bevel=0.001)

    def grip(self, key, w=0.02, top=-0.025, bottom=-0.17, z0=-0.02, z1=0.05, tilt=-14):
        return self.box(key, -w, w, bottom, top, z0, z1, rx=tilt, pivot=(0, top, (z0 + z1) / 2), bevel=0.006)

    def trigger(self, key="blk", z=-0.03, y=-0.03):
        self.box(key, -0.006, 0.006, y - 0.045, y - 0.038, z - 0.05, z + 0.03, bevel=0.0)
        self.box(key, -0.006, 0.006, y - 0.045, y, z - 0.052, z - 0.044, bevel=0.0)
        self.box("stl", -0.003, 0.003, y - 0.032, y, z - 0.012, z - 0.004, bevel=0.0)

    def mag(self, key, w, top, bottom, z0, z1, curve=0.0, segs=3, base="blk", node="mag"):
        h = (top - bottom) / segs
        for i in range(segs):
            dz = -curve * (i / segs) ** 1.5
            self.box(key, -w, w, top - (i + 1) * h - 0.002, top - i * h, z0 + dz, z1 + dz, node=node, bevel=0.003)
        dz = -curve
        self.box(base, -w - 0.003, w + 0.003, bottom - 0.012, bottom + 0.004, z0 + dz - 0.004, z1 + dz + 0.004, node=node, bevel=0.003)

    def scope(self, key, y, z0, z1, r=0.026, lens="lens"):
        self.prism(key, r, z0, z1, y=y)
        self.prism(key, r + 0.006, z0 - 0.012, z0 + 0.02, y=y)
        self.prism(key, r + 0.006, z1 - 0.02, z1 + 0.012, y=y)
        self.prism(lens, r * 0.8, z0 - 0.016, z0 - 0.011, y=y, bevel=0)
        self.sym(key, 0.012, y - r - 0.03, y - r + 0.004, z0 + 0.05, z0 + 0.08)
        self.sym(key, 0.012, y - r - 0.03, y - r + 0.004, z1 - 0.08, z1 - 0.05)
        self.box(key, -0.008, 0.008, y + r - 0.004, y + r + 0.02, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02)

    def export(self):
        roots = []
        for node, objs in self.objs.items():
            if not objs:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            if len(objs) > 1:
                bpy.ops.object.join()
            ob = bpy.context.view_layer.objects.active
            ob.name = node
            ob.data.name = node
            roots.append(ob)
        # chunky "block" proportions: in first person the camera looks along the gun, so its width
        # is what reads — widen (x) and slightly thicken (y) every part.
        for o in roots:
            o.data.transform(Matrix.Diagonal((1.5, 1.1, 1.0, 1.0)))
        root = bpy.data.objects.new(self.slug, None)
        bpy.context.scene.collection.objects.link(root)
        for o in roots:
            o.parent = root
        root.rotation_euler = (math.radians(90), 0, 0)  # game frame (y up) → Blender z-up
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action="DESELECT")
        for o in roots:
            o.select_set(True)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.data.objects.remove(root)
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in roots)
        path = os.path.join(OUT, self.slug + ".glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                                  export_apply=True, export_materials="EXPORT", export_image_format="AUTO")
        print("exported", self.slug, "tris", tris, "bytes", os.path.getsize(path))
        return path


# ---------------------------------------------------------------- the guns
def mp5(g):
    g.sym("blk", 0.034, -0.035, 0.05, -0.42, 0.12)              # receiver
    g.sym("dgr", 0.036, -0.012, 0.028, -0.4, -0.05, bevel=0.002)  # side plate
    g.rail("blk", 0.018, 0.05, -0.36, 0.08)
    g.sym("rub", 0.04, -0.045, 0.04, -0.63, -0.42, bevel=0.008)   # fat handguard
    g.vents("blk", 0.04, -0.02, 0.02, -0.61, -0.44, n=3)
    g.prism("dgr", 0.012, -0.8, -0.62, y=0.012)                   # barrel
    g.prism("blk", 0.017, -0.83, -0.79, y=0.012)                  # muzzle
    g.sym("blk", 0.022, 0.012, 0.075, -0.66, -0.62)               # front sight hood
    g.sym("blk", 0.006, 0.05, 0.072, -0.65, -0.63, bevel=0)
    g.sym("blk", 0.024, 0.05, 0.095, 0.04, 0.1)                   # rear drum sight
    g.prism("dgr", 0.009, -0.42, -0.30, y=0.032, x=-0.04)         # cocking tube
    g.box("red", 0.034, 0.042, 0.0, 0.012, -0.12, -0.1, bevel=0)  # red selector dot
    g.grip("rub", 0.021, -0.03, -0.18, 0.0, 0.07)
    g.trigger(z=-0.02)
    g.sym("blk", 0.014, -0.02, 0.0, 0.12, 0.3, bevel=0.003)      # stock rods
    g.sym("blk", 0.014, 0.03, 0.045, 0.12, 0.3, bevel=0.003)
    g.sym("rub", 0.03, -0.07, 0.065, 0.3, 0.43, bevel=0.01)      # butt pad
    g.mag("blk", 0.017, -0.035, -0.237, -0.23, -0.17, curve=0.05)


def crimson_ak(g):
    g.sym("blk", 0.033, -0.04, 0.045, -0.3, 0.12)
    g.sym("red", 0.035, -0.03, 0.03, -0.26, 0.08, bevel=0.002)
    g.sym("blk", 0.03, 0.045, 0.06, -0.24, 0.1)                  # dust cover
    g.sym("red", 0.036, -0.042, 0.035, -0.5, -0.3, bevel=0.008)  # red handguard
    g.vents("dred", 0.036, -0.02, 0.015, -0.48, -0.32, n=3)
    g.prism("blk", 0.011, -0.57, -0.5, y=0.01)
    g.prism("blk", 0.016, -0.6, -0.55, y=0.01)
    g.sym("blk", 0.012, 0.01, 0.07, -0.56, -0.53)
    g.prism("dgr", 0.008, -0.5, -0.32, y=0.04)                   # gas tube
    g.sym("blk", 0.02, 0.06, 0.08, -0.04, 0.02)                  # rear sight
    g.grip("rub", 0.02, -0.035, -0.18, 0.03, 0.09, tilt=-18)
    g.trigger(z=0.0)
    g.box("red", -0.028, 0.028, -0.07, 0.05, 0.12, 0.42, rx=-6, pivot=(0, 0.05, 0.12), bevel=0.008)  # stock
    g.sym("blk", 0.03, -0.09, 0.055, 0.42, 0.47, bevel=0.008)
    g.mag("blk", 0.018, -0.04, -0.236, -0.14, -0.04, curve=0.09, segs=4)


def wraith_m4a1(g):
    g.sym("tan", 0.032, -0.04, 0.045, -0.33, 0.1)               # lower/upper receiver
    g.sym("blk", 0.034, -0.01, 0.025, -0.3, 0.06, bevel=0.002)
    g.rail("blk", 0.02, 0.045, -0.62, 0.08)
    g.sym("tan", 0.038, -0.04, 0.045, -0.66, -0.33, bevel=0.006)  # quad-rail handguard
    g.vents("blk", 0.038, -0.025, 0.025, -0.64, -0.36, n=5)
    g.prism("blk", 0.011, -0.88, -0.66, y=0.01)
    g.prism("dgr", 0.016, -0.95, -0.88, y=0.01, sides=6)        # flash hider
    g.sym("blk", 0.018, 0.06, 0.1, -0.64, -0.6)                 # folding front sight
    g.sym("blk", 0.018, 0.06, 0.1, 0.03, 0.07)                  # rear sight
    g.grip("blk", 0.02, -0.035, -0.18, 0.0, 0.065)
    g.trigger(z=-0.02)
    g.prism("blk", 0.014, 0.1, 0.24, y=0.0)                     # buffer tube
    g.box("tan", -0.026, 0.026, -0.08, 0.04, 0.2, 0.37, bevel=0.01)  # stock
    g.sym("blk", 0.028, -0.085, 0.045, 0.34, 0.37, bevel=0.006)
    g.mag("blk", 0.017, -0.04, -0.211, -0.177, -0.102, curve=0.03)


def riot_breaker(g):
    g.sym("dgr", 0.036, -0.045, 0.05, -0.3, 0.1)                # receiver
    g.box("g_org", 0.036, 0.04, -0.01, 0.0, -0.2, -0.17, bevel=0)  # shell window glint
    g.prism("blk", 0.019, -0.96, -0.3, y=0.02)                  # barrel
    g.prism("dgr", 0.015, -0.9, -0.32, y=-0.022)                # mag tube
    g.prism("blk", 0.02, -0.96, -0.93, y=0.02)
    g.sym("blk", 0.01, 0.04, 0.06, -0.94, -0.92)                # bead sight
    g.rail("blk", 0.012, 0.048, -0.28, 0.06, step=0.03)
    g.box("wood", -0.034, 0.034, -0.052, 0.012, -0.65, -0.45, node="pump", bevel=0.008)
    for z in (-0.62, -0.58, -0.54, -0.5):
        g.box("dwood", -0.036, 0.036, -0.04, 0.0, z, z + 0.012, node="pump", bevel=0.002)
    g.box("wood", -0.024, 0.024, -0.13, 0.02, 0.08, 0.2, rx=-24, pivot=(0, 0.02, 0.1), bevel=0.008)  # wrist
    g.box("wood", -0.03, 0.03, -0.12, 0.06, 0.18, 0.35, rx=-4, pivot=(0, 0.06, 0.18), bevel=0.01)   # stock
    g.sym("rub", 0.031, -0.13, 0.065, 0.33, 0.36, bevel=0.006)
    g.trigger(z=0.0)
    for i in range(3):
        g.box("red", 0.038, 0.048, -0.04, -0.02, 0.2 + i * 0.03, 0.22 + i * 0.03, bevel=0.002)  # side saddle shells


def widowmaker(g):
    g.sym("blk", 0.034, -0.045, 0.05, -0.32, 0.08)
    g.strip("g_pur", 0.034, 0.0, 0.01, -0.3, -0.06)
    g.prism("blk", 0.02, -0.85, -0.32, y=0.018)
    g.prism("dgr", 0.015, -0.78, -0.32, y=-0.024)
    for z in (-0.8, -0.7, -0.6):
        g.prism("g_pur", 0.022, z, z + 0.012, y=0.018, bevel=0)  # glowing barrel rings
    g.prism("blk", 0.024, -0.85, -0.82, y=0.018)
    g.box("dgr", -0.034, 0.034, -0.05, 0.012, -0.63, -0.41, node="pump", bevel=0.008)
    g.box("g_pur", -0.036, 0.036, -0.03, -0.022, -0.6, -0.44, node="pump", bevel=0)
    g.rail("blk", 0.014, 0.05, -0.3, 0.05)
    g.grip("rub", 0.02, -0.035, -0.17, 0.02, 0.08, tilt=-16)
    g.trigger(z=0.0)
    g.box("blk", -0.026, 0.026, -0.09, 0.045, 0.08, 0.29, rx=-5, pivot=(0, 0.045, 0.08), bevel=0.008)
    g.strip("g_pur", 0.026, -0.03, -0.02, 0.12, 0.26)


def titanbreaker(g):
    g.sym("blk", 0.04, -0.05, 0.05, -0.36, 0.14)
    g.sym("tan", 0.042, -0.035, 0.03, -0.32, 0.1, bevel=0.003)
    g.prism("blk", 0.014, -0.93, -0.36, y=0.01)                 # long barrel
    g.prism("dgr", 0.02, -0.5, -0.36, y=0.01)
    g.sym("blk", 0.03, -0.012, 0.03, -1.02, -0.93, bevel=0.006)  # muzzle brake
    g.vents("gry", 0.03, -0.005, 0.022, -1.0, -0.95, n=2)
    g.scope("blk", 0.11, -0.25, 0.04, r=0.024)
    g.sym("blk", 0.006, -0.12, -0.05, -0.6, -0.57, bevel=0)     # bipod legs (folded)
    g.grip("rub", 0.021, -0.045, -0.189, 0.06, 0.12, tilt=-10)
    g.trigger(z=0.04)
    g.box("tan", -0.03, 0.03, -0.11, 0.05, 0.14, 0.4, bevel=0.01)  # stock
    g.box("blk", -0.022, 0.022, 0.05, 0.08, 0.2, 0.33, bevel=0.006)  # cheek rest
    g.sym("rub", 0.032, -0.12, 0.06, 0.4, 0.44, bevel=0.006)
    g.mag("blk", 0.026, -0.05, -0.15, -0.26, -0.18, segs=2)


def cerberus_laser(g):
    g.sym("blk", 0.05, -0.06, 0.06, -0.6, 0.14, bevel=0.008)    # chunky body
    g.sym("dgr", 0.052, -0.02, 0.04, -0.56, 0.08, bevel=0.003)
    g.strip("g_red", 0.052, 0.008, 0.02, -0.54, -0.14)
    g.strip("g_red", 0.052, 0.008, 0.02, -0.1, 0.06)
    g.sym("blk", 0.04, -0.045, 0.045, -0.82, -0.6, bevel=0.008)  # emitter block
    g.box("g_red", -0.03, 0.03, -0.03, 0.03, -0.825, -0.818, bevel=0)  # emitter face
    for z in (-0.78, -0.72, -0.66):
        g.sym("g_red", 0.042, -0.035, -0.03, z, z + 0.015, bevel=0)
    g.rail("blk", 0.02, 0.06, -0.5, 0.0)
    g.box("lens", -0.008, 0.008, 0.075, 0.09, -0.3, -0.26, bevel=0)  # red sight
    g.grip("rub", 0.022, -0.055, -0.186, 0.02, 0.09)
    g.grip("rub", 0.018, -0.055, -0.16, -0.5, -0.45, tilt=0)   # fore grip
    g.trigger(z=0.0, y=-0.055)
    g.box("blk", -0.03, 0.03, -0.07, 0.05, 0.14, 0.26, bevel=0.01)
    g.mag("navy", 0.033, -0.06, -0.146, -0.42, -0.18, segs=1, base="blk")  # energy cell
    g.box("g_blu", -0.036, 0.036, -0.12, -0.08, -0.4, -0.2, node="mag", bevel=0)


def thundergrave(g):
    g.sym("blk", 0.048, -0.06, 0.06, -0.62, 0.16, bevel=0.008)
    g.sym("dgr", 0.05, 0.02, 0.05, -0.6, 0.1, bevel=0.003)
    for y in (-0.03, 0.0):
        g.strip("g_org", 0.05, y, y + 0.012, -0.58, -0.08)
    g.box("blk", -0.05, -0.012, -0.03, 0.03, -0.95, -0.62, bevel=0.006)  # twin rails
    g.box("blk", 0.012, 0.05, -0.03, 0.03, -0.95, -0.62, bevel=0.006)
    g.box("g_org", -0.012, 0.012, -0.02, 0.02, -0.93, -0.62, bevel=0)    # charge between rails
    g.sym("blk", 0.055, -0.045, 0.045, -0.35, -0.25, bevel=0.006)       # coil collar
    g.box("g_org", 0.055, 0.058, -0.03, 0.03, -0.34, -0.26, bevel=0)
    g.box("g_org", -0.058, -0.055, -0.03, 0.03, -0.34, -0.26, bevel=0)
    g.scope("blk", 0.09, -0.3, -0.05, r=0.02, lens="g_org")
    g.grip("rub", 0.022, -0.055, -0.189, 0.03, 0.1)
    g.trigger(z=0.01, y=-0.055)
    g.box("blk", -0.034, 0.034, -0.1, 0.06, 0.16, 0.28, bevel=0.01)
    g.box("g_org", -0.036, 0.036, -0.03, -0.015, 0.18, 0.26, bevel=0)


def doomsday(g):
    g.prism("olive", 0.07, -0.62, 0.22, y=0.02)                  # launch tube
    for z in (-0.5, -0.15, 0.1):
        g.prism("red", 0.074, z, z + 0.03, y=0.02, bevel=0.002)  # red bands
    g.prism("blk", 0.08, -0.69, -0.6, y=0.02)                    # muzzle bell
    g.prism("blk", 0.078, 0.2, 0.28, y=0.02)                     # rear venturi
    g.prism("red", 0.05, -0.692, -0.686, y=0.02, bevel=0)        # red warhead tip visible
    g.scope("blk", 0.115, -0.25, -0.08, r=0.018)
    g.grip("rub", 0.022, -0.045, -0.117 - 0.05, -0.05, 0.02, tilt=-8)
    g.grip("rub", 0.02, -0.045, -0.15, -0.38, -0.32, tilt=0)
    g.trigger(z=-0.04, y=-0.045)


def heavenfall(g):
    g.prism("white", 0.075, -0.8, 0.12, y=0.02)
    for z in (-0.72, -0.45, -0.2, 0.0):
        g.prism("gold", 0.08, z, z + 0.04, y=0.02, bevel=0.003)
    g.prism("gold", 0.085, -0.88, -0.78, y=0.02)                 # gold muzzle crown
    g.prism("g_gold", 0.06, -0.882, -0.876, y=0.02, bevel=0)
    g.prism("gold", 0.08, 0.1, 0.17, y=0.02)
    g.sym("gold", 0.03, 0.09, 0.13, -0.5, -0.3, bevel=0.006)    # top handle
    g.box("g_gold", -0.012, 0.012, 0.1, 0.105, -0.48, -0.32, bevel=0)
    g.grip("blk", 0.022, -0.05, -0.131 - 0.04, -0.05, 0.02, tilt=-8)
    g.grip("blk", 0.02, -0.05, -0.15, -0.42, -0.36, tilt=0)
    g.trigger(z=-0.04, y=-0.05)


def quantum(g):
    g.sym("blk", 0.048, -0.05, 0.06, -0.55, 0.1, bevel=0.008)
    g.strip("g_blu", 0.048, 0.0, 0.014, -0.52, -0.1)
    g.prism("blk", 0.022, -0.78, -0.55, y=0.01)
    for z in (-0.74, -0.66, -0.58):
        g.prism("g_blu", 0.028, z, z + 0.022, y=0.01, bevel=0)  # field rings
    g.prism("blk", 0.03, -0.81, -0.77, y=0.01)
    g.prism("g_blu", 0.016, -0.812, -0.806, y=0.01, bevel=0)
    g.rail("blk", 0.02, 0.06, -0.45, 0.02)
    g.box("g_blu", -0.009, 0.009, 0.075, 0.09, -0.25, -0.2, bevel=0)
    g.grip("rub", 0.022, -0.045, -0.234, 0.0, 0.07, tilt=-12)
    g.trigger(z=-0.02, y=-0.045)
    g.box("blk", -0.03, 0.03, -0.08, 0.05, 0.1, 0.17, bevel=0.01)
    g.mag("navy", 0.028, -0.05, -0.147, -0.27, -0.21, segs=1, base="blk")
    g.box("g_blu", -0.031, 0.031, -0.12, -0.08, -0.265, -0.215, node="mag", bevel=0)


def flamer(g, inferno=False):
    L = -1.09 if inferno else -0.89
    body = "blk"
    g.sym(body, 0.045, -0.05, 0.06, -0.4, 0.14, bevel=0.008)
    g.sym("red", 0.047, -0.03, 0.04, -0.36, 0.1, bevel=0.003)
    g.prism("dgr", 0.022, L + 0.1, -0.4, y=0.015)               # long barrel
    for z in np.linspace(L + 0.16, -0.46, 4 if inferno else 3):
        g.prism("blk", 0.028, z, z + 0.03, y=0.015)              # cooling fins
    g.sym("blk", 0.038, -0.025, 0.055, L, L + 0.1, bevel=0.008)  # nozzle block
    g.box("g_org" if not inferno else "g_red", -0.026, 0.026, -0.012, 0.042, L - 0.004, L + 0.002, bevel=0)
    if inferno:
        g.strip("g_red", 0.047, 0.045, 0.053, -0.38, 0.08)
        g.strip("g_org", 0.04, 0.01, 0.02, L + 0.02, L + 0.08)
    g.prism("dgr", 0.007, L + 0.12, -0.3, y=-0.02, x=0.03)       # fuel line
    g.grip("rub", 0.022, -0.05, -0.18, 0.02, 0.09)
    g.grip("rub", 0.02, -0.05, -0.16, -0.3, -0.25, tilt=0)
    g.trigger(z=0.0, y=-0.05)
    g.box("blk", -0.03, 0.03, -0.07, 0.055, 0.14, 0.25, bevel=0.01)
    # fuel tank under the body (the "mag")
    zt0, zt1 = (-0.37, -0.19) if inferno else (-0.39, -0.29)
    tank = g.prism("red", 0.04, zt0, zt1, y=-0.105, node="mag")
    g.prism("blk", 0.043, zt0, zt0 + 0.015, y=-0.105, node="mag")
    g.prism("blk", 0.043, zt1 - 0.015, zt1, y=-0.105, node="mag")
    g.box("blk", -0.015, 0.015, -0.07, -0.05, zt0 + 0.02, zt1 - 0.02, node="mag", bevel=0.003)


def absolute_zero(g):
    g.sym("navy", 0.046, -0.05, 0.06, -0.5, 0.14, bevel=0.008)
    g.sym("ice", 0.048, -0.02, 0.035, -0.46, 0.08, bevel=0.003)
    g.strip("g_ice", 0.048, 0.04, 0.05, -0.44, 0.06)
    g.prism("navy", 0.024, -0.82, -0.5, y=0.01)
    for z in (-0.78, -0.68, -0.58):
        g.prism("g_ice", 0.029, z, z + 0.02, y=0.01, bevel=0)
    g.prism("ice", 0.032, -0.845, -0.8, y=0.01)
    g.prism("g_ice", 0.018, -0.847, -0.842, y=0.01, bevel=0)
    g.rail("navy", 0.02, 0.06, -0.4, 0.06)
    g.grip("rub", 0.022, -0.05, -0.18, 0.02, 0.09)
    g.trigger(z=0.0, y=-0.05)
    g.box("navy", -0.032, 0.032, -0.08, 0.055, 0.14, 0.41, bevel=0.01)
    g.box("g_ice", -0.034, 0.034, -0.02, -0.008, 0.18, 0.36, bevel=0)
    g.mag("navy", 0.036, -0.05, -0.189, -0.46, -0.26, segs=1, base="blk")
    g.box("g_ice", -0.038, 0.038, -0.14, -0.08, -0.44, -0.28, node="mag", bevel=0)


BUILD = {
    "mp5": mp5, "crimson_ak": crimson_ak, "wraith_m4a1": wraith_m4a1, "riot_breaker": riot_breaker,
    "widowmaker": widowmaker, "titanbreaker": titanbreaker, "cerberus_laser": cerberus_laser,
    "thundergrave": thundergrave, "doomsday_launcher": doomsday, "heavenfall_bazooka": heavenfall,
    "quantum_annihilator": quantum, "firestarter": lambda g: flamer(g, False),
    "hellfire_incarnate": lambda g: flamer(g, True), "absolute_zero": absolute_zero,
}

for slug, fn in BUILD.items():
    if ONLY and slug not in ONLY:
        continue
    reset()
    _mats.clear()
    g = Gun(slug)
    fn(g)
    g.export()
