# Dead Recoil — environment props built in Blender (trees, cars, igloo, rocket).
# Run:  blender -b -P tools/blender/props_build.py -- <out_dir>
#   or  python3 tools/blender/props_build.py <out_dir>   (with the `bpy` module installed)
# Every model is low-poly and vertex-coloured (no texture files) so it packs small and instances
# well; parts that the game treats differently are separate objects with fixed names:
#   paint  – car body the game tints per instance     leaves – foliage (wind shader)
#   glass  – windows (slightly transparent)            glow   – emissive lights / exhaust
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, noise

argv = sys.argv
OUT = argv[argv.index("--") + 1] if "--" in argv else (argv[1] if len(argv) > 1 and not argv[1].endswith(".py") else "props_out")
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rough=0.85, metal=0.0, emit=None, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    # Vertex colour drives the base colour (exported as COLOR_0).
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    return m


def paint(bm, color_fn):
    layer = bm.loops.layers.color.get("Col") or bm.loops.layers.color.new("Col")
    for f in bm.faces:
        c = f.calc_center_median()
        for l in f.loops:
            col = color_fn(l.vert.co, f.normal, c)
            l[layer] = (*col, 1.0)


def obj_from_bm(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = False
    return ob


def jitter(c, a, seed):
    r = random.Random(seed)
    return tuple(max(0, min(1, v + (r.random() - 0.5) * a)) for v in c)


def box(bm, center, size, rot_z=0.0, rot_x=0.0):
    geom = bmesh.ops.create_cube(bm, size=1.0)
    verts = geom["verts"]
    bmesh.ops.scale(bm, vec=Vector(size), verts=verts)
    if rot_x:
        bmesh.ops.rotate(bm, verts=verts, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(rot_x, 3, "X"))
    if rot_z:
        bmesh.ops.rotate(bm, verts=verts, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(rot_z, 3, "Z"))
    bmesh.ops.translate(bm, vec=Vector(center), verts=verts)
    return verts


def cyl(bm, p0, p1, r0, r1, seg=8):
    """Tapered cylinder from p0 to p1 (a branch / trunk / barrel)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=d.length)
    verts = geom["verts"]
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=verts, cent=Vector((0, 0, 0)), matrix=q.to_matrix())
    bmesh.ops.translate(bm, vec=(p0 + p1) / 2, verts=verts)
    return verts


def blob(bm, center, radius, squash=(1, 1, 1), subdiv=2, seed=0, rough=0.28):
    """Noisy icosphere: one foliage clump."""
    geom = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    verts = geom["verts"]
    for v in verts:
        n = noise.noise(v.co * 1.7 + Vector((seed * 3.1, seed * 1.7, seed * 2.3)))
        v.co *= 1 + n * rough
        v.co.x *= squash[0]
        v.co.y *= squash[1]
        v.co.z *= squash[2]
    bmesh.ops.translate(bm, vec=Vector(center), verts=verts)
    return verts


def export(name):
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True,
                              export_vertex_color="ACTIVE", export_materials="EXPORT", export_normals=True)
    print("exported", path, os.path.getsize(path))


# ------------------------------------------------------------------ trees
def broadleaf(name, seed, dark=False):
    reset()
    random.seed(seed)
    bark = mat("M_bark", 0.95)
    leafm = mat("M_leaves", 0.9)
    bm = bmesh.new()
    H = random.uniform(4.2, 5.2)
    lean = Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), 0))
    top = Vector((0, 0, H)) + lean
    cyl(bm, (0, 0, -0.2), top, 0.32, 0.16, 9)
    # Root flare.
    for i in range(5):
        a = i / 5 * math.tau + random.uniform(-0.3, 0.3)
        cyl(bm, (0, 0, 0.45), (math.cos(a) * 0.75, math.sin(a) * 0.75, -0.05), 0.14, 0.05, 5)
    # Branches from the upper trunk.
    tips = []
    for i in range(6):
        a = i / 6 * math.tau + random.uniform(-0.4, 0.4)
        z = random.uniform(H * 0.55, H * 0.95)
        base = Vector((0, 0, z)) + lean * (z / H)
        L = random.uniform(1.4, 2.3)
        tip = base + Vector((math.cos(a) * L, math.sin(a) * L, random.uniform(0.6, 1.4)))
        cyl(bm, base, tip, 0.11, 0.04, 6)
        tips.append(tip)
    paint(bm, lambda co, n, c: jitter((0.27, 0.2, 0.15) if co.z > 0.3 else (0.22, 0.17, 0.12), 0.06, int(c.x * 97 + c.z * 13)))
    trunk = obj_from_bm("trunk", bm, bark)
    bm = bmesh.new()
    base_g = (0.13, 0.21, 0.09) if dark else (0.2, 0.3, 0.12)
    for i, t in enumerate(tips + [top + Vector((0, 0, 0.6))]):
        r = random.uniform(1.1, 1.6)
        blob(bm, t, r, (1, 1, 0.78), 2, seed * 10 + i)
    for i in range(3):
        a = random.uniform(0, math.tau)
        blob(bm, top + Vector((math.cos(a) * 0.9, math.sin(a) * 0.9, random.uniform(-0.6, 0.4))), random.uniform(1.0, 1.4), (1, 1, 0.8), 2, seed * 20 + i)

    def leaf_col(co, n, c):
        shade = 0.75 + 0.35 * max(0, n.z) + 0.1 * noise.noise(c * 0.9)
        return jitter(tuple(v * shade for v in base_g), 0.07, int(c.x * 131 + c.y * 71 + c.z * 7))

    paint(bm, leaf_col)
    obj_from_bm("leaves", bm, leafm)
    export(name)


def pine(name, seed, snow=False):
    reset()
    random.seed(seed)
    bark = mat("M_bark", 0.95)
    leafm = mat("M_leaves", 0.9)
    bm = bmesh.new()
    H = random.uniform(6.5, 8.0)
    cyl(bm, (0, 0, -0.2), (0, 0, H), 0.26, 0.05, 8)
    paint(bm, lambda co, n, c: jitter((0.25, 0.18, 0.13), 0.05, int(c.z * 50)))
    obj_from_bm("trunk", bm, bark)
    bm = bmesh.new()
    tiers = 6
    for i in range(tiers):
        t = i / tiers
        z0 = 1.3 + t * (H - 1.8)
        r = (2.1 - t * 1.6) * random.uniform(0.92, 1.08)
        h = 1.9 - t * 0.6
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=9, radius1=r, radius2=0.12, depth=h)
        vs = geom["verts"]
        # Jagged, drooping edge.
        for v in vs:
            if v.co.z < 0:
                a = math.atan2(v.co.y, v.co.x)
                v.co.x *= 1 + 0.18 * math.sin(a * 5 + seed + i)
                v.co.y *= 1 + 0.18 * math.sin(a * 5 + seed + i)
                v.co.z -= 0.25 * random.random()
        bmesh.ops.rotate(bm, verts=vs, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(random.uniform(0, 3), 3, "Z"))
        bmesh.ops.translate(bm, vec=Vector((0, 0, z0 + h / 2)), verts=vs)

    def col(co, n, c):
        if snow and n.z > 0.55 and noise.noise(c * 1.3) > -0.25:
            return jitter((0.86, 0.9, 0.95), 0.04, int(c.x * 77 + c.z * 33))
        shade = 0.7 + 0.4 * max(0, n.z)
        g = (0.09, 0.17, 0.11) if not snow else (0.1, 0.18, 0.14)
        return jitter(tuple(v * shade for v in g), 0.05, int(c.x * 51 + c.y * 91 + c.z * 3))

    paint(bm, col)
    obj_from_bm("leaves", bm, leafm)
    export(name)


# ------------------------------------------------------------------ cars
def car(name, style="civil"):
    """Sedan ~4.3 x 1.9 x 1.45 m, +Y forward in Blender (becomes -Z forward in glTF/three)."""
    reset()
    body = mat("M_paint", 0.45, 0.35)
    dark = mat("M_trim", 0.8, 0.2)
    glassm = mat("M_glass", 0.1, 0.1, alpha=0.55)
    glowm = mat("M_glow", 0.4, 0.0, emit=(1, 0.9, 0.7))
    burnt = style == "burnt"
    W, L = 1.86, 4.3
    bm = bmesh.new()
    # Lower body with a sculpted profile: extrude a side outline across the width.
    prof = [(-2.15, 0.28), (-2.15, 0.62), (-2.0, 0.78), (-1.2, 0.86), (-0.75, 0.9), (0.95, 0.92), (1.9, 0.8), (2.15, 0.62), (2.15, 0.3), (1.6, 0.26),
            (1.45, 0.52), (1.0, 0.52), (0.85, 0.26), (-0.85, 0.26), (-1.0, 0.52), (-1.45, 0.52), (-1.6, 0.26)]
    verts_l = [bm.verts.new((-W / 2, y, z)) for y, z in prof]
    verts_r = [bm.verts.new((W / 2, y, z)) for y, z in prof]
    bm.faces.new(list(reversed(verts_l)))
    bm.faces.new(verts_r)
    n = len(prof)
    for i in range(n):
        a, b = verts_l[i], verts_l[(i + 1) % n]
        c, d = verts_r[(i + 1) % n], verts_r[i]
        bm.faces.new((a, b, c, d))
    # Cabin (greenhouse): trapezoid prism.
    cab = [(-1.05, 0.88), (-0.55, 1.38), (0.75, 1.4), (1.25, 0.9)]
    wi = W / 2 - 0.12
    wt = W / 2 - 0.3
    cl = [bm.verts.new((-(wi if z < 1 else wt), y, z)) for y, z in cab]
    cr = [bm.verts.new(((wi if z < 1 else wt), y, z)) for y, z in cab]
    bm.faces.new(list(reversed(cl)))
    bm.faces.new(cr)
    for i in range(4):
        a, b = cl[i], cl[(i + 1) % 4]
        c, d = cr[(i + 1) % 4], cr[i]
        bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    def body_col(co, nrm, c):
        if burnt:
            base = (0.09, 0.08, 0.07) if noise.noise(c * 2.3) > -0.2 else (0.32, 0.18, 0.1)
            return jitter(base, 0.06, int(c.x * 51 + c.y * 17 + c.z * 3))
        if style == "police":
            if c.z > 1.0:
                return (0.95, 0.95, 0.95)
            return (0.05, 0.05, 0.06) if (abs(c.y) > 1.2 or c.z < 0.5) else (0.95, 0.95, 0.95)
        v = 0.92 + 0.08 * max(0, nrm.z)
        return (v, v, v)  # tinted per instance by the game

    paint(bm, body_col)
    obj_from_bm("paint", bm, body)
    # Glass panels slightly proud of the cabin.
    bm = bmesh.new()
    if not burnt:
        box(bm, (0, -0.8, 1.13), (W - 0.36, 0.05, 0.46), rot_x=math.radians(-45))
        box(bm, (0, 1.0, 1.14), (W - 0.36, 0.05, 0.46), rot_x=math.radians(45))
        for s in (-1, 1):
            box(bm, (s * (W / 2 - 0.2), 0.1, 1.14), (0.04, 1.55, 0.36))
        paint(bm, lambda co, n, c: (0.35, 0.45, 0.52))
        obj_from_bm("glass", bm, glassm)
    else:
        bm.free()
    # Wheels, bumpers, mirrors, grille, plate.
    bm = bmesh.new()
    for x in (-W / 2 + 0.08, W / 2 - 0.08):
        for y in (-1.25, 1.3):
            cyl(bm, (x - 0.12, y, 0.36), (x + 0.12, y, 0.36), 0.36, 0.36, 12)
    for y in (-2.18, 2.18):
        box(bm, (0, y, 0.42), (W + 0.04, 0.12, 0.22))
    for s in (-1, 1):
        box(bm, (s * (W / 2 + 0.08), -0.62, 1.0), (0.14, 0.08, 0.1))
    box(bm, (0, -2.2, 0.62), (0.9, 0.04, 0.18))
    paint(bm, lambda co, n, c: jitter((0.05, 0.05, 0.05) if not burnt else (0.07, 0.06, 0.05), 0.03, int(c.y * 9)))
    obj_from_bm("trim", bm, dark)
    bm = bmesh.new()
    if not burnt:
        for s in (-1, 1):
            box(bm, (s * 0.64, -2.16, 0.72), (0.34, 0.06, 0.13))
            box(bm, (s * 0.66, 2.16, 0.74), (0.34, 0.06, 0.12))
        if style == "police":
            box(bm, (-0.32, 0.1, 1.47), (0.6, 0.28, 0.12))
            box(bm, (0.32, 0.1, 1.47), (0.6, 0.28, 0.12))

        def light_col(co, n, c):
            if c.z > 1.3:
                return (1, 0.1, 0.08) if c.x < 0 else (0.1, 0.3, 1)
            return (1, 0.95, 0.85) if c.y < 0 else (0.9, 0.08, 0.05)

        paint(bm, light_col)
        obj_from_bm("glow", bm, glowm)
    else:
        bm.free()
    export(name)


# ------------------------------------------------------------------ igloo
def igloo(name):
    """Dome of snow blocks, R=3.9 m, height 3.7 m, doorway + tunnel toward -Y (the game rotates it)."""
    reset()
    snowm = mat("M_snow", 0.97)
    R, TOP, T = 3.9, 3.7, 0.45
    bm = bmesh.new()
    courses = 9
    for c in range(courses):
        t0, t1 = c / courses, (c + 1) / courses
        a0, a1 = t0 * math.pi / 2, t1 * math.pi / 2
        r_mid = R * math.cos((a0 + a1) / 2)
        z0 = TOP * math.sin(a0)
        z1 = TOP * math.sin(a1)
        n = max(6, round(2 * math.pi * r_mid / 0.95))
        for i in range(n):
            ang = (i + 0.5 * (c % 2)) / n * math.tau
            off = math.atan2(math.sin(ang + math.pi / 2), math.cos(ang + math.pi / 2))  # 0 at -Y
            if c < 4 and abs(off) < 0.36:
                continue
            ang0, ang1 = ang - math.pi / n * 0.96, ang + math.pi / n * 0.96
            ro0, ro1 = R * math.cos(a0), R * math.cos(a1)
            ri0, ri1 = max(0.05, ro0 - T), max(0.05, ro1 - T)
            pts = []
            for (rr, zz) in ((ro0, z0), (ro1, z1 * 0.985), (ri1, z1 * 0.985 - 0.02), (ri0, z0)):
                pts.append([bm.verts.new((rr * math.cos(a), rr * math.sin(a), zz)) for a in (ang0, ang1)])
            (o0a, o0b), (o1a, o1b), (i1a, i1b), (i0a, i0b) = pts
            for f in ((o0a, o0b, o1b, o1a), (i0b, i0a, i1a, i1b), (o1a, o1b, i1b, i1a), (i0a, i0b, o0b, o0a), (o0a, o1a, i1a, i0a), (o0b, i0b, i1b, o1b)):
                try:
                    bm.faces.new(f)
                except ValueError:
                    pass
    # Cap.
    blob(bm, (0, 0, TOP - 0.05), 0.75, (1, 1, 0.35), 1, 5, 0.05)
    # Tunnel: two walls and an arched roof out along -Y.
    for s in (-1, 1):
        box(bm, (s * 1.15, -(R + 1.0), 1.05), (0.45, 2.4, 2.1))
    for k in range(5):
        a = math.pi * (k + 0.5) / 5
        box(bm, (math.cos(a) * 1.15, -(R + 1.0), 2.1 + math.sin(a) * 0.35), (0.62, 2.4, 0.34), rot_z=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    def col(co, n, c):
        seam = 0.86 if abs(n.z) < 0.2 and abs(c.z % 0.41 - 0.2) < 0.03 else 1.0
        base = (0.88, 0.93, 0.98) if n.z > 0.2 else (0.8, 0.87, 0.94)
        return jitter(tuple(v * seam for v in base), 0.05, int(c.x * 37 + c.y * 29 + c.z * 11))

    paint(bm, col)
    obj_from_bm("snow", bm, snowm)
    export(name)


# ------------------------------------------------------------------ rocket
def rocket(name):
    """Cyborg rocket, 0.95 m long along -Y, nose at -Y."""
    reset()
    bodym = mat("M_rocket", 0.5, 0.4)
    glowm = mat("M_glow", 0.3, 0.0, emit=(1, 0.5, 0.15))
    bm = bmesh.new()
    cyl(bm, (0, 0.35, 0), (0, -0.25, 0), 0.07, 0.07, 12)
    cyl(bm, (0, -0.25, 0), (0, -0.55, 0), 0.07, 0.0, 12)
    for i in range(4):
        a = i * math.pi / 2
        box(bm, (math.cos(a) * 0.1, 0.3, math.sin(a) * 0.1), (0.02 if i % 2 == 0 else 0.14, 0.18, 0.14 if i % 2 == 0 else 0.02))
    cyl(bm, (0, 0.35, 0), (0, 0.42, 0), 0.075, 0.06, 12)

    def col(co, n, c):
        if c.y < -0.25:
            return (0.75, 0.12, 0.08)
        if abs(c.y + 0.05) < 0.05:
            return (0.9, 0.75, 0.1)
        return jitter((0.34, 0.37, 0.3), 0.04, int(c.y * 90))

    paint(bm, col)
    obj_from_bm("body", bm, bodym)
    bm = bmesh.new()
    cyl(bm, (0, 0.42, 0), (0, 0.46, 0), 0.05, 0.05, 10)
    paint(bm, lambda co, n, c: (1, 0.55, 0.15))
    obj_from_bm("glow", bm, glowm)
    export(name)


# ------------------------------------------------------------------ bushes, rocks, mounds
def bush(name, seed):
    reset()
    random.seed(seed)
    leafm = mat("M_leaves", 0.9)
    bm = bmesh.new()
    for i in range(5):
        a = random.uniform(0, math.tau)
        d = random.uniform(0, 0.45)
        blob(bm, (math.cos(a) * d, math.sin(a) * d, random.uniform(0.25, 0.5)), random.uniform(0.4, 0.62), (1, 1, 0.8), 1, seed * 7 + i, 0.3)

    def col(co, n, c):
        shade = 0.7 + 0.4 * max(0, n.z)
        return jitter(tuple(v * shade for v in (0.15, 0.24, 0.1)), 0.07, int(c.x * 61 + c.y * 37 + c.z * 5))

    paint(bm, col)
    obj_from_bm("leaves", bm, leafm)
    export(name)


def rock(name, seed, flat=False):
    """Neutral grey rock; the game tints it per map (mossy / stone / snow)."""
    reset()
    random.seed(seed)
    m = mat("M_rock", 0.95)
    bm = bmesh.new()
    blob(bm, (0, 0, 0.25 if not flat else 0.0), 1.0, (1.1, 0.9, 0.6 if not flat else 0.28), 2, seed, 0.35)
    for i in range(2):
        a = random.uniform(0, math.tau)
        blob(bm, (math.cos(a) * 0.9, math.sin(a) * 0.9, 0.05), random.uniform(0.35, 0.5), (1, 1, 0.6), 1, seed * 3 + i, 0.3)

    def col(co, n, c):
        v = 0.62 + 0.25 * noise.noise(c * 2.1) + 0.12 * max(0, n.z)
        if flat or n.z > 0.75:
            v += 0.08
        return jitter((v, v, v * 0.97), 0.05, int(c.x * 43 + c.y * 19 + c.z * 7))

    paint(bm, col)
    obj_from_bm("paint", bm, m)
    export(name)


if __name__ == "__main__":
    bush("bush", 3)
    rock("rock_a", 31)
    rock("rock_b", 47)
    rock("mound", 59, flat=True)
    broadleaf("tree_broadleaf_a", 11)
    broadleaf("tree_broadleaf_b", 23, dark=True)
    pine("tree_pine_a", 5)
    pine("tree_pine_b", 9)
    pine("tree_snowpine", 17, snow=True)
    car("car_sedan", "civil")
    car("car_police", "police")
    car("car_burnt", "burnt")
    igloo("igloo")
    rocket("rocket")
