// LLM 공급자 어댑터 시험 (AT-7의 어댑터 부분) — 실제 호출 없이 fetch를 대체한다
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
const { generate, providerInfo } = await import("../server/llm/index.js");

const saved = { ...process.env };
let calls;
function stub(response) {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => response }; });
}
beforeEach(() => { process.env = { ...saved, PGLITE_DIR: "memory" }; });
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); });

describe("Anthropic 어댑터", () => {
  test("Messages API 형식으로 호출하고 응답을 같은 모양으로 바꾼다", async () => {
    process.env.LLM_PROVIDER = "anthropic"; process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-123456"; process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    stub({ content: [{ type: "text", text: '{"ok": true}' }], usage: { input_tokens: 11, output_tokens: 7 } });
    const r = await generate({ purpose: "similarity", system: "규칙", messages: [{ role: "user", content: "{}" }], json: true });
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].init.headers).toMatchObject({ "x-api-key": "sk-ant-test-key-123456", "anthropic-version": "2023-06-01" });
    expect(calls[0].body).toMatchObject({ model: "claude-sonnet-5-5", system: "규칙", max_tokens: 4096 });
    expect(r).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5", json: { ok: true }, usage: { input: 11, output: 7 } });
  });
  test("오류 응답은 키 없이 메시지만 던진다", async () => {
    process.env.LLM_PROVIDER = "anthropic"; process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-123456"; process.env.ANTHROPIC_MODEL = "m";
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) }));
    await expect(generate({ purpose: "t", system: "s", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/Anthropic 오류 401: invalid x-api-key/);
  });
});

describe("OpenAI 어댑터와 공급자 전환 (AT-7)", () => {
  test("같은 호출이 공급자만 바꿔 동작하고 응답 모양이 같다", async () => {
    process.env.LLM_PROVIDER = "openai"; process.env.OPENAI_API_KEY = "sk-test-openai-key-123456"; process.env.OPENAI_MODEL = "test-model";
    stub({ choices: [{ message: { content: '{"ok": true}' } }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
    const r = await generate({ purpose: "similarity", system: "규칙", messages: [{ role: "user", content: "{}" }], json: true });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0].init.headers.authorization).toBe("Bearer sk-test-openai-key-123456");
    expect(calls[0].body.messages[0]).toEqual({ role: "system", content: "규칙" });
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(r).toMatchObject({ provider: "openai", model: "test-model", json: { ok: true }, usage: { input: 5, output: 3 } });
  });
  test("키나 모델 이름이 없으면 설정 안내와 함께 거부", async () => {
    process.env.LLM_PROVIDER = "openai"; delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL;
    expect(providerInfo()).toMatchObject({ provider: "openai", configured: false });
    await expect(generate({ purpose: "t", system: "s", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/설정되지 않았습니다/);
  });
});
