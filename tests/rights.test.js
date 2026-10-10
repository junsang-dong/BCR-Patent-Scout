// 16번 법적 상태 이력(ST.27)·17번 등록사항 — 파서·요약·오류 안내 (가상 fixture)
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLegalStatus, parseRegistration, summarizeRights, createRightsClient } from "../server/kipris/rights.js";
import { KiprisError } from "../server/kipris/kipris.js";

const fx = f => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "server", "kipris", "fixtures", f), "utf8");

describe("법적 상태 이력 ST.27", () => {
  const legal = parseLegalStatus(fx("st27-legal.xml"));
  test("이벤트를 날짜순으로 읽고 머리말을 뽑는다", () => {
    expect(legal.events.map(e => e.date)).toEqual(["2021-03-15", "2023-11-20"]);
    expect(legal.events[1]).toMatchObject({ keyEventCode: "F10", nationalEventCode: "PR0701", currentStage: "4" });
    expect(legal.header).toMatchObject({ applicationNumber: "1020210900001", registrationNumber: "1099000000001", registrationDate: "2023-11-20", openingDate: "2022-09-20" });
  });
  test("승인 전 인증 오류는 KiprisError(auth)", () => {
    expect(() => parseLegalStatus(fx("kipo-auth-error.xml"))).toThrow(KiprisError);
  });
});

describe("등록사항", () => {
  const reg = parseRegistration(fx("registration.xml"));
  test("등록 정보·만료 예정일·권리자·연차료를 읽는다", () => {
    expect(reg).toMatchObject({ registrationNumber: "1099000000001", expirationDate: "2041-03-15", claimCount: 2, classCode: "B25J 9/12", lastHolder: "데모액추에이터 주식회사", terminationDate: null, terminationCause: null });
    expect(reg.holders[0]).toEqual({ type: "권리자", name: "데모액추에이터 주식회사" });
    expect(reg.fees).toEqual([{ paidDate: "2023-11-21", fromAnnual: 1, toAnnual: 3, amount: 100000 }]);
  });
  test("등록 정보가 없으면 null", () => {
    expect(parseRegistration('<response><header><resultCode>00</resultCode></header><body><items></items></body></response>')).toBeNull();
  });
});

describe("권리 현황 요약 (사실 요약이지 권리 판단이 아님)", () => {
  const legal = parseLegalStatus(fx("st27-legal.xml"));
  const reg = parseRegistration(fx("registration.xml"));
  test("존속 중: 만료 예정일·권리자·연차료 납부 연차", () => {
    const s = summarizeRights({ legal, registration: reg }, "2026-10-10");
    expect(s).toMatchObject({ state: "active", expirationDate: "2041-03-15", holder: "데모액추에이터 주식회사", paidThroughAnnual: 3, eventCount: 2, lastEventDate: "2023-11-20" });
    expect(s.label).toBe("등록 존속 중 · 만료 예정 2041-03-15");
  });
  test("소멸 기록이 있으면 소멸로 요약", () => {
    const s = summarizeRights({ legal, registration: { ...reg, terminationDate: "2025-01-02", terminationCause: "연차료 불납" } }, "2026-10-10");
    expect(s.state).toBe("terminated");
    expect(s.label).toContain("2025-01-02");
  });
  test("만료일이 지났으면 expired", () => {
    expect(summarizeRights({ legal, registration: { ...reg, expirationDate: "2020-01-01" } }, "2026-10-10").state).toBe("expired");
  });
  test("등록 전(공개 단계)이면 pending, 기록이 없으면 unknown", () => {
    const pending = { header: {}, events: [legal.events[0]] };
    expect(summarizeRights({ legal: pending, registration: null }).state).toBe("pending");
    expect(summarizeRights({ legal: { header: {}, events: [] }, registration: null }).state).toBe("unknown");
  });
  test("등록번호는 있는데 등록사항을 못 받았으면 registered_unchecked", () => {
    expect(summarizeRights({ legal, registration: null }).state).toBe("registered_unchecked");
  });
  test("요약 문구에 권리 판단 표현이 없다", () => {
    for (const r of [reg, { ...reg, terminationDate: "2025-01-02", terminationCause: "연차료 불납" }, { ...reg, expirationDate: "2020-01-01" }]) {
      expect(summarizeRights({ legal, registration: r }, "2026-10-10").label).not.toMatch(/침해|무효|회피/);
    }
  });
});

describe("상품 미승인 안내", () => {
  test("인증 오류에는 신청 상태 확인 안내가 붙는다", async () => {
    const c = createRightsClient({ key: "abcdef123456", fetchImpl: async () => ({ ok: true, status: 200, text: async () => fx("kipo-auth-error.xml") }) });
    await expect(c.legal("1020210900001")).rejects.toThrow(/이용 신청이 승인됐는지/);
  });
  test("호출 주소는 openapi/rest 서비스 경로, 키는 accessKey", async () => {
    let url;
    const c = createRightsClient({ key: "abcdef123456", fetchImpl: async u => { url = new URL(u); return { ok: true, status: 200, text: async () => fx("registration.xml") }; } });
    await c.registration("1099000000001");
    expect(url.pathname).toBe("/openapi/rest/RegistrationService/registrationInfo");
    expect(url.searchParams.get("registrationNumber")).toBe("1099000000001");
    expect(url.searchParams.get("accessKey")).toBe("abcdef123456");
  });
});
