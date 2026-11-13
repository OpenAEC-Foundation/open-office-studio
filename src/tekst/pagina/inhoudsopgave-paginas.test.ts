import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { attr, kind, kinderen, leesXml, ontsnap, tekstVan, zoekAlle } from "./ooxml";
import { STANDAARD_INHOUD, voegInhoudsopgaveIn, werkInhoudsopgaveBij, type Kop } from "./inhoudsopgave";

function inhoudsopgave(koppen: Kop[], rechtsUitlijnen = true, hyperlinks = false, paginanummers = true) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  const xml = p.lees("word/document.xml");
  const sectie = /<w:sectPr\b[\s\S]*<\/w:sectPr>/.exec(xml)![0];
  const alineas = koppen.map(k => `<w:p><w:pPr><w:pStyle w:val="Heading${k.niveau}"/></w:pPr><w:r><w:t>${ontsnap(k.tekst)}</w:t></w:r></w:p>`).join("");
  p.schrijf("word/document.xml", xml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${alineas}<w:p><w:r><w:t>Losse proefzin.</w:t></w:r></w:p>${sectie}</w:body>`));
  return voegInhoudsopgaveIn(p.inpakken(), null, koppen,
    { ...STANDAARD_INHOUD, niveaus: 2, rechtsUitlijnen, hyperlinks, paginanummers });
}

function regels(bytes: Uint8Array) {
  const xml = new Pakket(bytes).lees("word/document.xml");
  const sdt = zoekAlle(leesXml(xml), "sdt")[0];
  return kinderen(kind(sdt, "sdtContent"), "p")
    .filter(p => /^TOC\d$/.test(attr(kind(kind(p, "pPr"), "pStyle"), "val") ?? ""))
    .map(p => [...zoekAlle(p, "t"), ...zoekAlle(p, "tab").filter(t => t.ouder?.lokaal === "r")]
      .sort((a, b) => a.start - b.start).map(t => t.lokaal === "tab" ? "\t" : tekstVan(t)).join(""));
}

describe("inhoudsopgave: alleen paginanummers bijwerken zonder hyperlinks (#50)", () => {
  it.each([true, false])("verwisselt een langere kop niet met een uitgesloten kortere kop (tabs: %s)", rechts => {
    const koppen: Kop[] = [
      { tekst: "Plan", niveau: 3, pagina: "1" },
      { tekst: "Plan aanpak", niveau: 1, pagina: "2" },
    ];
    const bron = inhoudsopgave(koppen, rechts);
    const uit = werkInhoudsopgaveBij(bron, [{ ...koppen[0], pagina: "19" }, { ...koppen[1], pagina: "27" }], "paginas");
    expect(regels(uit.bytes)).toEqual([rechts ? "Plan aanpak\t27" : "Plan aanpak 27"]);
    expect(uit.gewijzigd).toBe(true);
  });

  it("verwart opeenvolgende koppen met dezelfde beginwoorden niet", () => {
    const koppen: Kop[] = [
      { tekst: "Plan", niveau: 1, pagina: "1" },
      { tekst: "Plan van aanpak", niveau: 1, pagina: "2" },
      { tekst: "Plan van aanpak vervolg", niveau: 2, pagina: "3" },
    ];
    const uit = werkInhoudsopgaveBij(inhoudsopgave(koppen), koppen.map((k, i) => ({ ...k, pagina: String(i + 10) })), "paginas");
    expect(regels(uit.bytes)).toEqual(["Plan\t10", "Plan van aanpak\t11", "Plan van aanpak vervolg\t12"]);
  });

  it("koppelt dezelfde tekst op een uitgesloten niveau niet aan een opgenomen kop", () => {
    const koppen: Kop[] = [
      { tekst: "Herhaling", niveau: 3, pagina: "1" },
      { tekst: "Herhaling", niveau: 1, pagina: "2" },
    ];
    const uit = werkInhoudsopgaveBij(inhoudsopgave(koppen), [{ ...koppen[0], pagina: "19" }, { ...koppen[1], pagina: "27" }], "paginas");
    expect(regels(uit.bytes)).toEqual(["Herhaling\t27"]);
  });

  it.each([true, false])("laat een verdwenen kop staan in plaats van een prefix als vervanger te kiezen (tabs: %s)", rechts => {
    const koppen: Kop[] = [
      { tekst: "Plan", niveau: 3, pagina: "1" },
      { tekst: "Plan aanpak", niveau: 1, pagina: "2" },
    ];
    const bron = inhoudsopgave(koppen, rechts);
    const uit = werkInhoudsopgaveBij(bron, [{ ...koppen[0], niveau: 1, pagina: "19" }], "paginas");
    expect(uit.gewijzigd).toBe(false);
    expect(uit.bytes).toBe(bron);
    expect(regels(uit.bytes)).toEqual([rechts ? "Plan aanpak\t2" : "Plan aanpak 2"]);
  });

  it.each([true, false])("behoudt cijfers en Romeinse tekens in de koptekst (tabs: %s)", rechts => {
    const koppen: Kop[] = [
      { tekst: "Fase 1", niveau: 1, pagina: "i" },
      { tekst: "Deel IV", niveau: 1, pagina: "A" },
      { tekst: "Bijlage A", niveau: 1, pagina: "?" },
    ];
    const nieuw = koppen.map((k, i) => ({ ...k, pagina: ["iv", "B", "12"][i] }));
    const uit = werkInhoudsopgaveBij(inhoudsopgave(koppen, rechts), nieuw, "paginas");
    expect(regels(uit.bytes)).toEqual(nieuw.map(k => `${k.tekst}${rechts ? "\t" : " "}${k.pagina}`));
    expect(werkInhoudsopgaveBij(uit.bytes, nieuw, "paginas").gewijzigd).toBe(false);
  });

  it("behoudt de volgorde van gelijknamige opgenomen koppen", () => {
    const koppen: Kop[] = [
      { tekst: "Herhaling", niveau: 1, pagina: "1" },
      { tekst: "Herhaling", niveau: 1, pagina: "2" },
    ];
    const uit = werkInhoudsopgaveBij(inhoudsopgave(koppen), koppen.map((k, i) => ({ ...k, pagina: String(i + 20) })), "paginas");
    expect(regels(uit.bytes)).toEqual(["Herhaling\t20", "Herhaling\t21"]);
  });

  it.each([true, false])("wijzigt cijfers in koptekst zonder paginanummers niet (hyperlinks: %s)", hyperlinks => {
    const koppen: Kop[] = [{ tekst: "Plan", niveau: 1, pagina: "1" }, { tekst: "Plan 1", niveau: 1, pagina: "2" }];
    const bron = inhoudsopgave(koppen, true, hyperlinks, false);
    const uit = werkInhoudsopgaveBij(bron, koppen.map(k => ({ ...k, pagina: "27" })), "paginas");
    expect(uit.gewijzigd).toBe(false);
    expect(uit.bytes).toBe(bron);
    expect(regels(uit.bytes)).toEqual(["Plan", "Plan 1"]);
  });

  it.each([true, false])("behoudt de correcte verwijzing na echte enginebewerking, opslag en heropenen (tabs: %s)", async rechts => {
    const koppen: Kop[] = [{ tekst: "Plan", niveau: 3, pagina: "1" }, { tekst: "Plan aanpak", niveau: 1, pagina: "2" }];
    const bron = inhoudsopgave(koppen, rechts);
    const origineel = Uint8Array.from(bron);
    const nieuw = [{ ...koppen[0], pagina: "19" }, { ...koppen[1], pagina: "27" }];
    const bijgewerkt = werkInhoudsopgaveBij(bron, nieuw, "paginas").bytes;
    const s = await createYrsSession();
    try {
      s.openDocx(bijgewerkt, true);
      const [t] = s.searchText("Losse proefzin.", { caseSensitive: true });
      expect(t).toBeDefined();
      s.replaceRange({ story: t.story, start: { paraId: t.paraId, offset: t.start },
        end: { paraId: t.paraId, offset: t.end } }, "Bewerkte proefzin.");
      const bewaard = (await saveYrsDocx(s)).bytes;
      expect(regels(bewaard)).toEqual([rechts ? "Plan aanpak\t27" : "Plan aanpak 27"]);
      const heropend = await createYrsSession();
      try {
        heropend.openDocx(bewaard, true);
        expect(heropend.searchText("Bewerkte proefzin.", { caseSensitive: true })).toHaveLength(1);
      } finally { heropend.destroy(); }
      expect(werkInhoudsopgaveBij(bewaard, nieuw, "paginas").gewijzigd).toBe(false);
      expect(bron).toEqual(origineel);
    } finally { s.destroy(); }
  });
});

it.each([true, false])("werkt samengestelde paginalabels volledig bij (tabs: %s)", rechts => {
  const koppen: Kop[] = [{ tekst: "Bijlage", niveau: 1, pagina: "A-12" }];
  const uit = werkInhoudsopgaveBij(inhoudsopgave(koppen, rechts), [{ ...koppen[0], pagina: "B-14" }], "paginas");
  expect(regels(uit.bytes)).toEqual([rechts ? "Bijlage\tB-14" : "Bijlage B-14"]);
  expect(werkInhoudsopgaveBij(uit.bytes, [{ ...koppen[0], pagina: "B-14" }], "paginas").gewijzigd).toBe(false);
});

it("werkt een over meerdere tekstfragmenten verdeeld paginalabel bij zonder de kop te wijzigen", () => {
  const koppen: Kop[] = [{ tekst: "Fase 12", niveau: 1, pagina: "A-12" }];
  const p = new Pakket(inhoudsopgave(koppen));
  p.schrijf("word/document.xml", p.lees("word/document.xml").replace('>A-12</w:t>', '>A-</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>12</w:t>'));
  const uit = werkInhoudsopgaveBij(p.inpakken(), [{ ...koppen[0], pagina: "B-14" }], "paginas");
  expect(regels(uit.bytes)).toEqual(["Fase 12\tB-14"]);
  expect(werkInhoudsopgaveBij(uit.bytes, [{ ...koppen[0], pagina: "B-14" }], "paginas").gewijzigd).toBe(false);
});
