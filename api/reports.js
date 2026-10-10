// GET /api/reports?projectId= 목록 · GET /api/reports?id= 본문 · PATCH /api/reports?id= 검토 상태·의견
import { handle, methodNotAllowed } from "../server/http.js";
import { query } from "../server/db.js";
import { reportPatch, isUuid } from "../server/validate.js";
import { bad, notFound } from "../server/errors.js";
import { canApprove } from "../server/report.js";

export default handle(async req => {
  const { id, projectId, snapshot } = req.query ?? {};
  if (req.method === "GET") {
    if (id) {
      if (!isUuid(id)) throw bad("보고서 ID가 올바르지 않습니다.");
      const rows = await query(
        `select id, project_id, research_type, version, provider, model, markdown, validation, review_status, reviewer, reviewer_note, created_at
                ${snapshot ? ", input_snapshot" : ""} from reports where id = $1::uuid`, [id]);
      if (!rows[0]) throw notFound("보고서를 찾을 수 없습니다.");
      return rows[0];
    }
    if (!isUuid(projectId)) throw bad("projectId가 올바르지 않습니다.");
    return query(
      `select id, research_type, version, provider, model, review_status, reviewer, created_at,
              jsonb_array_length(coalesce(validation -> 'warnings', '[]'::jsonb))::int as warning_count
         from reports where project_id = $1::uuid order by created_at desc`, [projectId]);
  }
  if (req.method === "PATCH") {
    if (!isUuid(id)) throw bad("보고서 ID가 올바르지 않습니다.");
    const b = reportPatch.parse(req.body ?? {});
    const rows = await query("select validation, review_status from reports where id = $1::uuid", [id]);
    if (!rows[0]) throw notFound("보고서를 찾을 수 없습니다.");
    const validation = rows[0].validation ?? { warnings: [] };
    if (b.ackWarning) {
      const w = (validation.warnings ?? []).find(x => x.id === b.ackWarning);
      if (!w) throw bad("없는 경고입니다.");
      w.acknowledged = true;
    }
    if (b.reviewStatus === "approved" && !canApprove(validation)) {
      throw bad("검증 경고를 하나씩 '확인함'으로 처리한 뒤에 승인할 수 있습니다.", "warnings_unacknowledged");
    }
    const upd = await query(
      `update reports set validation = $2::jsonb,
         review_status = coalesce($3, review_status),
         reviewer_note = coalesce($4, reviewer_note),
         reviewer = coalesce($5, reviewer)
       where id = $1::uuid returning id, review_status, reviewer, reviewer_note, validation`,
      [id, JSON.stringify(validation), b.reviewStatus ?? null, b.reviewerNote ?? null, b.reviewer ?? null]);
    return upd[0];
  }
  throw methodNotAllowed(req);
});
