import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { RESEARCH_TYPES } from "../../shared/constants.js";
import catalog from "../../data/product-features.json";
import { Alert } from "../components/ui.jsx";

export default function ProjectNew() {
  const nav = useNavigate();
  const [product, setProduct] = useState("BCR-A200");
  const [type, setType] = useState("rnd");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const p = await api.createProject({ title: title.trim(), productCode: product, researchType: type });
      nav(`/projects/${p.id}/keywords`);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div><h1>새 조사</h1><p className="muted">제품과 리서치 유형을 고르면 다음 화면에서 기술 요소로 검색식을 만듭니다.</p></div>

      <fieldset className="card" style={{ border: "1px solid var(--line)" }}>
        <legend className="small muted">대상 제품</legend>
        <div className="pick-grid">
          {catalog.products.map(p => (
            <label className="pick" key={p.code}>
              <input type="radio" name="product" value={p.code} checked={product === p.code} onChange={() => setProduct(p.code)} />
              <div className="card"><h3>{p.code}</h3><p className="small" style={{ margin: 0 }}>{p.name}</p><p className="small muted" style={{ margin: 0 }}>기술 요소 {p.features.length}개</p></div>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card" style={{ border: "1px solid var(--line)" }}>
        <legend className="small muted">리서치 유형</legend>
        <div className="pick-grid">
          {Object.entries(RESEARCH_TYPES).map(([k, t]) => (
            <label className="pick" key={k}>
              <input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} />
              <div className="card"><h3>{t.name}</h3><p style={{ margin: 0 }}>{t.question}</p><p className="small muted" style={{ margin: 0 }}>주 사용: {t.owner}</p></div>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field card" htmlFor="title">조사 제목
        <input id="title" type="text" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: A300 고하중 관절 — 감속기와 브레이크 특허 동향" />
      </label>
      {err && <Alert kind="err">{err}</Alert>}
      <div><button className="btn primary" disabled={busy || !title.trim()}>조사 만들고 키워드로</button></div>
    </form>
  );
}
