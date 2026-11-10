/** Read-only render facets of imported differential styles; never author or rewrite them. */
import type { ConditionalFormatInfo, DrawCmd } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  elementen,
  kind,
  kinderen,
  leesXml,
  tekstVan,
  type XmlElement,
} from "../grafieken/xml";
import { kleurTint } from "./kleurtint";

type Lijn = Extract<DrawCmd, { op: "line" }>;
export const RANDEN = ["left", "right", "top", "bottom"] as const;
export interface DxfRand {
  color: string;
  width: number;
  style?: Lijn["style"];
  priority?: number;
}
type BasisStijl = ConditionalFormatInfo["format"];
export interface DxfStijl extends BasisStijl {
  underline?: boolean;
  strike?: boolean;
  numFmt?: string;
  borders?: Partial<Record<(typeof RANDEN)[number], DxfRand>>;
}
const themaNamen =
  "lt1 dk1 lt2 dk2 accent1 accent2 accent3 accent4 accent5 accent6 hlink folHlink".split(
    " ",
  );
const basis =
  "ffffff 000000 e7e6e6 44546a 4472c4 ed7d31 a5a5a5 ffc000 5b9bd5 70ad47 0563c1 954f72".split(
    " ",
  );
const palet =
  "000000 ffffff ff0000 00ff00 0000ff ffff00 ff00ff 00ffff 000000 ffffff ff0000 00ff00 0000ff ffff00 ff00ff 00ffff 800000 008000 000080 808000 800080 008080 c0c0c0 808080 9999ff 993366 ffffcc ccffff 660066 ff8080 0066cc ccccff 000080 ff00ff ffff00 00ffff 800080 800000 008080 0000ff 00ccff ccffff ccffcc ffff99 99ccff ff99cc cc99ff ffcc99 3366ff 33cccc 99cc00 ffcc00 ff9900 ff6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333".split(
    " ",
  );
const ingebouwd: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  5: '"$"#,##0_);("$"#,##0)',
  6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)',
  8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "m/d/yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)',
  42: '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)',
  44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};
/** Resolve actual workbook theme and custom indexed palette, including HSL tint. */
function kleuren(p: Pakket, werkmap: string, styles: XmlElement) {
  const rel = p
    .relaties(werkmap)
    .find((r) => !r.extern && r.type.endsWith("/theme"));
  const scheme =
    rel &&
    kind(
      kind(
        leesXml(p.lees(Pakket.doelPad(werkmap, rel.target))),
        "themeElements",
      ),
      "clrScheme",
    );
  const thema = themaNamen.map((naam, i) => {
    const c = kind(scheme, naam),
      v = c && elementen(c)[0];
    return (v && (attr(v, "lastClr") ?? attr(v, "val"))) ?? basis[i];
  });
  const index = kinderen(
    kind(kind(styles, "colors"), "indexedColors"),
    "rgbColor",
  ).map((c) => attr(c, "rgb"));
  return (
    node: XmlElement | null | undefined,
    auto: string,
  ): string | undefined => {
    if (!node) return undefined;
    if (["1", "true"].includes(attr(node, "auto") ?? "")) return auto;
    const rgb = attr(node, "rgb"),
      t = attr(node, "theme"),
      i = attr(node, "indexed");
    const hex =
      rgb ??
      (t !== undefined
        ? thema[Number(t)]
        : i !== undefined
          ? ((index.length ? index[Number(i)] : palet[Number(i)]) ??
            (i === "64" ? "000000" : i === "65" ? "ffffff" : undefined))
          : undefined);
    if (!hex || !/^(?:[a-f\d]{6}|[a-f\d]{8})$/i.test(hex)) return undefined;
    const tint = Number(attr(node, "tint") ?? 0);
    return kleurTint(hex.slice(-6), Number.isFinite(tint) ? tint : 0);
  };
}
export function leesDxfStijlen(
  p: Pakket,
  werkmap: string,
  styles: XmlElement,
): DxfStijl[] {
  const localeNaam = kinderen(
    kind(leesXml(p.lees(werkmap)), "definedNames"),
    "definedName",
  ).find(
    (n) =>
      attr(n, "name")?.toLowerCase() === "_openaec_numberlocale" &&
      attr(n, "localSheetId") === undefined,
  );
  const locale =
    localeNaam &&
    /^"([a-z]{2}[-_][a-z]{2})"$/i
      .exec(tekstVan(localeNaam))?.[1]
      .replace("_", "-")
      .toLowerCase();
  const korteDatum =
    locale &&
    [
      "nl-nl",
      "en-gb",
      "en-us",
      "de-de",
      "fr-fr",
      "es-es",
      "it-it",
      "pt-br",
      "zh-cn",
      "lo-la",
    ].includes(locale)
      ? ({
          "nl-nl": "dd-mm-yyyy",
          "de-de": "dd.mm.yyyy",
          "en-us": "mm/dd/yyyy",
          "zh-cn": "yyyy/mm/dd",
        }[locale] ?? "dd/mm/yyyy")
      : undefined;
  const kleur = kleuren(p, werkmap, styles),
    nummers = new Map(
      kinderen(kind(styles, "numFmts"), "numFmt").map((n) => [
        Number(attr(n, "numFmtId")),
        attr(n, "formatCode"),
      ]),
    );
  const vlag = (node: XmlElement | null) =>
    node
      ? !["0", "false", "none"].includes(attr(node, "val") ?? "1")
      : undefined;
  return kinderen(kind(styles, "dxfs"), "dxf").map((dxf) => {
    const font = kind(dxf, "font"),
      pattern = kind(kind(dxf, "fill"), "patternFill"),
      numFmt = kind(dxf, "numFmt"),
      stijl: DxfStijl = {};
    const zet = <K extends keyof DxfStijl>(key: K, value: DxfStijl[K]) => {
      if (value !== undefined) stijl[key] = value;
    };
    zet("fontColor", kleur(kind(font, "color"), "#000000"));
    zet("bold", vlag(kind(font, "b")));
    zet("italic", vlag(kind(font, "i")));
    zet("underline", vlag(kind(font, "u")));
    zet("strike", vlag(kind(font, "strike")));
    if (attr(pattern, "patternType") === "solid")
      zet("fill", kleur(kind(pattern, "fgColor"), "#000000"));
    if (numFmt) {
      const id = Number(attr(numFmt, "numFmtId"));
      zet(
        "numFmt",
        attr(numFmt, "formatCode") ??
          nummers.get(id) ??
          (korteDatum && [14, 22].includes(id)
            ? korteDatum + (id === 22 ? " h:mm" : "")
            : ingebouwd[id]),
      );
    }
    const borders: DxfStijl["borders"] = {};
    for (const kant of RANDEN) {
      const edge = kind(kind(dxf, "border"), kant),
        style = attr(edge, "style");
      if (
        !style ||
        ![
          "thin",
          "medium",
          "thick",
          "hair",
          "dashed",
          "dotted",
          "double",
          "mediumDashed",
          "dashDot",
          "mediumDashDot",
          "dashDotDot",
          "mediumDashDotDot",
          "slantDashDot",
        ].includes(style)
      )
        continue;
      const width =
        style === "medium" || style.startsWith("medium")
          ? 2
          : ["thick", "double"].includes(style)
            ? 3
            : 1;
      const dash: Lijn["style"] =
        style === "hair"
          ? "dotted"
          : ["thin", "medium", "thick"].includes(style)
            ? undefined
            : (style as Lijn["style"]);
      borders[kant] = {
        color: kleur(kind(edge, "color"), "#000000") ?? "#000000",
        width,
        ...(dash ? { style: dash } : {}),
      };
    }
    if (Object.keys(borders).length) stijl.borders = borders;
    return stijl;
  });
}
