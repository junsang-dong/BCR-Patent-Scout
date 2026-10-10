// KIPRIS 클라이언트를 환경에 맞게 만든다 (키·게이트웨이·mock) — 키는 서버 환경변수에서만 읽는다
import { createClient, KiprisError } from "./kipris.js";
import { normalizeKey } from "./env.js";
import { mockFetch } from "./mock.js";
import { createRightsClient } from "./rights.js";
import { query } from "../db.js";

export const isMock = () => process.env.KIPRIS_MOCK === "1";

export function kiprisStatus() {
  if (isMock()) return "mock";
  return process.env.KIPRIS_API_KEY ? "configured" : "not_configured";
}

export async function makeClient() {
  const mock = isMock();
  const key = mock ? "mock-key-not-real" : normalizeKey(process.env.KIPRIS_API_KEY);
  if (!key) throw new KiprisError("KIPRIS 키가 설정되지 않았습니다. 운영자에게 KIPRIS_API_KEY 설정을 요청하세요.", { kind: "config" });
  let gateway = (process.env.KIPRIS_GATEWAY ?? "auto").toLowerCase();
  if (gateway === "auto") {
    const rows = await query("select value #>> '{}' as gw from app_settings where key = 'kipris_gateway'");
    if (rows[0]?.gw) gateway = rows[0].gw; // 이전에 판별한 게이트웨이를 재사용
  }
  const client = createClient({
    key, gateway,
    scheme: (process.env.KIPRIS_SCHEME ?? "https").toLowerCase(),
    fetchImpl: mock ? mockFetch() : fetch,
    pauseMs: mock ? 0 : 250
  });
  return client;
}

export async function rememberGateway(gw) {
  if (!gw) return;
  await query(
    `insert into app_settings (key, value) values ('kipris_gateway', to_jsonb($1::text))
     on conflict (key) do update set value = to_jsonb($1::text), updated_at = now()`, [gw]
  );
}

export function makeRightsClient() {
  const mock = isMock();
  const key = mock ? "mock-key-not-real" : normalizeKey(process.env.KIPRIS_API_KEY);
  if (!key) throw new KiprisError("KIPRIS 키가 설정되지 않았습니다. 운영자에게 KIPRIS_API_KEY 설정을 요청하세요.", { kind: "config" });
  return createRightsClient({ key, fetchImpl: mock ? mockFetch() : fetch });
}
