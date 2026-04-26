import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";

import { createAppServer } from "../src/server.js";

async function startTestServer() {
  const tempDir = await mkdtemp(join(tmpdir(), "release-board-lab-"));
  const dataFile = join(tempDir, "board.json");
  const { server } = await createAppServer({
    appName: "Test Board",
    environment: "test",
    release: "9.9.9",
    port: 0,
    dataFile
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    dataFile,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

test("serves board metadata and health checks", async () => {
  const app = await startTestServer();

  try {
    const infoResponse = await fetch(`${app.baseUrl}/api/info`);
    assert.equal(infoResponse.status, 200);
    const info = await infoResponse.json();
    assert.equal(info.config.appName, "Test Board");
    assert.equal(info.config.environment, "test");
    assert.ok(info.counts.total >= 3);

    const healthResponse = await fetch(`${app.baseUrl}/healthz`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.status, "ok");

    const rootResponse = await fetch(`${app.baseUrl}/`);
    assert.equal(rootResponse.status, 200);
    const html = await rootResponse.text();
    assert.match(html, /Release Board Lab/);
  } finally {
    await app.close();
  }
});

test("supports CORS preflight for API requests", async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/items`, {
      method: "OPTIONS"
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
  } finally {
    await app.close();
  }
});

test("creates, updates, and deletes items", async () => {
  const app = await startTestServer();

  try {
    const createResponse = await fetch(`${app.baseUrl}/api/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Ship release candidate",
        service: "api",
        environment: "staging",
        owner: "Gowtham"
      })
    });

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.item.title, "Ship release candidate");

    const patchResponse = await fetch(`${app.baseUrl}/api/items/${created.item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: "done" })
    });

    assert.equal(patchResponse.status, 200);
    const patched = await patchResponse.json();
    assert.equal(patched.item.status, "done");

    const deleteResponse = await fetch(`${app.baseUrl}/api/items/${created.item.id}`, {
      method: "DELETE"
    });

    assert.equal(deleteResponse.status, 200);

    const rawData = JSON.parse(await readFile(app.dataFile, "utf8"));
    assert.ok(Array.isArray(rawData.items));
    assert.equal(rawData.items.some((item) => item.id === created.item.id), false);
  } finally {
    await app.close();
  }
});
