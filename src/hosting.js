import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createCosmosStore, consumeBudget } from "./cosmos-store.js";
import { createService } from "./service.js";
export function hostingConfig(env = process.env) {
  if (!env.PUBLIC_ORIGIN) return { hosted: false };
  const origin = new URL(env.PUBLIC_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== env.PUBLIC_ORIGIN ||
    origin.username ||
    origin.password
  )
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin without a path.");
  if ((env.SESSION_SECRET || "").length < 32)
    throw new Error(
      "Hosted sessions require a private SESSION_SECRET of at least 32 characters.",
    );
  if ((env.PAYMENT_MODE || "demo") !== "demo")
    throw new Error(
      "Hosted launch currently supports simulation payments only; keep real sandbox verification in the authenticated local build.",
    );
  if (!env.COSMOS_ENDPOINT || !env.COSMOS_KEY)
    throw new Error("Hosted workspaces require durable Cosmos DB storage.");
  if (!["groq", "gemini", "fixture"].includes(env.AI_PROVIDER))
    throw new Error(
      "Hosted AI must use a cloud provider or explicit fixture mode; it cannot call the entrant’s Mac.",
    );
  return {
    hosted: true,
    origin: origin.origin,
    host: origin.host,
    secret: env.SESSION_SECRET,
  };
}
export function hostedSession(req, res, config) {
  const sign = (id) =>
    createHmac("sha256", config.secret).update(id).digest("hex");
  const cookie = req.headers.cookie?.match(
    /(?:^|; )gl_session=([a-f0-9-]{36})\.([a-f0-9]{64})(?:;|$)/,
  );
  if (cookie) {
    const expected = Buffer.from(sign(cookie[1]));
    const actual = Buffer.from(cookie[2]);
    if (expected.length === actual.length && timingSafeEqual(expected, actual))
      return cookie[1];
  }
  const id = randomUUID();
  res.setHeader(
    "Set-Cookie",
    `gl_session=${id}.${sign(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
  );
  return id;
}
export function createHostedManager(container, provider) {
  const managers = new Map();
  return {
    async get(session) {
      let pending = managers.get(session);
      if (!pending) {
        if (managers.size >= 200) {
          for (const [key, value] of managers) {
            const resolved = await value.catch(() => null);
            if (!resolved?.service.isBusy()) {
              managers.delete(key);
              break;
            }
          }
        }
        pending = (async () => {
          const store = await createCosmosStore(
            container,
            `demo-${session}`,
            "demo",
          );
          return { store, service: createService(store, provider, "demo") };
        })();
        managers.set(session, pending);
        pending.catch(() => {
          if (managers.get(session) === pending) managers.delete(session);
        });
      }
      return pending;
    },
    consumeAI: () => consumeBudget(container, "ai-calls", 100),
    consumeMutation: () => consumeBudget(container, "mutations", 10000),
  };
}
export function createRateLimiter({
  limit = 30,
  windowMs = 60000,
  maxKeys = 2000,
} = {}) {
  const windows = new Map();
  return (key) => {
    const now = Date.now();
    let record = windows.get(key);
    if (!record || record.until <= now) {
      if (windows.size >= maxKeys) {
        for (const [k, v] of windows) {
          if (v.until <= now) windows.delete(k);
        }
        if (windows.size >= maxKeys)
          throw Object.assign(
            new Error("The demo is busy. Please retry shortly."),
            { status: 429 },
          );
      }
      record = { count: 0, until: now + windowMs };
      windows.set(key, record);
    }
    if (++record.count > limit)
      throw Object.assign(
        new Error("Too many requests. Wait a minute before retrying."),
        { status: 429 },
      );
  };
}
