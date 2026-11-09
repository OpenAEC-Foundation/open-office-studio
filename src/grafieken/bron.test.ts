import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { bronUitModel, ontleedVerwijzing } from "./bron";
import { standaardModel } from "./model";
import {
  bewerkGrafiek,
  bladnamen,
  leesGrafiek,
  voegGrafiekToeXlsx,
} from "./documenten";

function kolommen() {
  return standaardModel({
    categorieen: ["Jan", "Feb"],
    categorieenRef: "DATA!$A$2:$A$3",
    reeksen: [
      {
        naam: "Omzet",
        naamRef: "data!$B$1",
        waarden: [10, 20],
        waardenRef: "Data!$B$2:$B$3",
      },
      {
        naam: "Kosten",
        naamRef: "DATA!$C$1",
        waarden: [4, 8],
        waardenRef: "data!$C$2:$C$3",
      },
    ],
  });
}

function rijen() {
  return standaardModel({
    categorieen: ["Jan", "Feb"],
    categorieenRef: "Data!$B$1:$C$1",
    reeksen: [
      {
        naam: "Omzet",
        naamRef: "Data!$A$2",
        waarden: [10, 20],
        waardenRef: "Data!$B$2:$C$2",
      },
      {
        naam: "Kosten",
        naamRef: "Data!$A$3",
        waarden: [4, 8],
        waardenRef: "Data!$B$3:$C$3",
      },
    ],
  });
}

describe("bronbereik van geïmporteerde grafieken (#66)", () => {
  it("herkent dezelfde bladnaam met verschillende hoofdletters", () => {
    expect(bronUitModel(kolommen())).toEqual({
      blad: "Data",
      bereik: { top: 0, left: 0, bottom: 2, right: 2 },
      reeksenIn: "kolommen",
      koprij: true,
      kopkolom: true,
    });
  });

  it("behoudt rijreeksen bij geciteerde bladnamen met apostroffen", () => {
    const model = rijen();
    model.categorieenRef = "'JAN''S DATA'!$B$1:$C$1";
    model.reeksen = model.reeksen.map((reeks, i) => ({
      ...reeks,
      naamRef: reeks.naamRef!.replace("Data", "'Jan''s Data'"),
      waardenRef: reeks.waardenRef!.replace(
        "Data",
        i ? "'jan''s data'" : "'Jan''s Data'",
      ),
    }));
    expect(bronUitModel(model)).toEqual({
      blad: "Jan's Data",
      bereik: { top: 0, left: 0, bottom: 2, right: 2 },
      reeksenIn: "rijen",
      koprij: true,
      kopkolom: true,
    });
  });

  it("weigert een naamverwijzing over meerdere kolommen", () => {
    const model = kolommen();
    model.categorieenRef = "Data!$A$2:$A$3";
    model.reeksen.forEach((reeks) => {
      reeks.naamRef = reeks.naamRef!.replace(/data/gi, "Data");
      reeks.waardenRef = reeks.waardenRef!.replace(/data/gi, "Data");
    });
    model.reeksen[0].naamRef = "Data!$B$1:$C$1";
    expect(bronUitModel(model)).toBeNull();
  });

  it("weigert een naamverwijzing over meerdere rijen", () => {
    const model = rijen();
    model.reeksen[0].naamRef = "Data!$A$2:$A$3";
    expect(bronUitModel(model)).toBeNull();
  });

  it.each(["GedefinieerdeNaam", "#REF!", "Data!$A$0"])(
    "laat een aanwezige, niet-reconstrueerbare categorieverwijzing niet weg: %s",
    (ref) => {
      const model = rijen();
      model.categorieenRef = ref;
      expect(bronUitModel(model)).toBeNull();
    },
  );

  it("laat aanwezige niet-reconstrueerbare reeksnamen niet weg", () => {
    const model = rijen();
    model.reeksen.forEach((reeks) => {
      reeks.naamRef = "GedefinieerdeNaam";
    });
    expect(bronUitModel(model)).toBeNull();
  });

  it("blijft werkelijke verwijzingen naar verschillende bladen weigeren", () => {
    const model = rijen();
    model.reeksen[1].waardenRef = "Ander!$B$3:$C$3";
    expect(bronUitModel(model)).toBeNull();
  });

  it("blijft reeksen zonder naam- of categorieverwijzingen herkennen", () => {
    const model = rijen();
    delete model.categorieenRef;
    model.reeksen.forEach((reeks) => {
      delete reeks.naamRef;
    });
    expect(bronUitModel(model)).toEqual({
      blad: "Data",
      bereik: { top: 1, left: 1, bottom: 2, right: 2 },
      reeksenIn: "rijen",
      koprij: false,
      kopkolom: false,
    });
  });

  it("behoudt bronverwijzingen en werkbladen na XLSX openen, titel wijzigen en opslaan", () => {
    const bytes = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
    const naam = bladnamen(bytes)[0];
    const model = kolommen();
    const citeer = (s: string) => `'${s.replace(/'/g, "''")}'`;
    model.categorieenRef = `${citeer(naam.toUpperCase())}!$A$2:$A$3`;
    model.reeksen.forEach((reeks, i) => {
      const kolom = i ? "C" : "B";
      reeks.naamRef = `${citeer(naam.toLowerCase())}!$${kolom}$1`;
      reeks.waardenRef = `${citeer(naam)}!$${kolom}$2:$${kolom}$3`;
    });
    const ingevoegd = voegGrafiekToeXlsx(bytes, model, {
      blad: 0,
      col: 4,
      row: 1,
      kolommen: 8,
      rijen: 12,
    });
    const gelezen = leesGrafiek(ingevoegd.bytes, ingevoegd.chartPad);
    expect(gelezen.bewerkbaar).toBe(true);
    expect(bronUitModel(gelezen.model)).toMatchObject({
      blad: naam,
      bereik: { top: 0, left: 0, bottom: 2, right: 2 },
    });
    const gewijzigd = bewerkGrafiek(
      ingevoegd.bytes,
      "xlsx",
      ingevoegd.chartPad,
      { ...gelezen.model, titel: "Nieuwe titel" },
    );
    const opnieuw = leesGrafiek(gewijzigd, ingevoegd.chartPad);
    expect(opnieuw.model.titel).toBe("Nieuwe titel");
    expect(opnieuw.model.categorieenRef).toBe(model.categorieenRef);
    expect(opnieuw.model.reeksen.map((r) => [r.naamRef, r.waardenRef])).toEqual(
      model.reeksen.map((r) => [r.naamRef, r.waardenRef]),
    );
    const voor = unzipSync(ingevoegd.bytes),
      na = unzipSync(gewijzigd);
    for (const pad of Object.keys(voor).filter((p) =>
      p.startsWith("xl/worksheets/"),
    ))
      expect(na[pad]).toEqual(voor[pad]);
  });
});

describe("grenzen van grafiekverwijzingen", () => {
  it.each([
    "Data!A0",
    "Data!A1:A0",
    "Data!A1048577",
    "Data!XFE1",
    "Data!ZZZ9999999",
  ])("weigert %s", (ref) => {
    expect(ontleedVerwijzing(ref)).toBeNull();
  });
  it("accepteert de laatste geldige cel en normaliseert een omgekeerd bereik", () => {
    expect(ontleedVerwijzing("Data!$XFD$1048576")).toMatchObject({
      bereik: { top: 1048575, left: 16383, bottom: 1048575, right: 16383 },
    });
    expect(ontleedVerwijzing("Data!$C$3:$A$1")).toMatchObject({
      bereik: { top: 0, left: 0, bottom: 2, right: 2 },
    });
  });
});
