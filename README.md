# Greenlight — the launch desk

Conditional commerce for independent workshop organizers. A participant agrees to a specific price and plan. The organizer collects only after the reviewed launch conditions pass.

**₹0 setup:** Node, SQLite, GitHub source, PayPal sandbox, and local Ollama inference. No paid AI service or hosting subscription is required. Production payments are disabled.

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

The application binds to loopback. Hosting is optional under the hackathon's run-instructions submission option. This development server must not be exposed publicly.

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
- `src/server.js`: Node HTTP server and local request authentication/origin checks.
- `public/`: responsive workspace, source-review UI and architectural SVG drawing.

A single process serializes campaign mutations. Do not run multiple instances against this database. State persists under `.data/`. Raw PayPal responses and browser ownership tokens are excluded from public state and evidence exports. This build has no public account system, background job runner, or public deployment.

## Submission status and limits

The local prototype is runnable; the hackathon submission is not yet complete. See [BUILD_STATUS](docs/BUILD_STATUS.md), [AI evaluation](docs/AI_EVALUATION.json), and [submission draft](docs/SUBMISSION_DRAFT.md).

Still needed: real sandbox transaction verification, final model evaluation review, user validation, video under three minutes on public YouTube, and the final Devpost submission. No prize guarantee is made.

A confirmed launch is not a fulfillment guarantee. Organizers remain responsible for delivery and later cancellations. Greenlight is not escrow. Fee allowances are illustrative budgets, not PayPal pricing.

## References and licenses

[PayPal authorization](https://developer.paypal.com/checkout/delay-capture/), [Payments API](https://developer.paypal.com/api/payments/v2/), [webhook verification](https://developer.paypal.com/api/webhooks/overview/), [Ollama structured output](https://ollama.com/blog/structured-outputs), [Gemini API](https://ai.google.dev/api).

Source: MIT. Manrope is bundled under its [SIL Open Font License](public/MANROPE-LICENSE.txt). Floor plan, favicon and interface are original CSS/SVG work. No fabricated customer endorsements.
