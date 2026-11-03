# Greenlight — submission draft

Status: development build. Real PayPal sandbox verification and the public demo video are still outstanding.

## Elevator pitch

Greenlight helps independent workshop organizers turn conditional commitments into a viable launch. AI extracts proposed terms from a text brief; the organizer reviews the evidence; deterministic checks decide when the plan is ready for PayPal collection.

## Features implemented

Local Llama 3.2 inference through Ollama, source-backed draft review, dynamic commercial terms, typed venue quotes, conditional commitments, inspectable event records, a PayPal sandbox adapter, and simulated partial-settlement recovery.

## Inspiration

A workshop often needs paying attendees before its organizer can commit to a venue. Participants want assurance about price, time, access and whether the workshop will happen. Greenlight makes those dependencies explicit and separates authorization from collection.

## What it does

The organizer imports a text brief and reviews proposed conditions with their source quotations. After checking venue quotes, the organizer activates a new agreement. Participants agree to that version of the plan. The application evaluates attendance, costs, capacity, access, time and district before attempting collection. Alternatives must remain within the reviewed terms. Failed group settlement triggers recovery attempts and keeps unresolved outcomes visible.

## How it is built

Dependency-free Node HTTP server, SQLite, vanilla JavaScript, Manrope, original CSS/SVG, Ollama structured generation, and PayPal Orders v2 / Payments v2. The default model is `llama3.2:latest`; it runs locally with no cloud AI charge. No claim is made that the model can safely authorize payments. Application code owns every payment transition.

## Challenges

Authorization is not guaranteed payment, group capture is not atomic, model evidence can be wrong, and changing a buyer's agreement cannot be treated as a harmless plan edit. Campaign identity/version checks, reviewed drafts, operation intent records, compensation and conservative reconciliation address these boundaries in the prototype.

## Validation

Thirty deterministic tests pass. Five synthetic cases were run against the real local model and passed the stated criteria. The reports retain both the initial failed baseline and later results. This does not establish production reliability or broad prompt-injection resistance.

## Must verify before final submission

PayPal sandbox approvals, authorization, capture, void and refund must be exercised against PayPal using the entrant's sandbox app and test accounts. Do not describe these as verified until evidence exists. The video must clearly distinguish simulation from actual sandbox calls.

## Target video: 2:50

0:00–0:15: Explain the organizer's commitment problem.
0:15–0:45: Extract a brief using local AI, show source evidence, and explain organizer review.
0:45–1:10: Add the final commitment; distinguish authorized from captured.
1:10–1:45: Cancel the venue, reject the incompatible quote, and confirm a compatible replacement.
1:45–2:10: Show collection and actual transaction evidence after sandbox verification.
2:10–2:35: Show the clearly labelled partial-capture failure simulation and recovery records.
2:35–2:50: Explain the reusable conditional-commerce idea and current limits.

No prize guarantee, escrow claim, fulfillment guarantee, autonomous live-money claim, or atomic group-payment claim.
