# Actual build status

Updated 3 November 2026. Budget requirement: ₹0 out of pocket, no paid AI upgrade.

## Live judge demo

https://greenlight-ppai-36bd36-kr.azurewebsites.net

The hosted prototype uses **real Groq inference and explicitly simulated payments**. Judges do not need Ollama, a local installation, or their own AI key.

Azure App Service uses F1 / Free. Cosmos DB has free tier enabled, one region, 400 RU/s shared database throughput and a 1000 RU/s account cap. Both active services are in Korea Central. The student subscription's spending limit remains On. Free-tier quotas still apply; no paid tier or automatic provider fallback is enabled.

## Verified

- Forty-three automated tests pass, including hosted session isolation, signed cookies, optimistic concurrency and persistence before payment operations.
- Five real local Ollama evaluation cases passed, retained in `AI_EVALUATION.json` along with their earlier baseline.
- Five real Groq evaluation cases passed, recorded separately in `GROQ_EVALUATION.json`. Each report states its small synthetic scope and exact outcomes.
- Eleven external HTTPS/API checks passed in `HOSTED_VERIFICATION.json`: public health, isolated workspaces, secure cookies, persisted commitments, real Groq extraction and recovery, simulated settlement, origin protection, HTML and assets.
- Text/Markdown brief import, source-backed draft review, typed venue quotes and explicit activation after resolving old commitments are implemented.
- Dynamic reviewed USD prices, costs, capacity, time, district and accessibility conditions feed deterministic launch gates.
- Public repository: https://github.com/adipatel399/Paypal-Hackathon . MIT license and GitHub CI are configured.

## Unfinished

- Actual PayPal sandbox client ID and secret are still missing. No real PayPal authorization, capture, void or refund has been verified against the entrant's sandbox app.
- The user authorized browser setup on their behalf, but the browser-control tool still reports “Local browser use is disabled in Work settings.” No PayPal login or app creation has been performed.
- Hosted real sandbox payments and webhooks are deliberately disabled; simulated records expire after seven days without updates.
- Final hosted browser visual QA, customer validation, public YouTube video under three minutes, and final Devpost submission remain unfinished.

The app is a runnable hosted prototype, not a finished hackathon submission or a production financial service.
