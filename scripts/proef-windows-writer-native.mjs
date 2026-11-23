/** Exact installer, actual WebView2 input, disk save and full process reopen.
 * Restricted to a disposable Windows runner; never launches the user's app.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { DOMParser } from "@xmldom/xmldom";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

assert.equal(process.platform, "win32");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const [manifestFile, outputDirectory] = process.argv.slice(2);
assert(manifestFile && outputDirectory, "Pass frozen candidate JSON and fresh output directory");
const identity = JSON.parse(await readFile(manifestFile, "utf8"));
assert.equal(identity.executeNative, true);
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
  limits: ["CDP input on an isolated native WebView2, not a physical user keyboard", "Office Writer core and bundled-runtime detection only; not all module/release acceptance"],
};
let app, browser, page, policy, installation;
const processes = [];
const env = { ...process.env, APPDATA: join(out, "profile/Roaming"), LOCALAPPDATA: join(out, "profile/Local") };
delete env.OPENAEC_CONVERSIE_PROGRAMMA;
delete env.OPENAEC_CONVERSIE_PROFIEL;
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
const expected = ["alpha", "beta", "", "", "", "omega", "delta", "", ""];
const marker = "NATIVE_WINDOWS_372 ";
const edited = [marker + "alpha", ...expected.slice(1)];
const documentPath = join(out, "Writer native roundtrip.docx");
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
async function cells() {
  return page.evaluate(() => [...document.querySelectorAll('[role="table"]')]
    .filter(e => !e.closest("[hidden],[inert]"))
    .map(e => ({ rows: Number(e.getAttribute("aria-rowcount")), columns: Number(e.getAttribute("aria-colcount")), cells: [...e.querySelectorAll('[role="cell"]')].map(c => c.textContent) })));
}
async function check(name, values) {
  await waitFor(async () => JSON.stringify((await cells())[0]?.cells) === JSON.stringify(values), name);
  const tables = await cells();
  assert.equal(tables.length, 1); assert.equal(tables[0].rows, 3); assert.equal(tables[0].columns, 3);
  report.checks.push({ name, tables, focus: await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute("aria-label"), className: document.activeElement?.className })) });
}
async function diskState() {
  const bytes = await readFile(documentPath);
  const doc = new DOMParser().parseFromString(strFromU8(unzipSync(bytes)["word/document.xml"]), "application/xml");
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const list = Array.from(doc.getElementsByTagNameNS(ns, "tc")).map(c => Array.from(c.getElementsByTagNameNS(ns, "t")).map(t => t.textContent).join(""));
  return { sha256: sha(bytes), cells: list };
}
function isAlive(process_) {
  if (!process_?.pid || process_.exitCode !== null) return false;
  try { process.kill(process_.pid, 0); return true; } catch { return false; }
}
async function startApplication(exe, port) {
  // A real visible native window is intentional on this disposable test host.
  app = spawn(exe, [documentPath], { env, cwd: dirname(exe), stdio: ["ignore", "pipe", "pipe"] });
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
  await page.waitForFunction(() => document.fonts.status === "loaded" && Boolean(document.querySelector(".canvas-page canvas")) && [...document.querySelectorAll('[role="table"]')].some(e => !e.closest("[hidden],[inert]") && e.getAttribute("aria-colcount") === "3"));
  await page.waitForFunction(() => { const b = document.querySelector(".office-snelknop:has(.lucide-save-all)"); return b && !b.disabled; });
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
  const artifact = JSON.parse(execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/${identity.artifactId}`], { encoding: "utf8", windowsHide: true }));
  assert.equal(run.head_sha, identity.builderCommit || identity.applicationCommit);
  assert.equal(artifact.workflow_run.id, identity.runId); assert.equal(artifact.expired, false);
  report.run = { id: run.id, head_sha: run.head_sha, status: run.status, conclusion: run.conclusion };
  report.artifact = { id: artifact.id, name: artifact.name, digest: artifact.digest };
  const zipPath = join(out, "artifact.zip"), fd = openSync(zipPath, "wx");
  try { execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/${identity.artifactId}/zip`], { windowsHide: true, stdio: ["ignore", fd, "pipe"], timeout: 300_000 }); } finally { closeSync(fd); }
  const zip = await readFile(zipPath);
  report.archiveSha256 = sha(zip); assert.equal(report.archiveSha256, identity.archiveSha256);
  const contents = unzipSync(zip, { filter: entry => entry.name === identity.packageMember || entry.name === "provenance.json" });
  const bytes = contents[identity.packageMember]; assert(bytes, "Exact frozen NSIS member must exist");
  report.packageSha256 = sha(bytes); assert.equal(report.packageSha256, identity.packageSha256);
  if (identity.builderCommit && identity.builderCommit !== identity.applicationCommit) {
    assert(contents["provenance.json"], "A separate builder checkout requires immutable application provenance");
    const proof = JSON.parse(strFromU8(contents["provenance.json"]));
    assert.equal(proof.applicationCommit, identity.applicationCommit);
    assert.equal(proof.applicationTree, identity.applicationTree);
    assert.equal(proof.version, identity.version);
    assert.equal(proof.builderCommit, identity.builderCommit);
    assert.equal(proof.runId, identity.runId);
    assert.equal(proof.installer.path, identity.packageMember);
    assert.equal(proof.installer.sha256, identity.packageSha256);
    assert.equal(proof.installer.size, bytes.length);
    assert.match(proof.executable.sha256, /^[a-f0-9]{64}$/);
    report.applicationProvenance = proof;
  }
  report.checks.push({ name: "frozen application, builder, archive and installer identities verified" });
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
  if (report.applicationProvenance) {
    const rawHash = report.applicationProvenance.executable.sha256;
    report.bundlePatch = { originalBuildSha256: rawHash, payloadSha256: report.payloadExecutableSha256 };
    if (report.payloadExecutableSha256 !== rawHash) {
      assert.equal(report.applicationProvenance.developmentBuild, true);
      assert.equal(report.applicationProvenance.signingRequired, false);
      // Pinned CLI2.12.3 writes NSS into the packaged copy, then restores the
      // original UNK binary in target/release. Only that exact byte substitution
      // may explain the difference; every other byte must hash to the build proof.
      const nsis = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_NSS");
      const unknown = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
      const matches = []; let count = 0;
      for (let offset = payloadBytes.indexOf(nsis); offset >= 0; offset = payloadBytes.indexOf(nsis, offset + 1)) {
        assert(++count <= 64, "Unexpected number of bundle-type markers");
        const restored = Buffer.from(payloadBytes); unknown.copy(restored, offset);
        if (sha(restored) === rawHash) matches.push(offset);
      }
      assert.equal(matches.length, 1, "Exactly one NSIS bundle-type patch must fully explain the build/payload hash difference");
      Object.assign(report.bundlePatch, { kind: "single NSS-to-UNK substitution in memory only", matchingOffset: matches[0], restoredSha256: rawHash, candidateMarkers: count,
        source: "https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.3/crates/tauri-bundler/src/bundle.rs", sourceGitBlob: "e6709eb590ac17925a50e5393215d020269c6f59" });
    }
  }
  report.checks.push({ name: "independent NSIS payload identity and exact Tauri bundle patch verified" });
  const parts = unzipSync(await readFile("public/templates/nieuw.docx"));
  const cell = t => `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid>${[0, 3, 6].map(n => `<w:tr>${expected.slice(n, n + 3).map(cell).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
  parts["word/document.xml"] = strToU8(strFromU8(parts["word/document.xml"]).replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`));
  await writeFile(documentPath, zipSync(parts));
  const fixtureState = await diskState();
  assert.deepEqual(fixtureState.cells, expected, "Synthetic fixture must match before any application launch");
  report.fixtureSha256 = fixtureState.sha256;
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
  await check("installed package opens exact 3x3 baseline", expected);
  await page.locator(".canvas-page canvas").first().click({ position: { x: 150, y: 110 } });
  await page.waitForFunction(() => document.activeElement?.matches(".paged-editor__yrs-input"));
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(marker); await check("native keyboard edit", edited);
  await page.keyboard.press("Control+z"); await check("native ordinary Undo", expected);
  await page.keyboard.press("Control+y"); await check("native ordinary Redo", edited);
  await page.keyboard.press("Control+h");
  const search = page.locator('[role="search"] input[type="search"]'); await search.click();
  await page.keyboard.type("abc"); assert.equal(await search.inputValue(), "abc");
  await page.keyboard.press("Control+z"); assert.equal(await search.inputValue(), ""); await check("Find input owns Undo", edited);
  await page.keyboard.press("Control+y"); assert.equal(await search.inputValue(), "abc");
  await page.locator(".tw-zoek-sluit").click();
  await page.waitForFunction(() => document.activeElement?.matches(".paged-editor__yrs-input"));
  await page.keyboard.press("Control+z"); await check("Find close preserves document Undo", expected);
  await page.keyboard.press("Control+y"); await check("document Redo after pane close", edited);
  await page.keyboard.press("Control+s");
  const saved = await waitFor(async () => { const s = await diskState(); return JSON.stringify(s.cells) === JSON.stringify(edited) ? s : null; }, "Real CtrlS must persist exact cells");
  report.saved = saved; await page.screenshot({ path: join(out, "saved.png") });
  await delay(500); await closeApplication(); report.checks.push({ name: "normal close exits first process", pid: firstPid });
  const secondPid = await startApplication(exe, port); assert.notEqual(firstPid, secondPid);
  await check("full process reopen renders saved cells", edited);
  assert.deepEqual(await diskState(), saved); await page.screenshot({ path: join(out, "reopened.png") });
  await closeApplication(); report.checks.push({ name: "normal close exits reopened process", pid: secondPid });
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
