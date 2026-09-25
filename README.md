# Lenish Pandey — personal portfolio

A static, dark, motion-led portfolio for AI, quantum and quantitative research roles. The home page is a scroll story told by one field of 16,000 particles that reshapes itself for each piece of work; the About page has a real 3D bust of Lenish that turns its head and eyes toward the cursor. No build step; Three.js is vendored locally.

## Run it

From anywhere:

```sh
python scripts/serve.py
```

Open http://127.0.0.1:8000. This server tells the browser not to cache, so edits show up on reload. (`python -m http.server` also works, but browsers can keep showing an old page for several minutes.) Use a server rather than opening `index.html` directly, or the 3D files will not load.

## Pages

- `index.html` (Home): a particle network fills the first screen. Scrolling walks through three fields, and the particles morph for each step while open text on the right tells the story. The rail on the left (a strip under the nav on phones) shows the field and step.
  - Experience sections use borderless text: role, place and dates; what the project was about; a figure; and a **More** section with what was done and how, the numbers, and skills and tools. Role headings sit on the left while their projects appear on the right. Projects scroll freely in normal reading order. Desktop role headings sit slightly lower on the left and ease upward through masks on each text line. Project titles ease through a clipped edge as they enter view. Particle transitions finish in 0.9 seconds and briefly hold their shape before following the latest scroll destination, without building a backlog. The small About arrow loops diagonally as an explicit interaction cue.
  - **Neural**: HPC Agent, the RAG assistant (architecture flowchart and cluster diagram dialogs), HPC administration (outcomes, cgroup v2 config, Grafana-style CPU/GPU panel, pam_slurm_adopt flowchart, MPI benchmark; the cluster items light up what they describe), information processing ability (the measured IPA plot with a dot that follows the scroll while the DenseNet prunes; phase transition; the formula), computational neuroscience (fly brain), PantherSoft and IT network operations, projects (PaperQuest, MathSphere).
  - **Quantum**: quantum learning rates at DaMRL (energy landscape), Grover graph coloring (paper, DOI, code, demo), credentials.
  - **Quant**: markets, option-trading research, the Student Managed Investment Fund, Cashify wallet. Contact closes the page with an About me text link, a moving underline and a directional arrow.
  - Deep links: `#rag`, `#hpc`, `#ipa`, `#neuro`, `#roles`, `#it-operations`, `#projects`, `#mathsphere`, `#quantum`, `#grover`, `#credentials`, `#quant`, `#options`, `#smif`, `#cashify`, `#contact`.
- `lab/layout.html`: a separate compact layout proposal. Browse three chapters by role and project, or switch to a continuous chapter reading view. All project content and interactive details come from the homepage.
- `lab/particles.html`: the particle lab, for trying every form (`?field=neural&exp=7`).
- `about.html` (About): the 3D figure beside the bio, current roles, interests, hobbies, education, leadership and credentials. `aboutme.html` and `Awards.html` redirect here.
- `resume.html`: printable résumé.

## Code

- `app.css`: design system (Helvetica, dark palette, field colors: AI blue, Quantum violet, Quant green).
- `particles.js`: the particle engine and every form (neural networks, RAG, HPC cluster, DenseNet with pruning, fly connectome, campus network, double slit, VQE landscape, Grover coloring, price tape, Black–Scholes surface, wallet, …). Positions are simulated on the CPU so each form runs a real process; morphs blend two live forms particle by particle.
- `story.js` + `story.css`: the home page's scroll story: which form each step shows, framing beside the cards, the rail, the IPA pruning and figure tabs, the HPC focus, a pause button. With reduced motion the particles run slower and the camera stops following the pointer.
- `app.js`: nav and mobile menu, copy email, demo dialogs, optional scrubbed figure video.
- `figure.js`: renders `assets/figure/` — skinned head turn at the neck, eyes that lead the head, blinks, glossy 3D glasses, studio key and rim light. Honors reduced motion (follows the pointer, no idle animation).
- `viz.js`: interactive figures — pruning slider, Grover amplitude amplification, optimizer convergence sketch, HPC diagram, class-search bars, and a Black–Scholes vs. Monte Carlo concept demo.

## Assets

- `assets/figure/`: the 3D bust (57k vertices, 16-bit indices), projected color maps. Built by `scripts/build_figure.py`.
- `assets/avatar/`: portrait layers from `scripts/build_avatar.py`; the eye mask and iris maps are used at runtime, the rest are inputs to the figure build.
- `assets/media/`: project screenshots and figures from the Grover paper's notebooks.
- `assets/hero/turn-sample.mp4`: a head-turn clip rendered from the 3D figure, for the scrub mode below.

### Scrubbed video hero (optional)

Add `data-video="assets/hero/turn-sample.mp4"` (or your own clip) to the `.hero-figure` element in `about.html`. The live 3D figure is replaced by the video, which scrubs forward and back with horizontal mouse movement. An AI-generated head-turn video (left profile → right profile, static camera, dark background) drops in the same way.

## Rebuilding the 3D figure

Only needed if the portrait changes. Requires a CUDA PyTorch environment, the Hunyuan3D-2 repository on `sys.path`, and `trimesh`, `pymeshlab`, `opencv-python`, `scipy`, `pillow`.

```sh
python scripts/build_avatar.py
python scripts/build_figure.py --mesh bust.glb --generate --seed 7
```

The first run downloads Hunyuan3D-2mini weights (~7 GB) from Hugging Face. Hunyuan3D 2.0 is used under the Tencent Hunyuan 3D 2.0 Community License, whose territory excludes the EU, UK and South Korea.

## Content still to add

- Neural: details for the Microsoft bot; more on the computational neuroscience work; IT Network Operations duties.
- Quant: option-trading research (advisor, dates, results, paper link), the Student Managed Investment Fund role, and your role on Cashify wallet.
- Quantum: link for the quantum learning-rate paper when available; the Qiskit Global Summer School 2023 badge link.
