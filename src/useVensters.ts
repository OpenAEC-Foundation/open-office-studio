import { useEffect, useRef, useState } from "react";
import i18next from "./i18n/config";
import type { useTabbladen } from "./useTabbladen";
import type { MenuItem } from "./TabBalk";
import type { Tabblad } from "./tabbladen";
import { bewaarZoom } from "./documentzoom";
import {
  brengOver,
  standaardBrowserkanaal,
  type Doel,
  type Overdracht,
  type Positie,
  type Vensterkanaal,
  venstertitel,
} from "./vensteroverdracht";

const tauri = "__TAURI_INTERNALS__" in window;
const GEMELD = "openaec-office-losmaken-gemeld";

// Eén kanaal per venster, ook als React in de ontwikkelstand dubbel mount.
let kanaalBelofte: Promise<Vensterkanaal> | null = null;
function vensterkanaal() {
  kanaalBelofte ??= tauri
    ? import("./tauriVensters").then((m) => m.tauriKanaal())
    : Promise.resolve(standaardBrowserkanaal());
  return kanaalBelofte;
}
let beginGedaan = false;

function eersteKeer() {
  try {
    if (localStorage.getItem(GEMELD)) return false;
    localStorage.setItem(GEMELD, "1");
  } catch {
    // Zonder opslag melden we het gewoon elke keer.
  }
  return true;
}

interface Opties {
  tabs: ReturnType<typeof useTabbladen>;
  /** Laat automatisch bewarende modules eerst bewaren. */
  voorOverdracht: (tabblad: Tabblad) => void;
}

/**
 * Tabbladen losmaken naar een eigen venster en terugbrengen, plus de
 * sluitbeveiliging en titel van dit venster.
 */
export function useVensters({ tabs, voorOverdracht }: Opties) {
  const [kanaal, setKanaal] = useState<Vensterkanaal | null>(null);
  const bezig = useRef(false);
  const recent = useRef({ tabs, voorOverdracht });
  recent.current = { tabs, voorOverdracht };

  /** Opent een binnenkomend tabblad; waar als het gelukt is. */
  function ontvang(overdracht: Overdracht) {
    const { tabs } = recent.current;
    try {
      if (overdracht.type === "module") {
        const id = tabs.openModule(overdracht.module);
        if (overdracht.module === "database")
          tabs.meld(i18next.t("shell:windows.databaseMovedHere"), id);
        return true;
      }
      // De zoom gaat via het geheugen per document mee naar de nieuwe editor.
      if (overdracht.zoom && overdracht.zoom !== 1)
        bewaarZoom(
          `${overdracht.soort}:${overdracht.naam}:${overdracht.bytes.byteLength}`,
          overdracht.zoom,
        );
      tabs.openDocument({
        naam: overdracht.naam,
        soort: overdracht.soort,
        bytes: overdracht.bytes,
        exportFormaat: overdracht.exportFormaat,
        gewijzigd: overdracht.gewijzigd,
        vingerafdruk: overdracht.vingerafdruk,
        werkbestand: overdracht.werkbestand ?? null,
        melding: eersteKeer() ? i18next.t("shell:windows.documentMoved") : "",
      });
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    let actief = true;
    let stop: (() => void) | undefined;
    vensterkanaal()
      .then((k) => {
        if (!actief) return;
        setKanaal(k);
        stop = k.luister(ontvang);
        if (!beginGedaan) {
          beginGedaan = true;
          void k.begin(ontvang);
        }
      })
      .catch((e) =>
        recent.current.tabs.meld(
          i18next.t("shell:windows.linkUnavailable", { error: String(e) }),
        ),
      );
    return () => {
      actief = false;
      stop?.();
    };
  }, []);

  async function huidigeOverdracht(tabblad: Tabblad): Promise<Overdracht> {
    const { tabs, voorOverdracht } = recent.current;
    voorOverdracht(tabblad);
    if (tabblad.type === "module") {
      if (tabblad.module === "database" && tabs.isGewijzigd(tabblad))
        throw new Error(i18next.t("shell:windows.databaseModified"));
      return { type: "module", module: tabblad.module };
    }
    const serialiseer = tabs.serialiseerder(tabblad.id);
    // Een editor die nog laadt heeft nog geen wijzigingen: dan gaan de oorspronkelijke bytes mee.
    const bytes = serialiseer ? await serialiseer() : tabblad.bytes;
    return {
      type: "document",
      naam: tabblad.naam,
      soort: tabblad.soort,
      bytes,
      exportFormaat: tabblad.exportFormaat,
      zoom: tabblad.zoom,
      gewijzigd: tabs.isGewijzigd(tabblad),
      vingerafdruk: tabblad.vingerafdruk,
      werkbestand: tabblad.werkbestand,
    };
  }

  async function brengNaar(id: number, doel: Doel, positie?: Positie) {
    const { tabs } = recent.current;
    const tabblad = tabs.toestandRef.current.tabbladen.find((t) => t.id === id);
    if (!kanaal || !tabblad || bezig.current) return;
    bezig.current = true;
    try {
      const uitkomst = await brengOver(
        kanaal,
        {
          overdracht: () => huidigeOverdracht(tabblad),
          verwijder: () => tabs.verwijder(id),
        },
        doel,
        positie,
      );
      if (uitkomst.status === "mislukt") {
        tabs.meld(uitkomst.fout, id);
        return;
      }
      // Een leeg documentvenster sluit vanzelf na het terugbrengen.
      if (
        doel === "hoofd" &&
        !kanaal.hoofdvenster &&
        !tabs.toestandRef.current.tabbladen.length
      )
        await sluitDitVenster();
    } finally {
      bezig.current = false;
    }
  }

  const actief = tabs.actief;
  const vensterTitel = actief
    ? actief.type === "document"
      ? venstertitel({ ...actief, type: "document", gewijzigd: false })
      : venstertitel({ type: "module", module: actief.module })
    : null;
  useEffect(() => {
    if (!kanaal || kanaal.hoofdvenster) return;
    // Losgemaakte vensters dragen de naam van hun actieve tabblad.
    const tekst = vensterTitel ?? i18next.t("common:appName");
    document.title = tekst;
    if (tauri)
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(tekst))
        .catch(() => undefined);
  }, [kanaal, vensterTitel]);

  return {
    hoofdvenster: kanaal?.hoofdvenster ?? true,
    menu: kanaal
      ? (tabblad: Tabblad): MenuItem[] => [
          {
            label: i18next.t("shell:windows.openInNewWindow"),
            actie: () => void brengNaar(tabblad.id, "nieuw"),
          },
          ...(kanaal.hoofdvenster
            ? []
            : [
                {
                  label: i18next.t("shell:windows.backToMainWindow"),
                  actie: () => void brengNaar(tabblad.id, "hoofd"),
                },
              ]),
        ]
      : undefined,
    // In de browser is de muispositie buiten het venster niet betrouwbaar;
    // daar alleen via het menu "In nieuw venster openen".
    losgesleept:
      kanaal && tauri
      ? (id: number, x: number, y: number) =>
          void brengNaar(id, "nieuw", { x, y })
      : undefined,
    brengNaar,
    meldWijzigingen(aantal: number) {
      if (!tauri) return;
      void import("@tauri-apps/api/core")
        .then(({ invoke }) =>
          invoke("wijzigingsstatus", { gewijzigd: aantal > 0, aantal }),
        )
        .catch((e) =>
          recent.current.tabs.meld(
            i18next.t("shell:windows.closeGuardUnavailable", { error: String(e) }),
          ),
        );
    },
  };
}

async function sluitDitVenster() {
  if (tauri) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } else window.close();
}
