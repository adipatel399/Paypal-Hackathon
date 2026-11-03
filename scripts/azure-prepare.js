import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const az = (args) =>
  execFileSync("az", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const subscription = JSON.parse(az(["account", "show", "-o", "json"]));
const policy = JSON.parse(
  az([
    "rest",
    "--method",
    "get",
    "--url",
    `https://management.azure.com/subscriptions/${subscription.id}?api-version=2022-12-01`,
    "-o",
    "json",
  ]),
);
if (
  policy.state !== "Enabled" ||
  policy.subscriptionPolicies?.spendingLimit !== "On"
)
  throw new Error(
    "An enabled subscription with spending protection ON is required. No resources were created.",
  );
mkdirSync(".data", { recursive: true });
let target;
if (existsSync(".data/azure-target.json"))
  target = JSON.parse(readFileSync(".data/azure-target.json", "utf8"));
else {
  const suffix = randomBytes(3).toString("hex");
  target = {
    resourceGroup: "greenlight-paypal-hackathon",
    appName: `greenlight-ppai-${suffix}`,
    databaseAccountName: `greenlight-ppai-${suffix}`,
    sessionSecret: randomBytes(32).toString("hex"),
    location: "eastasia",
  };
  writeFileSync(".data/azure-target.json", JSON.stringify(target), {
    mode: 0o600,
  });
}
console.log(
  "Spending protection verified. Preparing F1 compute and an opted-in Cosmos free-tier account.",
);
if (
  az([
    "group",
    "exists",
    "--name",
    target.resourceGroup,
    "-o",
    "tsv",
  ]).trim() !== "true"
)
  az([
    "group",
    "create",
    "--name",
    target.resourceGroup,
    "--location",
    target.location,
    "-o",
    "none",
  ]);
target.databaseLocation ||= target.location;
const parameters = {
  parameters: Object.fromEntries(
    [
      "appName",
      "databaseAccountName",
      "sessionSecret",
      "location",
      "databaseLocation",
    ].map((key) => [key, { value: target[key] }]),
  ),
};
writeFileSync(".data/azure-parameters.json", JSON.stringify(parameters), {
  mode: 0o600,
});
az([
  "deployment",
  "group",
  "validate",
  "--name",
  "greenlight-free",
  "--resource-group",
  target.resourceGroup,
  "--template-file",
  "infra/azure-free.json",
  "--parameters",
  "@.data/azure-parameters.json",
  "-o",
  "none",
]);
console.log(
  "Template validated. No paid SKU or unbounded throughput is permitted by this template.",
);
const output = JSON.parse(
  az([
    "deployment",
    "group",
    "create",
    "--name",
    "greenlight-free",
    "--resource-group",
    target.resourceGroup,
    "--template-file",
    "infra/azure-free.json",
    "--parameters",
    "@.data/azure-parameters.json",
    "--query",
    "properties.outputs",
    "-o",
    "json",
  ]),
);
target.origin = output.origin.value;
writeFileSync(".data/azure-target.json", JSON.stringify(target), {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    origin: target.origin,
    webSku: output.webSku.value,
    databaseFreeTier: output.databaseFreeTier.value,
  }),
);
