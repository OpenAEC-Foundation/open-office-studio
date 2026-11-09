import type { DocxEditorRef } from "@betteroffice/docx-react";
import { begin, engine, klaar, ruw } from "../gedeeld/engine";
import { getalIn, type NummerNotatie } from "../lijst/nummering";
import { alineas, bladwijzers, gaNaar, markeer, tekst, type Alinea, type Deel, type Plek } from "./document";
import { cache, code, veld } from "./velden";

export interface VerwijsDoel { id: string; soort: "heading" | "caption" | "bookmark" | "note"; naam: string; start: Plek; einde: Plek; nummer?: string }
const plek = (p: Alinea, offset = 0): Plek => ({ story: p.story, paraId: p.paraId, offset });
const sleutel = (p: Plek) => `${p.story}/${p.paraId}`;
function uniekeNaam(ps: Alinea[], prefix: string) {
  const namen = new Set(ps.flatMap(p => (p.eigenschappen.bookmarks ?? []) as { name?: string }[]).map(m => m.name));
  let i = 1; while (namen.has(`_OOS_${prefix}${i}`)) i++;
  return `_OOS_${prefix}${i}`;
}
async function kopNummers(ref: DocxEditorRef, ps: Alinea[]) {
  const s = engine(ref).sessie;
  if (!ps.some(p => p.eigenschappen.numPr || p.eigenschappen.numPrFromStyle)) return new Map<string, string>();
  const defs = s.materializeDocx()?.package.numbering;
  const uit = new Map<string, string>(), tellers = new Map<number, number[]>(), gezien = new Set<string>();
  for (const p of ps) {
    const n = (p.eigenschappen.numPr ?? p.eigenschappen.numPrFromStyle) as { numId: number; ilvl?: number } | undefined;
    if (!n || !n.numId) continue;
    const num = defs?.nums.find(x => x.numId === n.numId), abstract = defs?.abstractNums.find(x => x.abstractNumId === num?.abstractNumId);
    const overrides = num?.levelOverrides, levels = abstract?.levels.map(l => overrides?.find(o => o.ilvl === l.ilvl)?.lvl ?? l);
    const ilvl = n.ilvl ?? 0, level = levels?.find(l => l.ilvl === ilvl);
    if (!num || !level || level.numFmt === "bullet") continue;
    const counts = tellers.get(num.abstractNumId) ?? [], first = !gezien.has(`${n.numId}/${ilvl}`);
    const start = overrides?.find(o => o.ilvl === ilvl)?.startOverride;
    counts[ilvl] = first && start !== undefined ? start : counts[ilvl] === undefined ? level.start ?? 1 : counts[ilvl] + 1;
    gezien.add(`${n.numId}/${ilvl}`);
    for (let l = ilvl + 1; l < 9; l++) {
      const restart = levels?.find(q => q.ilvl === l)?.lvlRestart;
      if (restart !== 0 && (restart === undefined || ilvl < restart)) delete counts[l];
    }
    tellers.set(num.abstractNumId, counts);
    const value = level.lvlText.replace(/%(\d)/g, (_, d) => {
      const i = Number(d) - 1, def = levels!.find(l => l.ilvl === i);
      return getalIn((def?.numFmt ?? "decimal") as NummerNotatie, counts[i] ?? overrides?.find(o => o.ilvl === i)?.startOverride ?? def?.start ?? 1);
    }).replace(/[.)\s]+$/, "");
    uit.set(sleutel(plek(p)), value);
  }
  return uit;
}
function reeksen(ps: Alinea[], nummers: Map<string, string>) {
  const waarden = new Map<Deel, string>(), tellers = new Map<string, number>(), hoofdstukken = new Map<number, string>();
  for (const p of ps) {
    const level = Number(p.eigenschappen.outlineLevel);
    if (Number.isInteger(level) && level >= 0 && level < 9) {
      hoofdstukken.set(level + 1, nummers.get(sleutel(plek(p))) ?? "");
      for (const l of hoofdstukken.keys()) if (l > level + 1) hoofdstukken.delete(l);
    }
    for (const d of p.delen) {
      if (d.embedKind !== "field") continue;
      const c = code(d), type = c[0]?.toUpperCase();
      if (type === "STYLEREF") {
        const n = Number(c[1]); if (hoofdstukken.get(n)) waarden.set(d, hoofdstukken.get(n)!);
      } else if (type === "SEQ" && c[1]) {
        const si = c.indexOf("\\s"), chapter = si >= 0 ? hoofdstukken.get(Number(c[si + 1])) : "";
        const key = `${c[1].toLowerCase()}/${chapter ?? ""}`;
        const ri = c.indexOf("\\r"), reset = ri >= 0 ? Number(c[ri + 1]) : NaN;
        const n = Number.isInteger(reset) && reset >= 0 ? reset : (tellers.get(key) ?? 0) + (c.includes("\\c") ? 0 : 1);
        tellers.set(key, n);
        const fi = c.indexOf("\\*"), fmt = c[fi + 1];
        waarden.set(d, getalIn(fmt === "ROMAN" ? "upperRoman" : fmt === "roman" ? "lowerRoman" : fmt === "ALPHABETIC" ? "upperLetter" : fmt === "alphabetic" ? "lowerLetter" : "decimal", n));
      }
    }
  }
  return waarden;
}
export function verwijsDoelen(ref: DocxEditorRef): VerwijsDoel[] {
  const s = engine(ref).sessie, ps = alineas(s), uit: VerwijsDoel[] = [];
  for (const b of bladwijzers(s, ps)) if (!b.naam.startsWith("_")) uit.push({ id: `bookmark:${b.naam}`, soort: "bookmark", naam: b.naam, start: b.start, einde: b.einde });
  const notes = { footnote: 0, endnote: 0 };
  for (const p of ps) {
    if (!p.story.startsWith("body")) continue;
    if (typeof p.eigenschappen.outlineLevel === "number") uit.push({ id: `heading:${sleutel(plek(p))}`, soort: "heading", naam: tekst(p), start: plek(p), einde: plek(p, p.lengte) });
    if (p.delen.some(d => d.embedKind === "field" && code(d)[0]?.toUpperCase() === "SEQ")) uit.push({ id: `caption:${sleutel(plek(p))}`, soort: "caption", naam: tekst(p), start: plek(p), einde: plek(p, p.lengte) });
    for (const d of p.delen) if (["noteRef", "footnoteReference", "endnoteReference", "noteReference"].includes(d.embedKind ?? "")) {
      const kind = d.embedKind === "endnoteReference" || d.payload?.noteKind === "endnote" || d.payload?.endnoteRefId !== undefined ? "endnote" : "footnote";
      const nummer = String(++notes[kind]);
      uit.push({ id: `note:${p.story}/${p.paraId}/${d.offset}`, soort: "note", naam: `${nummer} — ${tekst(p).slice(0, 80)}`, start: plek(p, d.offset), einde: plek(p, d.offset + 1), nummer });
    }
  }
  return uit;
}
function invoegplek(ref: DocxEditorRef, object = false) {
  const e = engine(ref), sel = e.sessie.selection();
  if (!sel || (JSON.stringify(sel.anchor) !== JSON.stringify(sel.head) && !(object && sel.anchor.story === sel.head.story && sel.anchor.paraId === sel.head.paraId && Math.abs(sel.anchor.offset - sel.head.offset) === 1))) throw new Error("references.selection");
  return { e, at: { ...sel.anchor, offset: object ? Math.min(sel.anchor.offset, sel.head.offset) : sel.anchor.offset } };
}
export async function kruisverwijzingIn(ref: DocxEditorRef, id: string, vorm: "text" | "number" | "page") {
  await ref.flushPendingInput?.();
  const { e, at } = invoegplek(ref), s = e.sessie, v = s.version();
  const doel = verwijsDoelen(ref).find(d => d.id === id);
  if (!doel) throw new Error("references.missing");
  const ps = alineas(s), nummers = await kopNummers(ref, ps);
  if (s.version() !== v) throw new Error("references.changed");
  const bestaande = bladwijzers(s, ps).find(b => JSON.stringify(b.start) === JSON.stringify(doel.start) && JSON.stringify(b.einde) === JSON.stringify(doel.einde));
  const naam = bestaande?.naam ?? uniekeNaam(ps, "Ref");
  const type = vorm === "page" ? "PAGEREF" : doel.soort === "note" ? "NOTEREF" : "REF";
  if (vorm === "number" && doel.soort === "heading" && !nummers.get(sleutel(doel.start))) throw new Error("references.unnumbered");
  const p = ps.find(p => sleutel(plek(p)) === sleutel(doel.start))!;
  const seq = p.delen.filter(d => d.embedKind === "field" && ["SEQ", "STYLEREF"].includes(code(d)[0]?.toUpperCase()));
  const beginWaarde = vorm === "number" ? doel.nummer ?? nummers.get(sleutel(doel.start)) ?? seq.map(d => String(d.payload?.displayText ?? "")).join("-") : doel.naam;
  if (vorm === "number" && !beginWaarde) throw new Error("references.unnumbered");
  begin(e);
  try {
    if (!bestaande) markeer(s, naam, doel.start, doel.einde, true);
    const instruction = ` ${type} ${naam}${vorm === "number" && doel.soort !== "note" ? " \\n" : ""} \\h `;
    ruw(s, at.story, [{ op: "insertEmbed", index: s.locateParagraph(at.story, at.paraId).start + at.offset, kind: "field", payload: veld(instruction, beginWaarde || "…", naam), attributes: { hyperlink: { href: `#${naam}` } } }]);
    s.setSelection({ ...at, offset: at.offset + 1 });
  } finally { klaar(e, [at.story, doel.start.story]); }
  const resultaat = await werkVerwijzingenBij(ref);
  await ref.whenLayoutComplete?.({ timeoutMs: 8000 });
  gaNaar(ref, { ...at, offset: at.offset + 1 });
  return resultaat;
}
/** Native SEQ caption, placed directly above/below the selected object. */
export async function bijschriftIn(ref: DocxEditorRef, label: string, omschrijving: string, onder: boolean, hoofdstuk = 0) {
  await ref.flushPendingInput?.();
  if (!/^[\p{L}][\p{L}\p{N}_ ]{0,39}$/u.test(label)) throw new Error("references.labelInvalid");
  const { e, at } = invoegplek(ref, true), s = e.sessie, ps = alineas(s);
  let p = ps.find(p => sleutel(plek(p)) === sleutel(at));
  let object = p?.delen.find(d => ["image", "math", "table"].includes(d.embedKind ?? "") && (d.offset === at.offset || d.offset + 1 === at.offset));
  if (!object && at.story.includes(":t")) for (const parent of ps) {
    const table = parent.delen.find(d => d.embedKind === "table" && (d.payload?.rows as { cells: { story: string }[] }[])?.some(r => r.cells.some(c => c.story === at.story)));
    if (table) { p = parent; object = table; break; }
  }
  if (!p || !object) throw new Error("references.object");
  if (hoofdstuk) {
    const nummers = await kopNummers(ref, ps);
    const kop = ps.slice(0, ps.indexOf(p) + 1).reverse().find(q => q.eigenschappen.outlineLevel === hoofdstuk - 1);
    if (!kop || !nummers.get(sleutel(plek(kop)))) throw new Error("references.chapterMissing");
  }
  const naam = uniekeNaam(ps, "Caption"), story = p.story;
  let cursor: Plek | null = null;
  begin(e);
  try {
    const split = object.offset + (onder ? 1 : 0);
    const receipt = s.splitParagraph(plek(p, split));
    let cap = onder ? receipt.secondParaId : p.paraId;
    // Give the caption its own paragraph even when the object shares a line with text.
    if (onder) s.splitParagraph({ story, paraId: cap, offset: 0 });
    else if (split > 0) cap = s.splitParagraph(plek(p, split)).secondParaId;
    const at = { story, paraId: cap, offset: 0 };
    s.setParagraphAttrs({ story, start: at, end: at }, { numPr: null, pStyle: "Caption", outlineLevel: null } as never);
    s.insertText(at, `${label} `);
    let offset = label.length + 1;
    const insert = (payload: ReturnType<typeof veld>) => { ruw(s, story, [{ op: "insertEmbed", index: s.locateParagraph(story, cap).start + offset, kind: "field", payload }]); offset++; };
    if (hoofdstuk) { insert(veld(` STYLEREF ${hoofdstuk} \\s `, "1")); s.insertText({ ...at, offset }, "-"); offset++; }
    insert(veld(` SEQ "${label}" \\* ARABIC${hoofdstuk ? ` \\s ${hoofdstuk}` : ""} `, "1"));
    if (omschrijving) { s.insertText({ ...at, offset }, `: ${omschrijving}`); offset += omschrijving.length + 2; }
    markeer(s, naam, at, { ...at, offset }, true);
    cursor = { ...at, offset }; s.setSelection(cursor);
  } finally { klaar(e, [story]); }
  const resultaat = await werkVerwijzingenBij(ref);
  await ref.whenLayoutComplete?.({ timeoutMs: 8000 });
  if (cursor) gaNaar(ref, cursor);
  return resultaat;
}

/** Update only caption and cross-reference fields; generic fields have their own updater. */
export async function werkVerwijzingenBij(ref: DocxEditorRef, ronde = 0): Promise<{ gewijzigd: number; onopgelost: string[] }> {
  await ref.flushPendingInput?.();
  const e = engine(ref), s = e.sessie, v = s.version(), ps = alineas(s);
  const nummers = await kopNummers(ref, ps), waarden = reeksen(ps, nummers);
  const nodigPagina = ps.some(p => p.delen.some(d => code(d)[0]?.toUpperCase() === "PAGEREF"));
  const nodigNoot = ps.some(p => p.delen.some(d => code(d)[0]?.toUpperCase() === "NOTEREF"));
  const labels = new Map<number, string>();
  if (nodigNoot) await ref.whenLayoutComplete?.({ timeoutMs: 8000 });
  if (nodigPagina) {
    await ref.whenLayoutComplete({ timeoutMs: 8000 });
    const r = await ref.exportStructuredWithPages({ revisionView: "accepted", stories: ["body"], maxBlocks: 200000 });
    if (!r.ok) throw new Error("references.layout");
    for (const p of r.content.layout.pages) labels.set(p.pageIndex, p.displayedLabel);
  }
  if (s.version() !== v) throw new Error("references.changed");
  const bs = bladwijzers(s, ps, waarden), onopgelost: string[] = [];
  const pages = e.weergave.getLayout()?.pages ?? [];
  const nootLabels = new Map<string, string | undefined>(pages.flatMap(p => (p.noteAreas ?? []).flatMap(a => (a.notes ?? []).map(n => [`${a.kind ?? n.kind ?? "footnote"}:${n.id}`, n.displayLabel] as const))));
  function pagina(at: Plek) {
    const pos = e.weergave.yrsLocToDisplayPosition(at); if (pos === null) return null;
    function bevat(f: unknown): boolean {
      const x = f as { pmStart?: number; pmEnd?: number; fragments?: unknown[]; rows?: { cells: { fragments?: unknown[] }[] }[] };
      if (x.pmStart !== undefined && x.pmEnd !== undefined && x.pmStart <= pos! && pos! < x.pmEnd) return true;
      return x.fragments?.some(bevat) || x.rows?.some(r => r.cells.some(c => c.fragments?.some(bevat))) || false;
    }
    const i = pages.findIndex(p => p.fragments.some(bevat)); return i < 0 ? null : labels.get(i) ?? String(i + 1);
  }
  for (const p of ps) for (const d of p.delen) {
    if (d.embedKind !== "field" || d.payload?.fldLock) continue;
    const c = code(d), type = c[0]?.toUpperCase();
    if (!["REF", "PAGEREF", "NOTEREF"].includes(type)) continue;
    const b = bs.find(b => b.naam === c[1]);
    if (!b) { onopgelost.push(c[1] ?? String(d.payload?.instruction)); continue; }
    const target = ps.find(p => sleutel(plek(p)) === sleutel(b.start));
    let value: string | null = b.tekst;
    if (type === "PAGEREF") value = pagina(b.start);
    else if (type === "NOTEREF") {
      const doel = verwijsDoelen(ref).find(t => t.soort === "note" && JSON.stringify(t.start) === JSON.stringify(b.start));
      const d = target?.delen.find(d => d.offset === b.start.offset), end = d?.payload?.endnoteRefId;
      const key = end === undefined ? `footnote:${d?.payload?.footnoteRefId}` : `endnote:${end}`;
      value = nootLabels.get(key) ?? doel?.nummer ?? null;
    } else if (c.some(t => ["\\n", "\\r", "\\w"].includes(t))) {
      value = nummers.get(sleutel(b.start)) ?? (target?.delen.filter(x => x.embedKind === "field" && ["SEQ", "STYLEREF"].includes(code(x)[0]?.toUpperCase())).map(x => waarden.get(x) ?? x.payload?.displayText).join("-") || null);
    }
    if (value === null) onopgelost.push(c[1]); else waarden.set(d, value);
  }
  const changes = ps.flatMap(p => p.delen.filter(d => waarden.has(d) && !d.payload?.fldLock && waarden.get(d) !== d.payload?.displayText).map(d => ({ p, d, value: waarden.get(d)! })));
  if (changes.length) {
    begin(e); try { for (const { p, d, value } of changes) cache(s, p.story, d, value, code(d).includes("\\h") ? code(d)[1] : undefined); }
    finally { klaar(e, changes.map(c => c.p.story)); }
    if (nodigPagina && ronde < 2) {
      await ref.whenLayoutComplete?.({ timeoutMs: 8000 });
      const volgend = await werkVerwijzingenBij(ref, ronde + 1);
      return { gewijzigd: changes.length + volgend.gewijzigd, onopgelost: volgend.onopgelost };
    }
  }
  return { gewijzigd: changes.length, onopgelost: [...new Set(onopgelost)] };
}
