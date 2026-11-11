/** Gewone tekst gebruikt dezelfde bron- en levensduurbewaking als rijke plakacties. */
import type { YrsAuthor, YrsLoc, YrsSession } from "@betteroffice/docx/yrs";
import { maakRustPlakKoppeling, type RustTransportAntwoord, type RustPlakAanvraag, type RustPlakOpties, type RustVoorbereiding } from "./rustPlakken";
import { maakRustBron } from "./rustBron";
import { maakRustJournaal, type JournaalInvoke, type TekstVoorbereiding } from "./rustJournaal";

export interface RustTekstAanvraag {
  schema: 1 | 2 | 3;
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

export function maakRustTekstKoppeling(opties: Omit<RustPlakOpties, "transport" | "bron" | "voorbereiding"> & {
  transport: (aanvraag: RustTekstAanvraag) => Promise<RustTransportAntwoord>;
  journaal?: { optIn: boolean; invoke: JournaalInvoke };
  synchronisatie?: { vergeten: (documentId: string) => void };
}) {
  const documentId = opties.documentId ?? crypto.randomUUID();
  const journaal = opties.journaal?.optIn ? maakRustJournaal({
    documentId, optIn: true, invoke: opties.journaal.invoke, transport: opties.transport,
    vergeten: () => opties.synchronisatie?.vergeten(documentId),
  }) : undefined;
  const naarTekst = (aanvraag: RustPlakAanvraag): RustTekstAanvraag => {
    const { range, fragment, ...bron } = aanvraag;
    if (range.start.paraId !== range.end.paraId || range.start.offset !== range.end.offset
      || fragment.paragraphs.length !== 1 || typeof fragment.paragraphs[0].text !== "string")
      throw Error("Gewone tekstinvoer heeft precies één invoegpositie nodig");
    return { ...bron, position: { story: range.story, ...range.start }, text: fragment.paragraphs[0].text };
  };
  const bereidRoute = (r: TekstVoorbereiding): RustVoorbereiding => ({
    ...r, transport: a => r.transport(naarTekst(a)), terugval: r.terugval ? () => bereidRoute(r.terugval!()) : undefined,
  });
  const bron = !journaal && opties.synchronisatie ? maakRustBron(() => opties.synchronisatie!.vergeten(documentId)) : undefined;
  const koppeling = maakRustPlakKoppeling({
    ...opties,
    documentId, bron,
    voorbereiding: journaal ? sessie => bereidRoute(journaal.begin(sessie)) : undefined,
    transport: aanvraag => opties.transport(naarTekst(aanvraag)),
  });
  return {
    activeer() { koppeling.activeer(); journaal?.activeer(); },
    stop() { journaal?.stop(); koppeling.stop(); },
    gereed: () => journaal?.gereed() ?? Promise.resolve(),
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
