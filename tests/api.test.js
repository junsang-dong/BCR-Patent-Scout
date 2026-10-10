// API 통합 시험 — 메모리 PGlite + 가상 KIPRIS + 가짜 LLM으로 핸들러를 직접 호출한다
import { describe, test, expect, beforeAll } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
delete process.env.APP_ACCESS_CODE;
process.env.LLM_PROVIDER = "mock";
process.env.KIPRIS_MOCK = "1";

const { default: projects } = await import("../api/projects.js");
const { default: search } = await import("../api/kipris-search.js");
const { default: analyze } = await import("../api/analyze-similarity.js");
const { default: generateReport } = await import("../api/report-generate.js");
const { default: reports } = await import("../api/reports.js");
const { default: health } = await import("../api/health.js");
const { default: detail } = await import("../api/kipris-detail.js");
const { default: stats } = await import("../api/stats.js");
const { default: rights } = await import("../api/patent-rights.js");
const { default: catalog } = await import("../server/catalog.js");
const { generateQueries } = await import("../shared/queries.js");

async function call(handler, method, { query = {}, body } = {}) {
  const res = { statusCode: 200, headers: {}, writableEnded: false, body: null,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; this.writableEnded = true; return this; } };
  await handler({ method, query, body, headers: {}, url: "/api/x" }, res);
  return res;
}

let project, queries, nums;

beforeAll(async () => {
  const r = await call(projects, "POST", { body: { title: "시험 조사", productCode: "BCR-A200", researchType: "rnd" } });
  project = r.body;
  const g = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["A200-REDUCER", "A200-BRAKE"] });
  queries = g.queries;
  await call(projects, "POST", { query: { id: project.id, action: "keywords" }, body: { featureIds: ["A200-REDUCER", "A200-BRAKE"], queries } });
});

describe("조사와 검색", () => {
  test("health는 설정 상태만 알려 주고 키 값은 없다 (AT-8 형태)", async () => {
    const r = await call(health, "GET");
    expect(r.body).toMatchObject({ db: "ok", kipris: "mock", llm: { provider: "mock", configured: true } });
    expect(JSON.stringify(r.body)).not.toMatch(/key|secret/i);
  });

  test("잘못된 입력은 400과 설명 있는 오류", async () => {
    const r = await call(projects, "POST", { body: { title: "", productCode: "BCR-Z9", researchType: "rnd" } });
    expect(r.statusCode).toBe(400);
    expect(r.body.error.code).toBe("invalid_input");
  });

  test("검색식 하나씩 미리보기 → 수집, 중복은 합쳐진다 (AT-1)", async () => {
    for (const q of queries) {
      const pre = await call(search, "POST", { body: { projectId: project.id, query: q, preview: true } });
      expect(pre.statusCode).toBe(200);
      expect(pre.body.totalCount).toBeGreaterThan(0);
      const run = await call(search, "POST", { body: { projectId: project.id, query: q } });
      expect(run.body).toMatchObject({ kept: expect.any(Number), truncated: false, mock: true });
    }
    const list = await call(projects, "GET", { query: { id: project.id, action: "patents" } });
    nums = list.body.map(p => p.applicationNumber);
    expect(new Set(nums).size).toBe(nums.length);                       // 중복 제거
    expect(list.body[0].matchedQueries.length).toBeGreaterThanOrEqual(3); // 세 검색식에 모두 걸림
    const s = await call(stats, "GET", { query: { projectId: project.id } });
    expect(s.body.total_records).toBe(nums.length);
  });

  test("미리보기는 저장하지 않는다", async () => {
    const p = (await call(projects, "POST", { body: { title: "미리보기만", productCode: "BCR-A100", researchType: "planning" } })).body;
    await call(search, "POST", { body: { projectId: p.id, query: queries[0], preview: true } });
    const list = await call(projects, "GET", { query: { id: p.id, action: "patents" } });
    expect(list.body).toHaveLength(0);
  });

  test("수집된 적 없는 출원번호의 상세는 거부", async () => {
    const r = await call(detail, "POST", { body: { applicationNumber: "1099999999999" } });
    expect(r.statusCode).toBe(400);
  });

  test("KIPRIS 키가 없으면 검색은 503 config 오류 (AT-8)", async () => {
    const mock = process.env.KIPRIS_MOCK;
    delete process.env.KIPRIS_MOCK; delete process.env.KIPRIS_API_KEY;
    const r = await call(search, "POST", { body: { projectId: project.id, query: queries[0], preview: true } });
    process.env.KIPRIS_MOCK = mock;
    expect(r.statusCode).toBe(503);
    expect(r.body.error.code).toBe("kipris_config");
    expect((await call(health, "GET")).body.kipris).toBe("mock");
  });
});

describe("더 보기 (20건씩)와 권리 현황", () => {
  test("2쪽을 요청하면 다음 쪽을 받고 누적 수집 건수를 돌려준다", async () => {
    const p = (await call(projects, "POST", { body: { title: "더 보기", productCode: "BCR-A200", researchType: "planning" } })).body;
    const q = { ...queries[0], name: "paging" };
    const first = await call(search, "POST", { body: { projectId: p.id, query: q } });
    expect(first.body).toMatchObject({ page: 1, pageSize: 20, mock: true });
    const second = await call(search, "POST", { body: { projectId: p.id, query: q, page: 2 } });
    expect(second.statusCode).toBe(200);
    expect(second.body.page).toBe(2);
    expect(second.body.collected).toBeGreaterThan(first.body.collected);
    const detailRes = await call(projects, "GET", { query: { id: p.id } });
    expect(detailRes.body.collected.paging).toBe(second.body.collected);
    expect(detailRes.body.runs.map(r => r.query.page).sort()).toEqual([1, 2]);
  });

  test("검색식당 한도를 넘는 쪽은 거부", async () => {
    const q = { ...queries[0], name: "paging-limit", max: 40 };
    const r = await call(search, "POST", { body: { projectId: project.id, query: q, page: 3 } });
    expect(r.statusCode).toBe(400);
    expect(r.body.error.code).toBe("query_limit");
  });

  test("권리 현황: 법적 상태 + 등록사항을 조회하고 두 번째는 캐시 (16·17번)", async () => {
    const a = await call(rights, "POST", { body: { applicationNumber: nums[0] } });
    expect(a.statusCode, JSON.stringify(a.body)).toBe(200);
    expect(a.body.cached).toBe(false);
    expect(a.body.legal.events.length).toBeGreaterThan(0);
    expect(a.body.registration).toMatchObject({ expirationDate: "2041-03-15" });
    expect(a.body.summary).toMatchObject({ state: "active", expirationDate: "2041-03-15" });
    const b = await call(rights, "POST", { body: { applicationNumber: nums[0] } });
    expect(b.body.cached).toBe(true);
    const c = await call(rights, "POST", { body: { applicationNumber: nums[0], refresh: true } });
    expect(c.body.cached).toBe(false);
  });

  test("수집된 적 없는 특허의 권리 조회는 거부", async () => {
    const r = await call(rights, "POST", { body: { applicationNumber: "1099999999999" } });
    expect(r.statusCode).toBe(400);
  });

  test("조회해 둔 권리 현황이 보고서 입력에 실린다 (추가 호출 없이)", async () => {
    await call(projects, "PATCH", { query: { id: project.id, action: "pin" }, body: { applicationNumber: nums[0], pinned: true } });
    const g = await call(generateReport, "POST", { body: { projectId: project.id, researchType: "planning" } });
    expect(g.statusCode, JSON.stringify(g.body)).toBe(200);
    const rep = (await call(reports, "GET", { query: { id: g.body.reportId, snapshot: "1" } })).body;
    const withRights = rep.input_snapshot.patents.find(p => p.rights);
    expect(withRights.rights).toMatchObject({ expiration_date: "2041-03-15" });
    expect(rep.input_snapshot.header_facts.queries[0]).toHaveProperty("collected");
  });
});

describe("핀 · 유사성 · 보고서", () => {
  test("핀 고정 후 평가: 모든 일치·부분에 원문 근거가 있다 (AT-3)", async () => {
    for (const n of nums) await call(projects, "PATCH", { query: { id: project.id, action: "pin" }, body: { applicationNumber: n, pinned: true } });
    const r = await call(analyze, "POST", { body: { projectId: project.id, applicationNumbers: nums.slice(0, 5) } });
    expect(r.statusCode).toBe(200);
    for (const p of r.body.results) for (const f of p.features) {
      if (f.match === "match" || f.match === "partial") { expect(f.evidence.length).toBeGreaterThan(3); expect(f.evidence_source).toBeTruthy(); }
    }
    expect(r.body.results[0].evidence_check.checked).toBeGreaterThan(0);
  });

  test("이 조사에 없는 특허, 6건 이상 요청은 거부", async () => {
    const a = await call(analyze, "POST", { body: { projectId: project.id, applicationNumbers: ["1099999999999"] } });
    expect(a.statusCode).toBe(400);
    const b = await call(analyze, "POST", { body: { projectId: project.id, applicationNumbers: Array(6).fill(nums[0]) } });
    expect(b.statusCode).toBe(400);
  });

  test("3유형 보고서 생성 → 첫 줄 표시 · 버전 증가 · 입력 스냅샷 저장 (AT-5)", async () => {
    for (const type of ["rnd", "planning", "strategy"]) {
      const g = await call(generateReport, "POST", { body: { projectId: project.id, researchType: type } });
      expect(g.statusCode, JSON.stringify(g.body)).toBe(200);
      const rep = (await call(reports, "GET", { query: { id: g.body.reportId, snapshot: "1" } })).body;
      expect(rep.markdown.split("\n")[0]).toBe("AI 초안 — 검토 전");
      expect(rep.input_snapshot.header_facts.queries).toHaveLength(3);
      expect(rep.provider).toBe("mock");
    }
    const again = await call(generateReport, "POST", { body: { projectId: project.id, researchType: "rnd" } });
    expect(again.body.version).toBe(2);
  });

  test("연구개발형은 평가가 없으면 만들지 않는다", async () => {
    const p = (await call(projects, "POST", { body: { title: "평가 없음", productCode: "BCR-A200", researchType: "rnd" } })).body;
    await call(projects, "POST", { query: { id: p.id, action: "keywords" }, body: { featureIds: ["A200-REDUCER"], queries: [queries[0]] } });
    await call(search, "POST", { body: { projectId: p.id, query: queries[0] } });
    const g = await call(generateReport, "POST", { body: { projectId: p.id, researchType: "rnd" } });
    expect(g.statusCode).toBe(400);
    expect(g.body.error.message).toContain("유사성 평가");
  });

  test("경고가 있으면 확인 전에는 승인할 수 없다 (AT-6)", async () => {
    const list = (await call(reports, "GET", { query: { projectId: project.id } })).body;
    const id = list[0].id;
    // 경고를 직접 심어 승인 조건을 시험한다
    const { query } = await import("../server/db.js");
    await query(`update reports set validation = '{"warnings":[{"id":"w1","type":"application_number","message":"이 조사에 없는 번호","acknowledged":false}]}'::jsonb where id = $1::uuid`, [id]);
    const denied = await call(reports, "PATCH", { query: { id }, body: { reviewStatus: "approved", reviewer: "김지수" } });
    expect(denied.statusCode).toBe(400);
    expect(denied.body.error.code).toBe("warnings_unacknowledged");
    await call(reports, "PATCH", { query: { id }, body: { ackWarning: "w1" } });
    const ok = await call(reports, "PATCH", { query: { id }, body: { reviewStatus: "approved", reviewer: "김지수", reviewerNote: "확인함" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toMatchObject({ review_status: "approved", reviewer: "김지수" });
  });

  test("LLM 호출은 llm_calls에 기록된다", async () => {
    const { query } = await import("../server/db.js");
    const rows = await query("select purpose, ok, input_tokens from llm_calls order by id");
    expect(rows.some(r => r.purpose === "similarity" && r.ok)).toBe(true);
    expect(rows.some(r => r.purpose.startsWith("report-"))).toBe(true);
  });
});
