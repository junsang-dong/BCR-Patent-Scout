// LLM 공급자 어댑터 (명세 4.2) — 호출하는 쪽은 공급자를 모른다
//   generate({ purpose, system, messages, maxTokens, json, projectId })
//     → { text, json?, provider, model, usage: { input, output }, latencyMs }
// LLM_PROVIDER=mock 은 로컬 시연용 가짜 공급자다 (결과는 가상이며 보고서에 MOCK로 표시된다).

import { callAnthropic } from "./anthropic.js";
import { callOpenAI } from "./openai.js";
import { callMock } from "./mock.js";
import { extractJson } from "./json.js";
import { query } from "../db.js";
import { scrubAll } from "../http.js";

export function providerInfo() {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "mock") return { provider, model: "mock", configured: true };
  if (provider === "openai") return { provider, model: process.env.OPENAI_MODEL ?? "", configured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) };
  return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL ?? "", configured: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL) };
}

async function log(row) {
  try {
    await query(
      `insert into llm_calls (project_id, purpose, provider, model, input_tokens, output_tokens, latency_ms, ok, error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.projectId ?? null, row.purpose, row.provider, row.model, row.input ?? 0, row.output ?? 0, row.latencyMs ?? 0, row.ok, row.error ?? null]
    );
  } catch (e) { console.error("[llm] 호출 기록 실패:", scrubAll(e.message)); }
}

export async function generate({ purpose, system, messages, maxTokens = 4096, json = false, projectId, provider: forced }) {
  const info = providerInfo();
  const provider = forced ?? info.provider;
  if (!info.configured && provider === info.provider) throw new Error(`LLM 공급자(${provider})가 설정되지 않았습니다. 운영자에게 키와 모델 이름 설정을 요청하세요.`);
  const model = info.model;
  const started = Date.now();
  try {
    const args = { system, messages, maxTokens, model, json, purpose, signal: AbortSignal.timeout(110_000) };
    const call = provider === "openai" ? callOpenAI : provider === "mock" ? callMock : callAnthropic;
    const { text, usage } = await call(args);
    const out = { text, provider, model, usage, latencyMs: Date.now() - started };
    if (json) out.json = extractJson(text);
    await log({ projectId, purpose, provider, model, input: usage.input, output: usage.output, latencyMs: out.latencyMs, ok: true });
    return out;
  } catch (e) {
    await log({ projectId, purpose, provider, model, latencyMs: Date.now() - started, ok: false, error: scrubAll(e.message).slice(0, 300) });
    throw e;
  }
}
