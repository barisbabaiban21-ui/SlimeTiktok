"""Prepares the Tripo-rigged cockroach for the stage: decimates, and turns the face parts into rigid pieces on the head bone.

blender -b --python art/scripts/prep_roach.py -- <rigged.glb> <out.glb>

Tripo's part generation gave 14 meshes; the antennae, eyes and mandibles are weighted 100 % to the head. They become
plain meshes (not skinned), each with its origin at its hinge; the runtime attaches them to the head bone, so the runtime can turn them:
mandibles open and close for speech, eyes squash for blinks, antennae wiggle for mood.
"""
import bpy, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
arm = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE'][0]
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

def world_verts(o): return [o.matrix_world @ v.co for v in o.data.vertices]
def head_only(o):
    names = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices[:400]:
        for g in v.groups:
            if g.weight > 0.05 and names[g.group] != 'mixamorig:Head': return False
    return True
# Small parts weighted to the head only: face pieces. Classified by where they are (Blender: z up, face +x, left +y).
# Tripo's part numbers for this model (checked in a render): 8-9 antennae, 10-11 eyes, 12-13 mandibles.
FACE_PARTS = {'tripo_part_8', 'tripo_part_9', 'tripo_part_10', 'tripo_part_11', 'tripo_part_12', 'tripo_part_13'}
face = [o for o in meshes if o.name in FACE_PARTS]
body_parts = [o for o in meshes if o not in face]
print('FACE', [o.name for o in face], 'BODY', len(body_parts))
for o in face:
    vs = world_verts(o); c = sum(vs, Vector()) / len(vs)
    side = 'L' if c.y > 0 else 'R'
    zs = [v.z for v in vs]; height = max(zs) - min(zs)
    kind = 'antenna' if height > 0.12 else 'mandible' if c.x > 0.15 else 'eye'
    o.name = f'{kind}{side}'
    if kind == 'antenna': pivot = min(vs, key=lambda v: v.z)            # its base on the head
    elif kind == 'mandible': pivot = Vector((min(v.x for v in vs), c.y, max(zs)))  # hinge: back top
    else: pivot = c                                                      # eye centre
    # Origin to the hinge, then hang it on the head bone, keeping it where it is.
    bpy.context.scene.cursor.location = pivot
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers): o.modifiers.remove(mod)
    o.vertex_groups.clear()
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # Left free in the file (bone-parented objects come out mis-scaled in three.js); the runtime attaches it to the head bone.
    print('PART', o.name, len(o.data.polygons), [round(x, 3) for x in pivot])
# Decimate: about 120k triangles in all; the face keeps more of its detail.
def decimate(o, ratio):
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_to_index(modifier='dec', index=0); bpy.ops.object.modifier_apply(modifier='dec')
for o in body_parts: decimate(o, 0.07)
for o in face: decimate(o, 0.25)
print('TRIS', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in body_parts + face))
for img in bpy.data.images:
    if img.size[0] > 2048: img.scale(2048, 2048)
bpy.ops.export_scene.gltf(filepath=argv[1], export_format='GLB', export_animations=False)
print('DONE')
