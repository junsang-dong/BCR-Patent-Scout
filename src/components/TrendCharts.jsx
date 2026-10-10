// 동향 차트 3종 — 연도별 · 상위 출원인 · IPC 주 그룹 (CSS 막대, 값은 stats 그대로)
function Bars({ rows, hatchedFrom }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="bars">
      {rows.map(r => (
        <div className="bar-row" key={r.label}>
          <span className="lab" title={r.label}>{r.label}{r.hatched ? " *" : ""}</span>
          <span className="bar-track"><span className={`bar-fill ${r.hatched ? "hatched" : ""}`} style={{ width: `${(r.value / max) * 100}%`, display: "block" }} /></span>
          <span className="val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendCharts({ stats }) {
  if (!stats || !stats.total_records) return <p className="muted">집계할 특허가 없습니다.</p>;
  const maxYear = stats.year_range?.[1];
  const years = stats.by_year.map(y => ({ label: String(y.year), value: y.count, hatched: maxYear != null && y.year >= maxYear - 1 }));
  const apps = stats.top_applicants.slice(0, 8).map(a => ({ label: a.applicant, value: a.count }));
  const ipc = stats.by_ipc_group.slice(0, 8).map(g => ({ label: g.code, value: g.count }));
  return (
    <div className="stack">
      <div className="grid">
        <div className="card"><h3>연도별 출원</h3><Bars rows={years} /><p className="small muted" style={{ marginTop: 8 }}>* 최근 2개 연도는 출원 후 18개월 공개 지연으로 실제보다 적게 집계됩니다.</p></div>
        <div className="card"><h3>상위 출원인</h3><Bars rows={apps} /></div>
        <div className="card"><h3>IPC 주 그룹</h3><Bars rows={ipc} /></div>
      </div>
      <ul className="small muted" style={{ margin: 0, paddingLeft: "1.2em" }}>
        {stats.caveats.map(c => <li key={c}>{c}</li>)}
      </ul>
    </div>
  );
}
