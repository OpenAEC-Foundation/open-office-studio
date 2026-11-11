// Playwright/Chromium: productiefrontend met vaste klok en echte tijdzone.
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const url = process.argv[2] ?? "http://127.0.0.1:1454/";
const baseline = process.argv.includes("--baseline");
const browser = await chromium.launch({ headless: true });
const resultaten = [];
try {
  for (const proef of [
    {
      naam: "wintertijd-nl",
      taal: "nl",
      nu: "2026-10-26T11:00:00Z",
      datum: "2026-10-24T22:30:00Z",
      verwacht: "Gisteren",
    },
    {
      naam: "wintertijd-en",
      taal: "en",
      nu: "2026-10-26T11:00:00Z",
      datum: "2026-10-24T22:30:00Z",
      verwacht: "Yesterday",
    },
    {
      naam: "voor-zomertijd",
      taal: "nl",
      nu: "2026-03-30T10:00:00Z",
      datum: "2026-03-28T22:30:00Z",
      verwacht: "28",
    },
    {
      naam: "toekomst",
      taal: "nl",
      nu: "2026-11-09T11:00:00Z",
      datum: "2026-11-10T07:00:00Z",
      verwacht: "10",
    },
    {
      naam: "vandaag",
      taal: "nl",
      nu: "2026-11-09T11:00:00Z",
      datum: "2026-11-09T07:00:00Z",
      verwacht: "Vandaag",
    },
    {
      naam: "jaargrens",
      taal: "nl",
      nu: "2027-01-01T11:00:00Z",
      datum: "2026-12-31T07:00:00Z",
      verwacht: "Gisteren",
    },
  ]) {
    const context = await browser.newContext({
      locale: proef.taal === "nl" ? "nl-NL" : "en-GB",
      timezoneId: "Europe/Amsterdam",
    });
    const page = await context.newPage();
    const fouten = [];
    page.on("pageerror", (e) => fouten.push(e.message));
    await page.clock.setFixedTime(new Date(proef.nu));
    await page.addInitScript((proef) => {
      localStorage.setItem(
        "openaec-office-instellingen",
        JSON.stringify({ taal: proef.taal }),
      );
      sessionStorage.setItem(
        "openaec-office-recent",
        JSON.stringify([
          {
            naam: "Datumproef.docx",
            datum: Date.parse(proef.datum),
            vast: false,
          },
        ]),
      );
    }, proef);
    await page.goto(url);
    const tijd = page.locator(".start-recent time").first();
    await tijd.waitFor();
    const tekst = await tijd.textContent();
    resultaten.push({
      naam: proef.naam,
      tekst,
      verwacht: proef.verwacht,
      geslaagd: tekst.startsWith(proef.verwacht) && fouten.length === 0,
      fouten,
    });
    await context.close();
  }
  await mkdir(".local/proef-recente-datums", { recursive: true });
  await writeFile(
    `.local/proef-recente-datums/${baseline ? "baseline" : "resultaat"}.json`,
    JSON.stringify(resultaten, null, 2),
  );
  console.log(JSON.stringify(resultaten));
  if (!baseline && resultaten.some((p) => !p.geslaagd)) process.exitCode = 1;
} finally {
  await browser.close();
}
