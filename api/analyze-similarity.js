// POST /api/analyze-similarity { projectId, applicationNumbers[≤5] } — 요청 하나 = 특허 5건
import { handle, methodNotAllowed } from "../server/http.js";
import { query } from "../server/db.js";
import { analyzeBody, similarityBatch } from "../server/validate.js";
import { ApiError, bad } from "../server/errors.js";
import { getProject, latestKeywordSet, patentsWithDetail } from "../server/queries-db.js";
import { featuresOf } from "../server/catalog.js";
import { fetchDetail } from "../server/detail.js";
import { generate } from "../server/llm/index.js";
import { prompts } from "../server/prompts/index.js";
import { buildSimilarityInput, verifyEvidence } from "../server/similarity.js";

const MAX_EVALUATED = 20;

async function askModel(system, input, projectId, errorNote) {
  const user = JSON.stringify(input);
  const messages = [{ role: "user", content: errorNote ? `${user}\n\n(이전 응답 오류: ${errorNote}. 출력 형식을 지켜 다시 답하라.)` : user }];
  return generate({ purpose: "similarity", system, messages, maxTokens: 8000, json: true, projectId });
}

export default handle(async req => {
  if (req.method !== "POST") throw methodNotAllowed(req);
  const b = analyzeBody.parse(req.body ?? {});
  const project = await getProject(b.projectId);
  const ks = await latestKeywordSet(b.projectId);
  if (!ks) throw bad("먼저 키워드 조합을 저장하세요. 평가할 기술 요소가 정해지지 않았습니다.");
  const features = featuresOf(project.product_code, ks.feature_ids);

  // 이 조사에 속한 특허만, 조사당 평가 20건까지
  const own = await query("select application_number, (similarity is not null) as done from project_patents where project_id = $1::uuid", [b.projectId]);
  const ownSet = new Set(own.map(r => r.application_number));
  const notOwn = b.applicationNumbers.filter(n => !ownSet.has(n));
  if (notOwn.length) throw bad(`이 조사에 없는 특허: ${notOwn.join(", ")}`);
  const already = new Set(own.filter(r => r.done).map(r => r.application_number));
  const added = b.applicationNumbers.filter(n => !already.has(n)).length;
  if (already.size + added > MAX_EVALUATED) throw new ApiError(429, "evaluation_limit", `조사 하나에서 평가할 수 있는 특허는 ${MAX_EVALUATED}건까지입니다.`);

  // 상세 미조회 건은 먼저 조회
  for (const n of b.applicationNumbers) await fetchDetail(n);
  const patents = await patentsWithDetail(b.projectId, b.applicationNumbers);
  const input = buildSimilarityInput(features, patents);
  const system = `${prompts.common()}\n\n${prompts.similarity()}`;

  // 형식이 틀리면 오류 내용을 붙여 한 번만 다시 요청한다
  const parse = c => (c.json ? similarityBatch.safeParse(c.json) : { success: false, note: `JSON을 읽지 못함: ${c.jsonError}. 문자열 안의 큰따옴표는 \\\"로 이스케이프하거나 쓰지 않는다.` });
  const noteOf = r => r.note ?? r.error.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
  let call = await askModel(system, input, b.projectId);
  let parsed = parse(call);
  if (!parsed.success) {
    call = await askModel(system, input, b.projectId, noteOf(parsed));
    parsed = parse(call);
    if (!parsed.success) throw new ApiError(502, "llm_invalid_output", "AI 응답 형식이 올바르지 않아 평가하지 못했습니다. 잠시 뒤 다시 시도하세요.");
  }

  const byNo = new Map(parsed.data.patents.map(p => [p.application_number, p]));
  const out = [];
  for (const p of input.patents) {
    const raw = byNo.get(p.application_number) ?? {
      application_number: p.application_number,
      features: features.map(f => ({ feature_id: f.id, match: "unclear", evidence: "", evidence_source: "" })),
      overall: "low", differences: [], followups: ["AI 응답에 이 특허가 빠져 있어 다시 평가가 필요합니다."]
    };
    // 모델이 요소를 빠뜨렸으면 불명으로 채운다
    const have = new Set(raw.features.map(f => f.feature_id));
    for (const f of features) if (!have.has(f.id)) raw.features.push({ feature_id: f.id, match: "unclear", evidence: "", evidence_source: "" });
    raw.features = raw.features.filter(f => features.some(x => x.id === f.feature_id));
    const verified = verifyEvidence(raw, p);
    const saved = { ...verified, provider: call.provider, model: call.model, evaluated_at: new Date().toISOString() };
    await query("update project_patents set similarity = $3::jsonb where project_id = $1::uuid and application_number = $2",
      [b.projectId, p.application_number, JSON.stringify(saved)]);
    out.push(saved);
  }
  await query("update projects set status = 'reviewing' where id = $1::uuid and status in ('draft','searching')", [b.projectId]);
  return { results: out, provider: call.provider, model: call.model, usage: call.usage };
});
