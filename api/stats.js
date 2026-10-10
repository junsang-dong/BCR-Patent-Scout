// GET /api/stats?projectId= — 동향 집계 (4.4 computeStats 그대로, 요청 시 계산)
import { handle, methodNotAllowed } from "../server/http.js";
import { isUuid } from "../server/validate.js";
import { bad } from "../server/errors.js";
import { getProject, projectRecords } from "../server/queries-db.js";
import { computeStats } from "../server/kipris/stats.js";

export default handle(async req => {
  if (req.method !== "GET") throw methodNotAllowed(req);
  const { projectId } = req.query ?? {};
  if (!isUuid(projectId)) throw bad("projectId가 올바르지 않습니다.");
  await getProject(projectId);
  return computeStats(await projectRecords(projectId));
});
