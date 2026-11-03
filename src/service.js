import { randomUUID } from "node:crypto";
import { terms, amountText } from "./terms.js";
import { validateVenues } from "./brief.js";
import {
  seed,
  event,
  evaluate,
  assertEditable,
  publicState,
} from "./domain.js";
export function createService(store, provider, mode) {
  let busy = false;
  async function exclusive(fn) {
    if (busy)
      throw Object.assign(
        new Error("Another operation is running. Please wait."),
        { status: 409 },
      );
    busy = true;
    try {
      await store.refresh?.();
      return await fn();
    } finally {
      busy = false;
    }
  }
  const save = (s) => store.save(s);
  async function perform(s, c, kind, call) {
    const key = `${c.id}-${kind}`;
    let op = s.operations.find((o) => o.key === key);
    if (!op) {
      op = {
        key,
        kind,
        commitmentId: c.id,
        status: "PENDING",
        at: new Date().toISOString(),
      };
      s.operations.push(op);
    }
    c.status = `${kind}_PENDING`;
    await save(s);
    try {
      const result = await call(key);
      op.status = "RETURNED";
      op.result = result;
      await save(s);
      return result;
    } catch (e) {
      op.status = e.uncertain ? "UNKNOWN" : "FAILED";
      c.status = e.uncertain
        ? "UNKNOWN"
        : kind === "CAPTURE"
          ? "AUTHORIZED"
          : kind === "REFUND"
            ? "CAPTURED"
            : "AUTHORIZED";
      op.error = e.message;
      await save(s);
      throw e;
    }
  }
  const simulated = (kind, c) => ({
    id: `SIM-${kind}-${c.id.slice(0, 8)}`,
    status:
      kind === "CAPTURE"
        ? "COMPLETED"
        : kind === "REFUND"
          ? "COMPLETED"
          : "VOIDED",
  });
  async function compensate(s) {
    s.status = "COMPENSATING";
    await save(s);
    for (const c of s.commitments) {
      try {
        if (c.status === "CAPTURED") {
          const r = await perform(s, c, "REFUND", (key) =>
            mode === "demo"
              ? simulated("REFUND", c)
              : provider.refund(c.captureId, key),
          );
          c.refundId = r.id;
          c.status = r.status === "COMPLETED" ? "REFUNDED" : "REFUND_PENDING";
        } else if (c.status === "AUTHORIZED") {
          await perform(s, c, "VOID", () =>
            mode === "demo"
              ? simulated("VOID", c)
              : provider.void(c.authorizationId),
          );
          c.status = "VOIDED";
        }
        await save(s);
      } catch (e) {
        event(s, "warning", "Recovery needs attention", e.message);
        await save(s);
      }
    }
    s.status = s.commitments.every((c) =>
      ["VOIDED", "REFUNDED", "CREATED", "FAILED"].includes(c.status),
    )
      ? "CANCELLED"
      : "COMPENSATION_PENDING";
    event(
      s,
      "cancel",
      s.status === "CANCELLED"
        ? "Commitments unwound"
        : "Recovery remains pending",
      "Captured payments are refunded; uncaptured authorizations are voided. Provider and bank processing times may apply.",
    );
    await save(s);
  }
  return {
    exclusive,
    isBusy: () => busy,
    state: () => publicState(store.read()),
    async reset() {
      if (mode !== "demo")
        throw new Error(
          "Sandbox campaigns cannot be reset. Resolve every payment first.",
        );
      const s = seed(mode);
      s._storeEtag = store.read()._storeEtag;
      await save(s);
      return publicState(s);
    },
    async activate(draftId, venueInput, consent) {
      const old = store.read();
      const draft = old.draft;
      if (consent !== true || !draft || draft.id !== draftId || !draft.complete)
        throw new Error(
          "Review a complete current draft and explicitly accept it.",
        );
      if (
        old.commitments.some(
          (c) =>
            !["VOIDED", "REFUNDED", "FAILED", "CREATED"].includes(c.status),
        )
      )
        throw new Error(
          "Cancel and resolve all existing commitments before applying a new agreement.",
        );
      const venues = validateVenues(venueInput, draft.terms);
      const next = seed(mode);
      next._storeEtag = old._storeEtag;
      next.commitments = [];
      next.terms = draft.terms;
      next.brief = draft.source;
      next.subtitle = draft.title;
      next.title = draft.title;
      next.venues = venues;
      next.selectedVenue = venues[0].id;
      next.venueConfirmed = false;
      next.reviewedDraft = {
        id: draft.id,
        provider: draft.provider,
        model: draft.model,
        facts: draft.facts,
      };
      await store.archive(old);
      event(
        next,
        "plan",
        "Reviewed brief activated",
        "Organizer approved the extracted conditions and entered venue quotes. Previous campaign archived. Venue availability is not yet confirmed.",
      );
      await save(next);
      return publicState(next);
    },
    async commit({ name, consent, campaignId, version }, owner) {
      const s = store.read();
      assertEditable(s);
      if (Date.now() > s.deadline)
        throw new Error("Commitment window has expired.");
      if (campaignId !== s.id || version !== s.version)
        throw new Error(
          "The agreement has changed. Reload and review the current terms before authorizing.",
        );
      if (consent !== true)
        throw new Error("Review and accept the commitment conditions first.");
      if (
        s.commitments.filter(
          (c) => !["VOIDED", "REFUNDED", "FAILED"].includes(c.status),
        ).length >= terms(s).maximum
      )
        throw new Error("All available places are reserved.");
      const c = {
        id: randomUUID(),
        name:
          String(name || "Guest")
            .trim()
            .slice(0, 60) || "Guest",
        amount: terms(s).ticket,
        version: s.version,
        substitutions: true,
        owner,
        status: "CREATED",
        origin: mode === "demo" ? "interactive simulation" : "PayPal sandbox",
        createdAt: new Date().toISOString(),
      };
      s.commitments.push(c);
      await save(s);
      if (mode === "demo") {
        c.status = "AUTHORIZED";
        c.authorizationId = `SIM-AUTH-${c.id.slice(0, 8)}`;
      } else {
        try {
          const r = await provider.create(c.id, c.amount, s.subtitle);
          c.orderId = r.id;
        } catch (e) {
          c.status = e.uncertain ? "UNKNOWN" : "FAILED";
          await save(s);
          throw e;
        }
      }
      event(
        s,
        "commit",
        "A new possibility joined",
        `${c.name} · $${amountText(c.amount)} ${mode === "demo" ? "simulated authorization" : "sandbox checkout created"}.`,
      );
      await save(s);
      return { commitmentId: c.id, orderId: c.orderId, state: publicState(s) };
    },
    async authorize(id, owner) {
      const s = store.read();
      assertEditable(s);
      const c = s.commitments.find(
        (c) => c.orderId === id && c.owner === owner,
      );
      if (!c)
        throw Object.assign(
          new Error("Order does not belong to this browser session."),
          { status: 403 },
        );
      if (c.status === "AUTHORIZED") return publicState(s);
      if (c.status !== "CREATED")
        throw new Error(
          "This order needs reconciliation before authorization.",
        );
      const r = await perform(s, c, "AUTHORIZE", (key) =>
        provider.authorize(id, key),
      );
      const a = r.purchase_units?.[0]?.payments?.authorizations?.[0];
      if (
        !a ||
        a.status !== "CREATED" ||
        a.amount?.value !== amountText(c.amount) ||
        a.amount?.currency_code !== "USD"
      ) {
        c.status = "UNKNOWN";
        await save(s);
        throw new Error(
          "Authorization was not confirmed. Reconcile this order.",
        );
      }
      c.status = "AUTHORIZED";
      c.authorizationId = a.id;
      event(
        s,
        "commit",
        "Sandbox authorization confirmed",
        `${c.name} · $${amountText(c.amount)} held, not captured.`,
      );
      await save(s);
      return publicState(s);
    },
    async disrupt() {
      if (mode !== "demo")
        throw new Error("Scenario injection is simulation-only.");
      const s = store.read();
      assertEditable(s);
      s.venues.find((v) => v.id === s.selectedVenue).available = false;
      s.venueConfirmed = false;
      s.analysis = null;
      event(
        s,
        "warning",
        "A change in plans",
        "Scenario input: the selected venue is no longer available. No payments have been captured.",
      );
      await save(s);
      return publicState(s);
    },
    async select(id) {
      const s = store.read();
      assertEditable(s);
      const v = s.venues.find((v) => v.id === id);
      if (!v) throw new Error("Unknown venue.");
      const check = evaluate({ ...s, venueConfirmed: true }, v);
      if (
        check.reasons.some(
          (r) => !r.includes("commitment") && !r.includes("Organizer margin"),
        )
      )
        throw new Error(check.reasons.join(". "));
      s.selectedVenue = id;
      s.venueConfirmed = true;
      s.analysis = null;
      event(
        s,
        "plan",
        "A compatible plan, confirmed",
        `${v.name} selected. Organizer confirms availability. Same reviewed time, district, accessibility, and ticket price.`,
      );
      await save(s);
      return publicState(s);
    },
    async settle(failAt) {
      const s = store.read();
      if (s.status === "LAUNCHED") return publicState(s);
      assertEditable(s);
      if (!evaluate(s).ready) throw new Error(evaluate(s).reasons.join(". "));
      s.status = "SETTLING";
      event(
        s,
        "settle",
        "Conditions met. Settlement started.",
        "Plan locked. Each payment is captured separately; no atomic settlement is claimed.",
      );
      await save(s);
      let i = 0;
      try {
        for (const c of s.commitments.filter(
          (c) => c.status === "AUTHORIZED",
        )) {
          if (mode === "demo" && failAt === ++i)
            throw new Error(`Injected capture failure at participant ${i}.`);
          const r = await perform(s, c, "CAPTURE", (key) =>
            mode === "demo"
              ? simulated("CAPTURE", c)
              : provider.capture(c.authorizationId, key, c.amount),
          );
          c.captureId = r.id;
          c.status = r.status === "COMPLETED" ? "CAPTURED" : "UNKNOWN";
          await save(s);
          if (c.status !== "CAPTURED")
            throw new Error("Capture is pending. Reconcile before proceeding.");
        }
        s.status = "LAUNCHED";
        event(
          s,
          "success",
          "This little possibility is happening.",
          `${s.commitments.filter((c) => c.status === "CAPTURED").length} payments captured. ${s.venues.find((v) => v.id === s.selectedVenue).name} confirmed by organizer.`,
        );
        await save(s);
      } catch (e) {
        event(s, "warning", "Settlement interrupted", e.message);
        await save(s);
        await compensate(s);
      }
      return publicState(s);
    },
    async cancel() {
      const s = store.read();
      if (s.status === "LAUNCHED")
        throw new Error(
          "Launched workshops require a separate post-launch cancellation workflow.",
        );
      await compensate(s);
      return publicState(s);
    },
    async reconcile() {
      const s = store.read();
      for (const c of s.commitments) {
        if (mode === "demo") continue;
        try {
          if (c.refundId && c.status === "REFUND_PENDING") {
            const r = await provider.refundDetails(c.refundId);
            if (r.status === "COMPLETED") c.status = "REFUNDED";
          } else if (c.orderId) {
            const r = await provider.order(c.orderId);
            const p = r.purchase_units?.[0]?.payments;
            const capture = p?.captures?.[0],
              auth = p?.authorizations?.[0];
            if (
              capture &&
              ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(
                capture.status,
              )
            ) {
              c.captureId = capture.id;
              c.status =
                capture.status === "REFUNDED" ? "REFUNDED" : "CAPTURED";
            } else if (auth) {
              c.authorizationId = auth.id;
              const a = await provider.authorization(auth.id);
              if (a.status === "VOIDED") c.status = "VOIDED";
              else if (
                a.amount?.value !== amountText(c.amount) ||
                a.amount?.currency_code !== "USD"
              ) {
                c.status = "UNKNOWN";
                event(
                  s,
                  "warning",
                  "Authorization amount mismatch",
                  "Provider amount does not match the reviewed commitment. Manual investigation required.",
                );
              } else if (
                a.status === "CREATED" &&
                !s.operations.some(
                  (o) =>
                    o.commitmentId === c.id &&
                    o.kind === "CAPTURE" &&
                    ["PENDING", "UNKNOWN", "RETURNED"].includes(o.status),
                )
              )
                c.status = "AUTHORIZED";
            }
          }
          await save(s);
        } catch (e) {
          event(s, "warning", "Reconciliation pending", e.message);
          await save(s);
        }
      }
      if (
        ["SETTLING", "COMPENSATING", "COMPENSATION_PENDING"].includes(s.status)
      )
        await compensate(s);
      event(
        s,
        "reconcile",
        "Payment records checked",
        "Unresolved provider outcomes remain blocked; no automatic success is assumed.",
      );
      await save(s);
      return publicState(s);
    },
  };
}
