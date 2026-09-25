// Home page scroll story: one particle field behind the page reshapes for each step
// ([data-form] sections) as it crosses the middle of the screen. The rail shows the
// field and step; the IPA step prunes the network as you scroll through it (a dot rides
// the measured IPA curve); the HPC items point the cluster at what they describe.
import { initProjectDetails, PLOT, ipaAt } from './project-details.js?v=20260924f';
import { createParticles } from './particles.js?v=20260924f';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = matchMedia('(max-width: 899px)');

const steps = $$('main [data-form]');
const railSteps = $$('.rail .steps a');
const caption = $('#caption');
const ipa = $('#ipa');
// Scroll starts an eased reveal that finishes even when the user stops scrolling.
const revealTitles = $$('.entry > .project').map(title => {
  const mask = document.createElement('span');
  mask.className = 'reveal-mask';
  const text = document.createElement('span');
  text.className = 'reveal-text';
  [...title.childNodes].filter(node => !(node.nodeType === 1 && node.matches('.project-index')))
    .forEach(node => text.append(node));
  mask.append(text);
  title.append(mask);
  return { mask, text, progress:0 };
});
// Left-side role titles reveal within each wrapped line, at their final position.
const roleTitles = $$('.experience-sequence').map(group => {
  const heading = $('.role-heading', group), title = $('h2', heading);
  const words = title.textContent.trim().split(/\s+/);
  title.replaceChildren();
  words.forEach((word, index) => {
    if (index) title.append(document.createTextNode(' '));
    const mask = document.createElement('span');
    mask.className = 'title-word-mask';
    const text = document.createElement('span');
    text.className = 'title-word';
    text.textContent = word;
    mask.append(text);
    title.append(mask);
  });
  return { group, heading, title, progress:0 };
});
document.body.classList.add('role-motion');
let currentRole = null;
function revealOnScroll() {
  const nextRole = roleTitles.find(item => {
    const r = item.group.getBoundingClientRect();
    return r.top <= innerHeight * .5 && r.bottom > innerHeight * .5;
  });
  if (nextRole !== currentRole) {
    roleTitles.forEach(item => item.group.classList.remove('is-leaving'));
    currentRole?.group.classList.add('is-leaving');
    currentRole = nextRole;
  }
  roleTitles.forEach(item => {
    const current = item === currentRole;
    item.group.classList.toggle('is-current', current);
    item.heading.inert = !narrow.matches && !current;
    const entered = narrow.matches ? item.title.getBoundingClientRect().top < innerHeight * .88 : current;
    item.progress = entered ? 1 : (narrow.matches ? item.progress : 0);
    item.title.style.setProperty('--title-offset', item.progress ? '0%' : '110%');
  });
  revealTitles.forEach(item => {
    const top = item.mask.getBoundingClientRect().top;
    if (top < innerHeight * .9) item.progress = 1;
    item.text.style.transform = `translateY(${(1 - item.progress) * 105}%)`;
  });
}
document.addEventListener('focusin', event => {
  const entry = event.target.closest('.entry');
  if (!entry) return;
  revealTitles.filter(item => entry.contains(item.mask)).forEach(item => {
    item.progress = 1;
    item.text.style.transform = 'none';
    item.mask.style.clipPath = 'none';
  });
});

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
  completeTransitions: true,
  morphDuration: .9,
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
  revealOnScroll();
  if (ipa) {
    // Pruning follows the section's passage through the viewport without pinning it.
    const r = ipa.getBoundingClientRect();
    setPrune(clamp((innerHeight * .85 - r.top) / (r.height + innerHeight * .6), 0, 1));
  }
  // keep the caption (and its Pause button) clear of the footer as it scrolls in
  if (captionBox && footer) captionBox.style.transform = `translateY(${-Math.max(0, innerHeight - footer.getBoundingClientRect().top)}px)`;
}
const captionBox = $('.caption'), footer = $('.footer');
const requestScroll = () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } };
addEventListener('scroll', requestScroll, { passive: true });
addEventListener('resize', () => { if (active) particles.frame(frameFor(active)); requestScroll(); });
narrow.addEventListener?.('change', () => {
  if (active) { particles.frame(frameFor(active)); requestScroll(); }
});
onScroll();
particles.warm([...new Set(steps.map(s => s.dataset.form))]);

initProjectDetails({ particles });

// ---------------------------------------------------------------- motion toggle
const motion = $('#motion');
motion?.addEventListener('click', () => {
  const paused = motion.getAttribute('aria-pressed') !== 'true';
  motion.setAttribute('aria-pressed', String(paused));
  motion.textContent = paused ? 'Play' : 'Pause';
  particles.pause(paused);
});
