// KIPRIS Plus 데이터 상품 16번(특허·실용 법적 상태 이력 ST.27)과 17번(등록사항) 클라이언트·파서
//   법적 상태: GET /openapi/rest/legStatusST27InfoSearchService/BasicInfo?applicationNumber=
//   등록사항:  GET /openapi/rest/RegistrationService/registrationInfo?registrationNumber=
//   인증 파라미터: accessKey. 두 상품은 각각 이용 신청·승인이 있어야 한다 (미승인이면 인증 오류).
// 2026-10-10 실제 응답으로 태그 이름을 확인했다 (docs/spike.md).
import { blocks, text } from "./xml.js";
import { headerError, KiprisError } from "./kipris.js";
import { scrub } from "./env.js";

const BASE = "https://plus.kipris.or.kr/openapi/rest";
const ymd = s => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || null);
const num = s => (s && /^\d+$/.test(s) ? Number(s) : null);

export function parseLegalStatus(xml) {
  const err = headerError(xml);
  if (err) throw new KiprisError(`KIPRIS 오류 ${err.code ?? ""} ${err.msg}`.trim(), { code: err.code, kind: err.kind });
  const rows = blocks(xml, "legalStatusST27Info");
  const events = rows.map((r, i) => ({
    seq: i,
    date: ymd(text(r, "eventDate")),
    keyEventCode: text(r, "keyEventCode") || null,
    nationalEventCode: text(r, "nationalEventCode") || null,
    detailEventCode: text(r, "detailLawEventCode") || null,
    stateCode: text(r, "stateCode") || null,
    previousStage: text(r, "previousStageCode") || null,
    currentStage: text(r, "currentStageCode") || null,
    indicator: text(r, "eventIndicatorCode") || null,
    trialNumber: text(r, "trialNumber") || null,
    demurrerNumber: text(r, "demurrerNumber") || null
  })).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.seq - b.seq);
  const first = rows[0] ?? "";
  return {
    header: {
      applicationNumber: text(first, "applicationNumber") || null,
      applicationDate: ymd(text(first, "applicationDate")),
      openNumber: text(first, "openNumber") || null,
      openingDate: ymd(text(first, "openingDate")),
      registrationNumber: text(first, "registrationNumber") || null,
      registrationDate: ymd(text(first, "registrationDate")),
      publicationNumber: text(first, "publicationNumber") || null,
      publicationDate: ymd(text(first, "publicationDate"))
    },
    events
  };
}

export function parseRegistration(xml) {
  const err = headerError(xml);
  if (err) throw new KiprisError(`KIPRIS 오류 ${err.code ?? ""} ${err.msg}`.trim(), { code: err.code, kind: err.kind });
  const info = blocks(xml, "registrationRightInfo")[0];
  if (!info) return null; // 등록 정보가 없음 (미등록 등)
  const fees = blocks(xml, "registrationFeeInfo").map(f => ({
    paidDate: ymd(text(f, "paymentDate")),
    fromAnnual: num(text(f, "startAnnual")),
    toAnnual: num(text(f, "lastAnnual")),
    amount: num(text(f, "paymentFee"))
  }));
  return {
    registrationNumber: text(info, "registrationNumber") || null,
    registrationDate: ymd(text(info, "registrationDate")),
    expirationDate: ymd(text(info, "expirationDate")),
    terminationDate: ymd(text(info, "terminationDate")),
    terminationCause: text(info, "terminationCauseName") || null,
    applicationNumber: text(info, "applicationNumber") || null,
    title: text(info, "titleOfInvention") || null,
    classCode: text(info, "classCode") || null,
    claimCount: num(text(info, "claimCount")),
    holders: blocks(xml, "registrationRightHolderInfoA").map(h => ({ type: text(h, "rankCorrelatorType") || null, name: text(h, "rankCorrelatorName") || null })),
    lastHolder: text(blocks(xml, "registrationLastRightHolderInfo")[0] ?? "", "lastRightHolderName") || null,
    fees
  };
}

// 두 조회 결과를 사람이 읽을 사실로 요약한다. 권리 판단이 아니라 KIPRIS 기록의 요약이다.
export function summarizeRights({ legal, registration }, today = new Date().toISOString().slice(0, 10)) {
  const events = legal?.events ?? [];
  const paidThrough = registration?.fees?.length ? Math.max(...registration.fees.map(f => f.toAnnual ?? 0)) || null : null;
  let state, label;
  if (registration) {
    if (registration.terminationDate || registration.terminationCause) {
      state = "terminated";
      label = `소멸${registration.terminationDate ? ` (${registration.terminationDate})` : ""}${registration.terminationCause ? ` · ${registration.terminationCause}` : ""}`;
    } else if (registration.expirationDate && registration.expirationDate < today) {
      state = "expired";
      label = `존속기간 만료일(${registration.expirationDate})이 지남`;
    } else {
      state = "active";
      label = `등록 존속 중${registration.expirationDate ? ` · 만료 예정 ${registration.expirationDate}` : ""}`;
    }
  } else if (legal?.header?.registrationNumber) {
    state = "registered_unchecked";
    label = "등록 이력은 있으나 등록사항을 조회하지 못함";
  } else if (events.length) {
    state = "pending";
    label = "등록 전 (출원·공개 단계 기록만 있음)";
  } else {
    state = "unknown";
    label = "법적 상태 기록 없음";
  }
  return {
    state, label,
    registrationNumber: registration?.registrationNumber ?? legal?.header?.registrationNumber ?? null,
    registrationDate: registration?.registrationDate ?? legal?.header?.registrationDate ?? null,
    expirationDate: registration?.expirationDate ?? null,
    holder: registration?.lastHolder ?? registration?.holders?.[0]?.name ?? null,
    paidThroughAnnual: paidThrough,
    eventCount: events.length,
    lastEventDate: events.length ? events[events.length - 1].date : null
  };
}

async function rest({ service, op, params, key, fetchImpl = fetch, timeoutMs = 20000 }) {
  const url = `${BASE}/${service}/${op}?${new URLSearchParams({ ...params, accessKey: key })}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ac.signal, headers: { Accept: "application/xml" } });
    const body = await res.text();
    if (!res.ok) throw new KiprisError(`HTTP ${res.status}: ${scrub(body.slice(0, 200), key)}`, { kind: "network" });
    return body;
  } catch (e) {
    if (e instanceof KiprisError) throw e;
    throw new KiprisError(`연결 실패: ${scrub(e.message, key)}`, { kind: "network" });
  } finally { clearTimeout(t); }
}

export function createRightsClient({ key, fetchImpl }) {
  if (!key) throw new KiprisError("API 키가 없습니다.", { kind: "config" });
  // 상품 미신청·미승인은 인증 오류로 돌아온다. 무엇을 확인할지 덧붙인다.
  const guarded = async fn => {
    try { return await fn(); }
    catch (e) {
      if (e instanceof KiprisError && e.kind === "auth") e.message += " — 이 데이터 상품(법적 상태 이력 ST.27 또는 등록사항)의 이용 신청이 승인됐는지 KIPRIS Plus에서 확인하세요.";
      throw e;
    }
  };
  return {
    legal: applicationNumber => guarded(async () =>
      parseLegalStatus(await rest({ service: "legStatusST27InfoSearchService", op: "BasicInfo", params: { applicationNumber }, key, fetchImpl }))),
    registration: registrationNumber => guarded(async () =>
      parseRegistration(await rest({ service: "RegistrationService", op: "registrationInfo", params: { registrationNumber }, key, fetchImpl })))
  };
}
