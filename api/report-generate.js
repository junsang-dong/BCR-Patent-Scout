// POST /api/report-generate { projectId, researchType } — 한 번의 호출로 보고서 초안 생성 (maxDuration 120)
import { handle, methodNotAllowed } from "../server/http.js";
import { query } from "../server/db.js";
import { reportBody } from "../server/validate.js";
import { getProject } from "../server/queries-db.js";
import { bumpDaily, limits } from "../server/guard.js";
import { generate } from "../server/llm/index.js";
import { prompts } from "../server/prompts/index.js";
import { buildSnapshot } from "../server/report-input.js";
import { assemble, validateReport } from "../server/report.js";

export default handle(async req => {
  if (req.method !== "POST") throw methodNotAllowed(req);
  const b = reportBody.parse(req.body ?? {});
  await getProject(b.projectId);
  const { snapshot, knownNumbers } = await buildSnapshot(b.projectId, b.researchType);
  await bumpDaily("reports", limits().reports);

  const system = `${prompts.common()}\n\n${prompts.report(b.researchType)}`;
  const call = await generate({
    purpose: `report-${b.researchType}`, system, projectId: b.projectId, maxTokens: 6000,
    messages: [{ role: "user", content: JSON.stringify(snapshot) }]
  });

  const createdAt = new Date().toISOString().slice(0, 10);
  const draft = assemble(snapshot, call.text, { provider: call.provider, model: call.model, createdAt });
  const { markdown, warnings, draft_inserted, checked_at } = validateReport({ markdown: draft, snapshot, knownNumbers });
  const validation = { warnings, draft_inserted, checked_at };

  const ver = await query("select coalesce(max(version), 0)::int + 1 as v from reports where project_id = $1::uuid and research_type = $2", [b.projectId, b.researchType]);
  const rows = await query(
    `insert into reports (project_id, research_type, version, provider, model, markdown, input_snapshot, validation)
     values ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) returning id, version`,
    [b.projectId, b.researchType, ver[0].v, call.provider, call.model, markdown, JSON.stringify(snapshot), JSON.stringify(validation)]);
  await query("update projects set status = 'reported' where id = $1::uuid", [b.projectId]);
  return { reportId: rows[0].id, version: rows[0].version, validation: { warning_count: warnings.length, draft_inserted } };
});
