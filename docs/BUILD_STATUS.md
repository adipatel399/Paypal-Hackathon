# Actual build status

Updated 3 November 2026. Budget requirement: ₹0, no paid cloud resources.

## Implemented and checked

- Studio workspace, responsive navigation, commitment ledger, venue comparison, event records, brief builder and evidence export.
- Real local AI inference using the already installed Ollama `llama3.2:latest` model. No cloud AI credential or per-request fee.
- Text/Markdown brief import, typed extraction, source quotations, monetary evidence checks, missing/contradictory condition blocking, and explicit organizer review.
- Typed venue quote entry and new-agreement activation after existing commitments are resolved. Prior campaign archived in SQLite.
- Dynamic reviewed prices, integer-cent accounting, participant bounds, materials, fees, margin, district, time and access requirements.
- Stale buyer agreements rejected by campaign ID/version. Raw PayPal payloads excluded from public exports.
- Thirty offline tests pass. Real local model evaluation passes five synthetic cases. The earlier baseline and the final report are retained in `AI_EVALUATION_BASELINE.json` and `AI_EVALUATION.json`; this is a small test set, not a safety certification.
- Sandbox-only PayPal adapter, operation journal, settlement compensation, manual reconciliation and webhook signature-verification code.
- Local setup instructions, CI workflow, MIT license, and submission draft.

## Public repository

Published: https://github.com/adipatel399/Paypal-Hackathon . GitHub detects the MIT license. The initial source commit passed GitHub Actions checks. Local browser verification also confirmed the real Ollama extraction result and a 390px layout without horizontal overflow.

## Needs account input or external verification

- PayPal sandbox client ID and secret are missing. Real authorize/capture/void/refund behavior is not yet verified against PayPal.
- External webhook delivery requires secure HTTPS deployment. Current local-only server is intentionally not exposed publicly.
- Final customer validation, public YouTube video under three minutes, and final Devpost submission remain unfinished.

## Hosting decision

The run-instructions submission option avoids requiring any paid hosting. An Azure student account has been offered as a possible later option; no Azure resources have been provisioned. Do not enable billed resources to run this project.

## Model limitations

Local model outputs can be incomplete or incorrect. Output schema and source checks constrain proposals; they do not prove semantics. Human review is required before activation. The deterministic engine decides eligibility and payment operations. The model cannot access PayPal credentials or execute a payment.
