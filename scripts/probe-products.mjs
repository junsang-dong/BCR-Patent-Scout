// 16번(법적 상태 이력 ST.27)·17번(등록사항) API 형식 확인용 — 호출 1회씩, 응답의 머리말과 태그 이름만 출력한다.
import { readFileSync } from "node:fs";
import { normalizeKey, scrub } from "../server/kipris/env.js";
const env = {};
for (const l of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*([^#\s]*)/); if (m && !l.trim().startsWith("#")) env[m[1]] = m[2]; }
const key = normalizeKey(env.KIPRIS_API_KEY);
const base = "https://plus.kipris.or.kr/openapi/rest";
async function probe(label, service, op, params, keyParam = "accessKey") {
  const qs = new URLSearchParams({ ...params, [keyParam]: key });
  const url = `${base}/${service}/${op}?${qs}`;
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Accept: "application/xml" } });
  const body = await res.text();
  const tags = [...new Set([...body.matchAll(/<([A-Za-z][A-Za-z0-9]*)[ >\/]/g)].map(m => m[1]))];
  const get = t => (body.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) ?? [])[1];
  console.log(`\n[${label}] HTTP ${res.status} · ${Date.now() - t0}ms · ${body.length}자`);
  console.log("  successYN:", get("successYN"), "· resultCode:", get("resultCode"), "· resultMsg:", get("resultMsg"));
  console.log("  태그:", tags.slice(0, 40).join(", "));
  if (process.argv[2] === "raw") console.log(scrub(body.slice(0, 1500), key));
  return body;
}
const sam = "1020130119441";
await probe("법적 상태 ST.27 (삼성 출원번호)", "legStatusST27InfoSearchService", "BasicInfo", { applicationNumber: sam });
await new Promise(r => setTimeout(r, 400));
await probe("등록사항 (삼성 등록번호 1020616930000)", "RegistrationService", "registrationInfo", { registrationNumber: "1020616930000" });
