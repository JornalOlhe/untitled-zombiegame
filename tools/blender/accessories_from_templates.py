# Dead Recoil — Archangel class accessories (wing + halo) built from the ARCHANGEL template sheet.
# Uses the same pixel-relief extrusion as weapons_from_templates.py; writes acc_wing.glb and
# acc_halo_face.glb into <out_dir> (the props pack picks them up).
# Axes of the output (Blender): +X outward from the spine, +Z up, +Y toward the back.
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import weapons_from_templates as W

W.SPEC["pages"]["arc"] = "cc92b62c-image.jpg"
W.PPM = 115


def build(name, parts):
    import bpy, bmesh
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    b = W.Builder()
    for p in parts:
        b.part(p, True)
    atlas, emit, uvs, AW = b.pack()

    def img(nm, arr):
        im = bpy.data.images.new(nm, AW, AW, alpha=False)
        rgba = np.ones((AW, AW, 4), np.float32)
        rgba[..., :3] = arr[::-1]
        im.pixels.foreach_set(rgba.ravel())
        im.update()
        im.pack()
        return im

    mat = bpy.data.materials.new("M_" + name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img(name + "_albedo", atlas)
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    if emit.max() > 0:
        e = nt.nodes.new("ShaderNodeTexImage")
        e.image = img(name + "_emit", emit)
        nt.links.new(e.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.5
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    for q in b.idx:
        # Builder frame: x = width (outward), y = up, z = thickness -> Blender (x, z, y)
        vs = [bm.verts.new((b.pos[i][0], b.pos[i][2], b.pos[i][1])) for i in q]
        try:
            f = bm.faces.new(vs[::-1])
        except ValueError:
            continue
        for loop, i in zip(f.loops, q[::-1]):
            loop[uvl].uv = uvs[i]
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("gold", me)
    ob.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(ob)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                              export_materials="EXPORT", export_image_format="AUTO")
    print("built", name, len(b.idx), os.path.getsize(path))


if __name__ == "__main__":
    OUT = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    # Right wing of the "FULL ACCESSORY PREVIEW": root (shoulder joint) at the image point (392, 962).
    L = 1.05
    x0, x1 = 384, 612
    build("acc_wing", [
        {"pg": "arc", "box": [x0, 768, x1, 1212], "axis": "x", "dark": True, "light": 0.62, "sat": 0.28, "min": 0.34,
         "open": 3, "keep": 3, "clear": [[0, 320, 12, 444], [216, 230, 228, 444]], "L": L, "t": 0.05, "bevel": 0.6, "gv": 0.75, "gs": 0.4,
         "c": [L / 2 - (392 - x0) / (x1 - x0) * L, (962 - (768 + 1212) / 2) / (x1 - x0) * L * -1, 0]},
    ])
