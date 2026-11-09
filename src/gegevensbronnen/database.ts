import type { Werkkopie } from "../../packages/database/src/werkkopie/contract";
export interface DatabaseBron { id: number; naam: string; werkkopie: Werkkopie }
let volgende = 1, bronnen: DatabaseBron[] = [];
const luisteraars = new Set<() => void>();
export const leesDatabaseBronnen = () => bronnen;
export function volgDatabaseBronnen(fn: () => void) { luisteraars.add(fn); return () => { luisteraars.delete(fn); }; }
function meld() { for (const fn of luisteraars) fn(); }
export function registreerDatabaseBron(naam: string, werkkopie: Werkkopie) {
  const id = volgende++; bronnen = [...bronnen, { id, naam, werkkopie }]; meld();
  return () => { bronnen = bronnen.filter(b => b.id !== id); meld(); };
}
export async function leesDatabaseTabel(bron: DatabaseBron, tabel: string): Promise<string[][]> {
  const schema = (await bron.werkkopie.tabellen()).find(t => t.naam === tabel);
  if (!schema) throw new Error("data");
  const velden = schema.velden.filter(v => v.soort !== "binair");
  const result = await bron.werkkopie.rijen(tabel, { start: 0, aantal: 1001 });
  if (result.totaal > 1000) throw new Error("records");
  return [velden.map(v => v.naam), ...result.rijen.map(r => velden.map(v => {
    const value = r.waarden[v.naam]; if (value instanceof Uint8Array) throw new Error("data");
    return value === null || value === undefined ? "" : String(value);
  }))];
}
