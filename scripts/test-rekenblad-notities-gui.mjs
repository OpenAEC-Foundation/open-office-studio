/** #71: celnotities via de productie-interface en onafhankelijke XLSX-controle. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer, preview } from "vite";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-rekenblad-notities",
);
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { schrijfCelnotitie, leesCelnotities } = await ssr.ssrLoadModule(
  "/src/rekenblad/celnotities.ts",
);
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
const basis = new Uint8Array(await readFile("public/templates/nieuw.xlsx"));
const bron = schrijfCelnotitie(
  schrijfCelnotitie(basis, 0, "B2", {
    auteur: "Anna",
    tekst: "Bestaande notitie",
    zichtbaar: false,
  }),
  0,
  "D5",
  { auteur: "Renée", tekst: "Altijd zichtbaar", zichtbaar: true },
);
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const port = server.httpServer.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: "en-US",
});
const rapport = { stappen: [], fouten: [] };
page.on("pageerror", (e) => rapport.fouten.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") rapport.fouten.push(m.text());
});
const stap = (naam) => {
  rapport.stappen.push(naam);
  console.log(naam);
};
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "forge" }),
    ),
  );
  await page.goto(`http://127.0.0.1:${port}/`);
  const bestand = page.locator(".office input[type=file]").first();
  await bestand.setInputFiles({
    name: "Notitieproef.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(bron),
  });
  await page.evaluate(() => {
    window.proefBewaar = async () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-rekenblad-host",
      );
      for (
        let f =
          el?.[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const v = f.memoizedProps?.value;
        if (v?.rekenblad?.handle && v.herlaad)
          return Array.from(await v.herlaad.bytes());
      }
      throw new Error("Geen opslagkoppeling gevonden");
    };
    window.proefApi = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-rekenblad-host",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const provider = f.memoizedProps?.value?.rekenblad;
        if (provider?.handle && provider.selectCells) return provider;
        for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
          const v = s.memoizedState?.current ?? s.memoizedState;
          if (v?.handle && v.selectCells && v.save) return v;
        }
      }
      return null;
    };
  });
  await page.waitForFunction(
    () => {
      try {
        return proefApi()?.handle.sheetInfo().sheetNames.length;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60_000 },
  );
  const indicator = (cell) =>
    page.getByRole("button", { name: `Note in ${cell}`, exact: true });
  await indicator("B2").waitFor();
  await indicator("D5").waitFor();
  await page
    .getByRole("note")
    .filter({ hasText: "Altijd zichtbaar" })
    .waitFor();
  const hoek = await indicator("B2").boundingBox();
  assert(hoek);
  await page.mouse.move(hoek.x - 18, hoek.y + 12);
  await page
    .getByRole("note")
    .filter({ hasText: "Bestaande notitie" })
    .waitFor();
  stap(
    "Bestaande notities in lege cellen: indicator, celhover en altijd tonen",
  );
  async function kies(row, col) {
    await page.evaluate(
      async ({ row, col }) => {
        const api = proefApi();
        await api.selectCells(0, { anchor: { row, col }, focus: { row, col } });
        api.focus();
      },
      { row, col },
    );
    await page.waitForTimeout(100);
  }
  async function open() {
    await page.getByRole("tab", { name: "Tools", exact: true }).click();
    await page
      .getByRole("button", { name: "Add or edit note", exact: true })
      .click();
    const venster = page.getByRole("dialog", {
      name: "Cell notes",
      exact: true,
    });
    await venster.getByRole("textbox", { name: "Note", exact: true }).waitFor();
    await page.waitForTimeout(150);
    return venster;
  }
  async function veranderd(actie) {
    await page.evaluate(() => {
      window.oudeHandle = proefApi().handle;
    });
    await actie();
    await page.waitForFunction(
      () => {
        try {
          return (
            proefApi()?.handle !== oudeHandle &&
            proefApi()?.handle.sheetInfo().sheetNames.length
          );
        } catch {
          return false;
        }
      },
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(150);
  }
  await kies(2, 2);
  let venster = await open();
  await venster
    .getByRole("textbox", { name: "Author", exact: true })
    .fill("Zoë & Co");
  await venster
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Nieuwe notitie < 10 € 😀\nVolgende regel");
  await venster
    .getByRole("checkbox", { name: "Always show this note", exact: true })
    .check();
  await page.screenshot({ path: join(uit, "notitie-bewerken.png") });
  await veranderd(() =>
    venster.getByRole("button", { name: "Save", exact: true }).click(),
  );
  await indicator("C3").waitFor();
  const saved = await page.evaluate(async () => proefBewaar());
  const notities = leesCelnotities(new Uint8Array(saved))[0];
  assert.deepEqual(
    notities.find((n) => n.cel === "C3"),
    {
      cel: "C3",
      auteur: "Zoë & Co",
      tekst: "Nieuwe notitie < 10 € 😀\nVolgende regel",
      zichtbaar: true,
    },
  );
  assert.equal(notities.length, 3);
  stap("Nieuwe notitie met auteur, Unicode en zichtbaarheid staat in de XLSX");
  await writeFile(join(uit, "Notities-bewaard.xlsx"), new Uint8Array(saved));
  await veranderd(() =>
    bestand.setInputFiles({
      name: "Notities-heropend.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(saved),
    }),
  );
  await indicator("C3").click();
  venster = page.getByRole("dialog", { name: "Cell notes", exact: true });
  await page.waitForTimeout(200);
  assert.equal(
    await venster
      .getByRole("textbox", { name: "Author", exact: true })
      .inputValue(),
    "Zoë & Co",
  );
  await venster.getByRole("button", { name: "Next note", exact: true }).click();
  assert.equal(
    await venster
      .getByRole("textbox", { name: "Note", exact: true })
      .inputValue(),
    "Altijd zichtbaar",
  );
  await venster
    .getByRole("button", { name: "Previous note", exact: true })
    .click();
  await venster
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Bewerkte notitie");
  assert.equal(
    await venster
      .getByRole("button", { name: "Next note", exact: true })
      .isDisabled(),
    true,
  );
  await veranderd(() =>
    venster.getByRole("button", { name: "Save", exact: true }).click(),
  );
  stap("Heropenen, vorige/volgende en bewerken behouden de juiste notitie");
  await indicator("C3").click();
  venster = page.getByRole("dialog", { name: "Cell notes", exact: true });
  await page.waitForTimeout(200);
  await veranderd(() =>
    venster.getByRole("button", { name: "Delete note", exact: true }).click(),
  );
  await kies(0, 0);
  await indicator("B2").waitFor();
  assert.equal(await indicator("C3").count(), 0);
  const na = new Uint8Array(await page.evaluate(async () => proefBewaar()));
  assert.deepEqual(leesCelnotities(na), leesCelnotities(bron));
  stap("Verwijderen laat de twee oorspronkelijke notities ongemoeid");
  await page.screenshot({ path: join(uit, "notities-eind.png") });
  await page.evaluate(async () => {
    proefApi().handle.applyOps([
      { type: "insertRows", sheet: 0, at: 1, count: 1 },
    ]);
    await proefApi().version();
  });
  await indicator("B3").waitFor();
  let verschoven = new Uint8Array(await page.evaluate(() => proefBewaar()));
  assert.deepEqual(
    leesCelnotities(verschoven)[0].map((n) => n.cel),
    ["B3", "D6"],
  );
  await page.evaluate(async () => {
    await proefApi().commands.execute("undo", null);
    await proefApi().version();
  });
  await indicator("B2").waitFor();
  assert.deepEqual(
    leesCelnotities(new Uint8Array(await page.evaluate(() => proefBewaar()))),
    leesCelnotities(bron),
  );
  await page.evaluate(async () => {
    await proefApi().commands.execute("redo", null);
    await proefApi().version();
  });
  verschoven = new Uint8Array(await page.evaluate(() => proefBewaar()));
  assert.deepEqual(
    leesCelnotities(verschoven)[0].map((n) => n.cel),
    ["B3", "D6"],
  );
  stap(
    "Rij invoegen, Undo/Redo en de echte opslagkoppeling behouden de celankers",
  );
  const beschermd = new Pakket(bron);
  beschermd.schrijf(
    "xl/worksheets/sheet1.xml",
    beschermd
      .lees("xl/worksheets/sheet1.xml")
      .replace(
        "</worksheet>",
        '<sheetProtection sheet="1" objects="1"/></worksheet>',
      ),
  );
  await veranderd(() =>
    bestand.setInputFiles({
      name: "Beschermde-notities.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(beschermd.inpakken()),
    }),
  );
  await indicator("B2").click();
  venster = page.getByRole("dialog", { name: "Cell notes", exact: true });
  await page.waitForTimeout(200);
  assert.equal(
    await venster
      .getByRole("button", { name: "Delete note", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await venster
      .getByRole("textbox", { name: "Note", exact: true })
      .getAttribute("readonly"),
    "",
  );
  assert.equal(
    await venster
      .getByRole("textbox", { name: "Note", exact: true })
      .inputValue(),
    "Bestaande notitie",
  );
  stap("Beveiligd blad: notitie leesbaar en wijzigacties uitgeschakeld");
  assert.deepEqual(rapport.fouten, []);
} catch (e) {
  rapport.fout = String(e);
  await page.screenshot({ path: join(uit, "afgekeurd.png") }).catch(() => {});
  throw e;
} finally {
  await writeFile(
    join(uit, "rapport.json"),
    JSON.stringify(rapport, null, 2) + "\n",
  );
  await browser.close();
  await ssr.close();
  await new Promise((ok) => server.httpServer.close(ok));
}
