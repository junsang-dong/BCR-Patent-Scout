export const Badge = ({ kind = "", children }) => <span className={`badge ${kind}`}>{children}</span>;
export const AiBadge = () => <span className="badge ai" title="AI가 만든 초안입니다. 사람이 검토해야 합니다.">AI 초안</span>;
export const Alert = ({ kind = "", children }) => <div className={`alert ${kind}`} role={kind === "err" ? "alert" : undefined}>{children}</div>;
export const Loading = ({ text = "불러오는 중…" }) => <p className="muted" role="status">{text}</p>;
