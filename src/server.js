import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JsonBoardStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const publicDir = join(rootDir, "public");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function setApiHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
}

function getConfig(overrides = {}) {
  return {
    appName: overrides.appName || process.env.APP_NAME || "Release Board Lab",
    environment: overrides.environment || process.env.ENVIRONMENT || "local",
    release: overrides.release || process.env.RELEASE || "0.1.0",
    port: Number(overrides.port || process.env.PORT || 3000),
    host: overrides.host || process.env.HOST || "0.0.0.0",
    dataFile: resolve(overrides.dataFile || process.env.DATA_FILE || join(rootDir, "data", "practice-board.json"))
  };
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  setApiHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? "Unexpected server error." : error.message;
  sendJson(response, statusCode, { error: message });
}

function boardSnapshot(store, config) {
  return {
    config: {
      appName: config.appName,
      environment: config.environment,
      release: config.release,
      port: config.port,
      dataFile: config.dataFile
    },
    counts: store.getCounts(),
    items: store.listItems()
  };
}

async function serveStatic(requestPath, response) {
  const requested = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const fullPath = resolve(publicDir, requested);

  if (!fullPath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(fullPath);
    const extension = extname(fullPath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300"
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    throw error;
  }
}

async function handleApiRequest(request, response, store, config) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname;

  if (request.method === "OPTIONS") {
    setApiHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/api/info") {
    sendJson(response, 200, boardSnapshot(store, config));
    return;
  }

  if (request.method === "GET" && pathname === "/api/items") {
    sendJson(response, 200, { items: store.listItems() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/items") {
    const body = await readRequestBody(request);
    const created = await store.addItem(body);
    sendJson(response, 201, { item: created });
    return;
  }

  if (request.method === "PATCH" && pathname.startsWith("/api/items/")) {
    const id = pathname.split("/").pop();
    const body = await readRequestBody(request);
    const updated = await store.updateItem(id, body);
    sendJson(response, 200, { item: updated });
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/items/")) {
    const id = pathname.split("/").pop();
    const removed = await store.deleteItem(id);
    sendJson(response, 200, { item: removed });
    return;
  }

  if (request.method === "GET" && pathname === "/healthz") {
    sendJson(response, 200, {
      status: "ok",
      release: config.release,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (request.method === "GET" && pathname === "/readyz") {
    const ready = store.ready;
    sendJson(response, ready ? 200 : 503, {
      status: ready ? "ready" : "starting",
      itemCount: store.listItems().length
    });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

export async function createAppServer(overrides = {}) {
  const config = getConfig(overrides);
  const store = new JsonBoardStore(config.dataFile);
  await store.init();

  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname.startsWith("/api/") || pathname === "/healthz" || pathname === "/readyz") {
        await handleApiRequest(request, response, store, config);
        return;
      }

      await serveStatic(pathname, response);
    } catch (error) {
      sendError(response, error);
    }
  });

  return { server, store, config };
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };

    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function start() {
  const { server, config } = await createAppServer();
  try {
    await listen(server, config.port, config.host);
    console.log(`${config.appName} running on http://${config.host}:${config.port}`);
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${config.port} is already in use. Stop the other process or run with PORT=<another-port> npm start.`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
