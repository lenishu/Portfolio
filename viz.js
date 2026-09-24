'use strict';

// Small, dependency-free figures for the project dialogs. Each builder fills a
// <figure> and returns a cleanup function for timers it starts. Figures that
// are sketches say so in their caption; numbers shown are the project's own.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (parent) parent.append(node);
    return node;
  }
  function label(parent, x, y, text, attrs = {}) {
    const node = el('text', { x, y, ...attrs }, parent);
    node.textContent = text;
    return node;
  }
  function frame(host, width, height, name) {
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': name });
    host.append(svg);
    return svg;
  }
  function caption(host, text) {
    const node = document.createElement('figcaption');
    node.textContent = text;
    host.append(node);
  }
  function seeded(seed) {
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  }

  // Energy falls toward the ground state while a variance bound brackets the gap.
  function quantum(host) {
    host.classList.add('dialog-viz', 'viz-quantum');
    const svg = frame(host, 640, 250, 'Sketch: energy converging to the ground state in two phases, bracketed by a shrinking bound');
    const E0 = 190, points = [];
    for (let k = 0; k < 20; k++) {
      const x = k < 6 ? 62 + k * 38 : 252 + (k - 5) * 24.5;
      const gap = k < 6 ? 150 * .6 ** k : 150 * .6 ** 5 * .8 ** (k - 5);
      points.push([x, E0 - gap, gap]);
    }
    const upper = points.map(([x, y]) => `${x},${y}`).join(' ');
    const lower = points.slice().reverse().map(([x, , g]) => `${x},${E0 + g * .42}`).join(' ');
    el('polygon', { class: 'q-band', points: `${upper} ${lower}` }, svg);
    el('line', { class: 'q-ground', x1: 40, x2: 612, y1: E0, y2: E0 }, svg);
    label(svg, 612, E0 + 18, 'E₀  ground energy', { class: 'q-note', 'text-anchor': 'end' });
    el('line', { class: 'q-divider', x1: 264, x2: 264, y1: 18, y2: 230 }, svg);
    label(svg, 72, 26, 'PHASE 1 · BOLD STEPS', { class: 'q-phase' });
    label(svg, 278, 26, 'PHASE 2 · CAREFUL STEPS', { class: 'q-phase' });
    label(svg, 74, 216, 'certified gap', { class: 'q-note q-band-label' });
    label(svg, 612, 244, 'iterations →', { class: 'q-note', 'text-anchor': 'end' });
    label(svg, 18, 120, 'energy', { class: 'q-note', transform: 'rotate(-90 18 120)', 'text-anchor': 'middle' });
    el('polyline', { class: 'q-line', points: upper, pathLength: 1 }, svg);
    points.forEach(([x, y], k) => el('circle', { class: 'q-dot', cx: x, cy: y, r: k < 6 ? 4.5 : 3, style: `--i:${k}` }, svg));
    caption(host, 'A sketch of the idea, not experimental data. Ongoing research, not yet peer reviewed.');
  }

  // Researcher → assistant and scheduler; jobs light up spans of compute nodes.
  function hpc(host) {
    host.classList.add('dialog-viz', 'viz-hpc');
    const svg = frame(host, 640, 270, 'Diagram: a researcher asks a RAG assistant and submits jobs through Slurm to compute nodes');
    const ask = 'M82 120 C 130 70, 150 70, 196 70', submit = 'M82 150 C 130 200, 150 200, 196 200';
    el('path', { class: 'h-wire', d: ask }, svg);
    el('path', { class: 'h-wire', d: submit }, svg);
    el('path', { class: 'h-wire', d: 'M326 70 H 388' }, svg);
    el('path', { class: 'h-wire', d: 'M326 200 H 372' }, svg);
    el('circle', { class: 'h-person', cx: 58, cy: 135, r: 25 }, svg);
    label(svg, 58, 140, 'you', { class: 'h-title', 'text-anchor': 'middle' });
    for (const [y, title, sub] of [[42, 'RAG assistant', 'answers HPC questions'], [172, 'Slurm', 'queues every job']]) {
      el('rect', { class: 'h-box', x: 196, y, width: 130, height: 56, rx: 6 }, svg);
      label(svg, 212, y + 25, title, { class: 'h-title' });
      label(svg, 212, y + 42, sub, { class: 'h-sub' });
    }
    for (let i = 2; i >= 0; i--) el('rect', { class: 'h-doc', x: 392 + i * 7, y: 44 - i * 6, width: 50, height: 60, rx: 3 }, svg);
    label(svg, 470, 70, 'cluster docs', { class: 'h-sub' });
    label(svg, 470, 86, 'retrieved per question', { class: 'h-sub' });
    label(svg, 378, 146, 'COMPUTE NODES · PROVISIONED WITH xCAT', { class: 'h-caps' });
    const cols = 8, rows = 3, nodes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      nodes.push(el('rect', { class: 'h-node', x: 378 + c * 30, y: 158 + r * 30, width: 23, height: 23, rx: 3 }, svg));
    }
    const links = el('g', { class: 'h-links' }, svg);
    if (!still()) {
      for (const path of [ask, submit]) {
        const dot = el('circle', { class: 'h-packet', r: 4 }, svg);
        el('animateMotion', { dur: path === ask ? '2.4s' : '1.7s', repeatCount: 'indefinite', path }, dot);
      }
    }
    const busy = new Set(), timers = [];
    function job() {
      const row = Math.floor(Math.random() * rows), span = 1 + Math.floor(Math.random() * 4);
      const start = Math.floor(Math.random() * (cols - span + 1));
      const ids = [...Array(span)].map((_, i) => row * cols + start + i);
      if (ids.some(i => busy.has(i))) return;
      ids.forEach(i => { busy.add(i); nodes[i].classList.add('on'); });
      let link;
      if (span > 1) link = el('line', { class: 'h-mpi', x1: 389 + start * 30, x2: 389 + (start + span - 1) * 30, y1: 169 + row * 30, y2: 169 + row * 30 }, links);
      timers.push(setTimeout(() => {
        ids.forEach(i => { busy.delete(i); nodes[i].classList.remove('on'); });
        link?.remove();
      }, 1800 + Math.random() * 2600));
    }
    for (let i = 0; i < 6; i++) job();
    const tick = still() ? 0 : setInterval(job, 650);
    caption(host, 'A diagram of the setup, not live cluster data. Linked jobs span nodes over MPI.');
    return () => { clearInterval(tick); timers.forEach(clearTimeout); };
  }

  // A labelled box: title plus optional grey sub-lines.
  function box(svg, x, y, w, h, title, subs = [], cls = 'a-box') {
    const g = el('g', { class: cls }, svg);
    el('rect', { x, y, width: w, height: h, rx: 9 }, g);
    label(g, x + 12, y + 20, title, { class: 'a-title' });
    subs.forEach((t, i) => label(g, x + 12, y + 36 + i * 14, t, { class: 'a-sub' }));
    return g;
  }
  function wire(svg, d, cls = 'a-wire') { return el('path', { class: cls, d }, svg); }
  // A packet that loops along a path (skipped when motion is reduced).
  function packet(svg, d, dur, begin = 0) {
    if (still()) return;
    const dot = el('circle', { class: 'a-packet', r: 3.5 }, svg);
    el('animateMotion', { dur: dur + 's', begin: begin + 's', repeatCount: 'indefinite', path: d }, dot);
  }
  // Segmented control that shows one of several views.
  function views(host, names) {
    const bar = document.createElement('div');
    bar.className = 'viz-seg';
    bar.setAttribute('role', 'group');
    const panes = names.map(() => { const d = document.createElement('div'); d.className = 'viz-pane'; return d; });
    names.forEach((name, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = name; b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => {
        bar.querySelectorAll('button').forEach((x, k) => x.setAttribute('aria-pressed', String(k === i)));
        panes.forEach((p, k) => { p.hidden = k !== i; });
      });
      bar.append(b);
    });
    panes.forEach((p, k) => { p.hidden = k !== 0; });
    host.append(bar, ...panes);
    return panes;
  }

  // HPC Agent architecture (New_Architecture.md): channels → agent → back-ends, and the RAG data flow.
  function architecture(host) {
    host.classList.add('dialog-viz', 'viz-arch');
    const [sys, rag] = views(host, ['System', 'RAG pipeline']);

    const a = frame(sys, 760, 420, 'System context: web chat, Telegram and Teams reach one agent service, which calls vLLM, the embedding model, Qdrant and the cluster login node');
    label(a, 16, 14, 'CHANNELS', { class: 'a-caps' }); label(a, 196, 14, 'ADAPTERS', { class: 'a-caps' });
    label(a, 392, 14, 'HPC-AGENT SERVICE', { class: 'a-caps' }); label(a, 626, 14, 'BACK-ENDS', { class: 'a-caps' });
    box(a, 16, 36, 140, 52, 'Open WebUI', ['browser chat']);
    box(a, 16, 170, 140, 52, 'Telegram users');
    box(a, 16, 300, 140, 52, 'Teams users');
    box(a, 196, 156, 156, 80, 'telegram-bot', ['long-poll', 'SQLite chat history']);
    box(a, 196, 268, 156, 40, 'Azure Bot Service');
    box(a, 196, 330, 156, 66, 'teams-bot', ['M365 Agents SDK', 'Adaptive Cards']);
    const core = el('g', { class: 'a-core' }, a);
    el('rect', { x: 392, y: 26, width: 200, height: 384, rx: 14 }, core);
    const rows = [['main.py', '/v1/chat/completions'], ['graph.py', 'LangGraph tool loop'], ['tools.py', '11 tools'], ['rag.py', 'embed + search'], ['cluster_ssh.py', 'allowlisted, read-only'], ['cluster_data.py', 'single source of truth']];
    rows.forEach(([t, sub], i) => box(a, 406, 42 + i * 60, 172, 48, t, [sub], 'a-row'));
    box(a, 626, 60, 124, 52, 'vLLM', ['gpt-oss-120b']);
    box(a, 626, 160, 124, 62, 'Embeddings', ['nomic-embed-text', '768-d vectors']);
    box(a, 626, 242, 124, 52, 'Qdrant', ['hpc_docs']);
    box(a, 626, 318, 124, 52, 'HPC login node', ['sinfo · squeue · sacct']);
    const paths = {
      web: 'M156 62 H406', tgIn: 'M156 196 H196', tg: 'M352 196 C 380 196, 380 66, 406 66',
      tmIn: 'M156 326 C 176 326, 176 288, 196 288', abs: 'M274 308 V330', tm: 'M352 363 C 384 363, 384 70, 406 70',
      api: 'M492 90 V102', graph: 'M578 126 C 604 126, 604 86, 626 86', tools: 'M492 150 V162',
      embed: 'M578 246 C 604 246, 604 192, 626 192', qdrant: 'M578 250 C 604 250, 604 268, 626 268', ssh: 'M578 306 C 604 306, 604 344, 626 344',
    };
    Object.values(paths).forEach(d => wire(a, d));
    label(a, 597, 100, 'chat', { class: 'a-note' });
    label(a, 688, 388, 'read-only SSH', { class: 'a-note', 'text-anchor': 'middle' });
    packet(a, paths.web, 2.6); packet(a, paths.tg, 2.2, .6); packet(a, paths.tm, 2.8, 1.1);
    packet(a, paths.graph, 1.6, .3); packet(a, paths.qdrant, 1.8, .9); packet(a, paths.ssh, 2.2, 1.4);

    const b = frame(rag, 760, 330, 'RAG pipeline: documents are chunked, embedded and stored in Qdrant; a question is embedded, the top 5 passages are retrieved, and the model answers from them');
    label(b, 16, 20, 'INGEST · OFFLINE', { class: 'a-caps' });
    label(b, 16, 222, 'ANSWER · ONLINE', { class: 'a-caps' });
    box(b, 16, 34, 150, 62, 'Cluster docs', ['.md  .txt  .pdf']);
    box(b, 196, 34, 150, 62, 'Chunk', ['512 chars, 64 overlap', 'paragraph-aware']);
    box(b, 376, 34, 150, 62, 'Embed', ['nomic-embed-text', '768-d, cosine']);
    box(b, 16, 236, 150, 62, 'Question', ['from any channel']);
    box(b, 196, 236, 150, 62, 'Embed', ['same model']);
    box(b, 376, 236, 150, 62, 'Search', ['top 5 passages']);
    box(b, 590, 236, 156, 62, 'LLM answers', ['gpt-oss-120b, from', 'the passages it got']);
    const db = el('g', { class: 'a-db' }, b);
    el('path', { d: 'M596 128 v52 a72 14 0 0 0 144 0 v-52' }, db);
    el('ellipse', { cx: 668, cy: 128, rx: 72, ry: 14 }, db);
    label(db, 668, 164, 'Qdrant', { class: 'a-title', 'text-anchor': 'middle' });
    label(db, 668, 180, 'hpc_docs · md5 IDs', { class: 'a-sub', 'text-anchor': 'middle' });
    const r = { a: 'M166 65 H196', b: 'M346 65 H376', c: 'M526 65 C 600 65, 640 80, 660 114', d: 'M166 267 H196', e: 'M346 267 H376', f: 'M526 258 C 580 250, 600 220, 620 190', g: 'M526 276 H590' };
    Object.values(r).forEach(d => wire(b, d));
    wire(b, 'M716 236 C 730 214, 730 206, 722 192', 'a-wire dashed');
    label(b, 746, 222, 'answer saved back on 👍', { class: 'a-note', 'text-anchor': 'end' });
    label(b, 556, 232, 'retrieve', { class: 'a-note' });
    packet(b, 'M166 65 H376 M526 65 C 600 65, 640 80, 660 114', 3.4);
    packet(b, 'M166 267 H376', 2.2, .5); packet(b, r.f, 1.6, 1.2); packet(b, r.g, 1.4, 2);
    caption(host, 'Drawn from the project’s architecture document. The channels are thin adapters; all HPC logic lives in the agent, which can generate, validate and diagnose but never submit or cancel jobs.');
  }

  // pam_slurm_adopt (02_flowchart.md): prerequisites fixed in order, then the SSH test matrix.
  function adopt(host) {
    host.classList.add('dialog-viz', 'viz-adopt');
    const svg = frame(host, 760, 400, 'pam_slurm_adopt: five prerequisites fixed in order, then SSH attempts: root allowed, a user with a job allowed and placed in the job cgroup, a user without a job denied');
    label(svg, 16, 18, 'PREREQUISITES · EACH WAS BROKEN, FIXED IN ORDER', { class: 'a-caps' });
    const pre = [['slurmctld', 'under systemd'], ['Containment', 'proctrack/cgroup'], ['cgroup_v2.so', 'rebuilt with dbus'], ['Daemons start', 'SELinux fixed'], ['PAM module', 'built for 25.05']];
    pre.forEach(([t, sub], i) => {
      box(svg, 16 + i * 150, 30, 132, 50, t, [sub], 'a-box step');
      if (i) wire(svg, `M${i * 150} 55 H${16 + i * 150}`);
      label(svg, 16 + i * 150 + 118, 48, '✓', { class: 'a-ok', 'text-anchor': 'middle' });
    });
    wire(svg, 'M380 80 V132');
    const pam = el('g', { class: 'a-core' }, svg);
    el('rect', { x: 250, y: 132, width: 260, height: 96, rx: 14 }, pam);
    label(pam, 266, 156, 'PAM stack · authselect profile', { class: 'a-title' });
    label(pam, 266, 180, 'account  required  pam_slurm_adopt', { class: 'a-mono' });
    label(pam, 266, 196, 'last in the stack · any failure denies', { class: 'a-sub' });
    label(pam, 266, 216, 'session  adopt into the job’s cgroup', { class: 'a-mono' });
    const lanes = [
      ['root, no job', 'Allowed', 'admins can reach any node', 'ok', 262],
      ['user with a job', 'Allowed, adopted', 'inside the job’s cgroup', 'ok', 316],
      ['user, no job', 'Denied', 'no job on this node', 'no', 370],
    ];
    lanes.forEach(([who, out, sub, kind, y], i) => {
      box(svg, 16, y - 20, 170, 36, `ssh node · ${who}`, [], 'a-box who');
      const inPath = `M186 ${y - 2} C 220 ${y - 2}, 222 ${196 + i * 8}, 250 ${196 + i * 8}`;
      const outPath = `M510 ${196 + i * 8} C 540 ${196 + i * 8}, 546 ${y - 2}, 576 ${y - 2}`;
      wire(svg, inPath); wire(svg, outPath, kind === 'ok' ? 'a-wire' : 'a-wire dashed');
      box(svg, 576, y - 22, 170, 46, out, [sub], `a-box out ${kind}`);
      packet(svg, kind === 'ok' ? `${inPath} L510 ${196 + i * 8} ${outPath.replace('M', 'L')}` : inPath, kind === 'ok' ? 3.2 : 1.8, i * .9);
    });
    caption(host, 'Redrawn from the project flowchart: the sequence found and fixed on the test cluster before production, then the verified test matrix.');
  }

  // Grafana-style per-job panels over Prometheus metrics (an illustration, not live data).
  function grafana(host) {
    host.classList.add('viz-grafana');
    const svg = frame(host, 480, 184, 'Illustration of Grafana panels: a job requested 8 CPU cores and used about 2; its GPU utilization over time');
    const rand = seeded(5), n = 60;
    const panel = (x, title, max, req, series, unit) => {
      const g = el('g', { class: 'gf-panel' }, svg);
      el('rect', { x, y: 0, width: 232, height: 184, rx: 6 }, g);
      label(g, x + 10, 18, title, { class: 'gf-title' });
      const X = i => x + 34 + i * (188 / (n - 1)), Y = v => 160 - v / max * 120;
      for (let k = 0; k <= 4; k++) {
        el('line', { class: 'gf-grid', x1: x + 34, x2: x + 222, y1: Y(max * k / 4), y2: Y(max * k / 4) }, g);
        label(g, x + 29, Y(max * k / 4) + 3, `${Math.round(max * k / 4)}${unit}`, { class: 'gf-axis', 'text-anchor': 'end' });
      }
      const pts = series.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
      el('path', { class: 'gf-area', d: `M${X(0)},${Y(0)} L${pts.join(' L')} L${X(n - 1)},${Y(0)} Z` }, g);
      el('polyline', { class: 'gf-line', points: pts.join(' ') }, g);
      if (req != null) {
        el('line', { class: 'gf-req', x1: x + 34, x2: x + 222, y1: Y(req), y2: Y(req) }, g);
        label(g, x + 222, Y(req) - 5, 'requested', { class: 'gf-axis', 'text-anchor': 'end' });
      }
      label(g, x + 222, 178, 'last 1 h', { class: 'gf-axis', 'text-anchor': 'end' });
    };
    panel(0, 'CPU cores in use · job 1042', 8, 8, [...Array(n)].map((_, i) => 1.7 + .5 * Math.sin(i / 5) + rand() * .5), '');
    panel(248, 'GPU utilization · job 1042', 100, null, [...Array(n)].map((_, i) => Math.max(4, 58 + 22 * Math.sin(i / 7) + (rand() - .5) * 18)), '%');
    caption(host, 'Illustration of the per-job Grafana view on Prometheus metrics, not real cluster data.');
  }

  // OpenMPI benchmark (openmpi_/RESULTS.md): N = 16384 matrix multiply.
  function mpi(host) {
    host.classList.add('viz-mpi');
    const rows = [['1 core', 114.46, '114.5 s'], ['4 threads, 1 node', 27.8, '27.8 s · 4.1×'], ['MPI · 8 ranks, 2 nodes', 18.84, '18.8 s · 6.1×']];
    host.innerHTML = rows.map(([name, t, text], i) => `<div class="mb-row${i === 2 ? ' best' : ''}"><span>${name}</span><div class="mb-track"><i style="--w:${(t / 114.46 * 100).toFixed(1)}%"></i></div><b>${text}</b></div>`).join('')
      + '<p class="mb-cap">A 16,384 × 16,384 matrix multiply on the cluster; shorter is faster.</p>';
    requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('grown')));
  }

  // Where each optimizer stopped (eq18_sgd.py: 300 steps, 6-qubit 5-layer TFIM).
  function levels(host) {
    const svg = frame(host, 480, 178, 'Final energies: pure SGD and Eq. 18 with the exact gap stall at −6.79, above the first excited level −6.814; Eq. 18 with the live gap estimate reaches −7.293, next to the ground energy −7.296');
    const Y = e => 22 + (-6.62 - e) / .76 * 118;
    el('line', { class: 'lv-l1', x1: 20, x2: 470, y1: Y(-6.814), y2: Y(-6.814) }, svg);
    el('line', { class: 'lv-e0', x1: 20, x2: 470, y1: Y(-7.296), y2: Y(-7.296) }, svg);
    label(svg, 470, Y(-6.814) + 14, 'λ₁ = −6.814 · first excited', { class: 'lv-note', 'text-anchor': 'end' });
    label(svg, 470, Y(-7.296) + 14, 'E₀ = −7.296 · ground', { class: 'lv-note', 'text-anchor': 'end' });
    const runs = [['Pure SGD', 'lr 0.1', -6.79, 64, false], ['Eq. 18', 'exact Δ', -6.79, 172, false], ['Eq. 18', 'live Δ̂', -7.2928, 280, true]];
    runs.forEach(([name, sub, e, x, win], i) => {
      el('line', { class: 'lv-drop' + (win ? ' win' : ''), x1: x, x2: x, y1: 8, y2: Y(e), style: `--i:${i}` }, svg);
      el('circle', { class: 'lv-dot' + (win ? ' win' : ''), cx: x, cy: Y(e), r: 6, style: `--i:${i}` }, svg);
      label(svg, x + 12, Y(e) - 6, e.toFixed(win ? 4 : 2), { class: 'lv-val' + (win ? ' win' : '') });
      label(svg, x, 170, `${name} · ${sub}`, { class: 'lv-name', 'text-anchor': 'middle' });
    });
    const cap = document.createElement('figcaption');
    cap.textContent = 'Final energy after 300 steps, 6-qubit, 5-layer transverse-field Ising model. Both stalled runs stop above λ₁.';
    host.append(cap);
  }

  // Before/after bars for the class-search prototype.
  function panthersoft(host) {
    host.classList.add('dialog-viz', 'viz-bars');
    const groups = [
      ['Response time', [['Legacy search', 100, '10 s'], ['With client-side caching', 9, '< 1 s']]],
      ['Page load time', [['Before', 100, 'baseline'], ['Prototype', 65, '35% faster']]],
    ];
    for (const [title, bars] of groups) {
      const group = document.createElement('div');
      group.className = 'bar-group';
      group.innerHTML = `<h4>${title}</h4>` + bars.map(([name, width, value], i) =>
        `<div class="bar-row${i ? ' after' : ''}"><span>${name}</span><div class="bar-track"><i style="--w:${width}%"></i></div><b>${value}</b></div>`).join('');
      host.append(group);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('grown')));
    caption(host, 'Figures from the internship prototype.');
  }

  // Amplitude amplification on a toy search space: 16 candidates, one valid.
  function publication(host) {
    host.classList.add('dialog-viz', 'viz-grover');
    const N = 16, marked = 11, W = 640, H = 230, base = 125, scale = 96;
    const svg = frame(host, W, H, 'Grover search: amplitude bars for 16 candidate colorings');
    const graph = el('g', { class: 'g-graph', transform: 'translate(22 30)' }, svg);
    const nodes = [[0, 0], [70, 0], [70, 70], [0, 70]], colors = ['c1', 'c2', 'c3', 'c2'];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]) el('line', { x1: nodes[a][0], y1: nodes[a][1], x2: nodes[b][0], y2: nodes[b][1] }, graph);
    nodes.forEach(([x, y], i) => el('circle', { cx: x, cy: y, r: 11, class: colors[i] }, graph));
    label(svg, 57, 142, 'the valid coloring', { class: 'g-note', 'text-anchor': 'middle' });
    label(svg, 57, 157, 'we search for', { class: 'g-note', 'text-anchor': 'middle' });
    el('line', { class: 'g-axis', x1: 150, x2: 624, y1: base, y2: base }, svg);
    const mean = el('line', { class: 'g-mean', x1: 150, x2: 624, y1: base, y2: base }, svg);
    const bars = [...Array(N)].map((_, i) => el('rect', { class: i === marked ? 'g-bar marked' : 'g-bar', x: 156 + i * 29.4, width: 20, rx: 2 }, svg));
    label(svg, 150, 222, 'amplitude of each candidate · the dashed line is the mean', { class: 'g-note' });
    let amps = Array(N).fill(1 / Math.sqrt(N)), iteration = 0, busy = false;
    const timers = [];
    function draw() {
      amps.forEach((a, i) => {
        const h = Math.abs(a) * scale;
        const y = a >= 0 ? base - h : base, height = Math.max(h, 1);
        bars[i].setAttribute('y', y); bars[i].setAttribute('height', height);
        bars[i].style.y = y + 'px'; bars[i].style.height = height + 'px'; // animates where CSS geometry is supported
      });
      readout.textContent = `Iteration ${iteration} · chance of measuring the valid coloring: ${(amps[marked] ** 2 * 100).toFixed(1)}%`;
    }
    const controls = document.createElement('div');
    controls.className = 'viz-controls';
    controls.innerHTML = '<button type="button" class="button small">Apply one Grover iteration ▷</button><button type="button" class="text-button">Reset</button><output aria-live="polite"></output>';
    host.append(controls);
    const [stepButton, resetButton] = controls.querySelectorAll('button'), readout = controls.querySelector('output');
    stepButton.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      amps = amps.map((a, i) => i === marked ? -a : a); // oracle marks the valid coloring
      draw();
      timers.push(setTimeout(() => {
        const m = amps.reduce((s, a) => s + a, 0) / N;
        mean.setAttribute('y1', base - m * scale); mean.setAttribute('y2', base - m * scale);
        mean.classList.add('show');
        timers.push(setTimeout(() => {
          amps = amps.map(a => 2 * m - a); // reflect every amplitude about the mean
          iteration++; busy = false;
          mean.classList.remove('show');
          draw();
          if (iteration >= 6) stepButton.disabled = true;
        }, still() ? 0 : 450));
      }, still() ? 0 : 450));
    });
    resetButton.addEventListener('click', () => {
      timers.forEach(clearTimeout); busy = false; iteration = 0;
      amps = Array(N).fill(1 / Math.sqrt(N)); stepButton.disabled = false; draw();
    });
    draw();
    caption(host, 'Real amplitude-amplification math on a toy space of 16 candidates. Three iterations reach 96%; keep going and it overshoots.');
    return () => timers.forEach(clearTimeout);
  }

  // Concept demo for the quant field: GBM paths, the terminal distribution,
  // and a European call priced by Black–Scholes and by Monte Carlo.
  function options(host) {
    host.classList.add('dialog-viz', 'viz-options');
    const W = 640, H = 260, x0 = 44, x1 = 468, top = 16, bottom = 226, lo = 30, hi = 230;
    const S0 = 100, K = 100, T = 1, r = .03, steps = 64, drawn = 48, samples = 4000;
    const svg = frame(host, W, H, 'Monte Carlo price paths and the distribution of final prices');
    const y = s => bottom - (Math.min(hi, Math.max(lo, s)) - lo) / (hi - lo) * (bottom - top);
    el('line', { class: 'o-axis', x1: x0, x2: x1, y1: bottom, y2: bottom }, svg);
    for (const s of [50, 100, 150, 200]) { el('line', { class: 'o-grid', x1: x0, x2: W - 10, y1: y(s), y2: y(s) }, svg); label(svg, x0 - 8, y(s) + 4, '$' + s, { class: 'o-note', 'text-anchor': 'end' }); }
    el('line', { class: 'o-strike', x1: x0, x2: W - 10, y1: y(K), y2: y(K) }, svg);
    label(svg, W - 12, y(K) - 6, 'strike K = $100', { class: 'o-note', 'text-anchor': 'end' });
    label(svg, x0, H - 10, 'today', { class: 'o-note' });
    label(svg, x1, H - 10, '1 year', { class: 'o-note', 'text-anchor': 'end' });
    label(svg, 560, H - 10, 'final prices', { class: 'o-note', 'text-anchor': 'middle' });
    const paths = el('g', { class: 'o-paths' }, svg), hist = el('g', { class: 'o-hist' }, svg);
    const controls = document.createElement('div');
    controls.className = 'viz-controls';
    controls.innerHTML = '<label for="vol">Volatility</label><input id="vol" type="range" min="5" max="80" value="25"><button type="button" class="button">Resample paths</button><output aria-live="polite"></output>';
    host.append(controls);
    const input = controls.querySelector('input'), output = controls.querySelector('output');
    const erf = x => { const s = Math.sign(x), t = 1 / (1 + .3275911 * Math.abs(x)); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x)); };
    const cdf = x => .5 * (1 + erf(x / Math.SQRT2));
    let seed = 11;
    function draw() {
      const sigma = +input.value / 100, rand = seeded(seed);
      const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
      const dt = T / steps, drift = (r - sigma * sigma / 2) * dt, vol = sigma * Math.sqrt(dt);
      paths.replaceChildren();
      for (let p = 0; p < drawn; p++) {
        let s = S0, d = `M${x0} ${y(s).toFixed(1)}`;
        for (let i = 1; i <= steps; i++) { s *= Math.exp(drift + vol * gauss()); d += `L${(x0 + (x1 - x0) * i / steps).toFixed(1)} ${y(s).toFixed(1)}`; }
        el('path', { d, class: s > K ? 'o-path itm' : 'o-path' }, paths);
      }
      const bins = new Array(40).fill(0); let payoff = 0;
      for (let i = 0; i < samples; i++) {
        const s = S0 * Math.exp((r - sigma * sigma / 2) * T + sigma * Math.sqrt(T) * gauss());
        payoff += Math.max(s - K, 0);
        const b = Math.floor((Math.min(hi - .01, Math.max(lo, s)) - lo) / (hi - lo) * bins.length); bins[b]++;
      }
      const peak = Math.max(...bins);
      hist.replaceChildren();
      bins.forEach((count, b) => {
        const sLo = lo + (hi - lo) * b / bins.length, sHi = lo + (hi - lo) * (b + 1) / bins.length;
        el('rect', { x: 490, y: y(sHi), width: Math.max(1, count / peak * 130), height: Math.max(1, y(sLo) - y(sHi) - 1), class: sLo >= K ? 'o-bar itm' : 'o-bar' }, hist);
      });
      const d1 = (Math.log(S0 / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T)), d2 = d1 - sigma * Math.sqrt(T);
      const bs = S0 * cdf(d1) - K * Math.exp(-r * T) * cdf(d2), mc = Math.exp(-r * T) * payoff / samples;
      output.textContent = `σ = ${input.value}% · Black–Scholes $${bs.toFixed(2)} · Monte Carlo (${samples.toLocaleString()} paths) $${mc.toFixed(2)}`;
    }
    input.addEventListener('input', draw);
    controls.querySelector('button').addEventListener('click', () => { seed = Math.floor(Math.random() * 1e6) + 1; draw(); });
    draw();
    caption(host, 'Concept illustration, not a research result: risk-neutral GBM with r = 3%, S₀ = K = $100, T = 1 year. Green paths and bars finish in the money.');
  }

  window.Viz = { quantum, hpc, panthersoft, publication, options, architecture, adopt, grafana, mpi, levels };
})();
