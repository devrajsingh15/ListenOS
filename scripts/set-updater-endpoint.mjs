#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const tauriConfigPath = path.join(root, "backend", "tauri.conf.json");
const endpointArg = process.argv[2]?.trim();
const endpoint = endpointArg || process.env.TAURI_UPDATER_ENDPOINT?.trim();

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
  const tauriConfig = JSON.parse(await fs.readFile(tauriConfigPath, "utf8"));
  if (!tauriConfig.plugins || !tauriConfig.plugins.updater) {
    throw new Error("backend/tauri.conf.json does not contain plugins.updater");
  }

  tauriConfig.plugins.updater.endpoints = [endpoint];
  await fs.writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8");
  console.log(`Set updater endpoint to ${endpoint}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
