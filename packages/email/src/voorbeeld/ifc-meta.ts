/**
 * Streamende IFC/STEP-lezer (ISO 10303-21) voor de metadatakaart: kop
 * (FILE_DESCRIPTION, FILE_NAME, FILE_SCHEMA), telling van entiteiten per type
 * en de ruimtelijke structuur (project, terreinen, gebouwen, verdiepingen).
 * Geen geometrie: het 3D-voorbeeld komt later via de Rust-viewer.
 *
 * Gebruik: `const t = new IfcTeller(); t.voed(stuk); …; t.einde()` of
 * `analyseerIfc(bytes, { opVoortgang, signaal })` (Web Worker waar mogelijk).
 */
import ifcWorkerUrl from "./ifc-worker.ts?worker&url";
import { startWorker } from "../../../../src/startWorker";

export interface IfcKop {
  beschrijving: string[];
  implementatieniveau?: string;
  naam?: string;
  tijdstip?: string;
  auteurs: string[];
  organisaties: string[];
  preprocessor?: string;
  toepassing?: string;
  autorisatie?: string;
  schema: string[];
}

export interface IfcStructuurdeel {
  id: number;
  naam?: string;
  langeNaam?: string;
  /** Alleen bij verdiepingen (IfcBuildingStorey.Elevation). */
  hoogte?: number;
}

export interface IfcMeta {
  kop: IfcKop;
  /** Aantal per entiteittype (hoofdletters, bijv. IFCWALL), aflopend. */
  entiteiten: [string, number][];
  totaal: number;
  project?: IfcStructuurdeel;
  terreinen: IfcStructuurdeel[];
  gebouwen: IfcStructuurdeel[];
  verdiepingen: IfcStructuurdeel[];
  /** Eindigde het bestand netjes met END-ISO-10303-21? */
  volledig: boolean;
}

/**
 * Bouwdelen die de kaart altijd in deze volgorde toont (als ze voorkomen):
 * entiteittype en sleutel onder `email:preview.ifc.elements`.
 */
export const IFC_BOUWDELEN: [string, string][] = [
  ["IFCWALL", "wall"],
  ["IFCWALLSTANDARDCASE", "wallStandardCase"],
  ["IFCCURTAINWALL", "curtainWall"],
  ["IFCSLAB", "slab"],
  ["IFCROOF", "roof"],
  ["IFCCOLUMN", "column"],
  ["IFCBEAM", "beam"],
  ["IFCMEMBER", "member"],
  ["IFCPLATE", "plate"],
  ["IFCDOOR", "door"],
  ["IFCWINDOW", "window"],
  ["IFCSTAIR", "stair"],
  ["IFCRAMP", "ramp"],
  ["IFCRAILING", "railing"],
  ["IFCCOVERING", "covering"],
  ["IFCFOOTING", "footing"],
  ["IFCPILE", "pile"],
  ["IFCSPACE", "space"],
  ["IFCOPENINGELEMENT", "opening"],
  ["IFCFURNISHINGELEMENT", "furnishing"],
  ["IFCFLOWSEGMENT", "flowSegment"],
  ["IFCFLOWTERMINAL", "flowTerminal"],
  ["IFCBUILDINGELEMENTPROXY", "proxy"],
  ["IFCBUILDINGSTOREY", "storey"],
];

const MAX_STRUCTUUR = 500;

/** Decodeert een STEP-tekenreeks (zonder de omringende quotes). */
export function stepTekst(s: string): string {
  let uit = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && s[i + 1] === "'") { uit += "'"; i++; continue; }
    if (c !== "\\") { uit += c; continue; }
    const rest = s.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\\X2\\((?:[0-9A-F]{4})+)\\X0\\/i.exec(rest))) {
      for (let j = 0; j < m[1].length; j += 4) uit += String.fromCharCode(parseInt(m[1].slice(j, j + 4), 16));
      i += m[0].length - 1;
    } else if ((m = /^\\X4\\((?:[0-9A-F]{8})+)\\X0\\/i.exec(rest))) {
      for (let j = 0; j < m[1].length; j += 8) uit += String.fromCodePoint(parseInt(m[1].slice(j, j + 8), 16));
      i += m[0].length - 1;
    } else if ((m = /^\\X\\([0-9A-F]{2})/i.exec(rest))) {
      uit += String.fromCharCode(parseInt(m[1], 16));
      i += m[0].length - 1;
    } else if ((m = /^\\S\\(.)/.exec(rest))) {
      uit += String.fromCharCode(m[1].charCodeAt(0) + 128);
      i += m[0].length - 1;
    } else if ((m = /^\\P[A-I]\\/.exec(rest))) {
      i += m[0].length - 1; // codetabelwissel: negeren
    } else if (s[i + 1] === "\\") {
      uit += "\\";
      i++;
    } else uit += c;
  }
  return uit;
}

/** Splitst de argumenten op het bovenste niveau van `(...)`. Geeft ruwe tokens. */
export function stepArgumenten(lijst: string): string[] {
  const begin = lijst.indexOf("(");
  if (begin < 0) return [];
  const uit: string[] = [];
  let diepte = 0;
  let start = begin + 1;
  let inTekst = false;
  for (let i = begin; i < lijst.length; i++) {
    const c = lijst[i];
    if (inTekst) {
      if (c === "'") {
        if (lijst[i + 1] === "'") i++;
        else inTekst = false;
      }
      continue;
    }
    if (c === "'") inTekst = true;
    else if (c === "(") diepte++;
    else if (c === ")") {
      diepte--;
      if (diepte === 0) {
        uit.push(lijst.slice(start, i).trim());
        return uit;
      }
    } else if (c === "," && diepte === 1) {
      uit.push(lijst.slice(start, i).trim());
      start = i + 1;
    }
  }
  return uit;
}

/** Waarde van een token: tekst, getal of undefined ($, *, verwijzing). */
export function stepWaarde(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const t = token.trim();
  const m = /^(?:[A-Z0-9_]+\()?'([\s\S]*)'\)?$/.exec(t);
  if (m) return herstelUtf8(stepTekst(m[1]));
  return undefined;
}

let cp1252Terug: Map<number, number> | null = null;
/**
 * STEP schrijft officieel alleen ASCII met escapes, maar veel programma's
 * zetten er rauwe UTF-8 in. Die is als Windows-1252 gelezen; hier herstellen.
 */
export function herstelUtf8(s: string): string {
  if (!/[\u0080-\uffff]/.test(s)) return s;
  if (!cp1252Terug) {
    cp1252Terug = new Map();
    const d = new TextDecoder("windows-1252");
    for (let b = 0x80; b <= 0xff; b++) cp1252Terug.set(d.decode(new Uint8Array([b])).charCodeAt(0), b);
  }
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const b = c < 0x80 ? c : cp1252Terug.get(c);
    if (b === undefined) return s; // al echte Unicode (bijv. uit \\X2\\)
    bytes[i] = b;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}
function stepGetal(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const m = /^(?:[A-Z0-9_]+\()?(-?[0-9.]+(?:E[+-]?\d+)?)\)?$/i.exec(token.trim());
  return m ? parseFloat(m[1]) : undefined;
}
function stepTekstlijst(token: string | undefined): string[] {
  if (!token || !token.startsWith("(")) {
    const w = stepWaarde(token);
    return w ? [w] : [];
  }
  return stepArgumenten(token).map(stepWaarde).filter((x): x is string => !!x);
}

export class IfcTeller {
  private rest = "";
  private inTekst = false;
  private inCommentaar = false;
  private sectie: "voor" | "kop" | "data" | "na" = "voor";
  private telling = new Map<string, number>();
  private decoder = new TextDecoder("windows-1252");
  private volledig = false;
  readonly meta: IfcMeta = {
    kop: { beschrijving: [], auteurs: [], organisaties: [], schema: [] },
    entiteiten: [],
    totaal: 0,
    terreinen: [],
    gebouwen: [],
    verdiepingen: [],
    volledig: false,
  };

  /** Positie in `rest` vanaf waar verder gescand wordt. */
  private positie = 0;

  /** Verwerkt het volgende stuk bytes. */
  voed(stuk: Uint8Array) {
    const tekst = this.rest + this.decoder.decode(stuk, { stream: true });
    const n = tekst.length;
    let start = 0;
    let i = this.positie;
    let inTekst = this.inTekst;
    let inCommentaar = this.inCommentaar;
    while (i < n) {
      const c = tekst.charCodeAt(i);
      if (inCommentaar) {
        if (c === 42 /* * */) {
          if (i + 1 >= n) break; // wacht op het volgende stuk
          if (tekst.charCodeAt(i + 1) === 47 /* / */) { inCommentaar = false; i += 2; continue; }
        }
        i++;
        continue;
      }
      if (inTekst) {
        if (c === 39 /* ' */) {
          if (i + 1 >= n) break; // kan '' zijn
          if (tekst.charCodeAt(i + 1) === 39) { i += 2; continue; }
          inTekst = false;
        }
        i++;
        continue;
      }
      if (c === 39) inTekst = true;
      else if (c === 47 /* / */) {
        if (i + 1 >= n) break;
        if (tekst.charCodeAt(i + 1) === 42) { inCommentaar = true; i += 2; continue; }
      } else if (c === 59 /* ; */) {
        this.instructie(tekst.slice(start, i));
        start = i + 1;
      }
      i++;
    }
    this.rest = tekst.slice(start);
    this.positie = i - start;
    this.inTekst = inTekst;
    this.inCommentaar = inCommentaar;
  }

  einde(): IfcMeta {
    this.voed(new Uint8Array(0));
    const laatste = this.rest.trim();
    if (laatste) this.instructie(laatste);
    this.rest = "";
    const m = this.meta;
    m.entiteiten = [...this.telling].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    m.totaal = [...this.telling.values()].reduce((a, b) => a + b, 0);
    m.verdiepingen.sort((a, b) => (a.hoogte ?? 0) - (b.hoogte ?? 0));
    m.volledig = this.volledig;
    return m;
  }

  private instructie(ruw: string) {
    const s = (ruw.includes("/*") ? ruw.replace(/\/\*[\s\S]*?\*\//g, "") : ruw).trim();
    if (!s) return;
    if (this.sectie === "voor") {
      if (s === "HEADER") this.sectie = "kop";
      return;
    }
    if (this.sectie === "kop") {
      if (s === "ENDSEC") { this.sectie = "na"; return; }
      this.kopregel(s);
      return;
    }
    if (s === "DATA") { this.sectie = "data"; return; }
    if (s === "ENDSEC") { this.sectie = "na"; return; }
    if (s === "END-ISO-10303-21") { this.volledig = true; return; }
    if (this.sectie !== "data" || s.charCodeAt(0) !== 35 /* # */) return;
    const m = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)/.exec(s);
    if (!m) return;
    const type = m[2].toUpperCase();
    this.telling.set(type, (this.telling.get(type) ?? 0) + 1);
    if (type === "IFCPROJECT" || type === "IFCSITE" || type === "IFCBUILDING" || type === "IFCBUILDINGSTOREY") {
      const args = stepArgumenten(s.slice(m[0].length));
      const deel: IfcStructuurdeel = { id: +m[1], naam: stepWaarde(args[2]) };
      if (type === "IFCPROJECT") {
        deel.langeNaam = stepWaarde(args[5]);
        this.meta.project ??= deel;
        return;
      }
      deel.langeNaam = stepWaarde(args[7]);
      const lijst = type === "IFCSITE" ? this.meta.terreinen : type === "IFCBUILDING" ? this.meta.gebouwen : this.meta.verdiepingen;
      if (type === "IFCBUILDINGSTOREY") deel.hoogte = stepGetal(args[9]);
      if (lijst.length < MAX_STRUCTUUR) lijst.push(deel);
    }
  }

  private kopregel(s: string) {
    const m = /^([A-Z_]+)\s*\(/.exec(s);
    if (!m) return;
    const args = stepArgumenten(s);
    const kop = this.meta.kop;
    if (m[1] === "FILE_DESCRIPTION") {
      kop.beschrijving = stepTekstlijst(args[0]);
      kop.implementatieniveau = stepWaarde(args[1]);
    } else if (m[1] === "FILE_NAME") {
      kop.naam = stepWaarde(args[0]);
      kop.tijdstip = stepWaarde(args[1]);
      kop.auteurs = stepTekstlijst(args[2]);
      kop.organisaties = stepTekstlijst(args[3]);
      kop.preprocessor = stepWaarde(args[4]);
      kop.toepassing = stepWaarde(args[5]);
      kop.autorisatie = stepWaarde(args[6]);
    } else if (m[1] === "FILE_SCHEMA") {
      kop.schema = stepTekstlijst(args[0]);
    }
  }
}

export const IFC_STUK = 4 * 1024 * 1024;

/** Synchrone analyse (gebruikt door de worker en de tests). */
export function analyseerIfcSync(bytes: Uint8Array, opVoortgang?: (fractie: number) => void): IfcMeta {
  const t = new IfcTeller();
  for (let p = 0; p < bytes.length; p += IFC_STUK) {
    t.voed(bytes.subarray(p, Math.min(bytes.length, p + IFC_STUK)));
    opVoortgang?.(Math.min(1, (p + IFC_STUK) / bytes.length));
  }
  return t.einde();
}

export class Geannuleerd extends Error {
  constructor() {
    super("Geannuleerd");
    this.name = "Geannuleerd";
  }
}

/**
 * Analyseert een IFC-bestand in een Web Worker (of, zonder Worker, in stukken
 * op de hoofdthread). Afbreken via `signaal` beëindigt de worker direct.
 */
export function analyseerIfc(
  bytes: Uint8Array,
  opties: { opVoortgang?: (fractie: number) => void; signaal?: AbortSignal } = {},
): Promise<IfcMeta> {
  const { opVoortgang, signaal } = opties;
  if (signaal?.aborted) return Promise.reject(new Geannuleerd());
  if (typeof Worker === "undefined") return analyseerInStukken(bytes, opties);
  return new Promise<IfcMeta>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = startWorker(ifcWorkerUrl, { name: "ifc-voorbeeld" });
    } catch {
      analyseerInStukken(bytes, opties).then(resolve, reject);
      return;
    }
    const stop = () => {
      worker.terminate();
      reject(new Geannuleerd());
    };
    signaal?.addEventListener("abort", stop, { once: true });
    worker.onmessage = (e: MessageEvent<{ voortgang?: number; meta?: IfcMeta; fout?: string }>) => {
      if (e.data.voortgang !== undefined) opVoortgang?.(e.data.voortgang);
      if (e.data.meta || e.data.fout) {
        signaal?.removeEventListener("abort", stop);
        worker.terminate();
        if (e.data.meta) resolve(e.data.meta);
        else reject(new Error(e.data.fout));
      }
    };
    worker.onerror = (e) => {
      signaal?.removeEventListener("abort", stop);
      worker.terminate();
      // Worker kon niet starten (bijv. CSP): op de hoofdthread verder.
      e.preventDefault();
      analyseerInStukken(bytes, opties).then(resolve, reject);
    };
    // Kopie sturen: de bron bewaart zijn bytes in een cache die niet ontkoppeld mag worden.
    worker.postMessage({ bytes });
  });
}

async function analyseerInStukken(
  bytes: Uint8Array,
  { opVoortgang, signaal }: { opVoortgang?: (fractie: number) => void; signaal?: AbortSignal },
): Promise<IfcMeta> {
  const t = new IfcTeller();
  const stuk = 1024 * 1024;
  for (let p = 0; p < bytes.length; p += stuk) {
    if (signaal?.aborted) throw new Geannuleerd();
    t.voed(bytes.subarray(p, Math.min(bytes.length, p + stuk)));
    opVoortgang?.(Math.min(1, (p + stuk) / bytes.length));
    await new Promise((r) => setTimeout(r, 0));
  }
  return t.einde();
}
