// 20건씩 더 보기 + 권리 현황(16·17번)을 실제 KIPRIS로 확인한다. 사용법: node scripts/verify-real.mjs http://localhost:5173
// 호출: 검색 4회(미리보기 없이 1쪽×3 + 브레이크 2쪽) + 권리 조회 3건(최대 6회)
import { generateQueries } from "../shared/queries.js";
import catalog from "../data/product-features.json" with { type: "json" };
const base = process.argv[2] ?? "http://localhost:5173";
async function api(method, path, body) {
  const t0 = Date.now();
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${j.error?.code}: ${j.error?.message}`);
  j._ms = Date.now() - t0; return j;
}
const ids = ["A200-REDUCER", "A200-BRAKE"];
const p = await api("POST", "/api/projects", { title: "확인: 20건씩 더 보기 + 권리 현황", productCode: "BCR-A200", researchType: "planning" });
const { queries } = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ids });
console.log("검색식:", queries.map(q => `${q.name}[${q.astrtCont} · ${q.ipcNumber}]`).join("  "));
await api("POST", `/api/projects?id=${p.id}&action=keywords`, { featureIds: ids, queries });
for (const q of queries) {
  const r = await api("POST", "/api/kipris-search", { projectId: p.id, query: q });
  console.log(`1쪽 ${q.name}: 전체 ${r.totalCount} · 이번 ${r.fetched} · 누적 ${r.collected} · 더 있음 ${r.hasMore} (${r._ms}ms)`);
}
const brake = queries.find(q => q.name === "a200-brake");
const r2 = await api("POST", "/api/kipris-search", { projectId: p.id, query: brake, page: 2 });
console.log(`2쪽 ${brake.name}: 이번 ${r2.fetched} · 누적 ${r2.collected} · 더 있음 ${r2.hasMore} (${r2._ms}ms)`);
const detail = await api("GET", `/api/projects?id=${p.id}`);
console.log("누적 수집:", JSON.stringify(detail.collected));

const list = await api("GET", `/api/projects?id=${p.id}&action=patents`);
const registered = list.filter(x => x.registerStatus === "등록").slice(0, 2);
const open = list.filter(x => x.registerStatus === "공개").slice(0, 1);
console.log("\\n권리 현황 시험 (등록 2건 + 공개 1건)");
for (const t of [...registered, ...open]) {
  const r = await api("POST", "/api/patent-rights", { applicationNumber: t.applicationNumber });
  const s = r.summary;
  console.log(`- ${t.applicationNumber} ${t.registerStatus} | ${(t.inventionTitle ?? "").slice(0, 24)} | ${s.label} | 권리자 ${s.holder ?? "-"} | 연차 ${s.paidThroughAnnual ?? "-"}년차 | 이벤트 ${s.eventCount}건 (${r._ms}ms, 캐시 ${r.cached})`);
}
console.log("\\n프로젝트:", p.id);
