// Home page scroll story: one particle field behind the page reshapes for each step
// ([data-form] sections) as it crosses the middle of the screen. The rail shows the
// field and step; the IPA step prunes the network as you scroll through it (a dot rides
// the measured IPA curve); the HPC items point the cluster at what they describe.
import { createParticles } from './particles.js?v=20260925';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 899px)');

const steps = $$('main [data-form]');
const railSteps = $$('.rail .steps a');
const caption = $('#caption');
const ipa = $('#ipa');

// Where the picture sits: centred for the hero and contact; beside the entries, centred in the
// free band between the rail and the entry and scaled to fit it; in the top half on phones.
function frameFor(step) {
  const kind = step.dataset.frame, W = innerWidth, H = innerHeight;
  if (kind === 'hero') return { x: 0, y: .04, zoom: 1 };
  if (narrow.matches) return { x: 0, y: .21, zoom: 1.18 };
  if (kind === 'center') return { x: 0, y: .06, zoom: 1.12 };
  const left = 250, right = W - .06 * W - Math.min(540, .44 * W) - 24;   // rail edge, entry edge (story.css)
  return { x: .5 - (left + right) / 2 / W, y: .03, zoom: clamp(1.02 * H / (right - left), 1.15, 2.2) * (+step.dataset.zoom || 1) };
}

const particles = createParticles($('#particles'), {
  // the particles react to the pointer only over open space, not over text or controls
  hoverTest: e => !e.target.closest?.('.entry, .rail, .nav, .menu, .caption, .contact-inner, a, button, dialog, footer'),
  parallax: reduced ? 0 : 1,
  frame: frameFor(steps[0]),
});
if (reduced) particles.speed(.45);   // calmer, but still moving: these forms are processes

let active = null;
function activate(step) {
  active = step;
  particles.show(step.dataset.form);
  particles.frame(frameFor(step));
  const field = step.closest('[data-chapter]')?.dataset.chapter || 'neural';
  document.body.dataset.field = field;
  document.body.classList.toggle('reading', !step.classList.contains('hero-step') && !step.classList.contains('contact'));
  $$('.rail [data-chapter]').forEach(li => li.classList.toggle('on', li.dataset.chapter === field && !step.classList.contains('contact')));
  railSteps.forEach(a => a.classList.toggle('on', a.hash === '#' + step.id));
  if (caption) caption.textContent = step.dataset.caption || '';
}

// ---------------------------------------------------------------- IPA: prune by scrolling
// The BS = 60,000 curve traced from the measured plot (assets/media/ipa-plot.webp), 0–98% pruned
// in 1% steps, as fractions of the image height; the plot's x axis runs from 13.45% to 96.48% of its width.
const IPA_Y = [.1096,.1083,.1096,.1096,.1108,.1108,.1121,.1121,.1134,.1134,.1159,.1159,.1159,.1171,.1184,.1196,.1196,.1209,.1222,.1234,.1247,.1247,.1259,.1285,.1297,.1310,.1322,.1348,.1348,.1360,.1398,.1398,.1423,.1436,.1448,.1474,.1499,.1511,.1524,.1549,.1574,.1587,.1612,.1650,.1662,.1688,.1700,.1738,.1763,.1776,.1814,.1851,.1889,.1914,.1952,.2003,.2040,.2078,.2116,.2154,.2217,.2254,.2305,.2355,.2443,.2494,.2582,.2632,.2683,.2746,.2821,.2909,.3010,.3149,.3237,.3338,.3401,.3564,.3652,.3741,.3866,.3955,.4118,.4320,.4521,.4691,.4861,.5101,.5277,.5466,.5756,.6071,.6335,.6587,.6877,.7217,.7506,.7884,.8262];
const PLOT = { x0: .1345, x1: .9648, top: .0642, bottom: .8854, max: .98 };
const ipaAt = p => { const x = Math.min(p, PLOT.max) * 100, k = Math.min(IPA_Y.length - 2, Math.floor(x)), u = x - k; return IPA_Y[k] + (IPA_Y[k + 1] - IPA_Y[k]) * u; };
let shownPrune = -1;
function setPrune(p) {
  if (Math.abs(p - shownPrune) < .002) return;
  shownPrune = p;
  particles.form('neural.densenet').param = p;
  const q = p * PLOT.max, x = (PLOT.x0 + (PLOT.x1 - PLOT.x0) * q) * 100;
  $('#ipa-marker').style.left = x + '%';
  const dot = $('#ipa-dot'); dot.style.left = x + '%'; dot.style.top = ipaAt(q) * 100 + '%';
  $('#ipa-read').textContent = `${Math.round(q * 100)}% pruned`;
}

// ---------------------------------------------------------------- scroll
let queued = false;
function onScroll() {
  queued = false;
  const mid = innerHeight * .5;
  let now = steps[0];
  for (const s of steps) if (s.getBoundingClientRect().top <= mid) now = s;
  if (now !== active) activate(now);
  if (ipa) {
    // 0 when the section's top reaches mid-screen, 1 by the time its entry lets go
    const r = ipa.getBoundingClientRect(), prog = clamp((mid - r.top) / r.height, 0, 1);
    setPrune(clamp(prog / (narrow.matches ? .8 : .82), 0, 1));
  }
  // keep the caption (and its Pause button) clear of the footer as it scrolls in
  if (captionBox && footer) captionBox.style.transform = `translateY(${-Math.max(0, innerHeight - footer.getBoundingClientRect().top)}px)`;
}
const captionBox = $('.caption'), footer = $('.footer');
const requestScroll = () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } };
addEventListener('scroll', requestScroll, { passive: true });
addEventListener('resize', () => { if (active) particles.frame(frameFor(active)); requestScroll(); });
narrow.addEventListener?.('change', () => active && particles.frame(frameFor(active)));
onScroll();
particles.warm([...new Set(steps.map(s => s.dataset.form))]);

// ---------------------------------------------------------------- accordions
// One item open per group; in a group tied to a form, the open item's data-focus points the particles at it.
document.addEventListener('click', e => {
  const button = e.target.closest('.acc > button');
  if (!button) return;
  const item = button.parentElement, open = !item.classList.contains('open'), group = item.parentElement;
  $$(':scope > .acc.open', group).forEach(other => { if (other !== item) { other.classList.remove('open'); other.firstElementChild.setAttribute('aria-expanded', 'false'); } });
  item.classList.toggle('open', open);
  button.setAttribute('aria-expanded', String(open));
  const key = group.dataset.focusForm;
  if (key) particles.form(key).focus = open ? item.dataset.focus || null : null;
});

// ---------------------------------------------------------------- figure tabs (curve · phase transition · math)
$$('[role="tablist"]').forEach(list => {
  const tabs = $$('[role="tab"]', list);
  const select = (tab, focus) => tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).classList.toggle('on', on);
    if (on && focus) t.focus();
  });
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', e => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step) { e.preventDefault(); select(tabs[(i + step + tabs.length) % tabs.length], true); }
    });
  });
});
// Order parameter against control parameter for three systems, each with its critical point.
const curves = {
  magnet: { f: x => x < .62 ? (1 - x / .62) ** .33 : 0, c: .62, cl: 'Tc', xl: 'temperature', yl: 'magnetization' },
  perc: { f: x => x < .5 ? (1 - x / .5) ** .41 : 0, c: .5, cl: 'pc', xl: 'links cut', yl: 'spanning' },
  ipa: { f: x => x > PLOT.max ? 0 : (PLOT.bottom - ipaAt(x)) / (PLOT.bottom - IPA_Y[0]), c: .8, cl: 'pc', xl: 'removed', yl: 'IPA' },
};
$$('[data-curve]').forEach(svg => {
  const { f, c, cl, xl, yl } = curves[svg.dataset.curve], ax = x => 14 + 100 * x, ay = y => 66 - 54 * y;
  const d = Array.from({ length: 101 }, (_, k) => `${k ? 'L' : 'M'}${ax(k / 100).toFixed(1)} ${ay(f(k / 100)).toFixed(1)}`).join('');
  svg.innerHTML = `<path class="ax" d="M14 8V66H116"/><path class="cr" d="M${ax(c)} 10V66"/><path class="cv" d="${d}"/>`
    + `<text x="${ax(c) + 3}" y="16">${cl}</text><text x="116" y="77" text-anchor="end">${xl} →</text><text x="16" y="8" dy="-1">${yl}</text>`;
});

// ---------------------------------------------------------------- inline figures (viz.js)
for (const [sel, build] of [['[data-grafana]', 'grafana'], ['[data-mpi]', 'mpi'], ['[data-levels]', 'levels']]) $$(sel).forEach(host => window.Viz?.[build]?.(host));

// ---------------------------------------------------------------- motion toggle
const motion = $('#motion');
motion?.addEventListener('click', () => {
  const paused = motion.getAttribute('aria-pressed') !== 'true';
  motion.setAttribute('aria-pressed', String(paused));
  motion.textContent = paused ? 'Play' : 'Pause';
  particles.pause(paused);
});
