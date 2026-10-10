// 보고서 입력 스냅샷 만들기 (명세 7.3) — AI에 넘기는 데이터를 그대로 저장해 재현할 수 있게 한다
import { query } from "./db.js";
import { getProject, latestKeywordSet, projectPatentRows } from "./queries-db.js";
import { featuresOf, productOf } from "./catalog.js";
import { computeStats } from "./kipris/stats.js";
import { toRecord } from "./db.js";
import { summarizeRights } from "./kipris/rights.js";
import { bad } from "./errors.js";

const MAX_PATENTS = 50;
const MAX_EVAL = 20;

export async function buildSnapshot(projectId, researchType) {
  const project = await getProject(projectId);
  const ks = await latestKeywordSet(projectId);
  if (!ks) throw bad("키워드 조합이 저장되지 않았습니다.");
  const features = featuresOf(project.product_code, ks.feature_ids);
  const rows = await projectPatentRows(projectId);
  if (!rows.length) throw bad("수집된 특허가 없습니다. 먼저 검색을 실행하세요.");
  const records = rows.map(toRecord);
  const stats = computeStats(records);

  const runs = await query(
    `select distinct on (query_name) query_name, query, gateway, total_count, fetched, kept, truncated, finished_at
       from search_runs where project_id = $1::uuid and error is null and finished_at is not null
      order by query_name, started_at desc`, [projectId]);
  if (!runs.length) throw bad("완료된 검색 기록이 없습니다.");

  const counts = await query(
    `select q as name, count(*)::int as n from project_patents pp, unnest(pp.matched_queries) as q
      where pp.project_id = $1::uuid group by q`, [projectId]);
  const collectedBy = Object.fromEntries(counts.map(c => [c.name, c.n]));

  const evaluated = rows.filter(r => r.similarity || r.similarity_reviewed);
  if (researchType === "rnd" && !evaluated.length) throw bad("연구개발형 보고서는 유사성 평가가 필요합니다. 먼저 핀 고정한 특허를 평가하세요.");

  const pinned = rows.filter(r => r.pinned);
  const ordered = [...pinned, ...rows.filter(r => !r.pinned)].slice(0, MAX_PATENTS);
  const gateways = [...new Set(runs.map(r => r.gateway).filter(Boolean))];
  const collected = runs.map(r => r.finished_at).filter(Boolean).map(d => new Date(d).toISOString().slice(0, 10)).sort().pop();
  const period = runs[0]?.query ?? {};

  const similarity = evaluated.slice(0, MAX_EVAL).map(r => {
    const s = r.similarity_reviewed ?? r.similarity;
    return {
      application_number: r.application_number,
      reviewed: !!r.similarity_reviewed,
      overall: s.overall,
      features: s.features.map(f => ({ feature_id: f.feature_id, match: f.match, evidence: f.evidence, evidence_source: f.evidence_source })),
      differences: s.differences ?? [],
      followups: s.followups ?? []
    };
  });

  // 이미 조회해 둔 권리 현황만 싣는다 (보고서 생성이 KIPRIS를 추가로 부르지 않게)
  const orderedNos = ordered.map(r => r.application_number);
  const rightsRows = await query("select application_number, legal, registration from patent_rights where application_number = any($1::text[])", [orderedNos]);
  const rightsBy = Object.fromEntries(rightsRows.map(r => {
    const s = summarizeRights({ legal: r.legal, registration: r.registration });
    return [r.application_number, { status: s.label, registration_date: s.registrationDate, expiration_date: s.expirationDate, holder: s.holder, annual_fee_paid_through: s.paidThroughAnnual }];
  }));

  const snapshot = {
    generated_at: new Date().toISOString(),
    research_type: researchType,
    project: { id: project.id, title: project.title, product_code: project.product_code, product_name: productOf(project.product_code)?.name ?? "" },
    features: features.map(f => ({ id: f.id, group: f.group, label: f.label, spec: f.spec, keywords: f.keywords.abstract })),
    header_facts: {
      queries: runs.map(r => ({
        name: r.query_name,
        inventionTitle: r.query.inventionTitle, astrtCont: r.query.astrtCont, ipcNumber: r.query.ipcNumber,
        total_count: r.total_count, collected: collectedBy[r.query_name] ?? 0, more_available: (collectedBy[r.query_name] ?? 0) < Math.min(r.total_count ?? 0, 200)
      })),
      gateway: gateways.join(", ") || null,
      collected_at: collected ?? null,
      period: { from: period.from ?? null, to: period.to ?? null },
      include_utility: runs.some(r => r.query.utility),
      pinned_count: pinned.length,
      evaluated_count: evaluated.length
    },
    stats,
    patents: ordered.map(r => ({
      application_number: r.application_number, invention_title: r.invention_title, applicant_name: r.applicant_name,
      application_date: r.application_date, ipc: r.ipc, register_status: r.register_status, pinned: r.pinned,
      open_number: r.open_number, register_number: r.register_number,
      ...(rightsBy[r.application_number] ? { rights: rightsBy[r.application_number] } : {})
    })),
    similarity
  };
  const knownNumbers = new Set(rows.flatMap(r => [r.application_number, r.open_number, r.register_number].filter(Boolean)));
  return { snapshot, knownNumbers };
}
