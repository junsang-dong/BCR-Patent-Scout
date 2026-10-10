import { useEffect, useState, useCallback } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { api } from "./lib/api.js";
import { HealthContext } from "./lib/ctx.js";
import { Loading, Alert } from "./components/ui.jsx";
import ProjectList from "./pages/ProjectList.jsx";
import ProjectNew from "./pages/ProjectNew.jsx";
import ProjectShell from "./pages/ProjectShell.jsx";
import KeywordComposer from "./pages/KeywordComposer.jsx";
import Results from "./pages/Results.jsx";
import Similarity from "./pages/Similarity.jsx";
import Report from "./pages/Report.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  const [auth, setAuth] = useState(null);
  const [health, setHealth] = useState(null);
  const [fatal, setFatal] = useState(null);

  const loadAuth = useCallback(() => api.authState().then(setAuth).catch(e => setFatal(e.message)), []);
  useEffect(() => { loadAuth(); }, [loadAuth]);
  useEffect(() => {
    const on = () => setAuth({ required: true, authenticated: false });
    window.addEventListener("scout:unauthorized", on);
    return () => window.removeEventListener("scout:unauthorized", on);
  }, []);
  useEffect(() => {
    if (auth && (!auth.required || auth.authenticated)) api.health().then(setHealth).catch(() => setHealth({ db: "error" }));
  }, [auth]);

  if (fatal) return <main className="page wrap"><Alert kind="err">서버에 연결하지 못했습니다: {fatal}</Alert></main>;
  if (!auth) return <main className="page wrap"><Loading /></main>;
  if (auth.required && !auth.authenticated) return <Login onDone={loadAuth} />;

  const notices = [];
  if (health) {
    if (health.kipris === "mock") notices.push("KIPRIS는 가상 응답(MOCK)입니다. 이 앱의 특허 결과는 실제가 아니며 보고서에 인용하면 안 됩니다.");
    if (health.kipris === "not_configured") notices.push("KIPRIS 키가 설정되지 않아 검색을 쓸 수 없습니다. 운영자에게 KIPRIS_API_KEY 설정을 요청하세요.");
    if (health.llm?.provider === "mock") notices.push("AI는 시연용 가짜 공급자(MOCK)입니다. 분석 결과는 실제 AI 분석이 아닙니다.");
    else if (health.llm && !health.llm.configured) notices.push(`AI 공급자(${health.llm.provider}) 키 또는 모델 이름이 설정되지 않아 평가·보고서를 만들 수 없습니다.`);
    if (health.db === "error") notices.push("데이터베이스에 연결하지 못했습니다.");
  }

  return (
    <HealthContext.Provider value={health}>
      <header className="topbar">
        <div className="wrap">
          <Link to="/" className="brand">BCR <span>Patent</span> Scout</Link>
          <nav aria-label="주 메뉴">
            <Link to="/">조사 목록</Link>
            <Link to="/new">새 조사</Link>
          </nav>
          {auth.required && <button className="btn small right" onClick={() => api.logout().then(loadAuth)}>나가기</button>}
        </div>
      </header>
      {notices.length > 0 && (
        <div className="notice-bar" role="status"><div className="wrap">{notices.map(n => <span key={n}>⚠ {n}</span>)}</div></div>
      )}
      <main className="page wrap">
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="/new" element={<ProjectNew />} />
          <Route path="/projects/:id" element={<ProjectShell />}>
            <Route index element={<Navigate to="keywords" replace />} />
            <Route path="keywords" element={<KeywordComposer />} />
            <Route path="results" element={<Results />} />
            <Route path="similarity" element={<Similarity />} />
            <Route path="report" element={<Report />} />
          </Route>
          <Route path="*" element={<Alert kind="warn">없는 화면입니다. <Link to="/">조사 목록으로</Link></Alert>} />
        </Routes>
      </main>
    </HealthContext.Provider>
  );
}
