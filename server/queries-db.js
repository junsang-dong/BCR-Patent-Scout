// 여러 핸들러가 함께 쓰는 SQL 도우미
import { query, PATENT_COLS, toRecord } from "./db.js";
import { notFound } from "./errors.js";

export async function getProject(id) {
  const rows = await query("select id, title, product_code, research_type, status, created_by, created_at from projects where id = $1::uuid", [id]);
  if (!rows[0]) throw notFound("조사를 찾을 수 없습니다.");
  return rows[0];
}

export async function latestKeywordSet(projectId) {
  const rows = await query("select id, feature_ids, queries, catalog_version, created_at from keyword_sets where project_id = $1::uuid order by created_at desc limit 1", [projectId]);
  return rows[0] ?? null;
}

export async function projectPatentRows(projectId, { pinnedOnly = false } = {}) {
  return query(
    `select ${PATENT_COLS}, pp.matched_queries, pp.pinned, pp.similarity, pp.similarity_reviewed
       from project_patents pp join patents p using (application_number)
      where pp.project_id = $1::uuid ${pinnedOnly ? "and pp.pinned" : ""}
      order by p.application_date desc nulls last, p.application_number`,
    [projectId]
  );
}

export async function projectRecords(projectId) {
  return (await projectPatentRows(projectId)).map(toRecord);
}

export async function patentsWithDetail(projectId, appNumbers) {
  const rows = await query(
    `select ${PATENT_COLS}, d.claims
       from project_patents pp join patents p using (application_number)
       left join patent_details d using (application_number)
      where pp.project_id = $1::uuid and p.application_number = any($2::text[])`,
    [projectId, appNumbers]
  );
  return rows.map(r => ({ ...toRecord(r), claims: r.claims ?? null }));
}
