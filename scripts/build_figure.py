"""Bake the full 3D figure (assets/figure/) from a generated bust mesh.

Pipeline
  1. Shape: Hunyuan3D-2mini turns assets/avatar-3d.png into a closed 360° bust
     (run with --generate; needs CUDA PyTorch + the Hunyuan3D-2 repo on sys.path).
  2. Decimate to a web-sized mesh (~115k triangles, 16-bit indices).
  3. Fit an orthographic front projection so the mesh silhouette lines up with the portrait.
  4. Per vertex: projected portrait UV, how directly it faces the portrait camera,
     whether it is the glasses frame, a head/neck skinning weight, and a fallback
     color diffused across the surface for everything the portrait cannot see.

The browser shader samples the portrait through the projected UVs (full image
resolution on the face) and blends to the fallback colors on the sides and back.

    python scripts/build_figure.py --mesh bust.glb [--generate] [--debug DIR]

Hunyuan3D 2.0 is used under the Tencent Hunyuan 3D 2.0 Community License
(territory excludes the EU, UK and South Korea).
"""
import argparse, json, os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
from scipy import sparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'avatar-3d.png')
AVATAR = os.path.join(ROOT, 'assets', 'avatar')
OUT = os.path.join(ROOT, 'assets', 'figure')

p = argparse.ArgumentParser()
p.add_argument('--mesh', required=True, help='generated bust (glb/obj/ply)')
p.add_argument('--generate', action='store_true', help='run Hunyuan3D-2mini first and write --mesh')
p.add_argument('--seed', type=int, default=7)
p.add_argument('--faces', type=int, default=115000)
p.add_argument('--debug', default=None)
args = p.parse_args()
os.makedirs(OUT, exist_ok=True)
if args.debug: os.makedirs(args.debug, exist_ok=True)

import trimesh

portrait = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W = portrait.shape[:2]
bg = np.array([247, 241, 233], np.float32)
dist = np.sqrt(((portrait - bg) ** 2).sum(-1))
subject = ndi.binary_opening(dist > 34, iterations=1)
lab, _ = ndi.label(~subject)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
subject |= ~np.isin(lab, list(edge))

if args.generate:
    import torch
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline, FloaterRemover, DegenerateFaceRemover
    alpha = np.where(ndi.binary_erosion(subject, iterations=2), 1.0, np.clip((dist - 14) / 34, 0, 1) * subject)
    rgba = Image.fromarray(np.dstack([portrait.astype(np.uint8), (alpha * 255).astype(np.uint8)]), 'RGBA')
    pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mini', subfolder='hunyuan3d-dit-v2-mini', variant='fp16')
    mesh = pipe(image=rgba, num_inference_steps=50, octree_resolution=384, num_chunks=20000,
                generator=torch.manual_seed(args.seed), output_type='trimesh')[0]
    mesh = DegenerateFaceRemover()(FloaterRemover()(mesh))
    mesh.export(args.mesh)

# ---------------------------------------------------------------- decimate
import pymeshlab
mesh = trimesh.load(args.mesh, force='mesh')
ms = pymeshlab.MeshSet()
ms.add_mesh(pymeshlab.Mesh(mesh.vertices, mesh.faces))
ms.meshing_decimation_quadric_edge_collapse(targetfacenum=args.faces, preservenormal=True, preservetopology=True, qualitythr=0.4)
m = ms.current_mesh()
V = m.vertex_matrix().astype(np.float64); F = m.face_matrix().astype(np.int64)
mesh = trimesh.Trimesh(V, F, process=True)
V, F = mesh.vertices, mesh.faces
N = mesh.vertex_normals
print('decimated', len(V), 'verts', len(F), 'faces')
assert len(V) < 65536, 'too many vertices for 16-bit indices; lower --faces'

# ---------------------------------------------------------------- fit the front projection
def silhouette(u, v, shape, r=2):
    img = np.zeros(shape, np.uint8)
    ok = (u >= 0) & (u < shape[1]) & (v >= 0) & (v < shape[0])
    img[v[ok].astype(int), u[ok].astype(int)] = 1
    img = cv2.dilate(img, np.ones((2 * r + 1, 2 * r + 1), np.uint8))
    return ndi.binary_fill_holes(cv2.erode(img, np.ones((2 * r - 1, 2 * r - 1), np.uint8))).astype(bool)

small = 4
target = cv2.resize(subject.astype(np.uint8), (W // small, H // small), interpolation=cv2.INTER_NEAREST).astype(bool)
ys, xs = np.nonzero(subject)
s0 = (xs.max() - xs.min()) / (V[:, 0].max() - V[:, 0].min())
cx0 = xs.min() - V[:, 0].min() * s0
cy0 = ys.min() + V[:, 1].max() * s0
best = (-1, None)
for s in s0 * np.linspace(.94, 1.06, 13):
    for dx in np.linspace(-24, 24, 9):
        for dy in np.linspace(-24, 24, 9):
            u = (cx0 + dx + V[:, 0] * s) / small; v = (cy0 + dy - V[:, 1] * s) / small
            sil = silhouette(u, v, target.shape)
            iou = (sil & target).sum() / (sil | target).sum()
            if iou > best[0]: best = (iou, (s, cx0 + dx, cy0 + dy))
iou, (S, CX, CY) = best
print('projection fit IoU', round(iou, 4), 'scale', round(S, 2))
U = CX + V[:, 0] * S           # portrait pixel coordinates of every vertex
Vp = CY - V[:, 1] * S

# ---------------------------------------------------------------- visibility from the portrait camera
half = 2
zbuf = np.full((H // half + 1, W // half + 1), -np.inf, np.float32)
ui, vi = np.clip((U / half).astype(int), 0, zbuf.shape[1] - 1), np.clip((Vp / half).astype(int), 0, zbuf.shape[0] - 1)
# Rasterise sample points across each triangle so thin parts (glasses) occlude correctly.
bary = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1/3, 1/3, 1/3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5],
                 [2/3, 1/6, 1/6], [1/6, 2/3, 1/6], [1/6, 1/6, 2/3]])
tri = np.stack([U[F], Vp[F], V[F][:, :, 2]], -1)            # (faces, 3, 3)
pts = np.einsum('kj,fjc->fkc', bary, tri).reshape(-1, 3)
pu = np.clip((pts[:, 0] / half).astype(int), 0, zbuf.shape[1] - 1); pv = np.clip((pts[:, 1] / half).astype(int), 0, zbuf.shape[0] - 1)
np.maximum.at(zbuf, (pv, pu), pts[:, 2].astype(np.float32))
empty = np.isinf(zbuf)
zbuf = np.where(empty, ndi.maximum_filter(np.where(empty, -9, zbuf), size=3), zbuf)   # fill gaps only
visible = V[:, 2] >= zbuf[vi, ui] - 0.03
facing = np.clip((N[:, 2] - .12) / .38, 0, 1)
facing = facing * facing * (3 - 2 * facing)
core = cv2.GaussianBlur(ndi.binary_erosion(subject, iterations=5).astype(np.float32), (0, 0), 2)
inside = core[np.clip(Vp.astype(int), 0, H - 1), np.clip(U.astype(int), 0, W - 1)]
weight = visible * facing * inside

# Glasses: front-most surface where the portrait shows the frame.
frame = np.zeros((H, W), np.float32)
g = Image.open(os.path.join(AVATAR, 'glasses.webp'))
meta = json.load(open(os.path.join(AVATAR, 'avatar.json')))
gx0, gy0, gx1, gy1 = map(int, meta['layers']['glasses']['box'])
frame[gy0:gy1 + 1, gx0:gx1 + 1] = np.asarray(g)[..., 3][:gy1 - gy0 + 1, :gx1 - gx0 + 1] / 255.0
# The generated frame sits a little lower than the painted one, so find the frame
# geometry itself: rasterise the glasses area at full resolution, keep thin raised
# ridges, and match them to the painted frame shape (shifted to the best overlap).
fx0, fy0, fx1, fy1 = gx0 - 40, gy0 - 40, gx1 + 40, gy1 + 60
zb = np.full((fy1 - fy0, fx1 - fx0), -9.0)
near = (U[F].max(1) >= fx0) & (U[F].min(1) < fx1) & (Vp[F].max(1) >= fy0) & (Vp[F].min(1) < fy1)
for t in F[near]:
    u, v, z = U[t], Vp[t], V[t, 2]
    d = (v[1] - v[2]) * (u[0] - u[2]) + (u[2] - u[1]) * (v[0] - v[2])
    if abs(d) < 1e-9: continue
    xs, ys = np.meshgrid(np.arange(int(u.min()), int(np.ceil(u.max())) + 1) + .5, np.arange(int(v.min()), int(np.ceil(v.max())) + 1) + .5)
    l0 = ((v[1] - v[2]) * (xs - u[2]) + (u[2] - u[1]) * (ys - v[2])) / d
    l1 = ((v[2] - v[0]) * (xs - u[2]) + (u[0] - u[2]) * (ys - v[2])) / d
    ok = (l0 >= 0) & (l1 >= 0) & (l0 + l1 <= 1)
    X, Y = xs[ok].astype(int) - fx0, ys[ok].astype(int) - fy0
    keep = (X >= 0) & (X < zb.shape[1]) & (Y >= 0) & (Y < zb.shape[0])
    np.maximum.at(zb, (Y[keep], X[keep]), (l0 * z[0] + l1 * z[1] + (1 - l0 - l1) * z[2])[ok][keep])
res = zb - ndi.grey_opening(zb, size=(25, 25))
ridge3d = res > .02
painted = frame[fy0:fy1, fx0:fx1] > .3
best = (-1, 0, 0)
for dy in range(-10, 41, 2):
    for dx in range(-20, 21, 2):
        score = (np.roll(np.roll(painted, dy, 0), dx, 1) & ridge3d).sum()
        if score > best[0]: best = (score, dx, dy)
_, sdx, sdy = best
shifted = np.roll(np.roll(painted, sdy, 0), sdx, 1)
# the aligned painted shape covers the bridge and inner rims (where the nose hides the ridge);
# the ridge adds whatever extra thickness the 3D frame has
rim = ndi.binary_dilation(shifted, iterations=2) | (ridge3d & cv2.dilate(shifted.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool))
rim = ndi.binary_closing(rim, iterations=2)
print('frame offset (px)', sdx, sdy)
px_, py_ = (U - fx0).astype(int), (Vp - fy0).astype(int)
inbox = (px_ >= 0) & (px_ < zb.shape[1]) & (py_ >= 0) & (py_ < zb.shape[0])
pxc, pyc = np.clip(px_, 0, zb.shape[1] - 1), np.clip(py_, 0, zb.shape[0] - 1)
front = V[:, 2] >= zb[pyc, pxc] - .012
glasses = (inbox & front & (shifted[pyc, pxc] | (rim[pyc, pxc] & (res[pyc, pxc] > .006)))).astype(np.float64)
print('frame geometry verts', int(glasses.sum()))

# ---------------------------------------------------------------- fallback colors for what the portrait cannot see
clean = np.asarray(Image.open(os.path.join(AVATAR, 'head.webp')).convert('RGBA')).astype(np.float32)
body = np.asarray(Image.open(os.path.join(AVATAR, 'body.webp')).convert('RGBA')).astype(np.float32)
a = clean[..., 3:] / 255
albedo = clean[..., :3] * a + body[..., :3] * (1 - a)
cover = ndi.binary_erosion((clean[..., 3] + body[..., 3]) > 250, iterations=3)   # opaque interior only
idx = ndi.distance_transform_edt(~cover, return_distances=False, return_indices=True)
albedo = albedo[tuple(idx)]                                 # no cream fringe at the silhouette
soft = cv2.GaussianBlur(albedo, (0, 0), 6)
col = soft[np.clip(Vp.astype(int), 0, H - 1), np.clip(U.astype(int), 0, W - 1)] / 255.0
known = (weight > .35) & (glasses < .3)
edges = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
A = sparse.coo_matrix((np.ones(len(edges) * 2), (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])), shape=(len(V),) * 2).tocsr()
A.data[:] = 1
Pm = sparse.diags(1 / np.asarray(A.sum(1)).ravel()) @ A

# What the portrait cannot see is hair (back and top of the head), neck skin, or shirt.
row = lambda py: (CY - py) / S                               # portrait row -> mesh height
lum = col @ np.array([.2126, .7152, .0722])
sat = col.max(1) - col.min(1)
wh = np.clip((V[:, 1] - row(1010)) / (row(900) - row(1010)), 0, 1)   # 0 torso .. 1 head, over the neck
wh = wh * wh * (3 - 2 * wh)
# Shoulders (wider than the neck, below the hairline) never turn with the head.
neck_half = (meta['neck'][1] - meta['neck'][0]) / 2 / S
side = np.clip((neck_half + .09 - np.abs(V[:, 0])) / .09, 0, 1)
wh = np.where(V[:, 1] < row(860), wh * side * side * (3 - 2 * side), wh)
pz = float(np.median(V[np.abs(V[:, 1] - row(790)) < .05, 2]))
region = np.full(len(V), 1)                                  # 0 hair, 1 skin, 2 shirt
region[(V[:, 1] > row(870)) & ~((V[:, 2] > pz + .25) & (V[:, 1] < row(560)))] = 0
region[(wh < .35) | (V[:, 1] < row(950)) | ((np.abs(V[:, 0]) > neck_half + .02) & (V[:, 1] < row(880)))] = 2
hair_src = known & (lum < .15) & (V[:, 1] > row(900))
shirt_src = known & (V[:, 1] < row(930)) & (lum < .3) & (sat < .08)
src_region = np.where(hair_src, 0, np.where(shirt_src, 2, 1))
fill = np.zeros_like(col)
for r in (0, 1, 2):
    src = known & (src_region == r)
    if not src.any(): continue
    f = np.where(src[:, None], col, col[src].mean(0))
    for _ in range(700):
        f = np.where(src[:, None], col, Pm @ f)
    fill = np.where((region == r)[:, None], f, fill)
fill = np.where(known[:, None], col, fill)
for _ in range(6):
    fill = .5 * fill + .5 * (Pm @ fill)

# ---------------------------------------------------------------- head / neck skinning
band = np.abs(V[:, 1] - (CY - 790) / S) < .05
pivot = [0.0, float((CY - 790) / S), float(np.median(V[band, 2]) if band.any() else 0.0)]

# ---------------------------------------------------------------- write
V32 = V.astype(np.float32); N32 = (N * 32767).round().astype(np.int16)
uv16 = np.stack([np.clip(U / W, 0, 1), np.clip(1 - Vp / H, 0, 1)], 1)
uv16 = (uv16 * 65535).round().astype(np.uint16)
attrs = (np.stack([weight, glasses, wh, np.zeros_like(wh)], 1) * 255).round().astype(np.uint8)
rgb = np.concatenate([(fill * 255).clip(0, 255), np.full((len(V), 1), 255)], 1).astype(np.uint8)
blob = bytearray()
layout = {}
for name, arr in [('position', V32), ('normal', N32), ('uv', uv16), ('attrs', attrs), ('color', rgb), ('index', F.astype(np.uint16))]:
    while len(blob) % 4: blob.append(0)
    layout[name] = [len(blob), int(arr.size)]
    blob.extend(np.ascontiguousarray(arr).tobytes())
open(os.path.join(OUT, 'figure.bin'), 'wb').write(blob)
info = dict(vertices=len(V), faces=len(F), layout=layout, pivot=pivot, bounds=mesh.bounds.round(4).tolist(),
            projection=dict(scale=float(S), cx=float(CX), cy=float(CY), size=[W, H], iou=round(float(iou), 4)),
            source='Hunyuan3D-2mini (seed %d) from assets/avatar-3d.png' % args.seed)
json.dump(info, open(os.path.join(OUT, 'figure.json'), 'w'), indent=1)
Image.fromarray(portrait.astype(np.uint8)).save(os.path.join(OUT, 'portrait.jpg'), quality=92)
Image.fromarray(albedo.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, 'albedo.jpg'), quality=92)
print('wrote', len(blob) // 1024, 'KB', 'visible share', round(float(known.mean()), 3), 'glasses verts', int((glasses > .3).sum()))

if args.debug:
    Image.fromarray(np.stack([np.clip(res / .06, 0, 1) * 255, painted * 150, rim * 255], -1).astype(np.uint8)).save(os.path.join(args.debug, 'rim.png'))
    shade = 60 + 180 * np.clip(N @ np.array([-.4, .5, .77]) / np.linalg.norm([-.4, .5, .77]), 0, 1)
    def splat(values, yaw):
        a = np.radians(yaw); R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
        P = V @ R.T; size = 520
        px = ((P[:, 0] + 1.05) / 2.1 * (size - 1)).astype(int); py = ((1.05 - P[:, 1]) / 2.1 * (size - 1)).astype(int)
        o = np.argsort(P[:, 2]); img = np.full((size, size, 3), 20.0)
        img[py[o], px[o]] = values[o]
        return img
    projected = portrait[np.clip(Vp.astype(int), 0, H - 1), np.clip(U.astype(int), 0, W - 1)] / 255
    final = (projected * weight[:, None] + fill * (1 - weight[:, None])) * 255
    rows = [np.concatenate([splat(final, y) for y in (0, 30, 60, 120)], 1),
            np.concatenate([splat(np.stack([weight * 255, glasses * 255, wh * 255], 1), y) for y in (0, 30, 60, 120)], 1)]
    Image.fromarray(np.concatenate(rows, 0).clip(0, 255).astype(np.uint8)).save(os.path.join(args.debug, 'figure_preview.png'))
