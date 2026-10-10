// OpenAI 어댑터 — Chat Completions (POST /v1/chat/completions)
// ※ 요청 형식·모델 이름은 자주 바뀐다. 운영 전 OpenAI 공식 문서로 확인한다 (명세 4.2).
//   이 어댑터는 문서를 열람하지 못한 상태에서 알려진 형식으로 작성했고 실제 호출은 시험하지 않았다.
export async function callOpenAI({ system, messages, maxTokens, model, json, signal }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const body = {
    model,
    max_completion_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...messages]
  };
  if (json) body.response_format = { type: "json_object" };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI 오류 ${res.status}: ${out?.error?.message ?? "응답을 읽을 수 없습니다."}`);
  return {
    text: out.choices?.[0]?.message?.content ?? "",
    usage: { input: out.usage?.prompt_tokens ?? 0, output: out.usage?.completion_tokens ?? 0 }
  };
}
