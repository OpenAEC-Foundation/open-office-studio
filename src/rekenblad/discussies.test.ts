import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, kinderen, leesXml, tekstVan } from "../grafieken/xml";
import { leesCelnotities, schrijfCelnotitie } from "./celnotities";
import { leesDiscussies, wijzigDiscussie, discussieDeel } from "./discussies";
import { werkmap } from "./werkboekXml";
import {
  laadCelnotities,
  metCelnotitieAnkers,
  celDiscussies,
} from "./celnotitieAnkers";
import { werkboekBytes } from "../lint/rekenblad-filter";
const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
const nieuw = (bytes: Uint8Array = bron, cel = "B2") =>
  wijzigDiscussie(bytes, 0, {
    soort: "nieuw",
    cel,
    auteur: "Renée & Co",
    tekst: "  Vraag < 20 😀\nTweede regel  ",
  });
const deel = (p: Pakket) =>
  discussieDeel(p, werkmap(p).bladen[0].pad, "threadedComment")!;
describe("threaded comments (#71)", () => {
  it("preserves literal Office escape sequences, CR and XML control characters", () => {
    const tekst = "Literal _x000D_\r\nControl \u0001 and 😀",
      auteur = "Author _x000A_";
    const bytes = wijzigDiscussie(bron, 0, {
      soort: "nieuw",
      cel: "B2",
      auteur,
      tekst,
    });
    expect(leesDiscussies(bytes)[0][0].berichten[0]).toMatchObject({
      tekst,
      auteur,
    });
    expect(new Pakket(bytes).lees(deel(new Pakket(bytes)))).toContain(
      "_x005F_x000D_",
    );
  });
  it("recovers an omitted root ref from the mandatory fallback before reply/resolve/delete", () => {
    const p = new Pakket(nieuw()),
      pad = deel(p),
      id = leesDiscussies(p)[0][0].id;
    p.schrijf(pad, p.lees(pad).replace(' ref="B2"', ""));
    expect(leesCelnotities(p)[0]).toEqual([]);
    expect(leesDiscussies(p)[0][0].cel).toBe("B2");
    const uit = wijzigDiscussie(p.inpakken(), 0, {
      soort: "antwoord",
      id,
      auteur: "Anna",
      tekst: "Reply",
    });
    expect(leesDiscussies(uit)[0][0].berichten).toHaveLength(2);
    expect(
      leesDiscussies(
        wijzigDiscussie(p.inpakken(), 0, { soort: "verwijderen", id }),
      )[0],
    ).toEqual([]);
  });
  it("writes standard persons, UTC authorship, replies and mandatory tc= legacy placeholder", () => {
    const start = nieuw(),
      d = leesDiscussies(start)[0][0];
    const uit = wijzigDiscussie(start, 0, {
        soort: "antwoord",
        id: d.id,
        auteur: "Anna",
        tekst: "Antwoord & idee",
      }),
      p = new Pakket(uit);
    expect(leesCelnotities(uit)[0]).toEqual([]);
    expect(
      leesDiscussies(uit)[0][0].berichten.map((b) => [b.auteur, b.tekst]),
    ).toEqual([
      ["Renée & Co", "  Vraag < 20 😀\nTweede regel  "],
      ["Anna", "Antwoord & idee"],
    ]);
    const root = leesXml(p.lees(deel(p))),
      entries = kinderen(root, "threadedComment");
    expect(root.lokaal).toBe("ThreadedComments");
    expect(attr(entries[1], "parentId")).toBe(d.id);
    expect(attr(entries[0], "dT")).toMatch(/Z$/);
    expect(attr(entries[0], "personId")).not.toBe(attr(entries[1], "personId"));
    const legacyPad = p
      .relaties(werkmap(p).bladen[0].pad)
      .find((r) => r.type.endsWith("/comments"))!;
    const legacy = leesXml(
      p.lees(Pakket.doelPad(werkmap(p).bladen[0].pad, legacyPad.target)),
    );
    expect(kinderen(kind(legacy, "authors"), "author").map(tekstVan)).toContain(
      `tc=${d.id}`,
    );
    expect(
      tekstVan(kinderen(kind(legacy, "commentList"), "comment")[0]),
    ).toContain("Antwoord & idee");
    expect(p.lees("[Content_Types].xml")).toContain(
      "application/vnd.ms-excel.person+xml",
    );
    expect(p.lees("[Content_Types].xml")).toContain(
      "application/vnd.ms-excel.threadedcomments+xml",
    );
  });
  it("resolves/reopens without changing original messages, mentions or unknown parts", () => {
    const p = new Pakket(nieuw()),
      pad = deel(p),
      original = leesDiscussies(p)[0][0];
    p.schrijf(
      pad,
      p
        .lees(pad)
        .replace(
          "</threadedComment>",
          '<mentions><mention personId="keep" startIndex="1" length="2"/></mentions><extLst><ext uri="keep"/></extLst></threadedComment>',
        ),
    );
    p.schrijf("customXml/keep.xml", "<keep/>");
    const resolved = wijzigDiscussie(p.inpakken(), 0, {
      soort: "oplossen",
      id: original.id,
      opgelost: true,
    });
    expect(leesDiscussies(resolved)[0][0]).toEqual({
      ...original,
      opgelost: true,
    });
    expect(new Pakket(resolved).lees(pad)).toContain(
      '<mention personId="keep"',
    );
    expect(new Pakket(resolved).lees("customXml/keep.xml")).toBe("<keep/>");
    expect(() =>
      wijzigDiscussie(resolved, 0, {
        soort: "antwoord",
        id: original.id,
        auteur: "Anna",
        tekst: "No",
      }),
    ).toThrow();
    expect(
      leesDiscussies(
        wijzigDiscussie(resolved, 0, {
          soort: "oplossen",
          id: original.id,
          opgelost: false,
        }),
      )[0][0].opgelost,
    ).toBe(false);
  });
  it("refuses to replace a classical note, refuses malformed threads and protected sheets atomically", () => {
    const note = schrijfCelnotitie(bron, 0, "B2", {
      auteur: "Anna",
      tekst: "Keep",
      zichtbaar: true,
    });
    expect(() => nieuw(note)).toThrow();
    expect(leesCelnotities(note)[0][0].tekst).toBe("Keep");
    const p = new Pakket(nieuw()),
      pad = deel(p);
    p.schrijf(
      pad,
      p.lees(pad).replace('personId="', 'parentId="missing" personId="'),
    );
    expect(() => leesDiscussies(p)).toThrow();
    const q = new Pakket(bron);
    q.schrijf(
      "xl/worksheets/sheet1.xml",
      q
        .lees("xl/worksheets/sheet1.xml")
        .replace("</worksheet>", '<sheetProtection sheet="1"/></worksheet>'),
    );
    expect(() => nieuw(q.inpakken())).toThrow("protectedSheet");
  });
  it("deletes one whole thread and its fallback, retaining other notes and people", () => {
    let bytes = nieuw();
    const id = leesDiscussies(bytes)[0][0].id;
    bytes = wijzigDiscussie(bytes, 0, {
      soort: "antwoord",
      id,
      auteur: "Anna",
      tekst: "Reply",
    });
    bytes = nieuw(bytes, "D5");
    bytes = schrijfCelnotitie(bytes, 0, "E6", {
      auteur: "Classic",
      tekst: "Stay",
      zichtbaar: true,
    });
    const uit = wijzigDiscussie(bytes, 0, { soort: "verwijderen", id });
    expect(leesDiscussies(uit)[0].map((d) => d.cel)).toEqual(["D5"]);
    expect(leesCelnotities(uit)[0].map((n) => n.cel)).toEqual(["E6"]);
    const p = new Pakket(uit);
    expect(p.lees(deel(p))).not.toContain(id);
    expect(
      p
        .namen()
        .filter((n) => n.endsWith(".vml"))
        .map((n) => p.lees(n))
        .join(""),
    ).not.toContain("<x:Row>1</x:Row>");
  });
  it("keeps threads and fallbacks anchored through real row/column edits, Undo/Redo, save and reopen", () => {
    const h = openWorkbook(metCelnotitieAnkers(nieuw()));
    try {
      laadCelnotities(h, h.save());
      const save = () => werkboekBytes({ handle: h, save: () => h.save() });
      h.applyOps([
        { type: "insertRows", sheet: 0, at: 1, count: 2 },
        { type: "insertCols", sheet: 0, at: 1, count: 1 },
      ]);
      expect(celDiscussies(h, 0)[0].cel).toBe("C4");
      const uit = save();
      expect(leesDiscussies(uit)[0][0].cel).toBe("C4");
      const p = new Pakket(uit);
      expect(
        p
          .namen()
          .filter((n) => /^xl\/comments/.test(n))
          .map((n) => p.lees(n))
          .join(""),
      ).toContain('ref="C4"');
      expect(leesDiscussies(save())[0][0].cel).toBe("C4");
      h.undo();
      expect(leesDiscussies(save())[0][0].cel).toBe("B2");
      h.redo();
      expect(leesDiscussies(save())[0][0].cel).toBe("C4");
      h.applyOps([{ type: "deleteRows", sheet: 0, at: 3, count: 1 }]);
      expect(celDiscussies(h, 0)).toEqual([]);
      expect(leesDiscussies(save())[0]).toEqual([]);
      h.undo();
      expect(leesDiscussies(save())[0][0].cel).toBe("C4");
      const terug = openWorkbook(metCelnotitieAnkers(uit));
      try {
        laadCelnotities(terug, terug.save());
        expect(celDiscussies(terug, 0)[0].cel).toBe("C4");
      } finally {
        terug.dispose();
      }
    } finally {
      h.dispose();
    }
  });
});
