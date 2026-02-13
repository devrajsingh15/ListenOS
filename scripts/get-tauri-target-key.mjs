#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function readRustHostTriple() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const hostLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("host:"));

  if (!hostLine) {
    throw new Error("Failed to detect rustc host triple");
  }

  return hostLine.replace(/^host:\s*/, "").trim();
}

function toUpdaterTarget(hostTriple) {
  const map = {
    "x86_64-pc-windows-msvc": "windows-x86_64",
    "i686-pc-windows-msvc": "windows-i686",
    "aarch64-pc-windows-msvc": "windows-aarch64",
    "x86_64-apple-darwin": "darwin-x86_64",
    "aarch64-apple-darwin": "darwin-aarch64",
    "x86_64-unknown-linux-gnu": "linux-x86_64",
    "aarch64-unknown-linux-gnu": "linux-aarch64",
    "armv7-unknown-linux-gnueabihf": "linux-armv7",
  };

  const target = map[hostTriple];
  if (!target) {
    throw new Error(`Unsupported rust host triple for updater target: ${hostTriple}`);
  }

  return target;
}

try {
  const hostTriple = readRustHostTriple();
  const updaterTarget = toUpdaterTarget(hostTriple);
  process.stdout.write(`${updaterTarget}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
