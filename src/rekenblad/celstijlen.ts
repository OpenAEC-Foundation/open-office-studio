/** Named SpreadsheetML cell styles. Definitions and cell xf associations survive other editors. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  vervang,
  type XmlElement,
} from "../grafieken/xml";
import { ontleedAdres } from "../lint/rekenblad-logica";
import { gebied, NS, tagXml, werkmap, kindToevoegen } from "./werkboekXml";
import { zetBereikStijlen } from "./celStijlenXml";
import { leesBeveiliging } from "./beveiliging";

export class Stijlfout extends Error {
  constructor(
    public code:
      | "invalidName"
      | "duplicateName"
      | "missingStyle"
      | "damagedStyles"
      | "selectionTooLarge"
      | "invalidFormat"
      | "protectedSheet",
  ) {
    super(code);
  }
}
export interface StijlOpmaak {
  fontName: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  textColor: string;
  fillColor: string | null;
  numberFormat: string;
}
export interface CelStijl {
  naam: string;
  xfId: number | null;
  builtinId?: number;
  verborgen: boolean;
  opmaak: StijlOpmaak;
}
type Patch = Partial<StijlOpmaak>;
const basis: StijlOpmaak = {
  fontName: "Calibri",
  fontSize: 11,
  bold: false,
  italic: false,
  textColor: "#222222",
  fillColor: null,
  numberFormat: "General",
};
const ingebouwd = [
  {
    naam: "Good",
    id: 26,
    opmaak: { textColor: "#006100", fillColor: "#C6EFCE" },
  },
  {
    naam: "Bad",
    id: 27,
    opmaak: { textColor: "#9C0006", fillColor: "#FFC7CE" },
  },
  {
    naam: "Neutral",
    id: 28,
    opmaak: { textColor: "#9C6500", fillColor: "#FFEB9C" },
  },
  {
    naam: "Heading 1",
    id: 16,
    opmaak: { fontSize: 15, bold: true, textColor: "#1F497D" },
  },
  { naam: "Total", id: 25, opmaak: { bold: true, textColor: "#1F497D" } },
] as const;
const volgorde =
  "numFmts fonts fills borders cellStyleXfs cellXfs cellStyles dxfs tableStyles colors extLst".split(
    " ",
  );
const q = (el: XmlElement, naam: string) =>
  (el.voorvoegsel ? el.voorvoegsel + ":" : "") + naam;
const xlees = (s: string) =>
  s.replace(/_x([0-9a-f]{4})_/gi, (_, c: string) =>
    String.fromCharCode(parseInt(c, 16)),
  );
const xschrijf = (s: string) =>
  s.replace(/_x[0-9a-f]{4}_/gi, (s) => "_x005F_" + s.slice(1));
function stijlen(p: Pakket) {
  const wb = werkmap(p);
  const rel = p
    .relaties(wb.pad)
    .find((r) => !r.extern && r.type.endsWith("/styles"));
  let pad = rel ? Pakket.doelPad(wb.pad, rel.target) : null;
  if (!pad) {
    pad = p.vrijPad("xl/styles#.xml");
    p.voegRelatieToe(
      wb.pad,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
      pad,
    );
    p.voegOverrideToe(
      pad,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
    );
    p.schrijf(pad, `<styleSheet xmlns="${NS}"/>`);
  }
  if (leesXml(p.lees(pad)).lokaal !== "styleSheet")
    throw new Stijlfout("damagedStyles");
  return pad;
}
function groep(p: Pakket, pad: string, naam: string, fragment: string) {
  const xml = p.lees(pad),
    root = leesXml(xml),
    oud = kind(root, naam);
  const volgend = elementen(root).find(
    (e) => volgorde.indexOf(e.lokaal) > volgorde.indexOf(naam),
  );
  const pos = oud?.start ?? volgend?.start ?? root.inhoudEind;
  p.schrijf(
    pad,
    root.leeg
      ? tagXml(root, fragment)
      : vervang(xml, [{ start: pos, eind: oud?.eind ?? pos, tekst: fragment }]),
  );
}
function lijst(p: Pakket, pad: string, naam: string, kindnaam: string) {
  const xml = p.lees(pad),
    el = kind(leesXml(xml), naam);
  return { xml, el, items: kinderen(el, kindnaam) };
}
function schrijfLijst(
  p: Pakket,
  pad: string,
  naam: string,
  kindnaam: string,
  items: string[],
) {
  const xml = p.lees(pad),
    root = leesXml(xml),
    oud = kind(root, naam);
  const bestaande = kinderen(oud, kindnaam);
  const edits = bestaande.map((el, i) => ({
    start: el.start - (oud?.inhoudStart ?? 0),
    eind: el.eind - (oud?.inhoudStart ?? 0),
    tekst: items[i] ?? "",
  }));
  const pos = bestaande.at(-1)?.eind ?? oud?.inhoudStart ?? 0;
  if (items.length > bestaande.length)
    edits.push({
      start: pos - (oud?.inhoudStart ?? 0),
      eind: pos - (oud?.inhoudStart ?? 0),
      tekst: items.slice(bestaande.length).join(""),
    });
  const inhoud = oud
    ? vervang(xml.slice(oud.inhoudStart, oud.inhoudEind), edits)
    : items.join("");
  groep(
    p,
    pad,
    naam,
    `<${q(root, naam)}${attrTekst({ ...oud?.attrs, count: items.length })}>${inhoud}</${q(root, naam)}>`,
  );
}
function voegToe(
  p: Pakket,
  pad: string,
  naam: string,
  kindnaam: string,
  xml: string,
) {
  const l = lijst(p, pad, naam, kindnaam);
  const index = l.items.length;
  schrijfLijst(p, pad, naam, kindnaam, [
    ...l.items.map((e) => l.xml.slice(e.start, e.eind)),
    xml,
  ]);
  return index;
}
function vervangItem(
  p: Pakket,
  pad: string,
  naam: string,
  kindnaam: string,
  index: number,
  nieuw: string,
) {
  const l = lijst(p, pad, naam, kindnaam),
    el = l.items[index];
  if (!el) throw new Stijlfout("damagedStyles");
  p.schrijf(
    pad,
    vervang(l.xml, [{ start: el.start, eind: el.eind, tekst: nieuw }]),
  );
}
function grondslag(p: Pakket, pad: string) {
  const defaults: Record<string, string> = {
    fonts: '<font><sz val="11"/><name val="Calibri"/></font>',
    fills:
      '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>',
    borders: "<border/>",
    cellStyleXfs: '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>',
    cellXfs: '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    cellStyles: '<cellStyle name="Normal" xfId="0" builtinId="0"/>',
  };
  for (const [naam, inhoud] of Object.entries(defaults))
    if (!kind(leesXml(p.lees(pad)), naam))
      groep(
        p,
        pad,
        naam,
        `<${naam} xmlns="${NS}" count="${naam === "fills" ? 2 : 1}">${inhoud}</${naam}>`,
      );
}
function opmaak(p: Pakket, pad: string, xf: XmlElement): StijlOpmaak {
  const root = leesXml(p.lees(pad)),
    font = kinderen(kind(root, "fonts"), "font")[
      Number(attr(xf, "fontId") ?? 0)
    ],
    fill = kinderen(kind(root, "fills"), "fill")[
      Number(attr(xf, "fillId") ?? 0)
    ];
  const kleur = (el: XmlElement | null | undefined, fallback: string) => {
    const rgb = attr(el ?? null, "rgb");
    return rgb && /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rgb)
      ? "#" + rgb.slice(-6)
      : fallback;
  };
  const aan = (el: XmlElement | null | undefined) =>
    !!el && !/^(0|false)$/i.test(attr(el, "val") ?? "1");
  const num = Number(attr(xf, "numFmtId") ?? 0),
    fmt = kinderen(kind(root, "numFmts"), "numFmt").find(
      (e) => Number(attr(e, "numFmtId")) === num,
    );
  const patterns: Record<number, string> = {
    0: "General",
    1: "0",
    2: "0.00",
    3: "#,##0",
    4: "#,##0.00",
    9: "0%",
    10: "0.00%",
    14: "m/d/yyyy",
    49: "@",
  };
  const pattern = kind(fill, "patternFill");
  return {
    fontName: attr(kind(font, "name"), "val") ?? basis.fontName,
    fontSize: Number(attr(kind(font, "sz"), "val") ?? 11),
    bold: aan(kind(font, "b")),
    italic: aan(kind(font, "i")),
    textColor: kleur(kind(font, "color"), basis.textColor),
    fillColor:
      attr(pattern, "patternType") === "solid"
        ? kleur(kind(pattern, "fgColor"), "#FFFFFF")
        : null,
    numberFormat: attr(fmt, "formatCode") ?? patterns[num] ?? `builtin:${num}`,
  };
}
export function leesCelStijlen(bytes: Uint8Array | Pakket): CelStijl[] {
  const p = bytes instanceof Pakket ? bytes : new Pakket(bytes),
    pad = stijlen(p);
  grondslag(p, pad);
  const root = leesXml(p.lees(pad)),
    xfs = kinderen(kind(root, "cellStyleXfs"), "xf");
  const bron = kinderen(kind(root, "cellStyles"), "cellStyle").map((el) => {
    const xfId = Number(attr(el, "xfId")),
      xf = xfs[xfId];
    if (!xf) throw new Stijlfout("damagedStyles");
    return {
      naam: xlees(attr(el, "name") ?? ""),
      xfId,
      builtinId:
        attr(el, "builtinId") === undefined
          ? undefined
          : Number(attr(el, "builtinId")),
      verborgen: /^(1|true)$/.test(attr(el, "hidden") ?? ""),
      opmaak: opmaak(p, pad, xf),
    };
  });
  return [
    ...bron,
    ...ingebouwd
      .filter(
        (b) =>
          !bron.some(
            (s) =>
              s.builtinId === b.id ||
              s.naam.toLowerCase() === b.naam.toLowerCase(),
          ),
      )
      .map((b) => ({
        naam: b.naam,
        xfId: null,
        builtinId: b.id,
        verborgen: false,
        opmaak: { ...basis, ...b.opmaak },
      })),
  ];
}
function onderdeel(xml: string, naam: string, fragment: string) {
  const root = leesXml(xml),
    oud = kind(root, naam),
    ext = kind(root, "extLst");
  if (oud)
    return vervang(xml, [
      { start: oud.start, eind: oud.eind, tekst: fragment },
    ]);
  if (!fragment) return xml;
  return ext
    ? vervang(xml, [{ start: ext.start, eind: ext.start, tekst: fragment }])
    : kindToevoegen(xml, root, fragment);
}
function valideerPatch(patch: Patch) {
  if (
    (patch.fontSize !== undefined &&
      (!Number.isFinite(patch.fontSize) ||
        patch.fontSize < 1 ||
        patch.fontSize > 409)) ||
    (patch.fontName !== undefined &&
      (!patch.fontName.trim() || patch.fontName.length > 255)) ||
    [patch.textColor, patch.fillColor].some(
      (c) => c != null && !/^#[0-9a-f]{6}$/i.test(c),
    ) ||
    (patch.numberFormat !== undefined &&
      (!patch.numberFormat || patch.numberFormat.length > 1024))
  )
    throw new Stijlfout("invalidFormat");
}
function pasOpmaakToe(p: Pakket, pad: string, raw: string, patch: Patch) {
  valideerPatch(patch);
  const xf = leesXml(raw),
    attrs = { ...xf.attrs };
  if (
    [
      patch.fontName,
      patch.fontSize,
      patch.bold,
      patch.italic,
      patch.textColor,
    ].some((v) => v !== undefined)
  ) {
    const fonts = lijst(p, pad, "fonts", "font"),
      old = fonts.items[Number(attr(xf, "fontId") ?? 0)];
    let font = old
      ? fonts.xml.slice(old.start, old.eind)
      : `<font xmlns="${NS}"/>`;
    for (const [naam, v] of [
      ["name", patch.fontName],
      ["sz", patch.fontSize],
      ["b", patch.bold],
      ["i", patch.italic],
      ["color", patch.textColor],
    ] as const) {
      if (v === undefined) continue;
      const tag = q(leesXml(font), naam);
      const text =
        typeof v === "boolean"
          ? v
            ? `<${tag}/>`
            : ""
          : `<${tag}${attrTekst(naam === "color" ? { rgb: "FF" + String(v).slice(1).toUpperCase() } : { val: v })}/>`;
      font = onderdeel(font, naam, text);
    }
    attrs.fontId = String(voegToe(p, pad, "fonts", "font", font));
    attrs.applyFont = "1";
  }
  if (patch.fillColor !== undefined) {
    const fragment = patch.fillColor
      ? `<fill xmlns="${NS}"><patternFill patternType="solid"><fgColor rgb="FF${patch.fillColor.slice(1).toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`
      : `<fill xmlns="${NS}"><patternFill patternType="none"/></fill>`;
    attrs.fillId = String(voegToe(p, pad, "fills", "fill", fragment));
    attrs.applyFill = "1";
  }
  if (patch.numberFormat !== undefined) {
    const builtins: Record<string, number> = {
      General: 0,
      "0": 1,
      "0.00": 2,
      "#,##0": 3,
      "#,##0.00": 4,
      "0%": 9,
      "0.00%": 10,
      "@": 49,
    };
    let id = builtins[patch.numberFormat];
    if (id === undefined) {
      const l = lijst(p, pad, "numFmts", "numFmt"),
        old = l.items.find((e) => attr(e, "formatCode") === patch.numberFormat);
      id = old
        ? Number(attr(old, "numFmtId"))
        : Math.max(163, ...l.items.map((e) => Number(attr(e, "numFmtId")))) + 1;
      if (!Number.isFinite(id) || id > 65535)
        throw new Stijlfout("invalidFormat");
      if (!old)
        voegToe(
          p,
          pad,
          "numFmts",
          "numFmt",
          `<numFmt xmlns="${NS}"${attrTekst({ numFmtId: id, formatCode: patch.numberFormat })}/>`,
        );
    }
    attrs.numFmtId = String(id);
    attrs.applyNumberFormat = "1";
  }
  return tagXml(xf, raw.slice(xf.inhoudStart, xf.inhoudEind), attrs);
}
function controleerNaam(naam: string, p: Pakket) {
  if (!naam.trim() || naam.length > 255 || /[\u0000-\u001f]/.test(naam))
    throw new Stijlfout("invalidName");
  if (
    leesCelStijlen(p).some(
      (s) => s.xfId !== null && s.naam.toLowerCase() === naam.toLowerCase(),
    )
  )
    throw new Stijlfout("duplicateName");
}
function nieuweStijl(
  p: Pakket,
  pad: string,
  naam: string,
  base: string,
  patch: Patch,
  builtinId?: number,
) {
  controleerNaam(naam, p);
  let raw = pasOpmaakToe(p, pad, base, patch);
  const xf = leesXml(raw),
    attrs = { ...xf.attrs };
  delete attrs.xfId;
  delete attrs.quotePrefix;
  delete attrs.pivotButton;
  raw = tagXml(xf, raw.slice(xf.inhoudStart, xf.inhoudEind), attrs);
  const id = voegToe(p, pad, "cellStyleXfs", "xf", raw);
  voegToe(
    p,
    pad,
    "cellStyles",
    "cellStyle",
    `<cellStyle xmlns="${NS}"${attrTekst({ name: xschrijf(naam), xfId: id, ...(builtinId === undefined ? {} : { builtinId }) })}/>`,
  );
  return id;
}
function vindStijl(p: Pakket, pad: string, naam: string) {
  const stijl = leesCelStijlen(p).find((s) => s.naam === naam);
  if (!stijl) throw new Stijlfout("missingStyle");
  if (stijl.xfId !== null) return stijl.xfId;
  const b = ingebouwd.find((b) => b.id === stijl.builtinId)!;
  const l = lijst(p, pad, "cellStyleXfs", "xf"),
    base = l.items[0];
  if (!base) throw new Stijlfout("damagedStyles");
  const id = nieuweStijl(
    p,
    pad,
    b.naam,
    l.xml.slice(base.start, base.eind),
    b.opmaak,
    b.id,
  );
  if (b.id === 25) {
    const border = voegToe(
      p,
      pad,
      "borders",
      "border",
      `<border xmlns="${NS}"><top style="thin"><color rgb="FF4472C4"/></top><bottom style="double"><color rgb="FF4472C4"/></bottom></border>`,
    );
    const l = lijst(p, pad, "cellStyleXfs", "xf"),
      xf = l.items[id];
    vervangItem(
      p,
      pad,
      "cellStyleXfs",
      "xf",
      id,
      tagXml(xf, l.xml.slice(xf.inhoudStart, xf.inhoudEind), {
        ...xf.attrs,
        borderId: String(border),
        applyBorder: "1",
      }),
    );
  }
  return id;
}
export function maakCelStijl(
  bytes: Uint8Array,
  naam: string,
  blad: number,
  cel: string,
  patch: Patch = {},
) {
  const p = new Pakket(bytes),
    pad = stijlen(p);
  grondslag(p, pad);
  const ws = werkmap(p).bladen[blad];
  if (!ws) throw new Stijlfout("damagedStyles");
  const loc = ontleedAdres(cel);
  if (!loc) throw new Stijlfout("damagedStyles");
  const sheet = leesXml(p.lees(ws.pad)),
    row = kinderen(kind(sheet, "sheetData"), "row").find(
      (r) => Number(attr(r, "r")) === loc.row + 1,
    ),
    c = kinderen(row, "c").find(
      (c) => attr(c, "r")?.toUpperCase() === cel.toUpperCase(),
    );
  const cols = kinderen(kind(sheet, "cols"), "col").find(
    (c) =>
      Number(attr(c, "min")) <= loc.col + 1 &&
      Number(attr(c, "max")) >= loc.col + 1,
  );
  const id = Number(attr(c, "s") ?? attr(row, "s") ?? attr(cols, "style") ?? 0),
    l = lijst(p, pad, "cellXfs", "xf"),
    xf = l.items[id];
  if (!xf) throw new Stijlfout("damagedStyles");
  nieuweStijl(p, pad, naam, l.xml.slice(xf.start, xf.eind), patch);
  return p.inpakken();
}
export function pasCelStijlToe(
  bytes: Uint8Array,
  naam: string,
  blad: number,
  ref: string,
) {
  const beveiliging = leesBeveiliging(bytes).bladen[blad];
  if (!beveiliging || (beveiliging.actief && !beveiliging.rechten.formatCells))
    throw new Stijlfout("protectedSheet");
  const p = new Pakket(bytes),
    pad = stijlen(p);
  grondslag(p, pad);
  const id = vindStijl(p, pad, naam);
  const l = lijst(p, pad, "cellStyleXfs", "xf"),
    stijl = l.items[id],
    raw = l.xml.slice(stijl.start, stijl.eind),
    base = leesXml(raw);
  const xs = lijst(p, pad, "cellXfs", "xf"),
    styleXfs = lijst(p, pad, "cellStyleXfs", "xf"),
    cache = new Map<number, number>();
  const b = gebied(ref);
  try {
    zetBereikStijlen(p, werkmap(p).bladen[blad].pad, b, (row, col, oud) => {
      if (cache.has(oud)) return cache.get(oud)!;
      const old = xs.items[oud];
      if (!old) throw new Stijlfout("damagedStyles");
      const parent = styleXfs.items[Number(attr(old, "xfId") ?? 0)],
        prot = kind(old, "protection") ?? kind(parent, "protection");
      const protXml = prot
        ? xs.xml.slice(prot.start, prot.eind)
        : `<protection xmlns="${NS}" locked="1" hidden="0"/>`;
      let inhoud = raw.slice(base.inhoudStart, base.inhoudEind);
      const ownProt = kind(base, "protection");
      if (ownProt)
        inhoud = vervang(inhoud, [
          {
            start: ownProt.start - base.inhoudStart,
            eind: ownProt.eind - base.inhoudStart,
            tekst: "",
          },
        ]);
      const fragment = tagXml(base, inhoud + protXml, {
        ...old.attrs,
        ...base.attrs,
        xfId: String(id),
        applyFont: "1",
        applyFill: "1",
        applyBorder: "1",
        applyNumberFormat: "1",
        applyAlignment: "1",
        applyProtection: "1",
        quotePrefix: old.attrs.quotePrefix ?? "0",
        pivotButton: old.attrs.pivotButton ?? "0",
      });
      const next = voegToe(p, pad, "cellXfs", "xf", fragment);
      cache.set(oud, next);
      void row;
      void col;
      return next;
    });
  } catch (f) {
    if (f instanceof Error && f.message === "selectionTooLarge")
      throw new Stijlfout("selectionTooLarge");
    throw f;
  }
  return p.inpakken();
}
export function wijzigCelStijl(bytes: Uint8Array, naam: string, patch: Patch) {
  const p = new Pakket(bytes),
    pad = stijlen(p);
  grondslag(p, pad);
  const id = vindStijl(p, pad, naam);
  const l = lijst(p, pad, "cellStyleXfs", "xf"),
    old = l.items[id],
    raw = l.xml.slice(old.start, old.eind),
    nieuw = pasOpmaakToe(p, pad, raw, patch),
    xf = leesXml(nieuw);
  // Updating a style propagates only facets still inherited from its old definition.
  const xs = lijst(p, pad, "cellXfs", "xf"),
    changed = new Set<number>();
  xs.items.forEach((c, i) => {
    if (Number(attr(c, "xfId") ?? 0) !== id) return;
    const attrs = { ...c.attrs };
    for (const key of ["fontId", "fillId", "numFmtId"]) {
      if (attrs[key] === old.attrs[key]) {
        attrs[key] = xf.attrs[key];
        if (attrs[key] !== c.attrs[key]) changed.add(i);
      }
    }
    if (changed.has(i))
      vervangItem(
        p,
        pad,
        "cellXfs",
        "xf",
        i,
        tagXml(c, xs.xml.slice(c.inhoudStart, c.inhoudEind), attrs),
      );
  });
  if (changed.size) {
    const wb = werkmap(p),
      beveiliging = leesBeveiliging(bytes);
    for (let i = 0; i < wb.bladen.length; i++)
      if (
        beveiliging.bladen[i].actief &&
        !beveiliging.bladen[i].rechten.formatCells
      ) {
        const ws = leesXml(p.lees(wb.bladen[i].pad));
        if (
          changed.has(0) ||
          kinderen(kind(ws, "cols"), "col").some((c) =>
            changed.has(Number(attr(c, "style") ?? 0)),
          ) ||
          kinderen(kind(ws, "sheetData"), "row").some(
            (r) =>
              changed.has(Number(attr(r, "s") ?? 0)) ||
              kinderen(r, "c").some((c) =>
                changed.has(Number(attr(c, "s") ?? 0)),
              ),
          )
        )
          throw new Stijlfout("protectedSheet");
      }
  }
  vervangItem(p, pad, "cellStyleXfs", "xf", id, nieuw);
  const styles = lijst(p, pad, "cellStyles", "cellStyle"),
    el = styles.items.find((e) => Number(attr(e, "xfId")) === id);
  if (el && attr(el, "builtinId") !== undefined)
    p.schrijf(
      pad,
      vervang(styles.xml, [
        {
          start: el.start,
          eind: el.eind,
          tekst: tagXml(el, styles.xml.slice(el.inhoudStart, el.inhoudEind), {
            ...el.attrs,
            customBuiltin: "1",
          }),
        },
      ]),
    );
  return p.inpakken();
}
