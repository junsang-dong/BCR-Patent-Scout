import { Badge } from "./ui.jsx";

// 자동 생성된 검색식 표 — 제목·요약·IPC를 직접 고칠 수 있고 건수 미리보기 결과를 함께 보여 준다
export default function QueryTable({ queries, preview, onChange, onRemove, ipcHints = {} }) {
  const set = (i, k, v) => onChange(i, { ...queries[i], [k]: v });
  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr><th>이름</th><th>제목 키워드</th><th>요약 키워드</th><th>IPC</th><th>건수 미리보기</th><th><span className="sr-only">삭제</span></th></tr>
        </thead>
        <tbody>
          {queries.map((q, i) => {
            const p = preview[q.name];
            return (
              <tr key={q.name}>
                <td className="mono small">{q.name}</td>
                <td><input type="text" aria-label={`${q.name} 제목 키워드`} value={q.inventionTitle} onChange={e => set(i, "inventionTitle", e.target.value)} /></td>
                <td><input type="text" aria-label={`${q.name} 요약 키워드`} value={q.astrtCont} onChange={e => set(i, "astrtCont", e.target.value)} /></td>
                <td>
                  <input type="text" aria-label={`${q.name} IPC`} list={`ipc-${q.name}`} value={q.ipcNumber} onChange={e => set(i, "ipcNumber", e.target.value)} style={{ width: "8em" }} />
                  <datalist id={`ipc-${q.name}`}>{(ipcHints[q.name] ?? []).map(h => <option key={h} value={h} />)}</datalist>
                  {(ipcHints[q.name] ?? []).length > 1 && (
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {ipcHints[q.name].slice(0, 4).map(h => (
                        <button key={h} type="button" className="chip" aria-pressed={q.ipcNumber === h} style={{ padding: "1px 8px", fontSize: "0.74rem" }} onClick={() => set(i, "ipcNumber", h)}>{h}</button>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {!p && <span className="muted small">아직 안 봄</span>}
                  {p?.error && <Badge kind="err">오류</Badge>}
                  {p?.error && <div className="small">{p.error}</div>}
                  {p && !p.error && (
                    <>
                      <Badge kind={p.level === "ok" ? "ok" : "warn"}>{p.level === "ok" ? "적당" : "주의"} · {p.total}건</Badge>
                      {p.level === "warn" && <div className="small">{p.message}</div>}
                    </>
                  )}
                </td>
                <td><button type="button" className="btn small" onClick={() => onRemove(i)} aria-label={`${q.name} 삭제`}>삭제</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
