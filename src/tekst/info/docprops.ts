/**
 * Documenteigenschappen (#23/#28): `docProps/core.xml` (titel, auteur …) en
 * `docProps/app.xml` (statistieken, bewerkingstijd) lezen en schrijven via
 * de pakketroute. Ontbrekende onderdelen worden met relatie en inhoudstype
 * aangemaakt; bestaande elementen behouden hun plaats.
 */
import { Pakket } from "../../grafieken/pakket.ts";
import { leesXml, ontsnap, tekstVan, vervang, type XmlElement } from "../../grafieken/xml.ts";

export const NS = {
  cp: "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
  dc: "http://purl.org/dc/elements/1.1/",
  dcterms: "http://purl.org/dc/terms/",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
  app: "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
  vt: "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes",
};
const REL_CORE = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const REL_APP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";
const TYPE_CORE = "application/vnd.openxmlformats-package.core-properties+xml";
const TYPE_APP = "application/vnd.openxmlformats-officedocument.extended-properties+xml";

/** Bewerkbare kern-eigenschappen. */
export interface KernEigenschappen {
  titel: string;
  onderwerp: string;
  auteur: string;
  trefwoorden: string;
  opmerkingen: string;
  categorie: string;
  status: string;
}

export interface DocumentEigenschappen extends KernEigenschappen {
  laatstGewijzigdDoor: string;
  revisie: number | null;
  aangemaakt: string | null;
  gewijzigd: string | null;
  /** Uit app.xml. */
  paginas: number | null;
  woorden: number | null;
  tekens: number | null;
  tekensMetSpaties: number | null;
  alineas: number | null;
  regels: number | null;
  /** Bewerkingstijd in minuten (TotalTime). */
  bewerkingstijd: number | null;
  toepassing: string;
  bedrijf: string;
  manager: string;
}

/** Element per kern-eigenschap: [namespace-sleutel, lokale naam]. */
const KERN: Record<keyof KernEigenschappen, ["dc" | "cp", string]> = {
  titel: ["dc", "title"],
  onderwerp: ["dc", "subject"],
  auteur: ["dc", "creator"],
  trefwoorden: ["cp", "keywords"],
  opmerkingen: ["dc", "description"],
  categorie: ["cp", "category"],
  status: ["cp", "contentStatus"],
};
/** Volgorde zoals Office die schrijft (niet verplicht, wel netjes). */
const KERN_VOLGORDE = [
  "title", "subject", "creator", "keywords", "description", "lastModifiedBy",
  "revision", "lastPrinted", "created", "modified", "category", "contentStatus",
  "identifier", "language", "version",
];
const APP_VOLGORDE = [
  "Template", "TotalTime", "Pages", "Words", "Characters", "Application",
  "DocSecurity", "Lines", "Paragraphs", "ScaleCrop", "HeadingPairs",
  "TitlesOfParts", "Manager", "Company", "LinksUpToDate",
  "CharactersWithSpaces", "SharedDoc", "HyperlinkBase", "HyperlinksChanged",
  "AppVersion",
];

export const LEEG_KERN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="${NS.cp}" xmlns:dc="${NS.dc}" xmlns:dcterms="${NS.dcterms}" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="${NS.xsi}"></cp:coreProperties>`;
export const LEEG_APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="${NS.app}" xmlns:vt="${NS.vt}"></Properties>`;

function kindNs(wortel: XmlElement, ns: string, lokaal: string) {
  for (const k of wortel.kinderen)
    if (k.soort === "element" && k.lokaal === lokaal && namespace(k) === ns) return k;
  return null;
}
function namespace(el: XmlElement): string | null {
  const sleutel = el.voorvoegsel ? `xmlns:${el.voorvoegsel}` : "xmlns";
  for (let e: XmlElement | null = el; e; e = e.ouder) if (sleutel in e.attrs) return e.attrs[sleutel];
  return null;
}
/** Voorvoegsel dat de wortel voor een namespace declareert (null = ontbreekt). */
function voorvoegsel(wortel: XmlElement, ns: string): string | null {
  for (const [naam, waarde] of Object.entries(wortel.attrs))
    if (waarde === ns) return naam === "xmlns" ? "" : naam.startsWith("xmlns:") ? naam.slice(6) : null;
  return null;
}

const getal = (el: XmlElement | null) => {
  if (!el) return null;
  const n = Number(tekstVan(el).trim());
  return Number.isFinite(n) && tekstVan(el).trim() !== "" ? n : null;
};

/** Leest core.xml en app.xml (beide mogen ontbreken of null zijn). */
export function leesDocProps(kernXml: string | null, appXml: string | null): DocumentEigenschappen {
  const kern = kernXml ? leesXml(kernXml) : null;
  const tekst = (ns: string, lokaal: string) => (kern ? tekstVan(kindNs(kern, ns, lokaal)).trim() : "");
  const app = appXml ? leesXml(appXml) : null;
  const a = (lokaal: string) => (app ? kindNs(app, NS.app, lokaal) : null);
  const datum = (lokaal: string) => tekst(NS.dcterms, lokaal) || null;
  const uit = {} as DocumentEigenschappen;
  for (const [sleutel, [ns, lokaal]] of Object.entries(KERN) as [keyof KernEigenschappen, ["dc" | "cp", string]][])
    uit[sleutel] = tekst(NS[ns], lokaal);
  return {
    ...uit,
    laatstGewijzigdDoor: tekst(NS.cp, "lastModifiedBy"),
    revisie: kern ? getal(kindNs(kern, NS.cp, "revision")) : null,
    aangemaakt: datum("created"),
    gewijzigd: datum("modified"),
    paginas: getal(a("Pages")),
    woorden: getal(a("Words")),
    tekens: getal(a("Characters")),
    tekensMetSpaties: getal(a("CharactersWithSpaces")),
    alineas: getal(a("Paragraphs")),
    regels: getal(a("Lines")),
    bewerkingstijd: getal(a("TotalTime")),
    toepassing: tekstVan(a("Application")).trim(),
    bedrijf: tekstVan(a("Company")).trim(),
    manager: tekstVan(a("Manager")).trim(),
  };
}

type Waarde = string | null;

/**
 * Zet kinderen van de wortel (op namespace + lokale naam); `null` verwijdert.
 * Nieuwe kinderen komen op hun plaats volgens `volgorde`.
 */
function zetKinderen(
  xml: string,
  wijzigingen: { ns: string; lokaal: string; tekst: Waarde; attrs?: string }[],
  volgorde: string[],
  standaardPrefix: Record<string, string>,
): string {
  let werk = xml;
  for (const w of wijzigingen) {
    const wortel = leesXml(werk);
    const bestaand = kindNs(wortel, w.ns, w.lokaal);
    if (w.tekst === null) {
      if (bestaand) werk = vervang(werk, [{ start: bestaand.start, eind: bestaand.eind, tekst: "" }]);
      continue;
    }
    let p = voorvoegsel(wortel, w.ns);
    let declaratie = "";
    if (p === null) {
      p = standaardPrefix[w.ns] ?? "ns1";
      declaratie = ` xmlns:${p}="${w.ns}"`;
    }
    const naam = bestaand ? bestaand.naam : p ? `${p}:${w.lokaal}` : w.lokaal;
    const inhoud = ontsnap(w.tekst);
    const attrs = bestaand
      ? werk.slice(bestaand.start + 1 + bestaand.naam.length, bestaand.leeg ? bestaand.inhoudStart - 2 : bestaand.inhoudStart - 1)
      : w.attrs ?? "";
    const element = inhoud ? `<${naam}${attrs}>${inhoud}</${naam}>` : `<${naam}${attrs}/>`;
    if (bestaand) {
      werk = vervang(werk, [{ start: bestaand.start, eind: bestaand.eind, tekst: element }]);
      continue;
    }
    // Plaats: vóór het eerste bestaande kind dat later in de volgorde komt.
    const rang = volgorde.indexOf(w.lokaal);
    const later = wortel.kinderen.find(
      (k): k is XmlElement => k.soort === "element" && rang >= 0 && volgorde.indexOf(k.lokaal) > rang,
    );
    const plek = later ? later.start : wortel.leeg ? -1 : wortel.inhoudEind;
    if (plek < 0) {
      const kop = werk.slice(wortel.start, wortel.inhoudStart - 2);
      werk = vervang(werk, [{ start: wortel.start, eind: wortel.eind, tekst: `${kop}${declaratie}>${element}</${wortel.naam}>` }]);
    } else {
      const vervangingen = [{ start: plek, eind: plek, tekst: element }];
      if (declaratie) {
        const eindKop = wortel.inhoudStart - 1;
        vervangingen.push({ start: eindKop, eind: eindKop, tekst: declaratie });
      }
      werk = vervang(werk, vervangingen);
    }
  }
  return werk;
}

export interface DocPropsWijziging extends Partial<KernEigenschappen> {
  laatstGewijzigdDoor?: string;
  /** ISO-datum; zet `dcterms:modified`. */
  gewijzigd?: string;
  /** Verhoog `cp:revision` met één. */
  revisieOphogen?: boolean;
  paginas?: number;
  woorden?: number;
  tekens?: number;
  tekensMetSpaties?: number;
  alineas?: number;
  bewerkingstijd?: number;
  bedrijf?: string | null;
  manager?: string | null;
}

/** Een niet-lege alias voor een QName/attribuut, zonder bestaande aliassen te overschrijven. */
function metVoorvoegsel(xml: string, ns: string, voorkeur: string) {
  const wortel = leesXml(xml);
  for (const [naam, waarde] of Object.entries(wortel.attrs))
    if (naam.startsWith("xmlns:") && waarde === ns)
      return { xml, prefix: naam.slice(6) };
  let prefix = voorkeur;
  for (let n = 1; Object.hasOwn(wortel.attrs, `xmlns:${prefix}`); n++)
    prefix = `${voorkeur}${n}`;
  const plek = wortel.inhoudStart - (wortel.leeg ? 2 : 1);
  return {
    xml: vervang(xml, [{ start: plek, eind: plek, tekst: ` xmlns:${prefix}="${ns}"` }]),
    prefix,
  };
}

/** Past de wijziging toe op core.xml (bestaand of leeg). */
export function wijzigKern(kernXml: string | null, w: DocPropsWijziging): string {
  let xml = kernXml ?? LEEG_KERN;
  const lijst: { ns: string; lokaal: string; tekst: Waarde; attrs?: string }[] = [];
  for (const [sleutel, [ns, lokaal]] of Object.entries(KERN) as [keyof KernEigenschappen, ["dc" | "cp", string]][]) {
    const waarde = w[sleutel];
    if (waarde !== undefined) lijst.push({ ns: NS[ns], lokaal, tekst: waarde.trim() || (lokaal === "contentStatus" ? null : "") });
  }
  if (w.laatstGewijzigdDoor !== undefined) lijst.push({ ns: NS.cp, lokaal: "lastModifiedBy", tekst: w.laatstGewijzigdDoor });
  if (w.revisieOphogen) {
    const huidig = leesDocProps(xml, null).revisie ?? 0;
    lijst.push({ ns: NS.cp, lokaal: "revision", tekst: String(huidig + 1) });
  }
  if (w.gewijzigd !== undefined) {
    // Een datum zonder milliseconden, zoals Office die schrijft.
    const datum = w.gewijzigd.replace(/\.\d{3}Z$/, "Z");
    const xsi = metVoorvoegsel(xml, NS.xsi, "xsi");
    const termen = metVoorvoegsel(xsi.xml, NS.dcterms, "dcterms");
    xml = termen.xml;
    lijst.push({ ns: NS.dcterms, lokaal: "modified", tekst: datum, attrs: ` ${xsi.prefix}:type="${termen.prefix}:W3CDTF"` });
  }
  return zetKinderen(xml, lijst, KERN_VOLGORDE, { [NS.cp]: "cp", [NS.dc]: "dc", [NS.dcterms]: "dcterms", [NS.xsi]: "xsi" });
}

/** Past statistieken en organisatievelden toe op app.xml (bestaand of leeg). */
export function wijzigApp(appXml: string | null, w: DocPropsWijziging): string {
  const lijst: { ns: string; lokaal: string; tekst: Waarde }[] = [];
  const zet = (lokaal: string, waarde: number | string | null | undefined) => {
    if (waarde === undefined) return;
    lijst.push({ ns: NS.app, lokaal, tekst: waarde === null ? null : String(typeof waarde === "number" ? Math.max(0, Math.round(waarde)) : waarde) });
  };
  zet("TotalTime", w.bewerkingstijd);
  zet("Pages", w.paginas);
  zet("Words", w.woorden);
  zet("Characters", w.tekens);
  zet("Paragraphs", w.alineas);
  zet("CharactersWithSpaces", w.tekensMetSpaties);
  zet("Company", w.bedrijf);
  zet("Manager", w.manager);
  if (!lijst.length && appXml) return appXml;
  return zetKinderen(appXml ?? LEEG_APP, lijst, APP_VOLGORDE, { [NS.app]: "" });
}

/** Pad van een pakketonderdeel via de pakketrelatie, of null. */
function relatieDoel(pakket: Pakket, type: string) {
  const r = pakket.relaties("").find((x) => x.type === type && !x.extern);
  return r ? Pakket.doelPad("", r.target) : null;
}

/** Leest de eigenschappen uit een DOCX/XLSX/PPTX-pakket. */
export function leesEigenschappen(bytes: Uint8Array): DocumentEigenschappen {
  const pakket = new Pakket(bytes);
  const kern = relatieDoel(pakket, REL_CORE);
  const app = relatieDoel(pakket, REL_APP);
  return leesDocProps(kern && pakket.heeft(kern) ? pakket.lees(kern) : null, app && pakket.heeft(app) ? pakket.lees(app) : null);
}

/** Schrijft eigenschappen in het pakket; maakt core.xml/app.xml zo nodig aan. */
export function schrijfEigenschappen(bytes: Uint8Array, w: DocPropsWijziging): Uint8Array {
  const pakket = new Pakket(bytes);
  let kern = relatieDoel(pakket, REL_CORE);
  if (!kern) {
    kern = pakket.heeft("docProps/core.xml") ? pakket.vrijPad("docProps/core#.xml") : "docProps/core.xml";
    pakket.voegRelatieToe("", REL_CORE, kern);
    pakket.voegOverrideToe(kern, TYPE_CORE);
  }
  pakket.schrijf(kern, wijzigKern(pakket.heeft(kern) ? pakket.lees(kern) : null, w));
  const heeftApp = ["paginas", "woorden", "tekens", "tekensMetSpaties", "alineas", "bewerkingstijd", "bedrijf", "manager"].some(
    (k) => w[k as keyof DocPropsWijziging] !== undefined,
  );
  if (heeftApp) {
    let app = relatieDoel(pakket, REL_APP);
    if (!app) {
      app = pakket.heeft("docProps/app.xml") ? pakket.vrijPad("docProps/app#.xml") : "docProps/app.xml";
      pakket.voegRelatieToe("", REL_APP, app);
      pakket.voegOverrideToe(app, TYPE_APP);
    }
    pakket.schrijf(app, wijzigApp(pakket.heeft(app) ? pakket.lees(app) : null, w));
  }
  return pakket.inpakken();
}
