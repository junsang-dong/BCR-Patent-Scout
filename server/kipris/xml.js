// 아주 작은 XML 도우미 — KIPRIS 응답처럼 평평한 구조만 다룬다 (외부 패키지 없음)

const ENT = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'" };

export function decode(s) {
  if (s == null) return "";
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(lt|gt|amp|quot|apos);/g, m => ENT[m])
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/<[^>]+>/g, "") // 초록 안의 강조 태그 등 제거
    .trim();
}

// 태그 블록(안쪽 문자열)을 모두 찾는다
export function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

// 첫 번째 태그 값 (없으면 "")
export function text(xml, tag) {
  const b = blocks(xml, tag);
  if (b.length) return decode(b[0]);
  // <tag/> 형태
  return "";
}

// 같은 태그의 모든 값
export function texts(xml, tag) {
  return blocks(xml, tag).map(decode).filter(Boolean);
}
