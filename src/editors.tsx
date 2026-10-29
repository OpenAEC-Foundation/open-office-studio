import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocxEditor, type DocxEditorRef } from "@betteroffice/docx-react";
import { configureDefaultFonts } from "@betteroffice/docx/layout";
import { XlsxEditor, type XlsxEditorApi } from "@betteroffice/xlsx-react";
import { PptxEditor, type PptxEditorApi } from "@betteroffice/pptx-react";
import type { PptxFontFace } from "@betteroffice/pptx";
import "@betteroffice/docx-react/styles.css";
import { useTranslation } from "react-i18next";
import i18next from "./i18n/config";
import {
  TekstRibbon,
  RekenbladRibbon,
  PresentatieRibbon,
} from "./editor-ribbons";
import { RibbonFout } from "./Ribbon";
import { useEngineVertaling } from "./i18n/engine";
import { RekenbladKoppen } from "./RekenbladKoppen";
import {
  EditorApi,
  EditorZichtbaar,
  registreerWijziging,
} from "./lint/editorApi";
import { useNederlandseInvoer } from "./useNederlandseInvoer";
import { useHerladen } from "./grafieken/ui/herladen";
import { werkEigenschappenBij } from "./tekst/info/opslaan";
import { koppelEditor } from "./export/editorKoppeling";
import { lettertypeModule } from "./lettertypen/provider";
import { laadSysteemLettertypen } from "./lettertypen/systeem";
import { lettertypeBasis } from "./lettertypen/catalogus";
import { DocumentLettertypen } from "./lettertypen/context";
import { tekstSelectiePlugin } from "./lettertypen/koppeling";
import { installeerFontCitering } from "./lettertypen/canvasFont";
import { useTekstSpelling } from "./spelling/tekst/useTekstSpelling";
import { TEKST_PLUGINS } from "./tekst/gedeeld/markering";
import { auteur } from "./tekst/gedeeld/engine";

const PRESENTATIE_PLUGINS = [tekstSelectiePlugin];
import { usePresentatieStatus, useRekenbladStatus } from "./status/useEditorStatus";
// Meegeleverde en extra lettertypen, aangevuld met die van deze computer (#22).
// Relatief aan de app, zodat een build onder een submap ze ook vindt (#109).
configureDefaultFonts({
  fonts: lettertypeModule,
  baseUrl: lettertypeBasis(),
});
void laadSysteemLettertypen();
// "Source Serif 4" e.d. alleen geldig tussen aanhalingstekens op het canvas.
installeerFontCitering();
export type Soort = "docx" | "xlsx" | "pptx";
export interface EditorProps {
  soort: Soort;
  bytes: Uint8Array;
  naam: string;
  gewijzigd: () => void;
  fout: (f: Error) => void;
  /** Melding rechtsonder met een eigen toon; zonder valt het terug op `fout`. */
  melding?: (tekst: string, toon: "info" | "waarschuwing") => void;
  registreer: (opslaan: (() => Promise<Uint8Array>) | null) => void;
  opslaan: () => void;
  bestandsmenu: () => void;
  inactief: boolean;
  /** Onwaar als dit document in een verborgen tabblad staat. */
  zichtbaar?: boolean;
  /** Actuele documentzoom voor de statusbalk; null zolang onbekend. */
  zoom: (zoom: number | null) => void;
}
export default function OfficeEditor(props: EditorProps) {
  // Engine-teksten in de interfacetaal; wisselt live mee zonder het document te herladen.
  const engineTaal = useEngineVertaling();
  const { t } = useTranslation("shell");
  const docx = useRef<DocxEditorRef>(null);
  const exporteren = useRef(false);
  const [fontFaces, setFontFaces] = useState<PptxFontFace[]>([]);
  const [documentLettertypen, setDocumentLettertypen] = useState<readonly string[]>([]);
  const [liniaal, setLiniaal] = useState(true);
  const [navigatie, setNavigatie] = useState(false);
  const [documentGereed, setDocumentGereed] = useState(false);
  const rekenbladHost = useRef<HTMLDivElement>(null);
  const [rekenbladApi, setRekenbladApi] = useState<XlsxEditorApi | null>(null);
  const [diaBreedte, setDiaBreedte] = useState<number>();
  const [presentatieApi, setPresentatieApi] = useState<PptxEditorApi | null>(
    null,
  );
  const stopDiaWijzigingen = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDiaWijzigingen.current?.(), []);
  const recent = useRef(props);
  recent.current = props;
  const meldEditor = (tekst: string, toon: "info" | "waarschuwing") =>
    recent.current.melding
      ? recent.current.melding(tekst, toon)
      : recent.current.fout(new Error(tekst));
  // Grafieken bewerken het pakket zelf en laden de editor daarna opnieuw.
  const herladen = useHerladen({
    bytes: props.bytes,
    gewijzigd: () => recent.current.gewijzigd(),
    // De oude engine-handles worden bij het hermounten opgeruimd; niemand mag ze dan nog lezen.
    voorVervangen: () => {
      setDocumentGereed(false);
      setRekenbladApi(null);
      setPresentatieApi(null);
    },
    serialiseer: async () => {
      if (props.soort === "xlsx") {
        if (!rekenbladApi) throw new Error(i18next.t("shell:errors.spreadsheetNotReady"));
        await rekenbladApi.version();
        return rekenbladApi.save();
      }
      if (props.soort === "pptx") {
        if (!presentatieApi)
          throw new Error(i18next.t("shell:errors.presentationNotReady"));
        await presentatieApi.flushPendingInput();
        return presentatieApi.save();
      }
      if (!docx.current?.getDocument())
        throw new Error(i18next.t("shell:errors.documentNotReady"));
      exporteren.current = true;
      try {
        await docx.current.flushPendingInput();
        const bytes = await docx.current.save();
        if (!bytes) throw new Error(i18next.t("shell:errors.documentSaveFailed"));
        // Wachtende eigenschappen uit Bestand › Info gaan mee door het herladen.
        return werkEigenschappenBij(herladenRecent.current.api, docx.current, new Uint8Array(bytes), false);
      } finally {
        exporteren.current = false;
      }
    },
  });
  const herladenRecent = useRef(herladen);
  herladenRecent.current = herladen;
  const apis = useMemo(
    () => ({
      tekst: () => docx.current,
      rekenblad: rekenbladApi,
      presentatie: presentatieApi,
      herlaad: herladen.api,
      grafiekSelectie: herladen.grafiekSelectie,
    }),
    [rekenbladApi, presentatieApi, herladen.api, herladen.grafiekSelectie],
  );
  useNederlandseInvoer(rekenbladHost, rekenbladApi);
  // Spellingcontrole en autocorrectie (#21): golflijnen, menu, F7, statusbalk.
  const spelling = useTekstSpelling(
    () => docx.current,
    props.soort === "docx" && props.zichtbaar !== false,
    () => herladenRecent.current.bytes,
  );
  const tekstPlugins = useMemo(() => [...TEKST_PLUGINS, ...spelling.plugins], [spelling.plugins]);
  // Tekst: wijzigingen buiten de engine (zoals Bestand › Info) als gewijzigd melden.
  useEffect(
    () => registreerWijziging(herladen.api, () => recent.current.gewijzigd()),
    [herladen.api],
  );
  // Selectie en huidige dia voor de statusbalk.
  useRekenbladStatus(rekenbladApi, props.zichtbaar !== false);
  usePresentatieStatus(presentatieApi, props.zichtbaar !== false);
  // Opslaan als gebruikt het actieve blad, de huidige dia en het afdrukvenster.
  useEffect(() => {
    if (props.zichtbaar === false) return;
    return koppelEditor(
      props.soort,
      {
        tekst: documentGereed ? docx.current : null,
        rekenblad: rekenbladApi,
        presentatie: presentatieApi,
        herlaad: herladen.api,
      },
      props.naam,
    );
  }, [
    props.soort,
    props.zichtbaar,
    props.naam,
    documentGereed,
    rekenbladApi,
    presentatieApi,
    herladen.api,
  ]);
  const zoomKoppeling = useMemo(
    () => ({
      sleutel: `${props.soort}:${props.naam}:${props.bytes.byteLength}`,
      melden: (zoom: number | null) => recent.current.zoom(zoom),
    }),
    [props.soort, props.naam, props.bytes],
  );
  useEffect(() => {
    if (props.soort !== "docx" || !documentGereed) return;
    props.registreer(async () => {
      if (!docx.current?.getDocument())
        throw new Error(i18next.t("shell:errors.documentNotReady"));
      exporteren.current = true;
      try {
        const bytes = await docx.current.save();
        if (!bytes) throw new Error(i18next.t("shell:errors.documentSaveFailed"));
        // docProps (Bestand › Info, statistieken, bewerkingstijd) bijwerken.
        return werkEigenschappenBij(herladen.api, docx.current, new Uint8Array(bytes), true);
      } finally {
        exporteren.current = false;
      }
    });
    // Browser: één onzichtbare proef-opslag laadt de WASM die de engine pas bij
    // opslaan ophaalt, zodat opslaan ook na een nieuwe uitrol blijft werken.
    let proef = 0;
    if (!("__TAURI_INTERNALS__" in window))
      proef = window.setTimeout(() => {
        if (exporteren.current || !docx.current?.getDocument()) return;
        exporteren.current = true;
        void Promise.resolve(docx.current.save())
          .catch(() => {
            // Alleen een voorbereiding; echte fouten verschijnen bij opslaan.
          })
          .finally(() => {
            exporteren.current = false;
          });
      }, 2500);
    return () => {
      window.clearTimeout(proef);
      props.registreer(null);
    };
  }, [documentGereed]);
  // Lettertypen van het document: vervangers voor wat hier ontbreekt, met een
  // melding; de presentatie-engine krijgt de lettertypebestanden zelf.
  useEffect(() => {
    let actief = true;
    void (async () => {
      const lt = await import("./lettertypen/document");
      const { vervangingsMelding } = await import("./lettertypen/vervanging");
      let info: Awaited<ReturnType<typeof lt.documentLettertypen>> = { namen: [], vervangingen: [] };
      try {
        info = await lt.documentLettertypen(props.bytes);
      } catch {
        // Zonder inventaris: alleen de standaardvervanging (Calibri → Carlito).
      }
      if (actief) setDocumentLettertypen(info.namen);
      if (props.soort === "pptx") {
        const faces = await lt.presentatieLettertypen(info);
        if (actief) setFontFaces(faces);
      }
      if (props.soort === "xlsx") await lt.registreerVervangers(info);
      const melding = vervangingsMelding(info.vervangingen);
      // Metrisch gelijke vervangers veranderen de opmaak niet: alleen ter
      // informatie. Een benadering kan regels laten verschuiven: blijft staan.
      const toon = info.vervangingen.some((v) => v.soort === "benadering")
        ? "waarschuwing"
        : "info";
      if (melding && actief) meldEditor(melding, toon);
    })().catch((e) => {
      if (actief) recent.current.fout(e);
    });
    return () => {
      actief = false;
    };
  }, []);
  const gereedXlsx = useCallback(
    (api: XlsxEditorApi) => {
      setRekenbladApi(api);
      const stopWijziging = registreerWijziging(api.handle, () =>
        recent.current.gewijzigd(),
      );
      // De engine rekent stil opnieuw en laat onbekende functies op hun oude
      // uitkomst staan; meld dat vóór de eerste bewerking.
      void import("./rekenbladcontrole")
        .then(
          ({
            inventariseerRekenblad,
            vergelijkCache,
            leesUitWerkboek,
            rekenbladMelding,
          }) => {
            const controle = inventariseerRekenblad(recent.current.bytes);
            const melding = rekenbladMelding(
              controle,
              vergelijkCache(controle, leesUitWerkboek(api.handle, controle)),
            );
            if (melding?.ernst === "waarschuwing")
              meldEditor(
                `${melding.titel}. ${melding.regels.join(" ")}`,
                "waarschuwing",
              );
          },
        )
        .catch(() => {
          // Een mislukte controle mag het openen niet blokkeren.
        });
      props.registreer(async () => {
        await api.version();
        return api.save();
      });
      herladenRecent.current.naXlsx(api);
      return () => {
        stopWijziging();
        setRekenbladApi(null);
        props.registreer(null);
      };
    },
    [props.registreer],
  );
  const gereedPptx = useCallback(
    (api: PptxEditorApi) => {
      // EMU naar CSS-pixels bij 96 dpi.
      setDiaBreedte(api.handle.snapshot().widthEmu / 9525);
      setPresentatieApi(api);
      // Directe engine-bewerkingen uit het lint lopen buiten onChange om.
      stopDiaWijzigingen.current?.();
      stopDiaWijzigingen.current = api.handle.onUpdate((_, herkomst) => {
        if (herkomst === "local") recent.current.gewijzigd();
      });
      props.registreer(async () => {
        await api.flushPendingInput();
        return api.save();
      });
    },
    [props.registreer],
  );
  if (props.soort === "docx")
    return (
      <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
        <EditorApi.Provider value={apis}>
          <DocumentLettertypen.Provider value={documentLettertypen}>
          <EditorZichtbaar.Provider value={props.zichtbaar ?? true}>
            <DocxEditor
              key={herladen.sleutel}
              ref={docx}
              documentBuffer={herladen.bytes}
              showFileOpen={false}
              showHelpMenu={false}
              plugins={tekstPlugins}
              pluginGrants={spelling.grants}
              onPluginError={spelling.pluginFout}
              downloadOnSave={false}
              // Naam bij opmerkingen en bijgehouden wijzigingen (Instellingen), niet "User".
              author={auteur()}
              onSave={() => {
                if (!exporteren.current) props.opslaan();
              }}
              onChange={props.gewijzigd}
              onError={props.fout}
              rulerUnit="cm"
              onFirstPagePainted={() => {
                setDocumentGereed(true);
                herladenRecent.current.naDocx(docx.current);
              }}
              loadingIndicator={
                <p className="office-loading">{t("loading.document")}</p>
              }
              showRuler={liniaal}
              showOutline={navigatie}
              showOutlineButton={false}
              colorMode="light"
              i18n={engineTaal.tekst}
              className="office-tekst"
              readOnly={props.inactief}
              toolbar={
                <TekstRibbon
                  bestand={props.bestandsmenu}
                  liniaal={liniaal}
                  navigatie={navigatie}
                  wijzigLiniaal={() => setLiniaal(!liniaal)}
                  wijzigNavigatie={() => setNavigatie(!navigatie)}
                  zoomKoppeling={zoomKoppeling}
                />
              }
            />
            {spelling.element}
          </EditorZichtbaar.Provider>
          </DocumentLettertypen.Provider>
        </EditorApi.Provider>
      </RibbonFout.Provider>
    );
  if (props.soort === "xlsx")
    return (
      <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
        <EditorApi.Provider value={apis}>
          <DocumentLettertypen.Provider value={documentLettertypen}>
          <EditorZichtbaar.Provider value={props.zichtbaar ?? true}>
            <div className="office-rekenblad-host" ref={rekenbladHost}>
              <XlsxEditor
                key={herladen.sleutel}
                file={herladen.bytes}
                plugins={herladen.plugins}
                fileName={props.naam}
                onReady={gereedXlsx}
                onChange={props.gewijzigd}
                onSave={props.opslaan}
                i18n={engineTaal.rekenblad}
                className="office-rekenblad"
                readOnly={props.inactief}
                toolbar={
                  <RekenbladRibbon
                    bestand={props.bestandsmenu}
                    zoomKoppeling={zoomKoppeling}
                  />
                }
              />
              <RekenbladKoppen host={rekenbladHost} api={rekenbladApi} />
            </div>
          </EditorZichtbaar.Provider>
          </DocumentLettertypen.Provider>
        </EditorApi.Provider>
      </RibbonFout.Provider>
    );
  if (!fontFaces.length) return <p role="status">{t("loading.fonts")}</p>;
  return (
    <RibbonFout.Provider value={(bericht) => props.fout(new Error(bericht))}>
      <EditorApi.Provider value={apis}>
          <DocumentLettertypen.Provider value={documentLettertypen}>
        <EditorZichtbaar.Provider value={props.zichtbaar ?? true}>
          <PptxEditor
            key={herladen.sleutel}
            file={herladen.bytes}
            initialSlide={herladen.dia}
            fileName={props.naam}
            fonts={fontFaces}
            plugins={PRESENTATIE_PLUGINS}
            onReady={gereedPptx}
            onChange={props.gewijzigd}
            onError={props.fout}
            onSave={props.opslaan}
            i18n={engineTaal.dia}
            className="office-presentatie"
            readOnly={props.inactief}
            toolbar={
              <PresentatieRibbon
                bestand={props.bestandsmenu}
                zoomKoppeling={zoomKoppeling}
                diaBreedte={diaBreedte}
              />
            }
          />
        </EditorZichtbaar.Provider>
        </DocumentLettertypen.Provider>
        </EditorApi.Provider>
    </RibbonFout.Provider>
  );
}
