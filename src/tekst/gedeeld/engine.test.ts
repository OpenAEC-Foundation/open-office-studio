import { describe, expect, it } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { leesAlleAlineas } from "./engine";

/**
 * Een editor-ref die per verhaal alleen alinea's teruggeeft, zodat zichtbaar is
 * welke verhalen gelezen worden. `storyIds` noemt ook een kop- en voettekst:
 * die telt niet mee, net als bij de spellingcontrole.
 */
function nepRef(verhalen: Record<string, string[]>, mislukt: string[] = []) {
  return {
    getEditorRef: () => ({ getYrsSession: () => ({ storyIds: () => Object.keys(verhalen) }) }),
    readParagraphs: async ({ story }: { story: string }) =>
      mislukt.includes(story)
        ? { ok: false }
        : {
            ok: true,
            paragraphs: (verhalen[story] ?? []).map((text) => ({ paraId: `${story}#${text}`, text })),
          },
  } as unknown as DocxEditorRef;
}

describe("leesAlleAlineas", () => {
  it("leest de hoofdtekst én de cellen van de tabellen daarin", async () => {
    const ref = nepRef({
      body: ["Inleiding"],
      "body:t0:r0c0": ["Naam"],
      "body:t0:r0c1": ["3"],
      header1: ["Kopregel hoort er niet bij"],
    });
    const alineas = await leesAlleAlineas(ref);
    expect(alineas.map((a) => a.text)).toEqual(["Inleiding", "Naam", "3"]);
  });

  it("telt een document dat alleen uit een tabel bestaat niet als leeg", async () => {
    const ref = nepRef({
      body: [""],
      "body:t0:r0c0": ["Hout"],
      "body:t0:r0c1": ["3"],
    });
    const alineas = await leesAlleAlineas(ref);
    expect(alineas.map((a) => a.text)).toEqual(["", "Hout", "3"]);
  });

  it("telt de verhalen die wel lukken als enkele mislukken", async () => {
    const ref = nepRef({ body: ["Tekst"], "body:t0:r0c0": ["Cel"] }, ["body:t0:r0c0"]);
    const alineas = await leesAlleAlineas(ref);
    expect(alineas.map((a) => a.text)).toEqual(["Tekst"]);
  });

  it("gooit een fout als er niets te lezen is", async () => {
    const ref = nepRef({ body: ["Tekst"] }, ["body"]);
    await expect(leesAlleAlineas(ref)).rejects.toThrow();
  });
});
