import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import type { Document } from "@betteroffice/docx/types/document";
import { leesEigenschappen, schrijfEigenschappen } from "./docprops";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { noteerActiviteit, sessieMinuten, wachtendeEigenschappen, werkEigenschappenBij, zetEigenschappen } from "./opslaan";
import { taalNaam, taalOpCursor } from "./taal";
import { leesBlokken } from "./Leesmodus";

const leeg = () =>
  zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`),
  });

describe("eigenschappen bij opslaan", () => {
  it("zet wachtende eigenschappen, revisie, datum en bewerkingstijd", async () => {
    const handle = {};
    zetEigenschappen(handle, { titel: "Plan", trefwoorden: "a, b" });
    expect(wachtendeEigenschappen(handle)).toEqual({ titel: "Plan", trefwoorden: "a, b" });
    noteerActiviteit(handle, 0);
    noteerActiviteit(handle, 2 * 60000);
    noteerActiviteit(handle, 2 * 60000 + 60 * 60000); // lange pauze telt maximaal 5 min
    expect(sessieMinuten(handle)).toBe(7);
    const tussen = await werkEigenschappenBij(handle, null, leeg(), false);
    expect(leesEigenschappen(tussen)).toMatchObject({ titel: "Plan", revisie: null, bewerkingstijd: null });
    const uit = await werkEigenschappenBij(handle, null, tussen, true);
    const e = leesEigenschappen(uit);
    expect(e).toMatchObject({ titel: "Plan", trefwoorden: "a, b", revisie: 1, bewerkingstijd: 7 });
    expect(e.gewijzigd).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(sessieMinuten(handle)).toBe(0);
  });

  it("geeft de bytes ongewijzigd terug zonder wachtende eigenschappen", async () => {
    const bytes = leeg();
    expect(await werkEigenschappenBij({}, null, bytes, false)).toBe(bytes);
    // Geen geldig pakket: opslaan gaat toch door.
    const kapot = new Uint8Array([1, 2, 3]);
    expect(await werkEigenschappenBij({}, null, kapot, true)).toBe(kapot);
  });

  it("laat een korte herstelkopie bytegelijk en bewaart ook ongeronde activiteit", async () => {
    const handle = {}, bytes = leeg();
    const getEditorRef = vi.fn(() => { throw Error("Herstel vraagt geen alineastatistieken"); });
    const getTotalPages = vi.fn(() => { throw Error("Herstel vraagt geen paginatelling"); });
    const ref = { getEditorRef, getTotalPages } as unknown as DocxEditorRef;
    noteerActiviteit(handle, 0);
    noteerActiviteit(handle, 29_000);
    expect(await werkEigenschappenBij(handle, ref, bytes, "herstel")).toBe(bytes);
    noteerActiviteit(handle, 31_000);
    // 31.000 / 60.000 rondt af naar één minuut; de eerdere 29 s blijven meetellen.
    expect(sessieMinuten(handle)).toBe(1);
    expect(getEditorRef).not.toHaveBeenCalled();
    expect(getTotalPages).not.toHaveBeenCalled();
  });

  it("herstelt wachtende eigenschappen en voorlopige tijd zonder een gewone opslag te verbruiken", async () => {
    const handle = {};
    const bytes = schrijfEigenschappen(leeg(), { titel: "Basis", revisieOphogen: true, bewerkingstijd: 7, gewijzigd: "2025-01-02T03:04:05Z" });
    const ongewijzigd = bytes.slice();
    const getEditorRef = vi.fn(() => { throw Error("Geen volledige statistieklezing bij herstel"); });
    const getTotalPages = vi.fn(() => { throw Error("Geen paginatelling bij herstel"); });
    const ref = { getEditorRef, getTotalPages } as unknown as DocxEditorRef;
    zetEigenschappen(handle, { titel: "Gewijzigd", trefwoorden: "herstel" });
    noteerActiviteit(handle, 0);
    noteerActiviteit(handle, 120_000);
    for (let i = 0; i < 2; i++) {
      const kopie = await werkEigenschappenBij(handle, ref, bytes, "herstel");
      // Bestaande zeven minuten plus 120.000 / 60.000 = twee voorlopige minuten.
      expect(leesEigenschappen(kopie)).toMatchObject({ titel: "Gewijzigd", trefwoorden: "herstel", revisie: 1, bewerkingstijd: 9, gewijzigd: "2025-01-02T03:04:05Z" });
      expect(sessieMinuten(handle)).toBe(2);
      expect(bytes).toEqual(ongewijzigd);
    }
    expect(getEditorRef).not.toHaveBeenCalled();
    expect(getTotalPages).not.toHaveBeenCalled();
    expect(wachtendeEigenschappen(handle)).toEqual({ titel: "Gewijzigd", trefwoorden: "herstel" });
    const opgeslagen = await werkEigenschappenBij(handle, null, bytes, true);
    expect(leesEigenschappen(opgeslagen)).toMatchObject({ titel: "Gewijzigd", revisie: 2, bewerkingstijd: 9 });
    expect(sessieMinuten(handle)).toBe(0);
  });
});

const doc = {
  package: {
    styles: {
      docDefaults: { rPr: { language: { latin: "en-US" } } },
      styles: [
        { styleId: "Normal", type: "paragraph", default: true },
        { styleId: "Heading1", type: "paragraph", basedOn: "Normal", pPr: { outlineLevel: 0 }, rPr: { language: { latin: "nl-NL" } } },
      ],
    },
    document: {
      content: [
        { type: "paragraph", formatting: { styleId: "Heading1" }, content: [{ type: "run", content: [{ type: "text", text: "Kop" }] }] },
        {
          type: "paragraph",
          content: [
            { type: "run", formatting: { bold: true }, content: [{ type: "text", text: "Vet " }] },
            { type: "run", formatting: { language: { latin: "de-DE" } }, content: [{ type: "text", text: "Deutsch" }] },
            { type: "deletion", content: [{ type: "run", content: [{ type: "text", text: "weg" }] }] },
          ],
        },
        { type: "table", rows: [{ cells: [{ content: [{ type: "paragraph", content: [{ type: "run", content: [{ type: "text", text: "cel" }] }] }] }] }] },
      ],
    },
  },
} as unknown as Document;

describe("taal en leesmodus", () => {
  it("vindt de taal via run, stijl en documentstandaard", () => {
    expect(taalOpCursor(doc, "body:p0", 0)).toBe("nl-NL");
    expect(taalOpCursor(doc, "body:p1", 1)).toBe("en-US");
    expect(taalOpCursor(doc, "body:p1", 6)).toBe("de-DE");
    expect(taalNaam("nl-NL")).toBe("Nederlands (Nederland)");
    expect(taalNaam("nl-BE")).toBe("Nederlands (België)");
  });

  it("maakt eenvoudige leesblokken zonder verwijderde tekst", () => {
    const blokken = leesBlokken(doc);
    expect(blokken[0]).toMatchObject({ soort: "alinea", niveau: 1 });
    expect(blokken[1]).toMatchObject({ soort: "alinea", niveau: 0, stukken: [{ tekst: "Vet ", vet: true }, { tekst: "Deutsch" }] });
    expect(blokken[2]).toMatchObject({ soort: "tabel" });
  });
});
