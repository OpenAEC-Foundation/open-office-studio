/** Koppeling tussen bijlagen en de modules van de kantooromgeving. */
import i18next from "../../../src/i18n/config";
import { formatGetal } from "../../../src/i18n/opmaak";

export type KantoorModule = "docx" | "xlsx" | "pptx" | "database";

const MODULES: Record<string, KantoorModule> = {
  docx: "docx", docm: "docx", dotx: "docx", odt: "docx", ott: "docx", fodt: "docx", doc: "docx", rtf: "docx",
  xlsx: "xlsx", xlsm: "xlsx", xltx: "xlsx", ods: "xlsx", ots: "xlsx", fods: "xlsx", xls: "xlsx", csv: "xlsx",
  pptx: "pptx", pptm: "pptx", potx: "pptx", odp: "pptx", otp: "pptx", fodp: "pptx", ppt: "pptx",
  mdb: "database", accdb: "database",
};
/** Zonder conversieprogramma rechtstreeks te openen (ook in de browser). */
const DIRECT = new Set(["docx", "xlsx", "pptx", "mdb", "accdb"]);

export function extensie(naam: string) {
  const m = /\.([a-z0-9]+)$/i.exec(naam);
  return m ? m[1].toLowerCase() : "";
}

export function kantoorModule(naam: string): KantoorModule | null {
  return MODULES[extensie(naam)] ?? null;
}

export function kanDirectOpenen(naam: string) {
  return DIRECT.has(extensie(naam));
}

const MODULESLEUTEL: Record<KantoorModule, string> = {
  docx: "tekst",
  xlsx: "rekenblad",
  pptx: "presentatie",
  database: "database",
};

/** Naam van de module in de huidige taal (common:modules.*). */
export function moduleNaam(module: KantoorModule) {
  return i18next.t(`common:modules.${MODULESLEUTEL[module]}`);
}

export const INHOUDSTYPEN: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  zip: "application/zip",
  mdb: "application/x-msaccess",
  accdb: "application/x-msaccess",
};

export function inhoudstype(naam: string, bekend?: string) {
  if (bekend && bekend !== "application/octet-stream") return bekend;
  return INHOUDSTYPEN[extensie(naam)] ?? "application/octet-stream";
}

export function grootteTekst(bytes: number) {
  if (bytes < 1024) return `${formatGetal(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatGetal(Math.round(bytes / 1024))} kB`;
  return `${formatGetal(bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}
