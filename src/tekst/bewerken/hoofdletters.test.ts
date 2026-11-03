import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import {
  createYrsSession,
  saveYrsDocx,
  type YrsSession,
} from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { tekenVervangingen } from "../../lint/tekst-logica";
import { vervangHoofdletters } from "./hoofdletters";

const zin =
  "Dit is een gewone alinea voor de Windows-test van regelafstand, inspringing en paginaopmaak. De tekst loopt automatisch over meerdere regels zodat een wijziging van de regelafstand goed zichtbaar wordt. Alle woorden in dit document zijn zelfgemaakte proeftekst.";
const lang = [zin, zin, zin].join(" ");
async function proef(tekst: string) {
  const pakket = unzipSync(readFileSync("public/templates/nieuw.docx"));
  pakket["word/document.xml"] = strToU8(
    strFromU8(pakket["word/document.xml"]).replace(
      /<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/,
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${tekst.slice(0, 10)}</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${tekst.slice(10)}</w:t></w:r></w:p>`,
    ),
  );
  const s = await createYrsSession();
  s.openDocx(zipSync(pakket), true);
  return s;
}
function omhulsel(s: YrsSession) {
  const ref = {
    applyEdits: vi.fn(async (r) => s.applyEdits(r)),
    validateEdits: vi.fn(async (r) => s.validateEdits(r)),
    getEditorRef: () => ({
      getYrsSession: () => s,
      syncYrsInputState: vi.fn(),
      relayout: vi.fn(),
    }),
  };
  return { ref: ref as unknown as DocxEditorRef, controle: ref };
}
function lees(s: YrsSession) {
  const r = s.readParagraphs({ view: "accepted" });
  if (!r.ok) throw new Error("Lezen mislukt");
  return { p: r.paragraphs[0], versie: r.version };
}
const segmenten = (s: YrsSession) =>
  s.storySegments("body").filter((d) => d.kind === "text");

describe("hoofdletters boven de engine-batchlimiet (#142)", () => {
  it.each([128, 129, 785])(
    "behoudt opmaak, één Undo/Redo en DOCX-heropening bij %i tekens",
    async (lengte) => {
      const tekst = lengte === 785 ? lang : "a".repeat(lengte);
      const s = await proef(tekst),
        terug = await createYrsSession();
      try {
        const { ref, controle } = omhulsel(s),
          { p, versie } = lees(s);
        const voor = segmenten(s);
        const wijzigingen = tekenVervangingen(tekst, tekst.toUpperCase())!;
        expect(await vervangHoofdletters(ref, p, versie, wijzigingen)).toBe(
          true,
        );
        expect(lees(s).p.text).toBe(tekst.toUpperCase());
        expect(segmenten(s)).toEqual(
          voor.map((d) =>
            d.kind === "text" ? { ...d, text: d.text.toUpperCase() } : d,
          ),
        );
        expect(
          controle.validateEdits.mock.calls.every(
            ([r]) => r.steps.length <= 128,
          ),
        ).toBe(true);
        expect(s.undo()).toBe(true);
        expect(lees(s).p.text).toBe(tekst);
        expect(segmenten(s)).toEqual(voor);
        expect(s.canUndo()).toBe(false);
        expect(s.redo()).toBe(true);
        expect(lees(s).p.text).toBe(tekst.toUpperCase());
        const bytes = (await saveYrsDocx(s)).bytes;
        terug.openDocx(bytes, true);
        expect(lees(terug).p.text).toBe(tekst.toUpperCase());
        expect(segmenten(terug)).toEqual(segmenten(s));
      } finally {
        s.destroy();
        terug.destroy();
      }
    },
  );
  it("valideert alle batches vóór een wijziging en weigert een late fout zonder deelresultaat", async () => {
    const s = await proef(lang);
    try {
      const { ref, controle } = omhulsel(s),
        { p, versie } = lees(s);
      controle.validateEdits.mockImplementationOnce(async (r) =>
        s.validateEdits(r),
      );
      controle.validateEdits.mockImplementationOnce(async () => ({
        ok: false,
        version: versie,
        failure: { code: "locked-target", message: "Locked" },
      }));
      expect(
        await vervangHoofdletters(
          ref,
          p,
          versie,
          tekenVervangingen(lang, lang.toUpperCase())!,
        ),
      ).toBe(false);
      expect(lees(s).p.text).toBe(lang);
      expect(s.canUndo()).toBe(false);
    } finally {
      s.destroy();
    }
  });
  it("behoudt Unicode, bijgehouden wijzigingen en de opnamemodus", async () => {
    const tekst = "é😀abc ".repeat(80),
      s = await proef(tekst);
    try {
      const { ref } = omhulsel(s),
        { p, versie } = lees(s);
      const modus = s.undoCaptureMode();
      expect(
        await vervangHoofdletters(
          ref,
          p,
          versie,
          tekenVervangingen(tekst, tekst.toUpperCase())!,
          { author: "Proefauteur", date: "2026-11-03T14:00:00Z" },
        ),
      ).toBe(true);
      expect(lees(s).p.text).toBe(tekst.toUpperCase());
      expect(s.undoCaptureMode()).toBe(modus);
      const xml = strFromU8(
        unzipSync((await saveYrsDocx(s)).bytes)["word/document.xml"],
      );
      expect(xml).toContain("<w:ins");
      expect(xml).toContain("<w:del");
      expect(xml).toContain("Proefauteur");
      expect(s.undo()).toBe(true);
      expect(lees(s).p.text).toBe(tekst);
      expect(s.redo()).toBe(true);
      expect(lees(s).p.text).toBe(tekst.toUpperCase());
    } finally {
      s.destroy();
    }
  });
  it.each([false, true])(
    "behoudt bestaande verwijderingen en hun conflictafhandeling (bijhouden: %s)",
    async (bijhouden) => {
      const s = await proef(lang);
      try {
        const eerst = lees(s).p;
        s.deleteRange(
          {
            story: eerst.story,
            start: { paraId: eerst.paraId, offset: 0 },
            end: { paraId: eerst.paraId, offset: 7 },
          },
          { name: "Eerdere auteur", date: "2026-11-03T13:00:00Z" },
        );
        const { ref, controle } = omhulsel(s),
          { p, versie } = lees(s);
        expect(
          await vervangHoofdletters(
            ref,
            p,
            versie,
            tekenVervangingen(p.text, p.text.toUpperCase())!,
            bijhouden
              ? { author: "Nieuwe auteur", date: "2026-11-03T14:00:00Z" }
              : undefined,
          ),
        ).toBe(!bijhouden);
        if (bijhouden) {
          const validatie = await controle.validateEdits.mock.results[0].value;
          expect(validatie.ok).toBe(false);
          if (validatie.ok)
            throw new Error("Een revisieconflict hoort te worden geweigerd");
          expect(validatie.failure.code).toBe("tracked-revision-conflict");
          expect(lees(s).p.text).toBe(lang.slice(7));
          expect(lees(s).versie).toBe(versie);
          return;
        }
        expect(lees(s).p.text).toBe(lang.slice(7).toUpperCase());
        expect(
          segmenten(s).some(
            (d) =>
              d.kind === "text" &&
              d.text === lang.slice(0, 7) &&
              !!d.attributes.del,
          ),
        ).toBe(true);
      } finally {
        s.destroy();
      }
    },
  );
  it("weigert een document dat tijdens de validatie is gewijzigd", async () => {
    const s = await proef(lang);
    try {
      const { ref, controle } = omhulsel(s),
        { p, versie } = lees(s);
      controle.validateEdits.mockImplementationOnce(async (r) => {
        const resultaat = s.validateEdits(r);
        s.insertText({ story: p.story, paraId: p.paraId, offset: 0 }, "Later ");
        return resultaat;
      });
      expect(
        await vervangHoofdletters(
          ref,
          p,
          versie,
          tekenVervangingen(lang, lang.toUpperCase())!,
        ),
      ).toBe(false);
      expect(lees(s).p.text).toBe("Later " + lang);
    } finally {
      s.destroy();
    }
  });
});
