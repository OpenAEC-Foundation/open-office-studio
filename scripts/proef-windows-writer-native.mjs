/** Exact installer, actual WebView2 input, disk save and full process reopen.
 * Restricted to a disposable Windows runner; never launches the user's app.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createReadStream, openSync } from "node:fs";
import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { DOMParser } from "@xmldom/xmldom";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { requireAuthenticode } from "./windows-native-signature.mjs";
import { testFinalTitle } from "./windows-final-title-case.mjs";
import { testNativeFindReplace } from "./windows-find-replace-case-20261124.mjs";
import { testNativeRegex } from "./windows-regex-case-20261124.mjs";
import { testSearchExtras } from "./windows-search-extras-case-20261124.mjs";
import { testNativeBookmarks } from "./windows-bookmarks-case-20261124.mjs";

assert.equal(process.platform, "win32");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const [manifestFile, outputDirectory] = process.argv.slice(2);
assert(manifestFile && outputDirectory, "Pass frozen candidate JSON and fresh output directory");
const identity = JSON.parse(await readFile(manifestFile, "utf8"));
const regexOnly = identity.focusedCase === "regex-20261124";
const extrasOnly = identity.focusedCase === "search-extras-20261124";
const bookmarksOnly = identity.focusedCase === "bookmarks-20261124";
const findReplaceOnly = identity.focusedCase === "find-replace-20261124" || regexOnly || extrasOnly || bookmarksOnly;
if (findReplaceOnly) assert(identity.requireSigned && !identity.titleOnly && !identity.testTitleOverlap);
assert.equal(identity.executeNative, true);
if (process.argv.includes("--require-signed")) assert.equal(identity.requireSigned, true, "Final native route requires an explicitly signed candidate");
if (process.argv.includes("--test-title-overlap")) assert.equal(identity.testTitleOverlap, true, "Final requested title regression must be explicitly enabled in the frozen candidate");
if (process.argv.includes("--require-suite-child")) {
  assert.match(identity.suiteDescriptorSha256, /^[a-f0-9]{64}$/, "Frozen Suite-child descriptor required; never fall back to a second parent download");
  assert.equal(typeof identity.suiteDescriptorBase64, "string");
}
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
async function fileSha(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
const report = {
  status: "running", identity, harnessCommit: execFileSync("git", ["-C", resolve(dirname(fileURLToPath(import.meta.url)), ".."), "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
  harnessSha256: sha(await readFile(new URL(import.meta.url))), checks: [], errors: [], cleanup: {},
  platform: "Windows hosted runner / installed NSIS / actual WebView2 CDP keyboard and pointer",
  limits: ["CDP input on an isolated native WebView2, not a physical user keyboard", "Office Writer core and bundled-runtime detection only; not all module/release acceptance"],
};
if (identity.requireSigned) {
  for (const key of ["producerJobId", "producerRunAttempt"]) assert(Number.isSafeInteger(identity[key]) && identity[key] > 0);
  report.signatureChecks = [];
}
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
async function reuseReviewedCore() {
  const ref = identity.reusedCore;
  assert(ref && identity.requireSigned && (findReplaceOnly || (identity.titleOnly && identity.testTitleOverlap)));
  const metadata = JSON.parse(execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/${ref.artifactId}`], { encoding: "utf8", windowsHide: true }));
  assert.equal(metadata.expired, false); assert.equal(metadata.workflow_run.id, ref.runId); assert.equal(metadata.workflow_run.head_sha, ref.harnessCommit);
  assert.equal(metadata.digest, `sha256:${ref.archiveSha256}`); assert.equal(metadata.size_in_bytes, ref.archiveBytes);
  assert(ref.archiveBytes < 2 * 1024 * 1024, "Only small earlier native evidence may be reused");
  const archive = execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/${ref.artifactId}/zip`], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(archive.length, ref.archiveBytes); assert.equal(sha(archive), ref.archiveSha256);
  const raw = unzipSync(archive, { filter: e => e.name === ref.reportMember })[ref.reportMember]; assert(raw); assert.equal(sha(raw), ref.reportSha256);
  const prior = JSON.parse(strFromU8(raw));
  assert.equal(prior.harnessCommit, ref.harnessCommit);
  for (const key of ["applicationCommit", "applicationTree", "version", "runId", "producerJobId", "producerRunAttempt", "artifactId", "archiveSha256", "packageMember", "packageSha256", "expectedPackagedExecutableSha256", "suiteDescriptorSha256"]) assert.equal(prior.identity[key], identity[key], `Earlier core ${key} differs`);
  assert.equal(prior.status, "failed", "Preserve the original failed title-run status");
  assert.match(prior.error, /Real title DOCX SaveAs/);
  assert.equal(prior.executableSha256, identity.expectedPackagedExecutableSha256);
  assert.equal(prior.signatureChecks.length, 4); for (const e of prior.signatureChecks) requireAuthenticode(e, identity.expectedSignerSubject);
  assert.equal(prior.checks.length, 12);
  for (const name of ["installed package opens exact 3x3 baseline", "native keyboard edit", "native ordinary Undo", "native ordinary Redo", "Find input owns Undo", "Find close preserves document Undo", "document Redo after pane close", "normal close exits first process", "full process reopen renders saved cells", "normal close exits reopened process"]) assert(prior.checks.some(c => c.name === name), name);
  assert.deepEqual(prior.saved.cells, edited); assert.equal(prior.saved.sha256, ref.savedDocxSha256);
  assert.deepEqual(prior.errors, []);
  for (const p of prior.processes.slice(0, 2)) { assert.equal(p.exit.code, 0); assert(!p.forcedCleanup); assert.equal(p.appIdentifier, "org.openaec.office-studio"); }
  assert.equal(prior.processes.length, 3);
  assert(prior.cleanup.ownedAppsClosed && prior.cleanup.policyRestored && prior.cleanup.privateInstallRemoved);
  await writeFile(join(out, "reused-core-origin-report.json"), raw);
  report.reusedCore = { ...ref, originWholeRunStatus: "failed", acceptedSpecificChecks: 12, excluded: "Original failed Title SaveAs and its forced cleanup are not accepted", originalCorePids: prior.processes.slice(0, 2).map(p => p.pid) };
  report.executionScope = findReplaceOnly
    ? `${bookmarksOnly ? "Bookmark/Go To" : extrasOnly ? "Wildcard/format/special-character" : regexOnly ? "Regex" : "Ordinary Find/Replace"}-only native continuation on identical public P5 Suite; earlier core checks reused, no new title test`
    : "Title-only native continuation on the identical signed Suite; 12 independently reviewed earlier core checks reused";
}
function ps(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, timeout: 30_000 }).trim();
}
function signature(label, path) {
  const script = `$ErrorActionPreference='Stop';$s=Get-AuthenticodeSignature -LiteralPath '${path.replaceAll("'", "''")}';@{status=$s.Status.ToString();signerSubject=$s.SignerCertificate.Subject;signerThumbprint=$s.SignerCertificate.Thumbprint;timestampSubject=$s.TimeStamperCertificate.Subject;timestampThumbprint=$s.TimeStamperCertificate.Thumbprint}|ConvertTo-Json -Compress`;
  const result = JSON.parse(execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, timeout: 60_000 }));
  const evidence = requireAuthenticode({ label, ...result }, identity.expectedSignerSubject);
  report.signatureChecks.push(evidence);
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
async function startApplication(exe, port, path = documentPath, tableBaseline = true) {
  // A real visible native window is intentional on this disposable test host.
  app = spawn(exe, [path], { env, cwd: dirname(exe), stdio: ["ignore", "pipe", "pipe"] });
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
  await page.waitForFunction(table => document.fonts.status === "loaded" && Boolean(document.querySelector(".canvas-page canvas")) && (!table || [...document.querySelectorAll('[role="table"]')].some(e => !e.closest("[hidden],[inert]") && e.getAttribute("aria-colcount") === "3")), tableBaseline);
  await page.waitForFunction(() => { const b = document.querySelector(".office-snelknop:has(.lucide-save-all)"); return b && !b.disabled; });
  run.appIdentifier = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|identifier"));
  assert.equal(run.appIdentifier, "org.openaec.office-studio");
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
  const gitCommit = JSON.parse(execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/git/commits/${identity.applicationCommit}`], { encoding: "utf8", windowsHide: true }));
  assert.equal(gitCommit.tree.sha, identity.applicationTree);
  if (findReplaceOnly) {
    const published = JSON.parse(execFileSync("gh", ["api", "repos/OpenAEC-Foundation/open-office-studio/releases/tags/v2026.48.1"], { encoding: "utf8", windowsHide: true }));
    assert.equal(published.id, 456623378); assert(!published.draft && !published.prerelease); assert.equal(published.target_commitish, identity.applicationCommit);
    const assets = published.assets.filter(a => a.id === 786782581); assert.equal(assets.length, 1);
    assert.equal(assets[0].name, "Open.Office.Studio_2026.48.1_x64-setup.exe");
    assert.equal(assets[0].digest, `sha256:${identity.packageSha256}`); assert.equal(assets[0].size, 384579648);
    const raw = await readFile("docs/tests/windows-published-suite-20261124/report.json");
    assert.equal(sha(raw), "ad51eaf27f45ca55d6ac98e3f7cbb2fe9358e225c531a66870c2d814bf006608");
    report.publicReleaseBinding = { release: published.id, asset: assets[0], actualPublicDownloadAndInstallRunReused: 45387284170, rawReportSha256: sha(raw) };
  }
  if (identity.requireSigned) {
    assert.equal(run.head_sha, identity.applicationCommit, "Signed producer must use the exact approved application source");
    assert.equal(run.path, ".github/workflows/release.yml");
    assert.equal(run.head_repository.full_name, "OpenAEC-Foundation/open-office-studio");
    assert.equal(artifact.name, "uitgave-Windows");
    assert.equal(artifact.workflow_run.head_sha, identity.applicationCommit);
    assert(identity.producerRunAttempt <= run.run_attempt);
    const list = JSON.parse(execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/runs/${identity.runId}/attempts/${identity.producerRunAttempt}/jobs?per_page=100`], { encoding: "utf8", windowsHide: true }));
    const job = list.jobs.find(j => j.id === identity.producerJobId); assert(job);
    assert.equal(job.run_id, identity.runId); assert.equal(job.run_attempt, identity.producerRunAttempt); assert.equal(job.head_sha, identity.applicationCommit);
    assert.equal(job.name, "Bouwen – Windows"); assert.equal(job.status, "completed"); assert.equal(job.conclusion, "success");
    const gates = ["Pakket bouwen (Windows, ondertekend)", "Authenticode controleren (installer, programma en uninstaller)", "Windows-installer werkelijk uitpakken en controleren"];
    const selected = gates.map(name => { const s = job.steps.find(s => s.name === name); assert(s); assert.equal(s.status, "completed"); assert.equal(s.conclusion, "success"); return s; });
    const created = Date.parse(artifact.created_at); assert(Number.isFinite(created));
    assert(Date.parse(job.started_at) <= created && created <= Date.parse(job.completed_at));
    assert(selected.every(s => Date.parse(s.completed_at) <= created));
    report.producerSignatureAttestation = { jobId: job.id, attempt: job.run_attempt, startedAt: job.started_at, completedAt: job.completed_at, artifactCreatedAt: artifact.created_at, gates: selected.map(s => ({ name: s.name, completedAt: s.completed_at })) };
  }
  report.run = { id: run.id, head_sha: run.head_sha, status: run.status, conclusion: run.conclusion };
  report.artifact = { id: artifact.id, name: artifact.name, digest: artifact.digest };
  const zipPath = join(out, "artifact.zip");
  if (!identity.suiteDescriptorSha256) {
    const fd = openSync(zipPath, "wx");
    try { execFileSync("gh", ["api", `repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/${identity.artifactId}/zip`], { windowsHide: true, stdio: ["ignore", fd, "pipe"], timeout: 300_000 }); } finally { closeSync(fd); }
  }
  let sevenZip = "C:\\Program Files\\7-Zip\\7z.exe";
  try { await access(sevenZip); } catch { sevenZip = "7z"; }
  let installer = join(out, "installer-setup.exe");
  if (identity.suiteDescriptorSha256) {
    assert.equal(identity.requireSigned, true);
    const childOut = join(out, "suite-input");
    execFileSync("python", ["-B", "scripts/windows-suite-child.py", manifestFile, childOut], { windowsHide: true, stdio: "inherit", timeout: 600_000 });
    report.suiteChildBinding = JSON.parse(await readFile(join(childOut, "suite-child-binding.json"), "utf8"));
    installer = join(childOut, report.suiteChildBinding.installer);
    report.packageSha256 = await fileSha(installer); assert.equal(report.packageSha256, identity.packageSha256);
    report.archiveReader = { mode: "strict Suite-only child; parent ZIP verified by pinned preparer and official API metadata", parentDownloadedByConsumer: false, childArtifact: report.suiteChildBinding.childArtifact.id };
  } else if (identity.requireSigned) {
    // Seven installers can exceed readFile's single-buffer limit. Stream the
    // entire immutable ZIP digest, then read only the one frozen Office member.
    report.archiveSha256 = await fileSha(zipPath); assert.equal(report.archiveSha256, identity.archiveSha256);
    assert.equal(artifact.digest, `sha256:${report.archiveSha256}`);
    execFileSync("python", ["-B", "scripts/windows-final-zip-member.py", zipPath, identity.packageMember, installer], { windowsHide: true, stdio: "inherit", timeout: 300_000 });
    report.packageSha256 = await fileSha(installer); assert.equal(report.packageSha256, identity.packageSha256);
    report.archiveReader = { mode: "streaming ZIP SHA then exact member to file", member: identity.packageMember, installersExtracted: 1 };
  } else {
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
    await writeFile(installer, bytes);
  }
  report.checks.push({ name: "frozen application, builder, archive and installer identities verified" });
  // Independently inspect the real immutable NSIS payload before installation.
  const payload = join(out, "payload"); await mkdir(payload);
  const extraction = execFileSync(sevenZip, ["e", "-y", "-r", `-o${payload}`, installer, "open-office-studio.exe"], { encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  await writeFile(join(out, "payload-extraction.log"), extraction);
  const payloadBytes = await readFile(join(payload, "open-office-studio.exe"));
  assert(payloadBytes.length >= 64 && payloadBytes.subarray(0, 2).equals(Buffer.from("MZ")));
  const peOffset = payloadBytes.readUInt32LE(0x3c);
  assert(peOffset >= 64 && peOffset + 26 <= payloadBytes.length);
  assert(payloadBytes.subarray(peOffset, peOffset + 4).equals(Buffer.from("PE\0\0")));
  assert.equal(payloadBytes.readUInt16LE(peOffset + 4), 0x8664); assert.equal(payloadBytes.readUInt16LE(peOffset + 24), 0x20b);
  report.payloadArchitecture = "x64 PE32+";
  report.payloadExecutableSha256 = sha(payloadBytes);
  if (identity.expectedPackagedExecutableSha256) assert.equal(report.payloadExecutableSha256, identity.expectedPackagedExecutableSha256);
  if (report.suiteChildBinding) assert.equal(payloadBytes.length, report.suiteChildBinding.suite.application.payloadExecutable.bytes);
  if (report.applicationProvenance && !identity.requireSigned) {
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
  if (identity.requireSigned) {
    signature("frozen NSIS installer", installer);
    signature("independently extracted payload", join(payload, "open-office-studio.exe"));
    report.checks.at(-1).name = "independent signed NSIS payload identity verified; no unsigned binary normalization";
  }
  if (identity.titleOnly || findReplaceOnly) await reuseReviewedCore();
  if (!identity.titleOnly && !findReplaceOnly) {
  const parts = unzipSync(await readFile("public/templates/nieuw.docx"));
  const cell = t => `<w:tc><w:tcPr><w:tcW w:w="2880" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2880"/>'.repeat(3)}</w:tblGrid>${[0, 3, 6].map(n => `<w:tr>${expected.slice(n, n + 3).map(cell).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
  parts["word/document.xml"] = strToU8(strFromU8(parts["word/document.xml"]).replace(/(<w:body>)[\s\S]*?(<w:sectPr)/, `$1${table}$2`));
  await writeFile(documentPath, zipSync(parts));
  const fixtureState = await diskState();
  assert.deepEqual(fixtureState.cells, expected, "Synthetic fixture must match before any application launch");
  report.fixtureSha256 = fixtureState.sha256;
  }
  await mkdir(env.APPDATA, { recursive: true }); await mkdir(env.LOCALAPPDATA, { recursive: true });
  installation = join(out, "installed");
  execFileSync(installer, ["/S", `/D=${installation}`], { env, windowsHide: true, timeout: 600_000, stdio: "inherit" });
  const exe = join(installation, "open-office-studio.exe"); await access(exe); await access(join(installation, "uninstall.exe"));
  const installedBytes = await readFile(exe);
  report.executableSha256 = sha(installedBytes); report.installedExecutableBytes = installedBytes.length;
  assert.equal(installedBytes.length, payloadBytes.length);
  assert.equal(report.executableSha256, report.payloadExecutableSha256, "Installed executable equals the independently extracted immutable NSIS payload");
  report.fileVersion = ps(`(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.ProductVersion`);
  assert([identity.version, identity.version + ".0"].includes(report.fileVersion), report.fileVersion);
  if (identity.requireSigned) {
    signature("installed application", exe);
    signature("installed uninstaller", join(installation, "uninstall.exe"));
  }
  const server = createServer(); await new Promise(done => server.listen(0, "127.0.0.1", done)); const port = server.address().port; await new Promise(done => server.close(done));
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
  env.WEBVIEW2_USER_DATA_FOLDER = join(out, "webview-profile");
  policy = join(out, "policy-state.json");
  execFileSync("pwsh", ["-NoProfile", "-File", "scripts/runtime-webview2-ci.ps1", "-Phase", "Enable", "-StateFile", policy, "-Port", String(port)], { env, windowsHide: true, stdio: "inherit" });
  if (!identity.titleOnly && !findReplaceOnly) {
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
  }
  if (identity.testTitleOverlap) await testFinalTitle({ out, exe, port, startApplication, closeApplication, getPage: () => page, waitFor, report });
  if (findReplaceOnly && !regexOnly && !extrasOnly && !bookmarksOnly) await testNativeFindReplace({ out, exe, port, startApplication, closeApplication, getPage: () => page, waitFor, report });
  if (regexOnly) await testNativeRegex({ out, exe, port, startApplication, closeApplication, getPage: () => page, waitFor, report });
  if (extrasOnly) await testSearchExtras({ out, exe, port, startApplication, closeApplication, getPage: () => page, waitFor, report },identity.extrasFamilies);
  if (bookmarksOnly) await testNativeBookmarks({ out, exe, port, startApplication, closeApplication, getPage: () => page, waitFor, report });
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
