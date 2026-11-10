import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { engine } from "../gedeeld/engine";
import { alineas, type Deel } from "../verwijzingen/document";
import { formuleSleutel, renderOmml } from "./render";

export function formuleOpmaak(d: Deel) {
  const size = d.attributes?.fontSize as { size?: number } | undefined;
  const color = d.attributes?.textColor as { rgb?: string } | string | undefined;
  const rgb = typeof color === "string" ? color : color?.rgb;
  return { pixels: (size?.size ?? 22) * 2 / 3, color: rgb && /^#?[\da-f]{6}$/i.test(rgb) ? `#${rgb.replace(/^#/, "")}` : "#000000" };
}
/** Derived view data is adopted outside the author's Undo history. */
export async function werkFormuleWeergaveBij(ref: DocxEditorRef): Promise<number> {
  const e = engine(ref), s = e.sessie, version = s.version();
  const math = alineas(s).flatMap(p => p.delen.filter(d => d.embedKind === "math").map(d => ({ p, d })));
  const todo = math.filter(({ d }) => {
    const { pixels, color } = formuleOpmaak(d);
    return d.payload?.renderKey !== formuleSleutel(String(d.payload?.ommlXml ?? ""), d.payload?.display === "block", pixels, color);
  });
  if (!todo.length) return 0;
  const changes = todo.map(({ p, d }) => {
    const { pixels, color } = formuleOpmaak(d);
    return { story: p.story, index: d.index, values: renderOmml(String(d.payload?.ommlXml ?? ""), d.payload?.display === "block", pixels, color) };
  });
  const fork = await createYrsSession();
  try {
    if (s.version() !== version || ref.getEditorRef()?.getYrsSession() !== s) return 0;
    const vector = s.encodeStateVector();
    fork.loadState(s.encodeState());
    for (const c of changes) fork.applyRawOps(c.story, Object.entries(c.values).map(([key, value]) => ({ op: "setEmbedAttr", index: c.index, key, value })));
    s.applyHostUpdate(fork.encodeStateAsUpdate(vector), [...new Set(changes.map(c => c.story))]);
    e.weergave.syncYrsInputState(false, [...new Set(changes.map(c => c.story))]);
    e.weergave.relayout();
    return changes.length;
  } finally { fork.destroy(); }
}
