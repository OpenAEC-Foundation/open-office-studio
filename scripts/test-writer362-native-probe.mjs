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
  writer362SelectedCanvasPoint,
  writer362NativeCanvasActions,
  writer362NativeAnatomy,
  writer362DocumentFocus,
  writer362XTestChord,
  createWriter362XTestInput,
  writer362ProcStartTime,
} from "./writer362-native-probe.mjs";

function fakeXTest(options = {}) {
  const commands = [],
    reads = [];
  const state = {
    pid: 4635,
    startTime: "12000",
    executable: "/usr/bin/open-office-studio",
    identity: "1:2:3:4",
    sha256: "a".repeat(64),
    focus: "901",
    windows: "901",
    windowPid: "4635",
    dom: {
      hasFocus: true,
      hidden: false,
      visibilityState: "visible",
      activeElement: { label: "Special Character", focusVisible: true },
    },
    ...options,
  };
  const args = {
    source: { pid: 4635, executableSha256: "a".repeat(64) },
    display: ":99",
    ownedProfile: true,
    observe: async () => structuredClone(state.dom),
  };
  const io = {
    platform: "linux",
    readOwner: async (withHash) => {
      reads.push(withHash);
      return {
        pid: state.pid,
        startTime: state.startTime,
        executable: state.executable,
        identity: state.identity,
        ...(withHash ? { sha256: state.sha256 } : {}),
      };
    },
    xdo: async (argv) => {
      commands.push(argv);
      if (argv[0] === "search") return state.windows;
      if (argv[0] === "getwindowpid") return state.windowPid;
      if (argv[0] === "getwindowfocus") return state.focus;
      if (argv[0] === "windowfocus") {
        state.focus = argv[2];
        if (!state.keepDomUnfocused) state.dom.hasFocus = true;
      }
      return "";
    },
  };
  return {
    state,
    commands,
    reads,
    args,
    io,
    input: createWriter362XTestInput(args, io),
  };
}

test("XTest maps only the seven existing W3C keys and their native chords", () => {
  for (const [value, name] of [
    ["\uE015", "Down"],
    ["\uE014", "Right"],
    ["\uE007", "Return"],
    ["\uE00C", "Escape"],
    ["\uE009", "ctrl"],
    ["\uE011", "Home"],
    ["\uE010", "End"],
  ])
    assert.equal(writer362XTestChord([value]), name);
  assert.equal(writer362XTestChord(["\uE009", "\uE011"]), "ctrl+Home");
  assert.throws(() => writer362XTestChord(["x"]), /Unsupported XTest key/);
  assert.throws(() => writer362XTestChord([]), /At least one/);
});

test("process binding reads field22 despite spaces/parentheses and validates PID", () => {
  const fields = Array(22).fill("0");
  fields[0] = "R";
  fields[19] = "123456";
  const text = `4635 (office studio (worker)) ${fields.join(" ")}`;
  assert.equal(writer362ProcStartTime(text, 4635), "123456");
  assert.throws(
    () => writer362ProcStartTime(text, 99),
    /Unexpected \/proc PID/,
  );
  assert.throws(
    () => writer362ProcStartTime("4635 (office) R", 4635),
    /Missing \/proc starttime/,
  );
});

test("XTest requires Linux, explicit private display, owned profile and verified PID", () => {
  const f = fakeXTest();
  for (const [args, io] of [
    [{ ...f.args, display: undefined }, f.io],
    [{ ...f.args, display: "remote:1" }, f.io],
    [{ ...f.args, ownedProfile: false }, f.io],
    [{ ...f.args, source: { ...f.args.source, pid: 0 } }, f.io],
    [f.args, { ...f.io, platform: "win32" }],
  ])
    assert.throws(() => createWriter362XTestInput(args, io));
  assert.equal(f.commands.length, 0);
});

test("already-foreground XTest sends real key arguments without a target-window flag", async () => {
  const f = fakeXTest();
  await f.input.initialize();
  assert.equal(f.input.evidence.activationPerformed, false);
  await f.input.press(["\uE009", "\uE011"]);
  assert.deepEqual(
    f.commands.filter((c) => c[0] === "key"),
    [["key", "--clearmodifiers", "ctrl+Home"]],
  );
  assert.ok(f.commands.every((c) => !c.includes("--window")));
  assert.equal(
    f.reads.filter(Boolean).length,
    1,
    "Executable hash bound once; PID/starttime/inode identity rechecked per input",
  );
  assert.ok(f.reads.length >= 4);
  assert.equal(f.input.evidence.keys[0].post.dom.hasFocus, true);
});

test("XTest activates only its exact owned window once and never refocuses on later loss", async () => {
  const f = fakeXTest({
    focus: "902",
    dom: { hasFocus: false, hidden: false, visibilityState: "visible" },
  });
  await f.input.initialize();
  assert.deepEqual(
    f.commands.filter((c) => c[0] === "windowfocus"),
    [["windowfocus", "--sync", "901"]],
  );
  f.state.focus = "902";
  await assert.rejects(f.input.press(["\uE015"]), /lost foreground/);
  assert.equal(f.commands.filter((c) => c[0] === "windowfocus").length, 1);
  assert.equal(f.commands.filter((c) => c[0] === "key").length, 0);
});

test("XTest rejects ambiguous windows, wrong window PID, or wrong executable before input", async () => {
  for (const options of [
    { windows: "901\n902" },
    { windowPid: "999" },
    { sha256: "b".repeat(64) },
  ]) {
    const f = fakeXTest(options);
    await assert.rejects(f.input.initialize());
    assert.equal(
      f.commands.filter((c) => ["key", "windowfocus"].includes(c[0])).length,
      0,
    );
  }
});

test("XTest stops on PID reuse, executable replacement, hidden DOM or failed activation", async () => {
  for (const change of [
    { startTime: "99999" },
    { executable: "/other/app" },
    { identity: "changed" },
    { pid: 123 },
    { dom: { hasFocus: true, hidden: true, visibilityState: "hidden" } },
  ]) {
    const f = fakeXTest();
    await f.input.initialize();
    Object.assign(f.state, change);
    await assert.rejects(f.input.press(["\uE015"]));
    assert.equal(f.commands.filter((c) => c[0] === "key").length, 0);
  }
  const f = fakeXTest({
    focus: "902",
    keepDomUnfocused: true,
    dom: { hasFocus: false, hidden: false, visibilityState: "visible" },
  });
  await assert.rejects(f.input.initialize(), /lacks focus/);
  assert.equal(f.commands.filter((c) => c[0] === "windowfocus").length, 1);
  assert.equal(f.commands.filter((c) => c[0] === "key").length, 0);
});

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
    await command("POST", "/execute/sync", {
      script: `return (${writer362DocumentFocus.toString()})()`,
      args: [],
    });
    assert.equal(
      requests.length,
      5,
      "Read-only document foreground observation stays allowed",
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

test("initial canvas input uses selected-panel coordinates and real viewport pointer actions", async () => {
  const canvas = {
    width: 816,
    height: 1056,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ x: 400, y: 252, width: 816, height: 1056 }),
  };
  const panel = {
    closest: () => null,
    querySelectorAll: (s) => (s === ".canvas-page canvas" ? [canvas] : []),
  };
  const document = {
    querySelectorAll: (s) =>
      s === ".office-tab[role=tab][aria-selected=true]"
        ? [{ getAttribute: () => "selected-panel" }]
        : [],
    getElementById: (id) => (id === "selected-panel" ? panel : null),
  };
  const point = runInNewContext(
    `(${writer362SelectedCanvasPoint.toString()})(145,110)`,
    { document },
  );
  assert.equal(point.panelId, "selected-panel");
  assert.equal(point.point.x, 545);
  assert.equal(point.point.y, 362);
  assert.equal(
    runInNewContext(`(${writer362SelectedCanvasPoint.toString()})(900,110)`, {
      document,
    }),
    null,
  );
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      method: request.method,
      path: request.url,
      contentType: request.headers["content-type"],
      body: JSON.parse(body),
    });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ value: null }));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const command = createWriter362Transport({
      endpoint: `http://127.0.0.1:${server.address().port}`,
      sessionId: "owned-session",
    });
    await command("POST", "/execute/sync", {
      script: `return (${writer362SelectedCanvasPoint.toString()})(...arguments)`,
      args: [145, 110],
    });
    await command("POST", "/execute/sync", {
      script: `return (${writer362NativeAnatomy.toString()})()`,
      args: [],
    });
    await command(
      "POST",
      "/actions",
      writer362NativeCanvasActions(point.point),
    );
    assert.deepEqual(requests[2], {
      method: "POST",
      path: "/session/owned-session/actions",
      contentType: "application/json",
      body: {
        actions: [
          {
            type: "pointer",
            id: "writer362-pointer",
            parameters: { pointerType: "mouse" },
            actions: [
              {
                type: "pointerMove",
                duration: 0,
                origin: "viewport",
                x: 545,
                y: 362,
              },
              { type: "pointerDown", button: 0 },
              { type: "pointerUp", button: 0 },
            ],
          },
        ],
      },
    });
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
