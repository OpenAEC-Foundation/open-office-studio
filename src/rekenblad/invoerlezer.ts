/** Dezelfde invoerparser als het raster, zonder het gebruikersbestand te bewerken. */
import type { XlsxCellValue } from "@betteroffice/xlsx";
import { laadProefsjabloon, openProefwerkmap } from "./proefwerkmap";
import { REGIONAAM, type Werkmapregio } from "./regiokeuze";
import { regionaleInvoer } from "./regionaleInvoer";

export async function laadInvoerlezer(regio: Werkmapregio | null, datumstelsel: "1900" | "1904") {
  return maakInvoerlezer(await laadProefsjabloon(), regio, datumstelsel);
}

export function maakInvoerlezer(bytes: Uint8Array, regio: Werkmapregio | null, datumstelsel: "1900" | "1904") {
  const h = openProefwerkmap(bytes, datumstelsel);
  if (regio !== null) h.applyOps([{ type: "setDefinedName", name: REGIONAAM, refers_to: JSON.stringify(regio), scope: null, hidden: true }]);
  let gesloten = false;
  return {
    lees(teksten: string[][]): XlsxCellValue[][] {
      if (gesloten) throw new Error("De invoerlezer is gesloten.");
      if (!teksten.length || !teksten[0].length) return [];
      const target = { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "rowCol" as const, start: { row: 0, col: 0 }, end: { row: teksten.length - 1, col: teksten[0].length - 1 } } };
      const resultaat = h.applyEdits({ expectVersion: h.version(), history: "none", steps: [
        { op: "setNumberFormat", target, format: "automatic" },
        // Een los klembordfragment kent geen formulecontext. Formules hier
        // als tekst lezen; het echte plakpad beslist over formule-invoer.
        regionaleInvoer(target, teksten.map((rij) => rij.map((tekst) => tekst.startsWith("=") ? `'${tekst}` : tekst))),
      ] });
      if (!resultaat.ok) throw new Error(resultaat.failure.message);
      const lezing = h.readCells({ ranges: [target] });
      if (!lezing.ok) throw new Error(lezing.failure.message);
      return lezing.ranges[0].cells.map((rij) => rij.map((c) => c.value));
    },
    dispose() { if (!gesloten) { gesloten = true; h.dispose(); } },
  };
}
