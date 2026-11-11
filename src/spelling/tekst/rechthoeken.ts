interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_BEREIKEN = 256;
const MAX_RECHTHOEKEN = 512;
const kopie = (rects: readonly Rect[]): Rect[] =>
  rects.map(({ x, y, width, height }) => ({ x, y, width, height }));

/** Eén actuele geometrie, met begrensde opslag voor overlappende vensters. */
export class BereikRechthoeken {
  private geometrie: object | null = null;
  private dom: object | null = null;
  private bron: object | null = null;
  private versie = "";
  private cache = new Map<string, Rect[]>();
  private aantal = 0;

  get omvang() {
    return { bereiken: this.cache.size, rechthoeken: this.aantal };
  }

  wis() {
    this.cache.clear();
    this.aantal = 0;
    this.geometrie = this.dom = this.bron = null;
    this.versie = "";
  }

  bij(geometrie: object, dom: object, versie: string, bron: object) {
    if (
      this.geometrie === geometrie &&
      this.dom === dom &&
      this.versie === versie &&
      this.bron === bron
    )
      return;
    this.wis();
    this.geometrie = geometrie;
    this.dom = dom;
    this.versie = versie;
    this.bron = bron;
  }

  lees(van: number, tot: number, haal: () => readonly Rect[]): readonly Rect[] {
    // Zonder bevestigd frame blijft iedere lezing rechtstreeks naar de bron gaan.
    if (!this.geometrie || !Number.isFinite(van) || !Number.isFinite(tot))
      return haal();
    const sleutel = `${van}:${tot}`;
    const bekend = this.cache.get(sleutel);
    if (bekend) {
      this.cache.delete(sleutel);
      this.cache.set(sleutel, bekend);
      // Een afnemer of projectie mag de bewaarde broncoördinaten niet veranderen.
      return kopie(bekend);
    }
    const rects = haal();
    // Leeg/nog niet gebouwd is geen blijvend antwoord voor dit frame.
    if (
      !rects.length ||
      rects.length > MAX_RECHTHOEKEN ||
      rects.some(
        (r) =>
          ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
          r.width <= 0 ||
          r.height <= 0,
      )
    )
      return rects;
    while (
      this.cache.size >= MAX_BEREIKEN ||
      this.aantal + rects.length > MAX_RECHTHOEKEN
    ) {
      const oudste = this.cache.keys().next().value!;
      this.aantal -= this.cache.get(oudste)!.length;
      this.cache.delete(oudste);
    }
    this.cache.set(sleutel, kopie(rects));
    this.aantal += rects.length;
    return rects;
  }
}
