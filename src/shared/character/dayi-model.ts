import { capsule, ellipsoid, hex, mesh, mirrorX, mix3, noise3, offset, roundBox, roundCone, smax, smin, smoothstep, sphere, subtract, tube, union } from './sdf.js';
import type { MeshData, SDF, Vec3 } from './sdf.js';

/**
 * Cıvık Dayı, sculpted as signed distance fields. Every part is one continuous surface
 * with fillets, so cheeks melt into jowls and the neck, with no primitive seams.
 * Head-local space: origin at the centre of the skull, +z faces the camera, metres.
 */
export const MOUTH = { y: -0.112, z: 0.232, halfWidth: 0.066, pivot: [0, -0.02, -0.03] as Vec3 };
export const EYE = { x: 0.088, y: 0.042, z: 0.206, r: 0.043 };
export const HEAD_POS: Vec3 = [0, 2.08, 0.02];

const rotX = (f: SDF, a: number, c: Vec3 = [0, 0, 0]): SDF => {
  const ca = Math.cos(a), sa = Math.sin(a);
  return (x, y, z) => { const py = y - c[1], pz = z - c[2]; return f(x, c[1] + py * ca - pz * sa, c[2] + py * sa + pz * ca); };
};
const rotZ = (f: SDF, a: number, c: Vec3 = [0, 0, 0]): SDF => {
  const ca = Math.cos(a), sa = Math.sin(a);
  return (x, y, z) => { const px = x - c[0], py = y - c[1]; return f(c[0] + px * ca - py * sa, c[1] + px * sa + py * ca, z); };
};

// ---------- Head ----------
const cranium = ellipsoid([0, 0.045, -0.005], [0.245, 0.268, 0.25]);
const skullFace = union(0.07,
  cranium,
  ellipsoid([0, -0.1, 0.04], [0.215, 0.2, 0.2]), // lower face mass
  mirrorX(ellipsoid([0.118, -0.135, 0.07], [0.135, 0.12, 0.14])), // jowls
  mirrorX(sphere([0.125, -0.035, 0.155], 0.085)), // cheeks
  ellipsoid([0, -0.215, 0.118], [0.112, 0.078, 0.102]), // chin
  mirrorX(ellipsoid([0.105, -0.2, 0.1], [0.07, 0.06, 0.08])), // jaw corners
  ellipsoid([0, -0.265, 0.035], [0.165, 0.085, 0.15]), // double chin
  roundCone([0, -0.24, -0.04], [0, -0.48, -0.05], 0.15, 0.16) // neck
);
const browRidge = capsule([-0.115, 0.098, 0.208], [0.115, 0.098, 0.208], 0.034);
const nose = union(0.025,
  capsule([0, 0.07, 0.226], [0, -0.005, 0.262], 0.03), // bridge
  sphere([0, -0.03, 0.277], 0.064), // bulb
  mirrorX(sphere([0.043, -0.057, 0.25], 0.036)) // alae
);
const nostrils = mirrorX(ellipsoid([0.025, -0.079, 0.262], [0.013, 0.008, 0.013]));
const ears = mirrorX(subtract(
  rotZ(ellipsoid([0.244, 0.0, -0.015], [0.032, 0.072, 0.05]), -0.12, [0.244, 0, 0]),
  ellipsoid([0.262, 0.0, -0.005], [0.014, 0.046, 0.032]), 0.012));
const lips = union(0.012,
  ellipsoid([0, MOUTH.y + 0.017, MOUTH.z - 0.008], [0.068, 0.024, 0.036]),
  ellipsoid([0, MOUTH.y - 0.019, MOUTH.z - 0.012], [0.062, 0.026, 0.035]));
const eyeSockets = mirrorX(sphere([EYE.x, EYE.y, EYE.z + 0.004], EYE.r + 0.007));
const eyeBags = mirrorX(ellipsoid([EYE.x + 0.004, EYE.y - 0.05, EYE.z + 0.012], [0.04, 0.016, 0.02]));
/** Nasolabial folds: soft creases from the nose wings to past the mouth corners. */
const smileLines = mirrorX(capsule([0.068, -0.045, 0.245], [0.112, -0.135, 0.205], 0.005));
const mouthSlit = ellipsoid([0, MOUTH.y, MOUTH.z + 0.02], [MOUTH.halfWidth, 0.0045, 0.06]);
const mouthCavity = ellipsoid([0, MOUTH.y - 0.01, 0.15], [0.07, 0.045, 0.075]);
const tongue = ellipsoid([0, MOUTH.y - 0.042, 0.17], [0.045, 0.018, 0.05]);
export const headSDF: SDF = (x, y, z) => {
  let d = skullFace(x, y, z);
  d = smin(d, browRidge(x, y, z), 0.05);
  d = smin(d, nose(x, y, z), 0.03);
  d = smin(d, ears(x, y, z), 0.025);
  d = smin(d, lips(x, y, z), 0.022);
  d = smin(d, eyeBags(x, y, z), 0.014);
  d = smax(d, -eyeSockets(x, y, z), 0.016);
  d = smax(d, -smileLines(x, y, z), 0.018);
  d = smax(d, -capsule([0, -0.215, 0.215], [0, -0.245, 0.2], 0.004)(x, y, z), 0.012); // chin cleft
  d = smax(d, -nostrils(x, y, z), 0.008);
  d = smax(d, -mouthSlit(x, y, z), 0.006);
  d = smax(d, -mouthCavity(x, y, z), 0.006);
  return Math.min(d, tongue(x, y, z));
};

// ---------- Hair: walrus moustache, arched brows, grey side hair ----------
const mustache = union(0.024,
  ellipsoid([0, -0.076, 0.272], [0.05, 0.027, 0.034]),
  mirrorX(tube([[0.02, -0.074, 0.276], [0.066, -0.088, 0.266], [0.108, -0.108, 0.24], [0.134, -0.136, 0.205], [0.142, -0.166, 0.182]], [0.034, 0.034, 0.026, 0.017, 0.009], 0.02)));
/** One brow, on the character's left (x > 0). The right one is mirrored at bake. */
export const BROW_CENTER: Vec3 = [0.1, 0.116, 0.232];
const brow = tube([[0.038, 0.106, 0.243], [0.085, 0.124, 0.238], [0.135, 0.118, 0.214], [0.166, 0.1, 0.18]], [0.017, 0.023, 0.019, 0.01], 0.012);
const brows = mirrorX(brow);
const sideHair: SDF = (x, y, z) => {
  const shell = smax(offset(cranium, 0.007 + 0.004 * noise3(x * 60, y * 60, z * 60))(x, y, z), -offset(cranium, -0.01)(x, y, z), 0.004);
  const band = smax(y - 0.115 + 0.08 * Math.max(0, -z), -0.07 - y, 0.03);
  const behind = z - 0.04 + Math.abs(y) * 0.25;
  const earGap = -ellipsoid([0.244, 0.0, -0.015], [0.05, 0.085, 0.065])(Math.abs(x), y, z);
  return smax(smax(smax(shell, band, 0.02), behind, 0.02), earGap, 0.01);
};
export const hairSDF: SDF = (x, y, z) => Math.min(mustache(x, y, z), brows(x, y, z), sideHair(x, y, z));
export const mustacheSDF = mustache, sideHairSDF = sideHair;
export const browSDF = (side: 1 | -1): SDF => (x, y, z) => brow(x * side, y, z);

// ---------- Flat cap (kasket) ----------
const capShell = offset(ellipsoid([0, 0.05, -0.005], [0.245, 0.268, 0.25]), 0.02);
export const capSDF: SDF = (x, y, z) => {
  const cut = 0.1 + 0.26 * z; // lower at the back, up off the forehead at the front
  let d = smax(capShell(x, y, z), cut - y, 0.012);
  d = smax(d, y - 0.335, 0.05); // the flat top, just above the crown so the skull never pokes through
  d = smin(d, smax(ellipsoid([0, 0.228, 0.1], [0.235, 0.07, 0.205])(x, y, z), 0.155 - y, 0.02), 0.05); // front panel overhang
  // A stiff short peak that tips down over the brows, readable from the front.
  const brim = smax(rotX(ellipsoid([0, 0.17, 0.235], [0.205, 0.017, 0.14]), 0.28, [0, 0.17, 0.235])(x, y, z), 0.16 - z, 0.012);
  d = smin(d, brim, 0.02);
  return Math.min(d, sphere([0, 0.298, 0.04], 0.014)(x, y, z));
};

// ---------- Torso, vest, collar (root-local, world metres) ----------
export const torsoSDF: SDF = union(0.11,
  ellipsoid([0, 1.5, -0.01], [0.41, 0.26, 0.26]), // chest
  ellipsoid([0, 1.22, 0.06], [0.45, 0.34, 0.35]), // belly
  capsule([-0.35, 1.66, -0.02], [0.35, 1.66, -0.02], 0.13), // shoulders
  ellipsoid([0, 0.95, 0.0], [0.42, 0.24, 0.3]));
const vestOpening = (x: number, y: number, z: number) => Math.max(Math.abs(x) - (0.055 + Math.max(0, y - 1.18) * 0.42), -z - 0.05);
export const vestSDF: SDF = (x, y, z) => {
  const t = torsoSDF(x, y, z);
  let d = smax(t - 0.024, -(t - 0.004), 0.004);
  d = smax(d, -vestOpening(x, y, z), 0.006);
  d = smax(d, -sphere([0.45, 1.56, -0.01], 0.17)(Math.abs(x), y, z), 0.01); // armholes
  return smax(d, 0.8 - y, 0.01);
};
export const collarSDF: SDF = (x, y, z) => {
  const ring = smax(Math.abs(Math.hypot(x, (z + 0.015) * 1.1) - 0.15) - 0.018, Math.abs(y - 1.77) - 0.03, 0.012);
  const points = mirrorX(rotZ(roundBox([0.075, 1.735, 0.135], [0.045, 0.035, 0.012], 0.01), 0.5, [0.075, 1.735, 0.135]));
  return smin(ring, points(x, y, z), 0.015);
};

// ---------- Arms (each part local to its pivot, hanging along -y) ----------
export const sleeveSDF: SDF = union(0.04,
  sphere([0, 0, 0], 0.125),
  roundCone([0, 0, 0], [0, -0.39, 0], 0.118, 0.1),
  (x, y, z) => smax(Math.abs(Math.hypot(x, z) - 0.1) - 0.028, Math.abs(y + 0.405) - 0.03, 0.015)); // rolled cuff
export const forearmSDF: SDF = union(0.05,
  roundCone([0, 0.03, 0], [0, -0.41, 0], 0.088, 0.066),
  ellipsoid([0, -0.1, 0.012], [0.094, 0.13, 0.088]));
/** side: +1 for the left hand (thumb toward -x, the body centre), -1 for the right. */
export function handSDF(side: 1 | -1): SDF {
  const palm = roundBox([0, -0.075, 0.005], [0.054, 0.058, 0.026], 0.024);
  const fingers = [-0.036, -0.012, 0.012, 0.036].map((fx, i) => {
    const l = [0.9, 1.0, 0.97, 0.82][i]!;
    return tube([[fx, -0.12, 0.008], [fx * 1.05, -0.12 - 0.045 * l, 0.025], [fx * 1.08, -0.12 - 0.075 * l, 0.055]], [0.0165, 0.0155, 0.0135], 0.008);
  });
  const thumb = tube([[-0.048 * side, -0.05, 0.016], [-0.075 * side, -0.088, 0.04], [-0.07 * side, -0.114, 0.066]], [0.021, 0.018, 0.0155], 0.01);
  return (x, y, z) => {
    let d = smin(palm(x, y, z), roundCone([0, 0.02, 0], [0, -0.04, 0], 0.064, 0.058)(x, y, z), 0.03);
    for (const f of fingers) d = smin(d, f(x, y, z), 0.012);
    return smin(d, thumb(x, y, z), 0.018);
  };
}

// ---------- Colour ----------
const SKIN = hex('#d88a60'), SKIN_DEEP = hex('#bb6e4c'), NOSE = hex('#c24a37'), BLUSH = hex('#cf5a45');
const LIP = hex('#b65a52'), STUBBLE = hex('#8a7268'), MOUTH_IN = hex('#4a1416'), TONGUE = hex('#c75a5a');
const HAIR_DARK = hex('#2a2522'), HAIR_GREY = hex('#7d7772'), HAIR_MID = hex('#3d3632');
const near = (p: Vec3, c: Vec3, r: number) => 1 - smoothstep(0, r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));

/** Ambient occlusion from the distance field itself (IQ's five-tap method). */
function ao(f: SDF, p: Vec3, n: Vec3, step = 0.012): number {
  let occ = 0, w = 1;
  for (let i = 1; i <= 5; i++) {
    const h = step * i;
    occ += (h - f(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h)) * w; w *= 0.55;
  }
  return Math.max(0, Math.min(1, 1 - 3.2 * occ));
}
const shade = (c: Vec3, a: number, lo = 0.5): Vec3 => { const k = lo + (1 - lo) * a; return [c[0] * k, c[1] * k, c[2] * k]; };

/** Everything that occludes the head: cap and hair darken the skin beneath them. */
const headScene: SDF = (x, y, z) => Math.min(headSDF(x, y, z), capSDF(x, y, z), hairSDF(x, y, z));

function headColor(p: Vec3, n: Vec3): Vec3 {
  const [x, y, z] = p;
  if (mouthCavity(x, y, z) > -0.004 && mouthCavity(x, y, z) < 0.006 && z < MOUTH.z - 0.004) return MOUTH_IN;
  if (tongue(x, y, z) < 0.003) return TONGUE;
  let c = SKIN;
  c = mix3(c, SKIN_DEEP, smoothstep(-0.2, -0.36, y) * 0.5); // neck in shadow tone
  c = mix3(c, BLUSH, near([Math.abs(x), y, z], [0.13, -0.045, 0.2], 0.11) * 0.65);
  c = mix3(c, NOSE, near(p, [0, -0.035, 0.3], 0.11) * 0.62);
  c = mix3(c, BLUSH, near([Math.abs(x), y, z], [0.25, 0, -0.01], 0.07) * 0.5);
  // Five o'clock shadow: jaw and chin below the moustache line, never on the lips.
  const jaw = smoothstep(-0.085, -0.15, y) * smoothstep(0.04, 0.13, z + 0.06) * (1 - smoothstep(-0.29, -0.36, y));
  const lipZone = near(p, [0, MOUTH.y, MOUTH.z], 0.07);
  const grain = 0.65 + 0.35 * noise3(x * 420, y * 420, z * 420);
  c = mix3(c, STUBBLE, jaw * (1 - lipZone) * 0.55 * grain);
  c = mix3(c, LIP, smoothstep(0.022, 0.0, Math.abs(y - MOUTH.y) - 0.012) * smoothstep(MOUTH.halfWidth + 0.01, MOUTH.halfWidth - 0.015, Math.abs(x)) * smoothstep(MOUTH.z - 0.04, MOUTH.z - 0.005, z) * 0.75);
  return shade(c, ao(headScene, p, n), 0.45);
}
function hairColor(p: Vec3, n: Vec3): Vec3 {
  const [x, y, z] = p;
  // Fine strands combed outward from the centre, salt-and-pepper for a man his age.
  const strand = 0.6 * noise3(Math.abs(x) * 60, y * 700 + Math.abs(x) * 180, z * 60) + 0.4 * noise3(x * 25, y * 25, z * 25);
  const side = sideHair(x, y, z) < 0.003;
  const grey = side ? 0.45 + 0.5 * strand : smoothstep(0.55, 0.95, noise3(x * 40, y * 600, z * 40)) * 0.3;
  const c = mix3(mix3(HAIR_DARK, HAIR_MID, strand * 0.45), HAIR_GREY, grey);
  return shade(c, ao(headScene, p, n), 0.55);
}
function capColor(p: Vec3, n: Vec3): Vec3 {
  const [x, y, z] = p;
  const t = noise3(x * 700, y * 700, z * 700), herring = Math.abs(((x * 90 + Math.abs(z) * 30 + y * 40) % 2 + 2) % 2 - 1);
  const c = mix3(mix3(hex('#4e443b'), hex('#625647'), t * 0.7), hex('#6f6251'), herring * 0.35);
  return shade(c, ao(capSDF, p, n), 0.6);
}
const cylUV = (p: Vec3): [number, number] => [Math.atan2(p[0], p[2]) / (Math.PI * 2) + 0.5, p[1]];
const torsoScene: SDF = (x, y, z) => Math.min(torsoSDF(x, y, z), vestSDF(x, y, z), collarSDF(x, y, z));

export interface Part { name: string; data: MeshData }
export interface Baked { parts: Part[]; buttons: Vec3[] }

/** Bakes every part. cellScale > 1 trades detail for speed (tests, previews). */
export function bakeDayi(cellScale = 1): Baked {
  const c = (h: number) => h * cellScale;
  const parts: Part[] = [];
  const add = (name: string, data: MeshData) => parts.push({ name, data });
  add('head', mesh(headSDF, { min: [-0.3, -0.5, -0.3], max: [0.3, 0.34, 0.36], cell: c(0.0042), color: headColor }));
  add('hair', mesh(sideHairSDF, { min: [-0.27, -0.1, -0.28], max: [0.27, 0.17, 0.12], cell: c(0.0035), color: hairColor }));
  add('mustache', mesh(mustacheSDF, { min: [-0.18, -0.18, 0.15], max: [0.18, -0.03, 0.32], cell: c(0.0022), color: hairColor }));
  add('browL', mesh(browSDF(1), { min: [0.0, 0.07, 0.15], max: [0.2, 0.16, 0.28], cell: c(0.002), color: hairColor }));
  add('browR', mesh(browSDF(-1), { min: [-0.2, 0.07, 0.15], max: [0.0, 0.16, 0.28], cell: c(0.002), color: hairColor }));
  add('cap', mesh(capSDF, { min: [-0.31, 0.0, -0.31], max: [0.31, 0.38, 0.4], cell: c(0.0042), color: capColor }));
  add('shirt', mesh(torsoSDF, { min: [-0.62, 0.62, -0.42], max: [0.62, 1.86, 0.48], cell: c(0.009), uv: cylUV,
    color: (p, n) => shade([1, 1, 1], ao(torsoScene, p, n, 0.02), 0.55) }));
  add('vest', mesh(vestSDF, { min: [-0.62, 0.7, -0.42], max: [0.62, 1.86, 0.5], cell: c(0.006), uv: cylUV,
    color: (p, n) => shade([1, 1, 1], ao(torsoScene, p, n, 0.02), 0.6) }));
  add('collar', mesh(collarSDF, { min: [-0.24, 1.66, -0.22], max: [0.24, 1.84, 0.22], cell: c(0.004), color: (p, n) => shade(hex('#e6eef5'), ao(torsoScene, p, n, 0.01), 0.6) }));
  add('sleeve', mesh(sleeveSDF, { min: [-0.16, -0.46, -0.16], max: [0.16, 0.16, 0.16], cell: c(0.006), uv: cylUV, color: (p, n) => shade([1, 1, 1], ao(sleeveSDF, p, n), 0.6) }));
  add('forearm', mesh(forearmSDF, { min: [-0.12, -0.46, -0.12], max: [0.12, 0.08, 0.13], cell: c(0.005), color: (p, n) => shade(mix3(SKIN, BLUSH, smoothstep(-0.25, -0.4, p[1]) * 0.3), ao(forearmSDF, p, n), 0.6) }));
  for (const [name, side] of [['handL', 1], ['handR', -1]] as const) {
    const f = handSDF(side);
    add(name, mesh(f, { min: [-0.11, -0.22, -0.06], max: [0.11, 0.04, 0.11], cell: c(0.0028), color: (p, n) => shade(mix3(SKIN, BLUSH, smoothstep(-0.1, -0.2, p[1]) * 0.35), ao(f, p, n, 0.008), 0.5) }));
  }
  // Shirt buttons sit on the surface down the front opening.
  const buttons: Vec3[] = [];
  for (const y of [1.62, 1.48, 1.34, 1.2, 1.06]) {
    let lo = 0, hi = 0.6;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (torsoSDF(0, y, m) < 0) lo = m; else hi = m; }
    buttons.push([0, y, lo + 0.004]);
  }
  return { parts, buttons };
}

/** Flattens a bake into one binary blob plus a manifest of typed-array offsets. */
export function pack(b: Baked): { manifest: unknown; buffer: Uint8Array } {
  const chunks: ArrayBufferView[] = []; let off = 0;
  const take = (a: Float32Array | Uint32Array) => { const o = off; chunks.push(a); off += a.byteLength; return [o, a.length]; };
  const parts = b.parts.map(p => ({ name: p.name, position: take(p.data.positions), normal: take(p.data.normals), color: take(p.data.colors), uv: take(p.data.uvs), index: take(p.data.index) }));
  const buffer = new Uint8Array(off); let o = 0;
  for (const ch of chunks) { buffer.set(new Uint8Array(ch.buffer, ch.byteOffset, ch.byteLength), o); o += ch.byteLength; }
  return { manifest: { version: 1, parts, buttons: b.buttons, mouth: MOUTH, eye: EYE, headPos: HEAD_POS, brow: BROW_CENTER }, buffer };
}
