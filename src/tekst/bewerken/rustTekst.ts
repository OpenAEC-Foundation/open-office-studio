/** Gewone tekst gebruikt dezelfde bron- en levensduurbewaking als rijke plakacties. */
import type { YrsAuthor, YrsLoc, YrsSession } from "@betteroffice/docx/yrs";
import { maakRustPlakKoppeling, type RustTransportAntwoord, type RustPlakOpties } from "./rustPlakken";
import { maakRustBron } from "./rustBron";

export interface RustTekstAanvraag {
  schema: 1 | 2;
  basis?: string;
  sourceVector?: string;
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

export function maakRustTekstKoppeling(opties: Omit<RustPlakOpties, "transport" | "bron"> & {
  transport: (aanvraag: RustTekstAanvraag) => Promise<RustTransportAntwoord>;
  synchronisatie?: { vergeten: (documentId: string) => void };
}) {
  const documentId = opties.documentId ?? crypto.randomUUID();
  const bron = opties.synchronisatie ? maakRustBron(() => opties.synchronisatie!.vergeten(documentId)) : undefined;
  const koppeling = maakRustPlakKoppeling({
    ...opties,
    documentId, bron,
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
    tekst(sessie: YrsSession, positie: YrsLoc, tekst: string, auteur: YrsAuthor | undefined, zelfdeEditor: () => boolean, invoertijd?: readonly [number, number]) {
      if (!tekst.length || /[\r\n]/.test(tekst)) throw Error("Gewone tekst mag niet leeg zijn of een alineagrens bevatten");
      if (invoertijd && (!invoertijd.every(t => Number.isFinite(t) && t >= 0 && t <= Number.MAX_SAFE_INTEGER)
        || invoertijd[1] < invoertijd[0])) throw Error("De invoertijd van de tekst is ongeldig");
      const punt = { paraId: positie.paraId, offset: positie.offset };
      const tijdspan = invoertijd && [invoertijd[0], invoertijd[1]] as const;
      const opnemen = tijdspan ? (mutatie: () => void) => {
        // Pin alleen de actuele synchrone bronmutatie, nooit de transportwachttijd.
        sessie.setUndoInputTime(tijdspan[0], tijdspan[1]);
        let wasmDefect = false;
        try { mutatie(); }
        catch (fout) { wasmDefect = fout instanceof WebAssembly.RuntimeError; throw fout; }
        finally {
          // Een getrapte Wasm-instantie niet opnieuw aanroepen tijdens opruimen.
          if (!wasmDefect) sessie.clearUndoInputTime();
        }
      } : undefined;
      // Geen plakgebeurtenis, klembordafronding of extra Undo-grens tijdens typen.
      return koppeling.plak(sessie, { story: positie.story, start: punt, end: punt },
        { paragraphs: [{ text: tekst }] }, auteur, zelfdeEditor, undefined, opnemen);
    },
  };
}
