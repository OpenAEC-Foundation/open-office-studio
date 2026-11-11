import type { DocxEditorRef } from "@betteroffice/docx-react";
import { begin, engine, klaar, ruw, type Sessie } from "../gedeeld/engine";
import { leesFormule, lineairUitOmml, omml } from "./model";
import { renderOmml } from "./render";

function inhoud(s: Sessie) {
  return JSON.stringify(s.storyIds().map(id => [id, s.storySegments(id).map(d => d.kind === "embed" && d.embedKind === "math" ? { ...d, payload: Object.fromEntries(Object.entries(d.payload).filter(([key]) => !key.startsWith("render"))) } : d)]));
}

export interface FormuleDoel {
  sessie: Sessie;
  vector: Uint8Array;
  at: { story: string; paraId: string; offset: number };
  bestaand: boolean;
  invoer: string;
  display: boolean;
  inhoud: string;
}

export function formuleDoel(ref: DocxEditorRef): FormuleDoel {
  const { sessie } = engine(ref), sel = sessie.selection();
  if (!sel || !/^body(?::t\d+:r\d+c\d+)*$/.test(sel.anchor.story)) throw new Error("selection");
  const a = sel.anchor, b = sel.head;
  if (a.story !== b.story || a.paraId !== b.paraId || Math.abs(a.offset - b.offset) > 1) throw new Error("selection");
  const at = { ...a, offset: Math.min(a.offset, b.offset) };
  let bestaand = false, invoer = "", display = false;
  if (a.offset !== b.offset) {
    const index = sessie.locateParagraph(at.story, at.paraId).start + at.offset;
    let pos = 0;
    for (const deel of sessie.storySegments(at.story)) {
      if (pos === index && deel.kind === "embed" && deel.embedKind === "math") {
        const payload = deel.payload as { ommlXml?: string; display?: string };
        if (!payload.ommlXml) throw new Error("unsupported");
        try { invoer = lineairUitOmml(payload.ommlXml); } catch { throw new Error("unsupported"); }
        bestaand = true; display = payload.display === "block"; break;
      }
      pos += deel.kind === "text" ? deel.text.length : 1;
    }
    if (!bestaand) throw new Error("selection");
  }
  return { sessie, vector: sessie.encodeStateVector(), at, bestaand, invoer, display, inhoud: inhoud(sessie) };
}

export function bewaarFormule(ref: DocxEditorRef, doel: FormuleDoel, invoer: string, display: boolean) {
  const e = engine(ref), vector = e.sessie.encodeStateVector();
  const vectorGewijzigd = vector.length !== doel.vector.length || vector.some((v, i) => v !== doel.vector[i]);
  if (e.sessie !== doel.sessie || (vectorGewijzigd && inhoud(e.sessie) !== doel.inhoud)) throw new Error("changed");
  if (doel.bestaand && invoer === doel.invoer && display === doel.display) return;
  const xml = omml(leesFormule(invoer), display);
  const index = e.sessie.locateParagraph(doel.at.story, doel.at.paraId).start + doel.at.offset;
  begin(e);
  try {
    const size = Number(ref.commands?.getState("fontSize").value) || 11;
    const payload = { ommlXml: xml, display: display ? "block" : "inline", plainText: invoer, ...renderOmml(xml, display, size * 4 / 3) };
    if (doel.bestaand) ruw(e.sessie, doel.at.story, Object.entries(payload).map(([key, value]) => ({ op: "setEmbedAttr", index, key, value })));
    else ruw(e.sessie, doel.at.story, [{ op: "insertEmbed", index, kind: "math", payload }]);
    e.sessie.setSelection(doel.at, { ...doel.at, offset: doel.at.offset + 1 });
  } finally { klaar(e, [doel.at.story]); }
}
