import { describe, test, expect } from "vitest";
import { normalizeEvidence, verifyEvidence, buildSimilarityInput, overlapScore, rankByOverlap } from "../server/similarity.js";
import { similarityBatch } from "../server/validate.js";
import { extractJson } from "../server/llm/json.js";

const patent = {
  application_number: "1020210900001",
  title: "중공형 로봇 관절 구동 모듈",
  abstract: "감속기와 모터를 중공 하우징에 통합한 관절 모듈.",
  ipc: "B25J 9/12",
  claims: ["1. 중공 하우징; 상기 하우징에 내장된 모터; 및 파동기어 감속기를 포함하는 관절 구동 모듈.", "2. 제1항에 있어서, 브레이크를 더 포함하는 관절 구동 모듈."]
};
const base = { application_number: patent.application_number, overall: "high", differences: [], followups: [] };

describe("근거 문장 검증 (명세 7.2, AT-4)", () => {
  test("원문에 있는 근거는 그대로 통과한다", () => {
    const r = verifyEvidence({ ...base, features: [{ feature_id: "A200-BRAKE", match: "match", evidence: "브레이크를 더 포함하는 관절 구동 모듈", evidence_source: "claim_2" }] }, patent);
    expect(r.features[0].match).toBe("match");
    expect(r.features[0].evidence_unverified).toBeUndefined();
    expect(r.evidence_check).toEqual({ checked: 1, verified: 1 });
  });

  test("원문에 없는 근거는 불명으로 내리고 근거 미확인 표시", () => {
    const r = verifyEvidence({ ...base, features: [{ feature_id: "A200-STO", match: "match", evidence: "안전 토크 차단 회로를 포함하는 구동 모듈", evidence_source: "claim_1" }] }, patent);
    expect(r.features[0].match).toBe("unclear");
    expect(r.features[0].evidence_unverified).toBe(true);
    expect(r.evidence_check).toEqual({ checked: 1, verified: 0 });
  });

  test("none·unclear 칸은 근거 검사 대상이 아니다", () => {
    const r = verifyEvidence({ ...base, features: [{ feature_id: "x", match: "none", evidence: "", evidence_source: "" }] }, patent);
    expect(r.evidence_check.checked).toBe(0);
  });

  test("'청구항 2: ...' 같은 장식과 따옴표·말줄임을 걷어 낸다", () => {
    expect(normalizeEvidence("청구항 2: '...브레이크를 더 포함하는...'")).toBe("브레이크를 더 포함하는");
    const r = verifyEvidence({ ...base, features: [{ feature_id: "A200-BRAKE", match: "partial", evidence: "청구항 2: \"브레이크를 더 포함하는\"", evidence_source: "claim_2" }] }, patent);
    expect(r.features[0].match).toBe("partial");
  });

  test("공백 차이는 무시하고, 너무 짧은 근거는 인정하지 않는다", () => {
    const spaced = verifyEvidence({ ...base, features: [{ feature_id: "a", match: "match", evidence: "감속기와   모터를\n중공 하우징에", evidence_source: "abstract" }] }, patent);
    expect(spaced.features[0].match).toBe("match");
    const tiny = verifyEvidence({ ...base, features: [{ feature_id: "a", match: "match", evidence: "관절", evidence_source: "title" }] }, patent);
    expect(tiny.features[0].match).toBe("unclear");
  });
});

describe("입력 만들기와 후보 정렬", () => {
  const features = [{ id: "A200-REDUCER", group: "감속기", label: "하모닉", spec: "101:1", keywords: { title: ["관절"], abstract: ["파동기어", "감속기"] } }];
  test("청구항은 앞 3개만 AI에 넘긴다", () => {
    const input = buildSimilarityInput(features, [{ applicationNumber: "1", inventionTitle: "t", abstract: "a", ipcNumber: "B25J", claims: ["1", "2", "3", "4", "5"] }]);
    expect(input.patents[0].claims).toHaveLength(3);
    expect(input.features[0].keywords).toEqual(["파동기어", "감속기"]);
  });
  test("키워드가 많이 겹치는 특허가 앞에 온다", () => {
    const rows = [{ inventionTitle: "x", abstract: "무관" }, { inventionTitle: "파동기어 감속기", abstract: "" }];
    expect(overlapScore(rows[1], features)).toBe(2);
    expect(rankByOverlap(rows, features)[0]).toBe(rows[1]);
  });
});

describe("AI 출력 형식 검증", () => {
  test("올바른 JSON은 통과, 허용 밖 값은 거부", () => {
    const ok = { patents: [{ ...base, features: [{ feature_id: "a", match: "match", evidence: "e", evidence_source: "claim_1" }] }] };
    expect(similarityBatch.safeParse(ok).success).toBe(true);
    ok.patents[0].features[0].match = "similar";
    expect(similarityBatch.safeParse(ok).success).toBe(false);
  });
  test("코드 울타리나 앞뒤 설명이 있어도 JSON을 꺼낸다", () => {
    expect(extractJson('설명입니다\n```json\n{"a": 1}\n```\n끝')).toEqual({ a: 1 });
    expect(extractJson('{"a": {"b": 2}}')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("JSON 없음")).toThrow();
  });
});
