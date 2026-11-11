import { strFromU8, unzipSync } from "fflate";
import { Pakket } from "../../grafieken/pakket";
import { attr, elementen, kind, leesXml, zoekAlle, type XmlElement } from "../../grafieken/xml";
import { gegevensUitRijen, leesGegevens, SamenvoegFout, type Gegevens } from "./gegevens";

export interface GegevensBlad { naam: string; gegevens: Gegevens }
function kolom(ref: string) { let n = 0; for (const c of ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "") n = n * 26 + c.charCodeAt(0) - 64; return n; }
async function xlsxBron(bytes: Uint8Array): Promise<GegevensBlad[]> {
  const { initWasm, openWorkbook } = await import("@betteroffice/xlsx");
  await initWasm();
  const p = new Pakket(bytes), wb = leesXml(p.lees("xl/workbook.xml")), relaties = p.relaties("xl/workbook.xml");
  const h = openWorkbook(bytes);
  try {
    const result: GegevensBlad[] = [];
    const catalogus = h.readCells({ ranges: [] }); if (!catalogus.ok) throw new SamenvoegFout("data");
    for (const sh of zoekAlle(wb, "sheet")) {
      const naam = attr(sh, "name")!, rel = relaties.find(r => r.id === attr(sh, "id"));
      const sheet = catalogus.sheets.find(s => s.name === naam);
      if (!rel || rel.extern || !sheet || sheet.visibility === "veryHidden") continue;
      const path = p.doel("xl/workbook.xml", rel.id); if (!path) throw new SamenvoegFout("data");
      const root = leesXml(p.lees(path));
      const rows = zoekAlle(root, "row").filter(r => elementen(r).some(c => c.lokaal === "c" && (kind(c, "v") || kind(c, "is") || kind(c, "f"))));
      if (!rows.length) continue;
      if (rows.length > 1001) throw new SamenvoegFout("records");
      const cols = Math.max(...rows.flatMap(r => elementen(r).filter(c => c.lokaal === "c" && (kind(c, "v") || kind(c, "is") || kind(c, "f"))).map(c => kolom(attr(c, "r") ?? "A1"))));
      if (cols > 100 || cols < 1) throw new SamenvoegFout("columns");
      let letters = "", n = cols; while (n) { n--; letters = String.fromCharCode(65 + n % 26) + letters; n = Math.floor(n / 26); }
      const rijen: string[][] = [];
      for (let i = 0; i < rows.length; i += 50) {
        const read = h.readCells({ ranges: rows.slice(i, i + 50).map(r => {
          const row = Number(attr(r, "r")); if (!Number.isInteger(row) || row < 1 || row > 1048576) throw new SamenvoegFout("data");
          return { sheetId: sheet.sheetId, range: { kind: "a1" as const, a1: `A${row}:${letters}${row}` } };
        }) });
        if (!read.ok || read.calculation.truncated) throw new SamenvoegFout("data");
        rijen.push(...read.ranges.map(r => r.cells[0].map(c => c.displayText)));
      }
      result.push({ naam, gegevens: gegevensUitRijen(rijen) });
    }
    if (!result.length) throw new SamenvoegFout("records");
    return result;
  } finally { h.dispose(); }
}
function odsBron(bytes: Uint8Array): GegevensBlad[] {
  const z = unzipSync(bytes, { filter: f => { if (f.name !== "content.xml") return false; if (f.originalSize > 20_000_000) throw new SamenvoegFout("data"); return true; } });
  if (!z["content.xml"]) throw new SamenvoegFout("data");
  const root = leesXml(strFromU8(z["content.xml"]));
  const tekst = (e: XmlElement): string => e.kinderen.map(n => {
    if (n.soort === "tekst") return n.tekst;
    if (n.lokaal === "annotation") return "";
    if (n.lokaal === "s") return " ".repeat(Math.min(1024, Number(attr(n, "c") ?? 1)));
    if (n.lokaal === "tab") return "\t";
    if (n.lokaal === "line-break") return "\n";
    return tekst(n);
  }).join("");
  const repeat = (e: XmlElement, name: string) => { const n = Number(attr(e, name) ?? 1); if (!Number.isInteger(n) || n < 1 || n > 1048576) throw new SamenvoegFout("data"); return n; };
  const uit: GegevensBlad[] = [];
  for (const table of zoekAlle(root, "table").filter(e => e.voorvoegsel === "table")) {
    const rijen: string[][] = [];
    for (const row of zoekAlle(table, "table-row")) {
      const cells = elementen(row).filter(c => ["table-cell", "covered-table-cell"].includes(c.lokaal));
      const values: string[] = [];
      for (const cell of cells) {
        const ps = elementen(cell).filter(e => e.lokaal === "p"), value = ps.length ? ps.map(tekst).join("\n") : attr(cell, "string-value") ?? attr(cell, "date-value") ?? attr(cell, "boolean-value") ?? attr(cell, "value") ?? "";
        const count = repeat(cell, "number-columns-repeated");
        if (value && values.length + count > 100) throw new SamenvoegFout("columns");
        if (values.length < 100) values.push(...Array(Math.min(count, 100 - values.length)).fill(value));
      }
      while (values.at(-1) === "") values.pop();
      if (!values.length) continue;
      const count = repeat(row, "number-rows-repeated");
      if (rijen.length + count > 1001) throw new SamenvoegFout("records");
      for (let i = 0; i < count; i++) rijen.push([...values]);
    }
    if (rijen.length > 1) uit.push({ naam: attr(table, "name") ?? String(uit.length + 1), gegevens: gegevensUitRijen(rijen) });
  }
  if (!uit.length) throw new SamenvoegFout("records"); return uit;
}
export async function leesSamenvoegBron(bytes: Uint8Array, naam: string): Promise<GegevensBlad[]> {
  if (!bytes.length || bytes.length > 10_000_000) throw new SamenvoegFout("data");
  const ext = naam.split(".").at(-1)?.toLowerCase();
  if (ext === "xlsx") return xlsxBron(bytes);
  if (ext === "ods") return odsBron(bytes);
  if (ext === "csv" || ext === "tsv") return [{ naam, gegevens: leesGegevens(bytes) }];
  throw new SamenvoegFout("data");
}
