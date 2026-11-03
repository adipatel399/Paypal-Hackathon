let state,
  view = "overview",
  busy = false;
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n / 100);
let noticeTimer;
function notice(text) {
  $("#notice").textContent = text;
  $("#notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("#notice").hidden = true), 6500);
}
async function api(path, body) {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionStorage.getItem("organizerToken")
        ? {
            Authorization: "Bearer " + sessionStorage.getItem("organizerToken"),
          }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
async function load() {
  state = await api("state");
  render();
}
function pill(status) {
  const good = [
    "AUTHORIZED",
    "CAPTURED",
    "LAUNCHED",
    "REFUNDED",
    "VOIDED",
  ].includes(status);
  return `<span class="status-pill caption-3 ${good ? "" : ["UNKNOWN", "COMPENSATION_PENDING"].includes(status) ? "amber" : "grey"}">${esc(status.replaceAll("_", " ").toLowerCase())}</span>`;
}
function actions() {
  return `<div class="app-actions"><button class="primary button-sm" data-action="join" ${state.status !== "COLLECTING" ? "disabled" : ""}>${state.mode === "demo" ? "Add a commitment" : "Commit with PayPal"} <span aria-hidden="true">↗</span></button><button class="secondary button-sm" data-action="settle" ${!state.evaluation.ready || state.status !== "COLLECTING" ? "disabled" : ""}>Confirm & launch</button></div>`;
}
function condition(ok, label, detail) {
  return `<div class="condition"><span class="condition-symbol ${ok ? "" : "blocked"}" aria-hidden="true">${ok ? "✓" : "·"}</span><span class="body-5">${label}</span><span class="caption-4">${detail}</span></div>`;
}
function overview() {
  const e = state.evaluation,
    t = state.terms,
    v = state.venues.find((v) => v.id === state.selectedVenue);
  const current = state.status === "COLLECTING";
  return `${!current ? `<div class="success-card"><h3 class="heading-5">${state.status === "LAUNCHED" ? "Workshop confirmed." : state.status === "CANCELLED" ? "Launch cancelled." : "Payment recovery needs attention."}</h3><p class="body-6">${state.status === "LAUNCHED" ? `${e.count} ${state.mode === "demo" ? "simulated" : "sandbox"} payments captured. The organizer remains responsible for delivery.` : state.status === "CANCELLED" ? "Resolved captures refunded and uncaptured authorizations voided. Provider processing times may apply." : "No launch is confirmed. Reconcile outstanding operations."}</p></div>` : ""}<div class="app-grid"><article class="panel"><div class="panel-head"><div><h3 class="heading-6">Conditions before collection</h3><div class="workshop-meta caption-4"><span>${esc(t.slot)}</span><span>${esc(t.location)}</span></div></div>${pill(state.status)}</div><div class="metrics"><div class="metric"><span class="heading-4">${e.count}<span class="muted title-3"> / ${t.minimum}</span></span><span class="caption-4">Minimum commitments</span></div><div class="metric"><span class="heading-4">${money(e.revenue)}</span><span class="caption-4">${state.status === "LAUNCHED" ? "Captured total" : "Committed total"}</span></div><div class="metric"><span class="heading-4">${money(t.ticket)}</span><span class="caption-4">Per participant</span></div></div><div class="progress" role="progressbar" aria-label="Minimum commitments" aria-valuenow="${Math.min(e.count, t.minimum)}" aria-valuemin="0" aria-valuemax="${t.minimum}"><div class="progress-fill" style="width:${Math.min((e.count / t.minimum) * 100, 100)}%"></div></div><div class="condition-list">${condition(e.count >= t.minimum, "Participant minimum", `${e.count} of ${t.minimum}`)}${condition(v.available && state.venueConfirmed, "Venue confirmation", esc(v.name))}${condition((!t.accessible || v.accessible) && v.capacity >= Math.max(t.minimum, e.count), "Capacity & access", `${v.capacity} workstations`)}${condition(e.margin >= t.margin, "Organizer margin", money(e.margin))}</div>${actions()}<p class="note caption-5">${current ? `A commitment authorizes ${money(t.ticket)}. Collection waits for the reviewed conditions.` : "Payment outcomes are recorded in the evidence trail."}</p></article><aside class="aside-grid"><article class="panel"><div class="panel-head"><h3 class="title-3">Launch economics</h3><span class="caption-4 muted">USD</span></div><div class="budget-line body-6"><span>Participant commitments</span><span>${money(e.revenue)}</span></div><div class="budget-line body-6"><span>Venue quote</span><span>${money(e.venueCost)}</span></div><div class="budget-line body-6"><span>Materials · ${money(t.materials)} each</span><span>${money(e.materials)}</span></div><div class="budget-line body-6"><span>Fee allowance · ${money(t.fee)} each</span><span>${money(e.feeReserve)}</span></div><div class="budget-total"><span class="body-5">Organizer margin</span><strong class="title-1">${money(e.margin)}</strong></div><p class="note caption-5">Minimum ${money(t.margin)} margin. Fee allowance is illustrative, not a PayPal fee quote.</p></article><article class="scenario-panel"><h3 class="title-3">Put the plan under pressure.</h3><p class="body-6">${state.mode === "demo" ? "Remove the venue. Compare replacements against the agreed conditions." : "Sandbox has no fixture payments or injected failures."}</p><div class="app-actions">${state.mode === "demo" ? `<button class="secondary button-sm" data-action="disrupt" ${!current || !v.available ? "disabled" : ""}>Simulate venue cancellation ↗</button>` : `<button class="secondary button-sm" data-action="reconcile">Reconcile payments</button>`}</div></article></aside></div>`;
}
function commitments() {
  return `<div class="view-heading"><div><h3 class="heading-5">The commitment ledger.</h3><p class="note body-6">${state.mode === "demo" ? "Seven commitments are initial fixtures. Added commitments are interactive simulations." : "Real PayPal sandbox approvals only. No simulated participants."}</p></div><button class="primary button-sm" data-action="join" ${state.status !== "COLLECTING" ? "disabled" : ""}>Add a commitment ↗</button></div><div class="participant-list">${
    state.commitments
      .map(
        (c) =>
          `<article class="participant"><span class="avatar title-4">${esc(
            c.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join(""),
          )}</span><div class="participant-info"><strong class="title-4">${esc(c.name)}</strong><span class="caption-5">${esc(c.origin)} · plan ${c.version}</span></div><span class="amount title-3">${money(c.amount)}</span>${pill(c.status)}</article>`,
      )
      .join("") ||
    `<div class="panel"><h3 class="title-1">The first commitment starts here.</h3><p class="note body-6">Review the conditions, then approve a sandbox authorization.</p></div>`
  }</div>`;
}
function recovery() {
  const a = state.analysis;
  return `<div class="view-heading"><div><h3 class="heading-5">Venue comparison.</h3><p class="note body-6">Alternatives must preserve the agreed time, district, access, and price.</p></div><button class="primary button-sm" data-action="analyze">${state.config.ai ? "Ask AI to review" : "Review the evidence"} ↗</button></div>${a ? `<article class="ai-summary"><div class="eyebrow caption-3">${a.provider === "fixture" ? "FIXTURE ANALYSIS · NO MODEL CALLED" : `AI ANALYSIS · ${esc(a.provider)} / ${esc(a.model)}`}</div><h4 class="title-3">${esc(a.summary)}</h4><p class="caption-4 muted">Recommendations never change a plan or authorize payment. Organizer confirmation is required.</p></article>` : ""}<div class="venues">${state.venues
    .map((v) => {
      const reasons = [];
      if (!v.available) reasons.push("Venue unavailable");
      if (v.capacity < Math.max(state.terms.minimum, state.evaluation.count))
        reasons.push(`Only ${v.capacity} workstations`);
      if (state.terms.accessible && !v.accessible)
        reasons.push("Stairs only; step free access required");
      const margin =
        state.evaluation.count *
          (state.terms.ticket - state.terms.materials - state.terms.fee) -
        v.cost;
      if (margin < state.terms.margin)
        reasons.push(
          `Margin below ${money(state.terms.margin)} at current commitments`,
        );
      return `<article class="panel venue ${v.id === state.selectedVenue ? "selected" : ""}"><div class="venue-name"><div><span class="caption-4 muted">${esc(v.quote)}</span><h3 class="title-1">${esc(v.name)}</h3></div><span class="title-1">${money(v.cost)}</span></div><p class="body-6 muted">${v.capacity} workstations · ${v.accessible ? "Step free access" : "Stairs only"}<br>${esc(v.slot || state.terms.slot)} · ${esc(v.location)}</p><div class="venue-source caption-5">${esc(v.source)}</div>${a?.observations?.find((o) => o.venueId === v.id) ? `<p class="body-6">${esc(a.observations.find((o) => o.venueId === v.id).explanation)}</p>` : ""}<div class="blockers caption-4">${reasons.map((r) => `<span>· ${esc(r)}</span>`).join("") || '<span style="color:#52743e">✓ Meets the reviewed conditions</span>'}</div><div class="app-actions"><button class="secondary button-sm" data-action="select" data-id="${v.id}" ${reasons.length || state.status !== "COLLECTING" || (v.id === state.selectedVenue && state.venueConfirmed) ? "disabled" : ""}>${v.id === state.selectedVenue && state.venueConfirmed ? "Current plan" : "Review & confirm venue"}</button></div></article>`;
    })
    .join(
      "",
    )}</div><p class="note caption-5">All venue quotes are fictional demonstration evidence. The organizer must independently confirm availability. Quotes do not reserve inventory.</p>`;
}
function evidence() {
  return `<div class="view-heading"><div><h3 class="heading-5">Decisions & payment records.</h3><p class="note body-6">An inspectable record of decisions and payment operations.</p></div><button class="secondary button-sm" data-action="export">Export evidence ↗</button></div><div class="timeline">${state.events.map((e) => `<article class="timeline-event"><span class="timeline-icon title-3" aria-hidden="true">${e.type === "warning" ? "!" : e.type === "success" ? "✓" : "↗"}</span><div><h4 class="title-3">${esc(e.title)}</h4><p class="body-6">${esc(e.detail)}</p><time class="caption-5" datetime="${esc(e.at)}">${new Date(e.at).toLocaleString()}</time></div></article>`).join("")}</div>${state.operations.length ? `<h3 class="title-3" style="margin-top:24px;margin-bottom:16px">Payment operations</h3><div class="participant-list">${state.operations.map((o) => `<article class="participant"><div class="participant-info"><strong class="title-4">${esc(o.kind)} · ${esc(o.status)}</strong><code class="caption-5">${esc(o.key)}</code></div>${o.error ? `<span class="caption-5 muted">${esc(o.error)}</span>` : ""}</article>`).join("")}</div>` : ""}`;
}
function render() {
  if (!state) return;
  document.title = state.subtitle + " — Greenlight";
  document.querySelector(".project-label .title-4").firstChild.textContent =
    state.subtitle;
  document.querySelector(".studio-plan").hidden = !!state.reviewedDraft;
  if (state.reviewedDraft) {
    $("#project-title").textContent = state.subtitle;
    $(".project-description").textContent =
      "A reviewed brief. Explicit conditions. Collection only when the plan adds up.";
    $(".studio-plan").hidden = true;
  } else {
    $("#project-title").innerHTML =
      'Saturday<br>Clay Club<span class="title-dot">.</span>';
    $(".project-description").textContent =
      "Eight people. A table full of clay. A workshop that happens when the plan adds up.";
  }
  $("#project-slot").textContent = state.terms.slot;
  $("#project-location").textContent = state.terms.location;
  $("#campaign-phase").textContent =
    "PROJECT 001 · " +
    ({
      COLLECTING: "OPEN FOR COMMITMENTS",
      LAUNCHED: "WORKSHOP CONFIRMED",
      CANCELLED: "LAUNCH CANCELLED",
    }[state.status] || state.status);
  document.querySelector(".topbar [data-action=join]").disabled =
    state.status !== "COLLECTING";
  $("#commit-count").textContent = state.evaluation.count;
  $("#view-title").textContent = {
    overview: "The launch plan",
    commitments: "Participant commitments",
    recovery: "Venue alternatives",
    evidence: "Activity & evidence",
    briefing: "Brief builder",
  }[view];
  $("#state-caption").textContent = {
    overview: "01 / CONDITIONS & COLLECTION",
    commitments: "02 / THE COMMITMENT LEDGER",
    recovery: "03 / EVIDENCE BEFORE DECISIONS",
    evidence: "04 / THE AUDIT RECORD",
    briefing: "05 / DRAFT BEFORE AGREEMENT",
  }[view];
  $("#environment").textContent =
    state.mode === "demo"
      ? "SIMULATION / NO REAL MONEY"
      : "PAYPAL SANDBOX / TEST FUNDS";
  $("#mode-badge").textContent =
    state.mode === "demo" ? "SIMULATION" : "PAYPAL SANDBOX";
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-selected", b.dataset.view === view);
    b.tabIndex = b.dataset.view === view ? 0 : -1;
  });
  $("#app").innerHTML = { overview, commitments, recovery, evidence, briefing }[
    view
  ]();
}
function modal(title, content) {
  $("#modal-content").innerHTML =
    `<div class="modal-top"><h2 class="heading-5" id="modal-title">${title}</h2><button class="quiet title-1" data-action="close" aria-label="Close dialog">×</button></div>${content}`;
  if (!$("#modal").open) $("#modal").showModal();
}
function errorInModal(message) {
  let el = $("#modal .inline-error");
  if (!el) {
    el = document.createElement("p");
    el.className = "inline-error body-6";
    $("#modal-content").append(el);
  }
  el.textContent = message;
}
function join() {
  modal(
    "Reserve a place.",
    `<p class="modal-copy body-6">${state.mode === "demo" ? "This is a simulated commitment. No payment provider is called." : `Approve a ${money(state.terms.ticket)} PayPal sandbox authorization. Use a sandbox personal account, not a real account.`}</p><label class="field title-4">Display name (visible in the ledger)<input id="buyer-name" placeholder="Your name" maxlength="60" autocomplete="nickname" required></label><div class="terms-card"><h3 class="title-4">Your reviewed commitment · plan ${state.version}</h3><ul class="caption-2"><li>${money(state.terms.ticket)} USD to the workshop organizer.</li><li>${esc(state.terms.slot)} in ${esc(state.terms.location)}.</li><li>At least ${state.terms.minimum} participants. ${state.terms.accessible ? "Step free access required." : "No mandatory step free access condition."}</li><li>An equivalent venue in the same district and time is allowed.</li><li>Collection waits for readiness checks. If launch fails, recovery may take time.</li></ul></div><label class="check-field body-6"><input id="buyer-consent" type="checkbox"><span>I agree to these conditions and the permitted venue substitution. An authorization holds funds; it is not a charge.</span></label><div id="checkout"><button class="primary button-md" data-action="commit">${state.mode === "demo" ? "Simulate authorization" : "Continue to PayPal sandbox"} ↗</button></div>`,
  );
}
async function payPalCheckout() {
  const b = {
    name: $("#buyer-name").value.trim(),
    consent: $("#buyer-consent").checked,
    campaignId: state.id,
    version: state.version,
  };
  if (!b.name) throw new Error("Enter a display name.");
  if (!b.consent) throw new Error("Accept the reviewed commitment conditions.");
  if (state.mode === "demo") {
    await api("commit", b);
    $("#modal").close();
    await load();
    notice("Simulated commitment authorized. No money moved.");
    return;
  }
  $("#checkout").innerHTML =
    '<div class="skeleton short"></div><p class="caption-2">Loading secure sandbox checkout…</p>';
  if (!window.paypal) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(state.config.paypalClientId)}&currency=USD&intent=authorize&components=buttons`;
      script.onload = resolve;
      script.onerror = () =>
        reject(
          new Error("PayPal checkout could not load. Check your connection."),
        );
      document.head.append(script);
    });
  }
  $("#checkout").innerHTML = "";
  await window.paypal
    .Buttons({
      createOrder: async () => {
        const r = await api("commit", b);
        return r.orderId;
      },
      onApprove: async (data) => {
        try {
          await api("authorize", { orderId: data.orderID });
          $("#modal").close();
          await load();
          notice("PayPal sandbox authorization confirmed. Not captured.");
        } catch (e) {
          errorInModal(e.message);
          await load();
        }
      },
      onCancel: () => {
        errorInModal(
          "Checkout cancelled. No authorization has been confirmed.",
        );
        load().catch(() => {});
      },
      onError: (e) =>
        errorInModal(
          "PayPal checkout failed. Reconcile any uncertain operation before retrying.",
        ),
    })
    .render("#checkout");
}
function connections() {
  modal(
    "Connections & controls.",
    `<div class="modal-state body-5"><span>Payment provider</span>${pill(state.mode === "demo" ? "SIMULATION" : "PAYPAL SANDBOX")}</div><div class="modal-state body-5"><span>Analysis provider</span>${pill(state.config.aiProvider || "FIXTURE")}</div><p class="note body-6">Configure credentials in your local .env file and restart the server. Provider secrets stay on the server. The organizer token is stored only in this browser tab.</p><div class="terms-card body-6">${state.mode === "demo" ? "Simulation uses fictional venues and seven seeded participants. No PayPal requests are made." : "Sandbox uses test accounts and real sandbox API requests. Production payment endpoints are disabled."}</div>${state.mode === "sandbox" ? '<label class="field title-4" style="margin-top:24px">Organizer access token<input id="organizer-token" type="password" autocomplete="off" placeholder="From your local .env file"></label><button class="primary button-sm" data-action="save-token">Unlock organizer actions</button>' : ""}<div class="app-actions"><button class="secondary button-sm" data-action="reconcile">Reconcile payments</button>${state.status === "COLLECTING" ? '<button class="secondary button-sm" data-action="cancel">Cancel launch</button>' : ""}${state.mode === "demo" ? '<button class="secondary button-sm" data-action="reset">Reset simulation</button>' : ""}</div><p class="note caption-5">This local prototype has no public user accounts. Do not expose this server publicly.</p>`,
  );
}
async function act(action, id) {
  if (action === "brief") {
    modal(
      "The reviewed workshop brief.",
      `<p class="body-3">${esc(state.brief)}</p><div class="terms-card caption-2">This is the current reviewed agreement. Use Brief builder to extract a new text brief into a separate draft.</div>`,
    );
    return;
  }
  if (action === "add-venue") {
    const rows = quoteRows();
    if (rows.length >= 8)
      throw new Error("At most eight venue quotes are supported.");
    rows.push({
      name: "",
      cost: 0,
      capacity: state.draft.terms.minimum || 1,
      accessible: false,
      location: state.draft.terms.location || "",
      slot: state.draft.terms.slot || "",
      source: "",
    });
    sessionStorage.setItem("venueQuotes", JSON.stringify(rows));
    render();
    return;
  }
  if (action === "remove-venue") {
    sessionStorage.setItem(
      "venueQuotes",
      JSON.stringify(quoteRows().filter((_, i) => i !== Number(id))),
    );
    render();
    return;
  }
  if (action === "sample-source") {
    const r = await api("brief/sample", {});
    state = { ...state, ...r };
    sessionStorage.setItem("briefSource", r.draft.source);
    sessionStorage.setItem(
      "venueQuotes",
      JSON.stringify(r.sampleVenues, null, 2),
    );
    render();
    return;
  }
  if (action === "close") {
    $("#modal").close();
    return;
  }
  if (action === "join") {
    join();
    return;
  }
  if (action === "connections") {
    connections();
    return;
  }
  if (action === "privacy") {
    modal(
      "Privacy in this prototype.",
      `<p class="body-3">Campaigns, display names, payment references, and operation records are stored in the local SQLite database. A browser session cookie associates a checkout with its browser. It is necessary for checkout ownership, not advertising.</p><p class="note body-6">Local Ollama inference stays on this computer. If you select Groq or Gemini, briefs are sent to that provider under its account data terms. PayPal sandbox receives checkout data when enabled. No card details pass through this app. To delete demo data, reset the simulation; to delete all local data, stop the server and remove .data/greenlight.sqlite and its journal files.</p>`,
    );
    return;
  }
  if (action === "terms") {
    modal(
      "A working prototype. Clear limits.",
      `<p class="body-3">This is a hackathon development build, not a production payment or escrow service. Venue quotes and workshop availability are fictional. The organizer is responsible for confirmations, fulfillment, and any later cancellation.</p><p class="note body-6">Authorization is not guaranteed collection. Group capture is not atomic. Failed settlements may require refunds, voids, or manual reconciliation. Production use requires independent security, privacy, legal, and operational review.</p>`,
    );
    return;
  }
  if (action === "save-token") {
    sessionStorage.setItem("organizerToken", $("#organizer-token").value);
    $("#modal").close();
    notice("Token stored for this browser tab.");
    return;
  }
  if (action === "export") {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = "greenlight-evidence.json";
    a.click();
    URL.revokeObjectURL(u);
    return;
  }
  if (action === "settle") {
    modal(
      "Confirm the launch.",
      `<p class="modal-copy body-6">${state.evaluation.count} ${state.mode === "demo" ? "simulated" : "PayPal sandbox"} payments will be captured individually. The plan locks during settlement. The launch is confirmed only if every required capture succeeds.</p><div class="terms-card body-6">I confirm that the selected venue is available, the materials are ready, and the reviewed plan can be delivered.</div><div class="app-actions"><button class="primary button-md" data-action="confirm-settle">Confirm & collect ${money(state.evaluation.revenue)}</button>${state.mode === "demo" ? '<button class="secondary button-sm" data-action="failure">Test a partial capture failure</button>' : ""}</div><p class="note caption-5">A failed group settlement triggers recovery attempts. Pending outcomes remain visible.</p>`,
    );
    return;
  }
  if (action === "select") {
    const v = state.venues.find((v) => v.id === id);
    modal(
      "Confirm the alternative venue.",
      `<p class="modal-copy body-6">${esc(v.name)} stays within the reviewed substitution conditions. The organizer must independently confirm the venue’s availability.</p><div class="terms-card body-6">${esc(v.source)}</div><div class="app-actions"><button class="primary button-md" data-action="confirm-select" data-id="${id}">Confirm venue availability</button></div>`,
    );
    return;
  }
  if (action === "cancel") {
    modal(
      "Cancel this launch?",
      `<p class="modal-copy body-6">The workshop will not launch. Greenlight will attempt refunds for captured payments and void remaining authorizations. Unresolved outcomes stay visible.</p><button class="primary button-md" data-action="confirm-cancel">Cancel & unwind commitments</button>`,
    );
    return;
  }
  if (action === "reset") {
    modal(
      "Start a fresh simulation?",
      `<p class="modal-copy body-6">This replaces the current simulation, including its event and operation records. Sandbox records are never reset.</p><button class="primary button-md" data-action="confirm-reset">Reset simulation</button>`,
    );
    return;
  }
  if (busy) return;
  busy = true;
  $("#workspace").classList.add("loading");
  try {
    switch (action) {
      case "extract-brief": {
        const source = $("#brief-source").value;
        sessionStorage.setItem("briefSource", source);
        notice(
          "Local AI is reading the brief. This can take up to three minutes.",
        );
        await api("brief/extract", { source });
        break;
      }
      case "apply-brief": {
        if ($("#brief-source").value !== state.draft.source)
          throw new Error(
            "The source was edited after extraction. Extract the updated text before applying.",
          );
        if (!$("#draft-consent").checked)
          throw new Error("Review and accept the draft conditions first.");
        if (
          [...document.querySelectorAll("[data-quote] input")].some(
            (input) => !input.checkValidity(),
          )
        )
          throw new Error(
            "Check venue prices and capacities. USD prices support two decimal places.",
          );
        const venues = quoteRows();
        sessionStorage.setItem("venueQuotes", JSON.stringify(venues));
        await api("brief/apply", {
          draftId: state.draft.id,
          venues,
          consent: true,
        });
        view = "overview";
        notice(
          "New agreement activated. Confirm venue availability before launch.",
        );
        break;
      }
      case "commit":
        await payPalCheckout();
        break;
      case "disrupt":
        await api("disrupt", {});
        view = "recovery";
        notice(
          "Scenario applied: venue unavailable. Payments have not been captured.",
        );
        break;
      case "analyze":
        notice(
          state.config.ai
            ? "AI is checking the evidence…"
            : "Checking fixture evidence against deterministic conditions…",
        );
        await api("analyze", {});
        break;
      case "confirm-select":
        await api("select", { venueId: id });
        $("#modal").close();
        view = "overview";
        notice("Alternative venue confirmed within the reviewed conditions.");
        break;
      case "confirm-settle":
      case "failure":
        await api("settle", { failure: action === "failure" });
        $("#modal").close();
        view = "overview";
        break;
      case "confirm-cancel":
        await api("cancel", {});
        $("#modal").close();
        break;
      case "confirm-reset":
        await api("reset", {});
        $("#modal").close();
        view = "overview";
        break;
      case "reconcile":
        await api("reconcile", {});
        $("#modal").close();
        notice(
          "Reconciliation complete. Check the evidence trail for unresolved outcomes.",
        );
        break;
    }
    await load();
  } catch (e) {
    if ($("#modal").open) errorInModal(e.message);
    else notice(e.message);
  } finally {
    busy = false;
    $("#workspace").classList.remove("loading");
  }
}
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-view]");
  if (tab) {
    view = tab.dataset.view;
    render();
    return;
  }
  const button = e.target.closest("[data-action]");
  if (button && !button.disabled)
    act(button.dataset.action, button.dataset.id).catch((e) =>
      notice(e.message),
    );
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) $("#modal").close();
});
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    }),
  { threshold: 0.15 },
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
const words = [...document.querySelectorAll(".tagline span")];
const wordObserver = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const i = words.indexOf(e.target);
        setTimeout(() => e.target.classList.add("visible"), i * 90);
        wordObserver.unobserve(e.target);
      }
    }),
  { threshold: 1, rootMargin: "0px 0px -12% 0px" },
);
words.forEach((el) => wordObserver.observe(el));
load().catch((e) => {
  $("#app").innerHTML =
    `<div class="panel"><h3 class="heading-5">The launch room could not load.</h3><p class="note body-6">${esc(e.message)}. Check that the local server is running, then reload this page.</p></div>`;
});

document.querySelector(".workspace-nav").addEventListener("keydown", (e) => {
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ].includes(e.key)
  )
    return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll("[data-view]")];
  let i = tabs.findIndex((b) => b.dataset.view === view);
  i =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? tabs.length - 1
        : (i +
            (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) +
            tabs.length) %
          tabs.length;
  view = tabs[i].dataset.view;
  render();
  tabs[i].focus();
});

document.addEventListener("input", (e) => {
  if (e.target.id === "brief-source")
    sessionStorage.setItem("briefSource", e.target.value);
  if (e.target.id === "venue-quotes")
    sessionStorage.setItem("venueQuotes", e.target.value);
});
function quoteDefaults() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("venueQuotes") || "null");
    if (Array.isArray(saved)) return saved;
  } catch {}
  return state.venues.map((v) => ({ ...v, slot: v.slot || state.terms.slot }));
}
function quoteRows() {
  return [...document.querySelectorAll("[data-quote]")].map((row) => {
    const get = (k) => row.querySelector(`[data-field="${k}"]`);
    return {
      name: get("name").value,
      cost: Math.round(Number(get("cost").value) * 100),
      capacity: Number(get("capacity").value),
      accessible: get("accessible").checked,
      location: get("location").value,
      slot: get("slot").value,
      source: get("source").value,
    };
  });
}
function briefing() {
  const d = state.draft,
    source = sessionStorage.getItem("briefSource") || d?.source || state.brief;
  const labels = {
    title: "Workshop title",
    ticket: "Ticket price",
    minimum: "Minimum participants",
    maximum: "Maximum participants",
    materials: "Materials per person",
    fee: "Fee allowance per person",
    margin: "Minimum organizer margin",
    location: "District",
    slot: "Day and time",
    accessible: "Step free access required",
  };
  return `<div class="view-heading"><div><h3 class="heading-5">From a brief to an agreement.</h3><p class="note body-6">AI extracts a proposal. You check the source and decide what becomes binding.</p></div><button class="secondary button-sm" data-action="sample-source">Load labelled example</button></div><div class="brief-grid"><article class="panel"><label class="field title-4">Workshop brief<textarea id="brief-source" rows="12" maxlength="16000" placeholder="Describe the workshop, ticket price, participant limits, costs, location, time, and access requirements.">${esc(source)}</textarea></label><label class="file-control caption-2">Import a text brief<input id="brief-file" type="file" accept=".txt,.md,text/plain,text/markdown"></label><p class="note caption-5">Text or Markdown, up to 16,000 characters. ${state.config.aiProvider === "ollama" ? "Local AI runs on this computer. No external API key or billed provider." : "Chosen AI provider: " + esc(state.config.aiProvider) + ". Review its data terms before sharing sensitive documents."}</p><div class="app-actions"><button class="primary button-sm" data-action="extract-brief" ${!state.config.ai ? "disabled" : ""}>Extract conditions with AI</button></div></article><article class="panel"><h3 class="title-1">Review the extracted conditions</h3>${d ? `<p class="note caption-5">${esc(d.provider)} / ${esc(d.model || "example only")} · ${d.complete ? "All required fields present" : "Review needed"}</p><dl class="draft-facts">${d.facts.map((f) => `<div><dt class="caption-3">${esc(labels[f.field])}</dt><dd class="title-3">${f.value === null ? "Not specified" : typeof f.value === "number" && ["ticket", "materials", "fee", "margin"].includes(f.field) ? money(f.value) : esc(String(f.value))}</dd><dd class="caption-5 muted">${esc(f.evidence || "No supporting source")}</dd></div>`).join("")}</dl>${d.issues.length || d.questions.length ? `<div class="inline-error body-6">${[...d.issues, ...d.questions].map((q) => `<p>${esc(q)}</p>`).join("")}<p>Clarify the source text and extract again. No terms have changed.</p></div>` : ""}` : '<p class="note body-6">Extract a brief or load the labelled example. Every proposed value will show its supporting source text here. Extraction does not alter the current campaign.</p>'}</article></div>${
    d
      ? `<article class="panel quotes-panel"><h3 class="title-1">Add the venue evidence</h3><p class="note body-6">Enter the quotes you actually reviewed. A quote is not a reservation. Confirm availability separately after applying the plan.</p><div class="quote-forms">${quoteDefaults()
          .map(
            (v, i) =>
              `<fieldset data-quote="${i}"><legend class="title-4">Venue ${i + 1}</legend><button class="quiet caption-4 remove-quote" data-action="remove-venue" data-id="${i}">Remove quote</button><label class="field caption-3">Venue name<input data-field="name" value="${esc(v.name)}" maxlength="100"></label><label class="field caption-3">Quote in USD<input data-field="cost" type="number" min="0" step="0.01" value="${v.cost / 100}"></label><label class="field caption-3">Workstations<input data-field="capacity" type="number" min="1" max="100" value="${v.capacity}"></label><label class="field caption-3">District<input data-field="location" value="${esc(v.location)}" maxlength="160"></label><label class="field caption-3">Day and time<input data-field="slot" value="${esc(v.slot)}" maxlength="160"></label><label class="check-field caption-2"><input type="checkbox" data-field="accessible" ${v.accessible ? "checked" : ""}><span>Step free access confirmed in quote</span></label><label class="field caption-3 quote-source">Quote evidence<textarea data-field="source" rows="3" maxlength="2000">${esc(v.source)}</textarea></label></fieldset>`,
          )
          .join(
            "",
          )}</div><div class="app-actions"><button class="secondary button-sm" data-action="add-venue">Add venue quote</button></div><label class="check-field body-6"><input type="checkbox" id="draft-consent"><span>I reviewed every extracted value against the source and checked these venue quotes. This starts a new agreement; it does not change existing buyer consent.</span></label><div class="app-actions"><button class="primary button-sm" data-action="apply-brief" ${!d.complete ? "disabled" : ""}>Apply reviewed agreement</button></div><p class="note caption-5">Existing commitments must first be cancelled and resolved through Connections. The previous campaign is archived, not overwritten.</p></article>`
      : ""
  }`;
}
document.addEventListener("change", async (e) => {
  if (e.target.id !== "brief-file") return;
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 64000 || !/\.(txt|md)$/i.test(file.name))
      throw new Error("Use a .txt or .md file up to 64 KB.");
    const text = await file.text();
    if (text.length > 16000)
      throw new Error("Briefs are limited to 16,000 characters.");
    $("#brief-source").value = text;
    sessionStorage.setItem("briefSource", text);
    notice("Text imported locally. Extract it to propose conditions.");
  } catch (err) {
    notice(err.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.closest("[data-quote]"))
    sessionStorage.setItem("venueQuotes", JSON.stringify(quoteRows()));
});
