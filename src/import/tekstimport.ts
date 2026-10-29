/**
 * Eigen omzetting van TXT, Markdown, HTML en RTF naar DOCX, zonder
 * kantoorruntime. Levert de DOCX-bytes plus de rapportregels.
 */
import i18next from "../i18n/config";
import { formatGetal } from "../i18n/opmaak";
import { schrijfDocx } from "./docxschrijver";
import { decodeerHtml, htmlNaarModel } from "./htmlbestand";
import { markdownNaarModel } from "./markdownbestand";
import type { Rapportregel } from "./rapport";
import { rtfNaarModel } from "./rtfbestand";
import { leesTekst, regeleindeNaam, tekstNaarModel } from "./tekstbestand";

export const TEKSTFORMATEN = new Set([
  "txt",
  "md",
  "markdown",
  "htm",
  "html",
  "xhtml",
  "rtf",
]);

/** Formaten die we liever via de runtime openen als die er is (hogere trouw). */
export const LIEVER_RUNTIME = new Set(["htm", "html", "xhtml", "rtf"]);

export interface Tekstomzetting {
  bytes: Uint8Array;
  regels: Rapportregel[];
}

const MAX_TEKST = 32 * 1024 * 1024;

const t = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`import:${sleutel}`, opties ?? {});

/** Sleutel in `import:sources.rtfParts` per overgeslagen RTF-onderdeel (zie rtfbestand.ts). */
const RTF_ONDERDEEL: Record<string, string> = {
  "kop- en voetteksten": "headersFooters",
  "voet- of eindnoten": "footnotes",
  opmerkingen: "comments",
  "ingesloten objecten": "embeddedObjects",
  "vormen of tekstvakken": "shapes",
  "binaire afbeeldingen": "binaryImages",
  "geneste tabellen": "nestedTables",
  "samengevoegde tabelcellen": "mergedCells",
  "velden (alleen het resultaat)": "fields",
  "afbeeldingen in een niet-ondersteund formaat": "unsupportedImages",
  "afbeeldingen in een niet-ondersteund formaat (WMF/EMF)": "unsupportedImagesWmf",
};

export function zetTekstOm(ext: string, bytes: Uint8Array): Tekstomzetting {
  if (bytes.length > MAX_TEKST)
    throw new Error(t("errors.textTooLarge"));
  const regels: Rapportregel[] = [];
  if (ext === "txt") {
    const gelezen = leesTekst(bytes);
    regels.push({
      onderdeel: t("report.parts.encoding"),
      gevolg: t("sources.txt", {
        encoding: gelezen.coderingsnaam,
        lineEndings: regeleindeNaam(gelezen.regeleinde),
      }),
      info: true,
    });
    return { bytes: schrijfDocx(tekstNaarModel(gelezen.tekst)), regels };
  }
  if (ext === "md" || ext === "markdown") {
    const gelezen = leesTekst(bytes);
    const resultaat = markdownNaarModel(gelezen.tekst);
    regels.push({
      onderdeel: t("report.parts.markdown"),
      gevolg: t("sources.markdown", { encoding: gelezen.coderingsnaam }),
      info: true,
    });
    if (resultaat.nietIngesloten)
      regels.push({
        onderdeel: t("report.parts.images"),
        gevolg: t("sources.markdownImages", {
          count: resultaat.nietIngesloten,
          images: formatGetal(resultaat.nietIngesloten),
        }),
      });
    if (resultaat.ruweHtml)
      regels.push({
        onderdeel: t("report.parts.embeddedHtml"),
        gevolg: t("sources.embeddedHtml"),
      });
    if (resultaat.voetnoten)
      regels.push({
        onderdeel: t("report.parts.footnotes"),
        gevolg: t("sources.footnotes"),
      });
    return { bytes: schrijfDocx(resultaat.document), regels };
  }
  if (ext === "htm" || ext === "html" || ext === "xhtml") {
    const { tekst, codering } = decodeerHtml(bytes);
    const resultaat = htmlNaarModel(tekst);
    regels.push({
      onderdeel: t("report.parts.webPage"),
      gevolg: t("sources.html", { encoding: codering }),
      info: true,
    });
    if (resultaat.nietIngesloten)
      regels.push({
        onderdeel: t("report.parts.images"),
        gevolg: t("sources.htmlImages", {
          count: resultaat.nietIngesloten,
          images: formatGetal(resultaat.nietIngesloten),
        }),
      });
    if (resultaat.formulieren)
      regels.push({
        onderdeel: t("report.parts.forms"),
        gevolg: t("sources.forms"),
      });
    return { bytes: schrijfDocx(resultaat.document), regels };
  }
  if (ext === "rtf") {
    const resultaat = rtfNaarModel(bytes);
    regels.push({
      onderdeel: t("report.parts.richTextFormat"),
      gevolg: t("sources.rtf"),
      info: true,
    });
    for (const [wat, aantal] of Object.entries(resultaat.overgeslagen))
      regels.push({
        onderdeel:
          wat in RTF_ONDERDEEL
            ? t(`sources.rtfParts.${RTF_ONDERDEEL[wat]}`)
            : wat.charAt(0).toUpperCase() + wat.slice(1),
        gevolg: t("sources.rtfSkipped", { times: formatGetal(aantal) }),
      });
    return { bytes: schrijfDocx(resultaat.document), regels };
  }
  throw new Error(t("errors.cannotConvert", { ext }));
}
