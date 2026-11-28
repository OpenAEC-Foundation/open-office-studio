import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createYrsPositionProjection, createYrsSession } from "@betteroffice/docx/yrs";
import * as origineel from "@betteroffice/docx/layout/render";
import { herstelTabelPaginaVakken, tekstengineCompatibiliteit } from "../../../scripts/tekstengine-compatibiliteit";
import type { TabelPayload } from "../tabel/logica";

const sdk = resolve("node_modules/@betteroffice/docx/dist");
const bestand = "chunk-EOFVNRML.mjs";
const bron = readFileSync(join(sdk, bestand), "utf8");

describe("celvakken per tabelpagina", () => {
  it("weigert onbekende of dubbele engineankers en sluit de juiste module aan", () => {
    expect(() => herstelTabelPaginaVakken("andere engine")).toThrow("tabelpaginavakken");
    expect(() => herstelTabelPaginaVakken(bron + bron)).toThrow("tabelpaginavakken");
    expect(() => herstelTabelPaginaVakken(herstelTabelPaginaVakken(bron))).toThrow("tabelpaginavakken");
    const plugin = tekstengineCompatibiliteit();
    const transform = plugin.transform as (bron: string, id: string) => { code: string } | undefined;
    expect(transform(bron, join(sdk, bestand) + "?v=1")?.code).toBe(herstelTabelPaginaVakken(bron));
    expect(transform(bron, "/andere/module.mjs")).toBeUndefined();
  });

  it("behoudt vervolgankers en geometrie met minder unieke bronlezingen", async () => {
    const map = mkdtempSync(join(tmpdir(), "oos-tabelpaginavakken-"));
    const sessie = await createYrsSession({ clientId: 8127 });
    try {
      cpSync(sdk, map, { recursive: true });
      writeFileSync(join(map, bestand), herstelTabelPaginaVakken(bron));
      const url = pathToFileURL(join(map, "layout/render/index.mjs")).href;
      const kandidaat = await import(/* @vite-ignore */ url) as typeof origineel;
      sessie.openDocx(readFileSync("docs/tests/writer-rust-plakbatch/bron-128-tabellen.docx"), true);
      const font = sessie.registerFont(readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"));
      const verzoek = { bodyStory: "body", renderEnv: {}, options: { pageGap: 24 }, regions: { sections: [{ pageSize: { w: 800, h: 1100 }, margins: { top: 90, right: 90, bottom: 90, left: 90 } }] } };
      const fonts = JSON.parse(sessie.layoutFontRequirementsJson(JSON.stringify(verzoek))) as { key: string }[];
      const invoer = { ...verzoek, measurement: { fontChains: Object.fromEntries(fonts.map((r) => [r.key, [font]])), defaults: { fontSize: 11, fontFamily: "Caladea" }, authoritativeShaping: true } };
      const indeling = sessie.layoutDocumentWithRegionsJson(JSON.stringify(invoer));
      const lijst = JSON.parse(sessie.buildDisplayListJson(indeling)) as origineel.DisplayList;
      expect(lijst.pages.length).toBe(65);
      const projectie = createYrsPositionProjection(sessie, "body")!;
      const voor = sessie.encodeState(), vector = sessie.encodeStateVector();
      const lees = (api: typeof origineel, pagina: number, filter: boolean) => {
        const cache = new Map<number, string | null>();
        let lezingen = 0;
        const sleutel = (pos: number | undefined) => {
          if (pos === undefined) return null;
          if (cache.has(pos)) return cache.get(pos)!;
          lezingen++;
          const m = /^(.*):t(\d+):r\d+c\d+/.exec(projectie.targetAt(pos)?.story ?? "");
          const uit = m ? `${m[1]}|${m[2]}` : null;
          cache.set(pos, uit);
          return uit;
        };
        const fragmenten = api.deriveDisplayListTableFragmentsOnPages(lijst, sleutel, pagina, pagina);
        const vakken = fragmenten.map((f) => {
          const m = /^(.*)\|(\d+)$/.exec(f.tableKey)!;
          const tabel = sessie.tablePayload(m[1], Number(m[2])) as unknown as TabelPayload;
          const cellen = tabel.rows.flatMap((rij, row) => {
            let col = Number(rij.trPr?.gridBefore ?? 0);
            return rij.cells.map((cel) => {
              const colSpan = Math.max(1, Number(cel.tcPr?.colspan ?? 1));
              const uit = { tableKey: f.tableKey, row, col, colSpan, rowSpan: Math.max(1, Number(cel.tcPr?.rowspan ?? 1)) };
              col += colSpan;
              return uit;
            });
          });
          const regio = { kind: "body" as const, ...(filter ? { pageIndex: pagina } : {}) };
          return api.deriveDisplayListSelectedCellRects(lijst, cellen, sleutel, regio).filter((v) => v.pageIndex === pagina);
        });
        return { fragmenten, vakken, lezingen };
      };
      for (const pagina of [0, 32, 64]) {
        const basis = lees(origineel, pagina, false);
        const standaard = lees(kandidaat, pagina, false);
        expect(standaard).toEqual(basis);
        const nieuw = lees(kandidaat, pagina, true);
        expect(nieuw.fragmenten.length).toBeGreaterThan(0);
        expect(nieuw.fragmenten).toEqual(basis.fragmenten);
        expect(nieuw.vakken).toEqual(basis.vakken);
        expect(nieuw.lezingen).toBeLessThan(basis.lezingen);
      }
      expect(sessie.encodeState()).toEqual(voor);
      expect(sessie.encodeStateVector()).toEqual(vector);
    } finally {
      sessie.destroy();
      rmSync(map, { recursive: true, force: true });
    }
  }, 60_000);
});
