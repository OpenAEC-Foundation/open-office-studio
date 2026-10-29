import { useEffect, useRef, useState } from "react";
import type { useTabbladen } from "./useTabbladen";
import {
  browserOpslag,
  desktopOpslag,
  herstelInterval,
  kopieNodig,
  nieuweSessie,
  type HerstelItem,
  type HerstelOpslag,
} from "./herstel";
import { HerstelDialoog } from "./HerstelDialoog";
import i18next from "./i18n/config";
import { formatDatumTijd } from "./i18n/opmaak";

const tauri = "__TAURI_INTERNALS__" in window;
/** Elke halve minuut kijken; een eerste kopie komt dus snel, daarna per interval. */
const TIK = 30_000;

// Eén sessie per venster, ook als React in de ontwikkelstand dubbel mount.
let gedeeld: {
  id: string;
  opslag: HerstelOpslag;
  gestart: Promise<void>;
} | null = null;
function sessie() {
  if (!gedeeld) {
    const id = nieuweSessie();
    const opslag = tauri ? desktopOpslag(id) : browserOpslag(id);
    gedeeld = { id, opslag, gestart: opslag.start() };
  }
  return gedeeld;
}

interface Opties {
  tabs: ReturnType<typeof useTabbladen>;
  /** Niet kopiëren terwijl er wordt opgeslagen of geopend. */
  bezig: () => boolean;
  opslaanAls: (id: number) => void;
}

/**
 * Herstelkopieën van gewijzigde tabbladen en het herstelvenster na een
 * niet-schone afsluiting (zie `herstel.ts`). Geeft het venster terug als
 * element, zodat OfficeStudio het alleen hoeft te plaatsen.
 */
export function useHerstel({ tabs, bezig, opslaanAls }: Opties) {
  const [aanbod, setAanbod] = useState<HerstelItem[]>([]);
  const [werkt, setWerkt] = useState(false);
  const bewaard = useRef(new Map<number, { versie: string; tijd: number }>());
  const gemeld = useRef(false);
  const naGereed = useRef<number | null>(null);
  const recent = useRef({ tabs, bezig, opslaanAls });
  recent.current = { tabs, bezig, opslaanAls };

  // Start: sessie registreren; het hoofdvenster biedt kopieën van gestopte sessies aan.
  useEffect(() => {
    const { opslag, gestart } = sessie();
    const documentvenster =
      new URLSearchParams(location.search).get("venster") === "document";
    let actief = true;
    void gestart
      .then(() => (documentvenster ? [] : opslag.wezen()))
      .then((items) => actief && setAanbod(items))
      .catch(() => undefined);
    return () => {
      actief = false;
    };
  }, []);

  // Periodiek kopiëren.
  useEffect(() => {
    let loopt = false;
    const ronde = async () => {
      const { tabs, bezig } = recent.current;
      if (loopt || bezig()) return;
      loopt = true;
      try {
        const { opslag, gestart } = sessie();
        await gestart;
        const interval = herstelInterval();
        for (const tabblad of tabs.toestandRef.current.tabbladen) {
          // Geen onversleutelde herstelkopie van een versleuteld document.
          if (
            tabblad.type !== "document" ||
            tabblad.bron?.versleuteling ||
            !tabs.isGewijzigd(tabblad)
          )
            continue;
          const document = tabs.opslag(tabblad.id);
          const serialiseer = tabs.serialiseerder(tabblad.id);
          if (!document || !serialiseer || document.bezig) continue;
          const versie = document.versie;
          const nu = Date.now();
          if (
            !kopieNodig(bewaard.current.get(tabblad.id), versie, nu, interval)
          )
            continue;
          try {
            const bytes = await serialiseer();
            // Intussen opgeslagen of gesloten: geen kopie meer nodig.
            if (!tabs.isGewijzigd(tabblad)) continue;
            await opslag.bewaar(
              `tab-${tabblad.id}`,
              {
                naam: tabblad.naam,
                soort: tabblad.soort,
                exportFormaat: tabblad.exportFormaat,
                datum: nu,
              },
              bytes,
            );
            bewaard.current.set(tabblad.id, { versie, tijd: nu });
          } catch (fout) {
            if (!gemeld.current) {
              gemeld.current = true;
              tabs.meld(
                i18next.t("backstage:recovery.copyFailed", {
                  error: fout instanceof Error ? fout.message : String(fout),
                }),
                tabblad.id,
              );
            }
          }
        }
      } finally {
        loopt = false;
      }
    };
    const timer = setInterval(() => void ronde(), TIK);
    return () => clearInterval(timer);
  }, []);

  // Opgeslagen of gesloten: de kopie verdwijnt.
  const tabbladen = tabs.toestand.tabbladen;
  useEffect(() => {
    for (const id of [...bewaard.current.keys()]) {
      const tabblad = tabbladen.find((t) => t.id === id);
      if (tabblad?.gewijzigd) continue;
      bewaard.current.delete(id);
      const { id: sessieId, opslag, gestart } = sessie();
      void gestart
        .then(() => opslag.verwijder(sessieId, `tab-${id}`))
        .catch(() => undefined);
    }
    // Hersteld met "Opslaan als…": zodra de editor klaar is.
    const wacht = naGereed.current;
    const doel = tabbladen.find((t) => t.id === wacht);
    if (doel?.type === "document" && doel.gereed) {
      naGereed.current = null;
      recent.current.opslaanAls(doel.id);
    }
  }, [tabbladen]);

  async function herstel(item: HerstelItem, metOpslaanAls: boolean) {
    setWerkt(true);
    try {
      const bytes = await sessie().opslag.lees(item);
      const { id } = recent.current.tabs.openDocument({
        naam: item.naam,
        soort: item.soort,
        bytes,
        exportFormaat: item.exportFormaat,
        gewijzigd: true,
        melding: i18next.t("backstage:recovery.restoredFrom", {
          date: formatDatumTijd(item.datum, { dateStyle: "short", timeStyle: "medium" }),
        }),
      });
      await sessie().opslag.verwijder(item.sessie, item.sleutel);
      if (metOpslaanAls) naGereed.current = id;
      setAanbod((a) => a.filter((i) => i !== item));
    } catch (fout) {
      recent.current.tabs.meld(
        i18next.t("backstage:recovery.restoreFailed", {
          name: item.naam,
          error: fout instanceof Error ? fout.message : String(fout),
        }),
      );
    } finally {
      setWerkt(false);
    }
  }

  async function gooiWeg(item: HerstelItem) {
    await sessie()
      .opslag.verwijder(item.sessie, item.sleutel)
      .catch(() => undefined);
    setAanbod((a) => a.filter((i) => i !== item));
  }

  return {
    open: aanbod.length > 0,
    dialoog: aanbod.length ? (
      <HerstelDialoog
        items={aanbod}
        bezig={werkt}
        herstel={(item, als) => void herstel(item, als)}
        gooiWeg={(item) => void gooiWeg(item)}
        later={() => setAanbod([])}
      />
    ) : null,
  };
}
