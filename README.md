# Lenish Pandey — personal portfolio

A static, dark, motion-led portfolio for AI, quantum and quantitative research roles. The hero is a real 3D bust of Lenish that turns its head and eyes toward the cursor. No build step for the site; Three.js is vendored locally.

## Run it

From anywhere:

```sh
python scripts/serve.py
```

Open http://127.0.0.1:8000. This server tells the browser not to cache, so edits show up on reload. (`python -m http.server` also works, but browsers can keep showing an old page for several minutes.) Use a server rather than opening `index.html` directly, or the 3D files will not load.

## Pages

- `index.html` (Home): full-screen hero with the 3D figure, a typewriter intro and pills that pick a field. The **AI / Quantum / Quant** tabs each contain Experience (animated, expandable), Projects (demo video and screenshots) and Research (graphs, paper links, interactive demos). Contact closes the page. Deep links work: `#ai`, `#quantum`, `#quant`, `#quantum-research`, …
- `about.html` (About): the 3D figure beside the bio, current roles, interests, hobbies, education, leadership and credentials. `aboutme.html` and `Awards.html` redirect here.
- `resume.html`: printable résumé.

## Code

- `app.css`: design system (Inter Tight / Inter, dark palette, field colors: AI blue, Quantum violet, Quant green).
- `app.js`: nav and mobile menu, typewriter, field tabs, experience expanders, project media, demo dialogs, copy email, optional scrubbed hero video.
- `figure.js`: renders `assets/figure/` — skinned head turn at the neck, eyes that lead the head, blinks, glossy 3D glasses, studio key and rim light. Honors reduced motion (follows the pointer, no idle animation).
- `scenes.js`: field backdrops — a hydrogen 2p/3d superposition rendered as a particle cloud whose density beats in time (Quantum), a network with travelling signals (AI), geometric Brownian motion paths with the lognormal horizon density (Quant).
- `viz.js`: interactive figures — pruning slider, Grover amplitude amplification, optimizer convergence sketch, HPC diagram, class-search bars, and a Black–Scholes vs. Monte Carlo concept demo.

## Assets

- `assets/figure/`: the 3D bust (57k vertices, 16-bit indices), projected color maps. Built by `scripts/build_figure.py`.
- `assets/avatar/`: portrait layers from `scripts/build_avatar.py`; the eye mask and iris maps are used at runtime, the rest are inputs to the figure build.
- `assets/media/`: project screenshots, the Data Nexus demo video, and figures from the Grover paper's notebooks.
- `assets/hero/turn-sample.mp4`: a head-turn clip rendered from the 3D figure, for the scrub mode below.

### Scrubbed video hero (optional)

Add `data-video="assets/hero/turn-sample.mp4"` (or your own clip) to the `.hero-figure` element in `index.html`. The live 3D figure is replaced by the video, which scrubs forward and back with horizontal mouse movement. An AI-generated head-turn video (left profile → right profile, static camera, dark background) drops in the same way.

## Rebuilding the 3D figure

Only needed if the portrait changes. Requires a CUDA PyTorch environment, the Hunyuan3D-2 repository on `sys.path`, and `trimesh`, `pymeshlab`, `opencv-python`, `scipy`, `pillow`.

```sh
python scripts/build_avatar.py
python scripts/build_figure.py --mesh bust.glb --generate --seed 7
```

The first run downloads Hunyuan3D-2mini weights (~7 GB) from Hugging Face. Hunyuan3D 2.0 is used under the Tencent Hunyuan 3D 2.0 Community License, whose territory excludes the EU, UK and South Korea.

## Content still to add

- Quant: option-trading research (advisor, dates, results, paper link) and the Student Managed Investment Fund role.
- Quantum: link for the quantum learning-rate paper when available; the Qiskit Global Summer School 2023 badge link.
- About: hobbies.
