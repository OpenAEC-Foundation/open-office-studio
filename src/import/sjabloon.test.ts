import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { bereidOpenen } from "./openen";
import { beginToestand, tabbladReducer } from "../tabbladen";
import { opslagplan } from "../werkbestand";
import { isSjabloon } from "./sjabloon";

const typen = [
  ["docx", "dotx", "wordprocessingml.document", "wordprocessingml.template"],
  ["xlsx", "xltx", "spreadsheetml.sheet", "spreadsheetml.template"],
  ["pptx", "potx", "presentationml.presentation", "presentationml.template"],
] as const;

function sjabloon(soort: string, documenttype: string, sjabloontype: string) {
  const delen = unzipSync(readFileSync(`public/templates/nieuw.${soort}`));
  delen["[Content_Types].xml"] = strToU8(
    strFromU8(delen["[Content_Types].xml"]).replace(
      `${documenttype}.main+xml`,
      `${sjabloontype}.main+xml`,
    ),
  );
  delen["customXml/sjabloon.xml"] = strToU8("<voorbeeld>Huisstijl</voorbeeld>");
  return zipSync(delen);
}

describe("sjablonen openen als zelfstandig document (#27)", () => {
  it("herkent sjablonen inclusief macro-, oudere en ODF-formaten zonder documentbestanden mee te nemen", () => {
    for (const ext of [
      "dotx",
      "dotm",
      "dot",
      "ott",
      "stw",
      "xltx",
      "xltm",
      "xlt",
      "ots",
      "stc",
      "potx",
      "potm",
      "pot",
      "otp",
      "sti",
    ])
      expect(isSjabloon(`Huisstijl.${ext.toUpperCase()}`)).toBe(true);
    for (const ext of [
      "docx",
      "docm",
      "xlsx",
      "xlsm",
      "pptx",
      "pptm",
      "ppsx",
      "ifcx",
      "odt",
      "ods",
      "odp",
    ])
      expect(isSjabloon(`Bestand.${ext}`)).toBe(false);
  });
  it.each(typen)(
    "opent %s-sjabloon .%s zonder conversieruntime en behoudt pakketdelen",
    async (soort, ext, documenttype, sjabloontype) => {
      const bytes = sjabloon(soort, documenttype, sjabloontype);
      const voor = unzipSync(bytes);
      const converteer = vi.fn(async () => {
        throw new Error("Geen runtime");
      });
      const resultaat = (await bereidOpenen(
        `Huisstijl.${ext.toUpperCase()}`,
        bytes,
        { converteer },
      ))!;
      expect(converteer).not.toHaveBeenCalled();
      expect(resultaat).toMatchObject({
        soort,
        alsNieuw: true,
        gewijzigd: true,
        exportFormaat: soort,
      });
      const na = unzipSync(resultaat.bytes);
      expect(strFromU8(na["[Content_Types].xml"])).toContain(
        `${documenttype}.main+xml`,
      );
      expect(strFromU8(voor["[Content_Types].xml"])).toContain(
        `${sjabloontype}.main+xml`,
      );
      expect(Object.keys(na).sort()).toEqual(Object.keys(voor).sort());
      for (const naam of Object.keys(voor))
        if (naam !== "[Content_Types].xml")
          // Vergelijk alle bytes zonder honderdduizenden array-items te bezoeken.
          expect(Buffer.compare(na[naam], voor[naam]), naam).toBe(0);
    },
  );

  it.each([
    ["docx", "ott"],
    ["xlsx", "ots"],
    ["pptx", "otp"],
    ["docx", "dot"],
    ["xlsx", "xlt"],
    ["pptx", "pot"],
  ] as const)(
    "maakt na conversie van %s-sjabloon .%s een nieuw document",
    async (soort, ext) => {
      const resultaat = (await bereidOpenen(
        `Huisstijl.${ext}`,
        new Uint8Array([1]),
        {
          converteer: async () =>
            new Uint8Array(readFileSync(`public/templates/nieuw.${soort}`)),
        },
      ))!;
      expect(resultaat).toMatchObject({
        soort,
        alsNieuw: true,
        gewijzigd: true,
        exportFormaat: soort,
      });
    },
  );

  it.each([
    [
      "docx",
      "dotm",
      "docm",
      "word/document.xml",
      "application/vnd.ms-word.template.macroEnabledTemplate.main+xml",
      "wordprocessingml.document",
    ],
    [
      "xlsx",
      "xltm",
      "xlsm",
      "xl/workbook.xml",
      "application/vnd.ms-excel.template.macroEnabled.main+xml",
      "spreadsheetml.sheet",
    ],
    [
      "pptx",
      "potm",
      "pptm",
      "ppt/presentation.xml",
      "application/vnd.ms-powerpoint.template.macroEnabled.main+xml",
      "presentationml.presentation",
    ],
  ] as const)(
    "behoudt VBA uit %s-sjabloon .%s voor een nieuw macrodocument .%s",
    async (soort, ext, doel, hoofd, type, normaal) => {
      const delen = unzipSync(readFileSync(`public/templates/nieuw.${soort}`));
      delen["[Content_Types].xml"] = strToU8(
        strFromU8(delen["[Content_Types].xml"])
          .replace(
            `application/vnd.openxmlformats-officedocument.${normaal}.main+xml`,
            type,
          )
          .replace(
            "</Types>",
            '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>',
          ),
      );
      const map = hoofd.slice(0, hoofd.lastIndexOf("/"));
      const naam = hoofd.slice(hoofd.lastIndexOf("/") + 1);
      const rels = `${map}/_rels/${naam}.rels`;
      delen[rels] = strToU8(
        strFromU8(delen[rels]).replace(
          "</Relationships>",
          '<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>',
        ),
      );
      const vba = new Uint8Array([1, 7, 9]);
      delen[`${map}/vbaProject.bin`] = vba;
      const resultaat = (await bereidOpenen(`Macro.${ext}`, zipSync(delen), {
        converteer: vi.fn(async () => {
          throw new Error("Geen runtime");
        }),
      }))!;
      expect(resultaat).toMatchObject({
        alsNieuw: true,
        gewijzigd: true,
        exportFormaat: doel,
      });
      expect(resultaat.bron?.macro?.delen[`${map}/vbaProject.bin`]).toEqual(
        vba,
      );
      expect(
        Object.keys(unzipSync(resultaat.bytes)).some((p) =>
          /vbaProject/.test(p),
        ),
      ).toBe(false);
    },
  );

  it("houdt documentbestanden aan hun normale bestandsidentiteit gekoppeld", async () => {
    const bytes = new Uint8Array(readFileSync("public/templates/nieuw.docx"));
    const resultaat = (await bereidOpenen("Brief.docx", bytes, {
      converteer: vi.fn(),
    }))!;
    expect(resultaat.alsNieuw).not.toBe(true);
    expect(resultaat.gewijzigd).toBe(false);
    expect(resultaat.bytes).toBe(bytes);
  });

  it("opent hetzelfde sjabloon tweemaal als naamloze kopieën zonder terugschrijf-token", () => {
    const actie = {
      type: "openDocument" as const,
      naam: "Huisstijl.docx",
      soort: "docx" as const,
      bytes: new Uint8Array([1]),
      vingerafdruk: "identiek-sjabloon",
      werkbestand: { token: "origineel", naam: "Huisstijl.dotx" },
      alsNieuw: true,
    };
    const eerste = tabbladReducer(beginToestand, actie);
    const tweede = tabbladReducer(eerste, actie);
    expect(tweede.tabbladen).toHaveLength(2);
    expect(
      tweede.tabbladen.map((t) => t.type === "document" && t.naam),
    ).toEqual(["Naamloos 1.docx", "Naamloos 2.docx"]);
    for (const t of tweede.tabbladen) {
      if (t.type !== "document") throw new Error("Geen document");
      expect(t.werkbestand).toBeNull();
      expect(t.vingerafdruk).toBeNull();
      expect(t.gewijzigd).toBe(true);
      expect(opslagplan({ ...t, heeftKeuze: false })).toEqual({
        route: "opslaanAls",
      });
    }
    const bewaard = tabbladReducer(tweede, {
      type: "werkBij",
      id: 2,
      wijziging: {
        werkbestand: { token: "eigen-kopie", naam: "Mijn brief.docx" },
        gewijzigd: false,
      },
    });
    const kopie = bewaard.tabbladen[1];
    if (kopie.type !== "document") throw new Error("Geen document");
    expect(opslagplan({ ...kopie, heeftKeuze: true })).toEqual({
      route: "terugschrijven",
      ext: "docx",
      bevestigen: false,
    });
  });
});
