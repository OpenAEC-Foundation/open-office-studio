// Productiefrontend + nagebootste browser-/Tauri-klembordtoegang.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { strToU8, unzipSync, zipSync } from "fflate";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const url = process.argv[2] ?? "http://127.0.0.1:1453/";
const baseline = process.argv.includes("--baseline");
const uit = ".local/proef-rapport";
await mkdir(uit, { recursive: true });
const delen = unzipSync(
  new Uint8Array(await readFile("public/templates/nieuw.docx")),
);
delen["customXml/rapportproef.xml"] = strToU8(
  "<onbekend>Rapportproef</onbekend>",
);
const bytes = Array.from(zipSync(delen));
const browser = await chromium.launch({ headless: true });
const resultaten = [];
try {
  for (const proef of [
    {
      naam: "browser-toegestaan",
      desktop: false,
      browser: "goed",
      native: "goed",
      succes: true,
    },
    {
      naam: "browser-geweigerd",
      desktop: false,
      browser: "weigeren",
      native: "goed",
      succes: false,
      bewaar: true,
    },
    {
      naam: "browser-api-ontbreekt",
      desktop: false,
      browser: "ontbreekt",
      native: "goed",
      succes: false,
    },
    {
      naam: "desktop-zonder-browser-api",
      desktop: true,
      browser: "ontbreekt",
      native: "goed",
      succes: true,
    },
    {
      naam: "desktop-browser-weigert",
      desktop: true,
      browser: "weigeren",
      native: "goed",
      succes: true,
    },
    {
      naam: "desktop-native-weigert",
      desktop: true,
      browser: "goed",
      native: "weigeren",
      succes: false,
    },
  ]) {
    const context = await browser.newContext({ locale: "nl-NL" });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(e.message));
    await page.addInitScript(
      ({ proef, bytes }) => {
        localStorage.setItem(
          "openaec-office-instellingen",
          JSON.stringify({ taal: "nl", spelling: { controleren: false } }),
        );
        window.rapportProef = { browser: [], native: [], opdrachten: [] };
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value:
            proef.browser === "ontbreekt"
              ? undefined
              : {
                  writeText: async (tekst) => {
                    window.rapportProef.browser.push(tekst);
                    if (proef.browser === "weigeren")
                      throw new DOMException("Denied", "NotAllowedError");
                  },
                },
        });
        if (!proef.desktop) return;
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
            window.rapportProef.opdrachten.push(cmd);
            if (cmd === "systeembestanden")
              return [{ id: 1, naam: "Rapport-één.docx" }];
            if (cmd === "claim_systeembestand")
              return {
                status: "nieuw",
                naam: "Rapport-één.docx",
                token: "proef",
              };
            if (cmd === "lees_werkbestand") return new Uint8Array(bytes).buffer;
            if (cmd === "lees_voorkeuren")
              return JSON.stringify({
                taal: "nl",
                spelling: { controleren: false },
              });
            if (
              cmd === "recente_bestanden" ||
              cmd === "herstel_lijst" ||
              cmd.includes("lettertyp")
            )
              return [];
            if (cmd === "plugin:event|listen") return ++callbackId;
            if (cmd === "plugin:window|is_maximized") return false;
            if (cmd === "plugin:clipboard-manager|write_text") {
              window.rapportProef.native.push(args.text);
              if (proef.native === "weigeren") throw new Error("Native denied");
            }
            return null;
          },
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      },
      { proef, bytes },
    );
    await page.goto(url);
    if (!proef.desktop)
      await page
        .locator("input[type=file]")
        .first()
        .setInputFiles({
          name: "Rapport-één.docx",
          mimeType: "application/octet-stream",
          buffer: Buffer.from(bytes),
        });
    await page
      .getByRole("button", { name: "Details", exact: true })
      .first()
      .click();
    const rapport = page.locator(".rapport-details").first();
    await rapport
      .getByRole("button", { name: "Kopiëren", exact: true })
      .click();
    const verwacht = proef.succes
      ? "Rapport gekopieerd."
      : "Kopiëren is niet toegestaan; gebruik Bewaren.";
    await page
      .waitForFunction(
        (tekst) =>
          document.querySelector(".rapport-acties [role=status]")
            ?.textContent === tekst,
        verwacht,
        { timeout: 2500 },
      )
      .catch(() => {});
    const status = await rapport.getByRole("status").textContent();
    const spoor = await page.evaluate(() => window.rapportProef);
    const teksten = proef.desktop ? spoor.native : spoor.browser;
    const juisteRoute = proef.desktop
      ? spoor.native.length === 1 && spoor.browser.length === 0
      : spoor.native.length === 0;
    const inhoud =
      !proef.succes ||
      (teksten.length === 1 &&
        teksten[0].includes("Bestand: Rapport-één.docx") &&
        teksten[0].includes("Aangepaste XML-gegevens"));
    let bewaren = true;
    if (proef.bewaar) {
      const download = page.waitForEvent("download");
      await rapport
        .getByRole("button", { name: "Bewaren als tekst", exact: true })
        .click();
      const bestand = await download;
      const pad = `${uit}/rapport.txt`;
      await bestand.saveAs(pad);
      bewaren =
        (await readFile(pad, "utf8")).includes("Bestand: Rapport-één.docx") &&
        (await rapport.getByRole("status").textContent()) === "";
    }
    resultaten.push({
      naam: proef.naam,
      geslaagd:
        status === verwacht &&
        juisteRoute &&
        inhoud &&
        bewaren &&
        fouten.length === 0,
      status,
      juisteRoute,
      inhoud,
      bewaren,
      fouten,
    });
    await context.close();
  }
  await writeFile(
    `${uit}/${baseline ? "baseline" : "resultaat"}.json`,
    JSON.stringify(resultaten, null, 2),
  );
  console.log(JSON.stringify(resultaten));
  if (!baseline && resultaten.some((r) => !r.geslaagd)) process.exitCode = 1;
} finally {
  await browser.close();
}
