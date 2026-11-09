/**
 * Desktop: het venster op de andere monitor tijdens een voorstelling (#79).
 * Toont het beeld dat het hoofdvenster stuurt en geeft toetsen en klikken
 * terug (`toeschouwerKanaal.ts`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DiaVlak } from "./DiaVlak";
import { GEEN_OVERGANG, type Overgang } from "./overgangen";
import { useOvergangTeken } from "./useOvergangTeken";
import {
  NAAR_TOESCHOUWER,
  VAN_TOESCHOUWER,
  type NaarToeschouwer,
  type ToeschouwerStaat,
  type VanToeschouwer,
} from "./toeschouwerKanaal";
import "./voorstelling.css";

type ZonderSessie<T> = T extends unknown ? Omit<T, "sessie"> : never;

export function ToeschouwerVenster({ sessie }: { sessie: string }) {
  const { t } = useTranslation("presentation");
  const [beeld, setBeeld] = useState<{ index: number; img: HTMLImageElement; overgang?: Overgang } | null>(null);
  const beeldVolgorde = useRef(0);
  const [staat, setStaat] = useState<ToeschouwerStaat>({ scherm: "normaal", einde: null, strepen: [], laser: null });

  const stuur = useCallback(
    (bericht: ZonderSessie<VanToeschouwer>) => {
      void import("@tauri-apps/api/event").then(({ emit }) =>
        emit(VAN_TOESCHOUWER, { ...bericht, sessie }).catch(() => undefined),
      );
    },
    [sessie],
  );

  useEffect(() => {
    document.title = t("show.windowTitle");
    document.body.classList.add("voorstelling-venster");
    let stop: (() => void) | null = null;
    let actief = true;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const s = await listen<NaarToeschouwer>(NAAR_TOESCHOUWER, (e) => {
        const b = e.payload;
        if (b?.sessie !== sessie) return;
        if (b.soort === "beeld") {
          const volgorde = ++beeldVolgorde.current;
          const img = new Image();
          img.onload = () => {
            if (actief && volgorde === beeldVolgorde.current) setBeeld({ index: b.index, img, overgang: b.overgang });
          };
          img.src = b.data;
        } else setStaat({ scherm: b.scherm, einde: b.einde, strepen: b.strepen, laser: b.laser });
      });
      if (!actief) s();
      else stop = s;
      stuur({ soort: "klaar" });
    });
    const weg = () => stuur({ soort: "gesloten" });
    window.addEventListener("pagehide", weg);
    const toets = (e: KeyboardEvent) => {
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      stuur({ soort: "toets", toets: { key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey } });
    };
    window.addEventListener("keydown", toets);
    return () => {
      actief = false;
      stop?.();
      window.removeEventListener("pagehide", weg);
      window.removeEventListener("keydown", toets);
    };
  }, [sessie, stuur, t]);

  const verhouding = beeld ? beeld.img.naturalWidth / Math.max(1, beeld.img.naturalHeight) : 16 / 9;
  const bron = useCallback(async () => beeld?.img ?? null, [beeld]);
  const teken = useOvergangTeken(beeld?.index ?? -1, bron, beeld?.overgang ?? GEEN_OVERGANG);
  return (
    <div className="voorstelling voorstelling-los">
      <div className="voorstelling-toeschouwer">
        <DiaVlak
          verhouding={verhouding}
          teken={beeld ? teken : null}
          sleutel={String(beeld?.index ?? -1)}
          scherm={staat.scherm}
          einde={staat.einde}
          strepen={staat.strepen}
          laser={staat.laser}
          onKlik={beeld?.overgang?.klik === false && !staat.einde && staat.scherm === "normaal" ? undefined : () => stuur({ soort: "toets", toets: { key: "ArrowRight" } })}
        />
      </div>
    </div>
  );
}
