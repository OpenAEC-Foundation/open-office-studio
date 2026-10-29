/**
 * Meet waar de liniaal en de tabelgrepen moeten staan: de pagina met de
 * cursor, het tekstvak (kolom of tabelcel) van de alinea, de opgeloste
 * inspringing en tabstops, en de randen van tabellen op de pagina's in beeld.
 *
 * Bronnen (alles alleen-lezen):
 *  - `getLayout()`: pagina's met marges, kolommen en fragmenten (paginapixels);
 *  - `yrsBlocksForStory`: de opgeloste alinea-indeling (inspringing en tabs na
 *    stijlen), per verhaal gebufferd op de checksum;
 *  - de displaylijst van de plug-ingeometrie voor de tabelranden
 *    (`deriveDisplayListTableFragmentsOnPages`, dezelfde bron als de
 *    tabelgrepen van de engine); zonder die lijst vallen we terug op de
 *    tabelfragmenten van de indeling;
 *  - `.canvas-page[data-page-index]` voor de plek op het scherm.
 */
import type { DocxEditorRef, DocxPluginGeometry } from "@betteroffice/docx-react";
import { deriveDisplayListTableFragmentsOnPages, type DisplayList, type DisplayListTableFragment } from "@betteroffice/docx/layout/render";
import type { Tabstop } from "../opmaak";
import type { TabelLoc } from "../tabel/opdrachten";
import type { TabelPayload } from "../tabel/logica";
import {
  TWIPS_PER_PX,
  directeTabs,
  inspringingUitBlok,
  tabsUitBlok,
  type Inspringing,
  type LiniaalTab,
} from "./model";

type Sessie = NonNullable<ReturnType<NonNullable<ReturnType<DocxEditorRef["getEditorRef"]>>["getYrsSession"]>>;

interface Fragment {
  kind: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  pmStart?: number;
  pmEnd?: number;
  blockId?: string;
  rowStart?: number;
  rowEnd?: number;
}
export interface IndelingPagina {
  size: { w: number; h: number };
  margins: { top: number; right: number; bottom: number; left: number };
  columns?: { count: number; gap: number; columns?: { width?: number; space?: number }[] };
  fragments: Fragment[];
}

/** Een rechthoek op het scherm (clientcoördinaten). */
export interface Vak {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Een pagina op het scherm; `schaal` = schermpixels per paginapixel (de zoom). */
export interface PaginaBeeld {
  index: number;
  rect: Vak;
  schaal: number;
  pagina: IndelingPagina;
}

/** Celverhaal `<ouder>:t<n>:r<r>c<k>`. */
const CEL = /^(.*):t(\d+):r(\d+)c(\d+)$/;

export interface TabelPlekInfo {
  loc: TabelLoc;
  /** Unieke sleutel van de tabel (verhaal en volgnummer). */
  sleutel: string;
  payload: TabelPayload;
}

const tabelCache = new WeakMap<object, Map<string, TabelPlekInfo | null>>();

/**
 * De tabel waartoe een celverhaal hoort. Het volgnummer in de verhaalnaam
 * (`t<n>`) is niet altijd het volgnummer in het verhaal (een nieuwe tabel
 * houdt zijn naam), dus we zoeken het tabel-embed met deze cel.
 */
export function tabelVanCel(sessie: Sessie, celVerhaal: string, versie = ""): TabelPlekInfo | null {
  const m = CEL.exec(celVerhaal);
  if (!m) return null;
  let cache = tabelCache.get(sessie);
  if (!cache) tabelCache.set(sessie, (cache = new Map()));
  const sleutel = `${versie}|${celVerhaal}`;
  if (cache.has(sleutel)) return cache.get(sleutel)!;
  if (cache.size > 500) cache.clear();
  const ouder = m[1];
  const voorvoegsel = `${ouder}:t${m[2]}:r`;
  const bevat = (payload: TabelPayload | null) => !!payload?.rows?.some((r) => r.cells.some((c) => c.story.startsWith(voorvoegsel)));
  let gevonden: TabelPlekInfo | null = null;
  // Meestal klopt het nummer uit de naam; dan hoeft het hele verhaal niet doorlopen.
  try {
    const gok = sessie.tablePayload(ouder, Number(m[2])) as unknown as TabelPayload | null;
    if (bevat(gok)) gevonden = { loc: { story: ouder, tableIndex: Number(m[2]) }, sleutel: `${ouder}|${m[2]}`, payload: gok! };
  } catch {
    gevonden = null;
  }
  if (gevonden) {
    cache.set(sleutel, gevonden);
    return gevonden;
  }
  try {
    let index = 0;
    for (const deel of sessie.storySegments(ouder)) {
      if (deel.kind !== "embed" || deel.embedKind !== "table") continue;
      const payload = deel.payload as unknown as TabelPayload;
      if (bevat(payload)) {
        gevonden = { loc: { story: ouder, tableIndex: index }, sleutel: `${ouder}|${index}`, payload };
        break;
      }
      index++;
    }
  } catch {
    gevonden = null;
  }
  cache.set(sleutel, gevonden);
  return gevonden;
}

/** Rij en kolom (rasterkolom, met samengevoegde cellen meegeteld) van een celverhaal. */
export function celIn(payload: TabelPayload, celVerhaal: string) {
  for (let r = 0; r < payload.rows.length; r++) {
    let kolom = Number(payload.rows[r].trPr?.gridBefore ?? 0) || 0;
    for (const cel of payload.rows[r].cells) {
      const span = Number(cel.tcPr?.colspan ?? 1) || 1;
      if (cel.story === celVerhaal) return { rij: r, kolom, span };
      kolom += span;
    }
  }
  return null;
}

/** Celgrenzen (rasterindexen) van een rij: de plekken waar een cel eindigt. */
export function celGrenzen(payload: TabelPayload, rij: number): number[] {
  const r = payload.rows[rij];
  if (!r) return [];
  let kolom = Number(r.trPr?.gridBefore ?? 0) || 0;
  const uit: number[] = [kolom];
  for (const cel of r.cells) {
    kolom += Number(cel.tcPr?.colspan ?? 1) || 1;
    uit.push(kolom);
  }
  return uit;
}

/** Rasterbreedtes (twips) van een tabel; zonder raster gelijk verdeeld. */
export function rasterVan(payload: TabelPayload): number[] {
  if (payload.grid?.length) return payload.grid.map((w) => Math.max(1, w));
  const kolommen = Math.max(1, ...payload.rows.map((r) => r.cells.reduce((n, c) => n + (Number(c.tcPr?.colspan ?? 1) || 1), 0)));
  return Array.from({ length: kolommen }, () => 2000);
}

const cumulatief = (breedtes: readonly number[]) => breedtes.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1] + w], [0]);

/** Linker- en rechtercelmarge (twips) van een cel, met de tabelstandaard als terugval. */
export function celMarges(payload: TabelPayload, rij: number, celVerhaal: string) {
  const cel = payload.rows[rij]?.cells.find((c) => c.story === celVerhaal);
  const eigen = cel?.tcPr?.margins as { left?: number; right?: number } | undefined;
  const tabel = payload.tblPr?.cellMargins as { left?: number; right?: number } | undefined;
  return {
    links: Number(eigen?.left ?? tabel?.left ?? 108) || 0,
    rechts: Number(eigen?.right ?? tabel?.right ?? 108) || 0,
  };
}

// --- Opgeloste alinea-indeling ---------------------------------------------------

interface Blok {
  kind: string;
  id?: string;
  attrs?: Record<string, unknown>;
  rows?: { cells?: { id?: string; padding?: { left?: number; right?: number } }[] }[];
}
interface Opgelost {
  versie: string;
  blokken: Map<string, Blok>;
  /** Celmarges (paginapixels) per celverhaal, zoals de engine ze tekent. */
  cellen: Map<string, { left: number; right: number }>;
}
const blokCache = new WeakMap<object, Map<string, Opgelost>>();

/**
 * De opgeloste indeling van een verhaal (`yrsBlocksForStory`, enkele ms voor
 * duizenden alinea's), gebufferd per documentversie. Niet `storyChecksum`: die
 * kost op een groot document een seconde.
 */
function opgelost(sessie: Sessie, verhaal: string): Opgelost | null {
  let cache = blokCache.get(sessie);
  if (!cache) blokCache.set(sessie, (cache = new Map()));
  let versie: string;
  try {
    versie = sessie.version();
  } catch {
    return null;
  }
  let item = cache.get(verhaal);
  if (!item || item.versie !== versie) {
    const blokken = new Map<string, Blok>();
    const cellen = new Map<string, { left: number; right: number }>();
    try {
      for (const b of sessie.yrsBlocksForStory(verhaal) as Blok[]) {
        if (b.kind === "paragraph" && b.id) blokken.set(b.id, b);
        if (b.kind === "table")
          for (const r of b.rows ?? [])
            for (const c of r.cells ?? [])
              if (c.id) cellen.set(c.id, { left: Number(c.padding?.left ?? 0) || 0, right: Number(c.padding?.right ?? 0) || 0 });
      }
    } catch {
      // Zonder opgeloste indeling: alleen de directe opmaak.
    }
    if (cache.size > 40) cache.clear();
    cache.set(verhaal, (item = { versie, blokken, cellen }));
  }
  return item;
}

/** Opgeloste indeling (`attrs`) van een alinea: inspringing en tabs na stijlen. */
export function opgelosteAlinea(sessie: Sessie, verhaal: string, paraId: string): Record<string, unknown> | undefined {
  return opgelost(sessie, verhaal)?.blokken.get(paraId)?.attrs;
}

/** Celmarges (paginapixels) zoals de engine de cel tekent, of null als onbekend. */
export function opgelosteCelmarges(sessie: Sessie, ouder: string, celVerhaal: string) {
  return opgelost(sessie, ouder)?.cellen.get(celVerhaal) ?? null;
}

// --- Pagina's ----------------------------------------------------------------------

function rechthoek(e: Element): Vak {
  const r = e.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** De pagina's op het scherm met hun indeling. */
export function paginaBeelden(vlak: Element, paginas: readonly IndelingPagina[]): PaginaBeeld[] {
  const uit: PaginaBeeld[] = [];
  for (const el of vlak.querySelectorAll<HTMLElement>(".canvas-page[data-page-index]")) {
    const index = Number(el.dataset.pageIndex);
    const pagina = paginas[index];
    if (!pagina?.size) continue;
    const rect = rechthoek(el);
    if (!(rect.width > 0)) continue;
    uit.push({ index, rect, schaal: rect.width / pagina.size.w, pagina });
  }
  return uit;
}

/** Eén pagina op het scherm, of null als die er (nog) niet staat. */
export function paginaBeeld(vlak: Element, paginas: readonly IndelingPagina[], index: number): PaginaBeeld | null {
  if (index < 0 || !paginas[index]?.size) return null;
  const el = vlak.querySelector(`.canvas-page[data-page-index="${index}"]`);
  if (!el) return null;
  const rect = rechthoek(el);
  return rect.width > 0 ? { index, rect, schaal: rect.width / paginas[index].size.w, pagina: paginas[index] } : null;
}

/** De pagina waarop weergavepositie `positie` staat. */
export function paginaMetPositie(paginas: readonly IndelingPagina[], positie: number | null) {
  if (positie === null) return -1;
  return paginas.findIndex((p) =>
    p.fragments.some((f) => f.pmStart !== undefined && f.pmEnd !== undefined && f.pmStart <= positie && positie <= f.pmEnd),
  );
}

/** De pagina die het meest in beeld is. */
export function paginaInBeeld(beelden: readonly PaginaBeeld[], venster: Vak): PaginaBeeld | null {
  let beste: PaginaBeeld | null = null;
  let meest = -1;
  for (const b of beelden) {
    const zicht = Math.min(b.rect.top + b.rect.height, venster.top + venster.height) - Math.max(b.rect.top, venster.top);
    if (zicht > meest) {
      meest = zicht;
      beste = b;
    }
  }
  return beste;
}

/** Tekstkolommen van een pagina (paginapixels): links en breedte. */
export function tekstkolommen(p: IndelingPagina): { links: number; breedte: number }[] {
  const links = p.margins.left;
  const breedte = p.size.w - p.margins.left - p.margins.right;
  const k = p.columns;
  if (!k || k.count <= 1) return [{ links, breedte }];
  const eigen = k.columns?.filter((c) => typeof c.width === "number");
  if (eigen && eigen.length === k.count) {
    let x = links;
    return eigen.map((c) => {
      const kolom = { links: x, breedte: c.width! };
      x += c.width! + (c.space ?? k.gap);
      return kolom;
    });
  }
  const elk = (breedte - k.gap * (k.count - 1)) / k.count;
  return Array.from({ length: k.count }, (_, i) => ({ links: links + i * (elk + k.gap), breedte: elk }));
}

// --- Tabelranden uit de displaylijst ---------------------------------------------------

export interface TabelBeeld {
  info: TabelPlekInfo;
  pagina: number;
  /** Paginapixels. */
  links: number;
  boven: number;
  onder: number;
  /** Rasterbreedtes (twips) en de x van elke rasterlijn (paginapixels). */
  raster: number[];
  lijnen: number[];
  /** Ondergrens van elke rij op deze pagina (paginapixels), met de getekende hoogte. */
  rijen: { rij: number; boven: number; onder: number }[];
}

type Weergave = NonNullable<ReturnType<DocxEditorRef["getEditorRef"]>>;

function displayLijst(geometrie: DocxPluginGeometry | null): DisplayList | null {
  // `queries` is intern in de engine; zonder vallen we terug op de indeling.
  const q = (geometrie?.dom as unknown as { queries?: { displayList?: DisplayList; isReady?: () => boolean } } | undefined)?.queries;
  try {
    return q?.displayList && (q.isReady?.() ?? true) ? q.displayList : null;
  } catch {
    return null;
  }
}

/** Tabellen op de pagina's `van`..`tot`, met hun randen in paginapixels. */
export function tabelBeelden(
  weergave: Weergave,
  sessie: Sessie,
  geometrie: DocxPluginGeometry | null,
  paginas: readonly IndelingPagina[],
  van: number,
  tot: number,
  versie: string,
): TabelBeeld[] {
  const lijst = displayLijst(geometrie);
  const uit: TabelBeeld[] = [];
  const posCache = new Map<number, string | null>();
  const tabelPerSleutel = new Map<string, TabelPlekInfo>();
  const sleutelVan = (pos: number | undefined) => {
    if (pos === undefined || pos === null) return null;
    if (posCache.has(pos)) return posCache.get(pos)!;
    let sleutel: string | null = null;
    try {
      const loc = weergave.displayPositionToYrsLoc(pos);
      const info = loc ? tabelVanCel(sessie, loc.story, versie) : null;
      if (info) {
        sleutel = info.sleutel;
        tabelPerSleutel.set(sleutel, info);
      }
    } catch {
      sleutel = null;
    }
    posCache.set(pos, sleutel);
    return sleutel;
  };
  if (lijst) {
    let fragmenten: DisplayListTableFragment[] = [];
    try {
      fragmenten = deriveDisplayListTableFragmentsOnPages(lijst, sleutelVan, van, tot);
    } catch {
      fragmenten = [];
    }
    for (const f of fragmenten) {
      const info = tabelPerSleutel.get(f.tableKey);
      if (!info) continue;
      const raster = rasterVan(info.payload);
      const lijnen = cumulatief(raster).map((t) => f.originX + t / TWIPS_PER_PX);
      const banden = [...f.rowBands].sort((a, b) => a.rowIndex - b.rowIndex);
      const rijen = banden.map((b, i) => {
        const volgende = banden[i + 1];
        // De rand ligt tussen de inhoud van deze rij en die van de volgende.
        const onder = volgende && volgende.rowIndex === b.rowIndex + 1 ? (b.bottom + volgende.top) / 2 : i === banden.length - 1 ? f.bottomY : b.bottom;
        const boven = i === 0 ? f.originY : uitRij(banden, i);
        return { rij: b.rowIndex, boven, onder };
      });
      uit.push({ info, pagina: f.pageIndex, links: f.originX, boven: f.originY, onder: f.bottomY, raster, lijnen, rijen });
    }
    return uit;
  }
  // Terugval: tabelfragmenten van de indeling (alleen tabellen in de hoofdtekst, zonder rijen).
  for (let p = van; p <= tot; p++) {
    for (const f of paginas[p]?.fragments ?? []) {
      if (f.kind !== "table") continue;
      const sleutel = sleutelVan(f.pmStart !== undefined ? f.pmStart + 2 : undefined);
      const info = sleutel ? tabelPerSleutel.get(sleutel) : null;
      if (!info) continue;
      const raster = rasterVan(info.payload);
      uit.push({
        info,
        pagina: p,
        links: f.x,
        boven: f.y,
        onder: f.y + (f.height ?? 0),
        raster,
        lijnen: cumulatief(raster).map((t) => f.x + t / TWIPS_PER_PX),
        rijen: [],
      });
    }
  }
  return uit;
}

function uitRij(banden: readonly { rowIndex: number; top: number; bottom: number }[], i: number) {
  const vorige = banden[i - 1];
  const b = banden[i];
  return vorige && vorige.rowIndex === b.rowIndex - 1 ? (vorige.bottom + b.top) / 2 : b.top;
}

// --- De stand van de liniaal --------------------------------------------------------

export interface LiniaalStand {
  pagina: PaginaBeeld;
  /** Witte stukken van de liniaal (paginapixels): de tekstkolommen. */
  kolommen: { links: number; breedte: number }[];
  /** Het tekstvak van de alinea met de cursor (paginapixels), of null (kop/voet, noten). */
  vak: { links: number; breedte: number } | null;
  /** Ruimte links van het tekstvak tot de paginarand (twips), voor uitspringen. */
  ruimteLinks: number;
  inspringing: Inspringing | null;
  tabs: LiniaalTab[];
  /** Directe tabs per geselecteerde alinea, en of een getoonde tab uit de stijl komt. */
  directe: Tabstop[];
  standaardTab: number;
  tabel: (TabelBeeld & { rij: number; grenzen: number[] }) | null;
  /** Of de cursor in de hoofdtekst (of een tabel daarin) staat. */
  inTekst: boolean;
}

export function standaardTabAfstand(ref: DocxEditorRef) {
  const w = (ref.getDocument()?.package as { settings?: { defaultTabStop?: number } } | undefined)?.settings?.defaultTabStop;
  return typeof w === "number" && w > 0 ? w : 720;
}

/** Meet de liniaal voor de cursor; null zonder document of zichtbare pagina's. */
export function meetLiniaal(ref: DocxEditorRef, vlak: Element, geometrie: DocxPluginGeometry | null): LiniaalStand | null {
  const weergave = ref.getEditorRef();
  const sessie = weergave?.getYrsSession();
  const indeling = weergave?.getLayout();
  if (!weergave || !sessie || !indeling) return null;
  const paginas = indeling.pages as unknown as IndelingPagina[];
  const head = sessie.selection()?.head ?? null;
  let positie: number | null = null;
  try {
    positie = head ? weergave.yrsLocToDisplayPosition(head) : null;
  } catch {
    positie = null;
  }
  const verhaal = head?.story ?? "";
  const inHoofdtekst = verhaal === "body" || verhaal.startsWith("body:");
  const index = inHoofdtekst ? paginaMetPositie(paginas, positie) : -1;
  // Alleen de pagina met de cursor meten (elke meting van een pagina kost een herberekening van de opmaak).
  const beeld =
    paginaBeeld(vlak, paginas, index) ??
    paginaInBeeld(paginaBeelden(vlak, paginas), rechthoek(vlak.querySelector(".docx-editor__scroll-container") ?? vlak));
  if (!beeld) return null;
  const p = beeld.pagina;
  const kolommen = tekstkolommen(p);
  const stand: LiniaalStand = {
    pagina: beeld,
    kolommen,
    vak: null,
    ruimteLinks: 0,
    inspringing: null,
    tabs: [],
    directe: [],
    standaardTab: standaardTabAfstand(ref),
    tabel: null,
    inTekst: false,
  };
  if (!head || !inHoofdtekst || beeld.index !== index || positie === null) return stand;
  const versie = String(sessie.version?.() ?? "");
  // Tekstvak: de cel van de tabel, anders het alineafragment (de kolom).
  const cel = CEL.exec(verhaal);
  if (cel) {
    const tabellen = tabelBeelden(weergave, sessie, geometrie, paginas, beeld.index, beeld.index, versie);
    const info = tabelVanCel(sessie, verhaal, versie);
    const tb = info && tabellen.find((t) => t.info.sleutel === info.sleutel);
    const plek = info && celIn(info.payload, verhaal);
    if (tb && plek) {
      // Liefst de celmarges zoals de engine ze tekent; anders tcMar/tblCellMar.
      const getekend = opgelosteCelmarges(sessie, info.loc.story, verhaal);
      const eigen = celMarges(info.payload, plek.rij, verhaal);
      const marges = getekend ?? { left: eigen.links / TWIPS_PER_PX, right: eigen.rechts / TWIPS_PER_PX };
      const links = tb.lijnen[plek.kolom] ?? tb.links;
      const rechts = tb.lijnen[plek.kolom + plek.span] ?? links;
      stand.vak = { links: links + marges.left, breedte: Math.max(1, rechts - links - marges.left - marges.right) };
      stand.tabel = { ...tb, rij: plek.rij, grenzen: celGrenzen(info.payload, plek.rij) };
    }
  } else {
    const f = p.fragments.find(
      (f) => f.kind === "paragraph" && f.pmStart !== undefined && f.pmEnd !== undefined && f.pmStart <= positie! && positie! <= f.pmEnd,
    );
    if (f) {
      // Bij meer kolommen is het fragment soms zo breed als het hele tekstvak: begrens op de kolom.
      const kolom = kolommen.find((k) => f.x >= k.links - 1 && f.x < k.links + k.breedte);
      stand.vak = { links: f.x, breedte: kolom ? Math.min(f.width, kolom.links + kolom.breedte - f.x) : f.width };
    }
  }
  if (!stand.vak) {
    // Terugval: de kolom (of het tekstvak van de pagina).
    stand.vak = kolommen[0];
  }
  stand.ruimteLinks = Math.max(0, Math.round(stand.vak.links * TWIPS_PER_PX));
  Object.assign(stand, alineaGegevens(sessie, verhaal, head.paraId, versie));
  stand.inTekst = true;
  return stand;
}

const alineaCache = new WeakMap<object, { sleutel: string; gegevens: Pick<LiniaalStand, "inspringing" | "tabs" | "directe"> }>();

/** Inspringing en tabs van de alinea met de cursor; bij scrollen uit de buffer. */
function alineaGegevens(sessie: Sessie, verhaal: string, paraId: string, versie: string) {
  const sleutel = `${versie}|${verhaal}|${paraId}`;
  const oud = alineaCache.get(sessie);
  if (oud?.sleutel === sleutel) return oud.gegevens;
  const attrs = opgelosteAlinea(sessie, verhaal, paraId);
  // Directe opmaak via de selectiecontext: `paragraphs()` doorloopt het hele verhaal.
  let direct: Record<string, unknown> = {};
  try {
    const plek = { paraId, offset: 0 };
    direct = (sessie.selectionContext({ story: verhaal, start: plek, end: plek }).paragraphProperties ?? {}) as Record<string, unknown>;
  } catch {
    direct = {};
  }
  const gegevens = { inspringing: inspringingUitBlok(attrs), tabs: tabsUitBlok(attrs), directe: directeTabs(direct) };
  alineaCache.set(sessie, { sleutel, gegevens });
  return gegevens;
}
