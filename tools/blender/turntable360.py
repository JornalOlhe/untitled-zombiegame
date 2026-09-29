# 360° check for one weapon GLB: 8 azimuths every 45° around the vertical axis + top/bottom, lit
# render (Cycles, PBR maps + emission), one contact sheet. A model that vanishes edge-on shows here.
#   python3 tools/blender/turntable360.py sheet.png model.glb [px] [zoom_y_min zoom_y_max]
import bpy, sys, math, os
from mathutils import Vector
from PIL import Image, ImageDraw

out, f = sys.argv[1], sys.argv[2]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 360
zoom = (float(sys.argv[4]), float(sys.argv[5])) if len(sys.argv) > 5 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=f)
objs = [o for o in bpy.data.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
if zoom:  # zoom on a height band (Blender z == game y)
    lo.z, hi.z = zoom
ctr = (lo + hi) / 2
size = max((hi - lo).length, 0.1)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = 12
sc.cycles.use_denoising = False
sc.render.resolution_x = sc.render.resolution_y = S
sc.world = bpy.data.worlds.new("w")
sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.16, 0.18, 0.24, 1)
sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
for name, rot, e in (("key", (50, 0, 40), 3.5), ("rim", (60, 0, 220), 2.5), ("fill", (-30, 0, 130), 1.0)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
    l.data.energy = e
    l.rotation_euler = [math.radians(a) for a in rot]
    sc.collection.objects.link(l)
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = size * 1.05
views = [("az %d" % a, (math.sin(math.radians(a)), -math.cos(math.radians(a)), 0.12)) for a in range(0, 360, 45)]
views += [("top", (0.01, -0.01, 1)), ("bottom", (0.01, -0.01, -1))]
cols = 5
sheet = Image.new("RGB", (S * cols, S * 2), (40, 44, 54))
for c, (name, d) in enumerate(views):
    d = Vector(d).normalized()
    cam.location = ctr + d * size * 3
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    p = "/tmp/t360_%d.png" % c
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    im = Image.open(p).convert("RGB")
    sheet.paste(im, ((c % cols) * S, (c // cols) * S))
    ImageDraw.Draw(sheet).text(((c % cols) * S + 4, (c // cols) * S + 4), os.path.basename(f)[:-4] + " " + name, fill=(255, 255, 0))
sheet.save(out)
