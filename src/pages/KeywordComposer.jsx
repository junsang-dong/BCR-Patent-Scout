import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../lib/api.js";
import { useHealth } from "../lib/ctx.js";
import catalog from "../../data/product-features.json";
import { generateQueries, judgeCount, MIN_FEATURES, MAX_FEATURES, MAX_QUERIES } from "../../shared/queries.js";
import FeatureChip from "../components/FeatureChip.jsx";
import QueryTable from "../components/QueryTable.jsx";
import { Alert } from "../components/ui.jsx";

export default function KeywordComposer() {
  const { data, reload } = useOutletContext();
  const nav = useNavigate();
  const health = useHealth();
  const project = data.project;
  const product = catalog.products.find(p => p.code === project.product_code);
  const saved = data.keywordSet;

  const [selected, setSelected] = useState(saved?.feature_ids ?? []);
  const [opts, setOpts] = useState(() => {
    const q0 = saved?.queries?.[0];
    return { from: q0?.from ?? 2016, to: q0?.to ?? new Date().getFullYear(), patentOnly: q0 ? !q0.utility : true, max: q0?.max ?? 200 };
  });
  const [queries, setQueries] = useState(saved?.queries ?? []);
  const [truncated, setTruncated] = useState(false);
  const [preview, setPreview] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const groups = useMemo(() => {
    const m = new Map();
    for (const f of product.features) { if (!m.has(f.group)) m.set(f.group, []); m.get(f.group).push(f); }
    return [...m.entries()];
  }, [product]);

  function regen(sel, o) {
    if (!sel.length) { setQueries([]); setTruncated(false); setPreview({}); return; }
    const r = generateQueries({ catalog, productCode: project.product_code, featureIds: sel, options: o });
    setQueries(r.queries); setTruncated(r.truncated); setPreview({});
  }
  function toggle(id) {
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    if (next.length > MAX_FEATURES) return;
    setSelected(next); regen(next, opts);
  }
  function setOpt(k, v) { const o = { ...opts, [k]: v }; setOpts(o); if (selected.length) regen(selected, o); }

  const kiprisOff = health?.kipris === "not_configured";
  const valid = queries.length > 0 && queries.every(q => q.inventionTitle || q.astrtCont || q.ipcNumber);

  async function runPreview() {
    setBusy("preview"); setErr(null);
    const out = {};
    for (const q of queries) {
      try {
        const r = await api.search(project.id, q, true);
        const j = judgeCount(r.totalCount);
        out[q.name] = { total: r.totalCount, level: j.level, message: j.message };
      } catch (ex) {
        out[q.name] = { error: ex.message };
        setPreview({ ...out });
        break; // 같은 원인(키·한도)으로 계속 실패하므로 멈춘다
      }
      setPreview({ ...out });
    }
    setBusy(null);
  }

  async function save() {
    setBusy("save"); setErr(null);
    try {
      await api.saveKeywords(project.id, { featureIds: selected, queries });
      await reload();
      nav("../results");
    } catch (ex) { setErr(ex.message); setBusy(null); }
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <h2>1. 기술 요소 고르기 <span className="muted small">({MIN_FEATURES}~{MAX_FEATURES}개)</span></h2>
          <p className="muted small">{product.code} {product.name}. 제품 마스터 v2.1에서 뽑은 요소입니다. 키워드와 IPC는 시작점이며 연구개발팀이 보정합니다.</p>
        </div>
        {groups.map(([g, feats]) => (
          <div key={g}>
            <div className="small muted" style={{ marginBottom: 6 }}>{g}</div>
            <div className="row">
              {feats.map(f => <FeatureChip key={f.id} feature={f} selected={selected.includes(f.id)} disabled={selected.length >= MAX_FEATURES} onToggle={toggle} />)}
            </div>
          </div>
        ))}
        <div className="row small">
          <span className="muted">선택 {selected.length}개</span>
          {selected.length === 1 && <span className="muted">· 2개 이상 고르면 교차 검색식이 함께 만들어집니다.</span>}
        </div>
      </section>

      <section className="card stack">
        <h2>2. 조건</h2>
        <div className="row">
          <label className="field" style={{ width: 110 }} htmlFor="from">출원연도 시작
            <input id="from" type="number" value={opts.from} min={1960} max={2100} onChange={e => setOpt("from", Number(e.target.value))} />
          </label>
          <label className="field" style={{ width: 110 }} htmlFor="to">출원연도 끝
            <input id="to" type="number" value={opts.to} min={1960} max={2100} onChange={e => setOpt("to", Number(e.target.value))} />
          </label>
          <label className="field" style={{ width: 130 }} htmlFor="max">검색식당 최대 건수
            <input id="max" type="number" value={opts.max} min={1} max={200} onChange={e => setOpt("max", Math.min(200, Math.max(1, Number(e.target.value) || 200)))} />
          </label>
          <label className="row small" style={{ alignSelf: "end", paddingBottom: 8 }}>
            <input type="checkbox" checked={opts.patentOnly} onChange={e => setOpt("patentOnly", e.target.checked)} /> 특허만 (실용신안 제외)
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>기간은 받아온 결과를 출원연도로 거릅니다. 여러 단어를 한 칸에 넣을 때 AND/OR 처리 방식은 KIPRIS 확인 전이라 기본은 키워드 1개씩만 넣습니다.</p>
      </section>

      <section className="card stack">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>3. 검색식 (직접 고칠 수 있음)</h2>
          <button type="button" className="btn" onClick={() => regen(selected, opts)} disabled={!selected.length}>검색식 다시 만들기</button>
        </div>
        {truncated && <Alert kind="warn">검색식은 조사당 최대 {MAX_QUERIES}개입니다. 초과분은 만들지 않았습니다. 기술 요소를 줄여 보세요.</Alert>}
        {queries.length === 0
          ? <p className="muted">기술 요소를 고르면 검색식이 여기에 만들어집니다.</p>
          : <QueryTable queries={queries} preview={preview}
              onChange={(i, q) => { setQueries(qs => qs.map((x, j) => (j === i ? q : x))); setPreview(p => { const n = { ...p }; delete n[q.name]; return n; }); }}
              onRemove={i => setQueries(qs => qs.filter((_, j) => j !== i))} />}
        {kiprisOff && <Alert kind="err">KIPRIS 키가 설정되지 않아 건수 미리보기와 검색을 쓸 수 없습니다. 운영자에게 KIPRIS_API_KEY 설정을 요청하세요.</Alert>}
        {err && <Alert kind="err">{err}</Alert>}
        <div className="row">
          <button type="button" className="btn" onClick={runPreview} disabled={!valid || kiprisOff || busy}>{busy === "preview" ? "건수 확인 중…" : "건수 미리보기"}</button>
          <button type="button" className="btn primary" onClick={save} disabled={!valid || selected.length < MIN_FEATURES || busy}>{busy === "save" ? "저장 중…" : "검색식 확정하고 수집 화면으로"}</button>
          {saved && <Link className="btn" to="../results">저장된 검색식으로 이동</Link>}
        </div>
        <p className="small muted" style={{ margin: 0 }}>0건이거나 300건을 넘는 검색식은 노란 표시로 알려 드립니다. 수집은 검색식당 200건에서 멈춥니다.</p>
      </section>
    </div>
  );
}
