/**
 * OOXML-pakket (zip) als verzameling onderdelen, met hulpfuncties voor
 * relaties en inhoudstypen. Ongewijzigde onderdelen blijven byte-gelijk.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import i18next from "../i18n/config";
import { GrafiekFout, LIMIETEN } from "./fouten.ts";
import { attr, attrTekst, kinderen, leesXml, ontsnap, vervang } from "./xml.ts";

export const REL = {
  chart: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart",
  drawing: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
  package: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package",
  worksheet: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
  officeDocument: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  slide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
};
export const TYPE = {
  chart: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
  drawing: "application/vnd.openxmlformats-officedocument.drawing+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  worksheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  rels: "application/vnd.openxmlformats-package.relationships+xml",
};

export interface Relatie {
  id: string;
  type: string;
  target: string;
  extern: boolean;
}

export class Pakket {
  private onderdelen: Map<string, Uint8Array>;
  /** Volgorde van de onderdelen in het oorspronkelijke archief. */
  private volgorde: string[];
  private tekst = new Map<string, string>();

  constructor(bytes: Uint8Array) {
    if (bytes.byteLength > LIMIETEN.pakketBytes)
      throw new GrafiekFout(i18next.t("charts:errors.package.tooLarge"));
    let totaal = 0;
    let aantal = 0;
    let bestanden: Record<string, Uint8Array>;
    try {
      bestanden = unzipSync(bytes, {
        filter: (f) => {
          aantal++;
          totaal += f.originalSize;
          if (aantal > LIMIETEN.onderdelen || totaal > LIMIETEN.uitgepaktBytes)
            throw new GrafiekFout(i18next.t("charts:errors.package.tooManyParts"));
          return true;
        },
      });
    } catch (e) {
      if (e instanceof GrafiekFout) throw e;
      throw new GrafiekFout(i18next.t("charts:errors.package.notZip"));
    }
    this.onderdelen = new Map();
    this.volgorde = [];
    for (const [naam, inhoud] of Object.entries(bestanden)) {
      if (naam.endsWith("/")) continue;
      if (naam.includes("\\") || naam.split("/").includes(".."))
        throw new GrafiekFout(i18next.t("charts:errors.package.invalidPartName"));
      this.onderdelen.set(naam, inhoud);
      this.volgorde.push(naam);
    }
    if (!this.onderdelen.has("[Content_Types].xml"))
      throw new GrafiekFout(i18next.t("charts:errors.package.noContentTypes"));
  }

  heeft(pad: string) {
    return this.onderdelen.has(pad) || this.tekst.has(pad);
  }
  namen() {
    return [...new Set([...this.volgorde, ...this.tekst.keys()])].filter((n) => this.heeft(n));
  }
  lees(pad: string): string {
    const t = this.tekst.get(pad);
    if (t !== undefined) return t;
    const b = this.onderdelen.get(pad);
    if (!b) throw new GrafiekFout(i18next.t("charts:errors.package.missingPart", { part: pad }));
    let s = strFromU8(b);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    return s;
  }
  bytes(pad: string) {
    if (this.tekst.has(pad)) return strToU8(this.tekst.get(pad)!);
    return this.onderdelen.get(pad);
  }
  schrijf(pad: string, inhoud: string | Uint8Array) {
    if (typeof inhoud === "string") {
      this.tekst.set(pad, inhoud);
      this.onderdelen.delete(pad);
    } else {
      this.onderdelen.set(pad, inhoud);
      this.tekst.delete(pad);
    }
    if (!this.volgorde.includes(pad)) this.volgorde.push(pad);
  }
  verwijder(pad: string) {
    this.onderdelen.delete(pad);
    this.tekst.delete(pad);
  }

  /** Een nog niet gebruikte naam volgens een patroon met `#`, zoals `xl/charts/chart#.xml`. */
  vrijPad(patroon: string) {
    const bezet = new Set(this.namen().map((n) => n.toLowerCase()));
    for (let n = 1; n < 100000; n++) {
      const pad = patroon.replace("#", String(n));
      if (!bezet.has(pad.toLowerCase())) return pad;
    }
    throw new GrafiekFout(i18next.t("charts:errors.package.noFreePartName"));
  }

  // --- Relaties --------------------------------------------------------

  static relsPad(deel: string) {
    const i = deel.lastIndexOf("/");
    return `${deel.slice(0, i + 1)}_rels/${deel.slice(i + 1)}.rels`;
  }
  relaties(deel: string): Relatie[] {
    const pad = Pakket.relsPad(deel);
    if (!this.heeft(pad)) return [];
    return kinderen(leesXml(this.lees(pad)), "Relationship").map((r) => ({
      id: attr(r, "Id") ?? "",
      type: attr(r, "Type") ?? "",
      target: attr(r, "Target") ?? "",
      extern: attr(r, "TargetMode") === "External",
    }));
  }
  /** Pad van het doel van een interne relatie, relatief aan het bronnende onderdeel. */
  static doelPad(deel: string, target: string) {
    if (target.startsWith("/")) return target.slice(1);
    const delen = deel.split("/").slice(0, -1);
    for (const stuk of target.split("/")) {
      if (stuk === "..") delen.pop();
      else if (stuk !== "." && stuk !== "") delen.push(stuk);
    }
    return delen.join("/");
  }
  /** Relatief pad van `van` naar `naar`, voor een Target-attribuut. */
  static relatief(van: string, naar: string) {
    const a = van.split("/").slice(0, -1);
    const b = naar.split("/");
    let i = 0;
    while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
  }
  doel(deel: string, rid: string) {
    const r = this.relaties(deel).find((x) => x.id === rid);
    if (!r || r.extern) return null;
    return Pakket.doelPad(deel, r.target);
  }
  /** Voegt een relatie toe met een id die in dit rels-onderdeel nog niet bestaat. */
  voegRelatieToe(deel: string, type: string, doelPad: string) {
    const pad = Pakket.relsPad(deel);
    const bestaand = this.relaties(deel);
    const ids = new Set(bestaand.map((r) => r.id));
    let n = bestaand.reduce((m, r) => Math.max(m, Number(/^rId(\d+)$/.exec(r.id)?.[1] ?? 0)), 0) + 1;
    while (ids.has(`rId${n}`)) n++;
    const id = `rId${n}`;
    const regel = `<Relationship${attrTekst({ Id: id, Type: type, Target: Pakket.relatief(deel, doelPad) })}/>`;
    if (!this.heeft(pad)) {
      this.schrijf(
        pad,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${regel}</Relationships>`,
      );
      // Sommige pakketten geven elk rels-onderdeel een eigen inhoudstype in plaats van een standaard.
      if (!this.heeftStandaard("rels")) this.voegOverrideToe(pad, TYPE.rels);
    } else {
      const xml = this.lees(pad);
      const wortel = leesXml(xml);
      if (wortel.leeg) {
        this.schrijf(pad, vervang(xml, [{ start: wortel.start, eind: wortel.eind, tekst: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${regel}</Relationships>` }]));
      } else this.schrijf(pad, vervang(xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: regel }]));
    }
    return id;
  }
  verwijderRelatie(deel: string, rid: string) {
    const pad = Pakket.relsPad(deel);
    if (!this.heeft(pad)) return;
    const xml = this.lees(pad);
    const el = kinderen(leesXml(xml), "Relationship").find((r) => attr(r, "Id") === rid);
    if (el) this.schrijf(pad, vervang(xml, [{ start: el.start, eind: el.eind, tekst: "" }]));
  }

  // --- Inhoudstypen ----------------------------------------------------

  voegOverrideToe(deel: string, type: string) {
    const xml = this.lees("[Content_Types].xml");
    const wortel = leesXml(xml);
    const naam = "/" + deel;
    if (kinderen(wortel, "Override").some((o) => attr(o, "PartName")?.toLowerCase() === naam.toLowerCase())) return;
    this.schrijf(
      "[Content_Types].xml",
      vervang(xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: `<Override${attrTekst({ PartName: naam, ContentType: type })}/>` }]),
    );
  }
  heeftStandaard(extensie: string) {
    return kinderen(leesXml(this.lees("[Content_Types].xml")), "Default").some(
      (o) => attr(o, "Extension")?.toLowerCase() === extensie.toLowerCase(),
    );
  }
  voegDefaultToe(extensie: string, type: string) {
    const xml = this.lees("[Content_Types].xml");
    const wortel = leesXml(xml);
    if (kinderen(wortel, "Default").some((o) => attr(o, "Extension")?.toLowerCase() === extensie.toLowerCase())) return;
    // Defaults staan bij voorkeur vóór de Overrides.
    const eersteOverride = kinderen(wortel, "Override")[0];
    const p = eersteOverride ? eersteOverride.start : wortel.inhoudEind;
    this.schrijf(
      "[Content_Types].xml",
      vervang(xml, [{ start: p, eind: p, tekst: `<Default${attrTekst({ Extension: extensie, ContentType: type })}/>` }]),
    );
  }
  verwijderOverride(deel: string) {
    const xml = this.lees("[Content_Types].xml");
    const naam = "/" + deel.toLowerCase();
    const el = kinderen(leesXml(xml), "Override").find((o) => attr(o, "PartName")?.toLowerCase() === naam);
    if (el) this.schrijf("[Content_Types].xml", vervang(xml, [{ start: el.start, eind: el.eind, tekst: "" }]));
  }
  /** Alle (interne) relaties naar een onderdeel, vanuit alle rels-onderdelen. */
  verwijzingenNaar(doel: string) {
    const uit: { deel: string; id: string }[] = [];
    for (const naam of this.namen()) {
      const m = /^(.*)_rels\/([^/]+)\.rels$/.exec(naam);
      if (!m) continue;
      const deel = m[1] + m[2];
      for (const r of this.relaties(deel))
        if (!r.extern && Pakket.doelPad(deel, r.target) === doel) uit.push({ deel, id: r.id });
    }
    return uit;
  }

  inpakken(): Uint8Array {
    const z: Zippable = {};
    // [Content_Types].xml vooraan, zoals Office dat doet.
    const namen = this.namen().sort((a, b) =>
      a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : 0,
    );
    for (const naam of namen) {
      const b = this.bytes(naam)!;
      z[naam] = [b, { level: /\.(png|jpe?g|gif|xlsx|docx|pptx|zip|bin)$/i.test(naam) ? 0 : 6 }];
    }
    return zipSync(z);
  }
}

export { ontsnap };
