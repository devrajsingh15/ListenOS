#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const packageJsonPath = path.join(root, "package.json");
const tauriConfigPath = path.join(root, "backend", "tauri.conf.json");
const cargoTomlPath = path.join(root, "backend", "Cargo.toml");

const semverRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function updateCargoVersion(content, version) {
  const lines = content.split(/\r?\n/);
  let inPackageSection = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "[package]") {
      inPackageSection = true;
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]") && line !== "[package]") {
      inPackageSection = false;
    }
    if (inPackageSection && line.startsWith("version = ")) {
      lines[i] = `version = "${version}"`;
      break;
    }
  }

  return lines.join("\n");
}

async function run() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const version = packageJson.version;

  if (!semverRegex.test(version)) {
    throw new Error(`package.json version is not semver: ${version}`);
  }

  const tauriConfig = JSON.parse(await fs.readFile(tauriConfigPath, "utf8"));
  if (tauriConfig.version !== version) {
    tauriConfig.version = version;
    await fs.writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8");
    console.log(`Synced backend/tauri.conf.json -> ${version}`);
  } else {
    console.log("backend/tauri.conf.json already in sync");
  }

  const cargoToml = await fs.readFile(cargoTomlPath, "utf8");
  const updatedCargoToml = updateCargoVersion(cargoToml, version);
  if (updatedCargoToml !== cargoToml) {
    await fs.writeFile(cargoTomlPath, updatedCargoToml, "utf8");
    console.log(`Synced backend/Cargo.toml -> ${version}`);
  } else {
    console.log("backend/Cargo.toml already in sync");
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
