/** Platte tekst lezen: codering en regeleinden herkennen. */
import {
  CODERINGNAAM,
  decodeerTekst,
  type Codering,
} from "../../packages/email/src/voorbeeld/codering";
import i18next from "../i18n/config";
import type { Blok, Tekstdocument } from "./tekstmodel";

export type Regeleinde = "CRLF" | "LF" | "CR" | "gemengd" | "geen";

export interface GelezenTekst {
  tekst: string;
  codering: Codering;
  coderingsnaam: string;
  regeleinde: Regeleinde;
}

/** Herkent UTF-16 zonder BOM aan veel nulbytes op even of oneven posities. */
function utf16ZonderBom(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const n = Math.min(bytes.length, 4096) & ~1;
  if (n < 4) return null;
  let even = 0,
    oneven = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) even++;
    if (bytes[i + 1] === 0) oneven++;
  }
  const helft = n / 2;
  if (oneven > helft * 0.4 && even < helft * 0.05) return "utf-16le";
  if (even > helft * 0.4 && oneven < helft * 0.05) return "utf-16be";
  return null;
}

export function regeleindeVan(tekst: string): Regeleinde {
  const crlf = (tekst.match(/\r\n/g) ?? []).length;
  const lf = (tekst.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (tekst.match(/\r(?!\n)/g) ?? []).length;
  const soorten = [crlf, lf, cr].filter(Boolean).length;
  if (!soorten) return "geen";
  if (soorten > 1) return "gemengd";
  return crlf ? "CRLF" : lf ? "LF" : "CR";
}

/** Decodeert tekstbytes met herkenning van BOM, UTF-8, UTF-16 en Windows-1252. */
export function leesTekst(bytes: Uint8Array): GelezenTekst {
  const zonderBom = utf16ZonderBom(bytes);
  let tekst: string;
  let codering: Codering;
  if (zonderBom && !(bytes[0] === 0xef && bytes[1] === 0xbb)) {
    codering = zonderBom;
    tekst = new TextDecoder(zonderBom).decode(
      bytes.subarray(0, bytes.length & ~1),
    );
  } else {
    const gelezen = decodeerTekst(bytes);
    tekst = gelezen.tekst;
    codering = gelezen.codering;
  }
  tekst = tekst.replace(/^\ufeff/, "");
  return {
    tekst,
    codering,
    coderingsnaam: CODERINGNAAM[codering],
    regeleinde: regeleindeVan(tekst),
  };
}

/** Sleutel in `import:sources.lineEndings` per soort regeleinde. */
const REGELEINDESLEUTEL: Record<Regeleinde, string> = {
  CRLF: "crlf",
  LF: "lf",
  CR: "cr",
  gemengd: "mixed",
  geen: "none",
};

/** Naam van het regeleinde in de interfacetaal. */
export function regeleindeNaam(regeleinde: Regeleinde) {
  return i18next.t(`import:sources.lineEndings.${REGELEINDESLEUTEL[regeleinde]}`);
}

/** Elke regel wordt een alinea; tabs blijven tabs. */
export function tekstNaarModel(tekst: string): Tekstdocument {
  const regels = tekst.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const blokken: Blok[] = regels.map((regel) => ({
    soort: "alinea",
    inhoud: regel ? [{ soort: "tekst", tekst: regel.replace(/\f/g, "") }] : [],
  }));
  return { blokken };
}
