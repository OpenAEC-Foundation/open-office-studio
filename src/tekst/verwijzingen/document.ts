import type { DocxEditorRef } from "@betteroffice/docx-react";
import { begin, engine, klaar, ruw, type Sessie } from "../gedeeld/engine";

export interface Plek { story: string; paraId: string; offset: number }
export interface Markering { id: number; kind: "start" | "end"; offset: number; name?: string }
export interface Deel { kind: string; text?: string; embedKind?: string; payload?: Record<string, unknown>; attributes?: Record<string, unknown>; index: number; offset: number }
export interface Alinea { story: string; paraId: string; start: number; lengte: number; eigenschappen: Record<string, unknown>; delen: Deel[] }
export interface Bladwijzer { naam: string; id: number; start: Plek; einde: Plek; tekst: string }

/** Descend into tables at their actual position; SEQ counters use document order. */
export function alineas(s: Sessie): Alinea[] {
  const uit: Alinea[] = [], gezien = new Set<string>();
  function verhaal(story: string) {
    if (gezien.has(story)) return;
    gezien.add(story);
    let index = 0, start = 0, delen: Deel[] = [];
    for (const d of s.storySegments(story)) {
      if (d.kind === "pilcrow") {
        const p: Alinea = { story, paraId: d.paraId, start, lengte: index - start, eigenschappen: d.properties ?? {}, delen };
        for (const t of delen) if (t.embedKind === "table") {
          const rows = t.payload?.rows as { cells: { story: string }[] }[] | undefined;
          for (const r of rows ?? []) for (const c of r.cells) verhaal(c.story);
        }
        uit.push(p);
        index++; start = index; delen = [];
      } else {
        const deel = { ...d, index, offset: index - start } as Deel;
        delen.push(deel); index += d.kind === "text" ? d.text.length : 1;
      }
    }
  }
  verhaal("body");
  for (const id of s.storyIds()) verhaal(id);
  return uit;
}
export function tekst(p: Alinea, vanaf = 0, tot = p.lengte, waarden?: Map<Deel, string>) {
  return p.delen.map(d => {
    const lengte = d.kind === "text" ? (d.text?.length ?? 0) : 1;
    if (d.offset >= tot || d.offset + lengte <= vanaf) return "";
    return d.kind === "text" ? (d.text ?? "").slice(Math.max(0, vanaf - d.offset), Math.min(lengte, tot - d.offset))
      : waarden?.get(d) ?? String(d.payload?.displayText ?? d.payload?.plainText ?? "");
  }).join("");
}
export function bladwijzers(s: Sessie, ps = alineas(s), waarden?: Map<Deel, string>): Bladwijzer[] {
  const starts = new Map<number, { p: Alinea; m: Markering }>(), ends = new Map<number, { p: Alinea; m: Markering }>();
  for (const p of ps) for (const m of (p.eigenschappen.bookmarks ?? []) as Markering[])
    (m.kind === "start" ? starts : ends).set(m.id, { p, m });
  return [...starts].flatMap(([id, a]) => {
    const b = ends.get(id); if (!a.m.name || !b || a.p.story !== b.p.story) return [];
    const verhaal = ps.filter(p => p.story === a.p.story);
    const i = verhaal.indexOf(a.p), j = verhaal.indexOf(b.p);
    if (j < i) return [];
    return [{ id, naam: a.m.name, start: { story: a.p.story, paraId: a.p.paraId, offset: a.m.offset },
      einde: { story: b.p.story, paraId: b.p.paraId, offset: b.m.offset },
      tekst: verhaal.slice(i, j + 1).map((p, n) => tekst(p, n ? 0 : a.m.offset, p === b.p ? b.m.offset : p.lengte, waarden)).join("\n") }];
  });
}
export function geldigeNaam(naam: string, intern = false) { return (intern ? /^[_\p{L}][\p{L}\p{N}_]{0,39}$/u : /^\p{L}[\p{L}\p{N}_]{0,39}$/u).test(naam); }
function schrijf(s: Sessie, p: Alinea, marks: Markering[]) {
  const at = { paraId: p.paraId, offset: 0 };
  s.setParagraphAttrs({ story: p.story, start: at, end: at }, { bookmarks: marks } as never);
}
/** Mutates inside the caller's Undo capture. */
export function markeer(s: Sessie, naam: string, a: Plek, b: Plek, intern = false) {
  const ps = alineas(s);
  if (!geldigeNaam(naam, intern) || bladwijzers(s, ps).some(x => x.naam.toLowerCase() === naam.toLowerCase())) throw new Error("references.invalidName");
  const pa = ps.find(p => p.story === a.story && p.paraId === a.paraId), pb = ps.find(p => p.story === b.story && p.paraId === b.paraId);
  if (!pa || !pb || a.story !== b.story || a.offset < 0 || b.offset < 0 || a.offset > pa.lengte || b.offset > pb.lengte) throw new Error("references.selection");
  if (pa.start + a.offset > pb.start + b.offset) [a, b] = [b, a];
  const id = 1 + Math.max(-1, ...ps.flatMap(p => ((p.eigenschappen.bookmarks ?? []) as Markering[]).map(m => m.id)));
  for (const p of ps) {
    const marks = [...((p.eigenschappen.bookmarks ?? []) as Markering[])];
    if (p.story === a.story && p.paraId === a.paraId) marks.push({ id, name: naam, kind: "start", offset: a.offset });
    if (p.story === b.story && p.paraId === b.paraId) marks.push({ id, kind: "end", offset: b.offset });
    if (p.story === a.story && (p.paraId === a.paraId || p.paraId === b.paraId)) schrijf(s, p, marks);
  }
  return naam;
}
export function nieuweBladwijzer(ref: DocxEditorRef, naam: string) {
  const e = engine(ref), sel = e.sessie.selection();
  if (!sel) throw new Error("references.selection");
  begin(e); try { markeer(e.sessie, naam, sel.anchor, sel.head); } finally { klaar(e, [sel.anchor.story]); }
}
export function verwijderBladwijzer(ref: DocxEditorRef, naam: string) {
  const e = engine(ref), ps = alineas(e.sessie), b = bladwijzers(e.sessie, ps).find(b => b.naam === naam);
  if (!b) throw new Error("references.missing");
  begin(e); try { for (const p of ps) {
    const ms = (p.eigenschappen.bookmarks ?? []) as Markering[];
    if (ms.some(m => m.id === b.id)) schrijf(e.sessie, p, ms.filter(m => m.id !== b.id));
  } } finally { klaar(e, [b.start.story]); }
}
export function hernoemBladwijzer(ref: DocxEditorRef, naam: string, nieuw: string) {
  const e = engine(ref), ps = alineas(e.sessie), bs = bladwijzers(e.sessie, ps), b = bs.find(b => b.naam === naam);
  if (!b) throw new Error("references.missing");
  if (!geldigeNaam(nieuw) || bs.some(x => x.id !== b.id && x.naam.toLowerCase() === nieuw.toLowerCase())) throw new Error("references.invalidName");
  begin(e);
  try {
    for (const p of ps) {
      const ms = (p.eigenschappen.bookmarks ?? []) as Markering[];
      if (ms.some(m => m.id === b.id && m.kind === "start")) schrijf(e.sessie, p, ms.map(m => m.id === b.id && m.kind === "start" ? { ...m, name: nieuw } : m));
      for (const d of p.delen) if (d.embedKind === "field") {
        const instruction = String(d.payload?.instruction ?? "");
        const match = /^(\s*(?:REF|PAGEREF|NOTEREF)\s+)("[^"]*"|[^\s]+)([\s\S]*)$/i.exec(instruction);
        if (!match || match[2].replace(/^"|"$/g, "") !== naam) continue;
        const next = match[1] + nieuw + match[3], data = JSON.parse(String(d.payload!.fieldData));
        data.instruction = next;
        // Change the instruction projection as well as its parsed value.
        const rewrite = (x: unknown): unknown => {
          if (Array.isArray(x)) return x.map(rewrite);
          if (!x || typeof x !== "object") return x;
          const value = x as Record<string, unknown>;
          if (value.type === "instrText") return { ...value, text: next };
          return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
        };
        if (data.fieldCode) data.fieldCode = [{ type: "run", content: [{ type: "instrText", text: next }] }];
        if (data.structuredCode) data.structuredCode = { inline: data.fieldCode };
        if (data.fieldTree?.code) data.fieldTree.code = { inline: data.fieldCode };
        const updated = rewrite(data);
        ruw(e.sessie, p.story, [{ op: "setEmbedAttr", index: d.index, key: "instruction", value: next }, { op: "setEmbedAttr", index: d.index, key: "fieldData", value: JSON.stringify(updated) }]);
      }
    }
  } finally { klaar(e, ps.map(p => p.story)); }
}
export function gaNaar(ref: DocxEditorRef, plek: Plek, einde?: Plek) {
  const e = engine(ref); e.sessie.setSelection(plek, einde);
  e.weergave.syncYrsInputState(false, [plek.story]);
  const pos = e.weergave.yrsLocToDisplayPosition(plek);
  const eind = einde ? e.weergave.yrsLocToDisplayPosition(einde) : pos;
  if (pos !== null) {
    e.weergave.setSelection?.(pos, eind ?? pos);
    e.weergave.scrollToPosition(pos);
  }
  ref.focus();
}
