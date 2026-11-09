/**
 * #196: run against a production preview (default http://127.0.0.1:1489).
 * Requires Playwright/Chromium as optional test tooling. If it is installed
 * elsewhere, OOS_PLAYWRIGHT_MODULE can be its index.mjs file URL.
 * The desktop clipboard IPC is stubbed; this does not test native WebView2.
 * Results and the synthetic DOCX fixture go to .local/reactie-plakken/.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";

const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE || "playwright");
const url = process.env.OOS_PROEF_URL || "http://127.0.0.1:1489";
const uit = process.env.OOS_PROEF_UIT || ".local/reactie-plakken";
await mkdir(uit, { recursive: true });
const basis = "Basiszin. Akkoord.";
const antwoord = "Antwoord voor de lokale test.";
const opmerking = "Controleer deze proefzin.";
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const wijzig = (naam, zoek, nieuw) => {
  const xml = strFromU8(pakket[naam]);
  assert.match(xml, zoek);
  pakket[naam] = strToU8(xml.replace(zoek, nieuw));
};
wijzig("word/document.xml", /<w:body>[\s\S]*?<w:sectPr/,
  `<w:body><w:p><w:commentRangeStart w:id="0"/><w:r><w:t>${basis}</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p><w:sectPr`);
pakket["word/comments.xml"] = strToU8(`<w:comments xmlns:w="${w}"><w:comment w:id="0" w:author="Tester" w:initials="T" w:date="2026-11-09T09:00:00Z"><w:p><w:r><w:t>${opmerking}</w:t></w:r></w:p></w:comment></w:comments>`);
wijzig("[Content_Types].xml", /<\/Types>/,
  '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>');
wijzig("word/_rels/document.xml.rels", /<\/Relationships>/,
  '<Relationship Id="rIdCommentProbe" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>');
const fixture = Buffer.from(zipSync(pakket));
await writeFile(`${uit}/Reactie.docx`, fixture);
const browser = await chromium.launch({ headless: true });
const resultaten = [];
const errors = [];
const leesBody = async p => (await p.locator(".layout-page-mirror .layout-paragraph").allTextContents()).join("\n");

async function open(desktop) {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1450, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await context.newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false } })));
  await p.goto(url);
  await p.locator("input[type=file]").setInputFiles({ name: "Reactie.docx", mimeType: "application/octet-stream", buffer: fixture });
  // The accessibility mirror is deliberately hidden behind the canvas.
  await p.locator(".layout-page-mirror .layout-paragraph").filter({ hasText: basis }).waitFor({ state: "attached" });
  if (desktop) await p.evaluate(tekst => {
    window.__oosIpc = [];
    window.__TAURI_INTERNALS__ = { invoke: async name => { window.__oosIpc.push(name); return tekst; } };
  }, antwoord);
  await p.evaluate(tekst => navigator.clipboard.writeText(tekst), antwoord);
  return { p, context };
}

async function proef(naam, desktop, doe) {
  const { p, context } = await open(desktop);
  try {
    await doe(p);
    resultaten.push({ naam, geslaagd: true });
    console.log(`PASS ${naam}`);
  } catch (e) {
    resultaten.push({ naam, geslaagd: false, fout: e.message });
    console.log(`FAIL ${naam}: ${e.message}`);
    await p.screenshot({ path: `${uit}/${resultaten.length}-fout.png` });
  } finally { await context.close(); }
}

try {
  for (const desktop of [false, true]) {
    for (const toets of ["Control+v", "Control+Shift+v"]) {
      await proef(`${desktop ? "desktop" : "browser"} reply ${toets}`, desktop, async p => {
        await p.locator('[data-testid="yrs-input"]').focus();
        await p.keyboard.press("Control+a");
        await p.getByText(opmerking, { exact: true }).click();
        const reply = p.getByPlaceholder("Reply or add others with @");
        await reply.click();
        assert.equal(await reply.evaluate(e => e === document.activeElement), true);
        await p.keyboard.press(toets);
        await p.waitForTimeout(250);
        assert.equal(await reply.inputValue(), antwoord);
        assert.equal(await leesBody(p), basis);
        // A second paste must stay in the reply as well (old document caret).
        await p.keyboard.press(toets);
        await p.waitForTimeout(250);
        assert.equal(await reply.inputValue(), antwoord + antwoord);
        assert.equal(await leesBody(p), basis);
        await p.getByRole("button", { name: "Reply", exact: true }).click();
        await p.locator(".docx-review-reply__body").filter({ hasText: antwoord }).waitFor();
        assert.equal(await p.locator(".docx-review-reply__body").textContent(), antwoord + antwoord);
        if (desktop) assert.deepEqual(await p.evaluate(() => window.__oosIpc), []);
        if (desktop && toets === "Control+v") {
          // Save/reopen uses the real browser download route, not stubbed IPC.
          await p.evaluate(() => delete window.__TAURI_INTERNALS__);
          await p.keyboard.press("Control+s");
          const download = p.waitForEvent("download");
          await p.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
          const bestand = await download;
          const bytes = await readFile(await bestand.path());
          await writeFile(`${uit}/Bewaard.docx`, bytes);
          const zip = unzipSync(bytes);
          assert.ok(strFromU8(zip["word/document.xml"]).includes(basis));
          assert.ok(strFromU8(zip["word/comments.xml"]).includes(antwoord + antwoord));
          const heropend = await p.context().newPage();
          await heropend.goto(url);
          await heropend.locator("input[type=file]").setInputFiles({ name: "Bewaard.docx", mimeType: "application/octet-stream", buffer: bytes });
          await heropend.locator(".layout-page-mirror .layout-paragraph").filter({ hasText: basis }).waitFor({ state: "attached" });
          assert.equal(await leesBody(heropend), basis);
          await heropend.getByText(opmerking, { exact: true }).click();
          assert.equal(await heropend.locator(".docx-review-reply__body").textContent(), antwoord + antwoord);
          await heropend.close();
        }
      });
    }
    for (const toets of ["Control+v", "Control+Shift+v"]) {
      await proef(`${desktop ? "desktop" : "browser"} document ${toets}`, desktop, async p => {
        await p.locator('[data-testid="yrs-input"]').focus();
        await p.keyboard.press("Control+a");
        await p.keyboard.press(toets);
        await p.waitForFunction(tekst => [...document.querySelectorAll(".layout-page-mirror .layout-paragraph")].map(e => e.textContent).join("\n") === tekst, antwoord);
        assert.equal(await leesBody(p), antwoord);
        await p.keyboard.press("Control+z");
        await p.waitForFunction(tekst => [...document.querySelectorAll(".layout-page-mirror .layout-paragraph")].map(e => e.textContent).join("\n") === tekst, basis);
      });
    }
  }
  await proef("desktop reply copied document text", true, async p => {
    await p.locator('[data-testid="yrs-input"]').focus();
    await p.keyboard.press("Control+a");
    await p.keyboard.press("Control+c");
    await p.getByText(opmerking, { exact: true }).click();
    const reply = p.getByPlaceholder("Reply or add others with @");
    await reply.click();
    await p.keyboard.press("Control+v");
    await p.waitForTimeout(250);
    assert.equal(await reply.inputValue(), basis);
    assert.equal(await leesBody(p), basis);
  });
} finally {
  await browser.close();
  await writeFile(`${uit}/resultaten.json`, JSON.stringify({ url, resultaten, errors }, null, 2));
}
assert.equal(errors.length, 0, `Browser errors: ${errors.join("; ")}`);
assert.equal(resultaten.filter(r => !r.geslaagd).length, 0, "Browser regressions failed");
