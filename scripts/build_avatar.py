"""Build the layered 3D avatar assets from assets/avatar-3d.png.

The portrait is split into layers that the browser renders as real geometry:

  body      neck + shirt (static), with the neck continued behind the jaw
  head      hair, face and ears (rotates at the neck), glasses frame removed
  glasses   the frame alone, floating in front of the eyes
  iris      both irises, drawn by the shader so the eyes can follow the cursor
  eyemask   R = eye opening, G = lid coordinate (0 upper lid -> 1 lower lid)

Relief comes from Depth-Anything-V2 (Base). Run once with the conda Python
that has torch + transformers:

    python scripts/build_avatar.py [--debug DIR]

Outputs go to assets/avatar/. The page only loads those small baked files.
"""
import argparse, json, os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'avatar-3d.png')
OUT = os.path.join(ROOT, 'assets', 'avatar')
BG = np.array([247, 241, 233], np.float32)

# Hand-checked seeds (source pixels) refined automatically below.
EYES = [
    dict(name='left', box=(438, 522, 572, 574), iris=(507.7, 541.6, 24.1)),
    dict(name='right', box=(666, 522, 800, 574), iris=(731.5, 541.6, 23.8)),
]
GLASSES_BOX = (360, 501, 892, 680)

p = argparse.ArgumentParser()
p.add_argument('--debug', default=None)
p.add_argument('--cache', default=None, help='directory holding disp_518.npy / disp_1022.npy')
args = p.parse_args()
dbg = args.debug
if dbg: os.makedirs(dbg, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

img8 = np.asarray(Image.open(SRC).convert('RGB'))
img = img8.astype(np.float32)
H, W = img.shape[:2]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
lum = img @ np.array([.2126, .7152, .0722], np.float32)

def save_dbg(name, arr):
    if not dbg: return
    a = np.asarray(arr)
    if a.dtype != np.uint8:
        a = np.clip((a - a.min()) / (np.ptp(a) + 1e-9) * 255, 0, 255).astype(np.uint8)
    Image.fromarray(a).save(os.path.join(dbg, name))

# ---------------------------------------------------------------- depth
def estimate(size):
    cached = args.cache and os.path.join(args.cache, f'disp_{size}.npy')
    if cached and os.path.exists(cached): return np.load(cached)
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    name = 'depth-anything/Depth-Anything-V2-Base-hf'
    proc = AutoImageProcessor.from_pretrained(name)
    model = AutoModelForDepthEstimation.from_pretrained(name).eval()
    inputs = proc(images=Image.fromarray(img8), return_tensors='pt', size={'height': size, 'width': size}, keep_aspect_ratio=False)
    with torch.no_grad(): out = model(**inputs).predicted_depth
    return torch.nn.functional.interpolate(out[:, None], size=(H, W), mode='bicubic', align_corners=False)[0, 0].numpy()

d_lo, d_hi = estimate(518), estimate(1022)

# ---------------------------------------------------------------- matte
dist = np.sqrt(((img - BG) ** 2).sum(-1))
hard = dist > 34
hard = ndi.binary_opening(hard, iterations=1)
# Enclosed light areas (sclera, catchlights, lens glints) belong to the subject.
lab, n = ndi.label(~hard)
edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
hard |= ~np.isin(lab, list(edge_labels))
lab, n = ndi.label(hard)
sizes = ndi.sum(hard, lab, range(1, n + 1))
hard = np.isin(lab, 1 + np.flatnonzero(sizes > 400))
soft = np.clip((dist - 14) / 34, 0, 1)
alpha = np.where(ndi.binary_erosion(hard, iterations=2), 1.0, np.minimum(soft, ndi.binary_dilation(hard, iterations=1)))
alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), .6)
subject = alpha > .5

# Combine global shape (518) with fine curls (1022), fit to the same scale.
A = np.stack([d_hi[subject], np.ones(subject.sum())], 1)
k, b = np.linalg.lstsq(A, d_lo[subject], rcond=None)[0]
d_hi = d_hi * k + b
D = cv2.GaussianBlur(d_lo, (0, 0), 5) + (d_hi - cv2.GaussianBlur(d_hi, (0, 0), 5))

# ---------------------------------------------------------------- head / body split
jaw = np.full(W, 935.0)
for x in range(430, 830):
    col = D[:, x]
    best, by = 0, None
    for y in range(760, 965):
        if not subject[y, x] or not subject[min(y + 10, H - 1), x]: continue
        drop = col[y - 2] - col[y + 10]
        if drop > best and col[y + 10] > 4.6: best, by = drop, y + 2
    if by is not None and best > .55: jaw[x] = by
jx = np.arange(W)
valid = jaw < 935
jaw_s = jaw.copy()
jaw_s[valid] = ndi.median_filter(jaw[valid], 25)
jaw_s = ndi.gaussian_filter1d(jaw_s, 4)
head_region = yy < jaw_s[None, :]
rows = slice(900, 925)
neck_like = (subject[rows] & (lum[rows] > 60)).mean(0) > .5
span = np.flatnonzero(neck_like[300:950]) + 300
outside = (xx < span.min() + 2) | (xx > span.max() - 2)
head_region |= outside & (yy < 935)
head_mask = subject & head_region
lab, n = ndi.label(head_mask)
sizes = ndi.sum(head_mask, lab, range(1, n + 1))
head_mask = lab == 1 + int(np.argmax(sizes))
body_mask = subject & ~head_mask
lab, n = ndi.label(body_mask)
sizes = ndi.sum(body_mask, lab, range(1, n + 1))
body_mask = np.isin(lab, 1 + np.flatnonzero(sizes > 5000))
print('jaw range', jaw_s[valid].min(), jaw_s[valid].max(), 'valid cols', valid.sum())

# ---------------------------------------------------------------- glasses frame
x0, y0, x1, y1 = GLASSES_BOX
box = np.zeros((H, W), bool); box[y0:y1, x0:x1] = True
tophat = D - cv2.morphologyEx(D, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
darkish = lum < 120
frame = box & (tophat > .22) & head_mask & (darkish | (tophat > .45))
frame = ndi.binary_closing(frame, iterations=2)
lab, n = ndi.label(frame)
sizes = ndi.sum(frame, lab, range(1, n + 1))
frame = lab == 1 + int(np.argmax(sizes))
frame_soft = cv2.GaussianBlur(ndi.binary_dilation(frame, iterations=1).astype(np.float32), (0, 0), .9)
frame_soft = np.clip(frame_soft * 1.35, 0, 1)
print('frame px', int(frame.sum()))

# Inpaint face and relief under the frame.
paint_mask = ndi.binary_dilation(frame, iterations=4).astype(np.uint8)
head_rgb = cv2.inpaint(img8, paint_mask, 6, cv2.INPAINT_TELEA)
under = D.copy()
under[paint_mask > 0] = np.nan
idx = ndi.distance_transform_edt(np.isnan(under), return_distances=False, return_indices=True)
under = under[tuple(idx)]
under = np.where(paint_mask > 0, cv2.GaussianBlur(under, (0, 0), 4), D)

# ---------------------------------------------------------------- eyes
eyemask = np.zeros((H, W, 3), np.float32)
iris_rgba = np.zeros((H, W, 4), np.float32)
eye_meta = []
for e in EYES:
    bx0, by0, bx1, by1 = e['box']
    cx, cy, r = e['iris']
    sub = img[by0:by1, bx0:bx1]
    L = lum[by0:by1, bx0:bx1]
    sat = sub.max(-1) - sub.min(-1)
    gy, gx = np.mgrid[by0:by1, bx0:bx1].astype(np.float32)
    in_disc = (gx - cx) ** 2 + (gy - cy) ** 2 <= (r + 1.5) ** 2
    sclera = (L > 150) & (sat < 75) & ~in_disc
    sclera = ndi.binary_opening(sclera, iterations=1)
    cols = np.flatnonzero(sclera.any(0))
    tops = np.array([np.flatnonzero(sclera[:, c])[0] for c in cols], np.float32) + by0
    bots = np.array([np.flatnonzero(sclera[:, c])[-1] for c in cols], np.float32) + by0 + 1
    xs = cols.astype(np.float32) + bx0
    # Lids are smooth arcs; fit through the sclera boundary on both sides of the iris.
    # Columns crossing the iris only see sclera below it, so they are left out of the upper fit.
    side = np.abs(xs - cx) > r + 9  # sclera right beside the iris sits in lid shadow
    # Over the iris, the lid is where near-grey lashes give way to saturated brown (or the black pupil).
    lid_x, lid_y = [], []
    for c in range(int(cx - r + 4), int(cx + r - 3)):
        colpx = img[by0:by1, c]
        dark = False
        for yi, (R, G, B) in enumerate(colpx):
            l = .2126 * R + .7152 * G + .0722 * B
            if l < 45: dark = True
            if dark and ((R > 14 and B < .22 * R) or l < 12):
                lid_x.append(c); lid_y.append(by0 + yi); break
    up_x = np.concatenate([xs[side], lid_x]); up_y = np.concatenate([tops[side], lid_y])
    up = np.polyfit(up_x - cx, up_y, 3)
    lo_x = np.concatenate([xs, [cx - 6, cx, cx + 6]])
    lo_y = np.concatenate([bots, [cy + r + .6] * 3])
    lo = np.polyfit(lo_x - cx, lo_y, 2)
    xl, xr = xs.min() - .5, xs.max() + 1.5
    top = np.polyval(up, gx - cx) + .4  # stay below the lash line
    bot = np.polyval(lo, gx - cx)
    inside = np.clip(np.minimum(gy + .5 - top, bot - gy + .5), 0, 1) * np.clip(np.minimum(gx - xl, xr - gx), 0, 1)
    inside *= (bot > top + 1)
    g = np.clip((gy - top) / np.maximum(bot - top, 1), 0, 1)
    # Sclera fill: interpolate each row across the iris from the white on either side.
    # Anything in the opening that is not clean sclera (iris, lid shadow notches) is refilled.
    fill = sub.copy()
    open_px = inside > .5
    hole = open_px & (((gx - cx) ** 2 + (gy - cy) ** 2 <= (r + 2.5) ** 2) | (L < 120))
    good = open_px & ~hole
    filled = ~hole
    for row in range(fill.shape[0]):
        hs = np.flatnonzero(hole[row])
        if not len(hs): continue
        gs = np.flatnonzero(good[row])
        left, right = gs[gs < hs[0]], gs[gs > hs[-1]]
        if not len(left) and not len(right): continue
        cl = sub[row, left[-3:]].mean(0) if len(left) else sub[row, right[:3]].mean(0)
        cr = sub[row, right[:3]].mean(0) if len(right) else cl
        t = np.linspace(0, 1, len(hs))[:, None]
        fill[row, hs] = cl * (1 - t) + cr * t
        filled[row, hs] = True
    # Rows near the upper lid have no sclera beside the iris: continue the row below, a little darker.
    for row in range(fill.shape[0] - 2, -1, -1):
        todo = hole[row] & ~filled[row] & filled[row + 1]
        fill[row, todo] = fill[row + 1, todo] * .93
        filled[row, todo] = True
    blurred = cv2.GaussianBlur(fill, (0, 0), 1.2)
    fill = np.where(hole[..., None], blurred, fill)
    # Lid shadow falls on the top of the eye; the shader re-applies it to the moving iris.
    shade = .35 + .65 * np.clip(g / .45, 0, 1) ** 1.2
    # Iris disc. Its upper half sits in lid shadow or under the lid, so it is mirrored from the lower half.
    rr = r + 1.2
    disc = np.clip(rr + .5 - np.sqrt((gx - cx) ** 2 + (gy - cy) ** 2), 0, 1)
    iris = sub / shade[..., None]
    upper = (gy < cy - 5) | ((inside < .5) & (disc > 0))
    my = np.clip(np.round(2 * cy - gy).astype(int) - by0, 0, sub.shape[0] - 1)
    mx = np.clip(np.round(gx).astype(int) - bx0, 0, sub.shape[1] - 1)
    iris = np.where(upper[..., None], iris[my, mx], iris).clip(0, 255)
    head_sub = head_rgb[by0:by1, bx0:bx1].astype(np.float32)
    head_rgb[by0:by1, bx0:bx1] = np.where(open_px[..., None], fill, head_sub).clip(0, 255).astype(np.uint8)
    eyemask[by0:by1, bx0:bx1, 0] = np.maximum(eyemask[by0:by1, bx0:bx1, 0], inside)
    eyemask[by0:by1, bx0:bx1, 1] = np.where(inside > 0, g, eyemask[by0:by1, bx0:bx1, 1])
    eyemask[by0:by1, bx0:bx1, 2] = np.where(inside > 0, shade, eyemask[by0:by1, bx0:bx1, 2])
    iris_rgba[by0:by1, bx0:bx1, :3] = np.where(disc[..., None] > 0, iris, iris_rgba[by0:by1, bx0:bx1, :3])
    iris_rgba[by0:by1, bx0:bx1, 3] = np.maximum(iris_rgba[by0:by1, bx0:bx1, 3], disc)
    # Upper-lid skin for blinking: sample a band just above the lash line.
    lid_band = (gy < top - 7) & (gy > top - 13) & (np.abs(gx - cx) < 30)
    lid = np.median(sub[lid_band], 0)
    travel_x = max(4.0, min(cx - xl, xr - cx) - r * .55)
    eye_meta.append(dict(name=e['name'], center=[cx, cy], radius=r, lid=(lid / 255).round(4).tolist(),
                         travel=[round(float(travel_x), 1), 5.0], extent=[float(xl), float(xr)]))
    if dbg:
        z = 8
        vis = cv2.resize(sub.astype(np.uint8), None, fx=z, fy=z, interpolation=cv2.INTER_NEAREST)
        for X in range(sub.shape[1]):
            xg = X + bx0 + .5
            for poly, col in ((up, (0, 255, 0)), (lo, (255, 0, 255))):
                Y = np.polyval(poly, xg - cx) - by0 + (.4 if col[0] == 0 else 0)
                if xl <= xg <= xr and 0 <= Y < sub.shape[0]: cv2.circle(vis, (int(X * z + z / 2), int(Y * z)), 2, col, -1)
        cv2.circle(vis, (int((cx - bx0) * z), int((cy - by0) * z)), int(r * z), (0, 200, 255), 1)
        save_dbg(f'eye_{e["name"]}_fit.png', vis)
        save_dbg(f'eye_{e["name"]}_fill.png', cv2.resize(fill.clip(0, 255).astype(np.uint8), None, fx=z, fy=z, interpolation=cv2.INTER_NEAREST))
        irisvis = (iris * shade[..., None]).clip(0, 255) * disc[..., None] + 255 * (1 - disc[..., None])
        save_dbg(f'eye_{e["name"]}_iris.png', cv2.resize(irisvis.astype(np.uint8), None, fx=z, fy=z, interpolation=cv2.INTER_NEAREST))

# ---------------------------------------------------------------- body layer (neck continues behind the jaw)
# Neck edges just under the jaw; the hidden neck column follows them up behind the chin.
rows = slice(900, 925)
neck_span = (body_mask[rows] & (lum[rows] > 60)).mean(0) > .5
ncols = np.flatnonzero(neck_span[300:950]) + 300
nl, nr = int(ncols.min()) + 3, int(ncols.max()) - 3
body_rgb = img8.astype(np.float32).copy()
hidden = np.zeros((H, W), bool)
for x in range(nl, nr + 1):
    yj = int(np.ceil(jaw_s[x])) if valid[x] else 925
    ys = [y for y in range(yj + 4, yj + 14) if body_mask[y, x]]
    if not ys: continue
    c = np.median(img[ys, x], 0)
    y_top = 770
    hidden[y_top:yj + 4, x] = True
    t = np.linspace(.86, 1, yj + 4 - y_top)[:, None]
    body_rgb[y_top:yj + 4, x] = c * t
hidden &= head_mask | body_mask
soft_fill = cv2.GaussianBlur(body_rgb, (0, 0), 3.5)
body_rgb = np.where(hidden[..., None], soft_fill, body_rgb).clip(0, 255).astype(np.uint8)
body_full = body_mask | hidden
print('neck span', nl, nr)

# ---------------------------------------------------------------- relief -> z
def grid(z, mask, box, step):
    bx0, by0, bx1, by1 = box
    xs = np.linspace(bx0, bx1, int(round((bx1 - bx0) / step)) + 1)
    ys = np.linspace(by0, by1, int(round((by1 - by0) / step)) + 1)
    mx, my = np.meshgrid(xs, ys)
    Z = cv2.remap(z.astype(np.float32), mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR)
    cover = cv2.dilate(mask.astype(np.uint8), np.ones((int(step * 2 + 1),) * 2, np.uint8))
    C = cv2.remap(cover.astype(np.float32), mx.astype(np.float32), my.astype(np.float32), cv2.INTER_NEAREST) > .5
    return Z, C, len(xs), len(ys)

def limit_slopes(Z, max_step, anchor=1e-3):
    """Turn depth cliffs (cheek against side hair) into ramps: clamp each grid step, then
    re-integrate with a weak pull toward the original so the overall shape survives.
    Without this, turning the head stretches those cliffs into streaks."""
    from scipy import sparse
    from scipy.sparse.linalg import spsolve
    gh, gw = Z.shape
    n = gh * gw
    idx = np.arange(n).reshape(gh, gw)
    lo = np.concatenate([idx[:, :-1].ravel(), idx[:-1, :].ravel()])
    hi = np.concatenate([idx[:, 1:].ravel(), idx[1:, :].ravel()])
    g = np.clip(np.concatenate([(Z[:, 1:] - Z[:, :-1]).ravel(), (Z[1:, :] - Z[:-1, :]).ravel()]), -max_step, max_step)
    m = len(g)
    D = sparse.csr_matrix((np.r_[-np.ones(m), np.ones(m)], (np.r_[np.arange(m), np.arange(m)], np.r_[lo, hi])), shape=(m, n))
    A = (D.T @ D + anchor * sparse.identity(n)).tocsc()
    return spsolve(A, D.T @ g + anchor * Z.ravel().astype(np.float64)).reshape(gh, gw).astype(np.float32)

def extend(z, mask):
    """Continue values outward from the mask so edge triangles never dive to the background."""
    idx = ndi.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    out = z[tuple(idx)]
    return np.where(mask, z, cv2.GaussianBlur(out, (0, 0), 3))

def round_edges(z, mask, radius, back):
    dt = ndi.distance_transform_edt(mask)
    f = np.sqrt(1 - (1 - np.clip(dt / radius, 0, 1)) ** 2)
    return back + (z - back) * f

UNIT = 2.0 / W          # image width spans two world units
ZK = .135               # disparity -> world units (face depth ~0.6 x head width)
D_BACK = 3.0
head_mask_e = ndi.binary_erosion(head_mask, iterations=3)
zh = (under - D_BACK) * ZK
zh = extend(zh, head_mask_e)
# Round only where the head meets the background, not along the jaw cut above the neck.
zh = round_edges(zh, head_mask | body_full, 55, 0.0)
zh = extend(zh, head_mask_e)
HEAD_STEP = W / 300
Zg = grid(zh, head_mask, (0, 0, W - 1, H - 1), HEAD_STEP)[0]
gy_, gx_ = (yy * (Zg.shape[0] - 1) / (H - 1)).astype(np.float32), (xx * (Zg.shape[1] - 1) / (W - 1)).astype(np.float32)
zh = zh + cv2.remap(limit_slopes(Zg, .02) - Zg, gx_, gy_, cv2.INTER_LINEAR)

body_core = ndi.binary_erosion(body_mask, iterations=3)
zb = (D - D_BACK) * ZK
zb = extend(zb, body_core)
neck_z = np.median(zb[(yy > 950) & (yy < 990) & body_core & (np.abs(xx - W / 2) < 80)])
# The hidden neck is a gently rounded column that sits behind the head everywhere.
if hidden.any():
    col = neck_z - .06 * ((xx - W / 2) / 170) ** 2
    zb = np.where(hidden, np.minimum(col, zh - .05), zb)
zb = round_edges(zb, body_full, 30, zb.min())
zb = extend(zb, ndi.binary_erosion(body_full, iterations=2))

# Glasses: a rigid, smoothly curved frame fitted to the relief of the frame pixels.
fy, fx = np.nonzero(frame)
fz = (D[fy, fx] - D_BACK) * ZK
Xf = np.stack([np.ones_like(fx), fx, fy, fx * fx, fy * fy, fx * fy], 1).astype(np.float64)
coef = np.linalg.lstsq(Xf, fz, rcond=None)[0]
gzz = (np.stack([np.ones_like(xx), xx, yy, xx * xx, yy * yy, xx * yy], -1) @ coef).astype(np.float32)
gzz = np.maximum(gzz, cv2.dilate(zh, np.ones((9, 9), np.uint8)) + .035)
gzz = cv2.GaussianBlur(gzz, (0, 0), 6)

# ---------------------------------------------------------------- write
layers = {}
blob = bytearray()
def add_layer(name, z, mask, box, step):
    Z, C, gw, gh = grid(z, mask, box, step)
    zmin, zmax = float(Z.min()), float(Z.max())
    q = np.round((Z - zmin) / (zmax - zmin + 1e-9) * 65535).astype('<u2')
    off = len(blob); blob.extend(q.tobytes()); cov = len(blob); blob.extend(C.astype(np.uint8).tobytes())
    while len(blob) % 4: blob.append(0)
    layers[name] = dict(box=list(map(float, box)), grid=[gw, gh], z=[round(zmin, 5), round(zmax, 5)], depthOffset=off, coverOffset=cov)
    print(name, gw, gh, 'z', round(zmin, 3), round(zmax, 3), 'cover', int(C.sum()))

add_layer('head', zh, head_mask, (0, 0, W - 1, H - 1), HEAD_STEP)
add_layer('body', zb, body_full, (0, 0, W - 1, H - 1), W / 160)
add_layer('glasses', gzz, frame_soft > .02, (x0, y0, x1, y1), 2.0)
with open(os.path.join(OUT, 'geometry.bin'), 'wb') as f: f.write(blob)

def rgba(rgb, a):
    return Image.fromarray(np.dstack([np.asarray(rgb).clip(0, 255).astype(np.uint8), (np.clip(a, 0, 1) * 255).astype(np.uint8)]), 'RGBA')

head_alpha = np.minimum(alpha, cv2.GaussianBlur(head_mask.astype(np.float32), (0, 0), 1.1))
fade = np.clip((yy - 770) / 45, 0, 1) * np.clip(np.minimum(xx - nl, nr - xx) / 18, 0, 1)
body_alpha = np.maximum(np.minimum(alpha, body_mask.astype(np.float32)), hidden * fade)
body_alpha = cv2.GaussianBlur(body_alpha, (0, 0), .7)
rgba(head_rgb, head_alpha).save(os.path.join(OUT, 'head.webp'), quality=90, method=6)
rgba(body_rgb, body_alpha).save(os.path.join(OUT, 'body.webp'), quality=86, method=6)
gl = rgba(img8, frame_soft).crop((x0, y0, x1 + 1, y1 + 1))
gl.save(os.path.join(OUT, 'glasses.webp'), quality=92, method=6)
em = np.dstack([eyemask[..., 0], eyemask[..., 1], eyemask[..., 2]])
Image.fromarray((em * 255).round().astype(np.uint8)).save(os.path.join(OUT, 'eyemask.png'), optimize=True)
rgba(iris_rgba[..., :3], iris_rgba[..., 3]).save(os.path.join(OUT, 'iris.png'), optimize=True)

pivot = [W / 2, float(np.median(jaw_s[valid])) - 40 if valid.any() else 880.0]
meta = dict(size=[W, H], unit=UNIT, layers=layers, eyes=eye_meta, neck=[nl, nr], pivot=pivot, pivotDepth=round(float(np.median(zh[head_mask_e])) - .35, 4),
            source='assets/avatar-3d.png', depthModel='depth-anything/Depth-Anything-V2-Base-hf')
with open(os.path.join(OUT, 'avatar.json'), 'w') as f: json.dump(meta, f, indent=1)
Image.fromarray(img8).resize((800, 800), Image.LANCZOS).save(os.path.join(OUT, 'portrait.webp'), quality=86, method=6)

if dbg:
    split = img8.copy()
    split[head_mask] = (split[head_mask] * .6 + np.array([255, 60, 60]) * .4).astype(np.uint8)
    split[body_full] = (split[body_full] * .6 + np.array([60, 60, 255]) * .4).astype(np.uint8)
    split[frame] = (0, 255, 0)
    save_dbg('split.png', split)
    save_dbg('zh.png', np.where(head_mask, zh, zh.min()))
    save_dbg('zb.png', np.where(body_full, zb, zb.min()))
    save_dbg('head_rgb.png', head_rgb)
    save_dbg('body_rgb.png', body_rgb)
print('done', {k: os.path.getsize(os.path.join(OUT, k)) for k in os.listdir(OUT)})
