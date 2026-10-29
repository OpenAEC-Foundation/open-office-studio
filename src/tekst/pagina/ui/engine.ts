/**
 * Wat de paginafuncties rechtstreeks aan de engine vragen: een markering op
 * de cursorplek, koppen en noten met paginanummers (paged export), het
 * bewerken van kop- en voettekst openen en sluiten, en de sectiestand.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { zichtbaarElement } from "../../../lint/editorApi";
import { isVerwijderd, koppenUitExport, type Kop, type PaginaExport } from "../inhoudsopgave.ts";
import { nieuweMarkering } from "../ooxml.ts";
import { paginaTekst } from "../tekst.ts";

/** Zet een unieke markering op de cursor (aan het eind van een selectie). */
export async function zetMarkering(api: DocxEditorRef) {
  const editor = api.getEditorRef();
  const bereik = editor?.getSelectionRange();
  if (!editor || !bereik) return null;
  if (bereik.from !== bereik.to) {
    // In een kop- of voettekst zet `setSelection` de cursor op het begin van
    // het onderdeel (engine): dan liever niets doen dan op de verkeerde plek.
    if (kopVoetActief()) throw new Error(paginaTekst("errors.clearSelectionFirst"));
    editor.setSelection(bereik.to);
  }
  const markering = nieuweMarkering();
  editor.insertText(markering);
  await api.flushPendingInput();
  return {
    markering,
    /** Haalt de markering weg als de bewerking niet doorgaat. */
    ongedaan: () => {
      try {
        editor.undo();
      } catch {
        /* de editor is mogelijk al vervangen */
      }
    },
  };
}

/** Wacht op de volledige indeling, met een eigen grens (de engine meldt zich niet altijd). */
export function wachtOpIndeling(api: DocxEditorRef, ms = 8000) {
  return Promise.race([api.whenLayoutComplete({ timeoutMs: ms }).catch(() => 0), new Promise((klaar) => setTimeout(klaar, ms + 500))]);
}

async function pagedExport(api: DocxEditorRef, stories: ("body" | "footnotes" | "endnotes")[]) {
  await wachtOpIndeling(api);
  // Met bijgehouden wijzigingen staan de pagina's in de markeringsweergave en
  // weigert de engine ‘accepted’ (unsupported-revision-layout): dan die weergave
  // nemen; verwijderde tekst slaan de lezers hieronder over.
  let weergave: "accepted" | "markup" = "accepted";
  const exporteer = () => api.exportStructuredWithPages({ revisionView: weergave, stories, maxBlocks: 200000 });
  let r = await exporteer();
  if (!r.ok && r.failure.code === "unsupported-revision-layout") {
    weergave = "markup";
    r = await exporteer();
  }
  for (let poging = 0; poging < 3 && !r.ok && ["stale-document", "layout-unavailable", "stale-layout", "layout-not-converged"].includes(r.failure.code); poging++) {
    // De indeling liep nog achter: even wachten en opnieuw.
    await new Promise((klaar) => setTimeout(klaar, 600));
    await wachtOpIndeling(api, 4000);
    r = await exporteer();
  }
  if (!r.ok) throw new Error(paginaTekst("errors.layoutUnavailable", { reason: r.failure.message }));
  return r.content;
}

/** De koppen van de hoofdtekst met hun (getoonde) paginanummer. */
export async function haalKoppen(api: DocxEditorRef): Promise<Kop[]> {
  return koppenUitExport((await pagedExport(api, ["body"])) as unknown as PaginaExport);
}

export interface NootInfo {
  soort: "voetnoot" | "eindnoot";
  noteId: string;
  /** Volgnummer per soort, in volgorde van de verwijzingen. */
  volgnummer: number;
  tekst: string;
  /** Alinea (sessie-id) met de verwijzing. */
  paraId: string | null;
  /** 0-gebaseerde pagina's van verwijzing en noot. */
  paginaVerwijzing: number | null;
  paginaNoot: number | null;
}

interface Inline {
  kind: string;
  revisions?: { kind: string }[];
  text?: string;
  noteKind?: "footnote" | "endnote";
  noteId?: string;
  anchor?: { kind: string; paraId?: string; start?: { paraId: string } };
  inlines?: Inline[];
  cachedResult?: { inlines?: Inline[] };
}
interface Blok {
  id: string;
  kind: string;
  anchor?: { paraId?: string };
  paragraph?: { inlines: Inline[] };
  blocks?: Blok[];
  table?: { rows: { cells: { blocks: Blok[] }[] }[] };
}

const tekstVan = (inl: Inline[] = []): string =>
  inl
    .filter((i) => !isVerwijderd(i))
    .map((i) => (i.kind === "text" ? (i.text ?? "") : i.kind === "tab" ? " " : tekstVan(i.inlines ?? i.cachedResult?.inlines)))
    .join("");

/** Alle voet- en eindnoten in volgorde van hun verwijzingen, met pagina's. */
export async function haalNoten(api: DocxEditorRef): Promise<NootInfo[]> {
  const inhoud = (await pagedExport(api, ["body", "footnotes", "endnotes"])) as unknown as {
    structured: { stories: { kind: string; noteId: string | null; blocks: Blok[] }[] };
    layout: {
      fragments: { blockId: string; pageIndex: number }[];
      occurrences: { pageIndex: number; region: { kind: string; noteId?: string } }[];
    };
  };
  const paginaVan = new Map<string, number>();
  for (const f of inhoud.layout.fragments) if (!paginaVan.has(f.blockId)) paginaVan.set(f.blockId, f.pageIndex);
  const nootPagina = new Map<string, number>();
  for (const o of inhoud.layout.occurrences)
    if ((o.region.kind === "footnote" || o.region.kind === "endnote") && o.region.noteId && !nootPagina.has(`${o.region.kind}:${o.region.noteId}`))
      nootPagina.set(`${o.region.kind}:${o.region.noteId}`, o.pageIndex);
  const nootTekst = new Map<string, string>();
  const blokTekst = (b: Blok[]): string => b.map((x) => (x.paragraph ? tekstVan(x.paragraph.inlines) : tekstVan([]) + blokTekst(x.blocks ?? []))).join("\n");
  for (const s of inhoud.structured.stories)
    if ((s.kind === "footnote" || s.kind === "endnote") && s.noteId) nootTekst.set(`${s.kind}:${s.noteId}`, blokTekst(s.blocks).trim());
  const uit: NootInfo[] = [];
  const tel = { voetnoot: 0, eindnoot: 0 };
  const loopInline = (inl: Inline[], blok: Blok) => {
    for (const i of inl) {
      if (isVerwijderd(i)) continue;
      if (i.kind === "noteReference" && i.noteId) {
        const soort = i.noteKind === "endnote" ? "eindnoot" : "voetnoot";
        const sleutel = `${i.noteKind}:${i.noteId}`;
        uit.push({
          soort,
          noteId: i.noteId,
          volgnummer: ++tel[soort],
          tekst: nootTekst.get(sleutel) ?? "",
          paraId: blok.anchor?.paraId ?? i.anchor?.start?.paraId ?? null,
          paginaVerwijzing: paginaVan.get(blok.id) ?? null,
          paginaNoot: nootPagina.get(sleutel) ?? null,
        });
      } else if (i.inlines) loopInline(i.inlines, blok);
    }
  };
  const loop = (blokken: Blok[]) => {
    for (const b of blokken) {
      if (b.paragraph) loopInline(b.paragraph.inlines, b);
      if (b.blocks) loop(b.blocks);
      for (const r of b.table?.rows ?? []) for (const c of r.cells) loop(c.blocks);
    }
  };
  for (const s of inhoud.structured.stories) if (s.kind === "body") loop(s.blocks);
  return uit;
}

// ---------------------------------------------------------------------------
// Kop- en voettekst bewerken

/** Staat de editor nu in de bewerkmodus voor kop- of voettekst? */
export function kopVoetActief() {
  return !!zichtbaarElement(".office-tekst .hf-inline-editor");
}

/** De zichtbare pagina die het meest in beeld is. */
function paginaInBeeld() {
  const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__scroll-container");
  const paginas = [...(vlak?.querySelectorAll<HTMLElement>(".canvas-page") ?? [])].filter((p) => !p.closest("[inert], [hidden]"));
  if (!paginas.length) return null;
  const midden = (vlak?.getBoundingClientRect().top ?? 0) + (vlak?.clientHeight ?? window.innerHeight) / 2;
  let beste = paginas[0];
  let afstand = Infinity;
  for (const p of paginas) {
    const r = p.getBoundingClientRect();
    const d = midden < r.top ? r.top - midden : midden > r.bottom ? midden - r.bottom : 0;
    if (d < afstand) {
      afstand = d;
      beste = p;
    }
  }
  return beste;
}

/**
 * Opent de bewerkmodus voor kop- of voettekst zoals een dubbelklik in de
 * paginamarge dat doet (de engine heeft er geen opdracht voor).
 */
export function bewerkKopVoet(api: DocxEditorRef, soort: "header" | "footer") {
  const pagina = paginaInBeeld();
  if (!pagina) return false;
  const sectie = api.getDocument()?.package?.document?.finalSectionProperties;
  const hoogte = sectie?.pageHeight || 16838;
  const r = pagina.getBoundingClientRect();
  const marge = soort === "header" ? sectie?.marginTop || 1440 : sectie?.marginBottom || 1440;
  const afstand = soort === "header" ? sectie?.headerDistance || 708 : sectie?.footerDistance || 708;
  // Midden tussen de rand-afstand en de marge: daar staat de kop/voettekst.
  const fractie = (Math.min(marge, afstand + 240) + afstand) / 2 / hoogte;
  const x = r.left + r.width / 2;
  const y = soort === "header" ? r.top + r.height * fractie : r.bottom - r.height * fractie;
  const doel = document.elementFromPoint(x, y) ?? pagina;
  const opties = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, view: window };
  for (const detail of [1, 2]) {
    doel.dispatchEvent(new PointerEvent("pointerdown", { ...opties, detail, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    doel.dispatchEvent(new MouseEvent("mousedown", { ...opties, detail }));
    doel.dispatchEvent(new PointerEvent("pointerup", { ...opties, detail, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    doel.dispatchEvent(new MouseEvent("mouseup", { ...opties, detail, buttons: 0 }));
    doel.dispatchEvent(new MouseEvent("click", { ...opties, detail, buttons: 0 }));
  }
  doel.dispatchEvent(new MouseEvent("dblclick", { ...opties, detail: 2, buttons: 0 }));
  return true;
}

/** Sluit de bewerkmodus via de knop in de balk van de engine. */
export function sluitKopVoet() {
  const balk = zichtbaarElement<HTMLElement>(".office-tekst .hf-inline-editor");
  if (!balk) return false;
  const opties = [...balk.querySelectorAll<HTMLButtonElement>("button")];
  const menu = opties[0];
  menu?.click();
  // Het menu verschijnt synchroon na de klik; de laatste knop is ‘sluiten’.
  const knoppen = [...balk.querySelectorAll<HTMLButtonElement>("button")];
  const sluiten = knoppen[knoppen.length - 1];
  if (sluiten && sluiten !== menu) {
    sluiten.click();
    return true;
  }
  return false;
}

/** De sectiestand van de laatste sectie zoals de engine die geladen heeft. */
export function sectieStand(api: DocxEditorRef | null) {
  const doc = api?.getDocument();
  const s = doc?.package?.document?.finalSectionProperties;
  const aantal = (doc?.package?.document?.sections?.length ?? 0) || 1;
  return {
    aantalSecties: aantal,
    titelpagina: !!s?.titlePg,
    evenOneven: !!s?.evenAndOddHeaders || !!(doc?.package as { settings?: { evenAndOddHeaders?: boolean } } | undefined)?.settings?.evenAndOddHeaders,
    liggend: s ? s.orientation === "landscape" || (s.pageWidth ?? 0) > (s.pageHeight ?? 0) : false,
    breedte: s?.pageWidth,
    hoogte: s?.pageHeight,
    kolommen: s?.columnCount ?? 1,
    marges: s ? { boven: s.marginTop, onder: s.marginBottom, links: s.marginLeft, rechts: s.marginRight } : null,
  };
}

// ---------------------------------------------------------------------------
// Cursor en beeld over het herladen heen

/** Waar de gebruiker was: de pagina in beeld en de cursor in de hoofdtekst. */
export interface Plek {
  /** 1-gebaseerd; 0 = het beeld niet terugzetten. */
  pagina: number;
  cursor: {
    /** Alinea-index in de hoofdtekst en het aantal alinea's toen. */
    index: number;
    aantal: number;
    /** Afstand (weergaveposities) tot het begin en het eind van de alinea. */
    vanBegin: number;
    totEind: number;
  } | null;
}

const OVER_HET_EIND = 1e9;

/** Leest de plek vóór het herladen (de cursor alleen in de hoofdtekst). */
export async function leesPlek(api: DocxEditorRef): Promise<Plek> {
  const plek: Plek = { pagina: api.getCurrentPage(), cursor: null };
  try {
    const editor = api.getEditorRef();
    const bereik = editor?.getSelectionRange();
    if (!editor || !bereik || kopVoetActief()) return plek;
    const loc = editor.displayPositionToYrsLoc(bereik.to);
    if (!loc || loc.story !== "body") return plek;
    const begin = editor.yrsLocToDisplayPosition({ ...loc, offset: 0 });
    const eind = editor.yrsLocToDisplayPosition({ ...loc, offset: OVER_HET_EIND });
    const lijst = await api.readParagraphs({ story: "body", view: "accepted" });
    const index = lijst.ok ? lijst.paragraphs.findIndex((p) => p.paraId === loc.paraId) : -1;
    if (lijst.ok && index >= 0 && begin != null && eind != null)
      plek.cursor = { index, aantal: lijst.paragraphs.length, vanBegin: bereik.to - begin, totEind: eind - bereik.to };
  } catch {
    // Alleen gemak: zonder plek gaat het herladen gewoon door.
  }
  return plek;
}

/** De alinea en de weergavepositie waar de cursor na het herladen hoort. */
export function cursorDoel(
  plek: NonNullable<Plek["cursor"]>,
  aantal: number,
  vanaf: "begin" | "eind",
): { index: number; vanBegin?: number; totEind?: number } {
  const index = Math.min(aantal - 1, Math.max(0, vanaf === "eind" ? aantal - (plek.aantal - plek.index) : plek.index));
  return vanaf === "eind" ? { index, totEind: plek.totEind } : { index, vanBegin: plek.vanBegin };
}

/**
 * Zet de cursor en het beeld terug na het herladen. `vanaf` zegt waar het
 * document veranderde: "eind" = op of vóór de cursor (bijvoorbeeld iets
 * ingevoegd op de cursor), dan tellen we vanaf het eind van het document en
 * van de alinea; "begin" = erna of buiten de hoofdtekst.
 */
export async function herstelPlek(api: DocxEditorRef, plek: Plek, vanaf: "begin" | "eind" = "eind") {
  if (plek.cursor)
    try {
      const editor = api.getEditorRef();
      const lijst = await api.readParagraphs({ story: "body", view: "accepted" });
      if (editor && lijst.ok && lijst.paragraphs.length) {
        const doel = cursorDoel(plek.cursor, lijst.paragraphs.length, vanaf);
        const paraId = lijst.paragraphs[doel.index].paraId;
        const begin = editor.yrsLocToDisplayPosition({ story: "body", paraId, offset: 0 });
        const eind = editor.yrsLocToDisplayPosition({ story: "body", paraId, offset: OVER_HET_EIND });
        if (begin != null && eind != null)
          editor.setSelection(doel.totEind !== undefined ? Math.max(begin, eind - doel.totEind) : Math.min(eind, begin + (doel.vanBegin ?? 0)));
      }
    } catch {
      // De cursor blijft dan aan het begin staan.
    }
  api.focus();
  // Ook pagina 1: de cursor kan het beeld naar een andere pagina hebben gebracht.
  // Vlak na de indeling negeert de engine scrollToPage soms: herhalen tot de pagina in beeld is.
  for (let poging = 0; plek.pagina >= 1 && poging < 12 && api.getCurrentPage() !== plek.pagina; poging++) {
    api.scrollToPage(plek.pagina);
    await new Promise((klaar) => setTimeout(klaar, 150));
  }
}
