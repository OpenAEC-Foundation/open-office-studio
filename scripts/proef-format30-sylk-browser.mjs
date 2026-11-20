/** Read-only lease on exact I3 builds: runtime-only SYLK fails visibly and preserves a document. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [workspace, fixturePath, prefix] = process.argv.slice(2);
assert(workspace && fixturePath && /^nov20-I3-sylk-[a-z0-9-]+$/.test(prefix),
  "Usage: node probe.mjs EXACT-I3-WORKSPACE PINNED-SYLK nov20-I3-sylk-UNIQUE");
const root = resolve(workspace), source = await readFile(resolve(fixturePath));
const hash = b => createHash("sha256").update(b).digest("hex");
const sourceHash = "bcfaae8f2ce55e393c100dcd95c37301129b9121af0429586de75b3ec99df420";
assert.equal(hash(source), sourceHash); assert.equal(source.length, 2581);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
assert.equal(git("rev-parse", "HEAD"), "7f126f4b8e5269a54388cf78c48c78d2acc0daa1");
assert.equal(git("rev-parse", "HEAD^{tree}"), "8bc608488760e48919d7fb4e72a42569175b52a4");
assert.equal(git("status", "--porcelain"), "");
const require = createRequire(join(root, "package.json"));
const { preview } = await import(pathToFileURL(require.resolve("vite")));
const { chromium } = require("playwright");
const { verifyBuildReceipt } = await import(pathToFileURL(join(root, "scripts/writer-proefbuild.mjs")));
for (const [variant, route] of [["normal", "/"], ["hosted", "/office/"]]) {
  const output = join(root, ".local", `${prefix}-${variant}`);
  await mkdir(output); // Never replace historical proof.
  const outDir = `.local/nov20-I3-${variant}`, receiptPath = `${outDir}.build.json`;
  let server, browser, context, failure;
  const errors = [], externalRequests = [], cleanupErrors = [];
  const report = { schemaVersion: 1, platform: process.platform, route,
    applicationCommit: git("rev-parse", "HEAD"), applicationTree: git("rev-parse", "HEAD^{tree}"),
    scope: "Actual headless Chromium UI, unsupported SYLK import; no native app or conversion claim",
    sourceSha256: sourceHash, status: "failed" };
  try {
    const receipt = await verifyBuildReceipt({ outDir, route, receiptPath, cwd: root });
    report.buildReceiptSha256 = hash(await readFile(join(root, receiptPath)));
    report.buildAssetCount = Object.keys(receipt.files).length;
    await writeFile(join(output, "build-receipt.json"), await readFile(join(root, receiptPath)));
    server = await preview({ root, configFile: false, base: route,
      cacheDir: join(output, "preview-cache"), build: { outDir: join(root, outDir) },
      preview: { host: "127.0.0.1", port: 0, open: false } });
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ locale: "nl-NL", viewport: { width: 1400, height: 1100 } });
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => { if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== "127.0.0.1") externalRequests.push(r.url()); });
    // Observe production worker save readiness; no editor/IPC replacement.
    await page.addInitScript(() => {
      const Channel = globalThis.MessageChannel, post = Worker.prototype.postMessage, ports = new WeakMap();
      const state = window.__sylkProof = { pending: 0, ready: 0, failures: [] };
      globalThis.MessageChannel = class extends Channel { constructor() { super(); ports.set(this.port2, this.port1); } };
      Worker.prototype.postMessage = function (data, transfer) {
        if (data?.openaec === "prepare-save-v1") {
          state.pending++;
          const port = ports.get(Array.isArray(transfer) ? transfer[0] : transfer?.transfer?.[0]);
          if (!port) throw Error("Missing save-readiness observation port");
          port.addEventListener("message", event => { state.pending--; if (event.data?.ok) state.ready++; else state.failures.push(String(event.data?.fout)); }, { once: true, capture: true });
          port.start();
        }
        return post.apply(this, arguments);
      };
    });
    await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen",
      JSON.stringify({ taal: "nl", spelling: { controleren: false } })));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${route}`);
    assert.equal(new URL(page.url()).pathname, route);
    assert.equal(await page.evaluate(() => typeof window.__TAURI_INTERNALS__), "undefined");
    await page.locator(".office > input[type=file]").setInputFiles({ name: "Bestaand.docx",
      mimeType: "application/octet-stream", buffer: await readFile(join(root, "public/templates/nieuw.docx")) });
    await page.locator(".office-tabnaam").filter({ hasText: "Bestaand.docx" }).waitFor();
    const input = page.locator('[data-testid="yrs-input"]:visible'); await input.waitFor();
    await page.waitForFunction(() => {
      const button = document.querySelector(".office-snelknop:has(.lucide-save-all)");
      return button && !button.disabled;
    });
    await page.waitForFunction(() => {
      const s = window.__sylkProof;
      if (s.failures.length) throw Error(s.failures.join("; "));
      return s.ready > 0 && s.pending === 0;
    });
    await input.focus(); await page.keyboard.type("SYLK30 BROWSER BEHOUD");
    // Save before/after the rejection: genuine downloaded DOCX bytes prove editor state survives.
    async function save(name) {
      const pending = page.waitForEvent("download"); void pending.catch(() => {});
      await page.waitForFunction(() => window.__sylkProof.pending === 0);
      await input.focus(); await page.keyboard.press("Control+Shift+s");
      const dialog = page.getByRole("dialog", { name: "Opslaan als", exact: true });
      await dialog.waitFor(); await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
      const bytes = await readFile(await (await pending).path());
      await writeFile(join(output, name), bytes); return bytes;
    }
    const before = await save("before.docx");
    const tabs = await page.locator(".office-tabnaam").allTextContents();
    const active = await page.locator('.office-tab[aria-selected="true"]').getAttribute("id");
    await page.locator(".office > input[type=file]").setInputFiles({ name: "Bron.sylk", mimeType: "application/octet-stream", buffer: source });
    const alert = page.locator('.office-melding[data-toon="fout"]').filter({ hasText: "SYLK" }); await alert.waitFor();
    const message = await alert.innerText(); assert.match(message, /desktopversie/i); assert.match(message, /XLSX/);
    assert.deepEqual(await page.locator(".office-tabnaam").allTextContents(), tabs);
    assert.equal(await page.locator('.office-tab[aria-selected="true"]').getAttribute("id"), active);
    await page.screenshot({ path: join(output, "rejected-preserved.png") });
    await alert.locator(".office-melding-sluiten").click();
    const after = await save("after.docx");
    const { unzipSync, strFromU8 } = require("fflate");
    const beforeParts = unzipSync(before), afterParts = unzipSync(after);
    const beforeXml = strFromU8(beforeParts["word/document.xml"]), afterXml = strFromU8(afterParts["word/document.xml"]);
    assert(beforeXml.includes("SYLK30 BROWSER BEHOUD")); assert.equal(afterXml, beforeXml);
    assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
    await verifyBuildReceipt({ outDir, route, receiptPath, cwd: root });
    assert.equal(hash(await readFile(resolve(fixturePath))), sourceHash);
    Object.assign(report, { noTauri: true, message, tabsPreserved: true, activeTabPreserved: true,
      documentXmlPreserved: true, marker: "SYLK30 BROWSER BEHOUD", beforeSha256: hash(before),
      afterSha256: hash(after), documentXmlSha256: hash(beforeParts["word/document.xml"]),
      errors, externalRequests, sourceUnchanged: true });
  } catch (error) { failure = error; report.error = String(error.stack || error); }
  finally {
    for (const [name, close] of [["context", () => context?.close()], ["browser", () => browser?.close()],
      ["server", () => server?.close()]]) {
      try { await close(); } catch (e) { cleanupErrors.push(`${name}: ${e}`); }
    }
    assert.equal(git("status", "--porcelain"), "", "Read lease changed tracked source/index");
    report.cleanup = { contextClosed: !!context && !cleanupErrors.length, browserClosed: !!browser && !browser.isConnected(),
      serverClosed: !!server && !server.httpServer.listening, errors: cleanupErrors };
    report.status = !failure && !cleanupErrors.length ? "passed" : "failed";
    await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  if (failure) throw failure;
  assert.deepEqual(cleanupErrors, []);
  console.log(JSON.stringify({ route, output, status: report.status, cleanup: report.cleanup }));
}
