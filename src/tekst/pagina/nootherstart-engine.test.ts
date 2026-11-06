import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { converteerNoten, leesNoten, leesNootInstellingen, voegNootIn, zetNootInstellingen, type NootHerstart, type NootSoort } from "./noten";

const pagina = { pageWidth: 11906, pageHeight: 16838, marginTop: 1440, marginRight: 1440, marginBottom: 1440, marginLeft: 1440 };
const sectie = '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>';

function maakProef(soort: NootSoort, herstart: NootHerstart) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  const nieuweSectie = herstart === "eachSect";
  const tekst = (n: number) => `<w:r><w:t>Eigen proeftekst ${n}: __NOOT_${n}__ na de verwijzing.</w:t></w:r>`;
  const body = `<w:p>${tekst(1)}</w:p><w:p>${nieuweSectie ? `<w:pPr>${sectie}</w:pPr>` : ""}${tekst(2)}</w:p><w:p>${nieuweSectie ? "" : '<w:pPr><w:pageBreakBefore/></w:pPr>'}${tekst(3)}</w:p>${sectie}`;
  p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${body}</w:body>`));
  let bytes = p.inpakken();
  for (let n = 1; n <= 3; n++) bytes = voegNootIn(bytes, `__NOOT_${n}__`, soort, `Toelichting ${n}.`).bytes;
  return zetNootInstellingen(bytes, soort, { notatie: "lowerRoman", beginBij: 3, herstart, positie: soort === "voetnoot" ? "pageBottom" : "sectEnd" });
}

describe("nootnummering over pagina- en sectiegrenzen (#51)", () => {
  it.each([false, true])("tekent omgezette noten en bewaart hun tekst, terugzetten: %s", async terug => {
    let bytes = converteerNoten(maakProef("voetnoot", "continuous"), "voetnoot").bytes;
    if (terug) bytes = converteerNoten(bytes, "eindnoot").bytes;
    const soort = terug ? "voetnoot" : "eindnoot";
    const kind = terug ? "footnote" : "endnote";
    const verwacht = terug ? ["iii", "iv", "v"] : ["i", "ii", "iii"];
    for (let ronde = 0; ronde < 2; ronde++) {
      const s = await createYrsSession();
      try {
        s.openDocx(bytes, true);
        const noten = leesNoten(bytes), w = leesNootInstellingen(bytes, soort);
        const font = s.registerFont(readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"));
        const verzoek = {
          bodyStory: "body", renderEnv: {}, options: { pageGap: 24 },
          regions: { sections: [{ sectionId: "sectie-0", properties: pagina }],
            noteSettings: { [kind]: { numFmt: w.notatie, numStart: w.beginBij, numRestart: w.herstart, position: w.positie } } },
          notes: { contents: noten.map(n => ({ id: Number(n.id), noteKind: kind, height: 0 })) },
        };
        const fonts = JSON.parse(s.layoutFontRequirementsJson(JSON.stringify(verzoek))) as { key: string }[];
        const json = s.layoutDocumentWithRegionsJson(JSON.stringify({ ...verzoek,
          measurement: { fontChains: Object.fromEntries(fonts.map(f => [f.key, [font]])), defaults: { fontSize: 11, fontFamily: "Caladea" }, authoritativeShaping: true },
        }));
        const lijst = JSON.parse(s.buildDisplayListJson(json)) as { pages: { primitives: { text: string; noteRef?: { kind: string } }[]; noteAreas?: { kind: string; notes?: { label: string }[] }[] }[] };
        expect(lijst.pages.flatMap(p => p.primitives.filter(r => r.noteRef?.kind === kind).map(r => r.text))).toEqual(verwacht);
        expect(lijst.pages.flatMap(p => (p.noteAreas ?? []).filter(a => a.kind === kind).flatMap(a => (a.notes ?? []).map(n => n.label)))).toEqual(verwacht);
        bytes = (await saveYrsDocx(s)).bytes;
        expect(leesNoten(bytes).map(n => [n.soort, n.tekst])).toEqual([1, 2, 3].map(n => [soort, `Toelichting ${n}.`]));
      } finally { s.destroy(); }
    }
  });

  it.each([
    ["voetnoot", "continuous", ["iii", "iv", "v"]],
    ["voetnoot", "eachPage", ["iii", "iv", "iii"]],
    ["voetnoot", "eachSect", ["iii", "iv", "iii"]],
    ["eindnoot", "continuous", ["iii", "iv", "v"]],
    ["eindnoot", "eachSect", ["iii", "iv", "iii"]],
  ] as const)("bewaart %s met %s, met gelijke verwijzingslabels", async (soort, herstart, verwacht) => {
    let bytes = maakProef(soort, herstart);
    const kind = soort === "voetnoot" ? "footnote" : "endnote";
    const eigenschappen = { numFmt: "lowerRoman", numStart: 3, numRestart: herstart, position: soort === "voetnoot" ? "pageBottom" : "sectEnd" };
    for (let ronde = 0; ronde < 2; ronde++) {
      const s = await createYrsSession();
      try {
        s.openDocx(bytes, true);
        const font = s.registerFont(readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"));
        const verzoek = {
          bodyStory: "body", renderEnv: {}, options: { pageGap: 24 },
          regions: {
            sections: Array.from({ length: herstart === "eachSect" ? 2 : 1 }, (_, i) => ({ sectionId: `sectie-${i}`, properties: pagina })),
            noteSettings: { [kind]: eigenschappen },
          },
          notes: { contents: [1, 2, 3].map(id => ({ id, noteKind: kind, height: 0 })) },
        };
        const fonts = JSON.parse(s.layoutFontRequirementsJson(JSON.stringify(verzoek))) as { key: string }[];
        const json = s.layoutDocumentWithRegionsJson(JSON.stringify({ ...verzoek,
          measurement: { fontChains: Object.fromEntries(fonts.map(f => [f.key, [font]])), defaults: { fontSize: 11, fontFamily: "Caladea" }, authoritativeShaping: true },
        }));
        const lijst = JSON.parse(s.buildDisplayListJson(json)) as {
          pages: { primitives: { text: string; noteRef?: { id: number; kind: string } }[]; noteAreas?: { kind: string; notes?: { id: number; label: string }[] }[] }[];
        };
        expect(lijst.pages.length).toBeGreaterThanOrEqual(2);
        const verwijzingen = lijst.pages.flatMap(p => p.primitives.filter(r => r.noteRef?.kind === kind));
        expect(verwijzingen.map(r => r.text)).toEqual(verwacht);
        const noten = lijst.pages.flatMap(p => (p.noteAreas ?? []).filter(a => a.kind === kind).flatMap(a => a.notes ?? []));
        expect(noten.map(n => n.label)).toEqual(verwacht);
        const perPagina = lijst.pages.map(p => (p.noteAreas ?? []).filter(a => a.kind === kind).flatMap(a => (a.notes ?? []).map(n => n.id)));
        if (soort === "voetnoot" || herstart === "eachSect") {
          expect(perPagina[0]).toEqual([1, 2]);
          expect(perPagina.at(-1)).toEqual([3]);
        } else {
          expect(perPagina[0]).toEqual([]);
          expect(perPagina.at(-1)).toEqual([1, 2, 3]);
        }
        expect(verwijzingen.map(r => r.noteRef?.id)).toEqual([1, 2, 3]);
        bytes = (await saveYrsDocx(s)).bytes;
        const xml = new Pakket(bytes).lees("word/document.xml");
        expect(xml).toContain(`<w:numRestart w:val="${herstart}"`);
      } finally { s.destroy(); }
    }
  });
});
