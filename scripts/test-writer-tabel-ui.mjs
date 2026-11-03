/** Echte Writer-bediening voor #136/#131 en #140, met bewaarde DOCX-controle. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { chromium } from "playwright";
import { preview } from "vite";

const uitvoer = resolve(
  process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-tabel-ui",
);
await mkdir(uitvoer, { recursive: true });
const pakket = unzipSync(await readFile("public/templates/nieuw.docx"));
const p = (tekst) => `<w:p><w:r><w:t>${tekst}</w:t></w:r></w:p>`;
const tabel = `<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>${[
  ["a", "b"],
  ["c", "d"],
]
  .map(
    (rij) =>
      `<w:tr>${rij.map((tekst) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${p(tekst)}</w:tc>`).join("")}</w:tr>`,
  )
  .join("")}</w:tbl>`;
const oud = strFromU8(pakket["word/document.xml"]);
const nieuw = oud.replace(
  /<w:body>[\s\S]*?(<w:sectPr[\s\S]*?<\/w:sectPr>)\s*<\/w:body>/,
  `<w:body>${tabel}${p("")}$1</w:body>`,
);
assert.notEqual(nieuw, oud);
pakket["word/document.xml"] = strToU8(nieuw);
const bron = {
  name: "Tabelproef.docx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: Buffer.from(zipSync(pakket)),
};
const server = await preview({
  configFile: false,
  build: { outDir: process.env.OFFICE_TEST_DIST ?? "dist" },
  preview: { host: "127.0.0.1", port: 0, open: false },
});
const adres = server.httpServer.address();
const browser = await chromium.launch();
const verslag = { stappen: [], fouten: [] };
const labels = [
  "Insert Row Above",
  "Insert Row Below",
  "Insert Column Left",
  "Insert Column Right",
  "Delete Row",
  "Delete Column",
];
let huidigePagina;
try {
  for (const thema of ["forge", "light"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      locale: "en-US",
    });
    huidigePagina = page;
    console.log(`Writer-tabel: ${thema} openen`);
    page.on("pageerror", (e) => verslag.fouten.push(String(e)));
    page.on("console", (bericht) => {
      if (bericht.type() === "error") verslag.fouten.push(bericht.text());
    });
    await page.addInitScript(
      ({ thema }) =>
        localStorage.setItem(
          "openaec-office-instellingen",
          JSON.stringify({
            taal: "en",
            thema,
            spelling: { controleren: false },
          }),
        ),
      { thema },
    );
    await page.goto(`http://127.0.0.1:${adres.port}/?offscreenReplay=0`);
    await page.locator(".office input[type=file]").first().setInputFiles(bron);
    await page.evaluate(() => {
      window.proefApi = () => {
        const el = document.querySelector(
          ".office-tabpaneel:not([hidden]) .office-tekst",
        );
        if (!el) return null;
        for (
          let f =
            el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];
          f;
          f = f.return
        ) {
          for (let s = f.memoizedState, i = 0; s && i < 200; i++, s = s.next) {
            const v = s.memoizedState?.current;
            if (v?.getEditorRef && v.commands) return v;
          }
        }
        return null;
      };
    });
    await page.waitForFunction(
      () => proefApi()?.getEditorRef()?.getLayout()?.pages.length,
      null,
      { timeout: 60_000 },
    );
    console.log(`Writer-tabel: ${thema} geladen`);
    async function kiesCel(rij = 0, kolom = 0) {
      await page.evaluate(
        async ({ rij, kolom }) => {
          const api = proefApi();
          await api.flushPendingInput();
          const ref = api.getEditorRef(),
            s = ref.getYrsSession();
          const tabel = s
            .storySegments("body")
            .find(
              (deel) => deel.kind === "embed" && deel.embedKind === "table",
            );
          const story = tabel.payload.rows[rij].cells[kolom].story,
            paraId = s.paragraphs(story)[0].paraId;
          s.setSelection({ story, paraId, offset: 0 });
          s.setCellSelection({
            anchor: { story: "body", tableIndex: 0, row: rij, column: kolom },
            head: { story: "body", tableIndex: 0, row: rij, column: kolom },
          });
          ref.syncYrsInputState(true, [story]);
          ref.relayout();
        },
        { rij, kolom },
      );
      await page
        .getByRole("tab", { name: "Table Design", exact: true })
        .click();
    }
    await kiesCel();
    async function knop(label) {
      console.log(`Writer-tabel: ${thema} knop ${label}`);
      let button = page.getByRole("button", { name: label, exact: true });
      if (!(await button.isVisible())) {
        const groep = label.startsWith("Delete")
          ? "Delete"
          : label.includes("Row")
            ? "Rows"
            : "Columns";
        await page.getByRole("button", { name: groep, exact: true }).click();
        button = page.getByRole("button", { name: label, exact: true });
      }
      await button.waitFor({ state: "visible" });
      assert.equal(await button.locator("span").isVisible(), true, label);
      assert.equal(await button.locator("span").innerText(), label);
      assert((await button.getAttribute("title")).includes(label));
      return button;
    }
    for (const breedte of [1440, 640]) {
      await page.setViewportSize({ width: breedte, height: 1000 });
      await page.waitForTimeout(500);
      for (const label of labels) {
        await knop(label);
        // Sluit een eventueel uitgeklapte lintgroep voordat de volgende opent.
        await page.keyboard.press("Escape");
      }
      await page.screenshot({
        path: join(uitvoer, `${thema}-${breedte}-lint.png`),
      });
      verslag.stappen.push({
        thema,
        breedte,
        labels: "zichtbaar, inclusief ingeklapte groepen",
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    async function afmetingen() {
      const bytes = Buffer.from(
        await page.evaluate(async () =>
          Array.from(new Uint8Array(await proefApi().save())),
        ),
      );
      const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
      const rijen = [
        ...xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g),
      ].map((m) => (m[0].match(/<w:tc(?:\s[^>]*)?>/g) ?? []).length);
      return rijen;
    }
    for (const [label, verwacht, rij = 0, kolom = 0] of [
      ["Insert Row Above", [2, 2, 2]],
      ["Delete Row", [2, 2]],
      ["Insert Row Below", [2, 2, 2]],
      ["Delete Row", [2, 2], 1],
      ["Insert Column Left", [3, 3]],
      ["Delete Column", [2, 2]],
      ["Insert Column Right", [3, 3]],
      ["Delete Column", [2, 2], 0, 1],
    ]) {
      await kiesCel(rij, kolom);
      await (await knop(label)).click();
      await page.waitForTimeout(150);
      assert.deepEqual(await afmetingen(), verwacht, label);
      verslag.stappen.push({ thema, actie: label, bewaardeRijen: verwacht });
    }
    await kiesCel();
    const omzetten = page.getByRole("button", {
      name: "Convert to Text",
      exact: true,
    });
    await omzetten.scrollIntoViewIfNeeded();
    await omzetten.click();
    const veld = page.locator(".tw-venster input[type=text]");
    await veld.fill("|");
    async function contrast(focus) {
      if (focus) await veld.focus();
      else await page.getByRole("dialog").locator("h2").click();
      const stijl = await veld.evaluate((el) => {
        const s = getComputedStyle(el);
        const luminantie = (kleur) => {
          const kanalen = kleur
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((n) => {
              const v = n / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return (
            kanalen[0] * 0.2126 + kanalen[1] * 0.7152 + kanalen[2] * 0.0722
          );
        };
        const a = luminantie(s.color),
          b = luminantie(s.backgroundColor);
        return {
          tekst: s.color,
          achtergrond: s.backgroundColor,
          cursor: s.caretColor,
          contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          breedte: el.clientWidth,
          hoogte: el.clientHeight,
          waarde: el.value,
        };
      });
      assert.equal(stijl.waarde, "|");
      assert(stijl.contrast >= 4.5, JSON.stringify(stijl));
      assert.equal(stijl.cursor, stijl.tekst);
      assert(stijl.breedte >= 35 && stijl.hoogte >= 28);
      verslag.stappen.push({ thema, focus, ...stijl });
    }
    await contrast(true);
    await contrast(false);
    await page.screenshot({ path: join(uitvoer, `${thema}-scheiding.png`) });
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    await page.waitForTimeout(250);
    const bytes = Buffer.from(
      await page.evaluate(async () =>
        Array.from(new Uint8Array(await proefApi().save())),
      ),
    );
    const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
    assert(!/<w:tbl[\s>]/.test(xml));
    for (const regel of ["a|b", "c|d"]) assert(xml.includes(regel), regel);
    await writeFile(join(uitvoer, `${thema}-omgezet.docx`), bytes);
    verslag.stappen.push({ thema, omgezet: ["a|b", "c|d"] });
    await page.close();
  }
  assert.deepEqual(verslag.fouten, []);
  console.log(JSON.stringify(verslag, null, 2));
} catch (fout) {
  verslag.fout = String(fout);
  await huidigePagina
    ?.screenshot({ path: join(uitvoer, "afgekeurd.png") })
    .catch(() => {});
  throw fout;
} finally {
  await writeFile(
    join(uitvoer, "rapport.json"),
    JSON.stringify(verslag, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((ok, fout) =>
    server.httpServer.close((e) => (e ? fout(e) : ok())),
  );
}
