import { randomUUID } from "node:crypto";
import { terms, defaultTerms } from "./terms.js";
export const venues = [
  {
    id: "kiln",
    name: "The Kiln Studio",
    location: "Arts District",
    cost: 12000,
    capacity: 8,
    accessible: true,
    available: true,
    source:
      "Quote K-102 · capacity 8 · step free access · $120 · Saturday 2–4pm",
    quote: "K-102",
  },
  {
    id: "loft",
    name: "The Little Loft",
    location: "Arts District",
    cost: 8000,
    capacity: 6,
    accessible: false,
    available: true,
    source: "Quote L-084 · capacity 6 · stairs only · $80 · Saturday 2–4pm",
    quote: "L-084",
  },
  {
    id: "clay",
    name: "Clay House",
    location: "Arts District",
    cost: 14000,
    capacity: 10,
    accessible: true,
    available: true,
    source:
      "Quote C-208 · capacity 10 · step free access · $140 · Saturday 2–4pm",
    quote: "C-208",
  },
];
export const brief =
  "A hand-building ceramics workshop on Saturday, 2–4pm, in the Arts District. At least 8 paying participants, at most 10. Tickets are $40 USD. The venue must have step free access and enough workstations for every participant. Materials cost $10 per person. Reserve $2 per ticket for fees. Keep at least $80 organizer margin. An alternative venue is allowed only within the same district, time, accessibility and ticket price.";
export function seed(mode = "demo") {
  const now = new Date().toISOString();
  const names = [
    "Alex Morgan",
    "Priya Shah",
    "Sam Rivera",
    "Jordan Lee",
    "Noor Ahmed",
    "Taylor Chen",
    "Jamie Park",
  ];
  return {
    id: randomUUID(),
    mode,
    title: "A little clay. A little possibility.",
    subtitle: "Saturday Clay Club",
    status: "COLLECTING",
    version: 1,
    selectedVenue: "kiln",
    confirmed: true,
    venueConfirmed: true,
    deadline: Date.now() + 86400000,
    venues: structuredClone(venues),
    commitments:
      mode === "demo"
        ? names.map((name, i) => ({
            id: randomUUID(),
            name,
            amount: 4000,
            status: "AUTHORIZED",
            version: 1,
            authorizationId: `SIM-AUTH-${i + 1}`,
            origin: "simulation fixture",
            createdAt: now,
            substitutions: true,
          }))
        : [],
    events: [
      {
        id: randomUUID(),
        at: now,
        type: "created",
        title: "The possibility is open",
        detail:
          mode === "demo"
            ? "Seven simulated commitments seeded. No PayPal API has been called."
            : "PayPal sandbox campaign created. No seeded payments.",
      },
    ],
    operations: [],
    analysis: null,
    brief,
    terms: { ...defaultTerms },
    draft: null,
  };
}
export function evaluate(
  s,
  venue = s.venues.find((v) => v.id === s.selectedVenue),
) {
  const t = terms(s);
  const active = s.commitments.filter((c) =>
    ["AUTHORIZED", "CAPTURED"].includes(c.status),
  );
  const count = active.length;
  const revenue = count * t.ticket;
  const costs = (venue?.cost || 0) + count * (t.materials + t.fee);
  const reasons = [];
  if (!venue?.available) reasons.push("Venue is unavailable");
  if (t.accessible && !venue?.accessible)
    reasons.push("Step-free access is required");
  if ((venue?.capacity || 0) < Math.max(t.minimum, count))
    reasons.push(
      `Needs ${Math.max(t.minimum, count)} workstations; this venue has ${venue?.capacity || 0}`,
    );
  if (venue?.location !== t.location)
    reasons.push(`Venue must remain in ${t.location}`);
  if (venue?.slot && venue.slot !== t.slot)
    reasons.push("Venue time differs from the reviewed workshop time");
  if (count < t.minimum)
    reasons.push(
      `${t.minimum - count} more ${t.minimum - count === 1 ? "commitment" : "commitments"} needed`,
    );
  if (count > t.maximum)
    reasons.push(`Workshop capacity is limited to ${t.maximum}`);
  if (revenue - costs < t.margin)
    reasons.push(`Organizer margin must be at least $${t.margin / 100}`);
  if (
    active.some(
      (c) =>
        c.version !== s.version || c.amount !== t.ticket || !c.substitutions,
    )
  )
    reasons.push("Buyer consent does not match the reviewed plan");
  if (!s.confirmed || !s.venueConfirmed)
    reasons.push("Organizer must confirm venue availability and readiness");
  if (Date.now() > s.deadline) reasons.push("Commitment window has expired");
  if (
    s.commitments.some((c) =>
      ["UNKNOWN", "CAPTURE_PENDING", "REFUND_PENDING", "VOID_PENDING"].includes(
        c.status,
      ),
    )
  )
    reasons.push("Payment operations require reconciliation");
  return {
    ready: reasons.length === 0,
    reasons,
    count,
    revenue,
    costs,
    margin: revenue - costs,
    venueCost: venue?.cost || 0,
    materials: count * t.materials,
    feeReserve: count * t.fee,
  };
}
export function event(s, type, title, detail) {
  s.events.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    type,
    title,
    detail,
  });
}
export function assertEditable(s) {
  if (s.status !== "COLLECTING")
    throw Object.assign(
      new Error(
        "This campaign is locked. Start a new simulation to explore again.",
      ),
      { status: 409 },
    );
}
export function publicState(s) {
  const { _storeEtag, ...safe } = s;
  return {
    ...safe,
    terms: terms(s),
    operations: s.operations.map(({ result, ...op }) => op),
    commitments: s.commitments.map(({ owner, ...c }) => c),
    evaluation: evaluate(s),
  };
}
