// /api 호출 래퍼 — 오류는 { code, message }를 담은 ApiError로 던진다
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, "network", "서버에 연결하지 못했습니다. 네트워크를 확인하세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("scout:unauthorized"));
    throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? `요청 실패 (${res.status})`);
  }
  return data;
}

const q = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();

export const api = {
  authState: () => call("GET", "/api/auth"),
  login: accessCode => call("POST", "/api/auth", { accessCode }),
  logout: () => call("DELETE", "/api/auth"),
  health: () => call("GET", "/api/health"),

  projects: () => call("GET", "/api/projects"),
  createProject: b => call("POST", "/api/projects", b),
  project: id => call("GET", `/api/projects?${q({ id })}`),
  patents: id => call("GET", `/api/projects?${q({ id, action: "patents" })}`),
  saveKeywords: (id, b) => call("POST", `/api/projects?${q({ id, action: "keywords" })}`, b),
  pin: (id, applicationNumber, pinned) => call("PATCH", `/api/projects?${q({ id, action: "pin" })}`, { applicationNumber, pinned }),
  saveReviewed: (id, applicationNumber, reviewed) => call("PATCH", `/api/projects?${q({ id, action: "similarity" })}`, { applicationNumber, reviewed }),

  search: (projectId, query, preview = false, page = 1) => call("POST", "/api/kipris-search", { projectId, query, preview, page }),
  rights: (applicationNumber, refresh = false) => call("POST", "/api/patent-rights", { applicationNumber, refresh }),
  detail: applicationNumber => call("POST", "/api/kipris-detail", { applicationNumber }),
  stats: projectId => call("GET", `/api/stats?${q({ projectId })}`),
  analyze: (projectId, applicationNumbers) => call("POST", "/api/analyze-similarity", { projectId, applicationNumbers }),

  generateReport: (projectId, researchType) => call("POST", "/api/report-generate", { projectId, researchType }),
  reports: projectId => call("GET", `/api/reports?${q({ projectId })}`),
  report: id => call("GET", `/api/reports?${q({ id })}`),
  patchReport: (id, b) => call("PATCH", `/api/reports?${q({ id })}`, b)
};
