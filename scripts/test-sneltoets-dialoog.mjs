/**
 * #19: werkruimtesneltoetsen mogen een document achter een modaal venster niet wijzigen.
 * Gebruik een productiefrontend: OOS_TEST_DIST=dist node scripts/test-sneltoets-dialoog.mjs.
 * Playwright is apart testgereedschap; OOS_PLAYWRIGHT_MODULE kan naar zijn index.mjs wijzen.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { preview } from "vite";

const { chromium } = await import(process.env.OOS_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.OOS_PLAYWRIGHT_MODULE)).href
  : "playwright");
const uitvoer = resolve(process.env.OOS_TEST_UIT ?? ".local/proef-sneltoets-dialoog");
await mkdir(uitvoer, { recursive: true });
const server = await preview({ configFile: false, build: { outDir: process.env.OOS_TEST_DIST ?? "dist" }, preview: { host: "127.0.0.1", port: 0, open: false } });
const browser = await chromium.launch();
const rapport = { stappen: [], fouten: [] };
const bron = { name: "Sneltoetsproef.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await readFile("public/templates/nieuw.docx") };
const toetsen = ["Control+n", "Control+w", "Control+s", "Control+Shift+s", "Control+o", "F12", "Control+F4", "Control+Tab", "Control+Shift+Tab", "Control+F6", "Control+Shift+F6", "Control+PageDown", "Control+PageUp", "Alt+1", "Alt+9", "Meta+n", "Meta+w", "Meta+s", "Meta+o"];

async function proef(naam, doe) {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
  const bijwerkingen = { bestandKiezen: 0, downloads: 0 };
  page.on("filechooser", () => bijwerkingen.bestandKiezen++);
  page.on("download", () => bijwerkingen.downloads++);
  page.on("pageerror", e => rapport.fouten.push({ naam, fout: String(e) }));
  try {
    await page.addInitScript(() => localStorage.setItem("openaec-office-instellingen", JSON.stringify({ taal: "en", spelling: { controleren: false } })));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?offscreenReplay=0`);
    await page.locator(".office input[type=file]").first().setInputFiles(bron);
    await page.waitForFunction(() => document.querySelector(".office-tabbalk [role=tab][aria-selected=true]")?.textContent?.includes("Sneltoetsproef.docx"));
    await doe(page, bijwerkingen);
    rapport.stappen.push({ naam, geslaagd: true });
    console.log(`OK: ${naam}`);
  } catch (e) {
    rapport.stappen.push({ naam, geslaagd: false, fout: String(e) });
    await page.screenshot({ path: join(uitvoer, `afgekeurd-${rapport.stappen.length}.png`) }).catch(() => {});
    console.error(`FOUT: ${naam}: ${e.message}`);
  } finally { await page.close(); }
}

async function toestand(page) {
  return page.evaluate(() => ({
    tabs: [...document.querySelectorAll(".office-tabbalk [role=tab]")].map(t => ({ tekst: t.textContent, actief: t.getAttribute("aria-selected") })),
    dialogen: [...document.querySelectorAll("[role=dialog], [role=alertdialog], dialog[open]")].filter(e => e.getClientRects().length && !e.closest("[hidden], [inert]")).map(d => d.getAttribute("aria-label") ?? d.querySelector("h2")?.textContent ?? d.id),
  }));
}

try {
  for (const modal of ["overzicht", "instellingen"]) {
    for (const toets of toetsen) await proef(`${modal}: ${toets}`, async (page, bijwerkingen) => {
      await page.keyboard.press(modal === "overzicht" ? "F1" : "Control+,");
      await page.getByRole("dialog").waitFor();
      const voor = await toestand(page);
      await page.keyboard.press(toets);
      await page.waitForTimeout(200);
      assert.deepEqual(await toestand(page), voor, "Tabbladen en dialoog blijven ongewijzigd");
      assert.deepEqual(bijwerkingen, { bestandKiezen: 0, downloads: 0 });
      assert(await page.getByRole("dialog").evaluate(d => d.contains(document.activeElement)), "Focus blijft in de dialoog");
    });
  }
  await proef("overzicht: verloren focus mag Ctrl+W niet laten doorwerken", async page => {
    await page.keyboard.press("F1"); await page.getByRole("dialog").waitFor();
    const voor = await toestand(page);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Control+w");
    await page.waitForTimeout(200);
    assert.deepEqual(await toestand(page), voor);
  });
  await proef("dialoogtekst: Ctrl+A en vervangen blijven lokale invoer", async page => {
    await page.keyboard.press("F1");
    const zoek = page.getByRole("dialog").getByRole("searchbox");
    await zoek.fill("bestaande zoektekst");
    await zoek.press("Control+a"); await zoek.press("t");
    assert.equal(await zoek.inputValue(), "t");
    assert.equal(await page.locator(".office-tabbalk [role=tab]").count(), 2);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.keyboard.press("Control+n");
    await page.waitForFunction(() => document.querySelectorAll(".office-tabbalk [role=tab]").length === 3);
  });
  await proef("editorvenster Ga naar: document blijft open bij Ctrl+W", async page => {
    await page.waitForFunction(() => document.querySelector(".office-lintplek:not([hidden]) .ribbon"));
    await page.getByRole("tab", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "Go To", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    const voor = await toestand(page);
    await page.keyboard.press("Control+w");
    await page.waitForTimeout(200);
    assert.deepEqual(await toestand(page), voor);
  });
  for (const modal of ["alertdialoog", "native dialoog"]) await proef(`${modal}: eigen Ctrl+S krijgt voorrang`, async page => {
    await page.evaluate(soort => {
      const venster = document.createElement(soort === "native dialoog" ? "dialog" : "section");
      venster.id = "toets-proefvenster";
      if (soort === "alertdialoog") { venster.setAttribute("role", "alertdialog"); venster.setAttribute("aria-modal", "true"); }
      venster.innerHTML = '<input aria-label="Proefveld"><output></output>';
      venster.addEventListener("keydown", e => {
        if (e.ctrlKey && e.key === "s") { e.preventDefault(); venster.querySelector("output").textContent = "eigen opslag"; }
      });
      document.body.append(venster);
      if (venster instanceof HTMLDialogElement) venster.showModal();
      venster.querySelector("input").focus();
    }, modal);
    const voor = await toestand(page);
    await page.keyboard.press("Control+s");
    assert.equal(await page.locator("#toets-proefvenster output").textContent(), "eigen opslag");
    assert.deepEqual(await toestand(page), voor);
  });
  await proef("verborgen dialoog blokkeert Ctrl+N niet", async page => {
    await page.evaluate(() => {
      const ouder = document.createElement("div"); ouder.hidden = true;
      ouder.innerHTML = '<section role="dialog" aria-modal="true"></section>';
      document.body.append(ouder);
    });
    await page.keyboard.press("Control+n");
    await page.waitForFunction(() => document.querySelectorAll(".office-tabbalk [role=tab]").length === 3);
    await page.keyboard.press("Control+Tab");
    await page.waitForFunction(() => document.querySelector(".office-tabbalk [role=tab][aria-selected=true]")?.textContent === "Start");
    await page.keyboard.press("Control+Shift+Tab");
    await page.waitForFunction(() => document.querySelector(".office-tabbalk [role=tab][aria-selected=true]")?.textContent?.includes("Untitled"));
    await page.keyboard.press("Control+w");
    await page.waitForFunction(() => document.querySelectorAll(".office-tabbalk [role=tab]").length === 2);
  });
  assert.deepEqual(rapport.fouten, [], "Geen JavaScript-fouten");
  assert(rapport.stappen.every(s => s.geslaagd), "Niet alle sneltoetsproeven slagen");
} finally {
  await writeFile(join(uitvoer, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  await browser.close();
  await new Promise(r => server.httpServer.close(r));
}
