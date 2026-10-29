import { useEffect, useRef } from "react";
import { noteerHostBestand, officeHost } from "./host";
import i18next from "./i18n/config";
import type { MeldOpties } from "./useTabbladen";

/**
 * Opent bij de start het document dat de host aanbiedt (bijv. de SuperCloud-werkplek met `?bestand=<id>`), via de
 * gewone openroute van de app. De versie van de host wordt onthouden voor opslaan met basisversie.
 */
export function useHostOpenen(
  open: (bestand: File) => Promise<void>,
  meld: (tekst: string, opties: MeldOpties) => void,
  /** Opent Opslaan als voor het actieve tabblad (knop in de alleen-lezenmelding). */
  opslaanAls?: () => void,
) {
  const gedaan = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const meldRef = useRef(meld);
  meldRef.current = meld;
  const opslaanAlsRef = useRef(opslaanAls);
  opslaanAlsRef.current = opslaanAls;
  useEffect(() => {
    if (gedaan.current) return;
    gedaan.current = true;
    const host = officeHost();
    if (!host?.open) return;
    void host
      .open()
      .then(async (bestand) => {
        if (!bestand) return;
        noteerHostBestand(bestand);
        await openRef.current(new File([bestand.bytes.slice()], bestand.naam));
        if (bestand.alleenLezen)
          meldRef.current(i18next.t("shell:host.readOnly", { name: bestand.naam }), {
            toon: "waarschuwing",
            acties: opslaanAlsRef.current
              ? [{ label: i18next.t("shell:header.saveAs"), actie: opslaanAlsRef.current }]
              : undefined,
          });
      })
      .catch((e) =>
        meldRef.current(i18next.t("shell:host.openFailed", { error: String(e) }), "fout"),
      );
  }, []);
}
