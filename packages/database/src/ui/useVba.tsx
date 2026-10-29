/**
 * React-koppeling van de VBA-sessie: toestemming (eenmaal per database),
 * uitvoervenster (Debug.Print), MsgBox/InputBox als echte dialogen,
 * DoCmd-acties naar de interface, Stop en foutmeldingen met regelnummer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { formatGetal } from "../../../../src/i18n/opmaak";
import type { HostGebeurtenis, HostWaarde } from "../../../vba/src/host.ts";
import type { VoerUitResultaat } from "../../../vba/src/protocol.ts";
import type { OntbrekendModus } from "../../../vba/src/extern-typen.ts";
import { Trans } from "react-i18next";
import { msgBoxOpbouw, type Dialogen } from "./Dialoog.tsx";
import { foutTekst, VbaSessie, vanHostWaarde, type VbaModule } from "./vba-sessie.ts";
import type { BedienbareWerkkopie } from "./werkkopie-sessie.ts";

export interface VbaActies {
  openFormulier(naam: string): void | Promise<void>;
  openRapport(naam: string): void;
  openQuery(naam: string): void;
  openTabel(naam: string): void;
  /** Sluit een formulier of rapport; zonder naam het actieve formulier. */
  sluit(soort: "formulier" | "rapport" | null, naam: string | null): void;
}

export interface Uitvoerregel {
  soort: "uitvoer" | "info" | "fout";
  tekst: string;
}

export interface VbaBediening {
  sessie: VbaSessie | null;
  uitvoer: Uitvoerregel[];
  bezig: string | null;
  /** Loopt er nu VBA (direct, zonder te wachten op een render)? */
  isBezig(): boolean;
  toegestaan: boolean;
  /** Vraagt (eenmalig) toestemming; false als de gebruiker weigert. */
  vraagToestemming(reden?: string): Promise<boolean>;
  voerUit(module: string, procedure: string, args?: HostWaarde[], opties?: { ontbrekend?: OntbrekendModus }): Promise<VoerUitResultaat | null>;
  stop(): void;
  wisUitvoer(): void;
  /** Wat de runtime doet bij ontbrekende onderdelen; onthouden per geopende database. */
  ontbrekend: OntbrekendModus;
  setOntbrekend(m: OntbrekendModus): void;
  /**
   * Voert een reeks uit (bv. “Uitvoeren wat werkt”) als één lopende taak: blokkeert
   * andere uitvoeringen en zet de host zo nodig in de modus “automatisch beantwoorden”
   * (MsgBox: eerste knop, InputBox: standaardwaarde) en “stil” (Debug.Print en
   * DoCmd-acties alleen vastleggen, niet in het directvenster of de interface).
   * Vraagt zelf geen toestemming; dat doet de aanroeper vooraf.
   */
  reeks<T>(label: string, host: { automatisch: boolean; stil: boolean }, actie: (s: VbaSessie) => Promise<T>): Promise<T | null>;
  /** Telt elke Stop; een reeks vergelijkt dit om tussen procedures te stoppen. */
  stopnummer(): number;
}

const tr = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`database:vbaSession.${sleutel}`, opties);

const ACCESS_RECORD: Record<number, string> = { 0: "vorige", 1: "volgende", 2: "eerste", 3: "laatste", 4: "naar", 5: "nieuw" };

export function useVba(
  werkkopie: BedienbareWerkkopie | null,
  modules: VbaModule[],
  dialogen: Dialogen,
  acties: VbaActies,
): VbaBediening {
  const [sessie, setSessie] = useState<VbaSessie | null>(null);
  const [uitvoer, setUitvoer] = useState<Uitvoerregel[]>([]);
  const [bezig, setBezig] = useState<string | null>(null);
  const [toegestaan, setToegestaan] = useState(false);
  const recent = useRef({ dialogen, acties, modules, sessie });
  recent.current = { dialogen, acties, modules, sessie };
  const loopt = useRef<string | null>(null);
  const toestemming = useRef(false);
  const [ontbrekend, setOntbrekendState] = useState<OntbrekendModus>("stoppen");
  const ontbrekendRef = useRef<OntbrekendModus>("stoppen");
  const hostModus = useRef({ automatisch: false, stil: false });
  const stops = useRef(0);
  const setOntbrekend = useCallback((m: OntbrekendModus) => {
    ontbrekendRef.current = m;
    setOntbrekendState(m);
  }, []);
  const voeg = useCallback((r: Uitvoerregel) => setUitvoer((u) => [...u.slice(-999), r]), []);

  useEffect(() => {
    setToegestaan(false);
    toestemming.current = false;
    ontbrekendRef.current = "stoppen";
    setOntbrekendState("stoppen");
    setUitvoer([]);
    setBezig(null);
    if (!werkkopie) {
      setSessie(null);
      return;
    }
    const s: VbaSessie = new VbaSessie(werkkopie, {
      msgBox: async (v) => (hostModus.current.automatisch ? msgBoxOpbouw(v.knoppen).lijst[0][0] : recent.current.dialogen.msgBox(v)),
      inputBox: async (v) =>
        hostModus.current.automatisch
          ? (v.standaard ?? "")
          : recent.current.dialogen.vraag({ titel: v.titel || "Open Database Studio", label: v.tekst, standaard: v.standaard }),
      debugPrint: (tekst) => {
        if (!hostModus.current.stil) voeg({ soort: "uitvoer", tekst });
      },
      // In een reeks worden DoCmd-acties alleen vastgelegd (door de client), niet in de interface uitgevoerd.
      gebeurtenis: async (g) => (hostModus.current.stil ? undefined : gebeurtenis(g, s)),
    });
    setSessie(s);
    return () => s.sluit();
  }, [werkkopie, voeg]);

  async function gebeurtenis(g: HostGebeurtenis, s: VbaSessie): Promise<HostWaarde | void> {
    const a = recent.current.acties;
    const tekst = (i: number) => {
      const w = vanHostWaarde(g.args[i] ?? null);
      return w === null ? null : String(w);
    };
    switch (g.soort) {
      case "OpenForm":
        if (!tekst(0)) throw new Error(tr("openFormWithoutName"));
        await a.openFormulier(tekst(0)!);
        return;
      case "OpenReport":
        if (!tekst(0)) throw new Error(tr("openReportWithoutName"));
        a.openRapport(tekst(0)!);
        return;
      case "OpenQuery":
        a.openQuery(tekst(0) ?? "");
        return;
      case "OpenTable":
        a.openTabel(tekst(0) ?? "");
        return;
      case "Close": {
        const type = vanHostWaarde(g.args[0] ?? null);
        a.sluit(type === 3 ? "rapport" : type === 2 ? "formulier" : null, tekst(1));
        return;
      }
      case "Requery":
      case "Refresh":
      case "RefreshRecord":
        if (s.formulieren.actief) await s.formulieren.roepAan({ soort: "formulier", naam: s.formulieren.actief }, "requery", []);
        return;
      case "GoToRecord": {
        const naam = tekst(1) || s.formulieren.actief;
        if (!naam) throw new Error(tr("goToRecordNoForm"));
        const record = Number(vanHostWaarde(g.args[2] ?? null) ?? 1);
        const offset = Number(vanHostWaarde(g.args[3] ?? null) ?? 1);
        await s.formulieren.roepAan({ soort: "formulier", naam }, "gotorecord", [ACCESS_RECORD[record] ?? "volgende", offset]);
        return;
      }
      case "Beep":
      case "Hourglass":
      case "Echo":
      case "Maximize":
      case "Minimize":
      case "Restore":
      case "RepaintObject":
      case "ShowToolbar":
      case "MoveSize":
      case "SelectObject":
        return;
      case "CancelEvent":
        voeg({ soort: "info", tekst: tr("cancelEvent") });
        return;
      case "Quit":
        voeg({ soort: "info", tekst: tr("quitIgnored") });
        return;
      default:
        throw new Error(tr("doCmdUnsupported", { action: g.soort }));
    }
  }

  const vraagToestemming = useCallback(
    async (reden?: string) => {
      if (toestemming.current) return true;
      const ja = await recent.current.dialogen.bevestig({
        titel: tr("permission.title"),
        tekst: (
          <>
            {reden && <p>{reden}</p>}
            <p>
              <Trans i18nKey="database:vbaSession.permission.intro" components={{ strong: <strong /> }} />
            </p>
            <ul>
              <li>{tr("permission.noFiles")}</li>
              <li>{tr("permission.noCom")}</li>
              <li>{tr("permission.timeLimit", { seconds: 30 })}</li>
            </ul>
            <p>{tr("permission.trust")}</p>
            <p className="muted">{tr("permission.once")}</p>
          </>
        ),
        ja: tr("permission.allow"),
        nee: tr("permission.deny"),
        standaardNee: true,
      });
      if (ja) {
        toestemming.current = true;
        setToegestaan(true);
      }
      return ja;
    },
    [],
  );

  const voerUit = useCallback(
    async (module: string, procedure: string, args: HostWaarde[] = [], opties: { ontbrekend?: OntbrekendModus } = {}) => {
      const s = recent.current.sessie;
      if (!s) return null;
      if (loopt.current) {
        voeg({ soort: "fout", tekst: tr("notStarted", { task: `${module}.${procedure}`, running: loopt.current }) });
        return null;
      }
      if (!(await vraagToestemming())) return null;
      loopt.current = `${module}.${procedure}`;
      setBezig(loopt.current);
      const modus = opties.ontbrekend ?? ontbrekendRef.current;
      voeg({
        soort: "info",
        tekst:
          modus === "stoppen"
            ? `▶ ${module}.${procedure}`
            : tr(modus === "fout" ? "startedReturnError" : "startedSkip", { task: `${module}.${procedure}` }),
      });
      try {
        const r = await s.voerUit(recent.current.modules, module, procedure, args, { ontbrekend: modus });
        for (const o of r.overgeslagen ?? []) voeg({ soort: "info", tekst: o.aantal > 1 ? `${o.melding} (${o.aantal}×)` : o.melding });
        if (r.ok) voeg({ soort: "info", tekst: tr("done", { count: r.stappen, steps: formatGetal(r.stappen) }) });
        else voeg({ soort: "fout", tekst: foutTekst(r) });
        return r;
      } catch (e) {
        voeg({ soort: "fout", tekst: e instanceof Error ? e.message : String(e) });
        return null;
      } finally {
        loopt.current = null;
        setBezig(null);
      }
    },
    [vraagToestemming, voeg],
  );

  const reeks = useCallback(
    async <T,>(label: string, host: { automatisch: boolean; stil: boolean }, actie: (s: VbaSessie) => Promise<T>): Promise<T | null> => {
      const s = recent.current.sessie;
      if (!s) return null;
      if (loopt.current) {
        voeg({ soort: "fout", tekst: tr("notStarted", { task: label, running: loopt.current }) });
        return null;
      }
      loopt.current = label;
      setBezig(label);
      hostModus.current = { ...host };
      try {
        return await actie(s);
      } finally {
        hostModus.current = { automatisch: false, stil: false };
        loopt.current = null;
        setBezig(null);
      }
    },
    [voeg],
  );

  return {
    sessie,
    ontbrekend,
    setOntbrekend,
    reeks,
    stopnummer: () => stops.current,
    uitvoer,
    bezig,
    isBezig: () => loopt.current !== null,
    toegestaan,
    vraagToestemming,
    voerUit,
    stop: () => {
      stops.current++;
      recent.current.sessie?.stop();
      voeg({ soort: "info", tekst: tr("stopped") });
    },
    wisUitvoer: () => setUitvoer([]),
  };
}
