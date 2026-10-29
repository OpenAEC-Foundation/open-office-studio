/**
 * VBA-uitvoering voor één werkkopie: een `VbaClient` (eigen worker, afgeschermd)
 * met een poort naar de werkkopie, plus een register van geopende formulieren
 * dat `FormulierHost` implementeert (`Me`, `Me!veld`, `Forms!frm!ctl`).
 * Er wordt nooit iets automatisch uitgevoerd; alleen op verzoek van de gebruiker.
 */
import i18next from "i18next";
import { VbaClient } from "../../../vba/src/vba-client.ts";
import type { FormulierDoel, FormulierHost, HostWaarde, VbaHost } from "../../../vba/src/host.ts";
import type { LaadResultaat, ProcedureInfo, VoerUitResultaat } from "../../../vba/src/protocol.ts";
import type {
  ExterneAnalyse,
  GekoppeldeTabelInvoer,
  UitvoerOpties,
  VerwijzingInvoer,
  WatWerktOpties,
  WatWerktSamenvatting,
} from "../../../vba/src/extern-typen.ts";
import type { VbaModuleRecord, VbaModuleSoort, Waarde } from "../werkkopie/contract.ts";
import type { BedienbareWerkkopie } from "./werkkopie-sessie.ts";

export type { VbaModuleSoort };

const tr = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`database:vbaSession.${sleutel}`, opties);
export { moduleSoort } from "../werkkopie/modules.ts";

export interface VbaModule {
  naam: string;
  bron: string;
  soort: VbaModuleSoort;
  /** Uit het Access-origineel of in de werkkopie gemaakt. */
  herkomst: "access" | "eigen";
  /** Sinds de opbouw in de werkkopie gewijzigd (ISO-tijdstip), of null. */
  gewijzigd?: string | null;
}

/** Module zoals de werkkopie hem bewaart (`_openaec_modules`) naar de vorm van de interface. */
export function moduleUitRecord(r: VbaModuleRecord): VbaModule {
  return { naam: r.naam, bron: r.bron, soort: r.soort, herkomst: r.herkomst === "access" ? "access" : "eigen", gewijzigd: r.gewijzigd };
}

/** Controleert een nieuwe modulenaam; geeft een melding of null. */
export function controleerModulenaam(naam: string, bestaand: string[]): string | null {
  const n = naam.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n)) return tr("moduleName.invalid");
  if (n.length > 64) return tr("moduleName.tooLong", { max: 64 });
  if (bestaand.some((b) => b.toLowerCase() === n.toLowerCase())) return tr("moduleName.exists");
  return null;
}

/** Startbron voor een nieuwe module van de gegeven soort. */
export function nieuweModuleBron(naam: string, soort: VbaModuleSoort): string {
  if (soort === "formulier")
    return `Option Compare Database\nOption Explicit\n\nPrivate Sub Form_Load()\n    Debug.Print "${vbaTekst(tr("template.formLoaded"))} " & Me.Name\nEnd Sub\n`;
  if (soort === "klasse") return `Option Compare Database\nOption Explicit\n\nPrivate Sub Class_Initialize()\nEnd Sub\n`;
  return `Option Compare Database\nOption Explicit\n\nPublic Sub Test()\n    Debug.Print "${vbaTekst(tr("template.hello", { name: naam }))}"\nEnd Sub\n`;
}

/** Tekst veilig binnen een VBA-tekenreeks (dubbele aanhalingstekens verdubbelen). */
function vbaTekst(tekst: string): string {
  return tekst.replace(/"/g, '""');
}

export function naarHostWaarde(w: Waarde | undefined): HostWaarde {
  if (w === undefined || w === null) return null;
  if (w instanceof Uint8Array) return null;
  if (typeof w === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(w)) return { datum: w };
  return w;
}
export function vanHostWaarde(w: HostWaarde): Waarde {
  if (w === null) return null;
  if (Array.isArray(w)) return null;
  if (typeof w === "object") return "datum" in w ? w.datum : null;
  return w;
}

/** Wat een geopend formulier aan de VBA-runtime aanbiedt. */
export interface OpenFormulier {
  naam: string;
  lees(besturing: string | undefined, eigenschap: string, args: HostWaarde[]): HostWaarde | Promise<HostWaarde>;
  zet(besturing: string | undefined, eigenschap: string, waarde: HostWaarde): void | Promise<void>;
  roepAan(besturing: string | undefined, methode: string, args: HostWaarde[]): HostWaarde | Promise<HostWaarde>;
  heeftBesturing(naam: string): boolean;
}

export class FormulierRegister implements FormulierHost {
  private open = new Map<string, OpenFormulier>();
  actief: string | null = null;
  registreer(f: OpenFormulier) {
    this.open.set(f.naam.toLowerCase(), f);
    this.actief = f.naam;
    return () => {
      if (this.open.get(f.naam.toLowerCase()) === f) this.open.delete(f.naam.toLowerCase());
      if (this.actief === f.naam) this.actief = null;
    };
  }
  private zoek(doel: FormulierDoel): OpenFormulier {
    const naam = doel.naam || this.actief || "";
    const f = doel.soort === "formulier" ? this.open.get(naam.split("/")[0].toLowerCase()) : undefined;
    if (!f)
      throw new Error(
        doel.soort === "rapport"
          ? tr("reportNotOpen", { name: naam })
          : tr("formNotOpen", { name: naam }),
      );
    return f;
  }
  async isGeopend(doel: FormulierDoel) {
    return doel.soort === "formulier" && this.open.has(doel.naam.toLowerCase());
  }
  async lees(doel: FormulierDoel, eigenschap: string, args: HostWaarde[]): Promise<HostWaarde> {
    if (!doel.naam && eigenschap === "activeform") {
      if (!this.actief) throw new Error(tr("noActiveForm"));
      return this.actief;
    }
    if (!doel.naam && eigenschap === "activecontrol") return null;
    return this.zoek(doel).lees(doel.besturing, eigenschap, args);
  }
  async zet(doel: FormulierDoel, eigenschap: string, waarde: HostWaarde) {
    await this.zoek(doel).zet(doel.besturing, eigenschap, waarde);
  }
  async roepAan(doel: FormulierDoel, methode: string, args: HostWaarde[]): Promise<HostWaarde> {
    return this.zoek(doel).roepAan(doel.besturing, methode, args);
  }
  async heeftBesturing(doel: FormulierDoel, naam: string) {
    try {
      return this.zoek(doel).heeftBesturing(naam);
    } catch {
      return false;
    }
  }
}

export class VbaSessie {
  readonly formulieren = new FormulierRegister();
  private client: VbaClient;
  private geladen: string | null = null;
  private laadresultaat: LaadResultaat | null = null;

  constructor(
    werkkopie: BedienbareWerkkopie,
    host: VbaHost,
    readonly tijdslimiet = 30_000,
  ) {
    this.client = new VbaClient({
      werkkopiePoort: () => werkkopie.poort(),
      tijdslimiet,
      host,
      formulieren: this.formulieren,
    });
  }

  /** Laadt de modules opnieuw als ze sinds de vorige keer veranderd zijn. */
  async laad(modules: VbaModule[]): Promise<LaadResultaat> {
    const sleutel = JSON.stringify(modules.map((m) => [m.naam, m.soort, m.bron]));
    if (this.geladen === sleutel && this.laadresultaat) return this.laadresultaat;
    this.laadresultaat = await this.client.laad(modules.map((m) => ({ naam: m.naam, bron: m.bron, soort: m.soort })));
    this.geladen = sleutel;
    return this.laadresultaat;
  }

  async procedures(modules: VbaModule[]): Promise<{ procedures: ProcedureInfo[]; laad: LaadResultaat }> {
    const laad = await this.laad(modules);
    return { procedures: await this.client.procedures(), laad };
  }

  async voerUit(modules: VbaModule[], module: string, procedure: string, args: HostWaarde[] = [], opties: UitvoerOpties = {}): Promise<VoerUitResultaat> {
    await this.laad(modules);
    return this.client.voerUit(module, procedure, args, opties);
  }

  private analyse: { sleutel: string; resultaat: Promise<ExterneAnalyse> } | null = null;

  /** Statische analyse van externe afhankelijkheden (voert niets uit); bewaard zolang modules en invoer gelijk blijven. */
  async analyseerExtern(modules: VbaModule[], verwijzingen: VerwijzingInvoer[] | undefined, gekoppeldeTabellen: GekoppeldeTabelInvoer[]): Promise<ExterneAnalyse> {
    await this.laad(modules);
    const sleutel = JSON.stringify([this.geladen, verwijzingen ?? null, gekoppeldeTabellen]);
    if (this.analyse?.sleutel !== sleutel) {
      const resultaat = this.client.analyseerExtern(verwijzingen, { gekoppeldeTabellen });
      this.analyse = { sleutel, resultaat };
      resultaat.catch(() => {
        if (this.analyse?.resultaat === resultaat) this.analyse = null;
      });
    }
    return this.analyse.resultaat;
  }

  /** `voerUitWatWerkt` van de client op de geladen modules (zie extern-typen.ts). */
  async voerUitWatWerkt(modules: VbaModule[], opties: WatWerktOpties): Promise<WatWerktSamenvatting> {
    await this.laad(modules);
    return this.client.voerUitWatWerkt(opties);
  }

  /** Stopt de lopende uitvoering; de worker start opnieuw bij de volgende aanroep. */
  stop() {
    this.client.stop();
  }

  sluit() {
    this.client.sluit();
  }
}

/** Foutmelding met module, procedure en regel. */
export function foutTekst(r: Extract<VoerUitResultaat, { ok: false }>): string {
  const f = r.fout;
  const plaats = [f.module, f.procedure].filter(Boolean).join(".");
  const beschrijving = f.beschrijving.replace(/\s+$/, "");
  let tekst = f.nummer ? tr("error.withNumber", { number: f.nummer, description: beschrijving }) : beschrijving;
  const soort =
    f.soort === "afbreking"
      ? f.reden === "afgeschermd"
        ? "sandboxed"
        : f.reden === "tijdslimiet"
          ? "timeout"
          : f.reden === "gestopt"
            ? "stopped"
            : "aborted"
      : f.soort === "parseer"
        ? "syntax"
        : null;
  if (soort) tekst = tr(`error.kind.${soort}`, { text: tekst });
  if (plaats && f.regel) return tr("error.atPlaceLine", { text: tekst, place: plaats, line: f.regel });
  if (plaats) return tr("error.atPlace", { text: tekst, place: plaats });
  if (f.regel) return tr("error.atLine", { text: tekst, line: f.regel });
  return tekst;
}
