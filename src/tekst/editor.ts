/**
 * Koppeling tussen de opmaakfuncties en de draaiende tekstengine: selectie
 * lezen, alinea's in de selectie bepalen en de weergave bijwerken.
 */
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { YrsAuthor, YrsLoc, YrsParagraph, YrsSession, YrsStoryRange } from "@betteroffice/docx/yrs";
import i18next from "../i18n/config";

export interface TekstSelectie {
  ref: DocxEditorRef;
  sessie: YrsSession;
  story: string;
  /** Begin en einde in documentvolgorde. */
  bereik: YrsStoryRange;
  leeg: boolean;
  /** Alinea's die de selectie raakt, in volgorde. */
  alineas: YrsParagraph[];
  /** Alle alinea's van de story, met de index van de eerste en laatste geselecteerde. */
  alle: YrsParagraph[];
  van: number;
  tot: number;
}

const AUTEUR = "open-tekst-auteur";
function leesAuteur() {
  try {
    return localStorage.getItem(AUTEUR) ?? "";
  } catch {
    return "";
  }
}

/** De auteur voor een bijgehouden wijziging, of niets als bijhouden uit staat. */
export function auteurBijOpnemen(opnemen: boolean): YrsAuthor | undefined {
  return opnemen ? { name: leesAuteur() || i18next.t("writer:general.unknownAuthor"), date: new Date().toISOString() } : undefined;
}

function vergelijk(volgorde: Map<string, number>, a: YrsLoc, b: YrsLoc) {
  return (volgorde.get(a.paraId) ?? 0) - (volgorde.get(b.paraId) ?? 0) || a.offset - b.offset;
}

/** Leest de huidige selectie uit de engine. */
export async function leesSelectie(ref: DocxEditorRef | null): Promise<TekstSelectie> {
  if (!ref) throw new Error(i18next.t("writer:general.documentNotReady"));
  await ref.flushPendingInput();
  const paged = ref.getEditorRef();
  const sessie = paged?.getYrsSession();
  if (!paged || !sessie) throw new Error(i18next.t("writer:general.documentNotReady"));
  let anker: YrsLoc | null = null;
  let kop: YrsLoc | null = null;
  const bekend = sessie.selection();
  if (bekend) {
    anker = bekend.anchor;
    kop = bekend.head;
  } else {
    const bereik = paged.getSelectionRange();
    if (bereik) {
      anker = paged.displayPositionToYrsLoc(bereik.from);
      kop = paged.displayPositionToYrsLoc(bereik.to);
    }
  }
  if (!anker || !kop) throw new Error(i18next.t("writer:general.placeCursorFirst"));
  if (anker.story !== kop.story) kop = anker;
  const story = anker.story;
  const alleAlineas = sessie.paragraphs(story);
  const volgorde = new Map(alleAlineas.map((a, i) => [a.paraId, i]));
  const [begin, eind] = vergelijk(volgorde, anker, kop) <= 0 ? [anker, kop] : [kop, anker];
  const van = volgorde.get(begin.paraId) ?? 0;
  const tot = volgorde.get(eind.paraId) ?? van;
  return {
    ref,
    sessie,
    story,
    bereik: {
      story,
      start: { paraId: begin.paraId, offset: begin.offset },
      end: { paraId: eind.paraId, offset: eind.offset },
    },
    leeg: begin.paraId === eind.paraId && begin.offset === eind.offset,
    alineas: alleAlineas.slice(van, tot + 1),
    alle: alleAlineas,
    van,
    tot,
  };
}

/**
 * Bij een lege selectie: het woord rond de cursor (zoals een tekstverwerker
 * opmaak op het huidige woord toepast).
 */
export function woordBereik(selectie: TekstSelectie): YrsStoryRange | null {
  if (!selectie.leeg) return selectie.bereik;
  const { paraId, offset } = selectie.bereik.start;
  const tekst = selectie.alineas[0]?.text ?? "";
  const woord = /[\p{L}\p{N}_'’-]/u;
  let begin = offset;
  let eind = offset;
  while (begin > 0 && woord.test(tekst[begin - 1])) begin--;
  while (eind < tekst.length && woord.test(tekst[eind])) eind++;
  if (begin === eind) return null;
  return { story: selectie.story, start: { paraId, offset: begin }, end: { paraId, offset: eind } };
}

/** Laat de editor de gewijzigde story opnieuw opbouwen en zet de focus terug. */
export function werkWeergaveBij(selectie: TekstSelectie) {
  const paged = selectie.ref.getEditorRef();
  paged?.syncYrsInputState(true, [selectie.story]);
  requestAnimationFrame(() => selectie.ref.focus());
}
