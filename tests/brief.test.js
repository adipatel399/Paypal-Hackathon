import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleBrief,
  sampleVenues,
  validateExtraction,
  validateVenues,
  extractBrief,
} from "../src/brief.js";
import { createStore } from "../src/store.js";
import { createService } from "../src/service.js";
import { evaluate } from "../src/domain.js";
import { generateJSON } from "../src/model.js";
const fresh = () => {
  const store = createStore(":memory:", "demo");
  return { store, service: createService(store, {}, "demo") };
};
test("sample draft has exact source evidence and complete typed terms", () => {
  const d = sampleBrief();
  assert.equal(d.complete, true);
  assert.equal(d.terms.ticket, 4000);
  for (const f of d.facts) assert.ok(d.source.includes(f.evidence));
});
test("invented evidence, wrong cents and duplicate fields are rejected", () => {
  for (const change of [
    (d) => (d.facts[0].evidence = "made up source"),
    (d) => (d.facts.find((f) => f.field === "ticket").value = 40),
    (d) => d.facts.push({ ...d.facts[0] }),
  ]) {
    const d = sampleBrief();
    change(d);
    assert.throws(() => validateExtraction(d, d.source));
  }
});
test("missing values and unanswered questions cannot become complete agreements", () => {
  let d = sampleBrief();
  d.facts = d.facts.filter((f) => f.field !== "maximum");
  assert.equal(validateExtraction(d, d.source).complete, false);
  d = sampleBrief();
  d.questions = ["Which time?"];
  assert.equal(validateExtraction(d, d.source).complete, false);
});
test("negative fees and excessive attendance cannot activate", () => {
  const d = sampleBrief();
  d.facts.find((f) => f.field === "maximum").value = 1000;
  assert.throws(() => validateExtraction(d, d.source));
  assert.throws(() => validateVenues([{ name: "Bad", cost: -1 }], d.terms));
});
test("applying a draft never silently rewrites an authorized agreement", () => {
  const { store, service } = fresh();
  const s = store.read();
  s.draft = sampleBrief();
  store.save(s);
  assert.throws(
    () => service.activate(s.draft.id, sampleVenues(), true),
    /existing commitments/,
  );
  assert.equal(service.state().commitments.length, 7);
});
test("resolved campaign is archived before a reviewed agreement starts", async () => {
  const { store, service } = fresh();
  let s = store.read();
  s.draft = sampleBrief();
  store.save(s);
  const oldId = s.id;
  await service.cancel();
  service.activate(s.draft.id, sampleVenues(), true);
  const active = service.state();
  assert.notEqual(active.id, oldId);
  assert.equal(active.commitments.length, 0);
  assert.equal(active.venueConfirmed, false);
  assert.ok(store.db.prepare("SELECT id FROM archives WHERE id=?").get(oldId));
  assert.equal(evaluate(active).ready, false);
});
test("custom terms drive prices and minimum participation end to end", async () => {
  const { store, service } = fresh();
  const s = store.read();
  s.commitments = [];
  s.terms = {
    ...service.state().terms,
    ticket: 5500,
    minimum: 2,
    maximum: 4,
    materials: 500,
    fee: 100,
    margin: 1000,
  };
  s.venues[0].cost = 3000;
  store.save(s);
  await service.commit(
    {
      name: "A",
      consent: true,
      amount: 1,
      campaignId: service.state().id,
      version: 1,
    },
    "a",
  );
  assert.equal(service.state().evaluation.ready, false);
  await service.commit(
    { name: "B", consent: true, campaignId: service.state().id, version: 1 },
    "b",
  );
  assert.equal(service.state().evaluation.revenue, 11000);
  assert.equal(service.state().commitments[0].amount, 5500);
  assert.equal(service.state().evaluation.ready, true);
  await service.settle();
  assert.equal(service.state().status, "LAUNCHED");
});
test("source documents cannot cause an extraction without a configured provider", async () => {
  await assert.rejects(
    () =>
      extractBrief(sampleBrief().source, { env: { AI_PROVIDER: "fixture" } }),
    /No AI result/,
  );
});
test("cloud inference is blocked unless free-tier project is explicitly confirmed", async () => {
  let called = false;
  await assert.rejects(
    () =>
      generateJSON(
        "system",
        {},
        {},
        {
          env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "not-a-real-key" },
          fetcher: () => {
            called = true;
          },
        },
      ),
    /no paid billing/,
  );
  assert.equal(called, false);
});
test("local inference uses only loopback and records the actual model", async () => {
  let url;
  const r = await generateJSON(
    "system",
    { source: "untrusted" },
    {},
    {
      env: { AI_PROVIDER: "ollama", OLLAMA_MODEL: "llama3.2:latest" },
      fetcher: async (u) => {
        url = u;
        return new Response(
          JSON.stringify({ message: { content: '{"ok":true}' } }),
        );
      },
    },
  );
  assert.equal(url, "http://127.0.0.1:11434/api/chat");
  assert.equal(r.provider, "ollama");
  assert.deepEqual(r.data, { ok: true });
});
test("public exports omit raw PayPal payloads and browser ownership", () => {
  const { store, service } = fresh();
  const s = store.read();
  s.operations = [
    {
      key: "x",
      kind: "AUTHORIZE",
      status: "RETURNED",
      result: { payer: { email_address: "private@example.com" } },
    },
  ];
  store.save(s);
  const output = JSON.stringify(service.state());
  assert.equal(output.includes("private@example.com"), false);
  assert.equal(
    service.state().commitments.some((c) => "owner" in c),
    false,
  );
});
test("stale buyer dialogs cannot authorize a different campaign", async () => {
  const { service } = fresh();
  await assert.rejects(
    () =>
      service.commit(
        {
          name: "stale",
          consent: true,
          campaignId: "different-id",
          version: 1,
        },
        "x",
      ),
    /agreement has changed/,
  );
  assert.equal(service.state().commitments.length, 7);
});
test("PayPal order and capture requests use reviewed prices, including cents", async () => {
  const { paypal } = await import("../src/paypal.js");
  const calls = [];
  const p = paypal(
    { PAYPAL_CLIENT_ID: "test", PAYPAL_CLIENT_SECRET: "test" },
    async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify(
          url.endsWith("/token")
            ? { access_token: "x", expires_in: 3600 }
            : { id: "x" },
        ),
      );
    },
  );
  await p.create("new-order", 5725, "Reviewed workshop");
  await p.capture("AUTH", "key", 5725);
  for (const c of calls.slice(1)) {
    const payload = JSON.parse(c.init.body);
    assert.equal(
      (payload.purchase_units?.[0]?.amount || payload.amount).value,
      "57.25",
    );
  }
});
test("wrong provider authorization amount cannot be treated as valid", async () => {
  const store = createStore(":memory:", "sandbox");
  const service = createService(
    store,
    {
      create: async () => ({ id: "ORDERX" }),
      authorize: async () => ({
        purchase_units: [
          {
            payments: {
              authorizations: [
                {
                  id: "AUTHX",
                  status: "CREATED",
                  amount: { value: "1.00", currency_code: "USD" },
                },
              ],
            },
          },
        ],
      }),
    },
    "sandbox",
  );
  await service.commit(
    {
      name: "Buyer",
      consent: true,
      campaignId: service.state().id,
      version: 1,
    },
    "browser",
  );
  await assert.rejects(
    () => service.authorize("ORDERX", "browser"),
    /not confirmed/,
  );
  assert.equal(service.state().commitments[0].status, "UNKNOWN");
});
