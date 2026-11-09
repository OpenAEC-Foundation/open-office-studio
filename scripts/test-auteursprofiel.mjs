/** #23: opgeslagen profiel, venstersynchronisatie en DOCX-initialen in de productiebuild.
 * Vereist Playwright + Chromium; optioneel OFFICE_PLAYWRIGHT_MODULE als module-URL.
 * Eerst de app bouwen, daarna node scripts/test-auteursprofiel.mjs.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { preview } from "vite";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.OFFICE_PLAYWRIGHT_MODULE ?? "playwright"
);
const output = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-auteursprofiel",
);
await mkdir(output, { recursive: true });
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const baseUrl = "http://127.0.0.1:" + server.httpServer.address().port;
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const report = { checks: [], errors };
async function settings() {
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+,");
  const d = page.getByRole("dialog", { name: "Settings", exact: true });
  await d.waitFor();
  return d;
}
async function profile(d, name, initials) {
  await d.getByLabel("Name for comments").fill(name);
  await d.getByLabel("Initials", { exact: true }).fill(initials);
}
async function save(d) {
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await d.waitFor({ state: "hidden" });
}
async function stored() {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("openaec-office-instellingen")).gebruiker,
  );
}
try {
  await context.addInitScript(() => {
    if (!localStorage.getItem("qa-initialized")) {
      localStorage.setItem("qa-initialized", "1");
      localStorage.setItem("open-tekst-auteur", "Legacy Auteur");
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({ taal: "en", spelling: { controleren: false } }),
      );
    }
  });
  await page.goto(baseUrl);
  let d = await settings();
  assert.equal(
    await d.getByLabel("Name for comments").inputValue(),
    "Legacy Auteur",
  );
  await d.getByLabel("Name for comments").fill("Anne");
  await d.getByLabel("Name for comments").pressSequentially(" van Dijk");
  assert.equal(
    await d.getByLabel("Name for comments").inputValue(),
    "Anne van Dijk",
  );
  await d.getByLabel("Initials", { exact: true }).fill("AvD");
  await save(d);
  report.checks.push(
    "Legacy name migrated; spaces in names can be typed; profile saved.",
  );
  await page.reload();
  d = await settings();
  assert.equal(
    await d.getByLabel("Name for comments").inputValue(),
    "Anne van Dijk",
  );
  assert.equal(
    await d.getByLabel("Initials", { exact: true }).inputValue(),
    "AvD",
  );
  await profile(d, "Cancelled Person", "CP");
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await stored(), { naam: "Anne van Dijk", initialen: "AvD" });
  d = await settings();
  await d
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await stored(), { naam: "Anne van Dijk", initialen: "AvD" });
  report.checks.push(
    "Reload preserves profile; cancelling edits and cancelling a reset preserve stored values.",
  );
  d = await settings();
  await profile(d, "Ada Lovelace", "XYZ");
  await save(d);
  // A second tab receives settings via the storage event.
  const other = await context.newPage();
  await other.goto(baseUrl);
  d = await settings();
  await profile(d, "Grace Hopper", "GH");
  await save(d);
  await other.waitForTimeout(800);
  await other.keyboard.press("Control+,");
  const otherD = other.getByRole("dialog", { name: "Settings", exact: true });
  assert.equal(
    await otherD.getByLabel("Name for comments").inputValue(),
    "Grace Hopper",
  );
  assert.equal(
    await otherD.getByLabel("Initials", { exact: true }).inputValue(),
    "GH",
  );
  await other.close();
  report.checks.push(
    "Name and initials synchronized to an already open browser tab.",
  );
  d = await settings();
  await profile(d, "Ada Lovelace", "XYZ");
  await save(d);
  const template = unzipSync(await readFile("./public/templates/nieuw.docx"));
  template["word/document.xml"] = strToU8(
    strFromU8(template["word/document.xml"]).replace(
      /<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/,
      "<w:p><w:r><w:t>Synthetic text for the identity test.</w:t></w:r></w:p>",
    ),
  );
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Identity.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(zipSync(template)),
    });
  await page.evaluate(() => {
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-tekst",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current;
          if (v?.getEditorRef && v.commands) return v;
        }
      return null;
    };
  });
  await page.waitForFunction(
    () => proefApi()?.getEditorRef()?.getLayout()?.pages.length,
    null,
    { timeout: 60000 },
  );
  await page.evaluate(async () => {
    proefApi().getEditorRef().selectAll();
    await proefApi().flushPendingInput();
  });
  await page.keyboard.press("Control+Alt+c");
  const comment = page.getByRole("dialog", {
    name: "Insert Comment",
    exact: true,
  });
  await comment.waitFor();
  assert.equal(
    await comment.getByLabel("Author", { exact: true }).inputValue(),
    "Ada Lovelace",
  );
  await comment
    .getByLabel("Comment", { exact: true })
    .fill("Synthetic identity test");
  await comment.getByRole("button", { name: "Insert", exact: true }).click();
  await comment.waitFor({ state: "hidden" });
  report.comments = await page.evaluate(() => proefApi().getComments());
  await page.keyboard.press("Control+Shift+s");
  const as = page.getByRole("dialog", { name: "Save as", exact: true });
  await as.waitFor();
  await as.locator("input[type=text]").first().fill("Identity");
  console.log(
    "SAVE ENABLED",
    await as.getByRole("button", { name: "Save", exact: true }).isEnabled(),
  );
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    as.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const zip = unzipSync(bytes);
  const xml = strFromU8(zip["word/comments.xml"]);
  assert.match(xml, /w:author="Ada Lovelace"/);
  assert.match(xml, /w:initials="XYZ"/);
  report.checks.push(
    "Real comment dialog uses saved name; downloaded DOCX contains custom initials XYZ.",
  );
  await writeFile(resolve(output, "identity.docx"), bytes);
  d = await settings();
  await profile(d, "Grace Hopper", "GH");
  await save(d);
  await page
    .locator(".office input[type=file]")
    .first()
    .setInputFiles({
      name: "Reopened.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(bytes),
    });
  await page.waitForFunction(
    () =>
      proefApi()
        ?.getComments()
        ?.some((c) => c.initials === "XYZ"),
    null,
    { timeout: 20000 },
  );
  const reopened = Buffer.from(
    await page.evaluate(async () =>
      Array.from(new Uint8Array(await proefApi().save())),
    ),
  );
  assert.match(
    strFromU8(unzipSync(reopened)["word/comments.xml"]),
    /w:initials="XYZ"/,
  );
  report.checks.push(
    "Reopening and saving the document preserves XYZ after the default name and initials change.",
  );
  d = await settings();
  await d
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await save(d);
  assert.deepEqual(await stored(), { naam: "", initialen: "" });
  await page.reload(); // Defaults may select Dutch on this machine.
  assert.deepEqual(await stored(), { naam: "", initialen: "" });
  report.checks.push(
    "Saving Restore defaults clears both fields and does not resurrect the legacy name after reload.",
  );
  assert.deepEqual(errors, []);
} finally {
  report.lastText = (await page.locator("body").innerText()).slice(-6000);
  await page.screenshot({ path: resolve(output, "screen.png") });
  console.log(JSON.stringify(report, null, 2));
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
