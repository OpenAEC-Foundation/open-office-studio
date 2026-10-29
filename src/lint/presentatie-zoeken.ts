/**
 * Zoeken en vervangen in Presentatie (Ctrl+F, Ctrl+H; #19/#29). Alles via de publieke
 * editor-API: `readContent` (tekst per verhaal), `findText` (exact, hoofdlettergevoelig),
 * `selectText` (naar de dia en de treffer) en `applyEdits` (`replaceText`, één ongedaan-stap,
 * tegen de gelezen versie). Zonder hoofdlettergevoeligheid zoeken we eerst welke schrijfwijzen
 * van de zoektekst in de dia's staan en vragen we de engine elk daarvan exact op, zodat de
 * posities altijd die van de engine zijn.
 */
import type { PptxEditorApi } from "@betteroffice/pptx-react";

export type ZoekApi = Pick<PptxEditorApi, "readContent" | "findText" | "applyEdits">;

export interface Treffer {
  /** 1-gebaseerd diannummer (voor `selectText`). */
  dia: number;
  slideId: string;
  shapeId: string;
  storyId: string;
  start: number;
  end: number;
  tekst: string;
}

export interface Zoekuitkomst {
  versie: string;
  treffers: Treffer[];
}

/** Een melding voor de gebruiker (engine weigerde), geen programmeerfout. */
export class ZoekFout extends Error {}

const escape = (tekst: string) => tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Alle schrijfwijzen van `zoek` in de teksten, zonder op hoofdletters te letten. */
export function schrijfwijzen(teksten: readonly string[], zoek: string): string[] {
  if (!zoek) return [];
  const patroon = new RegExp(escape(zoek), "giu");
  const gevonden = new Set<string>();
  for (const tekst of teksten) for (const m of tekst.matchAll(patroon)) gevonden.add(m[0]);
  return [...gevonden];
}

/** Sorteert op dia, dan op volgorde van de verhalen in de dia, dan op positie; zonder overlap. */
export function ordenTreffers(treffers: readonly Treffer[], verhaalvolgorde: Map<string, number>): Treffer[] {
  const gesorteerd = [...treffers].sort(
    (a, b) =>
      a.dia - b.dia ||
      (verhaalvolgorde.get(`${a.slideId}/${a.storyId}`) ?? 0) -
        (verhaalvolgorde.get(`${b.slideId}/${b.storyId}`) ?? 0) ||
      a.start - b.start ||
      b.end - a.end,
  );
  const uit: Treffer[] = [];
  for (const t of gesorteerd) {
    const vorige = uit.at(-1);
    if (vorige && vorige.slideId === t.slideId && vorige.storyId === t.storyId && t.start < vorige.end) continue;
    uit.push(t);
  }
  return uit;
}

export async function zoekTreffers(
  api: ZoekApi,
  zoek: string,
  hoofdletters: boolean,
  pogingen = 3,
): Promise<Zoekuitkomst> {
  const inhoud = await api.readContent();
  if (!inhoud.ok) throw new ZoekFout(inhoud.failure.message);
  if (!zoek) return { versie: inhoud.version, treffers: [] };
  const dia = new Map(inhoud.slides.map((s, i) => [s.id, i + 1]));
  const volgorde = new Map(inhoud.stories.map((s, i) => [`${s.slideId}/${s.storyId}`, i]));
  const varianten = hoofdletters ? [zoek] : schrijfwijzen(inhoud.stories.map((s) => s.text), zoek);
  const treffers: Treffer[] = [];
  for (const tekst of varianten) {
    const r = await api.findText({ text: tekst, limit: 10_000 });
    if (!r.ok) throw new ZoekFout(r.failure.message);
    // Een nieuwere versie dan gelezen: de gebruiker typte tussendoor; opnieuw beginnen is veilig.
    if (r.version !== inhoud.version) {
      if (pogingen <= 1) throw new ZoekFout(r.version);
      return zoekTreffers(api, zoek, hoofdletters, pogingen - 1);
    }
    for (const { text, range } of r.matches)
      treffers.push({ ...range, dia: dia.get(range.slideId) ?? 0, tekst: text });
  }
  return { versie: inhoud.version, treffers: ordenTreffers(treffers, volgorde) };
}

/**
 * Index van de volgende (of vorige) treffer na `huidig`; rondgaand. Zonder huidige positie:
 * de eerste treffer vanaf `vanafDia` (de dia die nu in beeld is).
 */
export function volgendeIndex(
  treffers: readonly Treffer[],
  huidig: Pick<Treffer, "slideId" | "storyId" | "start" | "dia"> | null,
  terug: boolean,
  vanafDia = 1,
): number {
  if (!treffers.length) return -1;
  const n = treffers.length;
  if (!huidig) {
    const i = treffers.findIndex((t) => t.dia >= vanafDia);
    if (!terug) return i < 0 ? 0 : i;
    let j = n - 1;
    while (j >= 0 && treffers[j].dia >= vanafDia) j--;
    return j < 0 ? n - 1 : j;
  }
  const zelfde = treffers.findIndex(
    (t) => t.slideId === huidig.slideId && t.storyId === huidig.storyId && t.start === huidig.start,
  );
  if (zelfde >= 0) return (zelfde + (terug ? n - 1 : 1)) % n;
  // De huidige treffer bestaat niet meer (vervangen): de eerste erna.
  const na = treffers.findIndex(
    (t) => t.dia > huidig.dia || (t.dia === huidig.dia && t.storyId === huidig.storyId && t.start >= huidig.start),
  );
  if (!terug) return na < 0 ? 0 : na;
  return ((na < 0 ? n : na) - 1 + n) % n;
}

/** Vervangt de gegeven treffers in één transactie (één ongedaan-stap). */
export async function vervang(
  api: ZoekApi,
  uitkomst: Zoekuitkomst,
  treffers: readonly Treffer[],
  door: string,
): Promise<number> {
  if (!treffers.length) return 0;
  const r = await api.applyEdits({
    expectVersion: uitkomst.versie,
    history: "separate",
    steps: treffers.map((t) => ({
      op: "replaceText" as const,
      target: { kind: "range" as const, slideId: t.slideId, shapeId: t.shapeId, storyId: t.storyId, start: t.start, end: t.end },
      text: door,
    })),
  });
  if (!r.ok) throw new ZoekFout(r.failure.message);
  return treffers.length;
}
