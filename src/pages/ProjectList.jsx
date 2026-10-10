import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { RESEARCH_TYPES, STATUS_LABEL, REVIEW_LABEL } from "../../shared/constants.js";
import { Loading, Alert, Badge } from "../components/ui.jsx";

export default function ProjectList() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.projects().then(setRows).catch(e => setErr(e.message)); }, []);
  return (
    <div className="stack">
      <div className="row">
        <div className="grow"><h1>조사 목록</h1><p className="muted">제품의 기술 요소로 유사 특허를 찾고, 비교하고, 보고서 초안까지 만듭니다.</p></div>
        <Link className="btn primary" to="/new">새 조사 만들기</Link>
      </div>
      {err && <Alert kind="err">{err}</Alert>}
      {!rows && !err && <Loading />}
      {rows && rows.length === 0 && (
        <div className="card"><h2>아직 조사가 없습니다</h2><p className="muted">제품과 리서치 유형을 고르고 첫 조사를 시작하세요. 예: BCR-A200 · 연구개발형 · 감속기 × 브레이크.</p><Link className="btn primary" to="/new">첫 조사 만들기</Link></div>
      )}
      <div className="grid">
        {rows?.map(p => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <Badge kind="info">{p.product_code}</Badge>
              <Badge>{RESEARCH_TYPES[p.research_type].name}</Badge>
              <Badge kind={p.status === "reported" ? "ok" : ""}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
            </div>
            <h3>{p.title}</h3>
            <p className="small muted">특허 {p.patent_count}건 · 핀 {p.pinned_count}건</p>
            <p className="small muted" style={{ margin: 0 }}>
              {p.last_report ? `보고서 v${p.last_report.version} · ${REVIEW_LABEL[p.last_report.review_status]}` : "보고서 없음"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
