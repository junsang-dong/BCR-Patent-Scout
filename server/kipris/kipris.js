// KIPRIS Plus 특허·실용신안 검색 클라이언트 (외부 패키지 없음)
//
// 게이트웨이 두 가지 — 발급 경로에 따라 통하는 쪽이 다르다.
//   kipo    : /kipo-api/kipi/patUtiModInfoSearchSevice/   인증 파라미터 ServiceKey
//             getAdvancedSearch (항목별 검색), getBibliographyDetailInfoSearch (서지 상세)
//   openapi : /openapi/rest/patUtiModInfoSearchSevice/   인증 파라미터 accessKey
//             freeSearchInfo (자유 검색)
// ※ 서비스명 철자 "Sevice"는 KIPRIS 원본 표기 그대로다 (오타 아님).
// ※ 초당 호출은 50회 미만으로 유지한다 (초과 시 IP 차단 안내가 있음). 이 클라이언트는 페이지마다 쉰다.

import { blocks, text, texts } from "./xml.js";
import { scrub } from "./env.js";

const HOST = "plus.kipris.or.kr";
const SERVICE = "patUtiModInfoSearchSevice";

export const GATEWAYS = {
  kipo: { path: `/kipo-api/kipi/${SERVICE}/`, keyParam: "ServiceKey" },
  openapi: { path: `/openapi/rest/${SERVICE}/`, keyParam: "accessKey" }
};

export class KiprisError extends Error {
  constructor(message, { code = null, gateway = null, kind = "api" } = {}) {
    super(message);
    this.name = "KiprisError";
    this.code = code;
    this.gateway = gateway;
    this.kind = kind; // api | auth | network | config
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = s => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || null);

export function buildUrl({ gateway, op, params, key, scheme = "http" }) {
  const g = GATEWAYS[gateway];
  if (!g) throw new Error(`알 수 없는 게이트웨이: ${gateway}`);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  qs.set(g.keyParam, key); // URLSearchParams가 정확히 한 번 인코딩
  return `${scheme}://${HOST}${g.path}${op}?${qs.toString()}`;
}

// 응답 머리말의 오류 판정. 성공이면 null
export function headerError(xml) {
  const successYN = text(xml, "successYN");
  const code = text(xml, "resultCode");
  const msg = text(xml, "resultMsg");
  const failed = successYN === "N" || (code && !["00", "0"].includes(code));
  if (!failed) return null;
  const authLike = /key|인증|등록|registe?r|access|service ?id/i.test(msg) || ["10", "11", "20", "22", "30", "31", "101"].includes(code);
  return { code: code || null, msg: msg || "오류 응답", kind: authLike ? "auth" : "api" };
}

async function fetchText(url, { fetchImpl = fetch, timeoutMs = 20000, key } = {}) {
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
  } finally {
    clearTimeout(t);
  }
}

// ---------- 정규화: 두 게이트웨이 응답을 같은 모양으로 ----------

function normKipoItem(x) {
  return {
    applicationNumber: text(x, "applicationNumber") || null,
    applicationDate: ymd(text(x, "applicationDate")),
    inventionTitle: text(x, "inventionTitle") || null,
    applicantName: text(x, "applicantName") || null,
    ipcNumber: text(x, "ipcNumber") || null,
    openNumber: text(x, "openNumber") || null,
    openDate: ymd(text(x, "openDate")),
    registerNumber: text(x, "registerNumber") || null,
    registerDate: ymd(text(x, "registerDate")),
    registerStatus: text(x, "registerStatus") || null,
    abstract: text(x, "astrtCont") || null
  };
}

function normOpenapiItem(x) {
  return {
    applicationNumber: text(x, "ApplicationNumber") || null,
    applicationDate: ymd(text(x, "ApplicationDate")),
    inventionTitle: text(x, "InventionName") || null,
    applicantName: text(x, "Applicant") || null,
    ipcNumber: text(x, "InternationalpatentclassificationNumber") || null,
    openNumber: text(x, "OpeningNumber") || null,
    openDate: ymd(text(x, "OpeningDate")),
    registerNumber: text(x, "RegistrationNumber") || null,
    registerDate: ymd(text(x, "RegistrationDate")),
    registerStatus: text(x, "RegistrationStatus") || null,
    abstract: text(x, "Abstract") || null
  };
}

export function parseKipoSearch(xml) {
  const err = headerError(xml);
  if (err) throw new KiprisError(`KIPRIS 오류 ${err.code ?? ""} ${err.msg}`.trim(), { code: err.code, gateway: "kipo", kind: err.kind });
  const items = blocks(xml, "item").map(normKipoItem).filter(r => r.applicationNumber);
  const total = Number(text(xml, "totalCount") || text(xml, "count") || items.length);
  return { items, totalCount: Number.isFinite(total) ? total : items.length };
}

export function parseOpenapiSearch(xml) {
  const err = headerError(xml);
  if (err) throw new KiprisError(`KIPRIS 오류 ${err.code ?? ""} ${err.msg}`.trim(), { code: err.code, gateway: "openapi", kind: err.kind });
  const items = blocks(xml, "PatentUtilityInfo").map(normOpenapiItem).filter(r => r.applicationNumber);
  const total = Number(text(xml, "TotalSearchCount") || items.length);
  return { items, totalCount: Number.isFinite(total) ? total : items.length };
}

export function parseDetail(xml) {
  const err = headerError(xml);
  if (err) throw new KiprisError(`KIPRIS 오류 ${err.code ?? ""} ${err.msg}`.trim(), { code: err.code, gateway: "kipo", kind: err.kind });
  const summary = blocks(xml, "biblioSummaryInfo")[0] ?? xml;
  return {
    applicationNumber: text(summary, "applicationNumber") || null,
    applicationDate: ymd(text(summary, "applicationDate")),
    inventionTitle: text(summary, "inventionTitle") || null,
    inventionTitleEng: text(summary, "inventionTitleEng") || null,
    registerStatus: text(summary, "registerStatus") || null,
    openNumber: text(summary, "openNumber") || null,
    openDate: ymd(text(summary, "openDate")),
    registerNumber: text(summary, "registerNumber") || null,
    claimCount: Number(text(summary, "claimCount")) || null,
    applicants: blocks(xml, "applicantInfo").map(b => ({ name: text(b, "name"), engName: text(b, "engName"), country: text(b, "country") })),
    ipc: texts(xml, "ipcNumber"),
    abstract: texts(xml, "astrtCont")[0] ?? null,
    claims: texts(xml, "claim"),
    family: texts(xml, "familyApplicationNumber")
  };
}

// ---------- 공개 함수 ----------

export function createClient({ key, gateway = "auto", scheme = "http", fetchImpl = fetch, pauseMs = 250 } = {}) {
  if (!key) throw new KiprisError("API 키가 없습니다. kipris-tool/.env 에 KIPRIS_API_KEY를 넣거나 환경변수로 설정하세요.", { kind: "config" });
  let resolved = gateway === "auto" ? null : gateway;

  async function call(gw, op, params) {
    const url = buildUrl({ gateway: gw, op, params, key, scheme });
    return fetchText(url, { fetchImpl, key });
  }

  // 한 페이지 검색 — 결과를 같은 모양으로 돌려준다
  async function searchPage(q, pageNo, numOfRows) {
    const tryKipo = async () => parseKipoSearch(await call("kipo", "getAdvancedSearch", {
      word: q.word, inventionTitle: q.inventionTitle, astrtCont: q.astrtCont, claimScope: q.claimScope,
      ipcNumber: q.ipcNumber, applicant: q.applicant, applicationDate: q.applicationDate,
      patent: q.patent ?? "true", utility: q.utility ?? "false",
      // 정렬 코드·기간 형식은 공식 명세로 확인한 값만 넘긴다 (기본은 보내지 않음)
      pageNo, numOfRows, sortSpec: q.sortSpec, descSort: q.descSort
    }));
    // openapi 자유검색은 항목별 조건을 지원하지 않으므로 word로 합친다
    const tryOpen = async () => parseOpenapiSearch(await call("openapi", "freeSearchInfo", {
      word: [q.word, q.inventionTitle, q.astrtCont, q.ipcNumber, q.applicant].filter(Boolean).join(" "),
      patent: q.patent ?? "true", utility: q.utility ?? "false",
      docsStart: pageNo, docsCount: numOfRows, descSort: q.descSort
    }));

    if (resolved === "kipo") return { ...(await tryKipo()), gateway: "kipo" };
    if (resolved === "openapi") return { ...(await tryOpen()), gateway: "openapi" };

    // auto: kipo 먼저, 인증 오류면 openapi로
    try {
      const r = await tryKipo();
      resolved = "kipo";
      return { ...r, gateway: "kipo" };
    } catch (e) {
      if (!(e instanceof KiprisError) || e.kind !== "auth") throw e;
      const r = await tryOpen();
      resolved = "openapi";
      return { ...r, gateway: "openapi", note: "kipo 게이트웨이 인증 실패 → openapi 게이트웨이로 전환 (항목별 조건은 자유검색어로 합쳐짐)" };
    }
  }

  // 여러 페이지를 모아 최대 max건까지
  async function search(q, { max = 200, pageSize = 100 } = {}) {
    const numOfRows = Math.min(pageSize, 500);
    const all = [];
    let pageNo = 1, totalCount = null, gw = null, note = null;
    while (all.length < max) {
      const r = await searchPage(q, pageNo, numOfRows);
      gw = r.gateway; note = note ?? r.note ?? null;
      totalCount = r.totalCount;
      all.push(...r.items);
      if (r.items.length < numOfRows || all.length >= totalCount) break;
      pageNo += 1;
      await sleep(pauseMs);
    }
    return { query: q, gateway: gw, note, totalCount, fetched: Math.min(all.length, max), items: all.slice(0, max) };
  }

  async function detail(applicationNumber) {
    const xml = await call("kipo", "getBibliographyDetailInfoSearch", { applicationNumber });
    return parseDetail(xml);
  }

  return { search, searchPage, detail, get gateway() { return resolved; } };
}
