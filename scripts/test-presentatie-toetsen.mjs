// Gebruik vanuit de repository: node scripts/test-presentatie-toetsen.mjs [pad/naar/playwright/index.mjs]
// Vereist een geïnstalleerde Playwright-runtime met Chromium. Geen packagewijzigingen nodig.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build, preview } from "vite";

const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "playwright");
const outDir = ".local/presentatie-toetsen";
await build({ configFile: false, publicDir: false, logLevel: "warn", build: {
  target: "esnext", outDir, emptyOutDir: true,
  rollupOptions: { input: "scripts/proeven/presentatie-toetsen.html" },
} });
const server = await preview({ configFile: false, build: { outDir }, preview: { host: "127.0.0.1", port: 0 } });
let browser;
const resultaten = [];
try {
  browser = await chromium.launch({ headless: true });
  const adres = server.httpServer.address();
  const url = `http://127.0.0.1:${adres.port}/scripts/proeven/presentatie-toetsen.html`;
  async function proef(naam, werk) {
    const page = await browser.newPage();
    try {
      await page.goto(url);
      await page.getByRole("button", { name: "Begin show", exact: true }).click();
      await page.getByRole("button", { name: "Pause timer", exact: true }).waitFor();
      await werk(page);
      resultaten.push({ naam, geslaagd: true });
    } catch (fout) {
      resultaten.push({ naam, geslaagd: false, fout: String(fout) });
    } finally { await page.close(); }
  }
  const knop = (p, naam) => p.getByRole("button", { name: naam, exact: true });
  const dia = async (p, nummer) => assert.equal(await p.locator(".presentator-nummer").textContent(), `Slide ${nummer} of 3`);
  for (const key of ["Enter", "Space"]) {
    await proef(`timer ${key}`, async p => {
      await knop(p, "Pause timer").focus();
      await p.keyboard.press(key);
      await knop(p, "Resume timer").waitFor();
      await dia(p, 1);
      await p.keyboard.press(key);
      await knop(p, "Pause timer").waitFor();
    });
    await proef(`pen ${key}`, async p => {
      await knop(p, "Pen").focus();
      await p.keyboard.press(key);
      assert.equal(await knop(p, "Pen").getAttribute("aria-pressed"), "true");
      await dia(p, 1);
    });
    await proef(`notitiegrootte ${key}`, async p => {
      const tekst = p.locator(".presentator-notitietekst");
      const voor = await tekst.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      await knop(p, "Larger notes").focus();
      await p.keyboard.press(key);
      assert.equal(await tekst.evaluate(el => parseFloat(getComputedStyle(el).fontSize)), voor + 2);
      await dia(p, 1);
    });
    await proef(`vorige dia ${key}`, async p => {
      await p.locator(".voorstelling").focus();
      await p.keyboard.press("ArrowRight");
      await dia(p, 2);
      await knop(p, "Previous").focus();
      await p.keyboard.press(key);
      await dia(p, 1);
    });
    await proef(`voorstelling sluiten ${key}`, async p => {
      await knop(p, "End show").focus();
      await p.keyboard.press(key);
      await p.locator(".voorstelling").waitFor({ state: "detached" });
    });
  }
  await proef("navigatie zonder knopfocus", async p => {
    await p.locator(".voorstelling").focus();
    await p.keyboard.press("Enter");
    await dia(p, 2);
    await p.keyboard.press("Space");
    await dia(p, 3);
    await p.keyboard.press("ArrowLeft");
    await dia(p, 2);
  });
  await proef("dianummer invullen en bevestigen", async p => {
    await p.getByRole("spinbutton").fill("2");
    await p.keyboard.press("Enter");
    await dia(p, 2);
  });
} finally {
  await browser?.close();
  await new Promise((klaar, fout) => server.httpServer.close(e => e ? fout(e) : klaar()));
}
mkdirSync(".local", { recursive: true });
writeFileSync(".local/presentatie-toetsen-resultaten.json", JSON.stringify(resultaten, null, 2));
for (const r of resultaten) console.log(`${r.geslaagd ? "ok" : "FAIL"} ${r.naam}${r.fout ? `: ${r.fout}` : ""}`);
assert.ok(resultaten.every(r => r.geslaagd), "Er zijn toetsenbordproeven mislukt.");
