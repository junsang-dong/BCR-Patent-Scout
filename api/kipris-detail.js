// POST /api/kipris-detail { applicationNumber } — 서지 상세 (7일 캐시)
import { handle, methodNotAllowed } from "../server/http.js";
import { query } from "../server/db.js";
import { detailBody } from "../server/validate.js";
import { bad } from "../server/errors.js";
import { fetchDetail } from "../server/detail.js";

export default handle(async req => {
  if (req.method !== "POST") throw methodNotAllowed(req);
  const b = detailBody.parse(req.body ?? {});
  const known = await query("select 1 as ok from patents where application_number = $1", [b.applicationNumber]);
  if (!known[0]) throw bad("수집된 적 없는 출원번호입니다. 먼저 검색으로 수집하세요.");
  return fetchDetail(b.applicationNumber);
});
