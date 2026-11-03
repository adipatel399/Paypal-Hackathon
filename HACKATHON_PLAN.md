# GREENLIGHT — Pay for the world you agreed to

> Original planning snapshot. For current implementation status see docs/BUILD_STATUS.md.

Planning draft • 16 October 2026 • No application implementation started

## Decision

Build an AI conditional-commerce engine, demonstrated through a small creator running an in-person workshop. Buyers commit to explicit conditions; AI turns messy planning evidence into a proposed executable plan, explains what prevents it from happening, and finds a feasible alternative when circumstances change. Deterministic application code controls every payment transition.

Pitch: “Most checkout buttons sell something that already exists. Greenlight helps a business discover whether something can exist, secure conditional demand, and get paid when the agreed plan is ready.”

This is a hypothesis for a competitive entry, not a guarantee of winning or a claim to have invented conditional payments. The distinguishing combination is evidence-backed condition compilation, consent-preserving replanning, and a working PayPal transaction lifecycle.

## Target customer and problem

First audience: independent instructors running small local workshops. They need enough paying attendees, a suitable venue, equipment, and a viable budget before committing to delivery. Ordinary RSVPs do not establish payment readiness. Taking payments immediately creates refund work if plans collapse.

Validate with five instructors or small event organizers before committing beyond the first technical spike. Ask about their last cancelled event, actual minimum viable attendance, booking deadlines, current payment workflow, and authorization-hold tolerance. Ask to see anonymized planning materials. Do not present fictional interviews or simulated savings as research.

Stay with one commercial seller: the workshop organizer. Participants pay that organizer. Venue and materials are dependencies and costs, not recipients of an invented split-payment mechanism. The prototype does not collect payments for unrelated merchants or operate an escrow wallet.

## Signature demonstration

A ceramics instructor uploads a workshop brief and two venue quotes. The plan requires 8 participants, a 2-hour slot, at least 8 workstations, an accessible venue, and a ticket price no higher than $40. All numbers are illustrative sandbox fixtures.

The first venue costs $120 and supports 8 people. Materials cost $10 per participant. At 8 participants and $40 per ticket, gross revenue is $320, direct costs are $200, leaving $120 before processing fees and other costs. The app must include a configurable fee allowance and minimum organizer margin in its real feasibility calculation; it must label estimates.

A cheaper $80 venue supports only 6 people. It looks attractive but violates the reviewed minimum-capacity condition and is rejected. A fallback venue costs $140, supports 10, and meets the same location, time and accessibility requirements. Its lower margin can still satisfy the organizer's configured floor. Seller confirmations are explicit inputs, not inferred from advertisements.

Participants review a clear condition card and approve their individual PayPal sandbox checkout. Seven authorizations exist before the recorded walkthrough; the eighth is approved live. Each transaction carries its actual timestamp and provenance.

Before settlement, the primary venue becomes unavailable through an explicitly labelled scenario control. The dependency graph turns amber. AI proposes the compatible fallback with cited evidence. A deterministic evaluator rechecks every condition. If that venue is outside the approved substitution envelope, affected participants must review and approve amended terms before proceeding. Approval does not silently rewrite the original consent.

Once the organizer reconfirms readiness and all required authorizations remain valid, settlement begins. The app shows the real PayPal capture results and completes the launch only when every required payment succeeds. A second scenario demonstrates cancellation and voiding. A failure scenario demonstrates compensation after a partial settlement.

Never say that an authorization guarantees payment, that a venue quote guarantees availability, or that PayPal offers an atomic group transaction.

## Core product surfaces

1. Organizer workspace: brief, evidence, extracted conditions, budget, confirmation controls.
2. Buyer commitment card: seller, deliverable, amount, deadline, allowed substitutions, hold explanation, cancellation policy, PayPal approval.
3. Live launch map: dependencies, confirmed evidence, authorized participants, blockers, countdown.
4. Recovery comparison: current plan, alternatives, violated conditions, exact consent changes.
5. Receipt and audit timeline: plan version, approvals, payment identifiers, confirmed outcomes.
6. Judge scenario launcher: success, no feasible plan, and partial settlement failure, with clear sandbox/fixture labels.

The public experience must be usable without reading a developer console. Technical evidence is expandable.

## AI responsibilities

- Extract proposed structured constraints from natural-language briefs and uploaded quote text.
- Attach each extracted fact to a source span or mark it unknown.
- Identify ambiguous requirements and ask for a human decision.
- Propose alternatives from a finite, known candidate set.
- Explain deterministic solver results and minimal blockers in plain language.
- Replan after availability or cost changes without changing consent.

AI is necessary because real briefs and evidence are unstructured and inconsistent. It is not responsible for arithmetic truth, payment permissions, seller confirmation, accessibility certification, or final settlement eligibility.

The first version should accept text and simple PDFs if extraction is reliable. Vision, voice and arbitrary web research are optional. A small number of well-designed model calls is preferable to a theatrical swarm.

## Deterministic responsibilities

- Schema validation and reviewed plan versions.
- Budget arithmetic in integer currency units; no currency conversion in MVP.
- Capacity, time, location-zone and allowed-substitution checks.
- Required buyer participation and current authorization status.
- Explicit consent tied to the plan version and permitted change envelope.
- Deadline checks and organizer readiness confirmation.
- Payment state transitions, concurrency control and recovery.

For a small candidate set, exhaustive candidate enumeration is adequate. Introduce a constraint solver only if actual problem complexity warrants it. Do not call an LLM explanation a mathematical proof.

## PayPal integration

Use Orders v2 with intent AUTHORIZE, one individual order per buyer, then Payments v2 capture, void and refund endpoints. Use PayPal-hosted buyer approval. Keep OAuth secrets server-side.

PayPal documents that AUTHORIZE is not supported with multiple purchase units in a single order. Do not design a group basket around that combination. PayPal recommends capture within the first 3 days; use a short launch window of at most 24 hours for this prototype. Authorizations may become invalid or capture may fail even during that window.

Persist local order IDs, PayPal order IDs, authorization IDs, capture IDs, refund IDs, request IDs, amount, currency, seller, timestamps and operation status. Use stable idempotency identifiers for supported requests, database uniqueness constraints, server-side ownership checks and per-launch settlement locks. A browser callback alone must not mark an order paid.

Verify actual webhook signatures. Deduplicate event IDs and handle delayed or out-of-order delivery. Reconcile uncertain outcomes by fetching PayPal resource details. A timed-out capture request is not proof that no capture happened.

## Settlement protocol

Campaign states: DRAFT → REVIEWED → COLLECTING → READY → SETTLING → LAUNCHED.
Alternative terminal/recovery states: EXPIRED, CANCELLED, RECONCILING, COMPENSATING, COMPENSATION_PENDING, FAILED.
Payment states are separate: CREATED, APPROVED, AUTHORIZED, CAPTURE_PENDING, CAPTURED, VOID_PENDING, VOIDED, REFUND_PENDING, REFUNDED, UNKNOWN, FAILED.

Before settlement: freeze the reviewed plan version; reject concurrent edits; check buyer consents, deadline, organizer confirmation, candidate evidence, budget and authorization validity. Reserve available capacity in the organizer's own system where possible.

During settlement: record the intended operation durably before the network call, use idempotency, then persist and reconcile the actual result. Do not issue final tickets while required captures remain unresolved.

If some captures succeed and another definitively fails: stop further settlement, reconcile unknown outcomes, refund completed captures and void remaining authorizations. Show actual progress. Refunds can be pending or fail; the system needs retries and an organizer-facing exception queue. No claim of instant reversal or distributed atomicity.

Once all captures succeed, issue confirmations. The prototype protects launch conditions, not future real-world fulfillment. The organizer remains responsible for running the workshop and handling later cancellations.

## Architecture

Recommended starting stack: TypeScript application, React/Next.js interface, PostgreSQL, a durable database-backed job queue, server-side PayPal adapter and a server-side structured-output model adapter. Deploy using an ordinary Node-capable hosting service; select hosting during implementation after checking current documentation and account availability.

Data records: organizers, campaigns, plan_versions, evidence, conditions, alternatives, buyer_consents, commitments, payment_operations, webhook_events, outbox_jobs and audit_events.

The AI sees only the information required to plan. It cannot access PayPal credentials or directly call unrestricted financial endpoints. Uploaded documents are untrusted data. Instructions embedded in them cannot change application policy. All payment requests pass through typed, authenticated application services.

Use a provider-neutral model interface. Benchmark available strong reasoning models on a private set of representative briefs before choosing one. Choose based on extraction accuracy, unsupported-claim rate, constraint compliance, response time and cost. This planning task does not assume access to a model other than the one currently serving the chat.

## Scope order

Must ship: one organizer, one currency, a short launch window, reviewed conditions, explicit buyer approvals, real sandbox authorization/capture/void, event reconciliation, a visible recovery scenario and a runnable public repository.

Must verify: compensation after partial capture, application restart recovery, tampered price rejection, plan changes invalidating eligibility, duplicate webhooks, uncertain network outcomes and concurrent settlement requests.

Stretch only after the core is stable: structured PDF extraction, participant-specific conditions, minimal relaxation suggestions, multiple simultaneous workshops, reusable merchant templates and an embeddable conditional checkout widget.

Exclude: cross-border production transfers, platform custody, split payouts, credit, insurance, guarantees, crypto, broad marketplace onboarding and autonomous live-money spending.

## Delivery schedule — India time

16–18 October: customer conversations, API feasibility spike, confirm current rules and demo claims. Exit gate: real sandbox authorize → capture; separate authorize → void; refund; observed webhook verification.

19–22 October: state machine, payment persistence, consent versioning, idempotency, durable operations and reconciliation. Exit gate: restart and retry do not create duplicate capture.

23–26 October: structured AI extraction, evidence links, deterministic feasibility engine, approved plan review. Exit gate: missing or conflicting evidence blocks readiness.

27–30 October: complete organizer and buyer flows, launch map, evidence timeline and recovery comparison. Exit gate: a new tester completes the main journey unaided.

31 October–3 November: failure injection and compensation; unknown-outcome recovery; exact payment status presentation. Exit gate: no false launch after partial settlement.

4–6 November: target-user tests and AI evaluation set. Fix unclear consent and hold explanations. Record real findings; cut weak features.

7–9 November: accessible visual polish, judge instructions, fresh-machine setup check, public repository preparation and license review.

10 November: record and edit a video under 3 minutes; check legibility and device demonstration. Show actual sandbox outcomes and label scenario inputs.

11 November: freeze submission build and submit early. Keep 12 November as contingency. Official deadline is 13 November 2026 at 1:30 a.m. IST.

Assumption: one focused builder with coding assistance, roughly 20–30 productive hours per week. Reestimate after the payment spike. If available time is substantially lower, cut input formats and visual embellishments before cutting payment correctness.

## Demo video — target 2:45

0:00–0:15: instructor explains the commitment problem.
0:15–0:40: upload evidence; review AI-extracted conditions and budget.
0:40–1:05: eighth buyer approves a PayPal sandbox authorization; explain held versus charged.
1:05–1:40: venue fails; cheap incompatible option rejected; compatible alternative proposed and reviewed.
1:40–2:10: real captures complete; launch confirmed; show concise transaction evidence.
2:10–2:30: alternate failure scenario voids commitments, or shows compensation from an earlier labelled run.
2:30–2:45: explain the broader reusable conditional-checkout capability.

The video must not imply that seeded commitments happened live. If latency requires editing, preserve sequence and label elapsed time. A resilient recorded walkthrough accompanies a working hosted judge build or complete setup instructions.

## Validation and success measures

AI evaluation: approximately 25 hand-reviewed briefs, including conflicting prices, missing capacity, timezone ambiguity, malicious embedded instructions and inaccessible alternatives. Report exact counts rather than a grand reliability claim.

Engineering evaluation: no duplicate captures under retries; no price over consented amount; no launch without complete settlement; no silent condition changes; every uncertain payment reconciled or visibly escalated; no source-free eligibility claim.

User evaluation: can organizers define a launch condition, can buyers distinguish authorization from charge, and can both understand what happens on cancellation? Record task completion and explanation errors. Any revenue recovered is a sandbox scenario calculation unless measured in a real approved deployment.

## Competitive positioning

Threshold funding and collective buying already exist. AI procurement and buying agents also exist. Do not claim that conditional payment, demand aggregation or AI planning is new.

Our proposed contribution is an end-to-end experience that compiles messy conditions into a reviewed agreement, identifies what prevents a real purchase, suggests a compliant alternative and reconciles actual PayPal payment operations when the plan succeeds or fails.

Investigate adjacent products during validation. If customers see no meaningful improvement over an ordinary ticketing minimum and manual refunds, pivot before polishing: keep the conditional-commerce engine, choose a more painful repeatable workflow based on interviews.

## Submission package

Public source repository; appropriate open-source LICENSE; complete environment variable example without secrets; setup and seed instructions; sandbox buyer instructions; architecture and payment state documentation; hosted demo if practical; video under 3 minutes uploaded publicly to YouTube; clear AI/model disclosure; source and asset attribution; no production credentials or personal payment data.

Make all simulated external availability changes and sandbox transactions explicit. Do not claim marketplace, escrow, insurance or atomic payment functionality.

## Primary references

Official rules and rubric: https://paypalaihackathon.devpost.com/rules
PayPal authorization/capture: https://developer.paypal.com/checkout/delay-capture/
Order intent limitation: https://developer.paypal.com/api/orders/v2/definitions/checkout_payment_intent/
Payments endpoints: https://developer.paypal.com/api/payments/v2/
Refunds: https://developer.paypal.com/api/payments/v2/captures-refund
Webhook verification: https://developer.paypal.com/api/webhooks/overview/
PayPal AI capabilities: https://developer.paypal.com/ai-tools/get-started
Adjacent collective procurement example: https://bundleiq.co.uk/
