# Initial redesign verification — September 22, 2026

The avatar notes below describe the initial implementation. See the revision results at the end for the current 3D model.

- `node --check site.js` and `node --check avatar.js`: passed.
- Local HTML audit: 24 local links/assets across 8 pages resolve; no duplicate IDs or missing section anchors.
- `git diff --check`: passed.
- Browser checked at desktop widths 1440 and 1280, and narrow widths around 382 and 320 pixels.
- Fixed decorative-orbit overflow and headline sizing at 320px; confirmed the document no longer overflows horizontally and headline fits within the viewport.
- WebGL portrait initializes successfully with no warning/error logs. Visually checked a head turn toward the upper-left, and the reduced-motion default/explicit play control.
- Research and Engineering filters each show their two matching projects. Coming next shows only Paper Quest and Mathsphere. All work restores six cards.
- Quantum, DenseNet, and PantherSoft detail dialogs open with the appropriate summaries. Escape closes the dialog and returns focus to the originating card.
- HPC experience disclosure expands, and Copy email announces clipboard success.
- Current résumé page loads and its Print / Save PDF control is present. Actual PDF pagination has not been verified.
- Old projects.html redirects to index.html#work.

Limitations: the avatar is a 3D-style raster on an approximate depth surface rather than a full rigged model. No-WebGL fallback is implemented but was not forced in the browser. External profile links come from the supplied resume records and were not independently audited. No deployment was performed.

## Real 3D revision

- Replaced the depth-displaced portrait plane with a Three.js scene and a volumetric character with a separate neck pivot and fixed shoulders.
- `node scripts/check-model.mjs`: 83 meshes, 58,397 vertices; finite coordinates, valid triangle indices, correct projection attributes, measurable front-to-back volume, and independent head rotation all pass.
- JavaScript syntax checks for avatar.js, avatar-model.js, and site.js pass. Local resource/anchor audit and `git diff --check` pass.
- Visually checked neutral and three-quarter poses, head following, pause/play, and the stationary shoulders. No browser warnings or errors in the final check.
- Browser verified at desktop size and 390px width, with no horizontal page overflow. Engineering filter shows the expected cards and direct links.
- HPC dialog source link and publication dialog paper/source links match the verified destinations.
- Seven public project destinations returned HTTP 200 with the expected page titles. Detailed records are in project-links.md.
- Paper Quest and optimizer links were excluded as explicitly requested. Mathsphere has no supplied public destination.
- Limitations: this is a stylized reconstruction with baked facial color detail, not an exact scan or a facial-animation rig. No deployed demos were invented for projects without public demos. No deployment was performed.

## Layered avatar and visual-first revision — September 22, 2026

- Replaced the procedural head (`avatar-model.js`, no longer loaded) with layers baked from the portrait by `scripts/build_avatar.py` using Depth-Anything-V2 relief: head, body with hidden neck, glasses frame, irises, and eye mask (667 KB total).
- Browser-checked head turns left/right/up/down, iris tracking under the lids, glasses parallax, neck twist (no gap behind the jaw), and a mobile touch pose. No console errors.
- With reduced motion enabled (as in the preview browser), the head still follows the pointer; blinks and idle glances are off; pause stops all motion.
- About, experience, toolbox, publication, and all five project dialogs now lead with figures. Verified each dialog figure renders: convergence sketch, HPC diagram with animated jobs, pruning slider (60% → 54 of 136 connections), before/after bars, and Grover iterations (iteration 2 → 90.8%).
- `node --check` passes for site.js, viz.js, avatar.js. Seven local references resolve, no duplicate IDs, `git diff --check` clean. At 375 px, document width equals viewport width.
- Not verified here: keyboard Escape/Enter in the preview pane (synthetic keys did not reach the page; dialog Escape is native `<dialog>` behavior), Safari, and actual deployment.
