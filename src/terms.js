export const defaultTerms = Object.freeze({
  ticket: 4000,
  minimum: 8,
  maximum: 10,
  materials: 1000,
  fee: 200,
  margin: 8000,
  location: "Arts District",
  slot: "Saturday, 2–4pm",
  accessible: true,
  currency: "USD",
});
export function terms(s) {
  return { ...defaultTerms, ...s.terms };
}
export function validateTerms(t) {
  const issues = [];
  for (const k of [
    "ticket",
    "minimum",
    "maximum",
    "materials",
    "fee",
    "margin",
  ])
    if (!Number.isSafeInteger(t[k]) || t[k] < 0 || t[k] > 10000000)
      issues.push(`${k} must be a nonnegative integer within supported limits`);
  if (t.ticket < 100) issues.push("Tickets must be at least $1");
  if (t.minimum < 1 || t.maximum < t.minimum || t.maximum > 100)
    issues.push(
      "Attendance must be between 1 and 100; maximum cannot be below minimum",
    );
  if (t.currency !== "USD") issues.push("This prototype supports USD only");
  if (
    typeof t.location !== "string" ||
    !t.location.trim() ||
    t.location.length > 160
  )
    issues.push("A location district is required");
  if (typeof t.slot !== "string" || !t.slot.trim() || t.slot.length > 160)
    issues.push("A specific workshop time is required");
  if (typeof t.accessible !== "boolean")
    issues.push("Accessibility requirement must be explicit");
  return issues;
}
export const amountText = (cents) => (cents / 100).toFixed(2);
