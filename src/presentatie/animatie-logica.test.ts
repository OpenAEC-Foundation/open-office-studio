import { describe, expect, it } from "vitest";
import { animatieGroepen, nieuweAnimatie } from "./animaties";
import { animatieStaat, groepEinden, voorbeeldTijden } from "./animatie-logica";

describe("animatietijdlijn", () => {
  it("vermindert beweging zonder de wachttijd of klikvolgorde te vervroegen", () => {
    const plan = animatieGroepen([{ ...nieuweAnimatie(2), vertraging: 100 }]);
    const tijden = new Map([[0, 0]]);
    expect(animatieStaat(plan, tijden, 99, true).alpha).toBe(0);
    expect(animatieStaat(plan, tijden, 100, true).alpha).toBe(1);
    expect(animatieStaat(plan, tijden, 350, false).alpha).toBe(0.5);
  });
  it("houdt een ingang verborgen tot zijn eigen klikgroep start", () => {
    const a = nieuweAnimatie(2),
      b = { ...nieuweAnimatie(3), id: "b" };
    const plan = animatieGroepen([a, b]),
      tijden = new Map([[0, 1000]]);
    expect(animatieStaat([plan[1]], tijden, 1250).alpha).toBe(0);
    tijden.set(1, 2000);
    expect(animatieStaat([plan[1]], tijden, 2250).alpha).toBe(0.5);
    expect(animatieStaat([plan[1]], tijden, 2500).alpha).toBe(1);
  });
  it("past vertraging, uitgang, draaiing en verplaatsing cumulatief toe", () => {
    const a = nieuweAnimatie(2);
    const plan = animatieGroepen([
      { ...a, effect: "move", start: "with", dx: 0.4, dy: -0.2, duur: 1000 },
      { ...a, id: "b", effect: "spin", start: "with", hoek: 180, duur: 1000 },
      {
        ...a,
        id: "c",
        effect: "fadeOut",
        start: "after",
        vertraging: 200,
        duur: 500,
      },
    ]);
    const tijden = new Map([[-1, 0]]);
    expect(animatieStaat(plan, tijden, 500)).toEqual({
      alpha: 1,
      dx: 0.2,
      dy: -0.1,
      hoek: 90,
    });
    expect(animatieStaat(plan, tijden, 1450)).toEqual({
      alpha: 0.5,
      dx: 0.4,
      dy: -0.2,
      hoek: 180,
    });
    expect(animatieStaat(plan, tijden, 1700).alpha).toBe(0);
  });
  it("maakt een eindig voorbeeld met een eigen starttijd voor elke klikgroep", () => {
    const a = nieuweAnimatie(2),
      lijst = [
        { ...a, start: "with" as const },
        { ...a, id: "b" },
        { ...a, id: "c", start: "after" as const },
      ];
    expect([...groepEinden(lijst)]).toEqual([
      [-1, 500],
      [0, 1000],
    ]);
    expect(voorbeeldTijden(lijst, 100)).toEqual({
      tijden: new Map([
        [-1, 100],
        [0, 780],
      ]),
      eind: 1960,
    });
  });
});
