/** Bounded regression case: title DOCVARIABLE followed by real keyboard text.
 * Reuses the already verified and installed final package; no app download/build.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export async function testFinalTitle({ out, exe, port, startApplication, closeApplication, getPage, waitFor, report }) {
  const sha = b => createHash("sha256").update(b).digest("hex");
  const sourceInfo = JSON.parse(await readFile("docs/tests/format30-stw/source.json", "utf8"));
  const fixture = sourceInfo.fixture;
  const source = join(out, "title-original.stw"), docx = join(out, "Title verified roundtrip.docx");
  const originalTarget = join(out, "Title overlap roundtrip.docx");
  const oracle = join(out, "title-source-oracle.json");
  const script = fileURLToPath(new URL("format30-stw-oracle.py", import.meta.url));
  const response = await fetch(fixture.url, { signal: AbortSignal.timeout(30000) }); assert(response.ok);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, fixture.bytes); assert.equal(sha(bytes), fixture.sha256);
  await writeFile(source, bytes, { flag: "wx" });
  execFileSync("python", ["-B", script, "source", source, "--report", oracle], { stdio: "inherit", timeout: 30000 });
  const marker = " -- STW30 EDIT 2026-11-23";
  const evidence = report.titleOverlapCase = { fixture, marker, helperSha256: sha(await readFile(new URL(import.meta.url))),
    oracleSha256: sha(await readFile(script)), visualStatus: "requires screenshot review", audits: [] };
  async function fileRecord(path) {
    try { const b = await readFile(path); return { path, bytes: b.length, sha256: sha(b) }; } catch (e) { if (e.code === "ENOENT") return { path, absent: true }; throw e; }
  }
  async function openSaveAs(page, leaf) {
    await focusEditor(page);
    await page.keyboard.press("Control+Shift+s");
    const save = page.getByRole("dialog", { name: /Save as|Opslaan als/i });
    await save.getByLabel(/File name|Bestandsnaam/i).fill(leaf);
    await save.locator('input[type="radio"][value="docx"]').check();
    await save.getByRole("button", { name: /^(Save|Opslaan)$/ }).click();
  }
  async function audit(name) {
    const file = join(out, `title-${name}-oracle.json`);
    execFileSync("python", ["-B", script, "audit", docx, "--oracle", oracle, "--marker", marker, "--preserve-title-docvariable", "--report", file], { stdio: "inherit", timeout: 30000 });
    evidence.audits.push({ stage: name, ...JSON.parse(await readFile(file, "utf8")) });
  }
  async function focusEditor(page) {
    await page.locator(".canvas-page canvas").first().click({ position: { x: 150, y: 110 } });
    await page.waitForFunction(() => document.activeElement?.matches(".paged-editor__yrs-input"));
  }
  async function showTitle(page, name) {
    const notices = await page.locator(".office-melding").allTextContents();
    if (notices.length) {
      (evidence.dismissedNotices ||= []).push({ stage: name, text: notices });
      const close = page.locator(".office-melding-sluiten");
      while (await close.count()) await close.first().click();
    }
    // Keep the title in view at the same 100% app zoom used for the original
    // observation. Ordinary scrolling changes no document content or layout.
    await page.mouse.move(850, 420);
    await page.mouse.wheel(0, -10000);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `title-${name}.png`) });
  }
  const firstPid = await startApplication(exe, port, source, false);
  let page = getPage();
  await showTitle(page, "opened");
  await focusEditor(page);
  await page.keyboard.press("Control+Home"); await page.keyboard.press("End");
  await page.keyboard.type(marker);
  await showTitle(page, "edited");
  const cwdTarget = join(dirname(exe), "Title overlap roundtrip.docx");
  const before = [await fileRecord(originalTarget), await fileRecord(cwdTarget)];
  assert(before.every(p => p.absent), "Diagnostic targets must be fresh owned files");
  // Observe only rendered notifications; no application API, command or document is replaced.
  await page.evaluate(() => {
    window.__qaTitleSaveNotices = [];
    const collect = () => { for (const e of document.querySelectorAll(".office-melding")) { const t = e.textContent; if (!window.__qaTitleSaveNotices.includes(t)) window.__qaTitleSaveNotices.push(t); } };
    window.__qaTitleSaveObserver = new MutationObserver(collect);
    window.__qaTitleSaveObserver.observe(document.querySelector(".office-meldingen"), { childList: true, subtree: true, characterData: true });
  });
  await openSaveAs(page, "Title overlap roundtrip");
  const original = evidence.originalDriverDiagnostic = { driver: "Unchanged original 2026-11-23 setter+Invoke subprocess", before };
  try {
    execFileSync("python", ["-B", "scripts/windows-file-dialog-original-20261123.py", String(firstPid), originalTarget, join(out, "title-original-save-dialog.json")], { stdio: "inherit", windowsHide: true, timeout: 60000 });
  } catch (e) { original.helperError = String(e); }
  await page.waitForTimeout(1500);
  original.notices = await page.evaluate(() => window.__qaTitleSaveNotices.slice());
  original.files = [await fileRecord(originalTarget), await fileRecord(cwdTarget)];
  const observationPath = join(out, "title-original-dialog-after.json");
  execFileSync("python", ["-B", "scripts/windows-stw-file-dialog.py", String(firstPid), originalTarget, observationPath, "--inspect-only"], { stdio: "inherit", windowsHide: true, timeout: 60000 });
  original.native = JSON.parse(await readFile(observationPath, "utf8"));
  original.requestedTargetCreated = !original.files[0].absent;
  await writeFile(join(out, "title-original-driver-diagnostic.json"), JSON.stringify(original, null, 2));
  // Retain a wrongly placed diagnostic result before the owned installation is removed.
  if (!original.files[1].absent) {
    const rel = relative(out, cwdTarget); assert(!rel.startsWith("..") && !isAbsolute(rel));
    const retained = join(out, "title-original-driver-cwd-result.docx");
    await copyFile(cwdTarget, retained); assert.equal(sha(await readFile(retained)), original.files[1].sha256);
    await unlink(cwdTarget); original.retainedCwdResult = retained;
  }
  assert((await fileRecord(docx)).absent, "Corrected filename target must not overwrite a diagnostic result");
  if (original.native.dialogs.length === 0) await openSaveAs(page, "Title verified roundtrip");
  else assert(original.native.dialogs.length === 1 && /Save as|Opslaan als/i.test(original.native.dialogs[0].title), "Unexpected native modal must be diagnosed, not bypassed");
  execFileSync("python", ["-B", "scripts/windows-stw-file-dialog.py", String(firstPid), docx, join(out, "title-save-dialog.json")], { stdio: "inherit", windowsHide: true, timeout: 60000 });
  evidence.afterSaveDialog = await page.evaluate(() => ({ title: document.title, notices: [...document.querySelectorAll(".office-melding")].map(e => e.textContent) }));
  try {
    await waitFor(() => readFile(docx).then(b => b.length > 0).catch(() => false), "Real title DOCX SaveAs");
  } catch (error) {
    evidence.ownedDirectoryInventory = { output: await readdir(out), installation: await readdir(join(out, "installed")) };
    throw error;
  }
  await audit("saved"); await showTitle(page, "saved");
  const savedHash = sha(await readFile(docx));
  await closeApplication();
  const secondPid = await startApplication(exe, port, docx, false); assert.notEqual(firstPid, secondPid);
  page = getPage();
  assert.equal(sha(await readFile(docx)), savedHash);
  await audit("reopened"); await showTitle(page, "reopened");
  await focusEditor(page); await page.keyboard.press("Control+s");
  await page.waitForTimeout(1000); await audit("resaved");
  await closeApplication();
  assert.equal(sha(await readFile(source)), fixture.sha256);
  Object.assign(evidence, { firstPid, secondPid, originalUnchanged: true, savedHash, resavedHash: sha(await readFile(docx)),
    savedDocx: docx,
    screenshots: ["title-opened.png", "title-edited.png", "title-saved.png", "title-reopened.png"] });
  report.checks.push({ name: "title STW native keyboard edit and DOCX save/full reopen; screenshot review still required", firstPid, secondPid });
}
