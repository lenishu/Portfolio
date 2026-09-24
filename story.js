// Home page scroll story: one particle field behind the page reshapes for each step
// ([data-form] sections) as it crosses the middle of the screen. The rail shows the
// field and step; the IPA step prunes the network as you scroll through it; the HPC
// items point the cluster at what they describe.
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

// Where the picture sits: centred for the hero and contact; beside the cards, centred in the
// free band between the rail and the card and scaled to fit it; in the top half on phones.
function frameFor(step) {
  const kind = step.dataset.frame, W = innerWidth, H = innerHeight;
  if (kind === 'hero') return { x: 0, y: .04, zoom: 1 };
  if (narrow.matches) return { x: 0, y: .21, zoom: 1.18 };
  if (kind === 'center') return { x: 0, y: .06, zoom: 1.12 };
  const left = 250, right = W - .06 * W - Math.min(540, .44 * W) - 24;   // rail edge, card edge (story.css)
  return { x: .5 - (left + right) / 2 / W, y: .03, zoom: clamp(1.02 * H / (right - left), 1.15, 2.2) * (+step.dataset.zoom || 1) };
}

const particles = createParticles($('#particles'), {
  // the particles react to the pointer only over open space, not over text or controls
  hoverTest: e => !e.target.closest?.('.card, .rail, .nav, .menu, .caption, .contact-inner, a, button, dialog, footer'),
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
const ipaCurve = p => (.74 + .2 * Math.sin(Math.PI * p * .85)) / (1 + Math.exp((p - .875) / .02)) + .04;   // schematic
const X0 = 34, X1 = 310, Y0 = 114, Y1 = 18, px = p => X0 + (X1 - X0) * p, py = v => Y0 - (Y0 - Y1) * v;
const pathTo = (f, to, n = 120) => Array.from({ length: n + 1 }, (_, k) => { const p = to * k / n; return `${k ? 'L' : 'M'}${px(p).toFixed(1)} ${py(f(p)).toFixed(1)}`; }).join('');
if (ipa) {
  $('#ipa-curve').setAttribute('d', pathTo(ipaCurve, 1));
  const crit = $('.ipa-fig .crit'), label = $('.ipa-fig .crit-label');
  crit.setAttribute('x', px(.82)); crit.setAttribute('width', px(.94) - px(.82));
  label.setAttribute('x', px(.82) - 5); label.setAttribute('y', 108); label.setAttribute('text-anchor', 'end');
}
let shownPrune = -1;
function setPrune(p) {
  if (Math.abs(p - shownPrune) < .002) return;
  shownPrune = p;
  particles.form('neural.densenet').param = p;
  $('#ipa-done').setAttribute('d', p > 0 ? pathTo(ipaCurve, p, Math.max(2, Math.round(p * 120))) : '');
  const dot = $('#ipa-dot'); dot.setAttribute('cx', px(p)); dot.setAttribute('cy', py(ipaCurve(p)));
  $('#ipa-read').textContent = `${Math.round(p * 100)}% removed`;
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
    // 0 when the section's top reaches mid-screen, 1 by the time its card lets go
    const r = ipa.getBoundingClientRect(), prog = clamp((mid - r.top) / r.height, 0, 1);
    setPrune(clamp(prog / (narrow.matches ? .8 : .82), 0, 1));
  }
}
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
  ipa: { f: x => (ipaCurve(x) - .04) / .96, c: .875, cl: 'pc', xl: 'removed', yl: 'IPA' },
};
$$('[data-curve]').forEach(svg => {
  const { f, c, cl, xl, yl } = curves[svg.dataset.curve], ax = x => 14 + 100 * x, ay = y => 66 - 54 * y;
  const d = Array.from({ length: 101 }, (_, k) => `${k ? 'L' : 'M'}${ax(k / 100).toFixed(1)} ${ay(f(k / 100)).toFixed(1)}`).join('');
  svg.innerHTML = `<path class="ax" d="M14 8V66H116"/><path class="cr" d="M${ax(c)} 10V66"/><path class="cv" d="${d}"/>`
    + `<text x="${ax(c) + 3}" y="16">${cl}</text><text x="116" y="77" text-anchor="end">${xl} →</text><text x="16" y="8" dy="-1">${yl}</text>`;
});

// ---------------------------------------------------------------- motion toggle
const motion = $('#motion');
motion?.addEventListener('click', () => {
  const paused = motion.getAttribute('aria-pressed') !== 'true';
  motion.setAttribute('aria-pressed', String(paused));
  motion.textContent = paused ? 'Play' : 'Pause';
  particles.pause(paused);
});
