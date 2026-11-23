/** Real installed 420 DEB: native input preflight, #368 and #369. No editor bridge. */
import assert from "node:assert/strict";
import { execFileSync, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import {
  createWriter362Transport,
  createWriter362XTestInput,
  writer362DocumentFocus,
  writer362ProcStartTime,
  runWriter362NativeProbe,
} from "./linux420-ribbon-native.mjs";
import {
  selectedDocumentReadyScript,
  selectedCanvasPointScript,
  selectedDocumentAnatomyScript,
  twoReadOnlyFramesScript,
} from "./linux420-native-ready.mjs";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable remote host only");
assert.match(process.env.DISPLAY ?? "", /^:\d+(?:\.\d+)?$/);
const exec = promisify(execFile);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const identity = JSON.parse(
  await readFile(".local/linux420-input/identity.json", "utf8"),
);
assert.equal(identity.sourceCommit, "420af640c10ab9ada6c66c844c0098caea87c493");
assert.equal(git("rev-parse", "HEAD"), identity.sourceCommit);
assert.equal(git("rev-parse", "HEAD^{tree}"), identity.sourceTree);
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
const here = dirname(fileURLToPath(import.meta.url));
const application = "/usr/bin/open-office-studio";
assert.equal(hash(await readFile(application)), identity.executableSha256);
const out = resolve(".local/linux420-native");
await mkdir(out, { recursive: false });
const report = {
  issues: [368, 369],
  origin: identity,
  source: { commit: identity.sourceCommit, tree: identity.sourceTree },
  harnessCommit: git("-C", here, "rev-parse", "HEAD"),
  harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  platform: "Linux / actual installed DEB / WebKitGTK / headed X11",
  status: "running",
  startedAt: new Date().toISOString(),
  sessions: [],
  checks: [],
  inputs: [],
  captures: [],
  cleanup: {},
  limits: [
    "Virtual X11/software graphics, not physical hardware or AppImage operation.",
    "Full process quit uses WebDriver DELETE session; the application menu Quit command is not certified.",
    "Original I3 failures and GTK diagnostic are retained; this run operates the actual 420 package without DOM focus/style injection.",
    "IME/readonly/disabled/native already-handled event variants are not synthesized; their source/unit coverage is not native UI coverage.",
  ],
};
report.harnessFiles = Object.fromEntries(
  await Promise.all(
    [
      "proef-linux420-native.mjs",
      "linux420-ribbon-native.mjs",
      "linux420-native-ready.mjs",
      "linux420-native-capture.py",
      "linux420-native-package.py",
    ].map(async (name) => [name, hash(await readFile(join(here, name)))]),
  ),
);
report.retainedControl = {
  oldApplication: "7f126f4b8e5269a54388cf78c48c78d2acc0daa1",
  oldPackageSha256:
    "71a08c403dfb6b02cc49ceb45c5da3734a888657853ea58ea585ef1e66c88247",
  oldExecutableSha256:
    "b7e8465ce6273a09fd59e8aa254e88f66b439e3057012164ce13d1908e44f156",
  originalFailedArrowRun: 44739164950,
  originalPartialTabRun: 44744186201,
  ribbonFixtureSha256:
    "ba26f890485dcee41cbfdf694969014ae7b9951b34cbbbc01bc820a15491b3f9",
  unchangedTemplateGitBlob: "c3302b800e96c6d96f75f589d010409c434c7720",
  originalRibbonHarness: "2cba4b113e03c0411614a04af63a66c36d9b57dd",
  originalRibbonHarnessSha256:
    "2acdd2f0a32797a3b0149c425c301b1698612541d366f3958ece92e229c16c83",
  note: "Only control provenance; no old package or injected helper is used as a 420 package pass.",
};
const baseline = ["alpha", "beta", "", "", "", "omega", "delta", "", ""];
const inserted = baseline.flatMap((text, i) =>
  i % 3 === 0 ? [text, ""] : [text],
);
const env = {
  ...process.env,
  GDK_BACKEND: "x11",
  LIBGL_ALWAYS_SOFTWARE: "1",
  XDG_CONFIG_HOME: join(out, "profile/config"),
  XDG_DATA_HOME: join(out, "profile/data"),
  XDG_CACHE_HOME: join(out, "profile/cache"),
};
let driver, driverPort, nativePort, driverStart, session, command, guard;
let driverLog = "",
  phase = "setup";
const fixtures = {};

async function waitFor(check, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      last = String(error);
    }
    await delay(100);
  }
  throw new Error(label + (last ? ": " + last : ""));
}
function pids() {
  try {
    return execFileSync("pgrep", ["-f", "^/usr/bin/open-office-studio( |$)"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}
async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) =>
    server.listen(0, "127.0.0.1", ok).once("error", fail),
  );
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}
async function raw(method, path, body) {
  const response = await fetch(`http://127.0.0.1:${driverPort}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(JSON.stringify(data));
  return data.value;
}
const evaluate = (fn, ...args) =>
  command("POST", "/execute/sync", {
    script: `return (${fn.toString()})(...arguments)`,
    args,
  });
async function clickElement(element) {
  const id = element?.["element-6066-11e4-a52e-4f735466cecf"];
  assert.ok(id);
  await guard.verify("before native element click");
  await command("POST", `/element/${id}/click`, {});
}
async function element(role, name) {
  return waitFor(
    () =>
      evaluate(
        (role, name) => {
          const a = [
            ...document.querySelectorAll(
              role === "tab" ? '[role="tab"]' : role,
            ),
          ].filter((e) => {
            const actual = (
              e.getAttribute("aria-label") || e.textContent
            ).trim();
            return (
              e.getClientRects().length &&
              !e.disabled &&
              (name.endsWith(".docx")
                ? actual.startsWith(name)
                : actual === name)
            );
          });
          return a.length === 1 ? a[0] : null;
        },
        role,
        name,
      ),
    `${role} ${name} unavailable`,
  );
}
const clickTab = async (name) => clickElement(await element("tab", name));
const clickButton = async (name) => clickElement(await element("button", name));
async function nativeKey(chord) {
  assert.ok(
    new Set([
      "ctrl+Home",
      "ctrl+z",
      "ctrl+y",
      "ctrl+shift+z",
      "ctrl+s",
      "ctrl+h",
      "ctrl+a",
      "Escape",
      "Home",
      "End",
      "Down",
      "Right",
      "Return",
    ]).has(chord),
  );
  await guard.verify("before native " + chord);
  const action = {
    phase,
    command: ["xdotool", "key", "--clearmodifiers", chord],
    at: new Date().toISOString(),
  };
  report.inputs.push(action);
  await exec("xdotool", action.command.slice(1), { env, timeout: 5000 });
  action.post = await guard.verify("after native " + chord);
}
async function type(text) {
  assert.match(text, /^[A-Za-z0-9 _]+$/);
  await guard.verify("before native text");
  const action = {
    phase,
    command: ["xdotool", "type", "--clearmodifiers", "--delay", "3", text],
    at: new Date().toISOString(),
  };
  report.inputs.push(action);
  await exec("xdotool", action.command.slice(1), { env, timeout: 10_000 });
  action.post = await guard.verify("after native text");
}
async function tableState() {
  return evaluate(() => {
    const tab = document.querySelector(
      '.office-tab[role="tab"][aria-selected="true"]',
    );
    const panel =
      tab && document.getElementById(tab.getAttribute("aria-controls"));
    const tables = [...(panel?.querySelectorAll('[role="table"]') || [])]
      .filter((t) => !t.closest("[hidden],[inert]"))
      .map((t) => ({
        rows: Number(t.getAttribute("aria-rowcount")),
        columns: Number(t.getAttribute("aria-colcount")),
        cells: [
          ...t.querySelectorAll(
            '[role="columnheader"],[role="rowheader"],[role="cell"]',
          ),
        ].map((e) => e.textContent),
      }));
    const e = document.activeElement;
    return {
      document: tab?.textContent.trim(),
      tables,
      focus: {
        tag: e?.tagName,
        label: e?.getAttribute("aria-label"),
        className: e?.className,
      },
    };
  });
}
async function grid(label, cells, columns = 3) {
  const actual = await waitFor(async () => {
    const s = await tableState();
    return s.tables.length === 1 &&
      s.tables[0].rows === 3 &&
      s.tables[0].columns === columns &&
      JSON.stringify(s.tables[0].cells) === JSON.stringify(cells)
      ? s
      : null;
  }, label);
  report.checks.push({ label, phase, ...actual });
  return actual;
}
async function canvasFocus() {
  const point = await waitFor(
    () =>
      command("POST", "/execute/sync", {
        script: selectedCanvasPointScript,
        args: [145, 110],
      }),
    "Selected canvas",
    90_000,
  );
  await guard.verify("before native canvas pointer");
  await command("POST", "/actions", {
    actions: [
      {
        type: "pointer",
        id: "linux420-pointer",
        parameters: { pointerType: "mouse" },
        actions: [
          {
            type: "pointerMove",
            duration: 0,
            origin: "viewport",
            ...point.point,
          },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
  await nativeKey("ctrl+Home");
  await waitFor(
    () =>
      evaluate(() =>
        document.activeElement?.matches(".paged-editor__yrs-input"),
      ),
    "Actual document input owns focus",
  );
  report.checks.push({
    label: "real canvas click and Ctrl+Home document focus",
    phase,
    point,
    observation: await evaluate(writer362DocumentFocus),
  });
}
async function capture(path) {
  await guard.verify("before own-window capture");
  await command("POST", "/execute/sync", {
    script: twoReadOnlyFramesScript,
    args: [],
  });
  const e = guard.evidence;
  const { stdout } = await exec(
    "/usr/bin/python3",
    [
      join(here, "linux420-native-capture.py"),
      String(e.pid),
      e.xid,
      e.binding.startTime,
      e.binding.executable,
      path,
    ],
    { env, timeout: 10_000 },
  );
  const receipt = JSON.parse(stdout);
  assert.equal(hash(await readFile(path)), receipt.sha256);
  await guard.verify("after own-window capture");
  report.captures.push({ phase, file: path.slice(out.length + 1), ...receipt });
  return receipt;
}
async function startDocument(path, cells = baseline, columns = 3, rows = 3) {
  assert.equal(session, undefined);
  const display = await exec("xdpyinfo", ["-display", env.DISPLAY], {
    env,
    timeout: 5000,
  });
  (report.displayChecks ??= []).push({
    phase,
    beforeDocument: basename(path),
    display: env.DISPLAY,
    reachable: true,
    dimensions: display.stdout.match(/dimensions:\s+([^\n]+)/)?.[1],
  });
  let created;
  try {
    created = await raw("POST", "/session", {
      capabilities: {
        alwaysMatch: { "tauri:options": { application, args: [path] } },
      },
    });
  } catch (error) {
    const after = await exec("xdpyinfo", ["-display", env.DISPLAY], {
      env,
      timeout: 5000,
    })
      .then((r) => ({
        reachable: true,
        dimensions: r.stdout.match(/dimensions:\s+([^\n]+)/)?.[1],
      }))
      .catch((e) => ({ reachable: false, error: String(e) }));
    report.failedSessionStart = {
      phase,
      document: basename(path),
      display: env.DISPLAY,
      displayAfter: after,
      observedApplicationPids: pids(),
      error: String(error),
    };
    throw error;
  }
  session = created.sessionId;
  assert.ok(session);
  command = createWriter362Transport({
    endpoint: `http://127.0.0.1:${driverPort}`,
    sessionId: session,
    timeoutMs: 30_000,
  });
  const current = await waitFor(
    () => pids().length === 1 && pids()[0],
    "One owned app PID",
  );
  assert.equal(await realpath(`/proc/${current}/exe`), application);
  assert.equal(
    hash(await readFile(`/proc/${current}/exe`)),
    identity.executableSha256,
  );
  assert.equal(
    (await raw("GET", `/session/${session}/window/handles`)).length,
    1,
  );
  await command("POST", "/window/rect", { width: 1600, height: 1000 });
  await waitFor(
    () =>
      command("POST", "/execute/sync", {
        script: selectedDocumentReadyScript,
        args: [basename(path), columns, cells, rows],
      }),
    "Selected document/grid/canvas/fonts ready",
    90_000,
  );
  assert.equal(
    await evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke),
    "function",
  );
  assert.equal(
    await evaluate(() =>
      Boolean(
        window.__writerApis || window.__writerWarmup || window.__writerSpelling,
      ),
    ),
    false,
  );
  guard = createWriter362XTestInput({
    source: {
      pid: Number(current),
      executableSha256: identity.executableSha256,
    },
    ownedProfile: true,
    display: env.DISPLAY,
    observe: () => evaluate(writer362DocumentFocus),
  });
  await guard.initialize();
  const record = {
    phase,
    pid: Number(current),
    sessionId: session,
    document: basename(path),
    executableSha256: identity.executableSha256,
    x11: guard.evidence,
  };
  report.sessions.push(record);
  return record;
}
async function closeDocument() {
  if (!session) return;
  await command("DELETE", "/actions").catch(() => {});
  await raw("DELETE", `/session/${session}`);
  session = undefined;
  await waitFor(() => pids().length === 0, "Full owned process exit", 20_000);
  report.checks.push({ label: "full process exit", phase, pids: pids() });
  guard = undefined;
}
async function fixture(name) {
  const template = await readFile("public/templates/nieuw.docx");
  const parts = unzipSync(template),
    xml = strFromU8(parts["word/document.xml"]);
  const cell = (t) =>
    `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid>${[
    0, 3, 6,
  ]
    .map(
      (i) =>
        "<w:tr>" +
        baseline
          .slice(i, i + 3)
          .map(cell)
          .join("") +
        "</w:tr>",
    )
    .join("")}</w:tbl><w:p/>`;
  parts["word/document.xml"] = strToU8(
    xml.replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`),
  );
  const bytes = Buffer.from(
    zipSync(parts, { mtime: new Date("2026-11-20T00:00:00Z") }),
  );
  const path = join(out, name + ".docx");
  await writeFile(path, bytes);
  fixtures[name] = {
    path,
    sha256: hash(bytes),
    templateSha256: hash(template),
    cells: baseline,
  };
  return path;
}
function savedGrid(bytes) {
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows = [...doc.getElementsByTagNameNS("*", "tr")].map((row) =>
    [...row.getElementsByTagNameNS("*", "tc")].map((cell) =>
      [...cell.getElementsByTagNameNS("*", "t")]
        .map((t) => t.textContent)
        .join(""),
    ),
  );
  return { xml, rows, cells: rows.flat() };
}
async function save(path, cells, columns) {
  const before = hash(await readFile(path));
  await waitFor(
    () =>
      evaluate(() =>
        [...document.querySelectorAll("button")].some(
          (e) => e.getAttribute("aria-label") === "Save" && !e.disabled,
        ),
      ),
    "Real Save button enabled",
  );
  await nativeKey("ctrl+s");
  const bytes = await waitFor(async () => {
    const b = await readFile(path),
      actual = savedGrid(b);
    return hash(b) !== before &&
      actual.rows.length === 3 &&
      actual.rows.every((r) => r.length === columns) &&
      JSON.stringify(actual.cells) === JSON.stringify(cells)
      ? b
      : null;
  }, "Actual Ctrl+S persists exact table and marker");
  report.checks.push({
    label: "saved DOCX independent XML oracle",
    phase,
    file: basename(path),
    before,
    sha256: hash(bytes),
    rows: savedGrid(bytes).rows,
  });
  return hash(bytes);
}
async function insertColumn() {
  await canvasFocus();
  await clickTab("Table Design");
  await clickButton("Insert Column Right");
  await grid("column insertion setup", inserted, 4);
  await waitFor(
    () =>
      evaluate(() =>
        document.activeElement?.matches(".paged-editor__yrs-input"),
      ),
    "Column command restores document input",
  );
}
async function openFind(field) {
  await nativeKey("ctrl+h");
  const input = await element("input", field);
  await clickElement(input);
  await waitFor(
    () =>
      evaluate(
        (field) =>
          document.activeElement?.tagName === "INPUT" &&
          document.activeElement.getAttribute("aria-label") === field,
        field,
      ),
    "Exact Find/Replace input owns focus",
  );
}
async function inputValue(field, expected, label) {
  const value = await waitFor(
    () =>
      evaluate(
        (field, expected) => {
          const a = [...document.querySelectorAll("input")].filter(
            (e) =>
              e.getClientRects().length &&
              e.getAttribute("aria-label") === field,
          );
          if (
            a.length !== 1 ||
            a[0].value !== expected ||
            document.activeElement !== a[0]
          )
            return null;
          return {
            field,
            value: a[0].value,
            focused: true,
            hasFocus: document.hasFocus(),
          };
        },
        field,
        expected,
      ),
    label,
  );
  report.checks.push({ label, phase, ...value });
}
async function closeFind() {
  const close = await waitFor(
    () =>
      evaluate(() =>
        document.querySelector('[role="search"] button[aria-label="Close"]'),
      ),
    "Find Close button",
  );
  await clickElement(close);
  await waitFor(
    () =>
      evaluate(() =>
        document.activeElement?.matches(".paged-editor__yrs-input"),
      ),
    "Find close restores real document input",
  );
}
async function exerciseField(path, field) {
  await startDocument(path);
  await insertColumn();
  await openFind(field);
  await inputValue(field, "", "fresh input has empty native history");
  await nativeKey("ctrl+z");
  await inputValue(field, "", "empty input Undo stays empty");
  await grid("empty input Undo does not consume column history", inserted, 4);
  await type("abc");
  await inputValue(field, "abc", "typed input");
  await nativeKey("ctrl+z");
  await inputValue(field, "", "one native Ctrl+Z clears input");
  await grid("input Undo preserves exact document", inserted, 4);
  await nativeKey("ctrl+shift+z");
  await inputValue(field, "abc", "native Ctrl+Shift+Z restores input");
  await nativeKey("ctrl+z");
  await inputValue(field, "", "second input Undo");
  await nativeKey("ctrl+y");
  await inputValue(field, "abc", "native Ctrl+Y restores input");
  await type("q");
  await inputValue(
    field,
    "abcq",
    "controlled field remains synchronized after Redo and typing",
  );
  await capture(
    join(out, field === "Find what" ? "find-redo.png" : "replace-redo.png"),
  );
  await clickElement(await element("input", "Find what"));
  await nativeKey("ctrl+a");
  await type("alpha");
  await inputValue("Find what", "alpha", "subsequent native search input");
  await waitFor(
    () =>
      evaluate(
        () => document.querySelectorAll(".tw-zoek-resultaten li").length === 1,
      ),
    "Subsequent controlled search produces the one real alpha result",
  );
  await grid("search and input history never mutate document", inserted, 4);
  await closeFind();
  await nativeKey("ctrl+z");
  await grid(
    "one document Undo after Find close restores original table",
    baseline,
  );
}

try {
  assert.deepEqual(pids(), [], "No pre-existing app may be affected");
  const driverPath = execFileSync("which", ["tauri-driver"], {
    encoding: "utf8",
  }).trim();
  assert.match(
    execFileSync("cargo", ["install", "--list"], { encoding: "utf8" }),
    /tauri-driver v2\.1\.0:/,
  );
  report.runtime = {
    driverPath,
    driverSha256: hash(await readFile(driverPath)),
    webkitPackages: execFileSync(
      "dpkg-query",
      ["-W", "libwebkit2gtk-4.1-0", "webkit2gtk-driver"],
      { encoding: "utf8" },
    ),
    graphics: {
      GDK_BACKEND: env.GDK_BACKEND,
      LIBGL_ALWAYS_SOFTWARE: env.LIBGL_ALWAYS_SOFTWARE,
      WEBKIT_DISABLE_DMABUF_RENDERER:
        env.WEBKIT_DISABLE_DMABUF_RENDERER ?? null,
    },
  };
  const configuration = join(env.XDG_CONFIG_HOME, "org.openaec.office-studio");
  await mkdir(configuration, { recursive: true });
  await writeFile(
    join(configuration, "voorkeuren.json"),
    JSON.stringify({
      taal: "en",
      thema: "forge",
      updates: { automatisch: false },
    }),
  );
  const preflight = await fixture("preflight"),
    a = await fixture("find-table"),
    b = await fixture("other-table"),
    c = await fixture("replace-table");
  report.fixtures = fixtures;
  driverPort = await freePort();
  do {
    nativePort = await freePort();
  } while (nativePort === driverPort);
  driver = spawn(
    "tauri-driver",
    ["--port", String(driverPort), "--native-port", String(nativePort)],
    { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const s of [driver.stdout, driver.stderr])
    s.on("data", (d) => {
      driverLog += d;
    });
  driver.once("error", (e) => {
    driverLog += String(e);
  });
  driverStart = writer362ProcStartTime(
    await readFile(`/proc/${driver.pid}/stat`, "utf8"),
    driver.pid,
  );
  await waitFor(
    () => raw("GET", "/status").then((s) => s?.ready === true),
    "Native driver ready",
  );
  phase = "preflight";
  const initial = await startDocument(preflight);
  await canvasFocus();
  await grid("preflight correct selected document", baseline);
  await type("LINUX420_PRE ");
  const preCells = ["LINUX420_PRE alpha", ...baseline.slice(1)];
  await grid("preflight actual native typing", preCells);
  await nativeKey("ctrl+z");
  await grid("preflight actual Ctrl+Z", baseline);
  await nativeKey("ctrl+y");
  await grid("preflight actual Ctrl+Y", preCells);
  await save(preflight, preCells, 3);
  await capture(join(out, "preflight-saved.png"));
  await closeDocument();
  const reopened = await startDocument(preflight, preCells);
  assert.notEqual(
    reopened.pid,
    initial.pid,
    "Preflight must use a fresh full application process",
  );
  await grid("preflight fresh process reopened exact saved data", preCells);
  await capture(join(out, "preflight-reopened.png"));
  await closeDocument();
  report.preflight =
    "passed real pointer/focus/Ctrl/edit/save/full-exit/reopen; broad controls released";
  phase = "368-Find-what";
  await exerciseField(a, "Find what");
  await exec(application, [b], { env, timeout: 15_000 });
  await waitFor(
    () =>
      command("POST", "/execute/sync", {
        script: selectedDocumentReadyScript,
        args: [basename(b), 3, baseline, 3],
      }),
    "Other native document loaded",
    90_000,
  );
  await insertColumn();
  await nativeKey("ctrl+z");
  await grid("other document Undo", baseline);
  await clickTab(basename(a));
  await grid("original document isolated", baseline);
  await nativeKey("ctrl+y");
  await grid("original document Redo isolated", inserted, 4);
  await clickTab(basename(b));
  await grid("other document unchanged by original Redo", baseline);
  await nativeKey("ctrl+y");
  await grid("other document Redo isolated", inserted, 4);
  await clickTab(basename(a));
  await grid("original document retains its own edit", inserted, 4);
  await canvasFocus();
  await type("LINUX420_FINAL ");
  const finalCells = ["LINUX420_FINAL alpha", ...inserted.slice(1)];
  await grid("final marker and column", finalCells, 4);
  const saved = await save(a, finalCells, 4);
  const savedPid = report.sessions.at(-1).pid;
  await closeDocument();
  await startDocument(a, finalCells, 4);
  assert.notEqual(report.sessions.at(-1).pid, savedPid);
  await grid("full new process reopened marker and column", finalCells, 4);
  assert.equal(hash(await readFile(a)), saved);
  await capture(join(out, "final-reopened.png"));
  await closeDocument();
  phase = "368-Replace-with";
  await exerciseField(c, "Replace with");
  assert.equal(
    hash(await readFile(c)),
    fixtures["replace-table"].sha256,
    "Unsaved field tests do not write the DOCX",
  );
  await closeDocument();
  report.issue368 =
    "passed bounded native input/history/search/isolation/save controls";
  phase = "369-ribbon";
  const ribbonBytes = await readFile(
    join(here, "../tests/fixtures/linux420/ribbon-control.docx"),
  );
  assert.equal(
    hash(ribbonBytes),
    "ba26f890485dcee41cbfdf694969014ae7b9951b34cbbbc01bc820a15491b3f9",
  );
  const ribbonPath = join(out, "ribbon-control.docx");
  await writeFile(ribbonPath, ribbonBytes);
  const ribbonCells = ["Alpha", "Beta", "Gamma", "One", "Two", "Three"];
  const ribbonSession = await startDocument(ribbonPath, ribbonCells, 3, 2);
  const ribbon = await runWriter362NativeProbe({
    endpoint: `http://127.0.0.1:${driverPort}`,
    sessionId: session,
    outDir: join(out, "ribbon"),
    source: {
      commit: identity.sourceCommit,
      tree: identity.sourceTree,
      packageSha256: identity.packageSha256,
      executableSha256: identity.executableSha256,
      pid: ribbonSession.pid,
    },
    fixture: {
      path: ribbonPath,
      sha256: hash(ribbonBytes),
      protectedDocument: false,
    },
    ownedProfile: true,
    inputBackend: "x11-xtest",
    keyboardEntry: "arrow-down",
    capture,
    signal: AbortSignal.timeout(600_000),
  });
  report.ribbonSummary = {
    status: ribbon.status,
    nativePass: ribbon.nativePass,
    cases: ribbon.cases.length,
    groupCases: ribbon.groupButtonCases.length,
    toolbarNavigation: ribbon.toolbarNavigation.length,
    unavailable: ribbon.unavailable,
  };
  assert.ok(ribbon.status !== "failed" && ribbon.status !== "cleanup-failed");
  for (const theme of ["light", "forge"])
    for (const phase of [
      "keyboard-group-focus",
      "keyboard-group-after-escape",
    ]) {
      const required = ribbon.groupButtonCases.find(
        (c) =>
          c.theme === theme &&
          c.requestedWidth === 923 &&
          c.group === "Delete" &&
          c.phase === phase,
      );
      assert.ok(required, `Required native 923px Delete ${theme}/${phase}`);
      assert.equal(required.focusVisible, true);
      assert.equal(required.ring, 4);
      assert.equal(required.clippedY, false);
    }
  report.issue369 =
    "passed tested Linux ArrowDown/Right/Home/End and required narrow Delete Enter/Escape focus/vertical outline controls";
  await closeDocument();
  report.status =
    ribbon.status === "passed"
      ? "passed"
      : "passed scoped 368/369; wider ribbon state matrix partial";
} catch (error) {
  report.status = "failed";
  report.failedPhase = phase;
  report.error = String(error.stack ?? error);
  if (session) {
    report.failureAnatomy = await command("POST", "/execute/sync", {
      script: selectedDocumentAnatomyScript,
      args: [],
    }).catch((e) => ({ error: String(e) }));
    await capture(join(out, "failure.png")).catch((e) => {
      report.failureCaptureError = String(e);
    });
  }
  process.exitCode = 1;
} finally {
  await closeDocument().catch((e) => {
    report.cleanup.sessionError = String(e);
  });
  if (driver && driver.exitCode === null && driverStart) {
    try {
      const current = await readFile(`/proc/${driver.pid}/stat`, "utf8");
      assert.equal(writer362ProcStartTime(current, driver.pid), driverStart);
      assert.equal(
        current.slice(current.lastIndexOf(")") + 2).split(/\s+/)[2],
        String(driver.pid),
        "Only own detached driver group",
      );
      process.kill(-driver.pid, "SIGTERM");
    } catch (e) {
      if (e.code !== "ENOENT" && e.code !== "ESRCH")
        report.cleanup.driverError = String(e);
    }
  }
  if (driver) {
    await waitFor(
      () => driver.exitCode !== null || driver.signalCode !== null,
      "Own driver exited",
      5000,
    ).catch((e) => {
      report.cleanup.driverExitError = String(e);
    });
    report.cleanup.driverExited =
      driver.exitCode !== null || driver.signalCode !== null;
  }
  await waitFor(
    () => pids().length === 0,
    "Own application cleanup",
    5000,
  ).catch((e) => {
    report.cleanup.appError = String(e);
  });
  report.cleanup.ownedApplicationClosed = pids().length === 0;
  report.cleanup.remainingApplicationPids = pids();
  if (!report.cleanup.ownedApplicationClosed) {
    report.status = "cleanup-failed";
    process.exitCode = 1;
  }
  report.completedAt = new Date().toISOString();
  await writeFile(join(out, "driver.log"), driverLog);
  await writeFile(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: report.status,
      phase,
      checks: report.checks.length,
      cleanup: report.cleanup,
    }),
  );
}
