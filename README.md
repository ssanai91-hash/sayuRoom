# 사유의 방 · sayuRoom

정원과 연결하지 않는 독립 명상 공간이다. 정원 입구, 방 서버, 접속 상태, 저장 자료를 공유하지 않는다. 저장소 최상위의 `index.html`이 첫 화면이다.

저장소: https://github.com/ssanai91-hash/sayuRoom (비공개). `MemoryGarden`의 `880ab27`에 있던 `sayu-room/`을 2026-11-04 별도 저장소로 이전했다. 앱 코드와 두 GLB는 원본 바이트를 보존했다.

## 별도 Cloudflare 프로젝트 설정

- 프로젝트/Worker 이름: `sayuroom` (주소 https://sayuroom.ajit-worker.workers.dev)
- GitHub 저장소: `ssanai91-hash/sayuRoom`
- 브랜치: `main`
- 루트 디렉터리: 저장소 최상위 (`/`, 별도 하위 폴더 지정 없음)
- 구성: 정적 HTML·모델 + Cloudflare Worker + SQLite Durable Object
- Worker 진입점: `worker/index.js`
- 정적 자산: `[assets] directory = "."`, `binding = "ASSETS"`; `/api/*`만 Worker 우선 실행
- 접속자 방: `PRESENCE` 바인딩 / `SayuPresence` 클래스 / 고정 이름 `sayu-room-main`
- 첫 Durable Object 마이그레이션: `v1`, `new_sqlite_classes = ["SayuPresence"]` (무료 요금제 지원)
- 배포 명령: `npx wrangler deploy`
- 설정 파일: 최상위 `wrangler.toml`

GitHub 저장소 이름은 `sayuRoom`, Cloudflare Worker 이름은 소문자 `sayuroom`이다. `wrangler.toml`의 `name`이 대시보드 Worker 이름과 다르면 빌드가 실패하거나 다른 Worker로 배포된다.

기존 `MemoryGarden`의 정원 배포 설정과 자동 배포 연결은 변경하지 않는다. 이 저장소에는 정원 서버·자산을 포함하지 않는다. 기존 정원 주소의 `/sayu-room/`은 이 독립 사이트의 주소가 아니다. GitHub 반영과 실제 Cloudflare 배포는 별도 단계다.

불상 출처와 이용조건: `models/SOURCES.md`. 내장 무압축 GLB 전용 로더는 이 두 모델의 패킹 구조만 지원한다. 새로운 GLB로 교체할 때 구조 검증이 필요하다.


## 실시간 머무는 사람 수

입장 버튼을 누른 탭만 같은 출처의 `/api/presence` WebSocket에 연결한다. 방은 하나이며 본인을 포함한 현재 연결 수를 `{"count":N}`으로 모든 연결에 보낸다. 대문에서 기다리는 탭은 세지 않는다. 명상·절하기 동안에도 연결은 유지하고 기존 화면 규칙에 따라 표시만 숨긴다.

- 클라이언트는 탭마다 무작위 128비트 ID를 만든다. 새로고침 시 같은 탭 ID를 재사용해 이전 연결을 닫은 뒤 교체하므로 중복 인원이 늘지 않는다. ID는 URL 쿼리 대신 WebSocket 프로토콜 헤더로 전송하며, 서버에서는 연결이 살아 있는 동안의 Hibernation 태그로만 사용한다. DB·로그에 기록하지 않고 연결 종료 시 사라진다. 브라우저의 탭 전용 sessionStorage에는 재연결용 무작위 ID만 둔다.
- 이름·위치·IP·기기 정보를 읽거나 저장하지 않는다. 서버 데이터 메시지는 count 하나이며, 클라이언트 데이터 메시지는 25초 간격의 `ping`뿐이다. `pong`은 Hibernation 자동 응답으로 처리한다. 접속 기록·방문자 목록·누적 통계는 없다. Durable Object 저장소는 알람 예약에만 사용한다.
- 정리 알람은 최대 60초 간격이며, 마지막 ping 이후 75초 만료가 더 빠르면 그 시점으로 앞당긴다. 닫는 중인 WebSocket은 즉시 인원수에서 제외한다. 최대 300연결이며 301번째 새 탭은 거절한다. 같은 탭 교체는 300명이어도 허용한다. IP를 저장하지 않는 전체 방 상한이다.
- 앱 전환·화면 끄기가 30초 이어지면 연결을 닫고, 돌아오면 다시 연결한다. 재연결 간격은 2→4→8→16→30초이며, 끊긴 동안 마지막 숫자를 유지한다. 서버 없는 미리보기는 본인 1명을 표시한다.
- `/api/presence` 외의 요청은 기존 ASSETS 서비스로 전달하고 `_headers`를 그대로 적용한다. `worker/`는 `.assetsignore`로 정적 자산에서 제외한다.

배포 명령은 기존과 같은 `npx wrangler deploy`다. 이 변경의 GitHub 반영과 Cloudflare 실제 배포는 별도이며, 이번 작업에서는 직접 배포하지 않는다. 로컬 확인은 `npx wrangler dev`로 실행해 세 탭 입장·닫기·새로고침과 네트워크 단절을 확인한다.

### 이번 변경의 로컬 확인

Wrangler 4.157.0 `dev --local`에서 실제 WebSocket 3연결의 1→2→3, 종료 후 2, 같은 탭 ID 교체 시 3 초과 없음, 자동 pong, 닫힘 통보 없는 무통신 연결의 74,966ms 후 제거를 확인했다. 300연결 상한·301번째 거절·300명 상태의 동일 탭 교체도 확인했다. index.html은 기존 재검증 캐시, GLB·KTX2는 1년 immutable, models.json은 no-cache이며 worker 소스 요청은 404였다.

별도 시간 제어 검사에서 재연결 간격·30초 숨김/복귀·이전 숫자 유지·대문 연결 제외·새로고침 ID 유지·새 탭 ID 분리 및 문법 검사를 통과했다. 브라우저 미리보기 환경이 연결되지 않아 실제 브라우저 3탭·휴대폰 비행기 모드·시각 전환 검증은 수행하지 못했다. 위 WebSocket 통신 검사와 구분하며, Cloudflare 직접 배포는 하지 않았다. Cloudflare 알람은 플랫폼 상황에 따라 지연될 수 있으므로 모든 네트워크·장애에서 정확히 75초 이내 제거를 보장하지는 않는다.
