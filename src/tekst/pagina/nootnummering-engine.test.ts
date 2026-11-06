import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { voegNootIn, zetNootInstellingen, type NootSoort, type NootNotatie } from "./noten";

interface TekstPrimitief {
  text?: string; noteRef?: { id: number; kind: string };
  docStart?: number; docEnd?: number; x: number; width: number; baselineY: number;
}
interface Weergave {
  pages: { primitives: TekstPrimitief[];
    noteAreas?: { kind: string; notes?: { id: number; label: string }[] }[] }[];
}
interface LosseLayout {
  preloadLayoutWasm(): Promise<void>;
  buildDisplayListJson(input: string): string;
  hitTestRegionsJson(input: string, page: number, x: number, y: number): string;
}
let losseLayout: LosseLayout;
beforeAll(async () => {
  const pad = pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/wasm-layout.mjs")).href;
  losseLayout = await import(/* @vite-ignore */ pad);
  await losseLayout.preloadLayoutWasm();
});

function proef(soort: NootSoort, notatie: NootNotatie, beginBij: number) {
  const pakket = new Pakket(readFileSync("public/templates/nieuw.docx"));
  pakket.schrijf("word/document.xml", pakket.lees("word/document.xml").replace(
    /<w:body>[\s\S]*?<\/w:body>/,
    '<w:body><w:p><w:r><w:t>Proef __NOOT__ na de verwijzing.</w:t></w:r></w:p><w:sectPr/></w:body>',
  ));
  const ingevoegd = voegNootIn(pakket.inpakken(), "__NOOT__", soort, "Toelichting bij de proef.");
  return zetNootInstellingen(ingevoegd.bytes, soort, {
    notatie, beginBij, herstart: "continuous",
    positie: soort === "voetnoot" ? "pageBottom" : "docEnd",
  });
}

describe("gelijke nummers en symbolen in noot en hoofdtekst (#51, #144)", () => {
  const notaties = [["decimal", "3"], ["lowerRoman", "iii"], ["upperRoman", "III"],
    ["lowerLetter", "c"], ["upperLetter", "C"]] as const;
  // De interoperabele symboolreeks gebruikt vier tekens en herhaalt ieder
  // teken na een volledige ronde: NumberingType::SYMBOL_CHICAGO.
  // https://api.libreoffice.org/docs/idl/ref/NumberingType_8idl_source.html
  const symbolen = ["*", "†", "‡", "§", "**", "††", "‡‡", "§§", "***"]
    .map((verwacht, i) => ({ notatie: "chicago" as const, verwacht, beginBij: i + 1 }));
  symbolen.push({ notatie: "chicago", verwacht: "§".repeat(64), beginBij: 256 });
  const formaten = [...notaties.map(([notatie, verwacht]) => ({ notatie, verwacht, beginBij: 3 })), ...symbolen];
  const gevallen = (["voetnoot", "eindnoot"] as const).flatMap(soort =>
    formaten.map(formaat => ({ soort, ...formaat })));
  it.each(gevallen)("bewaart $soort met $notatie vanaf $beginBij, ook na heropenen", async ({ soort, notatie, verwacht, beginBij }) => {
    let bytes = proef(soort, notatie, beginBij);
    const kind = soort === "voetnoot" ? "footnote" : "endnote";
    for (let ronde = 0; ronde < 2; ronde++) {
      const s = await createYrsSession();
      try {
        s.openDocx(bytes, true);
        const font = s.registerFont(readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"));
        const verzoek = {
          bodyStory: "body", renderEnv: {}, options: { pageGap: 24 },
          regions: { sections: [{ sectionId: "main", properties: {} }],
            noteSettings: { [kind]: { numFmt: notatie, numStart: beginBij, numRestart: "continuous" } } },
          notes: { contents: [{ id: 1, noteKind: kind, height: 0 }] },
        };
        const fonts = JSON.parse(s.layoutFontRequirementsJson(JSON.stringify(verzoek))) as { key: string }[];
        const json = s.layoutDocumentWithRegionsJson(JSON.stringify({ ...verzoek,
          measurement: { fontChains: Object.fromEntries(fonts.map(f => [f.key, [font]])),
            defaults: { fontSize: 11, fontFamily: "Caladea" }, authoritativeShaping: true },
        }));
        const lijst = JSON.parse(s.buildDisplayListJson(json)) as Weergave;
        // De losse teken-/trefferroute moet dezelfde atoomgrenzen begrijpen.
        const zelfstandig = JSON.parse(losseLayout.buildDisplayListJson(json)) as Weergave;
        expect(zelfstandig.pages.flatMap(p => p.primitives.filter(r => r.noteRef?.kind === kind)).map(r => r.text).join("")).toBe(verwacht);
        const verwijzingen = lijst.pages.flatMap((p) => p.primitives.filter((r) => r.noteRef?.kind === kind));
        const noten = lijst.pages.flatMap((p) => (p.noteAreas ?? []).flatMap((a) => a.kind === kind ? a.notes ?? [] : []));
        expect(noten.map((n) => n.label)).toEqual([verwacht]);
        expect(verwijzingen).toHaveLength(1);
        expect(verwijzingen.map((r) => r.text).join("")).toBe(verwacht);
        expect(new Set(verwijzingen.map(r => r.noteRef?.id))).toEqual(new Set([1]));
        const begin = Math.min(...verwijzingen.map(r => r.docStart!));
        const eind = Math.max(...verwijzingen.map(r => r.docEnd!));
        expect(eind - begin).toBe(1);
        const label = verwijzingen[0];
        const pagina = lijst.pages.findIndex(p => p.primitives.includes(label));
        for (const [aandeel, positie] of [[0.25, begin], [0.75, eind]]) {
          const raak = JSON.parse(s.displayHitTestRegionsJson(pagina, label.x + label.width * aandeel, label.baselineY - 2));
          expect(raak.pos).toBe(positie);
          const terugval = JSON.parse(losseLayout.hitTestRegionsJson(JSON.stringify(lijst), pagina, label.x + label.width * aandeel, label.baselineY - 2));
          expect(terugval.pos).toBe(positie);
        }
        const selectie = JSON.parse(s.displayRangeRectsJson(begin, eind)) as { width: number }[];
        expect(selectie).toHaveLength(1);
        expect(selectie[0].width).toBeCloseTo(label.width, 4);
        bytes = (await saveYrsDocx(s)).bytes;
        const xml = new Pakket(bytes).lees("word/document.xml");
        expect(xml).toContain(`<w:numFmt w:val="${notatie}"`);
        expect(xml).toContain(`<w:numStart w:val="${beginBij}"`);
        expect(xml).toContain(`<w:${kind}Reference w:id="1"`);
      } finally { s.destroy(); }
    }
  });
});
