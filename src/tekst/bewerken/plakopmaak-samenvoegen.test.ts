import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { applyClipboardFragment, createYrsSession, saveYrsDocx, type YrsSession, type YrsStoryRange } from "@betteroffice/docx/yrs";
import { unzipSync } from "fflate";
import { maakPlaksessie, pasPlakOpmaakToe, type Plaksessie } from "./plakopmaak";
import { deltaUitHtml, koppelOpmaak, type PlakKeuze } from "./plakopties";

const bytes = new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"));
const html = '<p><b style="font-size:16pt;color:#c00000">Rood 😀</b> <i>schuin</i></p><p><u>Einde</u></p>';
const fragment = { paragraphs: [{ text: "Rood 😀 schuin" }, { text: "Einde" }] };

function stand(s: YrsSession) {
  return Object.fromEntries(s.storyIds().sort().map(id => [id, s.storySegments(id)]));
}

/** Onafhankelijke tekenroute: eerst de basis en daarna HTML, zoals vóór samenvoegen. */
function referentie(s: YrsSession, plak: Plaksessie, keuze: PlakKeuze) {
  const per = plak.html ? koppelOpmaak(plak.stukken.map(p => p.tekst).join("\n"), plak.html) : [];
  let cursor = 0;
  for (const stuk of plak.stukken) {
    for (let k = 0; k < stuk.tekst.length; k++) {
      // Een surrogaatpaar krijgt één volledige typed tekenbewerking.
      if (k > 0 && /[\udc00-\udfff]/.test(stuk.tekst[k]) && /[\ud800-\udbff]/.test(stuk.tekst[k - 1])) continue;
      const lengte = /[\ud800-\udbff]/.test(stuk.tekst[k]) ? 2 : 1;
      const range: YrsStoryRange = { story: plak.story, start: { paraId: stuk.paraId, offset: stuk.posities[k] }, end: { paraId: stuk.paraId, offset: stuk.posities[k] + lengte } };
      if (plak.basis) s.formatRange(range, plak.basis.delta);
      const opmaak = per[cursor + k];
      if (keuze !== "tekst" && opmaak) s.formatRange(range, deltaUitHtml(opmaak, keuze === "samenvoegen"));
      if (plak.basis?.positie === "normaal" && s.selectionContext(range).superscript === true) s.toggleMark(range, { type: "superscript" });
    }
    cursor += stuk.tekst.length + 1;
  }
}

describe("basis en HTML-plakopmaak eenmaal schrijven", () => {
  it.each(["behouden", "samenvoegen", "tekst"] as const)("behoudt bij %s alle verhalen, marks, DOCX-onderdelen en één Undo", async keuze => {
    const a = await createYrsSession({ clientId: 58 }), b = await createYrsSession({ clientId: 58 });
    try {
      for (const s of [a, b]) s.openDocx(bytes, true);
      const staart = a.paragraphSpans("body").at(-1)!, start = { story: "body", paraId: staart.paraId, offset: staart.length };
      const range = { story: "body", start, end: start };
      const eind = [a, b].map(s => applyClipboardFragment(s, range, fragment));
      for (const s of [a, b]) {
        const eerste = { story: "body", start, end: { ...start, offset: start.offset + 4 } };
        s.setHyperlink(eerste, { href: "https://example.org/proef" });
        s.toggleMark(eerste, { type: "superscript" });
        s.deleteRange({ story: "body", start: { ...start, offset: start.offset + 1 }, end: { ...start, offset: start.offset + 3 } },
          { name: "Proef", date: "2026-11-03T08:00:00Z" });
        s.beginUndoCapture(); s.setUndoCaptureMode("manual"); s.addUndoBoundary();
      }
      const voor = stand(a);
      const plak = [a, b].map((s, i) => {
        const gelezen = s.readParagraphs({ story: "body", view: "accepted" });
        if (!gelezen.ok) throw Error("Geen tekst");
        return maakPlaksessie(gelezen.paragraphs, start, eind[i], html,
          { delta: { bold: false, italic: false, underline: false, strike: true, fontSize: 11, fontFamily: { ascii: "Carlito", hAnsi: "Carlito" }, color: { rgb: "123456" }, highlight: null }, positie: "normaal", stijl: null },
          { x: 0, y: 0 }, s)!;
      });
      const enkel = vi.spyOn(a, "formatRange"), batch = vi.spyOn(b, "applyRawOps");
      referentie(a, plak[0], keuze); pasPlakOpmaakToe(b, plak[1], keuze);
      expect(stand(b)).toEqual(stand(a));
      expect(batch).toHaveBeenCalledOnce();
      expect(batch.mock.calls[0][1].length).toBeLessThan(enkel.mock.calls.length);
      const na = stand(b);
      for (const s of [a, b]) { s.addUndoBoundary(); expect(s.undo()).toBe(true); expect(stand(s)).toEqual(voor); expect(s.redo()).toBe(true); expect(stand(s)).toEqual(na); }
      const zip = await Promise.all([a, b].map(async s => unzipSync((await saveYrsDocx(s, { updateModifiedDate: false })).bytes)));
      expect(Object.keys(zip[1]).sort()).toEqual(Object.keys(zip[0]).sort());
      for (const naam of Object.keys(zip[0])) expect(zip[1][naam], naam).toEqual(zip[0][naam]);
    } finally { a.destroy(); b.destroy(); }
  }, 20_000); // Inclusief twee volledige DOCX-exporten, referentieroute en geschiedenis.
});
