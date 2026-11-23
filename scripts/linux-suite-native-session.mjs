/** Own final Suite package sessions; proven P2 input/portal/lifecycle protocols. */
import assert from "node:assert/strict";
import {
  createOwnedDialog,
  requireExactFocusedPath,
} from "./linux-stw-dialog-input.mjs";
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
} from "./linux-p2-ribbon-native.mjs";
import {
  selectedDocumentReadyScript,
  selectedCanvasPointScript,
  selectedDocumentAnatomyScript,
  twoReadOnlyFramesScript,
} from "./linux-p2-native-ready.mjs";


import * as fsSync from "node:fs";
import {readdir,chmod,symlink,copyFile} from "node:fs/promises";
import {readSuiteRequest} from "../qa/linux-suite-final/request.mjs";
import {collectOwnedNativeResources} from "./linux-suite-owned-processes.mjs";
export async function runSuiteNativeScenario({packageType,scenarioName},action){
assert(["deb","appimage"].includes(packageType));
assert.match(scenarioName,/^[a-z0-9-]+$/);
assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable remote host only");
assert.match(process.env.DISPLAY ?? "", /^:\d+(?:\.\d+)?$/);
const exec = promisify(execFile);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const request=await readSuiteRequest();
const identity=JSON.parse(await readFile(`.local/linux-suite-final-input/${packageType}-identity.json`,"utf8"));
assert.equal(identity.sourceCommit,request.candidate.commit);
assert.equal(identity.sourceTree,request.candidate.tree);
assert.equal(identity.version,request.candidate.version);
assert.equal(identity.executionApproved, true);
assert.equal(git("rev-parse", "HEAD"), identity.sourceCommit);
assert.equal(git("rev-parse", "HEAD^{tree}"), identity.sourceTree);
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
const here = dirname(fileURLToPath(import.meta.url));
assert.equal(git("-C",here,"status","--porcelain","--untracked-files=no"),"","Immutable clean QA checkout");
const application=identity.launchPath;
let launchOverride;
assert.equal(identity.packageType,packageType);
assert.equal(hash(await readFile(application)),identity.launchSha256);
const out=resolve(".local/linux-p2-native", `suite-final-${packageType}-${scenarioName}`);
await mkdir(dirname(out), { recursive: true });
await mkdir(out, { recursive: false });
const report = {
  issues: scenarioName === "field374" ? [374] : [378],
  request,packageType,scenarioName,
  origin: identity,
  source: { commit: identity.sourceCommit, tree: identity.sourceTree },
  harnessCommit: git("-C", here, "rev-parse", "HEAD"),
  harnessSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  platform: `Linux / actual ${packageType} / WebKitGTK / headed X11`,
  status: "running",
  startedAt: new Date().toISOString(),
  sessions: [],
  checks: [],
  inputs: [],
  captures: [],
  cleanup: {},
  limits:["Actual coordinator-pinned package; old proof is not relabelled.","Native X11/software graphics; no physical hardware or signed/public release claim.","Clean full quit uses real Alt+F4; DELETE is only failure/own-session cleanup.","Field/XML audit and screenshot stability are distinct from human visual acceptance."],
};
report.harnessFiles = Object.fromEntries(
  await Promise.all(
    [
      "linux-suite-native-session.mjs",
      "../qa/linux-suite-final/request.json",
      "../qa/linux-suite-final/request.mjs",
      "linux-stw-dialog-input.mjs",
      "linux-stw-portal.py",
      "linux-stw-gtk-anatomy.py",
      "linux-p2-ribbon-native.mjs",
      "linux-p2-native-ready.mjs",
      "linux-p2-native-capture.py",
      "linux-p2-native-input.mjs",
    ].map(async (name) => [name, hash(await readFile(join(here, name)))]),
  ),
);
report.protocolOrigin = {
  helperAndHostCommit: "b15892cd491b5bfef6b765f6f9af43d62873a0d5",
  priorP2NativeProof: "6bb8d6fafa06718b0a0ea5aff9cbcf70856e16c1",
  priorP2ReceiptSha256:
    "a452f3e3ca42505161a2e8c5cec098a896b11e1e27076d8b2db3eb924795da18",
  pickerContractCommit: "9f321450ce9002dfd2bfbd8ed7baed63a212067e",
  pickerContractRun: 45152944453,
  pickerMappingCommit: "3f4ddecd383e6a9fcb6a5f78ff456c08d772797a",
  oracleCommit: "082319659e0e2349c8ab8860a7d886c6733a936e",
  note: "Protocol reuse only; this scenario executes independently on the actual final package. Old STW/P2 results are not relabelled.",
};
const baseline = ["alpha", "beta", "", "", "", "omega", "delta", "", ""];
const inserted = baseline.flatMap((text, i) =>
  i % 3 === 0 ? [text, ""] : [text],
);
const env = {
  ...process.env,
  GDK_BACKEND: "x11",
  APPIMAGE_EXTRACT_AND_RUN: "1",
  LIBGL_ALWAYS_SOFTWARE: "1",
  XDG_CONFIG_HOME: join(out, "profile/config"),
  XDG_DATA_HOME: join(out, "profile/data"),
  XDG_CACHE_HOME: join(out, "profile/cache"),
  XDG_RUNTIME_DIR: join(out, "profile/runtime"),
  XDG_CURRENT_DESKTOP: "GNOME",
  XDG_SESSION_TYPE: "x11",
  NO_AT_BRIDGE: "0",
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
  return fsSync.readdirSync('/proc').filter(pid=>{
    if(!/^\d+$/.test(pid))return false;
    try{return basename(fsSync.realpathSync('/proc/'+pid+'/exe'))==='open-office-studio'&&fsSync.readFileSync('/proc/'+pid+'/environ','utf8').split('\0').includes('XDG_CONFIG_HOME='+env.XDG_CONFIG_HOME)}catch(e){if(['ENOENT','ESRCH','EACCES'].includes(e.code))return false;throw e;}
  });
}
async function ownedApplicationResources(){
  return collectOwnedNativeResources({profile:env.XDG_CONFIG_HOME,application,processGroup:driver?.pid});
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
      "ctrl+End",
      "ctrl+shift+s",
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
      "minus",
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
async function startDocument(
  path,
  cells = baseline,
  columns = 3,
  rows = 3,
  marker = "",
) {
  assert.equal(session, undefined);
  assert.deepEqual(await ownedApplicationResources(),[],"No surviving app/AppImage resources before a new session");
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
                if (basename(executable) === "open-office-studio")
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
        alwaysMatch: { "tauri:options": { application: launchOverride ?? application, args: [path] } },
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
  const actualExecutable=await realpath(`/proc/${current}/exe`);
  assert.equal(basename(actualExecutable),"open-office-studio");
  const actualEnvironment=(await readFile(`/proc/${current}/environ`,"utf8")).split("\0");
  const actualAppImage=actualEnvironment.find(v=>v.startsWith('APPIMAGE='))?.slice(9),actualAppDir=actualEnvironment.find(v=>v.startsWith('APPDIR='))?.slice(7);
  if(packageType==="deb")assert.equal(actualExecutable,"/usr/bin/open-office-studio");
  else {assert.equal(actualAppImage,application);assert(actualAppDir?.startsWith('/tmp/'));assert.equal(actualExecutable,await realpath(join(actualAppDir,'usr/bin/open-office-studio')));}
  if(launchOverride)assert(actualEnvironment.includes("PATH="+join(out,"without-zenity")));
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
        script:
          cells === null
            ? `return (${inspectStwReady.toString()})(...arguments)`
            : selectedDocumentReadyScript,
        args:
          cells === null
            ? [marker, basename(path)]
            : [basename(path), columns, cells, rows],
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
    actualExecutable,actualAppImage,actualAppDir,effectivePath:actualEnvironment.find(v=>v.startsWith("PATH=")),launchOverride,
    x11: guard.evidence,
    environment: safeEnvironment(await readFile(`/proc/${current}/environ`)),
    transientApplications,
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

// STW-specific driver follows.
function inspectStwReady(marker, expectedName) {
  const tabs = [
    ...document.querySelectorAll(".office-tab[role=tab][aria-selected=true]"),
  ];
  if (tabs.length !== 1) return null;
  if (
    expectedName &&
    !tabs[0]
      .querySelector(".office-tabnaam")
      ?.textContent.startsWith(expectedName)
  )
    return null;
  const panel = document.getElementById(tabs[0].getAttribute("aria-controls"));
  if (
    !panel ||
    panel.closest("[hidden],[inert]") ||
    document.fonts.status !== "loaded"
  )
    return null;
  const canvases = [...panel.querySelectorAll(".canvas-page canvas")].filter(
    (c) => c.width > 0 && c.height > 0,
  );
  if (!canvases.length || !document.querySelector(".paged-editor__yrs-input"))
    return null;
  const first = canvases[0],
    bounds = first.getBoundingClientRect();
  if (
    first.width < Math.floor(bounds.width * devicePixelRatio) ||
    first.height < Math.floor(bounds.height * devicePixelRatio)
  )
    return null;
  if (!panel.querySelector("[role=paragraph],[role=heading]")) return null;
  return {
    tab: tabs[0].textContent.trim(),
    panelId: panel.id,
    fonts: document.fonts.status,
    text: panel.textContent,
    markerObserved: marker ? panel.textContent.includes(marker) : null,
    tables: panel.querySelectorAll("[role=table]").length,
    paragraphs: [
      ...panel.querySelectorAll("p,[role=paragraph],[role=heading]"),
    ].map((e) => ({ role: e.getAttribute("role"), text: e.textContent })),
    canvases: canvases.map((c) => ({
      width: c.width,
      height: c.height,
      rect: {
        x: c.getBoundingClientRect().x,
        y: c.getBoundingClientRect().y,
        width: c.getBoundingClientRect().width,
        height: c.getBoundingClientRect().height,
      },
    })),
  };
}
const children = [],
  observers = [];
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
const xdo = async (args) =>
  (await exec("xdotool", args, { env, timeout: 5000 })).stdout.trim();
async function requireAppOwner(record) {
  assert.equal(
    writer362ProcStartTime(
      await readFile(`/proc/${record.pid}/stat`, "utf8"),
      record.pid,
    ),
    record.x11.binding.startTime,
  );
  assert.equal(await realpath(`/proc/${record.pid}/exe`),record.actualExecutable);
  assert.equal(hash(await readFile(`/proc/${record.pid}/exe`)),identity.executableSha256);
}
async function bus(method, name) {
  const result = (
    await exec(
      "gdbus",
      [
        "call",
        "--session",
        "--dest",
        "org.freedesktop.DBus",
        "--object-path",
        "/org/freedesktop/DBus",
        "--method",
        "org.freedesktop.DBus." + method,
        ...(name ? [name] : []),
      ],
      { env, timeout: 5000 },
    )
  ).stdout.trim();
  if (method === "GetConnectionUnixProcessID")
    return Number(result.match(/^\(uint32 (\d+),\)$/)?.[1]);
  return result.match(/^\('([^']+)',\)$/)?.[1];
}
async function observer(member, name) {
  const prefix = join(out, member.toLowerCase()),
    proof = prefix + "-portal.json",
    ready = prefix + "-ready.json";
  const app = report.sessions.at(-1);
  await requireAppOwner(app);
  const state = await startChild(
    "/usr/bin/python3",
    [
      join(here, "linux-stw-portal.py"),
      "--pid",
      String(app.pid),
      "--member",
      member,
      "--name",
      name,
      "--report",
      proof,
      "--ready",
      ready,
    ],
    member + " observer",
    { detached: true },
  );
  await waitFor(
    () => readFile(ready, "utf8").then(JSON.parse),
    "Passive picker observer readiness",
  );
  const value = { state, proof, app, member };
  observers.push(value);
  return value;
}
async function correlation(value) {
  const proof = JSON.parse(await readFile(value.proof, "utf8"));
  assert.ok(
    !["failed", "blocked"].includes(proof.status),
    JSON.stringify(proof),
  );
  if (proof.status !== "attributed") return null;
  const c = proof.correlation;
  await requireAppOwner(value.app);
  assert.equal(proof.ownedPid, value.app.pid);
  assert.equal(proof.member, value.member);
  assert.equal(await bus("GetId"), proof.busId);
  assert.equal(
    await bus("GetConnectionUnixProcessID", c.frontend.sender),
    value.app.pid,
  );
  assert.equal(
    await bus("GetNameOwner", "org.freedesktop.portal.Desktop"),
    c.brokerUniqueName,
  );
  assert.equal(
    await bus("GetNameOwner", "org.freedesktop.impl.portal.desktop.gtk"),
    c.backendUniqueName,
  );
  assert.equal(
    await bus("GetConnectionUnixProcessID", c.backendUniqueName),
    c.backendPid,
  );
  assert.equal(
    (await realpath(`/proc/${c.backendPid}/exe`)).split("/").at(-1),
    "xdg-desktop-portal-gtk",
  );
  return proof;
}
async function nativePicker(value, path) {
  const proof = await waitFor(
    () => correlation(value),
    "Credential-bound real " + value.member + " request",
    30000,
  );
  const input = await createOwnedDialog({
    pid: proof.correlation.backendPid,
    expectedExecutable: proof.backendExecutable,
    expectedEnvironment: env,
    xdo: async (args) => {
      await requireAppOwner(value.app);
      return xdo(args);
    },
  });
  const evidence = {
    member: value.member,
    target: path,
    attribution: proof,
    input: input.evidence,
  };
  (report.nativePickers ??= []).push(evidence);
  await input.key("ctrl+l");
  await input.key("ctrl+a");
  await input.typePath(path);
  const anatomy = JSON.parse(
    (
      await exec(
        "/usr/bin/python3",
        [
          join(here, "linux-stw-gtk-anatomy.py"),
          String(proof.correlation.backendPid),
        ],
        { env, timeout: 10000 },
      )
    ).stdout,
  );
  evidence.anatomy = anatomy;
  await writeFile(
    join(out, value.member.toLowerCase() + "-gtk-anatomy.json"),
    JSON.stringify(anatomy, null, 2),
  );
  const { binding, xid } = input.evidence;
  await exec(
    "/usr/bin/python3",
    [
      join(here, "linux-p2-native-capture.py"),
      String(binding.pid),
      xid,
      binding.startTime,
      binding.executable,
      join(out, value.member.toLowerCase() + "-native-picker.png"),
    ],
    { env, timeout: 10000 },
  );
  requireExactFocusedPath(anatomy, proof.correlation.backendPid, path);
  await input.submit();
  if (value.member === "SaveFile") {
    await delay(700);
    const exists = await stat(path)
      .then(() => true)
      .catch(() => false);
    if (!exists && (await xdo(["getwindowfocus"]).catch(() => null)) === xid) {
      // Existing75ca GTK save protocol: Return may first resolve the location;
      // one explicit Save action confirms that same validated native request.
      await input.verify("before explicit native Save");
      await requireAppOwner(value.app);
      await xdo(["key", "--clearmodifiers", "alt+s"]);
      evidence.explicitNativeSave = true;
    }
  }
  await waitFor(
    async () =>
      !(await xdo([
        "search",
        "--onlyvisible",
        "--pid",
        String(proof.correlation.backendPid),
      ]).catch(() => "")),
    "The same owned native dialog closed",
  );
  await stopChild(value.state);
  const final = JSON.parse(await readFile(value.proof, "utf8"));
  assert.equal(final.monitorClosed, true);
  evidence.monitorClosed = true;
  // A real dialog deliberately changes OS focus. Re-enter only the same proven
  // main window after its closure, with the standard strict initialization gate.
  guard = createWriter362XTestInput({
    source: { pid: value.app.pid, executableSha256: identity.executableSha256 },
    ownedProfile: true,
    display: env.DISPLAY,
    observe: () => evaluate(writer362DocumentFocus),
  });
  await guard.initialize();
  (report.nativeDialogReturns ??= []).push(guard.evidence);
  return evidence;
}
async function modalKey(chord) {
  assert(["ctrl+o","ctrl+s"].includes(chord));
  await guard.verify("before native Open shortcut");
  report.inputs.push({
    phase,
    command: ["xdotool", "key", "--clearmodifiers", chord],
    transition:
    "Expected native modal; independently PID/window-bound before further input",
  });
  await xdo(["key", "--clearmodifiers", chord]);
}
async function normalQuit() {
  await waitForCleanUI();
  const current = report.sessions.at(-1);
  await guard.verify("before normal clean Alt+F4");
  await xdo(["key", "--clearmodifiers", "alt+F4"]);
  await waitFor(
    async () => (await ownedApplicationResources()).length === 0,
    "Normal clean window close exits actual Office/AppImage/WebKit resources",
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
async function closeAttributedBackends() {
  const peers = new Map(
    (report.nativePickers ?? []).map((p) => [p.input.binding.pid, p]),
  );
  for (const [pid, picker] of peers) {
    const binding = picker.input.binding,
      record = {
        pid,
        scope: "Exact attributed portal peer on the same private test bus",
        closed: false,
      };
    (report.cleanup.attributedBackends ??= []).push(record);
    try {
      let proc;
      try {
        proc = await readFile(`/proc/${pid}/stat`, "utf8");
      } catch (e) {
        if (e.code === "ENOENT") {
          record.closed = true;
          record.alreadyExited = true;
          continue;
        }
        throw e;
      }
      assert.equal(writer362ProcStartTime(proc, pid), binding.startTime);
      assert.equal(await realpath(`/proc/${pid}/exe`), binding.executable);
      assert.equal(hash(await readFile(`/proc/${pid}/exe`)), binding.sha256);
      const environment = (await readFile(`/proc/${pid}/environ`))
        .toString()
        .split("\0");
      for (const key of ["DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS"])
        assert.equal(
          environment
            .find((s) => s.startsWith(key + "="))
            ?.slice(key.length + 1),
          env[key],
        );
      assert.equal(await bus("GetId"), picker.attribution.busId);
      assert.equal(
        await bus(
          "GetConnectionUnixProcessID",
          picker.attribution.correlation.backendUniqueName,
        ),
        pid,
      );
      process.kill(pid, "SIGTERM");
      await waitFor(
        () =>
          stat(`/proc/${pid}`)
            .then(() => false)
            .catch((e) => {
              if (e.code === "ENOENT") return true;
              throw e;
            }),
        "Exact attributed portal peer exited",
        5000,
      );
      record.closed = true;
    } catch (error) {
      record.error = String(error);
      (report.cleanup.errors ??= []).push(record);
      process.exitCode = 1;
    }
  }
}

async function setMissingHelper(enabled){
  assert.equal(session,undefined);assert.deepEqual(await ownedApplicationResources(),[]);
  if(!enabled){launchOverride=undefined;return;}
  const bin=join(out,'without-zenity');await mkdir(bin,{mode:0o700});
  const linked=new Set();
  for(const directory of (env.PATH??'').split(':').filter(Boolean)){
    for(const name of await readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e})){
      if(name==='zenity'||linked.has(name))continue;
      const source=join(directory,name);if(!(await stat(source).catch(()=>null))?.isFile())continue;
      await symlink(source,join(bin,name));linked.add(name);
    }
  }
  const shellQuote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
  const wrapper=join(out,'launch-without-zenity.sh');
  await writeFile(wrapper,'#!/bin/sh\nPATH='+shellQuote(bin)+'\nexport PATH\nexec '+shellQuote(application)+' "$@"\n',{flag:'wx',mode:0o700});
  await chmod(wrapper,0o700);launchOverride=wrapper;
  const absent=await exec('/usr/bin/which',['zenity'],{env:{...env,PATH:bin}}).then(()=>false).catch(e=>{if(e.code===1)return true;throw e;});
  assert.equal(absent,true,'Actual app-child PATH cannot resolve Zenity');
  report.missingHelperEnvironment={scope:'Only this app child PATH; host environment unchanged',wrapperSha256:hash(await readFile(wrapper)),bin,linkedCommands:linked.size};
}
async function registerPortalPeers(){
  report.registeredPortalPeers=[];
  for(const [name,expectedExecutable]of [['org.freedesktop.impl.portal.desktop.gtk','/usr/libexec/xdg-desktop-portal-gtk'],['org.freedesktop.portal.Desktop','/usr/libexec/xdg-desktop-portal']]){
    const uniqueName=await bus('GetNameOwner',name),pid=await bus('GetConnectionUnixProcessID',uniqueName);
    const executable=await realpath(`/proc/${pid}/exe`);assert.equal(executable,expectedExecutable);
    const environment=(await readFile(`/proc/${pid}/environ`,'utf8')).split('\0');
    for(const key of ['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS'])assert(environment.includes(key+'='+env[key]));
    report.registeredPortalPeers.push({name,uniqueName,pid,executable,sha256:hash(await readFile(executable)),startTime:writer362ProcStartTime(await readFile(`/proc/${pid}/stat`,'utf8'),pid),busId:await bus('GetId')});
  }
}
async function closeRegisteredPortalPeers(){
  for(const peer of report.registeredPortalPeers??[]){
    const result={...peer,closed:false};(report.cleanup.registeredPortalPeers??=[]).push(result);
    try{
      const state=await readFile(`/proc/${peer.pid}/stat`,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
      if(!state){result.closed=true;result.alreadyExited=true;continue;}
      assert.equal(writer362ProcStartTime(state,peer.pid),peer.startTime);assert.equal(await realpath(`/proc/${peer.pid}/exe`),peer.executable);
      assert.equal(hash(await readFile(peer.executable)),peer.sha256);assert.equal(await bus('GetId'),peer.busId);
      assert.equal(await bus('GetConnectionUnixProcessID',peer.uniqueName),peer.pid);
      process.kill(peer.pid,'SIGTERM');
      await waitFor(()=>stat(`/proc/${peer.pid}`).then(()=>false).catch(e=>{if(e.code==='ENOENT')return true;throw e;}),'Exact private portal peer closed',5000);result.closed=true;
    }catch(e){result.error=String(e);(report.cleanup.errors??=[]).push(result);process.exitCode=1;}
  }
}
async function captureStable(name){
  // Each capture already waits two read-only animation frames. Native window
  // pixels also include a real blinking caret: hash equality is diagnostic,
  // never a substitute for reading the original native title/marker images.
  const samples=[];let last;
  for(let index=0;index<3;index++){
    last=await capture(join(out,name+'-sample-'+index+'.png'));
    samples.push({file:name+'-sample-'+index+'.png',sha256:last.sha256,at:Date.now()});
    if(index<2)await delay(300);
  }
  await copyFile(join(out,name+'-sample-2.png'),join(out,name+'.png'));
  (report.presentedCaptures??=[]).push({name,samples,hashesIdentical:new Set(samples.map(s=>s.sha256)).size===1,retainedFinalSha256:last.sha256,visualReviewPending:true});
  return last;
}
async function clickClosingElement(value){
  assert(value?.['element-6066-11e4-a52e-4f735466cecf']);
  await command('POST','/element/'+value['element-6066-11e4-a52e-4f735466cecf']+'/click',{});
}
async function releaseClosedSession(){
  assert.deepEqual(await ownedApplicationResources(),[]);
  try{if(session)await raw('DELETE',`/session/${session}`);}catch(e){(report.releaseAfterRealExit??=[]).push(String(e));}
  session=undefined;guard=undefined;
}
try {
  assert.deepEqual(pids(), [], "Fresh private host, no existing Office app");
  assert.equal(
    env.OPENAEC_CONVERSIE_PROGRAMMA,
    undefined,
    "No external/system converter override",
  );
  const driverPath = execFileSync("which", ["tauri-driver"], {
    encoding: "utf8",
  }).trim();
  report.runtime = {
    driverPath,
    driverSha256: hash(await readFile(driverPath)),
    webkitPackages: execFileSync(
      "dpkg-query",
      [
        "-W",
        "libwebkit2gtk-4.1-0",
        "webkit2gtk-driver",
        "xdg-desktop-portal",
        "xdg-desktop-portal-gtk",
        "openbox",
      ],
      { encoding: "utf8" },
    ),
  };
  const configuration = join(env.XDG_CONFIG_HOME, "org.openaec.office-studio");
  await mkdir(env.XDG_RUNTIME_DIR, { recursive: true, mode: 0o700 });
  await mkdir(configuration, { recursive: true });
  await writeFile(
    join(configuration, "voorkeuren.json"),
    JSON.stringify({
      taal: "en",
      thema: "forge",
      updates: { automatisch: false },
    }),
  );
  await startChild(
    "/usr/bin/openbox",
    ["--sm-disable"],
    "owned window manager",
  );
  await startChild(
    "/usr/libexec/xdg-desktop-portal-gtk",
    [],
    "owned GTK portal",
  );
  await startChild(
    "/usr/libexec/xdg-desktop-portal",
    [],
    "owned portal broker",
  );
  await waitFor(
    () => bus("GetNameOwner", "org.freedesktop.impl.portal.desktop.gtk"),
    "Owned GTK portal registered",
  );
  await waitFor(
    () => bus("GetNameOwner", "org.freedesktop.portal.Desktop"),
    "Owned broker registered",
  );
  await registerPortalPeers();
  const preflight=await fixture("preflight");
  report.fixtures = fixtures;
  driverPort = await freePort();
  do {
    nativePort = await freePort();
  } while (nativePort === driverPort);
  driver = spawn(
    "strace",
    [
      "-f",
      "-s",
      "4096",
      "-e",
      "trace=execve",
      "-o",
      join(out, "native-execve.log"),
      driverPath,
      "--port",
      String(driverPort),
      "--native-port",
      String(nativePort),
    ],
    { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const stream of [driver.stdout, driver.stderr])
    stream.on("data", (d) => {
      driverLog += d;
    });
  driverStart = writer362ProcStartTime(
    await readFile(`/proc/${driver.pid}/stat`, "utf8"),
    driver.pid,
  );
  await waitFor(
    () => raw("GET", "/status").then((s) => s?.ready === true),
    "Native driver ready",
  );

  await action({identity,report,out,env,here,baseline,preflight,application,hash,exec,evaluate,waitFor,element,clickElement,clickClosingElement,releaseClosedSession,nativeKey,type,grid,canvasFocus,capture,captureStable,fixture,savedGrid,save,startDocument,normalQuit,closeDocument,waitForCleanUI,observer,nativePicker,modalKey,xdo,requireAppOwner,ownedApplicationResources,setMissingHelper,createOwnedDialog,inspectBody:marker=>evaluate(inspectStwReady,marker),setPhase:value=>{phase=value},current:()=>report.sessions.at(-1),reenter:async()=>{const record=report.sessions.at(-1);guard=createWriter362XTestInput({source:{pid:record.pid,executableSha256:identity.executableSha256},ownedProfile:true,display:env.DISPLAY,observe:()=>evaluate(writer362DocumentFocus)});await guard.initialize();return guard.evidence;}});
  report.status="passed bounded native "+scenarioName;
} catch (error) {
  report.status = "failed";
  report.failedPhase = phase;
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
  if (session) {
    report.failureAnatomy = await evaluate(inspectStwReady, "").catch((e) => ({
      error: String(e),
    }));
    await capture(join(out, "failure.png")).catch((e) => {
      report.failureCaptureError = String(e);
    });
  }
} finally {
  await closeDocument().catch((e) => {
    report.cleanup.sessionError = String(e);
  });
  for (const value of observers)
    await stopChild(value.state).catch((e) => {
      (report.cleanup.errors ??= []).push({
        label: value.state.label,
        error: String(e),
      });
    });
  await closeAttributedBackends();
  await closeRegisteredPortalPeers();
  for (const value of [...children].reverse()) {
    try {
      const result = await stopChild(value);
      (report.cleanup.children ??= []).push(result);
    } catch (e) {
      (report.cleanup.errors ??= []).push({
        label: value.label,
        error: String(e),
      });
      process.exitCode = 1;
    }
    await writeFile(
      join(out, value.label.replaceAll(" ", "-") + ".log"),
      value.log,
    );
  }
  if (driver && driver.exitCode === null && driver.signalCode === null) {
    assert.equal(
      writer362ProcStartTime(
        await readFile(`/proc/${driver.pid}/stat`, "utf8"),
        driver.pid,
      ),
      driverStart,
    );
    process.kill(-driver.pid, "SIGTERM");
    await waitFor(
      () => driver.exitCode !== null || driver.signalCode !== null,
      "Own traced driver exited",
      5000,
    ).catch((e) => {
      report.cleanup.driverError = String(e);
    });
  }
  report.cleanup.driverExited =
    !driver || driver.exitCode !== null || driver.signalCode !== null;
  try{
    report.cleanup.remainingOwnedResources=await ownedApplicationResources();
    report.cleanup.ownedApplicationClosed=report.cleanup.remainingOwnedResources.length===0;
  }catch(error){
    report.cleanup.resourceScanError=String(error.stack??error);
    report.cleanup.remainingOwnedResources=null;
    report.cleanup.ownedApplicationClosed=false;
  }
  report.cleanup.remainingApplicationPids = pids();
  if (
    !report.cleanup.driverExited ||
    !report.cleanup.ownedApplicationClosed ||
    report.cleanup.errors?.length
  ) {
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
    JSON.stringify({ status: report.status, phase, cleanup: report.cleanup }),
  );
}

return report;
}
