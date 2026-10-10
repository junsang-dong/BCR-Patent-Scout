// 모든 /api 핸들러가 쓰는 공통 래퍼: 접근 확인 · 오류 형식 · 키 지우기
import { ApiError } from "./errors.js";
import { requireAccess } from "./guard.js";
import { ZodError } from "zod";

const secrets = () =>
  ["KIPRIS_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "APP_ACCESS_CODE", "APP_SESSION_SECRET"]
    .map(k => process.env[k]).filter(v => v && v.length >= 6);

// 응답과 로그에 비밀 값이 섞여 나가지 않게 지운다
export function scrubAll(text) {
  let t = String(text ?? "");
  for (const s of secrets()) for (const v of [s, encodeURIComponent(s)]) t = t.split(v).join("***");
  return t;
}

export function handle(fn, { open = false } = {}) {
  return async function handler(req, res) {
    try {
      if (!open) requireAccess(req);
      const out = await fn(req, res);
      if (out !== undefined && !res.writableEnded) res.status(200).json(out);
    } catch (e) {
      let status = 500, code = "internal", message = "서버 오류가 발생했습니다.";
      if (e instanceof ApiError) ({ status, code, message } = e);
      else if (e instanceof ZodError) { status = 400; code = "invalid_input"; message = e.issues.map(i => `${i.path.join(".") || "입력"}: ${i.message}`).join("; "); }
      else if (e?.kind) { status = e.kind === "auth" ? 502 : e.kind === "config" ? 503 : 502; code = `kipris_${e.kind}`; message = e.message; }
      else if (e?.message) message = e.message;
      console.error(`[api] ${req.method} ${(req.url ?? "").split("?")[0]} → ${status} ${code}: ${scrubAll(e?.message)}`);
      if (!res.writableEnded) res.status(status).json({ error: { code, message: scrubAll(message) } });
    }
  };
}

export const methodNotAllowed = req => new ApiError(405, "method_not_allowed", `${req.method} 메서드는 지원하지 않습니다.`);
