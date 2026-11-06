import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTekstkernProef } from "../../../scripts/tekstkern-proef";
import { Pakket } from "../../grafieken/pakket";
import { attr, kind, kinderen, leesXml, zoekAlle } from "../../grafieken/xml";

const BRON = readFileSync("docs/tests/celsplitsing-bron-2026-11-06.docx");
let proef: Awaited<ReturnType<typeof openTekstkernProef>>;
beforeAll(async () => { proef = await openTekstkernProef(); });
afterAll(() => { proef?.sluit(); });
const routes = [{ openen: "native", opslaan: "sessie" }, { openen: "native", opslaan: "editor" },
  { openen: "document", opslaan: "editor" }] as const;
const gevallen = routes.flatMap(route => [false, true].map(splitsen => ({ ...route, splitsen })));
const voorkeuren = [{ waarde: 50, soort: "pct" }, { waarde: 2500, soort: "pct" },
  { waarde: 4000, soort: "dxa" }] as const;
const expliciet = routes.flatMap(route => voorkeuren.flatMap(voorkeur =>
  (["bron", "bewerking"] as const).map(herkomst => ({ ...route, ...voorkeur, herkomst }))));

function metVoorkeur(waarde: number, soort: string) {
  const pakket = new Pakket(BRON), xml = pakket.lees("word/document.xml");
  const tabel = zoekAlle(leesXml(xml), "tbl")[0];
  const cel = kinderen(kinderen(tabel, "tr")[1], "tc")[0];
  const eigenschappen = kind(cel, "tcPr");
  if (!eigenschappen) throw new Error("De proeftabel mist celgegevens.");
  pakket.schrijf("word/document.xml", xml.slice(0, eigenschappen.inhoudStart)
    + `<w:tcW w:w="${waarde}" w:type="${soort}"/>` + xml.slice(eigenschappen.inhoudStart));
  return pakket.inpakken();
}

describe("voorkeursbreedtes behouden in de echte opslagroutes (#48)", () => {
  it.each(gevallen)("$openen → $opslaan, splitsen: $splitsen", async ({ openen, opslaan, splitsen }) => {
    const { createYrsSession, documentToYrs, saveEditorDocument, saveYrsDocx, yrsToDocument } = proef.sdk;
    const s = await createYrsSession();
    try {
      const document = await proef.docx.parseDocx(BRON, { preloadFonts: false });
      if (openen === "native") s.openDocx(BRON, true);
      else documentToYrs(s, document);
      if (splitsen) s.splitCell({ story: "body", tableIndex: 0, row: 0, column: 0 }, 1, 3);
      const bytes = opslaan === "sessie" ? (await saveYrsDocx(s)).bytes
        : new Uint8Array(await saveEditorDocument(s, yrsToDocument(s, document), []));
      const xml = new Pakket(bytes).lees("word/document.xml");
      const rijen = kinderen(zoekAlle(leesXml(xml), "tbl")[0], "tr");
      // De bron heeft geen tcW. Alleen de geselecteerde bovenste cel wordt
      // gedeeld; de onderste vier cellen krijgen geen verzonnen voorkeur.
      for (const rij of rijen.slice(1)) for (const cel of kinderen(rij, "tc"))
        expect(kind(kind(cel, "tcPr"), "tcW")).toBeNull();
      if (splitsen) for (const cel of kinderen(rijen[0], "tc")) {
        const voorkeur = kind(kind(cel, "tcPr"), "tcW");
        if (!voorkeur) continue;
        const soort = attr(voorkeur, "type"), waarde = Number(attr(voorkeur, "w"));
        // De tabel is 9360 twips breed. Een derde is 3120 twips of
        // 1666⅔ vijftigsten van een procent; 33 is hier geen 33%.
        if (soort === "dxa") expect(waarde).toBe(3120);
        else if (soort === "pct") expect(Math.abs(waarde - 5000 / 3)).toBeLessThanOrEqual(1);
        else expect(["auto", "nil"]).toContain(soort);
      }
    } finally { s.destroy(); }
  });
  it.each(expliciet)("behoudt expliciet $waarde $soort uit $herkomst via $openen → $opslaan", async ({ openen, opslaan, waarde, soort, herkomst }) => {
    const { createYrsSession, documentToYrs, saveEditorDocument, saveYrsDocx, yrsToDocument } = proef.sdk;
    const s = await createYrsSession();
    try {
      const bron = herkomst === "bron" ? metVoorkeur(waarde, soort) : BRON;
      const document = await proef.docx.parseDocx(bron, { preloadFonts: false });
      if (openen === "native") s.openDocx(bron, true);
      else documentToYrs(s, document);
      if (herkomst === "bewerking") {
        const cel = { story: "body", tableIndex: 0, row: 1, column: 0 };
        s.setCellTextFormat({ anchor: cel, head: cel }, { width: waarde, widthType: soort });
      }
      s.splitCell({ story: "body", tableIndex: 0, row: 0, column: 0 }, 1, 3);
      const bytes = opslaan === "sessie" ? (await saveYrsDocx(s)).bytes
        : new Uint8Array(await saveEditorDocument(s, yrsToDocument(s, document), []));
      const tabel = zoekAlle(leesXml(new Pakket(bytes).lees("word/document.xml")), "tbl")[0];
      const cel = kinderen(kinderen(tabel, "tr")[1], "tc")[0];
      const voorkeur = kind(kind(cel, "tcPr"), "tcW");
      expect(attr(voorkeur, "type")).toBe(soort);
      expect(Number(attr(voorkeur, "w"))).toBe(waarde);
    } finally { s.destroy(); }
  });
});
