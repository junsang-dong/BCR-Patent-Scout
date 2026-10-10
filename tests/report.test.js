import { describe, test, expect } from "vitest";
import { validateReport, assemble, renderHeader, canApprove } from "../server/report.js";
import { DRAFT_LINE } from "../shared/constants.js";

const snap = {
  research_type: "rnd",
  project: { title: "A300 조사", product_code: "BCR-A200", product_name: "고하중 로봇 관절용 액추에이터" },
  features: [{ id: "A200-BRAKE", label: "무여자 브레이크 옵션" }],
  header_facts: {
    queries: [{ name: "a200-brake", inventionTitle: "관절", astrtCont: "브레이크", ipcNumber: "F16D", total_count: 42, fetched: 42, truncated: false }],
    gateway: "kipo", collected_at: "2026-10-10", period: { from: 2016, to: 2026 }, include_utility: false, pinned_count: 5, evaluated_count: 5
  },
  stats: { total_records: 42, top_applicants: [{ applicant: "가상", count: 10, share_pct: 23.8 }], by_year: [{ year: 2024, count: 8 }] },
  similarity: []
};
const meta = { provider: "anthropic", model: "m", createdAt: "2026-10-10" };
const known = new Set(["1020210900001", "1020220900002"]);

describe("보고서 머리말", () => {
  const md = assemble(snap, "## 1. 해결 과제\n본문", meta);
  test("첫 줄은 'AI 초안 — 검토 전', 머리말 7개 항목이 모두 있다 (AT-5)", () => {
    expect(md.split("\n")[0]).toBe(DRAFT_LINE);
    for (const item of ["조사 목적", "리서치 유형", "조사 범위", "검색식", "데이터 출처", "분석 대상 건수", "한계"]) expect(md).toContain(item);
    expect(md).toContain("| a200-brake | 제목 \"관절\" + 요약 \"브레이크\" + IPC F16D | 42 | 42 |");
  });
  test("AI가 붙인 초안 표시는 걷어 내고 서버가 한 번만 붙인다", () => {
    const m = assemble(snap, `${DRAFT_LINE}\n\n## 1. 해결 과제`, meta);
    expect(m.split(DRAFT_LINE).length - 1).toBe(1);
  });
  test("머리말 한계 문구에 금지 표현이 없다", () => {
    expect(validateReport({ markdown: renderHeader(snap, meta), snapshot: snap, knownNumbers: known }).warnings.filter(w => w.type === "forbidden")).toEqual([]);
  });
});

describe("자동 검증 (명세 7.4)", () => {
  const run = body => validateReport({ markdown: assemble(snap, body, meta), snapshot: snap, knownNumbers: known });

  test("깨끗한 본문은 경고가 없다", () => {
    const r = run("## 2. 비교\n10-2021-0900001 특허는 상위 출원인 비중 23.8%이고 10건입니다.\n1020220900002도 있습니다.");
    expect(r.warnings).toEqual([]);
  });

  test("조사에 없는 출원번호는 경고 (AT-6)", () => {
    const r = run("## 2. 비교\n1020999999999 특허를 봅니다.");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ type: "application_number", acknowledged: false });
    expect(r.warnings[0].message).toContain("1020999999999");
    expect(r.warnings[0].line).toBeGreaterThan(0);
  });

  test("하이픈 형식 번호도 같은 번호로 본다", () => {
    expect(run("## 2.\n10-2021-0900001").warnings).toEqual([]);
    expect(run("## 2.\n10-2021-0999999").warnings).toHaveLength(1);
  });

  test("stats에 없는 건수·비율은 경고, 0.1%p 이내는 허용", () => {
    expect(run("## 3.\n출원은 99건입니다.").warnings.map(w => w.type)).toEqual(["number"]);
    expect(run("## 3.\n비중 23.9%").warnings).toEqual([]);
    expect(run("## 3.\n비중 25%").warnings.map(w => w.type)).toEqual(["number"]);
    expect(run("## 3.\n분석 대상은 42건, 핀은 5건").warnings).toEqual([]);
  });

  test("금지 표현은 줄 번호와 함께 경고", () => {
    const r = run("## 4.\n이 특허는 침해 가능성이 있다.\n회피 가능하다.");
    expect(r.warnings.filter(w => w.type === "forbidden").map(w => w.message)).toEqual(['금지 표현 "침해"', '금지 표현 "회피 가능"']);
  });

  test("초안 표시가 없으면 서버가 넣는다", () => {
    const r = validateReport({ markdown: "# 제목\n조사 목적 리서치 유형 조사 범위 검색식 데이터 출처 분석 대상 건수 한계", snapshot: snap, knownNumbers: known });
    expect(r.markdown.split("\n")[0]).toBe(DRAFT_LINE);
    expect(r.draft_inserted).toBe(true);
  });

  test("머리말 항목이 빠지면 경고", () => {
    const r = validateReport({ markdown: `${DRAFT_LINE}\n\n# 제목\n본문`, snapshot: snap, knownNumbers: known });
    expect(r.warnings.filter(w => w.type === "header").length).toBe(7);
  });
});

describe("승인 조건", () => {
  test("경고를 모두 '확인함'으로 처리해야 승인할 수 있다", () => {
    expect(canApprove({ warnings: [] })).toBe(true);
    expect(canApprove({ warnings: [{ id: "w1", acknowledged: false }] })).toBe(false);
    expect(canApprove({ warnings: [{ id: "w1", acknowledged: true }, { id: "w2", acknowledged: false }] })).toBe(false);
    expect(canApprove({ warnings: [{ id: "w1", acknowledged: true }] })).toBe(true);
  });
});
