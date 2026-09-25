const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
// Measured IPA curve used by both the main story and the layout playground.
const IPA_Y = [.1096,.1083,.1096,.1096,.1108,.1108,.1121,.1121,.1134,.1134,.1159,.1159,.1159,.1171,.1184,.1196,.1196,.1209,.1222,.1234,.1247,.1247,.1259,.1285,.1297,.1310,.1322,.1348,.1348,.1360,.1398,.1398,.1423,.1436,.1448,.1474,.1499,.1511,.1524,.1549,.1574,.1587,.1612,.1650,.1662,.1688,.1700,.1738,.1763,.1776,.1814,.1851,.1889,.1914,.1952,.2003,.2040,.2078,.2116,.2154,.2217,.2254,.2305,.2355,.2443,.2494,.2582,.2632,.2683,.2746,.2821,.2909,.3010,.3149,.3237,.3338,.3401,.3564,.3652,.3741,.3866,.3955,.4118,.4320,.4521,.4691,.4861,.5101,.5277,.5466,.5756,.6071,.6335,.6587,.6877,.7217,.7506,.7884,.8262];
export const PLOT = { x0: .1345, x1: .9648, top: .0642, bottom: .8854, max: .98 };
export const ipaAt = p => { const x = Math.min(p, PLOT.max) * 100, k = Math.min(IPA_Y.length - 2, Math.floor(x)), u = x - k; return IPA_Y[k] + (IPA_Y[k + 1] - IPA_Y[k]) * u; };

export function initProjectDetails({ particles = null } = {}) {
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
  if (key && particles) particles.form(key).focus = open ? item.dataset.focus || null : null;
});

// ---------------------------------------------------------------- figure tabs (curve · phase transition · math)
$$('.entry [role="tablist"]').forEach(list => {
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

}
