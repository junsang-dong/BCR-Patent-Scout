// M0 Spike 실측 (docs/spike.md). 실제 KIPRIS를 소수 호출하고 건수·응답 시간만 출력한다. 키는 출력하지 않는다.
import { readFileSync } from "node:fs";
import { createClient, KiprisError } from "../server/kipris/kipris.js";
import { normalizeKey, scrub } from "../server/kipris/env.js";

const env = {};
for (const l of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !l.trim().startsWith("#")) env[m[1]] = m[2]; }
const key = normalizeKey(env.KIPRIS_API_KEY);
if (!key) { console.error("KIPRIS_API_KEY가 비어 있습니다."); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;
const mk = (scheme = "http", gateway = "kipo") => createClient({ key, gateway, scheme, pauseMs: 250 });

async function count(label, q, { scheme, gateway, sample = 0 } = {}) {
  const t0 = Date.now();
  calls++;
  try {
    const r = await mk(scheme, gateway).search({ patent: "true", utility: "false", ...q }, { max: Math.max(1, sample), pageSize: Math.max(1, sample) });
    console.log(`${label.padEnd(44)} 전체 ${String(r.totalCount).padStart(6)}건  ${Date.now() - t0}ms  [${r.gateway}]`);
    await sleep(300);
    return r;
  } catch (e) {
    console.log(`${label.padEnd(44)} 오류(${e instanceof KiprisError ? e.kind : "?"}): ${scrub(e.message, key).slice(0, 160)}`);
    await sleep(300);
    return null;
  }
}

console.log("== S1 게이트웨이");
await count("kipo / http · 관절", { inventionTitle: "관절" });

console.log("\n== S2 IPC 서브클래스·조합");
await count("제목 관절", { inventionTitle: "관절" });
await count("IPC B25J 만", { ipcNumber: "B25J" });
await count("제목 관절 + IPC B25J", { inventionTitle: "관절", ipcNumber: "B25J" });
await count("IPC B25J 9", { ipcNumber: "B25J 9" });
await count("IPC B25J 9/12", { ipcNumber: "B25J 9/12" });
await count("요약 파동기어", { astrtCont: "파동기어" });
await count("제목 관절 + 요약 파동기어", { inventionTitle: "관절", astrtCont: "파동기어" });
await count("제목 관절 + 요약 파동기어 + IPC F16H", { inventionTitle: "관절", astrtCont: "파동기어", ipcNumber: "F16H" });
await count("요약 파동기어 + IPC F16H", { astrtCont: "파동기어", ipcNumber: "F16H" });

console.log("\n== S3 한 항목에 여러 단어");
await count("요약 하모닉", { astrtCont: "하모닉" });
await count("요약 브레이크", { astrtCont: "브레이크" });
await count("요약 '파동기어 브레이크'", { astrtCont: "파동기어 브레이크" });
await count("요약 '하모닉 브레이크'", { astrtCont: "하모닉 브레이크" });
await count("요약 '브레이크 파동기어' (순서 바꿈)", { astrtCont: "브레이크 파동기어" });
await count("요약 '파동기어+브레이크'", { astrtCont: "파동기어*브레이크" });

console.log("\n== S4 출원일 범위");
await count("제목 관절 (기간 없음)", { inventionTitle: "관절" });
await count("applicationDate 20200101~20201231", { inventionTitle: "관절", applicationDate: "20200101~20201231" });

console.log("\n== S5 https");
await count("https · 제목 관절", { inventionTitle: "관절" }, { scheme: "https" });

console.log("\n== 응답 형식 확인 (실제 5건, 파서 시험)");
const s = await count("제목 관절 + IPC B25J, 5건", { inventionTitle: "관절", ipcNumber: "B25J" }, { sample: 5 });
for (const it of s?.items ?? []) console.log(" ", it.applicationNumber, "|", it.applicationDate, "|", (it.inventionTitle ?? "").slice(0, 26), "|", it.applicantName, "|", it.ipcNumber, "|", it.registerStatus);

console.log("\n== 서지 상세 (삼성전자 1020130119441)");
try {
  calls++; const t0 = Date.now();
  const d = await mk().detail("1020130119441");
  console.log(`  ${Date.now() - t0}ms · 제목 ${d.inventionTitle} · 상태 ${d.registerStatus} · IPC ${d.ipc.length}개 · 청구항 ${d.claims.length}개 · 출원인 ${d.applicants.map(a => a.name).join(",")} · 패밀리 ${d.family.length}`);
  console.log("  첫 청구항:", (d.claims[0] ?? "").slice(0, 90));
} catch (e) { console.log("  오류:", scrub(e.message, key).slice(0, 200)); }

console.log("\n== S8 수집 시간 (200건, 100건씩 2페이지)");
{ const t0 = Date.now(); calls++;
  try { const r = await mk().search({ patent: "true", utility: "false", inventionTitle: "관절", ipcNumber: "B25J" }, { max: 200, pageSize: 100 });
    console.log(`  전체 ${r.totalCount}건 중 ${r.fetched}건 수집 · ${Date.now() - t0}ms`); }
  catch (e) { console.log("  오류:", scrub(e.message, key).slice(0, 200)); } }

console.log(`\n총 호출 약 ${calls}회 (수집 시 페이지 수 별도)`);
