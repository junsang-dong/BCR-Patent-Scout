// npm run db:migrate — DATABASE_URL(Neon) 또는 로컬 PGlite에 db/migrations/*.sql 적용
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { query, dbKind } = await import("../server/db.js");
const { migrate } = await import("../server/db.js");
const kind = await dbKind();
const applied = await migrate((t, p) => query(t, p));
console.log(`[${kind}] 적용한 마이그레이션: ${applied.length ? applied.join(", ") : "없음 (이미 최신)"}`);
process.exit(0);
