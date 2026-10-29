/**
 * Afbeeldingsopmaak (#49) via de Yrs-sessie: `setImageGeometryAt` met de
 * geometrie die ./logica.ts op dezelfde manier opbouwt als de engine voor zijn
 * eigen `imageGeometry`-opdracht. Bijsnijden (cropTop/…), alternatieve tekst,
 * afmeting, positie, terugloopafstand, vervangen (nieuwe `src`, `rId: null`
 * → nieuw mediabestand bij opslaan) en opnieuw instellen. Elke bewerking is
 * één ongedaan-maakstap.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";
import { begin, engine, klaar, type Engine, type Sessie } from "../gedeeld/engine.ts";
import {
  beeldGeometrie,
  geenBijsnijding,
  leesBijsnijding,
  maatBijVervangen,
  maatNaBijsnijden,
  passendeMaat,
  type BeeldAttrs,
  type Bijsnijding,
} from "./logica.ts";

export interface BeeldPlek {
  loc: { story: string; paraId: string; offset: number };
  attrs: BeeldAttrs;
}

/** Het beeld-embed op een plek in een alinea, met zijn payload. */
export function beeldOp(s: Sessie, loc: BeeldPlek["loc"]): BeeldAttrs | null {
  let deel: { kind: string; embedKind?: string; payload?: Record<string, unknown> }[] = [];
  for (const segment of s.storySegments(loc.story)) {
    if (segment.kind === "pilcrow") {
      if (segment.paraId === loc.paraId) {
        let offset = 0;
        for (const d of deel) {
          if (offset === loc.offset && d.kind === "embed" && d.embedKind === "image") return d.payload as BeeldAttrs;
          offset += d.kind === "text" ? ((d as unknown as { text: string }).text.length) : d.kind === "embed" && d.embedKind === "table" ? 0 : 1;
          if (offset > loc.offset) break;
        }
        return null;
      }
      deel = [];
    } else deel.push(segment as never);
  }
  return null;
}

/** De geselecteerde afbeelding (selectie van precies één beeld-embed), of null. */
export function geselecteerdeAfbeelding(s: Sessie): BeeldPlek | null {
  const sel = s.selection();
  if (!sel) return null;
  const { anchor: a, head: h } = sel;
  if (a.story !== h.story || a.paraId !== h.paraId || Math.abs(a.offset - h.offset) !== 1) return null;
  const loc = { story: a.story, paraId: a.paraId, offset: Math.min(a.offset, h.offset) };
  const attrs = beeldOp(s, loc);
  return attrs ? { loc, attrs } : null;
}

function vereist(e: Engine) {
  const plek = geselecteerdeAfbeelding(e.sessie);
  if (!plek) throw new Error(i18next.t("writer:picture.errors.selectPicture"));
  return plek;
}

/** Past velden van de geselecteerde afbeelding aan als één ongedaan-maakstap. */
export function wijzigAfbeelding(ref: DocxEditorRef | null, wijziging: (plek: BeeldPlek) => Partial<BeeldAttrs>) {
  const e = engine(ref);
  const plek = vereist(e);
  const patch = wijziging(plek);
  begin(e);
  try {
    e.sessie.setImageGeometryAt(plek.loc, beeldGeometrie(plek.attrs, patch) as never);
    // De selectie blijft op het beeld, zodat het contexttabblad blijft staan.
    e.sessie.setSelection(plek.loc, { ...plek.loc, offset: plek.loc.offset + 1 });
  } finally {
    klaar(e, [plek.loc.story]);
  }
  return patch;
}

export function bijsnijden(ref: DocxEditorRef | null, nieuw: Bijsnijding) {
  return wijzigAfbeelding(ref, ({ attrs }) => {
    const oud = leesBijsnijding(attrs);
    const maat = maatNaBijsnijden(Number(attrs.width) || 1, Number(attrs.height) || 1, oud, nieuw);
    return { cropTop: nieuw.top, cropRight: nieuw.right, cropBottom: nieuw.bottom, cropLeft: nieuw.left, width: maat.breedte, height: maat.hoogte };
  });
}

export function zetAfmeting(ref: DocxEditorRef | null, breedte: number, hoogte: number) {
  if (!(breedte > 0 && hoogte > 0)) throw new Error(i18next.t("writer:picture.errors.sizePositive"));
  return wijzigAfbeelding(ref, () => ({ width: Math.round(breedte * 100) / 100, height: Math.round(hoogte * 100) / 100 }));
}

export function zetAltTekst(ref: DocxEditorRef | null, tekst: string, decoratief: boolean) {
  return wijzigAfbeelding(ref, () => ({ alt: decoratief ? "" : tekst.trim(), decorative: decoratief }));
}

export interface PositieInstelling {
  position: NonNullable<BeeldAttrs["position"]>;
  distTop: number;
  distBottom: number;
  distLeft: number;
  distRight: number;
}

export function zetPositie(ref: DocxEditorRef | null, instelling: PositieInstelling) {
  return wijzigAfbeelding(ref, ({ attrs }) => {
    if (!attrs.wrapType || attrs.wrapType === "inline")
      throw new Error(i18next.t("writer:picture.errors.inlineNoPosition"));
    return { ...instelling };
  });
}

/** Vervangt het beeld; de breedte blijft, de hoogte volgt het nieuwe beeld. */
export function vervangAfbeelding(ref: DocxEditorRef | null, src: string, natuurlijk: { breedte: number; hoogte: number }) {
  return wijzigAfbeelding(ref, ({ attrs }) => {
    const maat = maatBijVervangen(Number(attrs.width) || natuurlijk.breedte, natuurlijk);
    return {
      src,
      rId: null,
      width: Math.round(maat.breedte * 100) / 100,
      height: Math.round(maat.hoogte * 100) / 100,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
      cropLeft: 0,
    };
  });
}

/**
 * Opnieuw instellen zoals in Word: bijsnijding, draaiing en spiegeling weg.
 * Met `metGrootte` krijgt de afbeelding ook haar oorspronkelijke maat
 * (begrensd op `maxBreedte` pixels).
 */
export function opnieuwInstellen(
  ref: DocxEditorRef | null,
  metGrootte: boolean,
  natuurlijk: { breedte: number; hoogte: number } | null,
  maxBreedte: number,
) {
  return wijzigAfbeelding(ref, ({ attrs }) => {
    const oud = leesBijsnijding(attrs);
    const ongesneden = maatNaBijsnijden(Number(attrs.width) || 1, Number(attrs.height) || 1, oud, geenBijsnijding);
    const maat = metGrootte && natuurlijk ? passendeMaat(natuurlijk, maxBreedte) : ongesneden;
    return {
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
      cropLeft: 0,
      transform: null,
      width: Math.round(maat.breedte * 100) / 100,
      height: Math.round(maat.hoogte * 100) / 100,
    };
  });
}

/** Leest de oorspronkelijke pixelmaat van de bron (data-URL) van een afbeelding. */
export async function natuurlijkeMaat(src: string | undefined): Promise<{ breedte: number; hoogte: number } | null> {
  if (!src) return null;
  if (typeof Image === "undefined") return null;
  return new Promise((klaar) => {
    const beeld = new Image();
    beeld.onload = () => klaar({ breedte: beeld.naturalWidth, hoogte: beeld.naturalHeight });
    beeld.onerror = () => klaar(null);
    beeld.src = src;
  });
}

export function afbeeldingStaat(ref: DocxEditorRef | null) {
  try {
    return geselecteerdeAfbeelding(engine(ref).sessie);
  } catch {
    return null;
  }
}
