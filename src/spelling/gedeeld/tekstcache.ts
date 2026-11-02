/**
 * Fouten per tekst (celwaarde, tekstvak, notitie), met een cache: dezelfde
 * tekst wordt maar één keer gesplitst en gecontroleerd. Bedoeld voor
 * Rekenblad en Presentatie, waar dezelfde waarden vaak terugkomen en alleen
 * het zichtbare deel telt. De woorden zelf cachet de Controleur al; deze laag
 * bespaart het splitsen en houdt de uitkomst synchroon leesbaar voor het
 * tekenen van de golflijnen.
 */
import type { Controleur, Fout } from "../controleur";
import { leesInstellingen } from "../../instellingen";
import type { SplitsOpties } from "../woorden";
import type { Taal } from "../talen";

const MAX = 20_000;

export const splitsOpties = (): SplitsOpties => {
  const s = leesInstellingen().spelling;
  return { hoofdletterwoordenNegeren: s.hoofdletterwoordenNegeren, cijferwoordenNegeren: s.cijferwoordenNegeren };
};

const sleutel = (taal: Taal, tekst: string) => `${taal}\u0000${tekst}`;

export class Tekstcache {
  private fouten = new Map<string, Fout[]>();
  private bezig = new Map<string, Promise<void>>();
  /** Telt op bij elke nieuwe uitkomst (voor het opnieuw tekenen). */
  stand = 0;
  private generatie = 0;

  constructor(private readonly controleur: () => Controleur) {}

  /** De fouten in `tekst`, of undefined als die nog niet gecontroleerd is. */
  lees(tekst: string, taal: Taal): Fout[] | undefined {
    if (taal === "geen" || !tekst) return [];
    return this.fouten.get(sleutel(taal, tekst));
  }

  /** Controleert de teksten die nog niet in de cache staan (één verzoek aan de worker). */
  async controleer(teksten: Iterable<string>, taal: Taal): Promise<boolean> {
    if (taal === "geen") return false;
    const nieuw: string[] = [];
    const wachten: Promise<void>[] = [];
    for (const t of new Set(teksten)) {
      if (!t) continue;
      const s = sleutel(taal, t);
      if (this.fouten.has(s)) continue;
      const lopend = this.bezig.get(s);
      if (lopend) wachten.push(lopend);
      else nieuw.push(t);
    }
    if (!nieuw.length) {
      await Promise.all(wachten);
      return false;
    }
    const generatie = this.generatie;
    const opdracht = this.controleur()
      .controleer(
        nieuw.map((tekst) => ({ tekst, taal })),
        splitsOpties(),
      )
      .then((uitkomst) => {
        // Intussen gewist (woord toegevoegd): deze uitkomst is verouderd.
        if (generatie !== this.generatie) return;
        if (this.fouten.size + nieuw.length > MAX) this.fouten.clear();
        nieuw.forEach((t, i) => this.fouten.set(sleutel(taal, t), uitkomst[i]));
        this.stand++;
      })
      .finally(() => nieuw.forEach((t) => this.bezig.delete(sleutel(taal, t))));
    nieuw.forEach((t) => this.bezig.set(sleutel(taal, t), opdracht));
    await Promise.all([opdracht, ...wachten]);
    return true;
  }

  /** Na een wijziging van de woordenlijst of de instellingen: alles opnieuw. */
  wis() {
    this.fouten.clear();
    this.bezig.clear();
    this.generatie++;
    this.stand++;
  }
}
