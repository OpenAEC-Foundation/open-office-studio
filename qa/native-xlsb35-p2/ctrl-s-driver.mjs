/** Investigate only original P2 Linux Ctrl+S immediately after genuine XLSB import.
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
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(".local/linux-p2-native/xlsb35-ctrl-s");
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
const saveAsLabel = JSON.parse(await readFile("src/i18n/locales/en/shell.json", "utf8")).header.saveAs;
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
  limits: ["Only Ctrl+S/Save/Save As after original XLSB import; no edit or saved-file matrix.",
    "Virtual X11/software graphics; no physical hardware, AppImage, final signed/standalone app or other-platform claim.",
    "Full process quit uses WebDriver DELETE session; menu Quit is not certified.",
    "No product code, editor bridge, DOM model setters, mocked IPC or direct converter call."] };
report.sharedHelpers = JSON.parse(await readFile(join(here, "shared-source.json"), "utf8"));
for (const pin of report.sharedHelpers)
  assert.equal(hash(await readFile(join(here, "shared", pin.path))), pin.sha256, "Immutable shared helper " + pin.path);
let driver, port, session, command, guard, driverLog = "", phase = "setup", tracer;
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

const tracePath = join(out, 'execve.log');
const zenityPath = async () => exec('which', ['zenity'], { env }).then(r => r.stdout.trim(), () => null);
async function ownedZenity(pid) {
  const children = (await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')).trim().split(/\s+/).filter(Boolean);
  const result = [];
  for (const candidate of children) {
    const executable = await realpath(`/proc/${candidate}/exe`).catch(() => null);
    if (executable?.endsWith('/zenity')) result.push({ pid: Number(candidate), executable });
  }
  assert(result.length <= 1, 'At most one actual direct Zenity child of exact Office PID');
  return result[0];
}
async function startTrace() {
  const pid = guard.evidence.pid;
  await guard.verify('before readonly owned execve trace');
  tracer = spawn('sudo', ['-n', 'strace', '-f', '-s', '1000', '-e', 'trace=execve', '-p', String(pid), '-o', tracePath],
    { env, detached: true, stdio: ['ignore','ignore','pipe'] });
  report.trace = { pid: tracer.pid, target: pid, stderr: '' };
  tracer.stderr.on('data', b => { report.trace.stderr = (report.trace.stderr+b.toString()).slice(-6000); });
  await waitFor(async () => /TracerPid:\s+[1-9]/.test(await readFile(`/proc/${pid}/status`, 'utf8')), 'Read-only tracer attached to exact own Office PID');
}
async function stopTrace() {
  if (!tracer) return;
  await exec('sudo', ['-n', 'kill', '-INT', '--', `-${tracer.pid}`], { env, timeout: 5000 }).catch(() => {});
  const alive = () => { try { process.kill(-tracer.pid,0); return true; } catch(e) { if(e.code==='ESRCH')return false; if(e.code==='EPERM')return true; throw e; } };
  await waitFor(() => !alive(), 'Own tracer group exit', 5000).catch(() => {});
  if (alive()) await exec('sudo', ['-n', 'kill', '-KILL', '--', `-${tracer.pid}`], { env, timeout: 5000 }).catch(() => {});
  await waitFor(() => !alive(), 'Own tracer group closed', 5000);
  report.cleanup.tracerGroupClosed = true;
  tracer = undefined;
}
async function fileState(label) {
  const original = hash(await readFile(input)), fixture = hash(await readFile(join(here,'shared_formula.xlsb')));
  assert.equal(original,sourceSha); assert.equal(fixture,sourceSha);
  const { stdout } = await exec('/usr/bin/python3',['-c',
    'import pathlib,hashlib,json,sys; p=pathlib.Path(sys.argv[1]); print(json.dumps([{ "path":str(f.relative_to(p)),"sha256":hashlib.sha256(f.read_bytes()).hexdigest(),"bytes":f.stat().st_size} for f in p.rglob("*") if f.is_file()]))',join(out,'input')],{env});
  report.checks.push({label,sourceSha256:original,fixtureSha256:fixture,inputFiles:JSON.parse(stdout)});
}
async function cancelNativeConfirmation(child, label) {
  const pid = guard.evidence.pid, officeBinding = guard.evidence.binding;
  const verifyOffice = async () => {
    assert.equal(writer362ProcStartTime(await readFile(`/proc/${pid}/stat`,'utf8'),pid),officeBinding.startTime);
    assert.equal(await realpath(`/proc/${pid}/exe`),application);
  };
  const xdo = async args => { await verifyOffice();const r=await exec('xdotool',args,{env,timeout:5000});await verifyOffice();return r.stdout.trim(); };
  const dialog = await createOwnedDialog({pid:child.pid,expectedExecutable:child.executable,expectedEnvironment:env,xdo});
  assert.equal((await readFile(`/proc/${pid}/task/${pid}/children`,'utf8')).trim().split(/\s+/).includes(String(child.pid)),true);
  const anatomy = JSON.parse((await exec('/usr/bin/python3',[join(here,'shared/scripts/linux-stw-gtk-anatomy.py'),String(child.pid)],{env,timeout:15000})).stdout);
  const texts=anatomy.nodes.map(n=>n.name+' '+(n.text??'')).join('\n');
  assert(texts.includes('NativeXLSB-source.xlsb'),'Actual confirmation names original XLSB');
  assert(texts.includes('XLSB'),'Actual original-format confirmation is visible');
  const b=dialog.evidence.binding;
  const receipt=JSON.parse((await exec('/usr/bin/python3',[join(here,'shared/scripts/linux-p2-native-capture.py'),String(child.pid),dialog.evidence.xid,b.startTime,b.executable,join(out,label+'.png')],{env,timeout:10000})).stdout);
  report.captures.push({phase,file:label+'.png',...receipt});
  report.confirmation={child,dialog:dialog.evidence,anatomy};
  await dialog.verify('before actual native Escape cancellation');
  await xdo(['key','--clearmodifiers','Escape']);
  await waitFor(async()=>!await exists(`/proc/${child.pid}`),'Owned native confirmation exited after actual cancellation');
  await guard.initialize();
}
async function triggerSave(label, pointer=false) {
  const before=await readFile(tracePath,'utf8');
  await guard.verify('before '+label);
  if(pointer) await click('.office-snelknop[aria-label="Save"]',false);
  else {await exec('xdotool',['key','--clearmodifiers','ctrl+s'],{env,timeout:5000});report.inputs.push({phase,key:'ctrl+s',backend:'XTest'});}
  await delay(1800);
  const child=await ownedZenity(guard.evidence.pid);
  const delta=(await readFile(tracePath,'utf8')).slice(before.length);
  report.checks.push({label,zenityChild:child??null,execveDelta:delta,ui:await evaluate(inspect)});
  if(child) await cancelNativeConfirmation(child,label+'-confirmation');
  else {await guard.verify('after '+label);await capture(label+'.png');}
  await fileState('unchanged after '+label);
  return {child,delta};
}
try {
  assert.deepEqual(pids(), []);
  for(const name of ['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'])
    assert(resolve(env[name]).startsWith(join(out,'profile/')));
  const config=join(env.XDG_CONFIG_HOME,'org.openaec.office-studio');await mkdir(config,{recursive:true});
  await writeFile(join(config,'voorkeuren.json'),JSON.stringify({taal:'en',updates:{automatisch:false}}));
  const server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));port=server.address().port;await new Promise(ok=>server.close(ok));
  driver=spawn('tauri-driver',['--port',String(port)],{env,detached:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [driver.stdout,driver.stderr])stream.on('data',b=>{driverLog=(driverLog+b.toString()).slice(-100000);});
  await waitFor(async()=>(await raw('GET','/status'))?.ready,'Native driver ready');
  phase='original-P2-ctrl-s-diagnosis';report.phase=phase;
  report.packageDepends=(await exec('dpkg-deb',['-f','.local/linux-p2-input/canonical-office.deb','Depends'],{env})).stdout.trim();
  report.initialZenity=await zenityPath();
  await openDocument(input);await goTo('A1','1+2',3);await focusGrid();await capture('before-ctrl-s.png');
  await fileState('original before Ctrl+S');await startTrace();
  const first=await triggerSave('original-ctrl-s');
  if(!report.initialZenity){
    assert(!first.child && /zenity/.test(first.delta) && /ENOENT/.test(first.delta),'Actual native Ctrl+S attempted unavailable Zenity');
    const control=await triggerSave('original-save-button',true);
    assert(!control.child && /zenity/.test(control.delta) && /ENOENT/.test(control.delta),'Actual Save button reaches same unavailable confirmation');
  } else assert(first.child,'Installed Zenity must show actual confirmation, not silent no-op');
  await click(`.office-snelknop[aria-label="${saveAsLabel}"]`);
  report.explicitSaveAs=await waitFor(()=>evaluate(()=>({extension:document.querySelector('.opslaanals-naam em')?.textContent,runtime:document.querySelector('.opslaanals-runtime')?.textContent})).then(x=>x.extension==='.xlsx'&&x.runtime?.includes(bundledLabel)?x:null),'Explicit visible Save As still proposes XLSX and bundled safe runtime');
  await capture('explicit-save-as.png');await key('Escape');
  await waitFor(async()=>!(await evaluate(inspect)).saveDialog,'Real app Save As cancelled');
  if(!report.initialZenity){
    const installed=await exec('sudo',['-n','apt-get','install','-y','--no-install-recommends','zenity'],{env,timeout:180000,maxBuffer:1000000});
    await writeFile(join(out,'diagnostic-install-zenity.log'),installed.stdout+installed.stderr);
    report.afterDiagnosticInstall=await zenityPath();assert(report.afterDiagnosticInstall);
    await focusGrid();const repaired=await triggerSave('with-zenity-ctrl-s');
    assert(repaired.child,'Same unchanged app produces real confirmation after only installing missing dependency');
    report.diagnosis='Missing undeclared Linux Zenity dependency: original Ctrl+S and Save silently cancel their foreign-format confirmation; same app with Zenity displays it. Explicit Save As works independently.';
  } else report.diagnosis='Native confirmation already works with Zenity present; original missing-window observation not reproduced on this host.';
  await stopTrace();await fileState('final unchanged source');await closeDocument();
  report.status='diagnosed';report.phase='complete';report.originalUnchanged=true;
} catch(error){
  report.status='failed';report.error=String(error.stack||error);report.phase=phase;
  if(command)report.failureUi=await evaluate(inspect).catch(e=>({error:String(e)}));
  if(guard)await capture('failure.png').catch(e=>{report.failureCaptureError=String(e);});
  throw error;
} finally {
  await stopTrace().catch(e=>{report.cleanup.traceError=String(e);});
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
  if (report.status === "diagnosed" && (!report.cleanup.ownedOfficeClosed || !report.cleanup.driverGroupClosed)) {
    report.functionalStatus = "diagnosed"; report.status = "failed-cleanup"; process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(out, "driver.log"), driverLog);
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
