import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createCosmosStore, consumeBudget } from "../src/cosmos-store.js";
import {
  createHostedManager,
  hostingConfig,
  hostedSession,
} from "../src/hosting.js";
import { createHandler } from "../src/http.js";
import { createService } from "../src/service.js";
import { createStore } from "../src/store.js";
export function memoryCosmos() {
  const docs = new Map();
  let revision = 0;
  const error = (code) =>
    Object.assign(new Error("controlled storage response"), { code });
  return {
    docs,
    items: {
      async create(d) {
        const key = d.scope + "/" + d.id;
        if (docs.has(key)) throw error(409);
        const resource = { ...structuredClone(d), _etag: String(++revision) };
        docs.set(key, resource);
        return { resource: structuredClone(resource) };
      },
    },
    item(id, scope) {
      const key = scope + "/" + id;
      return {
        async read() {
          if (!docs.has(key)) throw error(404);
          return { resource: structuredClone(docs.get(key)) };
        },
        async replace(d, options) {
          if (!docs.has(key)) throw error(404);
          if (options?.accessCondition?.condition !== docs.get(key)._etag)
            throw error(412);
          const resource = { ...structuredClone(d), _etag: String(++revision) };
          docs.set(key, resource);
          return { resource: structuredClone(resource) };
        },
      };
    },
  };
}
test("hosted store isolates scopes and survives a new manager", async () => {
  const c = memoryCosmos();
  const a = await createCosmosStore(c, "a"),
    b = await createCosmosStore(c, "b");
  const s = a.read();
  s.subtitle = "Private QA workshop";
  await a.save(s);
  assert.notEqual(b.read().subtitle, s.subtitle);
  assert.equal((await createCosmosStore(c, "a")).read().subtitle, s.subtitle);
});
test("concurrent stale writes are rejected instead of overwriting state", async () => {
  const c = memoryCosmos(),
    a = await createCosmosStore(c, "same"),
    b = await createCosmosStore(c, "same");
  const old = b.read(),
    s = a.read();
  s.subtitle = "New version";
  await a.save(s);
  old.subtitle = "Stale";
  await assert.rejects(
    () => b.save(old),
    (e) => e.status === 409,
  );
  await b.refresh();
  assert.equal(b.read().subtitle, "New version");
});
test("hosted resets preserve revision while replacing only their workspace", async () => {
  const c = memoryCosmos(),
    store = await createCosmosStore(c, "one"),
    service = createService(store, {}, "demo");
  const before = service.state().id;
  await service.exclusive(() => service.reset());
  assert.notEqual(service.state().id, before);
  assert.equal("_storeEtag" in service.state(), false);
  await store.refresh();
  assert.equal(service.state().commitments.length, 7);
});
test("hosted retention applies to simulated data only", async () => {
  const c = memoryCosmos();
  await createCosmosStore(c, "demo");
  assert.equal(c.docs.get("demo/state").ttl, 604800);
  await assert.rejects(
    () => createCosmosStore(c, "real", "sandbox"),
    /currently simulate payments/,
  );
});
test("global free-demo budgets cannot be exceeded by simultaneous callers", async () => {
  const c = memoryCosmos();
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      consumeBudget(c, "test", 5, new Date("2026-11-03T12:00:00Z")),
    ),
  );
  assert.ok(results.filter((r) => r.status === "fulfilled").length <= 5);
  assert.ok(c.docs.get("system-budgets/test-2026-11-03").count <= 5);
  assert.ok(
    results.some((r) => r.status === "rejected" && r.reason.status === 429),
  );
});
test("hosted configuration refuses local AI and ephemeral payment storage", () => {
  const base = {
    PUBLIC_ORIGIN: "https://demo.example",
    SESSION_SECRET: "x".repeat(32),
    COSMOS_ENDPOINT: "https://test.documents.azure.com",
    COSMOS_KEY: "test",
    AI_PROVIDER: "groq",
  };
  assert.equal(hostingConfig(base).hosted, true);
  assert.throws(
    () => hostingConfig({ ...base, AI_PROVIDER: "ollama" }),
    /cannot call/,
  );
  assert.throws(
    () => hostingConfig({ ...base, PAYMENT_MODE: "sandbox" }),
    /simulation payments only/,
  );
  assert.throws(
    () => hostingConfig({ ...base, SESSION_SECRET: "short" }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () => hostingConfig({ ...base, PUBLIC_ORIGIN: "http://example.test" }),
    /HTTPS/,
  );
});
test("tampered session cookies cannot select another workspace", () => {
  const config = { secret: "a".repeat(32) };
  const res = {
    setHeader(k, v) {
      this.cookie = v;
    },
  };
  const id = hostedSession({ headers: {} }, res, config);
  const valid = res.cookie.split(";")[0];
  assert.equal(hostedSession({ headers: { cookie: valid } }, res, config), id);
  const forged = valid.slice(0, -1) + (valid.endsWith("0") ? "1" : "0");
  assert.notEqual(
    hostedSession({ headers: { cookie: forged } }, res, config),
    id,
  );
  assert.match(res.cookie, /HttpOnly; Secure; SameSite=Lax/);
});
test("HTTP judge sessions cannot read or mutate each other", async (t) => {
  const container = memoryCosmos();
  const hosting = {
    hosted: true,
    origin: "https://demo.example",
    host: "demo.example",
    secret: "x".repeat(32),
  };
  const manager = createHostedManager(container, {});
  const server = createServer(
    createHandler({
      mode: "demo",
      port: 0,
      hosting,
      provider: {},
      hostedManager: manager,
      env: { AI_PROVIDER: "fixture" },
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (cookie) =>
    httpFetch(base + "/api/state", {
      headers: { Host: "demo.example", ...(cookie ? { Cookie: cookie } : {}) },
    });
  const ra = await get(),
    rb = await get();
  assert.equal(ra.status, 200, await ra.clone().text());
  const a = await ra.json(),
    b = await rb.json();
  const ca = ra.headers.get("set-cookie").split(";")[0],
    cb = rb.headers.get("set-cookie").split(";")[0];
  assert.notEqual(a.id, b.id);
  const post = (cookie, data, origin = "https://demo.example") =>
    httpFetch(base + "/api/commit", {
      method: "POST",
      headers: {
        Host: "demo.example",
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  const payload = { name: "QA", consent: true, campaignId: a.id, version: 1 };
  assert.equal((await post(ca, payload)).status, 200);
  assert.equal((await (await get(cb)).json()).commitments.length, 7);
  assert.equal((await post(cb, payload)).status, 400);
  assert.equal((await post(ca, payload, "https://evil.example")).status, 403);
  assert.equal((await (await get(ca)).json()).commitments.length, 8);
});
test("payment requests wait for durable operation intent", async () => {
  const base = createStore(":memory:", "demo"),
    s = base.read();
  s.commitments.push({ ...s.commitments[0], id: "extra" });
  base.save(s);
  let release, reached;
  const gate = new Promise((resolve) => (release = resolve)),
    atGate = new Promise((resolve) => (reached = resolve));
  let first = true,
    calls = 0;
  const store = {
    ...base,
    async save(s) {
      if (
        first &&
        s.operations.some((o) => o.status === "PENDING" && o.kind === "CAPTURE")
      ) {
        first = false;
        reached();
        await gate;
      }
      base.save(s);
    },
  };
  const service = createService(
    store,
    {
      capture: async () => {
        calls++;
        return { id: "CAP", status: "COMPLETED" };
      },
    },
    "sandbox",
  );
  const settling = service.settle();
  await atGate;
  assert.equal(calls, 0);
  release();
  await settling;
  assert.equal(calls, 8);
});

function httpFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: options.method || "GET", headers: options.headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve(
            new Response(body, {
              status: res.statusCode,
              headers: res.headers,
            }),
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
