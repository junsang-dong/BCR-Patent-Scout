// 수용 시나리오 AT-1/3/5 를 API로 한 번 훑는 스모크 테스트. 사용법: node scripts/smoke.mjs http://localhost:5173
// KIPRIS_MOCK=1, LLM_PROVIDER=mock 으로 띄운 서버에서 쓴다 (결과는 가상 데이터).
import { generateQueries } from "../shared/queries.js";
import catalog from "../data/product-features.json" with { type: "json" };

const base = process.argv[2] ?? "http://localhost:5173";
let cookie = "";
async function api(method, path, body) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${j.error?.code}: ${j.error?.message}`);
  return j;
}
const step = (n, v) => console.log(`✓ ${n}`, v ?? "");

const health = await api("GET", "/api/health");
step("health", JSON.stringify(health));

const p = await api("POST", "/api/projects", { title: "스모크: A200 감속기×브레이크", productCode: "BCR-A200", researchType: "rnd" });
step("조사 생성", p.id);

const featureIds = ["A200-REDUCER", "A200-BRAKE"];
const { queries } = generateQueries({ catalog, productCode: "BCR-A200", featureIds });
step("검색식 생성 (AT-1: 3개)", queries.map(q => q.name).join(", "));
if (queries.length !== 3) throw new Error("검색식이 3개가 아닙니다.");
await api("POST", `/api/projects?id=${p.id}&action=keywords`, { featureIds, queries });

for (const q of queries) {
  const pre = await api("POST", "/api/kipris-search", { projectId: p.id, query: q, preview: true });
  const run = await api("POST", "/api/kipris-search", { projectId: p.id, query: q });
  step(`검색 ${q.name}`, `미리보기 ${pre.totalCount}건 → 수집 ${run.fetched}, 보관 ${run.kept}, 잘림 ${run.truncated}`);
}

const list = await api("GET", `/api/projects?id=${p.id}&action=patents`);
step("중복 제거된 특허", `${list.length}건`);
const stats = await api("GET", `/api/stats?projectId=${p.id}`);
step("동향 집계", `${stats.total_records}건, 출원인 ${stats.top_applicants.length}곳`);

const pins = list.slice(0, 5).map(x => x.applicationNumber);
for (const n of pins) await api("PATCH", `/api/projects?id=${p.id}&action=pin`, { applicationNumber: n, pinned: true });
step("핀 고정", pins.length + "건");

const sim = await api("POST", "/api/analyze-similarity", { projectId: p.id, applicationNumbers: pins });
const cells = sim.results.flatMap(r => r.features);
const withEv = cells.filter(c => c.match === "match" || c.match === "partial");
step("유사성 평가 (AT-3)", `${sim.results.length}건, 근거 있는 셀 ${withEv.length}, 근거 미확인 ${cells.filter(c => c.evidence_unverified).length}`);

for (const type of ["rnd", "planning", "strategy"]) {
  const r = await api("POST", "/api/report-generate", { projectId: p.id, researchType: type });
  const rep = await api("GET", `/api/reports?id=${r.reportId}`);
  const first = rep.markdown.split("\n")[0];
  step(`보고서 ${type} v${r.version}`, `첫 줄 "${first}", 경고 ${r.validation.warning_count}건`);
  if (first !== "AI 초안 — 검토 전") throw new Error("첫 줄 표시가 없습니다.");
  if (rep.validation.warnings.length) console.log("   경고:", rep.validation.warnings.map(w => w.message).join(" / "));
}
console.log("\n스모크 통과 — 프로젝트", p.id);
