/** Getalvoorbeelden komen uit dezelfde kern als raster, kopiëren en opslag. */
import type { WorkbookHandle } from "@betteroffice/xlsx";
import { REGIONAAM, type Werkmapregio } from "./regiokeuze";
import { laadProefsjabloon, openProefwerkmap } from "./proefwerkmap";
import i18next from "../i18n/config";

export type Voorbeeldcode = string | 14 | 22;

export interface Getalvoorbeeld {
  tekst: string;
  kleur?: string;
  fout?: string;
  code?: string;
}
export interface Getalvoorbeelden {
  toon(waarde: number | string, code: Voorbeeldcode, regio: Werkmapregio | null, datumstelsel: "1900" | "1904"): Getalvoorbeeld;
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
  const regios = new Map<string, Werkmapregio | null>();
  const basis = new Map([...boeken].map(([stelsel, h]) => [stelsel, h.captureFormat(0, "A1").formats[0] as Record<string, unknown>]));
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
          if (regio !== null) h.applyOps([{ type: "setDefinedName", name: REGIONAAM, refers_to: `"${regio}"`, scope: null, hidden: true }]);
          else if (regios.has(datumstelsel)) h.applyOps([{ type: "deleteDefinedName", name: REGIONAAM, scope: null }]);
          regios.set(datumstelsel, regio);
        }
        const target = { sheetId: h.sheetInfo().sheetIds[0], range: { kind: "a1" as const, a1: "A1" } };
        if (typeof code === "number") {
          // Een eigen lege stijl, met behoud van de ingebouwde id. Geen
          // gebruikersopmaak of bronstijl-index in deze tijdelijke werkmap.
          h.applyOps([{ type: "applyRangeFormat", sheet: 0, range: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }, format: {
            rows: 1, columns: 1, formats: [{ ...basis.get(datumstelsel), numberFormat: { kind: "builtin", id: code } }],
          } }]);
        }
        const mutatie = h.applyEdits({ expectVersion: h.version(), history: "none", steps: [
          ...(typeof code === "string" ? [{ op: "setNumberFormat" as const, target, format: { type: "custom" as const, pattern: code } }] : []),
          { op: "setCellValues", target, values: [[typeof waarde === "number" ? { kind: "number", value: waarde } : { kind: "text", value: waarde }]] },
        ] });
        if (!mutatie.ok) return { tekst: "", fout: mutatie.failure.message };
        const lezing = h.exportStructured({ scope: [{ sheet: 0, range: "A1" }], maxCells: 1, includeDefinedNames: false, includeHiddenSheets: true });
        if (!lezing.ok) return { tekst: "", fout: lezing.failure.message };
        const cel = lezing.content.sheets[0]?.cells[0];
        const tekst = cel?.displayText ?? "";
        const benadering = lezing.content.diagnostics.some((d) => d.code === "formatting-approximate");
        const rect = h.cellRect(0, 0, 0);
        const frame = h.displayList({ x: 0, y: 0, width: Math.max(320, rect.x + rect.w), height: Math.max(120, rect.y + rect.h) });
        const kleur = frame.commands.find((c) => c.op === "text" && c.text === tekst && c.x >= rect.x && c.x <= rect.x + rect.w && c.y >= rect.y && c.y <= rect.y + rect.h);
        const resultaat: Getalvoorbeeld = { tekst,
          ...(typeof code === "number" ? { code: cel?.numberFormat ?? "General" } : {}),
          ...(benadering ? { fout: i18next.t("spreadsheet:numberFormat.errors.approximate") } : {}),
          ...(kleur?.op === "text" ? { kleur: kleur.color === "#FF0000" ? "red" : kleur.color } : {}),
        };
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
