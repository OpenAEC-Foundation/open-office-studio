/**
 * PDF uit de afdrukpagina's (browser en desktop, zonder conversieprogramma).
 *
 * Elke pagina wordt getekend terwijl de canvasopdrachten worden opgenomen
 * (`opname.ts`). Lukt het die als vectoren met echte tekst te schrijven
 * (`vector.ts`), dan wordt de pagina een vectorpagina met ingesloten,
 * uitgedunde lettertypen (#18); anders blijft het beeld met de onzichtbare
 * tekstlaag van #37. Beide gebruiken dezelfde paginering als het voorbeeld.
 */
import type { AfdrukDocument } from "../../afdrukken/model";
import { canvasNaarBlob, opWit } from "../../afdrukken/afdrukframe";
import { schrijfPdf, type PdfBeeld, type PdfBronnen, type PdfPagina } from "./schrijver.ts";
import { metVectoropname, opnameVan, type Opname } from "./opname";
import { Bronnen, fontsIn, Onvectoriseerbaar, vectorPagina } from "./vector";
import { laadLettertype, ontleedFont, type GeladenLettertype } from "./lettertypebron";
import { codeerBeeld } from "./beelden";

export type PdfKwaliteit = "klein" | "standaard" | "hoog";

export const KWALITEITEN: Record<
  PdfKwaliteit,
  { naam: string; dpi: number; jpeg: number | null; beeldDpi: number }
> = {
  klein: { naam: "Klein bestand (150 dpi)", dpi: 150, jpeg: 0.8, beeldDpi: 150 },
  standaard: { naam: "Standaard (200 dpi)", dpi: 200, jpeg: 0.9, beeldDpi: 220 },
  hoog: { naam: "Hoog, verliesvrij (300 dpi)", dpi: 300, jpeg: null, beeldDpi: 300 },
};

export interface PdfOpties {
  /** 0-gebaseerde pagina's; standaard alle. */
  indexen?: number[];
  kwaliteit?: PdfKwaliteit;
  /** Tekst en vormen als vectoren waar dat kan (standaard aan). */
  vector?: boolean;
  auteur?: string;
  onderwerp?: string;
  trefwoorden?: string;
  voortgang?: (klaar: number, totaal: number) => void;
  /** Voor tests en diagnose: waarom pagina's een beeld werden. */
  terugval?: (pagina: number, reden: string) => void;
}

async function beeldVan(
  canvas: HTMLCanvasElement,
  jpeg: number | null,
): Promise<PdfBeeld> {
  const wit = opWit(canvas);
  if (jpeg !== null) {
    const blob = await canvasNaarBlob(wit, "image/jpeg", jpeg);
    return {
      soort: "jpeg",
      breedte: wit.width,
      hoogte: wit.height,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    };
  }
  const data = wit.getContext("2d")!.getImageData(0, 0, wit.width, wit.height).data;
  const rgb = new Uint8Array(wit.width * wit.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return { soort: "rgb", breedte: wit.width, hoogte: wit.height, bytes: rgb };
}

/** Laadt per fontopgave het eerste lettertype uit de familielijst dat als TrueType beschikbaar is. */
async function laadFonts(opgaven: Iterable<string>) {
  const kaart = new Map<string, GeladenLettertype | null>();
  await Promise.all(
    [...new Set(opgaven)].map(async (opgave) => {
      const f = ontleedFont(opgave);
      let gevonden: GeladenLettertype | null = null;
      if (f)
        for (const familie of f.families) {
          gevonden = await laadLettertype(familie, f.vet, f.cursief);
          if (gevonden) break;
        }
      kaart.set(opgave, gevonden);
    }),
  );
  return kaart;
}

/** Een deelverzamelingsprefix van zes hoofdletters, vast per lettertype en glyphset. */
function prefix(naam: string, glyphs: Iterable<number>) {
  let h = 0x811c9dc5;
  for (const c of naam) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  for (const g of glyphs) h = Math.imul(h ^ g, 0x01000193) >>> 0;
  let uit = "";
  for (let i = 0; i < 6; i++) {
    uit += String.fromCharCode(65 + (h % 26));
    h = Math.floor(h / 26) + i * 7919;
  }
  return uit;
}

async function maakBronnen(bronnen: Bronnen, dpi: number, jpeg: number | null): Promise<PdfBronnen> {
  const fonts = [...bronnen.fonts.values()].map((f) => {
    const glyphs = [...f.glyphs.keys()].sort((a, b) => a - b);
    const font = f.lt.font;
    return {
      naam: f.naam,
      basisnaam: `${prefix(font.postscriptNaam, glyphs)}+${font.postscriptNaam}`,
      bestand: font.deelverzameling(glyphs),
      eenheden: font.eenheden,
      stijgen: font.stijgen,
      dalen: font.dalen,
      kader: font.kader,
      cursiefHoek: font.cursiefHoek || (f.lt.synthetischCursief ? -11 : 0),
      hoofdletter: font.hoofdletterHoogte,
      vast: font.vasteBreedte,
      breedtes: glyphs.map((g) => [g, font.breedte(g)] as [number, number]),
      unicode: [...f.glyphs.entries()].sort((a, b) => a[0] - b[0]),
    };
  });
  const beelden = [];
  for (const v of bronnen.beelden) beelden.push({ naam: v.naam, stroom: await codeerBeeld(v, dpi, jpeg) });
  return {
    fonts,
    beelden,
    toestanden: [...bronnen.toestanden.values()],
    verlopen: bronnen.verlopen.map((v) => ({
      naam: v.naam,
      soort: v.verloop.soort === "lineair" ? 2 : 3,
      coords: v.verloop.args,
      stops: v.verloop.stops.map(([t], i) => ({
        t,
        kleur: [v.kleuren[i].r / 255, v.kleuren[i].g / 255, v.kleuren[i].b / 255] as [number, number, number],
      })),
    })),
  };
}

export async function maakPdf(
  doc: AfdrukDocument,
  opties: PdfOpties = {},
): Promise<Uint8Array> {
  const indexen = opties.indexen ?? doc.paginas.map((_, i) => i);
  if (!indexen.length) throw new Error("Er zijn geen pagina's gekozen.");
  const kwaliteit = KWALITEITEN[opties.kwaliteit ?? "standaard"];
  const vector = opties.vector !== false;
  const terugval =
    opties.terugval ?? ((pagina: number, reden: string) => console.info(`[pdf] pagina ${pagina + 1} als beeld: ${reden}`));

  // 1. Tekenen (met opname).
  const getekend: { tekening: Awaited<ReturnType<AfdrukDocument["paginas"][number]["teken"]>>; opname: Opname | undefined }[] = [];
  for (let n = 0; n < indexen.length; n++) {
    const pagina = doc.paginas[indexen[n]];
    const tekening = vector
      ? await metVectoropname(() => pagina.teken(kwaliteit.dpi))
      : await pagina.teken(kwaliteit.dpi);
    getekend.push({ tekening, opname: vector ? opnameVan(tekening.canvas) : undefined });
    opties.voortgang?.(n + 0.5, indexen.length);
  }

  // 2. Lettertypen voor alle tekst.
  const opgaven = new Set<string>();
  for (const { opname } of getekend) if (opname) for (const f of fontsIn(opname)) opgaven.add(f);
  const fonts = opgaven.size ? await laadFonts(opgaven) : new Map<string, GeladenLettertype | null>();
  const lettertype = (font: string) => fonts.get(font) ?? null;

  // 3. Per pagina vector of beeld. Eerst een proef, zodat een mislukte pagina geen bronnen achterlaat.
  const bronnen = new Bronnen();
  const paginas: PdfPagina[] = [];
  let vectorPaginas = 0;
  for (let n = 0; n < getekend.length; n++) {
    const pagina = doc.paginas[indexen[n]];
    const { tekening, opname } = getekend[n];
    let inhoud: string | null = null;
    if (opname) {
      try {
        vectorPagina(opname, pagina.breedte, pagina.hoogte, { bronnen: new Bronnen(), lettertype });
        inhoud = vectorPagina(opname, pagina.breedte, pagina.hoogte, { bronnen, lettertype });
      } catch (e) {
        if (!(e instanceof Onvectoriseerbaar)) throw e;
        terugval(indexen[n], e.message);
      }
    } else if (vector) terugval(indexen[n], "geen opname");
    if (inhoud !== null) {
      vectorPaginas++;
      paginas.push({ breedte: pagina.breedte, hoogte: pagina.hoogte, vector: inhoud, koppelingen: tekening.koppelingen });
    } else
      paginas.push({
        breedte: pagina.breedte,
        hoogte: pagina.hoogte,
        beeld: await beeldVan(tekening.canvas, kwaliteit.jpeg),
        tekst: tekening.tekst,
        koppelingen: tekening.koppelingen,
      });
    opties.voortgang?.(n + 1, indexen.length);
  }

  const positie = new Map(indexen.map((index, n) => [index, n]));
  const bladwijzers = (doc.bladwijzers ?? [])
    .filter((b) => positie.has(b.pagina))
    .map((b) => ({ titel: b.titel, pagina: positie.get(b.pagina)!, y: b.y }));
  return schrijfPdf({
    titel: doc.titel,
    auteur: opties.auteur,
    onderwerp: opties.onderwerp,
    trefwoorden: opties.trefwoorden,
    paginas,
    bladwijzers,
    bronnen: vectorPaginas ? await maakBronnen(bronnen, kwaliteit.beeldDpi, kwaliteit.jpeg) : undefined,
  });
}


