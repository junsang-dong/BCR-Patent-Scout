// 검색식 생성 규칙 (명세 5.3) — 브라우저(미리보기)와 서버(검증)가 같은 코드를 쓴다.
//
// 1. 선택한 기술 요소마다 검색식 1개: 제목 키워드(제품 대표어) + 요약 키워드(요소 키워드) + IPC 후보 1개
// 2. 요소를 2개 이상 고르면 교차 검색식을 쌍마다 추가한다 (예: 감속기 × 브레이크)
// 3. 공통 조건: 기간(기본 2016~올해), 특허만(실용신안 제외)
// 4. 조사 하나당 검색식 최대 8개, 검색식당 최대 수집 200건

export const MAX_QUERIES = 8;
export const MAX_PER_QUERY = 200;
export const MIN_FEATURES = 2;
export const MAX_FEATURES = 4;

export function findProduct(catalog, productCode) {
  return catalog.products.find(p => p.code === productCode) ?? null;
}

export function defaultOptions(now = new Date()) {
  return { from: 2016, to: now.getFullYear(), patentOnly: true, max: MAX_PER_QUERY };
}

const slug = id => id.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// 한 요소의 검색식. 키워드는 첫 번째 후보를 쓴다 (여러 단어를 한 항목에 넣을 때의
// AND/OR 처리는 KIPRIS 확인 전(S3)이라 보수적으로 1개만 넣는다). 화면에서 고칠 수 있다.
function single(feature, o) {
  return {
    name: slug(feature.id),
    inventionTitle: feature.keywords.title[0] ?? "",
    astrtCont: feature.keywords.abstract[0] ?? "",
    ipcNumber: feature.ipc_hints[0] ?? "",
    from: o.from, to: o.to, max: o.max,
    patent: true, utility: !o.patentOnly,
    featureIds: [feature.id]
  };
}

function cross(a, b, o) {
  const abs = [a.keywords.abstract[0], b.keywords.abstract[0]].filter(Boolean);
  return {
    name: `x-${slug(a.id)}-${slug(b.id)}`,
    inventionTitle: a.keywords.title[0] ?? "",
    astrtCont: [...new Set(abs)].join(" "),
    ipcNumber: a.ipc_hints[0] ?? b.ipc_hints[0] ?? "",
    from: o.from, to: o.to, max: o.max,
    patent: true, utility: !o.patentOnly,
    featureIds: [a.id, b.id]
  };
}

export function generateQueries({ catalog, productCode, featureIds, options = {} }) {
  const product = findProduct(catalog, productCode);
  if (!product) throw new Error(`알 수 없는 제품: ${productCode}`);
  const o = { ...defaultOptions(), ...options };
  const feats = featureIds.map(id => product.features.find(f => f.id === id)).filter(Boolean);
  const queries = feats.map(f => single(f, o));
  for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) queries.push(cross(feats[i], feats[j], o));
  const truncated = queries.length > MAX_QUERIES;
  return { queries: queries.slice(0, MAX_QUERIES), truncated };
}

// 건수 판단 (02_search-strategy.md 3장 기준)
export function judgeCount(total) {
  if (total == null) return { level: "unknown", message: "건수를 아직 모릅니다." };
  if (total === 0) return { level: "warn", message: "0건입니다. 키워드나 IPC 형식을 바꿔 보세요. IPC가 안 되면 키워드만 시험합니다." };
  if (total > 300) return { level: "warn", message: `${total}건으로 너무 넓습니다. 조건을 하나 더 붙여 좁히세요. 수집은 ${MAX_PER_QUERY}건에서 멈춥니다.` };
  return { level: "ok", message: "적당한 범위입니다." };
}

// KIPRIS 검색 조건으로 변환 (기간은 받아온 뒤 출원연도로 거른다 — 명세 10.2 S4)
export function toKiprisQuery(q) {
  return {
    inventionTitle: q.inventionTitle || undefined,
    astrtCont: q.astrtCont || undefined,
    ipcNumber: q.ipcNumber || undefined,
    patent: String(q.patent !== false),
    utility: String(!!q.utility)
  };
}

export function yearFilter(items, from, to) {
  return items.filter(r => {
    const y = r.applicationDate ? Number(String(r.applicationDate).slice(0, 4)) : null;
    if (!y) return true;
    return (!from || y >= from) && (!to || y <= to);
  });
}

// 수집 결과 요약: 기간 필터 후 보관 건수, 수집 한도에서 멈췄는지(truncated)
export function runSummary({ items, totalCount, max, from, to }) {
  const fetched = Math.min(items.length, max);
  const kept = yearFilter(items.slice(0, max), from, to);
  return { fetched, kept, truncated: fetched >= max && totalCount > fetched };
}
