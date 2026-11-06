import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocx } from "@betteroffice/docx/docx";
import { createYrsSession, documentToYrs, saveEditorDocument, saveYrsDocx, yrsToDocument } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { attr, kind, kinderen, leesXml, zoekAlle } from "../../grafieken/xml";

const BRON = readFileSync("docs/tests/celsplitsing-bron-2026-11-06.docx");
const routes = [{ openen: "native", opslaan: "sessie" }, { openen: "native", opslaan: "editor" },
  { openen: "document", opslaan: "editor" }] as const;
const gevallen = routes.flatMap(route => [false, true].map(splitsen => ({ ...route, splitsen })));

describe("voorkeursbreedtes behouden in de echte opslagroutes (#48)", () => {
  it.each(gevallen)("$openen → $opslaan, splitsen: $splitsen", async ({ openen, opslaan, splitsen }) => {
    const s = await createYrsSession();
    try {
      const document = await parseDocx(BRON, { preloadFonts: false });
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
});
