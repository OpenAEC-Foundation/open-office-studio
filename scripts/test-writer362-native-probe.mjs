/** Protocol/fixture checks only. These never constitute native UI evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { runInNewContext } from "node:vm";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import {
  createWriter362Fixture,
  createWriter362Transport,
  runWriter362NativeProbe,
  writer362GroupTriggerGeometry,
} from "./writer362-native-probe.mjs";

// Exercise the serialized read-only WebDriver script, not the product's height
// calculation. Deliberately use a 5px computed outline instead of its 4px CSS.
function triggerMeasurement({ top = 15, bottom = 95, outerClip = false } = {}) {
  const node = (className, bounds, style, parentElement = null) => ({
    className,
    parentElement,
    style,
    clientTop: 0,
    clientLeft: 0,
    clientWidth: bounds.right - bounds.left,
    clientHeight: bounds.bottom - bounds.top,
    getBoundingClientRect: () => bounds,
    getClientRects: () => [bounds],
  });
  const outer = node(
    "outer",
    { top: 0, bottom: 200, left: 50, right: 200 },
    { overflowX: outerClip ? "clip" : "visible", overflowY: "visible" },
  );
  const track = node(
    "ribbon-baan",
    { top: 8, bottom: 102, left: 18, right: 202 },
    { overflowX: "auto", overflowY: "hidden" },
    outer,
  );
  // The clipping padding box excludes the actual border, not the outer rect.
  track.clientTop = 2;
  track.clientLeft = 2;
  track.clientHeight = 90;
  track.clientWidth = 180;
  const group = node(
    "ribbon-groep",
    { top: 10, bottom: 100, left: 30, right: 100 },
    { overflowX: "visible", overflowY: "visible" },
    track,
  );
  const button = node(
    "ribbon-groep-knop",
    { top, bottom, left: 40, right: 90 },
    { outlineStyle: "solid", outlineWidth: "1.5px", outlineOffset: "3.5px" },
    group,
  );
  button.matches = () => true;
  group.getAttribute = () => "Delete";
  group.querySelector = () => button;
  return runInNewContext(
    `(${writer362GroupTriggerGeometry.toString()})("Delete")`,
    {
      document: { querySelectorAll: () => [group], activeElement: button },
      getComputedStyle: (e) => e.style,
    },
  );
}

test("serialized native measurement detects an outline beyond the clipping padding box", () => {
  const overflow = triggerMeasurement({ top: 10, bottom: 100 });
  assert.equal(overflow.ring, 5);
  assert.equal(overflow.clipped, true);
  assert.equal(overflow.clippedY, true);
  assert.equal(overflow.clippingAncestors[0].clip.top, 10);
  assert.equal(overflow.clippingAncestors[0].clip.bottom, 100);
  const fit = triggerMeasurement();
  assert.equal(fit.focusVisible, true);
  assert.equal(fit.clipped, false);
  assert.equal(fit.clippedY, false);
  assert.equal(fit.outline.top, 10);
  assert.equal(fit.outline.bottom, 100);
});

test("serialized native measurement includes additional clipping ancestors", () => {
  const data = triggerMeasurement({ outerClip: true });
  assert.equal(data.clippingAncestors.length, 2);
  assert.equal(data.clippingAncestors[0].clipped, false);
  assert.equal(data.clippingAncestors[1].clipped, true);
  assert.equal(data.clipped, true);
  assert.equal(data.clippedX, true);
  assert.equal(data.clippedY, false);
});

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

test("native protocol blocks scripted focus and DOM mutations before transmission", async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      path: request.url,
      body: body ? JSON.parse(body) : undefined,
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ value: null }));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const command = createWriter362Transport({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      sessionId: "owned",
    });
    for (const script of [
      "document.querySelector('input')?.focus()",
      "document.querySelector('input').focus?.()",
      "document.querySelector('input')['focus']()",
      "document.querySelector('button').click()",
      "document.body.dispatchEvent(new KeyboardEvent('keydown'))",
      "document.body.setAttribute('tabindex', '0')",
      "document.body.innerHTML = ''",
      "document.querySelector('input').value += 'synthetic'",
      "document.querySelector('button').disabled = true",
      "document.querySelector('button')['disabled'] = true",
      "document.body.style.color = 'red'",
      "document.body.dataset.active = 'true'",
      "document.body.classList.add('active')",
      "Object.assign(document.body.style, {color:'red'})",
      "window.__TAURI_INTERNALS__.invoke('something')",
    ])
      await assert.rejects(
        command("POST", "/execute/sync", { script, args: [] }),
        /Read-only DOM observation/,
      );
    assert.equal(requests.length, 0, "No mutating script reaches the driver");
    await command("POST", "/execute/sync", {
      script:
        "return {focused:document.activeElement,disabled:document.querySelector('button').disabled===true}",
      args: [],
    });
    await command("POST", "/element/canvas-id/click");
    await command("POST", "/actions", {
      actions: [
        {
          type: "key",
          id: "native-keyboard",
          actions: [
            { type: "keyDown", value: "\uE009" },
            { type: "keyUp", value: "\uE009" },
          ],
        },
      ],
    });
    assert.equal(requests.length, 3);
    assert.ok(requests[1].path.endsWith("/element/canvas-id/click"));
    assert.ok(requests[2].path.endsWith("/actions"));
    await command("POST", "/execute/sync", {
      script: `return (${writer362GroupTriggerGeometry.toString()})(...arguments)`,
      args: ["Delete"],
    });
    assert.equal(
      requests.length,
      4,
      "Read-only serialized geometry stays allowed",
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("element clicks send POST JSON objects for WebKitGTK, including cleanup", async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      contentType: request.headers["content-type"],
      body,
    });
    response.setHeader("content-type", "application/json");
    if (!body) {
      response.statusCode = 400;
      response.end(
        JSON.stringify({
          value: {
            error: "invalid argument",
            message: "Invalid JSON in request body",
          },
        }),
      );
      return;
    }
    response.end(JSON.stringify({ value: null }));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const options = {
      endpoint: `http://127.0.0.1:${server.address().port}`,
      sessionId: "owned-session",
    };
    const command = createWriter362Transport(options),
      cleanupCommand = createWriter362Transport({
        ...options,
        timeoutMs: 5000,
      });
    await command("POST", "/element/canvas-id/click");
    await cleanupCommand("POST", "/element/original-tab-id/click");
    assert.deepEqual(requests, [
      {
        method: "POST",
        path: "/session/owned-session/element/canvas-id/click",
        contentType: "application/json",
        body: "{}",
      },
      {
        method: "POST",
        path: "/session/owned-session/element/original-tab-id/click",
        contentType: "application/json",
        body: "{}",
      },
    ]);
  } finally {
    await new Promise((done) => server.close(done));
  }
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
