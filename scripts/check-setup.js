import { modelConfig } from "../src/model.js";
const config = modelConfig();
console.log("Greenlight setup check — secret values are never displayed.");
console.log(
  `Payments: ${process.env.PAYMENT_MODE || "demo"} (production unsupported)`,
);
for (const key of [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "ORGANIZER_TOKEN",
])
  console.log(`${key}: ${process.env[key] ? "configured" : "missing"}`);
console.log(`AI: ${config.provider} / ${config.model || "none"}`);
if (config.provider === "ollama") {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw new Error();
    const data = await r.json();
    console.log(
      `Local model: ${data.models?.some((m) => m.name === config.model) ? "available" : "not downloaded; use ollama pull " + config.model}`,
    );
  } catch {
    console.log(
      "Local Ollama service unavailable. Start Ollama and try again.",
    );
    process.exitCode = 1;
  }
}
console.log(
  "Free mode: no cloud billing, no automatic paid-provider fallback.",
);
