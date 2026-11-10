import type {
  CapturedCellFormat,
  CapturedColor,
  CapturedFill,
  CapturedFormat,
} from "@betteroffice/xlsx";
import { attr, kind, kinderen, type XmlElement } from "../grafieken/xml";

function kleur(node: XmlElement | null): CapturedColor | null {
  if (!node) return null;
  const rgb = attr(node, "rgb"),
    theme = attr(node, "theme"),
    indexed = attr(node, "indexed");
  if (rgb !== undefined)
    return /^(?:[a-f\d]{6}|[a-f\d]{8})$/i.test(rgb.trim())
      ? { Rgb: rgb.trim() }
      : null;
  if (theme !== undefined)
    return {
      Theme: { idx: Number(theme), tint: Number(attr(node, "tint") ?? 0) },
    };
  if (indexed !== undefined) return { Indexed: Number(indexed) };
  return attr(node, "auto") === "1" ? "Auto" : null;
}
function kleursleutel(color: CapturedColor | null | undefined): unknown {
  if (color == null || color === "Auto") return color ?? null;
  if ("Rgb" in color)
    return ["rgb", color.Rgb.replace(/^#/, "").slice(-6).toLowerCase()];
  if ("Theme" in color) return ["theme", color.Theme.idx, color.Theme.tint];
  return ["indexed", color.Indexed];
}
function fontsleutel(font: CapturedCellFormat["font"]): string {
  return JSON.stringify([
    font.name ?? null,
    font.size_pt ?? null,
    !!font.bold,
    !!font.italic,
    !!font.underline,
    !!font.strike,
    kleursleutel(font.color),
  ]);
}
function vulsleutel(fill: CapturedFill): string {
  if (typeof fill === "string") return fill;
  return JSON.stringify(
    "Solid" in fill
      ? ["solid", kleursleutel(fill.Solid)]
      : [
          "pattern",
          fill.Pattern.pattern,
          kleursleutel(fill.Pattern.fg),
          kleursleutel(fill.Pattern.bg),
        ],
  );
}
function bronfont(node: XmlElement | undefined): CapturedCellFormat["font"] {
  const vlag = (name: string) => {
    const child = kind(node, name);
    return !!child && /^(1|true|on)$/.test(attr(child, "val") ?? "1");
  };
  return {
    name: attr(kind(node, "name"), "val") ?? null,
    size_pt: kind(node, "sz") ? Number(attr(kind(node, "sz"), "val")) : null,
    bold: vlag("b"),
    italic: vlag("i"),
    underline: vlag("u"),
    strike: vlag("strike"),
    color: kleur(kind(node, "color")),
  };
}
function bronvulling(node: XmlElement | undefined): CapturedFill | undefined {
  const pattern = kind(node, "patternFill"),
    type = attr(pattern, "patternType");
  if (kind(node, "gradientFill")) return undefined;
  if (!pattern || type === "none") {
    const foreground = kleur(kind(pattern, "fgColor"));
    return foreground ? { Solid: foreground } : "None";
  }
  // The pinned core resolves an untyped patternFill to a solid automatic fill.
  if (type === undefined || type === "solid")
    return { Solid: kleur(kind(pattern, "fgColor")) ?? "Auto" };
  const patterns = new Set([
    "gray125",
    "gray0625",
    "mediumGray",
    "darkGray",
    "lightGray",
    "darkHorizontal",
    "darkVertical",
    "darkDown",
    "darkUp",
    "darkGrid",
    "darkTrellis",
    "lightHorizontal",
    "lightVertical",
    "lightDown",
    "lightUp",
    "lightGrid",
    "lightTrellis",
  ]);
  if (patterns.has(type))
    return {
      Pattern: {
        pattern: type as Extract<
          CapturedFill,
          { Pattern: unknown }
        >["Pattern"]["pattern"],
        fg: kleur(kind(pattern, "fgColor")),
        bg: kleur(kind(pattern, "bgColor")),
      },
    };
  // An unrecognised default fill stays authoritative; do not cover it with a table fill.
  return undefined;
}

/** Compare live effective facets as well as explicit XFs; no worksheet scan or mutation. */
export function tabelopmaakVoorrang(root: XmlElement) {
  const xfs = kinderen(kind(root, "cellXfs"), "xf");
  const fonts = kinderen(kind(root, "fonts"), "font"),
    fills = kinderen(kind(root, "fills"), "fill");
  const fallback = xfs[0];
  const applied = (xf: XmlElement | undefined, name: string) =>
    /^(1|true|on)$/.test(attr(xf, name) ?? "1");
  const defaultFont = fontsleutel(
    bronfont(
      applied(fallback, "applyFont")
        ? fonts[Number(attr(fallback, "fontId") ?? 0)]
        : undefined,
    ),
  );
  const defaultFill = applied(fallback, "applyFill")
    ? bronvulling(fills[Number(attr(fallback, "fillId") ?? 0)])
    : "None";
  const defaultFillKey =
    defaultFill === undefined ? undefined : vulsleutel(defaultFill);
  return (captured: CapturedFormat, index: number) => {
    const id = captured.sourceStyles?.[index];
    // Missing provenance is different from an explicitly reported implicit/default cell.
    if (id === undefined) return null;
    const xf = xfs[id ?? 0];
    if (!xf) return null;
    let font = Number(attr(xf, "fontId") ?? 0) > 0 && applied(xf, "applyFont");
    let fill = Number(attr(xf, "fillId") ?? 0) > 0 && applied(xf, "applyFill");
    if (id === null) {
      const effective = captured.formats[index] as
        | CapturedCellFormat
        | undefined;
      if (!effective?.font || effective.fill === undefined) return null;
      font ||= fontsleutel(effective.font) !== defaultFont;
      fill ||=
        defaultFillKey === undefined ||
        vulsleutel(effective.fill) !== defaultFillKey;
    }
    return { font, fill };
  };
}
