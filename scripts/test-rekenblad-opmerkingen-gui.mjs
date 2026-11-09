import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, preview } from "vite";
import { openWorkbook, initWasm } from "@betteroffice/xlsx";
const { chromium } = await import(
  process.env.OOS_PLAYWRIGHT_MODULE ?? "playwright"
);
const uit = process.env.OFFICE_TEST_UIT ?? ".local/proef-opmerkingen";
await mkdir(uit, { recursive: true });
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const { Pakket } = await ssr.ssrLoadModule("/src/grafieken/pakket.ts");
const { schrijfCelnotitie, leesCelnotities } = await ssr.ssrLoadModule(
  "/src/rekenblad/celnotities.ts",
);
const { wijzigDiscussie, leesDiscussies } = await ssr.ssrLoadModule(
  "/src/rekenblad/discussies.ts",
);
const { leesAfdrukInstellingen } = await ssr.ssrLoadModule(
  "/src/afdrukken/rekenbladInstellingen.ts",
);
await initWasm(await readFile("vendor/rekenbladengine/xlsx_wasm_bg.wasm"));
const h = openWorkbook(
  new Uint8Array(await readFile("public/templates/nieuw.xlsx")),
);
h.applyOps([{ type: "addSheet", index: 1, name: "Second" }]);
h.editCell(0, 0, 0, "Cell payload");
let bron = h.save();
h.dispose();
bron = schrijfCelnotitie(bron, 0, "D5", {
  auteur: "Classic author",
  tekst: "Visible classic note",
  zichtbaar: true,
});
bron = schrijfCelnotitie(bron, 0, "E6", {
  auteur: "Hidden author",
  tekst: "Hidden classic note",
  zichtbaar: false,
});
bron = schrijfCelnotitie(bron, 1, "C3", {
  auteur: "Other sheet",
  tekst: "Note on second sheet",
  zichtbaar: true,
});
const p = new Pakket(bron);
p.schrijf("customXml/comment-probe.xml", "<keep>comment-probe</keep>");
bron = p.inpakken();
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? ".local/dist-spreadsheet" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const browser = await chromium.launch(),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    locale: "en-GB",
  });
const report = { steps: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e)));
const step = (s) => {
  report.steps.push(s);
  console.log(s);
};
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      "openaec-office-instellingen",
      JSON.stringify({ taal: "en", thema: "forge" }),
    ),
  );
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  async function open(bytes, name) {
    await page
      .locator(".office input[type=file]")
      .first()
      .setInputFiles({
        name,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(bytes),
      });
  }
  await open(bron, "Comments.xlsx");
  await page.evaluate(() => {
    window.proefContext = () => {
      const el = document.querySelector(
        ".office-tabpaneel:not([hidden]) .office-rekenblad-host",
      );
      if (!el) return null;
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      ) {
        const v = f.memoizedProps?.value;
        if (v?.rekenblad?.handle && v.herlaad) return v;
      }
      return null;
    };
    window.proefApi = () => proefContext()?.rekenblad;
  });
  await page.waitForFunction(
    () => {
      try {
        return !!proefApi()?.handle.sheetInfo().sheetNames.length;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60000 },
  );
  async function kies(blad, row, col) {
    await page.evaluate(
      ({ blad, row, col }) => {
        const a = proefApi();
        a.selectCells(blad, { anchor: { row, col }, focus: { row, col } });
        a.focus();
      },
      { blad, row, col },
    );
    await page.waitForTimeout(150);
  }
  const bytes = async () =>
    new Uint8Array(
      await page.evaluate(async () =>
        Array.from(await proefContext().herlaad.bytes()),
      ),
    );
  async function vervang(actie) {
    await page.evaluate(() => (window.oud = proefApi().handle));
    await actie();
    await page.waitForFunction(
      () => {
        try {
          return (
            !!proefApi() &&
            proefApi().handle !== oud &&
            !!proefApi().handle.sheetInfo().sheetNames.length
          );
        } catch {
          return false;
        }
      },
      null,
      { timeout: 60000 },
    );
  }
  async function discussie() {
    await page.getByRole("tab", { name: "Tools", exact: true }).click();
    await page
      .getByRole("button", { name: "Discussions and notes", exact: true })
      .click();
    const d = page.getByRole("dialog", {
      name: "Cell discussions and notes",
      exact: true,
    });
    await d.waitFor();
    await d
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .waitFor();
    return d;
  }
  await kies(0, 1, 1);
  let d = await discussie();
  await d.getByLabel("Author", { exact: true }).fill("Anna");
  await d
    .getByLabel("New discussion", { exact: true })
    .fill("A question for the project");
  await vervang(() =>
    d.getByRole("button", { name: "Start discussion", exact: true }).click(),
  );
  let ds = leesDiscussies(await bytes())[0];
  assert.equal(ds[0].cel, "B2");
  await page
    .getByRole("button", { name: "Discussion in B2", exact: true })
    .waitFor();
  step("Create a discussion through the UI, with author and in-cell indicator");
  d = await discussie();
  await d.getByText("A question for the project", { exact: true }).waitFor();
  await d.getByLabel("Author", { exact: true }).fill("Renée");
  await d
    .getByLabel("Reply", { exact: true })
    .fill("Reply with Unicode: café & ideas");
  await vervang(() =>
    d.getByRole("button", { name: "Post reply", exact: true }).click(),
  );
  assert.equal(leesDiscussies(await bytes())[0][0].berichten.length, 2);
  d = await discussie();
  await vervang(() =>
    d.getByRole("button", { name: "Resolve discussion", exact: true }).click(),
  );
  assert.equal(leesDiscussies(await bytes())[0][0].opgelost, true);
  d = await discussie();
  assert.equal(await d.getByLabel("Reply", { exact: true }).isDisabled(), true);
  await vervang(() =>
    d.getByRole("button", { name: "Reopen discussion", exact: true }).click(),
  );
  assert.equal(leesDiscussies(await bytes())[0][0].opgelost, false);
  step("Reply, resolve, disable replies while resolved, and reopen");
  d = await discussie();
  await page.screenshot({ path: `${uit}/discussion.png`, fullPage: true });
  await d
    .getByLabel("Go to comment", { exact: true })
    .selectOption({ label: "Second · C3 · Cell notes" });
  await d.getByText("Note on second sheet", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => proefApi().handle.sheetInfo().activeSheet),
    1,
  );
  await d
    .getByRole("button", { name: "Previous comment", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => proefApi().handle.sheetInfo().activeSheet),
    0,
  );
  await d.getByRole("button", { name: "Close", exact: true }).last().click();
  step("Navigate between threads and classic notes across worksheets");
  await kies(0, 1, 1);
  await page.evaluate(() =>
    proefApi().handle.applyOps([
      { type: "insertRows", sheet: 0, at: 1, count: 1 },
    ]),
  );
  let saved = await bytes();
  assert.equal(leesDiscussies(saved)[0][0].cel, "B3");
  assert.equal(leesCelnotities(saved)[0][0].cel, "D6");
  await page.evaluate(() => proefApi().handle.undo());
  assert.equal(leesDiscussies(await bytes())[0][0].cel, "B2");
  await page.evaluate(() => proefApi().handle.redo());
  assert.equal(leesDiscussies(await bytes())[0][0].cel, "B3");
  saved = await bytes();
  await writeFile(`${uit}/saved.xlsx`, saved);
  await writeFile(
    `${uit}/resolved.xlsx`,
    wijzigDiscussie(saved, 0, {
      soort: "oplossen",
      id: leesDiscussies(saved)[0][0].id,
      opgelost: true,
    }),
  );
  assert.equal(
    new Pakket(saved).lees("customXml/comment-probe.xml"),
    "<keep>comment-probe</keep>",
  );
  await page.evaluate(
    (xmls) => {
      for (const [n, xml] of xmls) {
        const parsed = new DOMParser().parseFromString(xml, "application/xml");
        if (parsed.querySelector("parsererror"))
          throw Error(
            n + ": " + parsed.querySelector("parsererror").textContent,
          );
      }
    },
    new Pakket(saved)
      .namen()
      .filter((n) => /\.(xml|rels)$/.test(n))
      .map((n) => [n, new Pakket(saved).lees(n)]),
  );
  step(
    "Structural edits, Undo/Redo and strict XML parsing preserve both annotation formats",
  );
  await open(saved, "Reopened comments.xlsx");
  await page.waitForFunction(
    () => {
      try {
        return !!document.querySelector('[aria-label="Discussion in B3"]');
      } catch {
        return false;
      }
    },
    null,
    { timeout: 60000 },
  );
  await kies(0, 0, 0);
  await page.getByRole("tab", { name: "View", exact: true }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
  const preview = page.getByRole("dialog").filter({
    has: page.getByLabel("Cell comments and notes", { exact: true }),
  });
  await preview.waitFor();
  async function prepared() {
    return page.evaluate(async () => {
      const el = document.querySelector(".afdrukvoorbeeld");
      for (
        let f = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
        f;
        f = f.return
      )
        for (let s = f.memoizedState; s; s = s.next) {
          const d = s.memoizedState;
          if (d?.paginas?.length) {
            return {
              labels: d.paginas.map((p) => p.label),
              texts: await Promise.all(
                d.paginas.map(async (p) =>
                  (await p.teken(72)).tekst.map((t) => t.tekst).join("\n"),
                ),
              ),
            };
          }
        }
      return null;
    });
  }
  async function waitText(check) {
    for (let i = 0; i < 100; i++) {
      const p = await prepared();
      if (p && check(p)) return p;
      await page.waitForTimeout(100);
    }
    throw Error("Print document did not meet assertion");
  }
  await waitText(
    (p) => p.texts.length === 1 && !p.texts.join().includes("classic note"),
  );
  await preview
    .getByLabel("Cell comments and notes", { exact: true })
    .selectOption("atEnd");
  const atEnd = await waitText(
    (p) =>
      p.texts.length === 2 && p.texts.join().includes("Reply with Unicode"),
  );
  assert.match(atEnd.texts.join(), /Visible classic note/);
  assert.match(atEnd.texts.join(), /Hidden classic note/);
  assert.match(atEnd.texts.join(), /Anna/);
  assert.match(atEnd.texts.join(), /Renée/);
  assert.match(atEnd.texts.join(), /B3/);
  const downloadPromise = page.waitForEvent("download");
  await preview
    .getByRole("button", { name: "Save as PDF", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs(`${uit}/comments-at-end.pdf`);
  assert.ok((await readFile(`${uit}/comments-at-end.pdf`)).length > 1000);
  step(
    "Print-at-end includes cell references, authors, replies and hidden classic notes in PDF text",
  );
  await preview
    .getByLabel("Cell comments and notes", { exact: true })
    .selectOption("asDisplayed");
  const displayed = await waitText(
    (p) =>
      p.texts.length === 1 && p.texts.join().includes("Visible classic note"),
  );
  assert.ok(!displayed.texts.join().includes("Hidden classic note"));
  assert.ok(!displayed.texts.join().includes("A question for the project"));
  const displayedDownload = page.waitForEvent("download");
  await preview
    .getByRole("button", { name: "Save as PDF", exact: true })
    .click();
  await (await displayedDownload).saveAs(`${uit}/comments-displayed.pdf`);
  await page.screenshot({ path: `${uit}/comments-print.png`, fullPage: true });
  report.print = { atEnd, displayed };
  step("As-displayed prints visible classic notes and excludes hidden notes");
  assert.deepEqual(report.errors, []);
} catch (f) {
  report.failure = String(f);
  await page.screenshot({ path: `${uit}/failure.png`, fullPage: true });
  await writeFile(`${uit}/failure.txt`, await page.locator("body").innerText());
  throw f;
} finally {
  await writeFile(`${uit}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
  await ssr.close();
}
