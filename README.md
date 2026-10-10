![BCR Patent Scout — 동향 차트와 검색 결과 (실제 KIPRIS 데이터 200건, 다크 모드)](docs/screenshot-trends-real.jpg)

# BCR Patent Scout

BCR 제품(A100·A200·C100)의 기술 요소를 골라 KIPRIS 검색식을 만들고, 유사 특허를 모아 AI로 비교·평가한 뒤, 연구개발형·기술기획형·사업전략형 보고서 초안을 근거와 함께 내는 사내 MVP 앱입니다.
설계 기준: **BCR-PATENT-SCOUT-SPEC v1.0** (`D44 SPEC BCR IP SEARCH MVP KIPRIS.md`).

> 이 앱의 보고서는 **AI 초안**입니다. 침해·유효성·권리범위는 판단하지 않으며, 필요한 경우 변리사 검토가 필요합니다.

## 지금 상태

| 단계 | 상태 |
|---|---|
| M1 검색 (조사·키워드·검색식·수집·결과·동향) | 구현, 가상 데이터로 시험 |
| M2 유사성 (상세·AI 평가·근거 검증·매트릭스·확정) | 구현, **실제 AI(Anthropic)로 6건 시험** → [docs/ai-quality.md](docs/ai-quality.md) |
| M3 보고서 (3유형·자동 검증·버전·다운로드) | 구현, 연구개발형은 실제 AI로 1회 시험 (나머지 2유형은 가짜 AI로만) |
| M4 배포 (접근 코드·한도·health) | 코드 구현. **Vercel·Neon에는 배포하지 않았음** |
| M0 Spike | 6/8 확인 (S6·S7 미확인) → [docs/spike.md](docs/spike.md) |

KIPRIS(검색·상세·권리 현황)와 Anthropic AI는 실제 호출로 확인했습니다. **OpenAI는 `OPENAI_MODEL`이 비어 있어 시험하지 않았습니다.**

## 2차 작업 (2026-10-10 오후)

**추가한 기능**
- **한 번에 20건씩 + "더 보기"**: 무료 호출 한도를 아끼려고 검색식 하나당 처음 20건만 가져오고, 검색 결과 화면의 "더 보기 (+20)"를 눌러야 다음 20건을 가져옵니다 (검색식당 총 200건까지). 검색식별 전체 건수·누적 수집·더 있음 상태를 보여 줍니다.
- **유력한 IPC로 좁히기**: 요소별 기본 IPC를 실제 KIPRIS 건수로 다시 정했습니다 (예: 브레이크 `F16D` 1,893건 → `B25J 19` 74건). 검색식 표에서 IPC 후보 칩을 눌러 바꿀 수 있습니다. 근거: [docs/spike.md](docs/spike.md)
- **권리 현황 (KIPRIS 데이터 상품 16번 법적 상태 이력 + 17번 등록사항)**: 검색 결과·유사성 평가 화면에서 특허별로 조회합니다. 등록번호·등록일·존속기간 만료 예정일·권리자·연차료 납부 연차·법적 상태 이벤트를 보여 주고(7일 캐시), 조회해 둔 특허의 요약은 보고서 입력에 사실로 실립니다. 권리 판단은 하지 않습니다.
- **실제 AI 연결**: `LLM_PROVIDER=anthropic`으로 유사성 평가와 보고서를 시험했습니다.

**이번에 고친 오류**

| 문제 | 원인 | 수정 |
|---|---|---|
| 실제 AI 응답의 JSON 오류로 평가가 500으로 종료 | JSON 파싱 실패가 "한 번 재요청" 경로를 타지 않음 | 파싱 실패도 오류 내용을 붙여 한 번 재요청, 프롬프트에 큰따옴표 규칙 추가 |
| 자동차 브레이크 캘리퍼를 종합 `보통`으로 평가 | 대상 제품 종류가 다를 때의 규칙 없음 | 종류가 다르면 `low`로 하는 규칙 추가 (재시험 확인) |
| 평가 5건이 약 90초 | 출력이 길고 모델 속도 | 평가 묶음을 3건으로, 답변 길이 제한, 함수 한도 180초 |
| 보고서 본문에 입력 필드 이름 노출 | 프롬프트에 금지 규칙 없음 | 필드명 사용 금지 규칙 추가 |
| 기본 검색식이 0~4건으로 너무 좁음 | 제목+요약+IPC를 모두 걸었음 | 제목 키워드를 기본에서 빼고 IPC를 실측으로 재선정 |
| `.env`에 Neon `DATABASE_URL`이 들어오자 비어 있는 Neon으로 붙어 "relation does not exist" | 로컬이 `.env`의 DB를 그대로 사용 | `.env.local`에서 `DATABASE_URL=`을 비워 로컬 DB를 쓰도록 함. Neon을 쓰려면 `npm run db:migrate`가 먼저 필요 |

**남은 것**
- OpenAI 어댑터 실제 호출, Neon 연결(마이그레이션 001·002), Vercel 배포는 아직 안 했습니다. Neon에 쓰기 전에 의도를 확인하려고 개발 서버는 로컬 DB를 쓰게 두었습니다.
- 평가·보고서의 사람 기준 정확도는 전문가 검토가 필요합니다 ([docs/ai-quality.md](docs/ai-quality.md)).
- 법적 상태 이벤트 코드의 뜻은 확인하지 못해 코드를 그대로 보여 줍니다. 등록사항·법적 상태 API는 공식 명세서가 아니라 공개 구현 사례와 실제 응답으로 확인했습니다.
- 검색·상세 API의 무료 한도(S6), 결과 보관 약관(S7)은 여전히 미확인입니다.

## 1차 작업 요약 (2026-10-10 오전)

기술명세서(BCR-PATENT-SCOUT-SPEC v1.0)를 바탕으로 MVP 앱을 처음부터 만들고, 가상 KIPRIS 응답과 가짜 LLM으로 전체 흐름을 시험했습니다.

**만든 것**
- React + Vite 화면 6개: 조사 목록, 새 조사, 키워드 조합, 검색 결과(동향 차트 3종·필터·핀 고정), 유사성 평가(특허 × 기술 요소 매트릭스), 보고서(미리보기·검증 경고·버전·`.md` 다운로드)
- Vercel Functions 서버 API 10개 (`api/`, 권리 현황 포함): 조사, 검색, 상세, 집계, 유사성 평가, 보고서 생성·관리, 접근 코드, health
- 4.4 `kipris-tool`의 클라이언트·XML 파서·집계를 `server/kipris/`로 이식
- LLM 공급자 어댑터(Anthropic · OpenAI · mock), 프롬프트 5종
- 자동 검증: 평가 근거 문장의 원문 실재 확인, 보고서의 출원번호·수치·금지 표현·머리말·초안 표시
- 접근 코드 쿠키, 하루 호출 한도, 키 마스킹, 빌드 결과물 키 검사(`npm run check:bundle`)
- 로컬은 PGlite, 배포는 Neon으로 같은 SQL(`db/migrations/001_init.sql`)
- 시험 70개 (`npm test`)와 API 전체 흐름 스모크(`scripts/smoke.mjs`)

## 오류 수정 · 개선 기록

| 문제 | 원인 | 수정 |
|---|---|---|
| 수집이 한도에서 멈추지 않았는데도 "200건에서 잘림"으로 표시됨 | `truncated`를 `전체 건수 > 받은 건수`로 계산해, 한 페이지만 받아도 잘림으로 보임 | 수집 한도(max)에 도달했고 전체 건수가 더 많을 때만 잘림으로 표시 (`shared/queries.js`의 `runSummary`, 단위 시험 추가) |
| `npm audit`에 react-router 보안 경고 2건 (보통) | `react-router-dom@6`의 알려진 취약점 | `react-router-dom@7`로 올림. 경고 0건, 빌드·시험 통과 |
| `.env.local`의 줄 끝 주석이 단순 파서(`scripts/migrate.mjs`)에서 값에 섞일 수 있음 | `KIPRIS_MOCK=1   # ...` 형태 | 주석을 별도 줄로 분리 |
| 시험 파일 구문 오류로 시험 1개 파일이 실행되지 않음 (`tests/llm.test.js`) | `vi.fn(...)` 닫는 괄호 누락 | 괄호 수정 후 70개 전부 통과 |
| 시험이 개발용 DB(`.data/`)를 건드릴 수 있음 | PGlite 저장 위치 고정 | `PGLITE_DIR=memory`로 시험은 메모리 DB 사용 |
| 실제 키가 있어도 mock이 켜져 있으면 가상 응답이 나옴 | `.env.local`이 `.env`보다 우선 | 실제 키 확인 때는 `KIPRIS_MOCK` 줄을 주석 처리, 시연 때는 켬 |

## 알려진 문제

- **실제 KIPRIS 검색은 확인했습니다(2026-10-10).** 처음 인증 오류 31은 키 문제가 아니라 KIPRIS Plus의 "특허·실용 공개·등록공보" 등 데이터 상품 신청을 거치지 않아서였고, 신청 승인 뒤 정상 동작합니다. 개발 중 기본은 가상 응답(`KIPRIS_MOCK=1`)이며, 실제 호출은 `.env.local`의 해당 줄을 주석 처리하면 됩니다.
- M0 Spike 8개 중 6개를 실측으로 확인했고, **S6(무료 호출 한도), S7(결과 보관 약관)은 아직 미확인**입니다 → [docs/spike.md](docs/spike.md)
- OpenAI 어댑터는 실제 호출을 시험하지 않았고, Neon 연결과 Vercel 배포도 하지 않았습니다.
- 가상 응답은 검색식이 달라도 같은 데모 특허 3건을 돌려줍니다. 건수와 차트는 형태 확인용입니다.

## 화면

| 실제 KIPRIS 데이터 (위 이미지) | 가상 응답(MOCK)으로 만든 첫 시연 화면 |
|---|---|
| 검색식 수집 200건의 연도별·출원인·IPC 동향. 최근 2개 연도(\*)는 18개월 공개 지연 표시 | ![검색 결과 화면 (가상 데이터)](docs/screenshot-results.jpg) |

## 로컬에서 실행

Node 20.10 이상.

```bash
npm install
npm run dev          # http://localhost:5173  (프런트 + /api 를 한 프로세스로)
npm test             # vitest 92개
npm run build && npm run check:bundle   # 빌드 결과물에 키 문자열이 없는지 (AT-9)
```

`.env.local`(저장소에는 올라가지 않음)에 `KIPRIS_MOCK=1`, `LLM_PROVIDER=mock`을 두면 키 없이 전체 흐름을 볼 수 있습니다. 실제 키는 `.env`에 둡니다. 화면 위에 노란 띠로 MOCK 상태가 표시되며, **가상 결과는 보고서에 인용하면 안 됩니다.**
DB는 `DATABASE_URL`이 없으면 프로세스 안의 PGlite(`.data/pglite`)를 쓰고 처음 열 때 자동으로 마이그레이션합니다.

실제 키로 쓰려면 `.env.local`에서 mock 두 줄을 지우고 `.env.example`의 이름대로 값을 넣습니다. **키는 서버 환경변수로만 두고 `VITE_` 접두어를 절대 붙이지 않습니다.**

```bash
node scripts/smoke.mjs http://localhost:5173   # API 전체 흐름 한 번 훑기 (mock 상태의 서버에서)
```

## 구조

| 위치 | 역할 |
|---|---|
| `src/` | React 화면 (조사 목록·새 조사·키워드·결과·유사성·보고서) |
| `api/*.js` | Vercel Functions. 요청 하나 = 작업 하나 (검색식 1개, 평가 특허 5건, 보고서 1회) |
| `server/kipris/` | 4.4 `kipris-tool`에서 이식한 클라이언트·XML 파서·집계 (이름만 `.js`로, 내용 그대로) |
| `server/llm/` | 공급자 어댑터 `generate()` — anthropic · openai · mock |
| `server/prompts/` | 공통 규칙, 유사성 평가, 보고서 3종 프롬프트 |
| `server/report.js` | 머리말 조립(서버가 직접), 자동 검증 5종 |
| `server/similarity.js` | 근거 문장이 원문에 실재하는지 검증 |
| `shared/` | 브라우저와 서버가 같이 쓰는 검색식 생성 규칙·상수 |
| `data/product-features.json` | 제품 기술 요소 카탈로그 (명세 5.2) |
| `db/migrations/001_init.sql` | 스키마 (명세 6장) |

## 명세와 다르게 한 곳

| 항목 | 이유 |
|---|---|
| 보고서 머리말을 AI가 아니라 서버가 데이터로 만든다 | 검색식 표·건수·수집일을 AI가 바꾸지 못하게 하려고. AI는 본문 4절만 쓴다 |
| `GET /api/projects?id=&action=patents` 추가 | 결과 화면이 수집된 특허 목록을 읽을 곳이 명세에 없었음 |
| `PATCH /api/reports`에 `ackWarning` 추가 | 승인 전에 경고를 하나씩 "확인함"으로 처리하는 요건(명세 7.4)을 위해 |
| 기본 검색식에서 **제목 키워드를 뺌** (요약 + IPC만) | 실측에서 제목+요약+IPC를 모두 걸면 0~4건으로 너무 좁았음(S2·S3). 화면에서 켤 수 있음 |
| `KIPRIS_MOCK`, `LLM_PROVIDER=mock`, 접근 코드 없는 로컬 개발 모드 | 키 없이 흐름을 시험하려고. 운영(`VERCEL_ENV=production`)에서는 접근 코드·세션 비밀이 없으면 막힘 |
| 카탈로그의 A100·C100 제품 이름 | 명세에 이름이 없어 기술 요소에서 붙임 (`BCR-A100` 소형·경량 로봇 관절용 액추에이터, `BCR-C100` 다축 로봇 제어기). 연구개발팀이 확인 |

## 수용 시나리오(13.1) 확인 상태

| # | 시나리오 | 상태 | 근거 |
|---|---|---|---|
| AT-1 | A200 · [감속기, 브레이크] → 검색식 3개 | 통과 | `tests/queries.test.js`, 화면에서 직접 확인 |
| AT-2 | 300 초과 경고 · 200건에서 멈춤 · `truncated` | 부분 | 판단·요약 함수는 단위 시험. 화면 경고는 가상 응답(5건)이라 직접 못 봄 |
| AT-3 | 핀 5건 평가 → 근거·출처 | 통과(가짜 AI) | `tests/api.test.js`. **실제 AI 품질은 미확인** |
| AT-4 | 원문에 없는 근거 → 불명 + 근거 미확인 | 통과 | `tests/similarity.test.js` |
| AT-5 | 연구개발형 보고서 | 통과(가짜 AI) | 머리말 7항목·첫 줄 표시 시험. **실제 AI 본문 품질은 미확인** |
| AT-6 | 조사에 없는 출원번호 → 경고, 승인 전 확인 | 통과 | `tests/report.test.js`, `tests/api.test.js` |
| AT-7 | `LLM_PROVIDER` 전환 | 부분 | 어댑터를 fetch 대체로 시험. 실제 OpenAI 호출은 안 해 봄 |
| AT-8 | 키 미설정 → health `not_configured`, 검색 503 | 통과 | `tests/api.test.js`. 화면의 버튼 비활성은 코드만 작성 |
| AT-9 | 번들에 키 문자열 없음 | 통과 | `npm run check:bundle` (심어 둔 누출을 잡는 것도 확인) |

## 배포 (명세 12장 요약)

1. GitHub 비공개 저장소 → Vercel에서 가져오기(Vite).
2. Vercel Marketplace에서 Neon 연결 → `DATABASE_URL`. 처음 한 번 `npm run db:migrate`.
3. 환경변수 등록(`.env.example`). `APP_ACCESS_CODE`, `APP_SESSION_SECRET`은 운영에서 필수.
4. 배포 후 `/api/health`로 DB·KIPRIS·LLM 설정을 확인하고, **먼저 [docs/spike.md](docs/spike.md)를 채웁니다.**
