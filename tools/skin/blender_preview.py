# Blender check of the survivor skin: builds the block model with the exact UV layout the game
# uses (Minecraft 64-unit layout, faces stored as seen from outside), renders FRONT / LEFT / BACK /
# RIGHT / 3/4 views side by side, and exports the model as a GLB reference.
#   python3 tools/skin/blender_preview.py <skin.png> <sheet_out.png> [model.glb]
import bpy, sys, math
from mathutils import Vector
from PIL import Image
skin_path, out = sys.argv[1], sys.argv[2]
glb = sys.argv[3] if len(sys.argv) > 3 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(skin_path)
mat = bpy.data.materials.new("skin"); mat.use_nodes = True; mat.blend_method = "CLIP"
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]; tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img; tex.interpolation = "Closest"
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"]); nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
bsdf.inputs["Roughness"].default_value = 0.9
U = 1 / 64.0
def box(name, size, center, ox, oy, inflate=0.0):
    w, h, d = size
    sx, sy, sz = (w + inflate) / 16, (h + inflate) / 16, (d + inflate) / 16  # 16 units = 1 m
    cx, cy, cz = center
    # Blender: x right(char left = +x), y back(-z three), z up
    P = lambda x, y, z: (cx + x * sx / 2, cy + y * sz / 2, cz + z * sy / 2)
    # faces as seen from outside, verts CCW from bottom-left; rect in 64-layout units
    def R(x0, y0, x1, y1): return [(x0, y1), (x1, y1), (x1, y0), (x0, y0)]
    faces = [
        ([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], R(ox + d, oy + d, ox + d + w, oy + d + h)),          # front (-y)
        ([P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1)], R(ox + 2 * d + w, oy + d, ox + 2 * d + 2 * w, oy + d + h)),  # back (+y)
        ([P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], R(ox + d + w, oy + d, ox + 2 * d + w, oy + d + h)),      # left (+x)
        ([P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1)], R(ox, oy + d, ox + d, oy + d + h)),                  # right (-x)
        ([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], R(ox + d, oy, ox + d + w, oy + d)),                      # top
        ([P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), P(-1, -1, -1)], R(ox + d + w, oy, ox + d + 2 * w, oy + d)),          # bottom
    ]
    verts, polys, uvs = [], [], []
    for quad, uv in faces:
        i = len(verts); verts += quad; polys.append((i, i + 1, i + 2, i + 3)); uvs += uv
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], polys); me.update()
    lay = me.uv_layers.new()
    for li, loop in enumerate(me.loops): lay.data[li].uv = (uvs[loop.vertex_index][0] * U, 1 - uvs[loop.vertex_index][1] * U)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob
# heights in 16-units/m; legs 12 tall, body 12, head 8
box("legR", (4, 12, 4), (-2 / 16, 0, 6 / 16), 0, 16); box("legL", (4, 12, 4), (2 / 16, 0, 6 / 16), 16, 48)
box("body", (8, 12, 4), (0, 0, 18 / 16), 16, 16)
box("armR", (4, 12, 4), (-6 / 16, 0, 18 / 16), 40, 16); box("armL", (4, 12, 4), (6 / 16, 0, 18 / 16), 32, 48)
box("head", (8, 8, 8), (0, 0, 28 / 16), 0, 0); box("hat", (8, 8, 8), (0, 0, 28 / 16), 32, 0, inflate=1.0)
sc = bpy.context.scene; sc.render.engine = "CYCLES"
if sc.render.engine == "CYCLES": sc.cycles.samples = 6; sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y = 300, 420
sc.world = bpy.data.worlds.new("w"); sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.03, 0.03, 1); sc.world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
for n, rot, e in (("key", (55, 0, 30), 3.0), ("fill", (60, 0, -140), 1.2)):
    l = bpy.data.objects.new(n, bpy.data.lights.new(n, "SUN")); l.data.energy = e; l.rotation_euler = [math.radians(a) for a in rot]; sc.collection.objects.link(l)
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4
tgt = Vector((0, 0, 1.0)); sheet = Image.new("RGB", (300 * 5, 420), (40, 40, 40))
for i, a in enumerate((0, 90, 180, 270, 35)):
    d = Vector((math.sin(math.radians(a)), -math.cos(math.radians(a)), 0.08))
    cam.location = tgt + d * 6; cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = "/tmp/_skinv%d.png" % i; bpy.ops.render.render(write_still=True)
    sheet.paste(Image.open(sc.render.filepath).convert("RGB"), (i * 300, 0))
sheet.save(out)
if glb: bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB")
print("ok", sc.render.engine)
