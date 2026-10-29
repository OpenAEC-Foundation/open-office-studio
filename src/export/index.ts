import { strFromU8, unzipSync } from "fflate";
import type { Soort } from "../editors";
import i18next from "../i18n/config";
import { cellenNaarCsv, codeer, type CsvCel, type CsvOpties } from "./csv";
import { htmlDocument, htmlNaarTekst, markdownNaarHtml, ontsnap } from "./html";
import { editorKoppeling } from "./koppeling";
import { celPositie } from "./csv";
import type { AppPdfKeuze } from "./PdfOpties";

export interface ExportOpties extends CsvOpties {
  /** 0-gebaseerd blad (CSV, TSV, PNG van rekenblad); standaard het actieve blad. */
  blad?: number;
  /** 0-gebaseerde dia (PNG); standaard de huidige dia. */
  dia?: number;
  /** PDF: kwaliteit en inhoud, en een paginabereik zoals "1-3, 5". */
  pdf?: AppPdfKeuze;
  bereik?: string;
}
export interface ExportResultaat {
  bytes: Uint8Array;
  mime: string;
  toelichting?: string;
}

const MIME: Record<string, string> = {
  md: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  tsv: "text/tab-separated-values;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  png: "image/png",
  pdf: "application/pdf",
};
export const mimeVoor = (ext: string) =>
  MIME[ext] ?? "application/octet-stream";

const tekst = (inhoud: string) => new TextEncoder().encode(inhoud);

/** Verwijdert de bronankers van de engine; een bestand heeft die niet nodig. */
function zonderAnkers(markdown: string) {
  return markdown
    .replace(/^<!-- (?:xlsx|pptx|docx)-export:\d+ -->\r?\n?/gm, "")
    .replace(/<!-- (?:xlsx|pptx|docx)-export:\d+ -->/g, "")
    .replace(
      /^## Slide (\d+)$/gm,
      `## ${i18next.t("presentation:export.markdownSlide")} $1`,
    )
    .replace(
      /^\*\*Notes\*\*$/gm,
      `**${i18next.t("presentation:export.markdownNotes")}**`,
    )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .concat("\n");
}

function controleerVolledig(resultaat: {
  truncated: boolean;
  diagnostics: readonly { severity: string }[];
}) {
  if (
    resultaat.truncated ||
    resultaat.diagnostics.some((melding) => melding.severity === "error")
  )
    throw new Error(
      "De export kon niet volledig worden gemaakt. Bewaar het document in het eigen formaat.",
    );
}

async function documentMarkdown(bytes: Uint8Array, metAfbeeldingen = false) {
  const { exporteerMarkdown } = await import("../markdown");
  const resultaat = await exporteerMarkdown(bytes, { metAfbeeldingen });
  return {
    markdown: new TextDecoder().decode(resultaat.bytes),
    waarschuwing: resultaat.waarschuwing,
  };
}

async function presentatieMarkdown(bytes: Uint8Array) {
  const { exportPptxMarkdown } = await import("@betteroffice/pptx");
  const resultaat = await exportPptxMarkdown(bytes, {
    includeNotes: true,
    maxBytes: 8 * 1024 * 1024,
  });
  controleerVolledig(resultaat);
  return zonderAnkers(resultaat.markdown);
}

const ALLE_CELLEN = {
  includeHiddenRows: true,
  includeHiddenColumns: true,
  maxCells: 1_000_000,
  maxBytes: 16 * 1024 * 1024,
} as const;

async function rekenblad(bytes: Uint8Array, blad?: number) {
  const { exportXlsxStructured } = await import("@betteroffice/xlsx");
  const inhoud = await exportXlsxStructured(bytes, {
    ...ALLE_CELLEN,
    includeHiddenSheets: blad !== undefined,
    ...(blad !== undefined ? { scope: [{ sheet: blad }] } : {}),
  });
  controleerVolledig(inhoud);
  return inhoud;
}

/** Standaardblad: het blad dat in de editor actief is. */
function actiefBlad(opties: ExportOpties) {
  return opties.blad ?? editorKoppeling("xlsx")?.bladen?.().actief ?? 0;
}

type Blad = Awaited<ReturnType<typeof rekenblad>>["sheets"][number];

/** Eén blad als HTML-tabel; samengevoegde cellen worden rowspan/colspan. */
export function bladNaarHtml(blad: Pick<Blad, "anchor" | "cells">) {
  const raster = new Map<string, (typeof blad.cells)[number]>();
  const bedekt = new Set<string>();
  let rijen = 0,
    kolommen = 0;
  for (const cel of blad.cells) {
    const a1 = cel.anchor.kind === "cell" ? cel.anchor.a1 : null;
    const positie = a1 ? celPositie(a1) : null;
    if (!positie) continue;
    raster.set(`${positie.rij},${positie.kolom}`, cel);
    if (cel.value.kind !== "empty" || cel.merge?.origin) {
      rijen = Math.max(rijen, positie.rij + 1);
      kolommen = Math.max(kolommen, positie.kolom + 1);
    }
  }
  const regels: string[] = [];
  for (let rij = 0; rij < rijen; rij++) {
    const cellen: string[] = [];
    for (let kolom = 0; kolom < kolommen; kolom++) {
      if (bedekt.has(`${rij},${kolom}`)) continue;
      const cel = raster.get(`${rij},${kolom}`);
      let bereik = "";
      if (cel?.merge?.origin) {
        const [van, tot] = cel.merge.range.split(":").map(celPositie);
        if (van && tot) {
          const hoog = tot.rij - van.rij + 1,
            breed = tot.kolom - van.kolom + 1;
          for (let r = van.rij; r <= tot.rij; r++)
            for (let k = van.kolom; k <= tot.kolom; k++)
              if (r !== rij || k !== kolom) bedekt.add(`${r},${k}`);
          if (hoog > 1) bereik += ` rowspan="${hoog}"`;
          if (breed > 1) bereik += ` colspan="${breed}"`;
        }
      }
      const getal = cel?.value.kind === "number" ? ' class="getal"' : "";
      cellen.push(
        `<td${getal}${bereik}>${ontsnap(cel?.displayText ?? "")}</td>`,
      );
    }
    regels.push(`<tr>${cellen.join("")}</tr>`);
  }
  const naam = blad.anchor.kind === "sheet" ? blad.anchor.sheet.name : "";
  return `<h2>${ontsnap(naam)}</h2>\n<table>\n${regels.join("\n")}\n</table>`;
}

async function rekenbladPng(bytes: Uint8Array, blad: number) {
  const xlsx = await import("@betteroffice/xlsx");
  await xlsx.initWasm();
  if (!xlsx.isPngExportAvailable())
    throw new Error(i18next.t("spreadsheet:export.pngUnavailable"));
  const werkmap = xlsx.openWorkbook(bytes);
  try {
    werkmap.setActiveSheet(blad);
    return werkmap.renderRangePng({ scale: 2 });
  } finally {
    werkmap.dispose();
  }
}

/**
 * Maakt een export zonder kantoorruntime, met de engines van de app.
 * Werkt in de browser en in de desktopapp.
 */
export async function maakExport(
  soort: Soort,
  ext: string,
  bytes: Uint8Array,
  titel: string,
  opties: ExportOpties = {},
): Promise<ExportResultaat> {
  const mime = mimeVoor(ext);
  if (ext === soort) return { bytes, mime: "application/octet-stream" };
  if (ext === "md") {
    if (soort === "docx") {
      const { markdown, waarschuwing } = await documentMarkdown(bytes);
      return {
        bytes: tekst(markdown),
        mime,
        toelichting: waarschuwing
          ? "Sommige onderdelen kunnen niet in Markdown worden overgenomen."
          : undefined,
      };
    }
    if (soort === "pptx")
      return { bytes: tekst(await presentatieMarkdown(bytes)), mime };
    const { exportXlsxMarkdown } = await import("@betteroffice/xlsx");
    await rekenblad(bytes); // controleert grenzen en afkapping vooraf
    const resultaat = await exportXlsxMarkdown(bytes, ALLE_CELLEN, {
      maxRows: 5000,
      maxColumns: 200,
      maxCells: 1_000_000,
      maxBytes: 8 * 1024 * 1024,
    });
    controleerVolledig(resultaat);
    return { bytes: tekst(zonderAnkers(resultaat.markdown)), mime };
  }
  if ((ext === "csv" || ext === "tsv") && soort === "xlsx") {
    const blad = actiefBlad(opties);
    const inhoud = await rekenblad(bytes, blad);
    const cellen = (inhoud.sheets[0]?.cells ?? []) as unknown as CsvCel[];
    const csv = cellenNaarCsv(cellen, {
      scheidingsteken: ext === "tsv" ? "tab" : (opties.scheidingsteken ?? ";"),
    });
    const { bytes: uit, vervangen } = codeer(csv, opties.codering);
    return {
      bytes: uit,
      mime,
      toelichting: vervangen
        ? `${vervangen} teken(s) bestaan niet in Windows-1252 en zijn vervangen door '?'.`
        : undefined,
    };
  }
  if (ext === "html" || ext === "txt") {
    let html: string;
    let toelichting: string | undefined;
    if (soort === "docx") {
      const { markdown, waarschuwing } = await documentMarkdown(
        bytes,
        ext === "html",
      );
      html = markdownNaarHtml(markdown);
      if (waarschuwing)
        toelichting =
          ext === "html"
            ? "Niet alle afbeeldingen konden worden ingesloten."
            : "Afbeeldingen zijn niet overgenomen.";
    } else if (soort === "pptx") {
      html = markdownNaarHtml(await presentatieMarkdown(bytes));
    } else {
      const inhoud = await rekenblad(bytes);
      html = inhoud.sheets.map(bladNaarHtml).join("\n");
    }
    if (ext === "txt") {
      // Platte tekst met keuze van codering (standaard UTF-8 zonder BOM).
      const { bytes: uit, vervangen } = codeer(
        htmlNaarTekst(html),
        opties.codering ?? "utf8",
      );
      if (vervangen)
        toelichting = [
          toelichting,
          `${vervangen} teken(s) bestaan niet in Windows-1252 en zijn vervangen door '?'.`,
        ]
          .filter(Boolean)
          .join(" ");
      return { bytes: uit, mime, toelichting };
    }
    return {
      bytes: tekst(htmlDocument(titel, html)),
      mime,
      toelichting,
    };
  }
  if (ext === "png" && soort === "xlsx")
    return { bytes: await rekenbladPng(bytes, actiefBlad(opties)), mime };
  if (ext === "png" && soort === "pptx") {
    const koppeling = editorKoppeling("pptx");
    if (!koppeling?.diaPng)
      throw new Error(i18next.t("presentation:export.pngNeedsEditor"));
    const dia = opties.dia ?? koppeling.dias?.().huidig ?? 0;
    return { bytes: await koppeling.diaPng(dia, 2), mime };
  }
  if (ext === "pdf") return { bytes: await pdfExport(soort, bytes, titel, opties), mime };
  throw new Error(`Dit formaat (${ext}) kan de app niet zelf maken.`);
}

/** Opent het afdrukvoorbeeld van de zichtbare editor (afdrukken en PDF). */
export async function drukAf(soort: Soort) {
  const koppeling = editorKoppeling(soort);
  if (!koppeling?.afdrukken)
    throw new Error("Afdrukken is voor dit document nog niet beschikbaar.");
  await koppeling.afdrukken();
}

/** Titel, auteur, onderwerp en trefwoorden uit docProps/core.xml. */
export function documentEigenschappen(bytes: Uint8Array) {
  const uit: { titel?: string; auteur?: string; onderwerp?: string; trefwoorden?: string } = {};
  try {
    const delen = unzipSync(bytes, { filter: (f) => f.name === "docProps/core.xml" });
    const xml = delen["docProps/core.xml"] ? strFromU8(delen["docProps/core.xml"]) : "";
    const lees = (tag: string) => {
      const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml);
      const waarde = m?.[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .trim();
      return waarde || undefined;
    };
    uit.titel = lees("dc:title");
    uit.auteur = lees("dc:creator");
    uit.onderwerp = lees("dc:subject");
    uit.trefwoorden = lees("cp:keywords");
  } catch {
    // Geen eigenschappen: de PDF krijgt alleen de bestandsnaam als titel.
  }
  return uit;
}

/**
 * PDF zonder conversieprogramma: dezelfde pagina's als het afdrukvoorbeeld,
 * met de engine van de geopende editor (ook in de browser).
 */
async function pdfExport(
  soort: Soort,
  bytes: Uint8Array,
  titel: string,
  opties: ExportOpties,
) {
  const bron = editorKoppeling(soort)?.afdrukbron?.();
  if (!bron)
    throw new Error("Open het document in de editor om er een PDF van te maken.");
  const keuze = opties.pdf ?? { kwaliteit: "standaard", omvang: "werkmap", indeling: "dias" };
  let doc;
  if (bron.soort === "docx") doc = await bron.maak();
  else if (bron.soort === "pptx") {
    const { standaardPresentatie } = await import("../afdrukken/indeling");
    doc = await bron.maak(standaardPresentatie(keuze.indeling));
  } else if (bron.soort === "xlsx") {
    doc = await bron.maak({
      omvang: keuze.omvang,
      instellingen: await bron.leesInstellingen(),
      negeerAfdrukbereik: false,
    });
  } else doc = await bron.maak(bron.stand);
  const { ontleedBereik } = await import("../afdrukken/model");
  const indexen = ontleedBereik(opties.bereik ?? "", doc.paginas.length);
  if (!indexen?.length) throw new Error("Het paginabereik bevat geen pagina's van dit document.");
  const eigenschappen = documentEigenschappen(bytes);
  const { maakPdf } = await import("./pdf");
  return maakPdf(
    { ...doc, titel: eigenschappen.titel ?? titel },
    {
      indexen,
      kwaliteit: keuze.kwaliteit,
      auteur: eigenschappen.auteur,
      onderwerp: eigenschappen.onderwerp,
      trefwoorden: eigenschappen.trefwoorden,
    },
  );
}
