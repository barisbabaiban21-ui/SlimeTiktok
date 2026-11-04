/**
 * Tiny signed-distance kit plus a surface-nets mesher. Pure math, no three.js,
 * so the character can be baked in Node at build time and shipped as plain buffers.
 */
export type SDF = (x: number, y: number, z: number) => number;
export type Vec3 = [number, number, number];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

export const sphere = (c: Vec3, r: number): SDF => (x, y, z) => len3(x - c[0], y - c[1], z - c[2]) - r;
/** Inigo Quilez's bound-corrected ellipsoid approximation. */
export const ellipsoid = (c: Vec3, r: Vec3): SDF => (x, y, z) => {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const k0 = len3(px / r[0], py / r[1], pz / r[2]), k1 = len3(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
  return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
};
export const capsule = (a: Vec3, b: Vec3, r: number): SDF => {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], dd = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = clamp((pax * bax + pay * bay + paz * baz) / dd, 0, 1);
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  };
};
/** Capsule whose radius varies from ra at a to rb at b. */
export const roundCone = (a: Vec3, b: Vec3, ra: number, rb: number): SDF => {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], dd = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = clamp((pax * bax + pay * bay + paz * baz) / dd, 0, 1);
    return len3(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
  };
};
export const roundBox = (c: Vec3, half: Vec3, r: number): SDF => (x, y, z) => {
  const qx = Math.abs(x - c[0]) - half[0] + r, qy = Math.abs(y - c[1]) - half[1] + r, qz = Math.abs(z - c[2]) - half[2] + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
/** Tapered tube through a polyline of points with per-point radius. */
export const tube = (pts: Vec3[], radii: number[], k = 0.01): SDF => {
  const segs = pts.slice(1).map((p, i) => roundCone(pts[i]!, p, radii[i]!, radii[i + 1]!));
  return (x, y, z) => { let d = segs[0]!(x, y, z); for (let i = 1; i < segs.length; i++) d = smin(d, segs[i]!(x, y, z), k); return d; };
};
export const plane = (n: Vec3, d: number): SDF => (x, y, z) => x * n[0] + y * n[1] + z * n[2] + d;

/** Polynomial smooth minimum: blends two surfaces with a fillet of size k. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
export const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k);
export const union = (k: number, ...fs: SDF[]): SDF => (x, y, z) => { let d = fs[0]!(x, y, z); for (let i = 1; i < fs.length; i++) d = smin(d, fs[i]!(x, y, z), k); return d; };
export const subtract = (a: SDF, b: SDF, k: number): SDF => (x, y, z) => smax(a(x, y, z), -b(x, y, z), k);
export const intersect = (a: SDF, b: SDF, k: number): SDF => (x, y, z) => smax(a(x, y, z), b(x, y, z), k);
export const mirrorX = (f: SDF): SDF => (x, y, z) => f(Math.abs(x), y, z);
export const offset = (f: SDF, d: number): SDF => (x, y, z) => f(x, y, z) - d;
/** Cheap value noise for organic detail. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const h = (a: number, b: number, c: number) => { let n = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const s = (t: number) => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), u), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), u), v),
    l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), u), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), u), v), w);
}

export interface MeshData { positions: Float32Array; normals: Float32Array; colors: Float32Array; uvs: Float32Array; index: Uint32Array }
export interface MeshOptions {
  min: Vec3; max: Vec3; cell: number;
  color?: (p: Vec3, n: Vec3) => Vec3;
  uv?: (p: Vec3, n: Vec3) => [number, number];
}

/**
 * Naive surface nets: one vertex per sign-changing cell, quads across sign-changing edges.
 * Vertices are then projected onto the true surface and get analytic gradient normals,
 * which is what makes the result read as a sculpted, seamless skin.
 */
export function mesh(f: SDF, o: MeshOptions): MeshData {
  const h = o.cell;
  const nx = Math.ceil((o.max[0] - o.min[0]) / h) + 1, ny = Math.ceil((o.max[1] - o.min[1]) / h) + 1, nz = Math.ceil((o.max[2] - o.min[2]) / h) + 1;
  const field = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    field[at(i, j, k)] = f(o.min[0] + i * h, o.min[1] + j * h, o.min[2] + k * h);
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] as const;
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const cc = corner[c]!; v[c] = field[at(i + cc[0], j + cc[1], k + cc[2])]!; if (v[c]! < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = v[a]!, vb = v[b]!;
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb), ca = corner[a]!, cb = corner[b]!;
      sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
    }
    cellVert[cat(i, j, k)] = pos.length / 3;
    pos.push(o.min[0] + (i + sx / n) * h, o.min[1] + (j + sy / n) * h, o.min[2] + (k + sz / n) * h);
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = field[at(i, j, k)]! < 0;
    if (i < nx - 1 && inside !== (field[at(i + 1, j, k)]! < 0))
      quad(cellVert[cat(i, j - 1, k - 1)]!, cellVert[cat(i, j, k - 1)]!, cellVert[cat(i, j, k)]!, cellVert[cat(i, j - 1, k)]!, !inside);
    if (j < ny - 1 && inside !== (field[at(i, j + 1, k)]! < 0))
      quad(cellVert[cat(i - 1, j, k - 1)]!, cellVert[cat(i - 1, j, k)]!, cellVert[cat(i, j, k)]!, cellVert[cat(i, j, k - 1)]!, !inside);
    if (k < nz - 1 && inside !== (field[at(i, j, k + 1)]! < 0))
      quad(cellVert[cat(i - 1, j - 1, k)]!, cellVert[cat(i, j - 1, k)]!, cellVert[cat(i, j, k)]!, cellVert[cat(i - 1, j, k)]!, !inside);
  }
  // Project onto the surface and take the gradient as the normal.
  const count = pos.length / 3, positions = new Float32Array(pos), normals = new Float32Array(count * 3);
  const e = h * 0.25, g: Vec3 = [0, 0, 0];
  const grad = (x: number, y: number, z: number) => {
    g[0] = f(x + e, y, z) - f(x - e, y, z); g[1] = f(x, y + e, z) - f(x, y - e, z); g[2] = f(x, y, z + e) - f(x, y, z - e);
    const l = len3(g[0], g[1], g[2]) || 1; g[0] /= l; g[1] /= l; g[2] /= l;
  };
  for (let q = 0; q < count; q++) {
    let x = positions[q * 3]!, y = positions[q * 3 + 1]!, z = positions[q * 3 + 2]!;
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z); if (Math.abs(d) < 1e-5) break;
      grad(x, y, z); const step = clamp(d, -h, h);
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step;
    }
    positions[q * 3] = x; positions[q * 3 + 1] = y; positions[q * 3 + 2] = z;
    grad(x, y, z); normals[q * 3] = g[0]; normals[q * 3 + 1] = g[1]; normals[q * 3 + 2] = g[2];
  }
  const colors = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  for (let q = 0; q < count; q++) {
    const p: Vec3 = [positions[q * 3]!, positions[q * 3 + 1]!, positions[q * 3 + 2]!], n: Vec3 = [normals[q * 3]!, normals[q * 3 + 1]!, normals[q * 3 + 2]!];
    const c: Vec3 = o.color ? o.color(p, n) : [1, 1, 1];
    colors[q * 3] = c[0]; colors[q * 3 + 1] = c[1]; colors[q * 3 + 2] = c[2];
    if (o.uv) { const t = o.uv(p, n); uvs[q * 2] = t[0]; uvs[q * 2 + 1] = t[1]; }
  }
  return { positions, normals, colors, uvs, index: new Uint32Array(idx) };
}

export const hex = (s: string): Vec3 => {
  const n = parseInt(s.replace('#', ''), 16);
  // sRGB → linear, so vertex colours match three.js colour management.
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
};
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => { const u = clamp(t, 0, 1); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; };
export const smoothstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
