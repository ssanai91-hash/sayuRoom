# 사유의 방 · sayuRoom

정원과 연결하지 않는 독립 명상 공간이다. 정원 입구, 방 서버, 접속 상태, 저장 자료를 공유하지 않는다. 저장소 최상위의 `index.html`이 첫 화면이다.

저장소: https://github.com/ssanai91-hash/sayuRoom (비공개). `MemoryGarden`의 `880ab27`에 있던 `sayu-room/`을 2026-11-04 별도 저장소로 이전했다. 앱 코드와 두 GLB는 원본 바이트를 보존했다.

## 별도 Cloudflare 프로젝트 설정

- 프로젝트/Worker 이름: `sayuroom` (주소 https://sayuroom.ajit-worker.workers.dev)
- GitHub 저장소: `ssanai91-hash/sayuRoom`
- 브랜치: `main`
- 루트 디렉터리: 저장소 최상위 (`/`, 별도 하위 폴더 지정 없음)
- 빌드 명령: 없음 (정적 HTML)
- 정적 자산 디렉터리: `.`
- 배포 명령: `npx wrangler deploy`
- 설정 파일: 최상위 `wrangler.toml`

GitHub 저장소 이름은 `sayuRoom`, Cloudflare Worker 이름은 소문자 `sayuroom`이다. `wrangler.toml`의 `name`이 대시보드 Worker 이름과 다르면 빌드가 실패하거나 다른 Worker로 배포된다.

기존 `MemoryGarden`의 정원 배포 설정과 자동 배포 연결은 변경하지 않는다. 이 저장소에는 정원 서버·자산을 포함하지 않는다. 실제 독립 주소는 별도 프로젝트를 배포한 뒤 확정한다. 기존 정원 주소의 `/sayu-room/`은 이 독립 사이트의 주소가 아니다. GitHub 반영과 실제 Cloudflare 배포는 별도 단계다.

불상 출처와 이용조건: `models/SOURCES.md`. 내장 무압축 GLB 전용 로더는 이 두 모델의 패킹 구조만 지원한다. 새로운 GLB로 교체할 때 구조 검증이 필요하다.
