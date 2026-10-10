import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../lib/api.js";
import { useHealth, fmtNo } from "../lib/ctx.js";
import { useRights } from "../lib/useRights.js";
import RightsPanel from "../components/RightsPanel.jsx";
import { PAGE_SIZE } from "../../shared/queries.js";
import PatentTable from "../components/PatentTable.jsx";
import TrendCharts from "../components/TrendCharts.jsx";
import { Alert, Badge, Loading } from "../components/ui.jsx";

const PAGE = 50;
const MAX_PIN = 20;

export default function Results() {
  const { data, reload } = useOutletContext();
  const health = useHealth();
  const project = data.project;
  const queries = data.keywordSet?.queries ?? [];
  const [patents, setPatents] = useState(null);
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ from: "", to: "", applicant: "", ipc: "", status: "", query: "", pinned: false, text: "" });
  const [page, setPage] = useState(0);

  const lastRun = useMemo(() => {
    const m = {};
    for (const r of data.runs) if (!m[r.query_name]) m[r.query_name] = r; // runs는 최신순
    return m;
  }, [data.runs]);
  // 검색식별: 성공한 마지막 쪽, 전체 건수(가장 최근 성공 기록), 누적 수집 건수
  const progressOf = useMemo(() => {
    const m = {};
    for (const r of data.runs) {
      if (r.error || !r.finished_at) continue;
      const cur = m[r.query_name] ?? { lastPage: 0, total: null };
      cur.lastPage = Math.max(cur.lastPage, r.query?.page ?? 1);
      if (cur.total == null) cur.total = r.total_count; // runs는 최신순이므로 첫 성공 기록이 최신
      m[r.query_name] = cur;
    }
    return m;
  }, [data.runs]);
  const collectedOf = q => data.collected?.[q.name] ?? 0;
  const ceilingOf = (q, total) => Math.min(q.max ?? 200, 200, total ?? 200);
  const hasMore = q => { const pr = progressOf[q.name]; return !!pr && pr.lastPage * PAGE_SIZE < ceilingOf(q, pr.total); };
  const [rightsMap, loadRights] = useRights();
  const [rightsFor, setRightsFor] = useState(null);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([api.patents(project.id), api.stats(project.id)]);
    setPatents(p); setStats(s);
  }, [project.id]);
  useEffect(() => { refresh().catch(e => setErr(e.message)); }, [refresh]);

  const kiprisOff = health?.kipris === "not_configured";

  // jobs: [{ q, page }] — 한 번에 한 검색식의 한 쪽(20건)씩 요청한다
  async function collect(jobs) {
    setErr(null);
    for (let i = 0; i < jobs.length; i++) {
      const { q, page } = jobs[i];
      setProgress({ name: q.name, i: i + 1, n: jobs.length });
      try { await api.search(project.id, q, false, page); }
      catch (ex) { setErr(`${q.name}: ${ex.message}`); break; }
      await reload(); await refresh();
    }
    setProgress(null); await reload();
  }
  const firstPage = q => ({ q, page: 1 });
  const nextPage = q => ({ q, page: (progressOf[q.name]?.lastPage ?? 0) + 1 });

  async function pin(row, pinned) {
    setPatents(ps => ps.map(p => (p.applicationNumber === row.applicationNumber ? { ...p, pinned } : p)));
    try { await api.pin(project.id, row.applicationNumber, pinned); }
    catch (ex) { setErr(ex.message); refresh(); }
  }

  const filtered = useMemo(() => {
    if (!patents) return [];
    const y = d => (d ? Number(d.slice(0, 4)) : null);
    return patents.filter(p =>
      (!f.from || (y(p.applicationDate) ?? 9999) >= Number(f.from)) &&
      (!f.to || (y(p.applicationDate) ?? 0) <= Number(f.to)) &&
      (!f.applicant || (p.applicantName ?? "").toLowerCase().includes(f.applicant.toLowerCase())) &&
      (!f.ipc || (p.ipcNumber ?? "").replace(/\s/g, "").toUpperCase().startsWith(f.ipc.replace(/\s/g, "").toUpperCase())) &&
      (!f.status || p.registerStatus === f.status) &&
      (!f.query || p.matchedQueries.includes(f.query)) &&
      (!f.pinned || p.pinned) &&
      (!f.text || (p.inventionTitle ?? "").includes(f.text))
    );
  }, [patents, f]);

  const pinnedCount = patents?.filter(p => p.pinned).length ?? 0;
  const statuses = useMemo(() => [...new Set((patents ?? []).map(p => p.registerStatus).filter(Boolean))], [patents]);
  const pageRows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const setFilter = (k, v) => { setF(x => ({ ...x, [k]: v })); setPage(0); };
  const todo = queries.filter(q => !progressOf[q.name]);

  if (!data.keywordSet) return <Alert kind="warn">검색식이 아직 없습니다. <Link to="../keywords">키워드 조합</Link>에서 먼저 확정하세요.</Alert>;

  return (
    <div className="stack">
      <section className="card stack">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>검색식별 수집</h2>
          <button className="btn primary" disabled={!todo.length || !!progress || kiprisOff} onClick={() => collect(todo.map(firstPage))}>
            {progress ? `수집 중 ${progress.i}/${progress.n}…` : todo.length ? `아직 안 한 ${todo.length}개 — 각 ${PAGE_SIZE}건씩 수집` : "처음 20건씩 모두 수집됨"}
          </button>
        </div>
        {kiprisOff && <Alert kind="err">KIPRIS 키가 설정되지 않아 수집할 수 없습니다. 이미 수집된 결과는 볼 수 있습니다.</Alert>}
        {err && <Alert kind="err">{err}</Alert>}
        <div className="scroll-x">
          <table>
            <thead><tr><th>검색식</th><th>상태</th><th className="num">전체 건수</th><th className="num">누적 수집</th><th>게이트웨이</th><th></th></tr></thead>
            <tbody>
              {queries.map(q => {
                const r = lastRun[q.name];
                const pr = progressOf[q.name];
                const running = progress?.name === q.name;
                const more = hasMore(q);
                const capped = pr && pr.total > ceilingOf(q, pr.total) && !more;
                return (
                  <tr key={q.name}>
                    <td className="mono small">{q.name}<div className="muted">{[q.astrtCont, q.ipcNumber].filter(Boolean).join(" · ")}</div></td>
                    <td>
                      {running ? <Badge kind="info">수집 중</Badge>
                        : !r ? <Badge>대기</Badge>
                        : r.error ? <Badge kind="err">오류</Badge>
                        : capped ? <Badge kind="warn">총 한도에서 멈춤</Badge>
                        : more ? <Badge kind="info">더 있음</Badge>
                        : <Badge kind="ok">전부 수집</Badge>}
                      {r?.error && <div className="small">{r.error}</div>}
                    </td>
                    <td className="num">{pr?.total ?? "-"}</td>
                    <td className="num">{pr ? collectedOf(q) : "-"}</td>
                    <td className="small">{r?.gateway ?? "-"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {!pr && !running && <button className="btn small" disabled={!!progress || kiprisOff} onClick={() => collect([firstPage(q)])}>수집 (20건)</button>}
                      {more && !running && <button className="btn small primary" disabled={!!progress || kiprisOff} onClick={() => collect([nextPage(q)])}>더 보기 (+{Math.min(PAGE_SIZE, ceilingOf(q, pr.total) - pr.lastPage * PAGE_SIZE)})</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {queries.some(q => (progressOf[q.name]?.total ?? 0) > 300) && <Alert kind="warn">전체 건수가 300건을 넘는 검색식이 있습니다. 더 좁은 IPC(예: 브레이크는 B25J 19)로 바꾸면 더 정확하고 호출도 줄어듭니다. <Link to="../keywords">검색식·IPC 고치기</Link></Alert>}
        <p className="small muted" style={{ margin: 0 }}>무료 호출 한도를 아끼려고 한 번에 {PAGE_SIZE}건씩 가져옵니다. "더 보기"를 누를 때만 다음 {PAGE_SIZE}건을 가져오며, 검색식당 총 200건까지입니다.</p>
      </section>

      <section className="stack">
        <h2 style={{ margin: 0 }}>동향 <span className="muted small">(수집된 {stats?.total_records ?? 0}건 기준)</span></h2>
        {stats ? <TrendCharts stats={stats} /> : <Loading />}
      </section>

      <section className="card flat">
        <div style={{ padding: "14px 16px" }} className="stack">
          <div className="row">
            <h2 className="grow" style={{ margin: 0 }}>검색 결과 <span className="muted small">{filtered.length}건 / 핀 {pinnedCount}건 (최대 {MAX_PIN})</span></h2>
            <Link className={`btn primary ${pinnedCount ? "" : "disabled"}`} to="../similarity" aria-disabled={!pinnedCount} onClick={e => { if (!pinnedCount) e.preventDefault(); }}>유사성 평가로 ({pinnedCount}건)</Link>
          </div>
          <div className="row small">
            <label className="field" style={{ width: 86 }}>연도 시작<input type="number" value={f.from} onChange={e => setFilter("from", e.target.value)} /></label>
            <label className="field" style={{ width: 86 }}>연도 끝<input type="number" value={f.to} onChange={e => setFilter("to", e.target.value)} /></label>
            <label className="field" style={{ width: 150 }}>출원인<input type="text" value={f.applicant} onChange={e => setFilter("applicant", e.target.value)} /></label>
            <label className="field" style={{ width: 100 }}>IPC 시작<input type="text" value={f.ipc} placeholder="B25J" onChange={e => setFilter("ipc", e.target.value)} /></label>
            <label className="field" style={{ width: 150 }}>제목 포함<input type="text" value={f.text} onChange={e => setFilter("text", e.target.value)} /></label>
            <label className="field" style={{ width: 110 }}>상태
              <select value={f.status} onChange={e => setFilter("status", e.target.value)}><option value="">전체</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
            </label>
            <label className="field" style={{ width: 170 }}>검색식
              <select value={f.query} onChange={e => setFilter("query", e.target.value)}><option value="">전체</option>{queries.map(q => <option key={q.name}>{q.name}</option>)}</select>
            </label>
            <label className="row" style={{ alignSelf: "end", paddingBottom: 6 }}><input type="checkbox" checked={f.pinned} onChange={e => setFilter("pinned", e.target.checked)} /> 핀 고정만</label>
          </div>
        </div>
        {!patents ? <Loading /> : <PatentTable rows={pageRows} onPin={pin} pinDisabled={pinnedCount >= MAX_PIN} onRights={a => { setRightsFor(a); if (!rightsMap[a]) loadRights(a); }} rightsFor={rightsFor} rightsMap={rightsMap} />}
        {rightsFor && (
          <div className="stack" style={{ padding: "14px 16px", borderTop: "1px solid var(--line)" }} aria-live="polite">
            <div className="row">
              <h3 className="grow" style={{ margin: 0 }}>권리 현황 <span className="mono small muted">{fmtNo(rightsFor)}</span></h3>
              <button className="btn small" onClick={() => setRightsFor(null)}>닫기</button>
            </div>
            <RightsPanel application={rightsFor} state={rightsMap[rightsFor]} onLoad={loadRights} />
          </div>
        )}
        {pages > 1 && (
          <div className="row" style={{ padding: "10px 16px" }}>
            <button className="btn small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전</button>
            <span className="small muted">{page + 1} / {pages}</span>
            <button className="btn small" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>다음</button>
          </div>
        )}
      </section>
    </div>
  );
}
