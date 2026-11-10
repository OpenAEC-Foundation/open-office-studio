import { attr, elementen, kind, leesXml, ontsnap, tekstVan, type XmlElement } from "../../grafieken/xml";

/** Convert OMML presentation structures to inert MathML for the renderer. */
export function mathmlUitOmml(xml: string, display = false): string {
  if (xml.length > 2_000_000) throw new Error("math.invalid");
  let aantal = 0;
  const root = leesXml(xml);
  function bouw(e: XmlElement, depth = 0): string {
    if (depth > 64 || ++aantal > 20000) throw new Error("math.invalid");
    const nodes = (naam?: string) => elementen(e).filter(x => !x.lokaal.endsWith("Pr") && (!naam || x.lokaal === naam));
    const children = () => nodes().map(x => bouw(x, depth + 1)).join("");
    const arg = (naam: string) => { const x = kind(e, naam); return `<mrow>${x ? bouw(x, depth + 1) : ""}</mrow>`; };
    const prop = (name: string, fallback = "") => attr(kind(kind(e, `${e.lokaal}Pr`), name), "val") ?? fallback;
    switch (e.lokaal) {
      case "oMathPara": case "oMath": case "e": case "num": case "den": case "deg": case "sub": case "sup": case "lim": case "fName": return `<mrow>${children()}</mrow>`;
      case "r": {
        const pr = kind(e, "rPr"), sty = attr(kind(pr, "sty"), "val");
        const variant = kind(pr, "nor") || sty === "p" ? "normal" : sty === "b" ? "bold" : sty === "bi" ? "bold-italic" : "italic";
        return `<mstyle mathvariant="${variant}">${nodes("t").map(x => bouw(x, depth + 1)).join("")}</mstyle>`;
      }
      case "t": return (tekstVan(e).match(/\s+|[\p{L}\p{M}]+|[\p{N}.]+|[^\p{L}\p{M}\p{N}\s.]/gu) ?? []).map(t => /^\s+$/.test(t) ? '<mspace width="0.25em"/>' : `<${/^\p{N}/u.test(t) ? "mn" : /^[\p{L}\p{M}]/u.test(t) ? "mi" : "mo"}>${ontsnap(t)}</${/^\p{N}/u.test(t) ? "mn" : /^[\p{L}\p{M}]/u.test(t) ? "mi" : "mo"}>`).join("");
      case "f": return `<mfrac${prop("type") === "noBar" ? ' linethickness="0"' : prop("type") === "skw" ? ' bevelled="true"' : ""}>${arg("num")}${arg("den")}</mfrac>`;
      case "sSup": return `<msup>${arg("e")}${arg("sup")}</msup>`;
      case "sSub": return `<msub>${arg("e")}${arg("sub")}</msub>`;
      case "sSubSup": return `<msubsup>${arg("e")}${arg("sub")}${arg("sup")}</msubsup>`;
      case "sPre": return `<mmultiscripts>${arg("e")}<none/><none/><mprescripts/>${arg("sub")}${arg("sup")}</mmultiscripts>`;
      case "rad": return prop("degHide") === "1" || !kind(e, "deg") || !tekstVan(kind(e, "deg")!).trim() ? `<msqrt>${arg("e")}</msqrt>` : `<mroot>${arg("e")}${arg("deg")}</mroot>`;
      case "nary": {
        const chr = prop("chr", "∫"), tag = prop("limLoc", chr === "∫" ? "subSup" : "undOvr") === "undOvr" ? "munderover" : "msubsup";
        return `<mrow><${tag}><mo largeop="true">${ontsnap(chr)}</mo>${prop("subHide") === "1" ? "<mrow/>" : arg("sub")}${prop("supHide") === "1" ? "<mrow/>" : arg("sup")}</${tag}>${arg("e")}</mrow>`;
      }
      case "m": return `<mtable>${nodes("mr").map(r => `<mtr>${elementen(r).filter(c => c.lokaal === "e").map(c => `<mtd>${bouw(c, depth + 1)}</mtd>`).join("")}</mtr>`).join("")}</mtable>`;
      case "eqArr": return `<mtable columnalign="left">${nodes("e").map(c => `<mtr><mtd>${bouw(c, depth + 1)}</mtd></mtr>`).join("")}</mtable>`;
      case "d": return `<mrow><mo fence="true">${ontsnap(prop("begChr", "("))}</mo>${nodes("e").map(c => bouw(c, depth + 1)).join(`<mo separator="true">${ontsnap(prop("sepChr", "|"))}</mo>`)}<mo fence="true">${ontsnap(prop("endChr", ")"))}</mo></mrow>`;
      case "func": return `<mrow><mstyle mathvariant="normal">${arg("fName")}</mstyle><mo>⁡</mo>${arg("e")}</mrow>`;
      case "limLow": return `<munder>${arg("e")}${arg("lim")}</munder>`;
      case "limUpp": return `<mover>${arg("e")}${arg("lim")}</mover>`;
      case "acc": return `<mover accent="true">${arg("e")}<mo>${ontsnap(prop("chr", "̂"))}</mo></mover>`;
      case "bar": return prop("pos", "top") === "bot" ? `<munder accentunder="true">${arg("e")}<mo>_</mo></munder>` : `<mover accent="true">${arg("e")}<mo>¯</mo></mover>`;
      case "groupChr": return prop("pos", "bot") === "bot" ? `<munder>${arg("e")}<mo>${ontsnap(prop("chr", "⏟"))}</mo></munder>` : `<mover>${arg("e")}<mo>${ontsnap(prop("chr", "⏞"))}</mo></mover>`;
      case "borderBox": return `<menclose notation="box">${arg("e")}</menclose>`;
      case "phant": return `<mphantom>${arg("e")}</mphantom>`;
      case "box": return arg("e");
      default: return e.lokaal.endsWith("Pr") ? "" : `<mrow>${children()}</mrow>`;
    }
  }
  if (!["oMath", "oMathPara"].includes(root.lokaal)) throw new Error("math.invalid");
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${display ? "block" : "inline"}">${bouw(root)}</math>`;
}
