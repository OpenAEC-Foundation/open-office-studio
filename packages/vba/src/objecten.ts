/** Ingebouwde VBA-objecten: Err, Debug, Collection en Scripting.Dictionary. */
import i18next from "i18next";
import { fout, foutTekstOfAlgemeen, VbaAfbreking, VbaFout } from "./fouten.ts";
import type { VbaRuntime } from "./interpreter.ts";
import { vergelijkTekst } from "./operatoren.ts";
import {
  Getal,
  LEEG,
  NIETS,
  Ontbrekend,
  VbaMatrix,
  VbaObject,
  maakGetal,
  naarGetal,
  naarTekst,
  type VbaWaarde,
} from "./waarden.ts";

const ontbreekt = (w: VbaWaarde | undefined) => w === undefined || w instanceof Ontbrekend;

export class ErrObject extends VbaObject {
  readonly typeNaam = "ErrObject";
  nummer = 0;
  beschrijving = "";
  bron = "";
  erl = 0;

  zet(e: VbaFout, erl: number) {
    this.nummer = e.nummer;
    this.beschrijving = e.beschrijving;
    this.bron = e.bron;
    this.erl = erl;
  }
  wis() {
    this.nummer = 0;
    this.beschrijving = "";
    this.bron = "";
  }
  override heeftStandaardwaarde() {
    return true;
  }
  override async standaard(): Promise<VbaWaarde> {
    return maakGetal("Long", this.nummer);
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "number":
        return maakGetal("Long", this.nummer);
      case "description":
        return this.beschrijving;
      case "source":
        return this.bron;
      case "helpfile":
        return "";
      case "helpcontext":
      case "lastdllerror":
        return maakGetal("Long", 0);
      case "clear":
        this.wis();
        return LEEG;
      case "raise": {
        if (ontbreekt(args[0])) throw fout(449);
        const n = Math.round(naarGetal(args[0], r.land));
        const beschrijving = ontbreekt(args[2]) ? foutTekstOfAlgemeen(n) : naarTekst(args[2], r.land);
        throw new VbaFout(n, beschrijving, ontbreekt(args[1]) ? "" : naarTekst(args[1], r.land));
      }
    }
    return super.lid(naam, args, rt);
  }
  parameterNamen(naam: string) {
    return naam === "raise" ? ["Number", "Source", "Description", "HelpFile", "HelpContext"] : undefined;
  }
  override async zetLid(naam: string, _args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const r = rt as VbaRuntime;
    if (naam === "number") this.nummer = Math.round(naarGetal(waarde, r.land));
    else if (naam === "description") this.beschrijving = naarTekst(waarde, r.land);
    else if (naam === "source") this.bron = naarTekst(waarde, r.land);
    else return super.zetLid(naam, _args, waarde, rt);
  }
}

export class DebugObject extends VbaObject {
  readonly typeNaam = "Debug";
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    if (naam === "print") {
      r.debugPrint(args.map((a) => r.printWaarde(a)).join(""), true);
      return LEEG;
    }
    if (naam === "assert") {
      if (!r.alsBool(args[0] ?? true)) {
        r.debugPrint(i18next.t("vba:objects.assertFailed"), true);
        throw new VbaAfbreking("end", "Debug.Assert");
      }
      return LEEG;
    }
    return super.lid(naam, args, rt);
  }
}

/** VBA.Collection: 1-gebaseerd, optionele tekstsleutels (hoofdletterongevoelig). */
export class Collectie extends VbaObject {
  readonly typeNaam = "Collection";
  items: { w: VbaWaarde; sleutel?: string }[] = [];

  private positie(index: VbaWaarde, rt: VbaRuntime): number {
    if (typeof index === "string") {
      const k = index.toLowerCase();
      const i = this.items.findIndex((x) => x.sleutel === k);
      if (i < 0) throw fout(5);
      return i;
    }
    const n = Math.round(naarGetal(index, rt.land));
    if (n < 1 || n > this.items.length) throw fout(9);
    return n - 1;
  }
  parameterNamen(naam: string) {
    if (naam === "add") return ["Item", "Key", "Before", "After"];
    if (naam === "item" || naam === "remove") return ["Index"];
    return undefined;
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "count":
        return maakGetal("Long", this.items.length);
      case "item":
        return this.standaard(args, rt);
      case "add": {
        const [item, sleutel, voor, na] = args;
        let s: string | undefined;
        if (!ontbreekt(sleutel)) {
          s = naarTekst(sleutel, r.land).toLowerCase();
          if (this.items.some((x) => x.sleutel === s)) throw fout(457);
        }
        const nieuw = { w: item, sleutel: s };
        if (!ontbreekt(voor)) this.items.splice(this.positie(voor, r), 0, nieuw);
        else if (!ontbreekt(na)) this.items.splice(this.positie(na, r) + 1, 0, nieuw);
        else this.items.push(nieuw);
        return LEEG;
      }
      case "remove":
        this.items.splice(this.positie(args[0], r), 1);
        return LEEG;
    }
    return super.lid(naam, args, rt);
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    if (!args.length) throw fout(450);
    return this.items[this.positie(args[0], rt as VbaRuntime)].w;
  }
  override async elementen(): Promise<VbaWaarde[]> {
    return this.items.map((x) => x.w);
  }
}

/** Scripting.Dictionary (alleen via `New`; CreateObject is afgeschermd). */
export class Woordenboek extends VbaObject {
  readonly typeNaam = "Dictionary";
  private sleutels: VbaWaarde[] = [];
  private waarden: VbaWaarde[] = [];
  vergelijk = 0; // 0 = binair, 1 = tekst

  private zoek(sleutel: VbaWaarde, rt: VbaRuntime): number {
    return this.sleutels.findIndex((k) => {
      if (typeof k === "string" && typeof sleutel === "string")
        return vergelijkTekst(k, sleutel, this.vergelijk === 1 ? "text" : "binary") === 0;
      if (k instanceof Getal && sleutel instanceof Getal) return k.w === sleutel.w;
      if (k instanceof VbaObject || sleutel instanceof VbaObject) return k === sleutel;
      try {
        return naarTekst(k, rt.land) === naarTekst(sleutel, rt.land) && typeof k === typeof sleutel;
      } catch {
        return false;
      }
    });
  }
  override async lid(naam: string, args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const r = rt as VbaRuntime;
    switch (naam) {
      case "count":
        return maakGetal("Long", this.sleutels.length);
      case "add":
        if (this.zoek(args[0], r) >= 0) throw fout(457);
        this.sleutels.push(args[0]);
        this.waarden.push(args[1] ?? LEEG);
        return LEEG;
      case "exists":
        return this.zoek(args[0], r) >= 0;
      case "item":
        return this.standaard(args, rt);
      case "keys":
        return new VbaMatrix([{ onder: 0, boven: this.sleutels.length - 1 }], [...this.sleutels], "Variant");
      case "items":
        return new VbaMatrix([{ onder: 0, boven: this.waarden.length - 1 }], [...this.waarden], "Variant");
      case "remove": {
        const i = this.zoek(args[0], r);
        if (i < 0) throw fout(32811, i18next.t("vba:objects.elementNotFound"));
        this.sleutels.splice(i, 1);
        this.waarden.splice(i, 1);
        return LEEG;
      }
      case "removeall":
        this.sleutels = [];
        this.waarden = [];
        return LEEG;
      case "comparemode":
        return maakGetal("Long", this.vergelijk);
    }
    return super.lid(naam, args, rt);
  }
  override async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    if (naam === "item") return this.zetStandaard(args, waarde, rt);
    if (naam === "comparemode") {
      this.vergelijk = Math.round(naarGetal(waarde));
      return;
    }
    if (naam === "key") {
      const i = this.zoek(args[0], rt as VbaRuntime);
      if (i < 0) throw fout(32811, i18next.t("vba:objects.elementNotFound"));
      this.sleutels[i] = waarde;
      return;
    }
    return super.zetLid(naam, args, waarde, rt);
  }
  override async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    const i = this.zoek(args[0], rt as VbaRuntime);
    if (i < 0) {
      // Zoals Scripting.Dictionary: lezen van een onbekende sleutel voegt hem toe.
      this.sleutels.push(args[0]);
      this.waarden.push(LEEG);
      return LEEG;
    }
    return this.waarden[i];
  }
  override async zetStandaard(args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    const i = this.zoek(args[0], rt as VbaRuntime);
    if (i < 0) {
      this.sleutels.push(args[0]);
      this.waarden.push(waarde);
    } else this.waarden[i] = waarde;
  }
  override async elementen(): Promise<VbaWaarde[]> {
    return [...this.sleutels];
  }
}

export { NIETS };
