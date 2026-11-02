/**
 * Gedeeld model voor afdrukvoorbeeld, afdrukken en PDF-export.
 *
 * Elke module levert pagina's met een vaste maat in punten (1/72 inch) en een
 * tekenfunctie. Voorbeeld, afdrukframe en PDF gebruiken precies dezelfde
 * pagina's, zodat de paginering overal gelijk is.
 */

/** Tekst die op een pagina is getekend, in punten vanaf linksboven. */
export interface TekstStuk {
  tekst: string;
  /** Begin van de basislijn. */
  x: number;
  y: number;
  /** Lettergrootte in punten. */
  grootte: number;
  /** Getekende breedte in punten. */
  breedte: number;
}

/** Klikbaar gebied op een pagina, in punten vanaf linksboven. */
export interface Koppeling {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  url: string;
}

export interface Tekening {
  canvas: HTMLCanvasElement;
  tekst: TekstStuk[];
  koppelingen?: Koppeling[];
}

export interface AfdrukPagina {
  /** Maat in punten. */
  breedte: number;
  hoogte: number;
  /** Korte omschrijving voor het voorbeeld, bijvoorbeeld "Blad Materialen, pagina 2". */
  label?: string;
  /** Tekent de pagina op de gevraagde resolutie (punten per inch: 72 = 1:1). */
  teken: (dpi: number) => Promise<Tekening>;
}

export interface Bladwijzer {
  titel: string;
  /** 0-gebaseerde pagina. */
  pagina: number;
  /** Hoogte op de pagina in punten vanaf boven. */
  y?: number;
  /** Kopniveau, 1-gebaseerd (Kop 1 = 1); voor geneste PDF-bladwijzers. */
  niveau?: number;
}

export interface AfdrukDocument {
  titel: string;
  paginas: AfdrukPagina[];
  bladwijzers?: Bladwijzer[];
  /** Mededelingen over wat niet (volledig) wordt afgedrukt. */
  meldingen?: string[];
}

export type Stand = "staand" | "liggend";

/** Papierformaten in millimeters (staand). */
export const PAPIER = {
  A3: { naam: "A3", breedte: 297, hoogte: 420, xlsx: 8 },
  A4: { naam: "A4", breedte: 210, hoogte: 297, xlsx: 9 },
  A5: { naam: "A5", breedte: 148, hoogte: 210, xlsx: 11 },
  Letter: { naam: "Letter", breedte: 215.9, hoogte: 279.4, xlsx: 1 },
  Legal: { naam: "Legal", breedte: 215.9, hoogte: 355.6, xlsx: 5 },
} as const;
export type Papier = keyof typeof PAPIER;

export const MM_PER_PT = 25.4 / 72;
export const mmNaarPt = (mm: number) => mm / MM_PER_PT;

/** Paginamaat in punten voor een papierformaat en stand. */
export function papierMaat(papier: Papier, stand: Stand) {
  const p = PAPIER[papier];
  const b = mmNaarPt(p.breedte);
  const h = mmNaarPt(p.hoogte);
  return stand === "liggend"
    ? { breedte: h, hoogte: b }
    : { breedte: b, hoogte: h };
}

/** Papierformaat uit de paperSize-code van SpreadsheetML; onbekend wordt A4. */
export function papierUitXlsx(code: number | undefined): Papier {
  const gevonden = (Object.keys(PAPIER) as Papier[]).find(
    (p) => PAPIER[p].xlsx === code,
  );
  return gevonden ?? "A4";
}

/**
 * Ontleedt een paginabereik als "1-3, 5" (1-gebaseerd) tot 0-gebaseerde
 * indexen binnen `aantal`. Leeg betekent alle pagina's; null is ongeldig.
 */
export function ontleedBereik(bereik: string, aantal: number): number[] | null {
  const tekst = bereik.trim();
  if (!tekst) return Array.from({ length: aantal }, (_, i) => i);
  const uit: number[] = [];
  for (const deel of tekst.split(/[,;]/)) {
    const stuk = deel.trim();
    if (!stuk) continue;
    const m = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(stuk);
    if (!m) return null;
    const van = Number(m[1]);
    const tot = m[2] === undefined ? van : m[2] === "" ? aantal : Number(m[2]);
    if (van < 1 || tot < van) return null;
    for (let p = van; p <= Math.min(tot, aantal); p++) uit.push(p - 1);
  }
  return [...new Set(uit)];
}

/** Herhaalt de gekozen pagina's voor meerdere exemplaren (gesorteerd of per pagina). */
export function exemplaren(
  indexen: number[],
  aantal: number,
  sorteren: boolean,
): number[] {
  const n = Math.max(1, Math.min(99, Math.floor(aantal) || 1));
  if (sorteren) return Array.from({ length: n }, () => indexen).flat();
  return indexen.flatMap((i) => Array.from({ length: n }, () => i));
}
