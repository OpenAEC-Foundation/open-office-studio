import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  kies,
  miniatuurBreedte,
  naVerwijderen,
  nieuweVolgorde,
  schuifStand,
  stapInRaster,
  verplaatsStappen,
} from "./sorteerder-logica";
import {
  beginStaat,
  duurTekst,
  hervat,
  naarDia,
  nieuweTimer,
  pauzeer,
  raaktStreep,
  startDia,
  verstreken,
  verwerkToets,
  volgende,
  vorige,
} from "./voorstelling-logica";
import {
  dupliceerDias,
  hernoemSectie,
  leesSecties,
  normaliseerSecties,
  verbergDias,
  verwijderSectie,
  voegSectieToe,
} from "./pakket";
import { pasIn } from "./DiaVlak";

const voorbeeld = (): Uint8Array => new Uint8Array(readFileSync(new URL("../../docs/voorbeelden/Ontwerpvisie.pptx", import.meta.url)));
const deel = (bytes: Uint8Array, pad: string) => strFromU8(unzipSync(bytes)[pad]);

describe("diasorteerder: herschikken", () => {
  it("zet gekozen dia's bij het invoegpunt, in hun eigen volgorde", () => {
    const v = ["a", "b", "c", "d", "e"];
    expect(nieuweVolgorde(v, new Set([1, 3]), 0)).toEqual(["b", "d", "a", "c", "e"]);
    expect(nieuweVolgorde(v, new Set([0]), 5)).toEqual(["b", "c", "d", "e", "a"]);
    expect(nieuweVolgorde(v, new Set([0, 1]), 4)).toEqual(["c", "d", "a", "b", "e"]);
    expect(nieuweVolgorde(v, new Set([2]), 2)).toEqual(v);
  });

  it("maakt hooguit één moveSlide-stap per dia, en geen als niets verandert", () => {
    const v = ["a", "b", "c", "d", "e"];
    const doel = nieuweVolgorde(v, new Set([1, 3]), 5);
    const stappen = verplaatsStappen(v, doel);
    const lijst = [...v];
    for (const [id, naar] of stappen) {
      lijst.splice(lijst.indexOf(id), 1);
      lijst.splice(naar, 0, id);
    }
    expect(lijst).toEqual(doel);
    expect(stappen.length).toBeLessThanOrEqual(v.length);
    expect(verplaatsStappen(v, v)).toEqual([]);
  });

  it("kiest met klik, Ctrl en Shift", () => {
    expect([...kies(new Set([1]), 1, 3, {}).selectie]).toEqual([3]);
    expect([...kies(new Set([1]), 1, 3, { ctrl: true }).selectie].sort()).toEqual([1, 3]);
    expect([...kies(new Set([1, 3]), 1, 3, { ctrl: true }).selectie]).toEqual([1]);
    expect([...kies(new Set([1]), 1, 4, { shift: true }).selectie]).toEqual([1, 2, 3, 4]);
  });

  it("navigeert in het raster en houdt de selectie geldig na verwijderen", () => {
    expect(stapInRaster(5, "ArrowUp", 4, 10)).toBe(1);
    expect(stapInRaster(1, "ArrowUp", 4, 10)).toBe(0);
    expect(stapInRaster(8, "ArrowDown", 4, 10)).toBe(9);
    expect(stapInRaster(3, "End", 4, 10)).toBe(9);
    expect(naVerwijderen(5, new Set([4]))).toBe(3);
    expect(naVerwijderen(5, new Set([1, 2]))).toBe(1);
  });

  it("zet de zoomschuif om naar miniatuurbreedte en terug", () => {
    expect(miniatuurBreedte(0)).toBe(96);
    expect(miniatuurBreedte(100)).toBe(480);
    expect(schuifStand(miniatuurBreedte(40))).toBe(40);
  });
});

describe("diavoorstelling", () => {
  const verborgen = new Set([2]);

  it("slaat verborgen dia's over en eindigt met een zwart eindscherm", () => {
    let s = beginStaat(1, 4);
    [s] = volgende(s, verborgen);
    expect(s.index).toBe(3);
    [s] = volgende(s, verborgen);
    expect(s.einde).toBe(true);
    const [, actie] = volgende(s, verborgen);
    expect(actie).toEqual({ soort: "sluit" });
    s = vorige(s, verborgen);
    expect(s.einde).toBe(false);
    expect(vorige(s, verborgen).index).toBe(1);
  });

  it("begint vanaf het begin bij de eerste zichtbare dia", () => {
    expect(startDia(true, 3, 4, new Set([0]))).toBe(1);
    expect(startDia(false, 2, 4, verborgen)).toBe(2);
  });

  it("springt met nummer + Enter, ook naar een verborgen dia", () => {
    let s = beginStaat(0, 10);
    s = verwerkToets(s, { key: "3" }, verborgen).staat;
    expect(s.invoer).toBe("3");
    s = verwerkToets(s, { key: "Enter" }, verborgen).staat;
    expect(s.index).toBe(2);
    expect(naarDia(s, 99).index).toBe(9);
    expect(verwerkToets(beginStaat(0, 10), { key: "Enter" }, verborgen).staat.index).toBe(1);
  });

  it("kent zwart/wit scherm, gereedschap en Esc", () => {
    let s = beginStaat(0, 3);
    s = verwerkToets(s, { key: "b" }, verborgen).staat;
    expect(s.scherm).toBe("zwart");
    // Volgende na zwart scherm haalt eerst het scherm weg.
    [s] = volgende(s, verborgen);
    expect(s.scherm).toBe("normaal");
    expect(s.index).toBe(0);
    s = verwerkToets(s, { key: "W" }, verborgen).staat;
    expect(s.scherm).toBe("wit");
    s = verwerkToets(s, { key: "p" }, verborgen).staat;
    expect(s.gereedschap).toBe("pen");
    expect(verwerkToets(s, { key: "p", ctrl: true }, verborgen).staat.gereedschap).toBe("aanwijzer");
    // Esc zet eerst het gereedschap terug, daarna stopt de voorstelling.
    s = verwerkToets(s, { key: "Escape" }, verborgen).staat;
    expect(s.gereedschap).toBe("aanwijzer");
    expect(verwerkToets(s, { key: "Escape" }, verborgen).actie).toEqual({ soort: "sluit" });
    expect(verwerkToets(s, { key: "e" }, verborgen).actie).toEqual({ soort: "wisInkt" });
    expect(verwerkToets(s, { key: "x" }, verborgen).gebruikt).toBe(false);
  });

  it("timer pauzeert en hervat", () => {
    let t = nieuweTimer(1000);
    t = pauzeer(t, 6000);
    expect(verstreken(t, 50_000)).toBe(5000);
    t = hervat(t, 10_000);
    expect(verstreken(t, 12_000)).toBe(7000);
    expect(duurTekst(65_000)).toBe("1:05");
    expect(duurTekst(3_725_000)).toBe("1:02:05");
  });

  it("gum raakt een streep alleen in de buurt", () => {
    const streep = { soort: "pen" as const, punten: [0.1, 0.1, 0.5, 0.1] };
    expect(raaktStreep(streep, 0.3, 0.105)).toBe(true);
    expect(raaktStreep(streep, 0.3, 0.3)).toBe(false);
  });

  it("past een dia in zijn vak", () => {
    expect(pasIn(1600, 1200, 16 / 9)).toEqual({ x: 0, y: 150, breedte: 1600, hoogte: 900 });
    expect(pasIn(1000, 400, 2)).toEqual({ x: 100, y: 0, breedte: 800, hoogte: 400 });
  });
});

describe("diabewerkingen via het pakket", () => {
  it("dupliceert een dia met eigen notities, direct na het origineel", () => {
    const bron = voorbeeld();
    const r = dupliceerDias(bron, [0]);
    expect(r.eerste).toBe(1);
    const delen = unzipSync(r.bytes);
    const pres = strFromU8(delen["ppt/presentation.xml"]);
    const ids = [...pres.matchAll(/<p:sldId id="(\d+)" r:id="(rId\d+)"/g)];
    expect(ids).toHaveLength(4);
    const rels = strFromU8(delen["ppt/_rels/presentation.xml.rels"]);
    const doel = new RegExp(`Id="${ids[1][2]}"[^>]*Target="([^"]+)"`).exec(rels) ?? new RegExp(`Target="([^"]+)"[^>]*Id="${ids[1][2]}"`).exec(rels);
    expect(doel?.[1]).toMatch(/^slides\/slide\d+\.xml$/);
    const kopie = `ppt/${doel![1]}`;
    const norm = (x: string) => x.replace(/(<p14:creationId\b[^>]*\bval=")\d+/, "$1");
    const origineel = new RegExp(`Id="${ids[0][2]}"[^>]*Target="([^"]+)"`).exec(rels) ?? new RegExp(`Target="([^"]+)"[^>]*Id="${ids[0][2]}"`).exec(rels);
    expect(norm(strFromU8(delen[kopie]))).toBe(norm(deel(bron, `ppt/${origineel![1]}`)));
    const ct = strFromU8(delen["[Content_Types].xml"]);
    expect(ct).toContain(`PartName="/${kopie}"`);
    // Notities: eigen kopie die naar de nieuwe dia wijst.
    const kopieRels = strFromU8(delen[kopie.replace("slides/", "slides/_rels/") + ".rels"]);
    const notities = /notesSlide"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*notesSlide"/.exec(kopieRels);
    if (notities) {
      const pad = `ppt/notesSlides/${(notities[1] ?? notities[2]).split("/").pop()}`;
      expect(pad).not.toBe("ppt/notesSlides/notesSlide1.xml");
      expect(strFromU8(delen[pad.replace("notesSlides/", "notesSlides/_rels/") + ".rels"])).toContain(doel![1].split("/").pop()!);
    }
  });

  it("verbergt dia's en maakt ze weer zichtbaar", () => {
    const verborgen = verbergDias(voorbeeld(), [1, 2], true);
    expect(deel(verborgen, "ppt/slides/slide2.xml")).toMatch(/<p:sld\b[^>]*show="0"/);
    expect(deel(verborgen, "ppt/slides/slide1.xml")).not.toMatch(/show="0"/);
    const terug = verbergDias(verborgen, [1], false);
    expect(deel(terug, "ppt/slides/slide2.xml")).not.toMatch(/show="0"/);
    expect(deel(terug, "ppt/slides/slide3.xml")).toMatch(/show="0"/);
  });

  it("maakt, hernoemt en verwijdert secties", () => {
    let bytes: Uint8Array = voorbeeld();
    expect(leesSecties(bytes)).toEqual([]);
    bytes = voegSectieToe(bytes, 1, "Ontwerp", "Standaard")!;
    let secties = leesSecties(bytes);
    expect(secties.map((s) => [s.naam, s.begin, s.aantal])).toEqual([
      ["Standaard", 0, 1],
      ["Ontwerp", 1, 2],
    ]);
    expect(voegSectieToe(bytes, 1, "Dubbel", "Standaard")).toBeNull();
    bytes = hernoemSectie(bytes, secties[1].id, "Uitwerking & <details>");
    secties = leesSecties(bytes);
    expect(secties[1].naam).toBe("Uitwerking & <details>");
    expect(deel(bytes, "ppt/presentation.xml")).toContain("Uitwerking &amp; &lt;details&gt;");
    bytes = verwijderSectie(bytes, secties[0].id);
    expect(leesSecties(bytes).map((s) => [s.naam, s.begin, s.aantal])).toEqual([["Uitwerking & <details>", 0, 3]]);
    // Een kopie komt in de sectie van het origineel.
    const r = dupliceerDias(voegSectieToe(voorbeeld(), 2, "Slot", "Begin")!, [0]);
    expect(leesSecties(r.bytes).map((s) => [s.naam, s.begin, s.aantal])).toEqual([
      ["Begin", 0, 3],
      ["Slot", 3, 1],
    ]);
  });

  it("leest secties die na verplaatsen niet meer aaneensluiten", () => {
    const bron = unzipSync(voorbeeld());
    let pres = strFromU8(bron["ppt/presentation.xml"]);
    pres = pres.replace(
      "</p:presentation>",
      `<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section name="A" id="{A}"><p14:sldIdLst><p14:sldId id="258"/><p14:sldId id="999"/></p14:sldIdLst></p14:section><p14:section name="B" id="{B}"><p14:sldIdLst><p14:sldId id="256"/><p14:sldId id="257"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst></p:presentation>`,
    );
    bron["ppt/presentation.xml"] = strToU8(pres);
    const secties = leesSecties(zipSync(bron));
    expect(secties.map((s) => [s.naam, s.begin, s.aantal])).toEqual([
      ["B", 0, 2],
      ["A", 2, 1],
    ]);
    expect(normaliseerSecties([{ naam: "x", id: "1", begin: 3, aantal: 0 }], 5)).toEqual([{ naam: "x", id: "1", begin: 0, aantal: 5 }]);
  });

  it("de engine opent het resultaat: kopie met notities, verborgen dia en secties blijven bij opslaan", async () => {
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(readFileSync("node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm"));
    const bron = voorbeeld();
    const voor = pptx.openPresentation(bron).snapshot();
    let bytes: Uint8Array = dupliceerDias(bron, [1]).bytes;
    bytes = verbergDias(bytes, [3], true);
    bytes = voegSectieToe(bytes, 2, "Tweede", "Eerste")!;
    const deck = pptx.openPresentation(bytes);
    const na = deck.snapshot();
    expect(na.slides).toHaveLength(voor.slides.length + 1);
    expect(na.slides[2].notes ?? "").toBe(voor.slides[1].notes ?? "");
    expect(na.slides[2].shapes.map((v) => v.name)).toEqual(voor.slides[1].shapes.map((v) => v.name));
    const r = deck.exportStructured({ includeHiddenSlides: true, includeFormatting: false });
    expect(r.ok && r.content.slides.map((d) => d.hidden)).toEqual([false, false, false, true]);
    const opgeslagen = deck.save();
    expect(leesSecties(opgeslagen).map((s) => [s.naam, s.begin, s.aantal])).toEqual([
      ["Eerste", 0, 2],
      ["Tweede", 2, 2],
    ]);
  });
});
