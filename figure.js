import * as THREE from './vendor/three.module.min.js';

// Full 3D figure (assets/figure, built by scripts/build_figure.py). The bust is a
// closed mesh; the portrait is projected onto the surfaces it can see, and the
// sides and back use colors diffused from it. The head turns at the neck toward
// the pointer, the irises lead the head, and the eyes blink.
const BASE = new URL('./assets/', import.meta.url).href;
const VERSION = '?v=20260924'; // bump when the baked figure changes, so browsers refetch it
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const vertex = /* glsl */`
  attribute vec2 puv; attribute vec4 attrs; attribute vec4 tint;
  uniform mat4 headMatrix;
  varying vec2 vUv; varying vec4 vAttrs; varying vec3 vTint;
  varying vec3 vNormal; varying vec3 vRestNormal; varying vec3 vView;
  void main() {
    float w = attrs.z;
    vec4 turned = headMatrix * vec4(position, 1.0);
    vec3 p = mix(position, turned.xyz, w);
    vec3 n = normalize(mix(normal, mat3(headMatrix) * normal, w));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vUv = puv; vAttrs = attrs; vTint = tint.rgb;
    vNormal = normalize(mat3(modelMatrix) * n);
    vRestNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const fragment = /* glsl */`
  uniform sampler2D albedo; uniform sampler2D portrait; uniform sampler2D eyeMask; uniform sampler2D irisMap;
  uniform vec2 gaze; uniform float blink; uniform vec3 lid;
  uniform vec3 keyDir; uniform vec3 rimDir; uniform vec3 rimColor; uniform float rimStrength;
  varying vec2 vUv; varying vec4 vAttrs; varying vec3 vTint;
  varying vec3 vNormal; varying vec3 vRestNormal; varying vec3 vView;
  void main() {
    float projected = vAttrs.x, frame = smoothstep(.35, .65, vAttrs.y);
    vec3 face = texture2D(albedo, vUv).rgb;
    vec4 m = texture2D(eyeMask, vUv);
    if (projected > 0.2 && m.r > 0.002) {
      vec4 iris = texture2D(irisMap, vUv - gaze);
      vec3 eye = mix(face, iris.rgb * m.b, iris.a);
      float edge = blink * 1.1;
      float covered = (1.0 - smoothstep(edge - 0.08, edge, m.g)) * step(0.001, blink);
      float lash = smoothstep(edge - 0.3, edge - 0.02, m.g);
      eye = mix(eye, mix(lid * mix(1.0, 0.72, m.g * 0.6), vec3(0.08, 0.045, 0.035), lash * 0.85), covered);
      face = mix(face, eye, m.r);
    }
    vec3 n = normalize(vNormal);
    // The frame is real geometry: solid acetate with a moving highlight.
    vec3 h = normalize(keyDir + normalize(vView));
    vec3 acetate = vec3(.17, .165, .18) + pow(max(dot(n, h), 0.0), 40.0) * .55;
    face = mix(face, acetate, frame);
    float key = max(dot(n, keyDir), 0.0);
    float keyRest = max(dot(normalize(vRestNormal), keyDir), 0.0);
    vec3 painted = face * (1.0 + 0.45 * (key - keyRest));
    vec3 unseen = vTint * (0.58 + 0.62 * key);
    vec3 color = mix(mix(unseen, painted, projected), acetate * (.75 + .5 * key), frame);
    float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.6);
    color += rimColor * rim * (0.2 + 0.8 * max(dot(n, rimDir), 0.0)) * rimStrength;
    gl_FragColor = vec4(color, 1.0);
  }`;

function geometryFrom(buffer, info) {
  const view = (Type, [offset, count]) => new Type(buffer, offset, count);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(view(Float32Array, info.layout.position), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(view(Int16Array, info.layout.normal), 3, true));
  g.setAttribute('puv', new THREE.BufferAttribute(view(Uint16Array, info.layout.uv), 2, true));
  g.setAttribute('attrs', new THREE.BufferAttribute(view(Uint8Array, info.layout.attrs), 4, true));
  g.setAttribute('tint', new THREE.BufferAttribute(view(Uint8Array, info.layout.color), 4, true));
  g.setIndex(new THREE.BufferAttribute(view(Uint16Array, info.layout.index), 1));
  return g;
}

export async function mountFigure(host, options = {}) {
  const { maxYaw = .5, maxPitch = .2, onReady } = options;
  // Framing can differ on small screens: data-anchor-x/y, data-zoom and data-mobile-* on the host.
  const small = matchMedia('(max-width: 767px)');
  const frameFor = () => {
    const d = host.dataset, m = small.matches;
    const pick = (key, fallback) => +(m && d['mobile' + key[0].toUpperCase() + key.slice(1)] || d[key] || options[key] || fallback);
    return { anchorX: pick('anchorX', .5), anchorY: pick('anchorY', .5), zoom: pick('zoom', 1) };
  };
  const canvas = host.querySelector('canvas') || host.appendChild(document.createElement('canvas'));
  const [info, buffer, eyes] = await Promise.all([
    fetch(BASE + 'figure/figure.json' + VERSION).then(r => r.json()),
    fetch(BASE + 'figure/figure.bin' + VERSION).then(r => r.arrayBuffer()),
    fetch(BASE + 'avatar/avatar.json' + VERSION).then(r => r.json()),
  ]);
  const loader = new THREE.TextureLoader();
  const load = path => loader.loadAsync(BASE + path + VERSION).then(t => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; return t; });
  const [albedo, portrait, eyeMask, irisMap] = await Promise.all(['figure/albedo.jpg', 'figure/portrait.jpg', 'avatar/eyemask.png', 'avatar/iris.png'].map(load));
  for (const t of [eyeMask, irisMap]) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(22, 1, .1, 50);
  const uniforms = {
    albedo: { value: albedo }, portrait: { value: portrait }, eyeMask: { value: eyeMask }, irisMap: { value: irisMap },
    gaze: { value: new THREE.Vector2() }, blink: { value: 0 }, lid: { value: new THREE.Vector3(...eyes.eyes[0].lid) },
    headMatrix: { value: new THREE.Matrix4() },
    keyDir: { value: new THREE.Vector3(-.5, .55, .67).normalize() },
    rimDir: { value: new THREE.Vector3(.7, .35, -.6).normalize() },
    rimColor: { value: new THREE.Color(options.rimColor || '#9fb6ff') },
    rimStrength: { value: options.rimStrength ?? .55 },
  };
  const mesh = new THREE.Mesh(geometryFrom(buffer, info), new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms }));
  mesh.frustumCulled = false;
  const figure = new THREE.Group();
  figure.add(mesh);
  scene.add(figure);

  const pivot = new THREE.Vector3(...info.pivot);
  const head = new THREE.Object3D();
  const toPivot = new THREE.Matrix4(), fromPivot = new THREE.Matrix4(), rot = new THREE.Matrix4();
  function headTurn(yaw, pitch) {
    head.rotation.set(pitch, yaw, -yaw * .05, 'YXZ');
    head.updateMatrix();
    rot.extractRotation(head.matrix);
    fromPivot.makeTranslation(pivot.x, pivot.y, pivot.z);
    toPivot.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    uniforms.headMatrix.value.copy(fromPivot).multiply(rot).multiply(toPivot);
  }

  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const { anchorX, anchorY, zoom } = frameFor();
    // Frame the bust (about 2 x 1.95 units) with room around it, then slide it to its anchor.
    const dist = Math.max(1.18 / t, 1.1 / (t * camera.aspect)) / zoom;
    camera.position.set(0, .02, dist);
    camera.lookAt(0, .02, 0);
    const viewH = 2 * dist * t, viewW = viewH * camera.aspect;
    figure.position.set((anchorX - .5) * viewW, (.5 - anchorY) * viewH, 0);
    camera.updateProjectionMatrix();
    draw();
  }
  function draw() { if (!renderer.getContext().isContextLost()) renderer.render(scene, camera); }

  // Motion state
  let target = { x: 0, y: 0 }, lastPointer = -1e9, visible = true, raf = 0, last = 0, paused = false;
  const headAngle = { x: 0, y: 0 }, eye = { x: 0, y: 0 }, saccade = { x: 0, y: 0 };
  let blinkStart = -1, nextBlink = 0, nextSaccade = 0;
  const lerp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
  const ease = v => Math.max(-1, Math.min(1, v / Math.sqrt(1 + v * v) * 1.25));
  function blinkAmount(now) {
    if (blinkStart < 0) return 0;
    const t = (now - blinkStart) / 1000;
    if (t > .19) { blinkStart = -1; return 0; }
    return t < .07 ? t / .07 : t < .1 ? 1 : 1 - (t - .1) / .09;
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min((now - last) / 1000 || .016, .05); last = now;
    const calm = reduced.matches || paused;
    if (!calm) {
      if (!nextBlink) nextBlink = now + 1800;
      if (now > nextBlink) { blinkStart = now; nextBlink = now + (Math.random() < .18 ? 260 : 2200 + Math.random() * 4200); }
      if (now > nextSaccade) {
        const idle = now - lastPointer > 3500, s = idle ? .35 : .05;
        saccade.x = (Math.random() * 2 - 1) * s; saccade.y = (Math.random() * 2 - 1) * s * .6;
        nextSaccade = now + (idle ? 900 + Math.random() * 1800 : 600 + Math.random() * 1400);
      }
    } else { saccade.x = saccade.y = 0; blinkStart = -1; }
    const idle = !calm && now - lastPointer > 3500;
    const gx = idle ? saccade.x : target.x + saccade.x, gy = idle ? saccade.y : target.y + saccade.y;
    const hx = idle ? gx * .5 : target.x, hy = idle ? gy * .3 : target.y;
    headAngle.x = lerp(headAngle.x, hx, 4, dt); headAngle.y = lerp(headAngle.y, hy, 4, dt);
    eye.x = lerp(eye.x, Math.max(-1, Math.min(1, gx - headAngle.x * .6)), 20, dt);
    eye.y = lerp(eye.y, Math.max(-1, Math.min(1, gy - headAngle.y * .5)), 20, dt);
    headTurn(headAngle.x * maxYaw, headAngle.y * maxPitch);
    const breathe = calm ? 0 : Math.sin(now / 1000 * 1.3) * .004;
    figure.scale.set(1, 1 + breathe, 1);
    const [w, h] = info.projection.size;
    uniforms.gaze.value.set(eye.x * 12 / w, -eye.y * (eye.y < 0 ? 4 : 5) / h);
    uniforms.blink.value = blinkAmount(now);
    draw();
    const settled = calm && Math.abs(hx - headAngle.x) + Math.abs(hy - headAngle.y) < .002;
    if (!settled) raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function follow(x, y) {
    const r = host.getBoundingClientRect(), { anchorX, anchorY } = frameFor();
    const cx = r.left + r.width * anchorX, cy = r.top + r.height * (anchorY - .1);
    target.x = ease((x - cx) / Math.max(innerWidth * .4, 320));
    target.y = ease((y - cy) / Math.max(innerHeight * .5, 320));
    lastPointer = performance.now();
    start();
  }
  addEventListener('pointermove', e => follow(e.clientX, e.clientY), { passive: true });
  addEventListener('pointerdown', e => follow(e.clientX, e.clientY), { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { target.x = target.y = 0; start(); });
  reduced.addEventListener('change', start);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  new ResizeObserver(fit).observe(host);
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) start(); }, { threshold: .02 }).observe(host);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); host.classList.remove('ready'); });

  fit(); start();
  host.classList.add('ready');
  onReady?.();
  return {
    /** Hold a pose for recording: yaw and pitch in [-1, 1], eyes leading slightly. */
    pose(x, y = 0) {
      paused = true; headAngle.x = x; headAngle.y = y; eye.x = x * .35; eye.y = y * .3;
      headTurn(x * maxYaw, y * maxPitch);
      const [w, h] = info.projection.size;
      uniforms.gaze.value.set(eye.x * 12 / w, -eye.y * 5 / h); uniforms.blink.value = 0;
      draw();
    },
    /** Rotate the whole figure (turntable), in radians. */
    spin(angle) { figure.rotation.y = angle; draw(); },
    render: draw,
    canvas,
    setPaused(v) { paused = v; start(); },
    lookAt(x, y) { target.x = x; target.y = y; lastPointer = performance.now(); start(); },
  };
}

// Auto-mount: <div data-figure data-anchor-x=".68"> … </div>
for (const host of document.querySelectorAll('[data-figure]:not([data-video])')) {
  mountFigure(host).then(api => { host.figure = api; }).catch(error => { host.classList.add('failed'); console.warn('3D figure unavailable:', error.message); });
}
