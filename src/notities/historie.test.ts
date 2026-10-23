import { describe, expect, it } from "vitest";
import { NotitieHistorie } from "./historie";
import { allePaginas, nieuweNotities, nieuwBlok, nieuwTekstvak } from "./model";

describe("Ongedaan maken in notities", () => {
  it("herstelt verwijderde tekstvakken met inhoud, positie en grootte", () => {
    const begin = nieuweNotities();
    allePaginas(begin)[0].pagina.vakken.push({
      ...nieuwTekstvak([nieuwBlok("Belangrijk idee")], 600, 300),
      breedte: 410,
      hoogte: 240,
    });
    const historie = new NotitieHistorie();
    historie.bewaar(begin);
    const zonder = structuredClone(begin);
    allePaginas(zonder)[0].pagina.vakken.pop();
    expect(historie.terug(zonder)).toEqual(begin);
    expect(historie.vooruit(begin)).toEqual(zonder);
  });
  it("groepeert typen maar houdt een verplaatsing als afzonderlijke stap", () => {
    const a = nieuweNotities(),
      b = structuredClone(a),
      c = structuredClone(a),
      d = structuredClone(a);
    allePaginas(b)[0].pagina.vakken[0].blokken[0].tekst = "Eerste woord";
    allePaginas(c)[0].pagina.vakken[0].blokken[0].tekst =
      "Eerste woord en meer tekst";
    Object.assign(allePaginas(d)[0].pagina.vakken[0], {
      ...allePaginas(c)[0].pagina.vakken[0],
      x: 440,
    });
    const historie = new NotitieHistorie();
    historie.bewaar(a, "tekst", 1000);
    historie.bewaar(b, "tekst", 1400);
    historie.bewaar(c, "plaats", 1500);
    expect(historie.terug(d)).toEqual(c);
    expect(historie.terug(c)).toEqual(a);
    expect(historie.vooruit(a)).toEqual(c);
    historie.bewaar(c, "nieuwe invoer", 4000);
    expect(historie.kanVooruit).toBe(false);
    historie.wis();
    expect(historie.kanTerug).toBe(false);
  });
});
