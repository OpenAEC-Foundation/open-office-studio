import { describe, expect, it } from "vitest";
import { formuleVerwijzingen, VERWIJZINGSKLEUREN } from "./rekenblad-verwijzingskleuren";

describe("verwijzingskleuren", () => {
  it("geeft herhalingen en absolute varianten dezelfde kleur en één rasterkader", () => {
    const { verwijzingen, markeringen } = formuleVerwijzingen("=A1+$A$1+A$1+$A1+B1+A1", "Blad 1");
    expect(verwijzingen.map((r) => r.kleur)).toEqual([0, 0, 0, 0, 1, 0].map((i) => VERWIJZINGSKLEUREN[i]));
    expect(markeringen).toEqual([
      { blad: null, bereik: { top: 0, left: 0, bottom: 0, right: 0 }, kleur: VERWIJZINGSKLEUREN[0] },
      { blad: null, bereik: { top: 0, left: 1, bottom: 0, right: 1 }, kleur: VERWIJZINGSKLEUREN[1] },
    ]);
    expect(verwijzingen.map((r) => r.tekst)).toEqual(["A1", "$A$1", "A$1", "$A1", "B1", "A1"]);
  });

  it("kleurt vierhonderd herhalingen gelijk zonder gestapelde rasterkaders", () => {
    const { verwijzingen, markeringen } = formuleVerwijzingen("=" + Array(400).fill("A1").join("+"), "Blad 1");
    expect(verwijzingen).toHaveLength(400);
    expect(new Set(verwijzingen.map((r) => r.kleur))).toEqual(new Set([VERWIJZINGSKLEUREN[0]]));
    expect(markeringen).toHaveLength(1);
  });

  it("herkent expliciete namen van het huidige blad ongeacht hoofdletters", () => {
    const { verwijzingen, markeringen } = formuleVerwijzingen("=A1+'BLAD 1'!$A$1+'Blad 2'!A1", "Blad 1");
    expect(verwijzingen.map((r) => r.kleur)).toEqual([0, 0, 1].map((i) => VERWIJZINGSKLEUREN[i]));
    expect(markeringen.map((r) => r.blad)).toEqual([null, "Blad 2"]);
  });

  it("behoudt de bladkwalificatie wanneer de expliciete verwijzing voorop staat", () => {
    const { markeringen } = formuleVerwijzingen("='Blad 1'!A1+A1", "Blad 1");
    expect(markeringen).toHaveLength(1);
    expect(markeringen[0].blad).toBe("Blad 1");
  });

  it("herkent aanhalingstekens in bladnamen zonder andere bladen samen te voegen", () => {
    const { verwijzingen, markeringen } = formuleVerwijzingen("='Blad ''een'!A1+'BLAD ''EEN'!A1+'Blad een'!A1", "Anders");
    expect(verwijzingen.map((r) => r.kleur)).toEqual([0, 0, 1].map((i) => VERWIJZINGSKLEUREN[i]));
    expect(markeringen.map((r) => r.blad)).toEqual(["Blad 'een", "Blad een"]);
  });

  it("normaliseert bereikrichting en losse cellen met een identiek bereik", () => {
    const { verwijzingen, markeringen } = formuleVerwijzingen("=SUM(A1:B2,B2:$A$1,A1:A1,A1,a1)", "Blad 1");
    expect(verwijzingen.map((r) => r.kleur)).toEqual([0, 0, 1, 1, 1].map((i) => VERWIJZINGSKLEUREN[i]));
    expect(markeringen).toHaveLength(2);
  });

  it("hergebruikt het palet pas na acht unieke bereiken", () => {
    const { verwijzingen, markeringen } = formuleVerwijzingen("=A1+A1+B1+C1+D1+E1+F1+G1+H1+I1", "Blad 1");
    expect(verwijzingen.map((r) => r.kleur)).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 7, 0].map((i) => VERWIJZINGSKLEUREN[i]));
    expect(markeringen).toHaveLength(9);
  });

  it("kleurt geen celachtige tekst of functienaam", () => {
    const { verwijzingen } = formuleVerwijzingen('="A1"&LOG10(B2)', "Blad 1");
    expect(verwijzingen.map((r) => r.tekst)).toEqual(["B2"]);
    expect(verwijzingen[0].kleur).toBe(VERWIJZINGSKLEUREN[0]);
  });
});
