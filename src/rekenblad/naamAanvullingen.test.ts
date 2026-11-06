import { describe, expect, it } from "vitest";
import { aangevuldeFormule, formuleAanvullingen } from "./naamAanvullingen";
import { woordBijCursor } from "../lint/rekenblad-functies";
import type { Bereiknaam } from "./namen";
const naam = (
  naam: string,
  verwijzing: string,
  blad: number | null = null,
  verborgen = false,
): Bereiknaam => ({ naam, verwijzing, blad, verborgen });

describe("naamdefinities in formulevoorstellen", () => {
  it("biedt bereiken, constanten en formules aan met de lokale voorrang", () => {
    const namen = [
      naam("Gedeeld", "A1"),
      naam("Gedeeld", "2", 0),
      naam("Geheel", "SUM(A1:A2)"),
      naam("Geheim", "9", 1),
    ];
    expect(formuleAanvullingen("ge", namen, 0)).toContainEqual({
      soort: "naam",
      naam: "Gedeeld",
      verwijzing: "2",
    });
    expect(
      formuleAanvullingen("ge", namen, 0).some((n) => n.naam === "Geheim"),
    ).toBe(false);
    expect(formuleAanvullingen("ge", namen, 1)).toContainEqual({
      soort: "naam",
      naam: "Gedeeld",
      verwijzing: "A1",
    });
  });
  it("valt niet terug op een globale naam bij een verborgen lokale definitie", () => {
    expect(
      formuleAanvullingen(
        "Factor",
        [naam("Factor", "1"), naam("Factor", "2", 0, true)],
        0,
      ),
    ).toEqual([]);
  });
  it("biedt een gelijknamige functie en naam afzonderlijk aan", () => {
    const lijst = formuleAanvullingen("sum", [naam("SUM", "42")], 0);
    expect(lijst.slice(0, 2).map((n) => n.soort)).toEqual(["naam", "functie"]);
    expect(aangevuldeFormule("=su+2", 1, 3, lijst[0])).toEqual({
      tekst: "=SUM+2",
      cursor: 4,
    });
    expect(aangevuldeFormule("=su+2", 1, 3, lijst[1])).toEqual({
      tekst: "=SUM(+2",
      cursor: 5,
    });
  });
  it("laat exacte namen ook bij veel functievoorstellen vooraan staan", () => {
    expect(
      formuleAanvullingen("C", [naam("Cijfers", "42"), naam("C", "10")], 0)[0]
        .naam,
    ).toBe("C");
    expect(formuleAanvullingen("", [], 0)).toEqual([]);
  });
  it("herkent niet-ASCII-namen maar geen woorden in tekst of na een bladverwijzing", () => {
    expect(woordBijCursor("=Öm", 3)).toEqual({ begin: 1, woord: "Öm" });
    expect(woordBijCursor("=名前", 3)).toEqual({ begin: 1, woord: "名前" });
    expect(woordBijCursor('="Öm', 4)).toBeNull();
    expect(woordBijCursor("='Blad'!Naam", 12)).toBeNull();
    expect(woordBijCursor("=Ömzet", 3)).toBeNull();
  });
});
