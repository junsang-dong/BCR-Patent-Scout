// 조사(projects) 관련 모든 요청 — 경로 하나에 action으로 나눈다 (Vercel 함수 개수 절약)
//   GET    /api/projects                      목록
//   POST   /api/projects                      생성
//   GET    /api/projects?id=                  조사 + 키워드 세트 + 검색 실행 기록
//   GET    /api/projects?id=&action=patents   수집된 특허 목록
//   POST   /api/projects?id=&action=keywords  키워드 세트 저장
//   PATCH  /api/projects?id=&action=pin       핀 고정
//   PATCH  /api/projects?id=&action=similarity 사람이 확정한 유사성 평가 저장
import { handle, methodNotAllowed } from "../server/http.js";
import { query } from "../server/db.js";
import { bad } from "../server/errors.js";
import { projectCreate, keywordsBody, pinBody, reviewedBody, isUuid } from "../server/validate.js";
import { getProject, latestKeywordSet, projectPatentRows } from "../server/queries-db.js";
import { toRecord } from "../server/db.js";
import catalog, { productOf } from "../server/catalog.js";

export default handle(async req => {
  const { id, action } = req.query ?? {};
  if (!id) {
    if (req.method === "GET") {
      return query(`
        select p.id, p.title, p.product_code, p.research_type, p.status, p.created_at,
          (select count(*)::int from project_patents pp where pp.project_id = p.id) as patent_count,
          (select count(*)::int from project_patents pp where pp.project_id = p.id and pp.pinned) as pinned_count,
          (select json_build_object('id', r.id, 'version', r.version, 'research_type', r.research_type, 'review_status', r.review_status, 'created_at', r.created_at)
             from reports r where r.project_id = p.id order by r.created_at desc limit 1) as last_report
        from projects p order by p.created_at desc limit 100`);
    }
    if (req.method === "POST") {
      const b = projectCreate.parse(req.body ?? {});
      const rows = await query(
        "insert into projects (title, product_code, research_type) values ($1, $2, $3) returning id, title, product_code, research_type, status, created_at",
        [b.title, b.productCode, b.researchType]);
      return rows[0];
    }
    throw methodNotAllowed(req);
  }

  if (!isUuid(id)) throw bad("조사 ID가 올바르지 않습니다.");
  const project = await getProject(id);

  if (!action) {
    if (req.method !== "GET") throw methodNotAllowed(req);
    const keywordSet = await latestKeywordSet(id);
    const runs = await query(
      `select id, query_name, query, gateway, total_count, fetched, kept, truncated, error, started_at, finished_at
         from search_runs where project_id = $1::uuid order by started_at desc limit 50`, [id]);
    // 검색식별 누적 수집 건수 (더 보기 화면용)
    const counts = await query(
      `select q as name, count(*)::int as n from project_patents pp, unnest(pp.matched_queries) as q
        where pp.project_id = $1::uuid group by q`, [id]);
    const collected = Object.fromEntries(counts.map(c => [c.name, c.n]));
    return { project, keywordSet, runs, collected, catalogVersion: catalog.version };
  }

  if (action === "patents") {
    if (req.method !== "GET") throw methodNotAllowed(req);
    const rows = await projectPatentRows(id);
    return rows.map(r => ({
      ...toRecord(r),
      matchedQueries: r.matched_queries,
      pinned: r.pinned,
      similarity: r.similarity,
      similarityReviewed: r.similarity_reviewed
    }));
  }

  if (action === "keywords") {
    if (req.method !== "POST") throw methodNotAllowed(req);
    const b = keywordsBody.parse(req.body ?? {});
    const product = productOf(project.product_code);
    const known = new Set(product.features.map(f => f.id));
    const unknown = b.featureIds.filter(f => !known.has(f));
    if (unknown.length) throw bad(`이 제품에 없는 기술 요소: ${unknown.join(", ")}`);
    const names = b.queries.map(q => q.name);
    if (new Set(names).size !== names.length) throw bad("검색식 이름이 겹칩니다.");
    const rows = await query(
      `insert into keyword_sets (project_id, feature_ids, queries, catalog_version)
       values ($1::uuid, $2::text[], $3::jsonb, $4) returning id, feature_ids, queries, catalog_version, created_at`,
      [id, b.featureIds, JSON.stringify(b.queries), catalog.version]);
    return rows[0];
  }

  if (action === "pin") {
    if (req.method !== "PATCH") throw methodNotAllowed(req);
    const b = pinBody.parse(req.body ?? {});
    const rows = await query(
      "update project_patents set pinned = $3 where project_id = $1::uuid and application_number = $2 returning application_number",
      [id, b.applicationNumber, b.pinned]);
    if (!rows[0]) throw bad("이 조사에 없는 특허입니다.");
    return { ok: true };
  }

  if (action === "similarity") {
    if (req.method !== "PATCH") throw methodNotAllowed(req);
    const b = reviewedBody.parse(req.body ?? {});
    const rows = await query(
      `update project_patents set similarity_reviewed = $3::jsonb
        where project_id = $1::uuid and application_number = $2 returning application_number`,
      [id, b.applicationNumber, JSON.stringify(b.reviewed ?? null)]);
    if (!rows[0]) throw bad("이 조사에 없는 특허입니다.");
    return { ok: true };
  }

  throw bad(`알 수 없는 action: ${action}`);
});
