# Third-party components

The game logic, the Three.js scene, the character pipeline scripts, canvas textures and synthesized sound effects were written for this repository and are released under the MIT licence (see `LICENSE`). No TikTok gift art or other extracted proprietary assets are included. This project is not affiliated with or endorsed by TikTok.

Core runtime uses Node's built-in HTTP, crypto and SQLite modules. Development dependencies are TypeScript 5.8.3 (Apache-2.0), @types/node 22.19.7 (MIT), undici-types 6.21.0 (MIT), three 0.187.0 (MIT, bundled into the browser build, its notice is emitted to `dist/public/web/app.js.LEGAL.txt`), @types/three 0.187.0 (MIT), esbuild 0.28.2 (MIT, build only) and meshoptimizer 1.3.0 (MIT, build only). Their upstream license notices remain in installed packages. Docker distributions also include their own notices.

## Scene assets (CC0)

The workshop photo `public/assets/env/carpentry_shop_02_2k.hdr` and the shelf props in `public/assets/props/` (Shelf_01, bleach_bottle, multi_cleaner_bottle, spray_paint_bottles, jug_01, can_rusted, plastic_bottle_gallon, adjustable_wrench, wooden_bucket_01, wall_clock) come from Poly Haven (https://polyhaven.com) under CC0 1.0; the props were re-encoded with meshopt and 1024 px WebP textures.

## Character (cockroach)

`public/assets/roach/roach.glb` and `art/roach/roach_rig.glb`: the model (generated with Tripo, tripo3d.ai: text-to-image concept, image-to-model with part generation, texture and auto-rig) belongs to the repository owner, who made it on a paid Tripo account and releases it with this repository under the MIT licence. Check Tripo's current terms if you generate your own.

All 31 animation clips baked into `roach.glb` were generated with Tencent Hunyuan Motion on fal.ai (`fal-ai/hunyuan-motion`) and retargeted with `art/scripts/bake_character.py`. No Adobe Mixamo animation is included; the pipeline can bake Mixamo clips you download yourself, but those must stay under Mixamo's terms (do not redistribute them as files). Check fal's and Hunyuan Motion's terms for clips you generate.

`art/roach/concepts.png`: concept sheet generated with Tripo's text-to-image.

## Music

No music is included. `public/assets/music/` is git-ignored; put your own licensed or royalty-free tracks there (see `docs/KULLANIM.md`).

## Optional TikTok bridge — review before enabling

`tiktok-live-connector` 2.5.0 upstream package declares **AGPL-3.0-only**; its README describes modified AGPL licensing. Do not assume older MIT licensing applies. Inspect the precise distributed LICENSE and commercial/modified terms from the maintainer before use, redistribution, offering hosted access, or integrating it into a closed-source business.

Sources checked 2026-10-22:
- https://github.com/zerodytrash/TikTok-Live-Connector/blob/master/package.json
- https://github.com/zerodytrash/TikTok-Live-Connector
- https://ttlc.docs.isaackogan.com/

`CONNECTOR_LICENSE_ACK=true` is an operator acknowledgement, not a waiver or a substitute for complying with the actual license. Keeping the bridge in a separate process does not by itself guarantee that copyleft obligations are avoided. Provider signing API plans, keys, uptime and permissions are separate and may cost money. No paid service is activated by demo mode.

TikFinity is an external service/application, not bundled source. Its own terms apply. The generic signed webhook interface can also be used by an authorized provider without installing this optional connector. Neither route is represented as official TikTok approval.

The optional broadcaster uses Chromium, FFmpeg, Xvfb, Liberation fonts and distribution libraries with their respective upstream licenses. Retain notices and review redistribution obligations when shipping images. No font files are supplied as user downloads.
