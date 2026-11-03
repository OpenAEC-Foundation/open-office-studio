/**
 * Spellingcontrole voor één geopend tekstdocument (Open Tekst Studio).
 *
 * Leest de alinea's via de plug-in-API van de engine (`readParagraphs`),
 * controleert alleen gewijzigde alinea's (gedebounced), houdt de fouten per
 * alinea bij en voert vervangingen uit als versiegecontroleerde edit-batch
 * (`applyEdits`, één ongedaan-maakstap). De golflijnen tekent de plug-in-
 * overlay (Golflijnen.tsx) uit deze gegevens.
 */
import type { DocxEditorRef, DocxPluginContext, DocxPluginGeometry } from "@betteroffice/docx-react";
import type { DocxEditStep, YrsSession } from "@betteroffice/docx/yrs";
import { leesInstellingen } from "../../instellingen";
import type { Controleur, Fout } from "../controleur";
import { standaardTaal, type Taal, type TaalId } from "../talen";
import { genegeerd, persoonlijk } from "../woordenlijst";
import { alineatalenUitDocx, wijsTalenToe, type Alineatalen } from "./taal";
import { autocorrectie } from "../autocorrectie";

export interface PluginStaat {
  /** Telt op bij elke nieuwe controle, zodat de overlay opnieuw tekent. */
  teller: number;
}

export interface Alinea {
  story: string;
  paraId: string;
  tekst: string;
  taal: Taal;
  fouten: Fout[];
}

export interface Plek {
  paraId: string;
  offset: number;
  story?: string;
}

export interface MenuStand {
  x: number;
  y: number;
  alinea: Alinea;
  fout: Fout;
  suggesties: string[] | null;
}

type Ctx = DocxPluginContext<PluginStaat>;

/** Eén segment van een alinea zoals de sessie het geeft (storySegments). */
export interface Segment {
  kind: string;
  text?: string;
  embedKind?: string;
  attributes?: Record<string, unknown>;
}

/**
 * Telt alleen in de sessie mee, niet in de geaccepteerde tekst: bijgehouden
 * verwijderingen en een tabel die direct vóór de alinea staat.
 */
const alleenRauw = (d: Segment) => !!d.attributes?.del || (d.kind === "embed" && d.embedKind === "table");
const segmentLengte = (d: Segment) => (d.kind === "text" ? (d.text ?? "").length : 1);

/**
 * Rekent een offset in de geaccepteerde tekst (zoals `readParagraphs` met
 * view "accepted" die geeft) om naar een offset in de sessie (Yrs), waar
 * verwijderde tekst nog meetelt. Een begin direct na een verwijdering komt
 * erachter, een eind (`eind`) direct ervoor.
 */
export function naarRauw(segmenten: readonly Segment[], offset: number, eind = false): number {
  let geaccepteerd = 0;
  let rauw = 0;
  for (const d of segmenten) {
    if (d.kind === "pilcrow") break;
    const lengte = segmentLengte(d);
    if (alleenRauw(d)) {
      if (eind ? geaccepteerd >= offset && geaccepteerd > 0 : geaccepteerd > offset) break;
      rauw += lengte;
      continue;
    }
    if (offset < geaccepteerd + lengte || (eind && offset <= geaccepteerd + lengte)) return rauw + (offset - geaccepteerd);
    geaccepteerd += lengte;
    rauw += lengte;
  }
  return rauw + (offset - geaccepteerd);
}

/** Omgekeerd: een sessie-offset naar de geaccepteerde tekst (binnen een verwijdering: het begin ervan). */
export function naarGeaccepteerd(segmenten: readonly Segment[], rauw: number): number {
  let geaccepteerd = 0;
  let r = 0;
  for (const d of segmenten) {
    if (d.kind === "pilcrow") break;
    const lengte = segmentLengte(d);
    if (alleenRauw(d)) {
      if (rauw < r + lengte) return geaccepteerd;
      r += lengte;
      continue;
    }
    if (rauw <= r + lengte) return geaccepteerd + (rauw - r);
    geaccepteerd += lengte;
    r += lengte;
  }
  return geaccepteerd + Math.max(0, rauw - r);
}

const VERTRAGING = 350;

/**
 * Nieuwe beginpositie van een eenmaal genegeerd woord nadat de alineatekst is
 * gewijzigd, of null als het woord zelf is geraakt. Alleen het gewijzigde
 * stuk telt (gemeenschappelijk begin en eind blijven staan), zoals Word een
 * genegeerde plek laat meeschuiven met typen elders in de alinea.
 */
export function verschuifPlek(oud: string, nieuw: string, start: number, woord: string): number | null {
  if (oud === nieuw) return nieuw.slice(start, start + woord.length) === woord ? start : null;
  let begin = 0;
  const max = Math.min(oud.length, nieuw.length);
  while (begin < max && oud[begin] === nieuw[begin]) begin++;
  let eind = 0;
  while (eind < max - begin && oud[oud.length - 1 - eind] === nieuw[nieuw.length - 1 - eind]) eind++;
  const eindWoord = start + woord.length;
  let plek: number | null = null;
  // Het woord ligt (met de letter erna) helemaal vóór het gewijzigde stuk …
  if (eindWoord < begin || (eindWoord === begin && !/\p{L}/u.test(nieuw[begin] ?? ""))) plek = start;
  // … of helemaal erna (en de letter ervóór is niet veranderd).
  else if (start > oud.length - eind || (start === oud.length - eind && !/\p{L}/u.test(nieuw[nieuw.length - eind - 1] ?? "")))
    plek = start + nieuw.length - oud.length;
  return plek !== null && nieuw.slice(plek, plek + woord.length) === woord ? plek : null;
}

interface SegmentCache {
  sessie: YrsSession;
  versie: string;
  lengtes: Map<string, Map<string, number>>;
  gelezen: Set<string>;
  per: Map<string, Segment[]>;
}

export class SpellingSessie {
  /** Laatst gecontroleerde alinea's, in documentvolgorde. */
  alineas: Alinea[] = [];
  private perId = new Map<string, Alinea>();
  /** Alinea's waarvan de tekst sinds de laatste controle kan zijn gewijzigd. */
  private vuil = new Set<string>();
  private ctx: Ctx | null = null;
  /** De geometrie van de laatst getekende overlay. */
  geometrie: DocxPluginGeometry | null = null;
  /** Keuze van de gebruiker voor het hele document; null = uit w:lang. */
  documentTaal: Taal | null = null;
  /** Keuze per alinea (alleen deze sessie). */
  private alineaTaal = new Map<string, Taal>();
  /**
   * "Negeren" (één keer) in het F7-venster: per alinea de genegeerde plekken,
   * met de alineatekst waarvoor ze gelden (alleen deze sessie).
   */
  private eenmalig = new Map<string, { tekst: string; plekken: { start: number; woord: string }[] }>();
  private talen: Alineatalen | null = null;
  private timer = 0;
  private bezig: Promise<void> | null = null;
  private opnieuw = false;
  private laatsteWijziging = 0;
  /** Null zolang de eerste controle loopt. */
  aantal: number | null = null;
  probleem: string | null = null;
  menu: MenuStand | null = null;
  vensterOpen = false;
  private luisteraars = new Set<() => void>();
  private stand = 0;
  private gestopt = false;
  /** Aantal getypte tekens in het document (voor de autocorrectie). */
  toetsen = 0;

  constructor(
    readonly editor: () => DocxEditorRef | null,
    readonly controleur: () => Controleur,
    /** De bytes van het geladen DOCX (voor w:lang, zie taal.ts). */
    private readonly bytes: () => Uint8Array | null = () => null,
  ) {}

  // --- abonnement voor React (statusbalk, menu, venster) ---
  volg = (l: () => void) => {
    this.luisteraars.add(l);
    return () => {
      this.luisteraars.delete(l);
    };
  };
  leesStand = () => this.stand;
  meld() {
    this.stand++;
    this.luisteraars.forEach((l) => l());
  }

  /** Na `stop` weer starten (React StrictMode koppelt effecten twee keer). */
  start() {
    if (!this.gestopt) return;
    this.gestopt = false;
    this.plan(0);
  }

  stop() {
    this.gestopt = true;
    window.clearTimeout(this.timer);
  }

  get aan() {
    return leesInstellingen().spelling.controleren;
  }

  // --- plug-in-levenscyclus ---
  bijContext(ctx: Ctx) {
    this.ctx = ctx;
  }

  bijLaden(ctx: Ctx) {
    this.ctx = ctx;
    this.segmentCache = null;
    this.alineas = [];
    this.perId.clear();
    this.vuil.clear();
    this.talen = null;
    this.aantal = null;
    this.plan(0);
  }

  bijWijziging(ctx: Ctx) {
    this.ctx = ctx;
    this.laatsteWijziging = performance.now();
    // Hier is alleen de alinea-id nodig. cursor() vertaalt óók de offset naar
    // geaccepteerde tekst en leest daarvoor tekst en de verhaalindex. Doe dat
    // niet synchroon op elke documentwijziging; de controle volgt gedebounced.
    let paraId: string | undefined;
    try {
      const ed = this.editor()?.getEditorRef();
      const bereik = ed?.getSelectionRange();
      if (ed && bereik) paraId = ed.displayPositionToYrsLoc(bereik.from)?.paraId;
    } catch {
      // Zonder betrouwbare locatie blijft de volledige hercontrole nodig.
    }
    if (paraId !== undefined) this.vuil.add(paraId);
    else this.vuil = new Set(this.perId.keys());
    this.plan(VERTRAGING);
  }

  plan(vertraging = VERTRAGING) {
    if (this.gestopt) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.controleer(), vertraging);
  }

  /** De cursor als alinea en offset, of null. */
  cursor(): Plek | null {
    const ed = this.editor()?.getEditorRef();
    const bereik = ed?.getSelectionRange();
    if (!ed || !bereik) return null;
    try {
      const loc = ed.displayPositionToYrsLoc(bereik.from);
      if (!loc) return null;
      // De sessie telt verwijderde tekst en een voorafgaande tabel mee; de
      // fouten en de autocorrectie rekenen in de geaccepteerde tekst.
      const r = ed.getYrsSession()?.readParagraphs({ view: "accepted", story: loc.story, paraIds: [loc.paraId] });
      const lengte = r?.ok ? r.paragraphs[0]?.text.length : undefined;
      const delen = lengte === undefined ? null : this.afwijkendeSegmenten(loc.story, loc.paraId, lengte);
      return { paraId: loc.paraId, offset: delen ? naarGeaccepteerd(delen, loc.offset) : loc.offset, story: loc.story };
    } catch {
      return null;
    }
  }

  /** De talen uit het geladen pakket (eenmalig per document gelezen). */
  private taalmodel(): Alineatalen {
    this.talen ??= alineatalenUitDocx(this.bytes());
    return this.talen;
  }

  /** De hoofdtekst en de tabelcellen daarin (kop- en voetteksten en noten niet). */
  private verhalen(): string[] {
    try {
      const ids = this.editor()?.getEditorRef()?.getYrsSession()?.storyIds() ?? ["body"];
      const uit = ids.filter((id) => id === "body" || /^body:t\d+:r\d+c\d+/.test(id));
      return uit.includes("body") ? uit : ["body", ...uit];
    } catch {
      return ["body"];
    }
  }

  /** De taal van het document: gekozen, of uit de standaardstijl, of van het systeem. */
  taalVanDocument(): Taal {
    return this.documentTaal ?? this.talen?.standaard ?? standaardTaal();
  }

  taalVanAlinea(paraId: string): Taal {
    return this.perId.get(paraId)?.taal ?? this.taalVanDocument();
  }

  kiesDocumentTaal(taal: Taal | null) {
    this.documentTaal = taal;
    this.alineaTaal.clear();
    this.herbegin();
  }

  kiesAlineaTaal(paraId: string, taal: Taal) {
    this.alineaTaal.set(paraId, taal);
    this.vuil.add(paraId);
    this.plan(0);
  }

  /** Alles opnieuw (andere taal, instelling of woordenlijst). */
  herbegin() {
    for (const a of this.alineas) a.tekst = "\u0000";
    this.plan(0);
  }

  /** Controleert de gewijzigde alinea's. Eén controle tegelijk. */
  async controleer(): Promise<void> {
    if (this.bezig) {
      this.opnieuw = true;
      return this.bezig;
    }
    this.bezig = this.voerControleUit().finally(() => {
      this.bezig = null;
      if (this.opnieuw) {
        this.opnieuw = false;
        this.plan(VERTRAGING);
      }
    });
    return this.bezig;
  }

  private async voerControleUit() {
    const ctx = this.ctx;
    if (!ctx || this.gestopt) return;
    if (!this.aan) {
      this.alineas = [];
      this.perId.clear();
      this.aantal = 0;
      this.herteken();
      return;
    }
    // Alle verhalen in één versie lezen (de hoofdtekst en elke tabelcel apart).
    const verhalen = this.verhalen();
    const gelezen: { story: string; paragraphs: { story: string; paraId: string; text: string }[] }[] = [];
    try {
      await ctx.run(async (vers) => {
        const uit = await Promise.all(verhalen.map((story) => vers.read.readParagraphs({ view: "accepted", story })));
        const versies = new Set<string>();
        uit.forEach((r, i) => {
          if ("ok" in r && r.ok) {
            versies.add(r.version);
            gelezen.push({ story: verhalen[i], paragraphs: r.paragraphs });
          }
        });
        // Tussendoor getypt: later opnieuw.
        if (versies.size > 1) gelezen.length = 0;
      });
    } catch {
      return;
    }
    if (!gelezen.length) {
      this.opnieuw = true;
      return;
    }
    const instelling = leesInstellingen().spelling;
    const { talen, plek } = this.taalmodel();
    const docTaal = this.taalVanDocument();
    const teControleren: Alinea[] = [];
    const maak = (p: { story: string; paraId: string; text: string }, i: number, uitModel: (Taal | null)[] | undefined) => {
      const taal = this.alineaTaal.get(p.paraId) ?? (this.documentTaal ? null : uitModel?.[i]) ?? docTaal;
      const oud = this.perId.get(p.paraId);
      if (oud && oud.tekst === p.text && oud.taal === taal && !this.vuil.has(p.paraId)) return oud;
      const a: Alinea = { story: p.story, paraId: p.paraId, tekst: p.text, taal, fouten: [] };
      teControleren.push(a);
      return a;
    };
    // Documentvolgorde: de cellen van een tabel komen na de alinea vóór die tabel.
    const perVerhaal = gelezen.map((v) => {
      const uitModel = wijsTalenToe(
        v.paragraphs.map((p) => p.text),
        talen.get(v.story),
      );
      return { story: v.story, alineas: v.paragraphs.map((p, i) => maak(p, i, uitModel)) };
    });
    const hoofd = perVerhaal.find((v) => v.story === "body")?.alineas ?? [];
    const cellen = perVerhaal.filter((v) => v.story !== "body");
    const nieuw: Alinea[] = [];
    for (let i = 0; i <= hoofd.length; i++) {
      for (const c of cellen) if ((plek.get(c.story) ?? hoofd.length) === i) nieuw.push(...c.alineas);
      if (i < hoofd.length) nieuw.push(hoofd[i]);
    }
    for (const c of cellen) if ((plek.get(c.story) ?? hoofd.length) > hoofd.length) nieuw.push(...c.alineas);
    try {
      const c = this.controleur();
      // U+FFFC (afbeelding, veld) is geen letter en breekt woorden netjes af.
      const uitkomst = await c.controleer(
        teControleren.map((a) => ({ tekst: a.tekst, taal: a.taal })),
        instelling,
      );
      // Niet onderstrepen terwijl iemand nog aan het woord typt (zoals Word).
      const cursor = performance.now() - this.laatsteWijziging < 1500 ? this.cursor() : null;
      teControleren.forEach((a, i) => {
        a.fouten = uitkomst[i].filter(
          (f) => !(cursor && cursor.paraId === a.paraId && f.eind === cursor.offset),
        );
        // Opnieuw bekijken zodra de cursor weg is.
        if (cursor && cursor.paraId === a.paraId && a.fouten.length !== uitkomst[i].length) a.tekst = "\u0000";
      });
      this.probleem = null;
    } catch (fout) {
      this.probleem = String((fout as Error)?.message ?? fout);
      this.aantal = null;
      this.meld();
      return;
    }
    // Is het document intussen veranderd, dan blijven de gewijzigde alinea's vuil.
    this.alineas = nieuw;
    this.perId = new Map(nieuw.map((a) => [a.paraId, a]));
    for (const a of teControleren) this.vuil.delete(a.paraId);
    this.aantal = this.tel();
    this.herteken();
  }

  /** Aantal fouten zonder de eenmaal genegeerde plekken. */
  private tel() {
    return this.alineas.reduce((n, a) => n + a.fouten.filter((f) => !this.eenmaalGenegeerd(a, f)).length, 0);
  }

  /** Is deze fout met "Negeren" (één keer) overgeslagen? */
  private eenmaalGenegeerd(a: Alinea, f: Fout) {
    const e = this.eenmalig.get(a.paraId);
    if (!e) return false;
    // Tekst "\u0000": de alinea wacht op een nieuwe controle; de plekken blijven.
    if (e.tekst !== a.tekst && !a.tekst.includes("\u0000")) {
      const plekken: { start: number; woord: string }[] = [];
      for (const p of e.plekken) {
        // Vastgelegd terwijl de alinea op controle wachtte: de plek zelf geldt.
        const start = e.tekst.includes("\u0000") ? verschuifPlek(a.tekst, a.tekst, p.start, p.woord) : verschuifPlek(e.tekst, a.tekst, p.start, p.woord);
        if (start !== null) plekken.push({ start, woord: p.woord });
      }
      if (!plekken.length) {
        this.eenmalig.delete(a.paraId);
        return false;
      }
      e.tekst = a.tekst;
      e.plekken = plekken;
    }
    return e.plekken.some((p) => p.start === f.start && p.woord === f.tekst);
  }

  /** "Negeren" (één keer): alleen deze plek, hetzelfde woord elders blijft gemarkeerd. */
  negeerHier(alinea: Alinea, fout: Fout) {
    // Eerdere plekken in deze alinea eerst bijwerken naar de huidige tekst.
    this.eenmaalGenegeerd(alinea, fout);
    const e = this.eenmalig.get(alinea.paraId);
    const plek = { start: fout.start, woord: fout.tekst };
    if (e && e.tekst === alinea.tekst) e.plekken.push(plek);
    else this.eenmalig.set(alinea.paraId, { tekst: alinea.tekst, plekken: [plek] });
    if (this.aantal !== null) this.aantal = this.tel();
    this.herteken();
  }

  private herteken() {
    void this.ctx
      ?.run((vers) => {
        vers.setState((s) => ({ teller: s.teller + 1 }));
      })
      .catch(() => {});
    this.meld();
  }

  /** Alinea's die de overlay mag tekenen (niet vuil). */
  zichtbareFouten(kies?: (alinea: Alinea) => boolean): { alinea: Alinea; fout: Fout }[] {
    const uit: { alinea: Alinea; fout: Fout }[] = [];
    for (const a of this.alineas) {
      if (!a.fouten.length || this.vuil.has(a.paraId) || (kies && !kies(a))) continue;
      for (const f of a.fouten)
        if (!persoonlijk.bevat(f.tekst) && !genegeerd.bevat(f.tekst) && !this.eenmaalGenegeerd(a, f)) uit.push({ alinea: a, fout: f });
    }
    return uit;
  }

  foutOp(plek: Plek): { alinea: Alinea; fout: Fout } | null {
    const a = this.perId.get(plek.paraId);
    if (!a || this.vuil.has(a.paraId)) return null;
    const f = a.fouten.find((f) => f.start <= plek.offset && plek.offset <= f.eind);
    if (!f || persoonlijk.bevat(f.tekst) || genegeerd.bevat(f.tekst) || this.eenmaalGenegeerd(a, f)) return null;
    return { alinea: a, fout: f };
  }

  /** De eerste fout na `vanaf` (of vanaf het begin), met doorlopen naar het begin. */
  volgendeFout(vanaf: Plek | null, overslaan?: { paraId: string; start: number }): { alinea: Alinea; fout: Fout } | null {
    const lijst = this.zichtbareFouten();
    if (!lijst.length) return null;
    if (!vanaf) return lijst[0];
    const index = this.alineas.findIndex((a) => a.paraId === vanaf.paraId);
    const volgorde = new Map(this.alineas.map((a, i) => [a.paraId, i]));
    const na = lijst.find(({ alinea, fout }) => {
      const i = volgorde.get(alinea.paraId)!;
      if (overslaan && alinea.paraId === overslaan.paraId && fout.start === overslaan.start) return false;
      return i > index || (i === index && fout.start >= vanaf.offset);
    });
    return na ?? lijst.find(({ alinea, fout }) => !(overslaan && alinea.paraId === overslaan.paraId && fout.start === overslaan.start)) ?? null;
  }

  /** Compacte lengtes en afwijkende segmenten, uitsluitend voor deze sessieversie. */
  private segmentCache: SegmentCache | null = null;

  /**
   * De sessie-offset (Yrs) van een offset in de geaccepteerde tekst van een
   * alinea. Zonder bijgehouden verwijderingen in de alinea zijn ze gelijk.
   */
  rauw(alinea: Alinea, offset: number, eind = false): number {
    return this.rauwInContext(alinea, offset, eind, this.segmentenContext());
  }

  /** Alleen binnen één synchrone leesbewerking gebruiken; er wordt niet bewerkt. */
  offsetLezer() {
    const context = this.segmentenContext();
    if (!context) return this.rauw.bind(this);
    return (alinea: Alinea, offset: number, eind = false) => this.rauwInContext(alinea, offset, eind, context);
  }

  private rauwInContext(alinea: Alinea, offset: number, eind: boolean, context: SegmentCache | null): number {
    const delen = this.afwijkendeSegmenten(alinea.story, alinea.paraId, alinea.tekst.length, context);
    return delen ? naarRauw(delen, offset, eind) : offset;
  }

  private segmentenContext(): SegmentCache | null {
    const sessie = this.editor()?.getEditorRef()?.getYrsSession();
    if (!sessie) return null;
    try {
      const versie = String(sessie.version());
      if (this.segmentCache?.sessie !== sessie || this.segmentCache.versie !== versie)
        this.segmentCache = { sessie, versie, lengtes: new Map(), gelezen: new Set(), per: new Map() };
      return this.segmentCache;
    } catch {
      return null;
    }
  }

  /**
   * De segmenten van een alinea als de sessie er meer telt dan de
   * geaccepteerde tekst lang is (verwijderingen, tabel ervoor); anders null.
   */
  private afwijkendeSegmenten(story: string, paraId: string, lengte: number, cache = this.segmentenContext()): Segment[] | null {
    if (!cache) return null;
    const sessie = cache.sessie;
    try {
      let lengtes = cache.lengtes.get(story);
      if (!lengtes) {
        try {
          lengtes = new Map();
          const dubbel = new Set<string>();
          // De Rust-kern leest deze compacte index in één verhaaldoorloop.
          // Geen volledige alinea-opzoeking voor iedere woord- en alineagrens.
          for (const p of sessie.paragraphSpans(story)) {
            if (lengtes.has(p.paraId) || dubbel.has(p.paraId)) {
              lengtes.delete(p.paraId);
              dubbel.add(p.paraId);
            } else if (Number.isSafeInteger(p.length) && p.length >= 0) lengtes.set(p.paraId, p.length);
          }
          cache.lengtes.set(story, lengtes);
        } catch {
          // Een nog onbeschikbare index verandert de oorspronkelijke route niet.
          lengtes = undefined;
        }
      }
      let rauweLengte = lengtes?.get(paraId);
      if (rauweLengte === undefined) {
        const span = sessie.locateParagraph(story, paraId);
        rauweLengte = span.end - span.start;
      }
      if (rauweLengte === lengte) return null;
      const sleutel = `${story}\u0000${paraId}`;
      if (!cache.gelezen.has(story)) {
        // Eén keer per versie en verhaal: alle alinea's van het verhaal opdelen.
        let huidig: Segment[] = [];
        for (const d of sessie.storySegments(story) as Segment[]) {
          if (d.kind === "pilcrow") {
            cache.per.set(`${story}\u0000${(d as { paraId?: string }).paraId}`, huidig);
            huidig = [];
          } else huidig.push(d);
        }
        cache.gelezen.add(story);
      }
      return cache.per.get(sleutel) ?? [];
    } catch {
      return null;
    }
  }

  /** Selecteert een fout in de editor en scrolt ernaartoe. */
  selecteer(alinea: Alinea, fout: Fout) {
    const ed = this.editor()?.getEditorRef();
    if (!ed) return;
    const van = ed.yrsLocToDisplayPosition({ story: alinea.story, paraId: alinea.paraId, offset: this.rauw(alinea, fout.start) });
    const tot = ed.yrsLocToDisplayPosition({ story: alinea.story, paraId: alinea.paraId, offset: this.rauw(alinea, fout.eind, true) });
    if (van !== null && tot !== null) ed.highlightRange(van, tot);
  }

  /**
   * Vervangt fouten door nieuwe tekst als één edit-batch (één
   * ongedaan-maakstap). Leest eerst de huidige versie en controleert dat de
   * woorden er nog precies zo staan.
   */
  async vervang(doelen: readonly { alinea: Alinea; fout: Fout }[], nieuw: string): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx || !doelen.length) return false;
    let gelukt = false;
    await this.editor()?.flushPendingInput().catch(() => {});
    await ctx.run(async (vers) => {
      if (!vers.edits) return;
      const ids = [...new Set(doelen.map((d) => d.alinea.paraId))];
      const r = await vers.read.readParagraphs({ view: "accepted", paraIds: ids, story: doelen[0].alinea.story });
      if (!("ok" in r) || !r.ok) return;
      const huidig = new Map(r.paragraphs.map((p) => [p.paraId, p.text]));
      const stappen: DocxEditStep[] = [];
      for (const { alinea, fout } of doelen) {
        if (huidig.get(alinea.paraId)?.slice(fout.start, fout.eind) !== fout.tekst) continue;
        stappen.push({
          op: "replaceText",
          target: {
            kind: "range",
            story: alinea.story,
            start: { paraId: alinea.paraId, offset: fout.start },
            end: { paraId: alinea.paraId, offset: fout.eind },
            view: "accepted",
          },
          text: nieuw,
          expect: { text: fout.tekst },
        });
      }
      if (!stappen.length) return;
      const uit = await vers.edits.applyEdits({ expectVersion: r.version, steps: stappen });
      gelukt = "ok" in uit && uit.ok;
    });
    if (gelukt) {
      for (const { alinea } of doelen) this.vuil.add(alinea.paraId);
      this.plan(0);
    }
    return gelukt;
  }

  /** Alle plekken van hetzelfde onbekende woord (voor "Alles wijzigen"). */
  zelfdeFouten(woord: string, taal: TaalId) {
    return this.zichtbareFouten().filter(({ fout }) => fout.tekst === woord && fout.taal === taal);
  }

  negeerAlles(woord: string) {
    genegeerd.voegToe(woord);
    this.herteken();
  }

  voegToe(woord: string) {
    persoonlijk.voegToe(woord);
    this.herteken();
  }

  /**
   * Autocorrectie van het zojuist getypte woord (na een spatie of leesteken).
   *
   * De engine houdt getypte tekens even vast (hasPendingInput); daarom eerst
   * `flushPendingInput`, en direct daarna synchroon lezen (YrsSession.
   * readParagraphs geeft tekst én versie) en één edit-batch met die versie en
   * een tekstbewaking (`expect`). Het venster waarin doortypen de versie kan
   * veranderen, is zo zo klein mogelijk; gebeurt het toch ("stale-version"),
   * dan opnieuw. De tekens die na het scheidingsteken getypt zijn, tellen we
   * terug om het scheidingsteken terug te vinden. (setSelection + insertText
   * verving de selectie niet betrouwbaar en is daarom niet gebruikt.)
   */
  autocorrigeer(teken: string, volgnummer: number, poging = 0): void {
    const ed = this.editor()?.getEditorRef();
    const sessie = ed?.getYrsSession();
    const edits = this.ctx?.edits;
    if (!ed || !sessie || !edits || this.gestopt || poging > 150) return;
    if (ed.hasPendingInput()) {
      void ed
        .flushPendingInput()
        .catch(() => {})
        .then(() => {
          // Nog steeds invoer: wie doortypt, krijgt de correctie bij de eerste pauze.
          if (ed.hasPendingInput()) window.setTimeout(() => this.autocorrigeer(teken, volgnummer, poging + 1), 30);
          else this.autocorrigeer(teken, volgnummer, poging + 1);
        });
      return;
    }
    const cursor = this.cursor();
    if (!cursor?.story) return;
    let gelezen: { tekst: string; versie: string };
    try {
      const r = sessie.readParagraphs({ view: "accepted", story: cursor.story, paraIds: [cursor.paraId] });
      if (!r.ok || !r.paragraphs[0]) return;
      gelezen = { tekst: r.paragraphs[0].text, versie: r.version };
    } catch {
      return;
    }
    // Het scheidingsteken staat `erna` tekens vóór de cursor.
    const erna = Math.max(0, this.toetsen - volgnummer);
    const plek = cursor.offset - 1 - erna;
    if (plek < 0 || gelezen.tekst[plek] !== teken) return;
    const c = autocorrectie(gelezen.tekst, plek + 1, {
      taal: this.perId.get(cursor.paraId)?.taal ?? this.taalVanDocument(),
      uitzondering: (w) => persoonlijk.bevat(w) || genegeerd.bevat(w),
    });
    if (!c) return;
    void edits
      .applyEdits({
        expectVersion: gelezen.versie,
        steps: [
          {
            op: "replaceText",
            target: {
              kind: "range",
              story: cursor.story,
              start: { paraId: cursor.paraId, offset: c.start },
              end: { paraId: cursor.paraId, offset: c.eind },
              view: "accepted",
            },
            text: c.nieuw,
            expect: { text: c.oud },
          },
        ],
      })
      .then((uit) => {
        const code = !uit.ok ? (uit as { failure?: { code?: string } }).failure?.code : null;
        if (code === "stale-version") this.autocorrigeer(teken, volgnummer, poging + 1);
      })
      .catch(() => {});
  }

  // --- rechtermuismenu ---
  async openMenu(x: number, y: number, alinea: Alinea, fout: Fout) {
    this.menu = { x, y, alinea, fout, suggesties: null };
    this.meld();
    let suggesties: string[] = [];
    try {
      suggesties = await this.controleur().suggesties(fout.tekst, fout.taal, 5);
    } catch {
      // Zonder suggesties blijft het menu bruikbaar.
    }
    if (this.menu?.fout === fout) {
      this.menu = { ...this.menu, suggesties };
      this.meld();
    }
  }

  sluitMenu() {
    if (!this.menu) return;
    this.menu = null;
    this.meld();
  }

  /** Zoekt de fout onder een schermpunt (voor het rechtermuismenu). */
  foutOnderPunt(x: number, y: number): { alinea: Alinea; fout: Fout } | null {
    const ref = this.editor();
    let punt: ReturnType<DocxEditorRef["getPositionAtPoint"]> = null;
    try {
      punt = ref?.getPositionAtPoint(x, y) ?? null;
    } catch {
      return null;
    }
    if (!punt || punt.region !== "body") return null;
    return this.foutOp({ paraId: punt.target.start.paraId, offset: punt.target.start.offset });
  }

  /** Ondersteunende tekst voor het venster: de zin rond de fout. */
  static context(alinea: Alinea, fout: Fout, marge = 60) {
    const begin = Math.max(0, fout.start - marge);
    const eind = Math.min(alinea.tekst.length, fout.eind + marge);
    let voor = alinea.tekst.slice(begin, fout.start);
    let na = alinea.tekst.slice(fout.eind, eind);
    // Afgebroken woorden aan de randen weglaten.
    if (begin > 0) voor = voor.replace(/^\S*\s/, "…");
    if (eind < alinea.tekst.length) na = na.replace(/\s\S*$/, "…");
    return { voor: voor.replace(/￼/g, ""), woord: fout.tekst, na: na.replace(/￼/g, "") };
  }
}
