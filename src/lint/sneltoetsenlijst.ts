/**
 * Centraal register van sneltoetsen: de vaste lijst (app, lint en engines)
 * plus wat `useSneltoetsen` op dit moment in een module heeft geregistreerd.
 * Het overzicht (F1 of Ctrl+/) en de botsingentest lezen hieruit.
 *
 * Omschrijvingen staan als sleutel in `ribbon:shortcuts.commands.*`;
 * `omschrijving` vertaalt bij het lezen in de interfacetaal van dat moment.
 * Toetsen en ids (`id`, `actie`) zijn vast.
 */
import i18next from "../i18n/config";
import { ontleed, past } from "./sneltoetsen";

export type SneltoetsModule =
  | "algemeen"
  | "tekst"
  | "rekenblad"
  | "presentatie"
  | "database"
  | "email"
  | "notities";

/** Modulenamen in de interfacetaal (getters: vertaald bij het lezen). */
export const moduleNamen: Record<SneltoetsModule, string> = {
  get algemeen() {
    return i18next.t("ribbon:shortcuts.modules.algemeen");
  },
  get tekst() {
    return i18next.t("ribbon:shortcuts.modules.tekst");
  },
  get rekenblad() {
    return i18next.t("ribbon:shortcuts.modules.rekenblad");
  },
  get presentatie() {
    return i18next.t("ribbon:shortcuts.modules.presentatie");
  },
  get database() {
    return i18next.t("ribbon:shortcuts.modules.database");
  },
  get email() {
    return i18next.t("ribbon:shortcuts.modules.email");
  },
  get notities() {
    return i18next.t("ribbon:shortcuts.modules.notities");
  },
};

/**
 * Sneltoetsprofiel van de tekstmodule (instelling `tekst.sneltoetsprofiel`):
 * het standaardprofiel volgt LibreOffice, het Word-profiel Microsoft Word.
 * Toetsen zonder `profiel` gelden in beide.
 */
export type SneltoetsProfiel = "standaard" | "word";

export const profielNamen: Record<SneltoetsProfiel, string> = {
  get standaard() {
    return i18next.t("ribbon:shortcuts.profiles.standaard");
  },
  get word() {
    return i18next.t("ribbon:shortcuts.profiles.word");
  },
};

export interface SneltoetsInfo {
  toets: string;
  /** Omschrijving in de interfacetaal (bij de vaste lijst vertaald bij het lezen). */
  omschrijving: string;
  /**
   * Vaste id van de omschrijving (sleutel onder `ribbon:shortcuts.commands`);
   * gelijk in elke taal. Ontbreekt bij geregistreerde toetsen buiten de lijst.
   */
  id?: string;
  module: SneltoetsModule;
  /** Wie de toets afhandelt: de app, het lint van de module of de engine. */
  bron: "app" | "lint" | "engine";
  /** Alleen voor algemene toetsen: modules waar de toets iets anders doet. */
  behalve?: SneltoetsModule[];
  /** Alleen in deze modules (bijvoorbeeld zoomen in documenten). */
  alleen?: SneltoetsModule[];
  /** Alleen in dit sneltoetsprofiel; zonder profiel in elk profiel. */
  profiel?: SneltoetsProfiel;
  /**
   * Opdracht die `src/tekst/bewerken` voor deze toets uitvoert; zo staan
   * toets en omschrijving alleen hier.
   */
  actie?: string;
  /**
   * Opdracht-id uit `src/tekst/menu/opdrachten.ts` die deze toets uitvoert, voor functies die
   * een ander onderdeel levert (bijvoorbeeld het autofilter van Rekenblad). Zolang niemand de
   * opdracht heeft aangemeld, toont het overzicht de toets als nog niet beschikbaar.
   */
  opdracht?: string;
}

const documenten: SneltoetsModule[] = ["tekst", "rekenblad", "presentatie"];

/**
 * Eén toets uit de vaste lijst. De omschrijving is een getter, zodat elke
 * lezer (overzicht, zoeken, knopuitleg) de tekst in de huidige taal krijgt.
 */
function maak(
  toets: string,
  id: string,
  module: SneltoetsModule,
  bron: SneltoetsInfo["bron"],
  extra: Partial<Omit<SneltoetsInfo, "omschrijving" | "id">> = {},
  waarden?: Record<string, string | number>,
): SneltoetsInfo {
  return {
    toets,
    id,
    module,
    bron,
    ...extra,
    get omschrijving() {
      return i18next.t(`ribbon:shortcuts.commands.${id}`, waarden);
    },
  };
}

const algemeen = (
  toets: string,
  id: string,
  extra: Partial<Omit<SneltoetsInfo, "omschrijving" | "id">> = {},
  waarden?: Record<string, string | number>,
): SneltoetsInfo => maak(toets, id, "algemeen", "app", extra, waarden);
const lint = (module: SneltoetsModule) => (toets: string, id: string): SneltoetsInfo =>
  maak(toets, id, module, "lint");
const engine = (module: SneltoetsModule) => (toets: string, id: string): SneltoetsInfo =>
  maak(toets, id, module, "engine");

const tekst = lint("tekst");
/** Tekst, alleen in het standaardprofiel (LibreOffice-achtig). */
const tekstStandaard = (toets: string, id: string): SneltoetsInfo =>
  maak(toets, id, "tekst", "lint", { profiel: "standaard" });
/** Tekst, alleen in het Word-profiel, met de opdracht uit `src/tekst/bewerken`. */
const tekstWord = (toets: string, id: string, actie: string): SneltoetsInfo =>
  maak(toets, id, "tekst", "lint", { profiel: "word", actie });
/** Tekst, in elk profiel, met de opdracht uit `src/tekst/bewerken`. */
const tekstBewerken = (toets: string, id: string, actie: string): SneltoetsInfo =>
  maak(toets, id, "tekst", "lint", { actie });
const rekenblad = lint("rekenblad");
const presentatie = lint("presentatie");
const tekstEngine = engine("tekst");
const rekenbladEngine = engine("rekenblad");
const presentatieEngine = engine("presentatie");
const email = (toets: string, id: string): SneltoetsInfo => maak(toets, id, "email", "app");
const notities = (toets: string, id: string): SneltoetsInfo => maak(toets, id, "notities", "app");
const database = (toets: string, id: string): SneltoetsInfo => maak(toets, id, "database", "app");

/** Opdracht-ids voor toetsen die een ander onderdeel (of later de engine) invult. */
export const OPDRACHTEN = {
  /** Rekenblad: autofilter aan/uit op de selectie (Ctrl+Shift+L; #62). */
  rekenbladFilter: "rekenblad.filter",
  /** Rekenblad: onderstrepen (Ctrl+U); de engine kent nog geen onderstreping in celopmaak. */
  rekenbladOnderstrepen: "rekenblad.onderstrepen",
} as const;

/** Klembord en selecteren: in elke editor via de engine en de webview. */
const klembord = (maak: ReturnType<typeof engine>) => [
  maak("Ctrl+X", "cut"),
  maak("Ctrl+C", "copy"),
  maak("Ctrl+V", "paste"),
  maak("Ctrl+A", "selectAll"),
];

export const vasteSneltoetsen: readonly SneltoetsInfo[] = [
  // Werkruimte (src/useTabSneltoetsen.ts, src/useDocumentZoom.ts, het lint).
  algemeen("Ctrl+S", "saveLastFormat"),
  algemeen("Ctrl+Shift+S", "saveAs", { alleen: documenten }),
  algemeen("F12", "saveAs", { alleen: documenten }),
  algemeen("Ctrl+O", "open"),
  algemeen("Ctrl+N", "newDocument", { alleen: documenten }),
  algemeen("Ctrl+W", "closeTab"),
  algemeen("Ctrl+F4", "closeTab"),
  algemeen("Ctrl+Tab", "nextTab"),
  algemeen("Ctrl+Shift+Tab", "previousTab"),
  algemeen("Ctrl+F6", "nextTab"),
  algemeen("Ctrl+Shift+F6", "previousTab"),
  algemeen("Ctrl+PageDown", "nextTab", { behalve: ["rekenblad"] }),
  algemeen("Ctrl+PageUp", "previousTab", { behalve: ["rekenblad"] }),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => algemeen(`Alt+${n}`, "tabNumber", {}, { number: n })),
  algemeen("Alt+9", "lastTab"),
  algemeen("Escape", "backFromStart"),
  algemeen("Ctrl+0", "zoom100", { alleen: documenten }),
  algemeen("Ctrl+=", "zoomIn", { alleen: documenten }),
  algemeen("Ctrl+-", "zoomOut", { alleen: documenten }),
  algemeen("F1", "shortcutOverview"),
  algemeen("Ctrl+/", "shortcutOverview"),
  algemeen("Ctrl+,", "settings"),
  algemeen("F10", "toggleKeyTips"),
  algemeen("Ctrl+F1", "toggleRibbon"),
  algemeen("F6", "nextPane"),
  algemeen("Shift+F6", "previousPane"),

  // Tekst: lint (src/lint/tekst-opdrachten.tsx).
  tekstStandaard("Ctrl+1", "heading1"),
  tekstStandaard("Ctrl+2", "heading2"),
  tekstStandaard("Ctrl+3", "heading3"),
  tekstStandaard("Ctrl+Shift+P", "superscript"),
  tekstStandaard("Ctrl+Shift+B", "subscript"),
  tekstStandaard("Ctrl+D", "doubleUnderline"),
  tekstStandaard("Ctrl+M", "clearFormatting"),
  tekst("Shift+F3", "changeCase"),
  tekst("Ctrl+Enter", "pageBreak"),
  tekst("Ctrl+F12", "insertTable"),
  tekstStandaard("Ctrl+Alt+C", "insertComment"),
  tekstStandaard("Ctrl+Shift+C", "toggleTrackChanges"),
  // Tekst: bewerken in elk profiel (src/tekst/bewerken).
  tekstBewerken("Ctrl+Shift+>", "growFont", "groter"),
  tekstBewerken("Ctrl+Shift+<", "shrinkFont", "kleiner"),
  tekstBewerken("Ctrl+]", "growFontOnePoint", "puntGroter"),
  tekstBewerken("Ctrl+[", "shrinkFontOnePoint", "puntKleiner"),
  tekstBewerken("Ctrl+Shift+V", "pasteTextOnly", "plakkenTekst"),
  tekstBewerken("F4", "repeatLastFormatting", "herhalen"),
  // Tekst: Word-profiel (src/tekst/bewerken/acties.ts).
  tekstWord("Ctrl+1", "lineSpacingSingle", "regelafstand1"),
  tekstWord("Ctrl+2", "lineSpacingDouble", "regelafstand2"),
  tekstWord("Ctrl+5", "lineSpacingOneAndHalf", "regelafstand15"),
  tekstWord("Ctrl+Alt+1", "heading1", "kop1"),
  tekstWord("Ctrl+Alt+2", "heading2", "kop2"),
  tekstWord("Ctrl+Alt+3", "heading3", "kop3"),
  tekstWord("Ctrl+Shift+N", "normalStyle", "standaardstijl"),
  tekstWord("Ctrl+Space", "clearCharacterFormatting", "opmaakWissen"),
  tekstWord("Ctrl+Q", "clearParagraphFormatting", "alineaOpmaakWissen"),
  tekstWord("Ctrl+Shift+E", "toggleTrackChanges", "bijhouden"),
  tekstWord("Ctrl+Alt+C", "copyFormatting", "kwastKopieren"),
  tekstWord("Ctrl+Alt+V", "pasteFormatting", "kwastPlakken"),
  tekstWord("Ctrl+Shift+C", "copyFormattingClassic", "kwastKopieren"),
  tekstWord("Ctrl+Shift++", "superscript", "superscript"),
  tekstWord("Ctrl+Shift+=", "superscriptClassic", "superscript"),
  tekstWord("Ctrl+Shift+-", "subscript", "subscript"),
  tekstWord("Ctrl+M", "increaseIndent", "inspringen"),
  tekstWord("Ctrl+Shift+M", "decreaseIndent", "minderInspringen"),
  tekstWord("Ctrl+Shift+L", "bullets", "opsomming"),
  tekstWord("Ctrl+Alt+M", "insertComment", "opmerking"),
  tekstWord("Ctrl+D", "fontDialog", "lettertype"),
  tekstWord("Ctrl+Shift+F", "fontDialog", "lettertype"),
  tekstWord("Ctrl+Shift+D", "doubleUnderline", "dubbelOnderstrepen"),
  tekst("Ctrl+P", "printWithPreview"),
  tekst("Ctrl+Shift+O", "printPreview"),
  tekst("F5", "navigationPane"),
  tekst("F7", "spellingGrammar"),
  tekst("Ctrl+Shift+R", "toggleRuler"),
  tekst("F11", "allStyles"),
  // Tekst: Word-functies (src/tekst/**).
  tekst("Ctrl+F", "findInNavigationPane"),
  tekst("Ctrl+H", "advancedFindReplace"),
  tekst("Ctrl+G", "goTo"),
  tekst("Ctrl+Alt+Shift+S", "stylesPane"),
  // Tekst: opmaakvensters (src/tekst/TekstOpmaak.tsx).
  // Lettertype… en Alinea… zijn ook aangemeld bij src/tekst/menu/opdrachten.ts
  // (rechtermuismenu, en in het Word-profiel Ctrl+D en Ctrl+Shift+F).
  tekst("Ctrl+Shift+J", "paragraphDialog"),
  tekst("Ctrl+Shift+A", "allCaps"),
  tekst("Ctrl+Shift+K", "smallCaps"),
  tekst("Ctrl+Shift+H", "hiddenText"),
  // Tekst: paginafuncties (src/tekst/pagina/ui/usePagina.tsx).
  tekst("Ctrl+Alt+F", "insertFootnote"),
  tekst("Ctrl+Alt+D", "insertEndnote"),
  tekst("Ctrl+Shift+Enter", "columnBreak"),
  // Tekst: engine (@betteroffice/docx-react).
  tekstEngine("Ctrl+B", "bold"),
  tekstEngine("Ctrl+I", "italic"),
  tekstEngine("Ctrl+U", "underline"),
  tekstEngine("Ctrl+Z", "undo"),
  tekstEngine("Ctrl+Y", "redoOrRepeat"),
  tekstEngine("Ctrl+Shift+Z", "redo"),
  tekstEngine("Ctrl+K", "insertLink"),
  tekstEngine("Ctrl+L", "alignLeft"),
  tekstEngine("Ctrl+E", "center"),
  tekstEngine("Ctrl+R", "alignRight"),
  tekstEngine("Ctrl+J", "justify"),
  ...klembord(tekstEngine),

  // Rekenblad: lint (src/lint/rekenblad.tsx).
  rekenblad("Ctrl+L", "alignLeft"),
  rekenblad("Ctrl+E", "center"),
  // Ctrl+R is naar rechts doorvoeren, zoals Ctrl+D omlaag (#63); rechts uitlijnen via het lint.
  rekenblad("Ctrl+Shift+1", "numberFormat"),
  rekenblad("Ctrl+Shift+2", "scientificFormat"),
  rekenblad("Ctrl+Shift+3", "dateFormat"),
  rekenblad("Ctrl+Shift+4", "currencyFormat"),
  rekenblad("Ctrl+Shift+5", "percentFormat"),
  rekenblad("Ctrl+Shift+6", "generalFormat"),
  rekenblad("Alt+=", "autoSum"),
  rekenblad("Ctrl+;", "todaysDate"),
  rekenblad("Ctrl+Shift+;", "currentTime"),
  rekenblad("Ctrl+Shift+:", "currentTime"),
  rekenblad("Ctrl+D", "fillDown"),
  rekenblad("Ctrl+R", "fillRight"),
  rekenblad("Shift+F3", "insertFunction"),
  // Op een kopcel met filterpijl (src/lint/rekenblad-laag.tsx).
  rekenblad("Alt+ArrowDown", "openFilterMenu"),
  // F4 in de celinvoer of formulebalk (src/lint/rekenblad-formulebalk.tsx).
  rekenblad("F4", "toggleReference"),
  rekenblad("Ctrl+PageUp", "previousSheet"),
  rekenblad("Ctrl+PageDown", "nextSheet"),
  rekenblad("Ctrl+F", "find"),
  rekenblad("Ctrl+H", "findReplace"),
  rekenblad("F5", "goTo"),
  rekenblad("Ctrl+Shift+F5", "goTo"),
  rekenblad("Ctrl+P", "printWithPreviewLayout"),
  rekenblad("Ctrl+Shift+O", "printPreview"),
  rekenblad("Alt+F1", "chartOnSheet"),
  rekenblad("F11", "chartNewSheet"),
  maak("Ctrl+Shift+L", "filter", "rekenblad", "lint", { opdracht: OPDRACHTEN.rekenbladFilter }),
  maak("Ctrl+U", "underline", "rekenblad", "engine", { opdracht: OPDRACHTEN.rekenbladOnderstrepen }),
  // Rekenblad: engine (@betteroffice/xlsx-react).
  rekenbladEngine("Ctrl+B", "bold"),
  rekenbladEngine("Ctrl+I", "italic"),
  rekenbladEngine("Ctrl+Z", "undo"),
  rekenbladEngine("Ctrl+Y", "redo"),
  rekenbladEngine("Ctrl+Shift+Z", "redo"),
  // Klembord als HTML-tabel en tekst, plakken speciaal (src/rekenblad/RekenbladExtra.tsx).
  rekenblad("Ctrl+X", "cut"),
  rekenblad("Ctrl+C", "copy"),
  rekenblad("Ctrl+V", "paste"),
  rekenblad("Ctrl+Shift+V", "pasteValues"),
  rekenblad("Ctrl+Alt+V", "pasteSpecial"),
  rekenblad("Ctrl+1", "formatCells"),
  rekenbladEngine("Ctrl+A", "selectAll"),
  rekenbladEngine("F2", "editCell"),

  // Presentatie: lint (src/lint/presentatie-acties.tsx).
  presentatie("F5", "slideshowFromBeginning"),
  presentatie("Shift+F5", "slideshowFromCurrent"),
  presentatie("Alt+F5", "presenterView"),
  // Tijdens de voorstelling (src/presentatie/voorstelling-logica.ts).
  presentatie("B", "showBlackScreen"),
  presentatie("W", "showWhiteScreen"),
  presentatie("P", "showPen"),
  presentatie("H", "showHighlighter"),
  presentatie("L", "showLaser"),
  presentatie("E", "showClearInk"),
  presentatie("Ctrl+M", "newSlide"),
  presentatie("Ctrl+L", "alignLeft"),
  presentatie("Ctrl+E", "center"),
  presentatie("Ctrl+R", "alignRight"),
  presentatie("Ctrl+J", "justify"),
  presentatie("PageUp", "previousSlide"),
  presentatie("PageDown", "nextSlide"),
  presentatie("Home", "firstSlide"),
  presentatie("End", "lastSlide"),
  presentatie("Ctrl+Shift+PageUp", "moveSlideUp"),
  presentatie("Ctrl+Shift+PageDown", "moveSlideDown"),
  presentatie("Ctrl+Shift+Home", "moveSlideToStart"),
  presentatie("Ctrl+Shift+End", "moveSlideToEnd"),
  presentatie("Delete", "deleteShapeOrSlide"),
  // Presentatie: zoeken en vervangen (src/lint/presentatie-zoekpaneel.tsx) en Ctrl+Y.
  presentatie("Ctrl+F", "find"),
  presentatie("Ctrl+H", "findReplace"),
  presentatie("Ctrl+Y", "redo"),
  // Presentatie: afdrukvoorbeeld van de app (src/afdrukken/AfdrukvoorbeeldHost.tsx).
  maak("Ctrl+P", "printSlides", "presentatie", "app"),
  maak("Ctrl+Shift+O", "printPreview", "presentatie", "app"),
  // Presentatie: engine (@betteroffice/pptx-react).
  presentatieEngine("Ctrl+B", "bold"),
  presentatieEngine("Ctrl+I", "italic"),
  presentatieEngine("Ctrl+U", "underline"),
  presentatieEngine("Ctrl+Z", "undo"),
  presentatieEngine("Ctrl+Shift+Z", "redo"),
  ...klembord(presentatieEngine),

  // E-mail (packages/email/src/ui/EmailStudio.tsx, zoals Thunderbird).
  email("Ctrl+N", "newMessage"),
  email("Ctrl+R", "reply"),
  email("Ctrl+Shift+R", "replyAll"),
  email("Ctrl+L", "forward"),
  email("Ctrl+F", "searchMail"),
  email("F5", "getMail"),
  email("Ctrl+T", "getMail"),
  email("Delete", "deleteMessage"),
  email("M", "toggleRead"),
  email("S", "toggleStar"),
  email("A", "archive"),
  email("F", "nextMessage"),
  email("B", "previousMessage"),
  email("N", "nextUnread"),

  // Notities (src/notities/NotitiesStudio.tsx en MarkdownEditor.tsx).
  notities("Ctrl+Z", "undo"),
  notities("Ctrl+Y", "redo"),
  notities("Ctrl+Shift+Z", "redo"),
  notities("Ctrl+Shift+F", "searchNotes"),
  notities("Ctrl+B", "bold"),
  notities("Ctrl+I", "italic"),
  notities("Ctrl+K", "insertLink"),

  // Database: tabelraster (packages/database/src/ui/Raster.tsx).
  database("Ctrl+A", "selectAll"),
  database("Ctrl+C", "copy"),
  database("Ctrl+Shift+C", "copyWithHeaders"),
  database("Ctrl+V", "paste"),
  database("F2", "editCell"),
  database("Enter", "editCell"),
  database("Delete", "clearCell"),
  database("Ctrl+Space", "selectColumn"),
  database("Shift+Space", "selectRow"),
  database("Shift+F10", "contextMenu"),
];

/** Vaste vorm van een combinatie: modifiers op volgorde, toets in kleine letters. */
export function normaliseer(toets: string) {
  const c = ontleed(toets);
  return [c.ctrl && "ctrl", c.alt && "alt", c.shift && "shift", c.toets]
    .filter(Boolean)
    .join("+");
}

const isMac = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform,
  );

/** Leesbare toetsen; op macOS met Cmd en Option. */
export function toetsDelen(toets: string, mac = isMac()): string[] {
  const namen: Record<string, string> = mac
    ? { Ctrl: "⌘", Alt: "⌥", Shift: "⇧" }
    : {};
  const vertaling: Record<string, string> = {
    Escape: "Esc",
    PageUp: "Page Up",
    PageDown: "Page Down",
    Delete: "Delete",
    Space: i18next.t("ribbon:shortcuts.keys.space"),
  };
  const plus = toets.endsWith("++");
  const delen = (plus ? toets.slice(0, -2) : toets).split("+");
  if (plus) delen.push("+");
  return delen
    .map((deel, i, alle) =>
      i < alle.length - 1 ? (namen[deel] ?? deel) : (vertaling[deel] ?? deel),
    )
    .map((deel) => (deel === "" ? "+" : deel));
}

/** Of een toets in een module (en eventueel een sneltoetsprofiel) geldt. */
export function geldtIn(
  info: SneltoetsInfo,
  module: SneltoetsModule,
  profiel?: SneltoetsProfiel,
) {
  if (profiel && info.profiel && info.profiel !== profiel) return false;
  if (info.module !== "algemeen") return info.module === module;
  if (info.behalve?.includes(module)) return false;
  return !info.alleen || info.alleen.includes(module);
}

/** Of een toets in het gekozen profiel actief is (toetsen zonder profiel altijd). */
export function inProfiel(info: Pick<SneltoetsInfo, "profiel">, profiel: SneltoetsProfiel) {
  return !info.profiel || info.profiel === profiel;
}

/**
 * Of een toets van een module in dit profiel aan staat; een toets die alleen
 * in een ander profiel is beschreven, valt weg.
 */
export function toetsInProfiel(
  module: SneltoetsModule,
  toets: string,
  profiel: SneltoetsProfiel,
  lijst: readonly SneltoetsInfo[] = vasteSneltoetsen,
) {
  const sleutel = normaliseer(toets);
  const beschreven = lijst.filter(
    (i) => i.module === module && normaliseer(i.toets) === sleutel,
  );
  return !beschreven.length || beschreven.some((i) => inProfiel(i, profiel));
}

/**
 * Of een ingedrukte toets in dit profiel een eigen opdracht van de module is.
 * Zo laat de documentzoom Ctrl+Shift+= (Word: superscript) aan de tekst over.
 */
export function moduleToets(
  module: SneltoetsModule,
  profiel: SneltoetsProfiel,
  e: Parameters<typeof past>[1],
  lijst: readonly SneltoetsInfo[] = vasteSneltoetsen,
) {
  return lijst.some((i) => i.module === module && inProfiel(i, profiel) && past(i.toets, e));
}

/** Combinaties die in één module (per sneltoetsprofiel) twee keer iets anders doen. */
export function botsingen(lijst: readonly SneltoetsInfo[]) {
  const modules = Object.keys(moduleNamen).filter(
    (m) => m !== "algemeen",
  ) as SneltoetsModule[];
  const profielen = Object.keys(profielNamen) as SneltoetsProfiel[];
  const gevonden: {
    module: SneltoetsModule;
    toets: string;
    omschrijvingen: string[];
    profiel?: SneltoetsProfiel;
  }[] = [];
  for (const module of modules) {
    // Alleen de tekstmodule kent profielen; elders één ronde.
    const rondes = lijst.some((i) => i.module === module && i.profiel) ? profielen : [undefined];
    const gezien = new Set<string>();
    for (const profiel of rondes) {
      const per = new Map<string, SneltoetsInfo[]>();
      for (const info of lijst)
        if (geldtIn(info, module, profiel)) {
          const sleutel = normaliseer(info.toets);
          per.set(sleutel, [...(per.get(sleutel) ?? []), info]);
        }
      for (const [toets, infos] of per) {
        if (infos.length < 2) continue;
        // Dezelfde botsing in elk profiel maar één keer melden.
        const sleutel = `${module}:${toets}:${infos.map((i) => i.omschrijving).join("|")}`;
        if (gezien.has(sleutel)) continue;
        gezien.add(sleutel);
        gevonden.push({
          module,
          toets,
          omschrijvingen: infos.map((i) => i.omschrijving),
          ...(profiel && infos.some((i) => i.profiel) ? { profiel } : {}),
        });
      }
    }
  }
  return gevonden;
}

// Actieve registraties uit useSneltoetsen, voor het overzicht.
type Registratie = { module: SneltoetsModule; toetsen: { toets: string; omschrijving?: string }[] };
const registraties = new Set<Registratie>();
const luisteraars = new Set<() => void>();
let versie = 0;

export function registreerSneltoetsen(
  module: SneltoetsModule,
  toetsen: { toets: string; omschrijving?: string }[],
) {
  const registratie = { module, toetsen };
  registraties.add(registratie);
  versie++;
  luisteraars.forEach((l) => l());
  return () => {
    registraties.delete(registratie);
    versie++;
    luisteraars.forEach((l) => l());
  };
}

export function volgRegistraties(luisteraar: () => void) {
  luisteraars.add(luisteraar);
  return () => luisteraars.delete(luisteraar);
}
export const registratieVersie = () => versie;

/** De vaste lijst plus geregistreerde toetsen die daar (nog) niet in staan. */
export function alleSneltoetsen(): SneltoetsInfo[] {
  const lijst = [...vasteSneltoetsen];
  const bekend = new Set(lijst.map((i) => `${i.module}:${normaliseer(i.toets)}`));
  for (const { module, toetsen } of registraties)
    for (const { toets, omschrijving } of toetsen) {
      const sleutel = `${module}:${normaliseer(toets)}`;
      if (bekend.has(sleutel)) continue;
      bekend.add(sleutel);
      lijst.push({ toets, module, bron: "lint", omschrijving: omschrijving ?? toets });
    }
  return lijst;
}

/** Filtert op een zoekterm in omschrijving of toets. */
export function zoekSneltoetsen(lijst: readonly SneltoetsInfo[], zoek: string) {
  const term = zoek.trim().toLowerCase();
  if (!term) return [...lijst];
  return lijst.filter(
    (info) =>
      info.omschrijving.toLowerCase().includes(term) ||
      info.toets.toLowerCase().includes(term) ||
      normaliseer(info.toets).includes(term.replace(/\s+/g, "")),
  );
}
