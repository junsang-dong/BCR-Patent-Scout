// Neon Postgres 연결 (명세 4.3)
// - DATABASE_URL이 있으면 Neon 서버리스 드라이버를 쓴다.
// - 없으면 로컬 개발용으로 PGlite(프로세스 안의 Postgres)를 .data/pglite 에 둔다. SQL은 같다.

import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let impl = null;

// 마이그레이션은 한 문장씩 실행한다 (Neon HTTP 드라이버는 한 번에 한 문장만 받는다)
export function splitSql(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

async function open() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return { kind: "neon", run: (text, params) => sql.query(text, params) };
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  // PGLITE_DIR=memory 는 시험용(저장 안 함). 기본은 .data/pglite
  let db;
  if (process.env.PGLITE_DIR === "memory") db = new PGlite();
  else {
    const dir = process.env.PGLITE_DIR || join(root, ".data", "pglite");
    mkdirSync(dir, { recursive: true });
    db = new PGlite(dir);
  }
  await db.waitReady;
  return { kind: "pglite", run: async (text, params) => (await db.query(text, params)).rows };
}

export async function migrate(run, dir = join(root, "db", "migrations")) {
  await run("create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())", []);
  const done = new Set((await run("select name from schema_migrations", [])).map(r => r.name));
  const applied = [];
  for (const f of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    for (const stmt of splitSql(readFileSync(join(dir, f), "utf8"))) await run(stmt, []);
    await run("insert into schema_migrations (name) values ($1)", [f]);
    applied.push(f);
  }
  return applied;
}

async function get() {
  if (!impl) {
    impl = open().then(async d => {
      // 로컬 PGlite는 처음 열 때 자동으로 마이그레이션한다. Neon은 `npm run db:migrate`로 따로 적용한다.
      if (d.kind === "pglite") await migrate(d.run);
      return d;
    });
  }
  return impl;
}

export async function query(text, params = []) {
  const d = await get();
  return d.run(text, params);
}

export async function dbKind() {
  return (await get()).kind;
}

// 날짜 컬럼을 드라이버와 상관없이 'YYYY-MM-DD' 문자열로 받는다
export const PATENT_COLS = `p.application_number, p.invention_title, p.applicant_name,
  to_char(p.application_date, 'YYYY-MM-DD') as application_date, p.ipc, p.register_status,
  p.open_number, to_char(p.open_date, 'YYYY-MM-DD') as open_date, p.register_number,
  to_char(p.register_date, 'YYYY-MM-DD') as register_date, p.abstract`;

export const toRecord = r => ({
  applicationNumber: r.application_number,
  inventionTitle: r.invention_title,
  applicantName: r.applicant_name,
  applicationDate: r.application_date,
  ipcNumber: r.ipc,
  registerStatus: r.register_status,
  openNumber: r.open_number,
  openDate: r.open_date,
  registerNumber: r.register_number,
  registerDate: r.register_date,
  abstract: r.abstract
});
