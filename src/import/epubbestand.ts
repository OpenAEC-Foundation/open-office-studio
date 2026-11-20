/** EPUB 2/3 → bestaand HTML-tekstmodel → DOCX. Geen runtime of netwerk nodig. */
import { DOMParser, type Element, type Node } from "@xmldom/xmldom";
import { strFromU8, unzipSync } from "fflate";
import i18next from "../i18n/config";
import { htmlNaarModel } from "./htmlbestand";
import { schrijfDocx, xmlTekst } from "./docxschrijver";
import { afbeeldingstype, type Tekstdocument } from "./tekstmodel";
import type { Tekstomzetting } from "./tekstimport";

const OPF = "http://www.idpf.org/2007/opf";
const OCF = "urn:oasis:names:tc:opendocument:xmlns:container";
const XHTML = "http://www.w3.org/1999/xhtml";
const MAX_PAKKET = 100 * 1024 * 1024;
const MAX_DEEL = 32 * 1024 * 1024;
const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(`import:epub.${key}`, options ?? {});
const fout = (key = "invalid") => new Error(t(key));

/** Alleen relatieve containerpaden; nooit een URL, schijfpad of map erbuiten. */
function pad(van: string, href: string): string {
  if (!href || /^[a-z][\w+.-]*:|^[\/\\]|[\\\u0000-\u001f]/i.test(href))
    throw fout();
  let lokaal: string;
  try {
    lokaal = decodeURIComponent(href.split(/[?#]/, 1)[0]);
  } catch {
    throw fout();
  }
  if (/^[\/\\]|[\\\u0000-\u001f]/.test(lokaal)) throw fout();
  const delen = van.split("/").slice(0, -1);
  for (const deel of lokaal.split("/")) {
    if (!deel || deel === ".") continue;
    if (deel === "..") {
      if (!delen.length) throw fout();
      delen.pop();
    } else delen.push(deel);
  }
  if (!delen.length) throw fout();
  return delen.join("/");
}

function xml(bytes: Uint8Array | undefined, naam: string, namespace: string) {
  if (!bytes) throw fout();
  // EPUB XML mag volgens de standaard UTF-8 of UTF-16 zijn. Detecteer de
  // bytevolgorde vóór het parsen; vervang ongeldige bytes nooit stil door �.
  const codering =
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0x3c && bytes[1] === 0)
      ? "utf-16le"
      : (bytes[0] === 0xfe && bytes[1] === 0xff) ||
          (bytes[0] === 0 && bytes[1] === 0x3c)
        ? "utf-16be"
        : "utf-8";
  const tekst = new TextDecoder(codering, { fatal: true }).decode(bytes);
  // Een EPUB 2 kan een standaard externe XHTML-doctype noemen. Die halen we
  // weg: geen DTD laden en nooit interne entiteitsdeclaraties verwerken.
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(tekst)) throw fout();
  const zonderDtd = tekst.replace(/<!DOCTYPE[^>]*>/gi, "");
  const doc = new DOMParser({
    onError: () => {
      throw fout();
    },
  }).parseFromString(
    zonderDtd,
    namespace === XHTML ? "application/xhtml+xml" : "application/xml",
  );
  const wortel = doc.documentElement;
  if (!wortel || wortel.localName !== naam || wortel.namespaceURI !== namespace)
    throw fout();
  return wortel;
}

function kinderen(e: Element, naam: string, namespace = OPF): Element[] {
  return Array.from(e.childNodes).filter(
    (n): n is Element =>
      n.nodeType === 1 && n.localName === naam && n.namespaceURI === namespace,
  );
}

/** Normaliseer XHTML-prefixen voor de bestaande niet-uitvoerende HTML-lezer. */
function html(node: Node, diepte = 0): string {
  if (diepte > 128) throw fout("tooLarge");
  if (node.nodeType === 3 || node.nodeType === 4)
    return xmlTekst(node.nodeValue ?? "");
  if (node.nodeType !== 1) return "";
  const e = node as Element;
  if (e.namespaceURI !== XHTML) return "";
  const naam = e.localName;
  if (!naam) throw fout();
  if (["script", "style", "head", "iframe", "object", "embed"].includes(naam))
    return "";
  // Alleen gegevens voor de eigen HTML-lezer; geen handlers of DOM-insertie.
  const attributen = Array.from(e.attributes)
    .filter((a) => !a.namespaceURI && !a.name.toLowerCase().startsWith("on"))
    .map((a) => ` ${a.name}="${xmlTekst(a.value)}"`)
    .join("");
  const inhoud = Array.from(e.childNodes)
    .map((n) => html(n, diepte + 1))
    .join("");
  return `<${naam}${attributen}>${inhoud}</${naam}>`;
}

export function zetEpubOm(bytes: Uint8Array): Tekstomzetting {
  if (bytes.byteLength > MAX_PAKKET) throw fout("tooLarge");
  try {
    const namen = new Set<string>();
    let totaal = 0;
    const bestanden = unzipSync(bytes, {
      filter: (f) => {
        if (
          namen.has(f.name) ||
          !f.name ||
          f.name.startsWith("/") ||
          f.name.includes("\\") ||
          f.name.split("/").some((d) => d === ".." || d === ".")
        )
          throw fout();
        namen.add(f.name);
        totaal += f.originalSize;
        if (
          namen.size > 5000 ||
          totaal > MAX_PAKKET ||
          f.originalSize > MAX_DEEL
        )
          throw fout("tooLarge");
        return !f.name.endsWith("/");
      },
    });
    if (
      !bestanden.mimetype ||
      strFromU8(bestanden.mimetype) !== "application/epub+zip"
    )
      throw fout();
    if (bestanden["META-INF/rights.xml"]) throw fout("encrypted");
    if (bestanden["META-INF/encryption.xml"]) {
      const encryption = xml(
        bestanden["META-INF/encryption.xml"],
        "encryption",
        OCF,
      );
      const methoden = Array.from(
        encryption.getElementsByTagNameNS(
          "http://www.w3.org/2001/04/xmlenc#",
          "EncryptionMethod",
        ),
      );
      // EPUB-fontobfuscatie is geen DRM; fonts worden niet in DOCX geïmporteerd.
      if (
        !methoden.length ||
        methoden.some(
          (m) =>
            ![
              "http://www.idpf.org/2008/embedding",
              "http://ns.adobe.com/pdf/enc#RC",
            ].includes(m.getAttribute("Algorithm") ?? ""),
        )
      )
        throw fout("encrypted");
    }
    const container = xml(
      bestanden["META-INF/container.xml"],
      "container",
      OCF,
    );
    const rootfiles = kinderen(container, "rootfiles", OCF);
    const rootfile = rootfiles
      .flatMap((r) => kinderen(r, "rootfile", OCF))
      .find(
        (r) => r.getAttribute("media-type") === "application/oebps-package+xml",
      );
    if (!rootfile) throw fout();
    const pakketPad = pad("", rootfile.getAttribute("full-path") ?? "");
    const pakket = xml(bestanden[pakketPad], "package", OPF);
    if (!["2.0", "3.0"].includes(pakket.getAttribute("version") ?? ""))
      throw fout();
    const manifest = kinderen(pakket, "manifest"),
      spine = kinderen(pakket, "spine");
    if (manifest.length !== 1 || spine.length !== 1) throw fout();
    const items = new Map<string, { pad: string; type: string }>();
    const ids = new Set<string>();
    const bronnen = new Map<string, string>();
    for (const item of kinderen(manifest[0], "item")) {
      const id = item.getAttribute("id"),
        href = item.getAttribute("href");
      if (!id || !href || ids.has(id)) throw fout();
      ids.add(id);
      // Externe manifestbronnen worden nooit opgehaald. Een externe leesvolgorde
      // faalt hieronder; een externe afbeelding krijgt een concrete verliesmelding.
      if (/^[a-z][\w+.-]*:|^\/\//i.test(href)) continue;
      const bronPad = pad(pakketPad, href);
      const type = item.getAttribute("media-type") ?? "";
      items.set(id, { pad: bronPad, type });
      bronnen.set(bronPad, type);
    }
    const referenties = kinderen(spine[0], "itemref");
    if (!referenties.length) throw fout();
    const document: Tekstdocument = { blokken: [] };
    let ontbrekend = 0;
    let verwerkteBytes = 0;
    const reserveer = (aantal: number) => {
      verwerkteBytes += aantal;
      if (verwerkteBytes > MAX_PAKKET) throw fout("tooLarge");
    };
    for (const ref of referenties) {
      const item = items.get(ref.getAttribute("idref") ?? "");
      if (!item) throw fout();
      if (item.type !== "application/xhtml+xml")
        throw fout("unsupportedChapter");
      reserveer(bestanden[item.pad]?.byteLength ?? 0);
      const hoofdstuk = xml(bestanden[item.pad], "html", XHTML);
      const resultaat = htmlNaarModel(html(hoofdstuk), (src) => {
        if (/^[a-z][\w+.-]*:|^\/\//i.test(src)) return null;
        const bronPad = pad(item.pad, src);
        const data = bestanden[bronPad];
        if (data) reserveer(data.byteLength);
        return bronnen.get(bronPad)?.startsWith("image/") &&
          data &&
          afbeeldingstype(data)
          ? data
          : null;
      });
      for (const blok of resultaat.document.blokken) document.blokken.push(blok);
      ontbrekend += resultaat.nietIngesloten;
    }
    if (!document.blokken.length) throw fout();
    return {
      bytes: schrijfDocx(document),
      regels: [
        { onderdeel: "EPUB", gevolg: t("imported") },
        ...(ontbrekend
          ? [
              {
                onderdeel: "EPUB",
                gevolg: t("resources", { count: ontbrekend }),
              },
            ]
          : []),
      ],
    };
  } catch (error) {
    // Parser-/ZIP-interne foutteksten zijn geen bruikbare gebruikersmelding.
    if (
      error instanceof Error &&
      ["invalid", "tooLarge", "encrypted", "unsupportedChapter"].some(
        (k) => error.message === t(k),
      )
    )
      throw error;
    throw fout();
  }
}
