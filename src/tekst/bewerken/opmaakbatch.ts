/** Plakopmaak in één Rust-transactie, zonder alinea's of beschermde marks te wijzigen. */
import type { YrsInlineFormatDelta, YrsRawOp, YrsSession, YrsStoryRange } from "@betteroffice/docx/yrs";

export interface OpmaakOpdracht {
  bereik: YrsStoryRange;
  delta: YrsInlineFormatDelta;
}

/** Alleen de tekenvelden die de plakopties daadwerkelijk gebruiken. */
function attributen(delta: YrsInlineFormatDelta): Record<string, unknown> | null {
  const uit: Record<string, unknown> = {};
  for (const [sleutel, waarde] of Object.entries(delta)) {
    if (waarde === undefined) continue;
    switch (sleutel) {
      case "bold": case "italic":
        if (waarde !== null && typeof waarde !== "boolean") return null;
        uit[sleutel] = waarde || null;
        break;
      case "underline": case "strike":
        if (waarde !== null && typeof waarde !== "boolean") return null;
        uit[sleutel] = waarde ? sleutel === "underline" ? { style: "single" } : { double: false } : null;
        break;
      case "fontSize":
        if (waarde !== null && (typeof waarde !== "number" || !Number.isFinite(waarde) || waarde <= 0)) return null;
        if (waarde !== null && (!Number.isSafeInteger(Math.round((waarde as number) * 2)) || Math.round((waarde as number) * 2) > 0xffffffff)) return null;
        uit.fontSize = waarde === null ? null : { size: Math.round((waarde as number) * 2), sizeCs: Math.round((waarde as number) * 2) };
        break;
      case "fontFamily": {
        if (waarde === null) { uit.fontFamily = null; break; }
        if (typeof waarde !== "object" || Array.isArray(waarde)) return null;
        const familie = waarde as Record<string, unknown>;
        if (Object.keys(familie).some(k => k !== "ascii" && k !== "hAnsi") || typeof familie.ascii !== "string" || (familie.hAnsi !== undefined && typeof familie.hAnsi !== "string")) return null;
        uit.fontFamily = { ascii: familie.ascii, hAnsi: familie.hAnsi ?? familie.ascii };
        break;
      }
      case "highlight":
        if (waarde !== null && typeof waarde !== "string") return null;
        uit.highlight = waarde === null ? null : { color: waarde };
        break;
      case "color": {
        if (waarde === null) { uit.textColor = null; break; }
        if (typeof waarde !== "object" || Array.isArray(waarde)) return null;
        const kleur = waarde as Record<string, unknown>;
        if (Object.keys(kleur).some(k => k !== "rgb" && k !== "themeColor")) return null;
        if (kleur.rgb !== undefined && typeof kleur.rgb !== "string" || kleur.themeColor !== undefined && typeof kleur.themeColor !== "string") return null;
        uit.textColor = { rgb: kleur.rgb ?? null, themeColor: kleur.themeColor ?? null };
        break;
      }
      default: return null;
    }
  }
  return uit;
}

/**
 * Bereidt alles vóór het schrijven voor. Onbekende velden/ids krijgen de
 * oorspronkelijke typed route; er is dan nog niets aan het document veranderd.
 * Offsets zijn dezelfde ruwe UTF-16-offsets als bij `formatRange`, inclusief
 * bijgehouden verwijderingen en eventuele tabel-embeds vóór een alinea.
 */
export function pasOpmaakBatchToe(sessie: YrsSession, opdrachten: readonly OpmaakOpdracht[]): boolean {
  if (!opdrachten.length) return true;
  if (typeof sessie.applyRawOps !== "function" || typeof sessie.paragraphSpans !== "function") return false;
  const story = opdrachten[0].bereik.story;
  if (opdrachten.some(o => o.bereik.story !== story)) return false;
  const vertaald = opdrachten.map(o => attributen(o.delta));
  if (vertaald.some(a => a === null)) return false;
  const alineas = new Map<string, { start: number; lengte: number; nummer: number }>();
  let index = 0, nummer = 0;
  for (const p of sessie.paragraphSpans(story)) {
    if (alineas.has(p.paraId) || !Number.isSafeInteger(p.length) || p.length < 0) return false;
    alineas.set(p.paraId, { start: index, lengte: p.length, nummer: nummer++ });
    index += p.length + 1;
  }
  const binnen = new Set<number>();
  for (const { bereik } of opdrachten) for (const punt of [bereik.start, bereik.end]) {
    const p = alineas.get(punt.paraId);
    if (!p || !Number.isSafeInteger(punt.offset) || punt.offset < 0 || punt.offset > p.lengte) return false;
    if (punt.offset > 0 && punt.offset < p.lengte) binnen.add(p.nummer);
  }
  // De typed route rondt ook een ongeldige halve UTF-16-surrogaat naar het
  // begin van het teken af. Raw format rondt anders: gebruik die grens niet.
  const halve = new Map<number, Set<number>>();
  if (binnen.size) {
    if (typeof sessie.storySegments !== "function") return false;
    let nr = 0, offset = 0;
    for (const deel of sessie.storySegments(story)) {
      if (deel.kind === "pilcrow") { nr++; offset = 0; continue; }
      if (!binnen.has(nr)) continue;
      if (deel.kind !== "text") { offset++; continue; }
      for (let k = 1; k < deel.text.length; k++) {
        const a = deel.text.charCodeAt(k - 1), b = deel.text.charCodeAt(k);
        if (a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff) {
          let grenzen = halve.get(nr);
          if (!grenzen) halve.set(nr, grenzen = new Set());
          grenzen.add(offset + k);
        }
      }
      offset += deel.text.length;
    }
  }
  const ops: YrsRawOp[] = [];
  for (let i = 0; i < opdrachten.length; i++) {
    const { start, end } = opdrachten[i].bereik, a = alineas.get(start.paraId), b = alineas.get(end.paraId);
    if (!a || !b || !Number.isSafeInteger(start.offset) || !Number.isSafeInteger(end.offset) || start.offset < 0 || end.offset < 0 || start.offset > a.lengte || end.offset > b.lengte) return false;
    const van = a.start + start.offset - (halve.get(a.nummer)?.has(start.offset) ? 1 : 0);
    const tot = b.start + end.offset - (halve.get(b.nummer)?.has(end.offset) ? 1 : 0);
    if (tot < van) return false;
    if (tot > van && Object.keys(vertaald[i]!).length) ops.push({ op: "format", index: van, len: tot - van, attrs: vertaald[i]! });
  }
  if (ops.length) sessie.applyRawOps(story, ops);
  return true;
}
