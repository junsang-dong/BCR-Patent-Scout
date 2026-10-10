// POST /api/kipris-search { projectId, query, preview? } — 검색식 1개 = 요청 1개
import { handle, methodNotAllowed, scrubAll } from "../server/http.js";
import { query as sql } from "../server/db.js";
import { searchBody } from "../server/validate.js";
import { getProject } from "../server/queries-db.js";
import { bumpDaily, limits } from "../server/guard.js";
import { makeClient, rememberGateway, isMock } from "../server/kipris/service.js";
import { savePatents, linkToProject } from "../server/ingest.js";
import { toKiprisQuery, runSummary, MAX_PER_QUERY } from "../shared/queries.js";

export default handle(async req => {
  if (req.method !== "POST") throw methodNotAllowed(req);
  const b = searchBody.parse(req.body ?? {});
  await getProject(b.projectId);
  const client = await makeClient();           // 키가 없으면 여기서 config 오류
  await bumpDaily("kipris", limits().kipris);
  const kq = toKiprisQuery(b.query);

  if (b.preview) {
    // 1건만 조회해 전체 건수를 확인한다. 저장하지 않는다.
    const r = await client.search(kq, { max: 1, pageSize: 1 });
    await rememberGateway(r.gateway);
    return { totalCount: r.totalCount, gateway: r.gateway, note: r.note, mock: isMock() };
  }

  const max = Math.min(b.query.max ?? MAX_PER_QUERY, MAX_PER_QUERY);
  const run = (await sql(
    "insert into search_runs (project_id, query_name, query) values ($1::uuid, $2, $3::jsonb) returning id",
    [b.projectId, b.query.name, JSON.stringify(b.query)]))[0];
  try {
    const r = await client.search(kq, { max, pageSize: 100 });
    await rememberGateway(r.gateway);
    const { kept, truncated } = runSummary({ items: r.items, totalCount: r.totalCount, max, from: b.query.from, to: b.query.to });
    await savePatents(kept);
    await linkToProject(b.projectId, b.query.name, kept.map(i => i.applicationNumber));
    await sql(
      `update search_runs set gateway = $2, total_count = $3, fetched = $4, kept = $5, truncated = $6, finished_at = now() where id = $1::uuid`,
      [run.id, r.gateway, r.totalCount, r.fetched, kept.length, truncated]);
    await sql("update projects set status = 'searching' where id = $1::uuid and status = 'draft'", [b.projectId]);
    return { totalCount: r.totalCount, fetched: r.fetched, kept: kept.length, truncated, gateway: r.gateway, note: r.note, mock: isMock() };
  } catch (e) {
    await sql("update search_runs set error = $2, finished_at = now() where id = $1::uuid", [run.id, scrubAll(e.message).slice(0, 300)]);
    throw e;
  }
});
