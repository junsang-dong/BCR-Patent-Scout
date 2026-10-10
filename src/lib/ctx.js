import { createContext, useContext } from "react";
export const HealthContext = createContext(null);
export const useHealth = () => useContext(HealthContext);

export const fmtDate = d => (d ? String(d).slice(0, 10) : "-");
export const fmtNo = n => (n && /^\d{13}$/.test(n) ? `${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6)}` : n ?? "-");
