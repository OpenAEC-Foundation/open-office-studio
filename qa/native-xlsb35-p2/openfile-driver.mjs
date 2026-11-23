/** Only the missing P2 Linux OpenFile picker -> genuine XLSB import.
 * Only native input and read-only DOM observations; no editor/IPC/engine bridge.
 */
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, writeFile, access, stat } from "node:fs/promises";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createWriter362Transport, createWriter362XTestInput, writer362DocumentFocus, writer362ProcStartTime }
  from "./shared/scripts/linux-p2-ribbon-native.mjs";
import { createOwnedDialog, requireExactFocusedPath } from "./shared/scripts/linux-stw-dialog-input.mjs";

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.match(process.env.DISPLAY ?? "", /^:\d+(?:\.\d+)?$/);
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(".local/linux-p2-native/xlsb35-openfile");
const exec = promisify(execFile), hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const identity = JSON.parse(await readFile(".local/linux-p2-input/identity.json", "utf8"));
assert.equal(identity.sourceCommit, "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b");
assert.equal(identity.sourceTree, "5a644e397ecc6af5452a49b6404edf953687d1b2");
assert.equal(identity.version, "2026.48.1"); assert.equal(identity.executionApproved, true);
assert.equal(git("rev-parse", "HEAD"), identity.sourceCommit);
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
const application = "/usr/bin/open-office-studio";
assert.equal(hash(await readFile(application)), identity.executableSha256);
assert.equal(identity.executableSha256, "62923344ce4d11f6892ed1b1d4064ff5b85ce50c0286bb0a527bd121e46dd287");
const oracle = (...args) => JSON.parse(execFileSync("/usr/bin/python3", [join(here, "oracle.py"), ...args],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const sourceOracle = oracle();
const openLabel = JSON.parse(await readFile("src/i18n/locales/en/common.json", "utf8")).open;
await mkdir(join(out, "input"), { recursive: true });
const input = join(out, "input/NativeXLSB-source.xlsb");
await copyFile(join(here, "shared_formula.xlsb"), input);
const sourceSha = hash(await readFile(input)); assert.equal(sourceSha, sourceOracle.source.sha256);
const env = { ...process.env, GDK_BACKEND: "x11", LIBGL_ALWAYS_SOFTWARE: "1" };
for (const key of ["OPENAEC_CONVERSIE_PROGRAMMA", "OPENAEC_CONVERSIE_PROFIEL"]) delete env[key];
const report = { status: "running", phase: "setup", source: sourceOracle.source, origin: identity,
  harnessCommit: git("-C", here, "rev-parse", "HEAD"), startedAt: new Date().toISOString(),
  platform: "Linux x64 / installed Office DEB / headed WebKitGTK on private Xvfb and D-Bus",
  sessions: [], checks: [], inputs: [], captures: [], cleanup: {},
  limits: ["Only native OpenFile picker, one genuine XLSB fixture, actual A1 formula/cache and unchanged source. Valid previous SaveFile/edit/30-formula/reopen proof is reused, not repeated.",
    "Virtual X11/software graphics; no physical hardware, AppImage, final signed/standalone app or other-platform claim.",
    "Full process quit uses WebDriver DELETE session; menu Quit is not certified.",
    "No product code, editor bridge, DOM model setters, mocked IPC or direct converter call."] };
report.sharedHelpers = JSON.parse(await readFile(join(here, "shared-source.json"), "utf8"));
for (const pin of report.sharedHelpers)
  assert.equal(hash(await readFile(join(here, "shared", pin.path))), pin.sha256, "Immutable shared helper " + pin.path);
let driver, port, session, command, guard, driverLog = "", phase = "setup";
const exists = (p) => access(p).then(() => true, () => false);
async function waitFor(check, label, timeout = 40_000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) {
    try { const result = await check(); if (result) return result; } catch (e) { last = String(e); }
    await delay(150);
  }
  throw new Error(`${label}${last ? ": " + last : ""}`);
}
function pids() {
  try { return execFileSync("pgrep", ["-f", "^/usr/bin/open-office-studio( |$)"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s+/).filter(Boolean); }
  catch (e) { if (e.status === 1) return []; throw e; }
}
async function raw(method, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method,
    headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90_000) });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result));
  return result.value;
}
const evaluate = (fn, ...args) => command("POST", "/execute/sync", { script: `return (${fn.toString()})(...arguments)`, args });
function inspect() {
  const tab = document.querySelector('.office-tab[role=tab][aria-selected=true]');
  const panel = tab && document.getElementById(tab.getAttribute("aria-controls"));
  const name = panel?.querySelector('.rekenblad-naamvak');
  const formula = panel?.querySelector('[data-testid="xlsx-formula-input"]');
  const save = document.querySelector('.office-snelknop[aria-label="Save"]');
  return { tab: tab?.textContent.trim(), panel: panel?.id, panelBlocked: Boolean(panel?.closest("[hidden],[inert]")),
    name: name?.value, formula: formula?.value,
    readiness: { nameVisible: Boolean(name?.getClientRects().length), nameReadOnly: name?.readOnly, formulaVisible: Boolean(formula?.getClientRects().length), formulaDisabled: formula?.disabled, canvasVisible: Boolean(panel?.querySelector('[data-testid="xlsx-scroll"] canvas')?.getClientRects().length), fonts: document.fonts.status },
    ready: Boolean(name && formula && !name.readOnly && !formula.disabled && name.getClientRects().length &&
      panel?.querySelector('[data-testid="xlsx-scroll"] canvas')?.getClientRects().length && document.fonts.status === "loaded"),
    selectedCells: [...(panel?.querySelectorAll('[data-oos-rastercel][aria-selected=true]') ?? [])].map(c => ({
      address: `${c.getAttribute("aria-colindextext")}${c.getAttribute("aria-rowindextext")}`, label: c.getAttribute("aria-label"), text: c.textContent })),
    focusedTestId: document.activeElement?.getAttribute("data-testid"),
    gridFocused: Boolean(document.activeElement?.closest('[data-testid="xlsx-scroll"]')),
    saveEnabled: Boolean(save && !save.disabled && save.getClientRects().length),
    saveDialog: document.querySelector('[role="dialog"]')?.textContent,
    bodySummary: document.body.textContent.slice(-4500),
    nativeBackendPresent: typeof window.__TAURI_INTERNALS__?.invoke === "function" };
}
async function click(selector, after = true) {
  await guard.verify("before pointer " + selector);
  const element = await command("POST", "/element", { using: "css selector", value: selector });
  const id = element["element-6066-11e4-a52e-4f735466cecf"]; assert(id);
  await command("POST", `/element/${id}/click`, {});
  if (after) await guard.verify("after pointer " + selector);
}
async function key(value) {
  assert(/^(ctrl\+[asy]|Return|Escape|Tab)$/.test(value));
  await guard.verify("before native " + value);
  await exec("xdotool", ["key", "--clearmodifiers", value], { env, timeout: 5000 });
  await guard.verify("after native " + value);
  report.inputs.push({ phase, key: value, backend: "XTest" });
}
async function type(text, selector) {
  assert(/^[A-Za-z0-9_+=-]+$/.test(text));
  for (const character of text) {
    await guard.verify("before native character");
    assert(await evaluate((s) => document.activeElement?.matches(s), selector), "Exact visible input owns focus");
    const symbol = character === "=" ? "equal" : character === "+" ? "plus" : character === "_" ? "underscore" : character === "-" ? "minus" : character;
    await exec("xdotool", ["key", "--clearmodifiers", symbol], { env, timeout: 5000 });
    await guard.verify("after native character");
    assert(await evaluate((s) => document.activeElement?.matches(s), selector));
    report.inputs.push({ phase, character, selector, backend: "XTest" });
  }
}
async function goTo(address, formula, value) {
  await click('.rekenblad-naamvak'); await key("ctrl+a");
  await type(address, '.rekenblad-naamvak'); await key("Return");
  const actual = await waitFor(async () => {
    const s = await evaluate(inspect);
    const cell = s.selectedCells.find(c => c.address === address);
    return s.name === address && s.formula?.replace(/^=/, "").replaceAll(" ", "") === formula &&
      cell && new RegExp(`\\b${value}\\b`).test(cell.label || cell.text) ? s : null;
  }, "Actual selected cell/formula/value " + address);
  report.checks.push({ phase, selected: address, expectedFormula: formula, expectedValue: value, actual });
}
async function capture(name) {
  await guard.verify("before own-window capture");
  const e = guard.evidence, path = join(out, name);
  const { stdout } = await exec("/usr/bin/python3", [join(here, "shared/scripts/linux-p2-native-capture.py"),
    String(e.pid), e.xid, e.binding.startTime, e.binding.executable, path], { env, timeout: 10_000 });
  const receipt = JSON.parse(stdout); assert.equal(hash(await readFile(path)), receipt.sha256);
  await guard.verify("after own-window capture"); report.captures.push({ phase, file: name, ...receipt });
}
async function launchEmptyOffice() {
  assert.deepEqual(pids(), [], "No surviving app may overlap this native session");
  const created = await raw("POST", "/session", { capabilities: { alwaysMatch: {
    "tauri:options": { application, args: [] } } } });
  session = created.sessionId; assert(session);
  command = createWriter362Transport({ endpoint: `http://127.0.0.1:${port}`, sessionId: session, timeoutMs: 30_000 });
  const pid = Number(await waitFor(() => pids().length === 1 && pids()[0], "One owned Office PID"));
  assert.equal(await realpath(`/proc/${pid}/exe`), application);
  assert.equal(hash(await readFile(`/proc/${pid}/exe`)), identity.executableSha256);
  await command("POST", "/window/rect", { width: 1600, height: 1000 });
  guard = createWriter362XTestInput({ source: { pid, executableSha256: identity.executableSha256 },
    ownedProfile: true, display: env.DISPLAY, observe: () => evaluate(writer362DocumentFocus) });
  await guard.initialize();
  const ready = await waitFor(() => evaluate((label) => {
    const b = [...document.querySelectorAll('.office-snelknop')].filter(e =>
      e.getAttribute('aria-label') === label && !e.disabled && e.getClientRects().length);
    return b.length === 1 && typeof window.__TAURI_INTERNALS__?.invoke === 'function'
      ? { openButtonLabel: label, tab: document.querySelector('.office-tab[aria-selected=true]')?.textContent.trim(),
          nativeBackendPresent: true } : null;
  }, openLabel), 'Empty actual Office with unique visible enabled Open control');
  report.sessions.push({ phase, pid, sessionId: session, args: [], ready, x11: guard.evidence });
}
async function closeDocument() {
  if (!session) return;
  await command("DELETE", "/actions").catch(() => {});
  await raw("DELETE", `/session/${session}`); session = undefined;
  await waitFor(() => pids().length === 0, "Full Office process exit", 20_000);
  report.checks.push({ phase, fullProcessExit: true }); guard = undefined;
}
async function nativeOpenFile(path) {
  const root = join(out, 'open-picker'); await mkdir(root, { recursive: true });
  assert(await exists(path));
  const portalPath = join(root, "portal.json"), readyPath = join(root, "portal-ready.json");
  const observer = spawn("/usr/bin/python3", ["-u", join(here, "shared/scripts/linux-stw-portal.py"),
    "--pid", String(guard.evidence.pid), "--member", "OpenFile", "--name", basename(path), "--report", portalPath, "--ready", readyPath],
    { env, detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "", closed = false;
  observer.stderr.on("data", b => { stderr = (stderr + b.toString()).slice(-16000); });
  const completion = new Promise(ok => observer.once("close", (code, signal) => { closed = true; ok({ code, signal }); }));
  const groupAlive = () => { try { process.kill(-observer.pid, 0); return true; } catch (e) { if (e.code === "ESRCH") return false; throw e; } };
  try {
    await waitFor(async () => {
      assert(!closed, "Portal observer exited before readiness");
      const s = await readFile(readyPath, "utf8").then(JSON.parse).catch(() => null);
      return s?.status === "ready" && s.ownedPid === guard.evidence.pid;
    }, "Read-only portal observer ready BEFORE Open", 15_000);
    await capture("before-open.png");
    await click(`.office-snelknop[aria-label="${openLabel}"]`, false);
    const attributed = await waitFor(async () => {
      const s = await readFile(portalPath, "utf8").then(JSON.parse).catch(() => null);
      if (s?.status === "failed" || s?.status === "blocked") throw new Error(JSON.stringify(s));
      return s?.status === "attributed" ? s : null;
    }, "Credential-bound Office PID to native FileChooser request", 40_000);
    assert.equal(attributed.ownedPid, guard.evidence.pid);
    assert.equal(attributed.correlation.ownedPid, guard.evidence.pid);
    assert.equal(attributed.readyBeforeSave, true);
    const main = guard.evidence.binding;
    const verifyOffice = async () => {
      const pid = main.pid, executable = await realpath(`/proc/${pid}/exe`), info = await stat(`/proc/${pid}/exe`);
      assert.equal(writer362ProcStartTime(await readFile(`/proc/${pid}/stat`, "utf8"), pid), main.startTime);
      assert.equal(executable, main.executable);
      assert.equal([info.dev, info.ino, info.size, info.mtimeMs].join(":"), main.identity);
    };
    const dialog = await createOwnedDialog({ pid: attributed.correlation.backendPid,
      expectedExecutable: attributed.backendExecutable, expectedEnvironment: env,
      xdo: async args => { await verifyOffice(); const result = await exec("xdotool", args, { env, timeout: 5000 }); await verifyOffice(); return result.stdout.trim(); } });
    report.nativeOpenFile = { status: "running", attributed, dialog: dialog.evidence };
    const pickerCapture = async name => {
      await dialog.verify("before picker capture");
      const b = dialog.evidence.binding;
      const r = await exec("/usr/bin/python3", [join(here, "shared/scripts/linux-p2-native-capture.py"), String(b.pid), dialog.evidence.xid, b.startTime, b.executable, join(root, name)], { env, timeout: 10000 });
      report.captures.push({ phase, file: name, ...JSON.parse(r.stdout) });
      await dialog.verify("after picker capture");
    };
    await pickerCapture("picker-before-input.png");
    await dialog.key("ctrl+l"); await dialog.key("ctrl+a"); await dialog.typePath(path);
    const anatomy = JSON.parse((await exec("/usr/bin/python3", [join(here, "shared/scripts/linux-stw-gtk-anatomy.py"), String(attributed.correlation.backendPid)], { env, timeout: 15000 })).stdout);
    report.nativeOpenFile.focusedPath = requireExactFocusedPath(anatomy, attributed.correlation.backendPid, path);
    await writeFile(join(root, "picker-anatomy.json"), JSON.stringify(anatomy, null, 2));
    await pickerCapture("picker-filled.png"); await verifyOffice(); await dialog.submit();
    const opened = await waitFor(async () => {
      const state = await evaluate(inspect);
      return state.ready && !state.panelBlocked && state.nativeBackendPresent &&
        state.tab?.startsWith(basename(path).replace(/\.xlsb$/i, '.xlsx')) ? state : null;
    }, 'Real OpenFile XLSB selection -> normal Rust IPC/conversion -> selected XLSX editor', 90_000).catch(async error => {
      report.nativeOpenFile.openError = String(error);
      await pickerCapture('picker-after-open-failure.png').catch(e => {
        report.nativeOpenFile.failureCaptureError = String(e);
      });
      throw error;
    });
    report.nativeOpenFile.openedUi = opened;
    await verifyOffice(); report.nativeOpenFile.status = "passed";
    await writeFile(join(root, "native-open.json"), JSON.stringify(report.nativeOpenFile, null, 2));
  } finally {
    if (!closed) observer.kill("SIGTERM");
    let result = await Promise.race([completion, delay(12_000).then(() => null)]);
    if (!result || groupAlive()) {
      try { process.kill(-observer.pid, "SIGKILL"); } catch (e) { if (e.code !== "ESRCH") throw e; }
      result ??= await Promise.race([completion, delay(3000).then(() => null)]);
      await waitFor(() => !groupAlive(), "Owned portal observer group exit", 3000);
    }
    report.portalObserverCleanup = { ...result, closed, groupClosed: !groupAlive(), stderr };
    await writeFile(join(root, "observer-cleanup.json"), JSON.stringify(report.portalObserverCleanup, null, 2));
    assert(closed && !groupAlive(), "Owned observer/resources must close");
    assert.equal(result?.code, 0);
  }
  await guard.initialize();
}
try {
  assert.deepEqual(pids(), []);
  for (const name of ["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"])
    assert(resolve(env[name]).startsWith(join(out, "profile/")), "Caller-owned profile only");
  const config = join(env.XDG_CONFIG_HOME, "org.openaec.office-studio"); await mkdir(config, { recursive: true });
  await writeFile(join(config, "voorkeuren.json"), JSON.stringify({ taal: "en", updates: { automatisch: false } }));
  const server = createServer(); await new Promise(ok => server.listen(0, "127.0.0.1", ok));
  port = server.address().port; await new Promise(ok => server.close(ok));
  driver = spawn("tauri-driver", ["--port", String(port)], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [driver.stdout, driver.stderr]) stream.on("data", b => { driverLog = (driverLog + b.toString()).slice(-100000); });
  await waitFor(async () => (await raw("GET", "/status"))?.ready, "Native driver ready");

  phase = 'native-openfile-only'; report.phase = phase;
  await launchEmptyOffice();
  await nativeOpenFile(input);
  await goTo('A1', '1+2', 3);
  report.preflight = 'New host: exact Office PID/ELF/XID/focus, visible Open, actual native picker focused path and keyboard; source A1 selection via real visible name box';
  await capture('opened-through-picker.png');
  assert.equal(hash(await readFile(input)), sourceSha);
  assert.equal(hash(await readFile(join(here, 'shared_formula.xlsb'))), sourceSha);
  report.originalUnchanged = true;
  await closeDocument();
  report.status = 'passed'; report.phase = 'complete';
} catch (error) {
  report.status = "failed"; report.error = String(error.stack || error); report.phase = phase;
  if (command) report.failureUi = await evaluate(inspect).catch(e => ({ error: String(e) }));
  if (guard) await capture("failure.png").catch(e => { report.failureCaptureError = String(e); });
  throw error;
} finally {
  if (session) await closeDocument().catch(e => { report.cleanup.appCloseError = String(e); });
  if (driver?.pid) { try { process.kill(-driver.pid, "SIGTERM"); } catch (e) { if (e.code !== "ESRCH") report.cleanup.driverError = String(e); } }
  await waitFor(() => pids().length === 0, "Final owned Office cleanup", 5000).catch(() => {});
  report.cleanup.ownedOfficeClosed = pids().length === 0;
  if (driver?.pid) {
    const alive = () => { try { process.kill(-driver.pid, 0); return true; } catch (e) { if (e.code === "ESRCH") return false; throw e; } };
    await waitFor(() => !alive(), "Owned native driver group exit", 5000).catch(() => {});
    if (alive()) { try { process.kill(-driver.pid, "SIGKILL"); } catch (e) { if (e.code !== "ESRCH") throw e; } }
    await waitFor(() => !alive(), "Owned driver forced cleanup", 3000).catch(() => {});
    report.cleanup.driverGroupClosed = !alive();
  }
  report.cleanup.capture = "Synchronous owned-window GDK snapshot processes only; no persistent recording session";
  if (report.status === "passed" && (!report.cleanup.ownedOfficeClosed || !report.cleanup.driverGroupClosed)) {
    report.functionalStatus = "passed"; report.status = "failed-cleanup"; process.exitCode = 1;
  }
  report.sourceSha256After = hash(await readFile(input));
  report.originalUnchanged = report.sourceSha256After === sourceSha && hash(await readFile(join(here, "shared_formula.xlsb"))) === sourceSha;
  report.finishedAt = new Date().toISOString();
  await writeFile(join(out, "driver.log"), driverLog);
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
