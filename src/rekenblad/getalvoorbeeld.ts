/** Getalvoorbeelden komen uit dezelfde kern als raster, kopiëren en opslag. */
import type { WorkbookHandle } from "@betteroffice/xlsx";
import { REGIONAAM, type Werkmapregio } from "./regiokeuze";
import { laadProefsjabloon, openProefwerkmap } from "./proefwerkmap";

export interface Getalvoorbeeld {
  tekst: string;
  kleur?: string;
  fout?: string;
}
export interface Getalvoorbeelden {
  toon(waarde: number | string, code: string, regio: Werkmapregio, datumstelsel: "1900" | "1904"): Getalvoorbeeld;
  dispose(): void;
}

export async function laadGetalvoorbeelden(): Promise<Getalvoorbeelden> {
  return maakGetalvoorbeelden(await laadProefsjabloon());
}

/** Een eigen, leeg werkbestand; er wordt niets in het gebruikersbestand gewijzigd. */
export function maakGetalvoorbeelden(bytes: Uint8Array): Getalvoorbeelden {
  const boeken = new Map<"1900" | "1904", WorkbookHandle>();
  try { boeken.set("1900", openProefwerkmap(bytes, "1900")); boeken.set("1904", openProefwerkmap(bytes, "1904")); }
  catch (fout) { boeken.forEach((h) => h.dispose()); throw fout; }
  const regios = new Map<string, Werkmapregio>();
  const cache = new Map<string, Getalvoorbeeld>();
  let gesloten = false;
  return {
    toon(waarde, code, regio, datumstelsel) {
      if (gesloten) throw new Error("Het getalvoorbeeld is gesloten.");
      if (typeof waarde === "number" && !Number.isFinite(waarde)) return { tekst: "#NUM!" };
      const sleutel = JSON.stringify([waarde, code, regio, datumstelsel]);
      const bestaand = cache.get(sleutel); if (bestaand) return bestaand;
      const h = boeken.get(datumstelsel)!;
      try {
        if (regios.get(datumstelsel) !== regio) {
          h.applyOps([{ type: "setDefinedName", name: REGIONAAM, refers_to: `"${regio}"`, scope: null, hidden: true }]);
          regios.set(datumstelsel, regio);
        }
        const target = { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1" as const, a1: "A1" } };
        const mutatie = h.applyEdits({ expectVersion: h.version(), history: "none", steps: [
          { op: "setNumberFormat", target, format: { type: "custom", pattern: code } },
          { op: "setCellValues", target, values: [[typeof waarde === "number" ? { kind: "number", value: waarde } : { kind: "text", value: waarde }]] },
        ] });
        if (!mutatie.ok) return { tekst: "", fout: mutatie.failure.message };
        const lezing = h.readCells({ ranges: [target] });
        if (!lezing.ok) return { tekst: "", fout: lezing.failure.message };
        const tekst = lezing.ranges[0].cells[0][0].displayText;
        const rect = h.cellRect(0, 0, 0);
        const frame = h.displayList({ x: 0, y: 0, width: Math.max(320, rect.x + rect.w), height: Math.max(120, rect.y + rect.h) });
        const kleur = frame.commands.find((c) => c.op === "text" && c.text === tekst && c.x >= rect.x && c.x <= rect.x + rect.w && c.y >= rect.y && c.y <= rect.y + rect.h);
        const resultaat: Getalvoorbeeld = { tekst, ...(kleur?.op === "text" ? { kleur: kleur.color === "#FF0000" ? "red" : kleur.color } : {}) };
        if (cache.size >= 256) cache.delete(cache.keys().next().value!);
        cache.set(sleutel, resultaat);
        return resultaat;
      } catch (fout) {
        return { tekst: "", fout: fout instanceof Error ? fout.message : String(fout) };
      }
    },
    dispose() { if (gesloten) return; gesloten = true; boeken.forEach((h) => h.dispose()); cache.clear(); },
  };
}
