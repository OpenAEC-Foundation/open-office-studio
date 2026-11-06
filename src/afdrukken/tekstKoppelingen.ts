/** Koppen en koppelingen met de echte paginageometrie van alle afgedrukte tekst. */
import type { DocxLayoutMap, DocxStructuredContent } from "@betteroffice/docx";
import type { Bladwijzer, Koppeling } from "./model";

type Inhoud = { structured: DocxStructuredContent; layout: Pick<DocxLayoutMap, "fragments"> };
type Blok = Inhoud["structured"]["stories"][number]["blocks"][number];
type Inline = Extract<Blok, { paragraph: unknown }>["paragraph"]["inlines"][number];

export function tekstKoppelingen({ structured, layout }: Inhoud) {
  const bladwijzers: Bladwijzer[] = [];
  const koppelingen = new Map<number, Koppeling[]>();
  const perNode = new Map<string, typeof layout.fragments>();
  for (const f of layout.fragments) {
    const lijst = perNode.get(f.nodeId) ?? [];
    lijst.push(f);
    perNode.set(f.nodeId, lijst);
  }
  const gezien = new Set<string>();
  const tekstVan = (inlines: Inline[]): string => inlines.map(i => {
    if (i.kind === "text") return i.text;
    if (i.kind === "tab") return " ";
    if (i.kind === "contentControl") return tekstVan(i.inlines);
    if (i.kind === "field" && i.cachedResult.kind === "inline") return tekstVan(i.cachedResult.inlines);
    return "";
  }).join("");
  const inline = (inlines: Inline[]) => {
    for (const i of inlines) {
      if (i.link?.href) for (const f of perNode.get(i.id) ?? [])
        for (const r of f.geometry?.rects ?? []) {
          const sleutel = JSON.stringify([f.pageIndex, r.x, r.y, r.width, r.height, i.link.href]);
          if (gezien.has(sleutel)) continue;
          gezien.add(sleutel);
          const lijst = koppelingen.get(f.pageIndex) ?? [];
          lijst.push({ x: r.x * 0.75, y: r.y * 0.75, breedte: r.width * 0.75, hoogte: r.height * 0.75, url: i.link.href });
          koppelingen.set(f.pageIndex, lijst);
        }
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
        inline(b.paragraph.inlines);
      }
      if (b.kind === "contentControl") blokken(b.blocks, hoofdtekst);
      if (b.kind === "table") for (const r of b.table.rows) for (const c of r.cells) blokken(c.blocks, hoofdtekst);
    }
  };
  for (const s of structured.stories) blokken(s.blocks, s.kind === "body");
  return { bladwijzers, koppelingen };
}
