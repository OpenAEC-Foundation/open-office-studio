/** P2 installed DEB GNM acceptance: real picker, XTest, readonly DOM and ZIP/XML. */
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, realpath, stat } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync, strFromU8 } from "fflate";
import {
  createWriter362Transport,
  createWriter362XTestInput,
  writer362DocumentFocus,
  writer362ProcStartTime,
} from "./linux-p2-ribbon-native.mjs";
import {
  typeVerifiedNativeText,
  safeNativeEnvironment,
} from "./linux-p2-native-input.mjs";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Disposable remote host only");
const exec = promisify(execFile),
  hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const here = dirname(fileURLToPath(import.meta.url)),
  out = resolve(".local/linux-p2-native");
await mkdir(out, { recursive: false });
const identity = JSON.parse(
  await readFile(".local/linux-p2-input/identity.json", "utf8"),
);
assert.equal(identity.executionApproved, true);
assert.equal(identity.sourceCommit, "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b");
assert.equal(identity.sourceTree, "5a644e397ecc6af5452a49b6404edf953687d1b2");
assert.equal(identity.version, "2026.48.1");
assert.equal(git("rev-parse", "HEAD"), identity.sourceCommit);
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
const application = "/usr/bin/open-office-studio";
assert.equal(hash(await readFile(application)), identity.executableSha256);
const report = {
  status: "running",
  scope:
    "GNM and Gnumeric genuine upstream fixture via installed Office DEB native picker/Rust IPC/bundled converter",
  origin: identity,
  harnessCommit: git("-C", here, "rev-parse", "HEAD"),
  startedAt: new Date().toISOString(),
  sessions: [],
  checks: [],
  inputs: [],
  pickers: [],
  captures: [],
  cases: [],
  cleanup: {},
  limits: [
    "Virtual X11/software rendering on fresh Ubuntu 22.04 runner; no physical display claim.",
    "DEB Office only; AppImage and standalone Spreadsheet native acceptance remain separate pending cases.",
    "Full quit uses WebDriver session close with actual process disappearance/new PID, not application menu Quit.",
    "Only this genuine two-sheet fixture; no all-Gnumeric-variants claim.",
  ],
};
report.harnessFiles = Object.fromEntries(
  await Promise.all(
    [
      "proef-gnm-linux-native.mjs",
      "linux-p2-native-input.mjs",
      "linux-p2-native-capture.py",
      "linux-p2-native-package.py",
      "linux-p2-ribbon-native.mjs",
      "format30-gnm/oracle.py",
    ].map(async (p) => [p, hash(await readFile(join(here, p)))]),
  ),
);
const env = {
  ...process.env,
  GDK_BACKEND: "x11",
  LIBGL_ALWAYS_SOFTWARE: "1",
  XDG_CONFIG_HOME: join(out, "profile/config"),
  XDG_DATA_HOME: join(out, "profile/data"),
  XDG_CACHE_HOME: join(out, "profile/cache"),
};
let driver,
  driverPort,
  nativePort,
  driverStart,
  session,
  command,
  guard,
  phase = "setup",
  driverLog = "";
async function waitFor(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const a = await fn();
      if (a) return a;
    } catch (e) {
      last = String(e);
    }
    await delay(100);
  }
  throw Error(label + (last ? ": " + last : ""));
}
function pids() {
  try {
    return execFileSync("pgrep", ["-f", "^/usr/bin/open-office-studio( |$)"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}
async function freePort() {
  const s = createServer();
  await new Promise((ok, no) => s.listen(0, "127.0.0.1", ok).once("error", no));
  const p = s.address().port;
  await new Promise((ok) => s.close(ok));
  return p;
}
async function raw(method, path, body) {
  const r = await fetch(`http://127.0.0.1:${driverPort}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json();
  if (!r.ok || d.value?.error) throw Error(JSON.stringify(d));
  return d.value;
}
const evaluate = (f, ...args) =>
  command("POST", "/execute/sync", {
    script: `return (${f.toString()})(...arguments)`,
    args,
  });
async function observation() {
  return evaluate(() => ({
    title: document.title,
    hasFocus: document.hasFocus(),
    active: {
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute("aria-label"),
      testid: document.activeElement?.getAttribute("data-testid"),
      className: document.activeElement?.className,
    },
    tabs: [...document.querySelectorAll('.office-tab[role="tab"]')].map(
      (e) => ({
        text: e.textContent,
        selected: e.getAttribute("aria-selected"),
      }),
    ),
    sheets: [
      ...document.querySelectorAll(
        '[data-testid="xlsx-sheet-tabs"] [role="tab"]',
      ),
    ].map((e) => ({
      name: e.textContent,
      selected: e.getAttribute("aria-selected"),
    })),
    nameBox: document.querySelector(".rekenblad-naamvak")?.value,
    formula: document.querySelector('[data-testid="xlsx-formula-input"]')
      ?.value,
    grid: [...document.querySelectorAll('[role="grid"] [role="row"]')].map(
      (e) => ({
        row: e.querySelector('[role="rowheader"]')?.textContent,
        cells: [...e.querySelectorAll('[role="gridcell"]')].map((c) => ({
          text: c.textContent,
          selected: c.getAttribute("aria-selected"),
        })),
      }),
    ),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(
      (e) => e.textContent,
    ),
    alerts: [...document.querySelectorAll('[role="alert"]')].map(
      (e) => e.textContent,
    ),
  }));
}
async function click(selector, text) {
  const el = await waitFor(
    () =>
      evaluate(
        (s, t) => {
          const all = [...document.querySelectorAll(s)].filter(
            (e) =>
              e.getClientRects().length &&
              !e.disabled &&
              (t === null ||
                (e.getAttribute("aria-label") || e.textContent).trim() === t),
          );
          return all.length === 1 ? all[0] : null;
        },
        selector,
        text ?? null,
      ),
    "One visible " + selector + " " + (text ?? ""),
  );
  await guard.verify("before native element click");
  await command(
    "POST",
    `/element/${el["element-6066-11e4-a52e-4f735466cecf"]}/click`,
    {},
  );
  await guard.verify("after native element click");
  report.inputs.push({
    phase,
    kind: "WebDriver native element click",
    selector,
    text,
  });
}
async function key(chord, opensPicker = false) {
  assert.ok(
    new Set([
      "ctrl+a",
      "ctrl+s",
      "ctrl+o",
      "ctrl+shift+s",
      "Return",
      "Escape",
      "Tab",
    ]).has(chord),
  );
  await guard.verify("before " + chord);
  await exec("xdotool", ["key", "--clearmodifiers", chord], {
    env,
    timeout: 5000,
  });
  report.inputs.push({ phase, kind: "XTest key", chord });
  if (!opensPicker) await guard.verify("after " + chord);
}
async function type(text) {
  const sig = () => ({
    tag: document.activeElement?.tagName,
    label: document.activeElement?.getAttribute("aria-label"),
    testid: document.activeElement?.getAttribute("data-testid"),
    className: document.activeElement?.className,
  });
  const target = await evaluate(sig);
  await typeVerifiedNativeText({
    text,
    verify: async (stage) => {
      const a = await guard.verify(stage);
      assert.deepEqual(
        await evaluate(sig),
        target,
        "Exact native input remains focused per character",
      );
      return a;
    },
    run: (a) => exec("xdotool", a, { env, timeout: 5000 }),
    record: (a) => report.inputs.push({ phase, ...a }),
  });
}
async function cell(where, wanted) {
  await click(".rekenblad-naamvak");
  await key("ctrl+a");
  await type(where);
  await key("Return");
  const a = await waitFor(
    async () => {
      const o = await observation();
      return o.nameBox === where &&
        (wanted === undefined || o.formula === wanted)
        ? o
        : null;
    },
    "Native selected " + where + " formula/value " + wanted,
  );
  report.checks.push({
    phase,
    label: "native cell observation",
    where,
    wanted,
    actual: a,
  });
  return a;
}
async function edit(where, text) {
  await cell(where);
  await click('[data-testid="xlsx-formula-input"]');
  await key("ctrl+a");
  await type(text);
  await key("Return");
  await cell(where, text);
}
async function sheet(name) {
  await click('[data-testid="xlsx-sheet-tabs"] [role="tab"]', name);
  await waitFor(async () => {
    const o = await observation();
    return o.sheets.some((s) => s.name === name && s.selected === "true");
  }, "Native sheet " + name);
}
async function capture(name) {
  await guard.verify("before owned capture");
  await delay(150);
  const e = guard.evidence,
    path = join(out, name + ".png");
  const r = await exec(
    "/usr/bin/python3",
    [
      join(here, "linux-p2-native-capture.py"),
      String(e.pid),
      e.xid,
      e.binding.startTime,
      e.binding.executable,
      path,
    ],
    { env, timeout: 10000 },
  );
  const receipt = JSON.parse(r.stdout);
  assert.equal(hash(await readFile(path)), receipt.sha256);
  await guard.verify("after owned capture");
  report.captures.push({ phase, file: basename(path), ...receipt });
}
async function ready(names) {
  return waitFor(
    async () => {
      const o = await observation();
      return JSON.stringify(o.sheets.map((s) => s.name)) ===
        JSON.stringify(names) &&
        o.nameBox !== undefined &&
        o.grid.length > 0
        ? o
        : null;
    },
    "Real spreadsheet rendered with " + names.join(","),
    90000,
  );
}
async function start(path) {
  assert.equal(session, undefined);
  assert.deepEqual(pids(), []);
  const made = await raw("POST", "/session", {
    capabilities: {
      alwaysMatch: { "tauri:options": { application, args: [path] } },
    },
  });
  session = made.sessionId;
  command = createWriter362Transport({
    endpoint: `http://127.0.0.1:${driverPort}`,
    sessionId: session,
    timeoutMs: 30000,
  });
  const pid = Number(
    await waitFor(() => pids().length === 1 && pids()[0], "One owned app PID"),
  );
  assert.equal(await realpath(`/proc/${pid}/exe`), application);
  assert.equal(
    hash(await readFile(`/proc/${pid}/exe`)),
    identity.executableSha256,
  );
  await command("POST", "/window/rect", { width: 1600, height: 1000 });
  await waitFor(
    () => evaluate(() => Boolean(document.querySelector(".rekenblad-naamvak"))),
    "Spreadsheet visible",
    90000,
  );
  assert.equal(
    await evaluate(() => typeof window.__TAURI_INTERNALS__?.invoke),
    "function",
  );
  guard = createWriter362XTestInput({
    source: { pid, executableSha256: identity.executableSha256 },
    ownedProfile: true,
    display: env.DISPLAY,
    observe: () => evaluate(writer362DocumentFocus),
  });
  await guard.initialize();
  const record = {
    phase,
    pid,
    sessionId: session,
    openedCLI: basename(path),
    executableSha256: identity.executableSha256,
    x11: guard.evidence,
    environment: safeNativeEnvironment(await readFile(`/proc/${pid}/environ`)),
  };
  report.sessions.push(record);
  return record;
}
async function close() {
  if (!session) return;
  await command("DELETE", "/actions").catch(() => {});
  await raw("DELETE", `/session/${session}`);
  session = undefined;
  await waitFor(
    () => pids().length === 0,
    "Full actual app process exit",
    20000,
  );
  report.checks.push({
    phase,
    label: "full process exit",
    remainingPids: pids(),
  });
  guard = undefined;
}
async function focusedWindow() {
  const xid = (
    await exec("xdotool", ["getwindowfocus"], { env, timeout: 5000 })
  ).stdout.trim();
  const title = (
    await exec("xdotool", ["getwindowname", xid], { env, timeout: 5000 })
  ).stdout.trim();
  const pid = (
    await exec("xdotool", ["getwindowpid", xid], { env, timeout: 5000 })
  ).stdout.trim();
  return { xid, title, pid };
}
async function picker(path, title) {
  const d = await waitFor(
    async () => {
      const w = await focusedWindow();
      return w.title === title ? w : null;
    },
    "Exact native GTK picker title " + title,
    30000,
  );
  assert.notEqual(d.xid, guard.evidence.xid);
  const check = async () =>
    assert.deepEqual(
      await focusedWindow(),
      d,
      "Exact native dialog retains focus",
    );
  await check();
  await exec("xdotool", ["key", "--clearmodifiers", "ctrl+l"], {
    env,
    timeout: 5000,
  });
  await delay(120);
  await check();
  await exec("xdotool", ["key", "--clearmodifiers", "ctrl+a"], {
    env,
    timeout: 5000,
  });
  await check();
  assert.ok(path.startsWith(out + "/") && !/[\n\r]/.test(path));
  await exec(
    "xdotool",
    ["type", "--clearmodifiers", "--delay", "3", "--", path],
    { env, timeout: 10000 },
  );
  await check();
  await exec("xdotool", ["key", "--clearmodifiers", "Return"], {
    env,
    timeout: 5000,
  });
  await waitFor(
    async () => {
      const w = await focusedWindow();
      return w.xid === guard.evidence.xid;
    },
    "Picker closed and exact app window resumed",
    60000,
  );
  await guard.verify("after real GTK picker");
  report.pickers.push({
    phase,
    kind: "real GTK OS file picker",
    dialog: d,
    selectedPath: path,
    protocol:
      "wait exact dialog; Ctrl+L; Ctrl+A; XTest path; Return; owned app focus restored",
  });
}
async function openPicker(path) {
  await key("ctrl+o", true);
  await picker(path, "Open file");
  await ready(["Sheet1", "Sheet2"]);
}
async function oracle(source, xlsx, name, marker = true) {
  const dest = join(out, name + ".json");
  await exec(
    "/usr/bin/python3",
    [
      join(here, "format30-gnm/oracle.py"),
      "--source",
      source,
      "--xlsx",
      xlsx,
      ...(marker ? ["--marker"] : []),
      "--report",
      dest,
    ],
    { env, timeout: 10000 },
  );
  const r = JSON.parse(await readFile(dest, "utf8"));
  assert.equal(r.status, "passed");
  report.checks.push({
    phase,
    label: "independent gzip-source and XLSX ZIP/XML oracle",
    receipt: basename(dest),
    ...r,
  });
  return r;
}
async function saveAs(source, path, name) {
  await key("ctrl+shift+s");
  await waitFor(
    () =>
      evaluate(() =>
        Boolean(document.querySelector('.opslaanals[role="dialog"]')),
      ),
    "App Save as dialog",
  );
  await click('.opslaanals input[type="radio"][value="xlsx"]');
  assert.equal(
    await evaluate(
      () =>
        document.querySelector('.opslaanals input[type="radio"]:checked')
          ?.value,
    ),
    "xlsx",
  );
  await capture(name + "-save-as-xlsx");
  const el = await evaluate(() =>
    document.querySelector(".opslaanals .office-dialoogdoorgaan"),
  );
  await guard.verify("before Save as confirmation");
  await command(
    "POST",
    `/element/${el["element-6066-11e4-a52e-4f735466cecf"]}/click`,
    {},
  );
  await picker(path, "Save as");
  await waitFor(
    () =>
      stat(path)
        .then((s) => s.size > 1000)
        .catch(() => false),
    "XLSX produced by native Save as",
    30000,
  );
  return oracle(source, path, name + "-saved");
}
async function originals() {
  await sheet("Sheet1");
  for (const [where, v] of [
    ["A1", "1"],
    ["A2", "2"],
    ["B1", "String1"],
    ["B2", "String2"],
    ["C1", "=2*3"],
    ["C2", "=2+3"],
    ["C3", "=2-3"],
    ["C4", "=C1+C2"],
  ])
    await cell(where, v);
  await capture(phase + "-sheet1");
  await sheet("Sheet2");
  await cell("A1");
  await capture(phase + "-sheet2");
}
const sourceSha =
  "0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6";
const inputs = [];
try {
  const config = join(env.XDG_CONFIG_HOME, "org.openaec.office-studio");
  await mkdir(config, { recursive: true });
  await writeFile(
    join(config, "voorkeuren.json"),
    JSON.stringify({
      taal: "en",
      thema: "forge",
      updates: { automatisch: false },
    }),
  );
  const source = await readFile(
    join(here, "../tests/fixtures/gnm-linux/universal-content.gnumeric"),
  );
  assert.equal(source.length, 2062);
  assert.equal(hash(source), sourceSha);
  for (const ext of ["gnm", "gnumeric"]) {
    const path = join(out, "source." + ext);
    await writeFile(path, source);
    inputs.push(path);
  }
  const preflight = join(out, "preflight.xlsx");
  await writeFile(preflight, await readFile("public/templates/nieuw.xlsx"));
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
    s.on("data", (d) => (driverLog += d));
  driver.once("error", (e) => (driverLog += String(e)));
  driverStart = writer362ProcStartTime(
    await readFile(`/proc/${driver.pid}/stat`, "utf8"),
    driver.pid,
  );
  await waitFor(
    () => raw("GET", "/status").then((x) => x?.ready),
    "Native driver ready",
  );
  phase = "preflight";
  const a = await start(preflight);
  await edit("A1", "GNM PREFLIGHT");
  const before = hash(await readFile(preflight));
  await key("ctrl+s");
  await waitFor(async () => {
    const b = await readFile(preflight);
    return (
      hash(b) !== before &&
      Object.values(unzipSync(b)).some((x) =>
        strFromU8(x).includes("GNM PREFLIGHT"),
      )
    );
  }, "Native Ctrl+S updated on-disk XLSX");
  await capture("preflight-saved");
  await close();
  const b = await start(preflight);
  assert.notEqual(a.pid, b.pid);
  await cell("A1", "GNM PREFLIGHT");
  report.checks.push({
    phase,
    label:
      "native focus/Ctrl text/edit/save/full-quit/new-PID reopen preflight passed",
    firstPid: a.pid,
    reopenPid: b.pid,
  });
  await close();
  for (const input of inputs) {
    const ext = input.split(".").at(-1);
    phase = ext + "-import";
    const opened = await start(preflight);
    await openPicker(input);
    await originals();
    await edit("A1", "GNM30 EDIT");
    await capture(ext + "-edited");
    const output = join(out, ext + "-saved.xlsx");
    await saveAs(input, output, ext);
    await close();
    phase = ext + "-reopen";
    const reopened = await start(output);
    assert.notEqual(opened.pid, reopened.pid);
    await ready(["Sheet1", "Sheet2"]);
    await originals();
    await sheet("Sheet2");
    await cell("A1", "GNM30 EDIT");
    await capture(ext + "-reopened-marker");
    const proof = await oracle(input, output, ext + "-reopened");
    assert.equal(hash(await readFile(input)), sourceSha);
    await close();
    report.cases.push({
      extension: ext,
      status: "passed",
      sourceSha256: sourceSha,
      sourceBytes: source.length,
      sourcePath: basename(input),
      xlsx: basename(output),
      xlsxSha256: proof.xlsxSha256,
      firstPid: opened.pid,
      reopenPid: reopened.pid,
      cells: 8,
      formulas: 4,
      sheets: 2,
      edit: "Sheet2!A1 = GNM30 EDIT",
      originalUnchanged: true,
    });
  }
  for (const input of inputs)
    assert.equal(hash(await readFile(input)), sourceSha);
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.failedPhase = phase;
  report.error = String(e.stack ?? e);
  if (session) {
    report.failureObservation = await observation().catch((e) => ({
      error: String(e),
    }));
    report.focusedXWindow = await focusedWindow().catch((e) => ({
      error: String(e),
    }));
    await capture("failure").catch(
      (e) => (report.failureCaptureError = String(e)),
    );
  }
  process.exitCode = 1;
} finally {
  await close().catch((e) => (report.cleanup.sessionError = String(e)));
  if (driver && driver.exitCode === null && driverStart) {
    try {
      const s = await readFile(`/proc/${driver.pid}/stat`, "utf8");
      assert.equal(writer362ProcStartTime(s, driver.pid), driverStart);
      assert.equal(
        s.slice(s.lastIndexOf(")") + 2).split(/\s+/)[2],
        String(driver.pid),
      );
      process.kill(-driver.pid, "SIGTERM");
    } catch (e) {
      if (!["ENOENT", "ESRCH"].includes(e.code))
        report.cleanup.driverError = String(e);
    }
  }
  if (driver)
    await waitFor(
      () => driver.exitCode !== null || driver.signalCode !== null,
      "Owned driver exit",
      5000,
    ).catch((e) => (report.cleanup.driverExitError = String(e)));
  report.cleanup.driverExited =
    !driver || driver.exitCode !== null || driver.signalCode !== null;
  report.cleanup.remainingApplicationPids = pids();
  report.cleanup.ownedApplicationClosed = pids().length === 0;
  report.cleanup.capture =
    "Only own X11 window snapshots on disposable host; no persistent desktop capture client";
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
      cases: report.cases,
      cleanup: report.cleanup,
    }),
  );
}
