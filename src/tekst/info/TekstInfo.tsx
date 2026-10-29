/**
 * Open Tekst Studio: statusbalk-extra’s (taal, bijhouden, weergave),
 * Bestand › Info met documenteigenschappen, Document inspecteren,
 * het taalvenster en de leesmodus (#23/#28).
 */
import { useEffect, useRef, useState } from "react";
import { useDocxCommand, type DocxEditorRef } from "@betteroffice/docx-react";
import { useEditorApi, useEditorZichtbaar } from "../../lint/editorApi";
import { useOpmaak } from "../../i18n/opmaak";
import { InfoVenster } from "./InfoVenster";
import { InspectieVenster } from "./InspectieVenster";
import { Leesmodus } from "./Leesmodus";
import { noteerActiviteit } from "./opslaan";
import { TaalVenster } from "./TaalVenster";
import { taalNaam, taalOpCursor } from "./taal";
import {
  meldVerdwenen,
  meldZichtbaar,
  publiceerTekstExtra,
  useInfoVerzoek,
  useTaalAansluiting,
  type Weergave,
} from "./winkel";
import "./info.css";

export type InfoDialoog = "info" | "inspecteren" | "taal" | null;

/** Volgt selectie en inhoud van de (steeds opnieuw gemounte) editor. */
function useEditorVolgen(api: () => DocxEditorRef | null, opWijziging: (soort: "selectie" | "inhoud") => void) {
  const recent = useRef(opWijziging);
  recent.current = opWijziging;
  useEffect(() => {
    let gekoppeld: DocxEditorRef | null = null;
    let opruimen: (() => void)[] = [];
    const koppel = () => {
      const ref = api();
      if (ref === gekoppeld) return;
      opruimen.forEach((weg) => weg());
      opruimen = [];
      gekoppeld = ref;
      if (!ref) return;
      opruimen = [
        ref.onSelectionChange(() => recent.current("selectie")),
        ref.onContentChange(() => recent.current("inhoud")),
      ];
      recent.current("selectie");
    };
    koppel();
    const poging = setInterval(koppel, 600);
    return () => {
      clearInterval(poging);
      opruimen.forEach((weg) => weg());
    };
  }, [api]);
}

export function TekstInfo() {
  const apis = useEditorApi();
  const api = apis.tekst;
  const herlaad = apis.herlaad ?? null;
  const zichtbaar = useEditorZichtbaar();
  const modus = useDocxCommand("editingMode");
  const eigenaar = useRef({}).current;
  const [dialoog, setDialoog] = useState<InfoDialoog>(null);
  const [weergave, setWeergave] = useState<Weergave>("afdruk");
  const [taal, setTaal] = useState<string | null>(null);
  const aansluiting = useTaalAansluiting();
  // Taalnamen in de interfacetaal; een taalwissel publiceert opnieuw.
  const { locale } = useOpmaak();
  const verzoek = useInfoVerzoek();
  const gezien = useRef(verzoek?.n ?? 0);
  // Vanuit Bestand › Info: na herladen terug naar het document.
  const [terug, setTerug] = useState<(() => void) | undefined>(undefined);

  useEditorVolgen(api, (soort) => {
    const ref = api();
    if (!ref) return;
    if (soort === "inhoud" && herlaad) noteerActiviteit(herlaad);
    const info = ref.getSelectionInfo();
    setTaal(taalOpCursor(ref.getDocument(), info?.paraId, info?.before.length ?? 0));
  });

  // Bestand › Info opent voor het laatst zichtbare tekstdocument.
  useEffect(() => {
    if (zichtbaar) meldZichtbaar(eigenaar);
  }, [zichtbaar]);
  useEffect(() => () => meldVerdwenen(eigenaar), []);
  useEffect(() => {
    if (!verzoek || verzoek.n === gezien.current) return;
    gezien.current = verzoek.n;
    if (verzoek.eigenaar !== eigenaar) return;
    setTerug(() => verzoek.terug);
    setDialoog("info");
  }, [verzoek]);

  const bijhouden = modus.state.enabled ? modus.state.value === "suggesting" : null;
  useEffect(() => {
    if (!zichtbaar) {
      publiceerTekstExtra(eigenaar, null);
      return;
    }
    publiceerTekstExtra(eigenaar, {
      taal: taal ? { code: taal, naam: taalNaam(taal, locale) } : null,
      kiesTaal: () => (aansluiting.kiesTaal ? aansluiting.kiesTaal(taal) : setDialoog("taal")),
      bijhouden,
      wisselBijhouden: () =>
        void modus.execute({ mode: bijhouden ? "editing" : "suggesting" }),
      weergave,
      zetWeergave: setWeergave,
    });
  }, [zichtbaar, taal, bijhouden, weergave, aansluiting, locale]);
  useEffect(() => () => publiceerTekstExtra(eigenaar, null), []);

  const sluit = () => {
    setDialoog(null);
    setTerug(undefined);
    requestAnimationFrame(() => api()?.focus());
  };
  const naHerladen = () => {
    terug?.();
    sluit();
  };
  return (
    <>
      {dialoog === "info" && (
        <InfoVenster api={api} herlaad={herlaad} sluit={sluit} inspecteren={() => setDialoog("inspecteren")} />
      )}
      {dialoog === "inspecteren" && (
        <InspectieVenster api={api} herlaad={herlaad} sluit={sluit} naHerladen={naHerladen} />
      )}
      {dialoog === "taal" && <TaalVenster huidig={taal} api={api} herlaad={herlaad} sluit={sluit} />}
      {weergave === "lees" && zichtbaar && <Leesmodus api={api} sluit={() => setWeergave("afdruk")} />}
    </>
  );
}
