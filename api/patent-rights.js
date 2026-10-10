// POST /api/patent-rights { applicationNumber, refresh? } — 권리 현황 (16 법적 상태 이력 + 17 등록사항)
import { handle, methodNotAllowed } from "../server/http.js";
import { query } from "../server/db.js";
import { rightsBody } from "../server/validate.js";
import { bad } from "../server/errors.js";
import { getRights } from "../server/rights.js";

export default handle(async req => {
  if (req.method !== "POST") throw methodNotAllowed(req);
  const b = rightsBody.parse(req.body ?? {});
  const known = await query("select 1 as ok from patents where application_number = $1", [b.applicationNumber]);
  if (!known[0]) throw bad("수집된 적 없는 출원번호입니다. 먼저 검색으로 수집하세요.");
  return getRights(b.applicationNumber, { refresh: b.refresh });
});
