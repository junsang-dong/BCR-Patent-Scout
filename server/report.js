// 보고서 조립과 자동 검증 (명세 7.3, 7.4) — 순수 함수

import { RESEARCH_TYPES, DRAFT_LINE, LIMITS } from "../shared/constants.js";

const cell = v => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function queryCondition(q) {
  const parts = [];
  if (q.inventionTitle) parts.push(`제목 "${q.inventionTitle}"`);
  if (q.astrtCont) parts.push(`요약 "${q.astrtCont}"`);
  if (q.ipcNumber) parts.push(`IPC ${q.ipcNumber}`);
  return parts.join(" + ") || "(조건 없음)";
}

// 공통 머리말은 서버가 데이터로 직접 만든다 (AI가 바꾸지 못하게)
export function renderHeader(snap, { provider, model, createdAt }) {
  const t = RESEARCH_TYPES[snap.research_type];
  const h = snap.header_facts;
  const rows = h.queries.map(q =>
    `| ${cell(q.name)} | ${cell(queryCondition(q))} | ${q.total_count ?? "-"} | ${q.fetched ?? "-"}${q.truncated ? " (잘림)" : ""} |`).join("\n");
  const features = snap.features.map(f => f.label).join(", ");
  return `${DRAFT_LINE}

# ${snap.project.title} — ${t.name} 리서치 보고서

## 머리말

| 항목 | 내용 |
|---|---|
| 조사 목적 | ${cell(snap.project.product_code)} ${cell(snap.project.product_name)}의 기술 요소(${cell(features)})와 유사한 특허 조사 |
| 리서치 유형 | ${t.name} — ${t.question} |
| 조사 범위 | 한국 특허${h.include_utility ? "·실용신안" : ""}, 출원연도 ${h.period.from ?? "-"}~${h.period.to ?? "-"}, 대상 제품 ${cell(snap.project.product_code)} |
| 데이터 출처 | KIPRIS Plus Open API, 게이트웨이 ${cell(h.gateway ?? "-")}, 수집일 ${cell(h.collected_at ?? "-")} |
| 분석 대상 건수 | ${snap.stats.total_records}건 (중복 제거 후), 핀 고정 ${h.pinned_count}건, 유사성 평가 ${h.evaluated_count}건 |
| 생성 | ${cell(provider)} / ${cell(model)}, ${cell(createdAt)} |

### 검색식

| 이름 | 조건 | 전체 건수 | 수집 건수 |
|---|---|---|---|
${rows}

### 한계

${LIMITS.map(l => `- ${l}`).join("\n")}
`;
}

export function assemble(snap, body, meta) {
  let text = String(body ?? "").trim();
  // AI가 머리말이나 초안 표시를 붙였으면 걷어 낸다 (서버가 붙인다)
  text = text.split("\n").filter(l => l.trim() !== DRAFT_LINE).join("\n").trim();
  return `${renderHeader(snap, meta)}\n${text}\n`;
}

// ---- 검증 ----

const APP_NO = /(?<!\d)(\d{2}-\d{4}-\d{7}|\d{13})(?!\d)/g;
const FORBIDDEN = ["침해", "무효", "회피 가능", "회피가능", "권리 범위에 속", "권리범위에 속", "FTO 문제 없"];
const HEADER_ITEMS = ["조사 목적", "리서치 유형", "조사 범위", "검색식", "데이터 출처", "분석 대상 건수", "한계"];

function numbersIn(value, out = []) {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach(v => numbersIn(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => numbersIn(v, out));
  return out;
}

export function validateReport({ markdown, snapshot, knownNumbers }) {
  const warnings = [];
  const lines = markdown.split("\n");
  const add = (type, message, line = null) => warnings.push({ id: `w${warnings.length + 1}`, type, message, line, acknowledged: false });

  // 1. 출원번호 실재
  const known = new Set([...knownNumbers].map(n => n.replace(/-/g, "")));
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(APP_NO)) {
      const raw = m[1].replace(/-/g, "");
      if (!known.has(raw)) add("application_number", `이 조사에 없는 번호 ${m[1]}`, i + 1);
    }
  });

  // 2. 수치 근거 ("N건", "N%")
  const nums = numbersIn(snapshot);
  const ints = new Set(nums.filter(Number.isInteger));
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(/(\d+(?:\.\d+)?)\s*(건|%)/g)) {
      const v = Number(m[1]);
      const ok = m[2] === "건" ? ints.has(v) : nums.some(n => Math.abs(n - v) <= 0.1);
      if (!ok) add("number", `근거 없는 수치 "${m[0]}"`, i + 1);
    }
  });

  // 3. 금지 표현
  lines.forEach((ln, i) => {
    for (const w of FORBIDDEN) if (ln.includes(w)) add("forbidden", `금지 표현 "${w}"`, i + 1);
  });

  // 4. 머리말
  const head = markdown.split(/\n##? (?!머리말)/)[0] ?? markdown;
  for (const item of HEADER_ITEMS) if (!head.includes(item) && !markdown.includes(item)) add("header", `머리말 항목 없음: ${item}`);

  // 5. 초안 표시 (없으면 서버가 삽입하므로 경고가 아니라 보정)
  let fixed = markdown;
  let draftInserted = false;
  if (lines[0].trim() !== DRAFT_LINE) {
    fixed = `${DRAFT_LINE}\n\n${markdown}`;
    draftInserted = true;
  }
  return { markdown: fixed, warnings, draft_inserted: draftInserted, checked_at: new Date().toISOString() };
}

export function canApprove(validation) {
  return (validation?.warnings ?? []).every(w => w.acknowledged);
}
