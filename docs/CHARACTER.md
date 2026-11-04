# Character pipeline

The stage loads one file: `public/assets/roach/roach.glb` — a skinned character with a Mixamo-named skeleton, its animation clips, and six free face pieces (antennae, eyes, mandibles) that the runtime hangs on the head bone. This is how that file is made, so you can rebuild it or make your own character.

Tools: [Tripo CLI](https://www.npmjs.com/package/tripo-cli) (`npm i -g tripo-cli`, `tripo login`), Blender 4+ (`blender` below; on macOS `/Applications/Blender.app/Contents/MacOS/Blender`), a fal.ai key in `.env` (`FAL_KEY`), and `npx @gltf-transform/cli`.

## 1. Model (Tripo)

Lessons that save time later:

- **Neutral face.** Expressions come from the face pieces; a frown baked into the mesh stays forever.
- **Two arms, two legs.** Extra limbs do not fit a human skeleton.
- **Long arms, clearly separated fingers, A-pose, plain background.**
- **Generate parts.** Antennae, eyes and mandibles then come as separate meshes the runtime can move (talking, blinking, mood). Note: in Tripo's content filter, words like "no clothes" are rejected; say "just the insect with its natural shell".

```bash
export TRIPO_CLIENT_APP=claude   # or your own client name
tripo generate text-to-image "An anthropomorphic cartoon cockroach character standing upright … A-pose …" -p template=t_pose
tripo make concept.png --model H3.1 -p generate_parts=true          # parts disable texturing …
tripo files upload concept.png                                      # … so texture after, guided by the concept
tripo model texture <model_task> -p texture_quality=detailed -p 'texture_prompt={"image":"<file_token>"}'
tripo anim check <texture_task>                                     # free: riggable? which rig type?
tripo anim rig <texture_task> --model rig-v3.0 --rig-type biped --spec mixamo --out-format glb
```

## 2. Prepare (Blender)

`art/scripts/prep_roach.py` decimates the rigged model (≈1.4 M → 120 k triangles), turns the face parts into plain meshes with their origin at their hinge (mandible hinge, eye centre, antenna base) and names them `antennaL/R`, `eyeL/R`, `mandibleL/R`. The Tripo part numbers of the face pieces are listed in `FACE_PARTS`; check yours in a render first.

```bash
blender -b --python art/scripts/prep_roach.py -- tripo-out/rig-…/model.glb art/roach/roach_rig.glb
```

`art/roach/roach_rig.glb` (in the repository) is the result for the bundled cockroach.

## 3. Clips (fal.ai Hunyuan Motion)

Each clip is a text prompt; the result is an FBX on a SMPL-H skeleton (fingers included), about $0.08 each.

```bash
node --env-file=.env art/scripts/motion.mjs knead 6 "A person holds a soft ball in front of the chest with both hands and squeezes and kneads it, fingers opening and closing, elbows bent."
```

Clips land in `art/motion/`. The runtime expects these names (missing ones simply do not play): `idle talk cheer wave stomp yell beg shock laugh stop point stretch knead knead2 knead3 pour_bottle water foam sprinkle egg bucket dance_twist dance_cabbage dance_chicken dance_runningman dance_kongo dance_osman`.

Prompt tips: say "standing in place" (the runtime removes travel, but steps forward still look odd behind a table); describe the body, not objects ("holds a bottle" works, "kneads slime" does not).

## 4. Bake and compress

`art/scripts/bake_character.py` retargets every FBX in the given folders onto the character: it poses our skeleton into the clip's rest pose bone by bone (direction and the hand's knuckle line, so palms face the right way), keeps the per-bone correction, and bakes every frame. It reads Hunyuan (SMPL-H) and Mixamo FBX alike.

```bash
blender -b --python art/scripts/bake_character.py -- art/roach/roach_rig.glb art/motion art/roach/roach_baked.glb 2048
npx @gltf-transform/cli optimize art/roach/roach_baked.glb public/assets/roach/roach.glb \
  --compress false --join false --flatten false --instance false --palette false \
  --texture-compress webp --texture-size 2048 --simplify false
```

Keep `--compress false` and `--join false`: position quantisation breaks multi-part skinned meshes in three.js, and joining merges the face pieces into one mesh.

## 5. Check

`npm run build && npm start`, open `/overlay`. In the browser console, `window.__slime.stage.dayi` is the character (`.face`, `.actions`). Tune the size and height in `src/web/scene/dayi-rig.ts` (`SCALE`, `LIFT`, or `?dscale=…&dlift=…` in the URL).
