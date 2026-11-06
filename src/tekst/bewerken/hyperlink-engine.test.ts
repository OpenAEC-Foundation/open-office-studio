import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { herstelHyperlinkTekst } from "../../../scripts/tekstengine-compatibiliteit";

const BRON = readFileSync("public/templates/nieuw.docx");
// Dezelfde koppelingzoeker die de vastgezette editor gebruikt bij toepassen.
const enginepad = pathToFileURL(resolve("node_modules/@betteroffice/docx-react/dist/chunk-LZ2DPBZ6.mjs")).href;

describe("hyperlinktekst bij bewerken (#146)", () => {
  it("controleert beide aansluitingen en weigert een ongemerkte enginewijziging", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
    const nieuw = herstelHyperlinkTekst(bron);
    expect(nieuw).toContain('displayText:(o?ra$1(o,ft)?.text:null)??ge?.displayText??ft');
    expect(nieuw).toContain('T.displayText&&(!wt||T.displayText!==wt.text)');
    expect(() => herstelHyperlinkTekst("andere engine")).toThrow("hyperlinktekst");
    expect(() => herstelHyperlinkTekst(bron + bron)).toThrow("hyperlinktekst");
  });

  it.each([false, true])("leest vanaf één aangeklikte letter de volledige koppeling, tabelcel: %s", async (inCel) => {
    const { ra: zoekKoppeling } = await import(/* @vite-ignore */ enginepad);
    const s = await createYrsSession();
    try {
      s.openDocx(BRON, true);
      let story = "body", paraId = s.paragraphs(story)[0].paraId;
      if (inCel) {
        story = s.insertTable({ story, paraId, offset: 0 }, 2, 2).createdStoryIds[0];
        paraId = s.paragraphs(story)[0].paraId;
      }
      s.insertText({ story, paraId, offset: 0 }, "voor Testlink na");
      const bereik = { story, start: { paraId, offset: 5 }, end: { paraId, offset: 13 } };
      s.setHyperlink(bereik, { href: "https://example.com", tooltip: "Proef", rId: null });
      s.formatRange({ story, start: { paraId, offset: 7 }, end: { paraId, offset: 10 } }, { bold: true });
      s.beginUndoCapture();
      s.addUndoBoundary();
      s.setSelection({ story, paraId, offset: 8 });
      const link = zoekKoppeling(s, "https://example.com");
      expect(link).toMatchObject({ text: "Testlink", range: bereik, tooltip: "Proef" });
      // Een ongewijzigde weergavetekst vereist alleen de hyperlinkbewerking.
      s.setHyperlink(link.range, { href: "https://example.org", tooltip: link.tooltip, rId: null });
      s.addUndoBoundary();
      expect(s.paragraphs(story)[0].text).toBe("voor Testlink na");
      expect(s.selectionContext({ story, start: { paraId, offset: 8 }, end: { paraId, offset: 9 } }).bold).toBe(true);
      expect(zoekKoppeling(s, "https://example.org")?.text).toBe("Testlink");
      expect(s.undo()).toBe(true);
      s.setSelection({ story, paraId, offset: 8 });
      expect(zoekKoppeling(s, "https://example.com")?.text).toBe("Testlink");
      expect(s.redo()).toBe(true);
      s.setSelection({ story, paraId, offset: 8 });
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(s)).bytes, true);
        const heropendStory = inCel
          ? (terug.tablePayload("body", 0) as { rows: { cells: { story: string }[] }[] }).rows[0].cells[0].story
          : "body";
        const heropend = terug.paragraphs(heropendStory)[0];
        terug.setSelection({ story: heropendStory, paraId: heropend.paraId, offset: 8 });
        expect(heropend.text).toBe("voor Testlink na");
        expect(zoekKoppeling(terug, "https://example.org")?.text).toBe("Testlink");
      } finally { terug.destroy(); }
    } finally { s.destroy(); }
  });
});
