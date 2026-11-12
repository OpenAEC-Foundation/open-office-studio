/**
 * Toetstips (Alt of F10): elke bereikbare knop krijgt een korte lettercode,
 * zoals in gangbare kantoorsuites. Los van React en de DOM.
 */

const tekens = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Hoofdletters en cijfers uit een naam, zonder accenten. */
export function lettersVan(naam: string): string[] {
  return [
    ...naam
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase(),
  ].filter((teken) => tekens.includes(teken));
}

/** Eerst de beginletters van de woorden, daarna de overige letters. */
function voorkeur(naam: string): string[] {
  const woorden = naam.split(/[\s\-/·.,:]+/).filter(Boolean);
  const begin = woorden.flatMap((woord) => lettersVan(woord).slice(0, 1));
  return [...new Set([...begin, ...lettersVan(naam)])];
}

/**
 * Kent elke naam een unieke code toe. Codes zijn prefixvrij: is "F" een
 * code, dan begint geen andere code met "F". Zo is een code direct
 * uitgevoerd zodra hij volledig is getypt. `vast` zijn voorgeschreven codes
 * (bijvoorbeeld "B" voor Bestand); lege of botsende waarden worden genegeerd.
 */
export function kenToetstips(
  namen: readonly string[],
  vast: readonly (string | undefined)[] = [],
): string[] {
  const codes: (string | null)[] = namen.map(() => null);
  const bezet = new Set<string>();
  namen.forEach((_, i) => {
    const code = vast[i]?.toUpperCase();
    if (code && code.length === 1 && tekens.includes(code) && !bezet.has(code)) {
      codes[i] = code;
      bezet.add(code);
    }
  });
  for (let i = 0; i < namen.length; i++) {
    if (codes[i]) continue;
    const letter = voorkeur(namen[i]).find((teken) => !bezet.has(teken));
    if (letter) {
      codes[i] = letter;
      bezet.add(letter);
    }
  }
  let zonder = codes.flatMap((code, i) => (code ? [] : [i]));
  if (!zonder.length) return codes as string[];

  // Te veel namen voor losse tekens: één vrij teken wordt het voorvoegsel van
  // tweetekencodes. Is er geen teken vrij, dan staat de laatste losse code
  // zijn teken af.
  const vrij = () => [...tekens].filter((teken) => !bezet.has(teken));
  const nodigVoorvoegsels = () => Math.ceil(zonder.length / tekens.length);
  while (vrij().length < nodigVoorvoegsels()) {
    let laatste = -1;
    for (let i = codes.length - 1; i >= 0 && laatste < 0; i--)
      if (codes[i] && !vast[i]) laatste = i;
    for (let i = codes.length - 1; i >= 0 && laatste < 0; i--)
      if (codes[i]) laatste = i;
    bezet.delete(codes[laatste]!);
    codes[laatste] = null;
    zonder = codes.flatMap((code, i) => (code ? [] : [i]));
  }
  const voorvoegsels = vrij().slice(0, nodigVoorvoegsels());
  const gebruikt = new Set<string>();
  zonder.forEach((index, volgnummer) => {
    const voor =
      voorvoegsels[Math.min(Math.floor(volgnummer / tekens.length), voorvoegsels.length - 1)];
    const tweede =
      voorkeur(namen[index]).find((teken) => !gebruikt.has(voor + teken)) ??
      [...tekens].find((teken) => !gebruikt.has(voor + teken))!;
    codes[index] = voor + tweede;
    gebruikt.add(voor + tweede);
  });
  return codes as string[];
}

/** Wat een getypte reeks betekent: een volledige code, een begin, of niets. */
export function zoekToetstip(
  codes: readonly string[],
  getypt: string,
): { index: number } | "verder" | null {
  const index = codes.indexOf(getypt);
  if (index >= 0) return { index };
  return codes.some((code) => code.startsWith(getypt)) ? "verder" : null;
}
/** Alleen lintopdrachten vragen daarna of het lint zichtbaar en beschikbaar is. */
export function lintToetsActie(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "defaultPrevented">,
): "tips" | "inklappen" | null {
  if (e.defaultPrevented) return null;
  if (e.key === "F10" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return "tips";
  if (e.key === "F1" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) return "inklappen";
  return null;
}
