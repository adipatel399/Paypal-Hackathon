# Greenlight — the launch desk

Conditional commerce for independent workshop organizers. A participant agrees to a specific price and plan. The organizer collects only after the reviewed launch conditions pass.

**Hosted demo:** https://greenlight-ppai-36bd36-kr.azurewebsites.net

The hosted demo uses real Groq inference and explicitly simulated payments. Judges can open it without installing anything. External API verification is recorded in [HOSTED_VERIFICATION.json](docs/HOSTED_VERIFICATION.json). Real PayPal sandbox verification remains unfinished.

**₹0 out-of-pocket setup:** Azure App Service F1, Cosmos DB free tier, Groq Free, GitHub source, and PayPal sandbox. Local development can also use SQLite and Ollama. No paid AI service or hosting subscription is required. Production payments are disabled.

## Run the project

Requires Node.js 22.14+ and [Ollama](https://ollama.com/download) for model-backed features.

```sh
npm ci
cp .env.example .env
ollama pull llama3.2:latest
npm run dev
```

Open [localhost:3100](http://localhost:3100). Start the Ollama application if its local service is not running. On the development Mac the model was already downloaded. Other machines need the model download; its license and hardware requirements apply.

```sh
npm run setup:check  # configuration names and availability, never secret values
npm run check
npm test            # offline deterministic tests; no AI service required
npm run test:ai     # real model calls on five fictional cases; results saved in docs/AI_EVALUATION.json
```

Local mode binds to loopback. Hosted mode requires an HTTPS origin, signed session cookies and Cosmos DB. The Azure deployment keeps each judge in an isolated simulated-payment workspace; the local SQLite server must not simply be exposed through a tunnel.

## What works

- Studio workspace, commitment ledger, venue alternatives, activity records, and evidence export.
- Default fictional ceramics workshop, seven clearly labelled simulated commitments, and interactive simulation.
- Local AI analysis through Ollama. Actual provider/model provenance is shown; an unavailable model produces an error, not a fake AI answer.
- **Brief builder:** paste or import `.txt`/`.md` text; extract proposed conditions; review source quotations; add typed venue quotes; explicitly approve a new agreement. Missing or invalid fields prevent approval. PDFs are not supported.
- Dynamic integer-cent ticket prices, attendance limits, costs, margin, location, time and accessibility conditions. USD only.
- A new agreement cannot replace unresolved existing commitments. Resolve them first; the old campaign is archived locally before activation.
- Real server-side PayPal sandbox adapter: create order, authorize, capture, void, refund, lookup and signature verification. Actual sandbox calls still require account credentials and verification.
- Persistent operation intent, stable request identifiers where supported, browser-owned checkouts, organizer token checks, and conservative compensation for partial settlement failures.

## Judge walkthrough

### Recovery demo

1. Open the default **Launch plan**. Seven of eight simulated participants are ready.
2. Reserve a place; review and accept the conditions. No real money moves in simulation.
3. Simulate a venue cancellation.
4. In **Alternatives**, ask AI to review the evidence. The inaccessible six-seat venue must remain ineligible.
5. Confirm the compatible Clay House venue and its availability.
6. Confirm launch. Inspect captures in **Activity & evidence**.
7. Under Connections reset the simulation, add the eighth commitment, and choose **Test a partial capture failure** in the launch confirmation. Inspect two simulated refunds and six voids.

### Brief extraction

1. Open **Brief builder** and load the labelled example, or paste a new explicit workshop brief.
2. Choose **Extract conditions with AI**. Local inference can take up to three minutes.
3. Review each proposed value and quoted evidence. Clarify the source and re-extract if anything is missing, contradictory or incorrectly interpreted. Source anchoring does not prove semantic correctness; the organizer must review it.
4. Enter venue quote amounts in dollars, capacity, district, time, access and source evidence. These are organizer-entered records, not independently verified inventory.
5. If an existing campaign has active commitments, cancel and resolve them under Connections first.
6. Accept the draft and apply it. The new campaign starts without simulated buyers. Confirm a suitable venue before settlement.

## PayPal sandbox — free test environment

Create a developer app at [PayPal Developer](https://developer.paypal.com/dashboard/applications/sandbox). Select **Sandbox**, not Live. Obtain the app's sandbox client ID and secret. Personal sandbox accounts approve test orders; the business sandbox account receives them. Use test balances only.

In local `.env`:

```dotenv
PAYMENT_MODE=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
ORGANIZER_TOKEN=a_random_secret_with_at_least_32_characters
```

Generate an organizer token locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Restart the server and enter that token in Connections for organizer actions. Never commit `.env` or share secrets in chat.

Sandbox campaigns start with **zero** fixtures. Participants must actually approve sandbox checkouts. Server-controlled amounts come from the reviewed campaign, never the browser's requested price. The adapter cannot address production endpoints.

Authorizations do not guarantee capture. Group capture is not atomic. If settlement fails partway through, the application attempts refunds and voids. Unknown outcomes stay blocked for reconciliation. Some uncertain order-creation/capture outcomes still need operator investigation; the app does not optimistically mark them paid.

### Webhooks

`POST /api/webhooks/paypal` verifies signatures using `PAYPAL_WEBHOOK_ID`, records unique event IDs and reconciles provider resources rather than trusting event ordering. External delivery requires a reachable HTTPS listener. That is not available on this loopback-only build. Until secure deployment is implemented, use **Reconcile payments** locally and inspect sandbox records.

## AI options with no required payment

### Local Ollama (default)

```dotenv
AI_PROVIDER=ollama
OLLAMA_MODEL=llama3.2:latest
```

Requests go only to `127.0.0.1:11434`. No cloud AI credential, account subscription or per-request charge is involved. Compute uses your own hardware. Model output is schema-constrained and application-validated, but can still be wrong. User review is mandatory. Five synthetic evaluation cases are provided; they are not a reliability certification.

### Hosted-demo option: Groq Free plan

A hosted judge demo needs server-side cloud inference rather than access to the entrant's Mac. A Groq adapter is implemented with strict JSON output, application validation, explicit free-plan confirmation, and clear rate-limit errors. No automatic paid fallback is used. See [the hosted demo plan](docs/HOSTED_DEMO_PLAN.md) for the remaining Azure storage, session, authentication and deployment work.

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=your_free_plan_key
GROQ_MODEL=openai/gpt-oss-20b
GROQ_FREE_TIER_CONFIRMED=true
```

Keep the Groq account on Free without adding a payment method. The app cannot inspect provider billing. Requests send the brief to Groq; review its data terms before submitting private information. Live Groq inference remains unverified until the entrant supplies a key. Five real Groq checks are recorded separately in [GROQ_EVALUATION.json](docs/GROQ_EVALUATION.json). Local-model results remain in their own report.

### Optional Gemini free tier

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your_free_tier_key
GEMINI_MODEL=gemini-2.5-flash
FREE_TIER_CONFIRMED=true
```

Use a Google AI Studio project **without paid billing**. Only set the confirmation after checking that in your account. The application cannot inspect account billing. Quota exhaustion returns an error; it does not upgrade tiers, call another provider or enable billing. Free-tier availability and quotas are provider-controlled. Google may use free-tier content to improve its products; avoid private documents. Local Ollama avoids external document transmission. See [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing).

`AI_PROVIDER=fixture` explicitly disables real AI and enables labelled fixture analysis. A labelled sample draft is always an example, never passed off as inference.

## Architecture

- `src/terms.js`, `src/domain.js`: reviewed terms, eligibility and integer money arithmetic.
- `src/brief.js`: typed extraction schema, source anchoring, draft validation and venue inputs.
- `src/model.js`, `src/ai.js`: local/optional free-tier model adapters and venue analysis.
- `src/service.js`: consent, operation journal, settlement, compensation, reconciliation, activation and archives.
- `src/store.js`: SQLite campaign records, archives and webhook inbox.
- `src/paypal.js`: sandbox-only API client.
- `src/server.js`, `src/http.js`: Node HTTP server, origin checks and scoped request handling.
- `src/hosting.js`, `src/cosmos-store.js`: signed browser sessions, isolated durable stores, optimistic concurrency, retention and free-demo usage budgets.
- `public/`: responsive workspace, source-review UI and architectural SVG drawing.

A single process serializes campaign mutations. Do not run multiple instances against this database. Local state persists under `.data/`. Hosted simulated records persist in Cosmos DB with a seven-day inactivity retention period. Raw PayPal responses and browser ownership tokens are excluded from public state and evidence exports. The hosted demo has isolated signed browser sessions and daily usage budgets; it has no public account system or background payment-recovery worker. Hosted payment mode is intentionally limited to simulation. Real sandbox transactions remain in the authenticated local verification flow.

## Submission status and limits

The local prototype is runnable; the hackathon submission is not yet complete. See [BUILD_STATUS](docs/BUILD_STATUS.md), [AI evaluation](docs/AI_EVALUATION.json), and [submission draft](docs/SUBMISSION_DRAFT.md).

Still needed: real PayPal sandbox transaction verification, user validation, a video under three minutes on public YouTube, and the final Devpost submission. The cloud AI and hosted API flow have been verified; that does not establish production reliability. No prize guarantee is made.

A confirmed launch is not a fulfillment guarantee. Organizers remain responsible for delivery and later cancellations. Greenlight is not escrow. Fee allowances are illustrative budgets, not PayPal pricing.

## References and licenses

[PayPal authorization](https://developer.paypal.com/checkout/delay-capture/), [Payments API](https://developer.paypal.com/api/payments/v2/), [webhook verification](https://developer.paypal.com/api/webhooks/overview/), [Ollama structured output](https://ollama.com/blog/structured-outputs), [Gemini API](https://ai.google.dev/api).

Source: MIT. Manrope is bundled under its [SIL Open Font License](public/MANROPE-LICENSE.txt). Floor plan, favicon and interface are original CSS/SVG work. No fabricated customer endorsements.

## Azure deployment

The live app and database are in Korea Central. App Service uses **F1 / Free**; Cosmos has its free tier enabled, one region, 400 RU/s database throughput and a 1000 RU/s account cap. The student subscription’s spending protection remains enabled. Free tiers have capacity, bandwidth and usage limits; the application caps requests and AI use and does not upgrade tiers automatically.

The infrastructure template and deployment helpers are in `infra/azure-free.json`, `scripts/azure-prepare.js` and `scripts/azure-publish.js`. They are not run by GitHub CI. They require an explicitly configured Azure CLI session and enforce spending protection and free SKUs. Operator metadata, parameter files, deployment packages and secrets remain under ignored `.data/` files.

`PUBLIC_ORIGIN`, `SESSION_SECRET`, `COSMOS_ENDPOINT`, `COSMOS_KEY`, and the Groq Free-plan settings configure hosted mode. Azure application settings hold secrets; they are never included in browser state. Hosted mode refuses Ollama and real payment settlement. The public simulator retains PayPal API integration in the source and local sandbox flow, but must not be described as having verified real PayPal transactions yet.

Forty-three automated tests pass, covering durable-write ordering, optimistic-concurrency conflicts, session isolation, forged cookies and cross-origin mutations. The hosted API was exercised over HTTPS through actual Groq extraction, venue recovery and simulated settlement. Browser visual verification of the final hosted build remains pending because the browser-control tool reports disabled access in this chat.
