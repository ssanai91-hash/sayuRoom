# 사유의 방 작업 지침

- 이 저장소는 `ssanai91-hash/sayuRoom`이다. 사유의 방만 구현하며 `MemoryGarden` 정원·서버·배포 설정은 변경하지 않는다.
- `HANDOFF.md`와 `README.md`를 먼저 읽는다. 앱 파일과 `models/`는 저장소 최상위에 있다.
- 일반 구현·수정은 `main`에 직접 커밋하고 반영한다. 작업 전 `git pull --rebase origin main`을 수행한다. 별도 요청 없이 브랜치를 만들지 않는다.
- 소스는 비공개로 유지한다. 공개 전환이나 외부 공유는 별도 요청이 필요하다.
- 구현·커밋·배포 요청은 GitHub main 반영을 기준으로 한다. Cloudflare 직접 배포는 명시적으로 요청받은 경우에만 실행한다. 기본적으로 수동 빌드·배포와 화면 검증은 사용자가 담당한다.
- 사용자가 검증을 직접 맡기로 했다. 별도로 요청받지 않으면 자동 검사·테스트·브라우저 실행·화면 검증을 하지 않고 구현·커밋 결과를 전달한다.
- 자동 배포 연결이나 배포 워크플로를 임의로 만들거나 변경하지 않는다. 기존 연결에 따라 main 반영이 빌드를 유발할 수 있음을 구분한다.
- 빌드 생략을 유발하는 커밋 메시지 표시는 넣지 않는다. 한국어로 변경 내용을 설명하고, 완료 시 최종 main의 짧은 SHA와 GitHub 링크를 안내한다.
- 커밋할 때마다 해당 커밋 링크와 접속 링크 `https://sayuroom.ajit-worker.workers.dev/`를 함께 전달한다. GitHub 반영과 실제 배포 상태를 구분한다.
- 외부 라이브러리는 cdnjs 고정 버전을 사용한다. 모델 출처와 이용조건은 `models/SOURCES.md`에 유지한다. 새 의식은 제안 후 사용자가 결정한다.
- Cloudflare Worker 이름은 `sayuroom`이다 (대시보드 Worker 이름과 일치해야 GitHub 연결 빌드가 이 주소로 배포됨). 배포 루트는 이 저장소 최상위이며 `npx wrangler deploy`로 최상위 `wrangler.toml`을 사용한다.
- 예외: KTX2 로더(three.js r128 KTX2Loader를 전역 THREE용으로 묶은 번들)와 Basis 트랜스코더는 `vendor/three-r128/`에서 자체 제공한다(MIT, LICENSE 동봉). 재생성은 `tools/stage2/ktx2-bundle/`. 바꿀 때는 폴더 이름을 바꾼다(1년 캐시).

- main에 반영할 때마다 대문 HTML의 `.gate-version` 번호를 직전 공개 번호에서 한 칸 올린다(여러 커밋을 한 번에 올리면 마지막 커밋에서 한 번). `ver 0.1`, `ver 0.2`, …, `ver 0.9`, `ver 0.10` 순서다. 완료 보고에는 대문 표시와 같은 버전, 짧은 SHA, 접속 링크를 함께 적는다.
- 불상 GLB(`models/bangasayu-*.glb`)를 바꾸면 반드시 `python3 tools/update_models_json.py`로 `models/models.json` 해시를 갱신해 같은 커밋에 넣는다. 앱은 이 해시로 기기 보관함·1년 캐시를 쓰므로 빠뜨리면 방문자에게 옛 모델이 남는다.
