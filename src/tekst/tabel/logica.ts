/**
 * Rekenwerk voor de tabelindeling (#48), los van de engine zodat het getest
 * kan worden: kolombreedtes verdelen en passend maken, sorteren en tekst ↔
 * tabel. Breedtes zijn in twips (1/20 punt, 1/1440 inch).
 */

export const TWIPS_PER_CM = 1440 / 2.54;
export const TWIPS_PER_PX = 15;
/** Kleinste kolombreedte die we instellen (ongeveer 0,4 cm). */
export const MIN_KOLOM = 230;

export const cmNaarTwips = (cm: number) => Math.round(cm * TWIPS_PER_CM);
export const twipsNaarCm = (twips: number) => Math.round((twips / TWIPS_PER_CM) * 100) / 100;

/** Kolommen `van`..`tot` (inclusief) krijgen samen dezelfde breedte, gelijk verdeeld. */
/** `aantal` gelijke kolommen (hele twips) die samen precies `breedte` zijn. */
export function gelijkeKolommen(breedte: number, aantal: number): number[] {
  const n = Math.max(1, Math.floor(aantal));
  const totaal = Math.max(Math.round(breedte), MIN_KOLOM * n);
  const elk = Math.floor(totaal / n);
  return Array.from({ length: n }, (_, i) => elk + (i === n - 1 ? totaal - elk * n : 0));
}

/** Pagina uit de indeling van de engine (maten in pixels). */
export interface IndelingPagina {
  size?: { w: number; h: number };
  margins?: { left: number; right: number };
  fragments: { kind: string; blockId?: string; pmStart?: number; pmEnd?: number }[];
}

/**
 * Tekstbreedte (twips) van de pagina waarop documentpositie `positie` staat,
 * of null als geen pagina die positie bevat. Zo krijgt een nieuwe tabel de
 * breedte van zijn eigen sectie (A4, Letter, smalle marges, liggend …).
 */
export function tekstbreedteOpPagina(paginas: readonly IndelingPagina[], positie: number | null | undefined): number | null {
  if (positie === null || positie === undefined) return null;
  for (const p of paginas) {
    if (!p.size || !p.margins) continue;
    if (p.fragments.some((f) => f.pmStart !== undefined && f.pmEnd !== undefined && f.pmStart <= positie && positie <= f.pmEnd))
      return Math.round((p.size.w - p.margins.left - p.margins.right) * TWIPS_PER_PX);
  }
  return null;
}

export function verdeelKolommen(breedtes: readonly number[], van = 0, tot = breedtes.length - 1): number[] {
  const a = Math.max(0, Math.min(van, tot));
  const b = Math.min(breedtes.length - 1, Math.max(van, tot));
  if (b <= a) {
    // Eén kolom geselecteerd: Word verdeelt dan de hele tabel.
    return breedtes.length > 1 && (a !== 0 || b !== breedtes.length - 1)
      ? verdeelKolommen(breedtes, 0, breedtes.length - 1)
      : [...breedtes];
  }
  const som = breedtes.slice(a, b + 1).reduce((x, y) => x + y, 0);
  const aantal = b - a + 1;
  const elk = Math.floor(som / aantal);
  const rest = som - elk * aantal;
  return breedtes.map((w, i) => (i < a || i > b ? w : elk + (i === b ? rest : 0)));
}

/** Schaalt de kolommen evenredig naar `beschikbaar` twips (passend in het venster). */
export function passendInVenster(breedtes: readonly number[], beschikbaar: number): number[] {
  const som = breedtes.reduce((x, y) => x + Math.max(y, 1), 0);
  if (!breedtes.length || som <= 0 || beschikbaar <= 0) return [...breedtes];
  const geschaald = breedtes.map((w) => Math.max(MIN_KOLOM, Math.floor((Math.max(w, 1) / som) * beschikbaar)));
  const verschil = beschikbaar - geschaald.reduce((x, y) => x + y, 0);
  geschaald[geschaald.length - 1] = Math.max(MIN_KOLOM, geschaald[geschaald.length - 1] + verschil);
  return geschaald;
}

/**
 * Passend bij de inhoud, zoals AutoAanpassen in Word: elke kolom krijgt zijn
 * langste regel (`maximum`); past dat niet, dan krijgt elke kolom minstens zijn
 * langste woord (`minimum`) en wordt de rest naar verhouding verdeeld.
 * `marge` is de linker- plus rechtercelmarge per kolom.
 */
export function passendBijInhoud(
  minimum: readonly number[],
  maximum: readonly number[],
  beschikbaar: number,
  marge = 216,
): number[] {
  const min = minimum.map((w, i) => Math.max(MIN_KOLOM, Math.ceil(w + marge), Math.ceil(Math.min(w, maximum[i] ?? w) + marge)));
  const max = maximum.map((w, i) => Math.max(min[i], Math.ceil(w + marge)));
  const somMax = max.reduce((x, y) => x + y, 0);
  if (somMax <= beschikbaar || beschikbaar <= 0) return max;
  const somMin = min.reduce((x, y) => x + y, 0);
  if (somMin >= beschikbaar) return passendInVenster(min, beschikbaar);
  const ruimte = beschikbaar - somMin;
  const extra = max.map((w, i) => w - min[i]);
  const somExtra = extra.reduce((x, y) => x + y, 0) || 1;
  const uit = min.map((w, i) => w + Math.floor((extra[i] / somExtra) * ruimte));
  uit[uit.length - 1] += beschikbaar - uit.reduce((x, y) => x + y, 0);
  return uit;
}

/** Gemiddelde hoogte in twips voor ‘Rijen gelijk verdelen’. */
export function gemiddeldeRijhoogte(totaalPx: number, rijen: number) {
  if (rijen <= 0 || !(totaalPx > 0)) return null;
  return Math.max(1, Math.round((totaalPx / rijen) * TWIPS_PER_PX));
}

// ---------------------------------------------------------------------------
// Sorteren

export type Sorteersoort = "tekst" | "getal" | "datum";
export interface Sorteersleutel {
  kolom: number;
  soort: Sorteersoort;
  aflopend?: boolean;
}

/** Getal in Nederlandse of Engelse schrijfwijze, ook met valutateken of procent. */
export function leesGetal(tekst: string): number | null {
  const schoon = tekst.replace(/[\s€$£% ]/g, "");
  if (!/\d/.test(schoon)) return null;
  let t = schoon;
  const komma = t.lastIndexOf(","),
    punt = t.lastIndexOf(".");
  if (komma > punt) t = t.replace(/\./g, "").replace(",", ".");
  else if (punt > komma && komma >= 0) t = t.replace(/,/g, "");
  else if (komma < 0 && (t.match(/\./g)?.length ?? 0) > 1) t = t.replace(/\./g, "");
  const m = /^[-+]?\d*\.?\d+(e[-+]?\d+)?/i.exec(t);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Datum als dd-mm-jjjj, d/m/jj of jjjj-mm-dd; als tijdstip (ms) of null. */
export function leesDatum(tekst: string): number | null {
  const t = tekst.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
  if (m) {
    const jaar = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return Date.UTC(jaar, +m[2] - 1, +m[1]);
  }
  const maanden = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})/i.exec(t);
  if (m) {
    const maand = maanden.indexOf(m[2].toLowerCase().replace("maa", "mrt"));
    if (maand >= 0) return Date.UTC(+m[3], maand, +m[1]);
  }
  return null;
}

const vergelijker = new Intl.Collator("nl", { numeric: true, sensitivity: "base" });

/**
 * Volgorde van de rijen na sorteren (indexen in `rijen`). Lege of onleesbare
 * waarden komen bij oplopend sorteren achteraan, zoals in Word. De sortering is
 * stabiel. `kopregels` rijen bovenaan blijven staan.
 */
export function sorteerVolgorde(rijen: readonly (readonly string[])[], sleutels: readonly Sorteersleutel[], kopregels = 0): number[] {
  const vast = rijen.slice(0, kopregels).map((_, i) => i);
  const rest = rijen.map((_, i) => i).slice(kopregels);
  const waarde = (rij: number, s: Sorteersleutel) => {
    const tekst = (rijen[rij][s.kolom] ?? "").trim();
    if (s.soort === "getal") return leesGetal(tekst);
    if (s.soort === "datum") return leesDatum(tekst);
    return tekst || null;
  };
  rest.sort((a, b) => {
    for (const s of sleutels) {
      const x = waarde(a, s),
        y = waarde(b, s);
      if (x === null && y === null) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const v = typeof x === "number" && typeof y === "number" ? x - y : vergelijker.compare(String(x), String(y));
      if (v !== 0) return s.aflopend ? -v : v;
    }
    return a - b;
  });
  return [...vast, ...rest];
}

/** Raadt het sorteertype van een kolom: getal of datum als bijna alles dat is. */
export function raadSoort(waarden: readonly string[]): Sorteersoort {
  const gevuld = waarden.map((w) => w.trim()).filter(Boolean);
  if (!gevuld.length) return "tekst";
  if (gevuld.every((w) => leesDatum(w) !== null)) return "datum";
  if (gevuld.every((w) => leesGetal(w) !== null && /^[-+€$£\s\d.,%]+$/.test(w))) return "getal";
  return "tekst";
}

// ---------------------------------------------------------------------------
// Tekst ↔ tabel

export type Scheiding = "tab" | "puntkomma" | "komma" | "alinea" | { teken: string };

export function scheidingsteken(scheiding: Scheiding) {
  if (typeof scheiding === "object") return scheiding.teken || "\t";
  return { tab: "\t", puntkomma: ";", komma: ",", alinea: "\n" }[scheiding];
}

/** Raadt het scheidingsteken in geselecteerde alinea's. */
export function raadScheiding(alineas: readonly string[]): Scheiding {
  const telling = (teken: string) => alineas.filter((a) => a.includes(teken)).length;
  if (telling("\t") >= Math.max(1, alineas.length / 2)) return "tab";
  if (telling(";") >= Math.max(1, alineas.length / 2)) return "puntkomma";
  if (telling(",") === alineas.length && alineas.length > 0) return "komma";
  return alineas.length > 1 && telling("\t") === 0 ? "alinea" : "tab";
}

/**
 * Cellen uit alinea's. Bij ‘alinea’ wordt elke alinea één cel, gevuld per rij
 * van `kolommen` breed. Anders is elke alinea een rij; korte rijen worden
 * aangevuld tot het grootste aantal kolommen.
 */
export function tekstNaarCellen(alineas: readonly string[], scheiding: Scheiding, kolommen?: number): string[][] {
  if (!alineas.length) return [];
  if (scheiding === "alinea") {
    const breed = Math.max(1, kolommen ?? 1);
    const rijen: string[][] = [];
    for (let i = 0; i < alineas.length; i += breed) {
      const rij = alineas.slice(i, i + breed).map(String);
      while (rij.length < breed) rij.push("");
      rijen.push(rij);
    }
    return rijen;
  }
  const teken = scheidingsteken(scheiding);
  const rijen = alineas.map((a) => a.split(teken));
  const breed = kolommen ?? Math.max(...rijen.map((r) => r.length));
  return rijen.map((r) => {
    const rij = r.slice(0, breed);
    if (r.length > breed) rij[breed - 1] = r.slice(breed - 1).join(teken);
    while (rij.length < breed) rij.push("");
    return rij;
  });
}

/** Tabel naar alinea's: per rij de cellen met het scheidingsteken ertussen. */
export function cellenNaarTekst(rijen: readonly (readonly string[])[], scheiding: Scheiding): string[] {
  if (scheiding === "alinea") return rijen.flatMap((r) => r.map((c) => c));
  const teken = scheidingsteken(scheiding);
  return rijen.map((r) => r.map((c) => c.replace(/\n/g, " ")).join(teken));
}

// ---------------------------------------------------------------------------
// Celgegevens uit de engine (Yrs-tabelpayload)

export interface TabelCelPayload {
  story: string;
  tcPr?: Record<string, unknown>;
}
export interface TabelRijPayload {
  cells: TabelCelPayload[];
  trPr?: Record<string, unknown>;
}
export interface TabelPayload {
  grid?: number[];
  rows: TabelRijPayload[];
  tblPr?: Record<string, unknown>;
}

/** Rij-eigenschappen bijwerken; `cantSplit` leeft in `_originalFormatting`. */
export function rijMet(tr: Record<string, unknown> | undefined, wijziging: {
  kopregel?: boolean;
  nietAfbreken?: boolean;
  hoogte?: number | null;
  regel?: "auto" | "atLeast" | "exact";
}) {
  const uit: Record<string, unknown> = { ...(tr ?? {}) };
  const origineel: Record<string, unknown> = { ...((uit._originalFormatting as Record<string, unknown>) ?? {}) };
  if (wijziging.kopregel !== undefined) {
    uit.isHeader = wijziging.kopregel;
    if (wijziging.kopregel) origineel.header = true;
    else delete origineel.header;
  }
  if (wijziging.nietAfbreken !== undefined) {
    if (wijziging.nietAfbreken) origineel.cantSplit = true;
    else delete origineel.cantSplit;
    delete uit.cantSplit;
  }
  if (wijziging.hoogte !== undefined) {
    if (wijziging.hoogte === null || wijziging.regel === "auto") {
      delete uit.height;
      delete uit.heightRule;
      delete origineel.height;
      delete origineel.heightRule;
    } else {
      uit.height = Math.round(wijziging.hoogte);
      uit.heightRule = wijziging.regel ?? "atLeast";
      origineel.height = { type: "dxa", value: Math.round(wijziging.hoogte) };
      origineel.heightRule = wijziging.regel ?? "atLeast";
    }
  }
  if (Object.keys(origineel).length) uit._originalFormatting = origineel;
  else delete uit._originalFormatting;
  return uit;
}

export function rijNietAfbreken(tr: Record<string, unknown> | undefined) {
  const o = tr?._originalFormatting as Record<string, unknown> | undefined;
  return o?.cantSplit === true || tr?.cantSplit === true;
}

// ---------------------------------------------------------------------------
// Formule: som van de cellen boven, links, onder of rechts (zoals =SUM(ABOVE))

export type SomRichting = "boven" | "links" | "onder" | "rechts";

/**
 * Som van de getallen naast cel (`rij`, `kolom`) in een richting, zoals
 * Word `=SUM(ABOVE)`: aaneengesloten cellen met een getal; een cel zonder
 * getal (zoals een kopregel) sluit de reeks af, lege cellen direct naast de
 * cel worden overgeslagen. Null zonder getallen.
 */
export function somVan(teksten: readonly (readonly string[])[], rij: number, kolom: number, richting: SomRichting) {
  const [dr, dk] = richting === "boven" ? [-1, 0] : richting === "onder" ? [1, 0] : richting === "links" ? [0, -1] : [0, 1];
  let som = 0;
  let aantal = 0;
  for (let r = rij + dr, k = kolom + dk; r >= 0 && r < teksten.length && k >= 0 && k < (teksten[r]?.length ?? 0); r += dr, k += dk) {
    const tekst = teksten[r][k]?.trim() ?? "";
    if (!tekst) {
      if (aantal) break;
      continue;
    }
    const n = leesGetal(tekst);
    if (n === null) break;
    som += n;
    aantal++;
  }
  return aantal ? { som: Math.round(som * 1e9) / 1e9, aantal } : null;
}
