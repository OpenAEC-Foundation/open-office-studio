import { decodeerCsv, ontleedCsv, raadScheidingsteken } from "../../import/csvimport";

export class SamenvoegFout extends Error {
  constructor(public code: "data" | "columns" | "records" | "missing" | "template" | "cursor", public veld = "") { super(code); }
}
export interface Gegevens { kolommen: string[]; records: string[][] }

/** Adresgegevens blijven tekst: voorloopnullen, postcodes en formuletaal inbegrepen. */
export function leesGegevens(bytes: Uint8Array): Gegevens {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new SamenvoegFout("data");
  const { tekst } = decodeerCsv(bytes, "auto"), scheiding = raadScheidingsteken(tekst);
  let quote = false, begin = true, gesloten = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (quote) {
      if (c === '"') { if (tekst[i + 1] === '"') i++; else { quote = false; gesloten = true; } }
      continue;
    }
    if (c === scheiding || c === "\r" || c === "\n") { begin = true; gesloten = false; continue; }
    if (c === '"' && begin) { quote = true; begin = false; continue; }
    if (gesloten && c.trim()) throw new SamenvoegFout("data");
    if (c.trim()) begin = false;
  }
  if (quote) throw new SamenvoegFout("data");
  const rijen = ontleedCsv(tekst, scheiding, '"', 1002);
  while (rijen.length && rijen.at(-1)!.every(c => c === "")) rijen.pop();
  if (rijen.length < 2 || rijen.length > 1001) throw new SamenvoegFout("records");
  const kolommen = rijen[0].map(c => c.trim());
  if (kolommen.length > 100 || kolommen.some(c => !c || /["\\\r\n]/.test(c)) || new Set(kolommen.map(c => c.toLowerCase())).size !== kolommen.length) throw new SamenvoegFout("columns");
  if (rijen.slice(1).some(r => r.length > kolommen.length)) throw new SamenvoegFout("columns");
  return { kolommen, records: rijen.slice(1).map(r => kolommen.map((_, i) => r[i] ?? "")) };
}

export function waardeVan(data: Gegevens, record: number, veld: string): string {
  if (!Number.isInteger(record) || record < 0 || record >= data.records.length) throw new SamenvoegFout("records");
  const kolom = data.kolommen.findIndex(k => k.toLowerCase() === veld.toLowerCase());
  if (kolom < 0) throw new SamenvoegFout("missing", veld);
  return data.records[record][kolom];
}
