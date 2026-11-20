/** Actual hosted EPUB input/edit/save/reopen; no native bridge or editor mocks. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";
import { verifyBuildReceipt } from "./writer-proefbuild.mjs";

const output = process.env.EPUB356_OUT || `.local/epub356-hosted-${Date.now()}-${process.pid}`;
const outDir = process.env.OFFICE_TEST_DIR || "dist-hosted";
const route = process.env.OFFICE_TEST_BASE || "/office/";
await mkdir(dirname(output), { recursive: true });
// A run must never overwrite old first/reopened images or a previous receipt.
await mkdir(output);
const sourcePath = "docs/tests/epub356/leesvolgorde.epub";
const hash = (b) => createHash("sha256").update(b).digest("hex");
let server, browser, context, page;
const errors = [],
  externalRequests = [];
try {
  const buildReceipt = await verifyBuildReceipt({
    outDir,
    route,
    receiptPath: process.env.OFFICE_TEST_BUILD_RECEIPT,
  });
  const source = await readFile(sourcePath);
  const originalHash = hash(source);
  const expectedImage = unzipSync(source)["Boek/media/beeld een.png"];
  server = await preview({
    configFile: false,
    base: route,
    cacheDir: `${output}/preview-cache`,
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0, open: false },
  });
  browser = await chromium.launch();
  context = await browser.newContext({
    locale: "nl-NL",
    viewport: { width: 1400, height: 1100 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== "127.0.0.1"
    )
      externalRequests.push(request.url());
  });
  // Observe existing storage preparation, as in the ordinary Writer probe.
  // Network-idle alone can precede the worker's preparation acknowledgement.
  await page.addInitScript(() => {
    const Channel = globalThis.MessageChannel,
      post = Worker.prototype.postMessage;
    const ports = new WeakMap();
    const state = (window.__epubProof = { pending: 0, ready: 0, failures: [] });
    globalThis.MessageChannel = class extends Channel {
      constructor() {
        super();
        ports.set(this.port2, this.port1);
      }
    };
    Worker.prototype.postMessage = function (data, transfer) {
      if (data?.openaec === "prepare-save-v1") {
        state.pending++;
        const port = ports.get(
          Array.isArray(transfer) ? transfer[0] : transfer?.transfer?.[0],
        );
        if (!port) throw new Error("Missing preparation observation port");
        port.addEventListener(
          "message",
          (event) => {
            state.pending--;
            if (event.data?.ok) state.ready++;
            else state.failures.push(String(event.data?.fout));
          },
          { once: true, capture: true },
        );
        port.start();
      }
      return post.apply(this, arguments);
    };
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "nl", spelling: { controleren: false } }),
    ),
  );
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}${route}`,
  );
  assert(new URL(page.url()).pathname.startsWith(route));
  assert.equal(
    await page.evaluate(() => typeof window.__TAURI_INTERNALS__),
    "undefined",
  );
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "leesvolgorde.epub",
    mimeType: "application/epub+zip",
    buffer: source,
  });
  const input = page.locator('[data-testid="yrs-input"]:visible');
  await input.waitFor();
  await page.waitForFunction(() => {
    const b = document.querySelector(".office-snelknop:has(.lucide-save-all)");
    return b && !b.disabled;
  });
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const state = window.__epubProof;
    if (state.failures.length) throw new Error(state.failures.join("; "));
    return state.ready > 0 && state.pending === 0;
  });
  await page.screenshot({ path: `${output}/imported.png` });
  await context.setOffline(true);
  await input.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("EPUB356 EDIT ");
  const download = page.waitForEvent("download");
  void download.catch(() => {});
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", { name: "Opslaan als", exact: true });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Opslaan", exact: true }).click();
  const saved = await readFile(await (await download).path());
  await writeFile(`${output}/saved.docx`, saved);
  const parts = unzipSync(saved),
    xml = strFromU8(parts["word/document.xml"]);
  for (const text of [
    "EPUB356 EDIT",
    "EPUB EERSTE HOOFDSTUK",
    "EPUB TWEEDE HOOFDSTUK",
    "Hout",
    "42",
  ])
    assert(xml.includes(text), text);
  assert(xml.indexOf("EPUB EERSTE") < xml.indexOf("EPUB TWEEDE"));
  assert(
    Object.entries(parts).some(
      ([name, bytes]) =>
        name.startsWith("word/media/") && hash(bytes) === hash(expectedImage),
    ),
  );
  await context.setOffline(false);
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "EPUB-heropend.docx",
    mimeType: "application/octet-stream",
    buffer: saved,
  });
  await page.getByRole("tab", { name: /EPUB-heropend\.docx/ }).waitFor();
  await input.waitFor();
  await page.waitForFunction(() => {
    const b = document.querySelector(".office-snelknop:has(.lucide-save-all)");
    return document.title.includes("EPUB-heropend") && b && !b.disabled;
  });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${output}/reopened.png` });
  const tabs = await page.locator(".office-tabnaam").allTextContents();
  await page.locator(".office > input[type=file]").setInputFiles({
    name: "Ongeldig.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from("not a book"),
  });
  await page
    .locator('.office-melding[data-toon="fout"]')
    .filter({ hasText: "EPUB" })
    .waitFor();
  assert.deepEqual(
    await page.locator(".office-tabnaam").allTextContents(),
    tabs,
  );
  assert.equal(hash(await readFile(sourcePath)), originalHash);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await page.screenshot({ path: `${output}/reopened-invalid-preserved.png` });
  const report = {
    status: "passed",
    applicationCommit: buildReceipt.source,
    applicationTree: buildReceipt.tree,
    harnessCommit: process.env.OOS_RUNTIME_HARNESS_COMMIT,
    buildReceiptPath: process.env.OFFICE_TEST_BUILD_RECEIPT,
    buildDirectory: outDir,
    route,
    nativeBridge: false,
    importedEpub: true,
    offlineEditAndSave: true,
    readingOrder: true,
    tableContent: true,
    embeddedImageSha256: hash(expectedImage),
    reopenedDocx: true,
    invalidInputPreservesTabs: true,
    originalSha256: originalHash,
    originalUnchanged: true,
    errors,
    externalRequests,
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      {
        error: String(error),
        errors,
        externalRequests,
        bodyText: page ? await page
          .locator("body")
          .innerText()
          .catch(() => "") : "",
      },
      null,
      2,
    ),
  );
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
