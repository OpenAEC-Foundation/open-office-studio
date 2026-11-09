import { zipSync } from "fflate";
import type { AfdrukDocument } from "../../afdrukken/model";
import { drukPaginasAf } from "../../afdrukken/afdrukframe";
import { maakPdf } from "../../export/pdf";
import { bewaarUitvoer } from "../../export/bewaar";
import { maakSamenvoegDocument, type SamenvoegIndeling } from "./documenten";
import { maakSamenvoegPaginas } from "./paginas";
import { openSamenvoegDocument } from "./documentOpenen";
import type { Gegevens } from "./gegevens";

export type SamenvoegUitvoer = "document" | "docx" | "pdf" | "pdfPerRecord" | "printer";
export interface UitvoerOpties { template: Uint8Array; data: Gegevens; records: number[]; indeling: SamenvoegIndeling; signal?: AbortSignal; voortgang?: (klaar: number, totaal: number) => void; voorOpenen?: () => void }
function controleer(o: UitvoerOpties) { if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError"); }
export async function samengevoegdePaginas(o: UitvoerOpties): Promise<AfdrukDocument> {
  const uit: AfdrukDocument = { titel: "Samenvoegen", paginas: [], bladwijzers: [] };
  const stap = o.indeling.soort === "labels" ? o.indeling.kolommen * o.indeling.rijen : 1;
  for (let i = 0; i < o.records.length; i += stap) {
    controleer(o);
    const ids = o.records.slice(i, i + stap), bytes = maakSamenvoegDocument(o.template, o.data, ids, o.indeling);
    const doc = await maakSamenvoegPaginas(bytes, `Record-${String(ids[0] + 1).padStart(4, "0")}`, o.signal), offset = uit.paginas.length;
    uit.paginas.push(...doc.paginas);
    uit.bladwijzers!.push(...(doc.bladwijzers ?? []).map(b => ({ ...b, titel: `${ids[0] + 1}: ${b.titel}`, pagina: b.pagina + offset })));
    o.voortgang?.(Math.min(o.records.length, i + stap), o.records.length);
  }
  return uit;
}
export async function voerSamenvoegenUit(soort: SamenvoegUitvoer, o: UitvoerOpties) {
  controleer(o);
  if (soort === "document" || soort === "docx") {
    const bytes = maakSamenvoegDocument(o.template, o.data, o.records, o.indeling); controleer(o);
    if (soort === "document") { o.voorOpenen?.(); await openSamenvoegDocument(bytes, "Samenvoegen.docx"); }
    else await bewaarUitvoer(bytes, "Samenvoegen.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  } else if (soort === "pdfPerRecord") {
    const bestanden: Record<string, Uint8Array> = {}; let totaal = 0;
    for (const [i, record] of o.records.entries()) {
      controleer(o); const doc = await samengevoegdePaginas({ ...o, records: [record], voortgang: undefined });
      const bytes = await maakPdf(doc, { kwaliteit: "hoog", vector: false }); totaal += bytes.length;
      if (totaal > 200_000_000) throw new Error("mailMerge.errors.outputSize");
      bestanden[`Record-${String(record + 1).padStart(4, "0")}.pdf`] = bytes; o.voortgang?.(i + 1, o.records.length);
    }
    controleer(o); await bewaarUitvoer(zipSync(bestanden, { level: 1 }), "Samenvoegen-PDFs.zip", "application/zip");
  } else {
    const doc = await samengevoegdePaginas(o); controleer(o);
    if (soort === "pdf") await bewaarUitvoer(await maakPdf(doc, { kwaliteit: "hoog", vector: false }), "Samenvoegen.pdf", "application/pdf");
    else await drukPaginasAf(doc.paginas, doc.paginas.map((_, i) => i), doc.titel);
  }
}
