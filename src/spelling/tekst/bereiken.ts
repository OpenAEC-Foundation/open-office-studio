import type { Alinea } from "./sessie";

/** Alleen de huidige editorversie vasthouden; scrollen verandert de posities niet. */
export class AlineaBereiken {
  private bron: object | null = null;
  private versie: unknown;
  private perVerhaal = new Map<
    string,
    Map<string, { tekst: string; bereik: [number, number] | null }>
  >();

  filter(
    bron: object,
    versie: unknown,
    zichtbaar: [number, number] | null,
    positie: (a: Alinea, eind: boolean) => number | null,
  ): (a: Alinea) => boolean {
    if (bron !== this.bron || versie !== this.versie) {
      this.bron = bron;
      this.versie = versie;
      this.perVerhaal.clear();
    }
    return (a) => {
      if (!zichtbaar) return true;
      let verhaal = this.perVerhaal.get(a.story);
      if (!verhaal) this.perVerhaal.set(a.story, (verhaal = new Map()));
      let item = verhaal.get(a.paraId);
      if (!item || item.tekst !== a.tekst) {
        const van = positie(a, false),
          tot = positie(a, true);
        item = {
          tekst: a.tekst,
          bereik:
            van !== null && tot !== null && tot >= van ? [van, tot] : null,
        };
        verhaal.set(a.paraId, item);
      }
      // Onbekende projectie: de bestaande controle per woord blijft beslissen.
      return (
        !item.bereik ||
        !(item.bereik[1] < zichtbaar[0] || item.bereik[0] > zichtbaar[1])
      );
    };
  }
}
