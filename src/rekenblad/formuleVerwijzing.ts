import { verwijzingenIn } from "../lint/rekenblad-functies";
import { adres, type Cel } from "../lint/rekenblad-logica";

/** De invoegplek blijft tijdens slepen gelijk aan die vóór de eerste klik. */
export function verwijzingsplek(tekst: string, begin: number, eind = begin) {
  if (!tekst.startsWith("=") || begin < 1 || eind < begin || eind > tekst.length) return null;
  let citaat: '"' | "'" | null = null;
  for (let i = 0; i < begin; i++) {
    const teken = tekst[i];
    if (citaat) {
      if (teken === citaat) {
        if (tekst[i + 1] === citaat) i++;
        else citaat = null;
      }
    } else if (teken === '"' || teken === "'") citaat = teken;
  }
  if (citaat) return null;
  if (begin === eind) {
    const bestaand = verwijzingenIn(tekst).find((r) => r.begin <= begin && begin <= r.eind);
    if (bestaand) return { begin: bestaand.begin, eind: bestaand.eind };
  }
  return { begin, eind };
}

export function plaatsFormuleBereik(tekst: string, plek: { begin: number; eind: number }, anker: Cel, focus: Cel) {
  const eerste = adres({ row: Math.min(anker.row, focus.row), col: Math.min(anker.col, focus.col) });
  const laatste = adres({ row: Math.max(anker.row, focus.row), col: Math.max(anker.col, focus.col) });
  const verwijzing = eerste === laatste ? eerste : `${eerste}:${laatste}`;
  return {
    tekst: tekst.slice(0, plek.begin) + verwijzing + tekst.slice(plek.eind),
    cursor: plek.begin + verwijzing.length,
  };
}
