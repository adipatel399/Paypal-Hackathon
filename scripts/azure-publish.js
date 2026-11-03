import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
const az = (args) =>
  execFileSync("az", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const t = JSON.parse(readFileSync(".data/azure-target.json", "utf8"));
const plan = JSON.parse(
  az([
    "appservice",
    "plan",
    "show",
    "--name",
    t.appName + "-free",
    "-g",
    t.resourceGroup,
    "--query",
    "sku",
    "-o",
    "json",
  ]),
);
if (plan.name !== "F1" || plan.tier !== "Free")
  throw new Error(
    "Deployment requires an existing F1 Free plan. No paid SKU is allowed.",
  );
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
if (policy.subscriptionPolicies?.spendingLimit !== "On")
  throw new Error("Spending protection must remain ON.");
if (
  !process.env.GROQ_API_KEY ||
  process.env.GROQ_FREE_TIER_CONFIRMED !== "true"
)
  throw new Error(
    "A verified Groq Free-plan key is required before publishing.",
  );
const account = JSON.parse(
  az([
    "cosmosdb",
    "show",
    "--name",
    t.databaseAccountName,
    "-g",
    t.resourceGroup,
    "--query",
    "{free:enableFreeTier,state:provisioningState,capacity:capacity.totalThroughputLimit}",
    "-o",
    "json",
  ]),
);
if (!account.free || account.state !== "Succeeded" || account.capacity > 1000)
  throw new Error(
    "The Cosmos account must be provisioned with its free tier and throughput cap.",
  );
const settings = JSON.parse(
  az([
    "webapp",
    "config",
    "appsettings",
    "list",
    "--name",
    t.appName,
    "-g",
    t.resourceGroup,
    "-o",
    "json",
  ]),
);
const properties = Object.fromEntries(settings.map((s) => [s.name, s.value]));
properties.GROQ_API_KEY = process.env.GROQ_API_KEY;
properties.GROQ_FREE_TIER_CONFIRMED = "true";
properties.AI_PROVIDER = "groq";
properties.GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
if (
  !properties.PUBLIC_ORIGIN ||
  !properties.COSMOS_ENDPOINT ||
  !properties.COSMOS_KEY ||
  !properties.SESSION_SECRET
)
  throw new Error("Hosted configuration is incomplete.");
const filename = ".data/azure-settings-private.json";
try {
  writeFileSync(filename, JSON.stringify({ properties }), { mode: 0o600 });
  az([
    "rest",
    "--method",
    "put",
    "--url",
    `https://management.azure.com/subscriptions/${subscription.id}/resourceGroups/${t.resourceGroup}/providers/Microsoft.Web/sites/${t.appName}/config/appsettings?api-version=2023-12-01`,
    "--body",
    "@" + filename,
    "-o",
    "none",
  ]);
} finally {
  try {
    unlinkSync(filename);
  } catch {}
}
console.log("Private cloud settings updated without displaying secret values.");
execFileSync("python3", [
  "-c",
  `import os,zipfile
with zipfile.ZipFile('.data/greenlight-site.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['src','public']:
  for root,dirs,files in os.walk(folder):
   for name in files:
    path=os.path.join(root,name);z.write(path,path)
 for path in ['package.json','package-lock.json','LICENSE']:
  z.write(path,path)
`,
]);
const result = az([
  "webapp",
  "deploy",
  "--name",
  t.appName,
  "-g",
  t.resourceGroup,
  "--src-path",
  ".data/greenlight-site.zip",
  "--type",
  "zip",
  "--clean",
  "true",
  "--async",
  "true",
  "-o",
  "json",
]);
writeFileSync(".data/azure-publish-result.json", result, { mode: 0o600 });
console.log(
  JSON.stringify({
    origin: properties.PUBLIC_ORIGIN,
    status:
      "Deployment submitted; verify build and public health before declaring success.",
  }),
);
