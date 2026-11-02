/**
 * VbaClient: draait VBA in een eigen dedicated Worker. De hoofdthread blijft
 * vrij; `stop()` beëindigt de worker hard (ook midden in een oneindige lus).
 * Na stoppen of een tijdslimiet start de volgende aanroep een nieuwe worker en
 * worden de modules opnieuw geladen (modulevariabelen beginnen dan opnieuw).
 */
import type { FormulierHost, HostWaarde, VbaHost } from "./host.ts";
import type { ModuleBron } from "./interpreter.ts";
import type { HostVerzoek, LaadResultaat, NaarWorker, ProcedureInfo, VanWorker, VbaFoutInfo, VoerUitResultaat } from "./protocol.ts";
import type {
  ExterneAnalyse,
  GekoppeldeTabelInvoer,
  Hostgebeurtenis,
  OntbrekendModus,
  OvergeslagenOnderdeel,
  ProcedureAnalyse,
  UitvoerOpties,
  Uitvoering,
  UitvoeringStatus,
  VerwijzingInvoer,
  WatWerktOpties,
  WatWerktSamenvatting,
} from "./extern-typen.ts";

/** Wat de client van een worker gebruikt (Worker of een testvervanger). */
export interface WorkerAchtig {
  postMessage(bericht: unknown, overdracht?: Transferable[]): void;
  addEventListener(type: "message", luisteraar: (e: MessageEvent) => void): void;
  addEventListener(type: "error", luisteraar: (e: ErrorEvent) => void): void;
  terminate(): void;
}

export interface VbaClientOpties {
  /** Standaard: een module-Worker op vba-worker.ts. */
  maakWorker?: () => WorkerAchtig;
  /**
   * Levert per (her)start een verse MessagePort naar de werkkopie (koppel de
   * andere kant met `koppelWerkkopie` uit werkkopie-brug.ts). Zonder: geen database.
   */
  werkkopiePoort?: () => MessagePort | Promise<MessagePort>;
  /** Tijdslimiet per voerUit in ms (standaard 30 s); wachten op de host telt niet mee. */
  tijdslimiet?: number;
  stappenlimiet?: number;
  landinstelling?: "nl" | "en-us";
  /** Standaardmodus voor ontbrekende onderdelen (standaard "stoppen"); per aanroep te overschrijven. */
  ontbrekend?: OntbrekendModus;
  host?: VbaHost;
  formulieren?: FormulierHost;
}

type Wacht = { klaar: (w: unknown) => void; fout: (f: VbaFoutInfo) => void };

export class VbaClient {
  private worker: WorkerAchtig | null = null;
  private gestart: Promise<void> | null = null;
  private volgendeId = 1;
  private wachtend = new Map<number, Wacht>();
  private modules: ModuleBron[] | null = null;
  private uitvoer: string[] = [];
  private overgeslagen: OvergeslagenOnderdeel[] = [];
  private hostgebeurtenissen: Hostgebeurtenis[] = [];
  private lopend: { timer?: ReturnType<typeof setTimeout>; rest: number; ms?: number; begin: number; afbreken: (f: VbaFoutInfo) => void } | null = null;
  private hostBezig = 0;

  constructor(private readonly opties: VbaClientOpties = {}) {}

  private maakWorker(): WorkerAchtig {
    if (this.opties.maakWorker) return this.opties.maakWorker();
    return new Worker(new URL("./vba-worker.ts", import.meta.url), { type: "module", name: "vba" }) as unknown as WorkerAchtig;
  }

  private start(): Promise<void> {
    if (this.gestart) return this.gestart;
    const worker = (this.worker = this.maakWorker());
    worker.addEventListener("message", (e: MessageEvent) => void this.ontvang(worker, e.data as VanWorker));
    worker.addEventListener("error", (e: ErrorEvent) => {
      if (worker !== this.worker) return;
      this.beeindig({ soort: "intern", reden: "worker", beschrijving: `De VBA-worker is gestopt: ${e.message ?? "onbekende fout"}` });
    });
    this.gestart = (async () => {
      const poort = this.opties.werkkopiePoort ? await this.opties.werkkopiePoort() : undefined;
      const host = this.opties.host;
      await this.verzoek(
        {
          soort: "start",
          id: 0,
          metWerkkopie: !!poort,
          opties: {
            stappenlimiet: this.opties.stappenlimiet,
            landinstelling: this.opties.landinstelling,
            ontbrekend: this.opties.ontbrekend,
            host: {
              msgBox: !!host?.msgBox,
              inputBox: !!host?.inputBox,
              gebeurtenis: !!host?.gebeurtenis,
              formulieren: !!this.opties.formulieren,
            },
          },
        },
        poort ? [poort] : [],
      );
      if (this.modules) await this.verzoek({ soort: "laad", id: 0, modules: this.modules });
    })();
    this.gestart.catch(() => (this.gestart = null));
    return this.gestart;
  }

  private verzoek(bericht: NaarWorker, overdracht: Transferable[] = []): Promise<unknown> {
    const id = this.volgendeId++;
    return new Promise((klaar, fout) => {
      this.wachtend.set(id, { klaar, fout: (f) => fout(Object.assign(new Error(f.beschrijving), { info: f })) });
      this.worker!.postMessage({ ...bericht, id }, overdracht);
    });
  }

  private async ontvang(worker: WorkerAchtig, b: VanWorker) {
    if (worker !== this.worker) return;
    if (b.soort === "debug") {
      this.uitvoer.push(b.tekst);
      this.opties.host?.debugPrint?.(b.tekst);
      return;
    }
    if (b.soort === "overgeslagen") {
      this.overgeslagen.push(b.onderdeel);
      return;
    }
    if (b.soort === "antwoord") {
      const w = this.wachtend.get(b.id);
      if (!w) return;
      this.wachtend.delete(b.id);
      if (b.ok) w.klaar(b.resultaat);
      else {
        if (b.overgeslagen) this.overgeslagen = b.overgeslagen;
        w.fout(b.fout);
      }
      return;
    }
    // Verzoek van de worker aan de host; de tijdslimiet staat zolang stil.
    this.pauzeer();
    try {
      const waarde = await this.beantwoord(b.verzoek);
      if (worker === this.worker) worker.postMessage({ soort: "hostAntwoord", id: b.id, ok: true, waarde: waarde ?? null } satisfies NaarWorker);
    } catch (e) {
      if (worker === this.worker)
        worker.postMessage({ soort: "hostAntwoord", id: b.id, ok: false, melding: e instanceof Error ? e.message : String(e) } satisfies NaarWorker);
    } finally {
      this.hervat();
    }
  }

  private async beantwoord(v: HostVerzoek): Promise<HostWaarde | number | void | null> {
    const host = this.opties.host;
    const f = this.opties.formulieren;
    this.hostgebeurtenissen.push(
      v.soort === "gebeurtenis"
        ? { soort: "gebeurtenis", naam: v.gebeurtenis.soort, ...(typeof v.gebeurtenis.args[0] === "string" ? { doel: v.gebeurtenis.args[0] } : {}) }
        : v.soort === "formulier"
          ? { soort: "formulier", naam: v.actie, doel: v.doel.naam }
          : { soort: v.soort },
    );
    switch (v.soort) {
      case "msgBox":
        return host!.msgBox!(v.verzoek);
      case "inputBox":
        return host!.inputBox!(v.verzoek);
      case "gebeurtenis":
        return host!.gebeurtenis!(v.gebeurtenis);
      case "formulier":
        if (!f) throw new Error("Er is geen formulierhost gekoppeld.");
        switch (v.actie) {
          case "isGeopend":
            return f.isGeopend(v.doel);
          case "lees":
            return f.lees(v.doel, v.eigenschap, v.args);
          case "zet":
            return f.zet(v.doel, v.eigenschap, v.waarde);
          case "roepAan":
            return f.roepAan(v.doel, v.methode, v.args);
          case "heeftBesturing":
            return f.heeftBesturing ? f.heeftBesturing(v.doel, v.naam) : true;
        }
    }
  }

  private pauzeer() {
    this.hostBezig++;
    const l = this.lopend;
    if (l?.timer) {
      clearTimeout(l.timer);
      l.timer = undefined;
      l.rest -= Date.now() - l.begin;
    }
  }
  private hervat() {
    this.hostBezig--;
    const l = this.lopend;
    if (l && !this.hostBezig && !l.timer) this.zetTimer(l);
  }
  private zetTimer(l: NonNullable<VbaClient["lopend"]>) {
    l.begin = Date.now();
    l.timer = setTimeout(() => {
      const ms = l.ms ?? this.opties.tijdslimiet ?? 30_000;
      l.afbreken({ soort: "afbreking", reden: "tijdslimiet", beschrijving: `De tijdslimiet van ${ms / 1000} seconden is verstreken; de VBA-worker is gestopt.` });
    }, Math.max(0, l.rest));
  }

  /** Beëindigt de worker en laat alle lopende verzoeken met `fout` eindigen. */
  private beeindig(fout: VbaFoutInfo) {
    this.worker?.terminate();
    this.worker = null;
    this.gestart = null;
    const lijst = [...this.wachtend.values()];
    this.wachtend.clear();
    for (const w of lijst) w.fout(fout);
    if (this.lopend?.timer) clearTimeout(this.lopend.timer);
    this.lopend = null;
    this.hostBezig = 0;
  }

  /** Laadt modules (vervangt eerder geladen modules). */
  async laad(modules: ModuleBron[]): Promise<LaadResultaat> {
    const kopie = modules.map((m) => ({ naam: m.naam, bron: m.bron, soort: m.soort }));
    if (!this.gestart) this.modules = null; // een nieuwe start hoeft niets oud te laden
    await this.start();
    this.modules = kopie;
    return (await this.verzoek({ soort: "laad", id: 0, modules: kopie })) as LaadResultaat;
  }

  /** Publieke Subs/Functions zonder verplichte parameters (en gebeurtenisprocedures van formulieren). */
  async procedures(): Promise<ProcedureInfo[]> {
    await this.start();
    const alle = (await this.verzoek({ soort: "procedures", id: 0 })) as ProcedureInfo[];
    return alle.filter((p) => (p.publiek && p.zonderVerplichteParameters) || p.gebeurtenis);
  }

  /**
   * Voert een procedure uit. Fouten komen terug als `{ ok: false, fout }` met regelnummer.
   * `opties.ontbrekend` bepaalt wat er met ontbrekende of afgeschermde onderdelen gebeurt
   * (zie extern-typen.ts); de afscherming zelf is in elke modus gelijk.
   */
  async voerUit(module: string, procedure: string, argumenten: HostWaarde[] = [], opties: UitvoerOpties = {}): Promise<VoerUitResultaat> {
    try {
      await this.start();
    } catch (e) {
      return { ok: false, fout: (e as { info?: VbaFoutInfo }).info ?? { soort: "intern", beschrijving: String(e) }, uitvoer: [] };
    }
    this.uitvoer = [];
    this.overgeslagen = [];
    this.hostgebeurtenissen = [];
    const ms = opties.tijdslimiet ?? this.opties.tijdslimiet ?? 30_000;
    const extra = () => ({
      ...(this.overgeslagen.length ? { overgeslagen: this.overgeslagen } : {}),
      ...(this.hostgebeurtenissen.length ? { hostgebeurtenissen: this.hostgebeurtenissen } : {}),
    });
    return new Promise<VoerUitResultaat>((klaar) => {
      const l: NonNullable<VbaClient["lopend"]> = {
        rest: ms,
        ms,
        begin: Date.now(),
        afbreken: (fout) => {
          const uitvoer = this.uitvoer;
          const rest = extra();
          this.beeindig(fout);
          klaar({ ok: false, fout, uitvoer, ...rest });
        },
      };
      this.lopend = l;
      this.zetTimer(l);
      this.verzoek({
        soort: "voerUit",
        id: 0,
        module,
        procedure,
        argumenten,
        ...(opties.ontbrekend ? { ontbrekend: opties.ontbrekend } : {}),
        ...(opties.stappenlimiet ? { stappenlimiet: opties.stappenlimiet } : {}),
      }).then(
        (r) => {
          if (this.lopend === l) {
            clearTimeout(l.timer);
            this.lopend = null;
          }
          const u = r as Extract<VoerUitResultaat, { ok: true }>;
          if (u.overgeslagen) this.overgeslagen = u.overgeslagen;
          klaar({ ...u, ...extra() });
        },
        (e: { info?: VbaFoutInfo }) => {
          if (this.lopend === l) {
            clearTimeout(l.timer);
            this.lopend = null;
          }
          klaar({ ok: false, fout: e.info ?? { soort: "intern", beschrijving: String(e) }, uitvoer: this.uitvoer, ...extra() });
        },
      );
    });
  }

  /** Voert een procedure uit en legt het resultaat vast als `Uitvoering` (status, overgeslagen, fout, uitvoer, hostgebeurtenissen). */
  async voerUitVastgelegd(module: string, procedure: string, argumenten: HostWaarde[] = [], opties: UitvoerOpties = {}): Promise<Uitvoering> {
    const begin = Date.now();
    const r = await this.voerUit(module, procedure, argumenten, opties);
    return naarUitvoering(module, procedure, r, Date.now() - begin);
  }

  /**
   * Statische analyse van externe afhankelijkheden van de geladen modules
   * (verwijzingen, Declare, CreateObject, bestanden, gekoppelde tabellen …),
   * met aanroepgraaf en status per procedure. Voert niets uit.
   */
  async analyseerExtern(verwijzingen?: VerwijzingInvoer[], opties: { gekoppeldeTabellen?: GekoppeldeTabelInvoer[] } = {}): Promise<ExterneAnalyse> {
    await this.start();
    return (await this.verzoek({ soort: "analyseerExtern", id: 0, verwijzingen, gekoppeldeTabellen: opties.gekoppeldeTabellen })) as ExterneAnalyse;
  }

  private async transactie(actie: "begin" | "terugdraaien"): Promise<boolean> {
    try {
      await this.start();
      return (await this.verzoek({ soort: "transactie", id: 0, actie })) as boolean;
    } catch {
      return false;
    }
  }

  /**
   * Voert alle publieke Subs/Functions zonder verplichte parameters met status
   * `uitvoerbaar` (en met `metDeels` ook `deels`) na elkaar uit, elk met een
   * eigen tijds- en stappenlimiet en (standaard) in een transactie op de
   * werkkopie die daarna wordt teruggedraaid. Klassenmodules en
   * gebeurtenisprocedures worden niet uitgevoerd, formulier- en rapportmodules
   * alleen als er een formulierhost is.
   */
  async voerUitWatWerkt(opties: WatWerktOpties = {}): Promise<WatWerktSamenvatting> {
    const analyse = opties.analyse ?? (await this.analyseerExtern());
    const terugdraaien = opties.terugdraaien ?? true;
    const toegestaan = new Set(["uitvoerbaar", ...(opties.metDeels ? ["deels"] : [])]);
    const kandidaten: ProcedureAnalyse[] = [];
    const nietUitgevoerd: WatWerktSamenvatting["nietUitgevoerd"] = [];
    for (const p of analyse.procedures) {
      const reden =
        p.soort !== "sub" && p.soort !== "function"
          ? "eigenschapsprocedure"
          : p.moduleSoort === "klasse"
            ? "klassenmodule (vraagt een instantie)"
            : p.gebeurtenis
              ? "gebeurtenisprocedure"
              : p.moduleSoort === "formulier" && !this.opties.formulieren
                ? "formulier- of rapportmodule (vraagt een geopend formulier; er is geen formulierhost)"
              : !p.publiek
                ? "niet publiek"
                : !p.zonderVerplichteParameters
                  ? "heeft verplichte parameters"
                  : !toegestaan.has(p.status)
                    ? `status ${p.status}`
                    : opties.filter && !opties.filter(p)
                      ? "uitgefilterd"
                      : null;
      if (reden) nietUitgevoerd.push({ module: p.module, procedure: p.naam, reden });
      else kandidaten.push(p);
    }
    const uitvoeringen: Uitvoering[] = [];
    let teruggedraaid = true;
    for (const [i, p] of kandidaten.entries()) {
      let inTransactie = false;
      if (terugdraaien) {
        inTransactie = await this.transactie("begin");
        if (!inTransactie) {
          // Een transactie die bleef hangen (bv. na een tijdslimiet) eerst opruimen.
          await this.transactie("terugdraaien");
          inTransactie = await this.transactie("begin");
        }
        if (!inTransactie) teruggedraaid = false;
      }
      const u = await this.voerUitVastgelegd(p.module, p.naam, [], {
        ontbrekend: opties.ontbrekend,
        tijdslimiet: opties.tijdslimiet,
        stappenlimiet: opties.stappenlimiet,
      });
      if (inTransactie && !(await this.transactie("terugdraaien"))) teruggedraaid = false;
      uitvoeringen.push(u);
      opties.bijVoortgang?.(u, i, kandidaten.length);
    }
    const tel = (s: UitvoeringStatus) => uitvoeringen.filter((u) => u.status === s).length;
    return {
      kandidaten: kandidaten.length,
      uitgevoerd: uitvoeringen.length,
      geslaagd: tel("geslaagd"),
      fout: tel("fout"),
      tijdslimiet: tel("tijdslimiet"),
      gestopt: tel("gestopt"),
      metOvergeslagen: uitvoeringen.filter((u) => u.overgeslagen.length).length,
      teruggedraaid: !terugdraaien || teruggedraaid,
      uitvoeringen,
      nietUitgevoerd,
    };
  }

  /** Stopt de lopende uitvoering door de worker te beëindigen. */
  stop() {
    this.beeindig({ soort: "afbreking", reden: "gestopt", beschrijving: "De uitvoering is gestopt." });
  }

  /** Sluit de client definitief. */
  sluit() {
    this.stop();
    this.modules = null;
  }
}

/** Zet een `VoerUitResultaat` om in een vastgelegde `Uitvoering`. */
export function naarUitvoering(module: string, procedure: string, r: VoerUitResultaat, duurMs: number): Uitvoering {
  const basis = {
    module,
    procedure,
    overgeslagen: r.overgeslagen ?? [],
    uitvoer: r.uitvoer,
    hostgebeurtenissen: r.hostgebeurtenissen ?? [],
    duurMs,
  };
  if (r.ok) return { ...basis, status: "geslaagd", stappen: r.stappen };
  const f = r.fout;
  const status: UitvoeringStatus =
    f.reden === "tijdslimiet" || f.reden === "stappenlimiet" ? "tijdslimiet" : f.reden === "gestopt" || f.reden === "geannuleerd" ? "gestopt" : "fout";
  return {
    ...basis,
    status,
    fout: {
      soort: f.soort,
      ...(f.nummer !== undefined ? { nummer: f.nummer } : {}),
      omschrijving: f.beschrijving,
      ...(f.reden ? { reden: f.reden } : {}),
      ...(f.module ? { module: f.module } : {}),
      ...(f.procedure ? { procedure: f.procedure } : {}),
      ...(f.regel !== undefined ? { regel: f.regel } : {}),
    },
  };
}
