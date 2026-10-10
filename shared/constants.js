export const RESEARCH_TYPES = {
  rnd: { name: "연구개발형", question: "우리 기술과 어떤 점이 비슷하고 다른가?", owner: "연구개발팀" },
  planning: { name: "기술기획형", question: "누가 어떤 기술에 집중하고 있는가?", owner: "마케팅·기획" },
  strategy: { name: "사업전략형", question: "어떤 경쟁사와 기술을 더 조사해야 하는가?", owner: "영업·경영진" }
};

export const MATCH_LABEL = { match: "일치", partial: "부분", none: "없음", unclear: "불명" };
export const MATCH_MARK = { match: "●", partial: "◐", none: "○", unclear: "？" };
export const OVERALL_LABEL = { high: "높음", medium: "보통", low: "낮음" };
export const REVIEW_LABEL = { ai_draft: "AI 초안", in_review: "검토 중", approved: "승인" };
export const STATUS_LABEL = { draft: "준비", searching: "검색 중", reviewing: "검토 중", reported: "보고서 있음" };

export const DRAFT_LINE = "AI 초안 — 검토 전";

// 모든 보고서 머리말에 들어가는 한계 (02_search-strategy.md 5장)
export const LIMITS = [
  "한국 특허·실용신안만 대상입니다 (해외 출원 제외).",
  "출원 후 약 18개월이 지나야 공개되므로 최근 출원은 적게 집계됩니다.",
  "키워드 검색이라 다른 용어를 쓴 특허는 빠질 수 있습니다.",
  "출원인 이름 표기 차이는 자동으로 묶었으며 사람이 확인해야 합니다.",
  "서지 정보(제목·초록·청구항 앞부분)만 분석했고 명세서·도면은 보지 않았습니다.",
  "법적 상태·존속기간은 조회 시점의 KIPRIS 기록이며 이후 변동될 수 있습니다.",
  "권리 관련 판단은 하지 않았습니다. 필요하면 변리사 검토가 필요합니다."
];
