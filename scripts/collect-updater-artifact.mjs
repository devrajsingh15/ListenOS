#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) {
      continue;
    }
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const bundleDirArg = args["bundle-dir"];
  const extension = args.extension?.replace(/^\./, "");
  const target = args.target;
  const outputDirArg = args["output-dir"];

  if (!bundleDirArg || !extension || !target || !outputDirArg) {
    throw new Error(
      "Usage: node scripts/collect-updater-artifact.mjs --bundle-dir <dir> --extension <ext> --target <tauri-target-key> --output-dir <dir>",
    );
  }

  const bundleDir = path.resolve(root, bundleDirArg);
  const outputDir = path.resolve(root, outputDirArg);

  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (candidates.length === 0) {
    throw new Error(`No .${extension} files found in ${bundleDirArg}`);
  }

  const artifactName = candidates[0];
  const signatureName = `${artifactName}.sig`;
  const artifactPath = path.join(bundleDir, artifactName);
  const signaturePath = path.join(bundleDir, signatureName);

  await fs.access(signaturePath).catch(() => {
    throw new Error(
      `Missing signature file for updater artifact: ${path.relative(root, signaturePath)}. Ensure TAURI signing env vars are set.`,
    );
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.copyFile(artifactPath, path.join(outputDir, artifactName));
  await fs.copyFile(signaturePath, path.join(outputDir, signatureName));

  const metadata = {
    target,
    artifact: artifactName,
    signature: signatureName,
  };

  await fs.writeFile(path.join(outputDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`Collected updater artifact for ${target}: ${artifactName}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
