#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const semverRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

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

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function buildAssetUrl(baseUrl, filename) {
  const escaped = encodeURIComponent(filename).replace(/%2F/g, "/");
  return `${baseUrl}/${escaped}`;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const artifactsDirArg = args["artifacts-dir"];
  const version = args.version?.trim();
  const baseUrl = args["base-url"]?.replace(/\/+$/, "");
  const outputArg = args.output;
  const notes = args.notes?.trim() || null;

  if (!artifactsDirArg || !version || !baseUrl || !outputArg) {
    throw new Error(
      "Usage: node scripts/build-updater-manifest.mjs --artifacts-dir <dir> --version <semver> --base-url <https-url> --output <file> [--notes \"...\"]",
    );
  }

  if (!semverRegex.test(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:") {
      throw new Error(`base-url must use https: ${baseUrl}`);
    }
  } catch {
    throw new Error(`Invalid base-url: ${baseUrl}`);
  }

  const artifactsDir = path.resolve(root, artifactsDirArg);
  const outputPath = path.resolve(root, outputArg);

  const allFiles = await walkFiles(artifactsDir);
  const metadataPaths = allFiles.filter((file) => path.basename(file) === "metadata.json");
  if (metadataPaths.length === 0) {
    throw new Error(`No metadata.json files found under ${artifactsDirArg}`);
  }

  const platforms = {};

  for (const metadataPath of metadataPaths) {
    const metadataDir = path.dirname(metadataPath);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    const target = metadata.target;
    const artifact = metadata.artifact;
    const signatureFile = metadata.signature;

    if (!target || !artifact || !signatureFile) {
      throw new Error(`Invalid metadata file: ${metadataPath}`);
    }
    if (platforms[target]) {
      throw new Error(`Duplicate platform target in metadata: ${target}`);
    }

    const artifactPath = path.join(metadataDir, artifact);
    const signaturePath = path.join(metadataDir, signatureFile);
    await fs.access(artifactPath).catch(() => {
      throw new Error(`Missing updater artifact file: ${artifactPath}`);
    });
    const signature = (await fs.readFile(signaturePath, "utf8")).trim();
    if (!signature) {
      throw new Error(`Empty signature file: ${signaturePath}`);
    }

    platforms[target] = {
      signature,
      url: buildAssetUrl(baseUrl, artifact),
    };
  }

  const manifest = {
    version,
    notes: notes || `Release ${version}`,
    pub_date: new Date().toISOString(),
    platforms,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote updater manifest: ${path.relative(root, outputPath)}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
