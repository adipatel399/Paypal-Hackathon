import { readFileSync, writeFileSync } from "node:fs";
import { sampleBrief } from "../src/brief.js";
const target = JSON.parse(readFileSync(".data/azure-target.json", "utf8"));
const origin = target.origin;
const report = {
  at: new Date().toISOString(),
  origin,
  scope:
    "External HTTPS/API verification of isolated simulated-payment workspaces. No real PayPal sandbox transactions.",
  checks: [],
};
const check = (name, ok, details = {}) => {
  report.checks.push({ name, passed: !!ok, ...details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) throw new Error(name + " failed");
};
async function call(path, { cookie, body } = {}) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined
        ? {}
        : { Origin: origin, "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} returned ${r.status}: ${j.error}`);
  return { r, j, cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie };
}
try {
  const health = await call("/api/health");
  check(
    "Public HTTPS health",
    health.j.status === "ok" && health.j.storage === "cosmos",
  );
  const a = await call("/api/state"),
    b = await call("/api/state");
  check("Judge workspaces isolated", a.j.id !== b.j.id);
  check(
    "Real cloud AI configured; payments explicitly simulated",
    a.j.config.ai && a.j.config.aiProvider === "groq" && a.j.mode === "demo",
  );
  check(
    "Secure browser session cookie",
    /HttpOnly/.test(a.r.headers.get("set-cookie")) &&
      /Secure/.test(a.r.headers.get("set-cookie")),
  );
  await call("/api/commit", {
    cookie: a.cookie,
    body: {
      name: "QA visitor",
      consent: true,
      campaignId: a.j.id,
      version: a.j.version,
    },
  });
  const a2 = await call("/api/state", { cookie: a.cookie }),
    b2 = await call("/api/state", { cookie: b.cookie });
  check(
    "Commitments persist and remain isolated",
    a2.j.commitments.length === 8 && b2.j.commitments.length === 7,
  );
  const d = await call("/api/brief/extract", {
    cookie: a.cookie,
    body: { source: sampleBrief().source },
  });
  check(
    "Real Groq brief extraction",
    d.j.draft.complete && d.j.draft.provider === "groq",
    { model: d.j.draft.model },
  );
  await call("/api/disrupt", { cookie: a.cookie, body: {} });
  const recovery = await call("/api/analyze", { cookie: a.cookie, body: {} });
  check(
    "Real Groq venue recovery",
    recovery.j.analysis.provider === "groq" &&
      recovery.j.analysis.recommendationId === "clay",
    { model: recovery.j.analysis.model },
  );
  await call("/api/select", { cookie: a.cookie, body: { venueId: "clay" } });
  const launched = await call("/api/settle", { cookie: a.cookie, body: {} });
  check(
    "End-to-end simulated settlement on durable hosted storage",
    launched.j.status === "LAUNCHED" &&
      launched.j.commitments.every((c) => c.status === "CAPTURED"),
  );
  const blocked = await fetch(origin + "/api/reset", {
    method: "POST",
    headers: {
      Cookie: a.cookie,
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  check("Cross-origin mutation blocked", blocked.status === 403);
  const root = await fetch(origin);
  check(
    "Public application HTML",
    root.status === 200 && (await root.text()).includes("Brief builder"),
  );
  const assets = await Promise.all(
    ["/app.js", "/style.css", "/manrope.ttf", "/favicon.svg"].map((path) =>
      fetch(origin + path),
    ),
  );
  check(
    "Application assets available",
    assets.every((r) => r.status === 200),
  );
  report.passed = true;
} catch (e) {
  report.passed = false;
  report.error = e.message;
  console.error("External verification:", e.message);
  process.exitCode = 1;
}
writeFileSync(
  "docs/HOSTED_VERIFICATION.json",
  JSON.stringify(report, null, 2) + "\n",
);
