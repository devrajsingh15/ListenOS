import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import rspack from "@rspack/core";
import createConfig from "../rspack.config.mjs";

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, "out");
const port = Number(process.env.PORT || 3000);
const reloadClients = new Set();
let rendererReady = false;
let stopping = false;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://localhost:${port}`).pathname);
  const relativePath = pathname.replace(/^\/+/, "");
  const requested = path.resolve(outputRoot, relativePath || "index.html");
  const outputPrefix = `${path.resolve(outputRoot)}${path.sep}`;

  if (requested !== path.resolve(outputRoot) && !requested.startsWith(outputPrefix)) {
    return null;
  }

  if (path.extname(requested)) return requested;
  return path.join(outputRoot, "index.html");
}

const server = http.createServer((request, response) => {
  if (request.url === "/__rspack_events") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });
    response.write("event: connected\ndata: ready\n\n");
    reloadClients.add(response);
    request.on("close", () => reloadClients.delete(response));
    return;
  }

  if (!rendererReady) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Rspack is compiling the ListenOS renderer...");
    return;
  }

  const filePath = resolveRequestPath(request.url || "/");
  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    const fallbackPath = path.join(outputRoot, "index.html");
    const servedPath = statError || !stat.isFile() ? fallbackPath : filePath;

    fs.readFile(servedPath, (readError, content) => {
      if (readError) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[path.extname(servedPath).toLowerCase()] || "application/octet-stream",
      });
      response.end(content);
    });
  });
});

const compiler = rspack(createConfig("development"));
const watcher = compiler.watch({}, (error, stats) => {
  if (error) {
    console.error(error);
    return;
  }

  const output = stats?.toString({ colors: true, chunks: false, modules: false });
  if (output) console.log(output);
  if (stats?.hasErrors()) return;

  const wasReady = rendererReady;
  rendererReady = true;
  if (wasReady) {
    for (const client of reloadClients) client.write("event: reload\ndata: changed\n\n");
  }
});

server.listen(port, "localhost", () => {
  console.log(`ListenOS renderer: http://localhost:${port}`);
});

function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const client of reloadClients) client.end();
  server.close();
  watcher.close(() => compiler.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
