import type { YrsSession } from "@betteroffice/docx/yrs";

type Bron = Pick<YrsSession, "storySegmentUnits" | "paragraphs">;

/** Dezelfde ruwe tekst als paragraphs(), maar alleen voor de cursoralinea. */
export function navigatieAlineaTekst(
  bron: Bron,
  verhaal: string,
  paraId: string,
  index: number,
): string {
  try {
    const delen = bron.storySegmentUnits(verhaal, [index])[0];
    const einde = delen?.at(-1);
    if (
      einde?.kind === "pilcrow" &&
      einde.paraId === paraId &&
      delen.filter((deel) => deel.kind === "pilcrow").length === 1
    ) {
      // Ook revisietekst blijft staan. Embeds tellen, net als bij de oude
      // native paragraphs()-projectie, niet mee in deze tekststring.
      return delen
        .filter((deel) => deel.kind === "text")
        .map((deel) => deel.text)
        .join("");
    }
  } catch {
    // Een afwijkende/oude alinea-indeling houdt de bestaande leesroute.
  }
  return bron.paragraphs(verhaal)[index]?.text ?? "";
}
