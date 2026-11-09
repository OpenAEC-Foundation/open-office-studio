import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Pakket } from "../grafieken/pakket";
import { schrijfCelnotitie } from "../rekenblad/celnotities";
import { leesDiscussies, wijzigDiscussie } from "../rekenblad/discussies";
import {
  annotatiePaginas,
  leesAfdrukAnnotaties,
  tekenZichtbareAnnotatie,
} from "./celAnnotaties";
import {
  leesAfdrukInstellingen,
  schrijfAfdrukInstellingen,
  standaardBladInstellingen,
} from "./rekenbladInstellingen";
import { rekenbladPaginas } from "./bronRekenblad";

const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
function canvas() {
  const ctx = {
    save() {},
    restore() {},
    fillRect() {},
    strokeRect() {},
    setTransform() {},
    fillText() {},
    measureText(t: string) {
      return { width: [...t].length * 5 };
    },
  };
  return {
    getContext() {
      return ctx;
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
function metCanvas() {
  vi.stubGlobal("document", { createElement: () => canvas() });
}
describe("Spreadsheet comment printing (#71)", () => {
  it("round-trips all three standard cellComments choices and preserves printer attributes", () => {
    const p = new Pakket(bron);
    p.schrijf(
      "xl/worksheets/sheet1.xml",
      p
        .lees("xl/worksheets/sheet1.xml")
        .replace(
          "</worksheet>",
          '<pageSetup cellComments="atEnd" blackAndWhite="1"/></worksheet>',
        ),
    );
    let bytes = p.inpakken();
    expect(leesAfdrukInstellingen(bytes)[0].opmerkingen).toBe("atEnd");
    for (const opmerkingen of ["asDisplayed", "none", "atEnd"] as const) {
      bytes = schrijfAfdrukInstellingen(
        bytes,
        new Map([[0, { ...leesAfdrukInstellingen(bytes)[0], opmerkingen }]]),
      );
      expect(leesAfdrukInstellingen(bytes)[0].opmerkingen).toBe(opmerkingen);
      expect(new Pakket(bytes).lees("xl/worksheets/sheet1.xml")).toContain(
        'blackAndWhite="1"',
      );
    }
  });
  it("collects classic notes and complete threads without exposing tc= placeholders as notes", () => {
    let bytes = schrijfCelnotitie(bron, 0, "B2", {
      tekst: "Classic",
      auteur: "Note author",
      zichtbaar: true,
    });
    bytes = wijzigDiscussie(bytes, 0, {
      soort: "nieuw",
      cel: "C3",
      auteur: "Question author",
      tekst: "Question",
    });
    const id = leesDiscussies(bytes)[0][0].id;
    bytes = wijzigDiscussie(bytes, 0, {
      soort: "antwoord",
      id,
      auteur: "Reply author",
      tekst: "Answer",
    });
    bytes = wijzigDiscussie(bytes, 0, {
      soort: "oplossen",
      id,
      opgelost: true,
    });
    const lijst = leesAfdrukAnnotaties(bytes)[0];
    expect(lijst).toHaveLength(2);
    expect(lijst[0].zichtbaar).toBe(true);
    expect(lijst[1].zichtbaar).toBe(false);
    expect(lijst[1].regels.map((r) => r.tekst).join("\n")).toMatch(
      /Question author[\s\S]*Question[\s\S]*Reply author[\s\S]*Answer/,
    );
    expect(lijst[1].regels[0].tekst).toBe("Opgelost");
  });
  it("paginates long comments and includes every message line in the PDF text layer within margins", async () => {
    metCanvas();
    const inst = standaardBladInstellingen();
    const inhoud = Array.from({ length: 180 }, (_, i) => `Line ${i} café 😀`);
    const paginas = annotatiePaginas("Sheet", inst, [
      {
        cel: "B2",
        zichtbaar: false,
        regels: [{ tekst: "Anna", vet: true }, { tekst: inhoud.join("\n") }],
      },
    ]);
    expect(paginas.length).toBeGreaterThan(2);
    const tekeningen = await Promise.all(paginas.map((p) => p.teken(144)));
    const tekst = tekeningen
      .flatMap((t) => t.tekst)
      .map((t) => t.tekst)
      .join("\n");
    for (const regel of inhoud) expect(tekst).toContain(regel);
    for (const t of tekeningen)
      for (const r of t.tekst) {
        expect(r.x).toBeGreaterThanOrEqual(inst.marges.links * 72);
        expect(r.y).toBeLessThanOrEqual(
          paginas[0].hoogte - inst.marges.voet * 72,
        );
      }
    const lang = annotatiePaginas("Sheet", inst, [
      { cel: "A1", zichtbaar: true, regels: [{ tekst: "😀".repeat(500) }] },
    ]);
    const regels = (await lang[0].teken(72)).tekst.filter((r) =>
      r.tekst.includes("😀"),
    );
    expect(regels.map((r) => r.tekst).join("")).toBe("😀".repeat(500));
    expect(
      regels.every(
        (r) =>
          r.breedte <=
          lang[0].breedte - (inst.marges.links + inst.marges.rechts) * 72,
      ),
    ).toBe(true);
  });
  it("prints notes in otherwise empty cells and respects a selected range", async () => {
    metCanvas();
    let bytes = schrijfCelnotitie(bron, 0, "B2", {
      tekst: "Included",
      auteur: "Anna",
      zichtbaar: false,
    });
    bytes = schrijfCelnotitie(bytes, 0, "D5", {
      tekst: "Excluded",
      auteur: "Anna",
      zichtbaar: true,
    });
    const h = openWorkbook(bytes);
    try {
      const inst = {
        ...standaardBladInstellingen(),
        opmerkingen: "atEnd" as const,
      };
      const ctx = {
        api: { handle: h } as XlsxEditorApi,
        bytes,
        titel: "Test",
        bestandsnaam: "Test.xlsx",
        selectie: { blad: 0, bereik: { rij1: 1, rij2: 1, kol1: 1, kol2: 1 } },
      };
      const doc = await rekenbladPaginas(ctx, {
        omvang: "blad",
        instellingen: [inst],
        negeerAfdrukbereik: false,
      });
      expect(doc.paginas).toHaveLength(1);
      const t = (await doc.paginas[0].teken(72)).tekst
        .map((r) => r.tekst)
        .join();
      expect(t).toContain("Included");
      expect(t).toContain("Excluded");
      const selectie = await rekenbladPaginas(ctx, {
        omvang: "selectie",
        instellingen: [inst],
        negeerAfdrukbereik: false,
      });
      const laatste = (await selectie.paginas.at(-1)!.teken(72)).tekst
        .map((r) => r.tekst)
        .join();
      expect(laatste).toContain("Included");
      expect(laatste).not.toContain("Excluded");
    } finally {
      h.dispose();
    }
  });
  it("renders visible text only, inside the printable rectangle", () => {
    metCanvas();
    const c = canvas().getContext() as unknown as CanvasRenderingContext2D;
    const t = tekenZichtbareAnnotatie(
      c,
      {
        cel: "A1",
        zichtbaar: true,
        regels: [
          { tekst: "Anna", vet: true },
          { tekst: "A very long note ".repeat(100) },
        ],
      },
      490,
      100,
      { links: 50, boven: 50, rechts: 500, onder: 250 },
    );
    expect(t[0].tekst).toBe("Anna");
    expect(t.length).toBeLessThan(20);
    expect(
      t.every((r) => r.x >= 50 && r.x + r.breedte <= 500 && r.y <= 250),
    ).toBe(true);
  });
});
