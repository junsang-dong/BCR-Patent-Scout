// 검색식 생성 규칙 (명세 5.3) — 브라우저(미리보기)와 서버(검증)가 같은 코드를 쓴다.
//
// 1. 선택한 기술 요소마다 검색식 1개: 요약 키워드(요소 키워드) + IPC 후보 1개.
//    제목 키워드(제품 대표어)는 기본에서 뺀다. 실제 KIPRIS 시험(docs/spike.md)에서 제목+요약+IPC를 모두 걸면
//    0~4건으로 너무 좁았다. IPC 후보가 없는 요소만 제목 키워드로 범위를 좁힌다. 옵션 useTitle로 켤 수 있다.
// 2. 요소를 2개 이상 고르면 교차 검색식을 쌍마다 추가한다 (예: 감속기 × 브레이크)
// 3. 공통 조건: 기간(기본 2016~올해), 특허만(실용신안 제외)
// 4. 조사 하나당 검색식 최대 8개, 검색식당 최대 수집 200건. 수집은 한 번에 20건(PAGE_SIZE)씩, "더 보기"로 이어 간다.
// 5. IPC 후보(ipc_hints)는 앞쪽이 기본값이고 화면에서 다른 후보로 바꿀 수 있다 (예: 브레이크 → B25J 19).

export const MAX_QUERIES = 8;
export const MAX_PER_QUERY = 200;
export const PAGE_SIZE = 20; // 한 번에 가져오는 건수. "더 보기"로 다음 20건을 가져온다
export const MIN_FEATURES = 2;
export const MAX_FEATURES = 4;

export function findProduct(catalog, productCode) {
  return catalog.products.find(p => p.code === productCode) ?? null;
}

export function defaultOptions(now = new Date()) {
  return { from: 2016, to: now.getFullYear(), patentOnly: true, max: MAX_PER_QUERY, useTitle: false };
}

const slug = id => id.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// 한 요소의 검색식. 키워드는 첫 번째 후보를 쓴다. 한 항목에 여러 단어를 넣으면 AND로 동작하고
// 순서는 상관없다 (S3 실측). 교차 검색식은 이 성질을 쓴다. 화면에서 고칠 수 있다.
function single(feature, o) {
  const ipc = feature.ipc_hints[0] ?? "";
  return {
    name: slug(feature.id),
    inventionTitle: o.useTitle || !ipc ? feature.keywords.title[0] ?? "" : "",
    astrtCont: feature.keywords.abstract[0] ?? "",
    ipcNumber: ipc,
    from: o.from, to: o.to, max: o.max,
    patent: true, utility: !o.patentOnly,
    featureIds: [feature.id]
  };
}

function cross(a, b, o) {
  const abs = [a.keywords.abstract[0], b.keywords.abstract[0]].filter(Boolean);
  const ipc = a.ipc_hints[0] ?? b.ipc_hints[0] ?? "";
  return {
    name: `x-${slug(a.id)}-${slug(b.id)}`,
    inventionTitle: o.useTitle || !ipc ? a.keywords.title[0] ?? "" : "",
    astrtCont: [...new Set(abs)].join(" "),
    ipcNumber: ipc,
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

// KIPRIS 검색 조건으로 변환. 출원일 범위는 applicationDate "YYYYMMDD~YYYYMMDD"로 서버에서 거른다 (S4 실측).
// 받아온 뒤 출원연도로 한 번 더 거르는 것(yearFilter)은 안전장치로 남긴다.
export function toKiprisQuery(q) {
  const applicationDate = q.from || q.to ? `${q.from ?? 1960}0101~${q.to ?? 2100}1231` : undefined;
  return {
    applicationDate,
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

// 한 쪽(20건)을 받은 뒤의 요약: 기간 필터 후 보관 건수, 더 받을 수 있는지(hasMore), 검색식당 한도에서 멈췄는지(truncated)
export function pageSummary({ items, totalCount, page, max = MAX_PER_QUERY, from, to, pageSize = PAGE_SIZE }) {
  const kept = yearFilter(items, from, to);
  const reach = Math.min(totalCount, max);
  const seen = (page - 1) * pageSize + items.length;
  return { kept, seen, hasMore: items.length > 0 && seen < reach, truncated: totalCount > max && seen >= max };
}

// 이 쪽에서 가져올 건수 (마지막 쪽은 한도에 맞춰 줄인다). 한도에 이미 닿았으면 0
export function rowsForPage(page, max = MAX_PER_QUERY, pageSize = PAGE_SIZE) {
  return Math.max(0, Math.min(pageSize, max - (page - 1) * pageSize));
}
