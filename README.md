# SlimeTiktok

An interactive TikTok LIVE game: viewers grow an endless slime with their gifts, likes and chat, and a talking 3D cockroach makes it in front of them.

Every gift becomes an ingredient (glue, foam, glitter, borax, water…). The cockroach pours it from a real bottle in his fist, kneads the slime, thanks the sender by name and reacts in his own voice. Water makes the slime runny and makes him angry — at the peak the picture turns black and white and slow, and his voice slows down like a stretched tape. Between gifts the stream never goes quiet: dance breaks with their own music and a mirror ball, chat dance votes, like races, chat challenges, a fastest-finger game, glitter rain, golden slime and a fake power cut.

The game is server-authoritative: one Node process owns the state; the browser page only draws it (Three.js), so it can be captured by TikTok LIVE Studio or OBS. A small bridge reads the LIVE room (gifts, likes, chat, joins) and sends signed events to the server.

> Turkish step-by-step guide: [docs/KULLANIM.md](docs/KULLANIM.md)

## Features

- **Real-time 3D stage** (Three.js, WebGL): workshop backdrop (HDRI), shelves of slime jars, depth of field, bloom, 1080×1920.
- **Simulated slime**: a yield-stress (Bingham) thin film in a pan; pours pile up and spread, consistency is visible.
- **Rigged character** with 31 retargeted clips; separate mandibles (lip sync), eyes (blinks, shock) and antennae (mood).
- **Voice** through any TTS provider (default: xAI via fal), cached on disk, with a daily spend cap; captions always work.
- **Show director**: timed events, dance tracks, camera dollies, rage slow motion, titles for regulars ("Su Teröristi", "Hızlı Parmak").
- **Operator panel** (`/admin`): start/pause/emergency stop, gift → ingredient rules, voice and chat settings, live event log.
- **Safety**: signed ingest (HMAC), rate limits, chat filtering, the stream starts locked until the operator presses Start.

## Quick start (demo, no TikTok needed)

Requirements: Node.js 22.16+ (see `.nvmrc`), npm. Optional: Blender 4+ and a fal.ai key for the character pipeline.

```bash
git clone https://github.com/oguzhankayan/SlimeTiktok.git
cd SlimeTiktok
npm ci && (cd bridges && npm install --omit=dev)
npm run setup        # writes .env with fresh ADMIN_TOKEN and WEBHOOK_SECRET
npm run build
npm start            # demo mode: fake viewers send gifts
```

Open http://localhost:3000/overlay (the stream picture; add `?audio=1` and click once for sound) and http://localhost:3000/admin (sign in with `ADMIN_TOKEN` from `.env`).

Voice is off until you set a provider in `.env` — for example, with a fal.ai key:

```text
TTS_PROVIDER=fal
TTS_MODEL=xai/tts/v1
TTS_VOICE=sirius
FAL_KEY=your-fal-key
```

## Going live

1. Create `.env.live` (it overrides `.env`; never committed):
   ```text
   MODE=live
   DATA_DIR=./data-live
   FORWARD_CHAT=true
   TIKTOK_USERNAME=your_tiktok_username
   CONNECTOR_LICENSE_ACK=true
   BRIDGE_PROVIDER=tiktok
   ```
2. `npm run live` — the game server, locked until you press Start.
3. Capture `http://localhost:PORT/overlay?audio=1` in TikTok LIVE Studio (browser/link source or window capture, 1080×1920), and start your LIVE.
4. `npm run bridge:live` — connects to your room; wait for `connected`.
5. In `/admin`, press **Start**.

Details, gift mapping and troubleshooting: [docs/CANLI_YAYIN.md](docs/CANLI_YAYIN.md), [docs/HEDIYE_ESLEME.md](docs/HEDIYE_ESLEME.md), [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Customising

| What | Where |
|---|---|
| Lines he says (catchphrases, welcomes, rage, shows) | `src/server/dialogue.ts` |
| Shows, their frequency and length | `src/server/service.ts` (`shows()`) |
| Gift → ingredient rules | Admin panel, or defaults in `src/shared/validation.ts` |
| Background and dance music (optional, not in the repo) | `public/assets/music/` — see [docs/KULLANIM.md](docs/KULLANIM.md#müzik) |
| Character model and clips | [docs/CHARACTER.md](docs/CHARACTER.md) |
| Lights, camera, stage | `src/web/scene/` |

## Project layout

```text
src/server/      game server: HTTP, SSE, ingest, dialogue director, voice cache
src/shared/      game engine (pure, tested), types, validation
src/web/         overlay and admin page; scene/ holds the Three.js stage
bridges/         TikTok LIVE / TikFinity bridges (separate process)
art/             character production scripts (Blender, fal)
public/assets/   models, props, HDRI (music is optional and git-ignored)
tests/           node:test suites (engine, service, scenarios, HTTP load, bridge)
docs/            guides
```

## Tests

```bash
npm test          # build + 72 game tests + 8 bridge tests
npm run soak      # long-running memory / FPS-free soak of the engine
```

## Licence

MIT for this repository's code — see [LICENSE](LICENSE). Bundled assets and optional dependencies have their own terms (Poly Haven CC0 props and HDRI, a Tripo-generated character, AGPL TikTok connector in the bridge): see [THIRD_PARTY.md](THIRD_PARTY.md). This project is not affiliated with or endorsed by TikTok.
