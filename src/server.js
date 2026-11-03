import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { createService } from "./service.js";
import { paypal } from "./paypal.js";
import { analyze } from "./ai.js";
import { brief, event } from "./domain.js";
import { modelConfig } from "./model.js";
import { extractBrief, sampleBrief, sampleVenues } from "./brief.js";
const mode = process.env.PAYMENT_MODE || "demo";
if (!["demo", "sandbox"].includes(mode))
  throw new Error(
    "PAYMENT_MODE must be demo or sandbox. Production payments are disabled.",
  );
if (
  mode === "sandbox" &&
  (!process.env.PAYPAL_CLIENT_ID ||
    !process.env.PAYPAL_CLIENT_SECRET ||
    (process.env.ORGANIZER_TOKEN || "").length < 32)
)
  throw new Error(
    "Sandbox requires PayPal credentials and an ORGANIZER_TOKEN of at least 32 characters.",
  );
const store = createStore(
  fileURLToPath(new URL("../.data/greenlight.sqlite", import.meta.url)),
  mode,
);
const provider = paypal();
const service = createService(store, provider, mode);
const port = Number(process.env.PORT || 3100);
function json(res, value, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function body(req) {
  let chunks = "",
    length = 0;
  for await (const c of req) {
    length += c.length;
    if (length > 65536)
      throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks += c;
  }
  return chunks ? JSON.parse(chunks) : {};
}
function owner(req, res) {
  const cookie = req.headers.cookie?.match(
    /(?:^|; )gl_session=([a-f0-9-]{36})(?:;|$)/,
  )?.[1];
  if (cookie) return cookie;
  const id = randomUUID();
  res.setHeader(
    "Set-Cookie",
    `gl_session=${id}; HttpOnly; SameSite=Strict; Path=/`,
  );
  return id;
}
function organizer(req) {
  if (mode === "demo") return;
  const provided = Buffer.from(
    (req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  const expected = Buffer.from(process.env.ORGANIZER_TOKEN);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    throw Object.assign(
      new Error("Organizer access required. Enter your token in Connections."),
      { status: 401 },
    );
}
const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  const host = req.headers.host;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
    json(res, { error: "Local workspace server. Unrecognized host." }, 403);
    return;
  }
  const url = new URL(req.url, `http://${host}`);
  try {
    if (
      req.method === "POST" &&
      url.pathname !== "/api/webhooks/paypal" &&
      req.headers.origin !== `http://${host}`
    )
      throw Object.assign(new Error("Same-origin request required."), {
        status: 403,
      });
    if (url.pathname === "/api/state" && req.method === "GET")
      return json(res, {
        ...service.state(),
        config: {
          mode,
          paypalClientId:
            mode === "sandbox" ? process.env.PAYPAL_CLIENT_ID : null,
          ai: modelConfig().configured,
          aiProvider: modelConfig().provider,
          aiModel: modelConfig().model,
          localOnly: true,
        },
        brief: service.state().brief || brief,
      });
    if (req.method === "POST" && url.pathname === "/api/webhooks/paypal") {
      if (mode !== "sandbox" || !process.env.PAYPAL_WEBHOOK_ID)
        throw new Error("Sandbox webhook verification is not configured.");
      const data = await body(req);
      const verified = await provider.verify(data, req.headers);
      if (verified.verification_status !== "SUCCESS")
        return json(res, { error: "Invalid webhook signature" }, 400);
      if (typeof data.id !== "string") throw new Error("Missing webhook ID");
      store.webhook(data); // Durable inbox. Reconciliation uses provider resources, not untrusted event ordering.
      await service.exclusive(() => service.reconcile());
      return json(res, { received: true });
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      const b = await body(req);
      const session = owner(req, res);
      const buyer = ["/api/commit", "/api/authorize"].includes(url.pathname);
      if (!buyer) organizer(req);
      return json(
        res,
        await service.exclusive(async () => {
          switch (url.pathname) {
            case "/api/brief/extract": {
              const s = store.read();
              s.draft = await extractBrief(b.source);
              event(
                s,
                "analysis",
                "Brief extracted for review",
                `${s.draft.provider} / ${s.draft.model}. No campaign terms or payments changed.`,
              );
              store.save(s);
              return service.state();
            }
            case "/api/brief/sample": {
              const s = store.read();
              s.draft = sampleBrief();
              store.save(s);
              return { ...service.state(), sampleVenues: sampleVenues() };
            }
            case "/api/brief/apply":
              return service.activate(b.draftId, b.venues, b.consent);
            case "/api/commit":
              return service.commit(b, session);
            case "/api/authorize":
              if (
                typeof b.orderId !== "string" ||
                !/^[A-Z0-9]+$/.test(b.orderId)
              )
                throw new Error("Invalid order");
              return service.authorize(b.orderId, session);
            case "/api/disrupt":
              return service.disrupt();
            case "/api/select":
              return service.select(b.venueId);
            case "/api/settle":
              return service.settle(
                mode === "demo" && b.failure === true ? 3 : undefined,
              );
            case "/api/cancel":
              return service.cancel();
            case "/api/reset":
              return service.reset();
            case "/api/reconcile":
              return service.reconcile();
            case "/api/analyze": {
              const s = store.read();
              s.analysis = await analyze(s);
              event(
                s,
                "analysis",
                s.analysis.provider === "fixture"
                  ? "Evidence checked · fixture analysis"
                  : "AI reviewed the alternatives",
                s.analysis.summary,
              );
              store.save(s);
              return service.state();
            }
            default:
              throw Object.assign(new Error("Unknown endpoint"), {
                status: 404,
              });
          }
        }),
      );
    }
    if (req.method !== "GET")
      return json(res, { error: "Method not allowed" }, 405);
    const files = {
      "/": ["index.html", "text/html"],
      "/app.js": ["app.js", "text/javascript"],
      "/style.css": ["style.css", "text/css"],
      "/favicon.svg": ["favicon.svg", "image/svg+xml"],
      "/social.svg": ["social.svg", "image/svg+xml"],
      "/manrope.ttf": ["manrope.ttf", "font/ttf"],
    };
    const f = files[url.pathname];
    if (!f) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found · Greenlight</title><link rel="stylesheet" href="/style.css"><main class="wrap" style="padding-top:96px"><p class="eyebrow caption-3">GREENLIGHT / 404</p><h1 class="heading-1">A different path.</h1><p class="body-3" style="margin:24px 0">This page does not exist. Your launch room is still here.</p><a class="primary button-md" href="/">Back to Greenlight ↗</a></main></html>',
      );
    }
    res.writeHead(200, {
      "Content-Type": f[1] + "; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(await readFile(new URL(`../public/${f[0]}`, import.meta.url)));
  } catch (e) {
    json(
      res,
      { error: e instanceof SyntaxError ? "Invalid JSON request" : e.message },
      e.status || 400,
    );
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Greenlight → http://localhost:${port} · ${mode === "demo" ? "SIMULATION — no real API payments" : "PAYPAL SANDBOX"} · local workspace only`,
  ),
);
