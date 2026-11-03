import test from "node:test";
import assert from "node:assert/strict";
import { seed, evaluate } from "../src/domain.js";
import { createStore } from "../src/store.js";
import { createService } from "../src/service.js";
import { paypal, ProviderError } from "../src/paypal.js";
const setup = (mode = "demo", provider = {}) => {
  const store = createStore(":memory:", mode);
  return { store, service: createService(store, provider, mode) };
};
const eighth = (service) =>
  service.commit(
    {
      name: "Casey Wells",
      consent: true,
      amount: 1,
      campaignId: service.state().id,
      version: service.state().version,
    },
    "buyer",
  );
test("seven participants cannot launch; price is controlled by server", async () => {
  const { service } = setup();
  assert.equal(service.state().evaluation.ready, false);
  await assert.rejects(() => service.settle(), /commitment/);
  await eighth(service);
  assert.equal(service.state().commitments.at(-1).amount, 4000);
  assert.equal(service.state().evaluation.ready, true);
});
test("consent is mandatory and session ownership is never exposed", async () => {
  const { service } = setup();
  await assert.rejects(
    () =>
      service.commit(
        {
          name: "Casey",
          campaignId: service.state().id,
          version: service.state().version,
        },
        "buyer",
      ),
    /accept/,
  );
  await eighth(service);
  assert.equal("owner" in service.state().commitments.at(-1), false);
});
test("venue loss blocks settlement; incompatible venue cannot be selected", async () => {
  const { service } = setup();
  await eighth(service);
  await service.disrupt();
  assert.equal(service.state().evaluation.ready, false);
  await assert.rejects(() => service.select("loft"), /access|workstations/);
  await assert.rejects(() => service.settle(), /unavailable/);
  await service.select("clay");
  assert.equal(service.state().evaluation.ready, true);
  assert.equal(service.state().evaluation.margin, 8400);
});
test("a successful launch captures each participant exactly once", async () => {
  const { service } = setup();
  await eighth(service);
  await service.settle();
  assert.equal(service.state().status, "LAUNCHED");
  assert.equal(service.state().operations.length, 8);
  assert.ok(service.state().commitments.every((c) => c.status === "CAPTURED"));
  await service.settle();
  assert.equal(service.state().operations.length, 8);
});
test("failure on third capture compensates the first two and voids six", async () => {
  const { service } = setup();
  await eighth(service);
  await service.settle(3);
  const s = service.state();
  assert.equal(s.status, "CANCELLED");
  assert.equal(s.commitments.filter((c) => c.status === "REFUNDED").length, 2);
  assert.equal(s.commitments.filter((c) => c.status === "VOIDED").length, 6);
  assert.equal(s.operations.filter((o) => o.kind === "REFUND").length, 2);
});
test("cancellation voids uncaptured commitments and prohibits more buyers", async () => {
  const { service } = setup();
  await service.cancel();
  assert.equal(service.state().status, "CANCELLED");
  assert.ok(service.state().commitments.every((c) => c.status === "VOIDED"));
  await assert.rejects(() => eighth(service), /locked/);
});
test("stale consent, expiry and unresolved payment operations block readiness", () => {
  for (const mutation of [
    (s) => (s.commitments[0].version = 2),
    (s) => (s.deadline = Date.now() - 1),
    (s) => (s.commitments[0].status = "UNKNOWN"),
  ]) {
    const s = seed();
    s.commitments.push({ ...s.commitments[0], id: "extra" });
    mutation(s);
    assert.equal(evaluate(s).ready, false);
  }
});
test("same campaign rejects concurrent mutations", async () => {
  const { service } = setup();
  let finish;
  const running = service.exclusive(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await assert.rejects(() => service.exclusive(() => {}), /Another operation/);
  finish();
  await running;
});
test("sandbox has no seeded commitments and cannot inject/reset fixtures", async () => {
  const { service } = setup("sandbox");
  assert.equal(service.state().commitments.length, 0);
  await assert.rejects(() => service.reset(), /cannot be reset/);
  await assert.rejects(() => service.disrupt(), /simulation-only/);
});
test("sandbox authorizations require owning browser session", async () => {
  const { service } = setup("sandbox", {
    create: async () => ({ id: "ORDER123" }),
  });
  await eighth(service);
  await assert.rejects(
    () => service.authorize("ORDER123", "stranger"),
    /does not belong/,
  );
});
test("unknown capture outcome remains pending; it is never marked launched or blindly voided", async () => {
  const { store, service } = setup("sandbox", {
    capture: async () => {
      throw new ProviderError("timeout", true);
    },
    void: async () => ({}),
  });
  const s = seed("demo");
  s.mode = "sandbox";
  s.commitments.push({ ...s.commitments[0], id: "extra" });
  store.save(s);
  await service.settle();
  assert.equal(service.state().status, "COMPENSATION_PENDING");
  assert.equal(service.state().commitments[0].status, "UNKNOWN");
  assert.equal(service.state().operations[0].status, "UNKNOWN");
});
test("pending refunds are not reported as completed", async () => {
  const { store, service } = setup("sandbox", {
    refund: async () => ({ id: "REF1", status: "PENDING" }),
    void: async () => ({}),
  });
  const s = seed("demo");
  s.mode = "sandbox";
  s.commitments[0].status = "CAPTURED";
  s.commitments[0].captureId = "CAP1";
  store.save(s);
  await service.cancel();
  assert.equal(service.state().status, "COMPENSATION_PENDING");
  assert.equal(service.state().commitments[0].status, "REFUND_PENDING");
});
test("durable operation is recorded before capture calls", async () => {
  const { store } = setup();
  let observed = false;
  const service = createService(
    store,
    {
      capture: async () => {
        observed = store.read().operations.at(-1).status === "PENDING";
        return { id: "CAP", status: "COMPLETED" };
      },
    },
    "sandbox",
  );
  const s = seed("demo");
  s.commitments.push({ ...s.commitments[0], id: "extra" });
  store.save(s);
  await service.settle();
  assert.equal(observed, true);
});
test("PayPal adapter is hardwired to sandbox and uses stable request identifiers", async () => {
  const calls = [];
  const adapter = paypal(
    { PAYPAL_CLIENT_ID: "client", PAYPAL_CLIENT_SECRET: "secret" },
    async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify(
          url.endsWith("/token")
            ? { access_token: "test", expires_in: 3600 }
            : { id: "ORDER" },
        ),
        { status: 200 },
      );
    },
  );
  await adapter.create("commitment-1");
  assert.ok(
    calls.every((c) => c.url.startsWith("https://api-m.sandbox.paypal.com/")),
  );
  assert.equal(calls[1].init.headers["PayPal-Request-Id"], "commitment-1");
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.intent, "AUTHORIZE");
  assert.equal(body.purchase_units[0].amount.value, "40.00");
});
test("database survives a new service instance; duplicate webhook IDs are ignored", async () => {
  const { store, service } = setup();
  await eighth(service);
  assert.equal(createService(store, {}, "demo").state().commitments.length, 8);
  assert.equal(store.webhook({ id: "WH-1" }), true);
  assert.equal(store.webhook({ id: "WH-1" }), false);
});
test("fixture analysis proposes a compatible fallback without confirming it", async () => {
  const { analyze } = await import("../src/ai.js");
  const { store, service } = setup();
  await eighth(service);
  await service.disrupt();
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await analyze(store.read(), {
      env: { AI_PROVIDER: "fixture" },
    });
    assert.equal(result.provider, "fixture");
    assert.equal(result.recommendationId, "clay");
    assert.equal(service.state().venueConfirmed, false);
    assert.equal(service.state().selectedVenue, "kiln");
  } finally {
    if (key) process.env.ANTHROPIC_API_KEY = key;
  }
});
