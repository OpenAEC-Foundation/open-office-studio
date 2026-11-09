// Start de gebouwde frontend en geef de URL mee. Vereist Playwright/Chromium.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const url = process.argv[2] ?? "http://127.0.0.1:1451/";
const uitvoer = ".local/proef-sjablonen";
await mkdir(uitvoer, { recursive: true });
const browser = await chromium.launch({ headless: true });
const resultaten = [];
const fouten = [];
const nativeResultaten = [];
try {
  for (const [soort, ext, documenttype] of [
    ["docx", "dotx", "wordprocessingml.document"],
    ["xlsx", "xltx", "spreadsheetml.sheet"],
    ["pptx", "potx", "presentationml.presentation"],
  ]) {
    const context = await browser.newContext({ locale: "nl-NL" });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => fouten.push(`${ext}: ${e.message}`));
    await page.addInitScript(() =>
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({
          taal: "nl",
          spelling: { controleren: false },
        }),
      ),
    );
    const delen = unzipSync(
      new Uint8Array(await readFile(`public/templates/nieuw.${soort}`)),
    );
    const templateType = documenttype.replace(/\.[^.]+$/, ".template");
    delen["[Content_Types].xml"] = strToU8(
      strFromU8(delen["[Content_Types].xml"]).replace(
        `${documenttype}.main+xml`,
        `${templateType}.main+xml`,
      ),
    );
    const extra = "customXml/sjabloonbewaren.xml";
    delen[extra] = strToU8(
      "<huisstijl>Template source stays intact</huisstijl>",
    );
    const origineel = zipSync(delen);
    const bestand = {
      name: `Huisstijl.${ext.toUpperCase()}`,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(origineel),
    };
    await page.goto(url);
    await page.locator("input[type=file]").first().setInputFiles(bestand);
    await page
      .locator(".office-tabnaam")
      .filter({ hasText: `Naamloos 1.${soort}` })
      .waitFor();
    await page.getByRole("button", { name: "Opslaan", exact: true }).click();
    const dialoog = page.getByRole("dialog", {
      name: "Opslaan als",
      exact: true,
    });
    await dialoog.waitFor();
    await dialoog
      .getByRole("button", { name: "Annuleren", exact: true })
      .click();
    // Dezelfde bron opnieuw kiezen moet een tweede document maken.
    await page.locator("input[type=file]").first().setInputFiles(bestand);
    await page
      .locator(".office-tabnaam")
      .filter({ hasText: `Naamloos 2.${soort}` })
      .waitFor();
    assert.deepEqual(await page.locator(".office-tabnaam").allTextContents(), [
      "Start",
      `Naamloos 1.${soort}`,
      `Naamloos 2.${soort}`,
    ]);
    await page.getByRole("button", { name: "Opslaan", exact: true }).click();
    await dialoog.waitFor();
    assert.equal(
      await dialoog
        .getByRole("textbox", { name: /^Bestandsnaam/ })
        .inputValue(),
      "Naamloos 2",
    );
    const download = page.waitForEvent("download");
    await dialoog.getByRole("button", { name: "Opslaan", exact: true }).click();
    const bestandUit = await download;
    assert.equal(bestandUit.suggestedFilename(), `Naamloos 2.${soort}`);
    const pad = `${uitvoer}/${bestandUit.suggestedFilename()}`;
    await bestandUit.saveAs(pad);
    const bewaard = unzipSync(new Uint8Array(await readFile(pad)));
    assert.match(
      strFromU8(bewaard["[Content_Types].xml"]),
      new RegExp(`${documenttype}\\.main\\+xml`),
    );
    assert.deepEqual(bewaard[extra], delen[extra]);
    assert.deepEqual(unzipSync(origineel), delen);
    // Een opgeslagen document heropent met zijn eigen naam, geen nieuwe sjabloonkopie.
    await page.locator("input[type=file]").first().setInputFiles(pad);
    await page.waitForFunction(
      (soort) =>
        [...document.querySelectorAll(".office-tabnaam")].filter(
          (e) => e.textContent === `Naamloos 2.${soort}`,
        ).length === 2,
      soort,
    );
    await page.screenshot({ path: `${uitvoer}/${ext}.png`, fullPage: true });
    resultaten.push({
      ext,
      naamloos: true,
      tweeOnafhankelijkeKopieen: true,
      opslaanAls: true,
      documenttype: true,
      onbekendDeelBehouden: true,
      origineelOngewijzigd: true,
      heropend: true,
    });
    await context.close();
  }

  // Echte frontendroute met nagebootste IPC: sjabloontoken vrijgeven,
  // terwijl een gewoon document zijn terugschrijf-token behoudt.
  for (const sjabloon of [true, false]) {
    const context = await browser.newContext({ locale: "nl-NL" });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => fouten.push(`IPC: ${e.message}`));
    const delen = unzipSync(
      new Uint8Array(await readFile("public/templates/nieuw.docx")),
    );
    if (sjabloon)
      delen["[Content_Types].xml"] = strToU8(
        strFromU8(delen["[Content_Types].xml"]).replace(
          "wordprocessingml.document.main+xml",
          "wordprocessingml.template.main+xml",
        ),
      );
    await page.addInitScript(
      ({ bytes, naam }) => {
        window.nativeProef = [];
        let callbackId = 1;
        const callbacks = {};
        window.__TAURI_INTERNALS__ = {
          metadata: {
            currentWindow: { label: "main" },
            currentWebview: { label: "main" },
          },
          transformCallback(fn) {
            callbacks[++callbackId] = fn;
            return callbackId;
          },
          unregisterCallback(id) {
            delete callbacks[id];
          },
          invoke: async (cmd, args) => {
            window.nativeProef.push({ cmd, args });
            if (cmd === "systeembestanden") return [{ id: 1, naam }];
            if (cmd === "claim_systeembestand")
              return { status: "nieuw", naam, token: "bron-token" };
            if (cmd === "lees_werkbestand") return new Uint8Array(bytes).buffer;
            if (cmd === "lees_voorkeuren")
              return JSON.stringify({
                taal: "nl",
                spelling: { controleren: false },
              });
            if (cmd === "conversie_status")
              return { gevonden: false, profiel: "veilig" };
            if (cmd === "plugin:event|listen") return ++callbackId;
            if (
              cmd === "recente_bestanden" ||
              cmd === "herstel_lijst" ||
              cmd.includes("lettertyp")
            )
              return [];
            if (cmd === "plugin:window|is_maximized") return false;
            return null;
          },
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      },
      {
        bytes: Array.from(zipSync(delen)),
        naam: sjabloon ? "Huisstijl.dotx" : "Brief.docx",
      },
    );
    await page.goto(url);
    await page
      .locator(".office-tabnaam")
      .filter({ hasText: sjabloon ? "Naamloos 1.docx" : "Brief.docx" })
      .waitFor();
    if (sjabloon) {
      await page.waitForFunction(() =>
        window.nativeProef.some((i) => i.cmd === "vergeet_werkbestand"),
      );
      await page.getByRole("button", { name: "Opslaan", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Opslaan als", exact: true })
        .waitFor();
    }
    const vrijgegeven = await page.evaluate(() =>
      window.nativeProef
        .filter((i) => i.cmd === "vergeet_werkbestand")
        .map((i) => i.args.token),
    );
    assert.deepEqual(vrijgegeven, sjabloon ? ["bron-token"] : []);
    assert.equal(
      await page.evaluate(() =>
        window.nativeProef.some((i) => i.cmd === "bewaar_document"),
      ),
      false,
    );
    nativeResultaten.push({
      sjabloon,
      tokenVrijgegeven: sjabloon,
      bronNietOverschreven: true,
    });
    await context.close();
  }
  assert.deepEqual(fouten, []);
  const uitkomst = { resultaten, nativeIpcStub: nativeResultaten, fouten };
  await writeFile(
    `${uitvoer}/resultaat.json`,
    JSON.stringify(uitkomst, null, 2),
  );
  console.log(JSON.stringify(uitkomst));
} finally {
  await browser.close();
}
