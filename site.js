'use strict';

// Keep these summaries factual. Paper Quest and Mathsphere remain placeholders
// until their descriptions, technologies, and links are supplied. Each dialog
// leads with a figure from viz.js; the words are the caption, not the essay.
const projects = {
  quantum: {
    category: 'QUANTUM MACHINE LEARNING / DaMRL / 2026',
    title: 'Hyperparameter-free quantum optimizers.',
    summary: 'Quantum optimizers that choose their own step size, backed by proofs instead of tuning.',
    stats: [['0', 'learning rates to hand-tune'], ['2-phase', 'adaptive step-size schedule'], ['≡ ITE', 'proved equivalent to normalized Imaginary Time Evolution']],
    note: 'Bounds use the Weinstein and Temple spectral inequalities under Fubini–Study geometry. With Prof. Janki Bhimani; ongoing and not yet peer reviewed.',
    tags: ['Quantum optimization', 'Spectral inequalities', 'Information geometry']
  },
  hpc: {
    category: 'RESEARCH INFRASTRUCTURE / IRCC / 2026',
    title: 'HPC operations & a RAG assistant.',
    summary: 'Operating FIU’s research cluster and building a retrieval-augmented assistant for HPC questions.',
    stats: [['Slurm', 'job scheduling'], ['xCAT', 'node provisioning'], ['MPI', 'parallel workflows']],
    note: 'The terminal on the card is an illustration, not live telemetry.',
    tags: ['Slurm', 'xCAT', 'MPI', 'Linux', 'RAG'],
    links: [{ label: 'Documentation & source', url: 'https://github.com/lenishu/HPC-IRCC' }]
  },
  pruning: {
    category: 'DEEP LEARNING / FIU PHYSICS / JAN 2025–APR 2026',
    title: 'DenseNet-121 pruning study.',
    summary: 'How much of DenseNet-121 can be removed before it stops learning effectively?',
    stats: [['15', 'pruning configurations benchmarked'], ['+30%', 'evaluation throughput'], ['5', 'researchers on the team I led']],
    note: 'Modular mask generation, evaluation loops and an Information Processing Ability metric, in PyTorch and TensorFlow.',
    tags: ['PyTorch', 'TensorFlow', 'DenseNet-121', 'Model sparsity'],
    links: [{ label: 'Source code', url: 'https://github.com/lenishu/IPA_using_Densenet' }]
  },
  panthersoft: {
    category: 'SOFTWARE ENGINEERING / PANTHERSOFT / APR–JUN 2026',
    title: 'Public Class Search, rebuilt.',
    summary: 'Turning FIU’s legacy PeopleSoft class search into a responsive, mobile-first web app.',
    stats: [['50,000+', 'students at the university'], ['10 s → <1 s', 'response time'], ['35%', 'faster prototype load']],
    note: 'The card art is a concept, not a screenshot. The link opens FIU’s current public class search, not our prototype.',
    tags: ['React', 'TypeScript', 'Tailwind CSS', 'Firebase', 'REST APIs'],
    links: [{ label: 'Live FIU class search', url: 'https://classes.fiu.edu/' }]
  },
  publication: {
    category: 'PUBLICATION / IJISRT / AUGUST 2023',
    title: 'Graph coloring with Grover’s algorithm.',
    summary: 'Grover’s quantum search applied to planar graph coloring. Each iteration amplifies the valid answer; step through it below.',
    stats: [['√N', 'queries instead of N'], ['Qiskit', 'quantum circuit'], ['2023', 'published in IJISRT']],
    note: 'Built at Incubate Nepal.',
    tags: ['Qiskit', 'Grover’s algorithm', 'Quantum circuits', 'Graph coloring'],
    links: [
      { label: 'Read the paper', url: 'https://ijisrt.com/solving-the-general-planar-graph-coloring-problem-using-grovers-algorithm' },
      { label: 'Source code', url: 'https://github.com/lenishu/Grovers_algorithm_for_graph_coloring_problem' }
    ]
  }
};

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Project dialogs live on the home page only.
const dialog = document.querySelector('#project-dialog');
if (dialog) {
  const viz = document.querySelector('#dialog-viz');
  let priorFocus, stopViz;
  document.querySelectorAll('[data-project]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.project, project = projects[key];
      if (!project) return;
      priorFocus = button;
      document.querySelector('#dialog-category').textContent = project.category;
      document.querySelector('#dialog-title').textContent = project.title;
      document.querySelector('#dialog-summary').textContent = project.summary;
      stopViz?.();
      viz.replaceChildren();
      stopViz = window.Viz?.[key]?.(viz);
      const stats = document.querySelector('#dialog-stats');
      stats.replaceChildren(...project.stats.map(([value, label]) => {
        const item = make('div');
        item.append(make('dt', '', value), make('dd', '', label));
        return item;
      }));
      const body = document.querySelector('#dialog-body');
      body.replaceChildren();
      if (project.note) body.append(make('p', 'dialog-note', project.note));
      const tags = make('div', 'tags');
      project.tags.forEach(text => tags.append(make('span', '', text)));
      body.append(tags);
      if (project.links?.length) {
        const links = make('div', 'project-links dialog-project-links');
        project.links.forEach(item => {
          const link = make('a', '', item.label + ' ↗');
          link.href = item.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          links.append(link);
        });
        body.append(links);
      }
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      dialog.scrollTop = 0;
    });
  });
  document.querySelectorAll('.dialog-close, .dialog-done').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return; // reopened before the close event arrived
    stopViz?.(); stopViz = null;
    viz.replaceChildren();
    document.body.style.overflow = '';
    priorFocus?.focus({ preventScroll: true });
  });
}

const filters = [...document.querySelectorAll('[data-filter]')];
const cards = [...document.querySelectorAll('.project-grid [data-category]')];
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(filter => {
    const selected = filter === button;
    filter.classList.toggle('active', selected);
    filter.setAttribute('aria-pressed', String(selected));
  });
  let count = 0;
  cards.forEach(card => {
    card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter;
    if (!card.hidden) count++;
  });
  document.querySelector('#filter-status').textContent = `${count} projects shown.`;
}));

// Experience timeline: bars share one axis, from the first role to today.
(() => {
  const roles = [...document.querySelectorAll('.role')];
  const track = document.querySelector('#axis-track');
  if (!roles.length || !track) return;
  const now = new Date();
  const month = value => { const [y, m] = value.split('-').map(Number); return new Date(y, m - 1, 1); };
  const start = new Date(2022, 10, 1), end = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const at = date => ((date - start) / (end - start)) * 100;
  const format = date => date.toLocaleString('en', { month: 'short', year: 'numeric' });
  for (let year = 2023; year <= now.getFullYear(); year++) {
    const tick = make('span', 'tick', String(year));
    tick.style.left = at(new Date(year, 0, 1)) + '%';
    track.append(tick);
  }
  roles.forEach(role => {
    const from = month(role.dataset.start), live = role.dataset.end === 'present';
    const to = live ? now : new Date(month(role.dataset.end).getFullYear(), month(role.dataset.end).getMonth() + 1, 0);
    const bar = role.querySelector('.role-bar');
    bar.style.left = at(from) + '%';
    bar.style.width = Math.max(at(to) - at(from), 1.4) + '%';
    role.classList.toggle('live', live);
    role.querySelector('.role-dates').textContent = `${format(from)} – ${live ? 'now' : format(to)}`;
  });
})();

// Draw-on-arrival for the diagrams; everything is already visible without JS.
window.Viz?.groverMini(document.querySelector('.grover-mini'));
const seen = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  entry.target.classList.add('seen');
  seen.unobserve(entry.target);
}), { threshold: .15 });
document.querySelectorAll('.route, .grover-mini, .timeline, .stack').forEach(node => {
  node.classList.add('reveal');
  seen.observe(node);
});

const copyButton = document.querySelector('#copy-email');
let copyTimer;
copyButton?.addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText('lenishpandeynepal@gmail.com');
    copyButton.textContent = 'Copied ✓';
    status.textContent = 'Email address copied to clipboard.';
  } catch {
    // Keep the email selectable when the clipboard is blocked (e.g. file URLs).
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.contact-email'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyButton.textContent = 'Email selected';
    status.textContent = 'Copy unavailable. The email address is selected; use your device’s copy command.';
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { copyButton.textContent = 'Copy email ⧉'; }, 3000);
});
document.querySelector('#year').textContent = new Date().getFullYear();
