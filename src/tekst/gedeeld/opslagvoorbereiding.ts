let voorbereiding: Promise<void> | null = null;

/** Laad dezelfde OPC-/parserkern als opslaan, zonder de actieve editor te flushen of op te slaan. */
export function bereidTekstOpslagVoor(): Promise<void> {
  if (!voorbereiding) {
    voorbereiding = (async () => {
      const antwoord = await fetch(
        `${import.meta.env.BASE_URL}templates/nieuw.docx`,
      );
      if (!antwoord.ok)
        throw new Error("Het opslagvoorbeeld kon niet worden geladen.");
      const bytes = await antwoord.arrayBuffer();
      const { parseDocx } = await import("@betteroffice/docx/docx");
      // Dit kleine ingebouwde document laadt beide openbare parserafhankelijkheden.
      // Fontregistratie en de volledige gebruikersinhoud zijn hiervoor niet nodig.
      await parseDocx(bytes, { preloadFonts: false });
    })().catch((fout) => {
      voorbereiding = null;
      throw fout;
    });
  }
  return voorbereiding;
}
