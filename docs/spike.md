# M0 Spike 기록 (명세 10.2)

> **상태: 아직 하나도 확인하지 못했습니다.** 이 항목들은 실제 KIPRIS 키(서비스 승인 상태), 실제 LLM 키, Vercel 배포가 있어야 확인할 수 있습니다.
> 구현 중에는 가상 KIPRIS 응답(`KIPRIS_MOCK=1`)과 가짜 LLM(`LLM_PROVIDER=mock`)으로 흐름만 시험했습니다. 아래 "코드의 현재 가정"은 확인 전의 임시 가정입니다.
> 확인하면 이 표의 "결과"와 "확인일"을 채우세요.

| # | 확인 항목 | 코드의 현재 가정 | 확인 방법 | 결과 | 확인일 |
|---|---|---|---|---|---|
| S1 | 발급 키가 통하는 게이트웨이 | `KIPRIS_GATEWAY=auto`: kipo 먼저, 인증 오류면 openapi로 전환하고 `app_settings.kipris_gateway`에 기록 | 4.4 `kipris-tool ping` 또는 앱 `/api/kipris-search`(preview) 한 번 | | |
| S2 | `ipcNumber`에 서브클래스(`B25J`)만 넣어도 검색되는지 | 검색식에 `F16H`, `B25J` 같은 서브클래스를 그대로 넣음 | 건수 미리보기에서 0건이면 `--word`(키워드만)로 비교 | | |
| S3 | 한 항목에 여러 단어를 넣을 때 AND/OR | 안전하게 키워드 **1개씩**만 넣음. 교차 검색식만 공백으로 두 단어를 합침 | 같은 항목에 `파동기어`, `파동기어 브레이크`를 넣어 건수 비교 | | |
| S4 | 출원일 범위 파라미터 형식 | 지원 안 한다고 보고, 받아온 뒤 출원연도로 거름(`yearFilter`) | KIPRIS Plus 명세서 확인. 지원하면 `toKiprisQuery`에 추가 | | |
| S5 | `https` 접속 가능 여부 | `KIPRIS_SCHEME=http`(기본) | `KIPRIS_SCHEME=https`로 건수 미리보기 | | |
| S6 | 개발 단계 무료 호출 한도 | `KIPRIS_DAILY_LIMIT=300`(검색·상세 요청 합산) | KIPRIS Plus 서비스 수수료 안내 | | |
| S7 | 결과의 DB 보관·사내 공유가 이용약관 범위인지 | 서지 정보를 `patents`·`patent_details`에 캐시하고 조사 간 공유 | KIPRIS Plus 이용약관 | | |
| S8 | Vercel 함수에서 KIPRIS까지의 응답 시간 | 검색 60초, 평가 90초, 보고서 120초 | 배포 후 검색식 하나(200건) 수집 시간 측정 | | |

## 추가로 확인할 것 (명세에 없던 항목)

| 항목 | 이유 |
|---|---|
| OpenAI 어댑터 요청 형식과 `OPENAI_MODEL` | 어댑터(`server/llm/openai.js`)는 공식 문서를 열람하지 못한 채 알려진 Chat Completions 형식으로 썼고, 실제 호출을 시험하지 않았습니다. |
| Anthropic `ANTHROPIC_MODEL` 값 | 명세 예시(`claude-sonnet-5-5`)를 `.env.example`에 넣었을 뿐 실제 호출은 시험하지 않았습니다. |
| Neon 연결 (`@neondatabase/serverless` `sql.query`) | 로컬은 PGlite로 시험했고 Neon은 연결하지 않았습니다. 첫 배포 때 `npm run db:migrate`와 `/api/health`로 확인합니다. |
| 키 값이 이미 percent-encoding인 경우 | `normalizeKey`가 한 번 풀어 줍니다(4.4 테스트로 검증됨). 실제 키로 한 번 더 확인합니다. |
