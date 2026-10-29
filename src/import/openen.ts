/**
 * De openroute: bepaalt per bestand hoe het in een editor terechtkomt
 * (rechtstreeks, eigen omzetting of kantoorruntime) en welk rapport erbij
 * hoort. De UI geeft alleen de vragen (wachtwoord, CSV-instellingen) mee.
 */
import i18next from "../i18n/config";
import { formatGetal } from "../i18n/opmaak";
import type { Soort } from "../editors";
import {
  bestandssoort,
  bestandstypen,
  kiesRoute,
  uitvoerformaat,
} from "../formaten";
import { LIEVER_RUNTIME, TEKSTFORMATEN, zetTekstOm } from "./tekstimport";
import {
  csvNaarXlsx,
  herkenInstellingen,
  scheidingsnaam,
  type CsvInstellingen,
} from "./csvimport";
import type { Rapportregel } from "./rapport";
import { controleerPakket } from "../pakketcontrole";
import { MACRO_ID, macronaam, openRapport, type Rapport } from "./rapport";
import { MACRO_INVOER, MACROFORMAAT, scheidMacros } from "./macros";
import type { Bronkenmerken } from "./bron";
import {
  VerkeerdWachtwoord,
  herkenVersleuteling,
  ontsleutel,
  versleutelingsMelding,
} from "./versleuteling";

export interface Openhulp {
  /** Omzetting via de kantoorruntime (desktop); gooit een fout zonder runtime. */
  converteer: (
    bytes: Uint8Array,
    van: string,
    naar: string,
    soort: Soort,
  ) => Promise<Uint8Array>;
  /** Is de kantoorruntime beschikbaar? Standaard: nee. */
  runtimeBeschikbaar?: () => Promise<boolean>;
  /** Importvenster voor CSV/TSV; null = geannuleerd. Zonder: herkende instellingen. */
  vraagCsv?: (
    naam: string,
    bytes: Uint8Array,
    ext: string,
  ) => Promise<CsvInstellingen | null>;
  /** Wachtwoordvenster; null = geannuleerd. `fout` na een onjuist wachtwoord. */
  vraagWachtwoord?: (naam: string, fout?: string) => Promise<string | null>;
}

export interface Openresultaat {
  soort: Soort;
  /** Naam van het tabblad, met de extensie van het formaat in de editor. */
  naam: string;
  bytes: Uint8Array;
  /** Een kopie die nog niet in het eigen formaat bewaard is. */
  gewijzigd: boolean;
  rapport: Rapport | null;
  /** Voorstel voor Ctrl+S als dat afwijkt van het eigen formaat. */
  exportFormaat?: string;
  /** Kenmerken van het origineel (versleuteling, macro’s). */
  bron?: Bronkenmerken;
}

export function extensieVan(naam: string) {
  return naam.split(".").pop()?.toLowerCase() ?? "";
}

function metExtensie(naam: string, ext: string) {
  return naam.replace(/\.[^.]+$/, "") + "." + ext;
}

/** Bereidt het openen voor; null betekent dat de gebruiker heeft geannuleerd. */
export async function bereidOpenen(
  naam: string,
  bytes: Uint8Array,
  hulp: Openhulp,
): Promise<Openresultaat | null> {
  const versleuteling = herkenVersleuteling(bytes);
  if (!versleuteling) return bereidOnversleuteld(naam, bytes, hulp, []);
  if (versleuteling.soort !== "agile" && versleuteling.soort !== "standard")
    throw new Error(versleutelingsMelding(versleuteling));
  if (!hulp.vraagWachtwoord)
    throw new Error(i18next.t("import:errors.encrypted"));
  let fout: string | undefined;
  let ontsleuteld: Uint8Array;
  for (;;) {
    const wachtwoord = await hulp.vraagWachtwoord(naam, fout);
    if (wachtwoord === null) return null;
    try {
      ontsleuteld = await ontsleutel(versleuteling, wachtwoord);
      break;
    } catch (e) {
      if (!(e instanceof VerkeerdWachtwoord)) throw e;
      fout = i18next.t("import:password.wrong");
    }
  }
  const resultaat = await bereidOnversleuteld(naam, ontsleuteld, hulp, [
    {
      onderdeel: i18next.t("import:report.parts.passwordProtection"),
      info: true,
      gevolg: i18next.t("import:sources.decrypted", {
        method:
          versleuteling.soort === "agile" ? "ECMA-376 Agile" : "ECMA-376 Standard",
      }),
    },
  ]);
  if (resultaat)
    resultaat.bron = { ...resultaat.bron, versleuteling: versleuteling.soort };
  return resultaat;
}

async function bereidOnversleuteld(
  naam: string,
  bytes: Uint8Array,
  hulp: Openhulp,
  bronregels: Rapportregel[],
): Promise<Openresultaat | null> {
  // Wordt aangevuld (bijv. datumsysteem 1904); de parameter zelf blijft ongewijzigd.
  bronregels = [...bronregels];
  const ext = extensieVan(naam);
  const soort = bestandssoort(ext);
  if (!soort)
    throw new Error(i18next.t("import:errors.unsupportedFormat"));

  if (ext === soort) {
    const controle = controleerPakket(bytes, soort);
    if (controle.datum1904) bronregels = [...bronregels, datum1904()];
    if (!controle.strict)
      return {
        soort,
        naam,
        bytes,
        gewijzigd: false,
        rapport: openRapport({
          soort,
          risicos: controle.risicos,
          macros: controle.macros,
          route: "engine",
          bronformaat: ext,
          extra: bronregels,
        }),
      };
  }

  // Macrobestanden: VBA-project apart houden, het document in de editor.
  if (MACRO_INVOER.has(ext)) {
    controleerPakket(bytes, soort);
    const { bytes: zonder, macros } = await scheidMacros(bytes, soort, ext);
    const controle = controleerPakket(zonder, soort);
    if (!controle.strict) {
      const doel = MACROFORMAAT[soort];
      const aantal = macros.modules.length;
      const modules = aantal
        ? i18next.t("import:sources.moduleList", {
            count: aantal,
            names:
              macros.modules.slice(0, 8).join(", ") + (aantal > 8 ? ", …" : ""),
          })
        : "";
      const regels: Rapportregel[] = macros.heeftVba
        ? [
            {
              id: MACRO_ID,
              onderdeel: macronaam(),
              gevolg: [
                modules
                  ? i18next.t("import:sources.vbaKeptWithModules", {
                      modules,
                      format: doel,
                    })
                  : i18next.t("import:sources.vbaKept", { format: doel }),
                ...(macros.ondertekend
                  ? [i18next.t("import:sources.vbaSigned")]
                  : []),
                i18next.t("import:sources.vbaRemovedOnSave", { format: soort }),
              ].join(" "),
            },
          ]
        : [
            {
              onderdeel: i18next.t("import:report.parts.macroFormat"),
              gevolg: i18next.t("import:sources.noVbaProject", {
                ext,
                format: doel,
              }),
              info: true,
            },
          ];
      return {
        soort,
        naam: ext === doel ? naam : metExtensie(naam, doel),
        bytes: zonder,
        gewijzigd: ext !== doel,
        rapport: openRapport({
          soort,
          risicos: controle.risicos,
          route: "engine",
          bronformaat: ext,
          extra: [...bronregels, ...regels],
        }),
        exportFormaat: doel,
        bron: { macro: macros },
      };
    }
  }

  const runtime =
    (await hulp.runtimeBeschikbaar?.().catch(() => false)) ?? false;
  /** Voorstel voor Ctrl+S: het bronformaat als de app dat nu kan maken. */
  const voorstel = (doel: string) => {
    const formaat = uitvoerformaat(soort, doel);
    return formaat && kiesRoute(formaat, runtime) ? doel : undefined;
  };

  // Eenvoudige tekstformaten zet de app zelf om; RTF en HTML liever via de
  // runtime als die er is, met de eigen lezer als terugval.
  if (soort === "docx" && TEKSTFORMATEN.has(ext)) {
    let fout: unknown = null;
    if (runtime && LIEVER_RUNTIME.has(ext)) {
      try {
        return await viaRuntime();
      } catch (e) {
        fout = e;
      }
    }
    const { bytes: docx, regels } = zetTekstOm(ext, bytes);
    if (fout)
      regels.unshift({
        onderdeel: i18next.t("import:report.parts.officeRuntime"),
        gevolg: i18next.t("import:sources.runtimeFailed", {
          error: String(fout),
        }),
      });
    return {
      soort,
      naam: metExtensie(naam, soort),
      bytes: docx,
      gewijzigd: true,
      rapport: openRapport({
        soort,
        risicos: [],
        route: "import",
        bronformaat: ext,
        extra: [...bronregels, ...regels],
      }),
      exportFormaat: voorstel(
        ext === "markdown" ? "md" : ext === "htm" ? "html" : ext,
      ),
    };
  }

  // CSV en TSV: altijd zelf, met het importvenster.
  if (soort === "xlsx" && (ext === "csv" || ext === "tsv" || ext === "tab")) {
    const instellingen = hulp.vraagCsv
      ? await hulp.vraagCsv(naam, bytes, ext)
      : herkenInstellingen(bytes, ext);
    if (!instellingen) return null;
    const bladnaam = naam.replace(/\.[^.]+$/, "");
    const resultaat = csvNaarXlsx(bytes, instellingen, bladnaam);
    const regels: Rapportregel[] = [
      {
        onderdeel: i18next.t("import:report.parts.import"),
        gevolg: i18next.t("import:sources.csvImported", {
          rows: i18next.t("import:sources.csvRows", {
            count: resultaat.rijen,
            rows: formatGetal(resultaat.rijen),
          }),
          columns: i18next.t("import:sources.csvColumns", {
            count: resultaat.kolommen,
            columns: formatGetal(resultaat.kolommen),
          }),
          separator: scheidingsnaam(resultaat.scheidingsteken),
          encoding: resultaat.codering,
        }),
        info: true,
      },
    ];
    if (resultaat.formuleachtig)
      regels.push({
        onderdeel: i18next.t("import:report.parts.formulaLikeText"),
        gevolg: i18next.t("import:sources.formulaLike", {
          count: resultaat.formuleachtig,
          cells: formatGetal(resultaat.formuleachtig),
        }),
      });
    if (resultaat.afgekapt)
      regels.push({
        onderdeel: i18next.t("import:report.parts.truncated"),
        gevolg: i18next.t("import:sources.truncated"),
      });
    return {
      soort,
      naam: metExtensie(naam, soort),
      bytes: resultaat.xlsx,
      gewijzigd: true,
      rapport: openRapport({
        soort,
        risicos: [],
        route: "import",
        bronformaat: ext,
        extra: [...bronregels, ...regels],
      }),
      exportFormaat: voorstel(ext === "tab" ? "tsv" : ext),
    };
  }

  return viaRuntime();

  // Overige formaten (en Strict-XLSX) via de kantoorruntime.
  async function viaRuntime(): Promise<Openresultaat> {
    if (!soort) throw new Error(i18next.t("import:errors.unknownModule"));
    let risicos: ReturnType<typeof controleerPakket>["risicos"] = [];
    let macros = false;
    try {
      const controle = controleerPakket(bytes, soort);
      risicos = controle.risicos;
      macros = controle.macros;
    } catch {
      // Geen OOXML-pakket: niets te meten vóór de omzetting.
    }
    const omgezet = await hulp.converteer(bytes, ext, soort, soort);
    if (controleerPakket(omgezet, soort).datum1904)
      bronregels = [...bronregels, datum1904()];
    return {
      soort,
      naam: metExtensie(naam, soort),
      bytes: omgezet,
      gewijzigd: true,
      rapport: openRapport({
        soort,
        risicos,
        macros,
        route: "conversie",
        bronformaat: ext,
        extra: bronregels,
      }),
      // Oude binaire formaten (DOC, XLS, PPT, …): standaardvoorstel is het
      // eigen formaat; opslaan als het oude formaat kan, met een waarschuwing.
      exportFormaat:
        Object.hasOwn(bestandstypen[soort].uitvoer, ext) && !OUD_BINAIR.has(ext)
          ? ext
          : undefined,
    };
  }
}

/** Binaire Office 97–2003-formaten (en hun sjablonen en diavoorstellingen). */
export const OUD_BINAIR = new Set([
  "doc",
  "dot",
  "xls",
  "xlt",
  "xlsb",
  "ppt",
  "pps",
  "pot",
]);

/** Regel over het datumsysteem 1904, in de interfacetaal van dit moment. */
const datum1904 = (): Rapportregel => ({
  onderdeel: i18next.t("import:report.parts.dateSystem1904"),
  gevolg: i18next.t("import:sources.dateSystem1904"),
  info: true,
});
