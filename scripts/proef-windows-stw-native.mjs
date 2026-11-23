/** Exact installer, actual WebView2 input, disk save and full process reopen.
 * Restricted to a disposable Windows runner; never launches the user's app.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { DOMParser } from "@xmldom/xmldom";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

assert.equal(process.platform, "win32");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const [manifestFile, outputDirectory] = process.argv.slice(2);
assert(manifestFile && outputDirectory, "Pass frozen candidate JSON and fresh output directory");
const identity = JSON.parse(await readFile(manifestFile, "utf8"));
assert.equal(identity.executeNative, true);
assert.equal(identity.developmentBuild, true);
assert.equal(identity.signingRequired, false, "This separate STW case is explicitly ordinary DEV, not final signed acceptance");
assert.match(identity.applicationCommit, /^[a-f0-9]{40}$/);
assert.match(identity.applicationTree, /^[a-f0-9]{40}$/);
if (identity.builderCommit) assert.match(identity.builderCommit, /^[a-f0-9]{40}$/);
assert.match(identity.version, /^2026\.\d+\.\d+$/);
for (const key of ["archiveSha256", "packageSha256"]) assert.match(identity[key], /^[a-f0-9]{64}$/);
for (const key of ["runId", "artifactId"]) assert(Number.isSafeInteger(identity[key]) && identity[key] > 0);
assert(/-setup\.exe$/.test(identity.packageMember));
assert(!identity.packageMember.includes("..") && !identity.packageMember.includes("\\"));
const out = resolve(outputDirectory);
await mkdir(dirname(out), { recursive: true });
await mkdir(out); // Do not overwrite earlier evidence.
const sha = (b) => createHash("sha256").update(b).digest("hex");
const report = {
  status: "running", identity, harnessCommit: execFileSync("git", ["-C", resolve(dirname(fileURLToPath(import.meta.url)), ".."), "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
  harnessSha256: sha(await readFile(new URL(import.meta.url))), checks: [], errors: [], cleanup: {},
  platform: "Windows hosted runner / installed NSIS / actual WebView2 CDP keyboard and pointer",
  limits: ["Ordinary unsigned P2 Desktop package, not final signed acceptance", "One legacy STW, no tables, no full pagination/font/TOC evaluation", "CDP input on isolated native WebView2 plus real Windows UIA file dialogs"],
};
let app, browser, page, policy, installation;
const processes = [];
const env = { ...process.env, APPDATA: join(out, "profile/Roaming"), LOCALAPPDATA: join(out, "profile/Local") };
delete env.OPENAEC_CONVERSIE_PROGRAMMA;
delete env.OPENAEC_CONVERSIE_PROFIEL;
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
const marker = " â€” STW30 EDIT 2026-11-23";
const documentPath = join(out, "STW native roundtrip.docx");
const sourcePath = join(out, "original.stw");
const sourceOracle = join(out, "source-oracle.json");
const oracleScript = fileURLToPath(new URL("format30-stw-oracle.py", import.meta.url));
let sourceInfo;
function audit(path, name, edit = "") {
  const result = join(out, `${name}-oracle.json`);
  execFileSync("python", ["-B", oracleScript, "audit", path, "--oracle", sourceOracle, "--marker", edit, "--report", result], { stdio: "inherit", timeout: 30000 });
  return readFile(result, "utf8").then(JSON.parse);
}
function nativeDialog(pid, path, name) {
  execFileSync("python", ["-B", "scripts/windows-stw-file-dialog.py", String(pid), path, join(out, `${name}-dialog.json`)], { stdio: "inherit", windowsHide: true, timeout: 60000 });
}
function ps(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, timeout: 30_000 }).trim();
}
async function waitFor(check, label, timeout = 45_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const value = await check(); if (value) return value; } catch (e) { last = String(e); }
    await delay(200);
  }
  throw new Error(`${label}${last ? `: ${last}` : ""}`);
}
async function diskState() {
  const bytes = await readFile(documentPath);
  const doc = new DOMParser().parseFromString(strFromU8(unzipSync(bytes)["word/document.xml"]), "application/xml");
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p")).map(c => Array.from(c.getElementsByTagNameNS(ns, "t")).map(t => t.textContent).join("")).filter(Boolean);
  return { sha256: sha(bytes), paragraphs };
}
function isAlive(process_) {
  if (!process_?.pid || process_.exitCode !== null) return false;
  try { process.kill(process_.pid, 0); return true; } catch { return false; }
}
async function startApplication(exe, port, path) {
  // A real visible native window is intentional on this disposable test host.
  app = spawn(exe, path ? [path] : [], { env, cwd: dirname(exe), stdio: ["ignore", "pipe", "pipe"] });
  const run = { pid: app.pid, executable: exe, stdout: "", stderr: "" };
  processes.push({ process: app, record: run });
  for (const type of ["stdout", "stderr"]) app[type].on("data", b => run[type] = (run[type] + b).slice(-32_000));
  app.once("error", e => run.error = String(e));
  app.once("exit", (code, signal) => run.exit = { code, signal });
  await waitFor(async () => {
    if (run.error || app.exitCode !== null) throw new Error(JSON.stringify(run));
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); return true; } catch { return false; }
  }, "Actual installed WebView2 must be accessible", 90_000);
  page = await waitFor(() => browser.contexts().flatMap(c => c.pages()).find(p => /tauri|localhost/.test(p.url())), "Native page");
  page.setDefaultTimeout(30_000);
  page.on("pageerror", e => report.errors.push(String(e)));
  await page.waitForFunction(() => typeof window.__TAURI_INTERNALS__?.invoke === "function");
  assert.equal(await page.evaluate(() => Boolean(window.__writerApis || window.__writerWarmup)), false, "No compiled diagnostic editor bridge");
  run.runtimeStatus = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("conversie_status"));
  assert.equal(run.runtimeStatus.bron, "meegeleverd");
  return app.pid;
}
async function closeApplication() {
  let error;
  try { await page.locator(".office-vensterknop-sluiten").click(); } catch (e) { error = e; }
  await waitFor(() => !isAlive(app), "Normal native window close must fully exit");
  await waitFor(() => app.exitCode !== null, "Native exit code");
  assert.equal(app.exitCode, 0, "Normal native close exits successfully");
  // WebView2 can disconnect before the click acknowledgement reaches CDP.
  // Accept that transport outcome only after the owned app actually exits0.
  if (error && !/closed|disconnected/i.test(String(error))) throw error;
  await browser?.close().catch(() => {});
  browser = undefined; page = undefined;
}
try {
  assert.equal(ps("@(Get-Process -Name open-office-studio -ErrorAction SilentlyContinue).Count"), "0", "No existing app may intercept this test");
  const run = JSON.parse(execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/runs/${identity.runId}`], { encoding: "utf8", windowsHide: true }));
  const api = path => JSON.parse(execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/${path}`], { encoding: "utf8", windowsHide: true }));
  const artifact = api(`actions/artifacts/${identity.artifactId}`);
  assert.equal(run.head_sha, identity.builderCommit || identity.applicationCommit);
  assert.equal(artifact.workflow_run.id, identity.runId); assert.equal(artifact.expired, false);
  assert.equal(run.path, ".github/workflows/desktop.yml");
  assert.equal(run.head_repository.full_name, "OpenAEC-Foundation/open-office-studio");
  assert.equal(api(`git/commits/${identity.applicationCommit}`).tree.sha, identity.applicationTree);
  assert.equal(JSON.parse(Buffer.from(api(`contents/package.json?ref=${identity.applicationCommit}`).content, "base64")).version, identity.version);
  const job = api(`actions/runs/${identity.runId}/attempts/${identity.producerRunAttempt}/jobs?per_page=100`).jobs.find(j => j.id === identity.producerJobId);
  assert(job); assert.equal(job.run_id, identity.runId); assert.equal(job.run_attempt, identity.producerRunAttempt);
  assert.equal(job.head_sha, identity.applicationCommit); assert.equal(job.conclusion, "success");
  assert.equal(job.name, "desktop (windows-latest)");
  const gates = ["Windows-pakket bouwen", "Windows-installer werkelijk uitpakken en controleren"].map(name => {
    const s = job.steps.find(s => s.name === name); assert(s); assert.equal(s.conclusion, "success"); return s;
  });
  const reportArtifact = api(`actions/artifacts/${identity.reportArtifactId}`);
  for (const [a, digest] of [[artifact, identity.archiveSha256], [reportArtifact, identity.reportArchiveSha256]]) {
    assert.equal(a.workflow_run.id, identity.runId); assert.equal(a.workflow_run.head_sha, identity.applicationCommit);
    assert.equal(a.expired, false); assert.equal(a.digest, `sha256:${digest}`);
    const time = Date.parse(a.created_at);
    assert(Number.isFinite(time) && Date.parse(job.started_at) <= time && time <= Date.parse(job.completed_at));
    assert(gates.every(s => Date.parse(s.completed_at) <= time));
  }
  const reportZipPath = join(out, "package-report.zip"), reportFd = openSync(reportZipPath, "wx");
  try { execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/${identity.reportArtifactId}/zip`], { stdio: ["ignore", reportFd, "pipe"], windowsHide: true }); } finally { closeSync(reportFd); }
  const reportZip = await readFile(reportZipPath); assert.equal(sha(reportZip), identity.reportArchiveSha256);
  const reportBytes = unzipSync(reportZip)["pakketcontrole-Windows.json"]; assert(reportBytes);
  assert.equal(sha(reportBytes), identity.reportSha256);
  const packageReport = JSON.parse(strFromU8(reportBytes));
  assert.equal(packageReport.versie, identity.version); assert.equal(packageReport.platform, "windows"); assert.equal(packageReport.programma, "open-office-studio");
  assert.equal(packageReport.pakketten.length, 1); assert.equal(packageReport.pakketten[0].sha256, identity.packageSha256);
  assert.equal(packageReport.pakketten[0].bytes, identity.packageBytes);
  assert.equal(packageReport.pakketten[0].naam, identity.packageMember.split("/").at(-1));
  report.canonicalBinding = { source: run.head_sha, tree: identity.applicationTree, workflow: run.path, jobId: job.id, attempt: job.run_attempt, artifactCreatedAt: artifact.created_at, reportArtifactId: reportArtifact.id, reportCreatedAt: reportArtifact.created_at, gates, packageReport };
  report.run = { id: run.id, head_sha: run.head_sha, status: run.status, conclusion: run.conclusion };
  report.artifact = { id: artifact.id, name: artifact.name, digest: artifact.digest };
  const zipPath = join(out, "artifact.zip"), fd = openSync(zipPath, "wx");
  try { execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/${identity.artifactId}/zip`], { windowsHide: true, stdio: ["ignore", fd, "pipe"], timeout: 300_000 }); } finally { closeSync(fd); }
  const zip = await readFile(zipPath);
  report.archiveSha256 = sha(zip); assert.equal(report.archiveSha256, identity.archiveSha256);
  const contents = unzipSync(zip, { filter: entry => entry.name === identity.packageMember || entry.name === "provenance.json" });
  const bytes = contents[identity.packageMember]; assert(bytes, "Exact frozen NSIS member must exist");
  assert.equal(bytes.length, identity.packageBytes);
  report.packageSha256 = sha(bytes); assert.equal(report.packageSha256, identity.packageSha256);
  report.checks.push({ name: "canonical P2 Desktop source, job, report, archive and installer identities verified" });
  const installer = join(out, "installer-setup.exe"); await writeFile(installer, bytes);
  // Independently inspect the real immutable NSIS payload before installation.
  const payload = join(out, "payload"); await mkdir(payload);
  let sevenZip = "C:\\Program Files\\7-Zip\\7z.exe";
  try { await access(sevenZip); } catch { sevenZip = "7z"; }
  const extraction = execFileSync(sevenZip, ["e", "-y", "-r", `-o${payload}`, installer, "open-office-studio.exe"], { encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  await writeFile(join(out, "payload-extraction.log"), extraction);
  const payloadBytes = await readFile(join(payload, "open-office-studio.exe"));
  report.payloadExecutableSha256 = sha(payloadBytes);
  if (identity.expectedPackagedExecutableSha256) assert.equal(report.payloadExecutableSha256, identity.expectedPackagedExecutableSha256);
  report.checks.push({ name: "independent immutable NSIS payload hash recorded; installed bytes must match" });
  sourceInfo = JSON.parse(await readFile("docs/tests/format30-stw/source.json", "utf8"));
  assert.equal(sourceInfo.applicationCommit, identity.applicationCommit);
  const response = await fetch(sourceInfo.fixture.url, { signal: AbortSignal.timeout(30000) }); assert(response.ok);
  const fixture = Buffer.from(await response.arrayBuffer());
  assert.equal(fixture.length, sourceInfo.fixture.bytes); assert.equal(sha(fixture), sourceInfo.fixture.sha256);
  await writeFile(sourcePath, fixture, { flag: "wx" }); report.fixtureSha256 = sha(fixture);
  execFileSync("python", ["-B", oracleScript, "source", sourcePath, "--report", sourceOracle], { stdio: "inherit", timeout: 30000 });
  await mkdir(env.APPDATA, { recursive: true }); await mkdir(env.LOCALAPPDATA, { recursive: true });
  installation = join(out, "installed");
  execFileSync(installer, ["/S", `/D=${installation}`], { env, windowsHide: true, timeout: 600_000, stdio: "inherit" });
  const exe = join(installation, "open-office-studio.exe"); await access(exe); await access(join(installation, "uninstall.exe"));
  report.executableSha256 = sha(await readFile(exe));
  assert.equal(report.executableSha256, report.payloadExecutableSha256, "Installed executable equals the independently extracted immutable NSIS payload");
  report.fileVersion = ps(`(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.ProductVersion`);
  assert([identity.version, identity.version + ".0"].includes(report.fileVersion), report.fileVersion);
  const server = createServer(); await new Promise(done => server.listen(0, "127.0.0.1", done)); const port = server.address().port; await new Promise(done => server.close(done));
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
  env.WEBVIEW2_USER_DATA_FOLDER = join(out, "webview-profile");
  policy = join(out, "policy-state.json");
  execFileSync("pwsh", ["-NoProfile", "-File", "scripts/runtime-webview2-ci.ps1", "-Phase", "Enable", "-StateFile", policy, "-Port", String(port)], { env, windowsHide: true, stdio: "inherit" });
  const firstPid = await startApplication(exe, port);
  await page.keyboard.press("Control+o"); nativeDialog(firstPid, sourcePath, "open-stw");
  await page.waitForFunction(() => document.fonts.status === "loaded" && Boolean(document.querySelector(".canvas-page canvas")), null, { timeout: 90000 });
  await page.waitForFunction(() => { const b = document.querySelector(".office-snelknop:has(.lucide-save-all)"); return b && !b.disabled; });
  await page.screenshot({ path: join(out, "stw-opened.png") });
  report.checks.push({ name: "real native file picker opens original STW through production IPC and bundled converter" });
  await page.locator(".canvas-page canvas").first().click({ position: { x: 150, y: 110 } });
  await page.waitForFunction(() => document.activeElement?.matches(".paged-editor__yrs-input"));
  await page.keyboard.press("Control+Home"); await page.keyboard.press("End");
  await page.keyboard.type(marker);
  await page.screenshot({ path: join(out, "stw-edited.png") });
  await page.keyboard.press("Control+Shift+s");
  const save = page.getByRole("dialog", { name: /Save as|Opslaan als/i });
  await save.getByLabel(/File name|Bestandsnaam/i).fill("STW native roundtrip");
  await save.locator('input[type="radio"][value="docx"]').check();
  await save.getByRole("button", { name: /^(Save|Opslaan)$/ }).click();
  nativeDialog(firstPid, documentPath, "save-docx");
  await waitFor(() => access(documentPath).then(() => true).catch(() => false), "Native SaveAs must create the actual DOCX");
  report.savedAudit = await audit(documentPath, "saved", marker);
  report.saved = await diskState(); await page.screenshot({ path: join(out, "saved.png") });
  assert.equal(sha(await readFile(sourcePath)), report.fixtureSha256, "Original STW must remain unchanged");
  await closeApplication(); report.checks.push({ name: "normal close exits first process", pid: firstPid });
  const secondPid = await startApplication(exe, port, documentPath); assert.notEqual(firstPid, secondPid);
  await page.waitForFunction(() => document.fonts.status === "loaded" && Boolean(document.querySelector(".canvas-page canvas")));
  await page.screenshot({ path: join(out, "reopened.png") });
  assert.deepEqual(await diskState(), report.saved);
  report.reopenedAudit = await audit(documentPath, "reopened", marker);
  await page.locator(".canvas-page canvas").first().click({ position: { x: 150, y: 110 } });
  await page.waitForFunction(() => document.activeElement?.matches(".paged-editor__yrs-input"));
  await page.keyboard.press("Control+s"); await delay(1000);
  report.reopenedSaveAudit = await audit(documentPath, "reopened-resaved", marker);
  await closeApplication(); report.checks.push({ name: "normal close exits new PID after reopen/resave", pid: secondPid });
  assert.equal(sha(await readFile(sourcePath)), report.fixtureSha256);
  assert.deepEqual(report.errors, []); report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = String(error.stack || error); process.exitCode = 1;
  if (page) {
    report.failureState = await page.evaluate(() => ({ title: document.title, active: document.activeElement?.outerHTML.slice(0, 500), dialogs: [...document.querySelectorAll('[role="dialog"]')].map(e => e.textContent.slice(0, 2000)) })).catch(() => null);
    await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  }
} finally {
  await browser?.close().catch(() => {});
  for (const { process: process_, record } of processes) {
    if (isAlive(process_)) {
      const actual = ps(`(Get-CimInstance Win32_Process -Filter 'ProcessId=${process_.pid}').ExecutablePath`);
      if (resolve(actual).toLowerCase() === resolve(record.executable).toLowerCase()) { process_.kill(); record.forcedCleanup = true; }
    }
    await waitFor(() => !isAlive(process_), "Owned process cleanup", 10_000).catch(e => report.cleanup.error = String(e));
  }
  report.processes = processes.map(p => p.record);
  report.cleanup.ownedAppsClosed = processes.every(p => !isAlive(p.process));
  if (policy) {
    try { execFileSync("pwsh", ["-NoProfile", "-File", "scripts/runtime-webview2-ci.ps1", "-Phase", "Restore", "-StateFile", policy], { env, windowsHide: true, stdio: "inherit" }); report.cleanup.policyRestored = true; }
    catch (e) { report.cleanup.policyError = String(e); process.exitCode = 1; }
  }
  if (installation && report.cleanup.ownedAppsClosed) {
    try { await access(join(installation, "uninstall.exe")); execFileSync(join(installation, "uninstall.exe"), ["/S", `_?=${installation}`], { env, windowsHide: true, timeout: 120_000 }); report.cleanup.privateInstallRemoved = true; }
    catch (e) { report.cleanup.uninstallError = String(e); process.exitCode = 1; }
  }
  if (!report.cleanup.ownedAppsClosed || process.exitCode) report.status = "failed";
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, error: report.error, cleanup: report.cleanup }));
}
