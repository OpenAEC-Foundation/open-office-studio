/**
 * Altijd gemonteerde host van de Word-functies (W4) in een tekst-editor:
 * het zoekvenster en Ga naar (#29), de tabel- en afbeeldingsvensters (#48,
 * #49), en de aanmelding van die vensters bij het rechtermuismenu
 * (src/tekst/menu/opdrachten.ts). Alleen de zichtbare editor meldt aan.
 */
import { useContext, useEffect } from "react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi, useEditorZichtbaar, zichtbaarElement } from "../lint/editorApi";
import { volgEngineVensters } from "./gedeeld/enginevenster";
import { meldOpdrachtAan } from "./menu/opdrachten";
import { openVenster, sluitVenster, useOpenVenster } from "./gedeeld/vensters";
import { fout } from "./gedeeld/engine";
import { ZoekHost } from "./zoeken/ZoekPaneel";
import { TabelVenster, openTekstNaarTabel, splitsHuidigeTabel } from "./tabel/TabelIndeling";
import { kolommenGelijk } from "./tabel/opdrachten";
import { AfbeeldingVenster, kiesNieuweAfbeelding } from "./afbeelding/AfbeeldingGroepen";
import { MarkeringVoorbeeld, WijzigingenPaneel, wijzigingenWinkel } from "./wijzigingen/Wijzigingen";
import { usePaneelStaat } from "./zoeken/paneelstaat";
import { VergelijkVenster, neemPaneelVerzoek } from "./wijzigingen/VergelijkVenster";

/** Opdrachten die het rechtermuismenu via de registry kan aanroepen. */
export const MENU_OPDRACHTEN = [
  "tabel.rij",
  "tabel.marges",
  "tabel.sorteren",
  "tabel.kolommenGelijk",
  "tabel.naarTekst",
  "tabel.splitsen",
  "tabel.tekstNaarTabel",
  "afbeelding.bijsnijden",
  "afbeelding.alt",
  "afbeelding.positie",
  "afbeelding.wijzigen",
] as const;

export function WordHost() {
  const apis = useEditorApi();
  const api = apis.tekst;
  const meld = useContext(RibbonFout);
  const zichtbaar = useEditorZichtbaar();
  const open = useOpenVenster(api);
  const wijzigingen = wijzigingenWinkel.gebruik(api);
  const zoeken = usePaneelStaat(api).zoeken;
  const recent = { apis, meld };

  useEffect(() => {
    if (!zichtbaar) return;
    const doe = (taak: () => unknown) => () => {
      try {
        const uit = taak();
        if (uit instanceof Promise) uit.catch((e) => recent.meld(fout(e)));
      } catch (e) {
        recent.meld(fout(e));
      }
    };
    const afmelden = [
      meldOpdrachtAan("tabel.rij", doe(() => openVenster(api, "tabel.rij"))),
      meldOpdrachtAan("tabel.marges", doe(() => openVenster(api, "tabel.marges"))),
      meldOpdrachtAan("tabel.sorteren", doe(() => openVenster(api, "tabel.sorteren"))),
      meldOpdrachtAan("tabel.naarTekst", doe(() => openVenster(api, "tabel.naarTekst"))),
      meldOpdrachtAan("tabel.kolommenGelijk", doe(() => kolommenGelijk(api()))),
      meldOpdrachtAan("tabel.splitsen", doe(() => splitsHuidigeTabel(api()))),
      meldOpdrachtAan("tabel.tekstNaarTabel", doe(() => openTekstNaarTabel(api(), api))),
      meldOpdrachtAan("afbeelding.bijsnijden", doe(() => openVenster(api, "afbeelding.bijsnijden"))),
      meldOpdrachtAan("afbeelding.alt", doe(() => openVenster(api, "afbeelding.alt"))),
      meldOpdrachtAan("afbeelding.positie", doe(() => openVenster(api, "afbeelding.positie"))),
      meldOpdrachtAan("afbeelding.wijzigen", doe(() => kiesNieuweAfbeelding(api, recent.meld))),
    ];
    return () => afmelden.forEach((weg) => weg());
  }, [zichtbaar, api, apis.herlaad]);

  // Enginevensters (Cel splitsen, Eigenschappen, Koppeling) krijgen de focus,
  // zodat Esc en Tab erin werken.
  useEffect(() => {
    if (!zichtbaar) return;
    const wortel = zichtbaarElement<HTMLElement>(".office-tekst");
    return wortel ? volgEngineVensters(wortel) : undefined;
  }, [zichtbaar]);

  // Het resultaat van Versies vergelijken opent met het deelvenster Wijzigingen.
  useEffect(() => {
    if (neemPaneelVerzoek()) wijzigingenWinkel.zet(api, { paneel: true });
  }, [api]);

  const sluit = () => {
    sluitVenster(api);
    requestAnimationFrame(() => api()?.focus());
  };
  return (
    <>
      <ZoekHost />
      {zichtbaar && wijzigingen.paneel && !zoeken && <WijzigingenPaneel />}
      {zichtbaar && <MarkeringVoorbeeld />}
      {zichtbaar && wijzigingen.vergelijken && (
        <VergelijkVenster
          sluit={() => {
            wijzigingenWinkel.zet(api, { vergelijken: false });
            requestAnimationFrame(() => api()?.focus());
          }}
        />
      )}
      {zichtbaar && open?.id.startsWith("tabel.") && <TabelVenster key={open.id} id={open.id} gegevens={open.gegevens} sluit={sluit} />}
      {zichtbaar && open?.id.startsWith("afbeelding.") && <AfbeeldingVenster key={open.id} id={open.id} sluit={sluit} />}
    </>
  );
}
