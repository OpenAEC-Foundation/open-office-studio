/** Final coordinator-pinned Suite DEB: existing368/369/vertical362 core. No app build. */
import assert from "node:assert/strict";
import {readSuiteRequest} from "../qa/linux-suite-final/request.mjs";
const suiteRequest=await readSuiteRequest();
import { execFileSync, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, realpath, stat } from "node:fs/promises";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import {
  typeVerifiedNativeText,
  safeNativeEnvironment as safeEnvironment,
} from "./linux-p2-native-input.mjs";
import {
  createWriter362Transport,
  createWriter362XTestInput,
  writer362DocumentFocus,
  writer362ProcStartTime,
  runWriter362NativeProbe,
} from "./linux-p2-ribbon-native.mjs";
import {
  selectedDocumentReadyScript,
  selectedCanvasPointScript,
  selectedDocumentAnatomyScript,
  twoReadOnlyFramesScript,
} from "./linux-p2-native-ready.mjs";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable remote host only");
assert.match(process.env.DISPLAY ?? "", /^:\d+(?:\.\d+)?$/);
const exec = promisify(execFile);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const identity = JSON.parse(
  await readFile(".local/linux-suite-final-input/identity.json", "utf8"),
);
assert.equal(identity.sourceCommit, suiteRequest.candidate.commit);
assert.equal(identity.sourceTree, suiteRequest.candidate.tree);
assert.equal(identity.version, suiteRequest.candidate.version);
assert.equal(identity.executionApproved, true);
assert.equal(git("rev-parse", "HEAD"), identity.sourceCommit);
assert.equal(git("rev-parse", "HEAD^{tree}"), identity.sourceTree);
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
const here = dirname(fileURLToPath(import.meta.url));
const application = "/usr/bin/open-office-studio";
assert.equal(hash(await readFile(application)), identity.executableSha256);
const out = resolve(".local/linux-p2-native/suite-final-core");
await mkdir(dirname(out), {recursive:true});
await mkdir(out, { recursive: false });
const report = {
  issues: [368, 369, 362],
  suiteRequest,
  protocolOrigin:{core:"b15892cd491b5bfef6b765f6f9af43d62873a0d5",normalQuit:"2c18bccbe6eca967515a17e67b91ef9ec43f3a27"},
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
    "Clean save/reopen preflight uses native Alt+F4 with an own window manager. WebDriver DELETE remains explicit independent-scope/failure cleanup only.",
    "Original I3/420/P2 evidence is unchanged. Legacy capture directory names do not identify app source; this report and immutable input bind the actual final source.",
    "IME/readonly/disabled/native already-handled event variants are not synthesized; their source/unit coverage is not native UI coverage.",
  ],
};
report.harnessFiles = Object.fromEntries(
  await Promise.all(
    [
      "proef-linux-suite-final-core.mjs",
      "../qa/linux-suite-final/request.mjs",
      "../qa/linux-suite-final/request.json",
      "linux-p2-ribbon-native.mjs",
      "linux-p2-native-ready.mjs",
      "linux-p2-native-capture.py",
      "linux-p2-native-input.mjs",
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
  priorFixedSource: "420af640c10ab9ada6c66c844c0098caea87c493",
  priorFixedProof: "45ccd7840414c99610511a31d9f40061c01f40e7",
  priorFixedReceiptSha256:
    "f1945183d64c06ea58b2f51052d46b4ee58fc852e68636329a922116f7fdc077",
  note: "Only control provenance; no old package or injected helper is used as a P2 package pass.",
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
  XDG_RUNTIME_DIR: join(out,"profile/runtime"),
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
  const signature = () => {
    const e = document.activeElement;
    return {
      panel: document
        .querySelector('.office-tab[role="tab"][aria-selected="true"]')
        ?.getAttribute("aria-controls"),
      tag: e?.tagName,
      label: e?.getAttribute("aria-label"),
    };
  };
  const expectedTarget = await evaluate(signature);
  await typeVerifiedNativeText({
    text,
    verify: async (stage) => {
      const observation = await guard.verify(stage);
      const actualTarget = await evaluate(signature);
      assert.deepEqual(
        actualTarget,
        expectedTarget,
        "Every native character keeps the exact selected document and input target",
      );
      return { ...observation, actualTarget };
    },
    run: (args) => exec("xdotool", args, { env, timeout: 5000 }),
    record: (action) => {
      action.phase = phase;
      report.inputs.push(action);
    },
  });
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
        id: "linux-p2-pointer",
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
      join(here, "linux-p2-native-capture.py"),
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
async function sessionEnvironment() {
  const parent = Object.fromEntries(
    [
      "DISPLAY",
      "HOME",
      "XAUTHORITY",
      "GDK_BACKEND",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
    ].map((name) => [name, env[name] ?? null]),
  );
  const result = {
    parent,
    driver: safeEnvironment(await readFile(`/proc/${driver.pid}/environ`)),
    children: [],
  };
  result.xauthorityFileExists = Boolean(
    env.XAUTHORITY &&
      (await stat(env.XAUTHORITY)
        .then((s) => s.isFile())
        .catch(() => false)),
  );
  const children = (
    await readFile(`/proc/${driver.pid}/task/${driver.pid}/children`, "utf8")
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const pid of children) {
    try {
      const command = (await readFile(`/proc/${pid}/cmdline`))
        .toString()
        .split("\0")[0];
      if (basename(command) === "WebKitWebDriver")
        result.children.push({
          pid: Number(pid),
          command,
          environment: safeEnvironment(await readFile(`/proc/${pid}/environ`)),
        });
    } catch (error) {
      result.children.push({
        pid: Number(pid),
        observationError: String(error),
      });
    }
  }
  return result;
}
async function startDocument(path, cells = baseline, columns = 3, rows = 3) {
  assert.equal(session, undefined);
  assert.deepEqual(
    pids(),
    [],
    "A new session must not overlap a surviving app",
  );
  const environment = await sessionEnvironment();
  (report.sessionEnvironments ??= []).push({
    phase,
    document: basename(path),
    ...environment,
  });
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
  const observed = new Set(),
    transientApplications = [],
    samples = [];
  const monitor = setInterval(() => {
    try {
      for (const pid of pids())
        if (!observed.has(pid)) {
          observed.add(pid);
          samples.push(
            Promise.all([
              realpath(`/proc/${pid}/exe`),
              readFile(`/proc/${pid}/environ`),
              readFile(`/proc/${pid}/stat`, "utf8"),
            ])
              .then(([executable, bytes, stat]) => {
                if (executable === application)
                  transientApplications.push({
                    pid: Number(pid),
                    startTime: writer362ProcStartTime(stat, Number(pid)),
                    executable,
                    environment: safeEnvironment(bytes),
                  });
              })
              .catch(() => {}),
          );
        }
    } catch (error) {
      report.environmentObservationError = String(error);
    }
  }, 25);
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
      environment,
      transientApplications,
    };
    throw error;
  } finally {
    clearInterval(monitor);
    await Promise.allSettled(samples);
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
    environment: safeEnvironment(await readFile(`/proc/${current}/environ`)),
    transientApplications,
  };
  report.sessions.push(record);
  return record;
}
const children=[];
async function startChild(program, args, label, { detached = false } = {}) {
  const child = spawn(program, args, {
    env,
    detached,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { label, pid: child.pid, program, args, log: "" };
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      state.log += data;
    });
  child.on("error", (e) => {
    state.error = String(e);
  });
  state.startTime = writer362ProcStartTime(
    await readFile(`/proc/${child.pid}/stat`, "utf8"),
    child.pid,
  );
  state.executable = await realpath(`/proc/${child.pid}/exe`);
  state.child = child;
  state.detached = detached;
  children.push(state);
  return state;
}
async function stopChild(state) {
  if (state.child.exitCode === null && state.child.signalCode === null) {
    assert.equal(
      writer362ProcStartTime(
        await readFile(`/proc/${state.pid}/stat`, "utf8"),
        state.pid,
      ),
      state.startTime,
    );
    assert.equal(await realpath(`/proc/${state.pid}/exe`), state.executable);
    state.child.kill("SIGTERM");
    await waitFor(
      () => state.child.exitCode !== null || state.child.signalCode !== null,
      "Own " + state.label + " closed",
      5000,
    );
  }
  return {
    label: state.label,
    pid: state.pid,
    closed: state.child.exitCode !== null || state.child.signalCode !== null,
  };
}
const xdo=async args=>(await exec("xdotool",args,{env,timeout:5000})).stdout.trim();
async function normalQuit() {
  await waitForCleanUI();
  const current = report.sessions.at(-1);
  await guard.verify("before normal clean Alt+F4");
  await xdo(["key", "--clearmodifiers", "alt+F4"]);
  await waitFor(
    () => pids().length === 0,
    "Normal clean window close exits actual Office process",
    20000,
  );
  let cleanup;
  try {
    await raw("DELETE", `/session/${session}`);
    cleanup = "released";
  } catch (e) {
    cleanup = String(e);
  }
  session = undefined;
  guard = undefined;
  report.checks.push({
    label: "normal native Alt+F4 full process exit",
    phase,
    pid: current.pid,
    remainingPids: pids(),
    webdriverAfterActualExit: cleanup,
  });
}
async function waitForCleanUI() {
  return waitFor(
    () =>
      evaluate(() => {
        const tab = document.querySelector(
          ".office-tab[role=tab][aria-selected=true]",
        );
        return tab &&
          !tab.querySelector(".visueel-verborgen") &&
          document.querySelector('button[aria-label="Save"]')
          ? { tab: tab.textContent.trim(), clean: true }
          : null;
      }),
    "Actual selected document UI clean and native Save settled",
  );
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

async function scoped(name, action) {
  phase = name;
  const result = { status: "running", firstCheck: report.checks.length };
  (report.scopes ??= {})[name] = result;
  try {
    await action();
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error.stack ?? error);
    report.failedPhase ??= name;
    report.error ??= result.error;
    if (session) {
      result.failureAnatomy = await command("POST", "/execute/sync", {
        script: selectedDocumentAnatomyScript,
        args: [],
      }).catch((e) => ({ error: String(e) }));
      await capture(join(out, `scope-${name}-failure.png`)).catch((e) => {
        result.failureCaptureError = String(e);
      });
    }
    process.exitCode = 1;
  } finally {
    result.lastCheck = report.checks.length;
    await closeDocument();
    result.applicationClosed = pids().length === 0;
    assert.equal(
      result.applicationClosed,
      true,
      "A failed independent scope must be fully closed before another scope",
    );
  }
}

try {
  assert.deepEqual(pids(), [], "No pre-existing app may be affected");
  report.actualInstalledDepends=execFileSync("dpkg-query",["-W","-f=${Depends}","open-office-studio"],{encoding:"utf8"});
  assert.match(report.actualInstalledDepends,/(?:^|,\s*)zenity(?:\s|,|$)/,"Actual new Suite DEB must declare Zenity");
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
  for(const directory of [env.XDG_CONFIG_HOME,env.XDG_DATA_HOME,env.XDG_CACHE_HOME,env.XDG_RUNTIME_DIR])await mkdir(directory,{recursive:true,mode:0o700});
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
  await startChild("openbox",["--sm-disable"],"owned window manager");
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
  // One edit verifies native Undo without assuming multi-character edit grouping.
  // The scoped Find/Replace checks retain their strict abc/one-Undo contract.
  await type("P");
  const preCells = ["Palpha", ...baseline.slice(1)];
  await grid("preflight actual native typing", preCells);
  await nativeKey("ctrl+z");
  await grid("preflight actual Ctrl+Z", baseline);
  await nativeKey("ctrl+y");
  await grid("preflight actual Ctrl+Y", preCells);
  await save(preflight, preCells, 3);
  await capture(join(out, "preflight-saved.png"));
  await normalQuit();
  const reopened = await startDocument(preflight, preCells);
  assert.notEqual(
    reopened.pid,
    initial.pid,
    "Preflight must use a fresh full application process",
  );
  await grid("preflight fresh process reopened exact saved data", preCells);
  await capture(join(out, "preflight-reopened.png"));
  await normalQuit();
  report.preflight =
    "passed real pointer/focus/Ctrl/edit/save/full-exit/reopen; broad controls released";
  {
    await scoped("368-Find-what", async () => {
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
      await clickTab(basename(b));
      await save(b, inserted, 4);
      await clickTab(basename(a));
      await normalQuit();
      await startDocument(a, finalCells, 4);
      assert.notEqual(report.sessions.at(-1).pid, savedPid);
      await grid("full new process reopened marker and column", finalCells, 4);
      assert.equal(hash(await readFile(a)), saved);
      await capture(join(out, "final-reopened.png"));
      await normalQuit();
    });
    await scoped("368-Replace-with", async () => {
      await exerciseField(c, "Replace with");
      assert.equal(
        hash(await readFile(c)),
        fixtures["replace-table"].sha256,
        "Unsaved field tests do not write the DOCX",
      );
      await closeDocument();
    });
    report.issue368 = ["368-Find-what", "368-Replace-with"].every(
      (name) => report.scopes[name].status === "passed",
    )
      ? "passed bounded native input/history/search/isolation/save controls"
      : "failed required scope; positive individual input checks remain separately recorded";
  }
  {
    await scoped("369-keyboard-command", async () => {
      const commandPath = await fixture("keyboard-command");
      const original = await startDocument(commandPath);
      await canvasFocus();
      await clickTab("Table Design");
      const pointer = await evaluate(writer362DocumentFocus);
      assert.equal(pointer.activeElement.role, "tab");
      assert.equal(pointer.activeElement.focusVisible, false);
      await nativeKey("Down");
      const navigation = [];
      for (let step = 0; step < 20; step++) {
        const focus = await evaluate(() => {
          const e = document.activeElement,
            s = getComputedStyle(e);
          return {
            name: e?.getAttribute("aria-label"),
            tag: e?.tagName,
            focusVisible: e?.matches(":focus-visible"),
            ring: parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset),
          };
        });
        navigation.push(focus);
        assert.equal(focus.tag, "BUTTON");
        assert.equal(focus.focusVisible, true);
        assert.equal(focus.ring, 4);
        if (focus.name === "Insert Column Right") break;
        await nativeKey("Right");
      }
      assert.equal(
        navigation.at(-1).name,
        "Insert Column Right",
        "Bounded native keyboard route reaches command",
      );
      report.checks.push({
        label: "real pointer Down Right keyboard command focus",
        phase,
        pointer,
        navigation,
      });
      await capture(join(out, "keyboard-command-focus.png"));
      await nativeKey("Return");
      await grid("keyboard Enter executes one column command", inserted, 4);
      await waitFor(
        () =>
          evaluate(() =>
            document.activeElement?.matches(".paged-editor__yrs-input"),
          ),
        "Keyboard command restores real document input",
      );
      await type("K");
      const finalCells = ["Kalpha", ...inserted.slice(1)];
      await grid(
        "typing follows keyboard command into real document",
        finalCells,
        4,
      );
      const saved = await save(commandPath, finalCells, 4);
      await normalQuit();
      const reopened = await startDocument(commandPath, finalCells, 4);
      assert.notEqual(reopened.pid, original.pid);
      assert.equal(hash(await readFile(commandPath)), saved);
      await grid(
        "keyboard command saved and reopened in fresh process",
        finalCells,
        4,
      );
      await capture(join(out, "keyboard-command-reopened.png"));
      await normalQuit();
      report.keyboardCommand =
        "passed native keyboard command Enter, document input return, typing and save/full-exit/reopen";
    });
  }
  {
    await scoped("369-ribbon", async () => {
      const ribbonBytes = await readFile(
        join(here, "../tests/fixtures/linux-p2/ribbon-control.docx"),
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
      assert.ok(
        ribbon.status !== "failed" && ribbon.status !== "cleanup-failed",
      );
      assert.equal(
        ribbon.keyboardEntries.length,
        24,
        "Every required group/theme/width keyboard route executed",
      );
      assert.equal(
        ribbon.toolbarNavigation.length,
        36,
        "Home/End controls executed for every tab/theme/width",
      );
      for (const theme of ["light", "forge"])
        for (const width of [923, 800])
          for (const phase of [
            "keyboard-group-focus",
            "keyboard-group-after-escape",
          ]) {
            const required = ribbon.groupButtonCases.find(
              (c) =>
                c.theme === theme &&
                c.requestedWidth === width &&
                c.group === "Delete" &&
                c.phase === phase,
            );
            assert.ok(
              required,
              `Required native ${width}px Delete ${theme}/${phase}`,
            );
            assert.equal(required.focusVisible, true);
            assert.equal(required.ring, 4);
            assert.equal(required.clippedY, false);
          }
      await closeDocument();
    });
  }
  report.issue369 = ["369-keyboard-command", "369-ribbon"].every(
    (name) => report.scopes[name].status === "passed",
  )
    ? "passed tested Linux pointer/ArrowDown/Right/Home/End, narrow Delete Enter/Escape vertical focus controls and real keyboard command/document-return/save/reopen"
    : "failed or unavailable required native ribbon or keyboard-command scope";
  report.status = Object.values(report.scopes).some(
    (s) => s.status !== "passed",
  )
    ? "failed"
    : !report.ribbonSummary || report.ribbonSummary.status === "passed"
      ? "passed"
      : "passed tested native scopes; wider ribbon state matrix partial";
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
  for(const child of [...children].reverse()) {
    try {(report.cleanup.children??=[]).push(await stopChild(child));}
    catch(e){(report.cleanup.errors??=[]).push({label:child.label,error:String(e)});process.exitCode=1;}
    await writeFile(join(out,child.label.replaceAll(" ","-")+".log"),child.log);
  }
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
