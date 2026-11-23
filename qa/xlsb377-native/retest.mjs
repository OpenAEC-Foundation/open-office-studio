/** Fixed-package #377 native Ctrl+S/Save -> XLSX proposal and safe cancellation only.
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

assert.equal(process.platform, "linux");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.match(process.env.DISPLAY ?? "", /^:\d+(?:\.\d+)?$/);
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(".local/linux-p2-native/xlsb377");
const exec = promisify(execFile), hash = (b) => createHash("sha256").update(b).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const identity = JSON.parse(await readFile('.local/xlsb377-input/identity.json', 'utf8'));
assert.equal(identity.issue, 377); assert.equal(identity.executionApproved, true);
assert.equal(identity.sourceCommit, 'b696ab86bd1c128729a079b68c0082e6df3d36a5', 'Explicit frozen P5 source');
assert.equal(identity.sourceTree, 'e30879fd772871e690847c061ef66e6b81808a05');
assert.equal(identity.version, '2026.48.1');
assert.equal(git('rev-parse', 'HEAD'), identity.sourceCommit);
assert.equal(git('rev-parse', 'HEAD^{tree}'), identity.sourceTree);
assert.equal(git('status', '--porcelain', '--untracked-files=no'), '');
assert.equal(JSON.parse(await readFile('package.json', 'utf8')).version,identity.version);
const application = identity.executablePath;
assert.match(application, /^\/usr\/bin\/[a-z0-9-]+$/, 'Exact approved installed application path');
assert.equal(hash(await readFile(application)),identity.executableSha256);
const oracle = (...args) => JSON.parse(execFileSync("/usr/bin/python3", [join(here, "oracle.py"), ...args],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const sourceOracle = oracle();
const bundledLabel = JSON.parse(await readFile("src/i18n/locales/en/backstage.json", "utf8")).saveAs.sourceBundled;
assert.equal(bundledLabel, "included with the app");
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
  limits: ["Only #377 new-package Ctrl+S and Save proposal/cancellation; no edit, export or repeat of the prior full XLSB matrix.",
    "Only this bound installed DEB feature check on virtual X11/software graphics; no general standalone-independence, signing, AppImage, hardware or other-platform acceptance.",
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
  try { return execFileSync("pgrep", ["-f", "^" + application.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "( |$)"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s+/).filter(Boolean); }
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
    saveDialog: document.querySelector('.opslaanals[role="dialog"]')?.getClientRects().length
      ? document.querySelector('.opslaanals[role="dialog"]').textContent : null,
    dirty: Boolean(tab?.querySelector('.office-tabstip')),
    bodySummary: document.body.textContent.slice(-3000),
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
async function focusGrid() {
  await click('[data-testid="xlsx-formula-input"]'); await key("Escape");
  await waitFor(async () => (await evaluate(inspect)).gridFocused, "Actual spreadsheet grid focus");
}
async function capture(name) {
  await guard.verify("before own-window capture");
  const e = guard.evidence, path = join(out, name);
  const { stdout } = await exec("/usr/bin/python3", [join(here, "shared/scripts/linux-p2-native-capture.py"),
    String(e.pid), e.xid, e.binding.startTime, e.binding.executable, path], { env, timeout: 10_000 });
  const receipt = JSON.parse(stdout); assert.equal(hash(await readFile(path)), receipt.sha256);
  await guard.verify("after own-window capture"); report.captures.push({ phase, file: name, ...receipt });
}
async function openDocument(path) {
  assert.deepEqual(pids(), [], "No surviving app may overlap this native session");
  const created = await raw("POST", "/session", { capabilities: { alwaysMatch: {
    "tauri:options": { application, args: [path] } } } });
  session = created.sessionId; assert(session);
  command = createWriter362Transport({ endpoint: `http://127.0.0.1:${port}`, sessionId: session, timeoutMs: 30_000 });
  const pid = Number(await waitFor(() => pids().length === 1 && pids()[0], "One owned Office PID"));
  assert.equal(await realpath(`/proc/${pid}/exe`), application);
  assert.equal(hash(await readFile(`/proc/${pid}/exe`)), identity.executableSha256);
  await command("POST", "/window/rect", { width: 1600, height: 1000 });
  guard = createWriter362XTestInput({ source: { pid, executableSha256: identity.executableSha256 },
    ownedProfile: true, display: env.DISPLAY, observe: () => evaluate(writer362DocumentFocus) });
  await guard.initialize();
  const ready = await waitFor(async () => {
    const s = await evaluate(inspect);
    return s.ready && !s.panelBlocked && s.nativeBackendPresent && s.tab?.startsWith(basename(path).replace(/\.xlsb$/i, ".xlsx")) ? s : null;
  }, "Native selected XLSB/XLSX document canvas/input ready", 90_000);
  const entry = { phase, pid, sessionId: session, sourcePath: path, ready, x11: guard.evidence };
  report.sessions.push(entry); return entry;
}
async function closeDocument() {
  if (!session) return;
  await command("DELETE", "/actions").catch(() => {});
  await raw("DELETE", `/session/${session}`); session = undefined;
  await waitFor(() => pids().length === 0, "Full Office process exit", 20_000);
  report.checks.push({ phase, fullProcessExit: true }); guard = undefined;
}

async function fingerprint(path) {
  const info = await stat(path);
  return {sha256:hash(await readFile(path)),bytes:info.size,mtimeMs:info.mtimeMs,ino:info.ino,dev:info.dev};
}
const original = await fingerprint(input);
assert.equal(original.sha256,sourceSha);
async function unchanged(label) {
  const actual = await fingerprint(input);
  assert.deepEqual(actual,original,'Original XLSB bytes/identity/mtime unchanged: '+label);
  assert.equal(hash(await readFile(join(here,'shared_formula.xlsb'))),sourceSha);
  report.checks.push({label,originalSource:actual});
}
async function proposal(label, pointer=false) {
  await focusGrid();
  if(pointer) await click('.office-snelknop[aria-label="Save"]');
  else await key('ctrl+s');
  const actual = await waitFor(async()=>{
    const state = await evaluate(()=>{
      const dialog=document.querySelector('.opslaanals[role="dialog"]');
      return dialog?.getClientRects().length ? {
        extension:dialog.querySelector('.opslaanals-naam em')?.textContent,
        filename:dialog.querySelector('.opslaanals-naam input')?.value,
        runtime:dialog.querySelector('.opslaanals-runtime')?.textContent,
        text:dialog.textContent,
      } : null;
    });
    report.lastProposal = state;
    return state?.extension === '.xlsx' && state.runtime?.includes(bundledLabel) ? state : null;
  }, 'Actual '+label+' opens XLSX Save As with resolved bundled-runtime status');
  assert.equal(actual.extension,'.xlsx');
  assert(actual.runtime.includes(bundledLabel),'Approved bundled runtime is visibly selected');
  report.checks.push({label,proposal:actual});
  await unchanged('before cancelling '+label);
  await capture(label+'-xlsx-proposal.png');
  await key('Escape');
  await waitFor(async()=>{const ui=await evaluate(inspect);return !ui.saveDialog&&ui.ready&&!ui.panelBlocked&&ui.dirty?ui:null;},'Cancel preserves unsaved imported working copy');
  await unchanged('after cancelling '+label);
  await goTo('A1','1+2',3);
  await capture(label+'-cancelled.png');
}
try {
  assert.deepEqual(pids(),[]);
  for(const name of ['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'])
    assert(resolve(env[name]).startsWith(join(out,'profile/')));
  const config=join(env.XDG_CONFIG_HOME,'org.openaec.office-studio');await mkdir(config,{recursive:true});
  await writeFile(join(config,'voorkeuren.json'),JSON.stringify({taal:'en',updates:{automatisch:false}}));
  const server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));port=server.address().port;await new Promise(ok=>server.close(ok));
  driver=spawn('tauri-driver',['--port',String(port)],{env,detached:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [driver.stdout,driver.stderr])stream.on('data',b=>{driverLog=(driverLog+b.toString()).slice(-100000);});
  await waitFor(async()=>(await raw('GET','/status'))?.ready,'Native driver ready');
  phase='native-377-fixed-package';report.phase=phase;
  await openDocument(input);
  await goTo('A1','1+2',3);
  assert((await evaluate(inspect)).dirty,'Real imported copy is unsaved, not clean existing XLSX');
  await unchanged('after actual XLSB import');
  await capture('imported-source.png');
  await proposal('ctrl-s');
  await proposal('save-button',true);
  await closeDocument();
  await unchanged('after full Office quit');
  report.originalUnchanged=true;report.status='passed';report.phase='complete';
} catch(error) {
  report.status='failed';report.error=String(error.stack||error);report.phase=phase;
  if(command)report.failureUi=await evaluate(inspect).catch(e=>({error:String(e)}));
  if(guard)await capture('failure.png').catch(e=>{report.failureCaptureError=String(e);});
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
  report.finishedAt = new Date().toISOString();
  await writeFile(join(out, "driver.log"), driverLog);
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
