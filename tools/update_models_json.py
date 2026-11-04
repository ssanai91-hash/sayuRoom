"""models/*.glb를 바꾼 뒤 실행: models/models.json의 크기·SHA-256을 갱신한다.
앱은 이 해시를 주소(?v=)에 붙여 기기 보관함·브라우저 캐시를 1년간 쓰므로, 갱신을 빠뜨리면
방문자에게 옛 모델이 계속 보인다."""
import hashlib, json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
out = []
for side in ['left', 'right']:
    f = root / f'models/bangasayu-{side}.glb'; d = f.read_bytes()
    out.append(dict(side=side, file=f.name, bytes=len(d), sha256=hashlib.sha256(d).hexdigest()))
(root / 'models/models.json').write_text(json.dumps(dict(version=1, note='GLB를 바꾸면 python3 tools/update_models_json.py 를 실행해 해시를 갱신한다', statues=out), ensure_ascii=False, indent=2) + '\n')
print(json.dumps(out, indent=2))
