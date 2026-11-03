import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession, readTableFragment, saveYrsDocx, type YrsInlineFormatDelta, type YrsSession, type YrsStoryRange } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { pasOpmaakBatchToe, type OpmaakOpdracht } from "./opmaakbatch";

async function tweetal() {
  const bytes = new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"));
  const a = await createYrsSession({ clientId: 42 }), b = await createYrsSession({ clientId: 42 });
  a.openDocx(bytes, true); b.openDocx(bytes, true);
  return { a, b, klaar: () => { a.destroy(); b.destroy(); } };
}

function stand(s: YrsSession) {
  return Object.fromEntries(s.storyIds().map(story => [story, s.storySegments(story)]));
}

describe("plakopmaak gebundeld in de Rust-engine", () => {
  it("houdt alle tekenvelden, tabelverhalen, UTF-16-tekst en ongedaan maken gelijk aan formatRange", async () => {
    const p = await tweetal();
    try {
      const deltas: YrsInlineFormatDelta[] = [
        { bold: true, italic: false, underline: true, strike: false },
        { bold: false, italic: true, underline: false, strike: true },
        { fontFamily: { ascii: "Carlito", hAnsi: "Carlito" }, fontSize: 11.25, color: { rgb: "C00000" }, highlight: "yellow" },
        { fontFamily: { ascii: "Caladea" }, fontSize: 14, color: { themeColor: "accent1" } },
        { fontSize: 0.1 }, { fontSize: 0.25 }, { fontSize: 0.5 },
        { bold: null, italic: null, underline: null, strike: null, fontFamily: null, fontSize: null, color: null, highlight: null },
      ];
      const eerste = p.a.paragraphs("body")[0];
      for (const s of [p.a, p.b]) s.insertText({ story: "body", paraId: eerste.paraId, offset: 0 }, "A😀é ");
      const voor = stand(p.a);
      // Deze vergelijkingsproef bewerkt ook verschillende celverhalen in één groep.
      for (const s of [p.a, p.b]) { s.setUndoCaptureMode("manual"); s.addUndoBoundary(); }
      let meldingen = 0;
      const weg = p.b.onUpdate(() => meldingen++);
      for (const story of p.a.storyIds()) {
        for (const delta of deltas) {
          const opdrachten: OpmaakOpdracht[] = [];
          for (const para of p.a.paragraphSpans(story)) {
            if (!para.length) continue;
            const bereik = { story, start: { paraId: para.paraId, offset: 0 }, end: { paraId: para.paraId, offset: para.length } };
            p.a.formatRange(bereik, delta); opdrachten.push({ bereik, delta });
          }
          expect(pasOpmaakBatchToe(p.b, opdrachten)).toBe(true);
          expect(stand(p.b)).toEqual(stand(p.a));
        }
      }
      weg();
      expect(stand(p.b)).toEqual(stand(p.a));
      expect(meldingen).toBeLessThanOrEqual(p.b.storyIds().length * deltas.length);
      for (const s of [p.a, p.b]) { s.addUndoBoundary(); expect(s.undo()).toBe(true); }
      expect(stand(p.a)).toEqual(voor);
      expect(stand(p.b)).toEqual(voor);
      for (const s of [p.a, p.b]) expect(s.redo()).toBe(true);
      expect(stand(p.b)).toEqual(stand(p.a));
    } finally { p.klaar(); }
  });

  it("behoudt hyperlinks en revisiestempels bij deelbereiken en overschrijft geen buurtekst", async () => {
    const p = await tweetal();
    try {
      const eerste = p.a.paragraphs("body")[0], volgende = p.a.paragraphs("body")[1];
      const range: YrsStoryRange = { story: "body", start: { paraId: eerste.paraId, offset: 1 }, end: { paraId: eerste.paraId, offset: 8 } };
      for (const s of [p.a, p.b]) {
        s.setHyperlink(range, { href: "https://example.org/proef" });
        s.insertText({ story: "body", paraId: eerste.paraId, offset: 2 }, "😀", { name: "Proefauteur", date: "2026-11-03T08:00:00Z" });
      }
      const opdrachten: OpmaakOpdracht[] = [
        { bereik: { ...range, start: { paraId: eerste.paraId, offset: 3 }, end: { paraId: eerste.paraId, offset: 6 } }, delta: { bold: false, color: { rgb: "123456" } } },
        { bereik: { story: "body", start: { paraId: eerste.paraId, offset: 11 }, end: { paraId: volgende.paraId, offset: 4 } }, delta: { underline: true } },
      ];
      for (const o of opdrachten) p.a.formatRange(o.bereik, o.delta);
      expect(pasOpmaakBatchToe(p.b, opdrachten)).toBe(true);
      expect(stand(p.b)).toEqual(stand(p.a));
      expect(p.b.listRevisions().map(r => r.kind)).toEqual(p.a.listRevisions().map(r => r.kind));
    } finally { p.klaar(); }
  });

  it("weigert onbekende velden, verhalen en ongeldige grenzen vóór een schrijfopdracht", () => {
    const schrijven = vi.fn(), s = { applyRawOps: schrijven, paragraphSpans: () => [{ paraId: "a", length: 4 }] } as unknown as YrsSession;
    const bereik: YrsStoryRange = { story: "body", start: { paraId: "a", offset: 0 }, end: { paraId: "a", offset: 4 } };
    for (const opdrachten of [
      [{ bereik, delta: { bold: true } }, { bereik, delta: { other: { superscript: true } } }],
      [{ bereik, delta: { bold: true } }, { bereik: { ...bereik, story: "ander" }, delta: { bold: true } }],
      [{ bereik: { ...bereik, end: { paraId: "a", offset: 5 } }, delta: { bold: true } }],
      [{ bereik: { ...bereik, end: { paraId: "ontbreekt", offset: 0 } }, delta: { bold: true } }],
      [{ bereik, delta: { fontSize: 1e100 } }],
    ]) expect(pasOpmaakBatchToe(s, opdrachten)).toBe(false);
    expect(schrijven).not.toHaveBeenCalled();
  });

  it("houdt afwijkende geërfde tabelmarges na plakken, opmaken en opnieuw openen", async () => {
    const pakket = unzipSync(new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx")));
    const stijlen = strFromU8(pakket["word/styles.xml"]);
    const aangepast = stijlen.replace(/(<w:(?:left|right)\b[^>]*w:w=")108(")/g, (_, a, b) => `${a}360${b}`);
    expect(aangepast).not.toBe(stijlen);
    pakket["word/styles.xml"] = strToU8(aangepast);
    const s = await createYrsSession(), terug = await createYrsSession();
    try {
      s.openDocx(zipSync(pakket), true);
      const fragment = readTableFragment(s, { story: "body", tableIndex: 0 });
      const einde = s.paragraphs("body").at(-1)!;
      s.insertTableFragment({ story: "body", paraId: einde.paraId, offset: einde.text.length }, fragment);
      const opdrachten = s.paragraphSpans("body").filter(p => p.length > 0).map(p => ({
        bereik: { story: "body", start: { paraId: p.paraId, offset: 0 }, end: { paraId: p.paraId, offset: p.length } },
        delta: { bold: true, color: { rgb: "123456" } },
      }));
      expect(pasOpmaakBatchToe(s, opdrachten)).toBe(true);
      terug.openDocx((await saveYrsDocx(s)).bytes, true);
      const tabellen = terug.storySegments("body").filter(d => d.kind === "embed" && d.embedKind === "table");
      expect(tabellen).toHaveLength(2);
      for (const t of tabellen) {
        if (t.kind !== "embed") throw Error("Geen tabel");
        expect(t.payload.tblPr).toMatchObject({ cellMargins: { left: 360, right: 360 } });
      }
    } finally { s.destroy(); terug.destroy(); }
  });
});
