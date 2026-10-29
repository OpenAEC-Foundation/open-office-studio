/**
 * Pagina's van een databaserapport: titel, kop, een tabel met herhaalde
 * kolomkoppen, groepen met subtotalen, eindtotalen en een voet met
 * paginanummers. Zonder engine; tekent rechtstreeks op canvas.
 */
import { papierMaat, mmNaarPt, type AfdrukDocument, type AfdrukPagina, type Stand, type TekstStuk } from "./model";
import i18next from "../i18n/config";
import { meter, paginaCanvas, schrijf } from "./tekenhulp";

export interface RapportTabel {
  titel: string;
  kop?: string;
  voet?: string;
  /** Rechts in de voet, bijvoorbeeld "120 records · 28-10-2026". */
  voetRechts?: string;
  kolommen: string[];
  /** Per kolom: getallen rechts uitlijnen. */
  rechts: boolean[];
  secties: { kop?: string; rijen: string[][]; totaal?: string[] }[];
  eindtotaal?: string[];
  opmerkingen?: string[];
}

const RAND = mmNaarPt(14);
const GROOTTE = 9;
const REGEL = 14;

type Regel =
  | { soort: "groep"; tekst: string }
  | { soort: "rij"; cellen: string[] }
  | { soort: "totaal"; cellen: string[] }
  | { soort: "opmerking"; tekst: string };

export function rapportPaginas(tabel: RapportTabel, stand: Stand): AfdrukDocument {
  const { breedte, hoogte } = papierMaat("A4", stand);
  const vlakB = breedte - 2 * RAND;
  // Kolombreedtes naar de breedste inhoud, passend gemaakt op de pagina.
  const meet = meter(GROOTTE);
  const meetVet = meter(GROOTTE, true);
  const nat = tabel.kolommen.map((k, i) => {
    let m = meetVet(k);
    for (const s of tabel.secties) {
      for (const r of s.rijen.slice(0, 500)) m = Math.max(m, meet(r[i] ?? ""));
      if (s.totaal) m = Math.max(m, meetVet(s.totaal[i] ?? ""));
    }
    if (tabel.eindtotaal) m = Math.max(m, meetVet(tabel.eindtotaal[i] ?? ""));
    return Math.min(m + 10, vlakB * 0.6);
  });
  const som = nat.reduce((a, b) => a + b, 0) || 1;
  const krimp = som > vlakB ? vlakB / som : 1;
  const breedtes = nat.map((b) => b * krimp);

  const regels: Regel[] = [];
  for (const s of tabel.secties) {
    if (s.kop) regels.push({ soort: "groep", tekst: s.kop });
    for (const r of s.rijen) regels.push({ soort: "rij", cellen: r });
    if (s.totaal) regels.push({ soort: "totaal", cellen: s.totaal });
  }
  if (tabel.eindtotaal) regels.push({ soort: "totaal", cellen: tabel.eindtotaal });
  for (const o of tabel.opmerkingen ?? []) regels.push({ soort: "opmerking", tekst: o });

  const kopHoogte = 30 + (tabel.kop ? 16 : 0);
  const eersteRuimte = hoogte - 2 * RAND - kopHoogte - REGEL * 1.6 - 20;
  const volgendeRuimte = hoogte - 2 * RAND - REGEL * 1.6 - 20;
  const delen: Regel[][] = [[]];
  let ruimte = eersteRuimte;
  for (const r of regels) {
    if (ruimte < REGEL && delen[delen.length - 1].length) {
      delen.push([]);
      ruimte = volgendeRuimte;
    }
    delen[delen.length - 1].push(r);
    ruimte -= REGEL;
  }

  const totaal = delen.length;
  const paginas: AfdrukPagina[] = delen.map((deel, p) => ({
    breedte,
    hoogte,
    label: i18next.t("print:pages.pageOfTotal", { page: p + 1, total: totaal }),
    teken: async (dpi) => {
      const { canvas, ctx } = paginaCanvas(breedte, hoogte, dpi);
      const tekst: TekstStuk[] = [];
      const zet = (s: TekstStuk | null) => s && tekst.push(s);
      let y = RAND;
      if (p === 0) {
        zet(schrijf(ctx, tabel.titel, RAND, y + 16, 16, { vet: true, kleur: "#1f2937" }));
        y += 30;
        if (tabel.kop) {
          zet(schrijf(ctx, tabel.kop, RAND, y + 8, 10, { kleur: "#4b5563" }));
          y += 16;
        }
      }
      // Kolomkoppen (op elke pagina).
      ctx.fillStyle = "#eef0f3";
      ctx.fillRect(RAND, y, vlakB, REGEL * 1.6);
      const cel = (waarde: string, i: number, yy: number, vet: boolean) => {
        let x = RAND;
        for (let k = 0; k < i; k++) x += breedtes[k];
        const b = breedtes[i];
        const m = vet ? meetVet : meet;
        let t = waarde;
        while (t.length > 1 && m(t) > b - 6) t = t.slice(0, -2) + "…";
        zet(
          schrijf(ctx, t, tabel.rechts[i] ? x + b - 3 : x + 3, yy, GROOTTE, {
            vet,
            uitlijning: tabel.rechts[i] ? "rechts" : "links",
          }),
        );
      };
      tabel.kolommen.forEach((k, i) => cel(k, i, y + REGEL * 1.1, true));
      y += REGEL * 1.6;
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(RAND, y);
      ctx.lineTo(RAND + vlakB, y);
      ctx.stroke();
      for (const r of deel) {
        const basis = y + REGEL * 0.75;
        if (r.soort === "groep") {
          ctx.fillStyle = "#f7f3ea";
          ctx.fillRect(RAND, y + 1, vlakB, REGEL - 1);
          zet(schrijf(ctx, r.tekst, RAND + 3, basis, GROOTTE, { vet: true }));
        } else if (r.soort === "opmerking") {
          zet(schrijf(ctx, r.tekst, RAND, basis, GROOTTE - 1, { kleur: "#6b7280" }));
        } else {
          r.cellen.forEach((w, i) => cel(w ?? "", i, basis, r.soort === "totaal"));
          if (r.soort === "totaal") {
            ctx.beginPath();
            ctx.moveTo(RAND, y + 0.5);
            ctx.lineTo(RAND + vlakB, y + 0.5);
            ctx.stroke();
          }
        }
        y += REGEL;
      }
      // Voet.
      const voetY = hoogte - RAND + 4;
      ctx.beginPath();
      ctx.moveTo(RAND, voetY - 12);
      ctx.lineTo(RAND + vlakB, voetY - 12);
      ctx.stroke();
      zet(schrijf(ctx, tabel.voet ?? "", RAND, voetY, 8, { kleur: "#6b7280" }));
      zet(schrijf(ctx, i18next.t("print:pages.pageOfTotal", { page: p + 1, total: totaal }), breedte / 2, voetY, 8, { uitlijning: "midden", kleur: "#6b7280" }));
      zet(schrijf(ctx, tabel.voetRechts ?? "", RAND + vlakB, voetY, 8, { uitlijning: "rechts", kleur: "#6b7280" }));
      return { canvas, tekst };
    },
  }));
  return { titel: tabel.titel, paginas };
}
