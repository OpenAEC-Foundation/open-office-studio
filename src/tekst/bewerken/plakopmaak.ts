/** Plakopties op een expliciet bereik; de aanroeper bewaakt invoervolgorde en geschiedenis. */
import type { YrsLoc, YrsSession } from "@betteroffice/docx/yrs";
import type { GekopieerdeOpmaak } from "./kwast";
import { deltaUitHtml, heeftHtmlOpmaak, koppelOpmaak, leesHtml, stukken, zelfdeDelta, type HtmlTekst, type PlakKeuze } from "./plakopties";
import { pasOpmaakBatchToe, type OpmaakOpdracht } from "./opmaakbatch";

export interface Plaksessie {
  story: string;
  /** Alinea's met het geplakte stuk: [begin, eind) per alinea. */
  stukken: { paraId: string; begin: number; eind: number; tekst: string; posities: number[] }[];
  html: HtmlTekst | null;
  /** Opmaak van de plakplek, voor ‘alleen tekst’. */
  basis: GekopieerdeOpmaak | null;
  keuze: PlakKeuze;
  plek: { x: number; y: number };
}

/** Gebruik het door de plakactie teruggegeven einde, onafhankelijk van latere selectie. */
export function maakPlaksessie(
  alineas: readonly { paraId: string; text: string }[], start: YrsLoc, eind: YrsLoc,
  html: string, basis: GekopieerdeOpmaak | null, plek: { x: number; y: number }, sessie: YrsSession,
): Plaksessie | null {
  if (eind.story !== start.story) return null;
  const i = alineas.findIndex(p => p.paraId === start.paraId), j = alineas.findIndex(p => p.paraId === eind.paraId);
  if (i < 0 || j < i) return null;
  // Een tabel/pagina-einde telt wel in sessie-offsets, maar niet in zichtbare
  // tekst. Bijgehouden verwijderingen horen evenmin bij nieuwe plakopmaak.
  const gevraagd = new Set(alineas.slice(i, j + 1).map(p => p.paraId));
  const ruweAlineas = sessie.paragraphSpans(start.story);
  const projecties = new Map<string, { tekst: string; posities: number[]; lengte: number }>();
  let nr = 0, offset = 0, tekst = "", posities: number[] = [];
  for (const deel of sessie.storySegments(start.story)) {
    const paraId = ruweAlineas[nr]?.paraId, nodig = gevraagd.has(paraId);
    if (deel.kind === "pilcrow") {
      if (nodig) projecties.set(deel.paraId, { tekst, posities, lengte: offset });
      nr++; offset = 0; tekst = ""; posities = [];
      if (deel.paraId === eind.paraId) break;
      continue;
    }
    const inhoud = deel.kind === "text" ? deel.text : deel.embedKind === "table" || deel.embedKind === "pageBreak" ? "" : "\ufffc";
    if (nodig && !(deel.attributes as { del?: unknown }).del) {
      tekst += inhoud;
      for (let k = 0; k < inhoud.length; k++) posities.push(offset + k);
    }
    offset += deel.kind === "text" ? deel.text.length : 1;
  }
  const delen: Plaksessie["stukken"] = [];
  for (const p of alineas.slice(i, j + 1)) {
    const projectie = projecties.get(p.paraId);
    // Bewaar de reeds geplakte engine-opmaak wanneer een onbekende atoomsoort
    // geen aantoonbaar juiste omrekening heeft; formatteer nooit oude tekst.
    if (!projectie || projectie.tekst !== p.text) return null;
    const begin = p.paraId === start.paraId ? start.offset : 0;
    const tot = p.paraId === eind.paraId ? eind.offset : projectie.lengte;
    const indices = projectie.posities.flatMap((positie, k) => positie >= begin && positie < tot ? [k] : []);
    delen.push({ paraId: p.paraId, begin, eind: tot, tekst: indices.map(k => p.text[k]).join(""), posities: indices.map(k => projectie.posities[k]) });
  }
  if (!delen.some(d => d.eind > d.begin)) return null;
  const bron = html ? leesHtml(html) : null;
  return { story: start.story, stukken: delen, html: bron && heeftHtmlOpmaak(bron) ? bron : null, basis, keuze: "tekst", plek };
}

/** Alleen werkelijk geplakte zichtbare tekens, ook naast verborgen tekst/embeds. */
function bereiken(stuk: Plaksessie["stukken"][number], van = 0, tot = stuk.tekst.length) {
  const uit: { begin: number; eind: number }[] = [];
  for (const positie of stuk.posities.slice(van, tot)) {
    const vorige = uit.at(-1);
    if (vorige?.eind === positie) vorige.eind++;
    else uit.push({ begin: positie, eind: positie + 1 });
  }
  return uit;
}


/** Geen flush, selectieaanpassing of geschiedenisgrens binnen een lopende plakactie. */
export function pasPlakOpmaakToe(s: YrsSession, sessie: Plaksessie, keuze: PlakKeuze) {
  const geplakt = sessie.stukken.map((s) => s.tekst).join("\n");
  const per = sessie.html ? koppelOpmaak(geplakt, sessie.html) : [];
  let plek = 0;
  const opdrachten: OpmaakOpdracht[] = [];
  const normaliseren: { bereik: OpmaakOpdracht["bereik"]; gemengd: boolean }[] = [];
  for (const stuk of sessie.stukken) {
    const range = {
      story: sessie.story,
      start: { paraId: stuk.paraId, offset: stuk.begin },
      end: { paraId: stuk.paraId, offset: stuk.eind },
    };
    if (sessie.basis?.positie === "normaal") {
      for (const deel of bereiken(stuk)) {
        const bereik = { ...range, start: { paraId: stuk.paraId, offset: deel.begin }, end: { paraId: stuk.paraId, offset: deel.eind } };
        const ctx = s.selectionContext(bereik);
        if (ctx.superscript !== false) normaliseren.push({ bereik, gemengd: ctx.superscript === "mixed" });
      }
    }
    const delen = keuze !== "tekst" && sessie.html
      ? stukken(per
        .slice(plek, plek + stuk.tekst.length)
        .map((o) => (o ? deltaUitHtml(o, keuze === "samenvoegen") : null)), zelfdeDelta)
      : [{ begin: 0, eind: stuk.tekst.length, waarde: null }];
    for (const deel of delen) {
      if (!sessie.basis && !deel.waarde) continue;
      // De HTML-keuze overschrijft dezelfde velden als na de basisopmaak.
      // Schrijf hun eindwaarde eenmaal; beschermde marks blijven ongemoeid.
      const delta = { ...sessie.basis?.delta, ...deel.waarde };
      for (const bereik of bereiken(stuk, deel.begin, deel.eind)) opdrachten.push({
        bereik: {
          ...range,
          start: { paraId: stuk.paraId, offset: bereik.begin },
          end: { paraId: stuk.paraId, offset: bereik.eind },
        },
        delta,
      });
    }
    plek += stuk.tekst.length + 1;
  }
  if (!pasOpmaakBatchToe(s, opdrachten)) for (const opdracht of opdrachten) s.formatRange(opdracht.bereik, opdracht.delta);
  // De plakdelta's wijzigen super-/subscript niet. Hun normalisatie kan
  // daarom na de batch zonder de oorspronkelijke keuze te veranderen.
  for (const { bereik, gemengd } of normaliseren) {
    s.toggleMark(bereik, { type: "superscript" });
    if (gemengd) s.toggleMark(bereik, { type: "superscript" });
  }
}
