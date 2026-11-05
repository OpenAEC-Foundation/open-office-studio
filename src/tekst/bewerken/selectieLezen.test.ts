import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { leesGeldigeOpenAecSelectie } from "../../../node_modules/@betteroffice/docx-react/dist/openaec-selectie.mjs";

const bytes = new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"));

describe("SDK-selectie lezen tijdens achterlopende weergave", () => {
  it("houdt de werkelijke nieuwe alinea vast als de kaart nog uitsluitend oude alinea's kent", async () => {
    const s = await createYrsSession(); s.openDocx(bytes, true);
    try {
      const oud = { paragraphs: s.paragraphSpans("body") }, laatste = oud.paragraphs.at(-1)!;
      const gesplitst = s.splitParagraph({ story: "body", paraId: laatste.paraId, offset: laatste.length });
      const punt = { story: "body", paraId: gesplitst.secondParaId, offset: 0 };
      s.setSelection(punt);
      expect(oud.paragraphs.some(p => p.paraId === punt.paraId)).toBe(false);
      const schrijven = vi.spyOn(s, "setSelection");
      expect(leesGeldigeOpenAecSelectie(s, id => id === "body", () => oud)).toEqual({ anchor: punt, head: punt });
      expect(s.selection()).toEqual({ anchor: punt, head: punt });
      expect(schrijven).not.toHaveBeenCalled();
    } finally { s.destroy(); }
  });

  it("behoudt een selectie over oude en nieuwe alinea's zonder kaart of mutatie", async () => {
    const s = await createYrsSession(); s.openDocx(bytes, true);
    try {
      const p = s.paragraphSpans("body")[0], nieuw = s.splitParagraph({ story: "body", paraId: p.paraId, offset: 4 });
      const anchor = { story: "body", paraId: p.paraId, offset: 2 }, head = { story: "body", paraId: nieuw.secondParaId, offset: 3 };
      s.setSelection(anchor, head);
      expect(leesGeldigeOpenAecSelectie(s, () => true, () => null)).toEqual({ anchor, head });
      expect(leesGeldigeOpenAecSelectie(s, () => false, () => null)).toBeNull();
      expect(s.selection()).toEqual({ anchor, head });
    } finally { s.destroy(); }
  });

  it("leest bij een passende kaart zonder extra volledige alinealezing", async () => {
    const s = await createYrsSession(); s.openDocx(bytes, true);
    try {
      const kaart = { paragraphs: s.paragraphSpans("body") }, punt = { story: "body", paraId: kaart.paragraphs[0].paraId, offset: 3 };
      s.setSelection(punt);
      const lezen = vi.spyOn(s, "paragraphSpans");
      expect(leesGeldigeOpenAecSelectie(s, () => true, () => kaart)).toEqual({ anchor: punt, head: punt });
      expect(lezen).not.toHaveBeenCalled();
    } finally { s.destroy(); }
  });
});
