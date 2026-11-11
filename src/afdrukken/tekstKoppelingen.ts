/** Koppen en koppelingen met de echte paginageometrie van alle afgedrukte tekst. */
import type { DocxLayoutMap, DocxStructuredContent } from "@betteroffice/docx";
import type { Bladwijzer, Koppeling } from "./model";

type Inhoud = { structured: DocxStructuredContent; layout: Pick<DocxLayoutMap, "fragments"> & Partial<Pick<DocxLayoutMap, "truncated">> };
export interface BladwijzerDoel { naam: string; start: { story: string; paraId: string; offset: number } }
type Blok = Inhoud["structured"]["stories"][number]["blocks"][number];
type Inline = Extract<Blok, { paragraph: unknown }>["paragraph"]["inlines"][number];

export function tekstKoppelingen({ structured, layout }: Inhoud, doelen: BladwijzerDoel[] = []) {
  const bladwijzers: Bladwijzer[] = [];
  const koppelingen = new Map<number, Koppeling[]>();
  const perNode = new Map<string, typeof layout.fragments>();
  for (const f of layout.fragments) {
    const lijst = perNode.get(f.nodeId) ?? [];
    lijst.push(f);
    perNode.set(f.nodeId, lijst);
  }
  const gezien = new Set<string>();
  const posities = new Map<string, BladwijzerDoel["start"] | null>();
  for (const d of doelen) posities.set(d.naam, posities.has(d.naam) ? null : d.start);
  const bestemmingen = new Map<string, Koppeling["doel"]>();
  const bestemming = (url: string): Koppeling["doel"] => {
    if (bestemmingen.has(url)) return bestemmingen.get(url);
    bestemmingen.set(url, undefined);
    let naam = url.slice(1);
    if (!posities.has(naam)) {
      try { naam = decodeURIComponent(naam); } catch { return undefined; }
    }
    const p = posities.get(naam);
    if (!p || structured.revisionView === "original" || structured.truncated || layout.truncated) return undefined;
    // Native bookmark offsets are in the accepted view. Never map them through
    // deleted/original ranges or guess the first page of a split paragraph.
    let kandidaten = layout.fragments.filter(f => {
      const a = f.slice.kind === "text" || f.slice.kind === "atom" ? f.slice.range : null;
      return a && a.view === "accepted" && a.story === p.story &&
        a.start.paraId === p.paraId && a.end.paraId === p.paraId &&
        p.offset >= a.start.offset && p.offset < a.end.offset && f.geometry?.rects.length;
    });
    let aanEinde = false;
    if (!kandidaten.length) {
      kandidaten = layout.fragments.filter(f => {
        const a = f.slice.kind === "text" || f.slice.kind === "atom" ? f.slice.range : null;
        return a && a.view === "accepted" && a.story === p.story &&
          a.start.paraId === p.paraId && a.end.paraId === p.paraId &&
          a.end.offset === p.offset && a.start.offset < p.offset && f.geometry?.rects.length;
      });
      aanEinde = kandidaten.length > 0;
    }
    if (!kandidaten.length && p.offset === 0 && structured.revisionView === "accepted") kandidaten = layout.fragments.filter(f => {
      const a = f.anchor;
      return a.kind === "paragraph" && a.story === p.story && a.paraId === p.paraId &&
        !f.continuedFromPrevious && f.geometry?.rects.length;
    });
    // A repeated header bookmark has several physical occurrences. Without an
    // unambiguous occurrence there is no defensible destination to export.
    const paginas = new Set(kandidaten.map(f => f.pageIndex));
    if (paginas.size !== 1) return undefined;
    const rects = kandidaten.flatMap(f => f.geometry?.rects ?? [])
      .filter(r => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.height > 0)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const r = aanEinde ? rects.at(-1) : rects[0];
    const d = r ? { pagina: kandidaten[0].pageIndex, x: (r.x + (aanEinde ? r.width : 0)) * 0.75, y: r.y * 0.75 } : undefined;
    bestemmingen.set(url, d);
    return d;
  };
  const tekstVan = (inlines: Inline[]): string => inlines.map(i => {
    if (i.kind === "text") return i.text;
    if (i.kind === "tab") return " ";
    if (i.kind === "contentControl") return tekstVan(i.inlines);
    if (i.kind === "field" && i.cachedResult.kind === "inline") return tekstVan(i.cachedResult.inlines);
    return "";
  }).join("");
  const voegToe = (url: string, fragments: typeof layout.fragments) => {
    const doel = url.startsWith("#") ? bestemming(url) : undefined;
    if (url.startsWith("#") && !doel) return;
    for (const f of fragments) for (const r of f.geometry?.rects ?? []) {
      const sleutel = JSON.stringify([f.pageIndex, r.x, r.y, r.width, r.height, url]);
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      const lijst = koppelingen.get(f.pageIndex) ?? [];
      lijst.push({ x: r.x * 0.75, y: r.y * 0.75, breedte: r.width * 0.75, hoogte: r.height * 0.75, url, ...(doel ? { doel } : {}) });
      koppelingen.set(f.pageIndex, lijst);
    }
  };
  const inline = (inlines: Inline[]) => {
    for (const i of inlines) {
      const url = i.link?.href;
      if (url) voegToe(url, perNode.get(i.id) ?? []);
      if (i.kind === "contentControl") inline(i.inlines);
      if (i.kind === "field") {
        if (i.cachedResult.kind === "inline") inline(i.cachedResult.inlines);
        if (i.cachedResult.kind === "blocks") blokken(i.cachedResult.blocks, false);
      }
    }
  };
  const blokken = (lijst: Blok[], hoofdtekst: boolean) => {
    for (const b of lijst) {
      if ("paragraph" in b) {
        // Koppen in kop-/voetteksten en noten worden geen documentbladwijzers.
        const kop = "heading" in b ? b.heading : null;
        if (hoofdtekst && kop) {
          const f = perNode.get(b.id)?.[0];
          const titel = tekstVan(b.paragraph.inlines).trim();
          if (f && titel) bladwijzers.push({ titel, pagina: f.pageIndex, y: (f.geometry?.rects[0]?.y ?? 0) * 0.75, niveau: kop.outlineLevel });
        }
        // The first generated TOC row can be an inline cache of a TOC field.
        // Its children have no layout nodes; the atom's 1px placeholder is not
        // the painted row. Use the paragraph box only when the entire row is
        // this one field and every cached item has the same internal link.
        const items = b.paragraph.inlines;
        const veld = items.length === 1 && items[0].kind === "field" ? items[0] : null;
        if (veld?.fieldType === "TOC" && veld.cachedResult.kind === "inline") {
          const cache = veld.cachedResult.inlines;
          const url = cache[0]?.link?.href;
          if (url?.startsWith("#") && cache.every(i => i.link?.href === url)) voegToe(url, perNode.get(b.id) ?? []);
        }
        inline(b.paragraph.inlines);
      }
      if (b.kind === "contentControl") blokken(b.blocks, hoofdtekst);
      if (b.kind === "table") for (const r of b.table.rows) for (const c of r.cells) blokken(c.blocks, hoofdtekst);
    }
  };
  for (const s of structured.stories) blokken(s.blocks, s.kind === "body");
  return { bladwijzers, koppelingen };
}
