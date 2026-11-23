/** Resolveer echte accentkleuren, zonder een ontbrekend thema door een preset te vervangen. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  elementen,
  kinderen,
  leesXml,
  namespaceVan,
  type XmlElement,
} from "../grafieken/xml";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const THEMA_ACCENTEN = [
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
] as const;
export type ThemaAccent = (typeof THEMA_ACCENTEN)[number];
const PALET = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  ...THEMA_ACCENTEN,
  "hlink",
  "folHlink",
] as const;
const MAP = [
  "bg1",
  "tx1",
  "bg2",
  "tx2",
  ...THEMA_ACCENTEN,
  "hlink",
  "folHlink",
];
type Reden =
  | "missing"
  | "external"
  | "invalid"
  | "cycle"
  | "unsupportedOverride";
class NietBeschikbaar extends Error {
  constructor(public reden: Reden) {
    super(reden);
  }
}
export type ThemaAchtergrond =
  | {
      beschikbaar: true;
      kleuren: Record<ThemaAccent, string>;
      gekozen?: ThemaAccent;
    }
  | { beschikbaar: false; reden: Reden };
const ns = (el: XmlElement, uri: string) =>
  namespaceVan(el, el.voorvoegsel) === uri;
function kind(el: XmlElement | undefined, naam: string, uri: string) {
  const lijst = kinderen(el, naam).filter((e) => ns(e, uri));
  if (lijst.length > 1) throw new NietBeschikbaar("invalid");
  return lijst[0];
}
function relatie(p: Pakket, bron: string, type: string, verplicht = false) {
  const rels = p.relaties(bron).filter((r) => r.type === R + "/" + type);
  if (rels.length > 1) throw new NietBeschikbaar("invalid");
  const rel = rels[0];
  if (!rel) {
    if (verplicht) throw new NietBeschikbaar("missing");
    return undefined;
  }
  if (rel.extern) throw new NietBeschikbaar("external");
  if (!rel.target || /[\\\0?#]|^[a-z][\w+.-]*:/i.test(rel.target))
    throw new NietBeschikbaar("invalid");
  const pad = Pakket.doelPad(bron, rel.target);
  if (pad.startsWith("../") || !p.heeft(pad))
    throw new NietBeschikbaar("missing");
  return pad;
}
function kleurMap(root: XmlElement | undefined) {
  if (!root || elementen(root).length) throw new NietBeschikbaar("invalid");
  return Object.fromEntries(
    MAP.map((k) => {
      const value = attr(root, k);
      if (!PALET.includes(value as (typeof PALET)[number]))
        throw new NietBeschikbaar("invalid");
      return [k, value!];
    }),
  );
}
function palet(root: XmlElement | undefined) {
  if (!root) throw new NietBeschikbaar("missing");
  return Object.fromEntries(
    PALET.map((k) => {
      const slot = kind(root, k, A),
        lijst = slot && elementen(slot);
      if (!lijst || lijst.length !== 1) throw new NietBeschikbaar("invalid");
      const color = lijst[0];
      if (!ns(color, A) || elementen(color).length)
        throw new NietBeschikbaar("invalid");
      const hex =
        color.lokaal === "srgbClr"
          ? attr(color, "val")
          : color.lokaal === "sysClr"
            ? attr(color, "lastClr")
            : undefined;
      if (!hex || !/^[a-f\d]{6}$/i.test(hex))
        throw new NietBeschikbaar("invalid");
      return [k, "#" + hex.toUpperCase()];
    }),
  );
}

export function leesThemaAchtergrondPakket(
  p: Pakket,
  diaPad: string,
): ThemaAchtergrond {
  try {
    const bezocht = new Set<string>();
    const laad = (pad: string, lokaal: string, uri: string) => {
      if (bezocht.has(pad)) throw new NietBeschikbaar("cycle");
      bezocht.add(pad);
      const root = leesXml(p.lees(pad));
      if (root.lokaal !== lokaal || !ns(root, uri))
        throw new NietBeschikbaar("invalid");
      return root;
    };
    const dia = laad(diaPad, "sld", P);
    const layoutPad = relatie(p, diaPad, "slideLayout", true)!;
    const layout = laad(layoutPad, "sldLayout", P);
    const masterPad = relatie(p, layoutPad, "slideMaster", true)!;
    const master = laad(masterPad, "sldMaster", P);
    const keten = [diaPad, layoutPad, masterPad];
    let basis = -1,
      kleuren: Record<string, string> | undefined;
    for (let i = 0; i < keten.length; i++) {
      const theme = relatie(p, keten[i], "theme");
      if (!theme) continue;
      const root = laad(theme, "theme", A);
      // Een verdere themaketen is geen ondersteunde paletdefinitie.
      for (const type of ["theme", "themeOverride"]) {
        const extra = relatie(p, theme, type);
        if (extra)
          throw new NietBeschikbaar(bezocht.has(extra) ? "cycle" : "invalid");
      }
      kleuren = palet(kind(kind(root, "themeElements", A), "clrScheme", A));
      basis = i;
      break;
    }
    if (!kleuren) throw new NietBeschikbaar("missing");
    // Overrides onder de gekozen volledige themabron hebben geen voorrang.
    for (let i = basis; i >= 0; i--) {
      const pad = relatie(p, keten[i], "themeOverride");
      if (!pad) continue;
      if (i === basis) throw new NietBeschikbaar("invalid");
      const root = laad(pad, "themeOverride", A);
      const schema = kind(root, "clrScheme", A);
      if (schema) {
        palet(schema); // Valide definitie, maar de SDK tekent deze kleur-override niet.
        throw new NietBeschikbaar("unsupportedOverride");
      }
    }
    const masterMap = kleurMap(kind(master, "clrMap", P));
    let mapping = masterMap;
    for (const root of [layout, dia]) {
      const override = kind(root, "clrMapOvr", P);
      if (!override) continue;
      const direct = elementen(override);
      if (direct.length !== 1 || !ns(direct[0], A))
        throw new NietBeschikbaar("invalid");
      if (
        direct[0].lokaal === "masterClrMapping" &&
        !elementen(direct[0]).length
      )
        mapping = masterMap;
      else if (direct[0].lokaal === "overrideClrMapping")
        mapping = kleurMap(direct[0]);
      else throw new NietBeschikbaar("invalid");
    }
    const kleur = kind(
      kind(kind(kind(dia, "cSld", P), "bg", P), "bgPr", P),
      "solidFill",
      A,
    );
    const schema = kind(kleur, "schemeClr", A),
      naam = attr(schema, "val");
    const gekozen =
      schema &&
      !elementen(schema).length &&
      THEMA_ACCENTEN.includes(naam as ThemaAccent)
        ? (naam as ThemaAccent)
        : undefined;
    return {
      beschikbaar: true,
      kleuren: Object.fromEntries(
        THEMA_ACCENTEN.map((k) => [k, kleuren![mapping[k]]]),
      ) as Record<ThemaAccent, string>,
      gekozen,
    };
  } catch (e) {
    return {
      beschikbaar: false,
      reden: e instanceof NietBeschikbaar ? e.reden : "invalid",
    };
  }
}

export function leesThemaAchtergrond(
  bytes: Uint8Array,
  index: number,
): ThemaAchtergrond {
  try {
    const p = new Pakket(bytes),
      presPad = relatie(p, "", "officeDocument", true)!;
    const root = leesXml(p.lees(presPad));
    if (
      root.lokaal !== "presentation" ||
      !ns(root, P) ||
      !Number.isSafeInteger(index) ||
      index < 0
    )
      throw new NietBeschikbaar("invalid");
    const dia = kinderen(kind(root, "sldIdLst", P), "sldId").filter((e) =>
      ns(e, P),
    )[index];
    if (!dia) throw new NietBeschikbaar("missing");
    const id = attrNs(dia, R, "id"),
      rels = p
        .relaties(presPad)
        .filter((r) => r.id === id && r.type === R + "/slide");
    if (rels.length !== 1 || rels[0].extern)
      throw new NietBeschikbaar("invalid");
    return leesThemaAchtergrondPakket(
      p,
      Pakket.doelPad(presPad, rels[0].target),
    );
  } catch (e) {
    return {
      beschikbaar: false,
      reden: e instanceof NietBeschikbaar ? e.reden : "invalid",
    };
  }
}
