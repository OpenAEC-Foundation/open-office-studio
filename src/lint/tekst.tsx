import { useEditorApi, zichtbaarElement } from "./editorApi";
import { vraagAfdrukvoorbeeld } from "../afdrukken/openen";
import { GrafiekGroep, useIngeslotenGrafieken } from "../grafieken/ui/ingesloten";
import {
  useDocxCommand,
  ToolbarCommand as TekstControl,
} from "@betteroffice/docx-react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Eraser,
  Type,
  Highlighter,
  Image,
  Table2,
  Link,
  FilePlus2,
  LayoutTemplate,
  MessageSquare,
  MessageSquarePlus,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Printer,
  Ruler,
  PanelLeft,
  Grid2X2,
  Merge,
  Columns2,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Rows3,
  Trash2,
  Scissors,
  Copy,
  ClipboardPaste,
  Omega,
  CalendarDays,
  Clock,
  CaseUpper,
  CaseLower,
  CaseSensitive,
  LetterText,
  ArrowDownUp,
  RefreshCw,
  Baseline,
  WholeWord,
  ArrowDownToLine,
  PenLine,
  SpellCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { openSpellingVenster } from "../spelling/tekst/menu";
import { formatGetal } from "../i18n/opmaak";
import {
  Ribbon,
  Groep,
  Actie,
  OpdrachtKleur,
  OpdrachtGetal,
  type RibbonTab,
} from "../Ribbon";
import { useDocumentZoom, type ZoomKoppeling } from "../useDocumentZoom";
import { W, WK, WL, Geschiedenis, Zoom } from "./gedeeld";
import {
  EigenKnop,
  TekstDialogen,
  TekstStatus,
  WS,
  useTekstOpdrachten,
} from "./tekst-opdrachten";
import { datumTekst, tijdTekst, type Hoofdlettersoort } from "./tekst-logica";
import { TabelKiezer } from "../tabelvoorbeeld/TabelKiezer";
import { TabelIndeling, TekstNaarTabelKnop } from "../tekst/tabel/TabelIndeling";
import { AfbeeldingGroepen } from "../tekst/afbeelding/AfbeeldingGroepen";
import { ZoekKnoppen } from "../tekst/zoeken/ZoekPaneel";
import { WordHost } from "../tekst/WordHost";
import { Liniaal } from "../tekst/liniaal/Liniaal";
import { WijzigingenGroepen } from "../tekst/wijzigingen/Wijzigingen";
import { usePagina } from "../tekst/pagina/ui/usePagina";
import {
  ExtraEindes,
  KolommenGroep,
  KopVoetInvoegenGroep,
  PaginaIndelingKnoppen,
  SectieEindes,
  WatermerkKnop,
  kopVoetTab,
  verwijzingenTab,
} from "../tekst/pagina/ui/PaginaLint";
import {
  AlineaKnop,
  LettertypeKnop,
  LijstKnop,
  PaginaAchtergrondKnoppen,
  RandenKnop,
  TekstOpmaakProvider,
} from "../tekst/TekstOpmaak";
import { AfstandGroep } from "../tekst/alinea/AfstandGroep";
import {
  DatumTijdKnop,
  GrootteKnoppen,
  KwastKnop,
  TekstBewerken,
} from "../tekst/bewerken/TekstBewerken";
import { StijlBeheerGroep, StijlenBeheer, StijlGalerij } from "../tekst/stijlen";
import { AlineastijlKeuze } from "../tekst/stijlen/StijlKeuze";
import { useHerhaalbaar } from "../tekst/bewerken/herhaalmelding";
import { TekstInfo } from "../tekst/info/TekstInfo";
import { WeergaveGroep } from "../tekst/info/WeergaveGroep";
import { useInstellingen } from "../instellingen";
import { moduleToets } from "./sneltoetsenlijst";
import "./tekst.css";

type Opdrachten = ReturnType<typeof useTekstOpdrachten>;
/** Regelafstand "1.15" uit de engine met het decimaalteken van de taal ("1,15" in nl). */
const decimaleKomma = (label: string) =>
  label.replace(/^(\d+)\.(\d+)$/, (_, geheel: string, deel: string) =>
    formatGetal(Number(`${geheel}.${deel}`), { minimumFractionDigits: deel.length }),
  );

/**
 * Het lint hangt in de editor en wordt bij herladen (pakketroute: grafiek,
 * paginanummers, randen …) opnieuw gemount; per document onthouden we het
 * gekozen tabblad, zodat het lint niet terugspringt naar Start.
 */
const lintTabPerDocument = new WeakMap<object, string>();

const hoofdletterKnoppen: {
  soort: Hoofdlettersoort | "rouleren";
  /** Sleutel onder ribbon:writer.case. */
  sleutel: string;
  icoon: typeof Type;
  sneltoets?: string;
}[] = [
  { soort: "hoofdletters", sleutel: "upper", icoon: CaseUpper },
  { soort: "kleine", sleutel: "lower", icoon: CaseLower },
  { soort: "zin", sleutel: "sentence", icoon: CaseSensitive },
  { soort: "titel", sleutel: "title", icoon: LetterText },
  { soort: "wisselen", sleutel: "toggle", icoon: ArrowDownUp },
  {
    soort: "rouleren",
    sleutel: "cycle",
    icoon: RefreshCw,
    sneltoets: "Shift+F3",
  },
];

function TekstLettertype() {
  const { t } = useTranslation("ribbon");
  const grootte = useHerhaalbaar("fontSize", useDocxCommand("fontSize")),
    kleur = useHerhaalbaar("textColor", useDocxCommand("textColor")),
    markering = useHerhaalbaar("highlightColor", useDocxCommand("highlightColor"));
  return (
    <Groep naam={t("writer.groups.font")}>
      <div className="ribbon-rij">
        <WL />
        <OpdrachtGetal
          opdracht={grootte}
          naam={t("writer.commands.fontSize")}
          args={(points) => ({ points })}
        />
        <GrootteKnoppen />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <W id="bold" naam={t("writer.commands.bold")} icoon={Bold} />
        <W id="italic" naam={t("writer.commands.italic")} icoon={Italic} />
        <W id="underline" naam={t("writer.commands.underline")} icoon={Underline} />
        <W id="strikethrough" naam={t("writer.commands.strikethrough")} icoon={Strikethrough} />
        <WS
          id="superscript"
          naam={t("writer.commands.superscript")}
          icoon={Superscript}
          sneltoets="Ctrl+Shift+P"
        />
        <WS
          id="subscript"
          naam={t("writer.commands.subscript")}
          icoon={Subscript}
          sneltoets="Ctrl+Shift+B"
        />
        <OpdrachtKleur
          opdracht={markering}
          naam={t("writer.commands.highlightColor")}
          icoon={Highlighter}
          args={(color) => ({ color })}
        />
        <OpdrachtKleur
          opdracht={kleur}
          naam={t("writer.commands.fontColor")}
          icoon={Type}
          args={(color) => ({ color: { rgb: color.slice(1) } })}
        />
        <LettertypeKnop />
      </div>
    </Groep>
  );
}
function TekstAlinea() {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("writer.groups.paragraph")}>
      <div className="ribbon-rij ribbon-iconen">
        <W id="bulletList" naam={t("writer.commands.bullets")} icoon={List} />
        <W id="numberedList" naam={t("writer.commands.numbering")} icoon={ListOrdered} />
        <W id="outdent" naam={t("writer.commands.decreaseIndent")} icoon={IndentDecrease} />
        <W id="indent" naam={t("writer.commands.increaseIndent")} icoon={IndentIncrease} />
        <LijstKnop />
      </div>
      <div className="ribbon-rij ribbon-iconen">
        <W
          id="alignment"
          args={{ value: "left" }}
          naam={t("writer.commands.alignLeft")}
          icoon={AlignLeft}
        />
        <W
          id="alignment"
          args={{ value: "center" }}
          naam={t("writer.commands.center")}
          icoon={AlignCenter}
        />
        <W
          id="alignment"
          args={{ value: "right" }}
          naam={t("writer.commands.alignRight")}
          icoon={AlignRight}
        />
        <W
          id="alignment"
          args={{ value: "both" }}
          naam={t("writer.commands.justify")}
          icoon={AlignJustify}
        />
        <AlineaKnop />
        <RandenKnop />
      </div>
    </Groep>
  );
}
// Galerij met voorbeelden uit de documentstijlen (src/tekst/stijlen, #45).
function Stijlen({ uitgebreid }: { uitgebreid?: boolean }) {
  const { t } = useTranslation("ribbon");
  return (
    <StijlGalerij
      uitgebreid={uitgebreid}
      extra={<AlineastijlKeuze naam={t("writer.commands.allStyles")} breed />}
    />
  );
}
function Klembord({ opdrachten }: { opdrachten: Opdrachten }) {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("writer.groups.clipboard")}>
      <EigenKnop
        naam={t("writer.commands.paste")}
        icoon={ClipboardPaste}
        groot
        disabled={!opdrachten.bewerkbaar}
        sneltoets="Ctrl+V"
        uitleg={t("writer.hints.paste", { shortcut: "Ctrl+Shift+V" })}
        onClick={opdrachten.plakkenMetOpmaak}
      />
      <div className="ribbon-stapel">
        <EigenKnop
          naam={t("writer.commands.cut")}
          icoon={Scissors}
          sneltoets="Ctrl+X"
          disabled={!opdrachten.bewerkbaar}
          onClick={() => opdrachten.klembord("cut")}
        />
        <EigenKnop
          naam={t("writer.commands.copy")}
          icoon={Copy}
          sneltoets="Ctrl+C"
          onClick={() => opdrachten.klembord("copy")}
        />
        <KwastKnop />
      </div>
    </Groep>
  );
}
function OpmaakWissen() {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("writer.groups.formatting")}>
      <WS
        id="clearFormatting"
        naam={t("writer.commands.clearFormatting")}
        icoon={Eraser}
        sneltoets="Ctrl+M"
        groot
      />
    </Groep>
  );
}
/** Zoeken, vervangen en Ga naar: het navigatievenster uit src/tekst/zoeken (#29). */
const Zoeken = ZoekKnoppen;
function WoordenTellen({ opdrachten }: { opdrachten: Opdrachten }) {
  const { t } = useTranslation("ribbon");
  return (
    <EigenKnop
      naam={t("writer.commands.wordCount")}
      icoon={WholeWord}
      groot
      onClick={() => opdrachten.setDialoog("woorden")}
    />
  );
}
function Opmerking({ opdrachten }: { opdrachten: Opdrachten }) {
  const { t } = useTranslation("ribbon");
  return (
    <EigenKnop
      naam={t("writer.commands.comment")}
      icoon={MessageSquarePlus}
      groot
      sneltoets="Ctrl+Alt+C"
      disabled={!opdrachten.invoerbaar}
      onClick={() => opdrachten.setDialoog("opmerking")}
    />
  );
}
function Afdrukken() {
  const { t } = useTranslation("ribbon");
  return (
    <Groep naam={t("writer.groups.print")}>
      <Actie
        naam={t("writer.commands.print")}
        icoon={Printer}
        title={t("writer.hints.print", { shortcut: "Ctrl+P" })}
        groot
        onClick={() => vraagAfdrukvoorbeeld()}
      />
    </Groep>
  );
}
export function TekstRibbon({
  bestand,
  liniaal,
  navigatie,
  wijzigLiniaal,
  wijzigNavigatie,
  zoomKoppeling,
}: {
  bestand: () => void;
  liniaal: boolean;
  navigatie: boolean;
  wijzigLiniaal: () => void;
  wijzigNavigatie: () => void;
  zoomKoppeling?: ZoomKoppeling;
}) {
  const { t } = useTranslation("ribbon");
  const zoom = useDocxCommand("zoom");
  const profiel = useInstellingen().tekst.sneltoetsprofiel;
  useDocumentZoom({
    opdracht: zoom,
    vlak: () =>
      zichtbaarElement<HTMLElement>(
        ".office-tekst .docx-editor__scroll-container",
      ),
    koppeling: zoomKoppeling,
    // ‘Passend’: de paginabreedte vult het venster.
    pasBreedte: () =>
      zichtbaarElement<HTMLElement>(".office-tekst .canvas-page")?.getBoundingClientRect()
        .width ?? null,
    // Word-profiel: Ctrl+Shift+= en Ctrl+Shift+- zijn super- en subscript.
    overslaan: (e) => moduleToets("tekst", profiel, e),
  });
  const opdrachten = useTekstOpdrachten({ wijzigLiniaal, wijzigNavigatie });
  const herlaad = useEditorApi().herlaad;
  const grafieken = useIngeslotenGrafieken("docx");
  const pagina = usePagina();
  const tabel = useDocxCommand("tableAction");
  const afbeelding = useDocxCommand("imageProperties");
  const contextTabs: RibbonTab[] = [];
  if (tabel.state.value)
    contextTabs.push({
      id: "tabel",
      naam: t("writer.tabs.tableDesign"),
      inhoud: (
        <>
          <Groep naam={t("writer.groups.rows")}>
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="addRowAbove"
                naam={t("writer.commands.insertRowAbove")}
                icoon={Rows3}
              />
              <W
                id="tableAction"
                args="addRowBelow"
                naam={t("writer.commands.insertRowBelow")}
                icoon={Rows3}
              />
            </div>
          </Groep>
          <Groep naam={t("writer.groups.columns")}>
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="addColumnLeft"
                naam={t("writer.commands.insertColumnLeft")}
                icoon={Columns2}
              />
              <W
                id="tableAction"
                args="addColumnRight"
                naam={t("writer.commands.insertColumnRight")}
                icoon={Columns2}
              />
            </div>
          </Groep>
          <Groep naam={t("writer.groups.cells")}>
            <W
              id="tableAction"
              args="mergeCells"
              naam={t("writer.commands.mergeCells")}
              icoon={Merge}
              groot
            />
            <W
              id="tableAction"
              args="splitCell"
              naam={t("writer.commands.splitCell")}
              icoon={Grid2X2}
              groot
            />
          </Groep>
          <Groep naam={t("writer.groups.select")}>
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="selectRow"
                naam={t("writer.commands.selectRow")}
                icoon={Rows3}
              />
              <W
                id="tableAction"
                args="selectColumn"
                naam={t("writer.commands.selectColumn")}
                icoon={Columns2}
              />
              <W
                id="tableAction"
                args="selectTable"
                naam={t("writer.commands.selectTable")}
                icoon={Table2}
              />
            </div>
          </Groep>
          <Groep naam={t("writer.groups.tableStyle")}>
            <div className="ribbon-ingebouwd">
              <TekstControl id="tableAction" />
              <span>{t("writer.commands.bordersAndShading")}</span>
            </div>
          </Groep>
          <Groep naam={t("writer.groups.tableLayout")}>
            <W
              id="tableAction"
              args={{ type: "openTableProperties" }}
              naam={t("writer.commands.properties")}
              icoon={Table2}
              groot
            />
          </Groep>
          <TabelIndeling />
          <Groep naam={t("writer.groups.delete")}>
            <div className="ribbon-stapel">
              <W
                id="tableAction"
                args="deleteRow"
                naam={t("writer.commands.deleteRow")}
                icoon={Trash2}
              />
              <W
                id="tableAction"
                args="deleteColumn"
                naam={t("writer.commands.deleteColumn")}
                icoon={Trash2}
              />
            </div>
            <W
              id="tableAction"
              args="deleteTable"
              naam={t("writer.commands.deleteTable")}
              icoon={Trash2}
              groot
            />
          </Groep>
        </>
      ),
    });
  if (afbeelding.state.enabled)
    contextTabs.push({
      id: "afbeelding",
      naam: t("writer.tabs.pictureFormat"),
      inhoud: (
        <>
          <Groep naam={t("writer.groups.picture")}>
            <W id="imageProperties" naam={t("writer.commands.properties")} icoon={Image} groot />
          </Groep>
          <AfbeeldingGroepen />
          <Groep naam={t("writer.groups.wrapText")}>
            <WK id="imageWrap" naam={t("writer.commands.wrapText")} breed />
          </Groep>
          <Groep naam={t("writer.groups.rotate")}>
            <W
              id="imageTransform"
              args={{ action: "rotateCW" }}
              naam={t("writer.commands.rotateRight")}
              icoon={RotateCw}
              groot
            />
            <W
              id="imageTransform"
              args={{ action: "rotateCCW" }}
              naam={t("writer.commands.rotateLeft")}
              icoon={RotateCcw}
              groot
            />
          </Groep>
          <Groep naam={t("writer.groups.flip")}>
            <W
              id="imageTransform"
              args={{ action: "flipH" }}
              naam={t("writer.commands.flipHorizontal")}
              icoon={FlipHorizontal2}
              groot
            />
            <W
              id="imageTransform"
              args={{ action: "flipV" }}
              naam={t("writer.commands.flipVertical")}
              icoon={FlipVertical2}
              groot
            />
          </Groep>
        </>
      ),
    });
  return (
    <TekstBewerken opdrachten={opdrachten}>
    <TekstOpmaakProvider>
    <StijlenBeheer>
      <Ribbon
        bestand={bestand}
        beginTab={herlaad ? lintTabPerDocument.get(herlaad) : undefined}
        bijTabKeuze={(id) => {
          if (herlaad) lintTabPerDocument.set(herlaad, id);
        }}
        tabs={[
          {
            id: "start",
            naam: t("writer.tabs.home"),
            inhoud: (
              <>
                <Geschiedenis soort="tekst" />
                <Klembord opdrachten={opdrachten} />
                <TekstLettertype />
                <TekstAlinea />
                <Stijlen />
                <OpmaakWissen />
                <Zoeken />
              </>
            ),
          },
          {
            id: "invoegen",
            naam: t("writer.tabs.insert"),
            inhoud: (
              <>
                <Groep naam={t("writer.groups.pages")}>
                  <WS
                    id="insertPageBreak"
                    naam={t("writer.commands.pageBreak")}
                    icoon={FilePlus2}
                    sneltoets="Ctrl+Enter"
                    groot
                  />
                </Groep>
                <Groep naam={t("writer.groups.tables")}>
                  <TabelKiezer />
                  <TekstNaarTabelKnop />
                </Groep>
                <Groep naam={t("writer.groups.illustrations")}>
                  <W id="insertImage" naam={t("writer.commands.picture")} icoon={Image} groot />
                </Groep>
                <GrafiekGroep g={grafieken} uit={!opdrachten.bewerkbaar} />
                <Groep naam={t("writer.groups.links")}>
                  <W id="insertLink" naam={t("writer.commands.hyperlink")} icoon={Link} groot />
                </Groep>
                <KopVoetInvoegenGroep p={pagina} />
                <Groep naam={t("writer.groups.comments")}>
                  <Opmerking opdrachten={opdrachten} />
                </Groep>
                <Groep naam={t("writer.groups.text")}>
                  {/* Platte tekst kan ook in een kop- of voettekst die u bewerkt. */}
                  <EigenKnop
                    naam={t("writer.commands.specialCharacter")}
                    icoon={Omega}
                    groot
                    disabled={!opdrachten.invoerbaar && !pagina.kopVoet}
                    onClick={() => opdrachten.setDialoog("teken")}
                  />
                  <div className="ribbon-stapel">
                    <EigenKnop
                      naam={t("writer.commands.date")}
                      icoon={CalendarDays}
                      uitleg={t("writer.hints.date")}
                      disabled={!opdrachten.bewerkbaar && !pagina.kopVoet}
                      onClick={() => opdrachten.voegIn(datumTekst(new Date()))}
                    />
                    <EigenKnop
                      naam={t("writer.commands.time")}
                      icoon={Clock}
                      uitleg={t("writer.hints.time")}
                      disabled={!opdrachten.bewerkbaar && !pagina.kopVoet}
                      onClick={() => opdrachten.voegIn(tijdTekst(new Date()))}
                    />
                    <DatumTijdKnop />
                  </div>
                </Groep>
              </>
            ),
          },
          {
            id: "opmaak",
            naam: t("writer.tabs.format"),
            inhoud: (
              <>
                <Groep naam={t("writer.groups.characterFormatting")}>
                  <div className="ribbon-rij ribbon-iconen">
                    <W id="bold" naam={t("writer.commands.bold")} icoon={Bold} />
                    <W id="italic" naam={t("writer.commands.italic")} icoon={Italic} />
                    <W id="underline" naam={t("writer.commands.underline")} icoon={Underline} />
                    <EigenKnop
                      naam={t("writer.commands.doubleUnderline")}
                      icoon={Baseline}
                      sneltoets="Ctrl+D"
                      disabled={!opdrachten.bewerkbaar}
                      onClick={() => void opdrachten.dubbelOnderstrepen()}
                    />
                  </div>
                  <div className="ribbon-rij ribbon-iconen">
                    <W
                      id="strikethrough"
                      naam={t("writer.commands.strikethrough")}
                      icoon={Strikethrough}
                    />
                    <WS
                      id="superscript"
                      naam={t("writer.commands.superscript")}
                      icoon={Superscript}
                      sneltoets="Ctrl+Shift+P"
                    />
                    <WS
                      id="subscript"
                      naam={t("writer.commands.subscript")}
                      icoon={Subscript}
                      sneltoets="Ctrl+Shift+B"
                    />
                  </div>
                </Groep>
                <Groep naam={t("writer.groups.changeCase")}>
                  <div className="ribbon-rij ribbon-iconen">
                    {hoofdletterKnoppen
                      .slice(0, 3)
                      .map(({ soort, sleutel, ...knop }) => (
                        <EigenKnop
                          key={soort}
                          {...knop}
                          naam={t(`writer.case.${sleutel}`)}
                          disabled={!opdrachten.bewerkbaar}
                          onClick={() => void opdrachten.hoofdletters(soort)}
                        />
                      ))}
                  </div>
                  <div className="ribbon-rij ribbon-iconen">
                    {hoofdletterKnoppen.slice(3).map(({ soort, sleutel, ...knop }) => (
                      <EigenKnop
                        key={soort}
                        {...knop}
                        naam={t(`writer.case.${sleutel}`)}
                        disabled={!opdrachten.bewerkbaar}
                        onClick={() => void opdrachten.hoofdletters(soort)}
                      />
                    ))}
                  </div>
                </Groep>
                <OpmaakWissen />
                <TekstAlinea />
                <Groep naam={t("writer.groups.lineSpacing")}>
                  <WK id="lineSpacing" naam={t("writer.commands.lineSpacing")} breed vertaal={decimaleKomma} />
                </Groep>
                <Groep naam={t("writer.groups.textDirection")}>
                  <div className="ribbon-stapel">
                    <W
                      id="setLtr"
                      naam={t("writer.commands.leftToRight")}
                      icoon={AlignLeft}
                    />
                    <W
                      id="setRtl"
                      naam={t("writer.commands.rightToLeft")}
                      icoon={AlignRight}
                    />
                  </div>
                </Groep>
              </>
            ),
          },
          kopVoetTab(pagina),
          verwijzingenTab(pagina),
          {
            id: "stijlen",
            naam: t("writer.tabs.styles"),
            inhoud: (
              <>
                <Stijlen uitgebreid />
                <StijlBeheerGroep />
                <OpmaakWissen />
              </>
            ),
          },
          {
            id: "indeling",
            naam: t("writer.tabs.layout"),
            inhoud: (
              <>
                <Groep naam={t("writer.groups.pageSetup")}>
                  <PaginaIndelingKnoppen p={pagina} />
                  <W
                    id="pageSetup"
                    naam={t("writer.commands.pageSetup")}
                    icoon={LayoutTemplate}
                    groot
                  />
                  <WatermerkKnop p={pagina} />
                </Groep>
                <KolommenGroep p={pagina} />
                <Groep naam={t("writer.groups.pageBackground")}>
                  <PaginaAchtergrondKnoppen />
                </Groep>
                <Groep naam={t("writer.groups.breaks")}>
                  <WS
                    id="insertPageBreak"
                    naam={t("writer.commands.pageBreak")}
                    icoon={FilePlus2}
                    sneltoets="Ctrl+Enter"
                    groot
                  />
                  <SectieEindes p={pagina} />
                  <ExtraEindes p={pagina} />
                </Groep>
                <AfstandGroep />
                <Groep naam={t("writer.groups.lineSpacing")}>
                  <WK id="lineSpacing" naam={t("writer.commands.lineSpacing")} breed vertaal={decimaleKomma} />
                </Groep>
              </>
            ),
          },
          {
            id: "controleren",
            naam: t("writer.tabs.review"),
            inhoud: (
              <>
                <Groep naam={t("writer.groups.proofing")}>
                  <EigenKnop
                    naam={t("writer.commands.spellingGrammar")}
                    icoon={SpellCheck}
                    groot
                    sneltoets="F7"
                    uitleg={t("writer.hints.spelling")}
                    onClick={() => {
                      if (!openSpellingVenster()) opdrachten.fout(t("writer.errors.spellingNotReady"));
                    }}
                  />
                  <WoordenTellen opdrachten={opdrachten} />
                </Groep>
                <Groep naam={t("writer.groups.comments")}>
                  <Opmerking opdrachten={opdrachten} />
                  <W
                    id="commentsSidebar"
                    naam={t("writer.commands.showComments")}
                    icoon={MessageSquare}
                    groot
                  />
                </Groep>
                <Groep naam={t("writer.groups.tracking")}>
                  <EigenKnop
                    naam={t("writer.commands.trackChanges")}
                    icoon={PenLine}
                    groot
                    actief={opdrachten.opnemen}
                    uitleg={t("writer.hints.trackChanges")}
                    sneltoets="Ctrl+Shift+C"
                    onClick={opdrachten.wisselOpnemen}
                  />
                  <WK id="editingMode" naam={t("writer.commands.editingMode")} breed />
                </Groep>
                <Groep naam={t("writer.groups.changes")}>
                  <W id="reviewAccept" naam={t("writer.commands.accept")} icoon={Check} groot />
                  <W id="reviewReject" naam={t("writer.commands.reject")} icoon={X} groot />
                  <div className="ribbon-stapel">
                    <W id="reviewPrevious" naam={t("writer.commands.previous")} icoon={ChevronLeft} />
                    <W id="reviewNext" naam={t("writer.commands.next")} icoon={ChevronRight} />
                  </div>
                </Groep>
                <WijzigingenGroepen />
                <Zoeken groot />
              </>
            ),
          },
          {
            id: "beeld",
            naam: t("writer.tabs.view"),
            inhoud: (
              <>
                <WeergaveGroep />
                <Groep naam={t("writer.groups.show")}>
                  <Actie
                    icoon={Ruler}
                    naam={t("writer.commands.ruler")}
                    groot
                    actief={liniaal}
                    title={`${t("writer.commands.ruler")} · Ctrl+Shift+R`}
                    onClick={wijzigLiniaal}
                  />
                  <Actie
                    icoon={PanelLeft}
                    naam={t("writer.commands.navigator")}
                    groot
                    actief={navigatie}
                    title={`${t("writer.commands.navigator")} · F5`}
                    onClick={wijzigNavigatie}
                  />
                </Groep>
                <Groep naam={t("writer.groups.navigation")}>
                  <EigenKnop
                    naam={t("writer.commands.goToPage")}
                    icoon={ArrowDownToLine}
                    groot
                    onClick={() => opdrachten.setDialoog("pagina")}
                  />
                </Groep>
                <Zoom opdracht={zoom} />
                <Afdrukken />
              </>
            ),
          },
          {
            id: "extra",
            naam: t("writer.tabs.tools"),
            inhoud: (
              <>
                <Groep naam={t("writer.groups.tools")}>
                  <WoordenTellen opdrachten={opdrachten} />
                </Groep>
                <Groep naam={t("writer.groups.symbols")}>
                  <EigenKnop
                    naam={t("writer.commands.specialCharacter")}
                    icoon={Omega}
                    groot
                    disabled={!opdrachten.invoerbaar && !pagina.kopVoet}
                    onClick={() => opdrachten.setDialoog("teken")}
                  />
                </Groep>
              </>
            ),
          },
          ...contextTabs,
        ]}
      />
      <TekstDialogen opdrachten={opdrachten} />
      <WordHost />
      <Liniaal aan={liniaal} />
      <TekstStatus opdrachten={opdrachten} />
      <TekstInfo />
      {grafieken.venster}
      {pagina.venster}
    </StijlenBeheer>
    </TekstOpmaakProvider>
    </TekstBewerken>
  );
}
