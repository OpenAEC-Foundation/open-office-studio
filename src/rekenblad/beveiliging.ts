import type { WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  leesXml,
  vervang,
} from "../grafieken/xml";
import { NS, kindToevoegen, sectie, werkmap } from "./werkboekXml";
import i18next from "../i18n/config";
const melding = (sleutel: string) =>
  new Error(i18next.t("spreadsheet:protection.errors." + sleutel));

export const RECHTEN = [
  "selectLockedCells",
  "selectUnlockedCells",
  "formatCells",
  "formatColumns",
  "formatRows",
  "insertRows",
  "insertColumns",
  "sort",
  "autoFilter",
] as const;
export type BladRecht = (typeof RECHTEN)[number];
export type BladRechten = Record<BladRecht, boolean>;
export const standaardRechten = (): BladRechten => ({
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: false,
  formatRows: false,
  insertRows: false,
  insertColumns: false,
  sort: false,
  autoFilter: false,
});
const aan = (s: string | undefined) =>
  s !== undefined && s !== "0" && s !== "false";
export function leesBeveiliging(bytes: Uint8Array) {
  const p = new Pakket(bytes),
    wb = werkmap(p),
    wp = kind(wb.root, "workbookProtection");
  return {
    structuur: aan(wp ? attr(wp, "lockStructure") : undefined),
    werkmap: wp?.attrs ?? {},
    bladen: wb.bladen.map((b) => {
      const el = kind(leesXml(p.lees(b.pad)), "sheetProtection"),
        attrs = el?.attrs ?? {},
        rechten = standaardRechten();
      for (const r of RECHTEN)
        rechten[r] = !aan(attrs[r] ?? (r.startsWith("select") ? "0" : "1"));
      return { actief: aan(attrs.sheet), attrs, rechten };
    }),
  };
}

/** Legacy Excel-verifier; uitsluitend voor het controleren van bestaande wachtwoorden. */
export function legacyWachtwoord(wachtwoord: string) {
  let hash = 0;
  for (let i = wachtwoord.length - 1; i >= 0; i--) {
    hash = ((hash << 1) & 0x7fff) | ((hash >> 14) & 1);
    hash ^= wachtwoord.charCodeAt(i);
  }
  hash = ((hash << 1) & 0x7fff) | ((hash >> 14) & 1);
  hash ^= wachtwoord.length;
  hash ^= 0xce4b;
  return (hash & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}
const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function isoWachtwoord(
  wachtwoord: string,
  salt: Uint8Array,
  spins: number,
  algoritme = "SHA-512",
) {
  if (
    !["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(algoritme) ||
    !Number.isInteger(spins) ||
    spins < 0 ||
    spins > 10000000 ||
    salt.length > 65536
  )
    throw melding("unsupportedAlgorithm");
  const invoer = new Uint8Array(salt.length + wachtwoord.length * 2);
  invoer.set(salt);
  const v = new DataView(invoer.buffer);
  for (let i = 0; i < wachtwoord.length; i++)
    v.setUint16(salt.length + i * 2, wachtwoord.charCodeAt(i), true);
  let hash = new Uint8Array(await crypto.subtle.digest(algoritme, invoer));
  const iter = new Uint8Array(hash.length + 4),
    view = new DataView(iter.buffer);
  for (let i = 0; i < spins; i++) {
    iter.set(hash);
    view.setUint32(hash.length, i, true);
    hash = new Uint8Array(await crypto.subtle.digest(algoritme, iter));
  }
  return base64(hash);
}
export async function controleerWachtwoord(
  attrs: Record<string, string>,
  wachtwoord: string,
  werkmap = false,
) {
  const naam = (s: string) =>
    werkmap ? "workbook" + s[0].toUpperCase() + s.slice(1) : s;
  const hash = attrs[naam("hashValue")]?.replace(/\s+/g,""),
    oud = attrs[werkmap ? "workbookPassword" : "password"]?.trim();
  if (hash) {
    const salt = decode(attrs[naam("saltValue")] ?? ""),
      spin = Number(attrs[naam("spinCount")] ?? 0),
      alg = attrs[naam("algorithmName")] ?? "SHA-512";
    const eigen = await isoWachtwoord(wachtwoord, salt, spin, alg);
    if (eigen === hash) return;
    const compat = String.fromCharCode(
      parseInt(legacyWachtwoord(wachtwoord), 16),
    );
    if ((await isoWachtwoord(compat, salt, spin, alg)) === hash) return;
    throw melding("wrongPassword");
  }
  if (
    oud &&
    legacyWachtwoord(wachtwoord) !== oud.toUpperCase().padStart(4, "0")
  )
    throw melding("wrongPassword");
}
async function wachtwoordAttrs(wachtwoord: string, werkmap = false) {
  if (!wachtwoord) return {};
  if (wachtwoord.length > 255) throw melding("passwordLength");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    spins = 100000;
  const hash = await isoWachtwoord(wachtwoord, salt, spins);
  return werkmap
    ? {
        workbookAlgorithmName: "SHA-512",
        workbookHashValue: hash,
        workbookSaltValue: base64(salt),
        workbookSpinCount: String(spins),
      }
    : {
        algorithmName: "SHA-512",
        hashValue: hash,
        saltValue: base64(salt),
        spinCount: String(spins),
      };
}
export async function schrijfBladBeveiliging(
  bytes: Uint8Array,
  blad: number,
  rechten: BladRechten | null,
  oudWachtwoord = "",
  nieuwWachtwoord = "",
) {
  const p = new Pakket(bytes),
    b = werkmap(p).bladen[blad];
  if (!b) throw melding("missingSheet");
  const root = leesXml(p.lees(b.pad)),
    oud = kind(root, "sheetProtection"),
    attrs = { ...(oud?.attrs ?? {}) };
  if (oud && aan(attrs.sheet)) await controleerWachtwoord(attrs, oudWachtwoord);
  if (!rechten) {
    sectie(p, b.pad, "sheetProtection", "");
    return p.inpakken();
  }
  for (const r of RECHTEN) attrs[r] = rechten[r] ? "0" : "1";
  attrs.sheet = "1";
  attrs.objects ??= "1";
  attrs.scenarios ??= "1";
  if (nieuwWachtwoord) {
    for (const k of [
      "password",
      "algorithmName",
      "hashValue",
      "saltValue",
      "spinCount",
    ])
      delete attrs[k];
    Object.assign(attrs, await wachtwoordAttrs(nieuwWachtwoord));
  }
  sectie(
    p,
    b.pad,
    "sheetProtection",
    `<sheetProtection${attrTekst({ xmlns: NS, ...attrs })}/>`,
  );
  return p.inpakken();
}
export async function schrijfStructuurBeveiliging(
  bytes: Uint8Array,
  actief: boolean,
  oudWachtwoord = "",
  nieuwWachtwoord = "",
) {
  const p = new Pakket(bytes),
    wb = werkmap(p),
    oud = kind(wb.root, "workbookProtection"),
    attrs = { ...(oud?.attrs ?? {}) };
  if (aan(attrs.lockStructure))
    await controleerWachtwoord(attrs, oudWachtwoord, true);
  attrs.lockStructure = actief ? "1" : "0";
  if (!actief || nieuwWachtwoord)
    for (const k of [
      "workbookPassword",
      "workbookAlgorithmName",
      "workbookHashValue",
      "workbookSaltValue",
      "workbookSpinCount",
    ])
      delete attrs[k];
  if (actief && nieuwWachtwoord)
    Object.assign(attrs, await wachtwoordAttrs(nieuwWachtwoord, true));
  const fragment = `<workbookProtection${attrTekst({ xmlns: NS, ...attrs })}/>`;
  if (oud)
    p.schrijf(
      wb.pad,
      vervang(wb.xml, [{ start: oud.start, eind: oud.eind, tekst: fragment }]),
    );
  else {
    const na = elementen(wb.root).find((e) =>
      [
        "bookViews",
        "sheets",
        "functionGroups",
        "externalReferences",
        "definedNames",
        "calcPr",
        "pivotCaches",
        "extLst",
      ].includes(e.lokaal),
    );
    p.schrijf(
      wb.pad,
      na
        ? vervang(wb.xml, [
            { start: na.start, eind: na.start, tekst: fragment },
          ])
        : kindToevoegen(wb.xml, wb.root, fragment),
    );
  }
  return p.inpakken();
}
export function celBeveiliging(h: WorkbookHandle, blad: number, ref: string) {
  const f = h.captureFormat(blad, ref).formats[0] as {
    protection?: { locked?: boolean; hidden?: boolean } | null;
  };
  return {
    locked: f.protection?.locked ?? true,
    hidden: f.protection?.hidden ?? false,
  };
}
export function zetCelBeveiliging(
  h: WorkbookHandle,
  blad: number,
  ref: string,
  locked?: boolean,
  hidden?: boolean,
) {
  const f = h.captureFormat(blad, ref);
  f.sourceFormats = f.sourceFormats?.map((bron, i) => {
    const b = bron as { derived_from?: number; source_xf?: number };
    return {
      ...(bron as object),
      derived_from: b.derived_from ?? b.source_xf ?? f.sourceStyles?.[i] ?? 0,
    };
  });
  f.formats = f.formats.map((v) => ({
    ...(v as object),
    protection: {
      locked: locked ?? (v as any)?.protection?.locked ?? true,
      hidden: hidden ?? (v as any)?.protection?.hidden ?? false,
    },
  }));
  return h.applyFormat(blad, ref, f);
}
