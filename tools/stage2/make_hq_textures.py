"""2단계 고화질 텍스처: 박물관 원본 스캔 → 4K 색상 / 4K 재구운 노멀 / 2K ORM → KTX2 + manifest.

원본 ZIP은 앱에 포함하지 않는다. 결과물만 models/hq/에 쓴다.

필요: numpy scipy pillow trimesh numba embreex, 그리고 basisu 실행 파일(BinomialLLC/basis_universal).

사용:
  python tools/stage2/make_hq_textures.py --source-root /path/to/statue-work --basisu /path/to/basisu
  python tools/stage2/make_hq_textures.py --self-test --basisu /path/to/basisu --out /tmp/hq-test

원리
- 현재 12만 삼각형 GLB는 원본 UV를 보존한 감량본이므로 색상은 원본 8K를 4K로 줄이기만 한다.
- 노멀은 다시 굽는다: 12만 모델의 각 텍셀을 원본 27만 형상에 투영해, 원본 노멀 지도까지 반영한
  실제 표면 방향을 구한 뒤 12만 모델의 접선 공간(three.js r128 perturbNormal2Arb와 같은 UV 기울기 기준)으로
  다시 표현한다. 감량 때 잃은 형상 디테일이 노멀 지도로 옮겨진다.
- ORM(R=AO, G=roughness, B=metalness)은 1단계와 같은 방법으로 2K에서 다시 계산한다.
- 용량: 노멀은 UASTC라 4K면 장당 약 13MB(RDO 후)로 목표(불상당 7MB)를 넘는다. 그래서 기본값은
  색상 4K(ETC1S, 눈에 가장 잘 보이는 선명도) + 노멀 2K(UASTC, 원본 형상에서 재구움) + ORM 2K.
  자가 시험 기준 2K 노멀 약 3.2~3.7MB, 4K 색상 약 2MB 예상 → 불상당 약 6MB.
- --self-test: 원본 대신 현재 GLB 자신을 '원본'으로 넣어 굽는다. 결과 노멀이 입력 노멀과 거의 같아야
  (평균 각도 오차 수 도 이내) 접선 공간 수학이 맞다는 뜻이다. 결과물은 --out에만 쓰고 커밋하지 않는다.
"""
import argparse, hashlib, io, json, math, re, struct, subprocess, sys, time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
import trimesh
from numba import njit

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/stage1'))
import bake_materials as stage1  # noqa: E402  (read_glb, array, classify, bake_ao 재사용)

SIDES = [('left', '78', 'bon002789', .815), ('right', '83', 'duk003312', .908)]


@njit(cache=True)
def rasterize(vertices, normals, uv, faces, size):
    positions = np.zeros((size, size, 3), np.float32)
    smooth = np.zeros((size, size, 3), np.float32)
    face_id = np.full((size, size), -1, np.int32)
    for fi in range(faces.shape[0]):
        f = faces[fi]
        a, b, c = uv[f[0]] * size - .5, uv[f[1]] * size - .5, uv[f[2]] * size - .5
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        x0 = max(0, int(math.ceil(min(a[0], b[0], c[0])))); x1 = min(size - 1, int(math.floor(max(a[0], b[0], c[0]))))
        y0 = max(0, int(math.ceil(min(a[1], b[1], c[1])))); y1 = min(size - 1, int(math.floor(max(a[1], b[1], c[1]))))
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                w0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den
                w1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den
                w2 = 1 - w0 - w1
                if min(w0, w1, w2) < -1e-5:
                    continue
                for j in range(3):
                    positions[y, x, j] = w0 * vertices[f[0], j] + w1 * vertices[f[1], j] + w2 * vertices[f[2], j]
                    smooth[y, x, j] = w0 * normals[f[0], j] + w1 * normals[f[1], j] + w2 * normals[f[2], j]
                face_id[y, x] = fi
    return positions, smooth, face_id


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def uv_gradients(vertices, uv, faces):
    """면마다 표면 위 u, v의 기울기 벡터(물체 공간). r128 셰이더의 T, B 방향과 같다."""
    p0, p1, p2 = vertices[faces[:, 0]], vertices[faces[:, 1]], vertices[faces[:, 2]]
    t0, t1, t2 = uv[faces[:, 0]], uv[faces[:, 1]], uv[faces[:, 2]]
    e1, e2 = p1 - p0, p2 - p0
    a, b, c = (e1 * e1).sum(1), (e1 * e2).sum(1), (e2 * e2).sum(1)
    det = np.maximum(a * c - b * b, 1e-20)
    out = []
    for k in range(2):
        d1, d2 = (t1 - t0)[:, k], (t2 - t0)[:, k]
        out.append(((d1 * c - d2 * b)[:, None] * e1 + (d2 * a - d1 * b)[:, None] * e2) / det[:, None])
    gu, gv = out
    m = np.maximum(np.maximum(np.linalg.norm(gu, axis=1), np.linalg.norm(gv, axis=1)), 1e-20)[:, None]
    return (gu / m).astype(np.float32), (gv / m).astype(np.float32)


def sample_bilinear(img, uv):
    """img: (H,W,3) uint8, uv: (N,2). glTF 규약(flipY 없음): v=0이 첫 행."""
    h, w = img.shape[:2]
    x = np.clip(uv[:, 0] * w - .5, 0, w - 1); y = np.clip(uv[:, 1] * h - .5, 0, h - 1)
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64)
    x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    f = lambda yy, xx: img[yy, xx].astype(np.float32)
    return (f(y0, x0) * (1 - fx) + f(y0, x1) * fx) * (1 - fy) + (f(y1, x0) * (1 - fx) + f(y1, x1) * fx) * fy


def decode(rgb, gu, gv, n):
    """r128 perturbNormal2Arb와 같은 해석 (normalScale 1)."""
    t = rgb / 127.5 - 1
    return unit(gu * t[:, :1] + gv * t[:, 1:2] + n * t[:, 2:3])


def encode(target, gu, gv, n):
    """decode의 역: target = gu*x + gv*y + n*z 를 풀어 단위 (x,y,z)로 저장."""
    m = np.stack([gu, gv, n], axis=-1)  # (N,3,3) 열 = 기저
    xyz = np.linalg.solve(m, target[..., None])[..., 0]
    xyz[:, 2] = np.maximum(xyz[:, 2], .05)
    return unit(xyz)


def pad(img, mask):
    idx = distance_transform_edt(~mask, return_distances=False, return_indices=True)
    return img[tuple(idx)]


def parse_mtl(obj_path):
    """OBJ의 MTL에서 색상(map_Kd)과 노멀(norm / map_Bump / bump) 파일을 찾는다."""
    mtl_names = re.findall(r'^mtllib\s+(.+)$', obj_path.read_text(errors='ignore')[:20000], re.M)
    found = {}
    for name in mtl_names:
        mtl = obj_path.parent / name.strip()
        for line in mtl.read_text(errors='ignore').splitlines():
            parts = line.strip().split()
            if not parts:
                continue
            key = parts[0].lower()
            if key == 'map_kd':
                found.setdefault('color', obj_path.parent / parts[-1])
            elif key in ('norm', 'map_bump', 'bump', 'map_normal'):
                found.setdefault('normal', obj_path.parent / parts[-1])
    if 'color' not in found or 'normal' not in found:
        raise RuntimeError(f'MTL에서 색상/노멀 지도를 찾지 못함: {found}')
    return found


def glb_image(data, binary, index):
    view = data['bufferViews'][data['images'][index]['bufferView']]
    o = view.get('byteOffset', 0)
    return Image.open(io.BytesIO(binary[o:o + view['byteLength']])).convert('RGB')


def load_low(side):
    path = ROOT / f'models/bangasayu-{side}.glb'
    raw, data, binary = stage1.read_glb(path)
    prim = data['meshes'][0]['primitives'][0]; at = prim['attributes']
    v = stage1.array(data, binary, at['POSITION']).astype(np.float32)
    n = stage1.array(data, binary, at['NORMAL']).astype(np.float32)
    uv = stage1.array(data, binary, at['TEXCOORD_0']).astype(np.float32)
    f = stage1.array(data, binary, prim['indices']).reshape(-1, 3).astype(np.int32)
    mat = data['materials'][prim.get('material', 0)]
    return dict(path=path, data=data, binary=binary, v=v, n=n, uv=uv, f=f, mat=mat)


def load_high(args, low, number, stem, height):
    if args.self_test:
        mesh = trimesh.Trimesh(low['v'], low['f'], vertex_normals=low['n'], process=False)
        color = glb_image(low['data'], low['binary'], low['mat']['pbrMetallicRoughness']['baseColorTexture']['index'])
        normal = glb_image(low['data'], low['binary'], low['mat']['normalTexture']['index'])
        return mesh, low['uv'], np.asarray(color), np.asarray(normal), 'self-test'
    obj = args.source_root / f'original-{number}' / '디지털콘텐츠_OBJ' / f'{stem}-000-30000.obj'
    maps = parse_mtl(obj)
    mesh = trimesh.load(obj, process=False, force='mesh')
    # 1단계·최초 변환과 같은 좌표계: Z 위·mm → Y 위·m, 받침 바닥 중앙이 원점
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    mesh.apply_scale(height / mesh.extents[1]); b = mesh.bounds
    mesh.apply_translation([-b[:, 0].mean(), -b[0, 1], -b[:, 2].mean()])
    uv = np.asarray(mesh.visual.uv, dtype=np.float32).copy()
    # OBJ는 v=0이 아래, glTF는 v=0이 위. 현재 GLB와 같은 규약으로 맞춘다.
    uv[:, 1] = 1 - uv[:, 1]
    color = np.asarray(Image.open(maps['color']).convert('RGB'))
    normal = np.asarray(Image.open(maps['normal']).convert('RGB'))
    return mesh, uv, color, normal, hashlib.sha256(obj.read_bytes()).hexdigest()


def bake_normal(low, high, high_uv, high_normal, size):
    from embreex.rtcore_scene import EmbreeScene
    from embreex.mesh_construction import TriangleMesh
    pos, smooth, fid = rasterize(low['v'], low['n'], low['uv'], low['f'], size)
    mask = fid >= 0
    gu_l, gv_l = uv_gradients(low['v'], low['uv'], low['f'])
    hv = np.asarray(high.vertices, np.float32); hf = np.asarray(high.faces, np.int32)
    hn = np.asarray(high.vertex_normals, np.float32)
    gu_h, gv_h = uv_gradients(hv, high_uv, hf)
    scene = EmbreeScene(); TriangleMesh(scene, hv, hf)
    ys, xs = np.nonzero(mask)
    out = np.zeros((size, size, 3), np.float32)
    stats = dict(texels=int(mask.sum()), projected=0, uvDriftMean=0.)
    drift_sum = 0.
    for s in range(0, len(ys), 500000):
        yy, xx = ys[s:s + 500000], xs[s:s + 500000]
        p = pos[yy, xx]; n = unit(smooth[yy, xx]); fl = fid[yy, xx]
        texel_uv = np.stack([(xx + .5) / size, (yy + .5) / size], 1).astype(np.float32)
        best = np.full(len(p), np.inf); hit_face = np.full(len(p), -1); hu = np.zeros(len(p)); hvv = np.zeros(len(p))
        for sign in (1., -1.):
            origin = (p + n * (.012 * sign)).astype('f'); direction = (-n * sign).astype('f')
            hit = scene.run(origin, direction, output=1)
            valid = (hit['primID'] >= 0) & (hit['tfar'] < .024)
            delta = np.abs(hit['tfar'] - .012); valid &= delta < best
            best[valid] = delta[valid]; hit_face[valid] = hit['primID'][valid]
            hu[valid] = hit['u'][valid]; hvv[valid] = hit['v'][valid]
        ok = hit_face >= 0
        target = np.empty_like(p)
        if ok.any():
            f = hf[hit_face[ok]]; u = hu[ok, None]; v = hvv[ok, None]
            uvh = high_uv[f[:, 0]] * (1 - u - v) + high_uv[f[:, 1]] * u + high_uv[f[:, 2]] * v
            nh = unit(hn[f[:, 0]] * (1 - u - v) + hn[f[:, 1]] * u + hn[f[:, 2]] * v)
            nh[(nh * n[ok]).sum(1) < 0] *= -1
            target[ok] = decode(sample_bilinear(high_normal, uvh), gu_h[hit_face[ok]], gv_h[hit_face[ok]], nh)
            drift_sum += float(np.abs(uvh - texel_uv[ok]).sum(1).sum())
        if (~ok).any():  # 투영 실패 텍셀: 같은 UV의 원본 노멀을 현재 모델 기준으로 해석
            target[~ok] = decode(sample_bilinear(high_normal, texel_uv[~ok]), gu_l[fl[~ok]], gv_l[fl[~ok]], n[~ok])
        out[yy, xx] = encode(target, gu_l[fl], gv_l[fl], n)
        stats['projected'] += int(ok.sum())
        print(f'  normal {min(s + 500000, len(ys))}/{len(ys)}', flush=True)
    stats['projectionFraction'] = stats['projected'] / max(1, stats['texels'])
    stats['uvDriftMean'] = drift_sum / max(1, stats['projected'])
    if stats['uvDriftMean'] > .01:
        print(f"  경고: 원본 UV와 현재 UV 차이 평균 {stats['uvDriftMean']:.4f}. OBJ v 뒤집기 규약을 확인하세요", flush=True)
    img = np.uint8(np.clip(np.round((pad(out, mask) + 1) * 127.5), 0, 255))
    return img, mask, (pos, smooth, mask), stats


def angle_error(a_rgb, b_rgb, mask):
    a = unit(a_rgb[mask].astype(np.float32) / 127.5 - 1); b = unit(b_rgb[mask].astype(np.float32) / 127.5 - 1)
    ang = np.degrees(np.arccos(np.clip((a * b).sum(1), -1, 1)))
    return dict(mean=float(ang.mean()), p95=float(np.quantile(ang, .95)))


def basisu(exe, src, dst, kind):
    flags = {'color': ['-q', '200', '-comp_level', '2'],
             'orm': ['-linear', '-q', '255', '-comp_level', '2'],
             'normal': ['-uastc', '-uastc_level', '2', '-uastc_rdo_l', '2.0', '-normal_map']}[kind]
    cmd = [str(exe), '-ktx2', '-mipmap', *flags, '-output_file', str(dst), str(src)]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source-root', type=Path)
    ap.add_argument('--basisu', type=Path, required=True)
    ap.add_argument('--out', type=Path, default=ROOT / 'models/hq')
    ap.add_argument('--size', type=int, default=4096)
    ap.add_argument('--normal-size', type=int, default=2048)
    ap.add_argument('--orm-size', type=int, default=2048)
    ap.add_argument('--normal-scale', type=float, default=.65, help='런타임 normalScale (manifest에 기록)')
    ap.add_argument('--reuse-stage1-orm', action='store_true', help='AO를 다시 굽지 않고 1단계 1K ORM을 확대 (빠름, 화질 낮음)')
    ap.add_argument('--self-test', action='store_true')
    args = ap.parse_args()
    if not args.self_test and not args.source_root:
        ap.error('--source-root가 필요합니다 (또는 --self-test)')
    if args.self_test:
        args.size = args.normal_size = args.orm_size = 2048
    args.out.mkdir(parents=True, exist_ok=True)
    work = args.out / '_work'; work.mkdir(exist_ok=True)
    manifest = dict(version=1, generated=time.strftime('%Y-%m-%dT%H:%M:%S%z'), size=args.size, normalSize=args.normal_size, ormSize=args.orm_size,
                    source='국립중앙박물관 공개 3D 스캔(공공누리 제1유형)에서 파생', statues=[])
    report = []
    for index, (side, number, stem, height) in enumerate(SIDES):
        t0 = time.perf_counter(); low = load_low(side)
        high, high_uv, high_color, high_normal, src_hash = load_high(args, low, number, stem, height)
        print(side, len(high.faces), 'source triangles', high_color.shape, high_normal.shape, flush=True)
        color = Image.fromarray(high_color).resize((args.size, args.size), Image.Resampling.LANCZOS)
        normal, mask, raster, nstats = bake_normal(low, high, high_uv, high_normal, args.normal_size)
        rec = dict(side=side, sourceSha256=src_hash, normal=nstats)
        if args.self_test:
            ref = np.asarray(Image.fromarray(high_normal).resize((args.normal_size, args.normal_size), Image.Resampling.BILINEAR))
            rec['selfTestAngleError'] = angle_error(normal, ref, mask)
            print('  self-test angle error', rec['selfTestAngleError'], flush=True)
        # ORM
        rgb = np.asarray(color.resize((args.orm_size, args.orm_size), Image.Resampling.LANCZOS), np.float32) / 255
        metal, rough, gold, patina = stage1.classify(rgb)
        if args.reuse_stage1_orm or args.self_test:
            orm1 = glb_image(low['data'], low['binary'], low['mat']['occlusionTexture']['index'])
            ao = np.asarray(orm1.resize((args.orm_size, args.orm_size), Image.Resampling.BILINEAR), np.float32)[..., 0] / 255
        else:
            pos, smooth, fid2 = rasterize(low['v'], low['n'], low['uv'], low['f'], args.orm_size)
            m = fid2 >= 0
            stage1.SIZE = args.orm_size  # bake_ao 출력 크기
            ao, astats = stage1.bake_ao(high, pos, smooth, m); rec['ao'] = astats
        orm = np.uint8(np.clip(np.stack([ao, rough, metal], -1) * 255, 0, 255))
        files = {}
        for kind, img in [('color', color), ('normal', Image.fromarray(normal)), ('orm', Image.fromarray(orm))]:
            png = work / f'{side}-{kind}.png'; img.save(png)
            tmp = work / f'{side}-{kind}.ktx2'; basisu(args.basisu, png, tmp, kind)
            digest = hashlib.sha256(tmp.read_bytes()).hexdigest()[:8]
            name = f'bangasayu-{side}-{kind}.{digest}.ktx2'; (args.out / name).write_bytes(tmp.read_bytes())
            files[kind] = dict(file=name, bytes=tmp.stat().st_size)
        manifest['statues'].append(dict(index=index, side=side, normalScale=args.normal_scale,
                                         aoIntensity=.8, **{k: v['file'] for k, v in files.items()},
                                         bytes=sum(v['bytes'] for v in files.values())))
        rec.update(files=files, seconds=time.perf_counter() - t0); report.append(rec)
        print(json.dumps(rec, ensure_ascii=False), flush=True)
    (args.out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (args.out / '_work' / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    total = sum(s['bytes'] for s in manifest['statues'])
    print('total bytes', total)
    if not args.self_test and total > 14_000_000:
        print('경고: 목표 14MB 초과. --size 또는 노멀 RDO(-uastc_rdo_l) 조정 필요', flush=True)


if __name__ == '__main__':
    main()
