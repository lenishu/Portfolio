'use strict';

// Page behaviour shared by the home and about pages: nav and mobile menu,
// copy-to-clipboard, demo dialogs, and the optional mouse-scrubbed figure video.
// The home page's scroll story lives in story.js.
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

// ---------------------------------------------------------------- demos
const demos = {
  panthersoft: ['Software engineering · PantherSoft', 'Class search, before and after', 'Response and load times from the internship prototype.'],
  hpc: ['Research computing · IRCC', 'How the cluster fits together', 'Questions go to the RAG assistant; jobs go through Slurm to compute nodes.'],
  architecture: ['HPC Agent · IRCC', 'Architecture', 'Three chat channels, one read-only agent, four back-ends. Switch to the RAG pipeline to see how documents become answers.'],
  adopt: ['HPC administration · IRCC', 'pam_slurm_adopt, step by step', 'SSH into a compute node only while you have a job there, and land inside that job’s cgroup.'],
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
