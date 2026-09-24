import * as THREE from './vendor/three.module.min.js';

// Ambient scenes behind each field's intro. Each one animates only while its
// panel is open and on screen, and draws a single still frame for reduced motion.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function loop(host, draw) {
  let raf = 0, visible = false, active = !host.closest('.panel')?.hidden, t0 = performance.now() - 1100;
  const tick = now => { raf = 0; draw((now - t0) / 1000); if (visible && active && !reduced) raf = requestAnimationFrame(tick); };
  const start = () => { if (!raf && visible && active) raf = requestAnimationFrame(tick); };
  new IntersectionObserver(e => { visible = e[0].isIntersecting; start(); }).observe(host);
  document.addEventListener('fieldchange', () => { active = !host.closest('.panel').hidden; if (active) { start(); } });
  return start;
}

function canvas2d(host) {
  const c = host.appendChild(document.createElement('canvas')), ctx = c.getContext('2d');
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = host.clientWidth, h = host.clientHeight;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  };
  return { c, ctx, size };
}

// ---------------------------------------------------------------- Quantum
// Particles sampled from a hydrogen superposition of 2p_z and 3d_z² orbitals.
// Brightness follows the instantaneous density |a·ψ₁·e^{-iE₁t} + b·ψ₂·e^{-iE₂t}|²,
// so the cloud "beats" as the two states interfere. Rings below are a damped wave.
function quantum(host) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .1, 200);
  const cloud = [], psi = [], ring = [];
  const p1 = (x, y, z, r) => z * Math.exp(-r / 2) / .736;
  const p2 = (x, y, z, r) => (3 * z * z - r * r) * Math.exp(-r / 3) / 9.74;
  let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (cloud.length < 3 * 15000) {
    const x = (rand() * 2 - 1) * 16, y = (rand() * 2 - 1) * 16, z = (rand() * 2 - 1) * 18, r = Math.hypot(x, y, z);
    const a = p1(x, y, z, r), b = p2(x, y, z, r), rho = .5 * a * a + .5 * b * b;
    if (rand() < rho * 1.6) { cloud.push(x * .13, z * .13 + .1, y * .13); psi.push(a, b); }
  }
  for (let i = 0; i < 9000; i++) {
    const rr = Math.sqrt(rand()) * 3.2, th = rand() * Math.PI * 2;
    ring.push(Math.cos(th) * rr, -1.75 + (rand() - .5) * .02, Math.sin(th) * rr);
  }
  const color = new THREE.Color(css('--quantum') || '#a78bfa'), cool = new THREE.Color('#5aa9ff');
  const make = (positions, extra, vertex) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (extra) g.setAttribute('psi', new THREE.Float32BufferAttribute(extra, 2));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { t: { value: 0 }, c1: { value: color }, c2: { value: cool }, px: { value: renderer.getPixelRatio() } },
      vertexShader: vertex,
      fragmentShader: `varying float vGlow; varying vec3 vColor;
        void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard;
          gl_FragColor = vec4(vColor * vGlow, vGlow * smoothstep(.5, .0, d)); }`,
    });
    const pts = new THREE.Points(g, m); scene.add(pts); return m;
  };
  const cloudMat = make(cloud, psi, `attribute vec2 psi; uniform float t; uniform vec3 c1; uniform vec3 c2; uniform float px;
    varying float vGlow; varying vec3 vColor;
    void main() {
      float rho = .5 * psi.x * psi.x + .5 * psi.y * psi.y + psi.x * psi.y * cos(1.4 * t);
      vGlow = clamp(rho * 2.2, .05, 1.0);
      vColor = mix(c2, c1, clamp(position.y * .5 + .6, 0., 1.));
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = (1.4 + 3.2 * vGlow) * px * (6.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`);
  const ringMat = make(ring, null, `uniform float t; uniform vec3 c1; uniform vec3 c2; uniform float px;
    varying float vGlow; varying vec3 vColor;
    void main() {
      float r = length(position.xz);
      vGlow = (.5 + .5 * cos(7.0 * r - 2.2 * t)) * exp(-r * .55) + .05;
      vColor = mix(c1, c2, r / 3.2);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 1.6 * px * (6.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`);
  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(host); fit();
  const start = loop(host, t => {
    cloudMat.uniforms.t.value = ringMat.uniforms.t.value = t;
    const a = t * .12;
    camera.position.set(Math.sin(a) * 6.4, 1.5, Math.cos(a) * 6.4);
    camera.lookAt(0, -.55, 0);
    renderer.render(scene, camera);
  });
  start();
}

// ---------------------------------------------------------------- AI
// A small feed-forward network with signals travelling layer to layer.
function ai(host) {
  const { ctx, size } = canvas2d(host);
  let dims = size(), nodes = [], edges = [], pulses = [];
  const build = () => {
    dims = size(); nodes = []; edges = [];
    const layers = [4, 7, 7, 5, 2], { w, h } = dims;
    layers.forEach((n, l) => {
      const col = [];
      for (let i = 0; i < n; i++) col.push({ x: w * (.12 + .76 * l / (layers.length - 1)), y: h * (.5 + (i - (n - 1) / 2) * Math.min(.13, .8 / n)), glow: 0 });
      nodes.push(col);
    });
    for (let l = 0; l < layers.length - 1; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) edges.push([a, b, l]);
  };
  build(); new ResizeObserver(build).observe(host);
  const color = css('--ai') || '#5aa9ff';
  let last = 0;
  const start = loop(host, t => {
    const dt = Math.min(t - last, .05); last = t;
    if (!reduced && Math.random() < .35) { const e = edges.filter(e => e[2] === 0)[Math.floor(Math.random() * nodes[0].length * nodes[1].length)]; if (e) pulses.push({ e, p: 0 }); }
    const { w, h } = dims;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    for (const [a, b] of edges) { ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    pulses = pulses.filter(pulse => {
      pulse.p += dt * 1.6;
      const [a, b, l] = pulse.e;
      if (pulse.p >= 1) {
        b.glow = 1;
        if (l + 1 < nodes.length - 1 && Math.random() < .8) {
          const next = edges.filter(e => e[0] === b);
          pulses.push({ e: next[Math.floor(Math.random() * next.length)], p: 0 });
        }
        return false;
      }
      const x = a.x + (b.x - a.x) * pulse.p, y = a.y + (b.y - a.y) * pulse.p;
      ctx.strokeStyle = color; ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      return true;
    });
    for (const col of nodes) for (const n of col) {
      n.glow = Math.max(0, n.glow - dt * 1.4);
      ctx.fillStyle = '#0b0d11'; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(n.x, n.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (n.glow > 0) { ctx.globalAlpha = n.glow; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(n.x, n.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    }
  });
  start();
}

// ---------------------------------------------------------------- Quant
// Geometric Brownian motion paths fanning out, with the lognormal density at the horizon.
function quant(host) {
  const { ctx, size } = canvas2d(host);
  let dims = size();
  new ResizeObserver(() => { dims = size(); }).observe(host);
  const color = css('--quant') || '#3ddc97', sigma = .28, mu = .06, steps = 90;
  let seed = 9; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const makePath = () => { const out = [1]; let s = 1; for (let i = 0; i < steps; i++) { s *= Math.exp((mu - sigma * sigma / 2) / steps + sigma / Math.sqrt(steps) * gauss()); out.push(s); } return out; };
  let paths = Array.from({ length: 26 }, (_, i) => ({ s: makePath(), born: -i * .35 }));
  const start = loop(host, t => {
    const { w, h } = dims, x0 = w * .08, x1 = w * .78, yOf = s => h * .5 - Math.log(s) * h * .62;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(x0, yOf(1)); ctx.lineTo(w * .96, yOf(1)); ctx.stroke(); ctx.setLineDash([]);
    for (const path of paths) {
      const age = reduced ? 3 : t - path.born, grow = Math.min(1, Math.max(0, age / 2.6)), fade = Math.max(0, 1 - Math.max(0, age - 5) / 3);
      if (grow <= 0) continue;
      if (fade <= 0) { path.s = makePath(); path.born = t; continue; }
      const n = Math.floor(grow * steps);
      const end = path.s[n], up = end > 1;
      ctx.strokeStyle = up ? color : 'rgba(255,255,255,.55)'; ctx.globalAlpha = (up ? .55 : .25) * fade; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / steps, y = yOf(path.s[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.globalAlpha = fade; ctx.fillStyle = up ? color : '#fff';
      ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * n / steps, yOf(end), 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // lognormal density of the terminal price, drawn sideways at the horizon
    ctx.beginPath(); ctx.moveTo(x1 + 8, 0);
    for (let y = 0; y <= h; y += 3) {
      const z = (h * .5 - y) / (h * .62), m = mu - sigma * sigma / 2;
      const d = Math.exp(-((z - m) ** 2) / (2 * sigma * sigma));
      ctx.lineTo(x1 + 8 + d * w * .15, y);
    }
    ctx.lineTo(x1 + 8, h); ctx.closePath();
    ctx.fillStyle = color; ctx.globalAlpha = .14; ctx.fill(); ctx.globalAlpha = .7; ctx.strokeStyle = color; ctx.stroke(); ctx.globalAlpha = 1;
  });
  start();
}

const scenes = { quantum, ai, quant };
for (const host of document.querySelectorAll('[data-scene]')) {
  try { scenes[host.dataset.scene]?.(host); } catch (error) { console.warn('scene failed', error); }
}
