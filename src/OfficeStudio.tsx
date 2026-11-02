import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FolderOpen, Save, Home, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EmailActies } from "../packages/email/src/ui/EmailStudio";
import { kantoorModule } from "../packages/email/src/kantoor";
import type { NotitieActies } from "./notities/NotitiesStudio";
import type { Soort } from "./editors";
import {
  DatabaseStudio,
  type DatabaseBinaireUitvoer,
} from "../packages/database/src/DatabaseStudio";
import type { DatabaseUitvoer } from "../packages/database/src/uitvoer";
import "./office.css";
import { StartScherm, modules } from "./StartScherm";
import { toonDocumentInfo } from "./tekst/info/winkel";
import { VerlaatDialoog } from "./VerlaatDialoog";
import { OpslaanAlsDialoog } from "./OpslaanAlsDialoog";
import { AfdrukvoorbeeldHost } from "./afdrukken/AfdrukvoorbeeldHost";
import { vraagAfdrukvoorbeeld } from "./afdrukken/openen";
import {
  bewaarInFormaat,
  voorlaadExport,
  standaardKeuze,
  verliesmelding,
  verliesrapport,
  type OpslaanKeuze,
} from "./export/bewaar";
import { editorKoppeling } from "./export/koppeling";
import { controleerPakket } from "./pakketcontrole";
import { bereidOpenen } from "./import/openen";
import { RapportMelding } from "./import/RapportMelding";
import { useImportvragen } from "./import/Importvensters";
import { MACROUITVOER } from "./import/bron";
import versie from "../versie.json";
import openaecSymbool from "./stijl/openaec-symbol.svg";
import { ThemaKnop, useOfficeThema } from "./stijl/ThemaKnop";
import {
  bestandssoort,
  conversieStatus,
  converteer,
  invoerformaten,
  uitvoerformaat,
} from "./formaten";
import { opslagMelding } from "./documentOpslaan";
import { useTabbladen } from "./useTabbladen";
import { naamloos, titel, vingerafdruk, type Tabblad } from "./tabbladen";
import { TabBalk, paneelId, tabId, tabbladIcoon } from "./TabBalk";
import { useTabSneltoetsen } from "./useTabSneltoetsen";
import { useVensters } from "./useVensters";
import { useSysteembestanden } from "./systeembestanden";
import { Werkruimtehulp } from "./werkruimte/Werkruimtehulp";
import { bijNieuwDocument } from "./werkruimte/gebeurtenissen";
import { Statusbalk } from "./status/Statusbalk";
import { leesInstellingen } from "./instellingen";
import { noteerBrowser } from "./recent";
import { useHerstel } from "./useHerstel";
import { neerzetMelding, useNeerzetten } from "./Neerzetzone";
import { VensterMenu, useVenstermenu } from "./VensterMenu";
import {
  bevestigFormaat,
  kiesBestanden,
  opslagplan,
  schrijfTerug,
  type Werkbestand,
} from "./werkbestand";
const Editor = lazy(() => import("./editors"));
const tauri = "__TAURI_INTERNALS__" in window;
/** Database-export via de native opslagdialoog; Rust staat alleen bekende exporttypen toe. */
async function bewaarDatabaseNatief(naam: string, bytes: Uint8Array) {
  const { invoke } = await import("@tauri-apps/api/core");
  const pad = await invoke<string | null>("bewaar_database_export", bytes, {
    headers: { "x-database-naam": encodeURIComponent(naam) },
  });
  return pad
    ? ({ status: "opgeslagen", pad } as const)
    : ({ status: "geannuleerd" } as const);
}
// In de browser vallen deze terug op de downloads van Database Studio zelf.
const bewaarDatabaseUitvoer: DatabaseUitvoer | undefined = tauri
  ? (naam, inhoud) =>
      bewaarDatabaseNatief(naam, new TextEncoder().encode(inhoud))
  : undefined;
const bewaarDatabaseBinair: DatabaseBinaireUitvoer | undefined = tauri
  ? (naam, inhoud) => bewaarDatabaseNatief(naam, inhoud)
  : undefined;
const NotitiesStudio = lazy(() => import("./notities/NotitiesStudio"));
const EmailStudio = lazy(() => import("../packages/email/src/ui/EmailStudio"));
const VerzendAlsBijlage = lazy(
  () => import("../packages/email/src/ui/VerzendAlsBijlage"),
);
class EditorGrens extends Component<{ children: ReactNode }, { fout: string }> {
  state = { fout: "" };
  static getDerivedStateFromError(e: Error) {
    return { fout: e.message };
  }
  render() {
    return this.state.fout ? (
      <EditorFout fout={this.state.fout} />
    ) : (
      this.props.children
    );
  }
}
function EditorFout({ fout }: { fout: string }) {
  const { t } = useTranslation("shell");
  return (
    <div role="alert" className="office-editorfout">
      {t("errors.editorFailed", { error: fout })}
    </div>
  );
}
export function OfficeStudio() {
  const { t } = useTranslation(["shell", "common"]);
  const { thema, wisselThema } = useOfficeThema();
  const [bezig, setBezig] = useState(false),
    [opslaanBezig, setOpslaanBezig] = useState(false),
    [databaseGereed, setDatabaseGereed] = useState(false),
    // Tabblad waarvoor het venster Opslaan als openstaat.
    [opslaanAls, setOpslaanAls] = useState<number | null>(null),
    [emailOngelezen, setEmailOngelezen] = useState<number | null>(null),
    [verzending, setVerzending] = useState<{
      naam: string;
      bytes: Uint8Array;
    } | null>(null),
    [verzendingOnverzonden, setVerzendingOnverzonden] = useState(false),
    // Bestand dat Database Studio moet openen (bijlage of bestandskoppeling).
    [databaseStart, setDatabaseStart] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null),
    bezigRef = useRef(false);
  const databaseOpenen = useRef<(() => void) | null>(null);
  const notitieActies = useRef<NotitieActies | null>(null);
  const emailActies = useRef<EmailActies | null>(null);
  const verzendActies = useRef<EmailActies | null>(null);
  const ongelezenGeteld = useRef(0);
  /** Laatste keuze uit Opslaan als, per documenttabblad. */
  const opslaanKeuzes = useRef(new Map<number, OpslaanKeuze>());
  /**
   * Wachtwoord waarmee het werkbestand van een tabblad versleuteld wordt
   * bewaard (null: bewust zonder wachtwoord gekozen); alleen in het
   * geheugen, nooit opgeslagen of gelogd.
   */
  const wachtwoorden = useRef(new Map<number, string | null>());
  const vorigeFocus = useRef<HTMLElement | null>(null);
  const laatsteFocus = useRef(new Map<number, HTMLElement>());

  const importvragen = useImportvragen();
  const tabs = useTabbladen({
    opslaan: (id) => opslaan(id),
    voorSluiten: (tabblad) => {
      if (tabblad.type === "module" && tabblad.module === "notities")
        notitieActies.current?.bewaren();
    },
  });
  const { toestand, actief, meld } = tabs;
  const meldActief = useCallback(
    (tekst: string) => meld(tekst, tabs.toestandRef.current.actief ?? undefined),
    [meld, tabs.toestandRef],
  );
  const actiefDocument = actief?.type === "document" ? actief : null;
  const documentGereed = !!actiefDocument?.gereed;
  useEffect(() => {
    // Opslaan mag niet afhangen van onderdelen die later van de server moeten komen.
    if (documentGereed) voorlaadExport();
  }, [documentGereed]);
  const actieveModule = actief?.type === "module" ? actief.module : null;
  const opStart = actief === null;
  const verlaatvraag = tabs.verlaatvraag !== null;

  const vensters = useVensters({
    tabs,
    voorOverdracht: (tabblad) => {
      if (tabblad.type === "module" && tabblad.module === "notities")
        notitieActies.current?.bewaren();
    },
  });

  const registreerNotities = useCallback((acties: NotitieActies | null) => {
    notitieActies.current = acties;
  }, []);
  const notitiesBewerkt = useCallback(
    (waarde: boolean) => tabs.moduleBewerkt("notities", waarde),
    [tabs.moduleBewerkt],
  );
  const emailBewerkt = useCallback(
    (waarde: boolean) => tabs.moduleBewerkt("email", waarde),
    [tabs.moduleBewerkt],
  );
  const registreerEmail = useCallback((acties: EmailActies | null) => {
    emailActies.current = acties;
  }, []);
  const registreerVerzending = useCallback((acties: EmailActies | null) => {
    verzendActies.current = acties;
  }, []);
  const databaseStartGelezen = useCallback(() => setDatabaseStart(null), []);
  const databaseBewerkt = useCallback(
    (waarde: boolean) => tabs.moduleBewerkt("database", waarde),
    [tabs.moduleBewerkt],
  );
  const registreerDatabaseOpenen = useCallback(
    (openen: (() => void) | null) => {
      databaseOpenen.current = openen;
      setDatabaseGereed(!!openen);
    },
    [],
  );

  const toonStart = () => tabs.verwerk({ type: "toonStart" });

  /** Openen: in een module de eigen invoer, anders het bestandsvenster. */
  function kiesBestand() {
    if (bezigRef.current) return;
    if (actieveModule === "notities") {
      notitieActies.current?.openen();
      return;
    }
    if (actieveModule === "database") {
      databaseOpenen.current?.();
      return;
    }
    kiesDocument();
  }

  /** Desktop: native kiezer, zodat Rust het pad onthoudt voor Ctrl+S. */
  function kiesDocument() {
    if (!tauri) {
      input.current?.click();
      return;
    }
    kiesBestanden(invoerformaten.split(",")).catch((e) =>
      meld(t("errors.openFailed", { error: String(e) })),
    );
  }

  // Een onverzonden bericht uit "Verzenden als bijlage" telt mee voor de sluitbeveiliging.
  const aantalGewijzigd =
    toestand.tabbladen.filter((t) => t.gewijzigd).length +
    (verzendingOnverzonden ? 1 : 0);
  const verzendingRef = useRef(verzendingOnverzonden);
  verzendingRef.current = verzendingOnverzonden;
  useEffect(() => {
    vensters.meldWijzigingen(aantalGewijzigd);
  }, [aantalGewijzigd]);
  useEffect(() => {
    const sluit = (e: BeforeUnloadEvent) => {
      notitieActies.current?.bewaren();
      if (tabs.gewijzigdeTabbladen().length || verzendingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", sluit);
    return () => window.removeEventListener("beforeunload", sluit);
  }, [tabs.gewijzigdeTabbladen]);

  /**
   * Slaat een tabblad op; waar als het daarna gesloten mag worden. Ctrl+S
   * schrijft terug naar het werkbestand; zonder werkbestand en zonder eerdere
   * keuze opent eerst Opslaan als (zie `werkbestand.ts`). `als`: de keuze komt
   * net uit Opslaan als.
   */
  async function opslaan(id = actief?.id, als = false): Promise<boolean> {
    const tabblad = tabs.toestandRef.current.tabbladen.find((t) => t.id === id);
    if (!tabblad) return false;
    if (tabblad.type === "module") {
      if (tabblad.module === "notities") notitieActies.current?.bewaren();
      // In Email Studio bewaart Opslaan het concept van de open opstelling.
      if (tabblad.module === "email") emailActies.current?.bewaren();
      return !tabs.isGewijzigd(tabblad);
    }
    const plan = als
      ? ({ route: "keuze" } as const)
      : opslagplan({
          soort: tabblad.soort,
          werkbestand: tabblad.werkbestand,
          heeftKeuze: opslaanKeuzes.current.has(tabblad.id),
        });
    if (plan.route === "opslaanAls") return vraagOpslaanAls(tabblad.id);
    // Een versleuteld origineel nooit stil onversleuteld terugschrijven.
    if (
      plan.route === "terugschrijven" &&
      tabblad.bron?.versleuteling &&
      !wachtwoorden.current.has(tabblad.id)
    )
      return vraagOpslaanAls(tabblad.id);
    const keuze = huidigeKeuze(tabblad);
    if (plan.route === "keuze" && keuze.route === "afdrukken") {
      // PDF zonder kantoorruntime: het afdrukvenster van de zichtbare editor.
      if (tabblad.id === tabs.toestandRef.current.actief)
        await drukAfNaarPdf(tabblad.soort, tabblad.id);
      return false;
    }
    const werkbestand = tabblad.werkbestand;
    // Terugschrijven als DOCM/XLSM/PPTM met het eigen VBA-project is verliesvrij.
    const verliesvrij =
      !!tabblad.bron?.macro &&
      MACROUITVOER.has(plan.route === "terugschrijven" ? plan.ext : "");
    if (
      plan.route === "terugschrijven" &&
      plan.bevestigen &&
      !verliesvrij &&
      werkbestand
    ) {
      const antwoord = await bevestigFormaat(
        werkbestand.naam,
        verliesmeldingVoor(tabblad, plan.ext),
      ).catch(() => "opslaan-als" as const);
      if (antwoord === "annuleren") return false;
      if (antwoord === "opslaan-als") return vraagOpslaanAls(tabblad.id);
      tabs.werkBij(tabblad.id, {
        werkbestand: { ...werkbestand, bevestigd: true },
      });
    }
    const serialiseer = tabs.serialiseerder(tabblad.id);
    const opslag = tabs.opslag(tabblad.id);
    if (!serialiseer || !opslag || bezigRef.current) return false;
    bezigRef.current = true;
    setBezig(true);
    setOpslaanBezig(true);
    let alsNodig = false;
    try {
      const resultaat = await opslag.opslaan(serialiseer, (bytes) =>
        plan.route === "terugschrijven" && werkbestand
          ? schrijfTerug(tabblad.soort, werkbestand, plan.ext, bytes, {
              bron: tabblad.bron,
              wachtwoord: wachtwoorden.current.get(tabblad.id) ?? undefined,
            })
          : bewaarInFormaat(
              tabblad.soort,
              bytes,
              keuze,
              werkbestand?.token,
              tabblad.bron,
            ),
      );
      if (resultaat.status === "mislukt") {
        meld(t("errors.saveFailed", { error: resultaat.fout }), tabblad.id);
        return false;
      }
      if (resultaat.status !== "afgerond") return false;
      const { uitkomst } = resultaat;
      meld(opslagMelding(uitkomst), tabblad.id);
      if (uitkomst.status === "opslaan-als") {
        alsNodig = true;
        return false;
      }
      if (
        uitkomst.status === "opgeslagen" &&
        uitkomst.werkbestand &&
        resultaat.actueel
      )
        tabs.werkBij(tabblad.id, {
          werkbestand: uitkomst.werkbestand,
          naam: uitkomst.werkbestand.naam,
        });
      if (resultaat.schoon) tabs.werkBij(tabblad.id, { gewijzigd: false });
      // In de browser is een aangevraagde download het beste dat we weten.
      return resultaat.schoon || uitkomst.status === "download";
    } finally {
      bezigRef.current = false;
      setBezig(false);
      setOpslaanBezig(false);
      if (alsNodig) void vraagOpslaanAls(tabblad.id);
    }
  }

  function verliesmeldingVoor(
    tabblad: Extract<Tabblad, { type: "document" }>,
    ext: string,
  ) {
    const formaat = uitvoerformaat(tabblad.soort, ext);
    return formaat
      ? verliesmelding(tabblad.bytes, tabblad.soort, formaat, "runtime")
      : null;
  }

  /** Opent Opslaan als en wacht tot het opslaan is afgerond of geannuleerd. */
  const opslaanAlsAntwoord = useRef<((ok: boolean) => void) | null>(null);
  function vraagOpslaanAls(id: number) {
    opslaanAlsAntwoord.current?.(false);
    return new Promise<boolean>((resolve) => {
      opslaanAlsAntwoord.current = resolve;
      if (!openOpslaanAls(id)) {
        opslaanAlsAntwoord.current = null;
        resolve(false);
      }
    });
  }
  function beantwoordOpslaanAls(ok: boolean) {
    const antwoord = opslaanAlsAntwoord.current;
    opslaanAlsAntwoord.current = null;
    antwoord?.(ok);
  }

  /** Laatste keuze uit Opslaan als; zonder keuze het formaat van het tabblad. */
  function huidigeKeuze(tabblad: Extract<Tabblad, { type: "document" }>) {
    return (
      opslaanKeuzes.current.get(tabblad.id) ??
      standaardKeuze(tabblad.soort, tabblad.naam, tabblad.exportFormaat)
    );
  }

  async function drukAfNaarPdf(soort: Soort, id: number) {
    try {
      const { drukAf } = await import("./export");
      await drukAf(soort);
    } catch (e) {
      meld(t("errors.printFailed", { error: String(e) }), id);
    }
  }

  function openOpslaanAls(id = actief?.id) {
    const tabblad = tabs.toestandRef.current.tabbladen.find((t) => t.id === id);
    if (tabblad?.type !== "document" || !tabblad.gereed || bezigRef.current)
      return false;
    vorigeFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // De dialoog leest het actieve blad en de huidige dia van de zichtbare editor.
    tabs.verwerk({ type: "activeer", id: tabblad.id });
    setOpslaanAls(tabblad.id);
    return true;
  }

  /** Ctrl+S: in een opstelling het concept bewaren, anders het actieve tabblad. */
  function opslaanToets() {
    if (verzending) {
      verzendActies.current?.bewaren();
      return;
    }
    void opslaan();
  }

  async function verzendAlsBijlage(id: number) {
    const tabblad = tabs.toestandRef.current.tabbladen.find((t) => t.id === id);
    const serialiseer = tabs.serialiseerder(id);
    if (tabblad?.type !== "document" || !serialiseer || bezigRef.current)
      return;
    await bezigMet(async () => {
      try {
        setVerzending({ naam: tabblad.naam, bytes: await serialiseer() });
      } catch (error) {
        meld(t("errors.sendAsAttachmentFailed", { error: String(error) }), id);
      }
    });
  }

  async function sluit(ids: number[]) {
    if (bezigRef.current) return;
    vorigeFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    await tabs.sluit(ids);
    for (const id of laatsteFocus.current.keys())
      if (!tabs.toestandRef.current.tabbladen.some((t) => t.id === id))
        laatsteFocus.current.delete(id);
    for (const id of wachtwoorden.current.keys())
      if (!tabs.toestandRef.current.tabbladen.some((t) => t.id === id))
        wachtwoorden.current.delete(id);
  }

  /** Activeert een tabblad en zet de focus terug waar die in dat tabblad was. */
  function wissel(id: number | null, focus = false) {
    tabs.verwerk(
      id === null ? { type: "toonStart" } : { type: "activeer", id },
    );
    if (focus) herstelFocus();
  }
  // Editors renderen hun invoerveld soms buiten het paneel (portal); daarom
  // onthouden we de focus per actief tabblad en halen die bij wisselen weg.
  const actiefId = toestand.actief;
  const actiefRef = useRef(actiefId);
  useEffect(() => {
    const vorige = actiefRef.current;
    actiefRef.current = actiefId;
    if (vorige === actiefId) return;
    const oud = vorige === null ? null : laatsteFocus.current.get(vorige);
    if (oud && document.activeElement === oud) oud.blur();
    if (!focusHerstellen.current) return;
    focusHerstellen.current = false;
    const element =
      actiefId === null ? null : laatsteFocus.current.get(actiefId);
    if (element?.isConnected) element.focus({ preventScroll: true });
    else document.getElementById(tabId(actiefId))?.focus();
  }, [actiefId]);
  useEffect(() => {
    const focus = (event: FocusEvent) => {
      const id = actiefRef.current;
      const doel = event.target;
      if (
        id === null ||
        !(doel instanceof HTMLElement) ||
        doel.closest(
          ".office-tabbalk, .office-header, .office-dialoogachtergrond",
        )
      )
        return;
      laatsteFocus.current.set(id, doel);
    };
    window.addEventListener("focusin", focus, true);
    return () => window.removeEventListener("focusin", focus, true);
  }, []);
  const focusHerstellen = useRef(false);
  function herstelFocus() {
    focusHerstellen.current = true;
  }

  // Bestanden op het venster slepen (browser; de desktopapp gaat via Rust).
  const neerzetzone = useNeerzetten({
    uit: verlaatvraag || opslaanAls !== null || importvragen.open,
    open: async (bestanden) => {
      for (const bestand of bestanden) {
        while (bezigRef.current) await new Promise((r) => setTimeout(r, 100));
        await openBestand(bestand);
      }
    },
  });

  // Venster sluiten: een vraag per gewijzigd document; venstermenu over alle vensters.
  useVenstermenu({
    tabs,
    activeer: (id) => wissel(id, true),
    sluitAlles: async () => {
      while (bezigRef.current) await new Promise((r) => setTimeout(r, 100));
      if (
        !(await tabs.sluit(tabs.toestandRef.current.tabbladen.map((t) => t.id)))
      )
        return false;
      if (!verzendingRef.current) return true;
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<boolean>("bevestig_verlaten", { aantal: 1 });
    },
  });

  const herstel = useHerstel({
    tabs,
    bezig: () => bezigRef.current,
    opslaanAls: (id) => void vraagOpslaanAls(id),
  });

  useTabSneltoetsen({
    uit:
      verlaatvraag || opslaanAls !== null || herstel.open || importvragen.open,
    actief,
    opStart,
    vorige: toestand.vorige,
    opslaan: opslaanToets,
    opslaanAls: () => openOpslaanAls(),
    openen: kiesBestand,
    sluit: () => actief && void sluit([actief.id]),
    verwerk: (actie) => {
      tabs.verwerk(actie);
      herstelFocus();
    },
    terug: () => toestand.vorige !== null && wissel(toestand.vorige, true),
  });

  // Nieuw tekstdocument vanuit een editor (Versies vergelijken, #57): eigen
  // tabblad, als gewijzigd gemarkeerd zodat het niet ongemerkt verdwijnt.
  const openDocumentRef = useRef<typeof openDocument | null>(null);
  useEffect(
    () =>
      bijNieuwDocument(({ naam, bytes }) => {
        openDocumentRef.current?.("docx", naam, bytes, { gewijzigd: true, exportFormaat: "docx" });
      }),
    [],
  );

  function openDocument(
    soort: Soort,
    naam: string,
    bytes: Uint8Array,
    extra: {
      vingerafdruk?: string;
      werkbestand?: Werkbestand | null;
      gewijzigd?: boolean;
      melding?: string;
      rapport?: import("./import/rapport").Rapport | null;
      bron?: import("./import/bron").Bronkenmerken | null;
      exportFormaat?: string;
    } = {},
  ) {
    return tabs.openDocument({ soort, naam, bytes, ...extra });
  }
  openDocumentRef.current = openDocument;

  async function bezigMet(taak: () => Promise<void>) {
    if (bezigRef.current) return;
    bezigRef.current = true;
    setBezig(true);
    try {
      await taak();
    } catch (e) {
      meld(String(e));
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  }

  const nieuw = (soort: Soort) =>
    bezigMet(async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}templates/nieuw.${soort}`);
      if (!r.ok) throw new Error(t("errors.templateUnavailable"));
      openDocument(
        soort,
        naamloos(tabs.toestandRef.current, soort),
        new Uint8Array(await r.arrayBuffer()),
        // Standaardformaat uit de instellingen (OOXML of ODF).
        { exportFormaat: leesInstellingen().opslagformaat[soort] },
      );
    });

  const voorbeeld = (soort: Soort) =>
    bezigMet(async () => {
      const module = modules.find((module) => module.soort === soort)!;
      const naam = `${module.voorbeeld}.${soort}`;
      const resultaat = await fetch(`${import.meta.env.BASE_URL}voorbeelden/${naam}`);
      if (!resultaat.ok)
        throw new Error(t("errors.exampleFailed"));
      const bytes = new Uint8Array(await resultaat.arrayBuffer());
      controleerPakket(bytes, soort);
      openDocument(soort, naam, bytes, {
        vingerafdruk: await vingerafdruk(naam, bytes),
      });
    });

  async function openBestand(file: File) {
    if (!file.size || file.size > 100 * 1024 * 1024) {
      meld(t("errors.fileSize"));
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kantoorModule(file.name) === "database") {
      openDatabaseBestand(file.name, bytes, "bestand");
      return;
    }
    if (await importeer(file.name, bytes)) noteerBrowser(file.name);
  }

  /**
   * Opent bytes in een nieuw tabblad; niet-eigen formaten gaan via conversie.
   * Waar als er een nieuw tabblad is geopend (met het werkbestand, als dat er is).
   */
  async function importeer(
    naam: string,
    bytes: Uint8Array,
    werkbestand: Werkbestand | null = null,
  ) {
    const ext = naam.split(".").pop()?.toLowerCase();
    const soort = bestandssoort(ext ?? "");
    if (!ext || !soort) {
      meld(
        neerzetMelding(naam) ?? t("errors.unsupportedFormat", { name: naam }),
      );
      return false;
    }
    let geopend = false;
    await bezigMet(async () => {
      try {
        const vinger = await vingerafdruk(naam, bytes);
        // Hetzelfde bestand opnieuw openen springt naar het bestaande tabblad.
        if (tabs.openBestaand(vinger)) return;
        const resultaat = await bereidOpenen(naam, bytes, {
          converteer,
          runtimeBeschikbaar: async () =>
            tauri && (await conversieStatus()).gevonden,
          vraagCsv: importvragen.vraagCsv,
          vraagWachtwoord: importvragen.vraagWachtwoord,
        });
        if (!resultaat) return;
        geopend = true;
        const { id } = openDocument(
          resultaat.soort,
          resultaat.naam,
          resultaat.bytes,
          {
            werkbestand,
            vingerafdruk: vinger,
            gewijzigd: resultaat.gewijzigd,
            rapport: resultaat.rapport,
            bron: resultaat.bron ?? null,
          },
        );
        if (resultaat.exportFormaat)
          tabs.werkBij(id, { exportFormaat: resultaat.exportFormaat });
      } catch (error) {
        geopend = false;
        meld(t("errors.openFailed", { error: String(error) }));
      }
    });
    return geopend;
  }

  /** Bijlage uit Email Studio openen in een nieuw tabblad van de juiste module. */
  async function openUitEmail(naam: string, bytes: Uint8Array) {
    if (bezigRef.current) return;
    if (!bytes.length) {
      meld(t("errors.emptyAttachment"));
      return;
    }
    if (kantoorModule(naam) === "database") {
      openDatabaseBestand(naam, bytes, "bijlage");
      return;
    }
    await importeer(naam, bytes);
  }

  /** MDB/ACCDB in het Database-tabblad van dit venster (er is er hooguit één). */
  function openDatabaseBestand(
    naam: string,
    bytes: Uint8Array,
    wat: "bestand" | "bijlage",
  ) {
    const bestaand = tabs.toestandRef.current.tabbladen.find(
      (t) => t.type === "module" && t.module === "database",
    );
    if (bestaand && tabs.isGewijzigd(bestaand)) {
      tabs.verwerk({ type: "activeer", id: bestaand.id });
      meld(
        t(
          wat === "bijlage"
            ? "errors.databaseModifiedAttachment"
            : "errors.databaseModifiedFile",
        ),
        bestaand.id,
      );
      return;
    }
    tabs.openModule("database");
    // Database Studio opent het zodra het paneel klaarstaat (prop startbestand).
    setDatabaseStart(new File([new Uint8Array(bytes)], naam));
  }

  /**
   * Bestand van het besturingssysteem (bestandskoppeling, "Openen met", tweede
   * start): een nieuw tabblad, of het bestaande tabblad als hetzelfde bestand
   * al openstaat; MDB/ACCDB gaan naar het Database-tabblad.
   */
  async function openSysteembestand(
    naam: string,
    lees: () => Promise<Uint8Array>,
    werkbestand: Werkbestand | null,
  ) {
    // Wacht tot opslaan of een andere opening klaar is; niets valt weg.
    while (bezigRef.current) await new Promise((r) => setTimeout(r, 100));
    let bytes: Uint8Array;
    try {
      bytes = await lees();
    } catch (error) {
      meld(t("errors.openFileFailed", { name: naam, error: String(error) }));
      return false;
    }
    if (kantoorModule(naam) === "database") {
      // Database Studio werkt op een kopie; het pad is niet nodig.
      openDatabaseBestand(naam, bytes, "bestand");
      return false;
    }
    return (await importeer(naam, bytes, werkbestand)) && !!werkbestand;
  }
  useSysteembestanden(openSysteembestand, (token) => {
    if (tabs.activeerWerkbestand(token)) herstelFocus();
  });

  // Ongelezen e-mail voor de vaste ingang op Start (hooguit eens per minuut).
  const emailTabblad = toestand.tabbladen.some(
    (t) => t.type === "module" && t.module === "email",
  );
  useEffect(() => {
    if (!opStart || emailTabblad) return;
    if (Date.now() - ongelezenGeteld.current < 60_000) return;
    ongelezenGeteld.current = Date.now();
    void import("../packages/email/src/backend")
      .then(({ ongelezenInInbox }) => ongelezenInInbox())
      .then(setEmailOngelezen)
      .catch(() => setEmailOngelezen(null));
  }, [opStart, emailTabblad]);

  const module = modules.find((item) => item.soort === actiefDocument?.soort);
  const ModuleIcoon = actief && tabbladIcoon(actief);
  const melding = actief?.melding || tabs.melding;
  const vorigeTab = toestand.tabbladen.find((t) => t.id === toestand.vorige);
  const vorigDocument = vorigeTab?.type === "document" ? vorigeTab : null;
  const dialoogOpen =
    verlaatvraag || opslaanAls !== null || herstel.open || importvragen.open;
  const editorInactief =
    dialoogOpen || !!verzending || (bezig && !opslaanBezig);
  const opslaanTabblad = toestand.tabbladen.find((t) => t.id === opslaanAls);
  const opslaanDocument =
    opslaanTabblad?.type === "document" ? opslaanTabblad : null;

  function paneel(tabblad: Tabblad, inhoud: ReactNode, klasse = "") {
    const zichtbaar = tabblad.id === actief?.id;
    return (
      <div
        key={tabblad.id}
        id={paneelId(tabblad.id)}
        role="tabpanel"
        aria-labelledby={tabId(tabblad.id)}
        className={"office-tabpaneel " + klasse}
        hidden={!zichtbaar}
        inert={!zichtbaar || editorInactief}
      >
        {inhoud}
      </div>
    );
  }

  return (
    <>
      <div
        className="office"
        data-office-thema={thema}
        inert={dialoogOpen}
        data-module={actiefDocument?.soort ?? actieveModule ?? "start"}
      >
        <header className="office-header">
          <button
            className="office-merk"
            onClick={toonStart}
            title={t("header.homeTitle")}
            aria-label={t("header.homeLabel")}
          >
            <span className="office-beeldmerk">
              <img src={openaecSymbool} alt="" />
            </span>
            <strong>
              OpenAEC<span>Office Studio</span>
            </strong>
          </button>
          <span className="office-weekversie" title={t("header.version", { version: versie.versie })}>
            {versie.label}
          </span>
          {actief && (
            <>
              <span className="office-header-scheiding" />
              <span className="office-modulenaam">
                {module ? t(`common:modules.${module.module}`) : titel(actief)}
              </span>
            </>
          )}
          <div className="office-documenttitel">
            {actiefDocument && ModuleIcoon && (
              <>
                <ModuleIcoon size={15} />
                <span>{actiefDocument.naam}</span>
                <i
                  className={actiefDocument.gewijzigd ? "gewijzigd" : ""}
                  role="img"
                  aria-label={
                    actiefDocument.gewijzigd
                      ? t("header.unsaved")
                      : t("header.unchanged")
                  }
                  title={
                    actiefDocument.gewijzigd
                      ? t("header.unsaved")
                      : t("header.unchanged")
                  }
                />
              </>
            )}
          </div>
          <div className="office-snelacties">
            <VensterMenu tabs={tabs} activeer={(id) => wissel(id, true)} />
            <ThemaKnop thema={thema} wissel={wisselThema} />
            {!opStart && (
              <button
                className="office-iconknop"
                onClick={toonStart}
                aria-label={t("header.fileAndStart")}
                title={t("header.fileAndStart")}
              >
                <Home size={17} />
              </button>
            )}
            <button
              className="office-headerknop"
              disabled={
                bezig || (actieveModule === "database" && !databaseGereed)
              }
              onClick={kiesBestand}
              title={
                actieveModule === "notities"
                  ? t("header.openNotesBackupTitle")
                  : actieveModule === "database"
                    ? t("header.openDatabaseTitle")
                    : t("header.openFileTitle")
              }
            >
              <FolderOpen size={16} />
              <span>
                {actieveModule === "notities"
                  ? t("header.addBackup")
                  : t("common:open")}
              </span>
            </button>
            {actiefDocument && (
              <>
                <button
                  className="office-headerknop office-bewaren"
                  disabled={bezig || !actiefDocument.gereed}
                  onClick={() => openOpslaanAls()}
                  title={t("header.saveAsTitle")}
                >
                  <Save size={16} />
                  <span>{opslaanBezig ? t("header.busy") : t("header.saveAs")}</span>
                </button>
              </>
            )}
          </div>
        </header>
        <TabBalk
          tabbladen={toestand.tabbladen}
          actief={toestand.actief}
          activeer={(id) => wissel(id)}
          sluit={(ids) => void sluit(ids)}
          verplaats={(id, naar) =>
            tabs.verwerk({ type: "verplaats", id, naar })
          }
          nieuw={toonStart}
          extraMenu={vensters.menu}
          losgesleept={vensters.losgesleept}
        />
        <input
          hidden
          ref={input}
          type="file"
          accept={invoerformaten}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void openBestand(file);
          }}
        />
        {melding && (
          <div role="status" className="office-message">
            <span>{melding}</span>
            <button
              onClick={() =>
                actief?.melding
                  ? tabs.werkBij(actief.id, { melding: "" })
                  : meld("")
              }
              aria-label={t("message.close")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {actiefDocument?.rapport && (
          <RapportMelding
            key={actiefDocument.id}
            rapport={actiefDocument.rapport}
            bestandsnaam={actiefDocument.naam}
            sluit={() => tabs.werkBij(actiefDocument.id, { rapport: null })}
          />
        )}
        {actiefDocument?.soort === "docx" &&
          actiefDocument.exportFormaat === "md" && (
            <div className="office-exportuitleg" role="note">
              {t("message.markdownNote")}
            </div>
          )}
        <div className="office-werkvlak">
          {/* Vaste volgorde op id: herschikken mag de editors niet verplaatsen in de DOM. */}
          {[...toestand.tabbladen]
            .sort((a, b) => a.id - b.id)
            .map((tabblad) => {
              const zichtbaar = tabblad.id === actief?.id;
              if (tabblad.type === "document") {
                const koppeling = tabs.koppeling(tabblad.id);
                return paneel(
                  tabblad,
                  <EditorGrens>
                    <Suspense
                      fallback={<p className="office-loading">{t("loading.editor")}</p>}
                    >
                      <Editor
                        soort={tabblad.soort}
                        bytes={tabblad.bytes}
                        naam={tabblad.naam}
                        gewijzigd={koppeling.gewijzigd}
                        fout={koppeling.fout}
                        registreer={koppeling.registreer}
                        opslaan={() => void opslaan(tabblad.id)}
                        bestandsmenu={toonStart}
                        inactief={!zichtbaar || editorInactief}
                        zichtbaar={zichtbaar}
                        zoom={koppeling.zoom}
                      />
                    </Suspense>
                  </EditorGrens>,
                  "office-editor",
                );
              }
              if (tabblad.module === "notities")
                return paneel(
                  tabblad,
                  <Suspense
                    fallback={<p className="office-loading">{t("loading.notes")}</p>}
                  >
                    <NotitiesStudio
                      bestandsmenu={toonStart}
                      inactief={!zichtbaar || dialoogOpen}
                      registreer={registreerNotities}
                      onOnopgeslagen={notitiesBewerkt}
                    />
                  </Suspense>,
                );
              if (tabblad.module === "database")
                return paneel(
                  tabblad,
                  <DatabaseStudio
                    bestandsmenu={toonStart}
                    inactief={!zichtbaar || dialoogOpen}
                    registreerOpenen={registreerDatabaseOpenen}
                    bewaarUitvoer={bewaarDatabaseUitvoer}
                    bewaarBinair={bewaarDatabaseBinair}
                    gewijzigd={databaseBewerkt}
                    startbestand={databaseStart}
                    startbestandGelezen={databaseStartGelezen}
                  />,
                );
              return paneel(
                tabblad,
                <Suspense
                  fallback={
                    <p className="office-loading">{t("loading.email")}</p>
                  }
                >
                  <EmailStudio
                    bestandsmenu={toonStart}
                    inactief={!zichtbaar || dialoogOpen || !!verzending}
                    onOnverzonden={emailBewerkt}
                    openInKantoor={(naam, bytes) =>
                      void openUitEmail(naam, bytes)
                    }
                    melding={(tekst) => meld(tekst, tabblad.id)}
                    ongelezen={setEmailOngelezen}
                    registreer={registreerEmail}
                  />
                </Suspense>,
              );
            })}
          <div
            id={paneelId(null)}
            role="tabpanel"
            aria-labelledby={tabId(null)}
            className="office-tabpaneel office-backstage"
            hidden={!opStart}
            inert={!opStart}
          >
            <StartScherm
              bezig={bezig}
              terug={vorigeTab ? () => wissel(vorigeTab.id, true) : undefined}
              open={kiesDocument}
              nieuw={(soort) => void nieuw(soort)}
              voorbeeld={(soort) => void voorbeeld(soort)}
              openNotities={() => tabs.openModule("notities")}
              openDatabase={() => tabs.openModule("database")}
              openEmail={() => tabs.openModule("email")}
              emailOngelezen={emailOngelezen}
              bewaar={
                vorigDocument?.gereed
                  ? () => openOpslaanAls(vorigDocument.id)
                  : undefined
              }
              opslaan={
                vorigDocument?.gereed
                  ? () => void opslaan(vorigDocument.id)
                  : undefined
              }
              afdrukken={
                vorigDocument?.gereed
                  ? () => {
                      // Eerst terug naar het document: het voorbeeld drukt de zichtbare editor af.
                      wissel(vorigDocument.id, true);
                      requestAnimationFrame(() => vraagAfdrukvoorbeeld());
                    }
                  : undefined
              }
              info={
                vorigDocument?.gereed && vorigDocument.soort === "docx"
                  ? () => toonDocumentInfo(() => wissel(vorigDocument.id, true))
                  : undefined
              }
              verzend={
                vorigDocument?.gereed
                  ? () => void verzendAlsBijlage(vorigDocument.id)
                  : undefined
              }
            />
          </div>
        </div>
        <Statusbalk
          soort={actiefDocument?.soort ?? actieveModule}
          moduleNaam={
            module?.naam ??
            (actieveModule === "notities"
              ? "Open Notities Studio"
              : actieveModule === "database"
                ? "Open Database Studio"
                : actieveModule === "email"
                  ? "OpenAEC Email Studio"
                  : "OpenAEC Office Studio")
          }
          document={actiefDocument}
          databaseGewijzigd={actief?.type === "module" && actief.module === "database" ? tabs.isGewijzigd(actief) : null}
          emailOngelezen={emailOngelezen}
          aantalGewijzigd={aantalGewijzigd}
          versieLabel={versie.label}
        />
        {verzending && (
          <Suspense fallback={null}>
            <VerzendAlsBijlage
              naam={verzending.naam}
              bytes={verzending.bytes}
              sluit={() => {
                setVerzending(null);
                setVerzendingOnverzonden(false);
              }}
              melding={(tekst) => meld(tekst)}
              onOnverzonden={setVerzendingOnverzonden}
              registreer={registreerVerzending}
            />
          </Suspense>
        )}
      </div>
      {importvragen.venster}
      {tabs.verlaatvraag && (
        <VerlaatDialoog
          naam={tabs.verlaatvraag.naam}
          kanOpslaan={tabs.verlaatvraag.kanOpslaan}
          overige={tabs.verlaatvraag.overige}
          antwoord={tabs.beantwoord}
          vorigeFocus={vorigeFocus.current}
        />
      )}
      <AfdrukvoorbeeldHost meld={meldActief} />
      <Werkruimtehulp soort={actiefDocument?.soort ?? actieveModule} />
      {herstel.dialoog}
      {neerzetzone}
      {opslaanDocument && (
        <OpslaanAlsDialoog
          soort={opslaanDocument.soort}
          naam={
            opslaanKeuzes.current.get(opslaanDocument.id)?.naam ??
            opslaanDocument.naam
          }
          formaat={
            opslaanKeuzes.current.get(opslaanDocument.id)?.ext ??
            opslaanDocument.exportFormaat
          }
          verlies={(formaat, route, metWachtwoord) =>
            verliesrapport(
              opslaanDocument.bytes,
              opslaanDocument.soort,
              formaat,
              route,
              {
                versleuteld: !!opslaanDocument.bron?.versleuteling,
                wachtwoord: metWachtwoord,
                macros: !!opslaanDocument.bron?.macro?.heeftVba,
              },
            )
          }
          versleuteld={!!opslaanDocument.bron?.versleuteling}
          macros={!!opslaanDocument.bron?.macro}
          wachtwoord={wachtwoorden.current.get(opslaanDocument.id) ?? undefined}
          bladen={editorKoppeling(opslaanDocument.soort)?.bladen?.() ?? null}
          dias={editorKoppeling(opslaanDocument.soort)?.dias?.() ?? null}
          vorigeFocus={vorigeFocus.current}
          annuleer={() => {
            setOpslaanAls(null);
            beantwoordOpslaanAls(false);
          }}
          bevestig={(keuze) => {
            // Het wachtwoord geldt voor het werkbestand in het eigen formaat.
            if (keuze.ext === opslaanDocument.soort)
              wachtwoorden.current.set(
                opslaanDocument.id,
                keuze.wachtwoord ?? null,
              );
            opslaanKeuzes.current.set(opslaanDocument.id, keuze);
            tabs.werkBij(opslaanDocument.id, { exportFormaat: keuze.ext });
            setOpslaanAls(null);
            void opslaan(opslaanDocument.id, true).then(beantwoordOpslaanAls);
          }}
        />
      )}
    </>
  );
}
