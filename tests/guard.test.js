import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { makeToken, verifyToken, checkCode, accessMode, requireAccess } from "../server/guard.js";
import { scrubAll } from "../server/http.js";

const saved = { ...process.env };
beforeEach(() => { process.env.APP_SESSION_SECRET = "test-secret"; process.env.APP_ACCESS_CODE = "open-sesame-123"; });
afterEach(() => { process.env = { ...saved }; });

describe("접근 보호 (명세 8.1)", () => {
  test("서명된 토큰만 통과하고, 변조·만료는 거부", () => {
    const t = makeToken();
    expect(verifyToken(t)).toBe(true);
    const [p, s] = t.split(".");
    expect(verifyToken(`${p}.${s.slice(0, -2)}xx`)).toBe(false);
    expect(verifyToken(`${Buffer.from('{"exp":9999999999999}').toString("base64url")}.${s}`)).toBe(false);
    expect(verifyToken(makeToken(Date.now() - 13 * 3600 * 1000))).toBe(false);
    expect(verifyToken(null)).toBe(false);
  });
  test("접근 코드 비교", () => {
    expect(checkCode("open-sesame-123")).toBe(true);
    expect(checkCode("open-sesame-124")).toBe(false);
    expect(checkCode("")).toBe(false);
  });
  test("코드가 설정되면 쿠키 없는 요청은 401", () => {
    expect(accessMode()).toBe("code");
    expect(() => requireAccess({ headers: {} })).toThrow(/접근 코드/);
    expect(() => requireAccess({ headers: { cookie: `bcr_scout=${encodeURIComponent(makeToken())}` } })).not.toThrow();
  });
  test("운영에서 코드가 없으면 막고, 개발에서는 열어 둔다", () => {
    delete process.env.APP_ACCESS_CODE;
    process.env.NODE_ENV = "test";
    expect(accessMode()).toBe("open");
    process.env.VERCEL_ENV = "production";
    expect(accessMode()).toBe("misconfigured");
    expect(() => requireAccess({ headers: {} })).toThrow(/APP_ACCESS_CODE/);
  });
});

describe("로그·응답에서 비밀 지우기", () => {
  test("환경변수에 있는 비밀 값과 인코딩된 값이 지워진다", () => {
    process.env.KIPRIS_API_KEY = "o8J=abc/DEF+secretvalue=";
    const out = scrubAll(`fail ?ServiceKey=${encodeURIComponent(process.env.KIPRIS_API_KEY)} raw=${process.env.KIPRIS_API_KEY}`);
    expect(out).not.toContain("secretvalue");
    expect(out).not.toContain(encodeURIComponent("secretvalue"));
  });
});
