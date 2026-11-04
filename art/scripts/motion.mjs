// Text-to-motion clips from fal.ai Hunyuan Motion, saved as FBX for bake_character.py.
// node --env-file=.env art/scripts/motion.mjs <name> <seconds> "<prompt>" [seed]
import { writeFile, mkdir } from 'node:fs/promises';
const [name, seconds, prompt, seed] = process.argv.slice(2);
if (!process.env.FAL_KEY) throw new Error('FAL_KEY missing in .env');
const body = { prompt, duration: Number(seconds), guidance_scale: 6, output_format: 'fbx', ...(seed ? { seed: Number(seed) } : {}) };
const res = await fetch('https://fal.run/fal-ai/hunyuan-motion', { method: 'POST', headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const out = await res.json();
const fbx = await fetch(out.fbx_file.url).then(r => r.arrayBuffer());
await mkdir('art/motion', { recursive: true });
await writeFile(`art/motion/${name}.fbx`, Buffer.from(fbx));
console.log(JSON.stringify({ name, seed: out.seed, bytes: fbx.byteLength }));
