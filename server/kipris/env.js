// KIPRIS 키 처리 — 4.4 kipris-tool/src/env.mjs에서 이식 (파일 읽기 부분은 뺐다: 서버는 환경변수만 쓴다)
// 키는 어떤 출력에도 그대로 쓰지 않는다 (mask, scrub 사용).

// 공공데이터포털 등에서 이미 percent-encoding된 키를 복사한 경우 한 번 풀어 둔다.
// 요청 시에는 URLSearchParams가 정확히 한 번 인코딩한다.
export function normalizeKey(raw) {
  if (!raw) return raw;
  const k = raw.trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try { return decodeURIComponent(k); } catch { return k; }
  }
  return k;
}

export const mask = key => (key ? `${key.slice(0, 3)}…(${key.length}자)` : "(없음)");

// 오류 메시지·URL에 키가 섞여 나가지 않도록 지운다
export function scrub(text, key) {
  if (!key || !text) return text;
  const variants = [key, encodeURIComponent(key)];
  let t = String(text);
  for (const v of variants) t = t.split(v).join("***KEY***");
  return t;
}
