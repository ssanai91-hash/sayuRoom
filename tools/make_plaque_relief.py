"""Original photo -> conservative native-pixel relief (not a font/contour rebuild).

Run from repository root: python3 tools/make_plaque_relief.py
Requires Pillow, numpy, scipy. Does not alter the original JPEG.
"""
from pathlib import Path
import base64
import hashlib
import json

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/wall-plaque-original.jpg'
CROP = (300, 150, 1140, 836)
# Source pixel coordinates, including serifs, commas, descenders and the dash.
# Restrict detection to the five text bands; plate texture is never raised.
BANDS = [(570, 245, 1145, 345), (375, 365, 1360, 475),
         (785, 552, 920, 589), (495, 658, 1240, 749),
         (410, 796, 1345, 891)]


def main():
    rgb = np.asarray(Image.open(SOURCE).convert('RGB'), dtype=np.float32)
    x, y, w, h = CROP
    height = np.zeros((h, w), dtype=np.uint8)
    for left, top, right, bottom in BANDS:
        patch = rgb[top:bottom, left:right]
        # Suppress JPEG ringing / plate grain before estimating relief, never
        # smooth or resample the color texture that the visitor actually reads.
        clean = ndi.gaussian_filter(patch, sigma=(1.05, 1.05, 0))
        luma = clean @ np.array([.2126, .7152, .0722])
        # Median is ONLY a background estimator. Never close, dilate, fill holes,
        # simplify contours, remove small components, or replace the color pixels.
        background = ndi.gaussian_filter(ndi.median_filter(luma, size=(31, 31)), 3)
        contrast = luma - background
        warm = clean[:, :, 0] - clean[:, :, 2]
        seed = (contrast > 29) & (warm > 9)
        support = (contrast > 14) & (warm > 7)
        # Hysteresis grows only inside visible support. Detached faint evidence
        # remains flat in the original photo instead of inventing missing strokes.
        mask = ndi.binary_propagation(seed, mask=support, structure=np.ones((3, 3)))
        distance = ndi.distance_transform_edt(mask)
        bevel = (1 - np.exp(-distance / .9)) * mask
        bevel = ndi.gaussian_filter(bevel, .4) * mask
        values = np.rint(bevel * 255).astype(np.uint8)
        height[top-y:bottom-y, left-x:right-x] = values
    target = ROOT / 'assets/wall-plaque-relief-v1.png'
    Image.fromarray(height).save(target, optimize=True)
    info = {
        'source': 'wall-plaque-original.jpg',
        'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'crop': list(CROP), 'pixels': [w, h], 'bands': BANDS,
        'maxHeightMeters': .0032,
        'method': 'native-pixel heightfield; no contour triangulation or hole filling',
        'nonzeroPixels': int(np.count_nonzero(height)),
        'heightMapBytes': target.stat().st_size,
        'pngBase64': base64.b64encode(target.read_bytes()).decode('ascii'),
        'limits': 'Single oblique JPEG; estimated relief only, baked light retained.'
    }
    (ROOT / 'assets/wall-plaque-relief-v1.json').write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in info.items() if k != 'pngBase64'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
