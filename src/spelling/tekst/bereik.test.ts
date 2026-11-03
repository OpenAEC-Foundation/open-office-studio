import { describe, expect, it } from "vitest";
import type { Controleur } from "../controleur";
import { SpellingSessie, type Alinea } from "./sessie";
import { foutenInBereik } from "./bereik";

function proef(aantal = 500) {
  const sessie = new SpellingSessie(
    () => null,
    () => ({}) as Controleur,
  );
  sessie.alineas = Array.from(
    { length: aantal },
    (_, i): Alinea => ({
      paraId: String(i),
      story: "body",
      tekst: "xxyzz ".repeat(100),
      taal: "nl",
      fouten: Array.from({ length: 100 }, (_, j) => ({
        tekst: "xxyzz",
        start: j * 6,
        eind: j * 6 + 5,
        taal: "nl",
        punt: false,
      })),
    }),
  );
  let oproepen = 0;
  const editor = {
    yrsLocToDisplayPosition: ({
      paraId,
      offset,
    }: {
      story: string;
      paraId: string;
      offset: number;
    }): number | null => {
      oproepen++;
      return Number(paraId) * 1000 + offset;
    },
  };
  return {
    sessie,
    editor,
    get oproepen() {
      return oproepen;
    },
  };
}

describe("spellingposities van bijna zichtbare alinea’s", () => {
  it("behoudt alle zichtbare fouten zonder elk woord van 500 pagina’s om te rekenen", () => {
    const p = proef(),
      fouten = foutenInBereik(p.sessie, p.editor, [499000, 499600]);
    expect(fouten).toHaveLength(100);
    expect(fouten.every((f) => f.alinea.paraId === "499")).toBe(true);
    expect(fouten[0].van).toBe(499000);
    expect(fouten.at(-1)?.tot).toBe(499599);
    expect(p.oproepen).toBeLessThan(1500);
  });
  it("behoudt woorden over een grens en een alinea die meerdere pagina’s beslaat", () => {
    const p = proef(3);
    expect(
      foutenInBereik(p.sessie, p.editor, [1102, 1110]).map((x) => [
        x.van,
        x.tot,
      ]),
    ).toEqual([
      [1102, 1107],
      [1108, 1113],
    ]);
    expect(
      foutenInBereik(p.sessie, p.editor, [1107, 1107]).map((x) => x.van),
    ).toEqual([1102]);
  });
  it("blijft alle fouten leveren als de paginagrenzen nog onbekend zijn", () => {
    const p = proef(2);
    expect(foutenInBereik(p.sessie, p.editor, null)).toHaveLength(200);
  });
  it("blijft per woord controleren wanneer de alineagrens ontbreekt", () => {
    const p = proef(1),
      origineel = p.editor.yrsLocToDisplayPosition;
    p.editor.yrsLocToDisplayPosition = (plek) =>
      plek.offset === 600 ? null : origineel(plek);
    expect(foutenInBereik(p.sessie, p.editor, [0, 600])).toHaveLength(100);
  });
  it("rekent ook de alineagrens om bij bijgehouden verwijderingen", () => {
    const p = proef(1);
    p.sessie.rauw = (_alinea, offset) => offset + 5;
    const uit = foutenInBereik(p.sessie, p.editor, [602, 603]);
    expect(uit.map((x) => [x.van, x.tot])).toEqual([[599, 604]]);
  });
  it("verandert het volledige foutenoverzicht niet door de overlay te begrenzen", () => {
    const p = proef(2);
    expect(foutenInBereik(p.sessie, p.editor, [1000, 1600])).toHaveLength(100);
    expect(p.sessie.zichtbareFouten()).toHaveLength(200);
  });
  it("laat een onbeschikbare alineagrens via de bestaande woordroute terugvallen", () => {
    const p = proef(1),
      origineel = p.editor.yrsLocToDisplayPosition;
    p.editor.yrsLocToDisplayPosition = (plek) => {
      if (plek.offset === 600) throw new Error("Indeling nog niet klaar");
      return origineel(plek);
    };
    expect(foutenInBereik(p.sessie, p.editor, [0, 600])).toHaveLength(100);
  });
});
