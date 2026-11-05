import type { YrsSession } from "@betteroffice/docx/yrs";
import type { Vervanging } from "../../lint/tekst-logica";

/** UTF-16-grenzen na hoofdletterconversie, ook bij bijvoorbeeld ß → SS. */
function conversieGrenzen(oud: string, nieuw: string) {
  const kaart = new Map<number, number>([[0, 0]]);
  let bron = 0, doel = 0;
  for (const teken of oud) {
    const vormen = [...new Set([teken, teken.toLocaleUpperCase("nl"), teken.toLocaleLowerCase("nl")])].sort((a, b) => b.length - a.length);
    let vorm = vormen.find((v) => nieuw.startsWith(v, doel));
    if (vorm === undefined) {
      // Contextgevoelige kleine letters, zoals de laatste sigma in een woord.
      const volgend = String.fromCodePoint(nieuw.codePointAt(doel) ?? 0);
      if (volgend.toLocaleUpperCase("nl") !== teken.toLocaleUpperCase("nl")) return null;
      vorm = volgend;
    }
    bron += teken.length;
    doel += vorm.length;
    kaart.set(bron, doel);
  }
  return doel === nieuw.length ? kaart : null;
}

/**
 * Eén vervanging per bestaand opmaakstuk, in plaats van één per letter.
 * De host-API houdt maximaal 128 stappen in één atomaire bewerking. Een
 * gewone alinea heeft vaak één opmaakstuk; verschillende tekenopmaak blijft
 * gescheiden. Bij een onzekere tekstprojectie geeft dit hulpje geen plan.
 */
export function hoofdletterVervangingen(
  sessie: YrsSession, story: string, paraId: string, alinea: string,
  begin: number, oud: string, nieuw: string,
): Vervanging[] | null {
  const grenzen = conversieGrenzen(oud, nieuw);
  if (!grenzen || alinea.slice(begin, begin + oud.length) !== oud) return null;
  let stukken: { tekst: string; object: boolean }[] = [];
  let gevonden = false;
  for (const deel of sessie.storySegments(story)) {
    if (deel.kind === "pilcrow") {
      if (deel.paraId === paraId) { gevonden = true; break; }
      stukken = [];
    } else if (!deel.attributes.del) {
      stukken.push({ tekst: deel.kind === "text" ? deel.text : "\uFFFC", object: deel.kind !== "text" });
    }
  }
  if (!gevonden || stukken.map((s) => s.tekst).join("") !== alinea) return null;
  const uit: Vervanging[] = [];
  let offset = 0;
  for (const stuk of stukken) {
    const van = Math.max(begin, offset), tot = Math.min(begin + oud.length, offset + stuk.tekst.length);
    offset += stuk.tekst.length;
    if (van >= tot) continue;
    if (stuk.object) return null;
    const nieuwBegin = grenzen.get(van - begin), nieuwEind = grenzen.get(tot - begin);
    if (nieuwBegin === undefined || nieuwEind === undefined) return null;
    const tekst = nieuw.slice(nieuwBegin, nieuwEind);
    if (tekst !== alinea.slice(van, tot)) uit.push({ begin: van, eind: tot, tekst });
  }
  return uit;
}
