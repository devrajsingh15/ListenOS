#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const tauriConfigPath = path.join(root, "backend", "tauri.conf.json");
const cargoTomlPath = path.join(root, "backend", "Cargo.toml");

const semverRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const targetVersion = process.argv[2]?.trim();

if (!targetVersion) {
  console.error("Usage: node scripts/bump-version.mjs <version>");
  process.exit(1);
}

if (!semverRegex.test(targetVersion)) {
  console.error(`Invalid semver version: ${targetVersion}`);
  process.exit(1);
}

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
  packageJson.version = targetVersion;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  console.log(`Updated package.json -> ${targetVersion}`);

  const packageLock = JSON.parse(await fs.readFile(packageLockPath, "utf8"));
  packageLock.version = targetVersion;
  if (packageLock.packages && packageLock.packages[""]) {
    packageLock.packages[""].version = targetVersion;
  }
  await fs.writeFile(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
  console.log(`Updated package-lock.json -> ${targetVersion}`);

  const tauriConfig = JSON.parse(await fs.readFile(tauriConfigPath, "utf8"));
  tauriConfig.version = targetVersion;
  await fs.writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8");
  console.log(`Updated backend/tauri.conf.json -> ${targetVersion}`);

  const cargoToml = await fs.readFile(cargoTomlPath, "utf8");
  const updatedCargoToml = updateCargoVersion(cargoToml, targetVersion);
  await fs.writeFile(cargoTomlPath, updatedCargoToml, "utf8");
  console.log(`Updated backend/Cargo.toml -> ${targetVersion}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
