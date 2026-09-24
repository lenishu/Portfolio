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

  // Drag the sparsity and watch the weakest connections disappear.
  function pruning(host) {
    host.classList.add('dialog-viz', 'viz-pruning');
    const svg = frame(host, 640, 240, 'Toy network: connections disappear as sparsity increases');
    const layers = [5, 8, 8, 4], xs = [90, 250, 410, 560], random = seeded(7);
    const pos = layers.map((n, l) => [...Array(n)].map((_, i) => [xs[l], 20 + (200 / (n - 1)) * i]));
    const edges = [];
    const edgeGroup = el('g', {}, svg);
    for (let l = 0; l < layers.length - 1; l++) for (const [i, a] of pos[l].entries()) for (const [j, b] of pos[l + 1].entries()) {
      const line = el('line', { class: 'p-edge', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, edgeGroup);
      edges.push({ line, weight: random(), from: `${l}-${i}`, to: `${l + 1}-${j}` });
    }
    const nodeEls = new Map();
    pos.forEach((column, l) => column.forEach(([x, y], i) => nodeEls.set(`${l}-${i}`, el('circle', { class: 'p-node', cx: x, cy: y, r: 9 }, svg))));
    const ranked = edges.slice().sort((a, b) => a.weight - b.weight);
    const controls = document.createElement('div');
    controls.className = 'viz-controls';
    controls.innerHTML = '<label for="sparsity">Sparsity</label><input id="sparsity" type="range" min="0" max="100" value="0"><output for="sparsity" aria-live="off"></output>';
    host.append(controls);
    const input = controls.querySelector('input'), output = controls.querySelector('output');
    function set(percent) {
      const cut = Math.round(ranked.length * percent / 100), alive = new Set();
      ranked.forEach((edge, i) => {
        const kept = i >= cut;
        edge.line.classList.toggle('cut', !kept);
        if (kept) { alive.add(edge.from); alive.add(edge.to); }
      });
      nodeEls.forEach((node, key) => node.classList.toggle('idle', !alive.has(key)));
      output.textContent = `${percent}% pruned · ${ranked.length - cut} of ${ranked.length} connections left`;
    }
    input.addEventListener('input', () => { cancelAnimationFrame(play); output.setAttribute('aria-live', 'polite'); set(+input.value); });
    let play = 0;
    if (still()) { input.value = 60; set(60); } else {
      set(0);
      const begin = performance.now() + 500;
      const step = now => {
        const t = Math.min(Math.max((now - begin) / 2200, 0), 1), v = Math.round(60 * (1 - (1 - t) ** 3));
        input.value = v; set(v);
        if (t < 1) play = requestAnimationFrame(step);
      };
      play = requestAnimationFrame(step);
    }
    caption(host, 'A toy network showing mask pruning. The study ran this on DenseNet-121 from 0 to 100% sparsity.');
    return () => cancelAnimationFrame(play);
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

  window.Viz = { quantum, hpc, pruning, panthersoft, publication, options };
})();
