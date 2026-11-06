import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  bewaarWerkmapregio,
  herkenRegio,
  leesWerkmapregio,
  metBeginregio,
  REGIONAAM,
} from "./werkmapregio";
vi.mock("../lint/editorApi", () => ({
  zichtbaarElement: () => null,
  meldWijziging: vi.fn(),
}));
const bron = readFileSync("public/templates/nieuw.xlsx");
const boeken: WorkbookHandle[] = [];
afterEach(() => {
  boeken.splice(0).forEach((h) => h.dispose());
  vi.useRealTimers();
});
function api(bytes: Uint8Array = bron) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  return {
    handle: h,
    version: async () => h.version(),
    commands: { getState: () => ({ enabled: true }) },
  } as unknown as XlsxEditorApi;
}
function bewerkXml(werk: (xml: string) => string) {
  const delen = unzipSync(bron);
  delen["xl/workbook.xml"] = strToU8(werk(strFromU8(delen["xl/workbook.xml"])));
  return zipSync(delen);
}
function namenXml(inhoud: string) {
  return bewerkXml((xml) => xml.replace("<definedNames/>", inhoud));
}

describe("bestandsgebonden regio", () => {
  it("behoudt alle andere onderdelen en bestaande werkmaptekst", () => {
    const aangepast = metBeginregio(bron, "nl-NL");
    const oud = unzipSync(bron),
      nieuw = unzipSync(aangepast);
    expect(Object.keys(nieuw)).toEqual(Object.keys(oud));
    for (const naam of Object.keys(oud))
      if (naam !== "xl/workbook.xml") expect(nieuw[naam]).toEqual(oud[naam]);
    expect(leesWerkmapregio(api(aangepast))).toBe("nl-NL");
    expect(
      strFromU8(nieuw["xl/workbook.xml"]).replace(
        /<definedNames>.*?<\/definedNames>/,
        "<definedNames/>",
      ),
    ).toBe(strFromU8(oud["xl/workbook.xml"]));
  });
  it("kiest eenmaal, onafhankelijk van een volgende interfacetaal", () => {
    const nl = metBeginregio(bron, "nl-NL");
    expect(metBeginregio(nl, "en-US")).toBe(nl);
    expect(leesWerkmapregio(api(nl))).toBe("nl-NL");
    expect(leesWerkmapregio(api(metBeginregio(bron, "en-US")))).toBe("en-US");
  });
  it("voegt vóór de rekeninstellingen in en behoudt bestaande definities", () => {
    const input = namenXml(
      '<definedNames><definedName name="Bestaand">7</definedName></definedNames><calcPr calcId="42"/>',
    );
    const xml = strFromU8(
      unzipSync(metBeginregio(input, "nl-NL"))["xl/workbook.xml"],
    );
    expect(xml).toContain('<definedName name="Bestaand">7</definedName>');
    expect(xml.indexOf("</definedNames>")).toBeLessThan(xml.indexOf("<calcPr"));
    expect(leesWerkmapregio(api(metBeginregio(input, "nl-NL")))).toBe("nl-NL");
  });
  it("behoudt attributen aan een lege naamcontainer", () => {
    const input = namenXml(
      '<definedNames xmlns:proef="urn:synthetisch" proef:bewaar="ja"/>',
    );
    const xml = strFromU8(
      unzipSync(metBeginregio(input, "nl-NL"))["xl/workbook.xml"],
    );
    expect(xml).toContain('proef:bewaar="ja"');
    expect(xml).toContain(REGIONAAM);
  });
  it("herkent voorvoegsels op de werkmap en naamcontainer", () => {
    const input = bewerkXml((xml) =>
      xml
        .replace(
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
        .replace(
          /<(\/?)(workbook|bookViews|workbookView|sheets|sheet)(?=[\s/>])/g,
          "<$1s:$2",
        ),
    );
    const xml = strFromU8(
      unzipSync(metBeginregio(input, "de-DE"))["xl/workbook.xml"],
    );
    expect(xml).toContain("<s:definedNames><s:definedName");
    expect(leesWerkmapregio(api(metBeginregio(input, "de-DE")))).toBe("de-DE");
  });
  it.each(['"toekomstig-Land"', 'CONCAT("nl","-NL")', '"nl-NL"&""'])(
    "behoudt een onbekende instelling %s",
    (formule) => {
      const input = namenXml(
        `<definedNames><definedName name="${REGIONAAM}" hidden="1">${formule.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}</definedName></definedNames>`,
      );
      expect(metBeginregio(input, "nl-NL")).toBe(input);
      expect(leesWerkmapregio(api(input))).toBe("en-GB");
    },
  );
  it("maakt dezelfde beginbytes bij een andere systeemklok", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    const a = metBeginregio(bron, "nl-NL");
    vi.setSystemTime(new Date("2026-01-03T00:00:00Z"));
    expect(metBeginregio(bron, "nl-NL")).toEqual(a);
  });
  it("bewaart de keuze met Undo/Redo en heropenen zonder cellen te wijzigen", async () => {
    const a = api(metBeginregio(bron, "nl-NL"));
    const voor = a.handle.cell(0, 0, 0);
    await bewaarWerkmapregio(a, "fr-FR", a.handle.version());
    expect(leesWerkmapregio(a)).toBe("fr-FR");
    expect(a.handle.cell(0, 0, 0)).toEqual(voor);
    a.handle.undo();
    expect(leesWerkmapregio(a)).toBe("nl-NL");
    a.handle.redo();
    expect(leesWerkmapregio(a)).toBe("fr-FR");
    expect(leesWerkmapregio(api(a.handle.save()))).toBe("fr-FR");
  });
  it("weigert een verouderde bestandsinstelling", async () => {
    const a = api(metBeginregio(bron, "nl-NL"));
    const versie = a.handle.version();
    a.handle.editCell(0, 0, 0, "7");
    await expect(bewaarWerkmapregio(a, "fr-FR", versie)).rejects.toThrow();
    expect(leesWerkmapregio(a)).toBe("nl-NL");
  });
  it("weigert schrijven in een alleen-lezen document", async () => {
    const a = api(metBeginregio(bron, "nl-NL"));
    a.commands.getState = () =>
      ({ enabled: false, disabledReason: { code: "read-only" } }) as never;
    await expect(bewaarWerkmapregio(a, "fr-FR")).rejects.toThrow();
    expect(leesWerkmapregio(a)).toBe("nl-NL");
  });
  it("overschrijft geen bestaande zichtbare naam met dezelfde sleutel", async () => {
    const input = namenXml(
      `<definedNames><definedName name="${REGIONAAM}">7</definedName></definedNames>`,
    );
    expect(metBeginregio(input, "nl-NL")).toBe(input);
    const a = api(input);
    const versie = a.handle.version();
    await expect(bewaarWerkmapregio(a, "fr-FR")).rejects.toThrow();
    expect(a.handle.version()).toBe(versie);
    expect(leesWerkmapregio(a)).toBe("en-GB");
  });
  it("normaliseert uitsluitend bekende regiotags", () => {
    expect(herkenRegio("NL_nl")).toBe("nl-NL");
    expect(herkenRegio("nl")).toBeNull();
  });
});
