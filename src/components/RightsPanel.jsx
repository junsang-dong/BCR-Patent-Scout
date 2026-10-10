import { Alert, Badge, Loading } from "./ui.jsx";
import { fmtNo, fmtRegNo } from "../lib/ctx.js";

const KIND = { active: "ok", terminated: "err", expired: "warn", pending: "info", registered_unchecked: "warn", unknown: "" };

// 권리 현황: KIPRIS 데이터 상품 16번(법적 상태 이력 ST.27) + 17번(등록사항). 사실 요약이며 권리 판단이 아니다.
export default function RightsPanel({ application, state, onLoad }) {
  if (!state) return <button className="btn small" onClick={() => onLoad(application)}>권리 현황 조회</button>;
  if (state.loading && !state.data) return <Loading text="권리 현황을 조회하는 중…" />;
  if (state.error) return (
    <div className="stack" style={{ gap: 8 }}>
      <Alert kind="err">{state.error}</Alert>
      <div><button className="btn small" onClick={() => onLoad(application, true)}>다시 조회</button></div>
    </div>
  );
  const d = state.data;
  const s = d.summary;
  const reg = d.registration;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <Badge kind={KIND[s.state]}>{s.label}</Badge>
        {d.mock && <Badge kind="warn">MOCK</Badge>}
        {d.cached && <Badge>캐시(7일)</Badge>}
        <button className="btn small right" disabled={state.loading} onClick={() => onLoad(application, true)}>{state.loading ? "조회 중…" : "다시 조회"}</button>
      </div>
      <dl className="facts">
        <dt>등록번호</dt><dd className="mono">{s.registrationNumber ? fmtRegNo(s.registrationNumber) : "-"}</dd>
        <dt>등록일</dt><dd className="mono">{s.registrationDate ?? "-"}</dd>
        <dt>만료 예정일</dt><dd className="mono">{s.expirationDate ?? "-"}</dd>
        <dt>권리자</dt><dd>{s.holder ?? "-"}</dd>
        <dt>연차료 납부</dt><dd>{s.paidThroughAnnual ? `${s.paidThroughAnnual}년차까지` : "-"}</dd>
        <dt>청구항 수</dt><dd>{reg?.claimCount ?? "-"}</dd>
        <dt>법적 상태 이벤트</dt><dd>{s.eventCount}건{s.lastEventDate ? ` · 마지막 ${s.lastEventDate}` : ""}</dd>
      </dl>
      {d.legal.events.length > 0 && (
        <details>
          <summary className="small">법적 상태 이력 {d.legal.events.length}건 보기</summary>
          <div className="scroll-x" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>일자</th><th>주요 코드</th><th>국내 코드</th><th>세부 코드</th><th>단계</th></tr></thead>
              <tbody>
                {d.legal.events.map(e => (
                  <tr key={e.seq}>
                    <td className="mono small">{e.date}</td><td className="mono small">{e.keyEventCode}</td><td className="mono small">{e.nationalEventCode}</td>
                    <td className="mono small">{e.detailEventCode}</td><td className="small">{e.previousStage} → {e.currentStage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">코드의 뜻은 KIPRIS Plus의 ST.27 코드표를 봐야 합니다. 이 앱은 코드를 해석하지 않고 그대로 보여 줍니다.</p>
        </details>
      )}
      <p className="small muted" style={{ margin: 0 }}>KIPRIS 기록의 요약이며 조회 시점 이후 바뀔 수 있습니다. 권리 존속 여부, 침해, 유효성은 판단하지 않습니다. 변리사 검토 필요.</p>
    </div>
  );
}
