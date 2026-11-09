import { afterEach, describe, expect, it } from "vitest";
import { bewaarAuteur, leesAuteur } from "./auteursprofiel";
import {
  bewaarInstellingen,
  leesBewaardeInstellingen,
  neemOver,
  standaardInstellingen,
  toonVoorbeeld,
} from "./instellingen";
import { auteurBijOpnemen } from "./tekst/editor";
import { auteur } from "./tekst/gedeeld/engine";

afterEach(() => {
  toonVoorbeeld(null);
  bewaarInstellingen(standaardInstellingen);
});

describe("auteursprofiel (#23)", () => {
  it("gebruikt alleen de bewaarde identiteit tijdens een voorbeeld en na annuleren", () => {
    bewaarInstellingen({
      ...standaardInstellingen,
      gebruiker: { naam: "Ada Lovelace", initialen: "AL" },
    });
    toonVoorbeeld({
      ...standaardInstellingen,
      gebruiker: { naam: "Grace Hopper", initialen: "GH" },
    });
    expect(leesAuteur()).toBe("Ada Lovelace");
    expect(auteur()).toBe("Ada Lovelace");
    expect(auteurBijOpnemen(true)?.name).toBe("Ada Lovelace");
    expect(auteurBijOpnemen(false)).toBeUndefined();
    toonVoorbeeld(null);
    expect(leesBewaardeInstellingen().gebruiker).toEqual({
      naam: "Ada Lovelace",
      initialen: "AL",
    });
  });

  it("neemt identiteit uit andere vensters over en behoudt initialen bij de opmerkingenauteur", () => {
    neemOver(
      JSON.stringify({
        ...standaardInstellingen,
        gebruiker: { naam: "Ada Lovelace", initialen: "AL" },
      }),
    );
    expect(auteur()).toBe("Ada Lovelace");
    bewaarAuteur("  Grace Hopper  ");
    expect(leesAuteur()).toBe("Grace Hopper");
    expect(leesBewaardeInstellingen().gebruiker.initialen).toBe("AL");
  });

  it("bewaart naam en initialen als gewone voorkeuren en herstelt beide", () => {
    const profiel = { naam: "Anne van Dijk", initialen: "AvD" };
    bewaarInstellingen({ ...standaardInstellingen, gebruiker: profiel });
    const json = JSON.stringify(leesBewaardeInstellingen());
    bewaarInstellingen(standaardInstellingen);
    neemOver(json);
    expect(leesBewaardeInstellingen().gebruiker).toEqual(profiel);
    bewaarInstellingen(standaardInstellingen);
    expect(leesAuteur()).toBe("");
    expect(leesBewaardeInstellingen().gebruiker.initialen).toBe("");
  });
});
