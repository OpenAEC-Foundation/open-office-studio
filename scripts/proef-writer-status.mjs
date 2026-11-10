/** Actual language-status changes across runs/paragraphs with the Writer test build. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { preview } from "vite";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const outDir = process.argv[2] ?? ".local/status-after-20261110";
const pakket = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
const xml = strFromU8(pakket["word/document.xml"]);
const sectie = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
const run = (taal, tekst) =>
  `<w:r><w:rPr><w:lang w:val="${taal}"/></w:rPr><w:t xml:space="preserve">${tekst}</w:t></w:r>`;
const teksten = ["Nederlands English", "Bonjour", "Nogmaals Nederlands"];
const inhoud =
  `<w:p>${run("nl-NL", "Nederlands ")}${run("en-GB", "English")}</w:p>` +
  `<w:p>${run("fr-FR", "Bonjour")}</w:p><w:p>${run("nl-NL", teksten[2])}</w:p>`;
pakket["word/document.xml"] = strToU8(
  xml.replace(
    /<w:body>[\s\S]*<\/w:body>/,
    `<w:body>${inhoud}${sectie}</w:body>`,
  ),
);
const fixture = Buffer.from(zipSync(pakket));
const server = await preview({
  configFile: false,
  build: { outDir },
  preview: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "light" }),
    ),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const open = async (bytes, name = "status.docx") => {
    await page.evaluate(() => {
      window.__oudeSessie = window.__writerApis
        ?.tekst()
        ?.getEditorRef()
        ?.getYrsSession();
    });
    await page.locator("input[type=file]").first().setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: bytes,
    });
    await page.waitForFunction(() => {
      const s = window.__writerApis?.tekst()?.getEditorRef()?.getYrsSession();
      return (
        s && s !== window.__oudeSessie && s.paragraphs("body").length === 3
      );
    });
    await page.waitForSelector(".canvas-page canvas:visible");
    await page.evaluate(async () => {
      await window.__writerApis.tekst().flushPendingInput();
      await document.fonts.ready;
      window.__writerApis.tekst().focus();
    });
  };
  const controles = [];
  const taal = async (naam, verwacht) => {
    try {
      await page.waitForFunction(
        (v) =>
          document.querySelector(".statusbalk-taal")?.textContent?.includes(v),
        verwacht,
        { timeout: 20000 },
      );
    } catch (e) {
      console.error(
        naam,
        await page.evaluate(() => ({
          taal: document.querySelector(".statusbalk-taal")?.textContent,
          selectie: window.__writerApis.tekst().getSelectionInfo(),
          statusbalk: document.querySelector(".statusbalk")?.textContent,
        })),
      );
      throw e;
    }
    controles.push({
      naam,
      taal: await page.locator(".statusbalk-taal").innerText(),
    });
    console.log(naam, controles.at(-1).taal);
  };
  await open(fixture);
  await page.keyboard.press("Control+Home");
  await taal("eerste run", "Dutch");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await taal("andere run binnen dezelfde alinea", "English");
  await page.keyboard.press("Control+ArrowDown");
  await taal("volgende alinea", "French");
  await page.keyboard.press("Control+End");
  await taal("laatste alinea", "Dutch");
  await page.keyboard.type(" slot");
  await page.evaluate(() => window.__writerApis.tekst().flushPendingInput());
  const verwacht = [...teksten.slice(0, 2), teksten[2] + " slot"];
  const leesTekst = () =>
    page.evaluate(() =>
      window.__writerApis
        .tekst()
        .getEditorRef()
        .getYrsSession()
        .paragraphs("body")
        .map((p) => p.text),
    );
  assert.deepEqual(await leesTekst(), verwacht);
  const bytes = await page.evaluate(async () =>
    Array.from(new Uint8Array(await window.__writerApis.tekst().save())),
  );
  // Een nieuwe appinstantie controleert de opgeslagen bron onafhankelijk.
  // --second-tab onderzoekt daarnaast de bestaande gedeelde statuswinkel.
  if (!process.argv.includes("--second-tab")) await page.reload();
  await open(Buffer.from(bytes), "status-heropend.docx");
  await page.keyboard.press("Control+Home");
  await taal("opnieuw geopend document", "Dutch");
  assert.deepEqual(await leesTekst(), verwacht);
  assert.deepEqual(fouten, []);
  fs.mkdirSync(".local", { recursive: true });
  fs.writeFileSync(
    ".local/writer-status-controle.json",
    JSON.stringify({ controles, tekstExact: true, fouten }, null, 2),
  );
  console.log(JSON.stringify({ controles, tekstExact: true, fouten }));
} finally {
  await browser?.close();
  await new Promise((r, j) => server.httpServer.close((e) => (e ? j(e) : r())));
}
