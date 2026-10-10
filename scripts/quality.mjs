// 실제 KIPRIS + 실제 AI로 평가·보고서 품질을 한 번 훑는 스크립트. 사용법: node scripts/quality.mjs http://localhost:5173
// 호출: 검색 2회(+상세 최대 6회) + AI 평가 2회 + 보고서 1회. 키는 서버가 읽으며 이 스크립트는 다루지 않는다.
import { generateQueries } from "../shared/queries.js";
import { rankByOverlap } from "../server/similarity.js";
import catalog from "../data/product-features.json" with { type: "json" };

const base = process.argv[2] ?? "http://localhost:5173";
async function api(method, path, body) {
  const t0 = Date.now();
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${j.error?.code}: ${j.error?.message}`);
  j._ms = Date.now() - t0;
  return j;
}
const featureIds = ["A200-STRUCT", "A200-REDUCER", "A200-ENCODER", "A200-BRAKE"];
const features = catalog.products[0].features.filter(f => featureIds.includes(f.id));

const p = await api("POST", "/api/projects", { title: "품질 확인: A200 일체형 관절 (실제 KIPRIS + 실제 AI)", productCode: "BCR-A200", researchType: "rnd" });
const { queries } = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["A200-STRUCT", "A200-REDUCER"], options: { max: 100 } });
await api("POST", `/api/projects?id=${p.id}&action=keywords`, { featureIds, queries: queries.map(q => ({ ...q, max: 100 })) });
for (const q of queries) { const r = await api("POST", "/api/kipris-search", { projectId: p.id, query: { ...q, max: 100 } }); console.log(`검색 ${q.name}: 전체 ${r.totalCount} · 수집 ${r.fetched} (${r._ms}ms)`); }

const list = await api("GET", `/api/projects?id=${p.id}&action=patents`);
const top = rankByOverlap(list, features).slice(0, 6);
for (const t of top) await api("PATCH", `/api/projects?id=${p.id}&action=pin`, { applicationNumber: t.applicationNumber, pinned: true });
console.log(`\n핀 ${top.length}건:`); top.forEach(t => console.log(" ", t.applicationNumber, "|", t.applicantName, "|", t.inventionTitle));

const nums = top.map(t => t.applicationNumber);
const results = [];
let usage = { input: 0, output: 0 }, ms = 0;
for (let i = 0; i < nums.length; i += 5) {
  const r = await api("POST", "/api/analyze-similarity", { projectId: p.id, applicationNumbers: nums.slice(i, i + 5) });
  results.push(...r.results); usage.input += r.usage.input; usage.output += r.usage.output; ms += r._ms;
  console.log(`\n평가 호출 ${i / 5 + 1}: ${r.results.length}건 · ${r.provider}/${r.model} · 입력 ${r.usage.input} 출력 ${r.usage.output}토큰 · ${r._ms}ms`);
}
const sym = { match: "일치", partial: "부분", none: "없음", unclear: "불명" };
let checked = 0, verified = 0;
for (const r of results) {
  const t = top.find(x => x.applicationNumber === r.application_number);
  console.log(`\n■ ${r.application_number} ${t?.inventionTitle} [종합 ${r.overall}] 근거검증 ${r.evidence_check.verified}/${r.evidence_check.checked}`);
  checked += r.evidence_check.checked; verified += r.evidence_check.verified;
  for (const f of r.features) console.log(`   ${f.feature_id.padEnd(14)} ${sym[f.match]}${f.evidence_unverified ? "‡" : ""}  ${f.evidence ? `“${f.evidence.slice(0, 70)}” (${f.evidence_source})` : ""}`);
  console.log("   차이점:", r.differences.join(" / ").slice(0, 200));
}
console.log(`\n근거 검증 합계 ${verified}/${checked}, 평가 토큰 ${usage.input}+${usage.output}, 시간 ${ms}ms`);

const rep = await api("POST", "/api/report-generate", { projectId: p.id, researchType: "rnd" });
const doc = await api("GET", `/api/reports?id=${rep.reportId}`);
console.log(`\n보고서 v${rep.version} · ${doc.provider}/${doc.model} · ${rep._ms}ms · 경고 ${doc.validation.warnings.length}건`);
doc.validation.warnings.forEach(w => console.log("  경고:", w.type, w.message, w.line ? `(줄 ${w.line})` : ""));
console.log("\n" + doc.markdown);
console.log("\n프로젝트:", p.id, "보고서:", rep.reportId);
