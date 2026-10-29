/**
 * Kern van de VBA-worker, los van `self`, zodat hij ook in tests (met een
 * MessageChannel) draait. Geen DOM: alleen berichten.
 */
import i18next from "i18next";
import type { Werkkopie } from "../../database/src/werkkopie/contract.ts";
import { scanAfscherming } from "./afscherming.ts";
import { naarHost, vanHost } from "./conversie.ts";
import { VbaAfbreking, VbaFout, VbaParseerFout } from "./fouten.ts";
import type { FormulierHost, HostWaarde, VbaHost } from "./host.ts";
import { VbaRuntime } from "./interpreter.ts";
import { analyseerExternGeparst } from "./extern.ts";
import { ENGELS_VS, NEDERLANDS } from "./land.ts";
import type { HostVerzoek, LaadResultaat, NaarWorker, VanWorker, VbaFoutInfo, WorkerOpties } from "./protocol.ts";

export interface WorkerPoort {
  postMessage(bericht: unknown, overdracht?: Transferable[]): void;
  addEventListener(type: "message", luisteraar: (e: MessageEvent) => void): void;
}

export function foutInfo(e: unknown): VbaFoutInfo {
  if (e instanceof VbaFout)
    return { soort: "runtime", nummer: e.nummer, beschrijving: e.beschrijving, ...(e.positie ?? {}) };
  if (e instanceof VbaAfbreking) return { soort: "afbreking", reden: e.reden, beschrijving: e.message, ...(e.positie ?? {}) };
  if (e instanceof VbaParseerFout) return { soort: "parseer", beschrijving: e.kaleMelding, ...e.positie };
  return { soort: "intern", beschrijving: e instanceof Error ? e.message : String(e) };
}

/**
 * Start de worker op `poort`. De werkkopie komt binnen als MessagePort in het
 * start-bericht (overdracht) en wordt met `werkkopieVanPoort` tot een Werkkopie gemaakt.
 */
export function startVbaWorker(
  poort: WorkerPoort,
  werkkopieVanPoort?: (p: MessagePort) => Promise<Werkkopie>,
  /** Alleen voor een worker in hetzelfde proces (tests, proeven): breekt de runtime af bij beëindigen. */
  extra: {
    signaal?: AbortSignal;
    /** Zet de taal van de meldingen in deze worker (vba-worker.ts; niet in tests in hetzelfde proces). */
    zetTaal?: (taal: string) => Promise<void>;
  } = {},
) {
  let opties: WorkerOpties = { host: { msgBox: false, inputBox: false, gebeurtenis: false, formulieren: false } };
  let werkkopie: Werkkopie | undefined;
  let runtime: VbaRuntime | null = null;
  let volgendeHostId = 1;
  const wachtend = new Map<number, { klaar: (w: HostWaarde | null) => void; fout: (e: Error) => void }>();
  const stuur = (b: VanWorker) => poort.postMessage(b);

  const vraag = (verzoek: HostVerzoek) =>
    new Promise<HostWaarde | null>((klaar, fout) => {
      const id = volgendeHostId++;
      wachtend.set(id, { klaar, fout });
      stuur({ soort: "hostVerzoek", id, verzoek });
    });

  const maakHost = (): VbaHost => ({
    debugPrint: (tekst) => stuur({ soort: "debug", tekst }),
    msgBox: opties.host.msgBox ? async (verzoek) => Number(await vraag({ soort: "msgBox", verzoek })) : undefined,
    inputBox: opties.host.inputBox
      ? async (verzoek) => {
          const w = await vraag({ soort: "inputBox", verzoek });
          return w === null ? null : String(w);
        }
      : undefined,
    gebeurtenis: opties.host.gebeurtenis ? async (gebeurtenis) => (await vraag({ soort: "gebeurtenis", gebeurtenis })) ?? undefined : undefined,
  });

  const maakFormulieren = (): FormulierHost | undefined =>
    opties.host.formulieren
      ? {
          isGeopend: async (doel) => Boolean(await vraag({ soort: "formulier", actie: "isGeopend", doel })),
          lees: async (doel, eigenschap, args) => (await vraag({ soort: "formulier", actie: "lees", doel, eigenschap, args })) ?? null,
          zet: async (doel, eigenschap, waarde) => void (await vraag({ soort: "formulier", actie: "zet", doel, eigenschap, waarde })),
          roepAan: async (doel, methode, args) => (await vraag({ soort: "formulier", actie: "roepAan", doel, methode, args })) ?? null,
          heeftBesturing: async (doel, naam) => Boolean(await vraag({ soort: "formulier", actie: "heeftBesturing", doel, naam })),
        }
      : undefined;

  poort.addEventListener("message", async (e: MessageEvent) => {
    const b = e.data as NaarWorker;
    if (!b || typeof b !== "object") return;
    if (b.soort === "hostAntwoord") {
      const w = wachtend.get(b.id);
      if (!w) return;
      wachtend.delete(b.id);
      if (b.ok) w.klaar(b.waarde);
      else w.fout(new VbaAfbreking("intern", b.melding));
      return;
    }
    try {
      let resultaat: unknown;
      switch (b.soort) {
        case "start": {
          opties = b.opties;
          if (opties.taal && extra.zetTaal) await extra.zetTaal(opties.taal);
          const p = e.ports?.[0];
          if (b.metWerkkopie) {
            if (!p || !werkkopieVanPoort) throw new Error(i18next.t("vba:worker.workingCopyNotConnected"));
            werkkopie = await werkkopieVanPoort(p);
          }
          resultaat = true;
          break;
        }
        case "laad": {
          runtime = new VbaRuntime({
            werkkopie,
            host: maakHost(),
            formulieren: maakFormulieren(),
            stappenlimiet: opties.stappenlimiet,
            landinstelling: opties.landinstelling === "en-us" ? ENGELS_VS : NEDERLANDS,
            ontbrekend: opties.ontbrekend,
            signaal: extra.signaal,
            bijOvergeslagen: (onderdeel) => stuur({ soort: "overgeslagen", onderdeel: { ...onderdeel } }),
          });
          const fouten = runtime.laad(b.modules);
          const uit: LaadResultaat = {
            fouten: fouten.map(foutInfo),
            afscherming: [...runtime.modules.values()].flatMap((m) => scanAfscherming(m.ast)),
            procedures: runtime.procedures(),
          };
          resultaat = uit;
          break;
        }
        case "procedures":
          resultaat = runtime?.procedures() ?? [];
          break;
        case "voerUit": {
          if (!runtime) throw new Error(i18next.t("vba:worker.noModulesLoaded"));
          const u = await runtime.voerUit(b.module, b.procedure, b.argumenten.map(vanHost), {
            ontbrekend: b.ontbrekend,
            stappenlimiet: b.stappenlimiet,
          });
          resultaat = {
            ok: true,
            resultaat: naarHost(u.resultaat),
            argumenten: u.argumenten.map(naarHost),
            uitvoer: u.uitvoer,
            stappen: u.stappen,
            ...(u.overgeslagen.length ? { overgeslagen: u.overgeslagen } : {}),
          };
          break;
        }
        case "transactie": {
          if (!werkkopie) {
            resultaat = false;
            break;
          }
          try {
            await (b.actie === "begin" ? werkkopie.begin() : werkkopie.terugdraaien());
            resultaat = true;
          } catch {
            resultaat = false;
          }
          break;
        }
        case "analyseerExtern": {
          if (!runtime) throw new Error(i18next.t("vba:worker.noModulesLoaded"));
          resultaat = analyseerExternGeparst(
            [...runtime.modules.values()].map((m) => ({ naam: m.naam, soort: m.soort, ast: m.ast, parseerfout: m.fouten.length > 0 })),
            { verwijzingen: b.verwijzingen, gekoppeldeTabellen: b.gekoppeldeTabellen },
          );
          break;
        }
      }
      stuur({ soort: "antwoord", id: b.id, ok: true, resultaat });
    } catch (fout) {
      const overgeslagen = b.soort === "voerUit" && runtime?.overgeslagen.length ? { overgeslagen: runtime.overgeslagen } : {};
      stuur({ soort: "antwoord", id: b.id, ok: false, fout: foutInfo(fout), ...overgeslagen });
    }
  });
}
