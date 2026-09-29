# Renders each GLB from front / side / back / above / below (Blender Workbench, texture colour)
# and writes one contact sheet:  python3 tools/blender/turntable.py sheet.png a.glb b.glb ...
import bpy, sys, math, os
from mathutils import Vector
from PIL import Image, ImageDraw
out = sys.argv[1]; files = sys.argv[2:]
S = 300
views = [("front", (0, -1, 0)), ("side", (1, 0, 0)), ("back", (0, 1, 0)), ("top 3/4", (0.5, -0.6, 0.9)), ("under 3/4", (-0.5, -0.6, -0.9))]
sheet = Image.new("RGB", (S * len(views), S * len(files)), (58, 66, 78))
for r, f in enumerate(files):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f)
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (lo + hi) / 2; size = max((hi - lo).length, 0.1)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
    sc.render.resolution_x = sc.render.resolution_y = S
    sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.23, 0.26, 0.31)
    sc.render.film_transparent = False
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = size * 1.12
    for c, (name, d) in enumerate(views):
        d = Vector(d).normalized()
        cam.location = ctr + d * size * 3
        cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
        p = os.path.join("/tmp", "tt_%d_%d.png" % (r, c)); sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        im = Image.open(p).convert("RGB"); sheet.paste(im, (c * S, r * S))
        ImageDraw.Draw(sheet).text((c * S + 4, r * S + 4), os.path.basename(f)[:-4] + " " + name, fill=(255, 255, 0))
sheet.save(out)
