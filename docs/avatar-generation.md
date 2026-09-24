# Avatar asset

Generated with the built-in image_gen tool using the user-provided Gemini avatar as the identity reference. Saved at `assets/avatar-3d.png`. Original output is preserved in the Codex generated_images directory.

## Final prompt

Use case: stylized-concept. Create a premium 3D-rendered avatar bust for a personal portfolio website, using the attached image as the identity reference. Preserve the recognizable young man's voluminous dark curly hair, warm medium brown skin, rectangular dark glasses, brown eyes, thin moustache and short goatee. Convert the illustrated character into a polished tactile 3D animated-film character with realistic volume, softly sculpted curls, subtle skin shading, dark charcoal crew-neck shirt. Straight-on symmetrical camera, neutral relaxed friendly face, head level, eyes directly at camera. Full hair silhouette visible with generous space above and either side. Include neck and upper shoulders, bust cropped at chest at bottom. Head fills about 65% of image height. Center subject. Soft warm studio key light from upper left and subtle rim light. Clean solid very pale warm cream background color #f4f1e9, absolutely no scenery, text, labels, frames, accessories beyond reference glasses. Square 1024x1024 composition. This will become a cursor-following head, so frontal alignment and clear facial features are essential.

## Current 3D implementation

`scripts/build_avatar.py` turns the portrait into layered geometry:

- **Relief:** Depth-Anything-V2 (Base) is run at 518 px for overall shape and 1022 px for curl detail, then blended. Edges are rounded back so the silhouette turns like a real head.
- **Head / body split:** the jawline is found from the depth drop between chin and neck. The head (hair, face, ears) rotates at a pivot level with the ears; the neck's hidden part behind the jaw is extended so turning never reveals a hole. In the browser the upper neck twists part of the way with the head, and the shirt stays still.
- **Glasses:** the frame is detected as a thin ridge in the relief, removed from the face (inpainted), and rendered as its own rigid layer in front of the eyes, so it shifts in parallax as the head turns.
- **Eyes:** eyelid curves are fitted per eye, the irises are lifted into their own texture (the part hidden under the upper lid is mirrored from below), and the openings are refilled with sclera. The shader slides each iris toward the pointer under the lids, applies lid shadow, and draws blinks.

This is a relief reconstruction from one frontal image, not a scan or full 360° model: head turns ease toward a limit of about ±14° yaw and ±8° pitch around a pivot in the middle of the head's depth, where it holds up; the eyes cover the rest of the gaze. Facial expression is fixed.
