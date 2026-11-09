import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { autocorrectie, isZinsbegin } from "./autocorrectie";
import { Controleur, schoonSuggesties, volgHoofdletters } from "./controleur";
import { DirecteMotor, type Motor } from "./motor";
import { Spellbook } from "./spellbook";
import { standaardTaal, taalUitCode } from "./talen";
import { isHoofdletterwoord, splitsWoorden, varianten } from "./woorden";
import { Woordenlijst } from "./woordenlijst";

const woorden = (tekst: string, opties = {}) => splitsWoorden(tekst, opties).map((w) => w.tekst);

describe("woordsplitsing", () => {
  it("houdt samenstellingen en koppeltekens bij elkaar", () => {
    expect(woorden("De fietsenstallingscapaciteit en de e-mail.")).toEqual([
      "De",
      "fietsenstallingscapaciteit",
      "en",
      "de",
      "e-mail",
    ]);
    expect(woorden("maag-darmkanaal")).toEqual(["maag-darmkanaal"]);
  });

  it("kent apostrofs: auto's, 's avonds, don't en de typografische ’", () => {
    expect(woorden("Auto's rijden 's avonds; don't panic, foto’s")).toEqual([
      "Auto's",
      "rijden",
      "'s",
      "avonds",
      "don't",
      "panic",
      "foto’s",
    ]);
    // Een citaat-apostrof hoort er niet bij.
    expect(woorden("'huis'")).toEqual(["huis"]);
  });

  it("geeft UTF-16-offsets zoals de engine ze telt", () => {
    const [eerste, tweede] = splitsWoorden("ideeën café");
    expect(eerste).toMatchObject({ tekst: "ideeën", start: 0, eind: 6 });
    expect(tweede).toMatchObject({ start: 7, eind: 11 });
  });

  it("slaat getallen, cijferwoorden en hoofdletterwoorden over (instelbaar)", () => {
    expect(woorden("In 2026 kost A4-papier 3,50 euro bij NEN en BTW")).toEqual([
      "In",
      "kost",
      "euro",
      "bij",
      "en",
    ]);
    expect(woorden("A4 NEN", { cijferwoordenNegeren: false, hoofdletterwoordenNegeren: false })).toEqual([
      "A4",
      "NEN",
    ]);
    expect(isHoofdletterwoord("NEN")).toBe(true);
    expect(isHoofdletterwoord("Nen")).toBe(false);
    expect(isHoofdletterwoord("A")).toBe(false);
  });

  it("slaat URL's, e-mailadressen en paden over", () => {
    expect(
      woorden("Zie https://open-aec.com/docs?a=b, www.voorbeeld.nl of mail info@open-aec.com en C:\\Users\\jan\\tekst."),
    ).toEqual(["Zie", "of", "mail", "en"]);
  });

  it("onthoudt een afsluitende punt voor afkortingen", () => {
    const [w] = splitsWoorden("bijv. dit");
    expect(w.punt).toBe(true);
    expect(varianten(w)).toEqual([["bijv"], ["bijv."]]);
    expect(varianten(splitsWoorden("noord-zuid")[0])).toEqual([["noord-zuid"], ["noord", "zuid"]]);
    expect(varianten(splitsWoorden("foto’s")[0])).toEqual([["foto's"]]);
  });
});

describe("talen", () => {
  it("koppelt w:lang-codes aan woordenboeken", () => {
    expect(taalUitCode("nl-NL")).toBe("nl");
    expect(taalUitCode("nl-BE")).toBe("nl");
    expect(taalUitCode("en-US")).toBe("en-US");
    expect(taalUitCode("en-GB")).toBe("en-GB");
    expect(taalUitCode("en-AU")).toBe("en-GB");
    expect(taalUitCode("de-DE")).toBe("geen");
    expect(taalUitCode("")).toBeNull();
    expect(standaardTaal(["de-DE", "en-US"])).toBe("en-US");
    expect(standaardTaal([])).toBe("nl");
  });
});

describe("woordenlijsten", () => {
  it("bewaart toegevoegde woorden en kent het zinsbegin", () => {
    const opgeslagen: string[][] = [];
    const lijst = new Woordenlijst({ lees: () => ["OpenAEC"], bewaar: (w) => opgeslagen.push(w) });
    expect(lijst.bevat("OpenAEC")).toBe(true);
    expect(lijst.bevat("openaec")).toBe(false);
    lijst.voegToe("bimmodel");
    expect(lijst.bevat("bimmodel")).toBe(true);
    expect(lijst.bevat("Bimmodel")).toBe(true); // zinsbegin
    expect(lijst.bevat("BIMMODEL")).toBe(false);
    expect(opgeslagen.at(-1)).toEqual(["bimmodel", "OpenAEC"]);
    let gemeld = 0;
    lijst.volg(() => gemeld++);
    lijst.voegToe("bimmodel"); // al aanwezig: geen melding
    lijst.verwijder("bimmodel");
    expect(gemeld).toBe(1);
    expect(lijst.bevat("bimmodel")).toBe(false);
  });

  it("normaliseert de typografische apostrof", () => {
    const lijst = new Woordenlijst();
    lijst.voegToe("CAD’s");
    expect(lijst.bevat("CAD's")).toBe(true);
  });
});

describe("suggesties opschonen", () => {
  it("volgt hoofdletters en laat splitsingen met een losse letter weg", () => {
    expect(volgHoofdletters("Huiz", "huis")).toBe("Huis");
    expect(volgHoofdletters("HUIZ", "huis")).toBe("HUIS");
    expect(volgHoofdletters("huiz", "Honig")).toBe("Honig");
    expect(
      schoonSuggesties("Gemeenteraadd", ["gemeenteraad", "gemeentedraad", "gemeenteraad d", "gemeenteraad"]),
    ).toEqual(["Gemeenteraad", "Gemeentedraad"]);
    expect(schoonSuggesties("x", ["a", "b", "c", "d", "e", "f", "g"]).length).toBe(5);
  });
});

/** Een nepmotor die bijhoudt wat er gevraagd wordt. */
function nepMotor(bekend: Set<string>) {
  const gevraagd: string[][] = [];
  const motor: Motor = {
    async controleer(_taal, lijst) {
      gevraagd.push([...lijst]);
      return lijst.map((w) => bekend.has(w));
    },
    async suggesties() {
      return ["huis", "huize"];
    },
    async bereidVoor() {},
  };
  return { motor, gevraagd };
}

describe("controleur", () => {
  it("controleert per taal, gebruikt de cache en de eigen woordenlijsten", async () => {
    const { motor, gevraagd } = nepMotor(new Set(["De", "huis", "is", "groot", "bijv.", "noord", "zuid"]));
    const persoonlijk = new Woordenlijst();
    const genegeerd = new Woordenlijst();
    const c = new Controleur(motor, { persoonlijk, genegeerd });
    const [nl, en, geen] = await c.controleer([
      { tekst: "De huiz is groot, bijv. noord-zuid.", taal: "nl" },
      { tekst: "The house", taal: "en-GB" },
      { tekst: "Das Haus", taal: "geen" },
    ]);
    expect(nl.map((f) => f.tekst)).toEqual(["huiz"]);
    expect(nl[0]).toMatchObject({ start: 3, eind: 7, taal: "nl" });
    expect(en.map((f) => f.tekst)).toEqual(["The", "house"]);
    expect(geen).toEqual([]);
    expect(gevraagd.length).toBe(2);
    // Tweede keer: alles uit de cache.
    await c.controleer([{ tekst: "De huiz is groot", taal: "nl" }]);
    expect(gevraagd.length).toBe(2);
    expect(c.uitCache(splitsWoorden("huiz")[0], "nl")).toBe(false);
    expect(c.uitCache(splitsWoorden("onbekend")[0], "nl")).toBeNull();
    persoonlijk.voegToe("huiz");
    const [opnieuw] = await c.controleer([{ tekst: "De huiz is groot", taal: "nl" }]);
    expect(opnieuw).toEqual([]);
    expect(await c.suggesties("Huiz", "nl")).toEqual(["Huis", "Huize"]);
  });
});

describe("autocorrectie", () => {
  const nl = { taal: "nl" as const };
  const en = { taal: "en-GB" as const };
  const pas = (tekst: string, opties: Parameters<typeof autocorrectie>[2] = nl) => {
    const c = autocorrectie(tekst, tekst.length, opties);
    return c ? tekst.slice(0, c.start) + c.nieuw + tekst.slice(c.eind) : tekst;
  };

  it("herstelt TWee HOofdletters, maar niet IJsland of afkortingen", () => {
    expect(pas("Dit is een TWee ")).toBe("Dit is een Twee ");
    expect(pas("Wij gaan naar IJsland ")).toBe("Wij gaan naar IJsland ");
    expect(pas("Volgens de NEN ")).toBe("Volgens de NEN ");
    expect(pas("een PDFje ")).toBe("een PDFje ");
  });

  it("geeft het eerste woord van een zin een hoofdletter", () => {
    expect(pas("dit ")).toBe("Dit ");
    expect(pas("Klaar. daarna ")).toBe("Klaar. Daarna ");
    expect(pas("Echt? ja,")).toBe("Echt? Ja,");
    expect(pas("Zie bijv. de ")).toBe("Zie bijv. de ");
    expect(pas("Dit is o.a. een ")).toBe("Dit is o.a. een ");
    expect(pas("Door J. de ")).toBe("Door J. de ");
    expect(pas("Midden in de zin ")).toBe("Midden in de zin ");
    expect(pas("iPhone ")).toBe("iPhone ");
    expect(isZinsbegin("Klaar. Nu", 7)).toBe(true);
  });

  it("verbetert typefouten uit de lijst van de taal", () => {
    expect(pas("Het is eigelijk ")).toBe("Het is eigenlijk ");
    expect(pas("van https://open-aec.com. dit is eigelijk ")).toBe("van https://open-aec.com. dit is eigenlijk ");
    expect(pas("Het is eigelijk ", en)).toBe("Het is eigelijk ");
    expect(pas("I saw teh ", en)).toBe("I saw the ");
    expect(pas("teh ", en)).toBe("The ");
    expect(pas("Then i ", en)).toBe("Then I ");
    expect(pas("We dont ", en)).toBe("We don't ");
  });

  it.each([
    ["DIT IS EIGELIJK ", "DIT IS EIGENLIJK ", "nl"],
    ["GEINTERESSEERD ", "GEÏNTERESSEERD ", "nl"],
    ["Ik ga NOGSTEEDS ", "Ik ga NOG STEEDS ", "nl"],
    ["Dit gaat DMV ", "Dit gaat D.M.V. ", "nl"],
    ["TEH ", "THE ", "en-GB"],
    ["WE DONT ", "WE DON'T ", "en-GB"],
    ["IM ", "I'M ", "en-US"],
    ["We RECIEVE!", "We RECEIVE!", "en-US"],
  ] as const)("behoudt volledige hoofdletters bij typefout %s", (tekst, verwacht, taal) => {
    expect(pas(tekst, { taal })).toBe(verwacht);
  });

  it("laat URL's, getallen, woorden uit de woordenlijst en woorden met apostrof met rust", () => {
    expect(pas("www.voorbeeld.nl/teh ", en)).toBe("www.voorbeeld.nl/teh ");
    expect(pas("info@teh.com ", en)).toBe("info@teh.com ");
    expect(pas("2e ")).toBe("2e ");
    expect(pas("Het eigelijk ", { taal: "nl", uitzondering: (w) => w === "eigelijk" })).toBe("Het eigelijk ");
    expect(autocorrectie("auto's", 5, nl)).toBeNull();
    expect(pas("Het huis")).toBe("Het huis"); // geen scheidingsteken getypt
  });
});

// Met de echte module en woordenboeken (na `node scripts/kopieer-assets.mjs`).
const WASM = "public/spelling/oos_spelling.wasm";
const heeftModule = existsSync(WASM) && existsSync("public/woordenboeken/nl.dic");

describe.skipIf(!heeftModule)("spellbook met OpenTaal en SCOWL", () => {
  // Pas laden binnen de tests: ook een overgeslagen describe wordt verzameld.
  let c!: Controleur;
  beforeAll(() => {
    const motor = new DirecteMotor(Spellbook.laad(readFileSync(WASM)), async (taal) => ({
      aff: readFileSync(`public/woordenboeken/${taal}.aff`),
      dic: readFileSync(`public/woordenboeken/${taal}.dic`),
    }));
    c = new Controleur(motor, { persoonlijk: new Woordenlijst(), genegeerd: new Woordenlijst() });
  });

  it("kent Nederlandse samenstellingen, apostrofs en afkortingen", async () => {
    const [fouten] = await c.controleer([
      {
        tekst:
          "De fietsenstallingscapaciteit van de zonnepaneleninstallatie, auto's en foto’s, bijv. 's avonds e-mail, en een huiz met bestemingsplan.",
        taal: "nl",
      },
    ]);
    expect(fouten.map((f) => f.tekst)).toEqual(["huiz", "bestemingsplan"]);
  });

  it("geeft goede suggesties (top 5)", async () => {
    expect(await c.suggesties("bestemingsplan", "nl")).toContain("bestemmingsplan");
    const huis = await c.suggesties("Huiz", "nl");
    expect(huis).toContain("Huis");
    expect(huis.every((s) => /^\p{Lu}/u.test(s))).toBe(true);
    expect(huis.length).toBeLessThanOrEqual(5);
    expect((await c.suggesties("recieve", "en-GB"))[0]).toBe("receive");
  });

  it("onderscheidt Brits en Amerikaans Engels", async () => {
    const [gb, us] = await c.controleer([
      { tekst: "The colour of the organisation", taal: "en-GB" },
      { tekst: "The colour of the organization", taal: "en-US" },
    ]);
    expect(gb).toEqual([]);
    expect(us.map((f) => f.tekst)).toEqual(["colour"]);
  });
});
