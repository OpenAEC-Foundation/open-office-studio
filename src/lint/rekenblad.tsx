import { useContext, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import {
  useXlsxCommand,
  EditorToolbar as RekenbladToolbar,
  ToolbarCommand as RekenbladControl,
  type XlsxCommandArgs,
  type XlsxCommandId,
  type XlsxEditorApi,
} from "@betteroffice/xlsx-react";
import {
  Bold,
  Italic,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  IndentIncrease,
  IndentDecrease,
  Type,
  Printer,
  Percent,
  Euro,
  Paintbrush,
  PaintBucket,
  Grid2X2,
  WrapText,
  Download,
  Scissors,
  Copy,
  ClipboardPaste,
  Search,
  Compass,
  ArrowUpAZ,
  ArrowDownZA,
  Sigma,
  CalendarDays,
  Clock,
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  BetweenVerticalStart,
  BetweenVerticalEnd,
  Trash2,
  EyeOff,
  Eye,
  SquarePlus,
  PenLine,
  ChevronLeft,
  ChevronRight,
  Snowflake,
  PanelTop,
  PanelLeft,
  ArrowDownToLine,
  Hash,
  FlaskConical,
  Baseline,
  Filter,
  FilterX,
  RefreshCw,
  ArrowDownUp,
  ArrowRightToLine,
  ListOrdered,
  ClipboardList,
  MoveHorizontal,
  MoveVertical,
  ArrowLeftRight,
  SlidersHorizontal,
  Files,
  type LucideIcon,
} from "lucide-react";
import {
  Ribbon,
  Groep,
  Actie,
  OpdrachtKleur,
  OpdrachtGetal,
  OpdrachtKnop,
  RibbonFout,
} from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { C, CK, CL, Geschiedenis, Zoom } from "./gedeeld";
import { useEditorApi, zichtbaarElement } from "./editorApi";
import { useSneltoetsen, type Sneltoets } from "./sneltoetsen";
import { OPDRACHTEN } from "./sneltoetsenlijst";
import { heeftOpdracht, meldOpdrachtAan, voerOpdrachtUit } from "../tekst/menu/opdrachten";
import {
  alleenLezen,
  autoSomInvoegen,
  bewerktTekst,
  bladInvoegen,
  datumnotatie,
  datumTijdInvoegen,
  fixeren,
  gaNaarBlad,
  kolommenInvoegen,
  kolommenVerwijderen,
  kolommenZichtbaarheid,
  rekenbladHost,
  rijenInvoegen,
  rijenVerwijderen,
  rijenZichtbaarheid,
} from "./rekenblad-opdrachten";
import {
  doorvoeren,
  filterAanUit,
  filterOpnieuw,
  snelSorteren,
  wisFilters,
} from "./rekenblad-gegevens";
import { abonneerFilters, bladFilter, heeftCriteria } from "./rekenblad-filter";
import { ReeksVenster, SorteerVenster } from "./rekenblad-vensters";
import {
  Formulebalk,
  FunctieVenster,
  invoegplek,
  useFormuleHulp,
  type Invoegplek,
} from "./rekenblad-formulebalk";
import { BladHernoemen, GaNaar, ZoekenVervangen } from "./rekenblad-dialogen";
import {
  Grafiekontwerp,
  RekenbladGrafiekGroep,
  useRekenbladGrafieken,
} from "../grafieken/ui/rekenblad";
import "./rekenblad.css";
import { openRekenbladVenster, RekenbladExtra } from "../rekenblad/RekenbladExtra";
import { kopieer, leesKlembord, plak } from "../rekenblad/klembord";
import { optimaleBreedte, optimaleHoogte } from "../rekenblad/structuur";
import { valutaNotatie } from "../rekenblad/notatieOpdrachten";

type Paneel = "zoeken" | "ganaar" | "hernoemen" | "sorteren" | "reeks" | null;

function useStand(api: XlsxEditorApi | null) {
  const [, ververs] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!api) return;
    const stopOpdrachten = api.commands.subscribe(ververs);
    const stopWijzigingen = api.handle.onUpdate(() => ververs());
    const stopFilters = abonneerFilters(api.handle, ververs);
    return () => {
      stopOpdrachten();
      stopWijzigingen();
      stopFilters();
    };
  }, [api]);
  if (!api) return null;
  const info = api.handle.sheetInfo();
  const filter = bladFilter(api.handle, info.activeSheet);
  return {
    bladen: info.sheetNames.length,
    actief: info.activeSheet,
    bevroren: info.frozenRows + info.frozenCols > 0,
    schrijfbaar: !alleenLezen(api),
    filter: !!filter,
    gefilterd: heeftCriteria(filter),
  };
}

function useUitvoerder() {
  const api = useEditorApi().rekenblad;
  const fout = useContext(RibbonFout);
  return (actie: (api: XlsxEditorApi) => unknown) => {
    if (!api) return;
    Promise.resolve()
      .then(() => actie(api))
      .catch((e) => fout(e instanceof Error ? e.message : String(e)));
  };
}

function A({
  naam,
  icoon,
  toets,
  groot,
  uit,
  doe,
}: {
  naam: string;
  icoon: LucideIcon;
  toets?: string;
  groot?: boolean;
  uit?: boolean;
  doe: (api: XlsxEditorApi) => unknown;
}) {
  const uitvoeren = useUitvoerder();
  const api = useEditorApi().rekenblad;
  return (
    <Actie
      naam={naam}
      icoon={icoon}
      groot={groot}
      disabled={!api || uit}
      title={toets ? `${naam} · ${toets}` : naam}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => uitvoeren(doe)}
    />
  );
}

/** Engine-opdracht met een sneltoets die wij registreren. */
function CS<K extends XlsxCommandId>({
  id,
  args,
  toets,
  ...props
}: {
  id: K;
  args?: XlsxCommandArgs[K];
  toets: string;
  naam: string;
  icoon: LucideIcon;
  groot?: boolean;
}) {
  const opdracht = useXlsxCommand(id, args);
  return (
    <OpdrachtKnop {...props} opdracht={{ ...opdracht, shortcut: toets }} />
  );
}

function RekenbladLettertype() {
  const { t } = useTranslation("ribbon");
  const grootte = useXlsxCommand("fontSize"),
    kleur = useXlsxCommand("textColor"),
    vulling = useXlsxCommand("fillColor");
  return (
    <Groep naam={t("spreadsheet.groups.font")}>
      <div className="ribbon-rij">
        <CL />
        <OpdrachtGetal
          opdracht={grootte}
          naam={t("spreadsheet.commands.fontSize")}
          args={(points) => ({ points })}
        />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <C id="bold" naam={t("spreadsheet.commands.bold")} icoon={Bold} />
        <C id="italic" naam={t("spreadsheet.commands.italic")} icoon={Italic} />
        <C id="strikethrough" naam={t("spreadsheet.commands.strikethrough")} icoon={Strikethrough} />
        <OpdrachtKleur
          opdracht={vulling}
          naam={t("spreadsheet.commands.fillColor")}
          icoon={PaintBucket}
          args={(color) => ({ color })}
        />
        <OpdrachtKleur
          opdracht={kleur}
          naam={t("spreadsheet.commands.textColor")}
          icoon={Type}
          args={(color) => ({ color })}
        />
      </div>
    </Groep>
  );
}
function RekenbladUitlijning() {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("spreadsheet.groups.alignment")}>
      <div className="ribbon-rij ribbon-iconen">
        <CS
          id="horizontalAlignment"
          args={{ value: "left" }}
          naam={t("spreadsheet.commands.alignLeft")}
          icoon={AlignLeft}
          toets="Ctrl+L"
        />
        <CS
          id="horizontalAlignment"
          args={{ value: "center" }}
          naam={t("spreadsheet.commands.center")}
          icoon={AlignCenter}
          toets="Ctrl+E"
        />
        <C
          id="horizontalAlignment"
          args={{ value: "right" }}
          naam={t("spreadsheet.commands.alignRight")}
          icoon={AlignRight}
        />
        <C
          id="textWrapping"
          args={{ value: "wrap" }}
          naam={t("spreadsheet.commands.wrapText")}
          icoon={WrapText}
        />
      </div>
      <div className="ribbon-rij">
        <CK id="verticalAlignment" naam={t("spreadsheet.commands.verticalAlignment")} />
        <CK id="merge" naam={t("spreadsheet.commands.merge")} />
      </div>
    </Groep>
  );
}
function RekenbladGetal({ uitgebreid }: { uitgebreid?: boolean }) {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("spreadsheet.groups.number")}>
      <CK id="numberFormat" naam={t("spreadsheet.commands.numberFormat")} breed />
      <div className="ribbon-rij ribbon-iconen">
        {uitgebreid && (
          <>
            <CS
              id="numberFormat"
              args={{ value: "number" }}
              naam={t("spreadsheet.commands.formatNumber")}
              icoon={Hash}
              toets="Ctrl+Shift+1"
            />
            <CS
              id="numberFormat"
              args={{ value: "scientific" }}
              naam={t("spreadsheet.commands.formatScientific")}
              icoon={FlaskConical}
              toets="Ctrl+Shift+2"
            />
            <A
              naam={t("spreadsheet.commands.formatDate")}
              icoon={CalendarDays}
              toets="Ctrl+Shift+3"
              doe={datumnotatie}
            />
          </>
        )}
        <A
          naam={t("spreadsheet.commands.formatCurrency")}
          icoon={Euro}
          toets="Ctrl+Shift+4"
          doe={valutaNotatie}
        />
        <CS
          id="numberFormat"
          args={{ value: "percent" }}
          naam={t("spreadsheet.commands.formatPercent")}
          icoon={Percent}
          toets="Ctrl+Shift+5"
        />
        {uitgebreid && (
          <CS
            id="numberFormat"
            args={{ value: "automatic" }}
            naam={t("spreadsheet.commands.formatGeneral")}
            icoon={Baseline}
            toets="Ctrl+Shift+6"
          />
        )}
        <C
          id="decimalPlaces"
          args={{ direction: "decrease" }}
          naam={t("spreadsheet.commands.decreaseDecimal")}
          icoon={IndentDecrease}
        />
        <C
          id="decimalPlaces"
          args={{ direction: "increase" }}
          naam={t("spreadsheet.commands.increaseDecimal")}
          icoon={IndentIncrease}
        />
        <A
          naam={t("spreadsheet:numberFormat.menu")}
          icoon={SlidersHorizontal}
          toets="Ctrl+1"
          doe={() => openRekenbladVenster({ soort: "getal" })}
        />
      </div>
    </Groep>
  );
}
function Klembord() {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("spreadsheet.groups.clipboard")}>
      <A
        naam={t("spreadsheet.commands.paste")}
        icoon={ClipboardPaste}
        toets="Ctrl+V"
        groot
        doe={async (api) => {
          const inhoud = await leesKlembord();
          if (inhoud) await plak(api, inhoud);
        }}
      />
      <div className="ribbon-stapel">
        <A
          naam={t("spreadsheet.commands.cut")}
          icoon={Scissors}
          toets="Ctrl+X"
          doe={(api) => kopieer(api, true)}
        />
        <A
          naam={t("spreadsheet.commands.copy")}
          icoon={Copy}
          toets="Ctrl+C"
          doe={(api) => kopieer(api)}
        />
        <A
          naam={t("spreadsheet:clipboard.pasteSpecialMenu")}
          icoon={ClipboardList}
          toets="Ctrl+Alt+V"
          doe={() => openRekenbladVenster({ soort: "plakkenSpeciaal" })}
        />
      </div>
      <C id="paintFormat" naam={t("spreadsheet.commands.formatPainter")} icoon={Paintbrush} groot />
    </Groep>
  );
}
function Cellen({ uit }: { uit: boolean }) {
  const { t } = useTranslation("ribbon");
  return (
    <>
      <Groep naam={t("spreadsheet.groups.rows")}>
        <div className="ribbon-stapel">
          <A
            naam={t("spreadsheet.commands.insertRowsAbove")}
            icoon={BetweenHorizontalStart}
            uit={uit}
            doe={(api) => rijenInvoegen(api, false)}
          />
          <A
            naam={t("spreadsheet.commands.insertRowsBelow")}
            icoon={BetweenHorizontalEnd}
            uit={uit}
            doe={(api) => rijenInvoegen(api, true)}
          />
        </div>
      </Groep>
      <Groep naam={t("spreadsheet.groups.columns")}>
        <div className="ribbon-stapel">
          <A
            naam={t("spreadsheet.commands.insertColumnsLeft")}
            icoon={BetweenVerticalStart}
            uit={uit}
            doe={(api) => kolommenInvoegen(api, false)}
          />
          <A
            naam={t("spreadsheet.commands.insertColumnsRight")}
            icoon={BetweenVerticalEnd}
            uit={uit}
            doe={(api) => kolommenInvoegen(api, true)}
          />
        </div>
      </Groep>
    </>
  );
}

export function RekenbladRibbon({
  bestand,
  zoomKoppeling,
}: {
  bestand: () => void;
  zoomKoppeling?: ZoomKoppeling;
}) {
  const { t } = useTranslation("ribbon");
  const zoom = useXlsxCommand("zoom"),
    randkleur = useXlsxCommand("borderColor");
  useDocumentZoom({
    opdracht: zoom,
    vlak: () =>
      zichtbaarElement<HTMLElement>(
        '.office-rekenblad-host [data-testid="xlsx-scroll"]',
      ),
    bereik: ".rekenblad-koppen",
    koppeling: zoomKoppeling,
  });
  const apis = useEditorApi();
  const api = apis.rekenblad;
  const laag = apis.rekenbladLaag;
  const stand = useStand(api);
  const uitvoeren = useUitvoerder();
  const fout = useContext(RibbonFout);
  const [paneel, setPaneel] = useState<Paneel>(null);
  const [functiePlek, setFunctiePlek] = useState<Invoegplek | null>(null);
  const formuleHulp = useFormuleHulp(laag, !!api);
  const functieInvoegen = () => {
    if (!api) return;
    const plek = invoegplek(api, laag, document.activeElement);
    if (plek) setFunctiePlek(plek);
  };
  const uit = !stand?.schrijfbaar;
  const grafieken = useRekenbladGrafieken();
  const sluiten = () => {
    setPaneel(null);
    api?.focus();
  };

  const opdracht =
    <K extends XlsxCommandId>(id: K, args: XlsxCommandArgs[K]) =>
    () =>
      uitvoeren(async (api) => {
        const r = await api.commands.execute(id, args);
        if (!r.ok) fout(r.failure.message);
      });
  const geenTekst = () => !bewerktTekst();
  const sneltoetsen: Sneltoets[] = [
    ["Ctrl+L", "left"],
    ["Ctrl+E", "center"],
  ].map(([toets, value]) => ({
    toets,
    beschikbaar: geenTekst,
    uitvoeren: opdracht("horizontalAlignment", {
      value: value as "left" | "center" | "right",
    }),
  }));
  (
    [
      ["1", "number"],
      ["2", "scientific"],
      ["5", "percent"],
      ["6", "automatic"],
    ] as const
  ).forEach(([cijfer, value]) =>
    sneltoetsen.push({
      toets: `Ctrl+Shift+${cijfer}`,
      beschikbaar: geenTekst,
      uitvoeren: opdracht("numberFormat", { value }),
    }),
  );
  sneltoetsen.push(
    {
      toets: "Ctrl+Shift+3",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren(datumnotatie),
    },
    {
      toets: "Ctrl+Shift+4",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren(valutaNotatie),
    },
    {
      toets: "Alt+=",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren(autoSomInvoegen),
    },
    {
      toets: "Ctrl+;",
      uitvoeren: () => uitvoeren((a) => datumTijdInvoegen(a, false)),
    },
    {
      toets: "Ctrl+Shift+;",
      uitvoeren: () => uitvoeren((a) => datumTijdInvoegen(a, true)),
    },
    {
      toets: "Ctrl+Shift+:",
      uitvoeren: () => uitvoeren((a) => datumTijdInvoegen(a, true)),
    },
    {
      toets: "Ctrl+D",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren((a) => doorvoeren(a, "omlaag")),
    },
    {
      toets: "Ctrl+R",
      beschikbaar: geenTekst,
      uitvoeren: () => uitvoeren((a) => doorvoeren(a, "rechts")),
    },
    { toets: "Shift+F3", uitvoeren: functieInvoegen },
    {
      toets: "Ctrl+PageUp",
      beschikbaar: geenTekst,
      uitvoeren: () =>
        uitvoeren((a) => gaNaarBlad(a, a.handle.sheetInfo().activeSheet - 1)),
    },
    {
      toets: "Ctrl+PageDown",
      beschikbaar: geenTekst,
      uitvoeren: () =>
        uitvoeren((a) => gaNaarBlad(a, a.handle.sheetInfo().activeSheet + 1)),
    },
    { toets: "Ctrl+H", uitvoeren: () => setPaneel("zoeken") },
    { toets: "Ctrl+F", uitvoeren: () => setPaneel("zoeken") },
    { toets: "F5", uitvoeren: () => setPaneel("ganaar") },
    { toets: "Ctrl+Shift+F5", uitvoeren: () => setPaneel("ganaar") },
    { toets: "Ctrl+P", uitvoeren: () => vraagAfdrukvoorbeeld() },
    { toets: "Ctrl+Shift+O", uitvoeren: () => vraagAfdrukvoorbeeld() },
    // Filter (#62) en onderstrepen: opdrachten die een ander onderdeel aanmeldt met
    // meldOpdrachtAan(OPDRACHTEN.…); tot dan doet de toets niets en meldt F1 "nog niet beschikbaar".
    {
      toets: "Ctrl+Shift+L",
      beschikbaar: () => geenTekst() && heeftOpdracht(OPDRACHTEN.rekenbladFilter),
      uitvoeren: () => voerOpdrachtUit(OPDRACHTEN.rekenbladFilter),
    },
    {
      toets: "Ctrl+U",
      beschikbaar: () => heeftOpdracht(OPDRACHTEN.rekenbladOnderstrepen),
      uitvoeren: () => voerOpdrachtUit(OPDRACHTEN.rekenbladOnderstrepen),
    },
    // Zoals Excel: Alt+F1 op dit blad, F11 op een nieuw blad.
    {
      toets: "Alt+F1",
      beschikbaar: () => !uit,
      uitvoeren: () => grafieken.invoegen(),
    },
    {
      toets: "F11",
      beschikbaar: () => !uit,
      uitvoeren: () => grafieken.invoegen(true),
    },
  );
  useSneltoetsen(rekenbladHost, api ? sneltoetsen : [], "rekenblad");
  // Ctrl+Shift+L en het menu: het filter (#62) via het opdrachtenregister.
  const filterRef = useRef(() => uitvoeren(filterAanUit));
  filterRef.current = () => uitvoeren(filterAanUit);
  useEffect(
    () => (api ? meldOpdrachtAan(OPDRACHTEN.rekenbladFilter, () => filterRef.current()) : undefined),
    [api],
  );

  const zoeken = (
    <Groep naam={t("spreadsheet.groups.find")}>
      <Actie
        naam={t("spreadsheet.commands.findReplace")}
        icoon={Search}
        groot
        disabled={!api}
        title={`${t("spreadsheet.commands.findReplace")} · Ctrl+H`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setPaneel("zoeken")}
      />
    </Groep>
  );
  const navigator = (
    <Groep naam={t("spreadsheet.groups.navigator")}>
      <Actie
        naam={t("spreadsheet.commands.navigator")}
        icoon={Compass}
        groot
        disabled={!api}
        title={`${t("spreadsheet.commands.navigatorHint")} · F5`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setPaneel("ganaar")}
      />
    </Groep>
  );
  const functies = (
    <Groep naam={t("spreadsheet.groups.function")}>
      <Actie
        naam={t("spreadsheet.commands.insertFunction")}
        icoon={Sigma}
        groot
        disabled={!api || uit}
        title={`${t("spreadsheet.commands.insertFunction")} · Shift+F3`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={functieInvoegen}
      />
      <A
        naam={t("spreadsheet.commands.autoSum")}
        icoon={Sigma}
        toets="Alt+="
        groot
        uit={uit}
        doe={autoSomInvoegen}
      />
      <div className="ribbon-stapel">
        <A
          naam={t("spreadsheet.commands.insertDate")}
          icoon={CalendarDays}
          toets="Ctrl+;"
          uit={uit}
          doe={(a) => datumTijdInvoegen(a, false)}
        />
        <A
          naam={t("spreadsheet.commands.insertTime")}
          icoon={Clock}
          toets="Ctrl+Shift+;"
          uit={uit}
          doe={(a) => datumTijdInvoegen(a, true)}
        />
      </div>
    </Groep>
  );
  const bladen = (
    <Groep naam={t("spreadsheet.groups.sheet")}>
      <A
        naam={t("spreadsheet.commands.insertSheet")}
        icoon={SquarePlus}
        groot
        uit={uit}
        doe={bladInvoegen}
      />
      <div className="ribbon-stapel">
        <A
          naam={t("spreadsheet.commands.renameSheet")}
          icoon={PenLine}
          uit={uit}
          doe={() => setPaneel("hernoemen")}
        />
        <A
          naam={t("spreadsheet.commands.deleteSheet")}
          icoon={Trash2}
          uit={uit || (stand?.bladen ?? 0) < 2}
          doe={() => openRekenbladVenster({ soort: "bladVerwijderen" })}
        />
        <A
          naam={t("spreadsheet:sheets.moveCopy")}
          icoon={Files}
          uit={uit}
          doe={() => openRekenbladVenster({ soort: "bladVerplaatsen" })}
        />
      </div>
    </Groep>
  );

  return (
    <RekenbladToolbar mode="commands" className="editor-chrome">
      <Ribbon
        bestand={bestand}
        tabs={[
          {
            id: "start",
            naam: t("spreadsheet.tabs.home"),
            inhoud: (
              <>
                <Geschiedenis soort="rekenblad" />
                <Klembord />
                <RekenbladLettertype />
                <RekenbladUitlijning />
                <RekenbladGetal />
                <Groep naam={t("spreadsheet.groups.cellBorders")}>
                  <div className="ribbon-ingebouwd">
                    <RekenbladControl id="borderPreset" />
                    <span>{t("spreadsheet.commands.borders")}</span>
                  </div>
                </Groep>
                {zoeken}
              </>
            ),
          },
          {
            id: "invoegen",
            naam: t("spreadsheet.tabs.insert"),
            inhoud: (
              <>
                <Cellen uit={uit} />
                {bladen}
                {functies}
                <RekenbladGrafiekGroep g={grafieken} uit={uit} />
              </>
            ),
          },
          {
            id: "opmaak",
            naam: t("spreadsheet.tabs.format"),
            inhoud: (
              <>
                <Groep naam={t("spreadsheet.groups.format")}>
                  <C
                    id="paintFormat"
                    naam={t("spreadsheet.commands.formatPainter")}
                    icoon={Paintbrush}
                    groot
                  />
                </Groep>
                <RekenbladLettertype />
                <RekenbladUitlijning />
                <RekenbladGetal uitgebreid />
                <Groep naam={t("spreadsheet.groups.cellBorders")}>
                  <div className="ribbon-stapel">
                    <CK id="borderPreset" naam={t("spreadsheet.commands.cellBorders")} breed />
                    <CK id="borderStyle" naam={t("spreadsheet.commands.lineStyle")} breed />
                  </div>
                  <OpdrachtKleur
                    opdracht={randkleur}
                    naam={t("spreadsheet.commands.borderColor")}
                    icoon={Grid2X2}
                    args={(color) => ({ color })}
                  />
                </Groep>
                <Groep naam={t("spreadsheet.groups.wrap")}>
                  <CK id="textWrapping" naam={t("spreadsheet.commands.wrapText")} breed />
                </Groep>
              </>
            ),
          },
          {
            id: "blad",
            naam: t("spreadsheet.tabs.sheet"),
            inhoud: (
              <>
                <Cellen uit={uit} />
                <Groep naam={t("spreadsheet:structure.group")}>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet:menu.columnWidth")}
                      icoon={MoveHorizontal}
                      uit={uit}
                      doe={() => openRekenbladVenster({ soort: "breedte" })}
                    />
                    <A
                      naam={t("spreadsheet:structure.optimalWidth")}
                      icoon={ArrowLeftRight}
                      uit={uit}
                      doe={(a) => optimaleBreedte(a)}
                    />
                  </div>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet:menu.rowHeight")}
                      icoon={MoveVertical}
                      uit={uit}
                      doe={() => openRekenbladVenster({ soort: "hoogte" })}
                    />
                    <A
                      naam={t("spreadsheet:structure.optimalHeight")}
                      icoon={MoveVertical}
                      uit={uit}
                      doe={(a) => optimaleHoogte(a)}
                    />
                  </div>
                </Groep>
                <Groep naam={t("spreadsheet.groups.delete")}>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.deleteRows")}
                      icoon={Trash2}
                      uit={uit}
                      doe={rijenVerwijderen}
                    />
                    <A
                      naam={t("spreadsheet.commands.deleteColumns")}
                      icoon={Trash2}
                      uit={uit}
                      doe={kolommenVerwijderen}
                    />
                  </div>
                </Groep>
                <Groep naam={t("spreadsheet.groups.hide")}>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.hideRows")}
                      icoon={EyeOff}
                      uit={uit}
                      doe={(a) => rijenZichtbaarheid(a, true)}
                    />
                    <A
                      naam={t("spreadsheet.commands.showRows")}
                      icoon={Eye}
                      uit={uit}
                      doe={(a) => rijenZichtbaarheid(a, false)}
                    />
                  </div>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.hideColumns")}
                      icoon={EyeOff}
                      uit={uit}
                      doe={(a) => kolommenZichtbaarheid(a, true)}
                    />
                    <A
                      naam={t("spreadsheet.commands.showColumns")}
                      icoon={Eye}
                      uit={uit}
                      doe={(a) => kolommenZichtbaarheid(a, false)}
                    />
                  </div>
                </Groep>
                {bladen}
                <Groep naam={t("spreadsheet.groups.navigate")}>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.previousSheet")}
                      icoon={ChevronLeft}
                      toets="Ctrl+Page Up"
                      uit={!stand || stand.actief === 0}
                      doe={(a) =>
                        gaNaarBlad(a, a.handle.sheetInfo().activeSheet - 1)
                      }
                    />
                    <A
                      naam={t("spreadsheet.commands.nextSheet")}
                      icoon={ChevronRight}
                      toets="Ctrl+Page Down"
                      uit={!stand || stand.actief >= stand.bladen - 1}
                      doe={(a) =>
                        gaNaarBlad(a, a.handle.sheetInfo().activeSheet + 1)
                      }
                    />
                  </div>
                </Groep>
              </>
            ),
          },
          {
            id: "gegevens",
            naam: t("spreadsheet.tabs.data"),
            inhoud: (
              <>
                <Groep naam={t("spreadsheet.groups.sortFilter")}>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.sortAscending")}
                      icoon={ArrowUpAZ}
                      uit={uit}
                      doe={(a) => snelSorteren(a, false)}
                    />
                    <A
                      naam={t("spreadsheet.commands.sortDescending")}
                      icoon={ArrowDownZA}
                      uit={uit}
                      doe={(a) => snelSorteren(a, true)}
                    />
                  </div>
                  <A
                    naam={t("spreadsheet.commands.sortDialog")}
                    icoon={ArrowDownUp}
                    groot
                    uit={uit}
                    doe={() => setPaneel("sorteren")}
                  />
                  <Actie
                    naam={t("spreadsheet.commands.filter")}
                    icoon={Filter}
                    groot
                    disabled={!api || uit}
                    actief={!!stand?.filter}
                    title={`${t("spreadsheet.commands.filterHint")} · Ctrl+Shift+L`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => uitvoeren(filterAanUit)}
                  />
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.clearFilter")}
                      icoon={FilterX}
                      uit={uit || !stand?.gefilterd}
                      doe={wisFilters}
                    />
                    <A
                      naam={t("spreadsheet.commands.reapplyFilter")}
                      icoon={RefreshCw}
                      uit={uit || !stand?.filter}
                      doe={filterOpnieuw}
                    />
                  </div>
                </Groep>
                <Groep naam={t("spreadsheet.groups.fill")}>
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.fillDown")}
                      icoon={ArrowDownToLine}
                      toets="Ctrl+D"
                      uit={uit}
                      doe={(a) => doorvoeren(a, "omlaag")}
                    />
                    <A
                      naam={t("spreadsheet.commands.fillRight")}
                      icoon={ArrowRightToLine}
                      toets="Ctrl+R"
                      uit={uit}
                      doe={(a) => doorvoeren(a, "rechts")}
                    />
                  </div>
                  <A
                    naam={t("spreadsheet.commands.fillSeries")}
                    icoon={ListOrdered}
                    groot
                    uit={uit}
                    doe={() => setPaneel("reeks")}
                  />
                </Groep>
                {functies}
              </>
            ),
          },
          {
            id: "beeld",
            naam: t("spreadsheet.tabs.view"),
            inhoud: (
              <>
                <Zoom opdracht={zoom} />
                <Groep naam={t("spreadsheet.groups.freezePanes")}>
                  <A
                    naam={
                      stand?.bevroren
                        ? t("spreadsheet.commands.unfreezePanes")
                        : t("spreadsheet.commands.freezePanes")
                    }
                    icoon={Snowflake}
                    groot
                    uit={uit}
                    doe={(a) =>
                      fixeren(a, stand?.bevroren ? "opheffen" : "cel")
                    }
                  />
                  <div className="ribbon-stapel">
                    <A
                      naam={t("spreadsheet.commands.freezeTopRow")}
                      icoon={PanelTop}
                      uit={uit}
                      doe={(a) => fixeren(a, "rij")}
                    />
                    <A
                      naam={t("spreadsheet.commands.freezeFirstColumn")}
                      icoon={PanelLeft}
                      uit={uit}
                      doe={(a) => fixeren(a, "kolom")}
                    />
                  </div>
                </Groep>
                {navigator}
                <Groep naam={t("spreadsheet.groups.output")}>
                  <Actie
                    naam={t("spreadsheet.commands.print")}
                    icoon={Printer}
                    title={t("spreadsheet.commands.printHint", { shortcut: "Ctrl+P" })}
                    groot
                    onClick={() => vraagAfdrukvoorbeeld()}
                  />
                  <C
                    id="exportPng"
                    naam={t("spreadsheet.commands.exportImage")}
                    icoon={Download}
                    groot
                  />
                </Groep>
              </>
            ),
          },
          {
            id: "extra",
            naam: t("spreadsheet.tabs.tools"),
            inhoud: (
              <>
                {zoeken}
                {navigator}
              </>
            ),
          },
          ...(grafieken.geselecteerd
            ? [
                {
                  id: "grafiekontwerp",
                  naam: t("spreadsheet.tabs.chartDesign"),
                  inhoud: <Grafiekontwerp g={grafieken} uit={uit} />,
                },
              ]
            : []),
        ]}
      />
      <Formulebalk api={api} laag={laag} functieInvoegen={functieInvoegen} />
      {formuleHulp}
      {api && paneel === "zoeken" && (
        <ZoekenVervangen api={api} sluiten={sluiten} />
      )}
      {api && paneel === "ganaar" && <GaNaar api={api} sluiten={sluiten} />}
      {api && paneel === "hernoemen" && (
        <BladHernoemen api={api} sluiten={sluiten} />
      )}
      {api && paneel === "sorteren" && <SorteerVenster api={api} sluit={sluiten} />}
      {api && paneel === "reeks" && <ReeksVenster api={api} sluit={sluiten} />}
      {api && functiePlek && (
        <FunctieVenster
          api={api}
          plek={functiePlek}
          sluit={() => {
            setFunctiePlek(null);
            api.focus();
          }}
        />
      )}
      {grafieken.venster}
      <RekenbladExtra />
    </RekenbladToolbar>
  );
}
