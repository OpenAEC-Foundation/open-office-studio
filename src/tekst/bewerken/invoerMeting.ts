/** Optionele lokale diagnose; bewaart geen tekst, bestanden of documentidentiteiten. */
type Stap = "cursor" | "bron" | "hash" | "aanvraag" | "transport" | "binding" | "mutatie" | "selectie";
type Uitkomst = "rust" | "synchroon" | "afgebroken" | "fout";
interface Monster {
  sessie: number;
  levensduur: number;
  beginMs: number;
  duurMs: number;
  stappen: Partial<Record<Stap, number>>;
  rustBinnenMs: number;
  pogingen: number;
  uitkomst: Uitkomst;
}
interface Opname {
  begin: number;
  toegelaten: number;
  overgeslagen: number;
  sessies: WeakMap<object, number>;
  sessieTeller: number;
  monsters: Monster[];
}
let opname: Opname | null = null;
const grens = 1024;

function lees(o: Opname | null) {
  return {
    grens, overgeslagen: o?.overgeslagen ?? 0,
    monsters: o?.monsters.map(m => ({ ...m, stappen: { ...m.stappen } })) ?? [],
    grensomschrijving: "Transport en hash bevatten wachttijd op de hoofdthread; rustBinnenMs is alleen de bestaande Rust-binnenmeting. Geen volledige CPU-, SDK-publicatie- of tekentijd.",
  };
}
export const invoerMeting = {
  start() {
    opname = { begin: performance.now(), toegelaten: 0, overgeslagen: 0, sessies: new WeakMap(), sessieTeller: 0, monsters: [] };
  },
  lees() { return lees(opname); },
  stop() { const o = opname; opname = null; return lees(o); },
};

export function beginInvoerMeting(sessie: object, levensduur: number) {
  const o = opname;
  // De gewone invoerroute vraagt geen klok op en maakt geen meetobjecten aan.
  if (!o) return undefined;
  if (o.toegelaten >= grens) { o.overgeslagen++; return undefined; }
  o.toegelaten++;
  let id = o.sessies.get(sessie);
  if (id === undefined) { id = ++o.sessieTeller; o.sessies.set(sessie, id); }
  const begin = performance.now();
  let vorig = begin, klaar = false;
  const m: Monster = { sessie: id, levensduur, beginMs: begin - o.begin, duurMs: 0, stappen: {}, rustBinnenMs: 0, pogingen: 0, uitkomst: "afgebroken" };
  return {
    stap(naam: Stap) {
      if (klaar || opname !== o) return;
      const nu = performance.now(); m.stappen[naam] = (m.stappen[naam] ?? 0) + nu - vorig; vorig = nu;
    },
    poging() { if (!klaar && opname === o) m.pogingen++; },
    rust(ms: number) { if (!klaar && opname === o && Number.isFinite(ms) && ms >= 0) m.rustBinnenMs += ms; },
    eind(uitkomst: Uitkomst) {
      if (klaar) return;
      klaar = true;
      if (opname !== o) return;
      m.duurMs = performance.now() - begin; m.uitkomst = uitkomst; o.monsters.push(m);
    },
  };
}

declare global { interface Window { __OPENAEC_WRITER_INVOERMETING__?: typeof invoerMeting } }
if (typeof window !== "undefined") window.__OPENAEC_WRITER_INVOERMETING__ = invoerMeting;
