import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocxEditor, type DocxEditorRef } from "@betteroffice/docx-react";
import { configureDefaultFonts } from "@betteroffice/docx/layout";
import { XlsxEditor, type XlsxEditorApi } from "@betteroffice/xlsx-react";
import { PptxEditor, type PptxEditorApi } from "@betteroffice/pptx-react";
import { PresentatieOpenwijze } from "./presentatie/PresentatieOpenwijze";
import { werkDianummersBij } from "./presentatie/dianummers";
import { metRijkeNotities } from "./presentatie/notitiesSessie";
import { RijkeNotitiesPaneel } from "./presentatie/RijkeNotitiesPaneel";
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
import { bereidStructuurBeveiliging } from "./rekenblad/structuurbeveiliging";
import { installeerValidatie } from "./rekenblad/gegevensvalidatie";
import { laadTabellen } from "./rekenblad/tabellen";
import { bereidTabelweergave } from "./rekenblad/tabelweergave";
import { metValidatieAnkers } from "./rekenblad/validatieAnkers";
import { installeerBladBeveiliging, installeerBeveiligdeSelectie } from "./rekenblad/bladbeveiliging";
import { bereidVoorwaardelijkeWeergave } from "./rekenblad/voorwaardelijke-weergave";
import { bereidBladEigenschappen } from "./rekenblad/bladEigenschappen";
import { bereidGroepen } from "./rekenblad/groepsbediening";
import { metBeginregio } from "./rekenblad/werkmapregio";
import { intlLocale } from "./i18n/config";
import { useHerladen } from "./grafieken/ui/herladen";
import { laadFiltersUitBestand, maakRekenbladLaag } from "./lint/rekenblad-laag";
import { werkboekBytes } from "./lint/rekenblad-filter";
import { laadCelnotities, metCelnotitieAnkers } from "./rekenblad/celnotitieAnkers";
import { werkEigenschappenBij } from "./tekst/info/opslaan";
import { registreerVeldNaam, werkDocumentVeldenBij } from "./tekst/veldenDocument/opdrachten";
import type { Serialiseerder } from "./opslag";
import { koppelEditor } from "./export/editorKoppeling";
import { lettertypeModule } from "./lettertypen/provider";
import { laadSysteemLettertypen } from "./lettertypen/systeem";
import { lettertypeBasis } from "./lettertypen/catalogus";
import { DocumentLettertypen } from "./lettertypen/context";
import { tekstSelectiePlugin } from "./lettertypen/koppeling";
import { installeerFontCitering } from "./lettertypen/canvasFont";
import { useTekstSpelling } from "./spelling/tekst/useTekstSpelling";
import { TEKST_PLUGINS } from "./tekst/gedeeld/markering";
import { useAuteur } from "./auteursprofiel";
import { herstelLijstvervolg } from "./tekst/lijst/vervolg";
import { laadTekenobjecten, metTekenAnkers } from "./rekenblad/tekenAnkers";
import { maakMarkeringenPlugin } from "./tekst/pagina/Markeringen";
import { bereidTekstOpslagVoor } from "./tekst/gedeeld/opslagvoorbereiding";

const PRESENTATIE_PLUGINS = [tekstSelectiePlugin];
import { usePresentatieStatus, useRekenbladStatus } from "./status/useEditorStatus";
import { noteerDiaAantal } from "./status/diatelling";
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
  registreer: (opslaan: Serialiseerder | null) => void;
  opslaan: () => void;
  bestandsmenu: () => void;
  inactief: boolean;
  /** Onwaar als dit document in een verborgen tabblad staat. */
  zichtbaar?: boolean;
  voorstellingBijOpenen?: boolean;
  voorstellingKeuzeGedaan?: () => void;
  /** Actuele documentzoom voor de statusbalk; null zolang onbekend. */
  zoom: (zoom: number | null) => void;
  bestandKoppeling?: (adres: string) => Promise<void>;
}
// De bestaande synchrone lint-API heeft deze compatibiliteitsprojectie nodig.
// Haar vertraagde melding mag de opslagstatus niet opnieuw wijzigen.
const behoudSynchroneProjectie = () => {};

export default function OfficeEditor(props: EditorProps) {
  const auteursnaam = useAuteur();
  // Engine-teksten in de interfacetaal; wisselt live mee zonder het document te herladen.
  const engineTaal = useEngineVertaling();
  const { t } = useTranslation("shell");
  const docx = useRef<DocxEditorRef>(null);
  const stopLijstvervolg = useRef<(() => void) | null>(null);
  useEffect(() => () => stopLijstvervolg.current?.(), []);
  const exporteren = useRef(false);
  const [fontFaces, setFontFaces] = useState<PptxFontFace[]>([]);
  const [documentLettertypen, setDocumentLettertypen] = useState<readonly string[]>([]);
  const [liniaal, setLiniaal] = useState(true);
  const [navigatie, setNavigatie] = useState(false);
  const [documentGereed, setDocumentGereed] = useState(false);
  const rekenbladHost = useRef<HTMLDivElement>(null);
  const presentatieNotitieHost = useRef<HTMLDivElement>(null);
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
      stopLijstvervolg.current?.();
      stopLijstvervolg.current = null;
      setDocumentGereed(false);
      setRekenbladApi(null);
      setPresentatieApi(null);
    },
    serialiseer: async () => {
      if (props.soort === "xlsx") {
        if (!rekenbladApi) throw new Error(i18next.t("shell:errors.spreadsheetNotReady"));
        await rekenbladApi.version();
        return werkboekBytes(rekenbladApi);
      }
      if (props.soort === "pptx") {
        if (!presentatieApi)
          throw new Error(i18next.t("shell:errors.presentationNotReady"));
        await presentatieApi.flushPendingInput();
        return werkDianummersBij(await presentatieApi.save());
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
  // Filterpijlen, vulgreep en formulehulp boven het raster (#58, #62, #63).
  const rekenbladLaag = useMemo(maakRekenbladLaag, []);
  const xlsxPlugins = useMemo(() => [...herladen.plugins, rekenbladLaag.plugin], [herladen.plugins, rekenbladLaag]);
  const herladenRecent = useRef(herladen);
  herladenRecent.current = herladen;
  const apis = useMemo(
    () => ({
      tekst: () => docx.current,
      rekenblad: rekenbladApi,
      presentatie: presentatieApi,
      herlaad: herladen.api,
      grafiekSelectie: herladen.grafiekSelectie,
      rekenbladLaag,
      bestandKoppeling: async (adres: string) => {
        if (!recent.current.bestandKoppeling) throw new Error("link-browser");
        return recent.current.bestandKoppeling(adres);
      },
    }),
    [rekenbladApi, presentatieApi, herladen.api, herladen.grafiekSelectie, rekenbladLaag],
  );
  const beginRegio = useRef(intlLocale());
  const rekenbladBytes = useMemo(
    () => props.soort === "xlsx"
      ? metTekenAnkers(metCelnotitieAnkers(metValidatieAnkers(metBeginregio(herladen.bytes, beginRegio.current))))
      : herladen.bytes,
    [herladen.bytes, props.soort],
  );
  // Spellingcontrole en autocorrectie (#21): golflijnen, menu, F7, statusbalk.
  const spelling = useTekstSpelling(
    () => docx.current,
    props.soort === "docx" && props.zichtbaar !== false,
    () => herladenRecent.current.bytes,
  );
  useEffect(() => {
    if (props.soort === "docx" && documentGereed && docx.current) {
      const ref = docx.current;
      let actief = true;
      void ref.flushPendingInput().then(() => { if (actief) registreerVeldNaam(ref, props.naam, herladen.api, herladen.bytes); }).catch(e => { if (actief) recent.current.fout(e); });
      return () => { actief = false; };
    }
  }, [props.soort, props.naam, documentGereed, herladen.sleutel]);
  const markeringenPlugin = useMemo(() => maakMarkeringenPlugin(() => docx.current), []);
  const tekstPlugins = useMemo(() => [...TEKST_PLUGINS, markeringenPlugin, ...spelling.plugins], [spelling.plugins, markeringenPlugin]);
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
    let actief = true;
    const ref = docx.current;
    // De eerste pagina kan al getekend zijn vóór de synchrone sessie gereed
    // is. Wacht daarom op dezelfde invoergrens als de lintbewerkingen.
    void ref?.flushPendingInput().then(() => {
      if (!actief) return;
      const sessie = docx.current?.getEditorRef()?.getYrsSession();
      stopLijstvervolg.current?.();
      stopLijstvervolg.current = sessie ? herstelLijstvervolg(sessie) : null;
    }).catch((fout) => recent.current.fout(fout));
    return () => {
      actief = false;
      stopLijstvervolg.current?.();
      stopLijstvervolg.current = null;
    };
  }, [documentGereed, herladen.sleutel, props.soort]);
  useEffect(() => {
    if (props.soort !== "docx" || !documentGereed) return;
    props.registreer(Object.assign(async () => {
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
    }, {
      bereidVoor: async () => {
        const ref = docx.current;
        if (!ref) throw new Error(i18next.t("shell:errors.documentNotReady"));
        await ref.flushPendingInput();
        await werkDocumentVeldenBij(ref);
      },
    }));
    // Laad de opslagafhankelijkheden vooraf, ook voor later offline opslaan.
    // Een groot gebruikersdocument hiervoor serialiseren onderbreekt invoer.
    let proef = 0;
    if (!("__TAURI_INTERNALS__" in window))
      proef = window.setTimeout(() => {
        void bereidTekstOpslagVoor()
          .catch(() => {
            // Alleen een voorbereiding; echte fouten verschijnen bij opslaan.
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
      bereidStructuurBeveiliging(api.handle, herladenRecent.current.bytes);
      installeerValidatie(api.handle, herladenRecent.current.bytes);
      installeerBladBeveiliging(api.handle, herladenRecent.current.bytes);
      installeerBeveiligdeSelectie(api);
      try {
        laadTabellen(api.handle, herladenRecent.current.bytes);
        bereidTabelweergave(api.handle, herladenRecent.current.bytes);
      } catch {
        // Source XML remains in the package if table metadata cannot be read.
      }
      try {
        laadCelnotities(api.handle, api.save());
      } catch {
        // Een onleesbare notitie blokkeert het raster niet.
      }
      bereidBladEigenschappen(api.handle, herladenRecent.current.bytes);
      bereidVoorwaardelijkeWeergave(api.handle);
      bereidGroepen(api.handle, herladenRecent.current.bytes);
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
        return werkboekBytes(api);
      });
      laadFiltersUitBestand(api, herladenRecent.current.bytes);
      laadTekenobjecten(api.handle, herladenRecent.current.bytes);
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
    (nativeApi: PptxEditorApi) => {
      const api = metRijkeNotities(
        nativeApi,
        herladenRecent.current.bytes,
        () => recent.current.gewijzigd(),
      );
      // EMU naar CSS-pixels bij 96 dpi.
      const snapshot = api.handle.snapshot();
      noteerDiaAantal(api.handle, snapshot.slides.length);
      setDiaBreedte(snapshot.widthEmu / 9525);
      setPresentatieApi(api);
      // Directe engine-bewerkingen uit het lint lopen buiten onChange om.
      stopDiaWijzigingen.current?.();
      stopDiaWijzigingen.current = api.handle.onUpdate((_, herkomst) => {
        if (herkomst === "local") recent.current.gewijzigd();
      });
      props.registreer(async () => {
        await api.flushPendingInput();
        return werkDianummersBij(await api.save());
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
              legacySyncApi
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
              author={auteursnaam || i18next.t("writer:general.unknownAuthor")}
              onSave={() => {
                if (!exporteren.current) props.opslaan();
              }}
              // De oude Document-projectie meldt dezelfde invoer soms pas na
              // opslaan. De versiemelding hoort bij de bevestigde bewerking.
              onChange={behoudSynchroneProjectie}
              onDocumentChange={props.gewijzigd}
              onError={props.fout}
              rulerUnit="cm"
              onFirstPagePainted={() => {
                setDocumentGereed(true);
                herladenRecent.current.naDocx(docx.current);
              }}
              loadingIndicator={
                <p className="office-loading">{t("loading.document")}</p>
              }
              // Eigen liniaal (src/tekst/liniaal) in plaats van die van de engine.
              showRuler={false}
              showOutline={navigatie}
              showOutlineButton={false}
              colorMode="light"
              i18n={engineTaal.tekst}
              className="office-tekst"
              // Het tabpaneel blokkeert invoer met inert. Een verborgen editor
              // moet zijn bewerksessie houden: readOnly kiest een viewer zonder
              // de synchrone document-API die het eigen lint gebruikt.
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
                legacySyncApi
                file={rekenbladBytes}
                plugins={xlsxPlugins}
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
          <div className="office-presentatie-notitiehost" ref={presentatieNotitieHost}>
          <PptxEditor
            legacySyncApi
            key={herladen.sleutel}
            file={herladen.bytes}
            initialSlide={herladen.dia}
            fileName={props.naam}
            fonts={fontFaces}
            plugins={PRESENTATIE_PLUGINS}
            onReady={gereedPptx}
            onChange={(snapshot) => {
              noteerDiaAantal(presentatieApi?.handle, snapshot.slides.length);
              props.gewijzigd();
            }}
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
          {presentatieApi && (
            <RijkeNotitiesPaneel
              api={presentatieApi}
              host={presentatieNotitieHost}
              opslaan={props.opslaan}
            />
          )}
          </div>
          {presentatieApi && (
            <PresentatieOpenwijze
              api={presentatieApi}
              vraag={!!props.voorstellingBijOpenen}
              zichtbaar={props.zichtbaar ?? true}
              klaar={props.voorstellingKeuzeGedaan}
            />
          )}
        </EditorZichtbaar.Provider>
        </DocumentLettertypen.Provider>
        </EditorApi.Provider>
    </RibbonFout.Provider>
  );
}
