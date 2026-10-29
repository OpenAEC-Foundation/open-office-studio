import { useCallback, useRef, useState } from "react";
import i18next from "./i18n/config";
import { DocumentOpslag } from "./opslag";
import {
  GEHEUGENGRENS,
  aantalDocumenten,
  actiefTabblad,
  beginToestand,
  tabbladReducer,
  titel,
  zoekDocument,
  zoekWerkbestand,
  type ModuleNaam,
  type Tabblad,
  type TabbladActie,
  type TabbladToestand,
} from "./tabbladen";
import type { Soort } from "./editors";
import { vergeetWerkbestand, type Werkbestand } from "./werkbestand";
import {
  rapportMelding,
  verwijder as verwijderMelding,
  vergeetTabblad,
  voegToe,
  type Melding,
  type MeldingActie,
  type NieuweMelding,
  type Toon,
} from "./meldingenWinkel";

type Serialiseer = () => Promise<Uint8Array>;

export type VerlaatKeuze = "opslaan" | "verwerpen" | "annuleren";

export interface Verlaatvraag {
  naam: string;
  kanOpslaan: boolean;
  /** Andere tabbladen in dezelfde sluitopdracht die ook wijzigingen hebben. */
  overige: number;
}

export interface EditorKoppeling {
  registreer: (fn: Serialiseer | null) => void;
  gewijzigd: () => void;
  zoom: (zoom: number | null) => void;
  fout: (fout: Error) => void;
  /** Melding van de editor met een eigen toon (bijv. vervangen lettertypen). */
  melding: (tekst: string, toon: Toon) => void;
}

/** Toon en eventuele knoppen van een melding. */
export type MeldOpties = Toon | { toon: Toon; acties?: MeldingActie[] };

interface Opties {
  /** Slaat het tabblad op; waar als het daarna gesloten mag worden. */
  opslaan: (id: number) => Promise<boolean>;
  /** Kans om automatisch bewarende modules (Notities) eerst te laten bewaren. */
  voorSluiten?: (tabblad: Tabblad) => void;
}

/**
 * Toestand en levenscyclus van de documenttabbladen. De reducer in
 * `tabbladen.ts` is puur; hier staan de opslag per document, de door de
 * editors geregistreerde serialiseerfuncties en de sluitvraag.
 */
export function useTabbladen(opties: Opties) {
  const toestandRef = useRef<TabbladToestand>(beginToestand);
  const [toestand, setToestand] = useState(beginToestand);
  const [meldingen, setMeldingen] = useState<Melding[]>([]);
  const meldingTeller = useRef(0);
  const [verlaatvraag, setVerlaatvraag] = useState<Verlaatvraag | null>(null);
  const opslagen = useRef(new Map<number, DocumentOpslag>());
  const serialiseerders = useRef(new Map<number, Serialiseer>());
  const koppelingen = useRef(new Map<number, EditorKoppeling>());
  const moduleGewijzigd = useRef(new Map<number, boolean>());
  const antwoord = useRef<((keuze: VerlaatKeuze) => void) | null>(null);
  const recenteOpties = useRef(opties);
  recenteOpties.current = opties;

  // De ref is de bron van waarheid, zodat opeenvolgende acties binnen één
  // gebeurtenis elkaars uitkomst zien (bijv. het nieuwe tabblad-id).
  const verwerk = useCallback((actie: TabbladActie) => {
    const volgende = tabbladReducer(toestandRef.current, actie);
    if (volgende === toestandRef.current) return volgende;
    toestandRef.current = volgende;
    setToestand(volgende);
    return volgende;
  }, []);

  const werkBij = useCallback(
    (
      id: number,
      wijziging: Extract<TabbladActie, { type: "werkBij" }>["wijziging"],
    ) => verwerk({ type: "werkBij", id, wijziging }),
    [verwerk],
  );

  const voegMeldingToe = useCallback((melding: NieuweMelding) => {
    const id = ++meldingTeller.current;
    setMeldingen((lijst) => voegToe(lijst, melding, id));
    return id;
  }, []);

  /**
   * Melding rechtsonder (zie `meldingen.ts`) voor een tabblad, of voor het
   * hele venster als het tabblad niet (meer) bestaat. Lege tekst: niets.
   */
  const meld = useCallback(
    (tekst: string, id?: number | null, opties: MeldOpties = "info") => {
      if (!tekst) return;
      const { toon, acties } =
        typeof opties === "string" ? { toon: opties, acties: undefined } : opties;
      const tabblad =
        id != null && toestandRef.current.tabbladen.some((t) => t.id === id)
          ? id
          : null;
      voegMeldingToe({ tabblad, toon, tekst, acties });
    },
    [voegMeldingToe],
  );

  const sluitMelding = useCallback(
    (id: number) => setMeldingen((lijst) => verwijderMelding(lijst, id)),
    [],
  );

  function openDocument(document: {
    naam: string;
    soort: Soort;
    bytes: Uint8Array;
    vingerafdruk?: string | null;
    werkbestand?: Werkbestand | null;
    exportFormaat?: string;
    gewijzigd?: boolean;
    melding?: string;
    rapport?: import("./import/rapport").Rapport | null;
    bron?: import("./import/bron").Bronkenmerken | null;
  }) {
    const voor = aantalDocumenten(toestandRef.current);
    const na = verwerk({ type: "openDocument", ...document });
    const id = na.actief!;
    const nieuwTabblad = !opslagen.current.has(id);
    if (nieuwTabblad && document.melding)
      voegMeldingToe({ tabblad: id, toon: "info", tekst: document.melding });
    if (nieuwTabblad && document.rapport)
      voegMeldingToe(rapportMelding(id, document.rapport, document.naam));
    if (!opslagen.current.has(id)) {
      const opslag = new DocumentOpslag();
      opslag.wissel();
      if (document.gewijzigd) opslag.wijzig(opslag.documentId);
      opslagen.current.set(id, opslag);
    }
    const aantal = aantalDocumenten(na);
    if (aantal > voor && aantal > GEHEUGENGRENS)
      voegMeldingToe({
        tabblad: null,
        toon: "waarschuwing",
        tekst: i18next.t("shell:tabs.memoryWarning", { count: aantal }),
      });
    return { id, nieuw: aantal > voor };
  }

  /** Activeert een al geopend document met deze vingerafdruk. */
  function openBestaand(vinger: string) {
    const bestaand = zoekDocument(toestandRef.current, vinger);
    if (bestaand) verwerk({ type: "activeer", id: bestaand.id });
    return !!bestaand;
  }

  /** Activeert het tabblad met dit pad-token; waar als het bestaat. */
  function activeerWerkbestand(token: string) {
    const bestaand = zoekWerkbestand(toestandRef.current, token);
    if (bestaand) verwerk({ type: "activeer", id: bestaand.id });
    return !!bestaand;
  }

  const openModule = (module: ModuleNaam) =>
    verwerk({ type: "openModule", module }).actief!;

  /** Vaste callbacks per tabblad, zodat editors niet opnieuw registreren. */
  function koppeling(id: number): EditorKoppeling {
    let k = koppelingen.current.get(id);
    if (!k) {
      k = {
        registreer: (fn) => {
          if (!toestandRef.current.tabbladen.some((t) => t.id === id)) {
            serialiseerders.current.delete(id);
            return;
          }
          if (fn) serialiseerders.current.set(id, fn);
          else serialiseerders.current.delete(id);
          werkBij(id, { gereed: !!fn });
        },
        gewijzigd: () => {
          const opslag = opslagen.current.get(id);
          if (opslag?.wijzig(opslag.documentId))
            werkBij(id, { gewijzigd: true });
        },
        zoom: (zoom) => werkBij(id, { zoom }),
        fout: (fout) => meld(fout.message, id, "fout"),
        melding: (tekst, toon) => meld(tekst, id, toon),
      };
      koppelingen.current.set(id, k);
    }
    return k;
  }

  /** Wijzigingsmelding van een module (Notities, Database). */
  const moduleBewerkt = useCallback(
    (module: ModuleNaam, waarde: boolean) => {
      const tabblad = toestandRef.current.tabbladen.find(
        (t) => t.type === "module" && t.module === module,
      );
      if (!tabblad) return;
      moduleGewijzigd.current.set(tabblad.id, waarde);
      werkBij(tabblad.id, { gewijzigd: waarde });
    },
    [werkBij],
  );

  /** Synchrone wijzigingsstatus, ook vóór de volgende render. */
  const isGewijzigd = useCallback((tabblad: Tabblad) => {
    if (tabblad.type === "document")
      return opslagen.current.get(tabblad.id)?.gewijzigd ?? false;
    return moduleGewijzigd.current.get(tabblad.id) ?? false;
  }, []);

  const gewijzigdeTabbladen = useCallback(
    () => toestandRef.current.tabbladen.filter(isGewijzigd),
    [isGewijzigd],
  );

  function vraag(v: Verlaatvraag) {
    if (antwoord.current) return Promise.resolve<VerlaatKeuze>("annuleren");
    return new Promise<VerlaatKeuze>((resolve) => {
      antwoord.current = resolve;
      setVerlaatvraag(v);
    });
  }

  function beantwoord(keuze: VerlaatKeuze) {
    antwoord.current?.(keuze);
    antwoord.current = null;
    setVerlaatvraag(null);
  }

  function verwijder(id: number) {
    const tabblad = toestandRef.current.tabbladen.find((t) => t.id === id);
    // Na een overdracht hoort het token al bij het andere venster; Rust weigert dan.
    if (tabblad?.type === "document" && tabblad.werkbestand)
      vergeetWerkbestand(tabblad.werkbestand.token);
    verwerk({ type: "sluit", id });
    opslagen.current.delete(id);
    serialiseerders.current.delete(id);
    koppelingen.current.delete(id);
    moduleGewijzigd.current.delete(id);
    setMeldingen((lijst) => vergeetTabblad(lijst, id));
  }

  /** Sluit de tabbladen één voor één; stopt bij Annuleren. */
  async function sluit(ids: number[]) {
    for (const [index, id] of ids.entries()) {
      const tabblad = toestandRef.current.tabbladen.find((t) => t.id === id);
      if (!tabblad) continue;
      recenteOpties.current.voorSluiten?.(tabblad);
      if (isGewijzigd(tabblad)) {
        verwerk({ type: "activeer", id });
        const overige = ids
          .slice(index + 1)
          .map((i) => toestandRef.current.tabbladen.find((t) => t.id === i))
          .filter((t): t is Tabblad => !!t && isGewijzigd(t)).length;
        const keuze = await vraag({
          naam: titel(tabblad),
          kanOpslaan:
            tabblad.type === "document" && serialiseerders.current.has(id),
          overige,
        });
        if (keuze === "annuleren") return false;
        if (keuze === "opslaan" && !(await recenteOpties.current.opslaan(id)))
          return false;
      }
      verwijder(id);
    }
    return true;
  }

  return {
    toestand,
    actief: actiefTabblad(toestand),
    toestandRef,
    meldingen,
    meld,
    sluitMelding,
    werkBij,
    verwerk,
    openDocument,
    openBestaand,
    activeerWerkbestand,
    openModule,
    koppeling,
    moduleBewerkt,
    isGewijzigd,
    gewijzigdeTabbladen,
    opslag: (id: number) => opslagen.current.get(id),
    serialiseerder: (id: number) => serialiseerders.current.get(id),
    sluit,
    /** Sluit zonder te vragen, bijv. na een bevestigde overdracht naar een ander venster. */
    verwijder,
    verlaatvraag,
    beantwoord,
  };
}
