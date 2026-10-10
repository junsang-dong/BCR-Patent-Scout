import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeKey, scrub, mask } from "../server/kipris/env.js";
import { buildUrl, headerError, parseKipoSearch, parseOpenapiSearch, parseDetail, createClient, KiprisError } from "../server/kipris/kipris.js";
import { mockFetch } from "../server/kipris/mock.js";

const fx = f => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "server", "kipris", "fixtures", f), "utf8");
const KEY = "abc=DEF+ghi/jk=";

test("키는 요청 URL에서 정확히 한 번 인코딩된다", () => {
  const url = buildUrl({ gateway: "kipo", op: "getAdvancedSearch", params: { inventionTitle: "관절 모듈" }, key: KEY });
  const u = new URL(url);
  assert.equal(u.pathname, "/kipo-api/kipi/patUtiModInfoSearchSevice/getAdvancedSearch");
  assert.equal(u.searchParams.get("ServiceKey"), KEY);          // 디코딩하면 원래 키
  assert.ok(url.includes("abc%3DDEF%2Bghi%2Fjk%3D"));           // 한 번만 인코딩
  assert.ok(!url.includes("%253D"));                            // 이중 인코딩 아님
});

test("openapi 게이트웨이는 accessKey 파라미터를 쓴다", () => {
  const u = new URL(buildUrl({ gateway: "openapi", op: "freeSearchInfo", params: { word: "x" }, key: KEY }));
  assert.equal(u.pathname, "/openapi/rest/patUtiModInfoSearchSevice/freeSearchInfo");
  assert.equal(u.searchParams.get("accessKey"), KEY);
  assert.equal(u.searchParams.get("ServiceKey"), null);
});

test("이미 percent-encoding된 키를 붙여 넣어도 한 번 풀어서 쓴다", () => {
  assert.equal(normalizeKey("abc%3DDEF%2Bghi"), "abc=DEF+ghi");
  assert.equal(normalizeKey("  plainKey=  "), "plainKey=");
});

test("오류 메시지와 마스킹에 키가 나타나지 않는다", () => {
  const msg = scrub(`failed: http://x/?ServiceKey=${encodeURIComponent(KEY)} raw=${KEY}`, KEY);
  assert.ok(!msg.includes(KEY) && !msg.includes(encodeURIComponent(KEY)));
  assert.ok(!mask(KEY).includes(KEY.slice(3)));
});

test("네트워크 오류에도 키가 새지 않는다", async () => {
  const c = createClient({ key: KEY, gateway: "kipo", fetchImpl: async url => { throw new Error(`connect ECONNREFUSED ${url}`); } });
  await assert.rejects(() => c.searchPage({ word: "x" }, 1, 1), e => {
    assert.ok(e instanceof KiprisError && e.kind === "network");
    assert.ok(!e.message.includes(encodeURIComponent(KEY)) && !e.message.includes(KEY));
    return true;
  });
});

test("머리말 판정: 정상 / 인증 오류", () => {
  assert.equal(headerError(fx("kipo-search-p1.xml")), null);
  const e = headerError(fx("kipo-auth-error.xml"));
  assert.equal(e.code, "30");
  assert.equal(e.kind, "auth");
});

test("kipo 검색 응답을 정규화한다 (날짜·CDATA·엔티티)", () => {
  const r = parseKipoSearch(fx("kipo-search-p1.xml"));
  assert.equal(r.totalCount, 5);
  assert.equal(r.items.length, 3);
  const a = r.items[0];
  assert.equal(a.applicationNumber, "1020210900001");
  assert.equal(a.applicationDate, "2021-03-15");
  assert.equal(a.ipcNumber, "B25J 9/12|H02K 7/116");
  assert.equal(a.applicantName, "데모액추에이터 주식회사");
  assert.ok(a.abstract.includes("하우징"));
  assert.equal(r.items[1].registerNumber, null); // 빈 태그 → null
});

test("openapi 자유검색 응답도 같은 모양으로 정규화한다", () => {
  const r = parseOpenapiSearch(fx("openapi-free.xml"));
  assert.equal(r.totalCount, 2);
  assert.deepEqual(Object.keys(r.items[0]), Object.keys(parseKipoSearch(fx("kipo-search-p1.xml")).items[0]));
  assert.equal(r.items[0].ipcNumber, "B25J 9/12");
});

test("인증 오류 응답은 auth 종류의 오류로 던진다", () => {
  assert.throws(() => parseKipoSearch(fx("kipo-auth-error.xml")), e => e instanceof KiprisError && e.kind === "auth");
});

test("서지 상세: 청구항·출원인·IPC", () => {
  const d = parseDetail(fx("kipo-detail.xml"));
  assert.equal(d.applicationNumber, "1020210900001");
  assert.equal(d.claims.length, 2);
  assert.deepEqual(d.ipc, ["B25J 9/12", "H02K 7/116"]);
  assert.equal(d.applicants[0].country, "KR");
  assert.equal(d.inventionTitle, "[DEMO] 중공형 로봇 관절 구동 모듈"); // inventionTitleEng와 섞이지 않음
});

test("여러 페이지를 모은다 (3건 + 2건)", async () => {
  const c = createClient({ key: "K", gateway: "kipo", fetchImpl: mockFetch(), pauseMs: 0 });
  const r = await c.search({ word: "x" }, { max: 50, pageSize: 3 });
  assert.equal(r.fetched, 5);
  assert.equal(new Set(r.items.map(i => i.applicationNumber)).size, 5);
});

test("max에서 멈춘다", async () => {
  const c = createClient({ key: "K", gateway: "kipo", fetchImpl: mockFetch(), pauseMs: 0 });
  const r = await c.search({ word: "x" }, { max: 4, pageSize: 3 });
  assert.equal(r.items.length, 4);
});

test("auto: kipo 인증 실패 시 openapi로 전환하고, 그 뒤로는 openapi를 계속 쓴다", async () => {
  const calls = [];
  const base = mockFetch({ authFail: true });
  const c = createClient({ key: "K", gateway: "auto", fetchImpl: async url => { calls.push(new URL(url).pathname); return base(url); }, pauseMs: 0 });
  const r = await c.searchPage({ inventionTitle: "관절" }, 1, 10);
  assert.equal(r.gateway, "openapi");
  assert.equal(c.gateway, "openapi");
  await c.searchPage({ word: "y" }, 1, 10);
  assert.ok(calls.at(-1).endsWith("freeSearchInfo"));
});

test("키가 없으면 config 오류", () => {
  assert.throws(() => createClient({ key: "" }), e => e.kind === "config");
});
