# Hosted judge demo: Azure + Groq

Live: https://greenlight-ppai-36bd36-kr.azurewebsites.net

## Implemented flow

**Judge browser → Azure Node application → Groq Free API + isolated Cosmos DB records.**

Payment execution in the public demo is explicitly simulated. PayPal's sandbox adapter remains available in the authenticated local verification path; real provider verification is pending credentials.

## Hosting and limits

- Azure App Service F1 / Free, one Node process, HTTPS only.
- Cosmos DB free tier, one Korea Central region, shared database throughput 400 RU/s, account provisioning cap 1000 RU/s.
- Cosmos point reads/writes with conditional ETags prevent stale updates from overwriting newer records. Mutation code awaits persistence before side effects.
- Signed, HttpOnly, Secure, SameSite cookies isolate each judge's workspace.
- Seven-day inactivity retention applies only to simulated hosted records. Hosted sandbox money workflows are refused at startup.
- Daily application limits: 100 AI calls, 1000 new workspaces, 1000 archives and 10,000 mutations across the demo. Per-session request limits apply too. Provider free-tier token quotas may be reached sooner and produce explicit errors.
- The student subscription's spending protection remains On. No GPU, paid App Service SKU, paid AI account, custom domain or telemetry resource was provisioned.

The initial East Asia deployment could not reach Groq successfully. The verified deployment places both app and database in Korea Central. The unused East Asia test web app and free plan were removed; the durable database remains active.

## Evidence

`HOSTED_VERIFICATION.json` records eleven successful external HTTPS/API checks with the real provider. `GROQ_EVALUATION.json` records five small synthetic model cases. Neither file claims production reliability, actual PayPal transaction verification, or completed browser visual QA.

## Credentials

Groq and Cosmos credentials are stored only in Azure application settings and ignored local operator files. They are not returned in public state or included in deployment archives. The browser is never asked for the entrant's AI key.

## Still required

Actual PayPal sandbox verification, final visual browser check, video and final submission. Do not enable hosted real money flows by changing only an environment variable: the hosted code intentionally rejects them.

## References

- https://console.groq.com/docs/billing-faqs
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/structured-outputs
- https://learn.microsoft.com/en-us/azure/cosmos-db/free-tier
- https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs
