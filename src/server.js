import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { createService } from "./service.js";
import { paypal } from "./paypal.js";
import { hostingConfig, createHostedManager } from "./hosting.js";
import { createHandler } from "./http.js";
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
const hosting = hostingConfig();
const port = Number(process.env.PORT || 3100);
const provider = paypal();
let hostedManager, localContext;
if (hosting.hosted) {
  const { CosmosClient } = await import("@azure/cosmos");
  const client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
    connectionPolicy: {
      retryOptions: { maxRetryAttemptCount: 3, maxWaitTimeInSeconds: 5 },
    },
  });
  const container = client
    .database(process.env.COSMOS_DATABASE || "greenlight")
    .container(process.env.COSMOS_CONTAINER || "workspaces");
  await container.read(); // Verify existing durable infrastructure; never create billable resources on startup.
  hostedManager = createHostedManager(container, provider);
} else {
  const store = createStore(
    fileURLToPath(new URL("../.data/greenlight.sqlite", import.meta.url)),
    mode,
  );
  localContext = { store, service: createService(store, provider, mode) };
}
const server = createServer(
  createHandler({ mode, port, hosting, provider, localContext, hostedManager }),
);
server.listen(port, hosting.hosted ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(
    `Greenlight → ${hosting.hosted ? hosting.origin : `http://localhost:${port}`} · ${mode === "demo" ? "SIMULATED PAYMENTS" : "PAYPAL SANDBOX"} · ${hosting.hosted ? "isolated hosted workspaces" : "local workspace"}`,
  ),
);
