#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const packageJsonPath = path.join(root, "package.json");
const endpointArg = process.argv[2]?.trim();
const endpoint = endpointArg || process.env.ELECTRON_UPDATER_URL?.trim();

if (!endpoint) {
  console.error("Missing updater endpoint. Usage: node scripts/set-updater-endpoint.mjs <https-url>");
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(endpoint);
} catch {
  console.error(`Invalid updater endpoint URL: ${endpoint}`);
  process.exit(1);
}

if (parsedUrl.protocol !== "https:") {
  console.error(`Updater endpoint must use https: ${endpoint}`);
  process.exit(1);
}

async function run() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  if (!Array.isArray(packageJson.build?.publish) || !packageJson.build.publish[0]) {
    throw new Error("package.json does not contain build.publish[0]");
  }

  const updaterUrl = endpoint.replace(/\/$/, "");
  packageJson.build.publish[0].url = updaterUrl;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  console.log(`Set updater endpoint to ${endpoint}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
