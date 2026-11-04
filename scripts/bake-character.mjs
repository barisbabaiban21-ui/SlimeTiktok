// Bakes the SDF character into static buffers, then decimates each part with meshoptimizer
// so a CPU-only broadcaster can draw it. Runs after tsc in `npm run build`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
import { bakeDayi, pack } from '../dist/src/shared/character/dayi-model.js';
const scale = Number(process.env.BAKE_CELL_SCALE ?? 1);
const TARGET = { head: 60000, hair: 10000, mustache: 14000, browL: 3000, browR: 3000, cap: 14000, shirt: 14000, vest: 18000, collar: 4000, sleeve: 6000, forearm: 5000, handL: 9000, handR: 9000 };
function decimate(parts, factor) {
  return parts.map(part => {
    const d = part.data, count = d.positions.length / 3, target = Math.round((TARGET[part.name] ?? 10000) * factor) * 3;
    if (d.index.length <= target) return part;
    // Normals and colours guide the collapse so creases, lips and stubble edges survive.
    const attrs = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      attrs.set(d.normals.subarray(i * 3, i * 3 + 3), i * 8); attrs.set(d.colors.subarray(i * 3, i * 3 + 3), i * 8 + 3); attrs.set(d.uvs.subarray(i * 2, i * 2 + 2), i * 8 + 6);
    }
    const [index] = MeshoptSimplifier.simplifyWithAttributes(d.index, d.positions, 3, attrs, 8, [0.6, 0.6, 0.6, 2, 2, 2, 0.5, 0.5], null, target, factor < 1 ? 0.004 : 0.0012, ['ErrorAbsolute']);
    const [remap, unique] = MeshoptSimplifier.compactMesh(index);
    const pick = (src, n) => { const out = new Float32Array(unique * n); for (let i = 0; i < count; i++) { const r = remap[i]; if (r !== 0xffffffff && r < unique) for (let k = 0; k < n; k++) out[r * n + k] = src[i * n + k]; } return out; };
    return { name: part.name, data: { positions: pick(d.positions, 3), normals: pick(d.normals, 3), colors: pick(d.colors, 3), uvs: pick(d.uvs, 2), index } };
  });
}
const started = performance.now();
await MeshoptSimplifier.ready;
const baked = bakeDayi(scale);
mkdirSync('dist/public/models', { recursive: true });
// Two levels of detail: full for GPU/OBS, a quarter for the CPU-only broadcaster.
for (const [suffix, factor] of [['', 1], ['-low', Number(process.env.LOW_LOD ?? 0.25)]]) {
  const { manifest, buffer } = pack({ ...baked, parts: decimate(baked.parts, factor) });
  writeFileSync(`dist/public/models/dayi${suffix}.bin`, buffer);
  writeFileSync(`dist/public/models/dayi${suffix}.json`, JSON.stringify(manifest));
  const tris = manifest.parts.reduce((a, p) => a + p.index[1] / 3, 0);
  console.log(`Baked character${suffix}: ${manifest.parts.length} parts, ${Math.round(tris).toLocaleString()} triangles, ${(buffer.byteLength / 1e6).toFixed(1)} MB, ${((performance.now() - started) / 1000).toFixed(1)} s.`);
}
