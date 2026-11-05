/** Geaccepteerde cursortekst blijft gebonden aan precies deze bron en alinea. */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import type { DocxEditorRef, DocxPluginContext } from "@betteroffice/docx-react";
import type { Controleur } from "../controleur";
import { SpellingSessie, type PluginStaat } from "./sessie";

function proef() {
  let versie = "1", loc = { story: "body", paraId: "p0", offset: 4 };
  const teksten = new Map([["body|p0", "abc "], ["body|p1", "def "], ["body:t0:r0c0|p0", "cel "]]);
  const native = {
    version: vi.fn((): string => versie),
    readParagraphs: vi.fn(({ story, paraIds }: { story: string; paraIds: string[] }) => ({
      ok: true, version: versie, paragraphs: [{ story, paraId: paraIds[0], text: teksten.get(story+"|"+paraIds[0])! }],
    })),
    paragraphSpans: () => [{ paraId: "p0", length: 4 }, { paraId: "p1", length: 4 }],
    locateParagraph: () => ({ start: 0, end: 4 }),
  };
  let actief = native;
  const ed = { getYrsSession: () => actief, getSelectionRange: () => ({ from: 0, to: 0 }), displayPositionToYrsLoc: () => loc, hasPendingInput: () => false };
  const editor = { getEditorRef: () => ed } as unknown as DocxEditorRef;
  const sessie = new SpellingSessie(() => editor, () => ({}) as Controleur);
  return { sessie, native, teksten, versie: (v: string) => { versie = v; }, loc: (v: typeof loc) => { loc = v; }, vervang: (v: typeof native) => { actief = v; } };
}

// De grote bron hoort bij de testopzet; de lees-/cachecontroles zelf
// behouden de standaardlimiet van vijf seconden en alle inhoudsasserties.
let echteBron: Awaited<ReturnType<typeof createYrsSession>> | undefined;
beforeAll(async () => {
  echteBron = await createYrsSession({ clientId: 71 });
  echteBron.openDocx(new Uint8Array(readFileSync("docs/tests/writer-lettertypeworker/tabelbron-256.docx")), true);
}, 30_000);
afterAll(() => echteBron?.destroy());

describe("geaccepteerde alinealezing voor spellingcursor en autocorrectie", () => {
  it("leest een echte alinea met tabelanker eenmaal en behoudt de geaccepteerde offset", async () => {
    const native = echteBron!;
    const p = native.paragraphs("body").at(-1)!, lengte = native.paragraphSpans("body").at(-1)!.length;
    expect(lengte).toBe(p.text.length+1);
    const editor = { getEditorRef: () => ({ getYrsSession: () => native, getSelectionRange: () => ({ from: 0, to: 0 }), displayPositionToYrsLoc: () => ({ story: "body", paraId: p.paraId, offset: lengte }) }) } as unknown as DocxEditorRef;
    const sessie = new SpellingSessie(() => editor, () => ({}) as Controleur), lezen = vi.spyOn(native, "readParagraphs");
    for (let i = 0; i < 20; i++) expect(sessie.cursor()).toEqual({ story: "body", paraId: p.paraId, offset: p.text.length });
    expect(lezen).toHaveBeenCalledTimes(1);
  });

  it("ververst na een bronwijziging, ook als de alinea-id gelijk blijft", () => {
    const p = proef();
    p.sessie.cursor(); p.sessie.cursor();
    expect(p.native.readParagraphs).toHaveBeenCalledTimes(1);
    p.versie("2"); p.teksten.set("body|p0", "XYZ ");
    p.sessie.cursor(); p.sessie.cursor();
    expect(p.native.readParagraphs).toHaveBeenCalledTimes(2);
  });

  it("houdt dezelfde id in een ander verhaal en een andere alinea apart", () => {
    const p = proef();
    p.sessie.cursor(); p.loc({ story: "body:t0:r0c0", paraId: "p0", offset: 4 }); p.sessie.cursor();
    p.loc({ story: "body", paraId: "p1", offset: 4 }); p.sessie.cursor();
    expect(p.native.readParagraphs.mock.calls.map(([a]) => a)).toEqual([
      { view: "accepted", story: "body", paraIds: ["p0"] },
      { view: "accepted", story: "body:t0:r0c0", paraIds: ["p0"] },
      { view: "accepted", story: "body", paraIds: ["p1"] },
    ]);
  });

  it("hergebruikt geen antwoord van een andere documentsessie met dezelfde versie", () => {
    const p = proef(); p.sessie.cursor();
    const tweede = { ...p.native, readParagraphs: vi.fn(p.native.readParagraphs.getMockImplementation()!) };
    p.vervang(tweede); p.sessie.cursor(); p.sessie.cursor();
    expect(tweede.readParagraphs).toHaveBeenCalledTimes(1);
  });

  it("leest zonder betrouwbare bronversie opnieuw in plaats van de cursor te verliezen", () => {
    const p = proef(); p.native.version.mockImplementation(() => { throw Error("Versie tijdelijk onbekend"); });
    for (let i = 0; i < 2; i++) expect(p.sessie.cursor()).toEqual({ story: "body", paraId: "p0", offset: 4 });
    expect(p.native.readParagraphs).toHaveBeenCalledTimes(2);
  });

  it("deelt de versiebewaakte lezing met de autocorrectie", () => {
    const p = proef(), applyEdits = vi.fn(async (_a: { expectVersion: string; steps: unknown[] }) => ({ ok: true }));
    p.sessie.bijContext({ edits: { applyEdits } } as unknown as DocxPluginContext<PluginStaat>);
    p.sessie.autocorrigeer(" ", 0);
    expect(p.native.readParagraphs).toHaveBeenCalledTimes(1);
    expect(applyEdits).toHaveBeenCalledOnce();
    expect(applyEdits.mock.calls[0][0].expectVersion).toBe("1");
  });

  it("bewaart een antwoord met een afwijkende leesversie niet", () => {
    const p = proef();
    p.native.readParagraphs.mockReturnValueOnce({ ok: true, version: "ouder", paragraphs: [{ story: "body", paraId: "p0", text: "abc " }] });
    p.sessie.cursor(); p.sessie.cursor(); p.sessie.cursor();
    expect(p.native.readParagraphs).toHaveBeenCalledTimes(2);
  });

  it("bewaart geen lezing als de bron tijdens het lezen verandert", () => {
    const p = proef(), lezen = p.native.readParagraphs.getMockImplementation()!;
    p.native.readParagraphs.mockImplementationOnce((a) => {
      const antwoord = lezen(a); p.versie("2"); return antwoord;
    });
    p.sessie.cursor(); p.sessie.cursor(); p.sessie.cursor();
    expect(p.native.readParagraphs).toHaveBeenCalledTimes(2);
  });

  it("bewaart geen antwoord voor een andere alinea of een ander verhaal", () => {
    const p = proef();
    p.native.readParagraphs.mockReturnValueOnce({ ok: true, version: "1", paragraphs: [{ story: "body", paraId: "ander", text: "abc " }] });
    p.native.readParagraphs.mockReturnValueOnce({ ok: true, version: "1", paragraphs: [{ story: "ander", paraId: "p0", text: "abc " }] });
    p.sessie.cursor(); p.sessie.cursor(); p.sessie.cursor(); p.sessie.cursor();
    expect(p.native.readParagraphs).toHaveBeenCalledTimes(3);
  });

  it("laat de vorige cursorlezing los bij stoppen", () => {
    const p = proef();
    vi.stubGlobal("window", { clearTimeout: vi.fn() });
    try {
      p.sessie.cursor(); p.sessie.stop(); p.sessie.cursor();
      expect(p.native.readParagraphs).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
});
