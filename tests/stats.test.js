import { test } from "vitest";
import assert from "node:assert/strict";
import { normalizeApplicant, splitIpc, ipcSubclass, ipcMainGroup, computeStats, toCsv, dedupe } from "../server/kipris/stats.js";

const rec = (no, date, app, ipc, status = "공개") => ({ applicationNumber: no, applicationDate: date, applicantName: app, ipcNumber: ipc, registerStatus: status, inventionTitle: `t${no}` });

test("출원인 표기 차이를 묶는다", () => {
  assert.equal(normalizeApplicant("데모액추에이터 주식회사"), "데모액추에이터");
  assert.equal(normalizeApplicant("(주)데모액추에이터"), "데모액추에이터");
  assert.equal(normalizeApplicant("㈜데모액추에이터"), "데모액추에이터");
  assert.equal(normalizeApplicant("DemoMotion Co., Ltd."), "DemoMotion");
  assert.equal(normalizeApplicant(null), "(출원인 없음)");
});

test("IPC 분해: 서브클래스·주 그룹", () => {
  assert.deepEqual(splitIpc("B25J 9/12|H02K 7/116"), ["B25J 9/12", "H02K 7/116"]);
  assert.deepEqual(splitIpc("B25J 9/12(2006.01), F16H 49/00(2006.01)"), ["B25J 9/12", "F16H 49/00"]);
  assert.equal(ipcSubclass("B25J 9/12"), "B25J");
  assert.equal(ipcMainGroup("B25J 9/12"), "B25J 9");
  assert.equal(ipcMainGroup("H02K11/21"), "H02K 11");
});

test("중복 출원번호는 한 번만 센다", () => {
  assert.equal(dedupe([rec("1", "2020-01-01", "A", "B25J 9/12"), rec("1", "2020-01-01", "A", "B25J 9/12")]).length, 1);
});

test("집계: 연도·출원인·주 분류·최근 3년 대 직전 3년", () => {
  const rs = [
    rec("1", "2019-02-01", "알파 주식회사", "B25J 9/12"),
    rec("2", "2021-02-01", "(주)알파", "B25J 9/12"),
    rec("3", "2024-05-01", "알파 주식회사", "H02K 7/116"),
    rec("4", "2025-05-01", "베타 Inc.", "F16H 49/00", "등록"),
    rec("5", "2025-06-01", "베타 Inc.", "B25J 17/00")
  ];
  const s = computeStats(rs, { asOf: "2026-10-09" });
  assert.equal(s.total_records, 5);
  assert.deepEqual(s.year_range, [2019, 2025]);
  const alpha = s.top_applicants.find(a => a.applicant === "알파");
  assert.equal(alpha.count, 3);
  assert.equal(alpha.recent_count, 1);   // 2023~2025
  assert.equal(alpha.prior_count, 1);    // 2020~2022
  assert.deepEqual(alpha.name_variants.sort(), ["(주)알파", "알파 주식회사"].sort());
  assert.equal(s.by_ipc_group[0].code, "B25J 9");
  assert.equal(s.by_status.find(x => x.status === "등록").count, 1);
  assert.ok(s.caveats.some(c => c.includes("18개월")));
});

test("출원인 × IPC 매트릭스 행·열 크기가 맞는다", () => {
  const s = computeStats([rec("1", "2020-01-01", "A", "B25J 9/12"), rec("2", "2021-01-01", "B", "H02K 7/116")]);
  const m = s.applicant_ipc_matrix;
  assert.equal(m.rows.length, 2);
  for (const r of m.rows) assert.equal(r.cells.length, m.groups.length);
});

test("CSV는 쉼표·따옴표를 안전하게 처리한다", () => {
  const csv = toCsv([{ ...rec("1", "2020-01-01", 'A, "B"', "B25J"), inventionTitle: "x" }]);
  assert.ok(csv.includes('"A, ""B"""'));
});
