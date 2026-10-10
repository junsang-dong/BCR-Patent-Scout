// 접근 보호와 비용 한도 (명세 8.1)
// 사내 MVP용 공용 접근 코드 → 서명된 httpOnly 쿠키. 정식 운영 전 SSO로 교체한다.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.js";
import { query } from "./db.js";

const COOKIE = "bcr_scout";
const MAX_AGE_S = 60 * 60 * 12;

const isProd = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

function secret() {
  const s = process.env.APP_SESSION_SECRET;
  if (!s) {
    if (isProd()) throw new ApiError(503, "not_configured", "APP_SESSION_SECRET이 설정되지 않았습니다.");
    return "dev-only-secret";
  }
  return s;
}

const sign = payload => createHmac("sha256", secret()).update(payload).digest("base64url");

export function makeToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + MAX_AGE_S * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig ?? "");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > now; } catch { return false; }
}

function cookieOf(req) {
  const m = (req.headers.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// 접근 코드가 없고 운영이 아니면 열어 둔다(로컬 개발). 운영에서 코드가 없으면 막는다.
export function accessMode() {
  if (process.env.APP_ACCESS_CODE) return "code";
  return isProd() ? "misconfigured" : "open";
}

export function requireAccess(req) {
  const mode = accessMode();
  if (mode === "open") return;
  if (mode === "misconfigured") throw new ApiError(503, "not_configured", "APP_ACCESS_CODE가 설정되지 않았습니다.");
  if (!verifyToken(cookieOf(req))) throw new ApiError(401, "unauthorized", "접근 코드를 입력하세요.");
}

export function checkCode(code) {
  const want = Buffer.from(process.env.APP_ACCESS_CODE ?? "");
  const got = Buffer.from(String(code ?? ""));
  return want.length > 0 && want.length === got.length && timingSafeEqual(want, got);
}

export function sessionCookie(token) {
  const secure = isProd() ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}${secure}`;
}

// 하루 호출 횟수 (app_settings에 날짜별 카운터). 한도를 넘으면 429
export async function bumpDaily(kind, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await query(
    `insert into app_settings (key, value) values ($1, to_jsonb(1))
     on conflict (key) do update set value = to_jsonb((app_settings.value #>> '{}')::int + 1), updated_at = now()
     returning (value #>> '{}')::int as n`,
    [`daily:${kind}:${day}`]
  );
  const n = rows[0].n;
  if (n > limit) throw new ApiError(429, "daily_limit", `오늘의 ${kind} 호출 한도(${limit}회)를 넘었습니다. 내일 다시 시도하거나 운영자에게 한도 조정을 요청하세요.`);
  return n;
}

// 월 호출 횟수 (등록사항 API는 공공데이터포털 안내 기준 월 1,000건 무료. 여유를 두고 기본 900)
export async function bumpMonthly(kind, limit) {
  const month = new Date().toISOString().slice(0, 7);
  const rows = await query(
    `insert into app_settings (key, value) values ($1, to_jsonb(1))
     on conflict (key) do update set value = to_jsonb((app_settings.value #>> '{}')::int + 1), updated_at = now()
     returning (value #>> '{}')::int as n`,
    [`monthly:${kind}:${month}`]
  );
  if (rows[0].n > limit) throw new ApiError(429, "monthly_limit", `이번 달 ${kind} 호출 한도(${limit}회)를 넘었습니다. 운영자에게 한도 조정을 요청하세요.`);
  return rows[0].n;
}

export const limits = () => ({
  kipris: Number(process.env.KIPRIS_DAILY_LIMIT ?? 300),
  reports: Number(process.env.LLM_DAILY_REPORTS ?? 30),
  registrationMonthly: Number(process.env.KIPRIS_REGISTRATION_MONTHLY_LIMIT ?? 900)
});
