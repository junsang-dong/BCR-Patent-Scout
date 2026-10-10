import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { RESEARCH_TYPES, STATUS_LABEL } from "../../shared/constants.js";
import { Loading, Alert, Badge } from "../components/ui.jsx";

// 조사 하나의 공통 틀: 제목 + 단계 탭 + 조사 데이터(키워드 세트, 검색 기록)를 하위 화면에 내려 준다
export default function ProjectShell() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const reload = useCallback(() => api.project(id).then(d => { setData(d); return d; }).catch(e => setErr(e.message)), [id]);
  useEffect(() => { setData(null); setErr(null); reload(); }, [reload]);

  if (err) return <Alert kind="err">{err}</Alert>;
  if (!data) return <Loading />;
  const p = data.project;
  const hasKeywords = !!data.keywordSet;
  const hasRuns = data.runs.some(r => r.finished_at && !r.error);
  return (
    <div className="stack">
      <div>
        <div className="row" style={{ marginBottom: 4 }}>
          <Badge kind="info">{p.product_code}</Badge>
          <Badge>{RESEARCH_TYPES[p.research_type].name}</Badge>
          <Badge>{STATUS_LABEL[p.status] ?? p.status}</Badge>
        </div>
        <h1>{p.title}</h1>
        <p className="muted small" style={{ margin: 0 }}>{RESEARCH_TYPES[p.research_type].question}</p>
      </div>
      <ol className="steps" aria-label="진행 단계">
        <li><NavLink to="keywords" className={hasKeywords ? "done" : ""}>1 키워드 조합</NavLink></li>
        <li><NavLink to="results" className={hasRuns ? "done" : ""}>2 검색 결과</NavLink></li>
        <li><NavLink to="similarity">3 유사성 평가</NavLink></li>
        <li><NavLink to="report">4 보고서</NavLink></li>
      </ol>
      <Outlet context={{ data, reload }} />
    </div>
  );
}
