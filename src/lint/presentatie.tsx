import { lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorApi, useEditorZichtbaar, zichtbaarElement } from "./editorApi";
import {
  usePptxCommand,
  ToolbarCommand as DiaControl,
  type PptxCommandArgs,
  type PptxCommandId,
} from "@betteroffice/pptx-react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Eraser,
  Type,
  Image,
  FilePlus2,
  PaintBucket,
  MonitorPlay,
  MousePointer2,
  Square,
  ArrowUpToLine,
  ArrowDownToLine,
  BringToFront,
  SendToBack,
  Maximize,
  Download,
  Circle,
  RectangleHorizontal,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  StickyNote,
  Play,
  X,
  Printer,
  NotebookText,
  LayoutGrid,
  GalleryVertical,
  Presentation,
  Search,
} from "lucide-react";
import {
  Actie,
  RibbonFout,
  Ribbon,
  Groep,
  OpdrachtKleur,
  OpdrachtGetal,
  OpdrachtKnop,
} from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { P, PK, PL, Geschiedenis, Zoom, scrollvlakVan, type Knop } from "./gedeeld";
import { useDiaActies, DiaKnop, huidigeIndex, type DiaActies } from "./presentatie-acties";
import { publiceerWeergave, useDiaWeergave, zetWeergave, type DiaWeergave } from "../presentatie/weergave";
import { specialeTekens } from "./presentatie-opdrachten";
import { PresentatieZoeken } from "./presentatie-zoekpaneel";
import {
  DiaGrafiekontwerp,
  GrafiekGroep,
  useIngeslotenGrafieken,
} from "../grafieken/ui/ingesloten";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import "./presentatie.css";

const DiaSorteerder = lazy(() =>
  import("../presentatie/DiaSorteerder").then((m) => ({ default: m.DiaSorteerder })),
);

/** Een engine-opdracht met een sneltoets die het lint zelf afhandelt. */
function PT<K extends PptxCommandId>({
  id,
  args,
  toets,
  ...props
}: Knop & { id: K; args?: PptxCommandArgs[K]; toets: string }) {
  const opdracht = usePptxCommand(id, args);
  return (
    <OpdrachtKnop {...props} opdracht={{ ...opdracht, shortcut: toets }} />
  );
}

function DiaLettertype() {
  const { t } = useTranslation("ribbon");
  const grootte = usePptxCommand("fontSize"),
    kleur = usePptxCommand("textColor");
  return (
    <Groep naam={t("presentation.groups.font")}>
      <div className="ribbon-rij">
        <PL />
        <OpdrachtGetal
          opdracht={grootte}
          naam={t("presentation.commands.fontSize")}
          args={(points) => ({ points })}
        />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <P id="bold" naam={t("presentation.commands.bold")} icoon={Bold} />
        <P id="italic" naam={t("presentation.commands.italic")} icoon={Italic} />
        <P id="underline" naam={t("presentation.commands.underline")} icoon={Underline} />
        <OpdrachtKleur
          opdracht={kleur}
          naam={t("presentation.commands.textColor")}
          icoon={Type}
          args={(color) => ({ color })}
        />
      </div>
    </Groep>
  );
}
function DiaUitlijning() {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("presentation.groups.paragraph")}>
      <div className="ribbon-rij ribbon-iconen">
        <PT
          id="alignment"
          args={{ value: "l" }}
          naam={t("presentation.commands.alignLeft")}
          icoon={AlignLeft}
          toets="Ctrl+L"
        />
        <PT
          id="alignment"
          args={{ value: "ctr" }}
          naam={t("presentation.commands.center")}
          icoon={AlignCenter}
          toets="Ctrl+E"
        />
        <PT
          id="alignment"
          args={{ value: "r" }}
          naam={t("presentation.commands.alignRight")}
          icoon={AlignRight}
          toets="Ctrl+R"
        />
        <PT
          id="alignment"
          args={{ value: "just" }}
          naam={t("presentation.commands.justify")}
          icoon={AlignJustify}
          toets="Ctrl+J"
        />
      </div>
    </Groep>
  );
}
function NieuweDia() {
  const { t } = useTranslation("ribbon");
  return (
    <>
      <PT
        id="insertSlide"
        args={{}}
        naam={t("presentation.commands.newSlide")}
        icoon={FilePlus2}
        toets="Ctrl+M"
        groot
      />
      <PK id="insertSlide" naam={t("presentation.commands.newSlideWithLayout")} breed />
    </>
  );
}
function Voorstelling({ acties }: { acties: DiaActies }) {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("presentation.groups.slideShow")}>
      <DiaKnop
        naam={t("presentation.commands.fromBeginning")}
        icoon={MonitorPlay}
        toets="F5"
        groot
        uit={!acties.actief}
        onClick={() => acties.voorstelling(true)}
      />
      <DiaKnop
        naam={t("presentation.commands.fromCurrentSlide")}
        icoon={Play}
        toets="Shift+F5"
        groot
        uit={!acties.actief}
        onClick={() => acties.voorstelling(false)}
      />
      <DiaKnop
        naam={t("presentation.commands.presenterView")}
        icoon={Presentation}
        toets="Alt+F5"
        groot
        uit={!acties.actief}
        onClick={() => acties.voorstelling(false, true)}
      />
    </Groep>
  );
}
function Weergaven({
  weergave,
  zet,
  uit,
}: {
  weergave: DiaWeergave;
  zet: (w: DiaWeergave) => void;
  uit: boolean;
}) {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("presentation.groups.presentationViews")}>
      <DiaKnop
        naam={t("presentation.commands.normalView")}
        icoon={GalleryVertical}
        groot
        aan={weergave === "normaal"}
        uit={uit}
        onClick={() => zet("normaal")}
      />
      <DiaKnop
        naam={t("presentation.commands.slideSorter")}
        icoon={LayoutGrid}
        groot
        aan={weergave === "sorteerder"}
        uit={uit}
        onClick={() => zet(weergave === "sorteerder" ? "normaal" : "sorteerder")}
      />
    </Groep>
  );
}

/** Diasorteerder en de weergavekeuze (lint en statusbalk) voor deze presentatie. */
function useWeergave(acties: DiaActies) {
  const { presentatie: api, herlaad } = useEditorApi();
  const fout = useContext(RibbonFout);
  const zichtbaar = useEditorZichtbaar();
  const sleutel = herlaad ?? api;
  const { weergave } = useDiaWeergave(sleutel);
  const [anker, setAnker] = useState<HTMLSpanElement | null>(null);
  const eigenaar = useRef({}).current;
  const zet = (w: DiaWeergave) => {
    if (!sleutel) return;
    if (w === "sorteerder") zetWeergave(sleutel, { weergave: w, selectie: [huidigeIndex()], bericht: "" });
    else zetWeergave(sleutel, { weergave: w });
  };
  const recent = useRef({ zet, acties });
  recent.current = { zet, acties };
  useEffect(() => {
    if (!zichtbaar || !sleutel) return;
    publiceerWeergave(eigenaar, {
      weergave,
      zet: (w) => recent.current.zet(w),
      voorstelling: () => recent.current.acties.voorstelling(false),
    });
    return () => publiceerWeergave(eigenaar, null);
  }, [zichtbaar, sleutel, weergave]);
  const element = (
    <>
      <span ref={setAnker} hidden />
      {weergave === "sorteerder" && sleutel && (
        <Suspense fallback={null}>
          <DiaSorteerder
            api={api}
            herlaad={herlaad}
            anker={anker}
            bewerkbaar={acties.bewerkbaar}
            huidig={huidigeIndex}
            fout={fout}
          />
        </Suspense>
      )}
    </>
  );
  return { weergave, zet, element };
}
function DiaVerwijderen({ acties }: { acties: DiaActies }) {
  const { t } = useTranslation("ribbon");
  return (
    <DiaKnop
      naam={t("presentation.commands.deleteSlide")}
      icoon={Trash2}
      toets={t("presentation.commands.deleteSlideShortcut")}
      uit={!acties.bewerkbaar}
      onClick={acties.diaVerwijderen}
    />
  );
}
function DiaVerplaatsen({ acties }: { acties: DiaActies }) {
  const { t } = useTranslation("ribbon");
  const uit = !acties.bewerkbaar;
  return (
    <Groep naam={t("presentation.groups.moveSlide")}>
      <div className="ribbon-stapel">
        <DiaKnop
          naam={t("presentation.commands.moveToBeginning")}
          icoon={ChevronsUp}
          toets="Ctrl+Shift+Home"
          uit={uit}
          onClick={() => acties.verplaatsen("begin")}
        />
        <DiaKnop
          naam={t("presentation.commands.moveUp")}
          icoon={ChevronUp}
          toets="Ctrl+Shift+Page Up"
          uit={uit}
          onClick={() => acties.verplaatsen("omhoog")}
        />
      </div>
      <div className="ribbon-stapel">
        <DiaKnop
          naam={t("presentation.commands.moveDown")}
          icoon={ChevronDown}
          toets="Ctrl+Shift+Page Down"
          uit={uit}
          onClick={() => acties.verplaatsen("omlaag")}
        />
        <DiaKnop
          naam={t("presentation.commands.moveToEnd")}
          icoon={ChevronsDown}
          toets="Ctrl+Shift+End"
          uit={uit}
          onClick={() => acties.verplaatsen("einde")}
        />
      </div>
    </Groep>
  );
}
function DiaNavigatie({ acties }: { acties: DiaActies }) {
  const { t } = useTranslation("ribbon");
  const uit = !acties.actief;
  return (
    <Groep naam={t("presentation.groups.navigate")}>
      <div className="ribbon-stapel">
        <DiaKnop
          naam={t("presentation.commands.firstSlide")}
          icoon={ChevronFirst}
          toets="Home"
          uit={uit}
          onClick={() => acties.naarDia(() => 0)}
        />
        <DiaKnop
          naam={t("presentation.commands.previousSlide")}
          icoon={ChevronLeft}
          toets="Page Up"
          uit={uit}
          onClick={() => acties.naarDia((i) => i - 1)}
        />
      </div>
      <div className="ribbon-stapel">
        <DiaKnop
          naam={t("presentation.commands.nextSlide")}
          icoon={ChevronRight}
          toets="Page Down"
          uit={uit}
          onClick={() => acties.naarDia((i) => i + 1)}
        />
        <DiaKnop
          naam={t("presentation.commands.lastSlide")}
          icoon={ChevronLast}
          toets="End"
          uit={uit}
          onClick={() => acties.naarDia((_, n) => n - 1)}
        />
      </div>
    </Groep>
  );
}
function Rangschikken() {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("presentation.groups.arrange")}>
      <div className="ribbon-stapel">
        <P
          id="zOrder"
          args={{ value: "front" }}
          naam={t("presentation.commands.bringToFront")}
          icoon={BringToFront}
        />
        <P
          id="zOrder"
          args={{ value: "back" }}
          naam={t("presentation.commands.sendToBack")}
          icoon={SendToBack}
        />
      </div>
      <div className="ribbon-stapel">
        <P
          id="zOrder"
          args={{ value: "forward" }}
          naam={t("presentation.commands.bringForward")}
          icoon={ArrowUpToLine}
        />
        <P
          id="zOrder"
          args={{ value: "backward" }}
          naam={t("presentation.commands.sendBackward")}
          icoon={ArrowDownToLine}
        />
      </div>
    </Groep>
  );
}
function ObjectUitlijnen({ acties }: { acties: DiaActies }) {
  const { t } = useTranslation("ribbon");
  const uit = !acties.bewerkbaar;
  const knop = (
    naam: string,
    icoon: Knop["icoon"],
    wijze: Parameters<DiaActies["uitlijnen"]>[0],
  ) => (
    <DiaKnop
      naam={naam}
      icoon={icoon}
      uit={uit}
      onClick={() => acties.uitlijnen(wijze)}
    />
  );
  return (
    <Groep naam={t("presentation.groups.alignToSlide")}>
      <div className="ribbon-rij ribbon-iconen">
        {knop(t("presentation.commands.alignLeftToSlide"), AlignStartVertical, "links")}
        {knop(t("presentation.commands.alignCenterToSlide"), AlignCenterVertical, "centreren")}
        {knop(t("presentation.commands.alignRightToSlide"), AlignEndVertical, "rechts")}
      </div>
      <div className="ribbon-rij ribbon-iconen">
        {knop(t("presentation.commands.alignTopToSlide"), AlignStartHorizontal, "boven")}
        {knop(t("presentation.commands.alignMiddleToSlide"), AlignCenterHorizontal, "midden")}
        {knop(t("presentation.commands.alignBottomToSlide"), AlignEndHorizontal, "onder")}
      </div>
    </Groep>
  );
}
function SpeciaalTeken({ acties }: { acties: DiaActies }) {
  const { t } = useTranslation("ribbon");
  return (
    <label className="ribbon-keuze ribbon-keuze-breed" title={t("presentation.commands.specialCharacter")}>
      <select
        aria-label={t("presentation.commands.specialCharacter")}
        value=""
        disabled={!acties.bewerkbaar}
        onChange={(event) => {
          if (event.target.value) acties.tekstInvoegen(event.target.value);
        }}
      >
        <option value="">
          {t("presentation.commands.specialCharacterPlaceholder")}
        </option>
        {specialeTekens.map(({ teken, sleutel }) => (
          <option key={teken} value={teken}>
            {teken} {t(`presentation.characters.${sleutel}`)}
          </option>
        ))}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}

/** Notitiepaneel van de engine tonen of verbergen, zoals Beeld › Notities. */
function useNotities() {
  const [zichtbaar, setZichtbaar] = useState(true);
  useEffect(() => {
    const wortel = zichtbaarElement<HTMLElement>(".office-presentatie");
    if (!wortel) return;
    if (zichtbaar) delete wortel.dataset.notities;
    else wortel.dataset.notities = "verborgen";
  }, [zichtbaar]);
  return [zichtbaar, () => setZichtbaar((nu) => !nu)] as const;
}

export function PresentatieRibbon({
  bestand,
  zoomKoppeling,
  diaBreedte,
}: {
  bestand: () => void;
  zoomKoppeling?: ZoomKoppeling;
  /** Diabreedte bij 100%, in CSS-pixels. */
  diaBreedte?: number;
}) {
  const { t } = useTranslation("ribbon");
  const zoom = usePptxCommand("zoom"),
    vulling = usePptxCommand("shapeFill"),
    rand = usePptxCommand("shapeStrokeColor");
  const acties = useDiaActies();
  const api = useEditorApi().presentatie;
  const grafieken = useIngeslotenGrafieken("pptx");
  const [notities, wisselNotities] = useNotities();
  const weergave = useWeergave(acties);
  const dia = () =>
    zichtbaarElement<HTMLElement>(
      '.office-presentatie [data-testid="pptx-slide-canvas"]',
    );
  useDocumentZoom({
    opdracht: zoom,
    vlak: () => scrollvlakVan(dia()),
    koppeling: zoomKoppeling,
    // ‘Passend’ is geen getal: reken de getekende dia terug naar 100%.
    huidig: () => {
      const breedte = dia()?.getBoundingClientRect().width;
      return breedte && diaBreedte ? breedte / diaBreedte : null;
    },
    standaard: { scale: "fit" },
  });
  return (
    <>
    {grafieken.venster}
    {weergave.element}
    {acties.voorstellingElement}
    {api && acties.zoeken && (
      <PresentatieZoeken
        api={api}
        stand={acties.zoeken}
        bewerkbaar={acties.bewerkbaar}
        sluiten={() => {
          acties.setZoeken(null);
          api.focus();
        }}
      />
    )}
    <Ribbon
      bestand={bestand}
      tabs={[
        {
          id: "start",
          naam: t("presentation.tabs.home"),
          inhoud: (
            <>
              <Geschiedenis soort="dia" />
              <Groep naam={t("presentation.groups.slides")}>
                <NieuweDia />
              </Groep>
              <DiaLettertype />
              <DiaUitlijning />
              <Groep naam={t("presentation.groups.drawing")}>
                <P
                  id="tool"
                  args={{ value: "select" }}
                  naam={t("presentation.commands.select")}
                  icoon={MousePointer2}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "textBox" }}
                  naam={t("presentation.commands.textBox")}
                  icoon={Type}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "shape:rect" }}
                  naam={t("presentation.commands.shape")}
                  icoon={Square}
                  groot
                />
              </Groep>
              <Groep naam={t("presentation.groups.present")}>
                <DiaKnop
                  naam={t("presentation.commands.slideShow")}
                  icoon={MonitorPlay}
                  toets="F5"
                  groot
                  uit={!acties.actief}
                  onClick={() => acties.voorstelling(true)}
                />
              </Groep>
              <Groep naam={t("presentation.groups.find")}>
                <DiaKnop
                  naam={t("presentation.commands.findReplace")}
                  icoon={Search}
                  toets="Ctrl+H"
                  groot
                  uit={!acties.actief}
                  onClick={() => acties.setZoeken(acties.bewerkbaar ? "vervangen" : "zoeken")}
                />
              </Groep>
            </>
          ),
        },
        {
          id: "invoegen",
          naam: t("presentation.tabs.insert"),
          inhoud: (
            <>
              <Groep naam={t("presentation.groups.slides")}>
                <NieuweDia />
              </Groep>
              <Groep naam={t("presentation.groups.illustrations")}>
                <P id="insertImage" naam={t("presentation.commands.picture")} icoon={Image} groot />
                <div className="ribbon-stapel">
                  <PK id="tool" naam={t("presentation.commands.shapesAndTools")} breed />
                </div>
              </Groep>
              <GrafiekGroep g={grafieken} uit={!acties.bewerkbaar} />
              <Groep naam={t("presentation.groups.text")}>
                <P
                  id="tool"
                  args={{ value: "textBox" }}
                  naam={t("presentation.commands.textBox")}
                  icoon={Type}
                  groot
                />
                <div className="ribbon-stapel">
                  <DiaKnop
                    naam={t("presentation.commands.date")}
                    icoon={CalendarDays}
                    uit={!acties.bewerkbaar}
                    onClick={() => acties.datum("datum")}
                  />
                  <DiaKnop
                    naam={t("presentation.commands.time")}
                    icoon={Clock}
                    uit={!acties.bewerkbaar}
                    onClick={() => acties.datum("tijd")}
                  />
                </div>
                <div className="ribbon-stapel">
                  <SpeciaalTeken acties={acties} />
                </div>
              </Groep>
              <Groep naam={t("presentation.groups.basicShapes")}>
                <P
                  id="tool"
                  args={{ value: "shape:rect" }}
                  naam={t("presentation.commands.rectangle")}
                  icoon={Square}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "shape:ellipse" }}
                  naam={t("presentation.commands.oval")}
                  icoon={Circle}
                  groot
                />
                <P
                  id="tool"
                  args={{ value: "shape:roundRect" }}
                  naam={t("presentation.commands.roundedRectangle")}
                  icoon={RectangleHorizontal}
                  groot
                />
              </Groep>
            </>
          ),
        },
        {
          id: "dia",
          naam: t("presentation.tabs.slide"),
          inhoud: (
            <>
              <Groep naam={t("presentation.groups.slides")}>
                <NieuweDia />
                <DiaVerwijderen acties={acties} />
              </Groep>
              <DiaVerplaatsen acties={acties} />
              <DiaNavigatie acties={acties} />
            </>
          ),
        },
        {
          id: "vormopmaak",
          naam: t("presentation.tabs.shapeFormat"),
          inhoud: (
            <>
              <Groep naam={t("presentation.groups.shapeStyle")}>
                <div className="ribbon-stapel">
                  <OpdrachtKleur
                    opdracht={vulling}
                    naam={t("presentation.commands.shapeFill")}
                    icoon={PaintBucket}
                    args={(color) => ({ color })}
                  />
                  <OpdrachtKleur
                    opdracht={rand}
                    naam={t("presentation.commands.shapeOutline")}
                    icoon={Square}
                    args={(color) => ({ color })}
                  />
                </div>
                <div className="ribbon-stapel">
                  <P
                    id="shapeFill"
                    args={{ color: null }}
                    naam={t("presentation.commands.noFill")}
                    icoon={Eraser}
                  />
                  <P
                    id="shapeStrokeColor"
                    args={{ color: null }}
                    naam={t("presentation.commands.noOutline")}
                    icoon={Square}
                  />
                </div>
              </Groep>
              <Groep naam={t("presentation.groups.lineWeight")}>
                <PK id="shapeStrokeWidth" naam={t("presentation.commands.lineWeight")} breed />
              </Groep>
              <Groep naam={t("presentation.groups.editShape")}>
                <DiaControl id="shapeAdjustment" />
              </Groep>
              <DiaLettertype />
              <DiaUitlijning />
            </>
          ),
        },
        {
          id: "schikken",
          naam: t("presentation.tabs.arrange"),
          inhoud: (
            <>
              <Rangschikken />
              <ObjectUitlijnen acties={acties} />
              <Groep naam={t("presentation.groups.object")}>
                <DiaKnop
                  naam={t("presentation.commands.delete")}
                  icoon={X}
                  toets="Delete"
                  groot
                  uit={!acties.bewerkbaar}
                  onClick={acties.vormVerwijderen}
                />
              </Groep>
            </>
          ),
        },
        {
          id: "beeld",
          naam: t("presentation.tabs.view"),
          inhoud: (
            <>
              <Weergaven weergave={weergave.weergave} zet={weergave.zet} uit={!acties.actief} />
              <Zoom opdracht={zoom} />
              <Groep naam={t("presentation.groups.workspace")}>
                <P
                  id="zoom"
                  args={{ scale: "fit" }}
                  naam={t("presentation.commands.fit")}
                  icoon={Maximize}
                  groot
                />
                <DiaKnop
                  naam={t("presentation.commands.notes")}
                  icoon={StickyNote}
                  groot
                  aan={notities}
                  onClick={wisselNotities}
                  uit={!acties.actief}
                />
                <P
                  id="tool"
                  args={{ value: "select" }}
                  naam={t("presentation.commands.select")}
                  icoon={MousePointer2}
                  groot
                />
              </Groep>
              <DiaNavigatie acties={acties} />
              <Groep naam={t("presentation.groups.output")}>
                <P
                  id="exportPng"
                  naam={t("presentation.commands.exportSlide")}
                  icoon={Download}
                  groot
                />
                <Actie
                  naam={t("presentation.commands.print")}
                  icoon={Printer}
                  title={t("presentation.commands.printHint", { shortcut: "Ctrl+P" })}
                  groot
                  onClick={() => vraagAfdrukvoorbeeld()}
                />
                <Actie
                  naam={t("presentation.commands.notesPages")}
                  icoon={NotebookText}
                  title={t("presentation.commands.notesPagesHint")}
                  groot
                  onClick={() => vraagAfdrukvoorbeeld({ indeling: "notities" })}
                />
              </Groep>
            </>
          ),
        },
        {
          id: "diavoorstelling",
          naam: t("presentation.tabs.slideShow"),
          inhoud: (
            <>
              <Voorstelling acties={acties} />
              <Groep naam={t("presentation.groups.prepare")}>
                <P
                  id="zoom"
                  args={{ scale: "fit" }}
                  naam={t("presentation.commands.fitSlide")}
                  icoon={Maximize}
                  groot
                />
                <P
                  id="exportPng"
                  naam={t("presentation.commands.exportSlide")}
                  icoon={Download}
                  groot
                />
              </Groep>
            </>
          ),
        },
        ...(grafieken.geselecteerd
          ? [
              {
                id: "grafiekontwerp",
                naam: t("presentation.tabs.chartDesign"),
                inhoud: (
                  <DiaGrafiekontwerp g={grafieken} uit={!acties.bewerkbaar} />
                ),
              },
            ]
          : []),
      ]}
    />
    </>
  );
}
