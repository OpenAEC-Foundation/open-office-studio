import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createYrsPositionProjection, createYrsSession } from "@betteroffice/docx/yrs";
import type { CanvasPointHit, DisplayListQueries } from "@betteroffice/docx/layout/render";
import { herstelTabelKlik } from "../../../scripts/tekstengine-compatibiliteit";
import { herstelTabelPunt } from "./klik";
import { rijMet, type TabelPayload } from "./logica";
import { tabelBeelden, type IndelingPagina } from "../liniaal/geometrie";

const queryPad = pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/chunk-EOFVNRML.mjs")).href;

describe("klikken in lege tabelruimte (#138)", () => {
  it("bewaakt de aansluiting op de bestaande muisroute", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
    const aangepast = herstelTabelKlik(bron);
    expect(aangepast).toContain("oosTabelPunt(P,resolveCanvasPoint");
    expect(aangepast).toContain("Kn.endParagraphIndex,re.cellSelection()]");
    expect(aangepast).toContain("Wn?.head??T.head,re?.cellSelection()??null]");
    expect(() => herstelTabelKlik("andere engine")).toThrow("tabelklikken");
    expect(() => herstelTabelKlik(bron + bron)).toThrow("tabelklikken");
  });
  it.each(["gewoon", "kolominvoeging", "samengevoegd", "marges", "gedraaid", "gemengd"])("vindt de juiste celruimte: %s", async (variant) => {
    const s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      const paraId = s.paragraphs("body")[0].paraId;
      const ingevoegd = s.insertTable({ story: "body", paraId, offset: 0 }, 2, 2);
      const payload = s.tablePayload("body", 0) as unknown as TabelPayload;
      // 4 cm = 4 × 1440 / 2,54 = 2267,7165... twips, afgerond 2268.
      s.applyRawOps("body", [{ op: "setEmbedAttr", index: 0, key: "rows", value: payload.rows.map((r) => ({ ...r, trPr: rijMet(r.trPr, { hoogte: 2268, regel: "atLeast" }) })) }]);
      const bereik = { anchor: { ...ingevoegd.table, row: 0, column: 0 }, head: { ...ingevoegd.table, row: 1, column: 1 } };
      const metKolom = variant === "kolominvoeging" || variant === "gemengd";
      if (metKolom) s.insertColumn(bereik.anchor, "right");
      if (variant === "samengevoegd") s.mergeCells({ anchor: bereik.anchor, head: { ...ingevoegd.table, row: 0, column: 1 } });
      if (variant === "marges") s.setCellTextFormat(bereik, { margins: { top: 284, bottom: 284, left: 284, right: 284 } });
      if (variant === "gedraaid") s.setCellTextFormat(bereik, { textDirection: "tbRl" });
      if (variant === "gemengd") {
        ["Linksboven", "Rechtsboven", "Linksonder", "Rechtsonder einde zoom"].forEach((tekst, i) => {
          const story = ingevoegd.createdStoryIds[i];
          s.insertText({ story, paraId: s.paragraphs(story)[0].paraId, offset: 0 }, tekst);
        });
        const tabel = s.tablePayload("body", 0) as unknown as TabelPayload;
        const midden = tabel.rows[1].cells[1].story;
        s.insertText({ story: midden, paraId: s.paragraphs(midden)[0].paraId, offset: 0 }, "Middenonder marge");
        s.setCellTextFormat({ ...bereik, head: { ...bereik.head, column: 2 } }, { margins: { top: 284, bottom: 0, left: 284, right: 108 } });
        const cel = { ...ingevoegd.table, row: 1, column: 1 };
        s.setCellTextFormat({ anchor: cel, head: cel }, { textDirection: "tbRl" });
      }
      const projectie = createYrsPositionProjection(s, "body")!;
      expect(projectie.allTables()[0].cells).toHaveLength(metKolom ? 6 : variant === "samengevoegd" ? 3 : 4);
      if (metKolom) {
        const story = ingevoegd.createdStoryIds[1], p = s.paragraphs(story)[0];
        const pos = projectie.positionForLoc({ story, paraId: p.paraId, offset: 0 })!;
        expect(projectie.targetAt(pos).cell?.column).toBe(2);
      }
      const font = s.registerFont(readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"));
      const verzoek = {
        bodyStory: "body", renderEnv: {}, options: { pageGap: 24 },
        regions: { sections: [{ pageSize: { w: 800, h: 1100 }, margins: { top: 90, right: 90, bottom: 90, left: 90 } }] },
      };
      const vereisten = JSON.parse(s.layoutFontRequirementsJson(JSON.stringify(verzoek))) as { key: string }[];
      const metMeting = { ...verzoek, measurement: { fontChains: Object.fromEntries(vereisten.map((r) => [r.key, [font]])), defaults: { fontSize: 11, fontFamily: "Caladea" }, authoritativeShaping: true } };
      const indeling = s.layoutDocumentWithRegionsJson(JSON.stringify(metMeting));
      const lijst = JSON.parse(s.buildDisplayListJson(indeling));
      expect(lijst.pages.length).toBeGreaterThan(0);
      expect(lijst.pages[0].primitives.some((p: { cell?: unknown }) => p.cell)).toBe(true);
      const legeRegels = lijst.pages[0].primitives.filter((p: { kind: string; docStart?: number; cell?: unknown }) => (p.kind === "text" || p.kind === "glyphRun") && p.docStart !== undefined && p.cell);
      expect(legeRegels.length).toBeGreaterThanOrEqual(3);
      // Dezelfde vastgezette queryfabriek als de editor, met de echte
      // resident opgeslagen displaylijst en de native trefferbepaling.
      const { J: maakQueries } = await import(/* @vite-ignore */ queryPad);
      const queries = maakQueries(lijst, s) as DisplayListQueries;
      const weergave = { displayPositionToYrsLoc: (pos: number) => ({ story: projectie.targetAt(pos).story, paraId: "", offset: 0 }) } as unknown as Parameters<typeof tabelBeelden>[0];
      const geometrie = { dom: { queries } } as unknown as Parameters<typeof tabelBeelden>[2];
      const beelden = tabelBeelden(weergave, s, geometrie, JSON.parse(indeling).layout.pages as IndelingPagina[], 0, 0, s.version());
      expect(beelden).toHaveLength(1);
      const uiterste = Math.max(...legeRegels.map((p: { clipGroup: { clip: { x: number; w: number } } }) => p.clipGroup.clip.x + p.clipGroup.clip.w));
      expect(beelden[0].lijnen.at(-1)).toBeCloseTo(uiterste, 0);
      let gecorrigeerd = 0;
      for (const p of legeRegels) {
        const c = p.clipGroup.clip;
        const punt: CanvasPointHit = { pageIndex: 0, x: c.x + c.w - 12, y: c.y + c.h - 12, hit: queries.hitTestRegions(0, c.x + c.w - 12, c.y + c.h - 12) };
        const hersteld = herstelTabelPunt(queries, punt, projectie)!;
        if (hersteld !== punt) gecorrigeerd++;
        expect(hersteld.hit?.pos).not.toBeNull();
        expect(projectie.targetAt(hersteld.hit!.pos!).story).toBe(projectie.targetAt(p.docStart).story);
      }
      expect(gecorrigeerd).toBeGreaterThan(0);
      const buiten: CanvasPointHit = { pageIndex: 0, x: 750, y: 900, hit: queries.hitTestRegions(0, 750, 900) };
      expect(herstelTabelPunt(queries, buiten, projectie)).toBe(buiten);
      const noot: CanvasPointHit = { ...buiten, x: 100, y: 100, hit: { region: "footnote", noteId: 1, pos: 1 } };
      expect(herstelTabelPunt(queries, noot, projectie)).toBe(noot);
    } finally { s.destroy(); }
  });
});
