/**
 * Eén consistent rapport over onvolledige ondersteuning, bij openen en bij
 * opslaan. Het rapport is niet-blokkerend bij openen en staat vóór opslaan
 * in het venster Opslaan als. Het is te kopiëren of als tekst te bewaren,
 * zodat het bij een foutmelding kan worden gevoegd.
 *
 * De teksten volgen de interfacetaal op het moment dat het rapport wordt
 * gemaakt (namespace `import`); een vaste `id` op een regel dient voor
 * vergelijkingen, zodat die niet van de taal afhangen.
 */
import i18next from "../i18n/config";
import type { Soort } from "../editors";
import type { Uitvoerformaat } from "../formaten";
import {
  MATRIXVERLIES,
  type Opslagroute,
  type Risico,
} from "../pakketcontrole";

export interface Rapportregel {
  /** Wat het betreft, bijvoorbeeld "Ingebedde objecten". */
  onderdeel: string;
  /** Wat de app ermee doet of wat er verloren gaat. */
  gevolg: string;
  /** Alleen ter informatie (bijv. herkende codering); niet in de kopregel. */
  info?: boolean;
  /** Vaste, taalonafhankelijke aanduiding (bijv. "macros", "omzetting"). */
  id?: string;
}

export interface Rapport {
  moment: "openen" | "opslaan";
  /** Korte zin voor de meldingsbalk. */
  kop: string;
  regels: Rapportregel[];
}

const t = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`import:${sleutel}`, opties ?? {});

/** Sleutel per risico in `import:report.risks`. */
const RISICOSLEUTEL: Record<Risico, string> = {
  revisies: "revisions",
  opmerkingen: "comments",
  voetnoten: "footnotes",
  kop_voettekst: "headersFooters",
  custom_xml: "customXml",
  onbekende_onderdelen: "unknownParts",
  onbekende_extensies: "unknownExtensions",
  notities: "speakerNotes",
  animaties: "animations",
  overgangen: "transitions",
  ingebedde_objecten: "embeddedObjects",
  grafieken: "charts",
  besturingselementen: "controls",
  handtekening: "signature",
  draaitabellen: "pivotTables",
  slicers: "slicers",
  externe_koppelingen: "externalLinks",
  gegevensverbindingen: "dataConnections",
  beveiliging: "protection",
};

/** Leesbare naam van een risico in de interfacetaal (kleine letter, voor in een zin). */
function risiconaam(risico: Risico) {
  return t(`report.risks.${RISICOSLEUTEL[risico]}`);
}

/** Alleen de eerste letter klein, en niet bij een afkorting (VBA, XML). */
function kleineLetter(tekst: string) {
  return /^\p{Lu}{2}/u.test(tekst)
    ? tekst
    : tekst.charAt(0).toLowerCase() + tekst.slice(1);
}

function hoofdletter(tekst: string) {
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/**
 * Wat de editor doet met kenmerken die hij maar beperkt ondersteunt, als het
 * eigen formaat rechtstreeks wordt geopend. Alleen wat echt beperkt is staat
 * hier; gewone onderdelen zoals revisies of notities melden we niet.
 */
function bijOpenen(risico: Risico, soort: Soort): string | null {
  // Bij DOCX en PPTX is het behoud via de engine in de testmatrix gemeten.
  const behoud = () =>
    soort === "xlsx"
      ? t("report.open.keptSpreadsheet")
      : t("report.open.kept", { format: soort });
  switch (risico) {
    case "ingebedde_objecten":
      return t("report.open.embeddedObjects", { kept: behoud() });
    case "grafieken":
      return t("report.open.charts", {
        module: t(`report.modules.${soort}`),
        kept: behoud(),
      });
    case "onbekende_onderdelen":
    case "onbekende_extensies":
      return t("report.open.unknownParts", { kept: behoud() });
    case "custom_xml":
      return t("report.open.customXml", { kept: behoud() });
    case "besturingselementen":
      return t("report.open.controls", { kept: behoud() });
    case "handtekening":
      return t("report.open.signature");
    case "draaitabellen":
      return t("report.open.pivotTables");
    case "slicers":
      return t("report.open.slicers");
    case "externe_koppelingen":
      return t("report.open.externalLinks");
    case "gegevensverbindingen":
      return t("report.open.dataConnections");
    case "beveiliging":
      return t("report.open.protection");
    default:
      return null;
  }
}

export interface OpenKenmerken {
  soort: Soort;
  risicos: readonly Risico[];
  macros?: boolean;
  /**
   * `engine`: eigen formaat rechtstreeks in de editor; `conversie`: via de
   * kantoorruntime omgezet; `import`: door de app zelf omgezet (tekst, CSV).
   */
  route: "engine" | "conversie" | "import";
  /** Extensie van het geopende bestand. */
  bronformaat: string;
  /** Aanvullende regels van een eigen omzetting of van de macro-afhandeling. */
  extra?: readonly Rapportregel[];
}

/** Het rapport na openen, of null als alles volledig wordt ondersteund. */
export function openRapport(kenmerken: OpenKenmerken): Rapport | null {
  const { soort, route } = kenmerken;
  const regels: Rapportregel[] = [];
  if (route === "conversie") {
    regels.push({
      id: OMZETTING_ID,
      onderdeel: t("report.parts.conversion"),
      gevolg: t("report.open.conversion", {
        source: kenmerken.bronformaat,
        format: soort,
      }),
    });
    const verlies = kenmerken.risicos.filter((r) =>
      MATRIXVERLIES[soort].conversie.includes(r),
    );
    if (verlies.length)
      regels.push({
        onderdeel: hoofdletter(verlies.map(risiconaam).join(", ")),
        gevolg: t("report.open.conversionLoss"),
      });
  } else if (route === "engine") {
    for (const risico of kenmerken.risicos) {
      const gevolg = bijOpenen(risico, soort);
      if (gevolg)
        regels.push({ onderdeel: hoofdletter(risiconaam(risico)), gevolg });
    }
  }
  regels.push(...(kenmerken.extra ?? []));
  if (kenmerken.macros && !regels.some((r) => r.id === MACRO_ID))
    regels.push({
      id: MACRO_ID,
      onderdeel: macronaam(),
      gevolg:
        route === "engine"
          ? t("report.open.macrosNeverRun")
          : t("report.open.macrosNotCopied"),
    });
  if (!regels.length) return null;
  const namen = regels
    .filter((r) => r.id !== OMZETTING_ID && !r.info)
    .map((r) => kleineLetter(r.onderdeel));
  const items = namen.join(", ");
  const kop =
    route === "conversie"
      ? namen.length
        ? t("report.head.conversionWithItems", { items })
        : t("report.head.conversion")
      : route === "import"
        ? namen.length
          ? t("report.head.importWithItems", { format: soort, items })
          : t("report.head.import", { format: soort })
        : namen.length
          ? t("report.head.partial", { items })
          : regels[0].gevolg;
  return { moment: "openen", kop, regels };
}

/** Vaste id van de regel over VBA-macro’s. */
export const MACRO_ID = "macros";
/** Vaste id van de regel over een omzetting via de kantoorruntime. */
const OMZETTING_ID = "omzetting";

/** "VBA-macro’s" in de interfacetaal. */
export function macronaam() {
  return t("report.parts.macros");
}

/** Binaire Office 97–2003-uitvoerformaten. */
const OUD = new Set(["doc", "dot", "xls", "xlt", "ppt", "pps", "pot"]);

const BEWERKBAAR = new Set([
  "eigen",
  "opendocument",
  "office-oud",
  "sjablonen",
]);

/** Formaten die macro’s kunnen bevatten. */
export const MACROFORMATEN = new Set([
  "docm",
  "dotm",
  "xlsm",
  "xltm",
  "pptm",
  "potm",
  "ppsm",
]);

export interface OpslaanKenmerken {
  soort: Soort;
  formaat: Uitvoerformaat;
  /** De route waarlangs het formaat gemaakt wordt; null: niet beschikbaar. */
  route: "engine" | "runtime" | "afdrukken" | "tekst" | "html" | null;
  risicos: readonly Risico[];
  macros?: boolean;
  /** Was het origineel versleuteld en wordt nu onversleuteld opgeslagen? */
  wordtOnversleuteld?: boolean;
  matrix?: typeof MATRIXVERLIES;
}

/**
 * Wat er bij opslaan in dit formaat verloren gaat of niet gegarandeerd is.
 * Het eigen formaat via de engine levert alleen een regel op als de matrix
 * verlies aantoont (dan blokkeert `risicoBeleid` opslaan) of bij macro’s.
 */
export function opslagRapport(kenmerken: OpslaanKenmerken): Rapport | null {
  const { soort, formaat, route, risicos } = kenmerken;
  const matrix = kenmerken.matrix ?? MATRIXVERLIES;
  if (!route) return null;
  const regels: Rapportregel[] = [];
  const eigen = formaat.ext === soort;
  const macroformaat = MACROFORMATEN.has(formaat.ext);
  if (kenmerken.macros && !macroformaat && route !== "afdrukken")
    regels.push({
      id: MACRO_ID,
      onderdeel: macronaam(),
      gevolg: t("report.save.macrosLost", { ext: formaat.ext }),
    });
  if (kenmerken.wordtOnversleuteld)
    regels.push({
      onderdeel: t("report.parts.passwordProtection"),
      gevolg: t("report.save.unencrypted"),
    });
  const opgeslagenRoute: Opslagroute | null =
    eigen || macroformaat
      ? "engine"
      : route === "runtime" && BEWERKBAAR.has(formaat.groep)
        ? "conversie"
        : null;
  if (opgeslagenRoute) {
    const verlies = risicos.filter((r) =>
      matrix[soort][opgeslagenRoute].includes(r),
    );
    if (verlies.length)
      regels.push({
        onderdeel: hoofdletter(verlies.map(risiconaam).join(", ")),
        gevolg:
          opgeslagenRoute === "engine"
            ? t("report.save.engineLoss")
            : t("report.save.conversionLoss"),
      });
    if (opgeslagenRoute === "conversie") {
      // Wat de matrix voor deze module niet heeft gemeten, noemen we eerlijk ongemeten.
      const ongemeten = risicos.filter(
        (r) => !matrix[soort].conversie.includes(r) && r !== "handtekening",
      );
      if (soort === "xlsx" && ongemeten.length)
        regels.push({
          onderdeel: hoofdletter(ongemeten.map(risiconaam).join(", ")),
          gevolg: t("report.save.notMeasured"),
        });
    }
    if (risicos.includes("handtekening") && (!eigen || route !== "engine"))
      regels.push({
        onderdeel: t("report.parts.digitalSignature"),
        gevolg: t("report.save.signature"),
      });
    if (OUD.has(formaat.ext))
      regels.push({
        onderdeel: t("report.parts.olderBinaryFormat"),
        gevolg: t("report.save.olderFormat", { ext: formaat.ext, format: soort }),
      });
  } else if (
    route === "tekst" ||
    route === "html" ||
    formaat.groep === "web-tekst"
  ) {
    regels.push({
      onderdeel: t("report.parts.format", { ext: formaat.ext }),
      gevolg: hoofdletter(formaat.behoud) + ".",
    });
    const weg = risicos.filter((r) => r !== "onbekende_extensies");
    if (weg.length)
      regels.push({
        onderdeel: hoofdletter(weg.map(risiconaam).join(", ")),
        gevolg: t("report.save.textFormatLoss"),
      });
  }
  if (!regels.length) return null;
  return {
    moment: "opslaan",
    kop: t("report.head.save", {
      ext: formaat.ext,
      items: regels.map((r) => kleineLetter(r.onderdeel)).join(", "),
    }),
    regels,
  };
}

/** Platte tekst om te kopiëren of bij een foutmelding te voegen. */
export function rapportTekst(
  rapport: Rapport,
  bestandsnaam: string,
  versie = "",
  datum = new Date(),
) {
  const app = `OpenAEC Office Studio${versie ? " " + versie : ""}`;
  const regels = [
    rapport.moment === "openen"
      ? t("report.text.titleOpen", { app })
      : t("report.text.titleSave", { app }),
    t("report.text.file", { name: bestandsnaam }),
    t("report.text.date", {
      date: datum.toISOString().slice(0, 19).replace("T", " "),
    }),
    "",
    rapport.kop,
    "",
    ...rapport.regels.map((r) => `- ${r.onderdeel}: ${r.gevolg}`),
  ];
  return regels.join("\n") + "\n";
}
