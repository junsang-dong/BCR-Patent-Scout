import { describe, test, expect } from "vitest";
import catalog from "../data/product-features.json" with { type: "json" };
import { generateQueries, judgeCount, yearFilter, runSummary, toKiprisQuery, MAX_QUERIES } from "../shared/queries.js";

describe("검색식 생성 (명세 5.3, AT-1)", () => {
  test("A200 · [감속기, 브레이크] → 검색식 3개 (요소 2 + 교차 1)", () => {
    const { queries, truncated } = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["A200-REDUCER", "A200-BRAKE"] });
    expect(queries.map(q => q.name)).toEqual(["a200-reducer", "a200-brake", "x-a200-reducer-a200-brake"]);
    expect(truncated).toBe(false);
    const [reducer, , cross] = queries;
    expect(reducer).toMatchObject({ inventionTitle: "관절", astrtCont: "파동기어", ipcNumber: "F16H", patent: true, utility: false, max: 200 });
    expect(cross.astrtCont).toBe("파동기어 브레이크");
    expect(cross.featureIds).toEqual(["A200-REDUCER", "A200-BRAKE"]);
  });

  test("기본 기간은 2016~올해, 실용신안 포함 옵션", () => {
    const { queries } = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["A200-REDUCER"], options: { patentOnly: false } });
    expect(queries[0].from).toBe(2016);
    expect(queries[0].to).toBe(new Date().getFullYear());
    expect(queries[0].utility).toBe(true);
  });

  test("조사당 검색식은 최대 8개", () => {
    const ids = ["A200-STRUCT", "A200-REDUCER", "A200-ENCODER", "A200-STO"]; // 4 + 6 쌍 = 10
    const { queries, truncated } = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ids });
    expect(queries).toHaveLength(MAX_QUERIES);
    expect(truncated).toBe(true);
  });

  test("다른 제품의 요소는 무시하고 모르는 제품은 오류", () => {
    expect(generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["C100-COMM"] }).queries).toHaveLength(0);
    expect(() => generateQueries({ catalog, productCode: "BCR-X999", featureIds: [] })).toThrow();
  });

  test("카탈로그의 모든 요소가 검색식에 쓸 키워드를 가진다", () => {
    for (const p of catalog.products) for (const f of p.features) {
      expect(f.keywords.title.length, f.id).toBeGreaterThan(0);
      expect(f.keywords.abstract.length, f.id).toBeGreaterThan(0);
    }
  });
});

describe("건수 판단 (AT-2)", () => {
  test("0건·300 초과는 경고, 그 사이는 적당", () => {
    expect(judgeCount(0).level).toBe("warn");
    expect(judgeCount(301).level).toBe("warn");
    expect(judgeCount(300).level).toBe("ok");
    expect(judgeCount(42).level).toBe("ok");
  });
  test("수집은 한도에서 멈추고 truncated로 표시한다", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ applicationNumber: String(i), applicationDate: "2020-01-01" }));
    expect(runSummary({ items, totalCount: 500, max: 200 }).truncated).toBe(true);
    expect(runSummary({ items, totalCount: 200, max: 200 }).truncated).toBe(false);
    expect(runSummary({ items: items.slice(0, 50), totalCount: 50, max: 200 }).truncated).toBe(false);
  });
});

describe("기간 필터와 KIPRIS 조건", () => {
  test("출원연도로 거르고 연도를 모르는 건은 남긴다", () => {
    const r = [{ applicationDate: "2010-05-01" }, { applicationDate: "2020-05-01" }, { applicationDate: null }, { applicationDate: "2030-01-01" }];
    expect(yearFilter(r, 2016, 2026)).toHaveLength(2);
  });
  test("빈 항목은 보내지 않고 patent/utility는 문자열로", () => {
    const q = toKiprisQuery({ inventionTitle: "관절", astrtCont: "", ipcNumber: "B25J", patent: true, utility: false });
    expect(q).toEqual({ inventionTitle: "관절", astrtCont: undefined, ipcNumber: "B25J", patent: "true", utility: "false" });
  });
});
