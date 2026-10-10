// GET /api/health — 설정 상태 확인. 키 값은 절대 반환하지 않는다.
import { handle } from "../server/http.js";
import { query } from "../server/db.js";
import { kiprisStatus } from "../server/kipris/service.js";
import { providerInfo } from "../server/llm/index.js";
import { accessMode } from "../server/guard.js";

export default handle(async () => {
  let db = "ok";
  try { await query("select 1 as ok"); } catch { db = "error"; }
  const llm = providerInfo();
  return {
    db,
    kipris: kiprisStatus(),
    llm: { provider: llm.provider, configured: llm.configured, model: llm.model || null },
    access: accessMode()
  };
});
