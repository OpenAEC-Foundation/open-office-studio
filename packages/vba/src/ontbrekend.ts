/**
 * Doorgaan zonder ontbrekende onderdelen (runtime-optie `ontbrekend`).
 *
 * De afscherming zelf verandert niet: een geweigerd onderdeel wordt nooit
 * uitgevoerd. Alleen wat er ná de weigering gebeurt verschilt per modus:
 * stoppen (afbreking), fout (vangbare VBA-fout) of overslaan (standaardwaarde
 * of een plaatsvervangend object, met registratie).
 */
import i18next from "i18next";
import type { OvergeslagenCategorie } from "./extern-typen.ts";
import { foutTekstOfAlgemeen, VbaAfbreking, VbaFout } from "./fouten.ts";
import { LEEG, VbaObject, type VbaWaarde } from "./waarden.ts";

/** Wat de runtime hiervoor van de interpreter nodig heeft (geen import van interpreter.ts). */
interface Registreerder {
  registreerOvergeslagen(wat: string, categorie: OvergeslagenCategorie): void;
}

/**
 * Plaatsvervanger voor een object dat niet gemaakt kon worden (CreateObject,
 * GetObject, New Excel.Application, OpenDatabase …) in de modus `overslaan`.
 * Elke eigenschap of methode wordt overgeslagen en geregistreerd en levert
 * weer een plaatsvervanger; als waarde gebruikt is hij Empty.
 */
export class OntbrekendObject extends VbaObject {
  constructor(readonly typeNaam: string) {
    super();
  }
  override async lid(naam: string, _args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    void _args;
    (rt as Registreerder).registreerOvergeslagen(`${this.typeNaam}.${naam}`, "vervolg");
    return new OntbrekendObject(`${this.typeNaam}.${naam}`);
  }
  override async zetLid(naam: string, _args: VbaWaarde[], _w: VbaWaarde, rt: unknown): Promise<void> {
    void _args;
    void _w;
    (rt as Registreerder).registreerOvergeslagen(`${this.typeNaam}.${naam}`, "vervolg");
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    if (args.length) {
      (rt as Registreerder).registreerOvergeslagen(`${this.typeNaam}(…)`, "vervolg");
      return new OntbrekendObject(`${this.typeNaam}(…)`);
    }
    return LEEG;
  }
  override async zetStandaard(_args: VbaWaarde[], _w: VbaWaarde, rt: unknown): Promise<void> {
    void _args;
    void _w;
    (rt as Registreerder).registreerOvergeslagen(this.typeNaam, "vervolg");
  }
  override async bang(naam: string, rt: unknown): Promise<VbaWaarde> {
    return this.lid(naam, [], rt);
  }
  override async elementen(rt: unknown): Promise<VbaWaarde[]> {
    (rt as Registreerder).registreerOvergeslagen(`For Each over ${this.typeNaam}`, "vervolg");
    return [];
  }
  override heeftStandaardwaarde() {
    return true;
  }
  override isType(naam: string) {
    return naam.toLowerCase() === "object";
  }
}

/**
 * ProgID’s die CreateObject in-proces nabootst (alleen met een letterlijke
 * ProgID, zodat er vóór de weigering niets wordt geëvalueerd).
 */
export const NAGEBOOTSTE_PROGIDS = new Set(["scripting.dictionary"]);

/** Vangbare fout voor de modus `fout`. */
export function ontbrekendFout(nummer: number, wat: string): VbaFout {
  const tekst = foutTekstOfAlgemeen(nummer);
  return new VbaFout(nummer, i18next.t("vba:runtime.notAvailable", { text: tekst.replace(/\.$/, ""), what: wat }), wat);
}

/** Gegevens van een afgeschermde weigering, of null als het geen weigering is. */
export function afschermingVan(e: unknown) {
  return e instanceof VbaAfbreking && e.reden === "afgeschermd" && e.afscherming ? e.afscherming : null;
}
