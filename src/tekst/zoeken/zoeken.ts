/**
 * Zoeken en vervangen in het document (#29). De tekst komt uit
 * `readParagraphs` (geaccepteerde weergave) per verhaal: de hoofdtekst en elke
 * tabelcel, in documentvolgorde. Opmaak, handmatige pagina-einden en de
 * omrekening naar sessie-offsets komen uit `storySegments`.
 *
 * Vervangen binnen één alinea gaat via `applyEdits` (één ongedaan-maakstap,
 * ook als voorstel bij Wijzigingen bijhouden). Treffers over een
 * alineamarkering heen, een pagina-einde of ^p in de vervangtekst gaan via de
 * Yrs-sessie (`replaceRange`, `splitParagraph`), ook als één stap.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import i18next from "../../i18n/config";
import { auteur, begin, engine, klaar, ruw, voorstel, type Engine, type Sessie } from "../gedeeld/engine.ts";
import {
  TEKEN,
  ZoekFout,
  context,
  heeftOpmaak,
  maakPatroon,
  opmaakStukken,
  pastBijOpmaak,
  vervangTekst,
  vindAlle,
  type Opmaakfilter,
  type TekenOpmaak,
  type ZoekOpties,
} from "./logica.ts";

export interface Alinea {
  paraId: string;
  /** Begin van de alinea in de verhaaltekst (inclusief een eventuele \f). */
  start: number;
  /** Doorzoekbare tekst van de alinea (zonder \n, met \f vooraan bij een pagina-einde). */
  tekst: string;
  paginaEinde: boolean;
  stijl?: string;
  opmaak: (TekenOpmaak | null)[] | null;
  /** Sessie-offset per positie in `tekst` (lengte tekst + 1), of null als die niet te bepalen is. */
  rauw: number[] | null;
}
export interface Verhaal {
  story: string;
  tekst: string;
  alineas: Alinea[];
}
export interface ZoekIndex {
  versie: string;
  verhalen: Verhaal[];
}

export interface Deel {
  paraId: string;
  /** Offsets in de geaccepteerde alineatekst (zonder \f-voorvoegsel). */
  van: number;
  tot: number;
}
export interface Resultaat {
  nr: number;
  story: string;
  start: number;
  eind: number;
  tekst: string;
  groepen: RegExpExecArray | null;
  delen: Deel[];
  context: { voor: string; treffer: string; na: string };
  /** Omschrijving van de plek, zoals ‘Tabel 1, rij 2’. */
  plek: string;
}

/** Verhalen in documentvolgorde: de hoofdtekst met de cellen van tabellen op hun plaats. */
export function verhaalVolgorde(s: Sessie, verhaal = "body", uit: string[] = []): string[] {
  uit.push(verhaal);
  for (const deel of s.storySegments(verhaal))
    if (deel.kind === "embed" && deel.embedKind === "table")
      for (const rij of (deel.payload as { rows?: { cells: { story: string }[] }[] }).rows ?? [])
        for (const cel of rij.cells) if (s.hasStory(cel.story)) verhaalVolgorde(s, cel.story, uit);
  return uit;
}

function plekVan(story: string) {
  const delen = [...story.matchAll(/:t(\d+):r(\d+)c(\d+)/g)];
  if (!delen.length) return i18next.t("writer:find.location.text");
  const laatste = delen[delen.length - 1];
  return i18next.t("writer:find.location.tableCell", { table: +laatste[1] + 1, row: +laatste[2] + 1, column: +laatste[3] + 1 });
}

/** Opmaak, pagina-einden en sessie-offsets per alinea uit de ruwe segmenten. */
function segmentInfo(s: Sessie, story: string) {
  const info = new Map<string, { opmaak: (TekenOpmaak | null)[]; rauw: number[]; paginaEinde: boolean }>();
  let opmaak: (TekenOpmaak | null)[] = [],
    rauw: number[] = [],
    positie = 0,
    paginaEinde = false;
  for (const deel of s.storySegments(story)) {
    if (deel.kind === "pilcrow") {
      rauw.push(positie);
      info.set(deel.paraId, { opmaak, rauw, paginaEinde });
      opmaak = [];
      rauw = [];
      positie = 0;
      paginaEinde = false;
      continue;
    }
    if (deel.kind === "text") {
      const a = deel.attributes as { bold?: boolean; italic?: boolean; underline?: unknown; del?: unknown };
      if (a.del) {
        positie += deel.text.length;
        continue;
      }
      const t: TekenOpmaak = { vet: a.bold === true, cursief: a.italic === true, onderstreept: !!a.underline && a.underline !== "none" };
      for (let i = 0; i < deel.text.length; i++) {
        opmaak.push(t);
        rauw.push(positie++);
      }
      continue;
    }
    // Embeds: tabellen en pagina-einden zijn blokken (geen tekst), de rest één teken.
    if (deel.embedKind === "table") {
      positie++;
      continue;
    }
    if (deel.embedKind === "pageBreak") {
      paginaEinde = true;
      positie++;
      continue;
    }
    if ((deel.attributes as { del?: unknown }).del) {
      positie++;
      continue;
    }
    opmaak.push(null);
    rauw.push(positie++);
  }
  return info;
}

/** Bouwt de doorzoekbare tekst van het document. */
export async function bouwIndex(ref: DocxEditorRef): Promise<ZoekIndex> {
  const { sessie } = engine(ref);
  await ref.flushPendingInput();
  const verhalen: Verhaal[] = [];
  let versie = "";
  for (const story of verhaalVolgorde(sessie)) {
    const gelezen = await ref.readParagraphs({ view: "accepted", story });
    if (!gelezen.ok) continue;
    versie = gelezen.version;
    const extra = segmentInfo(sessie, story);
    const alineas: Alinea[] = [];
    let tekst = "";
    for (const p of gelezen.paragraphs) {
      const atomen = new Map(p.atoms.map((a) => [a.offset, a.kind]));
      const eigen = p.text;
      let zichtbaar = "";
      for (let i = 0; i < eigen.length; i++) {
        const c = eigen[i];
        if (c === "￼") {
          const soort = atomen.get(i);
          zichtbaar += soort === "lineBreak" ? TEKEN.regeleinde : soort === "image" ? TEKEN.afbeelding : TEKEN.object;
        } else zichtbaar += c;
      }
      const seg = extra.get(p.paraId);
      const klopt = seg && seg.rauw.length === zichtbaar.length + 1;
      const paginaEinde = seg?.paginaEinde ?? false;
      const alineaTekst = (paginaEinde ? TEKEN.paginaEinde : "") + zichtbaar;
      alineas.push({
        paraId: p.paraId,
        start: tekst.length,
        tekst: alineaTekst,
        paginaEinde,
        stijl: p.styleId,
        opmaak: klopt ? [...(paginaEinde ? [null] : []), ...seg.opmaak] : null,
        // Het pagina-einde zelf staat op sessie-offset 0, vóór de tekst.
        rauw: klopt ? [...(paginaEinde ? [0] : []), ...seg.rauw] : null,
      });
      tekst += alineaTekst + TEKEN.alinea;
    }
    verhalen.push({ story, tekst, alineas });
  }
  return { versie, verhalen };
}

/** Delen per alinea voor een stuk verhaaltekst. */
function delenVan(verhaal: Verhaal, start: number, eind: number): Deel[] {
  const uit: Deel[] = [];
  for (const a of verhaal.alineas) {
    const aEind = a.start + a.tekst.length;
    if (aEind < start || a.start > eind) continue;
    const voorvoegsel = a.paginaEinde ? 1 : 0;
    const van = Math.max(start, a.start + voorvoegsel) - a.start - voorvoegsel;
    const tot = Math.min(eind, aEind) - a.start - voorvoegsel;
    if (tot > van || (start <= a.start && eind > aEind)) uit.push({ paraId: a.paraId, van: Math.max(0, van), tot: Math.max(0, tot) });
  }
  return uit;
}

export interface Zoekopdracht {
  zoek: string;
  opties: ZoekOpties;
  opmaak?: Opmaakfilter;
}

/** Zoekt in de index; met alleen een opmaakfilter zoekt het naar stukken met die opmaak. */
export function zoekIn(index: ZoekIndex, opdracht: Zoekopdracht, max = 5000): Resultaat[] {
  const uit: Resultaat[] = [];
  const filter = opdracht.opmaak;
  const metOpmaak = heeftOpmaak(filter);
  if (!opdracht.zoek && !metOpmaak) throw new ZoekFout(i18next.t("writer:find.errors.typeOrFormat"));
  const patroon = opdracht.zoek ? maakPatroon(opdracht.zoek, opdracht.opties) : null;
  for (const verhaal of index.verhalen) {
    const alineaOp = (i: number) => verhaal.alineas.find((a) => i >= a.start && i <= a.start + a.tekst.length);
    const opmaakOp = (i: number) => {
      const a = alineaOp(i);
      return a?.opmaak ? (a.opmaak[i - a.start] ?? null) : null;
    };
    const kandidaten = patroon
      ? vindAlle(verhaal.tekst, patroon, max)
      : opmaakStukken(verhaal.tekst, [...verhaal.tekst].map((_, i) => opmaakOp(i)), (i) => alineaOp(i)?.stijl, filter!).map((s) => ({
          ...s,
          tekst: verhaal.tekst.slice(s.start, s.eind),
          groepen: null,
        }));
    for (const k of kandidaten) {
      if (patroon && metOpmaak) {
        const tekens = [];
        const stijlen = new Set<string | undefined>();
        for (let i = k.start; i < k.eind; i++) {
          if (verhaal.tekst[i] === "\n") continue;
          tekens.push(opmaakOp(i));
          stijlen.add(alineaOp(i)?.stijl);
        }
        if (!pastBijOpmaak(filter!, tekens, [...stijlen])) continue;
      }
      uit.push({
        nr: uit.length,
        story: verhaal.story,
        start: k.start,
        eind: k.eind,
        tekst: k.tekst,
        groepen: k.groepen,
        delen: delenVan(verhaal, k.start, k.eind),
        context: context(verhaal.tekst, k.start, k.eind),
        plek: plekVan(verhaal.story),
      });
      if (uit.length >= max) return uit;
    }
  }
  return uit;
}

export async function zoek(ref: DocxEditorRef | null, opdracht: Zoekopdracht) {
  if (!ref) throw new Error(i18next.t("writer:find.errors.notReady"));
  const index = await bouwIndex(ref);
  return { index, resultaten: zoekIn(index, opdracht) };
}

// ---------------------------------------------------------------------------
// Naar een treffer

function sessiePlek(index: ZoekIndex, story: string, positie: number, eind = false) {
  const verhaal = index.verhalen.find((v) => v.story === story);
  if (!verhaal) return null;
  for (const a of verhaal.alineas) {
    const aEind = a.start + a.tekst.length;
    if (positie < a.start || positie > aEind) continue;
    // Een treffer die de alineamarkering meeneemt, eindigt aan het begin van
    // de volgende alinea (die de lus daarna vindt); zo worden alinea's samengevoegd.
    if (!a.rauw) return null;
    return { story, paraId: a.paraId, offset: a.rauw[Math.min(positie - a.start, a.rauw.length - 1)] };
  }
  // Positie na de laatste \n: begin van de volgende alinea bestaat niet; einde van de laatste.
  const laatste = verhaal.alineas[verhaal.alineas.length - 1];
  return laatste?.rauw ? { story, paraId: laatste.paraId, offset: laatste.rauw[laatste.rauw.length - 1] } : null;
}

/** Selecteert een treffer en brengt hem in beeld. */
export function gaNaar(ref: DocxEditorRef | null, index: ZoekIndex, r: Resultaat) {
  const e = engine(ref);
  const van = sessiePlek(index, r.story, r.start);
  const tot = sessiePlek(index, r.story, r.eind, true);
  if (!van || !tot) {
    const eerste = r.delen[0];
    if (eerste) e.ref.scrollToParaId(eerste.paraId);
    return;
  }
  e.sessie.setSelection(van, tot);
  e.weergave.syncYrsInputState(false, [r.story]);
  const a = e.weergave.yrsLocToDisplayPosition(van),
    b = e.weergave.yrsLocToDisplayPosition(tot);
  if (a !== null && b !== null) e.ref.highlightRange(Math.min(a, b), Math.max(a, b));
  else if (a !== null) e.weergave.scrollToPosition(a);
}

// ---------------------------------------------------------------------------
// Vervangen

export interface Vervangen {
  aantal: number;
  route: "bewerkingen" | "sessie";
}

/**
 * Vervangt de gegeven treffers (uit een index van de huidige versie) door het
 * sjabloon. Alles is één ongedaan-maakstap.
 */
export async function vervang(
  ref: DocxEditorRef | null,
  index: ZoekIndex,
  treffers: readonly Resultaat[],
  sjabloon: string,
  opties: ZoekOpties,
): Promise<Vervangen> {
  const e = engine(ref);
  if (!treffers.length) return { aantal: 0, route: "bewerkingen" };
  const teksten = treffers.map((t) => (t.groepen ? vervangTekst(sjabloon, t.groepen, opties) : sjabloon.replace(/\^p/g, "\n").replace(/\^t/g, "\t")));
  if (teksten.some((t) => /[\v\f]/.test(t))) throw new ZoekFout(i18next.t("writer:find.errors.breakInReplacement"));
  const eenvoudig = treffers.every((t, i) => t.delen.length === 1 && !t.tekst.includes("\n") && !t.tekst.includes("\f") && !teksten[i].includes("\n"));
  const suggest = e.ref.commands.getState("editingMode").value === "suggesting" ? { author: auteur(), date: new Date().toISOString() } : undefined;
  if (eenvoudig) {
    const resultaat = await e.ref.applyEdits({
      expectVersion: index.versie,
      steps: treffers.map((t, i) => ({
        op: "replaceText" as const,
        target: {
          kind: "range" as const,
          story: t.story,
          start: { paraId: t.delen[0].paraId, offset: t.delen[0].van },
          end: { paraId: t.delen[0].paraId, offset: t.delen[0].tot },
          view: "accepted" as const,
        },
        text: teksten[i],
        ...(suggest ? { suggest } : {}),
      })),
    });
    if (!resultaat.ok) {
      const code = resultaat.failure.code;
      throw new ZoekFout(
        code === "stale-version"
          ? i18next.t("writer:find.errors.staleVersion")
          : code === "tracked-revision-conflict"
            ? i18next.t("writer:find.errors.trackedConflict")
            : i18next.t("writer:find.errors.replaceFailed", { message: resultaat.failure.message }),
      );
    }
    return { aantal: treffers.length, route: "bewerkingen" };
  }
  vervangViaSessie(e, index, treffers, teksten);
  return { aantal: treffers.length, route: "sessie" };
}

function vervangViaSessie(e: Engine, index: ZoekIndex, treffers: readonly Resultaat[], teksten: string[]) {
  const s = e.sessie;
  const auteurVoorstel = voorstel(e.ref);
  // Eerst alle plekken bepalen, dan achteraan beginnen zodat eerdere plekken kloppen.
  const plekken = treffers.map((t, i) => {
    const van = sessiePlek(index, t.story, t.start);
    const tot = sessiePlek(index, t.story, t.eind, true);
    if (!van || !tot) throw new ZoekFout(i18next.t("writer:find.errors.cannotReplace"));
    return { t, van, tot, tekst: teksten[i] };
  });
  const verhalen = new Set<string>();
  begin(e);
  try {
    for (const { t, van, tot, tekst } of [...plekken].reverse()) {
      verhalen.add(t.story);
      const [eerste, ...rest] = tekst.split("\n");
      const bereik = { story: t.story, start: { paraId: van.paraId, offset: van.offset }, end: { paraId: tot.paraId, offset: tot.offset } };
      const pagina = t.tekst.startsWith("\f");
      let eind: { story: string; paraId: string; offset: number };
      if (pagina && !auteurVoorstel) {
        // Het pagina-einde is een blok vóór de alinea: ruw verwijderen.
        const span = s.locateParagraph(t.story, van.paraId);
        if (tot.paraId === van.paraId && tot.offset <= 1) {
          ruw(s, t.story, [{ op: "delete", index: span.start, len: 1 }]);
          if (eerste) s.insertText({ story: t.story, paraId: van.paraId, offset: 0 }, eerste);
          eind = { story: t.story, paraId: van.paraId, offset: eerste.length };
        } else {
          const ontvangst = s.replaceRange({ ...bereik, start: { paraId: van.paraId, offset: 1 } }, eerste);
          ruw(s, t.story, [{ op: "delete", index: span.start, len: 1 }]);
          const r = ontvangst.range;
          eind = r ? { story: t.story, paraId: r.end.paraId, offset: Math.max(0, r.end.offset - (r.end.paraId === van.paraId ? 1 : 0)) } : { story: t.story, paraId: van.paraId, offset: eerste.length };
        }
      } else if (pagina) throw new ZoekFout(i18next.t("writer:find.errors.pageBreakSuggestion"));
      else {
        const ontvangst = s.replaceRange(bereik, eerste, auteurVoorstel);
        const r = ontvangst.range;
        eind = r ? { story: t.story, paraId: r.end.paraId, offset: r.end.offset } : { story: t.story, paraId: van.paraId, offset: van.offset + eerste.length };
      }
      for (const stuk of rest) {
        const gesplitst = s.splitParagraph(eind, auteurVoorstel);
        const plek = { story: t.story, paraId: gesplitst.secondParaId, offset: 0 };
        if (stuk) s.insertText(plek, stuk, auteurVoorstel);
        eind = { ...plek, offset: stuk.length };
      }
    }
  } finally {
    klaar(e, [...verhalen], false);
  }
}
