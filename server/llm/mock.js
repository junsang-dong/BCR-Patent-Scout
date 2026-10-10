// 로컬 시연용 가짜 LLM — 입력 JSON에서 키워드를 찾아 결정적인 결과를 만든다.
// 결과는 실제 분석이 아니다. 근거 문장은 입력 원문에서 그대로 잘라 와서 검증을 통과한다.

const squash = s => String(s ?? "").replace(/\s+/g, " ").trim();

function payload(messages) {
  const m = messages[messages.length - 1]?.content ?? "";
  try { return JSON.parse(m); } catch { return {}; }
}

function snippet(text, key, span = 30) {
  const i = text.indexOf(key);
  if (i < 0) return null;
  return text.slice(Math.max(0, i - span), Math.min(text.length, i + key.length + span)).trim();
}

function similarity(input) {
  return {
    patents: input.patents.map(p => {
      const sources = { title: squash(p.title), abstract: squash(p.abstract) };
      p.claims.forEach((c, i) => { sources[`claim_${i + 1}`] = squash(c); });
      const features = input.features.map(f => {
        for (const [src, txt] of Object.entries(sources)) {
          for (const k of f.keywords) {
            const ev = txt && k ? snippet(txt, k) : null;
            if (ev) return { feature_id: f.id, match: src.startsWith("claim") ? "match" : "partial", evidence: ev, evidence_source: src };
          }
        }
        return { feature_id: f.id, match: "none", evidence: "", evidence_source: "" };
      });
      const hits = features.filter(f => f.match !== "none").length;
      const ratio = features.length ? hits / features.length : 0;
      return {
        application_number: p.application_number,
        features,
        overall: ratio >= 0.6 ? "high" : ratio >= 0.3 ? "medium" : "low",
        differences: [
          `BCR 제품 요소 중 ${features.filter(f => f.match === "none").map(f => f.feature_id).join(", ") || "없음"}은(는) 제목·초록·청구항 앞부분에서 확인되지 않음 (MOCK)`,
          "이 특허에만 있는 구성은 명세서 검토 전이라 판단하지 않음 (MOCK)"
        ],
        followups: ["명세서 본문에서 해당 구성의 구체적 구현을 확인 (MOCK)"]
      };
    })
  };
}

function report(input, purpose) {
  const type = input.research_type;
  const s = input.stats ?? {};
  const top = (s.top_applicants ?? []).slice(0, 5);
  const apps = (input.patents ?? []).slice(0, 5);
  const list = apps.map(p => `- ${p.application_number} ${p.invention_title ?? ""}`).join("\n") || "- (특허 없음)";
  const note = "> MOCK 생성: 실제 AI 분석이 아니라 입력 데이터를 규칙으로 정리한 시연용 본문입니다.";
  if (type === "planning") {
    const rows = top.map(a => `| ${a.applicant} | ${a.count}건 | ${a.share_pct}% | ${a.recent_count} | ${a.prior_count} |`).join("\n");
    return `${note}

## 1. 출원인

| 출원인 | 건수 | 비중 | 최근 3년 | 직전 3년 |
|---|---|---|---|---|
${rows || "| (없음) | | | | |"}

## 2. 기술 분류

${(s.by_ipc_group ?? []).slice(0, 5).map(g => `- ${g.code}: ${g.count}건`).join("\n") || "- (없음)"}

## 3. 조사 범위 내 동향

연도 범위는 ${s.year_range ? s.year_range.join("~") : "(없음)"}입니다. 최근 2개 연도는 출원 후 18개월 공개 지연 때문에 적게 집계됩니다.

대표 특허:
${list}

## 4. 연구기획 시사점

**사실**: 분석 대상은 ${s.total_records ?? 0}건입니다.

**해석 (검토 필요)**: MOCK 모드에서는 해석을 생성하지 않습니다.

**제안 (검토 필요)**: MOCK 모드에서는 제안을 생성하지 않습니다.
`;
  }
  if (type === "strategy") {
    const rows = top.map(a => `| ${a.applicant} | ${a.count}건 | ${a.top_ipc_groups.map(g => g.group).join(", ")} |`).join("\n");
    return `${note}

## 1. 경쟁사 비교

| 출원인 | 건수 | 주요 IPC 그룹 |
|---|---|---|
${rows || "| (없음) | | |"}

## 2. 적용 분야

MOCK 모드에서는 적용 분야를 생성하지 않습니다.

## 3. 사업 검토 질문

- 위 출원인 중 추가로 조사할 곳은 어디인가? (검토 필요)

## 4. 후속 조사

대표 특허:
${list}

변리사 검토 필요: 권리 관련 판단은 이 보고서 범위 밖입니다.
`;
  }
  const sim = (input.similarity ?? []).slice(0, 5);
  const featIds = (input.features ?? []).map(f => f.id);
  const head = `| 특허 | ${featIds.join(" | ")} |\n|---|${featIds.map(() => "---").join("|")}|`;
  const sym = { match: "일치", partial: "부분", none: "없음", unclear: "불명" };
  const body = sim.map(r => `| ${r.application_number} | ${featIds.map(id => sym[(r.features.find(f => f.feature_id === id) ?? {}).match] ?? "불명").join(" | ")} |`).join("\n");
  return `${note}

## 1. 해결 과제

비교 대상 기술 요소: ${(input.features ?? []).map(f => f.label).join(", ")}.

## 2. 기술요소 비교

${head}
${body || "| (평가 없음) |"}

## 3. 차이점

${sim.flatMap(r => (r.differences ?? []).map(d => `- ${r.application_number}: ${d}`)).join("\n") || "- (없음)"}

## 4. 추가 검토 항목

${sim.flatMap(r => (r.followups ?? []).map(d => `- ${r.application_number}: ${d}`)).join("\n") || "- 변리사 검토 필요: 권리 관련 판단은 이 보고서 범위 밖입니다."}
`;
}

export async function callMock({ messages, purpose }) {
  const input = payload(messages);
  const text = purpose === "similarity" ? JSON.stringify(similarity(input)) : report(input, purpose);
  return { text, usage: { input: Math.ceil(JSON.stringify(input).length / 4), output: Math.ceil(text.length / 3) } };
}
