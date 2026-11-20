/** Protocol/fixture checks only. These never constitute native UI evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import {
  createWriter362Fixture,
  createWriter362Transport,
  runWriter362NativeProbe,
} from "./writer362-native-probe.mjs";

test("transport scopes W3C requests to caller session and rejects lifecycle commands", async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      body: body ? JSON.parse(body) : undefined,
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ value: { ok: true } }));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const command = createWriter362Transport({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      sessionId: "caller-session",
    });
    assert.deepEqual(
      await command("POST", "/execute/sync", { script: "return 2", args: [] }),
      { ok: true },
    );
    await command("DELETE", "/actions");
    for (const [method, suffix] of [
      ["DELETE", ""],
      ["POST", "/url"],
      ["POST", "/session"],
      ["GET", "/../other-session/screenshot"],
    ])
      await assert.rejects(
        command(method, suffix),
        /Unsupported session command/,
      );
    assert.equal(requests.length, 2);
    assert.equal(requests[0].path, "/session/caller-session/execute/sync");
    assert.deepEqual(requests[0].body, { script: "return 2", args: [] });
    assert.equal(requests[1].path, "/session/caller-session/actions");
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("transport rejects remote endpoints, credential URLs and unsafe session IDs", () => {
  for (const endpoint of [
    "https://127.0.0.1:4444",
    "http://example.com:4444",
    "http://user:pass@localhost:4444",
    "http://localhost:4444?token=x",
  ])
    assert.throws(() =>
      createWriter362Transport({ endpoint, sessionId: "valid" }),
    );
  assert.throws(() =>
    createWriter362Transport({
      endpoint: "http://localhost:4444",
      sessionId: "../other",
    }),
  );
});

test("transport preserves W3C command failures", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        value: {
          error: "no such element",
          message: "fixture control unavailable",
        },
      }),
    );
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const command = createWriter362Transport({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      sessionId: "owned",
    });
    await assert.rejects(
      command("POST", "/element", { using: "css selector", value: ".missing" }),
      /no such element/,
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("cancelled transport does not submit actions", async () => {
  const controller = new AbortController();
  controller.abort(new Error("caller cancelled"));
  const command = createWriter362Transport({
    endpoint: "http://127.0.0.1:1",
    sessionId: "owned",
    signal: controller.signal,
  });
  await assert.rejects(
    command("POST", "/actions", { actions: [] }),
    /caller cancelled/,
  );
});

test("each W3C request has a bounded timeout", async () => {
  const server = createServer(() => {});
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const command = createWriter362Transport({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      sessionId: "owned",
      timeoutMs: 50,
    });
    await assert.rejects(command("GET", "/screenshot"), /timeout|aborted/i);
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});

test("fixture contains real imported active states; cannot overwrite caller file", async () => {
  const base = resolve(".local");
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "writer362-contract-"));
  const templatePath = join(dir, "template.docx");
  await writeFile(
    templatePath,
    zipSync({
      "word/document.xml": strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr/></w:body></w:document>',
      ),
      "word/settings.xml": strToU8(
        '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:settings>',
      ),
    }),
  );
  const fixture = await createWriter362Fixture({ templatePath, outDir: dir });
  const bytes = await readFile(fixture.path),
    parts = unzipSync(bytes),
    xml = strFromU8(parts["word/document.xml"]);
  assert.equal((xml.match(/<w:tc>/g) ?? []).length, 6);
  assert.equal((xml.match(/<w:tblHeader\/>/g) ?? []).length, 2);
  assert.equal((xml.match(/w:vAlign w:val="bottom"/g) ?? []).length, 6);
  assert.match(fixture.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(
    createWriter362Fixture({ templatePath, outDir: dir }),
    /EEXIST/,
  );
  assert.deepEqual(await readFile(fixture.path), bytes);
  const protectedFixture = await createWriter362Fixture({
    templatePath,
    outDir: dir,
    protectedDocument: true,
  });
  assert.match(
    strFromU8(
      unzipSync(await readFile(protectedFixture.path))["word/settings.xml"],
    ),
    /w:documentProtection w:edit="readOnly" w:enforcement="1"/,
  );
});

test(
  "native entry cannot certify another platform",
  { skip: process.platform === "linux" },
  async () => {
    await assert.rejects(
      runWriter362NativeProbe({}),
      /Native Linux probe only/,
    );
  },
);
