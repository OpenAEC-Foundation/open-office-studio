/** Bounded regression case: title DOCVARIABLE followed by real keyboard text.
 * Reuses the already verified and installed final package; no app download/build.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function testFinalTitle({ out, exe, port, startApplication, closeApplication, getPage, waitFor, report }) {
  const sha = b => createHash("sha256").update(b).digest("hex");
  const sourceInfo = JSON.parse(await readFile("docs/tests/format30-stw/source.json", "utf8"));
  const fixture = sourceInfo.fixture;
  const source = join(out, "title-original.stw"), docx = join(out, "Title overlap roundtrip.docx");
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
  await focusEditor(page);
  await page.keyboard.press("Control+Shift+s");
  const save = page.getByRole("dialog", { name: /Save as|Opslaan als/i });
  await save.getByLabel(/File name|Bestandsnaam/i).fill("Title overlap roundtrip");
  await save.locator('input[type="radio"][value="docx"]').check();
  await save.getByRole("button", { name: /^(Save|Opslaan)$/ }).click();
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
    screenshots: ["title-opened.png", "title-edited.png", "title-saved.png", "title-reopened.png"] });
  report.checks.push({ name: "title STW native keyboard edit and DOCX save/full reopen; screenshot review still required", firstPid, secondPid });
}
