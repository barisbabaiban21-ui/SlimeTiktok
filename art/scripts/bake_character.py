"""Bakes a character: the Tripo-rigged mesh plus every clip (FBX) in the given folders, retargeted onto its skeleton.

blender -b --python art/scripts/bake_character.py -- <rigged.glb> <anim dir[,dir...]> <out.glb> [texture px]

Clips come from Mixamo (mixamorig: bones) or fal.ai Hunyuan Motion (SMPL-H bones, cm, Y-up); both are mapped
onto our Mixamo-named skeleton.

Mixamo FBX and our glTF skeleton have the same joints, but the FBX armature stands in Mixamo's
T-pose facing -Y while ours stands in an A-pose facing +X, and the bone rolls differ. So each clip is
retargeted in armature space: our skeleton is first posed into the T-pose (each bone turned so it
points at its child exactly as in the FBX rest), the rotation from the FBX rest frame to that pose is
kept per bone, and every frame our bone takes the FBX bone's rotation times that correction.
The local (basis) transform is then solved down the hierarchy.
"""
import bpy, sys, os, glob
from mathutils import Matrix, Quaternion
import math

argv = sys.argv[sys.argv.index('--') + 1:]
src, anim_dir, out = argv[0], argv[1], argv[2]
tex = int(argv[3]) if len(argv) > 3 else 2048
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src)
for o in list(sc.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
arm = [o for o in sc.objects if o.type == 'ARMATURE'][0]; arm.name = 'Dayi'
mesh = [o for o in sc.objects if o.type == 'MESH'][0]; mesh.name = 'DayiBody'
SIDES = {'L': 'Left', 'R': 'Right'}
SMPL = {'Pelvis': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Spine3': 'Spine2', 'Neck': 'Neck', 'Head': 'Head'}
for k, side in SIDES.items():
    SMPL.update({f'{k}_Hip': f'{side}UpLeg', f'{k}_Knee': f'{side}Leg', f'{k}_Ankle': f'{side}Foot', f'{k}_Foot': f'{side}ToeBase',
                 f'{k}_Collar': f'{side}Shoulder', f'{k}_Shoulder': f'{side}Arm', f'{k}_Elbow': f'{side}ForeArm', f'{k}_Wrist': f'{side}Hand'})
    for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'):
        for i in (1, 2, 3): SMPL[f'{k}_{f}{i}'] = f'{side}Hand{f}{i}'
def source_names(src_arm):
    """Our bone name -> the source armature's bone name."""
    names = [b.name for b in src_arm.data.bones]
    if any(n.startswith('mixamorig:') for n in names): return {n: n for n in names}
    return {'mixamorig:' + SMPL[n]: n for n in names if n in SMPL}
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, tex)
bones = [b.name for b in arm.data.bones]
order = []
def walk(b):
    order.append(b.name)
    for c in b.children: walk(c)
for b in arm.data.bones:
    if b.parent is None: walk(b)
rest = {n: arm.data.bones[n].matrix_local.copy() for n in bones}
arm.animation_data_create()
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
for path in sorted(p for d in anim_dir.split(',') for p in glob.glob(os.path.join(d, '*.fbx'))):
    name = os.path.splitext(os.path.basename(path))[0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    src_arm = [o for o in new if o.type == 'ARMATURE'][0]
    sact = src_arm.animation_data.action
    names = source_names(src_arm)
    W = src_arm.matrix_world.copy()  # Hunyuan: 0.01 scale, +90 deg about X; Mixamo: identity
    def unscaled(m):
        out = m.copy(); r = m.to_3x3().normalized().to_4x4(); r.translation = m.translation; return r
    f0, f1 = (int(round(x)) for x in sact.frame_range)
    G = Matrix.Rotation(math.radians(90), 4, 'Z')  # FBX armature space -> ours (left arm +X -> +Y)
    fr = {n: unscaled(W @ src_arm.data.bones[names[n]].matrix_local) for n in order if n in names}
    # Hips travel: the offset from the source rest, scaled by leg length (the two bodies differ in size).
    leg = lambda m: (m['mixamorig:LeftUpLeg'].translation - m['mixamorig:LeftFoot'].translation).length
    hipScale = leg(rest) / max(1e-6, leg(fr))
    # Reference: the hips on the clip's first frame (he starts standing); Hunyuan stores world height, not rest.
    sc.frame_set(f0)
    hipRest = (G @ unscaled(W @ src_arm.pose.bones[names['mixamorig:Hips']].matrix)).translation.copy()
    # Our T-pose, bone by bone: carried by the parent, then turned to point where the FBX rest points.
    PT = {}
    for n in order:
        bone = arm.data.bones[n]
        P = (PT[bone.parent.name] @ rest[bone.parent.name].inverted() if bone.parent else Matrix.Identity(4)) @ rest[n]
        kids = [c for c in bone.children if c.name in fr]
        kid = next((c for c in kids if any(k in c.name for k in ('Middle1', 'Spine', 'Neck', 'Head'))), kids[0] if kids else None)
        if bone.parent and kid and n in fr:
            cur = (P @ (rest[n].inverted() @ rest[kid.name]).translation) - P.translation
            tgt = (G.to_3x3() @ (fr[kid.name].translation - fr[n].translation))
            q = cur.rotation_difference(tgt)
            t = P.translation.copy(); P = q.to_matrix().to_4x4() @ P; P.translation = t
            # A direction leaves the roll free: palms would face up on one rig and down on the other.
            # Hands also match the knuckle line (index -> pinky), i.e. which way the palm faces.
            side = n[len('mixamorig:'):-len('Hand')] if n.endswith('Hand') else None
            ix, pk = (f'mixamorig:{side}HandIndex1', f'mixamorig:{side}HandPinky1') if side else (None, None)
            if side and ix in fr and pk in fr:
                axis = tgt.normalized()
                local = rest[n].inverted()
                cur_s = (P @ (local @ rest[pk]).translation) - (P @ (local @ rest[ix]).translation)
                tgt_s = G.to_3x3() @ (fr[pk].translation - fr[ix].translation)
                cur_s -= axis * cur_s.dot(axis); tgt_s -= axis * tgt_s.dot(axis)
                if cur_s.length > 1e-6 and tgt_s.length > 1e-6:
                    roll = cur_s.normalized().rotation_difference(tgt_s.normalized())
                    t = P.translation.copy(); P = roll.to_matrix().to_4x4() @ P; P.translation = t
        PT[n] = P
    corr = {n: (G.to_3x3() @ fr[n].to_3x3()).inverted() @ PT[n].to_3x3() for n in order if n in fr}
    act = bpy.data.actions.new(name); arm.animation_data.action = act
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        P = {}
        for n in order:
            b = arm.data.bones[n]
            if n in corr:
                sp = G @ unscaled(W @ src_arm.pose.bones[names[n]].matrix)
                rot = (sp.to_3x3() @ corr[n]).to_4x4()
                loc = rest[n].translation + (sp.translation - hipRest) * hipScale if b.parent is None else None
            else:
                rot = None
            parentP = P[b.parent.name] if b.parent else Matrix.Identity(4)
            parentR = rest[b.parent.name] if b.parent else Matrix.Identity(4)
            if rot is None:  # no source bone: keep the rest pose under the parent
                P[n] = parentP @ parentR.inverted() @ rest[n]; continue
            if loc is None:  # children ride their parent; only the hips translate
                loc = (parentP @ parentR.inverted() @ rest[n]).translation
            rot.translation = loc
            P[n] = rot
            basis = rest[n].inverted() @ parentR @ parentP.inverted() @ P[n]
            pb = arm.pose.bones[n]
            pb.matrix_basis = basis
            pb.keyframe_insert('rotation_quaternion', frame=f - f0, group=n)
            if b.parent is None: pb.keyframe_insert('location', frame=f - f0, group=n)
    track = arm.animation_data.nla_tracks.new(); track.name = name
    track.strips.new(name, 0, act); arm.animation_data.action = None
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.actions.remove(sact)
    print('CLIP', name, f1 - f0 + 1)
for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1)
print('DONE', out)
