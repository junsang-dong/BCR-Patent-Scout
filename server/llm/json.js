// 모델 응답에서 JSON 객체를 꺼낸다 (```json 울타리나 앞뒤 설명이 붙어도 처리)
export function extractJson(text) {
  const t = String(text ?? "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : t;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("응답에서 JSON을 찾지 못했습니다.");
  return JSON.parse(candidate.slice(start, end + 1));
}
