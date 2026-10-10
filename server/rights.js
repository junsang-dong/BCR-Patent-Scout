// 특허 권리 현황 조회 + 캐시 (patent_rights, 7일) — 16번 법적 상태 이력 + 17번 등록사항
import { query } from "./db.js";
import { makeRightsClient, isMock } from "./kipris/service.js";
import { summarizeRights } from "./kipris/rights.js";
import { bumpDaily, bumpMonthly, limits } from "./guard.js";

export async function cachedRights(applicationNumber) {
  const r = (await query(
    `select legal, registration,
            (legal_fetched_at > now() - interval '7 days') as legal_fresh,
            (registration_fetched_at > now() - interval '7 days') as reg_fresh
       from patent_rights where application_number = $1`, [applicationNumber]))[0];
  return r ?? null;
}

// 조회 결과에 요약을 붙여 돌려준다. refresh면 캐시를 무시한다. 호출은 법적 상태 1회 + (등록 특허면) 등록사항 1회
export async function getRights(applicationNumber, { refresh = false } = {}) {
  const row = await cachedRights(applicationNumber);
  let legal = row?.legal ?? null, registration = row?.registration ?? null;
  let cached = true;
  let client = null;
  const need = () => (client ??= makeRightsClient());

  if (refresh || !row?.legal_fresh) {
    cached = false;
    const c = need();
    await bumpDaily("kipris", limits().kipris);
    legal = await c.legal(applicationNumber);
    await query(
      `insert into patent_rights (application_number, legal, legal_fetched_at) values ($1, $2::jsonb, now())
       on conflict (application_number) do update set legal = excluded.legal, legal_fetched_at = now()`,
      [applicationNumber, JSON.stringify(legal)]);
  }

  if (refresh || !row?.reg_fresh) {
    // 등록번호: 법적 상태 머리말 → 검색 결과 순. 없으면 등록 전이므로 조회하지 않는다.
    const stored = (await query("select register_number from patents where application_number = $1", [applicationNumber]))[0]?.register_number;
    const regNo = legal?.header?.registrationNumber || stored || null;
    if (regNo) {
      cached = false;
      const c = need();
      await bumpDaily("kipris", limits().kipris);
      await bumpMonthly("registration", limits().registrationMonthly);
      registration = await c.registration(regNo.replace(/\D/g, ""));
    } else registration = null;
    await query(
      `insert into patent_rights (application_number, registration, registration_fetched_at) values ($1, $2::jsonb, now())
       on conflict (application_number) do update set registration = excluded.registration, registration_fetched_at = now()`,
      [applicationNumber, JSON.stringify(registration)]);
  }
  return { applicationNumber, legal, registration, summary: summarizeRights({ legal, registration }), cached, mock: isMock() };
}
