import { fmtNo } from "../lib/ctx.js";
import { Badge } from "./ui.jsx";

export default function PatentTable({ rows, onPin, pinDisabled }) {
  if (!rows.length) return <p className="muted" style={{ padding: 16 }}>조건에 맞는 특허가 없습니다.</p>;
  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr><th>핀</th><th>출원번호</th><th>발명의 명칭</th><th>출원인</th><th>출원일</th><th>IPC</th><th>상태</th><th>걸린 검색식</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.applicationNumber}>
              <td>
                <input type="checkbox" checked={r.pinned} disabled={!r.pinned && pinDisabled} onChange={e => onPin(r, e.target.checked)} aria-label={`${r.applicationNumber} 핀 고정`} />
              </td>
              <td className="mono small" style={{ whiteSpace: "nowrap" }}>{fmtNo(r.applicationNumber)}</td>
              <td style={{ minWidth: 220 }}>{r.inventionTitle}</td>
              <td>{r.applicantName}</td>
              <td className="mono small">{r.applicationDate ?? "-"}</td>
              <td className="small">{r.ipcNumber}</td>
              <td>{r.registerStatus ? <Badge>{r.registerStatus}</Badge> : null}</td>
              <td className="small mono">{(r.matchedQueries ?? []).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
