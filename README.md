# Lenish Pandey — personal portfolio

A responsive static portfolio in HTML, CSS, and JavaScript with a 3D avatar that turns its head and eyes toward the cursor. No build step for the site; the pinned Three.js runtime is vendored locally. The avatar's layers are baked once by `scripts/build_avatar.py` (see `docs/avatar-generation.md`).

## Preview

Run from this directory:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. Use an HTTP server for WebGL texture loading; opening index.html directly may use the static image fallback.

## Content and interactions

- `index.html`: home page aimed at AI, quantum, and quantitative research roles. A hero deck of featured projects, a Research Focus section (three track pillars with evidence, standing on a math foundation), selected work with track badges, an experience timeline, a four-layer toolkit, the publication, and contact.
- `about.html`: the About page, with the 3D avatar, a short professional bio, a research-interests diagram (AI / quantum / quantitative overlaps), key numbers, and education with coursework. `aboutme.html` and `Awards.html` redirect here.
- `site.js`: project data (summary, three stats, links), category filters, dialog handling, experience-timeline layout, draw-on-scroll reveals, clipboard feedback.
- `viz.js`: dependency-free SVG figures for the project dialogs: optimizer convergence sketch, HPC architecture with animated jobs, interactive pruning slider, class-search before/after bars, and a working Grover's-search amplitude demo.
- `style.css`: responsive layout, typography, project illustrations and figures, reduced-motion rules.
- `avatar.js`: Three.js renderer for the layered avatar (loaded on the About page only). The head pivots at the neck and the upper neck twists with it, the glasses frame floats in front of the eyes, and the irises slide under the lids toward the pointer. Blinks and idle glances are off under reduced motion; pointer following stays on, and the pause button stops everything. The renderer sleeps off-screen.
- `assets/avatar/`: baked avatar layers (head, body, glasses, irises, eye mask, relief grids) plus `portrait.webp`, the still image shown until WebGL is ready or if it is unavailable.
- `scripts/build_avatar.py`: regenerates `assets/avatar/` from `assets/avatar-3d.png` using the Depth-Anything-V2 depth model.
- `vendor/`: Three.js 0.180.0 ES modules with the upstream MIT license. No CDN is required at runtime.
- `assets/avatar-3d.png`: generated 3D-style portrait, retained at original quality as the avatar source.
- `resume.html`: current, print-friendly résumé; use Print / Save PDF. The older PDF is retained as an unlinked legacy asset because its profile information is outdated.

The source of truth for the redesign was the sibling `resume/profile` directory, cross-checked against the September 2026 personal statement. Profile notes take precedence over outdated résumé exports. No salary, home address, compliance notes, or private financial narrative was published. High-school content, routine clubs, and obsolete site material were removed from public pages. Legacy HTML addresses redirect to the relevant section so existing links still work; unused legacy media and styles are retained in Git.

## Add Paper Quest or Mathsphere

Replace the corresponding `.upcoming-card` with a `.project-card` using the same structure as the existing cards. Set its `data-category` to `research` or `engineering`, add a button with a unique `data-project` key, and add the matching factual summary to the `projects` object in `site.js`. Do not invent descriptions or links. Update the All work count if adding or removing cards.

## Deployment

Deploy this directory as static files using the existing hosting configuration. No deployment was performed during this redesign. The existing CNAME is preserved. Google Fonts is the only remote rendering dependency; local system fallbacks keep the site usable when it cannot load.

## Quick checks

```sh
node --check site.js
node --check viz.js
node --check avatar.js
```

In a browser, check filters, every project dialog and its figure (pruning slider, Grover iterations), Escape/focus return, the experience timeline rows, email copying, résumé navigation, the hero deck cards, head and eye tracking on the About page (including the far left and right edges), pause/resume, and narrow layouts.

## Rebuilding the avatar

Only needed if the portrait changes. Requires Python with `torch`, `transformers`, `opencv-python`, `scipy`, and `pillow`; the first run downloads the ~390 MB depth model from Hugging Face.

```sh
python scripts/build_avatar.py --debug build-debug
```

`--debug` writes the head/body split, eye fits, and relief maps for inspection. The eye and glasses seed boxes at the top of the script are in source-image pixels.

## Project destinations

Direct links appear both on project cards and in project dialogs. HPC links to its documentation/source, DenseNet to its repository, and graph coloring to its paper and repository. Data Nexus has a live demo; Baghchal has source. The PantherSoft link is FIU’s current public class-search site, not a claim that the internship prototype was deployed there. Paper Quest and the optimizer are intentionally unlinked at the user’s request. Mathsphere has no supplied public URL.

The seven project URLs were checked successfully on September 22, 2026; see `docs/project-links.md`.
