// POST /api/auth { accessCode } → httpOnly 쿠키. GET은 로그인 필요 여부와 상태를 알려 준다.
import { z } from "zod";
import { handle, methodNotAllowed } from "../server/http.js";
import { ApiError } from "../server/errors.js";
import { accessMode, checkCode, makeToken, sessionCookie, verifyToken } from "../server/guard.js";

export default handle(async (req, res) => {
  if (req.method === "GET") {
    const mode = accessMode();
    const m = (req.headers.cookie ?? "").match(/(?:^|;\s*)bcr_scout=([^;]+)/);
    return { required: mode !== "open", authenticated: mode === "open" || verifyToken(m ? decodeURIComponent(m[1]) : null) };
  }
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", "bcr_scout=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return { ok: true };
  }
  if (req.method !== "POST") throw methodNotAllowed(req);
  if (accessMode() !== "code") throw new ApiError(503, "not_configured", "접근 코드가 설정되지 않았습니다.");
  const { accessCode } = z.object({ accessCode: z.string().max(200) }).parse(req.body ?? {});
  if (!checkCode(accessCode)) throw new ApiError(401, "unauthorized", "접근 코드가 맞지 않습니다.");
  res.setHeader("Set-Cookie", sessionCookie(makeToken()));
  return { ok: true };
}, { open: true });
