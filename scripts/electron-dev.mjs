import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronCli = require.resolve("electron/cli.js");
const children = new Set();
let stopping = false;

function start(command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping && code !== 0) shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 100).unref();
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function waitForRenderer(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Rspack is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start(process.execPath, ["scripts/rspack-dev.mjs"]);
const backendBuild = start("cargo", ["build", "--manifest-path", "backend/Cargo.toml"]);
await Promise.all([
  waitForRenderer("http://localhost:3000"),
  waitForExit(backendBuild, "Rust backend build"),
]);
const electron = start(process.execPath, [electronCli, "."], {
  ...process.env,
  ELECTRON_RENDERER_URL: "http://localhost:3000",
});
electron.on("exit", (code) => shutdown(code ?? 0));
