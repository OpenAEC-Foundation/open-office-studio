import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as xlsx from "@betteroffice/xlsx";
import * as pptx from "@betteroffice/pptx";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { ATTR, maakIfcx, openIfcx, SCHEMAS } from "./dossier";
import { bereidIfcxOpslag } from "./opslag";
import { bereidOpenen } from "../import/openen";
import { uitvoerformaat, bestandssoort, invoerformaten } from "../formaten";
import { opslagRapport } from "../import/rapport";
import { opslagplan } from "../werkbestand";
import { pakIn, pakUit, type Overdracht } from "../vensteroverdracht";
import { DocumentOpslag } from "../opslag";
import { unzipSync } from "fflate";
import type { MacroOnderdelen } from "../import/macros";

const bron = (soort: string) =>
  new Uint8Array(readFileSync(`public/templates/nieuw.${soort}`));
const decode = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes));
const encode = (dossier: unknown) =>
  new TextEncoder().encode(JSON.stringify(dossier));
const hulp = {
  converteer: async () => {
    throw new Error("Onverwachte conversie");
  },
};
async function begin(soort: "docx" | "xlsx" | "pptx" = "docx") {
  return maakIfcx({
    soort,
    naam: `Vrijgaveproef.${soort}`,
    bytes: bron(soort),
  });
}

beforeAll(async () => {
  await xlsx.initWasm(
    readFileSync(
      "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
    ),
  );
  await pptx.initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  );
});

describe("Office in een zelfdragend IFCX-bestand", () => {
  it.each(["docx", "xlsx", "pptx"] as const)(
    "bewaart alle oorspronkelijke %s-bytes en kiest de juiste editor",
    async (soort) => {
      const gemaakt = await begin(soort);
      const dossier = decode(gemaakt.bytes);
      const payload = dossier.data.find(
        (n: any) => n.attributes[ATTR + "payload"],
      ).attributes[ATTR + "payload"];
      // Onafhankelijke byte- en hashcontrole, naast de eigen lezer.
      expect(new Uint8Array(Buffer.from(payload.content, "base64"))).toEqual(
        bron(soort),
      );
      expect(payload.sha256).toBe(
        createHash("sha256").update(bron(soort)).digest("hex"),
      );
      const open = await bereidOpenen(
        "Vrijgaveproef.ifcx",
        gemaakt.bytes,
        hulp,
      );
      expect(open).toMatchObject({
        soort,
        naam: "Vrijgaveproef.ifcx",
        gewijzigd: false,
        exportFormaat: "ifcx",
      });
      expect(open!.bytes).toEqual(bron(soort));
      expect(open!.bron!.ifcx!.documentPad).toBe(gemaakt.bron.documentPad);
    },
  );

  it("hanteert de ingesloten bron van het bestaande voorstel", async () => {
    const { maakDossier } = await import(
      new URL(
        "../../experiments/ifcx-office/bewaarprofiel.mjs",
        import.meta.url,
      ).href
    );
    const bytes = encode(
      maakDossier([
        {
          id: "tekst",
          kind: "writer",
          title: "Proef",
          fileName: "Proef.docx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          bytes: bron("docx"),
        },
      ]),
    );
    expect((await openIfcx(bytes)).bytes).toEqual(bron("docx"));
  });

  it("behoudt onbekende knooppunten, attributen, velden en oudere bronverwijzingen na een wijziging", async () => {
    const eerste = await begin();
    const dossier = decode(eerste.bytes);
    dossier.extension = { versie: "2", onbekend: [true, null, "inhoud"] };
    dossier.header.extra = "onbekende kop";
    dossier.schemas["example::extra"] = { value: { dataType: "String" } };
    dossier.data.push({
      path: "/office/extra/1",
      children: { document: eerste.bron.documentPad },
      attributes: { "example::extra": "behouden" },
    });
    dossier.data[1].attributes[ATTR + "document"].extra = {
      verwijzing: eerste.bron.bronPad,
    };
    const voor = await openIfcx(encode(dossier));
    const sessie = await createYrsSession();
    try {
      sessie.openDocx(voor.bytes, true);
      const paraId = sessie.paragraphs("body")[0].paraId;
      sessie.insertText(
        { story: "body", paraId, offset: 0 },
        "Bewaarde wijziging",
      );
      const huidige = (await saveYrsDocx(sessie)).bytes;
      const na = await maakIfcx({
        soort: "docx",
        naam: "Wijziging",
        bytes: huidige,
        vorige: voor.bron,
      });
      const inhoud = decode(na.bytes);
      expect(inhoud.extension).toEqual(dossier.extension);
      expect(inhoud.header.extra).toBe(dossier.header.extra);
      expect(inhoud.schemas).toEqual(dossier.schemas);
      expect(
        inhoud.data.find((n: any) => n.path === "/office/extra/1"),
      ).toEqual(dossier.data.at(-1));
      expect(
        inhoud.data.find((n: any) => n.path === eerste.bron.bronPad),
      ).toEqual(dossier.data[2]);
      expect(na.bron.documentPad).toBe(eerste.bron.documentPad);
      expect(na.bron.bronPad).not.toBe(eerste.bron.bronPad);
      const terug = await bereidOpenen("Wijziging.ifcx", na.bytes, hulp);
      const opnieuw = await createYrsSession();
      try {
        opnieuw.openDocx(terug!.bytes, true);
        expect(opnieuw.paragraphs("body")[0].text).toBe("Bewaarde wijziging");
      } finally {
        opnieuw.destroy();
      }
    } finally {
      sessie.destroy();
    }
  });

  it("bewaart formules en herberekening na een IFCX-bewerking en heropening", async () => {
    const eerste = await begin("xlsx");
    const document = await bereidOpenen("Berekening.ifcx", eerste.bytes, hulp);
    const boek = xlsx.openWorkbook(document!.bytes);
    // Handberekening: 7 × 2 = 14; de formule moet behouden blijven.
    boek.editCell(0, 0, 0, "7");
    boek.editCell(0, 1, 0, "=A1*2");
    const bewaard = await bereidIfcxOpslag({
      soort: "xlsx",
      naam: "Berekening",
      bytes: boek.save(),
      bron: document!.bron,
    });
    const terug = await bereidOpenen("Berekening.ifcx", bewaard.bytes, hulp);
    const opnieuw = xlsx.openWorkbook(terug!.bytes);
    expect(opnieuw.cell(0, 1, 0)).toMatchObject({
      input: "=A1*2",
      isFormula: true,
    });
    const waarde = () => {
      const r = opnieuw.readCells({
        ranges: [
          {
            sheetId: opnieuw.sheetInfo().sheetIds[0],
            range: { kind: "a1", a1: "A2" },
          },
        ],
      });
      if (!r.ok) throw new Error(r.failure.message);
      return r.ranges[0].cells[0][0].value;
    };
    expect(waarde()).toMatchObject({ kind: "number", value: 14 });
    opnieuw.editCell(0, 0, 0, "9");
    // Handberekening na wijzigen: 9 × 2 = 18.
    expect(waarde()).toMatchObject({ kind: "number", value: 18 });
  });

  it("opent de opgeslagen presentatie opnieuw met dia's, vormen en notities", async () => {
    const bytes = new Uint8Array(
      readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"),
    );
    const deck = pptx.openPresentation(bytes);
    const verwacht = deck.snapshot();
    const gemaakt = await maakIfcx({
      soort: "pptx",
      naam: "Presentatie",
      bytes: deck.save(),
    });
    const terug = await bereidOpenen("Presentatie.ifcx", gemaakt.bytes, hulp);
    const na = pptx.openPresentation(terug!.bytes).snapshot();
    expect(
      na.slides.map((s) => [s.notes, s.shapes.map((v) => v.name)]),
    ).toEqual(
      verwacht.slides.map((s) => [s.notes, s.shapes.map((v) => v.name)]),
    );
  });

  it("schrijft een ongewijzigde IFCX letterlijk terug, met witruimte, BOM en onbekende velden", async () => {
    const eerste = await begin();
    const bytes = new TextEncoder().encode(
      "\uFEFF" + JSON.stringify(decode(eerste.bytes), null, 4) + "\n",
    );
    const open = await bereidOpenen("Proef.ifcx", bytes, hulp);
    const terug = await bereidIfcxOpslag({
      soort: "docx",
      naam: "Proef",
      bytes: bron("docx"),
      bron: open!.bron,
      ongewijzigd: true,
    });
    expect(terug.bytes).toEqual(bytes);
  });

  it("heeft native opslag zonder conversie en bewaart de oorspronkelijke bron bij een vensterverhuizing", async () => {
    expect(bestandssoort("ifcx")).toBeNull();
    expect(invoerformaten.split(",").filter((e) => e === ".ifcx")).toHaveLength(
      1,
    );
    expect(
      opslagplan({
        soort: "docx",
        werkbestand: { token: "proef", naam: "Proef.ifcx" },
        heeftKeuze: false,
      }),
    ).toEqual({ route: "terugschrijven", ext: "ifcx", bevestigen: false });
    for (const soort of ["docx", "xlsx", "pptx"] as const) {
      const formaat = uitvoerformaat(soort, "ifcx")!;
      expect(formaat.route).toBe("engine");
      expect(
        opslagRapport({
          soort,
          formaat,
          route: "engine",
          risicos: [],
          macros: true,
        }),
      ).toBeNull();
    }
    const gemaakt = await begin();
    const overdracht: Overdracht = {
      type: "document",
      naam: "Proef.ifcx",
      soort: "docx",
      bytes: bron("docx"),
      exportFormaat: "ifcx",
      zoom: 1,
      gewijzigd: false,
      vingerafdruk: null,
      bron: { ifcx: gemaakt.bron },
    };
    expect(pakUit(pakIn(overdracht))).toEqual(overdracht);
  });

  it("merkt eerder bewerkte en opgeslagen inhoud niet ten onrechte als ongewijzigde openbron aan", async () => {
    const opslag = new DocumentOpslag();
    opslag.wissel();
    expect(opslag.ongewijzigdSindsOpenen).toBe(true);
    opslag.wijzig(opslag.documentId);
    await opslag.opslaan(
      async () => bron("docx"),
      async () => ({ status: "opgeslagen", pad: "Proef.docx" }),
    );
    expect(opslag.gewijzigd).toBe(false);
    expect(opslag.ongewijzigdSindsOpenen).toBe(false);
  });

  it("behoudt het VBA-project ook na heropenen en binaire vensteroverdracht", async () => {
    const vba = new Uint8Array(3000).map((_, i) => (i * 7) & 0xff);
    const macro: MacroOnderdelen = {
      bronformaat: "docm",
      hoofdpad: "word/document.xml",
      hoofdtype: "application/vnd.ms-word.document.macroEnabled.main+xml",
      delen: { "word/vbaProject.bin": vba },
      relaties: [
        {
          id: "rIdVBA",
          type: "http://schemas.microsoft.com/office/2006/relationships/vbaProject",
          doel: "vbaProject.bin",
        },
      ],
      typen: { "word/vbaProject.bin": "application/vnd.ms-office.vbaProject" },
      modules: [],
      ondertekend: false,
      heeftVba: true,
    };
    const bestand = await bereidIfcxOpslag({
      soort: "docx",
      naam: "Macro",
      bytes: bron("docx"),
      bron: { macro },
    });
    const open = await bereidOpenen("Macro.ifcx", bestand.bytes, hulp);
    expect(open!.bron!.macro!.delen["word/vbaProject.bin"]).toEqual(vba);
    const overdracht: Overdracht = {
      type: "document",
      naam: "Macro.ifcx",
      soort: "docx",
      bytes: open!.bytes,
      exportFormaat: "ifcx",
      zoom: 1,
      gewijzigd: true,
      vingerafdruk: null,
      bron: open!.bron,
    };
    const terug = pakUit(pakIn(overdracht));
    expect(terug).toEqual(overdracht);
    if (terug.type !== "document") throw new Error("Geen document");
    const bewaard = await bereidIfcxOpslag({
      soort: "docx",
      naam: "Macro",
      bytes: terug.bytes,
      bron: terug.bron,
    });
    expect(
      unzipSync((await openIfcx(bewaard.bytes)).bytes)["word/vbaProject.bin"],
    ).toEqual(vba);
  });

  it("versleutelt de ingesloten bron en vraagt het wachtwoord bij heropenen", async () => {
    const bestand = await bereidIfcxOpslag({
      soort: "docx",
      naam: "Beveiligd",
      bytes: bron("docx"),
      wachtwoord: "Proef-wachtwoord €1",
    });
    expect((await openIfcx(bestand.bytes)).bytes.slice(0, 4)).not.toEqual(
      bron("docx").slice(0, 4),
    );
    let vragen = 0;
    const open = await bereidOpenen("Beveiligd.ifcx", bestand.bytes, {
      ...hulp,
      vraagWachtwoord: async () =>
        ++vragen === 1 ? "verkeerd" : "Proef-wachtwoord €1",
    });
    expect(vragen).toBe(2);
    expect(open!.bytes).toEqual(bron("docx"));
    expect(open!.bron!.versleuteling).toBe("agile");
    const gelijk = await bereidIfcxOpslag({
      soort: "docx",
      naam: "Beveiligd",
      bytes: open!.bytes,
      bron: open!.bron,
      ongewijzigd: true,
    });
    expect(gelijk.bytes).toEqual(bestand.bytes);
    expect(new TextDecoder().decode(bestand.bytes)).not.toContain(
      "Proef-wachtwoord",
    );
  }, 30000);

  it("weigert wachtwoordbeveiliging die leesbare oudere bronnen zou achterlaten", async () => {
    const origineel = await begin();
    await expect(bereidIfcxOpslag({
      soort: "docx", naam: "Beveiligd", bytes: bron("docx"),
      bron: { ifcx: origineel.bron }, wachtwoord: "Nieuw wachtwoord",
    })).rejects.toThrow("eerdere onversleutelde bronnen");
    // De bestaande dossieridentiteit en bron blijven ongewijzigd.
    expect((await openIfcx(origineel.bytes)).bytes).toEqual(bron("docx"));
  });

  it("bewaart bij beveiligd doorwerken alleen versleutelde bronrevisies", async () => {
    const eerste = await bereidIfcxOpslag({
      soort: "docx", naam: "Beveiligd", bytes: bron("docx"), wachtwoord: "Proef een",
    });
    const tweede = await bereidIfcxOpslag({
      soort: "docx", naam: "Beveiligd", bytes: bron("docx"),
      bron: { ifcx: eerste.bron }, wachtwoord: "Proef twee",
    });
    const bronnen = decode(tweede.bytes).data.flatMap((node: any) => {
      const payload = node.attributes?.[ATTR + "payload"];
      return payload ? [Buffer.from(payload.content, "base64")] : [];
    });
    expect(bronnen).toHaveLength(2);
    for (const bytes of bronnen) expect(bytes.slice(0, 8)).toEqual(Buffer.from("d0cf11e0a1b11ae1", "hex"));
    expect((await bereidOpenen("Beveiligd.ifcx", tweede.bytes, {
      ...hulp, vraagWachtwoord: async () => "Proef twee",
    }))!.bytes).toEqual(bron("docx"));
  }, 30000);
});

describe("beschadigde of niet ondersteunde IFCX", () => {
  it.each([
    [
      "gewijzigde bronhash",
      (d: any) => {
        d.data[2].attributes[ATTR + "payload"].sha256 = "0".repeat(64);
      },
    ],
    [
      "verkeerd byte-aantal",
      (d: any) => {
        d.data[2].attributes[ATTR + "payload"].byteLength++;
      },
    ],
    [
      "base64 met extra witruimte",
      (d: any) => {
        d.data[2].attributes[ATTR + "payload"].content += "\n";
      },
    ],
    [
      "ontbrekende bron",
      (d: any) => {
        d.data.pop();
      },
    ],
    [
      "verkeerde modulesoort",
      (d: any) => {
        d.data[1].attributes[ATTR + "document"].kind = "spreadsheet";
      },
    ],
    [
      "mail in plaats van Office-document",
      (d: any) => {
        d.data[1].attributes[ATTR + "document"].kind = "email";
      },
    ],
    [
      "onbekende profielversie",
      (d: any) => {
        d.data[0].attributes[ATTR + "collection"].profileVersion = "9";
      },
    ],
    [
      "afwijkend schema",
      (d: any) => {
        d.schemas[ATTR + "payload"].value.dataType = "String";
      },
    ],
    [
      "externe import",
      (d: any) => {
        d.imports.push({ uri: "https://example.invalid/source.ifcx" });
      },
    ],
    [
      "overerving",
      (d: any) => {
        d.data[1].inherits = { bron: d.data[2].path };
      },
    ],
    [
      "dubbel knooppunt",
      (d: any) => {
        d.data.push(d.data[1]);
      },
    ],
    [
      "meerdere documenten",
      (d: any) => {
        d.data.push({ ...d.data[1], path: "/office/document/tweede" });
      },
    ],
    [
      "ontbrekende rootverwijzing",
      (d: any) => {
        d.data[0].children = {};
      },
    ],
    [
      "ander inhoudstype",
      (d: any) => {
        d.data[2].attributes[ATTR + "payload"].mediaType = "text/html";
      },
    ],
    [
      "pad in bronbestandsnaam",
      (d: any) => {
        d.data[2].attributes[ATTR + "payload"].fileName = "../Proef.docx";
      },
    ],
  ])("weigert %s vóór het openen", async (_naam, wijzig) => {
    const eerste = await begin();
    const dossier = decode(eerste.bytes);
    (wijzig as (d: unknown) => void)(dossier);
    await expect(
      bereidOpenen("Proef.ifcx", encode(dossier), hulp),
    ).rejects.toThrow();
  });

  it("weigert ongeldige UTF-8, JSON en een generiek IFCX zonder Office-profiel", async () => {
    for (const bytes of [
      new Uint8Array([0xff]),
      new TextEncoder().encode("{"),
      encode({ header: { ifcxVersion: "other" }, schemas: SCHEMAS }),
    ])
      await expect(openIfcx(bytes)).rejects.toThrow();
  });

  it("weigert onbekende getallen die bij opslag zouden worden afgerond", async () => {
    const eerste = await begin();
    const tekst = new TextDecoder()
      .decode(eerste.bytes)
      .replace('"header":', '"unknown":9007199254740993,"header":');
    await expect(openIfcx(new TextEncoder().encode(tekst))).rejects.toThrow();
  });
});
