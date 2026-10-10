import { useState } from "react";
import { api } from "../lib/api.js";
import { Alert } from "../components/ui.jsx";

export default function Login({ onDone }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api.login(code); await onDone(); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }
  return (
    <main className="page wrap">
      <form className="card login stack" onSubmit={submit}>
        <div><h1>BCR Patent Scout</h1><p className="muted">사내 접근 코드를 입력하세요.</p></div>
        <label className="field" htmlFor="code">접근 코드
          <input id="code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} autoFocus />
        </label>
        {err && <Alert kind="err">{err}</Alert>}
        <button className="btn primary" disabled={busy || !code}>들어가기</button>
      </form>
    </main>
  );
}
