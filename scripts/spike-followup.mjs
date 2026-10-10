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


console.log("== 후속 1: 제목+요약 조합이 정말 AND로 동작하는가");
await count("제목 관절 + 요약 로봇", { inventionTitle: "관절", astrtCont: "로봇" });
await count("제목 감속기 + 요약 파동기어", { inventionTitle: "감속기", astrtCont: "파동기어" });
await count("제목 액추에이터 + 요약 파동기어", { inventionTitle: "액추에이터", astrtCont: "파동기어" });
await count("제목 관절 + 요약 하모닉", { inventionTitle: "관절", astrtCont: "하모닉" });
await count("제목 관절 + 요약 브레이크", { inventionTitle: "관절", astrtCont: "브레이크" });

console.log("\n== 후속 2: 앱이 만드는 기본 검색식 (A200 요소 7개, 기간 2016~2026 서버 필터)");
const D = "20160101~20261231";
const Q = [
  ["a200-struct", { inventionTitle: "관절", astrtCont: "관절 모듈", ipcNumber: "B25J" }],
  ["a200-reducer", { inventionTitle: "관절", astrtCont: "파동기어", ipcNumber: "F16H" }],
  ["a200-encoder", { inventionTitle: "관절", astrtCont: "엔코더", ipcNumber: "G01D" }],
  ["a200-sto", { inventionTitle: "관절", astrtCont: "토크 차단", ipcNumber: "B25J" }],
  ["a200-brake", { inventionTitle: "관절", astrtCont: "브레이크", ipcNumber: "F16D" }],
  ["a200-ip65", { inventionTitle: "관절", astrtCont: "방수" }],
  ["a200-comm", { inventionTitle: "관절", astrtCont: "이더캣" }],
  ["x reducer×brake", { inventionTitle: "관절", astrtCont: "파동기어 브레이크", ipcNumber: "F16H" }]
];
for (const [n, q] of Q) await count(n, { ...q, applicationDate: D });

console.log("\n== 후속 3: 제목 없이 요약 + IPC 만");
await count("요약 파동기어 + 기간", { astrtCont: "파동기어", applicationDate: D });
await count("요약 브레이크 + IPC B25J + 기간", { astrtCont: "브레이크", ipcNumber: "B25J", applicationDate: D });
console.log(`\n총 호출 약 ${calls}회`);
