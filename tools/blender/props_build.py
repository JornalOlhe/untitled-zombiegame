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
    """v29: fuller crown — two orders of branches and ~24 foliage clumps spread over an
    ellipsoidal crown shell (lighter on top, darker and cooler underneath), bark with streaks."""
    reset()
    random.seed(seed)
    bark = mat("M_bark", 0.95)
    leafm = mat("M_leaves", 0.9)
    bm = bmesh.new()
    H = random.uniform(4.4, 5.4)
    lean = Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), 0))
    top = Vector((0, 0, H)) + lean
    cyl(bm, (0, 0, -0.2), top, 0.32, 0.15, 10)
    for i in range(5):  # root flare
        a = i / 5 * math.tau + random.uniform(-0.3, 0.3)
        cyl(bm, (0, 0, 0.45), (math.cos(a) * 0.78, math.sin(a) * 0.78, -0.05), 0.15, 0.05, 5)
    tips = []
    for i in range(7):  # main limbs
        a = i / 7 * math.tau + random.uniform(-0.35, 0.35)
        z = random.uniform(H * 0.5, H * 0.92)
        base = Vector((0, 0, z)) + lean * (z / H)
        L = random.uniform(1.5, 2.4)
        tip = base + Vector((math.cos(a) * L, math.sin(a) * L, random.uniform(0.7, 1.5)))
        cyl(bm, base, tip, 0.12, 0.045, 6)
        tips.append(tip)
        for k in range(2):  # twigs
            t = random.uniform(0.45, 0.85)
            p0 = base.lerp(tip, t)
            b2 = a + random.uniform(-0.9, 0.9)
            p1 = p0 + Vector((math.cos(b2) * 0.8, math.sin(b2) * 0.8, random.uniform(0.3, 0.8)))
            cyl(bm, p0, p1, 0.05, 0.02, 4)
            tips.append(p1)

    def bark_col(co, n, c):
        streak = 0.85 + 0.25 * (0.5 + 0.5 * math.sin(math.atan2(co.y, co.x) * 7 + co.z * 1.3))
        base = (0.3, 0.22, 0.16) if co.z > 0.3 else (0.24, 0.18, 0.13)
        return jitter(tuple(v * streak for v in base), 0.05, int(c.x * 97 + c.z * 13))

    paint(bm, bark_col)
    obj_from_bm("trunk", bm, bark)
    bm = bmesh.new()
    crown_c = top + Vector((0, 0, 0.5))
    RX, RZ = random.uniform(2.3, 2.8), random.uniform(1.7, 2.1)
    centers = [t for t in tips]
    for i in range(16):  # fill the crown shell
        u, v = random.uniform(0, math.tau), random.uniform(-0.35, 1.0)
        r = math.sqrt(max(0.0, 1 - v * v))
        centers.append(crown_c + Vector((math.cos(u) * r * RX * 0.85, math.sin(u) * r * RX * 0.85, v * RZ * 0.8)))
    for i, cpos in enumerate(centers):
        blob(bm, cpos, random.uniform(0.8, 1.2), (1, 1, 0.82), 1, seed * 10 + i, 0.26)
    hue = (0.16, 0.25, 0.09) if dark else (0.24, 0.36, 0.13)

    def leaf_col(co, n, c):
        up = (c.z - crown_c.z) / RZ  # -1 bottom .. +1 top
        shade = 0.62 + 0.28 * max(0, n.z) + 0.22 * max(-0.6, min(1, up)) + 0.12 * noise.noise(c * 0.8)
        g = hue
        if noise.noise(c * 0.35 + Vector((seed, 0, 0))) > 0.35:  # a few olive / sun-bleached clumps
            g = (g[0] * 1.25, g[1] * 1.08, g[2] * 0.8)
        if up < -0.2:  # cooler, darker underside
            g = (g[0] * 0.8, g[1] * 0.9, g[2] * 1.05)
        return jitter(tuple(min(1, x * shade) for x in g), 0.06, int(c.x * 131 + c.y * 71 + c.z * 7))

    paint(bm, leaf_col)
    obj_from_bm("leaves", bm, leafm)
    export(name)


def pine(name, seed, snow=False):
    """v29: denser conifer — 9 whorls of drooping, star-shaped branch skirts with tier-to-tier
    colour variation and a pointed leader; snow sits on the upper faces of the snowy variant."""
    reset()
    random.seed(seed)
    bark = mat("M_bark", 0.95)
    leafm = mat("M_leaves", 0.9)
    bm = bmesh.new()
    H = random.uniform(6.8, 8.2)
    cyl(bm, (0, 0, -0.2), (0, 0, H), 0.27, 0.05, 8)
    paint(bm, lambda co, n, c: jitter((0.27, 0.19, 0.14), 0.05, int(c.z * 50)))
    obj_from_bm("trunk", bm, bark)
    bm = bmesh.new()
    tiers = 9
    for i in range(tiers):
        t = i / (tiers - 1)
        z0 = 1.1 + t * (H - 1.9)
        r = (2.25 - t * 1.85) * random.uniform(0.92, 1.08)
        h = 1.55 - t * 0.55
        seg = 14
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0.1, depth=h)
        vs = geom["verts"]
        k = random.uniform(0, 10)
        for v in vs:
            if v.co.z < 0:
                a = math.atan2(v.co.y, v.co.x)
                star = 1 + 0.26 * math.cos(a * 7 + k)  # branch tips
                v.co.x *= star
                v.co.y *= star
                v.co.z -= 0.18 + 0.28 * max(0, math.cos(a * 7 + k)) + 0.1 * random.random()  # tips droop
        bmesh.ops.rotate(bm, verts=vs, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(random.uniform(0, 3), 3, "Z"))
        bmesh.ops.translate(bm, vec=Vector((0, 0, z0 + h / 2)), verts=vs)
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.25, radius2=0.0, depth=0.9)
    bmesh.ops.translate(bm, vec=Vector((0, 0, H + 0.2)), verts=geom["verts"])
    tone = [random.uniform(0.85, 1.15) for _ in range(tiers + 2)]

    def col(co, n, c):
        # Snow rests in patches on the upward faces of every whorl (more near the top).
        if snow and n.z > 0.3 and noise.noise(c * 2.2) > 0.15 - 0.25 * min(1.0, c.z / H):
            return jitter((0.86, 0.9, 0.95), 0.04, int(c.x * 77 + c.z * 33))
        tier = max(0, min(tiers, int((c.z - 1.1) / max(0.1, (H - 1.9)) * (tiers - 1))))
        shade = (0.62 + 0.42 * max(0, n.z)) * tone[tier]
        g = (0.1, 0.2, 0.12) if not snow else (0.1, 0.19, 0.15)
        return jitter(tuple(min(1, v * shade) for v in g), 0.05, int(c.x * 51 + c.y * 91 + c.z * 3))

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
        # v29: darker, more contrasted stone (crevices darker, weathered tops lighter).
        v = 0.44 + 0.2 * noise.noise(c * 2.1) + 0.14 * max(0, n.z) - 0.1 * max(0, -n.z)
        if flat or n.z > 0.75:
            v += 0.05
        return jitter((v, v, v * 0.97), 0.05, int(c.x * 43 + c.y * 19 + c.z * 7))

    paint(bm, col)
    obj_from_bm("paint", bm, m)
    export(name)


# ------------------------------------------------------------------ secret class accessories
# Following the ARCHANGEL (wings + halo) and ARCHDEMON (horns + tail) class accessory templates.
# Axes (Blender): +X outward (right side), +Z up, +Y toward the back. The game mirrors the right
# wing / horn for the left side and spins the tail rotor around the tail axis.
def feather(bm, root, direction, length, width, bend=0.12, seg=5):
    """A flat, tapered feather blade from `root` along `direction` (curving toward -Z)."""
    d = Vector(direction).normalized()
    side = d.cross(Vector((0, 1, 0)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    prev = None
    for i in range(seg + 1):
        t = i / seg
        c = Vector(root) + d * length * t + Vector((0, 0, -bend * length * t * t))
        w = width * (0.35 + 0.65 * math.sin(math.pi * min(1, t * 0.95 + 0.05))) * (1 - 0.8 * t ** 3)
        th = 0.012 * (1 - t) + 0.003
        ring = [bm.verts.new(c + side * w / 2), bm.verts.new(c + Vector((0, th, 0))), bm.verts.new(c - side * w / 2), bm.verts.new(c - Vector((0, th, 0)))]
        if prev:
            for k in range(4):
                bm.faces.new((prev[k], prev[(k + 1) % 4], ring[(k + 1) % 4], ring[k]))
        prev = ring


def halo(name):
    reset()
    gold = mat("M_gold", 0.3, 0.8)
    glowm = mat("M_glow", 0.2, 0.0, emit=(0.45, 0.85, 1.0))
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, radius=0.235, segments=40)
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=0.235, radius2=0.235, depth=0.03)
    bm.free()
    bm = bmesh.new()
    # Torus made by sweeping a small circle.
    R, r, n, m = 0.235, 0.018, 48, 8
    rings = []
    for i in range(n):
        a = i / n * math.tau
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(((R + r * math.cos(b)) * ca, (R + r * math.cos(b)) * sa, r * math.sin(b))) for b in (j / m * math.tau for j in range(m))])
    for i in range(n):
        for j in range(m):
            a, b = rings[i][j], rings[i][(j + 1) % m]
            c, d = rings[(i + 1) % n][(j + 1) % m], rings[(i + 1) % n][j]
            bm.faces.new((a, b, c, d))
    # v29 (ARCHANGEL template): an upper and a lower thin ring stacked on the main band.
    for dz, rr, RR in ((0.034, 0.008, R * 0.97), (-0.03, 0.007, R * 1.02)):
        rs = []
        for i in range(n):
            a = i / n * math.tau
            ca, sa = math.cos(a), math.sin(a)
            rs.append([bm.verts.new(((RR + rr * math.cos(b)) * ca, (RR + rr * math.cos(b)) * sa, dz + rr * math.sin(b))) for b in (j / 6 * math.tau for j in range(6))])
        for i in range(n):
            for j in range(6):
                bm.faces.new((rs[i][j], rs[i][(j + 1) % 6], rs[(i + 1) % n][(j + 1) % 6], rs[(i + 1) % n][j]))
    # Small spires at the four quarters (gold), pointing out.
    for i in range(4):
        a = i / 4 * math.tau
        cyl(bm, (math.cos(a) * (R + 0.01), math.sin(a) * (R + 0.01), 0), (math.cos(a) * (R + 0.07), math.sin(a) * (R + 0.07), 0), 0.018, 0.0, 4)
    paint(bm, lambda co, n, c: jitter((0.86, 0.68, 0.3), 0.04, int(c.x * 90 + c.y * 50)))
    obj_from_bm("gold", bm, gold)
    bm = bmesh.new()
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        g = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.028)
        for v in g["verts"]:
            v.co.z *= 1.7
            v.co += Vector((math.cos(a) * R, math.sin(a) * R, 0))
    # Front centre gem with a four-point star: tall top spire and a shorter bottom spire.
    for sx, sz, h in ((0.0, 1.0, 0.13), (0.0, -1.0, 0.07)):
        g = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.03)
        for v in g["verts"]:
            v.co.z = v.co.z * (h / 0.03) * 0.5 + sz * (0.02 + h * 0.5)
            v.co.y -= R
    for sx in (-1, 1):
        g = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.02)
        for v in g["verts"]:
            v.co.x = v.co.x * 2.4 + sx * 0.05
            v.co.y -= R
    g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.034)
    for v in g["verts"]:
        v.co.y -= R + 0.01
    paint(bm, lambda co, n, c: (0.3, 0.72, 1.0))
    obj_from_bm("glow", bm, glowm)
    export(name)


def wing(name):
    reset()
    random.seed(77)
    gold = mat("M_gold", 0.3, 0.8)
    featherm = mat("M_feather", 0.85)
    glowm = mat("M_glow", 0.2, 0.0, emit=(0.45, 0.85, 1.0))
    # Frame: shoulder -> wrist -> tip.
    frame = [Vector((0, 0, 0)), Vector((0.22, 0.02, 0.2)), Vector((0.48, 0.05, 0.36)), Vector((0.72, 0.08, 0.34)), Vector((0.98, 0.1, 0.16))]
    bm = bmesh.new()
    for i in range(len(frame) - 1):
        cyl(bm, frame[i], frame[i + 1], 0.045 - i * 0.008, 0.037 - i * 0.008, 7)
    # Decorative gold plate at the wrist.
    blob(bm, frame[2], 0.07, (1.4, 0.5, 1.0), 1, 3, 0.05)
    paint(bm, lambda co, n, c: jitter((0.86, 0.68, 0.3), 0.05, int(c.x * 90 + c.z * 30)))
    obj_from_bm("gold", bm, gold)

    def along(t):
        k = t * (len(frame) - 1)
        i = min(int(k), len(frame) - 2)
        return frame[i].lerp(frame[i + 1], k - i)

    bm = bmesh.new()
    # Primaries: long, from the outer frame, fanning down and out.
    for i in range(13):
        t = 0.5 + i * 0.038
        ang = math.radians(-88 + i * 5.5)  # fan from straight down (inner) to outward (tip)
        feather(bm, along(t) + Vector((0, 0.004 * i, 0)), (math.cos(ang), 0.02, math.sin(ang)), 0.5 + i * 0.03, 0.2, 0.08)
    # Secondaries along the inner frame.
    for i in range(12):
        t = 0.06 + i * 0.04
        feather(bm, along(t) + Vector((0, -0.01, 0)), (0.14, 0.02, -1), 0.4 + i * 0.015, 0.19, 0.08)
    # Tertiaries / coverts: short layer over the frame.
    for i in range(10):
        t = 0.05 + i * 0.09
        feather(bm, along(t) + Vector((0, -0.025, 0.02)), (0.25, 0.0, -1), 0.24, 0.15, 0.05, 4)

    def col(co, n, c):
        tip = max(0.0, min(1.0, (-c.z - 0.25) / 0.6))
        base = (0.95, 0.97, 1.0)
        blue = (0.62, 0.84, 1.0)
        return jitter(tuple(base[k] * (1 - tip * 0.55) + blue[k] * tip * 0.55 for k in range(3)), 0.03, int(c.x * 71 + c.z * 37))

    paint(bm, col)
    obj_from_bm("leaves", bm, featherm)
    bm = bmesh.new()
    g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.045)
    for v in g["verts"]:
        v.co += frame[2] + Vector((0, -0.05, 0))
    paint(bm, lambda co, n, c: (0.55, 0.9, 1.0))
    obj_from_bm("glow", bm, glowm)
    export(name)


def horn(name):
    """ARCHDEMON horn: thick plated base that sweeps out sideways and curls up and back in a
    C-shape, spikes along the outer edge, crimson glow veins and a spiked connector band."""
    reset()
    obs = mat("M_obsidian", 0.35, 0.4)
    bone = mat("M_bone", 0.7)
    glowm = mat("M_glow", 0.2, 0.0, emit=(1.0, 0.12, 0.08))
    N = 16
    C = Vector((0.1, 0.0, 0.13))
    pts, outs = [], []
    for i in range(N + 1):
        t = i / N
        a = math.radians(-105 + t * 215)
        R = 0.14 - 0.05 * t
        p = C + Vector((math.cos(a) * R, -0.1 * t * t, math.sin(a) * R))
        pts.append(p)
        outs.append(Vector((math.cos(a), 0, math.sin(a))))
    shift = Vector((0.02, 0.0, 0.0)) - pts[0]
    pts = [q + shift for q in pts]
    bm = bmesh.new()
    for i in range(N):
        r0 = 0.078 * (1 - i / N) ** 0.9 + 0.005
        r1 = 0.078 * (1 - (i + 1) / N) ** 0.9 + 0.004
        cyl(bm, pts[i], pts[i + 1], r0, r1, 8)
    paint(bm, lambda co, n, c: jitter((0.11, 0.08, 0.09) if int(c.z * 40 + c.x * 25) % 3 else (0.24, 0.16, 0.14), 0.04, int(c.z * 90 + c.x * 30)))
    obj_from_bm("body", bm, obs)
    bm = bmesh.new()
    for i in range(2, N - 1, 2):
        base, out = pts[i], outs[i]
        r = 0.078 * (1 - i / N) ** 0.9
        tipdir = (out + Vector((0, -0.25, 0.15))).normalized()
        cyl(bm, base + out * r * 0.8, base + out * r * 0.8 + tipdir * (0.05 + 0.03 * (1 - i / N)), 0.022 * (1 - i / N) + 0.008, 0.0, 4)
    for k in range(12):
        a = k / 12 * math.tau
        box(bm, (math.cos(a) * 0.075 + 0.02, math.sin(a) * 0.075, 0.005), (0.035, 0.03, 0.03), rot_z=a)
        if k % 2 == 0:
            cyl(bm, Vector((math.cos(a) * 0.09 + 0.02, math.sin(a) * 0.09, 0.0)), Vector((math.cos(a) * 0.13 + 0.02, math.sin(a) * 0.13, 0.03)), 0.012, 0.0, 4)
    # v29 (ARCHDEMON template): horn spikes are dark obsidian like the horn itself; the glow
    # veins below carry the crimson.
    paint(bm, lambda co, n, c: jitter((0.16, 0.1, 0.1), 0.04, int(c.x * 70 + c.z * 40)))
    obj_from_bm("spikes", bm, obs)
    bm = bmesh.new()
    for i in range(1, N - 3, 3):
        a2, b2 = pts[i], pts[i + 1]
        inn = -outs[i]
        r = 0.078 * (1 - i / N) ** 0.9
        mid = (a2 + b2) / 2 + inn * r * 0.85
        cyl(bm, mid - (b2 - a2) * 0.45, mid + (b2 - a2) * 0.45, 0.008, 0.006, 4)
    for i in range(2, N - 1, 2):  # glowing tips on the outer spikes
        out = outs[i]
        r = 0.078 * (1 - i / N) ** 0.9
        tipdir = (out + Vector((0, -0.25, 0.15))).normalized()
        tip = pts[i] + out * r * 0.8 + tipdir * (0.05 + 0.03 * (1 - i / N))
        cyl(bm, tip - tipdir * 0.018, tip, 0.006, 0.0, 4)
    for i in range(0, N - 2, 2):  # crimson cracks on the outer face
        p0 = pts[i] + outs[i] * 0.078 * (1 - i / N) ** 0.9 * 0.98
        p1 = pts[i + 1] + outs[i + 1] * 0.078 * (1 - (i + 1) / N) ** 0.9 * 0.98
        cyl(bm, p0, p1 + Vector((0.01, 0, 0)), 0.006, 0.004, 4)
    g = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.022)
    for v in g["verts"]:
        v.co += Vector((0.02, 0.085, 0.01))
    paint(bm, lambda co, n, c: (1.0, 0.15, 0.1))
    obj_from_bm("glow", bm, glowm)
    export(name)


def tail(name):
    reset()
    obs = mat("M_obsidian", 0.35, 0.4)
    bone = mat("M_bone", 0.7)
    glowm = mat("M_glow", 0.2, 0.0, emit=(1.0, 0.12, 0.08))
    pts = [Vector((math.sin(j * 0.55) * 0.08, 0.16 + j * 0.14, -0.04 - j * 0.045)) for j in range(8)]
    pts.insert(0, Vector((0, 0, 0)))
    bm = bmesh.new()
    for j in range(len(pts) - 1):
        r0 = 0.06 - j * 0.005
        cyl(bm, pts[j], pts[j + 1], r0, r0 - 0.012, 8)
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r0 * 1.15)
        for v in g["verts"]:
            v.co.y *= 0.7
            v.co += pts[j + 1]
    paint(bm, lambda co, n, c: jitter((0.12, 0.09, 0.1) if int(c.y * 7) % 2 else (0.3, 0.2, 0.17), 0.04, int(c.y * 90)))
    obj_from_bm("body", bm, obs)
    bm = bmesh.new()
    for j in range(1, len(pts)):
        p = pts[j]
        cyl(bm, p + Vector((0, 0, 0.04)), p + Vector((0, 0.04, 0.15 - j * 0.012)), 0.032 - j * 0.002, 0.0, 4)
        for sd in (-1, 1):
            cyl(bm, p + Vector((sd * 0.045, 0, 0.01)), p + Vector((sd * (0.11 - j * 0.008), 0.03, 0.03)), 0.022 - j * 0.0015, 0.0, 4)
    paint(bm, lambda co, n, c: jitter((0.75, 0.66, 0.55), 0.04, int(c.y * 70)))
    obj_from_bm("spikes", bm, bone)
    bm = bmesh.new()
    for j in range(3, len(pts)):
        g = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.02)
        for v in g["verts"]:
            v.co += pts[j] + Vector((0, 0, -0.045))
    paint(bm, lambda co, n, c: (1.0, 0.15, 0.1))
    obj_from_bm("glow", bm, glowm)
    export(name)


def rotor(name):
    """ARCHDEMON tail tip: two big crescent blades (a double axe) with glowing edges around a rune
    gem, in the X-Z plane (spins around Y)."""
    reset()
    obs = mat("M_obsidian", 0.35, 0.4)
    glowm = mat("M_glow", 0.2, 0.0, emit=(1.0, 0.12, 0.08))
    bm = bmesh.new()
    edge = bmesh.new()
    for k in range(2):
        a0 = k * math.pi - 0.75
        prev = prev_e = None
        for i in range(11):
            t = i / 10
            a = a0 + t * 1.5
            r = 0.12 + 0.26 * math.sin(math.pi * t) ** 0.6
            w = 0.11 * math.sin(math.pi * t) + 0.008
            c = Vector((math.cos(a) * r, 0, math.sin(a) * r))
            rad = Vector((math.cos(a), 0, math.sin(a)))
            ring = [bm.verts.new(c + rad * w), bm.verts.new(c + Vector((0, 0.016, 0))), bm.verts.new(c - rad * w * 0.4), bm.verts.new(c - Vector((0, 0.016, 0)))]
            if prev:
                for q in range(4):
                    bm.faces.new((prev[q], prev[(q + 1) % 4], ring[(q + 1) % 4], ring[q]))
            prev = ring
            e = [edge.verts.new(c + rad * (w + 0.012) + Vector((0, 0.006, 0))), edge.verts.new(c + rad * (w + 0.012) - Vector((0, 0.006, 0))),
                 edge.verts.new(c + rad * (w - 0.01) - Vector((0, 0.006, 0))), edge.verts.new(c + rad * (w - 0.01) + Vector((0, 0.006, 0)))]
            if prev_e:
                for q in range(4):
                    edge.faces.new((prev_e[q], prev_e[(q + 1) % 4], e[(q + 1) % 4], e[q]))
            prev_e = e
        for t in (0.3, 0.7):
            a = a0 + t * 1.5
            base = Vector((math.cos(a) * 0.1, 0, math.sin(a) * 0.1))
            cyl(bm, base, base * 1.9 + Vector((0, 0, 0.02)), 0.018, 0.0, 4)
    box(bm, (0, 0, 0), (0.09, 0.05, 0.09))
    paint(bm, lambda co, n, c: jitter((0.14, 0.1, 0.11), 0.04, int(c.x * 50 + c.z * 30)))
    obj_from_bm("body", bm, obs)
    g = bmesh.ops.create_icosphere(edge, subdivisions=1, radius=0.045)
    for v in g["verts"]:
        v.co.y *= 1.6
    paint(edge, lambda co, n, c: (1.0, 0.15, 0.1))
    obj_from_bm("glow", edge, glowm)
    export(name)

if __name__ == "__main__":
    halo("acc_halo")
    wing("acc_wing")
    horn("acc_horn")
    tail("acc_tail")
    rotor("acc_rotor")
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
