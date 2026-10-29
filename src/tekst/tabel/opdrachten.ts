/**
 * Tabelindeling (#48) via de Yrs-sessie van de engine. De tabelactie-gate van
 * @betteroffice/docx-react 0.4.3 zet celuitlijning, celmarges, rijhoogte,
 * kopregel, gelijk verdelen en passend maken op `unsupported-command`; de
 * sessie zelf kan het wel:
 *  - `setCellTextFormat(bereik, {verticalAlign | margins | noWrap})` → tcPr;
 *  - `setColumnWidth` → tblGrid/tcW;
 *  - een `setEmbedAttr` op het tabel-embed voor `tblPr` (breedte, indeling)
 *    en `rows` (trPr: kopregel, hoogte, niet afbreken; en de rijvolgorde bij
 *    sorteren — de celverhalen verhuizen mee);
 *  - `insertTable`/`deleteTable`/`insertText`/`splitParagraph` voor tekst ↔ tabel.
 * Alles in één taak is één ongedaan-maakstap (zie ../gedeeld/engine.ts).
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";
import { begin, engine, klaar, ruw, voorstel, type Engine, type Sessie } from "../gedeeld/engine.ts";
import {
  MIN_KOLOM,
  TWIPS_PER_PX,
  cellenNaarTekst,
  gelijkeKolommen,
  gemiddeldeRijhoogte,
  passendBijInhoud,
  passendInVenster,
  rijMet,
  sorteerVolgorde,
  tekstNaarCellen,
  tekstbreedteOpPagina,
  verdeelKolommen,
  type IndelingPagina,
  type Scheiding,
  type Sorteersleutel,
  type TabelPayload,
} from "./logica.ts";

export interface TabelLoc {
  story: string;
  tableIndex: number;
}
export interface CelLoc extends TabelLoc {
  row: number;
  column: number;
}
export interface TabelPlek {
  tabel: TabelLoc;
  bereik: { anchor: CelLoc; head: CelLoc };
  rijen: [number, number];
  kolommen: [number, number];
}

/** De tabel en het celbereik onder de cursor, of null buiten een tabel. */
export function tabelPlek(s: Sessie): TabelPlek | null {
  let bereik: TabelPlek["bereik"] | null = null;
  try {
    bereik = s.cellSelection() as TabelPlek["bereik"] | null;
  } catch {
    bereik = null;
  }
  if (!bereik) {
    // Cursor in een cel zonder celselectie: het verhaal heet `<ouder>:t<n>:r<r>c<k>`.
    const verhaal = s.selection()?.head.story ?? "";
    const m = /^(.*):t(\d+):r(\d+)c(\d+)$/.exec(verhaal);
    if (!m) return null;
    const cel = { story: m[1], tableIndex: +m[2], row: +m[3], column: +m[4] };
    bereik = { anchor: cel, head: cel };
  }
  const { anchor: a, head: h } = bereik;
  return {
    tabel: { story: a.story, tableIndex: a.tableIndex },
    bereik,
    rijen: [Math.min(a.row, h.row), Math.max(a.row, h.row)],
    kolommen: [Math.min(a.column, h.column), Math.max(a.column, h.column)],
  };
}

/** Index van het tabel-embed in zijn verhaal, met de payload. */
export function tabelEmbed(s: Sessie, loc: TabelLoc) {
  let index = 0,
    tabel = 0;
  for (const deel of s.storySegments(loc.story)) {
    if (deel.kind === "text") {
      index += deel.text.length;
      continue;
    }
    if (deel.kind === "embed" && deel.embedKind === "table") {
      if (tabel === loc.tableIndex) return { index, payload: deel.payload as unknown as TabelPayload };
      tabel++;
    }
    index += 1;
  }
  throw new Error(i18next.t("writer:table.errors.tableGone"));
}

function zetEmbed(s: Sessie, loc: TabelLoc, sleutel: "rows" | "tblPr", waarde: unknown) {
  const { index } = tabelEmbed(s, loc);
  ruw(s, loc.story, [{ op: "setEmbedAttr", index, key: sleutel, value: waarde }]);
}

/** De paragraaf direct na de tabel (die het tabel-embed draagt). */
function alineaNaTabel(s: Sessie, loc: TabelLoc) {
  let tabel = -1,
    gezien = false;
  for (const deel of s.storySegments(loc.story)) {
    if (deel.kind === "embed" && deel.embedKind === "table") {
      tabel++;
      gezien = tabel === loc.tableIndex;
      continue;
    }
    if (gezien && deel.kind === "pilcrow") return deel.paraId;
  }
  return null;
}

export function celTekst(s: Sessie, verhaal: string) {
  return s
    .paragraphs(verhaal)
    .map((p) => p.text.replace(/\uFFFC/g, ""))
    .join("\n");
}

/** Celteksten per rij (de tekst van samengevoegde cellen staat in de eerste cel). */
export function tabelTeksten(s: Sessie, loc: TabelLoc): string[][] {
  return tabelEmbed(s, loc).payload.rows.map((rij) => rij.cells.map((cel) => celTekst(s, cel.story)));
}

function vereistPlek(e: Engine) {
  if (e.ref.commands.getState("editingMode").value === "suggesting")
    throw new Error(i18next.t("writer:table.errors.layoutTracking"));
  const plek = tabelPlek(e.sessie);
  if (!plek) throw new Error(i18next.t("writer:table.errors.cursorInTable"));
  return plek;
}

function metPlek<T>(ref: DocxEditorRef | null, doe: (e: Engine, plek: TabelPlek) => T) {
  const e = engine(ref);
  const plek = vereistPlek(e);
  begin(e);
  try {
    return doe(e, plek);
  } finally {
    klaar(e, [plek.tabel.story]);
  }
}

// ---------------------------------------------------------------------------
// Kolombreedtes

function huidigeBreedtes(payload: TabelPayload) {
  if (payload.grid?.length) return payload.grid.map((w) => Math.max(w, MIN_KOLOM));
  const kolommen = Math.max(...payload.rows.map((r) => r.cells.length));
  return Array.from({ length: kolommen }, () => 2000);
}

function zetBreedtes(s: Sessie, loc: TabelLoc, breedtes: readonly number[], indeling: "fixed" | "autofit", tabelbreedte?: { w: number; type: "dxa" | "pct" | "auto" }) {
  breedtes.forEach((w, column) => s.setColumnWidth({ ...loc, row: 0, column }, Math.round(w)));
  const { payload } = tabelEmbed(s, loc);
  const tblPr: Record<string, unknown> = { ...(payload.tblPr ?? {}), tableLayout: indeling };
  if (tabelbreedte) {
    tblPr.width = tabelbreedte.w;
    tblPr.widthType = tabelbreedte.type;
  }
  zetEmbed(s, loc, "tblPr", tblPr);
}

const paginasVan = (e: Engine) => (e.weergave.getLayout()?.pages ?? []) as unknown as IndelingPagina[];

/** Tekstbreedte van de laatste sectie: de terugval als de pagina onbekend is. */
function breedteLaatsteSectie(e: Engine) {
  const sectie = e.ref.getDocument()?.package.document.finalSectionProperties as
    | { pageWidth?: number; marginLeft?: number; marginRight?: number }
    | undefined;
  if (sectie?.pageWidth) return sectie.pageWidth - (sectie.marginLeft ?? 1440) - (sectie.marginRight ?? 1440);
  return 9026;
}

/** Beschikbare tekstbreedte (twips) op de pagina waar de tabel staat. */
export function beschikbareBreedte(e: Engine, loc: TabelLoc) {
  const eersteCel = tabelEmbed(e.sessie, loc).payload.rows[0]?.cells[0]?.story;
  for (const p of paginasVan(e)) {
    if (eersteCel && p.fragments.some((f) => f.kind === "table" && f.blockId?.endsWith(`:${eersteCel}`)) && p.size && p.margins)
      return Math.round((p.size.w - p.margins.left - p.margins.right) * TWIPS_PER_PX);
  }
  return breedteLaatsteSectie(e);
}

/**
 * Tekstbreedte (twips) voor een nieuwe tabel bij de cursor: in een tabelcel de
 * breedte van die cel, anders paginabreedte min marges van de pagina (sectie)
 * waarop de cursor staat. Vraag dit vóór de bewerking: de indeling kent de
 * nieuwe tabel pas na de herindeling.
 */
export function breedteBijCursor(e: Engine) {
  const head = e.sessie.selection()?.head;
  // Alleen het verhaal van de cursor telt: de sessie onthoudt een celselectie
  // ook nadat de cursor de tabel heeft verlaten.
  const cel = /^(.*):t(\d+):r(\d+)c(\d+)$/.exec(head?.story ?? "");
  if (cel) {
    try {
      const breedtes = huidigeBreedtes(tabelEmbed(e.sessie, { story: cel[1], tableIndex: +cel[2] }).payload);
      // Standaard celmarge links en rechts (108 twips).
      if (breedtes[+cel[4]]) return Math.max(MIN_KOLOM, breedtes[+cel[4]] - 216);
    } catch {
      // Valt terug op de pagina.
    }
  }
  const positie = head ? e.weergave.yrsLocToDisplayPosition(head) : null;
  return tekstbreedteOpPagina(paginasVan(e), positie) ?? breedteLaatsteSectie(e);
}

/**
 * Invoegen › Tabel en Ctrl+F12. Doet wat de engine-opdracht `insertTable`
 * doet (alinea splitsen bij de cursor, tabel invoegen, cursor in de eerste
 * cel), maar de engine maakt een tabel van vaste Letter-breedte (9360 twips)
 * die op A4 buiten de marge steekt; hier worden de kolommen gelijk verdeeld
 * over de echte tekstbreedte, zoals Word. Eén ongedaan-maakstap.
 */
export async function tabelInvoegen(ref: DocxEditorRef | null, rijen: number, kolommen: number) {
  const e = engine(ref);
  if (!e.ref.commands.getState("insertTable").enabled) throw new Error(i18next.t("writer:table.errors.cannotInsert"));
  await e.ref.flushPendingInput();
  const s = e.sessie;
  const head = s.selection()?.head;
  if (!head) throw new Error(i18next.t("writer:table.errors.cursorInDocument"));
  const breedte = breedteBijCursor(e);
  const verhalen = [head.story];
  begin(e);
  try {
    const plek = head.offset > 0 ? { story: head.story, paraId: s.splitParagraph(head).secondParaId, offset: 0 } : head;
    const ontvangst = s.insertTable(plek, rijen, kolommen, voorstel(e.ref));
    verhalen.push(...ontvangst.createdStoryIds);
    zetBreedtes(s, ontvangst.table, gelijkeKolommen(breedte, kolommen), "autofit", { w: breedte, type: "dxa" });
    const eersteCel = ontvangst.createdStoryIds[0];
    const celAlinea = eersteCel ? s.paragraphs(eersteCel)[0] : null;
    if (celAlinea) {
      s.setSelection({ story: eersteCel, paraId: celAlinea.paraId, offset: 0 });
      celCursor(s, ontvangst.table);
    }
  } finally {
    klaar(e, verhalen);
  }
  e.ref.focus();
}

export function kolommenGelijk(ref: DocxEditorRef | null) {
  metPlek(ref, (e, plek) => {
    const { payload } = tabelEmbed(e.sessie, plek.tabel);
    const nieuw = verdeelKolommen(huidigeBreedtes(payload), plek.kolommen[0], plek.kolommen[1]);
    zetBreedtes(e.sessie, plek.tabel, nieuw, "fixed");
  });
}

/** Breedte van tekst in twips, gemeten met het lettertype van de cel. */
function meter() {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  return (tekst: string, font: string) => {
    if (!canvas) return tekst.length * 110;
    canvas.font = font;
    return canvas.measureText(tekst).width * TWIPS_PER_PX;
  };
}

function celFont(s: Sessie, verhaal: string) {
  const eerste = s.storySegments(verhaal).find((d) => d.kind === "text") as
    | { attributes: { fontFamily?: { ascii?: string }; fontSize?: { size?: number }; bold?: boolean } }
    | undefined;
  const familie = eerste?.attributes.fontFamily?.ascii ?? "Calibri";
  const punten = (eerste?.attributes.fontSize?.size ?? 22) / 2;
  return `${eerste?.attributes.bold ? "bold " : ""}${punten * (96 / 72)}px "${familie}", Carlito, sans-serif`;
}

export type Passend = "inhoud" | "venster" | "vast";

export function maakPassend(ref: DocxEditorRef | null, soort: Passend) {
  metPlek(ref, (e, plek) => {
    const s = e.sessie;
    const { payload } = tabelEmbed(s, plek.tabel);
    const breedtes = huidigeBreedtes(payload);
    const beschikbaar = beschikbareBreedte(e, plek.tabel);
    if (soort === "vast") {
      zetBreedtes(s, plek.tabel, breedtes, "fixed", { w: breedtes.reduce((a, b) => a + b, 0), type: "dxa" });
      return;
    }
    if (soort === "venster") {
      zetBreedtes(s, plek.tabel, passendInVenster(breedtes, beschikbaar), "autofit", { w: 5000, type: "pct" });
      return;
    }
    const meet = meter();
    const min = breedtes.map(() => 0),
      max = breedtes.map(() => 0);
    for (const rij of payload.rows) {
      let kolom = 0;
      for (const cel of rij.cells) {
        const span = Number(cel.tcPr?.colspan ?? 1) || 1;
        const font = celFont(s, cel.story);
        const tekst = celTekst(s, cel.story);
        const regels = tekst.split("\n");
        const lang = Math.max(0, ...regels.map((r) => meet(r, font)));
        const woord = Math.max(0, ...tekst.split(/\s+/).map((w) => meet(w, font)));
        if (span === 1) {
          max[kolom] = Math.max(max[kolom], lang);
          min[kolom] = Math.max(min[kolom], woord);
        }
        kolom += span;
      }
    }
    const marge = Number((payload.tblPr?.cellMargins as { left?: number } | undefined)?.left ?? 108) * 2;
    zetBreedtes(s, plek.tabel, passendBijInhoud(min, max, beschikbaar, marge), "autofit", { w: 0, type: "auto" });
  });
}

// ---------------------------------------------------------------------------
// Rijen

export interface RijInstelling {
  kopregel?: boolean;
  nietAfbreken?: boolean;
  hoogte?: number | null;
  regel?: "auto" | "atLeast" | "exact";
}

/**
 * Rij-eigenschappen voor de geselecteerde rijen. Kopregels moeten aaneengesloten
 * bovenaan staan, zoals in Word: aanzetten geldt voor rij 0 t/m de selectie als
 * die bij rij 0 begint (anders alleen rij 0); uitzetten wist alle kopregels.
 */
export function zetRijen(ref: DocxEditorRef | null, instelling: RijInstelling, alle = false) {
  metPlek(ref, (e, plek) => {
    const { payload } = tabelEmbed(e.sessie, plek.tabel);
    const [van, tot] = alle ? [0, payload.rows.length - 1] : plek.rijen;
    const rows = payload.rows.map((rij, i) => {
      const binnen = i >= van && i <= tot;
      const { kopregel, ...rest } = instelling;
      let tr = rij.trPr;
      if (binnen) tr = rijMet(tr, rest);
      // Kopregels moeten aaneengesloten bovenaan staan, zoals in Word.
      if (kopregel === false) tr = rijMet(tr, { kopregel: false });
      else if (kopregel) {
        const laatsteKop = alle ? payload.rows.length - 1 : van === 0 ? tot : 0;
        tr = rijMet(tr, { kopregel: i <= laatsteKop });
      }
      return { ...rij, trPr: tr };
    });
    zetEmbed(e.sessie, plek.tabel, "rows", rows);
  });
}

/** Hoogte van de tabel in pixels volgens de huidige indeling, over alle pagina's. */
function tabelHoogtePx(e: Engine, loc: TabelLoc) {
  const eersteCel = tabelEmbed(e.sessie, loc).payload.rows[0]?.cells[0]?.story;
  let hoogte = 0;
  for (const pagina of e.weergave.getLayout()?.pages ?? [])
    for (const f of (pagina as unknown as { fragments: { kind: string; blockId?: string; height?: number }[] }).fragments)
      if (f.kind === "table" && eersteCel && f.blockId?.endsWith(`:${eersteCel}`)) hoogte += f.height ?? 0;
  return hoogte;
}

/** Geselecteerde rijen (of de hele tabel) krijgen dezelfde minimale hoogte. */
export function rijenGelijk(ref: DocxEditorRef | null) {
  const e = engine(ref);
  const plek = vereistPlek(e);
  const { payload } = tabelEmbed(e.sessie, plek.tabel);
  const heel = plek.rijen[0] === plek.rijen[1];
  const [van, tot] = heel ? [0, payload.rows.length - 1] : plek.rijen;
  const hoogte = gemiddeldeRijhoogte(tabelHoogtePx(e, plek.tabel), payload.rows.length);
  if (!hoogte) throw new Error(i18next.t("writer:table.errors.notLaidOut"));
  begin(e);
  try {
    zetEmbed(
      e.sessie,
      plek.tabel,
      "rows",
      payload.rows.map((rij, i) => (i >= van && i <= tot ? { ...rij, trPr: rijMet(rij.trPr, { hoogte, regel: "atLeast" }) } : rij)),
    );
  } finally {
    klaar(e, [plek.tabel.story]);
  }
}

// ---------------------------------------------------------------------------
// Cellen

export type Verticaal = "top" | "center" | "bottom";

export function celUitlijning(ref: DocxEditorRef | null, uitlijning: Verticaal) {
  metPlek(ref, (e, plek) => e.sessie.setCellTextFormat(plek.bereik, { verticalAlign: uitlijning }));
}

export interface Marges {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Celmarges (twips) voor de selectie of, met `heleTabel`, als standaard van de tabel. */
export function celMarges(ref: DocxEditorRef | null, marges: Marges, heleTabel: boolean) {
  metPlek(ref, (e, plek) => {
    const s = e.sessie;
    const { payload } = tabelEmbed(s, plek.tabel);
    if (heleTabel) {
      zetEmbed(s, plek.tabel, "tblPr", { ...(payload.tblPr ?? {}), cellMargins: { ...marges } });
      const laatsteRij = payload.rows.length - 1;
      const laatsteKolom = Math.max(...payload.rows.map((r) => r.cells.length)) - 1;
      s.setCellTextFormat(
        { anchor: { ...plek.tabel, row: 0, column: 0 }, head: { ...plek.tabel, row: laatsteRij, column: laatsteKolom } },
        { margins: { ...marges } },
      );
    } else s.setCellTextFormat(plek.bereik, { margins: { ...marges } });
  });
}

export function geenTerugloop(ref: DocxEditorRef | null, aan: boolean) {
  metPlek(ref, (e, plek) => e.sessie.setCellTextFormat(plek.bereik, { noWrap: aan }));
}

/** Huidige waarden voor het lint en de vensters. */
export function tabelStaat(ref: DocxEditorRef | null) {
  try {
    const e = engine(ref);
    const plek = tabelPlek(e.sessie);
    if (!plek) return null;
    const { payload } = tabelEmbed(e.sessie, plek.tabel);
    const rij = payload.rows[plek.rijen[0]];
    const cel = rij?.cells.find((_, i) => i >= plek.kolommen[0]) ?? rij?.cells[0];
    const tr = rij?.trPr ?? {};
    const marges = (cel?.tcPr?.margins ?? payload.tblPr?.cellMargins ?? { top: 0, bottom: 0, left: 108, right: 108 }) as Marges;
    return {
      plek,
      rijen: payload.rows.length,
      kolommen: Math.max(...payload.rows.map((r) => r.cells.length)),
      kopregel: tr.isHeader === true,
      nietAfbreken: ((tr._originalFormatting as Record<string, unknown> | undefined)?.cantSplit ?? tr.cantSplit) === true,
      hoogte: typeof tr.height === "number" ? tr.height : null,
      regel: (tr.heightRule as RijInstelling["regel"]) ?? "auto",
      verticaal: (cel?.tcPr?.verticalAlign as Verticaal | undefined) ?? "top",
      marges,
      tabelMarges: (payload.tblPr?.cellMargins as Marges | undefined) ?? marges,
      indeling: (payload.tblPr?.tableLayout as string | undefined) ?? "autofit",
    };
  } catch {
    return null;
  }
}
export type TabelStaat = NonNullable<ReturnType<typeof tabelStaat>>;

// ---------------------------------------------------------------------------
// Sorteren en omzetten

/** Sorteert de rijen; de celverhalen (met hun opmaak) verhuizen mee. */
export function sorteer(ref: DocxEditorRef | null, sleutels: readonly Sorteersleutel[], kopregels: number) {
  metPlek(ref, (e, plek) => {
    const s = e.sessie;
    const { payload } = tabelEmbed(s, plek.tabel);
    if (payload.rows.some((r) => r.cells.some((c) => Number(c.tcPr?.rowspan ?? 1) > 1 || c.tcPr?.vMerge)))
      throw new Error(i18next.t("writer:table.errors.sortMerged"));
    const volgorde = sorteerVolgorde(tabelTeksten(s, plek.tabel), sleutels, kopregels);
    zetEmbed(s, plek.tabel, "rows", volgorde.map((i) => payload.rows[i]));
  });
}

export function tabelNaarTekst(ref: DocxEditorRef | null, scheiding: Scheiding) {
  metPlek(ref, (e, plek) => {
    const s = e.sessie;
    const regels = cellenNaarTekst(tabelTeksten(s, plek.tabel), scheiding).flatMap((r) => r.split("\n"));
    let doel: string | null = alineaNaTabel(s, plek.tabel);
    if (!doel) throw new Error(i18next.t("writer:table.errors.noParagraphAfter"));
    s.deleteTable(plek.tabel);
    const eerste = doel;
    for (const regel of regels) {
      const plekAlinea: { story: string; paraId: string; offset: number } = { story: plek.tabel.story, paraId: doel, offset: 0 };
      if (regel) s.insertText(plekAlinea, regel);
      doel = s.splitParagraph({ ...plekAlinea, offset: regel.length }).secondParaId;
    }
    s.setSelection({ story: plek.tabel.story, paraId: eerste, offset: 0 });
  });
}

/**
 * Geselecteerde alinea's (binnen één verhaal, buiten een tabel) worden een tabel.
 * Volgorde: eerst de tekst wissen, dan de tabel vóór de eerste alinea zetten en
 * vullen, en tot slot de lege eerste alinea opheffen (het tabel-embed hoort dan
 * bij de volgende alinea, die zijn opmaak houdt).
 */
export async function tekstNaarTabel(ref: DocxEditorRef | null, scheiding: Scheiding, kolommen?: number) {
  const e = engine(ref);
  if (e.ref.commands.getState("editingMode").value === "suggesting")
    throw new Error(i18next.t("writer:table.errors.fromTextTracking"));
  await e.ref.flushPendingInput();
  const alineas = geselecteerdeAlineas(e);
  const cellen = tekstNaarCellen(alineas.map((a) => a.text), scheiding, kolommen);
  if (!cellen.length) throw new Error(i18next.t("writer:table.errors.selectParagraphs"));
  const s = e.sessie;
  const story = alineas[0].story;
  const breedte = breedteBijCursor(e);
  begin(e);
  const verhalen = [story];
  try {
    const eerste = alineas[0],
      laatste = alineas[alineas.length - 1];
    // Ruwe verwijdering: een tabel vlak vóór de selectie hoort bij de eerste
    // alinea (offset 0 ligt vóór dat embed) en moet blijven staan.
    const van = tekstBegin(s, story, eerste.paraId);
    const tot = s.locateParagraph(story, laatste.paraId).end;
    if (tot > van) ruw(s, story, [{ op: "delete", index: van, len: tot - van }]);
    // Draagt de alinea nog zo'n tabel, dan zou offset 0 de nieuwe tabel vóór
    // die tabel zetten; voeg dan in aan het begin van de volgende alinea.
    const alleSpans = s.paragraphSpans(story);
    const volgende = alleSpans[alleSpans.findIndex((p) => p.paraId === laatste.paraId) + 1]?.paraId;
    const doel = invoegAlinea(tekstBegin(s, story, laatste.paraId) > s.locateParagraph(story, laatste.paraId).start, laatste.paraId, volgende);
    const ontvangst = s.insertTable({ story, paraId: doel, offset: 0 }, cellen.length, cellen[0].length);
    const nieuw: TabelLoc = ontvangst.table;
    verhalen.push(...ontvangst.createdStoryIds);
    ontvangst.createdStoryIds.forEach((verhaal, n) => {
      const tekst = cellen[Math.floor(n / cellen[0].length)]?.[n % cellen[0].length] ?? "";
      const alinea = s.paragraphs(verhaal)[0];
      if (tekst && alinea) s.insertText({ story: verhaal, paraId: alinea.paraId, offset: 0 }, tekst);
    });
    // Alleen als er nog een alinea volgt: dan neemt die de tabel over.
    const spans = s.paragraphSpans(story);
    if (spans[spans.length - 1]?.paraId !== laatste.paraId) {
      const span = s.locateParagraph(story, laatste.paraId);
      ruw(s, story, [{ op: "delete", index: span.end, len: 1 }]);
    }
    // De engine maakt een nieuwe tabel 9360 twips (Letter) breed; op A4 steekt
    // die buiten de marge. Verdeel de tekstbreedte van de pagina, zoals Word.
    zetBreedtes(s, nieuw, gelijkeKolommen(breedte, cellen[0].length), "autofit", { w: breedte, type: "dxa" });
    const eersteCel = ontvangst.createdStoryIds[0];
    const celAlinea = eersteCel ? s.paragraphs(eersteCel)[0] : null;
    if (celAlinea) {
      s.setSelection({ story: eersteCel, paraId: celAlinea.paraId, offset: 0 });
      celCursor(s, nieuw);
    }
  } finally {
    klaar(e, verhalen);
  }
  return { rijen: cellen.length, kolommen: cellen[0].length };
}

/**
 * Alinea waarin ‘Tekst naar tabel’ de nieuwe tabel invoegt (op offset 0).
 * Een tabel direct vóór de selectie hangt aan de eerste alinea; offset 0 ligt
 * vóór die tabel. Dan de volgende alinea, die de tabel daarna toch overneemt.
 */
export function invoegAlinea(draagtTabel: boolean, alinea: string, volgende: string | undefined) {
  return draagtTabel && volgende ? volgende : alinea;
}

/**
 * Zet de celselectie op de eerste cel van een nieuwe tabel, zoals de engine
 * zelf na Tabel invoegen doet. De sessie onthoudt een rij- of tabelselectie
 * ook als de cursor de tabel verlaat; zonder dit tekent de weergave die oude
 * selectie weer zodra de cursor in de nieuwe tabel staat (in een andere tabel).
 */
export function celCursor(s: Pick<Sessie, "setCellSelection">, tabel: TabelLoc) {
  // Let op: de celverhalen van een nieuwe tabel houden hun naam (`t<n>`), de
  // celselectie telt tabellen op volgorde in het verhaal.
  const cel = { ...tabel, row: 0, column: 0 };
  try {
    s.setCellSelection({ anchor: cel, head: cel });
  } catch {
    // Alleen weergave; de bewerking zelf is geslaagd.
  }
}

/** Ruwe index van de eerste eenheid van een alinea na eventuele tabellen ervoor. */
function tekstBegin(s: Sessie, story: string, paraId: string) {
  const span = s.locateParagraph(story, paraId);
  let index = 0;
  for (const deel of s.storySegments(story)) {
    const lengte = deel.kind === "text" ? deel.text.length : 1;
    if (index + lengte > span.start) {
      if (index >= span.start && deel.kind === "embed" && deel.embedKind === "table") {
        index += 1;
        continue;
      }
      return Math.max(index, span.start);
    }
    index += lengte;
  }
  return span.start;
}

/** Alinea's die de selectie raakt (accepted-weergave), met hun lengte in de sessie. */
export function geselecteerdeAlineas(e: Engine) {
  const sel = e.sessie.selection();
  if (!sel) throw new Error(i18next.t("writer:table.errors.selectText"));
  if (sel.anchor.story !== sel.head.story) throw new Error(i18next.t("writer:table.errors.selectOnePart"));
  if (/:t\d+:r\d+c\d+$/.test(sel.anchor.story)) throw new Error(i18next.t("writer:table.errors.alreadyInTable"));
  const alle = e.sessie.paragraphs(sel.anchor.story);
  const i = alle.findIndex((p) => p.paraId === sel.anchor.paraId),
    j = alle.findIndex((p) => p.paraId === sel.head.paraId);
  if (i < 0 || j < 0) throw new Error(i18next.t("writer:table.errors.selectionGone"));
  const [van, tot] = i <= j ? [i, j] : [j, i];
  return alle.slice(van, tot + 1).map((p) => ({
    story: sel.anchor.story,
    paraId: p.paraId,
    text: p.text.replace(/\uFFFC/g, ""),
    lengte: p.text.length,
  }));
}
