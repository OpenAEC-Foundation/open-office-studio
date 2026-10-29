/**
 * Pagina's van een rekenblad volgens de pagina-indeling van elk blad
 * (#65): papier, stand, marges, schaal of passend, afdrukbereik, herhaalrijen
 * en -kolommen, rasterlijnen, rij- en kolomkoppen en kop- en voetteksten.
 *
 * De cellen tekent de engine zelf via `printDisplayList` en `paintDisplayList`;
 * deze module bepaalt alleen welke cellen op welke pagina komen.
 */
import i18next from "../i18n/config";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { DisplayList, PrintMetrics } from "@betteroffice/xlsx";
import { papierMaat, type AfdrukDocument, type AfdrukPagina, type TekstStuk } from "./model";
import {
  bereikA1,
  indexNaarKolom,
  ontleedBereikA1,
  ontleedKolommen,
  ontleedRijen,
  vulVelden,
  type BladAfdrukInstellingen,
  type Bereik,
  type KopVoet,
} from "./rekenbladInstellingen";
import { indeling, maten, paginaVolgorde, type Groep } from "./rekenbladIndeling";
import { metTekstopname, naarPunten } from "./tekstopname";
import { LETTER, datumTekst, schrijf, tijdTekst } from "./tekenhulp";

export type RekenbladOmvang = "blad" | "werkmap" | "selectie";

export interface RekenbladKeuze {
  omvang: RekenbladOmvang;
  /** Instellingen per blad (index = bladindex). */
  instellingen: BladAfdrukInstellingen[];
  /** Het afdrukbereik negeren en het hele gebruikte bereik afdrukken. */
  negeerAfdrukbereik: boolean;
}

export interface RekenbladContext {
  api: XlsxEditorApi;
  titel: string;
  bestandsnaam: string;
  /** Huidige bytes (voor het gebruikte bereik van elk blad). */
  bytes: Uint8Array;
  selectie: { blad: number; bereik: Bereik } | null;
}

const PX_PER_INCH = 96;
const PT_PER_PX = 0.75;
const KOP_HOOGTE = 20;
const KOPGROOTTE = 10;

function meetMetriek(): PrintMetrics {
  const familie = "Calibri";
  const grootte = 11;
  let cijfer = 7;
  try {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${(grootte * 96) / 72}px "${familie}", "Carlito", sans-serif`;
    cijfer = Math.round(
      Math.max(..."0123456789".split("").map((c) => ctx.measureText(c).width)),
    );
  } catch {
    // Standaard voor Calibri 11.
  }
  const px = (grootte * 96) / 72;
  return {
    dpi: 96,
    maxDigitWidth: cijfer || 7,
    defaultRowHeightPt: 15,
    fontSizePt: grootte,
    fontFamily: familie,
    fontAscent: px * 0.75,
    fontDescent: px * 0.25,
  };
}

interface Blok {
  bereik: Bereik;
  /** Positie binnen het inhoudsblok in px bij 100%. */
  x: number;
  y: number;
}

/** Bereik in A1 van rijen en kolommen (inclusief). */
const a1 = (rij1: number, kol1: number, rij2: number, kol2: number) =>
  bereikA1({ rij1, kol1, rij2, kol2 });

function voorbereidBlad(
  handle: RekenbladContext["api"]["handle"],
  blad: number,
  inst: BladAfdrukInstellingen,
  gebied: Bereik,
  metriek: PrintMetrics,
) {
  const volledig: DisplayList = handle.printDisplayList(
    blad,
    bereikA1(gebied),
    metriek,
    false,
  );
  const aantalK = gebied.kol2 - gebied.kol1 + 1;
  const aantalR = gebied.rij2 - gebied.rij1 + 1;
  const kolomBreedtes = maten(volledig.grid?.colOffsets ?? [], aantalK);
  const rijHoogtes = maten(volledig.grid?.rowOffsets ?? [], aantalR);

  // Herhaalrijen en -kolommen (absoluut) en hun maat.
  const titelR = ontleedRijen(inst.herhaalRijen);
  const titelK = ontleedKolommen(inst.herhaalKolommen);
  const maatVan = (bereik: Bereik, as: "rij" | "kolom") => {
    const lijst = handle.printDisplayList(blad, bereikA1(bereik), metriek, false);
    const offsets = as === "rij" ? lijst.grid?.rowOffsets : lijst.grid?.colOffsets;
    const n = as === "rij" ? bereik.rij2 - bereik.rij1 + 1 : bereik.kol2 - bereik.kol1 + 1;
    return maten(offsets ?? [], n);
  };
  const som = (lijst: readonly number[]) => lijst.reduce((a, b) => a + b, 0);
  const titelRijMaten = titelR
    ? maatVan({ rij1: titelR[0], rij2: titelR[1], kol1: gebied.kol1, kol2: gebied.kol1 }, "rij")
    : [];
  const titelKolomMaten = titelK
    ? maatVan({ rij1: gebied.rij1, rij2: gebied.rij1, kol1: titelK[0], kol2: titelK[1] }, "kolom")
    : [];
  const titelRijen = titelR
    ? { bereik: titelR, hoogte: som(titelRijMaten), tot: titelR[1] - gebied.rij1 }
    : null;
  const titelKolommen = titelK
    ? { bereik: titelK, breedte: som(titelKolomMaten), tot: titelK[1] - gebied.kol1 }
    : null;

  const papier = papierMaat(inst.papier, inst.stand);
  const W = papier.breedte / PT_PER_PX;
  const H = papier.hoogte / PT_PER_PX;
  const m = inst.marges;
  const vlak = {
    x: m.links * PX_PER_INCH,
    y: m.boven * PX_PER_INCH,
    breedte: W - (m.links + m.rechts) * PX_PER_INCH,
    hoogte: H - (m.boven + m.onder) * PX_PER_INCH,
  };
  const laatsteRij = gebied.rij2 + 1;
  const kopBreedte = inst.koppen
    ? Math.max(30, String(laatsteRij).length * 8 + 14)
    : 0;
  const kopHoogte = inst.koppen ? KOP_HOOGTE : 0;
  const relatief = (lijst: number[], basis: number) =>
    new Set(lijst.map((n) => n - basis).filter((n) => n > 0));
  const verdeling = indeling({
    kolomBreedtes,
    rijHoogtes,
    titelKolommen: titelKolommen && { breedte: titelKolommen.breedte, tot: titelKolommen.tot },
    titelRijen: titelRijen && { hoogte: titelRijen.hoogte, tot: titelRijen.tot },
    kopBreedte,
    kopHoogte,
    breedte: Math.max(50, vlak.breedte),
    hoogte: Math.max(50, vlak.hoogte),
    schaal: inst.passend
      ? { breed: inst.passendBreed, hoog: inst.passendHoog }
      : inst.schaal / 100,
    rijEinden: relatief(inst.rijEinden, gebied.rij1),
    kolomEinden: relatief(inst.kolomEinden, gebied.kol1),
  });
  return {
    kolomBreedtes,
    rijHoogtes,
    titelRijMaten,
    titelKolomMaten,
    titelRijen,
    titelKolommen,
    papier,
    W,
    H,
    m,
    vlak,
    kopBreedte,
    kopHoogte,
    verdeling,
  };
}

function bladPaginas(
  ctx: RekenbladContext,
  blad: number,
  naam: string,
  inst: BladAfdrukInstellingen,
  gebied: Bereik,
  metriek: PrintMetrics,
): { paginas: Omit<AfdrukPagina, "label">[]; labels: string[] } {
  const handle = ctx.api.handle;
  const {
    kolomBreedtes,
    rijHoogtes,
    titelRijMaten,
    titelKolomMaten,
    titelRijen,
    titelKolommen,
    papier,
    W,
    H,
    m,
    vlak,
    kopBreedte,
    kopHoogte,
    verdeling,
  } = voorbereidBlad(handle, blad, inst, gebied, metriek);
  const volgorde = paginaVolgorde(verdeling, inst.volgorde);
  const s = verdeling.schaal;
  const totaal = volgorde.length;
  const labels = volgorde.map((_, i) =>
    i18next.t("print:pages.sheetPage", { sheet: naam, page: i + 1, total: totaal }),
  );

  const paginas = volgorde.map(({ kolom, rij }, paginaIndex) => {
    const k1 = gebied.kol1 + kolom[0];
    const k2 = gebied.kol1 + kolom[1] - 1;
    const r1 = gebied.rij1 + rij[0];
    const r2 = gebied.rij1 + rij[1] - 1;
    const metTitelK = !!titelKolommen && kolom[0] > titelKolommen.tot;
    const metTitelR = !!titelRijen && rij[0] > titelRijen.tot;
    const tkB = metTitelK ? titelKolommen!.breedte : 0;
    const trH = metTitelR ? titelRijen!.hoogte : 0;
    const somGroep = (lijst: readonly number[], g: Groep) =>
      lijst.slice(g[0], g[1]).reduce((a, b) => a + b, 0);
    const inhoudB = kopBreedte + tkB + somGroep(kolomBreedtes, kolom);
    const inhoudH = kopHoogte + trH + somGroep(rijHoogtes, rij);
    const dx = inst.horizontaalCentreren ? Math.max(0, (vlak.breedte - inhoudB * s) / 2) : 0;
    const dy = inst.verticaalCentreren ? Math.max(0, (vlak.hoogte - inhoudH * s) / 2) : 0;
    const blokken: Blok[] = [];
    const x0 = kopBreedte + tkB;
    const y0 = kopHoogte + trH;
    if (metTitelK && metTitelR)
      blokken.push({
        bereik: { rij1: titelRijen!.bereik[0], rij2: titelRijen!.bereik[1], kol1: titelKolommen!.bereik[0], kol2: titelKolommen!.bereik[1] },
        x: kopBreedte,
        y: kopHoogte,
      });
    if (metTitelR)
      blokken.push({
        bereik: { rij1: titelRijen!.bereik[0], rij2: titelRijen!.bereik[1], kol1: k1, kol2: k2 },
        x: x0,
        y: kopHoogte,
      });
    if (metTitelK)
      blokken.push({
        bereik: { rij1: r1, rij2: r2, kol1: titelKolommen!.bereik[0], kol2: titelKolommen!.bereik[1] },
        x: kopBreedte,
        y: y0,
      });
    blokken.push({ bereik: { rij1: r1, rij2: r2, kol1: k1, kol2: k2 }, x: x0, y: y0 });

    const teken = async (dpi: number) => {
      const { paintDisplayList } = await import("@betteroffice/xlsx");
      // Canvaspixels per px (96 dpi).
      const factor = dpi / PX_PER_INCH;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(W * factor));
      canvas.height = Math.max(1, Math.round(H * factor));
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#fff";
      c.fillRect(0, 0, canvas.width, canvas.height);
      const ox = vlak.x + dx;
      const oy = vlak.y + dy;
      // Cellen via de engine; de tekst wordt opgenomen voor de PDF-tekstlaag.
      const { tekstVan } = await metTekstopname(async () => {
        for (const blok of blokken) {
          const lijst = handle.printDisplayList(
            blad,
            a1(blok.bereik.rij1, blok.bereik.kol1, blok.bereik.rij2, blok.bereik.kol2),
            metriek,
            inst.rasterlijnen,
          );
          // Alleen het eigen bereik: de engine geeft één extra spoor mee.
          const breedte = maten(lijst.grid?.colOffsets ?? [], blok.bereik.kol2 - blok.bereik.kol1 + 1).reduce((a, b) => a + b, 0);
          const hoogte = maten(lijst.grid?.rowOffsets ?? [], blok.bereik.rij2 - blok.bereik.rij1 + 1).reduce((a, b) => a + b, 0);
          lijst.width = Math.min(lijst.width, breedte + 1);
          lijst.height = Math.min(lijst.height, hoogte + 1);
          paintDisplayList(c, lijst, factor * s, {
            x: (ox + blok.x * s) * factor,
            y: (oy + blok.y * s) * factor,
          });
        }
      });
      // Doorzichtige delen (gewist door de engine) wit maken.
      c.save();
      c.globalCompositeOperation = "destination-over";
      c.fillStyle = "#fff";
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.restore();
      const tekst: TekstStuk[] = naarPunten(tekstVan(canvas), 72 / dpi);
      c.setTransform(factor, 0, 0, factor, 0, 0);
      if (inst.koppen) {
        const reeks = (a: number, b: number) =>
          Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
        const kolommen = [
          ...(metTitelK ? reeks(titelKolommen!.bereik[0], titelKolommen!.bereik[1]) : []),
          ...reeks(k1, k2),
        ];
        const breedtes = [
          ...(metTitelK ? titelKolomMaten : []),
          ...kolomBreedtes.slice(kolom[0], kolom[1]),
        ];
        const rijen = [
          ...(metTitelR ? reeks(titelRijen!.bereik[0], titelRijen!.bereik[1]) : []),
          ...reeks(r1, r2),
        ];
        const hoogtes = [
          ...(metTitelR ? titelRijMaten : []),
          ...rijHoogtes.slice(rij[0], rij[1]),
        ];
        tekenKoppen(c, ox, oy, s, kopBreedte, kopHoogte, kolommen, breedtes, rijen, hoogtes);
      }
      // Kop- en voettekst (in punten).
      c.setTransform(dpi / 72, 0, 0, dpi / 72, 0, 0);
      const waarden = {
        pagina: paginaIndex + 1,
        paginas: totaal,
        datum: datumTekst(),
        tijd: tijdTekst(),
        bestand: ctx.bestandsnaam,
        blad: naam,
      };
      const kopY = m.kop * 72 + KOPGROOTTE;
      const voetY = papier.hoogte - m.voet * 72 - 2;
      tekst.push(
        ...kopVoet(c, inst.kop, waarden, kopY, m, papier.breedte),
        ...kopVoet(c, inst.voet, waarden, voetY, m, papier.breedte),
      );
      return { canvas, tekst };
    };
    return { breedte: papier.breedte, hoogte: papier.hoogte, teken };
  });
  return { paginas, labels };
}

function kopVoet(
  c: CanvasRenderingContext2D,
  kv: KopVoet,
  waarden: Parameters<typeof vulVelden>[1],
  y: number,
  m: BladAfdrukInstellingen["marges"],
  breedte: number,
) {
  const uit: TekstStuk[] = [];
  const delen: [string, number, "links" | "midden" | "rechts"][] = [
    [kv.links, m.links * 72, "links"],
    [kv.midden, breedte / 2, "midden"],
    [kv.rechts, breedte - m.rechts * 72, "rechts"],
  ];
  for (const [tekst, x, uitlijning] of delen) {
    if (!tekst) continue;
    const stuk = schrijf(c, vulVelden(tekst, waarden), x, y, KOPGROOTTE, { uitlijning });
    if (stuk) uit.push(stuk);
  }
  return uit;
}

/** Rij- en kolomkoppen in de stijl van een kantoorpakket (in px bij 100%, geschaald). */
function tekenKoppen(
  c: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  s: number,
  kopBreedte: number,
  kopHoogte: number,
  kolommen: number[],
  breedtes: number[],
  rijen: number[],
  hoogtes: number[],
) {
  c.save();
  c.translate(ox, oy);
  c.scale(s, s);
  c.lineWidth = 0.75;
  c.strokeStyle = "#9aa0a6";
  c.font = `11px ${LETTER}`;
  c.textBaseline = "middle";
  c.textAlign = "center";
  const vak = (x: number, y: number, b: number, h: number, tekst: string) => {
    if (b <= 0 || h <= 0) return;
    c.fillStyle = "#eef0f2";
    c.fillRect(x, y, b, h);
    c.strokeRect(x, y, b, h);
    c.fillStyle = "#333";
    if (tekst) c.fillText(tekst, x + b / 2, y + h / 2, Math.max(4, b - 2));
  };
  let x = kopBreedte;
  kolommen.forEach((k, i) => {
    vak(x, 0, breedtes[i] ?? 0, kopHoogte, indexNaarKolom(k));
    x += breedtes[i] ?? 0;
  });
  let y = kopHoogte;
  rijen.forEach((r, i) => {
    vak(0, y, kopBreedte, hoogtes[i] ?? 0, String(r + 1));
    y += hoogtes[i] ?? 0;
  });
  vak(0, 0, kopBreedte, kopHoogte, "");
  c.restore();
}

/** Alle pagina's voor de gekozen omvang. */
export async function rekenbladPaginas(
  ctx: RekenbladContext,
  keuze: RekenbladKeuze,
): Promise<AfdrukDocument> {
  const xlsx = await import("@betteroffice/xlsx");
  const info = ctx.api.handle.sheetInfo();
  const export_ = await xlsx.exportXlsxStructured(ctx.bytes, {
    maxCells: 1,
    includeHiddenSheets: true,
    includeDefinedNames: false,
  });
  const metriek = meetMetriek();
  const paginas: AfdrukPagina[] = [];
  const bladwijzers: AfdrukDocument["bladwijzers"] = [];
  const meldingen: string[] = [];
  const bladen =
    keuze.omvang === "werkmap"
      ? info.sheetNames.map((_, i) => i)
      : keuze.omvang === "selectie" && ctx.selectie
        ? [ctx.selectie.blad]
        : [info.activeSheet];
  for (const blad of bladen) {
    const bladExport = export_.sheets[blad];
    if (keuze.omvang === "werkmap" && bladExport && bladExport.visibility !== "visible")
      continue;
    if (bladExport && bladExport.kind !== "worksheet") {
      meldingen.push(i18next.t("print:errors.notAWorksheet", { name: info.sheetNames[blad] }));
      continue;
    }
    const inst = keuze.instellingen[blad];
    const gebied = gebiedVan(ctx, keuze, blad, bladExport?.usedRange ?? null);
    if (!gebied) continue;
    const naam = info.sheetNames[blad];
    const { paginas: lijst, labels } = bladPaginas(ctx, blad, naam, inst, gebied, metriek);
    bladwijzers.push({ titel: naam, pagina: paginas.length });
    lijst.forEach((p, i) => paginas.push({ ...p, label: labels[i] }));
  }
  if (!paginas.length) throw new Error(i18next.t("print:errors.sheetsEmpty"));
  return { titel: ctx.titel, paginas, bladwijzers, meldingen };
}

function gebiedVan(
  ctx: RekenbladContext,
  keuze: RekenbladKeuze,
  blad: number,
  gebruikt: string | null,
): Bereik | null {
  const inst = keuze.instellingen[blad];
  if (keuze.omvang === "selectie" && ctx.selectie?.blad === blad) return ctx.selectie.bereik;
  if (inst?.afdrukbereik && !keuze.negeerAfdrukbereik) {
    const b = ontleedBereikA1(inst.afdrukbereik);
    if (b) return b;
  }
  return gebruikt ? ontleedBereikA1(gebruikt) : null;
}

/** De indeling van één blad, voor het pagina-eindevoorbeeld. */
export async function bladIndeling(
  ctx: RekenbladContext,
  keuze: RekenbladKeuze,
  blad: number,
) {
  const xlsx = await import("@betteroffice/xlsx");
  const export_ = await xlsx.exportXlsxStructured(ctx.bytes, {
    maxCells: 1,
    includeHiddenSheets: true,
    includeDefinedNames: false,
  });
  const gebied = gebiedVan(ctx, keuze, blad, export_.sheets[blad]?.usedRange ?? null);
  if (!gebied) return null;
  const v = voorbereidBlad(ctx.api.handle, blad, keuze.instellingen[blad], gebied, meetMetriek());
  return {
    kolomBreedtes: v.kolomBreedtes,
    rijHoogtes: v.rijHoogtes,
    eersteRij: gebied.rij1,
    eersteKolom: gebied.kol1,
    verdeling: v.verdeling,
  };
}
