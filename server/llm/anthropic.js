// Anthropic Messages API 어댑터 — POST /v1/messages, 헤더 x-api-key · anthropic-version
export async function callAnthropic({ system, messages, maxTokens, model, signal }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic 오류 ${res.status}: ${body?.error?.message ?? "응답을 읽을 수 없습니다."}`);
  const text = (body.content ?? []).filter(b => b.type === "text").map(b => b.text).join("");
  return { text, usage: { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 } };
}
