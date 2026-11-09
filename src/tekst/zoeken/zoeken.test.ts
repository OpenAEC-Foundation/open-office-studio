import { describe, expect, it, vi } from "vitest";
import {
  context,
  jokertekensNaarRegex,
  maakPatroon,
  opmaakStukken,
  pastBijOpmaak,
  tekstNaarRegex,
  toonbaar,
  vervangTekst,
  vindAlle,
  ZoekFout,
} from "./logica";
import { leesNummer, opmerkingTekst } from "./ganaar";

const treffers = (tekst: string, zoek: string, opties = {}) => vindAlle(tekst, maakPatroon(zoek, opties)).map((t) => t.tekst);

describe("zoekopties", () => {
  const tekst = "De kat en de Kater.\nEen KAT\tlag op de mat.\n";
  it("is standaard niet hoofdlettergevoelig", () => {
    expect(treffers(tekst, "kat")).toEqual(["kat", "Kat", "KAT"]);
    expect(treffers(tekst, "kat", { hoofdlettergevoelig: true })).toEqual(["kat"]);
  });
  it("vindt alleen hele woorden", () => {
    expect(treffers(tekst, "kat", { heleWoorden: true })).toEqual(["kat", "KAT"]);
  });
  it("kent speciale tekens ^p, ^t, ^# en ^?", () => {
    expect(treffers(tekst, ".^pEen")).toEqual([".\nEen"]);
    expect(treffers(tekst, "KAT^tlag")).toEqual(["KAT\tlag"]);
    expect(treffers("a1b22", "^#")).toEqual(["1", "2", "2"]);
    expect(treffers("ab", "a^?")).toEqual(["ab"]);
    expect(tekstNaarRegex("1+1^^")).toBe("1\\+1\\^");
  });
  it("zet Word-jokertekens om", () => {
    expect(treffers(tekst, "<[A-Z]@>", { jokertekens: true })).toEqual(["KAT"]);
    expect(treffers(tekst, "<[A-Z][a-z]@>", { jokertekens: true })).toEqual(["De", "Kater", "Een"]);
    expect(treffers(tekst, "m?t", { jokertekens: true })).toEqual(["mat"]);
    expect(treffers(tekst, "K*r", { jokertekens: true })).toEqual(["Kater"]);
    expect(treffers("aaa ab", "a{2,3}", { jokertekens: true })).toEqual(["aaa"]);
    expect(treffers("x1 y2", "[!xy][0-9]", { jokertekens: true })).toEqual([]);
    expect(jokertekensNaarRegex("\\*")).toBe("\\*");
    // Jokertekens zijn altijd hoofdlettergevoelig, zoals in Word.
    expect(treffers(tekst, "kat", { jokertekens: true })).toEqual(["kat"]);
  });
  it("ondersteunt reguliere expressies met ^ en $ per alinea", () => {
    expect(treffers(tekst, "^\\w+", { regex: true })).toEqual(["De", "Een"]);
    expect(treffers(tekst, "\\bma.\\.$", { regex: true })).toEqual(["mat."]);
  });
  it("meldt ongeldige of lege zoekopdrachten begrijpelijk", () => {
    expect(() => maakPatroon("(", { regex: true })).toThrow(ZoekFout);
    expect(() => maakPatroon("a*", { regex: true })).toThrow(/lege tekst/);
    expect(() => maakPatroon("[abc", { jokertekens: true })).toThrow(/\[/);
    expect(() => maakPatroon("")).toThrow(ZoekFout);
  });
});

describe("lege regex-treffers overslaan", () => {
  it.each([
    { tekst: "😀x", zoek: "(?=😀)", verwacht: [] },
    { tekst: "😀x", zoek: "(?=😀)|x", verwacht: [{ start: 2, eind: 3, tekst: "x" }] },
    { tekst: "a😀😀x", zoek: "(?=😀)|x", verwacht: [{ start: 5, eind: 6, tekst: "x" }] },
    { tekst: "ax", zoek: "(?=a)|x", verwacht: [{ start: 1, eind: 2, tekst: "x" }] },
    { tekst: "\uD83Dx", zoek: "(?=\uD83D)|x", verwacht: [{ start: 1, eind: 2, tekst: "x" }] },
    { tekst: "x", zoek: "x|(?<=x)", verwacht: [{ start: 0, eind: 1, tekst: "x" }] },
  ])("beëindigt $zoek in $tekst en bewaart echte treffers", ({ tekst, zoek, verwacht }) => {
    const patroon = maakPatroon(zoek, { regex: true });
    const exec = RegExp.prototype.exec;
    let aanroepen = 0;
    // Begrens alleen de onderzochte regex: de oorspronkelijke fout mag de
    // testworker niet eindeloos laten draaien.
    const bewaker = vi.spyOn(RegExp.prototype, "exec").mockImplementation(function (this: RegExp, invoer: string) {
      if (this.source === patroon.source && this.flags === patroon.flags && ++aanroepen > 20)
        throw new Error("Zoeklus maakt geen voortgang");
      return exec.call(this, invoer);
    });
    try {
      expect(vindAlle(tekst, patroon).map(({ start, eind, tekst }) => ({ start, eind, tekst }))).toEqual(verwacht);
    } finally {
      bewaker.mockRestore();
    }
  });
});

describe("vervangtekst", () => {
  it("zet ^p, ^t en ^& om", () => {
    const m = /kat/.exec("de kat")!;
    expect(vervangTekst("[^&]^t^p", m)).toBe("[kat]\t\n");
  });
  it("gebruikt groepen bij jokertekens (\\1) en regex ($1)", () => {
    const m = /(De) (kat)/.exec("De kat")!;
    expect(vervangTekst("\\2 \\1", m, { jokertekens: true })).toBe("kat De");
    expect(vervangTekst("$2-$1 $$", m, { regex: true })).toBe("kat-De $");
    expect(vervangTekst("$2", m)).toBe("$2");
  });
});

describe("resultaten en opmaak", () => {
  it("toont context met zichtbare speciale tekens", () => {
    const tekst = "Eerste alinea.\nDe kat\tzit hier.\n";
    const c = context(tekst, 18, 21);
    expect(c.treffer).toBe("kat");
    expect(c.voor).toBe("De ");
    expect(c.na).toBe("→zit hier.");
    expect(toonbaar("a\nb\fc")).toBe("a¶b⤓c");
  });
  it("filtert op vet, cursief en stijl", () => {
    const vet = { vet: true, cursief: false, onderstreept: false };
    const gewoon = { vet: false, cursief: false, onderstreept: false };
    expect(pastBijOpmaak({ vet: true }, [vet, vet], ["Heading1"])).toBe(true);
    expect(pastBijOpmaak({ vet: true }, [vet, gewoon], [])).toBe(false);
    expect(pastBijOpmaak({ stijl: "Heading1" }, [gewoon], ["Heading1"])).toBe(true);
    expect(pastBijOpmaak({ stijl: "Heading1" }, [gewoon], [undefined])).toBe(false);
    const stukken = opmaakStukken("ab cd\nef", [vet, vet, gewoon, vet, vet, null, vet, gewoon], () => undefined, { vet: true });
    expect(stukken).toEqual([
      { start: 0, eind: 2 },
      { start: 3, eind: 5 },
      { start: 6, eind: 7 },
    ]);
    // Een object (afbeelding, U+FFFC) zonder tekenopmaak is geen treffer bij ‘vet’.
    expect(opmaakStukken("a\uFFFCb", [vet, null, gewoon], () => undefined, { vet: true })).toEqual([{ start: 0, eind: 1 }]);
    expect(opmaakStukken("\uFFFC", [null], () => "Heading1", { stijl: "Heading1" })).toEqual([{ start: 0, eind: 1 }]);
  });
});

describe("Ga naar", () => {
  it("leest absolute en relatieve nummers", () => {
    expect(leesNummer("3", 1, 10)).toBe(3);
    expect(leesNummer("+2", 4, 10)).toBe(6);
    expect(leesNummer("-1", 4, 10)).toBe(3);
    expect(leesNummer("11", 1, 10)).toBeNull();
    expect(leesNummer("0", 1, 10)).toBeNull();
    expect(leesNummer("twee", 1, 10)).toBeNull();
  });
});

describe("Ga naar: opmerkingen", () => {
  it("toont de platte tekst van een opmerking, zonder modelvelden", () => {
    const inhoud = [
      {
        type: "paragraph",
        sourceOrdinal: 0,
        formatting: {},
        content: [
          { type: "run", formatting: { bold: true }, content: [{ type: "text", text: "Kun je dit" }] },
          { type: "run", content: [{ type: "text", text: " verduidelijken?" }] },
        ],
      },
      { type: "paragraph", content: [{ type: "run", content: [{ type: "text", text: "Tweede alinea" }] }] },
    ];
    expect(opmerkingTekst(inhoud)).toBe("Kun je dit verduidelijken? Tweede alinea");
    expect(opmerkingTekst(undefined)).toBe("");
  });
});
