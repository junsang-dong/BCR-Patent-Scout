// npm run check:bundle — 빌드 결과물(dist)에 키 문자열이 없는지 확인한다 (명세 AT-9)
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

if (!existsSync("dist")) { console.error("dist/ 가 없습니다. 먼저 npm run build 를 실행하세요."); process.exit(2); }

function walk(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// 1) 환경변수에 실제로 들어 있는 비밀 값  2) 흔한 키 모양
const names = ["KIPRIS_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "APP_ACCESS_CODE", "APP_SESSION_SECRET"];
const values = names.map(n => [n, process.env[n]]).filter(([, v]) => v && v.length >= 6);
const patterns = [[/sk-ant-[A-Za-z0-9_-]{10,}/, "Anthropic 키 모양"], [/sk-[A-Za-z0-9]{20,}/, "OpenAI 키 모양"], [/postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/, "DB 연결 문자열"]];

let bad = 0;
for (const f of walk("dist")) {
  const s = readFileSync(f, "utf8");
  for (const [n, v] of values) if (s.includes(v) || s.includes(encodeURIComponent(v))) { console.error(`✗ ${f}: ${n} 값이 들어 있습니다.`); bad++; }
  for (const [re, label] of patterns) if (re.test(s)) { console.error(`✗ ${f}: ${label}`); bad++; }
  for (const n of names) if (s.includes(`VITE_${n}`)) { console.error(`✗ ${f}: VITE_${n} 참조`); bad++; }
}
console.log(bad ? `실패: ${bad}건` : `통과: dist/ 의 ${walk("dist").length}개 파일에서 키 문자열을 찾지 못했습니다. (검사한 비밀 값 ${values.length}개)`);
process.exit(bad ? 1 : 0);
