// 서지 상세 조회 + 캐시 (patent_details, 7일)
import { query } from "./db.js";
import { makeClient, isMock } from "./kipris/service.js";
import { bumpDaily, limits } from "./guard.js";

export async function cachedDetail(applicationNumber) {
  const rows = await query(
    `select claims, applicants, ipc_all, family, fetched_at from patent_details
      where application_number = $1 and fetched_at > now() - interval '7 days'`, [applicationNumber]);
  return rows[0] ? { applicationNumber, claims: rows[0].claims ?? [], applicants: rows[0].applicants ?? [], ipc: rows[0].ipc_all ?? [], family: rows[0].family ?? [], cached: true } : null;
}

export async function fetchDetail(applicationNumber) {
  const hit = await cachedDetail(applicationNumber);
  if (hit) return hit;
  const client = await makeClient();
  await bumpDaily("kipris", limits().kipris);
  const d = await client.detail(applicationNumber);
  // mock 응답은 어떤 번호든 같은 가상 문서를 돌려주므로 번호만 맞춰 둔다
  const out = { ...d, applicationNumber, mock: isMock() };
  await query(
    `insert into patent_details (application_number, claims, applicants, ipc_all, family)
     values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
     on conflict (application_number) do update set claims = excluded.claims, applicants = excluded.applicants,
       ipc_all = excluded.ipc_all, family = excluded.family, fetched_at = now()`,
    [applicationNumber, JSON.stringify(out.claims ?? []), JSON.stringify(out.applicants ?? []), JSON.stringify(out.ipc ?? []), JSON.stringify(out.family ?? [])]);
  return { ...out, cached: false };
}
