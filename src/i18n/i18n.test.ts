import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { en as tekstEn } from "@betteroffice/docx-i18n";
import { en as rekenbladEn } from "@betteroffice/xlsx-i18n";
import { en as diaEn } from "@betteroffice/pptx-i18n";
import {
  bewaarInstellingen,
  leesBewaardeInstellingen,
  leesInstellingen,
  neemOver,
  normaliseerInstellingen,
  pasToe,
  standaardInstellingen,
  toonVoorbeeld,
  wijzigInstellingen,
} from "../instellingen";
import i18next, { huidigeTaal, NAMESPACES, zetTaal } from "./config";
import { bepaalTaal, INTERFACETALEN, isRtl, TAALCODES, TAALNAMEN, zoekTaal } from "./talen";
import { formatDatum, formatGetal, formatLijst, meervoudVorm } from "./opmaak";
import { ENGINE_BRON, laadEngineVertaling } from "./engine";
import { tekstEs, rekenbladEs, diaEs } from "./engine/es";
// @ts-expect-error -- JavaScript-module zonder typen
import { controleerVertalingen } from "../../scripts/controleer-i18n.mjs";

describe("taalkeuze", () => {
  it("auto volgt de systeemtaal met terugval op Engels", () => {
    expect(bepaalTaal("auto", ["de-AT", "en"])).toBe("de");
    expect(bepaalTaal("auto", ["xx-YY", "fr-CA"])).toBe("fr");
    expect(bepaalTaal("auto", ["xx"])).toBe("en");
    expect(bepaalTaal("auto", [])).toBe("en");
    expect(bepaalTaal("it", ["de"])).toBe("it");
    // Een voorbereide, nog niet aangeboden taal valt terug op Engels.
    expect(bepaalTaal("tr", ["de"])).toBe("en");
    expect(bepaalTaal("auto", ["ja-JP", "fr-FR"])).toBe("fr");
  });

  it("herkent volledige tags en regio's", () => {
    expect(zoekTaal("pt-BR")).toBe("pt-BR");
    expect(zoekTaal("pt")).toBe("pt-BR");
    expect(zoekTaal("pt-PT")).toBe("pt-PT");
    expect(zoekTaal("pt-AO")).toBe("pt-PT");
    expect(zoekTaal("zh-TW")).toBe("zh-TW");
    expect(zoekTaal("zh-HK")).toBe("zh-TW");
    expect(zoekTaal("zh-Hant-SG")).toBe("zh-TW");
    expect(zoekTaal("zh")).toBe("zh-CN");
    expect(zoekTaal("zh-Hans-CN")).toBe("zh-CN");
    expect(zoekTaal("no")).toBe("nb");
    expect(zoekTaal("nn-NO")).toBe("nb");
    expect(zoekTaal("iw")).toBe("he");
    expect(zoekTaal("en_US")).toBe("en");
    expect(zoekTaal("NL-be")).toBe("nl");
    expect(zoekTaal("xx")).toBeNull();
  });

  it("heeft 31 talen met een eigen naam en RTL voor ar en he", () => {
    expect(TAALCODES).toHaveLength(31);
    for (const code of TAALCODES) expect(TAALNAMEN[code]).toBeTruthy();
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("he")).toBe(true);
    expect(isRtl("nl")).toBe(false);
  });
});

describe("taal in de instellingen", () => {
  it("normaliseert onbekende waarden naar auto", () => {
    expect(standaardInstellingen.taal).toBe("auto");
    expect(normaliseerInstellingen({ taal: "kl" }).taal).toBe("auto");
    expect(normaliseerInstellingen({ taal: "pt-BR" }).taal).toBe("pt-BR");
    expect(normaliseerInstellingen({ taal: 3 }).taal).toBe("auto");
    expect(pasToe(standaardInstellingen, { taal: "ja" }).taal).toBe("ja");
  });

  it("toont een voorbeeld zonder te bewaren en zet terug", () => {
    const bewaard = leesBewaardeInstellingen();
    toonVoorbeeld({ ...bewaard, taal: "fr", thema: "light" });
    expect(leesInstellingen().taal).toBe("fr");
    expect(leesBewaardeInstellingen().taal).toBe(bewaard.taal);
    toonVoorbeeld(null);
    expect(leesInstellingen()).toBe(bewaard);
  });

  it("bewaart een complete set en neemt keuzes uit een ander venster over", async () => {
    bewaarInstellingen({ ...leesBewaardeInstellingen(), taal: "de" });
    expect(leesInstellingen().taal).toBe("de");
    neemOver(JSON.stringify({ ...leesBewaardeInstellingen(), taal: "es" }));
    expect(leesInstellingen().taal).toBe("es");
    neemOver("{kapot");
    expect(leesInstellingen().taal).toBe("es");
    wijzigInstellingen({ taal: "nl" });
    await zetTaal("nl");
    expect(huidigeTaal()).toBe("nl");
  });
});

describe("i18next", () => {
  afterAll(() => zetTaal("nl"));

  it("laadt namespaces uit de JSON-bestanden en begint in het Nederlands (tests)", () => {
    expect(NAMESPACES).toEqual(expect.arrayContaining(["common", "settings"]));
    expect(i18next.t("common:save")).toBe("Opslaan");
    expect(i18next.t("settings:title")).toBe("Instellingen");
  });

  it("laadt een andere taal lui en valt terug op Engels", async () => {
    await zetTaal("de");
    expect(huidigeTaal()).toBe("de");
    expect(i18next.t("common:save")).toBe(i18next.getResource("de", "common", "save"));
    expect(i18next.getResource("de", "common", "save")).toBeTruthy();
    expect(i18next.t("common:nietBestaand", { defaultValue: "x" })).toBe("x");
    await zetTaal("auto");
    expect(TAALCODES).toContain(huidigeTaal());
  });

  it("kiest meervoudsvormen per taal", async () => {
    await zetTaal("nl");
    expect(i18next.t("settings:editing.personalDictionary", { count: 1 })).toContain("1 woord");
    expect(i18next.t("settings:editing.personalDictionary", { count: 3 })).toContain("3 woorden");
  });
});

describe("opmaak", () => {
  it("volgt de taal voor getallen, datums en lijsten", () => {
    expect(formatGetal(1234.5, undefined, "nl")).toBe("1.234,5");
    expect(formatGetal(1234.5, undefined, "en")).toBe("1,234.5");
    expect(formatDatum(new Date(2026, 9, 28), { dateStyle: "short" }, "nl")).toBe("28-10-2026");
    expect(formatDatum(new Date(2026, 9, 28), { year: "numeric" }, "th")).toContain("2026");
    expect(formatLijst(["a", "b", "c"], undefined, "nl")).toBe("a, b en c");
    expect(meervoudVorm(1, "nl")).toBe("one");
    expect(meervoudVorm(3, "ru")).toBe("few");
  });
});

/** Bladsleutels van een geneste vertaling, zonder _lang. */
function bladeren(boom: object, pad = ""): Map<string, string> {
  const uit = new Map<string, string>();
  for (const [k, v] of Object.entries(boom)) {
    if (k === "_lang") continue;
    const p = pad ? `${pad}.${k}` : k;
    if (v && typeof v === "object") for (const [a, b] of bladeren(v, p)) uit.set(a, b);
    else uit.set(p, String(v));
  }
  return uit;
}
const variabelen = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(",");

describe("engine-vertalingen", () => {
  it("kiest per taal de juiste bron", async () => {
    expect(ENGINE_BRON.nl).toBe("eigen");
    expect(ENGINE_BRON.en).toBe("engine");
    expect(ENGINE_BRON.es).toBe("eigen");
    expect(ENGINE_BRON.de).toBe("enginepakket");
    expect(ENGINE_BRON["pt-PT"]).toBe("geleend");
    expect(ENGINE_BRON.ja).toBe("terugval");
    expect((await laadEngineVertaling("nl")).tekst._lang).toBe("nl");
    expect((await laadEngineVertaling("en")).tekst._lang).toBe("en");
    const de = await laadEngineVertaling("de");
    expect([de.tekst._lang, de.rekenblad._lang, de.dia._lang]).toEqual(["de", "de", "de"]);
    expect((await laadEngineVertaling("pt-PT")).tekst._lang).toBe("pt-BR");
    expect((await laadEngineVertaling("zh-CN")).dia._lang).toBe("zh-CN");
    expect((await laadEngineVertaling("ja")).tekst._lang).toBe("en");
    expect((await laadEngineVertaling("es")).tekst).toBe(tekstEs);
  });

  it.each([
    ["tekst", tekstEn, tekstEs],
    ["rekenblad", rekenbladEn, rekenbladEs],
    ["dia", diaEn, diaEs],
  ] as const)("Spaans dekt alle Engelse sleutels van %s met dezelfde variabelen", (_, bron, es) => {
    expect(es._lang).toBe("es");
    const b = bladeren(bron);
    const v = bladeren(es);
    expect([...b.keys()].filter((k) => !v.has(k))).toEqual([]);
    expect([...v.keys()].filter((k) => !b.has(k))).toEqual([]);
    for (const [k, tekst] of b) {
      expect(v.get(k)?.trim(), k).toBeTruthy();
      expect(variabelen(v.get(k)!), k).toBe(variabelen(tekst));
    }
  });
});

describe("controle-script", () => {
  let map = "";
  afterAll(() => (map ? rm(map, { recursive: true, force: true }) : undefined));

  it("vindt ontbrekende, lege en afwijkende vertalingen", async () => {
    map = await mkdtemp(join(tmpdir(), "i18n-"));
    const schrijf = async (taal: string, inhoud: object) => {
      await mkdir(join(map, taal), { recursive: true });
      await writeFile(join(map, taal, "proef.json"), JSON.stringify(inhoud));
    };
    await schrijf("nl", {
      a: "Hallo {{naam}}",
      b: { c: "Tekst" },
      woord_one: "{{count}} woord",
      woord_other: "{{count}} woorden",
    });
    await schrijf("en", {
      a: "Hello {{naam}}",
      b: { c: "Text" },
      woord_one: "{{count}} word",
      woord_other: "{{count}} words",
    });
    await schrijf("ru", { a: "Привет {{name}}", b: { c: "" }, woord_one: "{{count}} слово", extra: "x" });
    await schrijf("ja", { a: "こんにちは {{naam}}", b: { c: "テキスト" }, woord_other: "{{count}} 語" });
    const { fouten } = await controleerVertalingen({ map, talen: ["nl", "en", "ru", "ja"] });
    expect(fouten.filter((f: string) => f.startsWith("nl/") || f.startsWith("en/") || f.startsWith("ja/"))).toEqual([]);
    const ru = fouten.filter((f: string) => f.startsWith("ru/")).join("\n");
    expect(ru).toContain('andere variabelen in "a"');
    expect(ru).toContain('lege waarde "b.c"');
    expect(ru).toContain('onbekende sleutel "extra"');
    expect(ru).toContain('meervoudsvorm ontbreekt "woord_few"');
    expect(ru).toContain('meervoudsvorm ontbreekt "woord_many"');
  });

  it("alle vertalingen van de app zijn in orde", async () => {
    const { fouten, talen } = await controleerVertalingen();
    expect(talen).toEqual([...INTERFACETALEN]);
    expect(fouten).toEqual([]);
  });
});
