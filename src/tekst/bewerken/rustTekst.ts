/** Gewone tekst gebruikt dezelfde bron- en levensduurbewaking als rijke plakacties. */
import type { YrsAuthor, YrsLoc, YrsSession } from "@betteroffice/docx/yrs";
import { maakRustPlakKoppeling, type RustPlakAntwoord, type RustPlakOpties } from "./rustPlakken";

export interface RustTekstAanvraag {
  schema: 1;
  requestId: string;
  documentId: string;
  sourceVersion: string;
  snapshotSha256: string;
  snapshot: string;
  clientId: number;
  position: YrsLoc;
  text: string;
  author?: YrsAuthor;
}

export function maakRustTekstKoppeling(opties: Omit<RustPlakOpties, "transport"> & {
  transport: (aanvraag: RustTekstAanvraag) => Promise<RustPlakAntwoord>;
}) {
  const koppeling = maakRustPlakKoppeling({
    ...opties,
    transport: aanvraag => {
      const { range, fragment, ...bron } = aanvraag;
      if (range.start.paraId !== range.end.paraId || range.start.offset !== range.end.offset
        || fragment.paragraphs.length !== 1 || typeof fragment.paragraphs[0].text !== "string")
        throw Error("Gewone tekstinvoer heeft precies één invoegpositie nodig");
      return opties.transport({ ...bron, position: { story: range.story, ...range.start }, text: fragment.paragraphs[0].text });
    },
  });
  return {
    activeer: koppeling.activeer,
    stop: koppeling.stop,
    tekst(sessie: YrsSession, positie: YrsLoc, tekst: string, auteur: YrsAuthor | undefined, zelfdeEditor: () => boolean) {
      if (!tekst.length || /[\r\n]/.test(tekst)) throw Error("Gewone tekst mag niet leeg zijn of een alineagrens bevatten");
      const punt = { paraId: positie.paraId, offset: positie.offset };
      // Geen plakgebeurtenis, klembordafronding of extra Undo-grens tijdens typen.
      return koppeling.plak(sessie, { story: positie.story, start: punt, end: punt },
        { paragraphs: [{ text: tekst }] }, auteur, zelfdeEditor);
    },
  };
}
