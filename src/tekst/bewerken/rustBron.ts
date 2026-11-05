/** Alleen de door Rust bevestigde bronvector, nooit een speculatieve bewerking. */
import { Buffer } from "buffer";
import type { YrsSession } from "@betteroffice/docx/yrs";
import type { RustBronKoppeling } from "./rustPlakken";

export function maakRustBron(vergeten: () => void): RustBronKoppeling {
  let bron: { sessie: YrsSession; basis: string; vector: Uint8Array } | null = null;
  return {
    lees(sessie) {
      const sourceVector = Buffer.from(sessie.encodeStateVector()).toString("base64");
      if (bron?.sessie === sessie)
        return { bytes: new Uint8Array(sessie.encodeStateAsUpdate(bron.vector)), basis: bron.basis, sourceVector };
      bron = null;
      return { bytes: new Uint8Array(sessie.encodeStateAsUpdate()), sourceVector };
    },
    bevestig(sessie, aanvraag, antwoord) {
      if (typeof antwoord.basis !== "string" || !/^[0-9a-f]{64}$/.test(antwoord.basis)
        || typeof antwoord.bronvector !== "string" || !antwoord.bronvector.length
        || antwoord.bronvector.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(antwoord.bronvector)
        || antwoord.bronvector !== aanvraag.sourceVector)
        throw Error("De bevestigde Writer-bron heeft geen geldige binding of vector");
      const vector = new Uint8Array(Buffer.from(antwoord.bronvector, "base64"));
      // Rust decodeert en vergelijkt de vectoren inhoudelijk. Alleen de exacte
      // aangeleverde vector mag daarna als bevestiging terugkomen.
      bron = { sessie, basis: antwoord.basis, vector };
    },
    herbegin() { bron = null; },
    vergeet() { bron = null; vergeten(); },
  };
}
