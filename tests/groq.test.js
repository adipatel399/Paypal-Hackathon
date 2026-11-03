import test from "node:test";
import assert from "node:assert/strict";
import { generateJSON, strictSchema, modelConfig } from "../src/model.js";
const env = {
  AI_PROVIDER: "groq",
  GROQ_API_KEY: "fake-test-key",
  GROQ_FREE_TIER_CONFIRMED: "true",
};
test("Groq requires a key and explicit free-plan confirmation before a request", async () => {
  assert.equal(modelConfig({ AI_PROVIDER: "groq" }).configured, false);
  let called = false;
  await assert.rejects(
    () =>
      generateJSON(
        "test",
        {},
        {},
        {
          env: { ...env, GROQ_FREE_TIER_CONFIRMED: "false" },
          fetcher: () => (called = true),
        },
      ),
    /Groq account is on Free/,
  );
  assert.equal(called, false);
});
test("Groq strict schemas close nested objects without mutating the original", () => {
  const s = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { value: { type: ["string", "null"] } },
        },
      },
    },
  };
  const r = strictSchema(s);
  assert.equal(r.additionalProperties, false);
  assert.deepEqual(r.required, ["items"]);
  assert.equal(r.properties.items.items.additionalProperties, false);
  assert.deepEqual(r.properties.items.items.required, ["value"]);
  assert.equal(s.additionalProperties, undefined);
});
test("Groq requests use server-side authorization and structured JSON", async () => {
  let sent;
  const r = await generateJSON(
    "system",
    { source: "a brief" },
    { type: "object", properties: { ok: { type: "boolean" } } },
    {
      env,
      fetcher: async (url, init) => {
        sent = { url, init };
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
        );
      },
    },
  );
  assert.equal(sent.url, "https://api.groq.com/openai/v1/chat/completions");
  const b = JSON.parse(sent.init.body);
  assert.equal(b.response_format.json_schema.strict, true);
  assert.equal(
    b.response_format.json_schema.schema.additionalProperties,
    false,
  );
  assert.equal(sent.init.headers.Authorization, "Bearer fake-test-key");
  assert.equal(b.model, "openai/gpt-oss-20b");
  assert.equal(r.provider, "groq");
  assert.deepEqual(r.data, { ok: true });
});
test("Groq quota exhaustion fails clearly without a paid fallback", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateJSON(
        "system",
        {},
        {},
        {
          env,
          fetcher: async () => {
            calls++;
            return new Response("{}", { status: 429 });
          },
        },
      ),
    (e) => e.status === 429 && /No upgrade or fallback/.test(e.message),
  );
  assert.equal(calls, 1);
});
