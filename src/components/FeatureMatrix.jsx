import { MATCH_LABEL, MATCH_MARK } from "../../shared/constants.js";
import { fmtNo } from "../lib/ctx.js";

// 특허 × 기술 요소 매트릭스 — 색 외에 기호와 글자를 함께 쓴다 (접근성)
export default function FeatureMatrix({ rows, features, selected, onSelect }) {
  return (
    <div className="scroll-x">
      <table className="matrix">
        <thead>
          <tr>
            <th>특허</th>
            {features.map(f => <th key={f.id} title={f.spec}>{f.label}</th>)}
            <th>종합</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.applicationNumber}>
              <td style={{ minWidth: 200 }}>
                <div className="mono small">{fmtNo(r.applicationNumber)}</div>
                <div className="small">{r.title}</div>
              </td>
              {features.map(f => {
                const cell = r.result?.features.find(x => x.feature_id === f.id);
                if (!cell) return <td key={f.id} className="muted">-</td>;
                const on = selected?.app === r.applicationNumber && selected?.feature === f.id;
                return (
                  <td key={f.id}>
                    <button type="button" className={`cell-btn ${cell.match}`} aria-pressed={on} onClick={() => onSelect({ app: r.applicationNumber, feature: f.id })}>
                      {MATCH_MARK[cell.match]} {MATCH_LABEL[cell.match]}{cell.evidence_unverified ? " ‡" : ""}
                    </button>
                  </td>
                );
              })}
              <td className="small">{r.result ? ({ high: "높음", medium: "보통", low: "낮음" })[r.result.overall] : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
