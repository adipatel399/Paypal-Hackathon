# Hosted judge demo: Azure + Groq

Status: Groq adapter implemented and contract-tested. The application is **not yet publicly deployable**, and no Azure resources have been provisioned.

## Why change the deployment path?

A reviewer opening a URL cannot access the entrant's Mac or its localhost Ollama service. Repository setup instructions remain a valid fallback, but a hosted demo should call an external AI service from its server.

Target flow:

**Judge browser → Azure-hosted Node application → Groq Free-plan API + PayPal sandbox.**

Ollama remains a local development option. Judges should not need Ollama or their own AI key for the hosted demo.

## Groq setup

Create a key at https://console.groq.com/keys using a Free-plan account without adding a payment method. Store it privately in `.env` for verification, and later in Azure application settings:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=your_key
GROQ_MODEL=openai/gpt-oss-20b
GROQ_FREE_TIER_CONFIRMED=true
```

Only confirm the free tier after checking the account. The application cannot inspect account billing. Do not upgrade the account to Developer. Groq's Free plan has quotas; quota exhaustion returns an explicit error, not a provider fallback or automatic upgrade. The server uses strict JSON-schema output and retains all application-level evidence validation. Schema compliance does not guarantee factual correctness.

The four Groq adapter tests use controlled responses. Actual extraction/analysis must still be evaluated with the entrant's real free-tier key. Existing local-model reports are not Groq verification.

## Azure requirements before publication

1. Verify the chosen student subscription has spending protection enabled. Retain the spending limit; do not upgrade to pay-as-you-go or assume student credits imply unlimited free resources.
2. Confirm the selected service/SKU and region are available within the actual account allowance. Azure App Service Free is a candidate, with shared-resource limits and cold-start tradeoffs.
3. Move durable campaign/payment records to storage supported by the chosen host. Do not put the current SQLite WAL database on an unsupported shared network filesystem or ephemeral disk and call it reliable payment persistence.
4. Add HTTPS deployment origin/host configuration, secure sessions, isolated reviewer campaigns, abuse controls and a global AI quota budget. The current server deliberately accepts only localhost.
5. Keep sandbox settlement and organizer controls authenticated. Provider secrets remain server-side.
6. Configure and verify PayPal webhook delivery and recovery after restart.
7. Test from a clean browser/device with the development Mac offline. Publish a judge URL only after that succeeds.

No default paid App Service plan, GPU, managed database, custom domain or paid AI fallback should be created automatically.

## Official references

- https://console.groq.com/docs/billing-faqs
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/structured-outputs
- https://learn.microsoft.com/en-us/azure/education-hub/azure-dev-tools-teaching/azure-students-starter-program
- https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs
- https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans
