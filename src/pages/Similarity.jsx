import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../lib/api.js";
import { useHealth, fmtNo } from "../lib/ctx.js";
import catalog from "../../data/product-features.json";
import { MATCH_LABEL, OVERALL_LABEL } from "../../shared/constants.js";
import FeatureMatrix from "../components/FeatureMatrix.jsx";
import { Alert, AiBadge, Badge, Loading } from "../components/ui.jsx";

const BATCH = 5;

export default function Similarity() {
  const { data } = useOutletContext();
  const health = useHealth();
  const project = data.project;
  const featureIds = data.keywordSet?.feature_ids ?? [];
  const features = useMemo(() => {
    const p = catalog.products.find(x => x.code === project.product_code);
    return featureIds.map(id => p.features.find(f => f.id === id)).filter(Boolean);
  }, [project.product_code, featureIds]);

  const [patents, setPatents] = useState(null);
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState({}); // 사람이 고친 값 (확정 전)

  const load = useCallback(() => api.patents(project.id).then(ps => setPatents(ps.filter(p => p.pinned))), [project.id]);
  useEffect(() => { load().catch(e => setErr(e.message)); }, [load]);

  const rows = useMemo(() => (patents ?? []).map(p => ({
    applicationNumber: p.applicationNumber, title: p.inventionTitle, applicant: p.applicantName,
    result: draft[p.applicationNumber] ?? p.similarityReviewed ?? p.similarity ?? null,
    ai: p.similarity, status: (draft[p.applicationNumber] ? "draft" : p.similarityReviewed?.status) ?? null
  })), [patents, draft]);

  const todo = rows.filter(r => !r.ai).map(r => r.applicationNumber);
  const llmOff = health?.llm && !health.llm.configured;

  async function evaluate(list) {
    setErr(null);
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH);
      setProgress({ done: i, total: list.length });
      try { await api.analyze(project.id, batch); }
      catch (ex) { setErr(ex.message); break; }
      await load();
    }
    setProgress(null);
  }

  const sel = selected ? rows.find(r => r.applicationNumber === selected.app) : null;
  const selCell = sel?.result?.features.find(f => f.feature_id === selected.feature);
  const selFeature = features.find(f => f.id === selected?.feature);

  function changeMatch(match) {
    const base = sel.result;
    setDraft(d => ({ ...d, [sel.applicationNumber]: { ...base, features: base.features.map(f => (f.feature_id === selected.feature ? { ...f, match, edited: true } : f)) } }));
  }

  async function finish(status) {
    const base = sel.result;
    const reviewed = { ...base, status, reviewed_at: new Date().toISOString() };
    try {
      await api.saveReviewed(project.id, sel.applicationNumber, reviewed);
      setDraft(d => { const n = { ...d }; delete n[sel.applicationNumber]; return n; });
      await load();
    } catch (ex) { setErr(ex.message); }
  }

  const check = rows.reduce((a, r) => ({ checked: a.checked + (r.ai?.evidence_check?.checked ?? 0), verified: a.verified + (r.ai?.evidence_check?.verified ?? 0) }), { checked: 0, verified: 0 });
  const decided = rows.filter(r => r.status === "confirmed" || r.status === "hold").length;

  if (!data.keywordSet) return <Alert kind="warn">키워드 조합을 먼저 확정하세요. <Link to="../keywords">키워드로</Link></Alert>;
  if (!patents) return err ? <Alert kind="err">{err}</Alert> : <Loading />;
  if (!patents.length) return <Alert kind="warn">핀 고정한 특허가 없습니다. <Link to="../results">검색 결과</Link>에서 평가할 특허를 고르세요 (최대 20건).</Alert>;

  return (
    <div className="stack">
      <section className="card stack">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>유사성 평가 <AiBadge /></h2>
          <button className="btn primary" disabled={!todo.length || !!progress || llmOff} onClick={() => evaluate(todo)}>
            {progress ? `평가 중 ${Math.min(progress.done + BATCH, progress.total)}/${progress.total}…` : todo.length ? `평가 실행 (${todo.length}건)` : "모두 평가됨"}
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>핀 고정한 {rows.length}건을 {BATCH}건씩 나눠 평가합니다. 일치·부분에는 원문 근거 문장이 붙고, 서버가 그 문장이 실제 원문에 있는지 확인합니다. ‡ 표시는 근거를 원문에서 찾지 못해 "불명"으로 내린 칸입니다.</p>
        {llmOff && <Alert kind="err">AI 공급자가 설정되지 않아 평가할 수 없습니다. 운영자에게 키와 모델 이름 설정을 요청하세요.</Alert>}
        {err && <Alert kind="err">{err}</Alert>}
        <div className="row small">
          <Badge kind="info">근거 검증 {check.verified}/{check.checked}{check.checked ? ` (${Math.round(check.verified / check.checked * 100)}%)` : ""}</Badge>
          <Badge kind={decided === rows.length ? "ok" : ""}>확정·보류 {decided}/{rows.length}</Badge>
        </div>
      </section>

      <section className="card flat">
        <FeatureMatrix rows={rows} features={features} selected={selected} onSelect={setSelected} />
      </section>

      {sel && (
        <section className="card stack" aria-live="polite">
          <div>
            <div className="mono small">{fmtNo(sel.applicationNumber)} · {sel.applicant}</div>
            <h3>{sel.title}</h3>
          </div>
          {sel.result ? (
            <>
              {selCell && selFeature && (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="row">
                    <strong>{selFeature.label}</strong>
                    <label className="row small"> 판정
                      <select value={selCell.match} onChange={e => changeMatch(e.target.value)} aria-label="판정 수정">
                        {Object.entries(MATCH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    {selCell.edited && <Badge kind="warn">사람이 수정</Badge>}
                    {selCell.evidence_unverified && <Badge kind="warn">근거 미확인</Badge>}
                  </div>
                  {selCell.evidence
                    ? <blockquote className="md" style={{ margin: 0, borderLeft: "3px solid var(--sky)", paddingLeft: 12 }}>“{selCell.evidence}” <span className="muted small mono">({selCell.evidence_source || "출처 없음"})</span></blockquote>
                    : <p className="muted small" style={{ margin: 0 }}>{selCell.evidence_unverified ? "AI가 댄 근거가 원문에서 확인되지 않았습니다." : "근거 문장이 없습니다."}</p>}
                </div>
              )}
              <div className="grid">
                <div><h3>차이점 <span className="small muted">종합 {OVERALL_LABEL[sel.result.overall]}</span></h3><ul className="small" style={{ paddingLeft: "1.2em", margin: 0 }}>{sel.result.differences.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
                <div><h3>추가로 확인할 질문</h3><ul className="small" style={{ paddingLeft: "1.2em", margin: 0 }}>{sel.result.followups.map((d, i) => <li key={i}>{d}</li>)}</ul></div>
              </div>
              <div className="row">
                <button className="btn primary" onClick={() => finish("confirmed")}>확정</button>
                <button className="btn" onClick={() => finish("hold")}>보류</button>
                {sel.status && sel.status !== "draft" && <Badge kind={sel.status === "confirmed" ? "ok" : "warn"}>{sel.status === "confirmed" ? "확정됨" : "보류"}</Badge>}
                <span className="small muted">모델: {sel.ai?.provider} / {sel.ai?.model}</span>
              </div>
            </>
          ) : <p className="muted">아직 평가하지 않았습니다.</p>}
        </section>
      )}

      <div className="row">
        <Link className="btn" to="../results">← 검색 결과</Link>
        <Link className="btn primary right" to="../report">보고서로 →</Link>
      </div>
    </div>
  );
}
