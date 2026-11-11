/** Rendering shared by Spreadsheet print preview and its PDF export. Coordinates in points. */
import i18next from "../i18n/config";
import { formatDatumTijd } from "../i18n/opmaak";
import { ontleedAdres } from "../lint/rekenblad-logica";
import { leesCelnotities } from "../rekenblad/celnotities";
import { leesDiscussies } from "../rekenblad/discussies";
import { Pakket } from "../grafieken/pakket";
import { papierMaat, type AfdrukPagina, type TekstStuk } from "./model";
import type { BladAfdrukInstellingen, Bereik } from "./rekenbladInstellingen";
import { breekAf, meter, paginaCanvas, schrijf } from "./tekenhulp";

export interface CelAnnotatie {
  cel: string;
  zichtbaar: boolean;
  regels: { tekst: string; vet?: boolean }[];
}
export function leesAfdrukAnnotaties(bytes: Uint8Array) {
  const p = new Pakket(bytes),
    discussies = leesDiscussies(p);
  return leesCelnotities(p).map((notities, i) =>
    [
      ...notities.map((n) => ({
        cel: n.cel,
        zichtbaar: n.zichtbaar,
        regels: [
          {
            tekst: n.auteur || i18next.t("spreadsheet:notes.unknownAuthor"),
            vet: true,
          },
          { tekst: n.tekst },
        ],
      })),
      ...(discussies[i] ?? []).map((d) => ({
        cel: d.cel,
        zichtbaar: false,
        regels: [
          ...(d.opgelost
            ? [
                {
                  tekst: i18next.t("spreadsheet:discussions.resolved"),
                  vet: true,
                },
              ]
            : []),
          ...d.berichten.flatMap((b) => [
            {
              tekst:
                (b.auteur || i18next.t("spreadsheet:notes.unknownAuthor")) +
                (b.tijd && Number.isFinite(Date.parse(b.tijd))
                  ? ` · ${formatDatumTijd(b.tijd)}`
                  : ""),
              vet: true,
            },
            { tekst: b.tekst },
          ]),
        ],
      })),
    ].sort((a, b) => {
      const x = ontleedAdres(a.cel)!,
        y = ontleedAdres(b.cel)!;
      return x.row - y.row || x.col - y.col;
    }),
  );
}
export function annotatieInGebied(n: CelAnnotatie, b: Bereik) {
  const p = ontleedAdres(n.cel)!;
  return (
    p.row >= b.rij1 && p.row <= b.rij2 && p.col >= b.kol1 && p.col <= b.kol2
  );
}
/** Also breaks a single long first word, preserving complete Unicode code points. */
function regelsVan(
  tekst: string,
  breedte: number,
  grootte: number,
  vet = false,
) {
  const meet = meter(grootte, vet);
  return breekAf(meet, tekst, Math.max(1, breedte)).flatMap((regel) => {
    if (meet(regel) <= breedte) return [regel];
    const uit: string[] = [];
    let huidig = "";
    for (const c of regel) {
      if (huidig && meet(huidig + c) > breedte) {
        uit.push(huidig);
        huidig = "";
      }
      huidig += c;
    }
    return [...uit, huidig];
  });
}
export function annotatiePaginas(
  naam: string,
  inst: BladAfdrukInstellingen,
  notities: CelAnnotatie[],
): AfdrukPagina[] {
  if (!notities.length) return [];
  const papier = papierMaat(inst.papier, inst.stand),
    x = inst.marges.links * 72,
    boven = inst.marges.boven * 72;
  const breedte = papier.breedte - x - inst.marges.rechts * 72,
    onder = papier.hoogte - inst.marges.onder * 72;
  type Regel = { tekst: string; vet?: boolean; y: number; grootte: number };
  const bladen: Regel[][] = [];
  let regels: Regel[] = [],
    y = boven + 34;
  function voeg(tekst: string, vet = false, grootte = 10) {
    for (const regel of regelsVan(tekst, breedte, grootte, vet)) {
      if (y + 3 > onder) {
        bladen.push(regels);
        regels = [];
        y = boven + 34;
      }
      regels.push({ tekst: regel, vet, y, grootte });
      y += grootte * 1.4;
    }
  }
  for (const n of notities) {
    voeg(n.cel, true, 12);
    for (const r of n.regels) voeg(r.tekst, r.vet);
    y += 12;
  }
  if (regels.length) bladen.push(regels);
  return bladen.map((regels, i) => ({
    ...papier,
    label: i18next.t("print:pages.cellComments", {
      sheet: naam,
      page: i + 1,
      total: bladen.length,
    }),
    async teken(dpi: number) {
      const { canvas, ctx } = paginaCanvas(papier.breedte, papier.hoogte, dpi),
        tekst: TekstStuk[] = [];
      const titel = schrijf(
        ctx,
        i18next.t("print:pages.cellCommentsTitle", { sheet: naam }),
        x,
        boven + 14,
        13,
        { vet: true },
      );
      if (titel) tekst.push(titel);
      for (const r of regels) {
        const stuk = schrijf(ctx, r.tekst, x, r.y, r.grootte, { vet: r.vet });
        if (stuk) tekst.push(stuk);
      }
      const nummer = schrijf(
        ctx,
        `${i + 1} / ${bladen.length}`,
        papier.breedte - inst.marges.rechts * 72,
        papier.hoogte - inst.marges.voet * 72,
        9,
        { uitlijning: "rechts" },
      );
      if (nummer) tekst.push(nummer);
      return { canvas, tekst };
    },
  }));
}
export function tekenZichtbareAnnotatie(
  c: CanvasRenderingContext2D,
  notitie: CelAnnotatie,
  x: number,
  y: number,
  vlak: { links: number; boven: number; rechts: number; onder: number },
): TekstStuk[] {
  const breedte = Math.min(180, vlak.rechts - vlak.links),
    links = Math.max(vlak.links, Math.min(x + 3, vlak.rechts - breedte)),
    boven = Math.max(vlak.boven, y + 1.5);
  if (breedte < 20 || boven + 20 > vlak.onder) return [];
  const inhoud = notitie.regels.flatMap((r) =>
    regelsVan(r.tekst, breedte - 16, 9, r.vet).map((tekst) => ({
      tekst,
      vet: r.vet,
    })),
  );
  const hoogte = Math.min(165, vlak.onder - boven, inhoud.length * 12 + 18),
    max = Math.max(0, Math.floor((hoogte - 12) / 12));
  c.save();
  c.fillStyle = "#fffbe6";
  c.strokeStyle = "#9a8354";
  c.lineWidth = 0.75;
  c.fillRect(links, boven, breedte, hoogte);
  c.strokeRect(links, boven, breedte, hoogte);
  const tekst: TekstStuk[] = [];
  inhoud.slice(0, max).forEach((r, i) => {
    const stuk = schrijf(c, r.tekst, links + 8, boven + 14 + i * 12, 9, {
      vet: r.vet,
    });
    if (stuk) tekst.push(stuk);
  });
  c.restore();
  return tekst;
}
