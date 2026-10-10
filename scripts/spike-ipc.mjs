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


const D = "20160101~20261231";
const T = [
  ["STRUCT 관절 모듈", [["B25J"], ["B25J 17"], ["B25J 9"], ["B25J 19"], ["H02K 7/116"]]],
  ["REDUCER 파동기어", [["F16H"], ["F16H 49"], ["F16H 1"], ["B25J 9"], ["B25J"]]],
  ["ENCODER 엔코더", [["G01D"], ["G01D 5"], ["H02K 11"], ["B25J 13"], ["B25J 19"]]],
  ["STO 안전 정지", [["B25J 19"], ["B25J 9"], ["G05B 9"], ["B25J 13"]]],
  ["BRAKE 브레이크", [["B25J 19"], ["B25J 9"], ["H02K 7/102"], ["F16D 55"], ["F16D 65"], ["F16D"]]],
  ["IP65 방수", [["B25J 19"], ["B25J 19/0075"], ["F16J 15"], ["H02K 5"]]],
  ["COMM 이더캣", [["B25J 9"], ["H04L 12"], ["G05B 19"]]]
];
const KW = { "STRUCT 관절 모듈": "관절 모듈", "REDUCER 파동기어": "파동기어", "ENCODER 엔코더": "엔코더", "STO 안전 정지": "안전 정지", "BRAKE 브레이크": "브레이크", "IP65 방수": "방수", "COMM 이더캣": "이더캣" };
for (const [name, ipcs] of T) {
  console.log("\n== " + name);
  for (const [ipc] of ipcs) await count(`요약 ${KW[name]} + IPC ${ipc}`, { astrtCont: KW[name], ipcNumber: ipc, applicationDate: D });
}
console.log(`\n총 호출 ${calls}회`);
