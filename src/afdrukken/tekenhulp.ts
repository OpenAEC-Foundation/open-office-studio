/** Kleine tekenhulpen voor eigen pagina-onderdelen (kop- en voetteksten, notities, hand-outs). */
import { formatDatum, formatTijd } from "../i18n/opmaak";
import type { TekstStuk } from "./model";

export const LETTER = '"Calibri", "Carlito", "Inter", "Liberation Sans", sans-serif';

/** Een canvas voor een pagina van `breedte`×`hoogte` punten op `dpi`, wit gevuld en geschaald naar punten. */
export function paginaCanvas(breedte: number, hoogte: number, dpi: number) {
  const schaal = dpi / 72;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(breedte * schaal));
  canvas.height = Math.max(1, Math.round(hoogte * schaal));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(schaal, 0, 0, schaal, 0, 0);
  return { canvas, ctx, schaal };
}

/**
 * Tekent tekst in punten en geeft het tekststuk voor de PDF-tekstlaag terug.
 * `uitlijning` bepaalt of `x` het begin, midden of einde is.
 */
export function schrijf(
  ctx: CanvasRenderingContext2D,
  tekst: string,
  x: number,
  y: number,
  grootte: number,
  opties: {
    uitlijning?: "links" | "midden" | "rechts";
    vet?: boolean;
    cursief?: boolean;
    kleur?: string;
  } = {},
): TekstStuk | null {
  if (!tekst) return null;
  ctx.save();
  ctx.font = `${opties.cursief ? "italic " : ""}${opties.vet ? "bold " : ""}${grootte}px ${LETTER}`;
  ctx.fillStyle = opties.kleur ?? "#222222";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const breedte = ctx.measureText(tekst).width;
  const begin =
    opties.uitlijning === "midden"
      ? x - breedte / 2
      : opties.uitlijning === "rechts"
        ? x - breedte
        : x;
  // Directe aanroep zonder opname: de tekstlaag krijgt het stuk via de returnwaarde.
  ctx.fillText(tekst, begin, y);
  ctx.restore();
  return { tekst, x: begin, y, grootte, breedte };
}

/** Breekt tekst af op woorden zodat elke regel binnen `breedte` punten past. */
export function breekAf(
  meet: (tekst: string) => number,
  tekst: string,
  breedte: number,
): string[] {
  const regels: string[] = [];
  for (const alinea of tekst.replace(/\r\n?/g, "\n").split("\n")) {
    const woorden = alinea.split(/(\s+)/).filter((w) => w !== "");
    let regel = "";
    for (const woord of woorden) {
      const proef = regel + woord;
      if (!regel || meet(proef.trimEnd()) <= breedte) {
        regel = proef;
        continue;
      }
      regels.push(regel.trimEnd());
      regel = /^\s+$/.test(woord) ? "" : woord;
      // Eén woord breder dan de regel: hard afbreken.
      while (meet(regel) > breedte && regel.length > 1) {
        let n = regel.length - 1;
        while (n > 1 && meet(regel.slice(0, n)) > breedte) n--;
        regels.push(regel.slice(0, n));
        regel = regel.slice(n);
      }
    }
    regels.push(regel.trimEnd());
  }
  return regels;
}

/** Meetfunctie in punten voor een lettergrootte, los van een pagina. */
export function meter(grootte: number, vet = false) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${vet ? "bold " : ""}${grootte}px ${LETTER}`;
  return (tekst: string) => ctx.measureText(tekst).width;
}

/** Korte datum en tijd voor kop- en voetteksten, in de notatie van de interfacetaal (nl: 28-10-2026, 14:05). */
export const datumTekst = (d = new Date()) =>
  formatDatum(d, { day: "numeric", month: "numeric", year: "numeric" });
export const tijdTekst = (d = new Date()) => formatTijd(d);
