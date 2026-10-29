/**
 * Ga naar (Ctrl+G, #29): pagina, sectie, regel, kop, tabel, afbeelding en
 * opmerking. Pagina's, secties en regels komen uit de indeling van de editor
 * (`getLayout`), koppen uit `headings()`, tabellen en afbeeldingen uit de
 * verhalen van de sessie, opmerkingen uit `getComments()`.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";
import { engine, type Sessie } from "../gedeeld/engine.ts";
import { verhaalVolgorde } from "./zoeken.ts";

export type Doelsoort = "pagina" | "sectie" | "regel" | "kop" | "tabel" | "afbeelding" | "opmerking";

export interface Doel {
  /** Volgnummer (1-gebaseerd) zoals de gebruiker het ziet. */
  nr: number;
  label: string;
  ga: (ref: DocxEditorRef) => void;
}

/** "5", "+2" of "-1" (ten opzichte van `huidig`) naar een nummer binnen 1..max. */
export function leesNummer(invoer: string, huidig: number, max: number): number | null {
  const t = invoer.trim();
  const m = /^([+-]?)(\d+)$/.exec(t);
  if (!m) return null;
  const n = Number(m[2]);
  const doel = m[1] === "+" ? huidig + n : m[1] === "-" ? huidig - n : n;
  if (!Number.isInteger(doel) || doel < 1 || (max > 0 && doel > max)) return null;
  return doel;
}

interface Fragment {
  kind: string;
  blockId?: string;
  pmStart?: number;
  fromLine?: number;
  toLine?: number;
  resolvedLines?: { segments?: { run?: { pmStart?: number } }[] }[];
}

function paginas(ref: DocxEditorRef) {
  return (engine(ref).weergave.getLayout()?.pages ?? []) as unknown as { number?: number; sectionIndex?: number; fragments: Fragment[] }[];
}

function naarPositie(ref: DocxEditorRef, positie: number | null | undefined) {
  if (positie === null || positie === undefined) return false;
  const { weergave } = engine(ref);
  weergave.setSelection(positie);
  weergave.scrollToPosition(positie);
  ref.focus();
  return true;
}

function naarPlek(ref: DocxEditorRef, plek: { story: string; paraId: string; offset: number }, lengte = 0) {
  const { sessie, weergave } = engine(ref);
  sessie.setSelection(plek, lengte ? { ...plek, offset: plek.offset + lengte } : undefined);
  weergave.syncYrsInputState(false, [plek.story]);
  const positie = weergave.yrsLocToDisplayPosition(plek);
  if (positie !== null) weergave.scrollToPosition(positie);
  ref.focus();
}

export function paginaDoelen(ref: DocxEditorRef): Doel[] {
  const totaal = ref.getTotalPages() || paginas(ref).length;
  return Array.from({ length: totaal }, (_, i) => ({ nr: i + 1, label: i18next.t("writer:find.goTo.labels.page", { n: i + 1 }), ga: (r) => r.scrollToPage(i + 1) }));
}

export function sectieDoelen(ref: DocxEditorRef): Doel[] {
  const uit: Doel[] = [];
  const gezien = new Set<number>();
  paginas(ref).forEach((p, i) => {
    const sectie = p.sectionIndex ?? 0;
    if (gezien.has(sectie)) return;
    gezien.add(sectie);
    uit.push({ nr: uit.length + 1, label: i18next.t("writer:find.goTo.labels.section", { n: uit.length + 1, page: i + 1 }), ga: (r) => r.scrollToPage(i + 1) });
  });
  return uit;
}

/** Regels van de hoofdtekst in leesvolgorde (tabelcellen tellen niet mee). */
export function regelDoelen(ref: DocxEditorRef): Doel[] {
  const uit: Doel[] = [];
  for (const p of paginas(ref))
    for (const f of p.fragments) {
      if (f.kind !== "paragraph") continue;
      const regels = f.resolvedLines ?? [];
      const aantal = Math.max(regels.length, (f.toLine ?? 0) - (f.fromLine ?? 0));
      for (let i = 0; i < aantal; i++) {
        const positie = regels[i]?.segments?.find((s) => typeof s.run?.pmStart === "number")?.run?.pmStart ?? f.pmStart;
        uit.push({ nr: uit.length + 1, label: i18next.t("writer:find.goTo.labels.line", { n: uit.length + 1 }), ga: (r) => void naarPositie(r, positie) });
      }
    }
  return uit;
}

export async function kopDoelen(ref: DocxEditorRef): Promise<Doel[]> {
  const { sessie } = engine(ref);
  const koppen = sessie.headings("body");
  const gelezen = await ref.readParagraphs({ view: "accepted", paraIds: koppen.map((k) => k.paraId) });
  const tekst = new Map(gelezen.ok ? gelezen.paragraphs.map((p) => [p.paraId, p.text]) : []);
  return koppen.map((k, i) => ({
    nr: i + 1,
    label: `${"  ".repeat(Math.max(0, k.heading.outlineLevel))}${(tekst.get(k.paraId) ?? "").replace(/￼/g, "").trim() || i18next.t("writer:find.goTo.labels.emptyHeading")}`,
    ga: (r) => naarPlek(r, { story: "body", paraId: k.paraId, offset: 0 }),
  }));
}

function eersteAlinea(s: Sessie, verhaal: string) {
  const p = s.paragraphs(verhaal)[0];
  return p ? { story: verhaal, paraId: p.paraId, offset: 0 } : null;
}

export function tabelDoelen(ref: DocxEditorRef): Doel[] {
  const { sessie } = engine(ref);
  const uit: Doel[] = [];
  for (const verhaal of verhaalVolgorde(sessie))
    for (const deel of sessie.storySegments(verhaal)) {
      if (deel.kind !== "embed" || deel.embedKind !== "table") continue;
      const rijen = (deel.payload as { rows?: { cells: { story: string }[] }[] }).rows ?? [];
      const eerste = rijen[0]?.cells[0]?.story;
      const voorbeeld = eerste ? sessie.paragraphs(eerste).map((p) => p.text).join(" ").replace(/￼/g, "").slice(0, 40) : "";
      const nr = uit.length + 1;
      const basis = i18next.t("writer:find.goTo.labels.table", { n: nr, rows: rijen.length, columns: rijen[0]?.cells.length ?? 0 });
      const metVoorbeeld = voorbeeld ? i18next.t("writer:find.goTo.labels.withPreview", { label: basis, preview: voorbeeld }) : basis;
      uit.push({
        nr,
        label: verhaal !== "body" ? i18next.t("writer:find.goTo.labels.nestedTable", { label: metVoorbeeld }) : metVoorbeeld,
        ga: (r) => {
          const plek = eerste ? eersteAlinea(sessie, eerste) : null;
          if (plek) naarPlek(r, plek);
        },
      });
    }
  return uit;
}

export function afbeeldingDoelen(ref: DocxEditorRef): Doel[] {
  const { sessie } = engine(ref);
  const uit: Doel[] = [];
  for (const verhaal of verhaalVolgorde(sessie)) {
    let wachtend: { offset: number; alt: string }[] = [];
    let offset = 0;
    for (const deel of sessie.storySegments(verhaal)) {
      if (deel.kind === "pilcrow") {
        for (const b of wachtend) {
          const nr = uit.length + 1;
          const plek = { story: verhaal, paraId: deel.paraId, offset: b.offset };
          uit.push({ nr, label: b.alt
              ? i18next.t("writer:find.goTo.labels.pictureAlt", { n: nr, alt: b.alt.slice(0, 50) })
              : i18next.t("writer:find.goTo.labels.picture", { n: nr }), ga: (r) => naarPlek(r, plek, 1) });
        }
        wachtend = [];
        offset = 0;
        continue;
      }
      if (deel.kind === "text") {
        offset += deel.text.length;
        continue;
      }
      if (deel.embedKind === "image") wachtend.push({ offset, alt: String((deel.payload as { alt?: string }).alt ?? "") });
      offset += 1;
    }
  }
  return uit;
}

/** De platte tekst van een opmerking (alinea's → runs → tekst), zonder opmaak. */
export function opmerkingTekst(inhoud: unknown): string {
  const delen: string[] = [];
  const loop = (knoop: unknown): void => {
    if (Array.isArray(knoop)) return knoop.forEach(loop);
    if (!knoop || typeof knoop !== "object") return;
    const k = knoop as { type?: string; text?: unknown; content?: unknown };
    if (k.type === "deletion" || k.type === "moveFrom") return;
    if (k.type === "text" && typeof k.text === "string") delen.push(k.text);
    else if (k.type === "tab") delen.push(" ");
    loop(k.content);
    if (k.type === "paragraph") delen.push(" ");
  };
  loop(inhoud);
  return delen.join("").replace(/\s+/g, " ").trim();
}

export function opmerkingDoelen(ref: DocxEditorRef): Doel[] {
  return ref
    .getComments()
    .filter((c) => c.parentId === undefined || c.parentId === null)
    .map((c, i) => {
      const tekst = opmerkingTekst(c.content);
      return {
        nr: i + 1,
        label: i18next.t("writer:find.goTo.labels.comment", { author: c.author ?? i18next.t("common:unknown"), text: tekst.slice(0, 50) }),
        ga: (r: DocxEditorRef) => {
          if (!r.scrollToCommentId(c.id)) throw new Error(i18next.t("writer:find.goTo.commentGone"));
        },
      };
    });
}

export async function doelen(ref: DocxEditorRef, soort: Doelsoort): Promise<Doel[]> {
  switch (soort) {
    case "pagina":
      return paginaDoelen(ref);
    case "sectie":
      return sectieDoelen(ref);
    case "regel":
      return regelDoelen(ref);
    case "kop":
      return kopDoelen(ref);
    case "tabel":
      return tabelDoelen(ref);
    case "afbeelding":
      return afbeeldingDoelen(ref);
    case "opmerking":
      return opmerkingDoelen(ref);
  }
}

/** Het huidige nummer voor relatief springen (+1/-1). */
export function huidigNummer(ref: DocxEditorRef, soort: Doelsoort): number {
  if (soort === "pagina") return ref.getCurrentPage() || 1;
  return 0;
}
