// POST /api/kipris-search { projectId, query, preview?, page? } — 요청 하나 = 검색식 하나의 한 쪽(20건)
// 무료 호출 한도를 아끼려고 한 번에 20건만 가져오고, 화면의 "더 보기"가 page를 올려 다음 20건을 요청한다.
import { handle, methodNotAllowed, scrubAll } from "../server/http.js";
import { query as sql } from "../server/db.js";
import { searchBody } from "../server/validate.js";
import { bad } from "../server/errors.js";
import { getProject } from "../server/queries-db.js";
import { bumpDaily, limits } from "../server/guard.js";
import { makeClient, rememberGateway, isMock } from "../server/kipris/service.js";
import { savePatents, linkToProject } from "../server/ingest.js";
import { toKiprisQuery, pageSummary, rowsForPage, MAX_PER_QUERY, PAGE_SIZE } from "../shared/queries.js";

export default handle(async req => {
  if (req.method !== "POST") throw methodNotAllowed(req);
  const b = searchBody.parse(req.body ?? {});
  await getProject(b.projectId);
  const client = await makeClient();           // 키가 없으면 여기서 config 오류
  await bumpDaily("kipris", limits().kipris);
  const kq = toKiprisQuery(b.query);

  if (b.preview) {
    // 1건만 조회해 전체 건수를 확인한다. 저장하지 않는다.
    const r = await client.searchPage(kq, 1, 1);
    await rememberGateway(r.gateway);
    return { totalCount: r.totalCount, gateway: r.gateway, note: r.note, mock: isMock() };
  }

  const max = Math.min(b.query.max ?? MAX_PER_QUERY, MAX_PER_QUERY);
  const page = b.page ?? 1;
  const rows = rowsForPage(page, max);
  if (rows === 0) throw bad(`이 검색식의 수집 한도(${max}건)에 이미 닿았습니다. 조건을 좁혀 다시 검색하세요.`, "query_limit");

  const run = (await sql(
    "insert into search_runs (project_id, query_name, query) values ($1::uuid, $2, $3::jsonb) returning id",
    [b.projectId, b.query.name, JSON.stringify({ ...b.query, page })]))[0];
  try {
    const r = await client.searchPage(kq, page, rows);
    await rememberGateway(r.gateway);
    const { kept, hasMore, truncated } = pageSummary({ items: r.items, totalCount: r.totalCount, page, max, from: b.query.from, to: b.query.to });
    await savePatents(kept);
    await linkToProject(b.projectId, b.query.name, kept.map(i => i.applicationNumber));
    const collected = (await sql(
      "select count(*)::int as n from project_patents where project_id = $1::uuid and $2 = any(matched_queries)",
      [b.projectId, b.query.name]))[0].n;
    await sql(
      `update search_runs set gateway = $2, total_count = $3, fetched = $4, kept = $5, truncated = $6, finished_at = now() where id = $1::uuid`,
      [run.id, r.gateway, r.totalCount, r.items.length, kept.length, truncated]);
    await sql("update projects set status = 'searching' where id = $1::uuid and status = 'draft'", [b.projectId]);
    return { totalCount: r.totalCount, page, pageSize: PAGE_SIZE, fetched: r.items.length, kept: kept.length, collected, hasMore, truncated, gateway: r.gateway, note: r.note, mock: isMock() };
  } catch (e) {
    await sql("update search_runs set error = $2, finished_at = now() where id = $1::uuid", [run.id, scrubAll(e.message).slice(0, 300)]);
    throw e;
  }
});
