/** De nieuwe lezer moet alle projecties van echte tabelcellen bytegelijk houden. */
import { readFileSync } from "node:fs";
import { createYrsSession } from "@betteroffice/docx/yrs";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { expect, it } from "vitest";
import { leesStatusGroepen, type StatusLeesKoppeling } from "./statusLeesgroepen";

it("behoudt 3.329 echte alinea's, bronversie en vector met 49 gegroepeerde lezingen", async () => {
  const bron = await createYrsSession({ clientId: 995 });
  try {
    bron.openDocx(new Uint8Array(readFileSync("docs/tests/writer-doortypen/bron.docx")), true);
    const versie = bron.version(), vector = bron.encodeStateVector();
    const ids = bron.storyIds().filter(id => id === "body" || /^body:t\d+:r\d+c\d+/.test(id));
    const verwacht = ids.flatMap(story => {
      const r = bron.readParagraphs({ story, view: "accepted" });
      if (!r.ok) throw new Error("Referentie onleesbaar");
      return r.paragraphs;
    });
    const ref = { getEditorRef: () => ({ getYrsSession: () => bron, hasPendingInput: () => false }) } as unknown as DocxEditorRef;
    let groepen = 0, pauzes = 0;
    const context = { lifetimeSignal: new AbortController().signal, snapshot: { generation: "eigen-proef" },
      run: async (fn: (v: unknown) => Promise<void>) => fn({ lifetimeSignal: new AbortController().signal,
        snapshot: { generation: "eigen-proef" }, read: { readStories: async (vraag: Parameters<typeof bron.readStories>[0]) => { groepen++; return bron.readStories(vraag); } } }),
    } as unknown as StatusLeesKoppeling["context"];
    const gelezen = await leesStatusGroepen({ sessie: bron, context, generatie: "eigen-proef" }, () => ref, async () => { pauzes++; });
    expect(verwacht).toHaveLength(3329); expect(gelezen).toEqual(verwacht);
    expect(groepen).toBe(49); expect(pauzes).toBe(48);
    expect(bron.version()).toBe(versie); expect(bron.encodeStateVector()).toEqual(vector);
  } finally { bron.destroy(); }
}, 30_000);
