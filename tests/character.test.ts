import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesh, sphere, smin, union } from '../src/shared/character/sdf.js';
import { bakeDayi, pack, headSDF, MOUTH, EYE } from '../src/shared/character/dayi-model.js';

test('surface nets put vertices on the surface with outward normals and matching winding', () => {
  const m = mesh(sphere([0, 0, 0], 0.1), { min: [-0.15, -0.15, -0.15], max: [0.15, 0.15, 0.15], cell: 0.01 });
  assert.ok(m.index.length > 300);
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
    assert.ok(Math.abs(Math.hypot(x, y, z) - 0.1) < 1e-3, 'vertex projected onto the surface');
    assert.ok(x * m.normals[i]! + y * m.normals[i + 1]! + z * m.normals[i + 2]! > 0, 'normal points outward');
  }
  let agree = 0;
  for (let t = 0; t < m.index.length; t += 3) {
    const [a, b, c] = [m.index[t]!, m.index[t + 1]!, m.index[t + 2]!].map(v => v * 3) as [number, number, number];
    const p = (k: number, o: number) => m.positions[k + o]!;
    const ux = p(b, 0) - p(a, 0), uy = p(b, 1) - p(a, 1), uz = p(b, 2) - p(a, 2), vx = p(c, 0) - p(a, 0), vy = p(c, 1) - p(a, 1), vz = p(c, 2) - p(a, 2);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * m.normals[a]! + ny * m.normals[a + 1]! + nz * m.normals[a + 2]! > 0) agree++;
  }
  assert.ok(agree / (m.index.length / 3) > 0.99, 'triangles face the same way as the normals');
});
test('smooth union fillets instead of creasing', () => {
  const a = sphere([-0.05, 0, 0], 0.06), b = sphere([0.05, 0, 0], 0.06);
  assert.ok(union(0.04, a, b)(0, 0.06, 0) < Math.min(a(0, 0.06, 0), b(0, 0.06, 0)));
  assert.equal(smin(1, 2, 0), 1);
});
test('the head has an open mouth slit, eye sockets in front of the eyes and a closed skull', () => {
  assert.ok(headSDF(0, MOUTH.y, MOUTH.z + 0.005) > 0, 'mouth slit is carved');
  assert.ok(headSDF(0, MOUTH.y + 0.03, MOUTH.z - 0.03) < 0, 'upper lip is solid');
  assert.ok(headSDF(EYE.x, EYE.y, EYE.z + EYE.r * 0.5) > 0, 'socket leaves room for the eyeball');
  assert.ok(headSDF(0, 0, 0) < 0 && headSDF(0, 0.5, 0) > 0);
});
test('a coarse bake produces every rigged part and packs into one buffer', () => {
  const baked = bakeDayi(3);
  const names = baked.parts.map(p => p.name);
  for (const n of ['head', 'hair', 'mustache', 'browL', 'browR', 'cap', 'shirt', 'vest', 'collar', 'sleeve', 'forearm', 'handL', 'handR']) assert.ok(names.includes(n), n);
  for (const p of baked.parts) assert.ok(p.data.index.length > 0, `${p.name} has triangles`);
  assert.equal(baked.buttons.length, 5);
  const { buffer, manifest } = pack(baked);
  assert.ok(buffer.byteLength > 0 && (manifest as { parts: unknown[] }).parts.length === names.length);
});
