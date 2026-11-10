import { strFromU8, unzipSync } from "fflate";
import type { Soort } from "./editors";
import {
  alleenLegeAppBibliografie,
  leesLegeBibliografieDeel,
} from "./import/legeBibliografie.ts";
// Deze preflight wordt ook rechtstreeks in Node gebruikt. Houd de XML-
// entiteitsdecoder onafhankelijk van de browserconfiguratie van grafieken.
function ontcijfer(tekst: string) {
  if (!tekst.includes("&")) return tekst;
  return tekst.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
}

/** Kenmerken waarvan behoud per route in de testmatrix is gemeten. */
export type Risico =
  | "revisies"
  | "opmerkingen"
  | "voetnoten"
  | "kop_voettekst"
  | "custom_xml"
  | "onbekende_onderdelen"
  | "onbekende_extensies"
  | "notities"
  | "animaties"
  | "overgangen"
  | "ingebedde_objecten"
  | "grafieken"
  | "besturingselementen"
  | "handtekening"
  | "draaitabellen"
  | "slicers"
  | "externe_koppelingen"
  | "gegevensverbindingen"
  | "beveiliging"
  | "werkmapstructuur";

/** Route waarlangs de app een bestand wegschrijft. */
export type Opslagroute = "engine" | "conversie";

/**
 * Kenmerken die volgens de testmatrix (docs/tests/2026-10-26-documenten.md en
 * 2026-10-26-presentaties.md) per formaat en route verloren gingen. De eigen
 * engines (@betteroffice/docx 0.4.3, @betteroffice/pptx 0.2.0) behielden in
 * D1–D3 en P1–P3 alle gemeten kenmerken; de conversieroute via LibreOffice
 * 24.2 verwijderde onbekende onderdelen en onbekende extensie-elementen.
 * XLSX (R1–R3) is hier niet gemeten en krijgt daarom nog geen regel.
 * Gaat in een nieuwe engineversie iets verloren, dan hoort het hier en
 * blokkeert opslaan in het oorspronkelijke formaat.
 */
export const MATRIXVERLIES: Record<
  Soort,
  Record<Opslagroute, readonly Risico[]>
> = {
  docx: {
    engine: [],
    conversie: ["onbekende_onderdelen", "onbekende_extensies"],
  },
  pptx: {
    engine: [],
    conversie: ["onbekende_onderdelen", "onbekende_extensies"],
  },
  // Native-proef #72/#32: actieve SHA512-werkmapstructuurbeveiliging wordt
  // door de converter niet ingelezen en verdwijnt bij opnieuw bewaren.
  xlsx: { engine: [], conversie: ["werkmapstructuur"] },
};

const RISICONAMEN: Record<Risico, string> = {
  revisies: "revisies",
  opmerkingen: "opmerkingen",
  voetnoten: "voet- of eindnoten",
  kop_voettekst: "kop- en voetteksten",
  custom_xml: "aangepaste XML-gegevens",
  onbekende_onderdelen: "onbekende pakketonderdelen",
  onbekende_extensies: "onbekende extensie-elementen",
  notities: "sprekersnotities",
  animaties: "animaties",
  overgangen: "overgangen",
  ingebedde_objecten: "ingebedde objecten",
  grafieken: "grafieken",
  besturingselementen: "formulier- of ActiveX-besturingselementen",
  handtekening: "een digitale handtekening",
  draaitabellen: "draaitabellen",
  slicers: "slicers of tijdlijnen",
  externe_koppelingen: "koppelingen naar externe werkmappen",
  gegevensverbindingen: "gegevensverbindingen of query's",
  beveiliging: "schrijf-, document- of werkmapbeveiliging",
  werkmapstructuur: "werkmapstructuurbeveiliging",
};

/** Leesbare naam van een risico, voor rapporten. */
export function risiconaam(risico: Risico) {
  return RISICONAMEN[risico];
}

/** Bekende naamruimten en relatietypen; al het andere telt als onbekend. */
const BEKEND =
  /^(https?:\/\/schemas\.openxmlformats\.org\/|https?:\/\/schemas\.microsoft\.com\/|urn:schemas-microsoft-com:|https?:\/\/purl\.oclc\.org\/ooxml\/|https?:\/\/purl\.org\/dc\/|https?:\/\/www\.w3\.org\/)/;
const BEKEND_INHOUDSTYPE =
  /^(application\/vnd\.openxmlformats-|application\/vnd\.ms-|image\/|video\/|audio\/|application\/xml$|text\/xml$|application\/x-font|application\/x-fontdata$|application\/octet-stream$|application\/x-emf$|application\/x-wmf$|application\/pdf$)/;

/**
 * Lees alleen begintags, zonder een documentboom voor de hoofdtekst te bouwen.
 * Quotes begrenzen attribuutwaarden; commentaar, CDATA en instructies zijn
 * geen metadata. De pakketcontrole wijzigt of voert XML nooit uit.
 */
function* begintags(xml: string) {
  const tags =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<([^\s/!?<>"']+)(?=[\s/>])((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;
  for (const tag of xml.matchAll(tags)) {
    if (!tag[1]) continue;
    const attrs: Record<string, string> = {};
    for (const [, naam, , waarde] of tag[2].matchAll(
      /(?:^|\s)([^\s=/<>"']+)\s*=\s*(["'])([\s\S]*?)\2/g,
    ))
      attrs[naam] = ontcijfer(waarde);
    yield { lokaal: tag[1].split(":").at(-1), attrs };
  }
}

function risicosVan(
  soort: Soort,
  namen: Set<string>,
  delen: Record<string, Uint8Array>,
) {
  const risicos = new Set<Risico>();
  const tekst = (naam: string) => (delen[naam] ? strFromU8(delen[naam]) : "");
  for (const [naam, inhoud] of Object.entries(delen)) {
    if (!naam.endsWith(".rels")) continue;
    for (const { lokaal, attrs } of begintags(strFromU8(inhoud)))
      if (
        lokaal === "Relationship" &&
        attrs.Type !== undefined &&
        !BEKEND.test(attrs.Type)
      )
        risicos.add("onbekende_onderdelen");
  }
  for (const { lokaal, attrs } of begintags(tekst("[Content_Types].xml")))
    if (
      (lokaal === "Override" || lokaal === "Default") &&
      attrs.ContentType !== undefined &&
      !BEKEND_INHOUDSTYPE.test(attrs.ContentType)
    )
      risicos.add("onbekende_onderdelen");
  const hoofdtekst =
    soort === "docx"
      ? [tekst("word/document.xml")]
      : soort === "pptx"
        ? Object.keys(delen)
            .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
            .map(tekst)
        : [];
  for (const xml of hoofdtekst)
    for (const { attrs } of begintags(xml))
      for (const [naam, ns] of Object.entries(attrs))
        if (
          (naam === "xmlns" || naam.startsWith("xmlns:")) &&
          ns &&
          !BEKEND.test(ns)
        )
          risicos.add("onbekende_extensies");
  const heeft = (patroon: RegExp) => [...namen].some((n) => patroon.test(n));
  if (
    heeft(/^customXml\//) &&
    !(soort === "docx" && alleenLegeAppBibliografie(namen, delen))
  )
    risicos.add("custom_xml");
  if (heeft(/^(word|ppt|xl)\/embeddings\//)) risicos.add("ingebedde_objecten");
  if (heeft(/^(word|ppt|xl)\/charts\//)) risicos.add("grafieken");
  if (heeft(/^(word|ppt|xl)\/(activeX|ctrlProps)\//))
    risicos.add("besturingselementen");
  if (
    heeft(/^_xmlsignatures\//) ||
    heeft(/(^|\/)vbaProjectSignature\w*\.bin$/i)
  )
    risicos.add("handtekening");
  // Beveiliging zonder versleuteling (alleen-lezen aanbevolen, bewerken beperkt).
  if (
    /<(?:\w+:)?(?:writeProtection|documentProtection)\b/.test(
      tekst("word/settings.xml"),
    ) ||
    /<(?:\w+:)?(?:workbookProtection|fileSharing)\b/.test(
      tekst("xl/workbook.xml"),
    ) ||
    /<(?:\w+:)?modifyVerifier\b/.test(tekst("ppt/presentation.xml"))
  )
    risicos.add("beveiliging");
  if (soort === "xlsx") {
    const wb = tekst("xl/workbook.xml");
    if (wb.includes("workbookProtection")) {
      // Houd deze preflight ook rechtstreeks in Node bruikbaar: de volledige
      // grafiek-XML-lezer trekt de browser-i18n-configuratie mee.
      const protection = wb
        .replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, "")
        .match(/<(?:\w+:)?workbookProtection\b([^>]*?)\/?\s*>/)?.[1];
      if (protection) {
        const attr = (naam: string) =>
          protection.match(
            new RegExp(`(?:^|\\s)${naam}\\s*=\\s*(["'])(.*?)\\1`),
          )?.[2];
        const actief = ["1", "true"].includes(
          (attr("lockStructure") ?? "").toLowerCase(),
        );
        const algoritme = (attr("workbookAlgorithmName") ?? "")
          .replace(/-/g, "")
          .toUpperCase();
        if (actief && algoritme === "SHA512" && attr("workbookHashValue"))
          risicos.add("werkmapstructuur");
      }
    }
    if (heeft(/^xl\/(pivotTables|pivotCache)\//)) risicos.add("draaitabellen");
    if (heeft(/^xl\/(slicers|slicerCaches|timelines|timelineCaches)\//))
      risicos.add("slicers");
    if (heeft(/^xl\/externalLinks\//)) risicos.add("externe_koppelingen");
    if (heeft(/^xl\/(connections\.xml$|queryTables\/)/))
      risicos.add("gegevensverbindingen");
  }
  if (soort === "docx") {
    const doc = hoofdtekst[0];
    if (/<(?:\w+:)?(?:ins|del|moveFrom|moveTo)[\s/>]/.test(doc))
      risicos.add("revisies");
    if (namen.has("word/comments.xml")) risicos.add("opmerkingen");
    if (/<(?:\w+:)?(?:footnote|endnote)Reference[\s/>]/.test(doc))
      risicos.add("voetnoten");
    if (heeft(/^word\/(header|footer)\d*\.xml$/)) risicos.add("kop_voettekst");
  }
  if (soort === "pptx") {
    if (heeft(/^ppt\/notesSlides\//)) risicos.add("notities");
    if (hoofdtekst.some((x) => /<(?:\w+:)?timing[\s/>]/.test(x)))
      risicos.add("animaties");
    if (hoofdtekst.some((x) => /<(?:\w+:)?transition[\s/>]/.test(x)))
      risicos.add("overgangen");
    if (heeft(/^ppt\/comments\//)) risicos.add("opmerkingen");
  }
  return [...risicos].sort();
}

/** Snelle pakketcontrole vóór een engine geheugen voor documentinhoud reserveert. */
export function controleerPakket(bytes: Uint8Array, soort: Soort) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error(
      "Dit is geen leesbaar OOXML-pakket. Het bestand kan versleuteld zijn of een andere extensie nodig hebben.",
    );
  const namen = new Set<string>();
  let totaal = 0;
  const bestanden = unzipSync(bytes, {
    filter: (bestand) => {
      const naam = bestand.name;
      if (namen.has(naam))
        throw new Error("Het pakket bevat dubbele onderdelen.");
      if (
        naam.startsWith("/") ||
        naam.includes("\\") ||
        naam.split("/").includes("..")
      )
        throw new Error("Het pakket bevat een ongeldig onderdeelpad.");
      namen.add(naam);
      totaal += bestand.originalSize;
      if (
        namen.size > 10000 ||
        totaal > 256 * 1024 * 1024 ||
        bestand.originalSize > 64 * 1024 * 1024
      )
        throw new Error(
          "Dit pakket is te groot om veilig te openen: maximaal 256 MB uitgepakt, 64 MB per onderdeel en 10.000 onderdelen.",
        );
      // Alleen de kleine onderdelen die de risicodetectie nodig heeft.
      return (
        (soort === "xlsx" && naam === "xl/workbook.xml") ||
        naam === "[Content_Types].xml" ||
        naam.endsWith(".rels") ||
        (soort === "docx" && leesLegeBibliografieDeel(naam, bestand.originalSize)) ||
        (soort === "docx" && naam === "word/document.xml") ||
        (soort === "docx" && naam === "word/settings.xml") ||
        (soort === "pptx" && naam === "ppt/presentation.xml") ||
        (soort === "pptx" && /^ppt\/slides\/slide\d+\.xml$/.test(naam))
      );
    },
  });
  const hoofd = {
    docx: "word/document.xml",
    xlsx: "xl/workbook.xml",
    pptx: "ppt/presentation.xml",
  }[soort];
  if (!namen.has(hoofd))
    throw new Error(
      "Het hoofdonderdeel ontbreekt of het bestandstype past niet bij de extensie.",
    );
  return {
    strict:
      soort === "xlsx" &&
      strFromU8(bestanden["xl/workbook.xml"]).includes("purl.oclc.org/ooxml"),
    macros: [...namen].some((naam) => /(^|\/)vbaProject\.bin$/i.test(naam)),
    /** Werkboek met het datumsysteem 1904 (Mac-Excel). */
    datum1904:
      soort === "xlsx" &&
      /<(?:\w+:)?workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(
        strFromU8(bestanden["xl/workbook.xml"]),
      ),
    onderdelen: namen.size,
    uitgepakt: totaal,
    risicos: risicosVan(soort, namen, bestanden),
  };
}

/**
 * Wat de app met gedetecteerde kenmerken doet, op basis van wat de testmatrix
 * op die route als verlies heeft aangetoond. Verlies via de eigen engine
 * blokkeert opslaan in het oorspronkelijke formaat; verlies bij een conversie
 * (een afzonderlijke kopie; het origineel blijft ongewijzigd) wordt expliciet
 * gemeld en nooit als verliesvrij gepresenteerd.
 */
export function risicoBeleid(
  risicos: readonly Risico[],
  soort: Soort,
  route: Opslagroute = "engine",
  matrix: typeof MATRIXVERLIES = MATRIXVERLIES,
) {
  const verlies = risicos.filter((r) => matrix[soort][route].includes(r));
  const lijst = verlies.map((r) => RISICONAMEN[r]).join(", ");
  return {
    verlies,
    opslaanGeblokkeerd: route === "engine" && verlies.length > 0,
    waarschuwing: !verlies.length
      ? null
      : route === "engine"
        ? `Opslaan geweigerd: dit bestand bevat ${lijst}, die de editor bij opslaan niet behoudt. Het origineel is niet gewijzigd.`
        : `Let op: dit bestand bevat ${lijst}. Die gaan bij omzetten verloren; de omgezette kopie is daarom niet verliesvrij. Het origineel blijft ongewijzigd.`,
  };
}
