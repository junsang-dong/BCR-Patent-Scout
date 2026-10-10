// (4.4 kipris-tool/src/stats.mjs에서 이식) 특허 목록 → 기술기획형 리포트용 집계 (순수 함수)
// 출원인 · 기술 분류(IPC) · 연도 · 상태

// 같은 회사가 표기만 다르게 들어오는 경우를 묶는다. 원래 표기는 aliases에 남긴다.
export function normalizeApplicant(name) {
  if (!name) return "(출원인 없음)";
  return name
    .replace(/주식회사|\(주\)|㈜|유한회사|\(유\)/g, "")
    .replace(/\b(co\.?,?\s*ltd\.?|inc\.?|corp(oration)?\.?|gmbh|ag|ab|a\/s|oy|as|ltd\.?)\b/gi, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || name.trim();
}

// "B25J 9/12|H02K 7/116" → ["B25J 9/12", "H02K 7/116"]
export function splitIpc(ipc) {
  if (!ipc) return [];
  return String(ipc).split(/[|,;]/).map(s => s.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
}
export const ipcSubclass = code => (code ? code.replace(/\s/g, "").slice(0, 4).toUpperCase() : null); // B25J
export const ipcMainGroup = code => {                                                                     // B25J 9
  if (!code) return null;
  const m = code.replace(/\s+/g, "").toUpperCase().match(/^([A-H]\d{2}[A-Z])(\d{1,4})/);
  return m ? `${m[1]} ${m[2]}` : ipcSubclass(code);
};

export function dedupe(records) {
  const seen = new Map();
  for (const r of records) if (r.applicationNumber && !seen.has(r.applicationNumber)) seen.set(r.applicationNumber, r);
  return [...seen.values()];
}

const yearOf = r => (r.applicationDate ? Number(String(r.applicationDate).slice(0, 4)) : null);
const inc = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

export function computeStats(input, { topN = 10, asOf = new Date().toISOString().slice(0, 10), recentYears = 3 } = {}) {
  const recs = dedupe(input);
  const years = recs.map(yearOf).filter(Boolean);
  const maxYear = years.length ? Math.max(...years) : null;
  const minYear = years.length ? Math.min(...years) : null;

  const byYear = new Map(), byApp = new Map(), aliases = new Map(), bySub = new Map(), byGroup = new Map(), byStatus = new Map();
  const appYears = new Map(), appSub = new Map();

  for (const r of recs) {
    const y = yearOf(r);
    const app = normalizeApplicant(r.applicantName);
    const ipcs = splitIpc(r.ipcNumber);
    const main = ipcs[0] ?? null;

    if (y) inc(byYear, y);
    inc(byApp, app);
    if (!aliases.has(app)) aliases.set(app, new Set());
    if (r.applicantName) aliases.get(app).add(r.applicantName.trim());
    if (main) { inc(bySub, ipcSubclass(main)); inc(byGroup, ipcMainGroup(main)); }
    inc(byStatus, r.registerStatus ?? "(상태 없음)");

    if (!appYears.has(app)) appYears.set(app, []);
    if (y) appYears.get(app).push(y);
    if (main) {
      if (!appSub.has(app)) appSub.set(app, new Map());
      inc(appSub.get(app), ipcMainGroup(main));
    }
  }

  const total = recs.length;
  const recentFrom = maxYear ? maxYear - recentYears + 1 : null;
  const priorFrom = recentFrom ? recentFrom - recentYears : null;

  const applicants = top(byApp, topN).map(([name, count]) => {
    const ys = appYears.get(name) ?? [];
    const recent = ys.filter(y => y >= recentFrom).length;
    const prior = ys.filter(y => y >= priorFrom && y < recentFrom).length;
    return {
      applicant: name,
      count,
      share_pct: Math.round(count / total * 1000) / 10,
      first_year: ys.length ? Math.min(...ys) : null,
      last_year: ys.length ? Math.max(...ys) : null,
      recent_count: recent,
      prior_count: prior,
      top_ipc_groups: top(appSub.get(name) ?? new Map(), 3).map(([g, c]) => ({ group: g, count: c })),
      name_variants: [...(aliases.get(name) ?? [])]
    };
  });

  // 출원인 × IPC 주 그룹 매트릭스 (상위 출원인 × 상위 그룹)
  const groups = top(byGroup, 8).map(([g]) => g);
  const matrix = applicants.map(a => ({
    applicant: a.applicant,
    cells: groups.map(g => (appSub.get(a.applicant)?.get(g) ?? 0))
  }));

  return {
    as_of: asOf,
    total_records: total,
    year_range: minYear ? [minYear, maxYear] : null,
    by_year: [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count })),
    top_applicants: applicants,
    by_ipc_subclass: top(bySub, topN).map(([code, count]) => ({ code, count })),
    by_ipc_group: top(byGroup, topN).map(([code, count]) => ({ code, count })),
    by_status: top(byStatus, 10).map(([status, count]) => ({ status, count })),
    applicant_ipc_matrix: { groups, rows: matrix },
    caveats: [
      "특허 출원은 보통 출원 후 18개월이 지나야 공개되므로, 최근 1~2년 출원 건수는 실제보다 적게 집계됩니다.",
      "출원인 이름은 표기 차이를 자동으로 묶었습니다. name_variants를 사람이 확인해야 합니다.",
      "기술 분류는 각 특허의 첫 번째 IPC(주 분류)만 기준으로 셌습니다.",
      "집계 범위는 검색식으로 수집한 건에 한정됩니다. 검색식이 바뀌면 결과도 바뀝니다."
    ]
  };
}

export function toCsv(records) {
  const cols = ["applicationNumber", "applicationDate", "applicantName", "inventionTitle", "ipcNumber", "registerStatus", "openNumber", "openDate", "registerNumber", "registerDate"];
  const esc = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...records.map(r => cols.map(c => esc(r[c])).join(","))].join("\n") + "\n";
}
