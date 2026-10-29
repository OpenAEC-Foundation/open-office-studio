import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alleSneltoetsen,
  botsingen,
  geldtIn,
  moduleToets,
  normaliseer,
  registreerSneltoetsen,
  toetsDelen,
  vasteSneltoetsen,
  zoekSneltoetsen,
  type SneltoetsModule,
} from "./sneltoetsenlijst";

/** Letterlijke toetsen uit de broncode van een module (ook `Ctrl+Shift+${cijfer}`). */
function toetsenInBron(bestand: string): string[] {
  const bron = readFileSync(new URL(bestand, import.meta.url), "utf8");
  const letterlijk = [...bron.matchAll(/toets:\s*"([^"]+)"/g)].map((m) => m[1]);
  const paren = [...bron.matchAll(/\[\s*"((?:Ctrl|Alt|Shift)\+[^"]+|F\d+)",\s*"[^"]*"\s*\]/g)].map(
    (m) => m[1],
  );
  const sjablonen = [...bron.matchAll(/toets:\s*`([^`$]+)\$\{cijfer\}`/g)].flatMap((m) => {
    const lijst = bron.slice(0, m.index).match(/\["(\d)",[^\]]*\]/g) ?? [];
    return lijst.map((paar) => m[1] + paar.match(/\d/)![0]);
  });
  return [...new Set([...letterlijk, ...paren, ...sjablonen])];
}

describe("sneltoetsenregister", () => {
  it("heeft geen dubbele combinaties binnen een module", () => {
    expect(botsingen(vasteSneltoetsen)).toEqual([]);
  });

  it("vindt botsingen als ze er wel zijn", () => {
    const lijst = [
      ...vasteSneltoetsen,
      { toets: "Ctrl+S", omschrijving: "Iets anders", module: "tekst" as const, bron: "lint" as const },
    ];
    expect(botsingen(lijst)).toEqual([
      { module: "tekst", toets: "ctrl+s", omschrijvingen: ["Opslaan in het laatst gekozen formaat", "Iets anders"] },
    ]);
  });

  it.each([
    ["tekst", "./tekst-opdrachten.tsx"],
    ["rekenblad", "./rekenblad.tsx"],
    ["presentatie", "./presentatie-acties.tsx"],
  ] as [SneltoetsModule, string][])(
    "beschrijft elke sneltoets uit de %s-module",
    (module, bestand) => {
      const bekend = new Set(
        vasteSneltoetsen.filter((i) => i.module === module).map((i) => normaliseer(i.toets)),
      );
      expect(toetsenInBron(bestand).length).toBeGreaterThan(10);
      const ontbrekend = toetsenInBron(bestand).filter((t) => !bekend.has(normaliseer(t)));
      expect(ontbrekend).toEqual([]);
    },
  );

  it("past algemene uitzonderingen per module toe", () => {
    const volgend = vasteSneltoetsen.find(
      (i) => i.module === "algemeen" && i.toets === "Ctrl+PageDown",
    )!;
    expect(geldtIn(volgend, "tekst")).toBe(true);
    expect(geldtIn(volgend, "rekenblad")).toBe(false);
    const zoom = vasteSneltoetsen.find((i) => i.toets === "Ctrl+0")!;
    expect(geldtIn(zoom, "email")).toBe(false);
  });

  it("normaliseert de volgorde van modifiers", () => {
    expect(normaliseer("Shift+Ctrl+P")).toBe(normaliseer("Ctrl+Shift+P"));
  });

  it("toont Cmd en Option op macOS", () => {
    expect(toetsDelen("Ctrl+Shift+S", true)).toEqual(["⌘", "⇧", "S"]);
    expect(toetsDelen("Ctrl+Shift+S", false)).toEqual(["Ctrl", "Shift", "S"]);
    expect(toetsDelen("PageDown", false)).toEqual(["Page Down"]);
  });

  it("neemt geregistreerde toetsen buiten de vaste lijst op", () => {
    const weg = registreerSneltoetsen("notities", [{ toets: "Ctrl+Alt+N", omschrijving: "Nieuwe pagina" }]);
    expect(alleSneltoetsen().some((i) => i.module === "notities" && i.toets === "Ctrl+Alt+N")).toBe(true);
    weg();
    expect(alleSneltoetsen().some((i) => i.toets === "Ctrl+Alt+N")).toBe(false);
  });

  it("zoekt in omschrijving en toets", () => {
    expect(zoekSneltoetsen(vasteSneltoetsen, "autosom").map((i) => i.toets)).toEqual(["Alt+="]);
    expect(zoekSneltoetsen(vasteSneltoetsen, "ctrl+shift+s").some((i) => i.toets === "Ctrl+Shift+S")).toBe(true);
  });
});

describe("sneltoetsen in de interfacetaal", () => {
  it("vertaalt omschrijvingen bij het lezen; toetsen en ids blijven gelijk", async () => {
    const { zetTaal } = await import("../i18n/config");
    const vet = vasteSneltoetsen.find((i) => i.module === "tekst" && i.toets === "Ctrl+B")!;
    const tab = vasteSneltoetsen.find((i) => i.toets === "Alt+3")!;
    try {
      await zetTaal("en");
      expect(vet.omschrijving).toBe("Bold");
      expect(tab.omschrijving).toBe("Tab 3");
      expect(zoekSneltoetsen(vasteSneltoetsen, "autosum").map((i) => i.toets)).toEqual(["Alt+="]);
      expect(toetsDelen("Ctrl+Space", false)).toEqual(["Ctrl", "Space"]);
    } finally {
      await zetTaal("nl");
    }
    expect(vet.omschrijving).toBe("Vet");
    expect(vet.id).toBe("bold");
    expect(tab.omschrijving).toBe("Tabblad 3");
  });
});

describe("documentzoom en tekstprofiel", () => {
  const toets = (key: string, code: string, shiftKey: boolean) => ({ key, code, shiftKey, ctrlKey: true, metaKey: false, altKey: false });
  it("laat Ctrl+Shift+= en Ctrl+Shift+- in het Word-profiel aan super- en subscript", () => {
    expect(moduleToets("tekst", "word", toets("+", "Equal", true))).toBe(true);
    expect(moduleToets("tekst", "word", toets("_", "Minus", true))).toBe(true);
  });
  it("laat zoomen met Ctrl+= en Ctrl+- (en in het standaardprofiel ook met Shift) door", () => {
    expect(moduleToets("tekst", "word", toets("=", "Equal", false))).toBe(false);
    expect(moduleToets("tekst", "word", toets("-", "Minus", false))).toBe(false);
    expect(moduleToets("tekst", "standaard", toets("+", "Equal", true))).toBe(false);
  });
});
