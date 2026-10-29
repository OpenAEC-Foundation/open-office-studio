import { afterEach, describe, expect, it } from "vitest";
import { zetTaal } from "../../../src/i18n/config";
import { backendTekst, foutTekst } from "./fouten";
import { korteDatum } from "./ui/Berichtenlijst";
import { bouwAntwoord } from "./citaat";
import type { Bericht } from "./contract";

afterEach(async () => {
  await zetTaal("nl");
});

const bericht: Bericht = {
  map: "INBOX",
  uid: 1,
  onderwerp: "Planning",
  van: [{ naam: "Linda", adres: "linda@x.nl" }],
  aan: [{ naam: "", adres: "ik@x.nl" }],
  cc: [],
  antwoordAan: [],
  datum: "2026-03-05T09:30:00Z",
  gelezen: true,
  gemarkeerd: false,
  beantwoord: false,
  heeftBijlagen: false,
  grootte: 10,
  tekst: "Dinsdag past.",
  html: "",
  bijlagen: [],
} as unknown as Bericht;

describe("e-mail meertalig", () => {
  it("foutmeldingen volgen de taal, met de servermelding erbij", async () => {
    expect(foutTekst({ code: "aanmelding", melding: "535" }, "Verzenden mislukt")).toBe(
      "Verzenden mislukt: Aanmelden mislukt. Controleer gebruikersnaam en wachtwoord (Extra › Accountinstellingen). (535)",
    );
    await zetTaal("en");
    expect(foutTekst({ code: "tijdslimiet", melding: "" })).toBe("The server did not respond in time. Please try again later.");
  });

  it("backendteksten met sleutel worden vertaald, zonder sleutel blijft de melding", async () => {
    expect(backendTekst({ melding: "Ruwe servertekst" })).toBe("Ruwe servertekst");
    expect(backendTekst({ melding: "x", sleutel: "bestaat.niet" })).toBe("x");
  });

  it("datums in de berichtenlijst volgen de taal", async () => {
    const nu = new Date("2026-10-28T12:00:00");
    const oud = "2025-03-05T09:30:00";
    const nl = korteDatum(oud, "nl", nu);
    expect(nl).toMatch(/2025/);
    expect(korteDatum(oud, "en", nu)).not.toBe(nl);
    expect(korteDatum(oud, "de", nu)).toMatch(/5\. März 2025|05\.03\.2025|5\. Mär/);
  });

  it("citaatkop in het Engels", async () => {
    await zetTaal("en");
    const a = bouwAntwoord(bericht, "antwoord", ["ik@x.nl"]);
    expect(a.tekst).toMatch(/wrote:\n> Dinsdag past\.$/);
    const d = bouwAntwoord(bericht, "doorsturen", []);
    expect(d.tekst).toContain("-------- Forwarded Message --------");
    expect(d.tekst).toContain("Subject: Planning");
  });
});
