import { describe, test, expect } from "vitest";
import catalog from "../data/product-features.json" with { type: "json" };
import { generateQueries, judgeCount, yearFilter, pageSummary, rowsForPage, toKiprisQuery, MAX_QUERIES, PAGE_SIZE } from "../shared/queries.js";

describe("검색식 생성 (명세 5.3, AT-1)", () => {
  test("A200 · [감속기, 브레이크] → 검색식 3개 (요소 2 + 교차 1)", () => {
    const { queries, truncated } = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["A200-REDUCER", "A200-BRAKE"] });
    expect(queries.map(q => q.name)).toEqual(["a200-reducer", "a200-brake", "x-a200-reducer-a200-brake"]);
    expect(truncated).toBe(false);
    const [reducer, , cross] = queries;
    expect(reducer).toMatchObject({ inventionTitle: "", astrtCont: "파동기어", ipcNumber: "F16H 49", patent: true, utility: false, max: 200 });
    expect(cross.astrtCont).toBe("파동기어 브레이크");
    expect(cross.featureIds).toEqual(["A200-REDUCER", "A200-BRAKE"]);
  });

  test("제목 대표어는 기본에서 빼고, IPC 후보가 없는 요소와 useTitle 옵션에서만 넣는다 (실측: 너무 좁아짐)", () => {
    const noIpc = structuredClone(catalog);
    noIpc.products[0].features.find(f => f.id === "A200-IP65").ipc_hints = [];
    const base = generateQueries({ catalog: noIpc, productCode: "BCR-A200", featureIds: ["A200-REDUCER", "A200-IP65"] }).queries;
    expect(base.find(q => q.name === "a200-reducer").inventionTitle).toBe("");
    expect(base.find(q => q.name === "a200-ip65")).toMatchObject({ inventionTitle: "관절", ipcNumber: "" });
    const withTitle = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["A200-REDUCER"], options: { useTitle: true } }).queries;
    expect(withTitle[0].inventionTitle).toBe("관절");
  });

  test("기본 IPC는 실측으로 정한 좁은 후보(브레이크 B25J 19, 관절 모듈 B25J 17)이고 대체 후보를 갖는다", () => {
    const q = generateQueries({ catalog, productCode: "BCR-A200", featureIds: ["A200-BRAKE", "A200-STRUCT"] }).queries;
    expect(q.find(x => x.name === "a200-brake").ipcNumber).toBe("B25J 19");
    expect(q.find(x => x.name === "a200-struct").ipcNumber).toBe("B25J 17");
    for (const f of catalog.products[0].features) expect(f.ipc_hints.length, f.id).toBeGreaterThanOrEqual(2);
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
  test("한 번에 20건씩 받고 더 받을 수 있는지 알려 준다", () => {
    const items = n => Array.from({ length: n }, (_, i) => ({ applicationNumber: String(i), applicationDate: "2020-01-01" }));
    expect(PAGE_SIZE).toBe(20);
    expect(pageSummary({ items: items(20), totalCount: 74, page: 1 })).toMatchObject({ hasMore: true, truncated: false, seen: 20 });
    expect(pageSummary({ items: items(14), totalCount: 74, page: 4 })).toMatchObject({ hasMore: false, truncated: false, seen: 74 });
    expect(pageSummary({ items: items(20), totalCount: 20, page: 1 }).hasMore).toBe(false);
    expect(pageSummary({ items: [], totalCount: 5, page: 1 }).hasMore).toBe(false);
  });
  test("검색식당 한도(200건)에서 멈추고 truncated로 표시한다 (AT-2)", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ applicationNumber: String(i), applicationDate: "2020-01-01" }));
    expect(pageSummary({ items, totalCount: 1893, page: 10, max: 200 })).toMatchObject({ hasMore: false, truncated: true });
    expect(pageSummary({ items, totalCount: 1893, page: 9, max: 200 })).toMatchObject({ hasMore: true, truncated: false });
  });
  test("쪽별 가져올 건수: 마지막 쪽은 한도에 맞추고 한도 뒤는 0", () => {
    expect(rowsForPage(1)).toBe(20);
    expect(rowsForPage(10)).toBe(20);
    expect(rowsForPage(11)).toBe(0);
    expect(rowsForPage(3, 50)).toBe(10);
    expect(rowsForPage(4, 50)).toBe(0);
  });
});

describe("기간 필터와 KIPRIS 조건", () => {
  test("출원연도로 거르고 연도를 모르는 건은 남긴다", () => {
    const r = [{ applicationDate: "2010-05-01" }, { applicationDate: "2020-05-01" }, { applicationDate: null }, { applicationDate: "2030-01-01" }];
    expect(yearFilter(r, 2016, 2026)).toHaveLength(2);
  });
  test("빈 항목은 보내지 않고 patent/utility는 문자열로", () => {
    const q = toKiprisQuery({ inventionTitle: "관절", astrtCont: "", ipcNumber: "B25J", patent: true, utility: false });
    expect(q).toEqual({ applicationDate: undefined, inventionTitle: "관절", astrtCont: undefined, ipcNumber: "B25J", patent: "true", utility: "false" });
  });
  test("출원일 범위는 YYYYMMDD~YYYYMMDD로 보낸다 (S4)", () => {
    expect(toKiprisQuery({ inventionTitle: "관절", from: 2016, to: 2026 }).applicationDate).toBe("20160101~20261231");
    expect(toKiprisQuery({ inventionTitle: "관절" }).applicationDate).toBeUndefined();
  });
});
