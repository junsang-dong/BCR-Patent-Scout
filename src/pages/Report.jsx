import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../lib/api.js";
import { useHealth } from "../lib/ctx.js";
import { RESEARCH_TYPES, REVIEW_LABEL } from "../../shared/constants.js";
import MarkdownView from "../components/MarkdownView.jsx";
import { Alert, AiBadge, Badge, Loading } from "../components/ui.jsx";

export default function Report() {
  const { data, reload } = useOutletContext();
  const health = useHealth();
  const project = data.project;
  const [type, setType] = useState(project.research_type);
  const [list, setList] = useState(null);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");

  const open = useCallback(async id => {
    const r = await api.report(id);
    setCurrent(r); setReviewer(r.reviewer ?? ""); setNote(r.reviewer_note ?? "");
  }, []);
  const loadList = useCallback(async (select) => {
    const l = await api.reports(project.id);
    setList(l);
    const id = select ?? current?.id ?? l[0]?.id;
    if (id) await open(id);
  }, [project.id, current?.id, open]);
  useEffect(() => { loadList().catch(e => setErr(e.message)); /* 처음 한 번 */ // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setBusy(true); setErr(null);
    try { const r = await api.generateReport(project.id, type); await loadList(r.reportId); await reload(); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }
  async function patch(b) {
    setErr(null);
    try { await api.patchReport(current.id, b); await open(current.id); setList(await api.reports(project.id)); }
    catch (ex) { setErr(ex.message); }
  }
  function download() {
    const blob = new Blob([current.markdown], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.title.replace(/[^\p{L}\p{N}]+/gu, "_")}_${current.research_type}_v${current.version}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const llmOff = health?.llm && !health.llm.configured;
  const warnings = current?.validation?.warnings ?? [];
  const unack = warnings.filter(w => !w.acknowledged).length;

  return (
    <div className="stack">
      <section className="card stack">
        <h2 style={{ margin: 0 }}>보고서 만들기 <AiBadge /></h2>
        <div className="row">
          <label className="field" style={{ width: 260 }} htmlFor="rtype">리서치 유형
            <select id="rtype" value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(RESEARCH_TYPES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
            </select>
          </label>
          <p className="small muted grow" style={{ margin: 0, alignSelf: "end" }}>{RESEARCH_TYPES[type].question}</p>
          <button className="btn primary" disabled={busy || llmOff} onClick={generate} style={{ alignSelf: "end" }}>{busy ? "생성 중… (최대 2분)" : "초안 생성"}</button>
        </div>
        {type === "rnd" && <p className="small muted" style={{ margin: 0 }}>연구개발형은 <Link to="../similarity">유사성 평가</Link> 결과가 있어야 만들 수 있습니다. 사람이 확정한 값이 있으면 그것을 우선 씁니다.</p>}
        {llmOff && <Alert kind="err">AI 공급자가 설정되지 않아 보고서를 만들 수 없습니다. 운영자에게 키와 모델 이름 설정을 요청하세요.</Alert>}
        {err && <Alert kind="err">{err}</Alert>}
      </section>

      {!list ? <Loading /> : list.length === 0 ? <p className="muted">아직 보고서가 없습니다.</p> : (
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <aside className="card" style={{ flex: "0 0 240px" }}>
            <h3>버전</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {list.map(r => (
                <li key={r.id}>
                  <button className="chip" style={{ width: "100%", borderRadius: 8 }} aria-pressed={current?.id === r.id} onClick={() => open(r.id)}>
                    {RESEARCH_TYPES[r.research_type].name} v{r.version}
                    <small>{REVIEW_LABEL[r.review_status]} · 경고 {r.warning_count} · {r.provider}</small>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {current && (
            <div className="stack grow" style={{ minWidth: 0, flex: "1 1 420px" }}>
              <section className="card stack">
                <div className="row">
                  <Badge kind={current.review_status === "approved" ? "ok" : "warn"}>{REVIEW_LABEL[current.review_status]}</Badge>
                  <span className="small muted">{current.provider} / {current.model} · {String(current.created_at).slice(0, 10)}</span>
                  <button className="btn small right" onClick={download}>.md 다운로드</button>
                </div>
                <div>
                  <h3>자동 검증 {warnings.length ? <Badge kind="warn">경고 {warnings.length}</Badge> : <Badge kind="ok">경고 없음</Badge>}</h3>
                  {warnings.length > 0 && (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                      {warnings.map(w => (
                        <li key={w.id} className="row small">
                          <Badge kind={w.acknowledged ? "ok" : "warn"}>{w.acknowledged ? "확인함" : "미확인"}</Badge>
                          <span className="grow">{w.message}{w.line ? <span className="muted"> (줄 {w.line})</span> : null}</span>
                          {!w.acknowledged && <button className="btn small" onClick={() => patch({ ackWarning: w.id })}>확인함</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid">
                  <label className="field" htmlFor="reviewer">검토자<input id="reviewer" type="text" value={reviewer} onChange={e => setReviewer(e.target.value)} /></label>
                  <label className="field" htmlFor="note">검토 의견<textarea id="note" value={note} onChange={e => setNote(e.target.value)} /></label>
                </div>
                <div className="row">
                  <button className="btn" onClick={() => patch({ reviewerNote: note, reviewer })}>의견 저장</button>
                  <button className="btn" onClick={() => patch({ reviewStatus: "in_review", reviewerNote: note, reviewer })} disabled={current.review_status === "in_review"}>검토 시작</button>
                  <button className="btn primary" onClick={() => patch({ reviewStatus: "approved", reviewerNote: note, reviewer })} disabled={unack > 0 || !reviewer.trim()} title={unack ? "경고를 모두 확인해야 승인할 수 있습니다." : !reviewer.trim() ? "검토자 이름을 입력하세요." : ""}>승인</button>
                  {unack > 0 && <span className="small muted">미확인 경고 {unack}건</span>}
                </div>
              </section>
              <section className="card"><MarkdownView source={current.markdown} /></section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
