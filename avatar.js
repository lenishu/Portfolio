import * as THREE from './vendor/three.module.min.js';

// Layered 3D portrait built by scripts/build_avatar.py: a relief-sculpted head
// that turns at the neck, a static body, a separate glasses frame and eyes
// whose irises track the cursor under the lids.
const canvas = document.querySelector('#avatar-canvas');
const portrait = document.querySelector('.avatar-portrait');
const stage = document.querySelector('#avatar-stage');
const toggle = document.querySelector('#motion-toggle');
const status = document.querySelector('#avatar-status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const BASE = 'assets/avatar/';

// Following the pointer is direct feedback, so it stays on with reduced motion;
// the self-started motion (idle glances, blinks) is what reduced motion turns off.
let paused = false;
try {
  const preference = sessionStorage.getItem('avatar-motion');
  if (preference !== null) paused = preference === 'paused';
} catch { /* Storage may be disabled; keep the system preference. */ }

// The relief is reconstructed from one frontal image, so turns stay modest; the eyes carry the rest.
const MAX_YAW = .22, MAX_PITCH = .14, EYE_X = 13, EYE_UP = 4, EYE_DOWN = 5;
let renderer, scene, camera, head, uniforms, meta;
let visible = true, raf = 0, last = 0;
let target = { x: 0, y: 0 }, lastPointer = -1e9;
const headAngle = { x: 0, y: 0 }, eye = { x: 0, y: 0 }, saccade = { x: 0, y: 0 };
let blinkStart = -1, nextBlink = 0, nextSaccade = 0;

function controls() {
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.setAttribute('aria-label', paused ? 'Resume avatar motion' : 'Pause avatar motion');
  toggle.textContent = paused ? '▷' : 'Ⅱ';
  const prompt = matchMedia('(hover: none)').matches ? 'Tap anywhere.' : 'Move your cursor.';
  status.textContent = paused ? 'Motion paused.' : prompt;
}
function fallback(error) {
  cancelAnimationFrame(raf); raf = 0;
  portrait.classList.remove('ready');
  toggle.hidden = true;
  status.textContent = 'Hello, I’m Lenish.';
  if (error) console.warn('3D avatar unavailable; showing still portrait.', error.message);
}

const vertex = /* glsl */`
  varying vec2 vUv; varying vec3 vNormal0; varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal0 = normal;
    vNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;
// The upper neck twists part of the way with the head; the shirt stays put.
const neckVertex = /* glsl */`
  attribute float twist; uniform mat4 headMatrix;
  varying vec2 vUv; varying vec3 vNormal0; varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal0 = normal;
    vNormal = normalize(mix(normal, mat3(headMatrix) * normal, twist));
    vec3 p = mix(position, (headMatrix * vec4(position, 1.0)).xyz, twist);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
// Relative relighting: the portrait's baked light stays, and turning a surface
// toward or away from the studio key brightens or darkens it by the difference.
const relight = /* glsl */`
  uniform vec3 lightDir; uniform float lightAmount;
  vec3 relight(vec3 color) {
    float before = max(dot(normalize(vNormal0), lightDir), 0.0);
    float after = max(dot(normalize(vNormal), lightDir), 0.0);
    return color * (1.0 + lightAmount * (after - before));
  }`;
const headFragment = /* glsl */`
  uniform sampler2D map; uniform sampler2D eyeMask; uniform sampler2D irisMap;
  uniform vec2 gazeLeft; uniform vec2 gazeRight; uniform float blink;
  uniform vec3 lidLeft; uniform vec3 lidRight;
  varying vec2 vUv; varying vec3 vNormal0; varying vec3 vNormal;
  ${relight}
  void main() {
    vec4 color = texture2D(map, vUv);
    vec4 m = texture2D(eyeMask, vUv);
    if (m.r > 0.002) {
      bool left = vUv.x < 0.5;
      vec4 iris = texture2D(irisMap, vUv - (left ? gazeLeft : gazeRight));
      vec3 eye = mix(color.rgb, iris.rgb * m.b, iris.a);
      // Upper lid sweeps down the opening (m.g: 0 at the upper lid, 1 at the lower).
      float edge = blink * 1.1;
      float covered = (1.0 - smoothstep(edge - 0.08, edge, m.g)) * step(0.001, blink);
      float lash = smoothstep(edge - 0.3, edge - 0.02, m.g);
      vec3 lid = (left ? lidLeft : lidRight) * mix(1.0, 0.72, m.g * 0.6);
      eye = mix(eye, mix(lid, vec3(0.08, 0.045, 0.035), lash * 0.85), covered);
      color.rgb = mix(color.rgb, eye, m.r);
    }
    if (color.a < 0.004) discard;
    gl_FragColor = vec4(relight(color.rgb), color.a);
  }`;
const plainFragment = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv; varying vec3 vNormal0; varying vec3 vNormal;
  ${relight}
  void main() {
    vec4 color = texture2D(map, vUv);
    if (color.a < 0.004) discard;
    gl_FragColor = vec4(relight(color.rgb), color.a);
  }`;

// Grid mesh from a quantised depth layer. uvBox maps image pixels to texture UVs.
function layerGeometry(buffer, layer, size, unit, uvBox) {
  const [gw, gh] = layer.grid, [x0, y0, x1, y1] = layer.box, [z0, z1] = layer.z;
  const depth = new Uint16Array(buffer, layer.depthOffset, gw * gh);
  const cover = new Uint8Array(buffer, layer.coverOffset, gw * gh);
  const position = new Float32Array(gw * gh * 3), uv = new Float32Array(gw * gh * 2);
  const [u0, v0, u1, v1] = uvBox;
  for (let j = 0, k = 0; j < gh; j++) for (let i = 0; i < gw; i++, k++) {
    const px = x0 + (x1 - x0) * i / (gw - 1), py = y0 + (y1 - y0) * j / (gh - 1);
    position[k * 3] = (px - size[0] / 2) * unit;
    position[k * 3 + 1] = (size[1] / 2 - py) * unit;
    position[k * 3 + 2] = z0 + (z1 - z0) * depth[k] / 65535;
    uv[k * 2] = (px - u0) / (u1 - u0);
    uv[k * 2 + 1] = 1 - (py - v0) / (v1 - v0);
  }
  const index = [];
  for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
    const a = j * gw + i, b = a + 1, c = a + gw, d = c + 1;
    if (cover[a] && cover[b] && cover[c]) index.push(a, c, b);
    if (cover[b] && cover[c] && cover[d]) index.push(b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function material(fragmentShader, extra, vertexShader = vertex) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true,
    uniforms: { lightDir: uniforms.lightDir, lightAmount: uniforms.lightAmount, ...extra },
  });
}

function fit() {
  const w = portrait.clientWidth, h = portrait.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep hair and shoulders in frame: 1.9 units tall, 1.62 wide, around the bust.
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, -.02, .35 + Math.max(.97 / t, .81 / (t * camera.aspect)));
  camera.lookAt(0, -.02, .35);
  camera.updateProjectionMatrix();
  draw();
}
function draw() {
  if (renderer && !renderer.getContext().isContextLost()) renderer.render(scene, camera);
}

const lerp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));
function blinkAmount(now) {
  if (blinkStart < 0) return 0;
  const t = (now - blinkStart) / 1000;
  if (t > .19) { blinkStart = -1; return 0; }
  return t < .07 ? t / .07 : t < .1 ? 1 : 1 - (t - .1) / .09;
}
function schedule(now) {
  if (!nextBlink) nextBlink = now + 1800 + Math.random() * 2500;
  if (!nextSaccade) nextSaccade = now + 900;
  if (now > nextBlink) {
    blinkStart = now;
    nextBlink = now + (Math.random() < .18 ? 260 : 2200 + Math.random() * 4200);
  }
  if (now > nextSaccade) {
    // Small fixational jumps keep the gaze alive; bigger ones when nobody is steering.
    const idle = now - lastPointer > 3500;
    const s = idle ? .35 : .06;
    saccade.x = (Math.random() * 2 - 1) * s;
    saccade.y = (Math.random() * 2 - 1) * s * .6;
    nextSaccade = now + (idle ? 900 + Math.random() * 1800 : 600 + Math.random() * 1400);
  }
}

function frame(now) {
  raf = 0;
  if (!visible || document.hidden) return;
  const dt = Math.min((now - last) / 1000 || .016, .05); last = now;
  let settled = true;
  if (!paused) {
    const calm = reduced.matches;
    if (calm) { saccade.x = saccade.y = 0; blinkStart = -1; } else schedule(now);
    const idle = !calm && now - lastPointer > 3500;
    const gx = idle ? saccade.x : target.x + saccade.x, gy = idle ? saccade.y : target.y + saccade.y;
    const hx = idle ? gx * .4 : target.x, hy = idle ? gy * .3 : target.y;
    headAngle.x = lerp(headAngle.x, hx, 4.2, dt);
    headAngle.y = lerp(headAngle.y, hy, 4.2, dt);
    // Eyes lead the head, then relax as the head catches up.
    eye.x = lerp(eye.x, THREE.MathUtils.clamp(gx - headAngle.x * .55, -1, 1), 22, dt);
    eye.y = lerp(eye.y, THREE.MathUtils.clamp(gy - headAngle.y * .5, -1, 1), 22, dt);
    // Calm mode sleeps once the head reaches the pointer; otherwise the face stays alive.
    settled = calm && Math.abs(hx - headAngle.x) + Math.abs(hy - headAngle.y) < .002;
  } else {
    for (const o of [headAngle, eye]) { o.x = lerp(o.x, 0, 6, dt); o.y = lerp(o.y, 0, 6, dt); }
    settled = Math.abs(headAngle.x) + Math.abs(headAngle.y) + Math.abs(eye.x) + Math.abs(eye.y) < .002;
    blinkStart = -1;
  }
  head.rotation.set(headAngle.y * MAX_PITCH, headAngle.x * MAX_YAW, -headAngle.x * .04, 'YXZ');
  head.updateMatrixWorld();
  uniforms.headMatrix.value.copy(head.children[0].matrixWorld);
  const [w, h] = meta.size;
  const ox = eye.x * EYE_X, oy = eye.y * (eye.y < 0 ? EYE_UP : EYE_DOWN);
  uniforms.gazeLeft.value.set(ox / w, -oy / h);
  uniforms.gazeRight.value.set(ox / w, -oy / h);
  uniforms.blink.value = paused ? 0 : blinkAmount(now);
  draw();
  if (!settled) raf = requestAnimationFrame(frame);
}
function start() {
  if (!raf && head && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

async function init() {
  const [info, buffer] = await Promise.all([
    fetch(BASE + 'avatar.json').then(r => r.json()),
    fetch(BASE + 'geometry.bin').then(r => r.arrayBuffer()),
  ]);
  meta = info;
  const loader = new THREE.TextureLoader();
  const load = name => loader.loadAsync(BASE + name).then(t => {
    t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t;
  });
  const [headMap, bodyMap, glassesMap, eyeMask, irisMap] = await Promise.all(
    ['head.webp', 'body.webp', 'glasses.webp', 'eyemask.png', 'iris.png'].map(load));
  eyeMask.generateMipmaps = false; eyeMask.minFilter = THREE.LinearFilter;
  irisMap.generateMipmaps = false; irisMap.minFilter = THREE.LinearFilter;

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // textures are passed through untouched
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(18, 1, .1, 40);
  uniforms = {
    lightDir: { value: new THREE.Vector3(-.55, .5, .67).normalize() },
    lightAmount: { value: .42 },
    gazeLeft: { value: new THREE.Vector2() }, gazeRight: { value: new THREE.Vector2() },
    blink: { value: 0 },
    lidLeft: { value: new THREE.Vector3(...meta.eyes[0].lid) },
    lidRight: { value: new THREE.Vector3(...meta.eyes[1].lid) },
  };
  const { size, unit, layers } = meta;
  const full = [0, 0, size[0], size[1]];
  const bodyGeometry = layerGeometry(buffer, layers.body, size, unit, full);
  const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const [neckLeft, neckRight] = meta.neck, uvs = bodyGeometry.attributes.uv;
  const twist = new Float32Array(uvs.count);
  for (let i = 0; i < uvs.count; i++) {
    const px = uvs.getX(i) * size[0], py = (1 - uvs.getY(i)) * size[1];
    // Uniform across the width so the neck's edges move with it; the shirt below 975 px stays put.
    twist[i] = .85 * smooth(975, 820, py);
  }
  bodyGeometry.setAttribute('twist', new THREE.BufferAttribute(twist, 1));
  uniforms.headMatrix = { value: new THREE.Matrix4() };
  const body = new THREE.Mesh(bodyGeometry, material(plainFragment, { map: { value: bodyMap }, headMatrix: uniforms.headMatrix }, neckVertex));
  const face = new THREE.Mesh(layerGeometry(buffer, layers.head, size, unit, full),
    material(headFragment, { map: { value: headMap }, eyeMask: { value: eyeMask }, irisMap: { value: irisMap },
      gazeLeft: uniforms.gazeLeft, gazeRight: uniforms.gazeRight, blink: uniforms.blink,
      lidLeft: uniforms.lidLeft, lidRight: uniforms.lidRight }));
  const g = layers.glasses.box;
  const glasses = new THREE.Mesh(layerGeometry(buffer, layers.glasses, size, unit, [g[0], g[1], g[2] + 1, g[3] + 1]),
    material(plainFragment, { map: { value: glassesMap } }));
  body.renderOrder = 0; face.renderOrder = 1; glasses.renderOrder = 2;
  glasses.material.depthWrite = false;

  // Pivot level with the ears, in the middle of the head's depth, so the chin and hair swing little.
  const pivot = new THREE.Vector3(0, (size[1] / 2 - 790) * unit, .28);
  head = new THREE.Group();
  head.position.copy(pivot);
  for (const mesh of [face, glasses]) { mesh.position.copy(pivot).negate(); head.add(mesh); }
  scene.add(body, head);

  portrait.classList.add('ready');
  controls(); fit();
  new ResizeObserver(fit).observe(portrait);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) start(); else { cancelAnimationFrame(raf); raf = 0; }
  }, { threshold: .03 }).observe(stage);
  start();
}

// Soft limit: responsive near the face, easing toward the maximum instead of snapping to it.
const ease = v => v / Math.sqrt(1 + v * v) * 1.25;
const clamp = v => Math.max(-1, Math.min(1, ease(v)));
function follow(clientX, clientY) {
  if (!head) return;
  const r = portrait.getBoundingClientRect();
  // Aim from the eyes (about 43% down the portrait) toward the pointer.
  const dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height * .43);
  target.x = clamp(dx / Math.max(innerWidth * .42, 320));
  target.y = clamp(dy / Math.max(innerHeight * .5, 320));
  lastPointer = performance.now();
  if (!paused) start();
}
addEventListener('pointermove', e => follow(e.clientX, e.clientY), { passive: true });
addEventListener('pointerdown', e => follow(e.clientX, e.clientY), { passive: true });
document.addEventListener('focusin', e => {
  const r = e.target.getBoundingClientRect(); follow(r.left + r.width / 2, r.top + r.height / 2);
});
function neutral() { target.x = 0; target.y = 0; start(); }
document.documentElement.addEventListener('pointerleave', neutral);
addEventListener('blur', neutral);
toggle.addEventListener('click', () => {
  paused = !paused;
  try { sessionStorage.setItem('avatar-motion', paused ? 'paused' : 'playing'); } catch { /* Optional preference. */ }
  controls(); start();
});
reduced.addEventListener('change', start);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fallback(); });
canvas.addEventListener('webglcontextrestored', () => location.reload());

init().catch(fallback);
