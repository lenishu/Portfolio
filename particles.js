import * as THREE from './vendor/three.module.min.js';
import { createMorphQueue } from './morph-queue.js';

// One pool of particles that reassembles into Neural, Quantum and Quantitative
// forms: the home page's scroll story (createParticles) and the lab (startLab).
// Positions are simulated on the CPU (so each form can run a real process: signals,
// wave packets, quantum walks, optimisers, price paths) and morphs blend two live
// forms particle by particle. A form may read f.param (0..1, set by the page) and
// f.focus (a name, set by the page) to show one aspect of itself.
const N = 16000;
const COLOR = { neural: new THREE.Color('#85dcff'), quantum: new THREE.Color('#bd99ff'), quant: new THREE.Color('#a1edc4') };
export const FIELDS = ['quantum', 'neural', 'quant'];
// The lab always animates: several forms are processes that only make sense in motion.

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const frac = x => x - Math.floor(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const hash = (a, b = 0, c = 0) => frac(Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453);
const bz = (a, b, c, d, u) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// A form owns P (xyz), B (brightness 0..1) and optional line segments.
function form(view) { return { P: new Float32Array(N * 3), B: new Float32Array(N), lines: null, view, update() {} }; }

// Split the pool into consecutive roles by count (the last role takes the remainder);
// returns each particle's role and its index within that role.
function split(...counts) {
  const role = new Uint8Array(N), idx = new Uint32Array(N), n = counts.slice();
  n[n.length - 1] = N - n.slice(0, -1).reduce((a, b) => a + b, 0);
  let k = 0, c = 0;
  for (let i = 0; i < N; i++) { while (k < n.length - 1 && c >= n[k]) { k++; c = 0; } role[i] = k; idx[i] = c++; }
  return { role, idx, n };
}

// ---------------------------------------------------------------- shared builders
function layeredNetwork(r, layers = [5, 9, 12, 12, 9, 4], width = 6, depth = .5) {
  const nodes = [], edges = [];
  layers.forEach((n, l) => {
    const sp = Math.min(.42, 3.4 / n);
    for (let i = 0; i < n; i++) nodes.push({ x: -width / 2 + width * l / (layers.length - 1), y: (i - (n - 1) / 2) * sp, z: (r() - .5) * depth, l, phase: r() * 6.28 });
  });
  let start = 0;
  for (let l = 0; l < layers.length - 1; l++) {
    const next = start + layers[l];
    for (let a = start; a < next; a++) for (let b = next; b < next + layers[l + 1]; b++) edges.push([a, b, r()]);
    start = next;
  }
  return { nodes, edges, layers };
}
function edgeLines(nodes, edges) {
  const pos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], k) => { const A = nodes[a], B = nodes[b]; pos.set([A.x, A.y, A.z, B.x, B.y, B.z], k * 6); });
  return pos;
}
// Cubic Bézier a → d with handles b, c, as a flat point list.
function bezier(a, b, c, d, n = 24) {
  const out = [];
  for (let k = 0; k <= n; k++) { const u = k / n; for (let q = 0; q < 3; q++) out.push(bz(a[q], b[q], c[q], d[q], u)); }
  return out;
}
// Resample a flat polyline to K even arc-length steps so lookups along it are O(1).
function track(pts, K = 48) {
  const n = pts.length / 3, L = [0];
  for (let k = 1; k < n; k++) L.push(L[k - 1] + Math.hypot(pts[k * 3] - pts[k * 3 - 3], pts[k * 3 + 1] - pts[k * 3 - 2], pts[k * 3 + 2] - pts[k * 3 - 1]));
  const out = new Float32Array((K + 1) * 3), total = L[n - 1] || 1e-6;
  let s = 0;
  for (let j = 0; j <= K; j++) {
    const d = total * j / K;
    while (s < n - 2 && L[s + 1] < d) s++;
    const u = clamp((d - L[s]) / Math.max(L[s + 1] - L[s], 1e-9), 0, 1);
    for (let c = 0; c < 3; c++) out[j * 3 + c] = pts[s * 3 + c] + (pts[s * 3 + 3 + c] - pts[s * 3 + c]) * u;
  }
  return { pts: out, K, len: total };
}
// Write the point at fraction u along a track (plus an offset) into P for particle i.
function along(tr, u, P, i, dx = 0, dy = 0, dz = 0) {
  const x = clamp(u, 0, 1) * tr.K, k = Math.min(tr.K - 1, Math.floor(x)), f = x - k, a = tr.pts, o = k * 3;
  P[i * 3] = a[o] + (a[o + 3] - a[o]) * f + dx; P[i * 3 + 1] = a[o + 1] + (a[o + 4] - a[o + 1]) * f + dy; P[i * 3 + 2] = a[o + 2] + (a[o + 5] - a[o + 2]) * f + dz;
}
function trackLines(trs) {
  const out = new Float32Array(trs.reduce((a, t) => a + t.K, 0) * 6); let o = 0;
  for (const t of trs) for (let k = 0; k < t.K; k++) { out.set(t.pts.subarray(k * 3, k * 3 + 6), o); o += 6; }
  return out;
}
function joinLines(...parts) { const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
// Segments of an axis-aligned box outline.
function boxLines(x0, x1, y0, y1, z0, z1) {
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return new Float32Array([[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].flatMap(([a, b]) => [...c[a], ...c[b]]));
}
// A point on the outline of a w × h rounded rectangle (corner radius rad) at perimeter fraction e.
function roundRect(w, h, rad, e) {
  const sx = w - 2 * rad, sy = h - 2 * rad, arc = Math.PI * rad / 2, total = 2 * sx + 2 * sy + 4 * arc;
  let d = frac(e) * total;
  const segs = [[sx, (u) => [-sx / 2 + u, h / 2]], [arc, (u) => { const a = Math.PI / 2 - u / rad; return [sx / 2 + Math.cos(a) * rad, sy / 2 + Math.sin(a) * rad]; }],
    [sy, (u) => [w / 2, sy / 2 - u]], [arc, (u) => { const a = -u / rad; return [sx / 2 + Math.cos(a) * rad, -sy / 2 + Math.sin(a) * rad]; }],
    [sx, (u) => [sx / 2 - u, -h / 2]], [arc, (u) => { const a = -Math.PI / 2 - u / rad; return [-sx / 2 + Math.cos(a) * rad, -sy / 2 + Math.sin(a) * rad]; }],
    [sy, (u) => [-w / 2, -sy / 2 + u]], [arc, (u) => { const a = Math.PI - u / rad; return [-sx / 2 + Math.cos(a) * rad, sy / 2 + Math.sin(a) * rad]; }]];
  for (const [len, at] of segs) { if (d <= len) return at(d); d -= len; }
  return [-sx / 2, h / 2];
}
// Eigen-decomposition of a symmetric n × n matrix (cyclic Jacobi). Column k of vecs pairs with vals[k].
function eigSym(M, n) {
  const a = Float64Array.from(M), v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q];
      if (Math.abs(apq) < 1e-14) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * apq), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k * n + p], y = a[k * n + q]; a[k * n + p] = c * x - s * y; a[k * n + q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p * n + k], y = a[q * n + k]; a[p * n + k] = c * x - s * y; a[q * n + k] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = v[k * n + p], y = v[k * n + q]; v[k * n + p] = c * x - s * y; v[k * n + q] = s * x + c * y; }
    }
  }
  return { vals: Array.from({ length: n }, (_, k) => a[k * n + k]), vecs: v };
}

// ================================================================ NEURAL
// 1 · Constellation: glowing nodes and signals streaming along every edge.
function A_neural() {
  const f = form({ cam: [0, .2, 7.2], look: [0, 0, 0], spin: 0 }), r = rng(11);
  const { nodes, edges } = layeredNetwork(r);
  f.lines = edgeLines(nodes, edges);
  const role = new Uint32Array(N), u0 = new Float32Array(N), sp = new Float32Array(N), off = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    if (i < N * .3) { role[i] = i % nodes.length; const g = [gauss(r), gauss(r), gauss(r)]; off.set(g.map(v => v * .055), i * 3); u0[i] = -1; }
    else { role[i] = Math.floor(r() * edges.length); u0[i] = r(); sp[i] = .08 + r() * .18; off.set([gauss(r) * .012, gauss(r) * .012, 0], i * 3); }
  }
  f.update = t => {
    for (let i = 0; i < N; i++) {
      let x, y, z, b;
      if (u0[i] < 0) { const n = nodes[role[i]]; x = n.x; y = n.y; z = n.z; b = .55 + .45 * Math.sin(t * 2.2 + n.phase); }
      else {
        const [a, c, ph] = edges[role[i]], A = nodes[a], C = nodes[c], u = frac(u0[i] + t * sp[i]);
        x = A.x + (C.x - A.x) * u; y = A.y + (C.y - A.y) * u; z = A.z + (C.z - A.z) * u;
        const s = frac(t * .45 + ph);
        b = .18 + .82 * Math.exp(-((u - s) ** 2) / .004);
      }
      f.P[i * 3] = x + off[i * 3]; f.P[i * 3 + 1] = y + off[i * 3 + 1]; f.P[i * 3 + 2] = z + off[i * 3 + 2]; f.B[i] = b;
    }
  };
  return f;
}

// 2 · DenseNet: feature maps in three dense blocks (every layer feeds every later
// layer, drawn as arcs), transition layers that pool between blocks, then a
// fully connected head. A forward pass sweeps left to right.
function N_densenet() {
  const f = form({ cam: [2.1, 1.5, 6.9], look: [0, .05, 0], spin: 0 }), r = rng(51), X = .38; f.size = 1.25;
  const maps = [{ x: -3.05, s: 1.4, g: 20 }, { x: -2.62, s: 1.28, g: 16 }], blocks = [];
  [[-2.28, 1.2, .25, 16], [-.9, .92, .21, 10], [.3, .64, .18, 6]].forEach(([x0, s, dx, g], b) => {
    const members = [maps.length - 1];
    for (let l = 0; l < 4; l++) { members.push(maps.length); maps.push({ x: x0 + l * dx, s, g }); }
    blocks.push(members);
    if (b < 2) maps.push({ x: x0 + 3 * dx + .34, s: s * .78, g: Math.round(g * .6) });   // transition: 1×1 conv + 2×2 pool
  });
  maps.forEach(m => { m.x += X; });
  const head = [];
  [[1.25, 12, .085], [1.8, 8, .12], [2.35, 4, .19]].forEach(([x, n, sp], c) => { for (let k = 0; k < n; k++) head.push({ x: x + X, y: (k - (n - 1) / 2) * sp, z: 0, c, k }); });
  const arcs = [];
  blocks.forEach(m => { for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
    const A = maps[m[i]], B = maps[m[j]], h = .12 + .13 * (j - i), z = ((i + j) % 3 - 1) * .1;
    arcs.push(track(bezier([A.x, A.s / 2, z], [A.x, A.s / 2 + h, z], [B.x, B.s / 2 + h, z], [B.x, B.s / 2, z]), 24));
  } });
  const last = maps[maps.length - 1], pool = head.filter(h => h.c === 0);
  const funnel = pool.map(p => track([last.x, p.y * .5, 0, p.x, p.y, 0], 10));   // global average pool
  const fc = [];
  head.forEach(a => head.forEach(b => { if (b.c === a.c + 1) fc.push(track([a.x, a.y, a.z, b.x, b.y, b.z], 8)); }));
  f.lines = joinLines(...maps.map(m => boxLines(m.x, m.x, -m.s / 2, m.s / 2, -m.s / 2, m.s / 2)), trackLines(arcs), trackLines(funnel), trackLines(fc));
  f.lineAlpha = .1;

  const { role, idx, n } = split(8000, 3400, 960, 540, 0);   // feature maps, dense arcs, head nodes, pooling, fc edges
  const area = maps.map(m => m.s * m.s), tot = area.reduce((a, b) => a + b);
  let cum = 0; const cuts = area.map(a => (cum += a / tot) * n[0]);
  const mapOf = new Uint8Array(N), u = new Float32Array(N), v = new Float32Array(N), act = new Float32Array(N), trk = new Uint16Array(N), u0 = new Float32Array(N), sp = new Float32Array(N), jit = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const k = idx[i];
    jit.set([gauss(r) * .012, gauss(r) * .012, gauss(r) * .012], i * 3); u0[i] = r(); sp[i] = .12 + r() * .12;
    if (role[i] === 0) {
      let m = 0; while (m < maps.length - 1 && cuts[m] <= k) m++;
      const M = maps[m]; mapOf[i] = m;
      if (r() < .3) {   // map outline
        const e = r() * 4, side = Math.floor(e), w = e - side - .5;
        [u[i], v[i]] = side === 0 ? [w, -.5] : side === 1 ? [.5, w] : side === 2 ? [-w, .5] : [-.5, -w]; act[i] = -1;
      } else {           // cells of the feature map
        const cu = Math.floor(r() * M.g), cv = Math.floor(r() * M.g);
        u[i] = (cu + .5) / M.g - .5 + gauss(r) * .1 / M.g; v[i] = (cv + .5) / M.g - .5 + gauss(r) * .1 / M.g;
        act[i] = m === 0 ? Math.exp(-((Math.hypot(u[i] * 1.15, v[i] * .85) - .27) ** 2) / .005) : hash(m, cu, cv) ** 2;
      }
    } else if (role[i] === 1) trk[i] = k % arcs.length;
    else if (role[i] === 2) trk[i] = k % head.length;
    else if (role[i] === 3) trk[i] = k % funnel.length;
    else trk[i] = k % fc.length;
  }
  // Pruning (f.param = fraction removed): each particle dies once the fraction passes its
  // own random threshold, dimming and sinking. The forward pass survives slow losses, then
  // near the critical region it stops reaching the head: a phase transition in learning.
  const death = new Float32Array(N); for (let i = 0; i < N; i++) death[i] = hash(i, 7.7);
  const x0 = maps[0].x;
  f.update = t => {
    const p = clamp(f.param || 0, 0, 1), reach = 1 - smooth(.78, .93, p);
    const ph = frac(t / 6), w = -3.3 + X + 6.3 * ph, amp = x => reach + (1 - reach) * Math.exp(-Math.max(0, x - x0) / .7);
    const glow = x => Math.exp(-((x - w) ** 2) / .05) * amp(x);
    const settled = smooth(.8, .88, ph) * (1 - smooth(.95, 1, ph)) * reach;   // the predicted class lights up after the pass
    for (let i = 0; i < N; i++) {
      const i3 = i * 3, ro = role[i];
      if (ro === 0) {
        const M = maps[mapOf[i]], g = glow(M.x);
        f.P[i3] = M.x + jit[i3] * .3; f.P[i3 + 1] = u[i] * M.s; f.P[i3 + 2] = v[i] * M.s;
        f.B[i] = act[i] < 0 ? .32 + .5 * g : .12 + .6 * act[i] + .55 * g * (.3 + act[i]);
      } else if (ro === 2) {
        const h = head[trk[i]];
        f.P[i3] = h.x + jit[i3] * 2; f.P[i3 + 1] = h.y + jit[i3 + 1] * 2; f.P[i3 + 2] = h.z + jit[i3 + 2] * 2;
        f.B[i] = .4 + .55 * glow(h.x) + (h.c === 2 && h.k === 1 ? .45 * settled : 0);
      } else {
        const tr = ro === 1 ? arcs[trk[i]] : ro === 3 ? funnel[trk[i]] : fc[trk[i]];
        along(tr, frac(u0[i] + t * sp[i]), f.P, i, jit[i3] * .4, jit[i3 + 1] * .4, jit[i3 + 2] * .4);
        f.B[i] = .17 + .65 * glow(f.P[i3]);
      }
      if (p > 0) { const d = smooth(death[i] * .98, death[i] * .98 + .02, p); f.B[i] *= 1 - .8 * d; f.P[i3 + 1] -= .12 * d; }
    }
  };
  return f;
}

// 3 · Human brain: folded cortex (two hemispheres and temporal lobes), cerebellum and
// brainstem. Waves of activity spread over the surface and signals run through
// white-matter tracts, including the corpus callosum between the hemispheres.
function N_brain() {
  const f = form({ cam: [2.3, 1.1, 7.3], look: [-.1, -.25, 0], spin: .16 }), r = rng(52); f.size = 1.3;
  const lobes = [];
  for (const s of [-1, 1]) lobes.push(
    { c: [0, .2, s * .46], R: [1.7, 1.06, .72], flat: true },        // cerebral hemisphere (flattened underside)
    { c: [.36, -.52, s * .64], R: [.92, .44, .42], flat: false },    // temporal lobe
    { c: [-1.2, -.8, s * .34], R: [.58, .36, .46], flat: false });   // cerebellum
  const FLAT = -.25, SQ = .55;
  const unflat = y => y < FLAT ? FLAT + (y - FLAT) / SQ : y;
  const inside = (x, y, z, skip) => lobes.some((L, k) => { if (k === skip) return false; const yy = L.flat ? unflat(y) : y; return ((x - L.c[0]) / L.R[0]) ** 2 + ((yy - L.c[1]) / L.R[1]) ** 2 + ((z - L.c[2]) / L.R[2]) ** 2 < .97; });
  // gyri: stripes of a smooth warped field, mirrored across the midline
  const gyri = (x, y, z) => Math.sin(8.5 * (Math.sin(1.25 * x + .6 * z + .4) + .8 * Math.sin(1.8 * y - .6 * x + 1.1) + .55 * Math.sin(2.2 * z + 1.3 * y + 2.2) + .4 * Math.sin(3.1 * x + 2.6 * y + .3)));
  const { role } = split(9000, 1900, 500, 0);   // cortex, cerebellum, brainstem, white-matter tracts
  const b0 = new Float32Array(N);
  function onLobe(i, k) {
    for (;;) {
      const L = lobes[k]; let gx = gauss(r), gy = gauss(r), gz = gauss(r); const m = Math.hypot(gx, gy, gz) || 1; gx /= m; gy /= m; gz /= m;
      let x = L.c[0] + L.R[0] * gx, y = L.c[1] + L.R[1] * gy, z = L.c[2] + L.R[2] * gz;
      if (L.flat && y < FLAT) y = FLAT + (y - FLAT) * SQ;
      if (inside(x, y, z, k)) continue;
      let nx = gx / L.R[0], ny = gy / L.R[1], nz = gz / L.R[2]; const nm = Math.hypot(nx, ny, nz); nx /= nm; ny /= nm; nz /= nm;
      const cb = k % 3 === 2, s = cb ? Math.sin(34 * (y + .14 * x) + 1.5 * Math.sin(4 * z)) : gyri(x, y, Math.abs(z)), d = (cb ? .018 : .04) * s;
      if (r() > .3 + .7 * smooth(-.6, .6, s)) continue;   // thin out the sulci so the folds read
      f.P[i * 3] = x + nx * d; f.P[i * 3 + 1] = y + ny * d; f.P[i * 3 + 2] = z + nz * d;
      b0[i] = cb ? .2 + .45 * smooth(-.2, 1, s) : .1 + .7 * smooth(-.3, .95, s);
      return;
    }
  }
  const tracts = [];
  for (let k = 0; k < 22; k++) {   // corpus callosum: U-shaped fibres across the midline
    const x = -1.05 + 2.1 * k / 21 + (r() - .5) * .1, y = .45 + r() * .4;
    tracts.push(track(bezier([x, y, -.62], [x * .75, .02, -.22], [x * .75, .02, .22], [x, y, .62]), 32));
  }
  for (const s of [-1, 1]) for (let k = 0; k < 10; k++) {   // association fibres, front ↔ back
    const z = s * (.3 + r() * .3), y = -.1 + r() * .5;
    tracts.push(track(bezier([1.35, y, z], [.5, y + .55, z], [-.6, y + .5, z], [-1.3, y - .05, z]), 32));
  }
  for (const s of [-1, 1]) for (let k = 0; k < 9; k++) {    // projection fibres, cortex → brainstem
    const x = -.35 + r() * .9;
    tracts.push(track(bezier([x, .95, s * (.25 + r() * .25)], [x * .6 - .1, .1, s * .2], [-.5, -.7, s * .06], [-.7, -1.55, 0]), 32));
  }
  const trk = new Uint16Array(N), u0 = new Float32Array(N), sp = new Float32Array(N), ph = tracts.map(() => r()), jit = new Float32Array(N * 3);
  const SA = [-.5, -.5, 0], SB = [-.74, -1.72, 0];
  for (let i = 0; i < N; i++) {
    const ro = role[i];
    if (ro === 0) onLobe(i, (r() < .5 ? 0 : 3) + (r() < .8 ? 0 : 1));
    else if (ro === 1) onLobe(i, r() < .5 ? 2 : 5);
    else if (ro === 2) {   // brainstem: a tapering tube, hidden where it enters the brain
      for (;;) {
        const u = r(), a = r() * 6.283, rad = .2 - .05 * u, dx = SB[0] - SA[0], dy = SB[1] - SA[1], dl = Math.hypot(dx, dy);
        const x = SA[0] + dx * u + Math.cos(a) * rad * (-dy / dl), y = SA[1] + dy * u + Math.cos(a) * rad * (dx / dl), z = Math.sin(a) * rad;
        if (inside(x, y, z, -1)) continue;
        f.P.set([x, y, z], i * 3); b0[i] = .22 + .16 * Math.abs(Math.cos(a)); break;
      }
    } else { trk[i] = i % tracts.length; u0[i] = r(); sp[i] = .03 + r() * .05; jit.set([gauss(r) * .018, gauss(r) * .018, gauss(r) * .018], i * 3); }
  }
  // activity: waves that ripple out from a few sites on the cortex (distances precomputed)
  const K = 6, src = [], per = [], off = [];
  for (let k = 0; k < K; k++) { let i; do { i = Math.floor(r() * N); } while (role[i] !== 0); src.push(i); per.push(3 + r() * 3); off.push(r()); }
  const dist = new Float32Array(N * K);
  for (let i = 0; i < N; i++) if (role[i] < 3) for (let k = 0; k < K; k++) { const j = src[k]; dist[i * K + k] = Math.hypot(f.P[i * 3] - f.P[j * 3], f.P[i * 3 + 1] - f.P[j * 3 + 1], f.P[i * 3 + 2] - f.P[j * 3 + 2]); }
  const R = new Float32Array(K), A = new Float32Array(K);
  f.update = t => {
    for (let k = 0; k < K; k++) { const p = frac(t / per[k] + off[k]); R[k] = p * 1.6; A[k] = (1 - p) ** 2 * .7; }
    const tick = Math.floor(t * 9);
    for (let i = 0; i < N; i++) {
      if (role[i] < 3) {
        let b = b0[i];
        for (let k = 0; k < K; k++) { const w = 1 - ((dist[i * K + k] - R[k]) / .13) ** 2; if (w > 0) b += A[k] * w * w; }
        if (hash(i, tick) > .996) b += .6;   // individual neurons firing
        f.B[i] = Math.min(1, b);
      } else {
        const tr = tracts[trk[i]], u = frac(u0[i] + t * sp[i]), i3 = i * 3;
        along(tr, u, f.P, i, jit[i3], jit[i3 + 1], jit[i3 + 2]);
        f.B[i] = .13 + .75 * Math.exp(-((u - frac(t * .3 + ph[trk[i]])) ** 2) / .003);
      }
    }
  };
  return f;
}

// 4 · Fruit-fly connectome, after the Janelia–Google hemibrain and FlyWire maps:
// optic lobes with a columnar medulla, mushroom bodies, the central complex (whose
// ring carries the rotating heading bump), antennal lobes and the wiring between them.
function N_fly() {
  const f = form({ cam: [0, .25, 7.1], look: [0, -.12, 0], spin: .1 }), r = rng(53); f.size = 1.3;
  const OL = 1.36;   // optic-lobe centre offset
  const inBrain = (x, y, z) => (x / 1.08) ** 2 + ((y - .12) / .78) ** 2 + (z / .5) ** 2 < 1;
  const cbPoint = () => { for (;;) { const p = [(r() * 2 - 1) * 1.05, .12 + (r() * 2 - 1) * .75, (r() * 2 - 1) * .48]; if (inBrain(...p)) return p; } };
  const jitter = (p, a) => p.map(v => v + (r() * 2 - 1) * a);
  const mb = [-1, 1].map(s => {
    const cal = [s * .55, .5, -.3], J = [s * .36, .04, .26];
    return { cal, parts: [track(bezier(cal, [s * .5, .3, -.1], [s * .4, .1, .15], J), 24), track(bezier(J, [s * .38, .25, .3], [s * .42, .5, .32], [s * .44, .66, .32]), 16), track(bezier(J, [s * .25, .03, .3], [s * .12, .02, .3], [s * .03, .02, .3]), 16)] };
  });
  const neurons = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 46; k++) {   // visual projection neurons: lobula → central brain
      const th = (r() * 2 - 1) * .9, a = [s * (OL + Math.cos(th) * .38 * 1.1), .08 + Math.sin(th) * .38, (r() - .5) * .3 - .06], b = cbPoint();
      b[0] = s * (.3 + Math.abs(b[0]) * .65);
      neurons.push(track(bezier(a, jitter([a[0] - s * .45, a[1], a[2]], .12), jitter([b[0] + s * .35, b[1], b[2]], .15), b), 20));
    }
    for (let k = 0; k < 14; k++) {   // olfactory projection neurons: antennal lobe → calyx → lateral horn
      const al = jitter([s * .3, -.42, .3], .1), cal = jitter([s * .55, .5, -.3], .08), lh = jitter([s * .9, .38, -.15], .1);
      neurons.push(track(bezier(al, [s * .45, -.2, .1], [s * .6, .25, -.3], cal, 14).concat(bezier(cal, [s * .65, .6, -.3], [s * .85, .5, -.2], lh, 10).slice(3)), 24));
    }
    for (let k = 0; k < 12; k++) {   // descending neurons → neck connective
      const a = cbPoint(); a[0] = s * Math.abs(a[0]);
      neurons.push(track(bezier(a, [a[0] * .6, a[1] - .3, a[2]], [s * .06, -.5, -.05], jitter([s * .04, -1.3, -.1], .03)), 20));
    }
  }
  for (let k = 0; k < 16; k++) {   // commissural neurons crossing the midline
    const a = cbPoint(), b = cbPoint(); a[0] = -Math.abs(a[0]) - .1; b[0] = Math.abs(b[0]) + .1;
    const y = r() < .5 ? .5 + r() * .15 : -.05 + r() * .12;
    neurons.push(track(bezier(a, [a[0] * .4, y, a[2] * .5], [b[0] * .4, y, b[2] * .5], b), 20));
  }
  for (let k = 0; k < 14; k++) {   // central-complex columnar neurons: bridge → fan → ring
    const xp = -.45 + .9 * k / 13, ang = Math.PI / 2 - xp * 3.4;
    neurons.push(track(bezier([xp, .46 + .5 * xp * xp, -.28], [xp * .8, .42, -.1], [xp * .5, .28, .06], [Math.cos(ang) * .14, -.04 + Math.sin(ang) * .14, .24]), 16));
  }
  f.lines = trackLines(neurons); f.lineAlpha = .085;
  const glom = [];
  for (const s of [-1, 1]) while (glom.length < (s < 0 ? 40 : 80)) { const p = [(r() * 2 - 1) * .17, (r() * 2 - 1) * .17, (r() * 2 - 1) * .17]; if (Math.hypot(...p) < .17) glom.push([s * .3 + p[0], -.42 + p[1], .3 + p[2], 1.5 + r() * 2.5, r() * 6.28]); }

  const { role, idx } = split(2300, 5200, 1160, 850, 800, 260, 0);
  // roles: central-brain neuropil, optic lobes, mushroom bodies, central complex, antennal lobes, neck connective, neurons
  const b0 = new Float32Array(N), aux = new Float32Array(N), aux2 = new Float32Array(N), grp = new Uint16Array(N), u0 = new Float32Array(N), sp = new Float32Array(N), jit = new Float32Array(N * 3), gain = neurons.map(() => .5 + r() * .7), nph = neurons.map(() => r());
  for (let i = 0; i < N; i++) {
    const ro = role[i], k = idx[i], i3 = i * 3;
    let x = 0, y = 0, z = 0;
    if (ro === 0) {   // a translucent neuropil shell with a hole for the oesophagus
      for (;;) { const gx = gauss(r), gy = gauss(r), gz = gauss(r), m = Math.hypot(gx, gy, gz), rad = r() < .88 ? 1 : Math.cbrt(r()); x = gx / m * 1.08 * rad; y = .12 + gy / m * .78 * rad; z = gz / m * .5 * rad; if ((x / .17) ** 2 + ((y + .24) / .2) ** 2 > 1) break; }
      b0[i] = .13 + .12 * r();
    } else if (ro === 1) {
      const s = k < 2600 ? -1 : 1, q = r(); let R, th, dz = 0;
      if (q < .13) { R = .95 + r() * .05; th = (r() * 2 - 1) * 1.3; grp[i] = 0; }                                                       // lamina
      else if (q < .75) { const c = Math.floor(r() * 36); th = -1.22 + 2.44 * (c + .5) / 36 + gauss(r) * .006; R = .56 + r() * .32; grp[i] = 1; }   // medulla columns
      else if (q < .9) { R = .3 + r() * .14; th = r() * 2 - 1; grp[i] = 2; dz = -.06; }                                                  // lobula
      else { R = .36 + r() * .12; th = (r() * 2 - 1) * .8; grp[i] = 3; dz = -.3; }                                                       // lobula plate
      x = s * (OL + Math.cos(th) * R * 1.1); y = .08 + Math.sin(th) * R; z = (r() * 2 - 1) * .42 * Math.cos(th * .85) + dz;
      aux[i] = th * s; aux2[i] = R;
    } else if (ro === 2) {
      const s = k < 580 ? 0 : 1, M = mb[s], q = r(); grp[i] = q < .36 ? 0 : q < .58 ? 1 : q < .79 ? 2 : 3; aux2[i] = s;
      if (grp[i] === 0) { const g = [gauss(r), gauss(r), gauss(r)], m = Math.hypot(...g), rad = .17 * (r() < .7 ? 1 : Math.cbrt(r())); x = M.cal[0] + g[0] / m * rad; y = M.cal[1] + g[1] / m * rad * .8; z = M.cal[2] + g[2] / m * rad; }
      else { aux[i] = r(); along(M.parts[grp[i] - 1], aux[i], f.P, i, gauss(r) * .026, gauss(r) * .026, gauss(r) * .026); x = f.P[i3]; y = f.P[i3 + 1]; z = f.P[i3 + 2]; }
    } else if (ro === 3) {
      const q = r();
      if (q < .36) { grp[i] = 0; const a = r() * 6.283, bb = r() * 6.283, rr = .14 + .035 * Math.cos(bb); x = rr * Math.cos(a); y = -.04 + rr * Math.sin(a); z = .24 + .035 * Math.sin(bb); aux[i] = a; }   // ellipsoid body
      else if (q < .78) { grp[i] = 1; const a = .2 * Math.PI + r() * .6 * Math.PI, rr = .22 + r() * .16; x = rr * Math.cos(a); y = .02 + rr * Math.sin(a); z = .05 + gauss(r) * .02; aux[i] = a; }   // fan-shaped body
      else { grp[i] = 2; x = (r() * 2 - 1) * .48; y = .46 + .5 * x * x + gauss(r) * .012; z = -.28 + gauss(r) * .015; aux[i] = x; }   // protocerebral bridge
    } else if (ro === 4) {
      const g = glom[Math.floor(k / 10) % glom.length]; grp[i] = Math.floor(k / 10) % glom.length;
      x = g[0] + gauss(r) * .02; y = g[1] + gauss(r) * .02; z = g[2] + gauss(r) * .02;
    } else if (ro === 5) {
      const u = r(), a = r() * 6.283; aux[i] = u; x = .1 * Math.cos(a); y = -.52 - u * .83; z = -.05 - u * .07 + .1 * Math.sin(a);
    } else { grp[i] = k % neurons.length; u0[i] = r(); sp[i] = .01 + r() * .02; jit.set([gauss(r) * .008, gauss(r) * .008, gauss(r) * .008], i3); }
    if (ro < 6) { f.P[i3] = x; f.P[i3 + 1] = y; f.P[i3 + 2] = z; }
  }
  f.update = t => {
    const head = t * .8, pb = .42 * Math.sin(t * .8);
    for (let i = 0; i < N; i++) {
      const ro = role[i], g = grp[i]; let b;
      if (ro === 0) b = b0[i];
      else if (ro === 1) b = g === 1 ? (.24 + .6 * (.5 + .5 * Math.sin(aux[i] * 10 - t * 2.4)) ** 2) * (.65 + .35 * Math.cos(aux2[i] * 50)) : g === 0 ? .34 : g === 2 ? .36 + .3 * (.5 + .5 * Math.sin(aux[i] * 6 - t * 2.4)) : .3;
      else if (ro === 2) b = g === 0 ? .42 + .25 * (.5 + .5 * Math.sin(t * 1.3 + aux2[i] * 2)) : .42 + .55 * Math.exp(-((aux[i] - frac(t * .35 + aux2[i] * .5)) ** 2) / .01);
      else if (ro === 3) b = g === 0 ? .28 + .72 * Math.exp(-(angDiff(aux[i], head) ** 2) / .25) : g === 1 ? .26 + .2 * (.5 + .5 * Math.cos(aux[i] * 18)) + .35 * Math.exp(-(angDiff(aux[i], Math.PI / 2 - pb * 2) ** 2) / .08) : .32 + .6 * Math.exp(-((aux[i] - pb) ** 2) / .01);
      else if (ro === 4) { const G = glom[g]; b = .26 + .7 * Math.max(0, Math.sin(t * G[3] + G[4])) ** 6; }
      else if (ro === 5) b = .22 + .5 * Math.exp(-((aux[i] - frac(t * .5)) ** 2) / .01);
      else {
        const u = frac(u0[i] + t * sp[i]), i3 = i * 3;
        along(neurons[g], u, f.P, i, jit[i3], jit[i3 + 1], jit[i3 + 2]);
        b = .13 + .75 * gain[g] * Math.exp(-((u - frac(t * .32 + nph[g])) ** 2) / .004);
      }
      f.B[i] = Math.min(1, b);
    }
  };
  return f;
}

// 5 · HPC cluster: racks of compute blades grouped into jobs, a leaf switch on each
// rack and a spine layer above (two-tier fat tree). MPI packets travel between the
// blades of a job: blade → leaf → spine → leaf → blade.
function N_hpc() {
  const f = form({ cam: [3.1, 1.4, 8.4], look: [0, -.2, 0], spin: .05 }), r = rng(54); f.size = 1.2;
  const RX = [-2.4, -1.2, 0, 1.2, 2.4], SX = [-1.5, 0, 1.5], slots = 14, y0 = -1.72, y1 = .42, hw = .34, zf = .4, top = y1 + .3, SY = 1.3;
  const slotY = k => y0 + .17 + k * (y1 - y0 - .3) / (slots - 1);
  const BL = RX.length * slots, job = new Int16Array(BL).fill(-1), jobs = [];
  for (let b = 0; b < BL;) {
    if (r() < .18) { b += 1 + Math.floor(r() * 3); continue; }   // idle blades
    const len = 4 + Math.floor(r() * 12), j = jobs.length; jobs.push({ w: 1 + r() * 2.5, ph: r() * 6.28, blades: [] });
    for (let q = 0; q < len && b < BL; q++, b++) { job[b] = j; jobs[j].blades.push(b); }
  }
  const multi = jobs.filter(j => j.blades.length > 1), routes = [];
  const bladeEnd = b => [RX[Math.floor(b / slots)] + hw - .02, slotY(b % slots), zf];
  const cable = (xa, xb) => bezier([xa, top - .02, 0], [xa, 1.02, 0], [xb, .98, 0], [xb, SY - .04, 0], 12);
  for (let k = 0; k < 110; k++) {
    const J = multi[Math.floor(r() * multi.length)], a = J.blades[Math.floor(r() * J.blades.length)];
    let c = a; while (c === a) c = J.blades[Math.floor(r() * J.blades.length)];
    const qa = Math.floor(a / slots), qc = Math.floor(c / slots), xa = RX[qa] + hw + .07, xc = RX[qc] + hw + .07;
    let pts = [...bladeEnd(a), xa, slotY(a % slots), .12, xa, .6, .12, RX[qa], top - .02, 0];
    if (qa !== qc) {   // up to a spine switch, then back down the other rack's cable (walked in reverse)
      const S = SX[Math.floor(r() * SX.length)], down = cable(RX[qc], S);
      pts = pts.concat(cable(RX[qa], S).slice(3));
      for (let q = down.length - 6; q >= 0; q -= 3) pts.push(down[q], down[q + 1], down[q + 2]);
    }
    pts.push(xc, .6, .12, xc, slotY(c % slots), .12, ...bladeEnd(c));
    routes.push({ tr: track(pts, 96), sp: .14 + r() * .1, ph: r() });
  }
  const cables = []; RX.forEach(x => SX.forEach(S => cables.push(track(cable(x, S), 12))));
  f.lines = joinLines(...RX.map(x => boxLines(x - hw - .02, x + hw + .02, y0, top, -zf, zf)), trackLines(cables), new Float32Array(RX.flatMap(x => [x + hw + .07, y0 + .1, .12, x + hw + .07, .6, .12])));
  f.lineAlpha = .12;

  const { role, idx } = split(7000, 840, 900, 550, 450, 1300, 0);
  // roles: blade faces, status LEDs, rack posts, leaf switches, spine switches, floor, packets
  const bl = new Uint16Array(N), gxA = new Float32Array(N), aux = new Float32Array(N), jit = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const ro = role[i], k = idx[i], i3 = i * 3; let x = 0, y = 0, z = 0;
    if (ro === 0) { const b = Math.floor(k / 100), l = k % 100, gx = l % 25, gy = Math.floor(l / 25); bl[i] = b; gxA[i] = gx / 24; x = RX[Math.floor(b / slots)] - hw + .03 + gx / 24 * (2 * hw - .15); y = slotY(b % slots) + (gy / 3 - .5) * .075; z = zf; }
    else if (ro === 1) { const b = Math.floor(k / 12), led = Math.floor(k / 4) % 3; bl[i] = b; aux[i] = led; x = RX[Math.floor(b / slots)] + hw - .085 + led * .03 + gauss(r) * .004; y = slotY(b % slots) + gauss(r) * .004; z = zf + .003; }
    else if (ro === 2) { const q = Math.floor(k / 180), p = Math.floor(k / 45) % 4, u = (k % 45) / 44; x = RX[q] + (p & 1 ? 1 : -1) * (hw + .02); z = (p & 2 ? 1 : -1) * zf; y = y0 + u * (top - y0); }
    else if (ro === 3) { const q = Math.floor(k / 110), l = k % 110, gx = l % 22, gy = Math.floor(l / 22); aux[i] = gy === 4 && gx % 2 === 0 ? 1 : 0; bl[i] = q * 22 + gx; x = RX[q] - hw + gx / 21 * 2 * hw; y = .52 + gy * .025; z = zf; }
    else if (ro === 4) { const q = Math.floor(k / 150), l = k % 150, gx = l % 30, gy = Math.floor(l / 30); aux[i] = gy === 0 && gx % 2 === 0 ? 1 : 0; bl[i] = q * 30 + gx; x = SX[q] - .55 + gx / 29 * 1.1; y = SY + gy * .025; z = 0; }
    else if (ro === 5) { if (r() < .5) { x = -3.2 + .4 * Math.round(r() * 16); z = -1.4 + r() * 3; } else { x = -3.2 + r() * 6.4; z = -1.4 + .4 * Math.round(r() * 7.5); } y = y0 - .06; aux[i] = .2 * Math.max(0, 1 - Math.hypot(x, z) / 4.2); }
    else { bl[i] = k % routes.length; const m = Math.floor(k / routes.length); aux[i] = m; jit.set([gauss(r) * .006, gauss(r) * .006, gauss(r) * .006], i3); }
    if (ro < 6) { f.P[i3] = x; f.P[i3 + 1] = y; f.P[i3 + 2] = z; }
  }
  // f.focus: 'mpi' lights the packets, 'cgroup' shows each job confined to its own
  // block of blades, 'optimize' evens every running job out at a steady high load.
  const fk = { mpi: 0, cgroup: 0, optimize: 0 };
  f.update = t => {
    const tick = Math.floor(t * 6);
    for (const k in fk) fk[k] += ((f.focus === k ? 1 : 0) - fk[k]) * .05;
    const dimBlades = 1 - .55 * fk.mpi, lit = 1 + .5 * fk.mpi;
    for (let i = 0; i < N; i++) {
      const ro = role[i]; let b;
      if (ro === 0) {
        const j = job[bl[i]];
        if (j < 0) b = .1 * (1 - .7 * fk.cgroup);
        else {
          const J = jobs[j], load = .5 + .5 * Math.sin(t * J.w + J.ph), sweep = Math.exp(-((gxA[i] - frac(t * .3 + J.ph)) ** 2) / .004);
          b = .22 + .26 * load + .38 * sweep;
          b += fk.optimize * (.6 + .12 * sweep - b);                       // balanced: every blade near full, steady
          b += fk.cgroup * ((j % 2 ? .28 : .7) + .15 * sweep - b);          // alternate jobs read as separate blocks
          b *= dimBlades;
        }
      }
      else if (ro === 1) { const j = job[bl[i]]; if (j < 0) b = aux[i] === 0 ? .35 : .06; else { const J = jobs[j]; b = aux[i] === 0 ? .7 : aux[i] === 1 ? (hash(bl[i], tick) > .45 ? .95 : .12) : .15 + .7 * (.5 + .5 * Math.sin(t * J.w * 2 + J.ph)); } }
      else if (ro === 2) b = .32;
      else if (ro === 3 || ro === 4) b = (aux[i] ? (hash(bl[i], tick, ro) > .4 ? .95 : .2) : .34) * lit;
      else if (ro === 5) b = aux[i];
      else {
        const R = routes[bl[i]], m = aux[i], pos = Math.floor(m / 2), u = frac(t * R.sp + R.ph + (m % 2) * .5) - pos * .0035, i3 = i * 3;
        along(R.tr, Math.max(0, u), f.P, i, jit[i3], jit[i3 + 1], jit[i3 + 2]);
        b = u < 0 ? 0 : .95 * Math.max(0, 1 - pos / 24) * lit;
      }
      f.B[i] = b;
    }
  };
  return f;
}

// 6 · RAG pipeline: documents are chunked and embedded into a vector store; a query is
// embedded, its nearest neighbours retrieved, and that context flows into the LLM,
// which writes the answer token by token.
function N_rag() {
  const f = form({ cam: [.4, 1.9, 7.5], look: [0, -.1, 0], spin: 0 }), r = rng(55), T = 10; f.size = 1.2;
  const C = [.05, -.2, 0], CR = .92, CH = .84, LLM = [1.62, -.05, 0], ANS = [2.72, .05, .1], PR = [.05, 1.4, .3];
  const pages = [0, 1, 2].map(p => ({ x: -2.78 + p * .06, y: .2 - p * .1, z: -.3 + p * .2, w: .78, h: 1.02 }));
  const front = pages[2];
  const enc = []; [[-1.65, 6], [-1.38, 4], [-1.1, 6]].forEach(([x, n], c) => { for (let k = 0; k < n; k++) enc.push({ x, y: (k - (n - 1) / 2) * .15, c }); });
  const clusters = []; while (clusters.length < 9) { const a = r() * 6.283, rad = Math.sqrt(r()) * .62; clusters.push([Math.cos(a) * rad, (r() * 2 - 1) * .55, Math.sin(a) * rad]); }
  const { role, idx } = split(3000, 360, 352, 168, 860, 380, 140, 250, 150, 300, 300, 720, 240, 1400, 0);
  // roles: 0 docs, 1 chunks, 2 encoder, 3 embeddings, 4 store cylinder, 5 prompt, 6 query vector, 7 retrieval rays,
  //        8 neighbour glow, 9 context, 10 LLM frame, 11 LLM layers, 12 answer frame, 13 answer text, 14 vector store
  const sx = new Float32Array(N), sy = new Float32Array(N), sz = new Float32Array(N), b0 = new Float32Array(N), aux = new Float32Array(N), jit = new Float32Array(N * 3);
  const store = [];
  for (let i = 0; i < N; i++) {
    const ro = role[i], k = idx[i], i3 = i * 3;
    jit.set([gauss(r), gauss(r), gauss(r)], i3);
    if (ro === 0) {
      const p = Math.floor(k / 1000) % 3, P = pages[p]; aux[i] = p;
      if (r() < .22) { const e = r() * 4, s = Math.floor(e), w = e - s; [sx[i], sy[i]] = s === 0 ? [P.x - P.w / 2 + w * P.w, P.y + P.h / 2] : s === 1 ? [P.x + P.w / 2, P.y + P.h / 2 - w * P.h] : s === 2 ? [P.x + P.w / 2 - w * P.w, P.y - P.h / 2] : [P.x - P.w / 2, P.y - P.h / 2 + w * P.h]; b0[i] = p === 2 ? .48 : .3; }
      else { const l = Math.floor(r() * 11), len = (.5 + .45 * hash(p, l, 1)) * (P.w - .16); sx[i] = P.x - P.w / 2 + .08 + r() * len; sy[i] = P.y + P.h / 2 - .1 - l * .083 + gauss(r) * .005; b0[i] = p === 2 ? .36 : .24; }
      sz[i] = P.z;
    } else if (ro === 4) {
      const ring = k < 680 ? Math.floor(k / 170) : -1;
      if (ring >= 0) { const a = r() * 6.283; sx[i] = C[0] + CR * Math.cos(a); sy[i] = C[1] + [-CH, -CH / 3, CH / 3, CH][ring] * 1; sz[i] = C[2] + CR * Math.sin(a); b0[i] = ring === 3 ? .5 : ring === 0 ? .34 : .22; }
      else { sx[i] = C[0] + (k % 2 ? CR : -CR); sy[i] = C[1] - CH + r() * 2 * CH; sz[i] = C[2]; b0[i] = .3; }
    } else if (ro === 14) {
      for (;;) { const c = clusters[k % clusters.length], x = c[0] + gauss(r) * .17, y = c[1] + gauss(r) * .17, z = c[2] + gauss(r) * .17; if (Math.hypot(x, z) < CR - .08 && Math.abs(y) < CH - .08) { sx[i] = x; sy[i] = y; sz[i] = z; break; } }
      b0[i] = .2 + .22 * r(); store.push(i);
    }
  }
  // for each cluster, the query lands beside its centre and retrieves the 5 nearest stored vectors
  const nn = clusters.map(c => { const q = [c[0] + .05, c[1] + .06, c[2] + .04]; return store.map(i => [i, (sx[i] - q[0]) ** 2 + (sy[i] - q[1]) ** 2 + (sz[i] - q[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([i]) => i); });
  const encLines = []; enc.forEach(a => enc.forEach(b => { if (b.c === a.c + 1) encLines.push(a.x, a.y, 0, b.x, b.y, 0); }));
  f.lines = new Float32Array(encLines); f.lineAlpha = .1;
  const P = f.P;
  f.update = t => {
    const tau = frac(t / T) * T, cyc = Math.floor(t / T), A = t * .12, ca = Math.cos(A), sa = Math.sin(A);
    const rot = (x, y, z, out) => { out[0] = C[0] + x * ca + z * sa; out[1] = C[1] + y; out[2] = C[2] - x * sa + z * ca; return out; };
    const cl = clusters[cyc % clusters.length], q = rot(cl[0] + .05, cl[1] + .06, cl[2] + .04, [0, 0, 0]), nb = nn[cyc % clusters.length].map(i => rot(sx[i], sy[i], sz[i], [0, 0, 0]));
    const typed = smooth(.1, 1.3, tau), drop = smooth(1.3, 2.7, tau), qVis = smooth(1.1, 1.4, tau) * (1 - smooth(6.4, 7, tau)), grow = smooth(2.7, 3.4, tau), rays = 1 - smooth(5.8, 6.4, tau);
    const gen = smooth(6.6, 6.9, tau) * (1 - smooth(9.3, 9.6, tau)), fade = 1 - smooth(9.5, 9.95, tau), scan = front.y + front.h / 2 - frac(t * .2) * front.h;
    const qs = [PR[0] + (q[0] - PR[0]) * drop, PR[1] - .12 + (q[1] - PR[1] + .12) * drop, PR[2] + (q[2] - PR[2]) * drop];
    const tmp = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const ro = role[i], k = idx[i], i3 = i * 3; let x, y, z, b;
      if (ro === 0) { x = sx[i]; y = sy[i]; z = sz[i]; b = b0[i] + (aux[i] === 2 ? .45 * Math.exp(-((y - scan) ** 2) / .003) : 0); }
      else if (ro === 1) {   // chunks peel off the page and shrink into the encoder
        const fl = Math.floor(k / 30), l = k % 30, u = frac(t * .2 + fl / 12), sc = 1 - .75 * u, s0 = [front.x + .05, front.y + .35 - (fl % 6) * .14, front.z + .05];
        x = bz(s0[0], s0[0] + .45, -1.95, -1.65, u) + ((l % 6) - 2.5) * .022 * sc; y = bz(s0[1], s0[1], 0, 0, u) + (Math.floor(l / 6) - 2) * .022 * sc; z = bz(s0[2], .2, .1, 0, u); b = .6 * Math.sqrt(Math.sin(Math.PI * u));
      } else if (ro === 2) { const e = enc[Math.floor(k / 22) % enc.length]; x = e.x + jit[i3] * .022; y = e.y + jit[i3 + 1] * .022; z = jit[i3 + 2] * .022; b = .42 + .45 * (.5 + .5 * Math.sin(t * 3 - e.c * 1.2)); }
      else if (ro === 3) {   // embedding vectors fly into the store
        const fl = Math.floor(k / 14), l = k % 14, ph = t * .2 + fl / 12 + .5, u = frac(ph) - l * .012, e = enc[10 + fl % 6], tg = store[(fl * 131 + Math.floor(ph) * 17) % store.length];
        rot(sx[tg], sy[tg], sz[tg], tmp); const uu = clamp(u, 0, 1);
        x = bz(e.x, e.x + .4, tmp[0] - .4, tmp[0], uu); y = bz(e.y, e.y, tmp[1] + .25, tmp[1], uu); z = bz(0, 0, tmp[2], tmp[2], uu); b = u < 0 ? 0 : .9 * (1 - l / 14);
      } else if (ro === 4) { x = sx[i]; y = sy[i]; z = sz[i]; b = b0[i]; }
      else if (ro === 5) {   // the prompt bar, typed out at the start of each cycle
        if (k < 220) { const [px, py] = roundRect(1.7, .24, .12, k / 220); x = PR[0] + px; y = PR[1] + py; b = .4 + .35 * (1 - smooth(2.6, 3.2, tau)); }
        else { const v = (k - 220) / 160; x = PR[0] - .62 + v * 1.12; y = PR[1] + jit[i3 + 1] * .012; b = v < typed ? .7 * fade : 0; }
        z = PR[2];
      } else if (ro === 6) { x = qs[0] + jit[i3] * .035; y = qs[1] + jit[i3 + 1] * .035; z = qs[2] + jit[i3 + 2] * .035; b = qVis; }
      else if (ro === 7) { const nbk = nb[Math.floor(k / 50)], v = (k % 50) / 49; const vv = Math.min(v, grow); x = q[0] + (nbk[0] - q[0]) * vv; y = q[1] + (nbk[1] - q[1]) * vv; z = q[2] + (nbk[2] - q[2]) * vv; b = v <= grow ? .5 * rays : 0; }
      else if (ro === 8) { const nbk = nb[Math.floor(k / 30)]; x = nbk[0] + jit[i3] * .03; y = nbk[1] + jit[i3 + 1] * .03; z = nbk[2] + jit[i3 + 2] * .03; b = smooth(3.2, 3.6, tau) * rays; }
      else if (ro === 9) {   // retrieved chunks carried into the LLM
        const ray = Math.floor(k / 60), l = k % 60, nbk = nb[ray], u = smooth(3.9 + ray * .18, 5.3 + ray * .18, tau), sc = .6 + .4 * Math.sin(Math.PI * u);
        const ix = LLM[0] - .42, iy = LLM[1] - .5 + ray * .22;
        x = bz(nbk[0], nbk[0] + .3, ix - .3, ix, u) + ((l % 10) - 4.5) * .02 * sc; y = bz(nbk[1], nbk[1] + .5, iy + .3, iy, u) + (Math.floor(l / 10) - 2.5) * .02 * sc; z = bz(nbk[2], nbk[2], 0, 0, u);
        b = u > 0 && u < 1 ? .75 * Math.sin(Math.PI * u) ** .6 : 0;
      } else if (ro === 10) { const [px, py] = roundRect(.74, 1.7, .1, k / 300); x = LLM[0] + px; y = LLM[1] + py; z = 0; b = .42 + .3 * gen; }
      else if (ro === 11) {
        const layer = Math.floor(k / 120), node = Math.floor(k / 12) % 10;
        x = LLM[0] - .27 + node * .06 + jit[i3] * .014; y = LLM[1] - .62 + layer * .25 + jit[i3 + 1] * .014; z = jit[i3 + 2] * .02;
        b = .24 + .75 * Math.exp(-((tau - (5.2 + layer * .26)) ** 2) / .03) + gen * .3 * (.5 + .5 * Math.sin(tau * 14 - layer * 1.3 + node));
      } else if (ro === 12) { const [px, py] = roundRect(.8, 1.3, .08, k / 240); x = ANS[0] + px; y = ANS[1] + py; z = ANS[2]; b = .4 + .15 * gen; }
      else if (ro === 13) {   // answer tokens stream out of the LLM and settle as lines of text
        const l = Math.floor(k / 140), v = (k % 140) / 140, len = l === 9 ? .35 : .55 + .4 * hash(l, 3), a = 6.8 + k / 1400 * 2.5, u = smooth(a - .3, a, tau);
        const fx = ANS[0] - .32 + v * len * .64, fy = ANS[1] + .5 - l * .1, ex = LLM[0] + .37, ey = LLM[1] + .62;
        if (tau < 6.6) { x = fx; y = fy; z = ANS[2]; b = .42 * (1 - smooth(6.2, 6.6, tau)); }   // the previous answer stays until the next is written
        else { x = ex + (fx - ex) * u; y = ey + (fy - ey) * u; z = ANS[2] * u; b = tau < a - .3 ? 0 : .5 + .5 * Math.exp(-Math.max(0, tau - a) * 4); }
      } else {
        rot(sx[i], sy[i], sz[i], tmp); x = tmp[0]; y = tmp[1]; z = tmp[2];
        const d2 = (x - q[0]) ** 2 + (y - q[1]) ** 2 + (z - q[2]) ** 2; b = b0[i] + .35 * Math.exp(-d2 / .04) * grow * rays;
      }
      P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z; f.B[i] = b;
    }
  };
  return f;
}

// 7 · Campus network: redundant core routers, distribution and access switches, and the
// devices behind them. Packets cross device → access → distribution → core → back down.
// Midway through each cycle one core link fails; traffic reroutes through the other core
// until the link is restored.
function N_net() {
  const f = form({ cam: [1.1, 1.8, 7.4], look: [0, -.1, 0], spin: .05 }), r = rng(56); f.size = 1.2;
  const core = [[-.62, 1.22, 0], [.62, 1.22, 0]];
  const dist = [-2.1, -.7, .7, 2.1].map((x, k) => [x, .38, k % 2 ? .25 : -.25]);
  const acc = []; for (let k = 0; k < 12; k++) { const u = k / 11 - .5; acc.push([u * 5.6, -.48, .55 * Math.cos(u * Math.PI) - .3]); }
  const dev = []; acc.forEach((a, k) => { for (let j = 0; j < 8; j++) dev.push({ a: k, p: [a[0] + (j % 4 - 1.5) * .1, -1.32, a[2] + (Math.floor(j / 4) - .5) * .36] }); });
  const dOf = k => Math.floor(k / 3), DOWN = [0, 1], CYC = 12, OUT0 = 4.5, OUT1 = 8.5;   // the link core 0 ↔ distribution 1 fails
  const seg = (a, b, K = 10) => track([...a, ...b], K);
  const links = [{ tr: seg(core[0], core[1]), k: 'cc' }];
  core.forEach((c, i) => dist.forEach((d, j) => links.push({ tr: seg(c, d), k: i === DOWN[0] && j === DOWN[1] ? 'down' : 'cd' })));
  acc.forEach((a, k) => links.push({ tr: seg(dist[dOf(k)], a), k: 'da' }));
  dev.forEach(d => links.push({ tr: seg(acc[d.a], d.p, 4), k: 'ad' }));
  f.lines = trackLines(links.map(l => l.tr)); f.lineAlpha = .1;
  // routes between devices on different switches, one through each core
  const routes = [];
  for (let k = 0; k < 150; k++) {
    const A = dev[Math.floor(r() * dev.length)]; let B = A; while (B.a === A.a) B = dev[Math.floor(r() * dev.length)];
    const via = c => track([...A.p, ...acc[A.a], ...dist[dOf(A.a)], ...core[c], ...dist[dOf(B.a)], ...acc[B.a], ...B.p], 72);
    const pref = r() < .5 ? 0 : 1, hits = pref === DOWN[0] && (dOf(A.a) === DOWN[1] || dOf(B.a) === DOWN[1]);
    routes.push({ main: via(pref), alt: hits ? via(1 - pref) : null, sp: .16 + r() * .12, ph: r() });
  }
  const box = (c, w, h, e) => { const [x, y] = roundRect(w, h, Math.min(w, h) * .3, e); return [c[0] + x, c[1] + y, c[2]]; };
  const { role, idx } = split(3840, 1800, 1000, 900, 2700, 0);   // devices, access switches, distribution, core, link dust, packets
  const b0 = new Float32Array(N), g = new Uint16Array(N), aux = new Float32Array(N), jit = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const ro = role[i], k = idx[i], i3 = i * 3; let p;
    jit.set([gauss(r), gauss(r), gauss(r)], i3);
    if (ro === 0) { g[i] = k % dev.length; const d = dev[g[i]].p; p = [d[0] + jit[i3] * .018, d[1] + jit[i3 + 1] * .018, d[2] + jit[i3 + 2] * .018]; b0[i] = .3; }
    else if (ro === 1) { g[i] = Math.floor(k / 150); const l = k % 150; p = l < 120 ? box(acc[g[i]], .34, .1, l / 120) : [acc[g[i]][0] - .12 + (l - 120) / 29 * .24, acc[g[i]][1], acc[g[i]][2]]; aux[i] = l < 120 ? 0 : 1 + (l - 120) % 6; b0[i] = l < 120 ? .42 : .3; }
    else if (ro === 2) { g[i] = Math.floor(k / 250); const l = k % 250; p = l < 200 ? box(dist[g[i]], .5, .15, l / 200) : [dist[g[i]][0] - .19 + (l - 200) / 49 * .38, dist[g[i]][1], dist[g[i]][2]]; aux[i] = l < 200 ? 0 : 1 + (l - 200) % 8; b0[i] = l < 200 ? .5 : .32; }
    else if (ro === 3) { g[i] = Math.floor(k / 450); const l = k % 450; p = l < 300 ? box(core[g[i]], .74, .3, l / 300) : [core[g[i]][0] - .3 + ((l - 300) % 50) / 49 * .6, core[g[i]][1] - .08 + Math.floor((l - 300) / 50) * .053, core[g[i]][2]]; aux[i] = l < 300 ? 0 : 1; b0[i] = l < 300 ? .6 : .3; }
    else if (ro === 4) { g[i] = Math.floor(r() * links.length); aux[i] = r(); along(links[g[i]].tr, aux[i], f.P, i); p = [f.P[i3], f.P[i3 + 1], f.P[i3 + 2]]; b0[i] = links[g[i]].k === 'ad' ? .1 : .16; }
    else { g[i] = k % routes.length; aux[i] = Math.floor(k / routes.length); }
    if (p) f.P.set(p, i3);
  }
  f.update = t => {
    const tau = frac(t / CYC) * CYC, out = tau > OUT0 && tau < OUT1, tick = Math.floor(t * 8), warn = out ? .5 + .5 * Math.sin(t * 12) : 0;
    for (let i = 0; i < N; i++) {
      const ro = role[i], i3 = i * 3; let b = b0[i];
      if (ro === 0) b += hash(g[i], tick) > .97 ? .5 : 0;
      else if (ro === 1 || ro === 2) { if (aux[i]) b = hash(g[i], aux[i], tick) > .35 ? .85 : .15; if (ro === 2 && g[i] === DOWN[1]) b += .35 * warn; }
      else if (ro === 3) { if (aux[i]) b = .25 + .3 * (.5 + .5 * Math.sin(t * 3 + f.P[i3] * 9)); if (g[i] === DOWN[0]) b += .25 * warn; }
      else if (ro === 4) { if (links[g[i]].k === 'down' && out) b = .03 + .25 * warn * (hash(i, tick) > .5); }
      else {
        const R = routes[g[i]], m = aux[i], pos = Math.floor(m / 2), s = t * R.sp + R.ph + (m % 2) * .5, lap = Math.floor(s), u = s - lap - pos * .004;
        const start = frac(((lap - R.ph) / R.sp) / CYC) * CYC, useAlt = R.alt && start > OUT0 - 3.2 && start < OUT1 - 1.5;   // the path is chosen when the packet sets out
        along(useAlt ? R.alt : R.main, Math.max(0, u), f.P, i, jit[i3] * .006, jit[i3 + 1] * .006, jit[i3 + 2] * .006);
        b = u < 0 ? 0 : .95 * Math.max(0, 1 - pos / 22);
      }
      f.B[i] = Math.min(1, b);
    }
  };
  return f;
}

// ================================================================ QUANTUM
// 1 · Wave packet: a travelling wave packet drawn as the complex helix (Re, Im) with |ψ|² underneath.
function A_quantum() {
  const f = form({ cam: [2.2, 1.2, 6.4], look: [0, -.2, 0], spin: 0 }), r = rng(12);
  const xs = new Float32Array(N), role = new Uint8Array(N), k = new Float32Array(N);
  for (let i = 0; i < N; i++) { xs[i] = -3.3 + 6.6 * r(); const q = r(); role[i] = q < .45 ? 0 : q < .75 ? 1 : 2; k[i] = r(); }
  f.update = t => {
    const x0 = 1.7 * Math.sin(t * .35), sig = .75, kw = 6.5, w = 3.5, A = 1.05;
    for (let i = 0; i < N; i++) {
      const x = xs[i], env = Math.exp(-((x - x0) ** 2) / (2 * sig * sig)), ph = kw * x - w * t;
      let y, z, b;
      if (role[i] === 0) { y = A * env * Math.cos(ph); z = A * env * Math.sin(ph); b = .25 + .75 * env; }
      else if (role[i] === 1) { y = -1.75 + k[i] * 1.4 * env * env; z = 0; b = .12 + .6 * env * env; }
      else { const a = ph + k[i] * 6.283; y = A * env * Math.cos(a); z = A * env * Math.sin(a); b = .05 + .25 * env; }
      f.P[i * 3] = x; f.P[i * 3 + 1] = y + .35; f.P[i * 3 + 2] = z; f.B[i] = b;
    }
  };
  return f;
}

// 2 · VQE: the energy landscape E(θ₁, θ₂) of a two-parameter ansatz. The optimiser (the
// bright dot) descends with momentum and shot noise, slips past local minima and settles
// in the ground state; the curve on the back wall is energy per iteration.
function Q_vqe() {
  const f = form({ cam: [0, 2.6, 6.0], look: [0, -.35, -.4], spin: .04 }), r = rng(61); f.size = 1.15;
  const E = (x, z) => .26 * Math.cos(1.7 * x + .4) * Math.cos(2.2 * z - .3) + .16 * Math.sin(.9 * x - 1.2 * z + .6) + .08 * Math.cos(2.9 * x + 2.1 * z)
    - .8 * Math.exp(-((x - 1.3) ** 2 + (z + .35) ** 2) / 2.2) + .02 * x * x + .05 * z * z;
  const H = (x, z) => E(x, z) * 1.1 - .35;
  let gx = 0, gz = 0, ge = 1e9, hi = -1e9;
  for (let x = -3; x <= 3; x += .03) for (let z = -1.8; z <= 1.8; z += .03) { const e = E(x, z); hi = Math.max(hi, e); if (e < ge) { ge = e; gx = x; gz = z; } }
  // precompute optimiser runs (momentum + annealed shot noise) that reach the global minimum
  const STEPS = 160, runs = [];
  for (let s = 0; s < 400 && runs.length < 3; s++) {
    let x = -2.7 + r() * 1.6, z = (r() * 2 - 1) * 1.6, vx = 0, vz = 0, len = 0; const path = [x, z], en = [E(x, z)];
    for (let k = 0; k < STEPS; k++) {
      const e = 1e-3, dx = (E(x + e, z) - E(x - e, z)) / (2 * e), dz = (E(x, z + e) - E(x, z - e)) / (2 * e), noise = .009 * Math.max(0, 1 - k / 110);
      vx = .88 * vx - .04 * dx + gauss(r) * noise; vz = .88 * vz - .04 * dz + gauss(r) * noise;
      const nx = clamp(x + vx, -2.95, 2.95), nz = clamp(z + vz, -1.75, 1.75); len += Math.hypot(nx - x, nz - z); x = nx; z = nz;
      path.push(x, z); en.push(E(x, z) + gauss(r) * .012 * Math.max(.15, 1 - k / STEPS));
    }
    if (Math.hypot(x - gx, z - gz) < .1 && len > 3.5) runs.push({ path, en });
  }
  if (!runs.length) { const path = [], en = []; for (let k = 0; k <= STEPS; k++) { const u = 1 - (1 - k / STEPS) ** 3, x = -2.4 + (gx + 2.4) * u, z = 1.2 + (gz - 1.2) * u; path.push(x, z); en.push(E(x, z)); } runs.push({ path, en }); }
  const eTop = Math.max(...runs.map(R => Math.max(...R.en)));
  const at = (R, s) => { const k = Math.min(STEPS - 1, Math.floor(s)), u = clamp(s - k, 0, 1), p = R.path; return [p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * u, p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * u, R.en[k] + (R.en[k + 1] - R.en[k]) * u]; };
  // the landscape sheet is static: positions and base brightness (depth + contour lines) once
  const b0 = new Float32Array(SHEET);
  for (let i = 0; i < SHEET; i++) {
    const x = (i % SHEET_W) / (SHEET_W - 1) * 6 - 3, z = Math.floor(i / SHEET_W) / (SHEET_H - 1) * 3.6 - 1.8, e = E(x, z), c = frac((e + 1) * 8);
    f.P[i * 3] = x; f.P[i * 3 + 1] = e * 1.1 - .35; f.P[i * 3 + 2] = z;
    b0[i] = .16 + .3 * (1 - (e - ge) / (hi - ge)) + .32 * (1 - smooth(0, .09, Math.min(c, 1 - c)));
  }
  const jit = new Float32Array(N * 3); for (let i = SHEET; i < N; i++) jit.set([gauss(r), gauss(r), gauss(r)], i * 3);
  const CYC = 10, RUN = 7.5, gy = H(gx, gz);
  f.update = t => {
    const tau = frac(t / CYC) * CYC, R = runs[Math.floor(t / CYC) % runs.length], s = Math.min(1, tau / RUN) * STEPS;
    const [dx, dz] = at(R, s), dy = H(dx, dz), conv = smooth(RUN - .3, RUN + .5, tau), fade = 1 - smooth(CYC - .5, CYC, tau), appear = smooth(0, .4, tau);
    for (let i = 0; i < SHEET; i++) { const ex = f.P[i * 3] - dx, ez = f.P[i * 3 + 2] - dz; f.B[i] = b0[i] + .45 * Math.exp(-(ex * ex + ez * ez) / .09) * appear * fade; }
    for (let j = 0; j < N - SHEET; j++) {
      const i = SHEET + j, i3 = i * 3; let x, y, z, b;
      if (j < 360) {   // the optimiser: a dense glowing dot with a soft halo
        const sg = j < 240 ? .035 : .09; x = dx + jit[i3] * sg; y = dy + .07 + jit[i3 + 1] * sg; z = dz + jit[i3 + 2] * sg; b = (j < 240 ? 1 : .35) * appear * fade;
      } else if (j < 860) {   // trail of every step taken so far
        const v = (j - 360) / 499, p = at(R, s * v); x = p[0]; y = H(p[0], p[1]) + .025; z = p[1]; b = (.2 + .6 * v * v) * appear * fade;
      } else if (j < 1220) {   // energy vs iteration on the back wall
        const v = (j - 860) / 359, it = v * STEPS, p = at(R, Math.min(it, s)); x = -2.4 + Math.min(v, s / STEPS) * 4.8; y = .22 + (p[2] - ge) / (eTop - ge) * .8; z = -2.05; b = it <= s ? .7 * fade : 0;
      } else if (j < 1360) { const d = Math.floor((j - 1220) / 7), w = ((j - 1220) % 7) / 7; x = -2.4 + (d + w * .55) / 20 * 4.8; y = .22; z = -2.05; b = .4; }   // exact ground-state energy (dashed)
      else if (j < 1420) { x = -2.45; y = .18 + (j - 1360) / 59 * .88; z = -2.05; b = .28; }
      else { const a = (j - 1420) / 180 * 6.283; x = gx + Math.cos(a) * .2; y = gy + .02; z = gz + Math.sin(a) * .2; b = .16 + .7 * conv * fade; }   // ground-state marker
      f.P[i3] = x; f.P[i3 + 1] = y; f.P[i3 + 2] = z; f.B[i] = b;
    }
  };
  return f;
}

// 3 · Quantum walk: a continuous-time walk on a graph, ψ(t) = e^{−iHt}|start⟩ with H = −A.
// The walker is in superposition over every node: column height is the probability of
// finding it there, the clock hand is the phase of its amplitude, and flow along the
// edges is the probability current.
function Q_walk() {
  const f = form({ cam: [0, 3.3, 6.1], look: [0, -.55, 0], spin: .06 }), r = rng(62), Y = -.95; f.size = 1.25;
  const nodes = [];
  for (let tries = 0; nodes.length < 24 && tries < 20000; tries++) {
    const x = (r() * 2 - 1) * 2.6, z = (r() * 2 - 1) * 1.45;
    if ((x / 2.7) ** 2 + (z / 1.5) ** 2 < 1 && nodes.every(n => (n.x - x) ** 2 + (n.z - z) ** 2 > .55 ** 2)) nodes.push({ x, z });
  }
  const n = nodes.length, seen = new Set(), edges = [];
  const addE = (a, b) => { const key = Math.min(a, b) * 64 + Math.max(a, b); if (a !== b && !seen.has(key)) { seen.add(key); edges.push([Math.min(a, b), Math.max(a, b)]); } };
  const d2 = (a, b) => (nodes[a].x - nodes[b].x) ** 2 + (nodes[a].z - nodes[b].z) ** 2;
  nodes.forEach((_, i) => nodes.map((_, j) => j).filter(j => j !== i).sort((p, q) => d2(i, p) - d2(i, q)).slice(0, 3).forEach(j => addE(i, j)));
  const par = [...Array(n).keys()], find = a => par[a] === a ? a : (par[a] = find(par[a]));
  edges.forEach(([a, b]) => { par[find(a)] = find(b); });
  for (;;) {   // join any disconnected pieces through their closest pair
    let best = null;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (find(i) !== find(j) && (!best || d2(i, j) < best[2])) best = [i, j, d2(i, j)];
    if (!best) break; addE(best[0], best[1]); par[find(best[0])] = find(best[1]);
  }
  const Adj = new Float64Array(n * n); edges.forEach(([a, b]) => { Adj[a * n + b] = Adj[b * n + a] = 1; });
  const { vals, vecs } = eigSym(Adj, n), mu = vals.map(v => -v);
  const byX = nodes.map((_, i) => i).sort((a, b) => nodes[a].x - nodes[b].x), byZ = nodes.map((_, i) => i).sort((a, b) => nodes[a].z - nodes[b].z);
  const starts = [byX[0], byX[n - 1], byZ[0], byZ[n - 1]];
  f.lines = new Float32Array(edges.flatMap(([a, b]) => [nodes[a].x, Y, nodes[a].z, nodes[b].x, Y, nodes[b].z])); f.lineAlpha = .16;

  const { role, idx } = split(n * 120, n * 140, n * 56, n * 24, 0);   // node clouds, probability columns, phase rings, phase hands, edge flow
  const nd = new Uint16Array(N), v = new Float32Array(N), jit = new Float32Array(N * 3), u0 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const ro = role[i], k = idx[i];
    if (ro === 0) { nd[i] = Math.floor(k / 120); const g = [gauss(r), gauss(r), gauss(r)], m = Math.hypot(...g) || 1, rr = Math.cbrt(r()); jit.set(g.map(c => c / m * rr), i * 3); }
    else if (ro === 1) { nd[i] = Math.floor(k / 140); v[i] = (k % 140) / 139; jit.set([gauss(r) * .012, 0, gauss(r) * .012], i * 3); }
    else if (ro === 2) { nd[i] = Math.floor(k / 56); v[i] = (k % 56) / 56 * 6.283; }
    else if (ro === 3) { nd[i] = Math.floor(k / 24); v[i] = (k % 24) / 23; }
    else { nd[i] = k % edges.length; u0[i] = r(); jit.set([gauss(r) * .012, gauss(r) * .012, gauss(r) * .012], i * 3); }
  }
  const re = new Float64Array(n), im = new Float64Array(n), prob = new Float64Array(n), flow = new Float64Array(edges.length), J = new Float64Array(edges.length);
  const CYC = 12; let last = null;
  f.update = t => {
    const dt = last === null ? 0 : clamp(t - last, 0, .05); last = t;
    const c = Math.floor(t / CYC), tau = t - c * CYC, j0 = starts[c % starts.length], s = tau * .55, env = smooth(0, .8, tau) * (1 - smooth(CYC - 1.2, CYC, tau));
    re.fill(0); im.fill(0);
    for (let k = 0; k < n; k++) { const w = vecs[j0 * n + k], cs = Math.cos(mu[k] * s) * w, sn = Math.sin(mu[k] * s) * w; for (let j = 0; j < n; j++) { const vk = vecs[j * n + k]; re[j] += cs * vk; im[j] -= sn * vk; } }
    for (let j = 0; j < n; j++) prob[j] = re[j] * re[j] + im[j] * im[j];
    // probability current a → b for H = −A
    edges.forEach(([a, b], e) => { J[e] = 2 * (im[b] * re[a] - re[b] * im[a]); flow[e] += J[e] * dt * 2.2 * env; });
    for (let i = 0; i < N; i++) {
      const ro = role[i], i3 = i * 3; let x, y, z, b;
      if (ro < 4) {
        const j = nd[i], N0 = nodes[j], p = prob[j], amp = Math.sqrt(p), ph = Math.atan2(im[j], re[j]);
        if (ro === 0) { const rad = .05 + .2 * Math.sqrt(p * env); x = N0.x + jit[i3] * rad; y = Y + jit[i3 + 1] * rad; z = N0.z + jit[i3 + 2] * rad; b = .32 + .68 * amp * env; }
        else if (ro === 1) { const h = Math.min(2.3, 4.2 * p) * env; x = N0.x + jit[i3]; y = Y + v[i] * h; z = N0.z + jit[i3 + 2]; b = (.28 + .72 * v[i]) * Math.min(1, .2 + p * 6) * (.1 + .9 * smooth(0, .06, h)); }
        else if (ro === 2) { x = N0.x + Math.cos(v[i]) * .26; y = Y; z = N0.z + Math.sin(v[i]) * .26; b = .12 + .7 * amp * env * Math.exp(-(angDiff(v[i], ph) ** 2) / .25); }
        else { const len = .26 * Math.min(1, amp * 1.8) * env; x = N0.x + Math.cos(ph) * len * v[i]; y = Y + .005; z = N0.z + Math.sin(ph) * len * v[i]; b = (.25 + .6 * amp) * env; }
      } else {
        const e = nd[i], [a, bb] = edges[e], A = nodes[a], B = nodes[bb], u = frac(u0[i] + flow[e]);
        x = A.x + (B.x - A.x) * u + jit[i3]; y = Y + .02 + jit[i3 + 1]; z = A.z + (B.z - A.z) * u + jit[i3 + 2]; b = .08 + Math.min(.85, Math.abs(J[e]) * 5) * env;
      }
      f.P[i3] = x; f.P[i3 + 1] = y; f.P[i3 + 2] = z; f.B[i] = b;
    }
  };
  return f;
}

// 4 · Grover graph colouring: three-colour a four-node planar graph (two triangles sharing
// an edge). Two qubits per node give 256 basis states, drawn as amplitude bars; the 6 valid
// colourings are marked. Each iteration the oracle flips their sign, then diffusion reflects
// every amplitude about the mean (the dashed line), so the valid ones grow. After 5
// iterations a measurement lands on a valid colouring and the graph takes its colours.
// Node colours flicker with each node's colour probabilities while the register is in superposition.
function Q_grover() {
  const f = form({ cam: [0, .3, 7.3], look: [0, -.05, 0], spin: 0 }), r = rng(63); f.size = 1.2;
  const HUE = ['#bd99ff', '#ff8ad8', '#86b8ff'].map(c => new THREE.Color(c)), GREY = new THREE.Color('#5d5a70');
  const nodes = [[-2.2, .95, 0], [-2.85, .02, 0], [-1.55, .02, 0], [-2.2, -.92, 0]], edges = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3]];
  const S = 256, col = (s, n) => (s >> (2 * n)) & 3;
  const valid = s => { for (let n = 0; n < 4; n++) if (col(s, n) === 3) return false; return edges.every(([a, b]) => col(s, a) !== col(s, b)); };
  const marked = []; for (let s = 0; s < S; s++) if (valid(s)) marked.push(s);
  const M = marked.length, th = Math.asin(Math.sqrt(M / S)), ITER = 5;
  const amp = k => [Math.sin((2 * k + 1) * th) / Math.sqrt(M), Math.cos((2 * k + 1) * th) / Math.sqrt(S - M)];   // [marked, unmarked] before iteration k
  const isM = new Uint8Array(S); marked.forEach(s => { isM[s] = 1; });
  const cm = nodes.map((_, n) => [0, 1, 2, 3].map(c => marked.filter(s => col(s, n) === c).length));   // marked states per node colour (64 states each)
  const BX0 = -.95, BX1 = 2.95, AX = -.25, SC = 3.9, bx = s => BX0 + (BX1 - BX0) * (s + .5) / S;
  f.lines = new Float32Array(edges.flatMap(([a, b]) => [...nodes[a], ...nodes[b]])); f.lineAlpha = .14;
  const { role, idx } = split(3600, 1000, 10240, 420, 0);   // nodes, edges, amplitude bars, mean line, axis
  const g = new Uint16Array(N), v = new Float32Array(N), jit = new Float32Array(N * 3);
  f.K = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const ro = role[i], k = idx[i], i3 = i * 3;
    jit.set([gauss(r), gauss(r), gauss(r)], i3);
    let c = HUE[0];
    if (ro === 0) { g[i] = Math.floor(k / 900); const m = Math.hypot(jit[i3], jit[i3 + 1], jit[i3 + 2]) || 1, rad = k % 900 < 600 ? .2 : .2 * Math.cbrt(r()); f.P.set(nodes[g[i]].map((q, a) => q + jit[i3 + a] / m * rad), i3); }
    else if (ro === 1) { g[i] = Math.floor(k / 200); v[i] = (k % 200) / 199; const [a, b] = edges[g[i]]; f.P.set(nodes[a].map((q, e) => q + (nodes[b][e] - q) * v[i] + jit[i3 + e] * .008), i3); }
    else if (ro === 2) { g[i] = Math.floor(k / 40); v[i] = (k % 40 + .5) / 40; if (isM[g[i]]) c = HUE[1]; }
    else if (ro === 3) v[i] = (k + .5) / 420;
    else { v[i] = (k + .5) / (N - 15260); f.P.set([BX0 + (BX1 - BX0) * v[i], AX, 0], i3); }
    f.K[i3] = c.r; f.K[i3 + 1] = c.g; f.K[i3 + 2] = c.b;
  }
  const P = new Float64Array(4), CYC = 16, T0 = 1.2, IT = 2.1, ORA = .6, DIF = 1, TM = T0 + ITER * IT + .2;
  f.update = t => {
    const tau = frac(t / CYC) * CYC, chosen = marked[Math.floor(t / CYC) % M], fade = 1 - smooth(CYC - .8, CYC, tau);
    let a, b, mean = null, meas = 0;
    if (tau < T0) { a = b = amp(0)[0] * smooth(0, T0, tau); }                 // Hadamards: uniform superposition
    else if (tau < T0 + ITER * IT) {
      const k = Math.floor((tau - T0) / IT), l = tau - T0 - k * IT, [ak, bk] = amp(k), [an, bn] = amp(k + 1);
      const o = smooth(0, ORA, l), d = smooth(ORA + .15, ORA + .15 + DIF, l);
      a = d > 0 ? -ak + (an + ak) * d : ak * (1 - 2 * o); b = bk + (bn - bk) * d;
      if (l > ORA && l < ORA + .3 + DIF) mean = (M * -ak + (S - M) * bk) / S;   // oracle done: reflect about this mean
    } else { [a, b] = amp(ITER); meas = smooth(TM, TM + .5, tau); }
    // colour probabilities per node from the amplitudes, collapsing to the measured colouring
    const tick = Math.floor(t * 9);
    for (let i = 0; i < N; i++) {
      const ro = role[i], i3 = i * 3;
      if (ro === 0) {
        const n = g[i], cc = col(chosen, n); let tot = 0;
        for (let c = 0; c < 4; c++) { P[c] = a * a * cm[n][c] + b * b * (64 - cm[n][c]); tot += P[c]; }
        for (let c = 0; c < 4; c++) P[c] = (P[c] / (tot || 1)) * (1 - meas) + (c === cc ? meas : 0);
        let u = hash(i, tick), c = 0; while (c < 3 && u > P[c]) { u -= P[c]; c++; }
        const C = c === 3 ? GREY : HUE[c]; f.K[i3] = C.r; f.K[i3 + 1] = C.g; f.K[i3 + 2] = C.b;
        f.B[i] = (c === 3 ? .35 : .6 + .35 * meas) * (.35 + .65 * fade) * (tau < T0 ? .5 + .5 * smooth(0, T0, tau) : 1);
      } else if (ro === 1) f.B[i] = .22 + .3 * meas * fade;
      else if (ro === 2) {
        const s = g[i], m = isM[s], h = (m ? (s === chosen ? a + (1.6 / SC - a) * meas : a * (1 - meas)) : b * (1 - meas)) * SC * fade;
        const pick = s === chosen ? meas : 0;   // the measured outcome widens into a bright column
        f.P[i3] = bx(s) + jit[i3] * (.0035 + .012 * pick); f.P[i3 + 1] = AX + h * v[i]; f.P[i3 + 2] = jit[i3 + 2] * .01;
        f.B[i] = Math.abs(h) < .004 ? 0 : (m ? .85 + .15 * pick : .42) * (.55 + .45 * v[i]);
      } else if (ro === 3) {
        const x = BX0 + (BX1 - BX0) * v[i];
        f.P[i3] = x; f.P[i3 + 1] = AX + (mean ?? 0) * SC; f.P[i3 + 2] = 0; f.B[i] = mean === null || frac(v[i] * 36) > .55 ? 0 : .8;
      } else f.B[i] = .22;
    }
  };
  return f;
}

// 5 · Double slit: single particles build an interference pattern.
function B_quantum() {
  const f = form({ cam: [0, 0, 7], look: [0, 0, 0], spin: 0 }), r = rng(22);
  const role = new Uint8Array(N), land = new Float32Array(N), arrive = new Float32Array(N), slit = new Float32Array(N), s = new Float32Array(N), j = new Float32Array(N);
  const I = y => { const a = Math.PI * 1.9 * y, b = Math.PI * .45 * y; const sinc = Math.abs(b) < 1e-6 ? 1 : Math.sin(b) / b; return Math.cos(a) ** 2 * sinc * sinc; };
  for (let i = 0; i < N; i++) {
    const q = r(); role[i] = q < .08 ? 0 : q < .26 ? 1 : 2; s[i] = r(); j[i] = gauss(r);
    if (role[i] === 2) { let y; do { y = (r() * 2 - 1) * 1.9; } while (r() > I(y)); land[i] = y; arrive[i] = r(); slit[i] = r() < .5 ? -.38 : .38; }
  }
  const cycle = 14, xb = -.9, xs = 2.8, flight = 1.3;
  f.update = t => {
    const c = frac(t / cycle) * cycle;
    for (let i = 0; i < N; i++) {
      let x, y, b;
      if (role[i] === 0) { y = -2 + 4 * s[i]; x = xb + j[i] * .02; if (Math.abs(Math.abs(y) - .38) < .07) { y = 2.1; b = 0; } else b = .45; }
      else if (role[i] === 1) {
        const slitY = s[i] < .5 ? -.38 : .38, rad = frac(t * .35 + frac(s[i] * 7.3)) * 3.9, ang = (frac(s[i] * 31.7) - .5) * 2.4;
        x = xb + rad * Math.cos(ang); y = slitY + rad * Math.sin(ang);
        b = x > xs || Math.abs(y) > 2 ? 0 : .06 + .12 * I(y) * (1 - rad / 3.9);
      } else {
        const ta = arrive[i] * (cycle - 2) + flight, dt = c - (ta - flight);
        if (dt < 0) { x = -3.2; y = j[i] * .03; b = 0; }
        else if (dt < flight) {
          const u = dt / flight, ux = xb + 3.2;
          const d1 = ux, d2 = Math.hypot(xs - xb, land[i] - slit[i]), tot = d1 + d2, dd = u * tot;
          if (dd < d1) { x = -3.2 + dd; y = slit[i] * dd / d1; } else { const v = (dd - d1) / d2; x = xb + (xs - xb) * v; y = slit[i] + (land[i] - slit[i]) * v; }
          b = 1;
        } else { x = xs + Math.abs(j[i]) * .05; y = land[i]; b = .55; }
      }
      f.P[i * 3] = x; f.P[i * 3 + 1] = y; f.P[i * 3 + 2] = 0; f.B[i] = b;
    }
  };
  return f;
}
// 6 · Orbital: hydrogen 2p_z + 3d_z² superposition; brightness beats with the relative phase.
function C_quantum() {
  const f = form({ cam: [0, .6, 6.2], look: [0, 0, 0], spin: .15 }), r = rng(32);
  const a = new Float32Array(N), b2 = new Float32Array(N);
  let n = 0;
  while (n < N) {
    const x = (r() * 2 - 1) * 16, y = (r() * 2 - 1) * 16, z = (r() * 2 - 1) * 18, rr = Math.hypot(x, y, z);
    const p1 = z * Math.exp(-rr / 2) / .736, p2 = (3 * z * z - rr * rr) * Math.exp(-rr / 3) / 9.74, rho = .5 * p1 * p1 + .5 * p2 * p2;
    if (r() < rho * 1.6) { f.P.set([x * .13, z * .13, y * .13], n * 3); a[n] = p1; b2[n] = p2; n++; }
  }
  f.update = t => { for (let i = 0; i < N; i++) f.B[i] = clamp((.5 * a[i] ** 2 + .5 * b2[i] ** 2 + a[i] * b2[i] * Math.cos(1.3 * t)) * 2.2, .04, 1); };
  return f;
}

// ---------------------------------------------------------------- one sheet of particles reshaped
const SHEET_W = 150, SHEET_H = 96, SHEET = SHEET_W * SHEET_H;
function sheet(view, height, extra) {
  const f = form(view);
  const gx = i => (i % SHEET_W) / (SHEET_W - 1) * 6 - 3, gz = i => Math.floor(i / SHEET_W) / (SHEET_H - 1) * 3.6 - 1.8;
  f.update = t => {
    for (let i = 0; i < SHEET; i++) { const x = gx(i), z = gz(i), [y, b] = height(x, z, t); f.P[i * 3] = x; f.P[i * 3 + 1] = y; f.P[i * 3 + 2] = z; f.B[i] = b; }
    extra?.(f, t);
  };
  return f;
}
// 4 · Particle in a box: a 2D box in a superposition of four eigenstates.
function D_quantum() {
  const r = rng(42), extra = N - SHEET, sx = new Float32Array(extra), sz = new Float32Array(extra);
  const psi = (x, z, t) => {
    const X = (x + 3) / 6, Z = (z + 1.8) / 3.6, ph = (n, m) => Math.sin(n * Math.PI * X) * Math.sin(m * Math.PI * Z);
    const terms = [[1, 1, 2], [2, 1, 5], [1, 2, 5.6], [3, 2, 12]];
    let re = 0, im = 0; for (const [n, m, E] of terms) { const a = ph(n, m); re += a * Math.cos(E * t * .35); im -= a * Math.sin(E * t * .35); }
    return (re * re + im * im) / 4;
  };
  for (let k = 0; k < extra; k++) { sx[k] = (r() * 2 - 1) * 3; sz[k] = (r() * 2 - 1) * 1.8; }
  return sheet({ cam: [0, 3.1, 5.4], look: [0, -.2, 0], spin: .06 }, (x, z, t) => { const p = psi(x, z, t); return [p * 1.1 - .7, .2 + .8 * clamp(p, 0, 1)]; }, (f, t) => {
    for (let k = 0; k < extra; k++) { const i = SHEET + k, p = psi(sx[k], sz[k], t); f.P[i * 3] = sx[k]; f.P[i * 3 + 1] = p * 1.1 - .7 + .25 + p * .5; f.P[i * 3 + 2] = sz[k]; f.B[i] = clamp(p * p * 1.2, 0, 1); }
  });
}

// ================================================================ QUANT
// 1 · Price tape: a live price line, candlesticks and the return distribution at the edge.
function A_quant() {
  const f = form({ cam: [0, 0, 7.2], look: [0, 0, 0], spin: 0 }), r = rng(13);
  const M = 4000, price = new Float32Array(M); let p = 0;
  for (let i = 0; i < M; i++) { p += gauss(r) * .045 + .002; price[i] = p; }
  const role = new Uint8Array(N), s = new Float32Array(N), j = new Float32Array(N);
  for (let i = 0; i < N; i++) { const q = r(); role[i] = q < .36 ? 0 : q < .66 ? 1 : q < .9 ? 2 : 3; s[i] = r(); j[i] = gauss(r); }
  const W = 240, candles = 40, per = W / candles;
  f.update = t => {
    const offF = t * 9, off = Math.floor(offF);
    let lo = 1e9, hi = -1e9;
    for (let q = 0; q <= W; q++) { const v = price[(off + q) % M]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const mid = (lo + hi) / 2, sc = 2.6 / Math.max(hi - lo, .5);
    const py = q => (price[(off + q) % M] - mid) * sc + .25;
    for (let i = 0; i < N; i++) {
      let x, y, z = 0, b;
      if (role[i] === 0) { const q = s[i] * W, q0 = Math.floor(q), fr = q - q0; x = -3 + 5 * q / W; y = py(q0) * (1 - fr) + py(q0 + 1) * fr + j[i] * .008; b = .35 + .65 * s[i] ** 3; }
      else if (role[i] === 1) {
        const c = Math.floor(s[i] * candles), a = c * per, o = py(a), cl = py(a + per); let h = -1e9, l = 1e9;
        for (let q = a; q <= a + per; q++) { const v = py(q); h = Math.max(h, v); l = Math.min(l, v); }
        const body = frac(s[i] * candles * 7) < .7;
        x = -3 + 5 * (a + per / 2) / W + (body ? j[i] * .025 : 0);
        const tt = frac(s[i] * candles * 13);
        y = body ? Math.min(o, cl) + tt * Math.abs(cl - o) : l + tt * (h - l);
        b = cl >= o ? .55 : .25; z = -.15;
      } else if (role[i] === 2) {
        const yy = j[i] * .55 + .25, dens = Math.exp(-((yy - .25) ** 2) / (2 * .55 * .55));
        x = 2.25 + s[i] * dens * 1.05; y = yy; b = .25 + .5 * dens;
      } else { x = -3 + 5 * s[i]; const v = Math.abs(Math.sin(s[i] * 97 + off * .07)) * .45; y = -1.95 + frac(j[i] * 13.1) * v; b = .15; }
      f.P[i * 3] = x; f.P[i * 3 + 1] = y; f.P[i * 3 + 2] = z; f.B[i] = b;
    }
  };
  return f;
}
// 2 · Galton board: random left/right bounces stack into the normal curve.
function B_quant() {
  const f = form({ cam: [0, -.2, 7.6], look: [0, -.2, 0], spin: 0 }), r = rng(23);
  const rows = 12, dx = .26, top = 1.75, dy = .2, binY = -1.95;
  const role = new Uint8Array(N), start = new Float32Array(N), bits = new Uint16Array(N), bin = new Uint8Array(N), stack = new Float32Array(N), s = new Float32Array(N);
  const counts = new Array(rows + 1).fill(0), order = [];
  for (let i = 0; i < N; i++) {
    const q = r(); s[i] = r(); role[i] = q < .07 ? 0 : q < .14 ? 1 : 2;
    if (role[i] === 2) { let m = 0, k = 0; for (let b = 0; b < rows; b++) if (r() < .5) { m |= 1 << b; k++; } bits[i] = m; bin[i] = k; start[i] = r(); order.push(i); }
  }
  order.sort((a, b) => start[a] - start[b]).forEach(i => { stack[i] = counts[bin[i]]++; });
  const cycle = 16, fall = 2.2, maxStack = Math.max(...counts);
  f.update = t => {
    const c = frac(t / cycle) * cycle;
    for (let i = 0; i < N; i++) {
      let x, y, b;
      if (role[i] === 0) { const k = Math.floor(s[i] * (rows * (rows + 1) / 2)); let row = 0, acc = 0; while (acc + row + 1 <= k) { acc += row + 1; row++; } const col = k - acc; x = (col - row / 2) * dx; y = top - row * dy - .1; b = .5; }
      else if (role[i] === 1) {
        // binomial(12, ½) → normal with σ = ½·√rows bins; peak matches the tallest expected stack
        const xx = (s[i] - .5) * 3.6, sd = .5 * Math.sqrt(rows) * dx, peak = counts[rows / 2] / maxStack;
        x = xx; y = binY + 1.55 * peak * Math.exp(-(xx * xx) / (2 * sd * sd)); b = .35;
      }
      else {
        const ts = start[i] * (cycle - fall - 2), dt = c - ts;
        if (dt < 0) { x = 0; y = top + .3; b = 0; }
        else if (dt < fall) {
          const u = dt / fall * rows, k = Math.min(rows - 1, Math.floor(u)), fr = u - k;
          let pos = 0; for (let q = 0; q < k; q++) pos += (bits[i] >> q & 1) ? .5 : -.5;
          const nxt = pos + ((bits[i] >> k & 1) ? .5 : -.5);
          x = (pos + (nxt - pos) * fr) * dx; y = top - (k + fr) * dy - Math.sin(fr * Math.PI) * -.05; b = 1;
        } else { x = (bin[i] - rows / 2) * dx + (s[i] - .5) * .16; y = binY + stack[i] / maxStack * 1.55; b = .6; }
      }
      f.P[i * 3] = x; f.P[i * 3 + 1] = y; f.P[i * 3 + 2] = 0; f.B[i] = b;
    }
  };
  return f;
}
// 3 · Black–Scholes: the call surface C(S, τ); simulated paths ride it toward expiry.
function C_quant() {
  const f = form({ cam: [2.2, 2.4, 6.2], look: [0, -.4, 0], spin: .08 }), r = rng(33);
  const erf = x => { const s = Math.sign(x), t = 1 / (1 + .3275911 * Math.abs(x)); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x)); };
  const cdf = x => .5 * (1 + erf(x / Math.SQRT2)), K = 100, rf = .03, sig = .3;
  const call = (S, tau) => { if (tau < 1e-4) return Math.max(S - K, 0); const d1 = (Math.log(S / K) + (rf + sig * sig / 2) * tau) / (sig * Math.sqrt(tau)); return S * cdf(d1) - K * Math.exp(-rf * tau) * cdf(d1 - sig * Math.sqrt(tau)); };
  const toX = S => (S - 100) / 40 * 2.4, toZ = tau => (tau - .5) * 3, toY = c => c / 22 - 1.2;
  const grid = Math.floor(N * .72), gw = 120, gh = Math.floor(grid / gw), paths = 36, per = Math.floor((N - gw * gh) / paths);
  const pathS = [];
  for (let p = 0; p < paths; p++) { const row = [100 * Math.exp(gauss(r) * .02)]; for (let k = 1; k < 200; k++) row.push(row[k - 1] * Math.exp(gauss(r) * sig * Math.sqrt(1 / 200) - sig * sig / 400)); pathS.push(row); }
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const i = gy * gw + gx, S = 60 + 80 * gx / (gw - 1), tau = .02 + .98 * gy / (gh - 1);
    f.P.set([toX(S), toY(call(S, tau)), toZ(tau)], i * 3);
    const d1 = (Math.log(S / K) + (rf + sig * sig / 2) * tau) / (sig * Math.sqrt(tau)), gamma = Math.exp(-d1 * d1 / 2) / (S * sig * Math.sqrt(tau) * 2.5066);
    f.B[i] = clamp(.3 + gamma * 14, .3, 1);
  }
  const base = gw * gh;
  f.update = t => {
    for (let p = 0; p < paths; p++) for (let q = 0; q < per; q++) {
      const i = base + p * per + q; if (i >= N) continue;
      const head = frac(t * .09 + p / paths) * 200, k = Math.max(0, Math.floor(head - q * .25));
      const tau = 1 - k / 200, S = pathS[p][Math.min(199, k)];
      f.P[i * 3] = toX(S); f.P[i * 3 + 1] = toY(call(S, tau)) + .03; f.P[i * 3 + 2] = toZ(tau); f.B[i] = q < 3 ? 1 : Math.max(0, .8 - q / per);
    }
  };
  return f;
}
// 5 · Self-custody wallet: a phone inside its device boundary, ringed by seven networks.
// Each payment is reviewed on screen (recipient, network, amount, fee), signed on the
// device (the key never leaves the boundary), then broadcast to a network, which confirms
// it into a block. Payments also arrive from the networks and lift the balance.
function T_wallet() {
  const f = form({ cam: [0, 1.6, 7.2], look: [0, -.1, 0], spin: .04 }), r = rng(71); f.size = 1.2;
  const PH = [0, .02, .45], NET = 7, RX = 2.65, RZ = 1.25;
  const netAt = (k, t, out) => { const a = (k + .5) / NET * Math.PI * 2 + t * .05; out[0] = RX * Math.cos(a); out[1] = -.52 + .16 * Math.sin(2 * a + k); out[2] = RZ * Math.sin(a); return out; };
  const scr = (x, y) => [PH[0] + x, PH[1] + y, PH[2]];
  const { role, idx } = split(700, 220, 440, 200, 120, 500, 2100, 1120, 900, 600, 0);
  // roles: 0 phone outline, 1 balance, 2 review rows, 3 sign button, 4 key, 5 device boundary,
  //        6 networks, 7 blocks, 8 outgoing payments, 9 incoming payments, 10 orbit band
  const g = new Uint16Array(N), v = new Float32Array(N), w = new Float32Array(N), jit = new Float32Array(N * 3), b0 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const ro = role[i], k = idx[i], i3 = i * 3; let p = null;
    jit.set([gauss(r), gauss(r), gauss(r)], i3);
    if (ro === 0) { const [x, y] = roundRect(1.02, 1.98, .16, k / 700); p = scr(x, y); b0[i] = .55; }
    else if (ro === 1) { v[i] = k < 150 ? k / 150 : (k - 150) / 70; p = k < 150 ? scr(-.3 + v[i] * .6, .6) : scr(-.3 + v[i] * .34, .5); b0[i] = k < 150 ? .6 : .3; }
    else if (ro === 2) { g[i] = Math.floor(k / 110); const l = k % 110, y = .28 - g[i] * .15, len = [.42, .3, .36, .2][g[i]]; p = l < 20 ? scr(-.33 + jit[i3] * .012, y + jit[i3 + 1] * .012) : scr(-.22 + (l - 20) / 89 * len, y); }
    else if (ro === 3) { const [x, y] = roundRect(.6, .17, .085, k / 200); p = scr(x, -.5 + y); }
    else if (ro === 4) {   // a key glyph on the button: bow, shaft and bit
      if (k < 60) { const a = k / 60 * 6.283; p = scr(-.17 + .04 * Math.cos(a), -.5 + .04 * Math.sin(a)); }
      else if (k < 100) p = scr(-.13 + (k - 60) / 39 * .17, -.5);
      else p = scr(.02 + ((k - 100) % 2) * .025, -.5 - (k - 100) / 19 * .045);
    }
    else if (ro === 5) { v[i] = k / 500; const a = v[i] * 6.283; p = [PH[0] + .92 * Math.cos(a), PH[1] + 1.38 * Math.sin(a), PH[2] - .02]; }
    else if (ro === 6) { g[i] = Math.floor(k / 300); const m = Math.hypot(jit[i3], jit[i3 + 1], jit[i3 + 2]) || 1; w[i] = k % 300 < 210 ? .15 : .15 * Math.cbrt(r()); jit[i3] /= m; jit[i3 + 1] /= m; jit[i3 + 2] /= m; }
    else if (ro === 7) { g[i] = Math.floor(k / 160); v[i] = Math.floor((k % 160) / 40); const e = Math.floor(r() * 3); jit.set([0, 1, 2].map(a => a === e ? (r() < .5 ? -1 : 1) : r() * 2 - 1), i3); }
    else if (ro === 8 || ro === 9) { g[i] = Math.floor(k / 300); v[i] = k % 300; }
    else { v[i] = r(); w[i] = .05 + r() * .07; b0[i] = .06 + .12 * r() ** 2; }
    if (p) f.P.set(p, i3);
  }
  const OUT = 4.5, IN = 5.2, np = [0, 0, 0], last = new Float32Array(NET).fill(-99);
  const flight = (a, b, u, i, sc) => { const i3 = i * 3; for (let c = 0; c < 3; c++) f.P[i3 + c] = bz(a[c], a[c] + (c === 1 ? .9 : 0), b[c] + (c === 1 ? .8 : 0), b[c], u) + jit[i3 + c] * sc; };
  const btn = scr(0, -.5), bal = scr(0, .6);
  f.update = t => {
    // three outgoing payments staggered so the screen reviews one at a time
    const flows = [0, 1, 2].map(j => { const s = t + j * OUT / 3, lap = Math.floor(s / OUT), tau = s - lap * OUT; return { tau, net: (lap * 3 + j * 2) % NET }; });
    const cur = flows.reduce((m, q) => q.tau < m.tau ? q : m), flash = Math.exp(-((cur.tau - 1.35) ** 2) / .01);
    for (const q of flows) if (q.tau > 2.9 && q.tau < 3.1) last[q.net] = t;
    const ins = [0, 1].map(j => { const s = t + j * IN / 2 + 1.1, lap = Math.floor(s / IN); return { tau: s - lap * IN, net: (lap * 5 + j * 3 + 1) % NET }; });
    const landed = Math.max(...ins.map(q => Math.exp(-((q.tau - 1.8) ** 2) / .02)));
    for (let i = 0; i < N; i++) {
      const ro = role[i], i3 = i * 3; let b = b0[i];
      if (ro === 1) b += .35 * landed * (idx[i] < 150);
      else if (ro === 2) b = .12 + .7 * smooth(g[i] * .28, g[i] * .28 + .08, cur.tau) * (1 - smooth(1.45, 1.6, cur.tau));
      else if (ro === 3) b = .35 + .6 * flash;
      else if (ro === 4) b = .45 + .55 * flash;
      else if (ro === 5) b = frac(v[i] * 40) < .5 ? .08 + .6 * flash : 0;
      else if (ro === 6) { netAt(g[i], t, np); const pulse = Math.exp(-(t - last[g[i]]) * 2.5); for (let c = 0; c < 3; c++) f.P[i3 + c] = np[c] + jit[i3 + c] * w[i] * (1 + .5 * pulse); b = .45 + .5 * pulse; }
      else if (ro === 7) {   // each network's latest blocks, stacked outward; the newest flashes on confirmation
        netAt(g[i], t, np); const m = Math.hypot(np[0], np[2]), d = .3 + v[i] * .15;
        for (let c = 0; c < 3; c++) f.P[i3 + c] = np[c] + (c === 1 ? 0 : np[c] / m * d) + jit[i3 + c] * .045;
        b = .22 + (v[i] === 0 ? .6 * Math.exp(-(t - last[g[i]]) * 1.5) : 0);
      } else if (ro === 8 || ro === 9) {
        const q = ro === 8 ? flows[g[i]] : ins[g[i]], k = v[i], head = k < 120, lag = head ? 0 : (k - 120) / 180 * .22;
        const u = ro === 8 ? smooth(1.5, 2.95, q.tau - lag) : smooth(.4, 1.8, q.tau - lag);
        netAt(q.net, t, np);
        if (ro === 8) flight(btn, np, u, i, head ? .035 : .01); else flight(np, bal, u, i, head ? .035 : .01);
        b = u <= 0 || u >= 1 ? 0 : head ? .95 : .5 * (1 - (k - 120) / 180);
      } else if (ro === 10) {
        const a = v[i] * 6.283 + t * (.04 + w[i] * .3);
        f.P[i3] = (RX + jit[i3] * .16) * Math.cos(a); f.P[i3 + 1] = -.52 + jit[i3 + 1] * w[i]; f.P[i3 + 2] = (RZ + jit[i3 + 2] * .1) * Math.sin(a);
      }
      f.B[i] = Math.min(1, b);
    }
  };
  return f;
}

// 4 · Vol smile: an implied-volatility smile surface with a live price tape.
function D_quant() {
  const r = rng(43), extra = N - SHEET, M = 3000, walk = new Float32Array(M); let p = 0;
  for (let i = 0; i < M; i++) { p += gauss(r) * .05; walk[i] = p; }
  return sheet({ cam: [1.6, 3.4, 6.6], look: [0, -.2, 0], spin: .05 }, (x, z, t) => {
    const k = x / 2.2, T = (z + 1.9) / 3.7 + .05, vol = .18 - .06 * k + .12 * k * k / Math.sqrt(T) + .01 * Math.sin(t + x);
    return [vol * 4.2 - 1.4, .28 + .6 * clamp((vol - .12) * 3, 0, 1)];
  }, (f, t) => {
    const off = Math.floor(t * 12);
    for (let k = 0; k < extra; k++) { const i = SHEET + k, u = k / extra, q = off + Math.floor(u * 400); f.P[i * 3] = -3 + 6 * u; f.P[i * 3 + 1] = .9 + (walk[q % M] - walk[off % M]) * .5; f.P[i * 3 + 2] = -1.95; f.B[i] = .3 + .7 * u ** 4; }
  });
}

// Finale: the constellation again, its colour sweeping across the three fields.
function F_finale() {
  const f = A_neural(), base = f.update, stops = [COLOR.neural, COLOR.quantum, COLOR.quant];
  f.K = new Float32Array(N * 3);
  f.lineAlpha = .045;   // quieter edges, so the colours read
  f.update = t => {
    base(t);
    for (let i = 0; i < N; i++) {
      const u = clamp((f.P[i * 3] + 3) / 3, 0, 1.999), k = Math.floor(u), m = smooth(0, 1, u - k), A = stops[k], B = stops[k + 1];
      f.K[i * 3] = A.r + (B.r - A.r) * m; f.K[i * 3 + 1] = A.g + (B.g - A.g) * m; f.K[i * 3 + 2] = A.b + (B.b - A.b) * m;
    }
  };
  return f;
}

export const EXPERIMENTS = {
  quantum: [
    { key: 'wave', name: 'Wave packet', desc: 'A travelling wave packet drawn as its complex helix (Re ψ, Im ψ), with the probability density |ψ|² underneath.', make: A_quantum },
    { key: 'vqe', name: 'VQE landscape', desc: 'The energy landscape of a two-parameter variational ansatz. The optimiser (the bright dot) descends with shot noise, slips past local minima and settles in the ground state. Behind it: energy per iteration.', make: Q_vqe },
    { key: 'walk', name: 'Quantum walk', desc: 'A quantum walk on a graph. The walker is in superposition over every node: column height is the probability of finding it there, the hand is the phase of its amplitude, edge flow is probability current.', make: Q_walk },
    { key: 'grover', name: 'Grover colouring', desc: 'Grover search three-colours a planar graph. 256 amplitude bars: the oracle flips the 6 valid colourings, diffusion reflects every amplitude about the mean, and after 5 rounds a measurement lands on a valid colouring.', make: Q_grover },
    { key: 'box', name: 'Particle in a box', desc: 'A 2D box in a superposition of four eigenstates; |ψ|² sloshes as the relative phases turn.', make: D_quantum },
    { key: 'slit', name: 'Double slit', desc: 'Single particles pass two slits and land one at a time, building the interference fringes.', make: B_quantum },
    { key: 'orbital', name: 'Orbital', desc: 'A hydrogen 2p_z + 3d_z² superposition sampled in 3D; brightness beats with the relative phase.', make: C_quantum },
  ],
  neural: [
    { key: 'constellation', name: 'Constellation', desc: 'A layered network with signals streaming along every edge.', make: A_neural },
    { key: 'densenet', name: 'DenseNet', desc: 'Three dense blocks where every layer feeds every later layer (the arcs), transition layers that pool between blocks, then a fully connected head. A forward pass sweeps left to right.', make: N_densenet },
    { key: 'brain', name: 'Human brain', desc: 'Folded cortex, cerebellum and brainstem. Waves of activity spread over the surface; signals run through white-matter tracts, including the corpus callosum between hemispheres.', make: N_brain },
    { key: 'fly', name: 'Fly connectome', desc: 'After the fruit-fly connectome maps (Janelia–Google hemibrain, FlyWire): optic lobes, mushroom bodies, the central-complex compass with its rotating heading bump, antennal lobes, and the neurons wiring them.', make: N_fly },
    { key: 'hpc', name: 'HPC cluster', desc: 'Racks of compute blades grouped into jobs, a leaf switch per rack and spine switches above (a two-tier fat tree). MPI packets hop blade → leaf → spine → leaf → blade.', make: N_hpc },
    { key: 'rag', name: 'RAG pipeline', desc: 'Documents are chunked and embedded into a vector store. A query is embedded, its nearest neighbours are retrieved, and that context flows into the LLM, which writes the answer.', make: N_rag },
    { key: 'net', name: 'Campus network', desc: 'Redundant core routers, distribution and access switches, and the devices behind them. When a core link fails, traffic reroutes through the other core until it is restored.', make: N_net },
  ],
  quant: [
    { key: 'tape', name: 'Price tape', desc: 'A live price line, candlesticks and the return distribution at the edge.', make: A_quant },
    { key: 'galton', name: 'Galton board', desc: 'Random left/right bounces stack into the normal curve.', make: B_quant },
    { key: 'bs', name: 'Black–Scholes', desc: 'The Black–Scholes call-price surface C(S, τ), with simulated paths riding it to expiry.', make: C_quant },
    { key: 'smile', name: 'Vol smile', desc: 'An implied-volatility smile surface with a live price tape behind it.', make: D_quant },
    { key: 'wallet', name: 'Wallet', desc: 'A self-custody wallet: each payment is reviewed, signed on the device, then broadcast to one of seven networks and confirmed into a block.', make: T_wallet },
  ],
};
// 'field.key' → { field, make }, plus forms that belong to no single field
export const FORMS = { finale: { field: 'neural', make: F_finale } };
for (const fl of FIELDS) for (const e of EXPERIMENTS[fl]) FORMS[`${fl}.${e.key}`] = { field: fl, make: e.make };

// ---------------------------------------------------------------- engine
// createParticles(canvas) → { show(key), form(key), frame({ x, y, zoom }), warm(keys), pause(v), speed(v) }
//   frame: x shifts the picture sideways (a fraction of the width; positive moves it left),
//   y lifts it (a fraction of the height), zoom > 1 pulls the camera back.
//   hoverTest(pointerEvent) decides whether the pointer is over the particles.
export function createParticles(canvas, { hoverTest = e => e.target === canvas, parallax = 1, frame: startFrame = {}, completeTransitions = false, morphDuration = 2.2 } = {}) {
  const transitions = completeTransitions ? createMorphQueue({ duration: morphDuration }) : null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor('#050608');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), seed = new Float32Array(N);
  const r = rng(99), delay = new Float32Array(N), swirl = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seed[i] = r(); const a = r() * 6.283, b = Math.acos(2 * r() - 1); swirl.set([Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)], i * 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  // Pointer push, shared by points and lines: anything near the cursor is nudged outward in screen space.
  const hover = { uMouse: { value: new THREE.Vector2(9, 9) }, uHover: { value: 0 }, uAspect: { value: 1 } };
  const PUSH = `uniform vec2 uMouse; uniform float uHover; uniform float uAspect;
    vec4 push(vec4 clip, float k, out float lift) {
      vec2 d = (clip.xy / clip.w - uMouse) * vec2(uAspect, 1.0);
      float r = length(d);
      lift = uHover * exp(-r * r / .05);
      clip.xy += (r > 1e-4 ? d / r : vec2(0.0)) * lift * k * .085 * vec2(1.0 / uAspect, 1.0) * clip.w;
      return clip;
    }`;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { px: { value: renderer.getPixelRatio() }, ...hover },
    vertexShader: `attribute float size; attribute float seed; attribute vec3 color; varying vec3 vColor; uniform float px; ${PUSH}
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float lift; gl_Position = push(projectionMatrix * mv, .65 + .7 * seed, lift); vColor = color * (1.0 + .45 * lift); gl_PointSize = size * px * (7.0 / -mv.z); }`,
    fragmentShader: `varying vec3 vColor; void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard; float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vColor * a, a); }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;
  // Two line layers so the outgoing form's lines fade while the incoming ones fade in.
  const lineLayer = () => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { color: { value: new THREE.Color() }, opacity: { value: 0 }, ...hover },
      vertexShader: `${PUSH} void main() { float lift; gl_Position = push(projectionMatrix * modelViewMatrix * vec4(position, 1.0), 1.0, lift); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; void main() { gl_FragColor = vec4(color, opacity); }`,
    });
    const l = new THREE.LineSegments(new THREE.BufferGeometry(), m); l.frustumCulled = false; l.userData.from = 0; return l;
  };
  let lineIn = lineLayer(), lineOut = lineLayer();
  const world = new THREE.Group(); world.add(points, lineIn, lineOut); scene.add(world);
  const noLines = new THREE.BufferGeometry(); noLines.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));

  // Forms are built once and cached; each carries a colour per particle (K) so blends can mix
  // colours. Most take their field's colour; a form may set its own K.
  const cache = {};
  function live(key) {
    if (!cache[key]) {
      const spec = FORMS[key], f = spec.make();
      if (!f.K) { const c = COLOR[spec.field]; f.K = new Float32Array(N * 3); for (let i = 0; i < N; i++) { f.K[i * 3] = c.r; f.K[i * 3 + 1] = c.g; f.K[i * 3 + 2] = c.b; } }
      f.field = spec.field; f._t = null;
      if (f.lines) { f.geo = new THREE.BufferGeometry(); f.geo.setAttribute('position', new THREE.BufferAttribute(f.lines, 3)); }
      cache[key] = f;
    }
    return cache[key];
  }
  const tick = (s, t) => { if (s._t !== t) { s._t = t; s.update(t); } };
  // p = 0 → a, p = 1 → b, with a swirl bump mid-flight.
  function mixInto(o, a, b, pr) {
    for (let i = 0; i < N; i++) {
      const p = pr[i], q = 1 - p, bump = Math.sin(p * Math.PI) * (completeTransitions ? .12 : .6), i3 = i * 3;
      for (let k = 0; k < 3; k++) { o.P[i3 + k] = a.P[i3 + k] * q + b.P[i3 + k] * p + swirl[i3 + k] * bump; o.K[i3 + k] = a.K[i3 + k] * q + b.K[i3 + k] * p; }
      o.B[i] = a.B[i] * q + b.B[i] * p;
    }
  }
  const blank = () => ({ P: new Float32Array(N * 3), B: new Float32Array(N), K: new Float32Array(N * 3) });
  // When a switch interrupts a morph, the particles' current in-between state becomes the new source:
  // a blend of the two live forms frozen at each particle's progress (older blends are snapshotted).
  function frozen(a, b, pr) { const s = blank(); s.frozen = true; s.size = b.size; s.update = t => { tick(a, t); tick(b, t); mixInto(s, a, b, pr); }; return s; }
  const still = s => ({ P: s.P.slice(), B: s.B.slice(), K: s.K.slice(), size: s.size, update() {} });

  let paused = false, rate = 1, pending = false, started = false, key = null, cur = null, src = null, morphT = 1, t = 0, last = performance.now();
  const draw = blank(), prog = new Float32Array(N).fill(1);
  const camPos = new THREE.Vector3(0, 0, 7), camLook = new THREE.Vector3(), camGoal = new THREE.Vector3(0, 0, 7), lookGoal = new THREE.Vector3(), fromCam = new THREE.Vector3(), fromLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  const view = { x: 0, y: .09, zoom: 1, ...startFrame }, viewGoal = { ...view };
  const mouse = { x: 0, y: 0 }, ndc = new THREE.Vector2(9, 9), ndcGoal = new THREE.Vector2(9, 9);
  let hoverGoal = 0;
  addEventListener('pointermove', e => {
    mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5;
    const rc = canvas.getBoundingClientRect(); ndcGoal.set((e.clientX - rc.left) / rc.width * 2 - 1, 1 - (e.clientY - rc.top) / rc.height * 2);
    const over = hoverTest(e);
    if (hoverGoal === 0 && over) ndc.copy(ndcGoal);   // don't sweep in from where the pointer left
    hoverGoal = over ? 1 : 0;
  }, { passive: true });
  const leave = () => { hoverGoal = 0; };
  document.documentElement.addEventListener('pointerleave', leave); addEventListener('blur', leave);
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') leave(); });
  addEventListener('pointercancel', leave);

  function show(next) {
    if (!FORMS[next]) return;
    const ready = transitions ? transitions.request(next) : next;
    if (ready) beginMorph(ready);
  }
  function beginMorph(next) {
    const f = live(next);
    if (f === cur) return;
    // a second switch before any frame has drawn keeps the same source: the particles haven't moved yet
    if (cur && !pending) {
      if (src && morphT < 1) { tick(src, t); src = frozen(src.frozen ? still(src) : src, cur, prog.slice()); } else src = cur;
      fromCam.copy(camGoal); fromLook.copy(lookGoal);
      [lineIn, lineOut] = [lineOut, lineIn];
      lineOut.userData.from = lineOut.material.uniforms.opacity.value;   // the old incoming layer fades out from where it is
    }
    key = next; cur = f; tick(cur, t);
    if (!src) { camGoal.set(...cur.view.cam); lookGoal.set(...cur.view.look); fromCam.copy(camGoal); fromLook.copy(lookGoal); camPos.copy(camGoal); camLook.copy(lookGoal); }
    // sweep the morph left to right across the target shape
    let lo = 1e9, hi = -1e9; for (let i = 0; i < N; i++) { lo = Math.min(lo, cur.P[i * 3]); hi = Math.max(hi, cur.P[i * 3]); }
    for (let i = 0; i < N; i++) delay[i] = .55 * (cur.P[i * 3] - lo) / Math.max(hi - lo, 1e-3) + .45 * frac(i * .618);
    lineIn.geometry = cur.geo || noLines; lineIn.material.uniforms.color.value.copy(COLOR[cur.field]); lineIn.material.uniforms.opacity.value = 0;
    morphT = src ? 0 : 1; pending = !!src;
    if (!started) { started = true; requestAnimationFrame(frame); }
  }
  let W = 1, H = 1;
  function fit() { W = canvas.clientWidth || 1; H = canvas.clientHeight || 1; renderer.setSize(W, H, false); camera.aspect = W / H; hover.uAspect.value = W / H; }
  new ResizeObserver(fit).observe(canvas); fit();

  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  function frame(now) {
    const elapsed = clamp((now - last) / 1000, 0, .15), dt = Math.min(elapsed, .05);
    last = now; if (!paused) t += dt * rate;
    const next = transitions?.advance(elapsed);
    if (next) beginMorph(next);
    pending = false;
    morphT = Math.min(1, morphT + elapsed / morphDuration);
    tick(cur, t);
    let S = cur;
    if (src && morphT < 1) {
      tick(src, t);
      const stagger = completeTransitions ? .18 : .5;
      for (let i = 0; i < N; i++) prog[i] = ease((morphT - delay[i] * stagger) / (1 - stagger));
      mixInto(draw, src, cur, prog); S = draw;
    } else if (src) { src = null; prog.fill(1); }
    for (let i = 0; i < N; i++) {
      const b = Math.min(1, S.B[i]), i3 = i * 3;
      pos[i3] = S.P[i3]; pos[i3 + 1] = S.P[i3 + 1]; pos[i3 + 2] = S.P[i3 + 2];
      col[i3] = S.K[i3] * b; col[i3 + 1] = S.K[i3 + 1] * b; col[i3 + 2] = S.K[i3 + 2] * b;
      size[i] = 1.2 + 2.4 * b;
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = true;
    const m = ease(morphT);
    mat.uniforms.px.value = renderer.getPixelRatio() * ((src?.size ?? 1) * (1 - m) + (cur.size ?? 1) * (src ? m : 1));
    lineIn.material.uniforms.opacity.value = (cur.lineAlpha ?? .09) * m;
    lineOut.material.uniforms.opacity.value = lineOut.userData.from * (1 - ease(morphT * 1.6));
    camGoal.copy(fromCam).lerp(tmp.set(...cur.view.cam), m); lookGoal.copy(fromLook).lerp(tmp.set(...cur.view.look), m);
    camPos.lerp(camGoal, .06); camLook.lerp(lookGoal, .06);
    // framing: slide the picture sideways, lift it, and pull back on narrow screens so wide forms fit
    for (const k in view) view[k] += (viewGoal[k] - view[k]) * .06;
    camera.setViewOffset(W, H, view.x * W, view.y * H, W, H);
    const narrow = camera.aspect < 1.3 ? Math.min(2.4, (1.3 / camera.aspect) ** .8) : 1;
    tmp.copy(camPos).sub(camLook).multiplyScalar(view.zoom * narrow).add(camLook);
    camera.position.set(tmp.x + mouse.x * .6 * parallax, tmp.y - mouse.y * .4 * parallax, tmp.z); camera.lookAt(camLook);
    const spin = cur.view.spin || 0;
    world.rotation.y += ((spin ? Math.sin(t * spin) * .5 : 0) - world.rotation.y) * .04;
    hover.uHover.value += (hoverGoal - hover.uHover.value) * .08;
    ndc.lerp(ndcGoal, .25); hover.uMouse.value.copy(ndc);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  // build forms in idle time so the first switch to each is instant
  const queue = [], idle = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 8 }), 60));
  let warming = false;
  const warmNext = () => { const k = queue.shift(); if (!k) { warming = false; return; } live(k); idle(warmNext, { timeout: 1500 }); };
  return {
    show,
    form: live,
    frame(v) { Object.assign(viewGoal, v); },
    warm(keys) { queue.push(...keys.filter(k => !cache[k] && FORMS[k])); if (!warming) { warming = true; idle(warmNext, { timeout: 1500 }); } },
    pause(v) { paused = v; },
    speed(v) { rate = v; },
    get key() { return key; },
  };
}

// The lab: pick a field and an experiment; each field keeps the experiment index.
export function startLab(canvas, { onChange, field: startField = FIELDS[0], exp: startExp = 0 } = {}) {
  const p = createParticles(canvas);
  let field = startField, exp = startExp;
  function set(nextField = field, nextExp = exp) {
    field = nextField; exp = nextExp;
    const k = Math.min(exp, EXPERIMENTS[field].length - 1);
    p.show(`${field}.${EXPERIMENTS[field][k].key}`);
    onChange?.(field, exp, k);
  }
  set();
  p.warm(FIELDS.flatMap(fl => EXPERIMENTS[fl].map(e => `${fl}.${e.key}`)));
  return { set, get state() { return { field, exp, shown: Math.min(exp, EXPERIMENTS[field].length - 1) }; }, pause: p.pause };
}
