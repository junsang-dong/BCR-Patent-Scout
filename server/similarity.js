// 유사성 평가 보조 로직 (순수 함수): 입력 만들기 · 후보 점수 · 근거 문장 검증 (명세 7.2)

const squash = s => String(s ?? "").replace(/\s+/g, " ").trim();

export function buildSimilarityInput(features, patents) {
  return {
    features: features.map(f => ({ id: f.id, group: f.group, label: f.label, spec: f.spec, keywords: f.keywords.abstract })),
    patents: patents.map(p => ({
      application_number: p.applicationNumber,
      title: p.inventionTitle ?? "",
      abstract: p.abstract ?? "",
      ipc: p.ipcNumber ?? "",
      claims: (p.claims ?? []).slice(0, 3)
    }))
  };
}

// 근거로 쓸 수 있는 원문 조각 (출처 이름 → 텍스트)
export function sourceTexts(p) {
  const out = { title: squash(p.title), abstract: squash(p.abstract) };
  (p.claims ?? []).slice(0, 3).forEach((c, i) => { out[`claim_${i + 1}`] = squash(c); });
  return out;
}

// 모델이 붙인 "청구항 2: '...'" 같은 장식을 걷어 낸다
export function normalizeEvidence(e) {
  return squash(e)
    .replace(/^(청구항|claim)\s*\d+\s*[:：]\s*/i, "")
    .replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, "")
    .replace(/^\.{2,}|\.{2,}$|^…|…$/g, "")
    .trim();
}

// 근거가 원문에 실재하는지 확인. 없으면 match/partial → unclear, evidence_unverified: true
export function verifyEvidence(result, inputPatent) {
  const sources = sourceTexts(inputPatent);
  const all = Object.values(sources).join("\n");
  let checked = 0, verified = 0;
  const features = result.features.map(f => {
    if (f.match !== "match" && f.match !== "partial") return f;
    checked += 1;
    const ev = normalizeEvidence(f.evidence);
    const hay = f.evidence_source && sources[f.evidence_source] ? sources[f.evidence_source] : null;
    const found = ev.length >= 4 && ((hay && hay.includes(ev)) || all.includes(ev));
    if (found) { verified += 1; return { ...f, evidence: ev }; }
    return { ...f, match: "unclear", evidence_unverified: true };
  });
  return { ...result, features, evidence_check: { checked, verified } };
}

// AI 호출 전에 후보를 키워드 겹침으로 정렬하기 위한 점수 (높을수록 앞)
export function overlapScore(patent, features) {
  const hay = squash(`${patent.inventionTitle ?? ""} ${patent.abstract ?? ""}`);
  let n = 0;
  for (const f of features) for (const k of f.keywords.abstract) if (k && hay.includes(k)) n += 1;
  return n;
}

export function rankByOverlap(patents, features) {
  return [...patents].sort((a, b) => overlapScore(b, features) - overlapScore(a, features));
}
