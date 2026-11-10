import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { zorgVoorKopVoet } from "../pagina/kopvoet";
import { voegNootIn } from "../pagina/noten";
import { navigatieAlineaTekst } from "./navigatieAlineaTekst";

const SJABLOON = readFileSync("public/templates/nieuw.docx");
const unit = (delen: unknown[][]) =>
  delen as ReturnType<YrsSession["storySegmentUnits"]>;
const mark = { kind: "pilcrow", paraId: "p1", properties: {} };
const terugval = () => [
  { paraId: "p0", text: "oud", properties: {} },
  { paraId: "p1", text: "terugval", properties: {} },
];

describe("ruwe tekst van alleen de cursoralinea", () => {
  it("leest één unit, houdt revisietekst en slaat embeds over", () => {
    const bron = {
      storySegmentUnits: vi.fn(() =>
        unit([
          [
            { kind: "text", text: "A😀" },
            { kind: "embed", embedKind: "tab" },
            { kind: "text", text: "oud", attributes: { deletion: true } },
            mark,
          ],
        ]),
      ),
      paragraphs: vi.fn(terugval),
    };
    expect(navigatieAlineaTekst(bron, "fn:1", "p1", 1)).toBe("A😀oud");
    expect(bron.storySegmentUnits).toHaveBeenCalledExactlyOnceWith("fn:1", [1]);
    expect(bron.paragraphs).not.toHaveBeenCalled();
  });

  const afwijkend: { naam: string; delen: unknown[][] }[] = [
    { naam: "ontbrekende unit", delen: [] },
    { naam: "lege unit", delen: [[]] },
    { naam: "andere alinea", delen: [[{ ...mark, paraId: "anders" }]] },
    { naam: "dubbele alineamarkering", delen: [[mark, mark]] },
  ];
  it.each(afwijkend)("houdt de oude route bij $naam", ({ delen }) => {
    const bron = {
      storySegmentUnits: vi.fn(() => unit(delen)),
      paragraphs: vi.fn(terugval),
    };
    expect(navigatieAlineaTekst(bron, "body", "p1", 1)).toBe("terugval");
    expect(bron.paragraphs).toHaveBeenCalledExactlyOnceWith("body");
  });

  it("valt terug na een mislukte lezing, maar niet voor een lege alinea", () => {
    const bron = {
      storySegmentUnits: vi.fn(() => {
        throw Error("oude indeling");
      }),
      paragraphs: vi.fn(terugval),
    };
    expect(navigatieAlineaTekst(bron, "body", "p1", 1)).toBe("terugval");
    bron.paragraphs.mockClear();
    expect(
      navigatieAlineaTekst(
        { ...bron, storySegmentUnits: () => unit([[mark]]) },
        "body",
        "p1",
        1,
      ),
    ).toBe("");
    expect(bron.paragraphs).not.toHaveBeenCalled();
  });

  it("komt met echte Unicode, tekstwijzigingen en alineaovergangen exact overeen", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(SJABLOON, true);
      const id = s.paragraphs("body")[0].paraId;
      s.insertText(
        { story: "body", paraId: id, offset: 0 },
        "A😀 e\u0301 👩‍💻\tZ",
      );
      s.splitParagraph({ story: "body", paraId: id, offset: 1 });
      const expected = s.paragraphs("body"),
        version = s.version();
      const lees = vi.spyOn(s, "paragraphs");
      expected.forEach((p, i) =>
        expect(navigatieAlineaTekst(s, "body", p.paraId, i)).toBe(p.text),
      );
      expect(lees).not.toHaveBeenCalled();
      expect(s.version()).toBe(version);
    } finally {
      s.destroy();
    }
  });

  it("filtert geen bijgehouden verwijderingen en volgt Undo/Redo zonder tekstcache", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(SJABLOON, true);
      s.beginUndoCapture();
      const id = s.paragraphs("body")[0].paraId;
      s.insertText({ story: "body", paraId: id, offset: 0 }, "Een oude zin");
      s.addUndoBoundary();
      s.deleteRange(
        {
          story: "body",
          start: { paraId: id, offset: 4 },
          end: { paraId: id, offset: 9 },
        },
        { name: "Auteur", date: "2026-11-10T09:00:00Z" },
      );
      s.addUndoBoundary();
      const accepted = s.readParagraphs({
        story: "body",
        view: "accepted",
        paraIds: [id],
      });
      expect(accepted.ok && accepted.paragraphs[0].text).not.toBe(
        s.paragraphs("body")[0].text,
      );
      const controleer = () =>
        expect(navigatieAlineaTekst(s, "body", id, 0)).toBe(
          s.paragraphs("body")[0].text,
        );
      controleer();
      expect(s.undo()).toBe(true);
      controleer();
      expect(s.redo()).toBe(true);
      controleer();
    } finally {
      s.destroy();
    }
  });

  it("leest ook kop/voet, noten en geneste cellen met dezelfde tekst als de native route", async () => {
    const pakket = new Pakket(SJABLOON);
    pakket.schrijf(
      "word/document.xml",
      pakket
        .lees("word/document.xml")
        .replace(
          /<w:body>[\s\S]*?<\/w:body>/,
          "<w:body><w:p><w:r><w:t>Begin __F__ en __E__.</w:t></w:r></w:p><w:sectPr/></w:body>",
        ),
    );
    let bytes = pakket.inpakken();
    bytes = zorgVoorKopVoet(bytes, 0, "header")!;
    bytes = zorgVoorKopVoet(bytes, 0, "footer")!;
    bytes = voegNootIn(bytes, "__F__", "voetnoot", "Voet😀").bytes;
    bytes = voegNootIn(bytes, "__E__", "eindnoot", "Eind e\u0301").bytes;
    const s = await createYrsSession();
    try {
      s.openDocx(bytes, true);
      const id = s.paragraphs("body")[0].paraId;
      const cel = s.insertTable({ story: "body", paraId: id, offset: 0 }, 1, 1)
        .createdStoryIds[0];
      const binnen = s.insertTable(
        { story: cel, paraId: s.paragraphs(cel)[0].paraId, offset: 0 },
        1,
        1,
      ).createdStoryIds[0];
      s.insertText(
        { story: binnen, paraId: s.paragraphs(binnen)[0].paraId, offset: 0 },
        "Cel 😀",
      );
      const expected = s
        .storyIds()
        .map((story) => ({ story, paragraphs: s.paragraphs(story) }));
      expect(expected.length).toBeGreaterThanOrEqual(7);
      expect(expected.flatMap((r) => r.paragraphs.map((p) => p.text))).toEqual(
        expect.arrayContaining([" Voet😀", " Eind e\u0301", "Cel 😀"]),
      );
      const lees = vi.spyOn(s, "paragraphs"),
        version = s.version();
      expected.forEach((r) =>
        r.paragraphs.forEach((p, i) =>
          expect(navigatieAlineaTekst(s, r.story, p.paraId, i)).toBe(p.text),
        ),
      );
      expect(lees).not.toHaveBeenCalled();
      expect(s.version()).toBe(version);
    } finally {
      s.destroy();
    }
  });
});
