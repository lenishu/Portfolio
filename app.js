'use strict';

// Page behaviour for the home and about pages: typewriter intro, field tabs,
// expanding experience, project media, demo dialogs, copy-to-clipboard, and the
// optional mouse-scrubbed hero video.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// ---------------------------------------------------------------- nav
const nav = $('#nav'), burger = $('.burger'), menu = $('#menu');
burger?.addEventListener('click', () => {
  const open = burger.getAttribute('aria-expanded') !== 'true';
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  menu.classList.toggle('open', open);
});
menu?.addEventListener('click', e => { if (e.target.closest('a')) burger.click(); });
addEventListener('scroll', () => nav?.classList.toggle('solid', scrollY > innerHeight * .6), { passive: true });

// ---------------------------------------------------------------- typewriter + pills
function typewriter(el, text, speed = 38, startDelay = 600) {
  if (reducedMotion) { el.textContent = text; return; }
  const out = document.createElement('span'), caret = document.createElement('span');
  caret.className = 'caret';
  el.replaceChildren(out, caret);
  el.setAttribute('aria-label', text);
  let i = 0;
  setTimeout(() => {
    const timer = setInterval(() => {
      out.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(timer); caret.remove(); }
    }, speed);
  }, startDelay);
}
$$('[data-typewriter]').forEach(el => typewriter(el, el.dataset.typewriter));
setTimeout(() => $('#hero-pills')?.classList.add('shown'), 400);

// ---------------------------------------------------------------- copy email
$$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const value = button.dataset.copy, status = $('#copy-status');
  const original = button.innerHTML;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = 'Copied ✓';
    if (status) status.textContent = 'Email address copied.';
  } catch {
    location.href = 'mailto:' + value;
  }
  setTimeout(() => { button.innerHTML = original; }, 1800);
}));

// ---------------------------------------------------------------- fields
const tabs = $$('[role="tab"][data-tab]');
function selectField(field, { focus = false, scroll = false } = {}) {
  if (!tabs.length) return;
  tabs.forEach(tab => {
    const on = tab.dataset.tab === field;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  });
  $$('.panel[role="tabpanel"]').forEach(panel => {
    const on = panel.id === field;
    panel.hidden = !on;
    panel.classList.toggle('active', on);
    if (on) initPanel(panel);
  });
  document.dispatchEvent(new CustomEvent('fieldchange', { detail: field }));
  if (history.replaceState) history.replaceState(null, '', '#' + field);
  if (scroll) $('#fields').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectField(tab.dataset.tab));
  tab.addEventListener('keydown', e => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    selectField(tabs[(i + step + tabs.length) % tabs.length].dataset.tab, { focus: true });
  });
});
$$('[data-pick]').forEach(link => link.addEventListener('click', e => {
  e.preventDefault();
  selectField(link.dataset.pick, { scroll: true });
}));
// Deep links: #quant, #quantum-research, …
function fromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  const panel = target?.closest('.panel') || (target?.classList.contains('panel') ? target : null);
  if (panel) {
    selectField(panel.id);
    if (target !== panel) requestAnimationFrame(() => target.scrollIntoView());
    else $('#fields').scrollIntoView();
  }
}
addEventListener('hashchange', fromHash);
if (tabs.length) fromHash();

// ---------------------------------------------------------------- experience
$$('.exp-toggle').forEach(toggle => toggle.addEventListener('click', () => {
  const exp = toggle.closest('.exp'), open = !exp.classList.contains('open');
  exp.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
}));

// ---------------------------------------------------------------- project media
const videoWatch = 'IntersectionObserver' in window && new IntersectionObserver(entries => entries.forEach(entry => {
  const video = entry.target;
  if (entry.isIntersecting && !video.hidden && !reducedMotion) video.play().catch(() => {});
  else video.pause();
}), { threshold: .4 });
$$('[data-media]').forEach(media => {
  const buttons = $$('.media-tabs button', media), shots = $$('.shot', media);
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    shots.forEach(shot => {
      shot.hidden = shot.dataset.kind !== button.dataset.show;
      if (shot.tagName === 'VIDEO') shot.hidden ? shot.pause() : (!reducedMotion && shot.play().catch(() => {}));
    });
  }));
});
$$('video[data-kind]').forEach(video => { video.preload = 'metadata'; videoWatch?.observe(video); });

// ---------------------------------------------------------------- demos
const demos = {
  pruning: ['Deep learning · DenseNet-121', 'Pruning, interactively', 'Drag the sparsity and watch the weakest connections disappear.'],
  panthersoft: ['Software engineering · PantherSoft', 'Class search, before and after', 'Response and load times from the internship prototype.'],
  hpc: ['Research computing · IRCC', 'How the cluster fits together', 'Questions go to the RAG assistant; jobs go through Slurm to compute nodes.'],
  publication: ['Quantum · IJISRT 2023', 'Grover’s search, step by step', 'Each iteration flips the valid coloring, then reflects every amplitude about the mean.'],
  quantum: ['Quantum ML · DaMRL', 'Two-phase step sizes', 'A sketch of the schedule converging to the ground energy inside a shrinking bound.'],
  options: ['Quant · concept demo', 'Paths and prices', 'Geometric Brownian motion paths and a European call priced two ways.'],
};
const dialog = $('#demo');
let stopDemo, lastTrigger;
$$('[data-demo]').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.demo, [kicker, title, summary] = demos[key] || [];
  if (!dialog || !window.Viz?.[key]) return;
  lastTrigger = button;
  $('#demo-kicker').textContent = kicker; $('#demo-title').textContent = title; $('#demo-summary').textContent = summary;
  const host = $('#demo-viz');
  stopDemo?.(); host.replaceChildren(); host.className = 'dialog-viz';
  stopDemo = window.Viz[key](host);
  dialog.showModal();
}));
$('.dialog-close')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
dialog?.addEventListener('close', () => { if (dialog.open) return; stopDemo?.(); stopDemo = null; $('#demo-viz').replaceChildren(); lastTrigger?.focus(); });

// Inline figures inside research cards, built when their panel first opens.
function initPanel(panel) {
  $$('[data-inline]:not(.built)', panel).forEach(host => {
    if (!window.Viz?.[host.dataset.inline]) return;
    host.classList.add('built');
    window.Viz[host.dataset.inline](host);
  });
}
addEventListener('load', () => { const active = $('.panel.active'); if (active) initPanel(active); });

// ---------------------------------------------------------------- optional scrubbed hero video
// Add data-video="assets/hero/turn.mp4" to .hero-figure to replace the live 3D
// figure with a head-turn video that scrubs with horizontal mouse movement.
$$('.hero-figure[data-video]').forEach(host => {
  const video = document.createElement('video');
  Object.assign(video, { muted: true, playsInline: true, preload: 'auto' });
  host.replaceChildren(video);
  // Load the whole clip first: scrubbing needs random access, which some servers don't offer.
  fetch(host.dataset.video).then(r => r.blob()).then(blob => { video.src = URL.createObjectURL(blob); })
    .catch(() => { video.src = host.dataset.video; });
  const SENSITIVITY = .8;
  let prevX = null, targetTime = 0, seeking = false;
  const ready = () => Number.isFinite(video.duration) && video.duration > 0;
  const seek = () => {
    if (!ready()) return;
    if (!Number.isFinite(targetTime)) targetTime = video.duration / 2;
    if (Math.abs(video.currentTime - targetTime) < .01) { seeking = false; return; }
    seeking = true; video.currentTime = targetTime;
  };
  video.addEventListener('loadedmetadata', () => { targetTime = video.duration / 2; seek(); });
  video.addEventListener('seeked', () => { seeking = false; if (Math.abs(video.currentTime - targetTime) > .01) seek(); });
  addEventListener('mousemove', e => {
    if (prevX !== null && ready()) {
      const delta = e.clientX - prevX;
      targetTime = Math.min(video.duration, Math.max(0, targetTime + delta / innerWidth * SENSITIVITY * video.duration));
      if (!seeking) seek();
    }
    prevX = e.clientX;
  }, { passive: true });
});

const year = $('#year'); if (year) year.textContent = new Date().getFullYear();
$$('[data-top]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }); }));
