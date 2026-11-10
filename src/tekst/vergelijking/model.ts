import { attr, ontsnap, leesXml, elementen, kind, tekstVan, type XmlElement } from "../../grafieken/xml";

export type Formule = { soort: "tekst"; tekst: string } | { soort: "rij"; delen: Formule[] }
  | { soort: "frac" | "sup" | "sub" | "root"; a: Formule; b: Formule }
  | { soort: "sqrt"; a: Formule }
  | { soort: "subsup" | "sum" | "int" | "prod"; a: Formule; b: Formule; c: Formule }
  | { soort: "matrix"; rijen: Formule[][] };

/** Eerste lineaire invoer: gewone wiskundige tekst en geneste functieblokken. */
export function leesFormule(bron: string): Formule {
  if (!bron.trim() || bron.length > 2048) throw new Error("Geef een formule van 1 tot 2048 tekens.");
  let index = 0, aantal = 0;
  function rij(diepte: number, einde = false): Formule {
    if (diepte > 32 || ++aantal > 512) throw new Error("De formule is te diep genest.");
    const delen: Formule[] = [];
    let tekst = "", haakjes = 0;
    const klaar = () => { if (tekst) delen.push({ soort: "tekst", tekst }); tekst = ""; };
    while (index < bron.length) {
      if (einde && !haakjes && /[,);]/.test(bron[index])) break;
      const functie = index > 0 && /[\p{L}\p{N}_]/u.test(bron[index - 1]) ? null : /^(frac|sup|subsup|sub|root|sum|int|prod|sqrt|matrix)\(/.exec(bron.slice(index));
      if (!functie) {
        if (bron[index] === "(") haakjes++;
        if (bron[index] === ")" && --haakjes < 0) throw new Error("Een openingshaakje ontbreekt.");
        tekst += bron[index++]; continue;
      }
      klaar(); index += functie[0].length;
      if (functie[1] === "matrix") {
        const rijen: Formule[][] = [[]];
        for (;;) {
          const cel = rij(diepte + 1, true);
          if (cel.soort === "rij" && !cel.delen.length) throw new Error("Een matrixcel is leeg.");
          rijen.at(-1)!.push(cel);
          const sep = bron[index++];
          if (sep === ")") break;
          if (sep === ";") rijen.push([]); else if (sep !== ",") throw new Error("Een sluithaakje ontbreekt.");
          if (rijen.length > 12 || rijen.at(-1)!.length > 12) throw new Error("De matrix is te groot.");
        }
        if (rijen.some(r => r.length !== rijen[0].length)) throw new Error("De matrixrijen hebben niet evenveel kolommen.");
        delen.push({ soort: "matrix", rijen }); continue;
      }
      const a = rij(diepte + 1, true);
      if (a.soort === "rij" && !a.delen.length) throw new Error("Een formuleargument is leeg.");
      if (functie[1] === "sqrt") {
        if (bron[index++] !== ")") throw new Error("sqrt verwacht één argument tussen haakjes.");
        delen.push({ soort: "sqrt", a });
      } else {
        if (bron[index++] !== ",") throw new Error("Gebruik twee argumenten, gescheiden door een komma.");
        const b = rij(diepte + 1, true);
        if (b.soort === "rij" && !b.delen.length) throw new Error("Een formuleargument is leeg.");
        if (["subsup", "sum", "int", "prod"].includes(functie[1])) {
          if (bron[index++] !== ",") throw new Error("Gebruik drie argumenten, gescheiden door komma's.");
          const c = rij(diepte + 1, true);
          if (c.soort === "rij" && !c.delen.length) throw new Error("Een formuleargument is leeg.");
          delen.push({ soort: functie[1] as "subsup" | "sum" | "int" | "prod", a, b, c });
        } else delen.push({ soort: functie[1] as "frac" | "sup" | "sub" | "root", a, b });
        if (bron[index++] !== ")") throw new Error("Een sluithaakje ontbreekt.");
      }
    }
    if (haakjes) throw new Error("Een sluithaakje ontbreekt.");
    klaar();
    return { soort: "rij", delen };
  }
  return rij(0);
}

/** Lees alleen ondersteunde structuren; onbekende OMML wordt nooit platgemaakt. */
export function lineairUitOmml(xml: string): string {
  function lees(el: XmlElement, diepte = 0): string {
    if (diepte > 32) throw new Error("unsupported");
    const inhoud = () => elementen(el).map(e => lees(e, diepte + 1)).join("");
    const argument = (naam: string) => {
      const k = kind(el, naam);
      if (!k) throw new Error("unsupported");
      return lees(k, diepte + 1);
    };
    const toegelaten: Record<string, string[]> = { f: ["fPr", "num", "den"], sSup: ["sSupPr", "e", "sup"], sSub: ["sSubPr", "e", "sub"], rad: ["radPr", "deg", "e"] };
    if (toegelaten[el.lokaal] && elementen(el).some(e => !toegelaten[el.lokaal].includes(e.lokaal))) throw new Error("unsupported");
    switch (el.lokaal) {
      case "oMath": case "oMathPara": case "num": case "den": case "e": case "sup": case "sub": case "deg": return inhoud();
      case "oMathParaPr": case "fPr": case "sSupPr": case "sSubPr": case "sSubSupPr": case "radPr": case "mPr": return "";
      case "t": return tekstVan(el);
      case "r": {
        if (elementen(el).some(e => !["t", "rPr"].includes(e.lokaal))) throw new Error("unsupported");
        return elementen(el).filter(e => e.lokaal === "t").map(tekstVan).join("");
      }
      case "f": return `frac(${argument("num")},${argument("den")})`;
      case "sSup": return `sup(${argument("e")},${argument("sup")})`;
      case "sSub": return `sub(${argument("e")},${argument("sub")})`;
      case "sSubSup": return `subsup(${argument("e")},${argument("sub")},${argument("sup")})`;
      case "rad": {
        const deg = kind(el, "deg");
        if (deg && tekstVan(deg)) return `root(${argument("deg")},${argument("e")})`;
        return `sqrt(${argument("e")})`;
      }
      case "nary": {
        const chr = attr(kind(kind(el, "naryPr"), "chr"), "val") ?? "∫";
        const type = ({ "∑": "sum", "∫": "int", "∏": "prod" } as Record<string, string>)[chr];
        if (!type || !kind(el, "sub") || !kind(el, "sup")) throw new Error("unsupported");
        return `${type}(${argument("sub") || " "},${argument("sup") || " "},${argument("e")})`;
      }
      case "m": return `matrix(${elementen(el).filter(e => e.lokaal === "mr").map(r => elementen(r).filter(e => e.lokaal === "e").map(e => lees(e, diepte + 1)).join(",")).join(";")})`;
      default: throw new Error("unsupported");
    }
  }
  const uit = lees(leesXml(xml));
  leesFormule(uit);
  return uit;
}

export function omml(formule: Formule, display = false): string {
  const bouw = (f: Formule): string => {
    switch (f.soort) {
      case "tekst": return `<m:r><m:t xml:space="preserve">${ontsnap(f.tekst)}</m:t></m:r>`;
      case "rij": return f.delen.map(bouw).join("");
      case "frac": return `<m:f><m:num>${bouw(f.a)}</m:num><m:den>${bouw(f.b)}</m:den></m:f>`;
      case "sup": return `<m:sSup><m:e>${bouw(f.a)}</m:e><m:sup>${bouw(f.b)}</m:sup></m:sSup>`;
      case "sub": return `<m:sSub><m:e>${bouw(f.a)}</m:e><m:sub>${bouw(f.b)}</m:sub></m:sSub>`;
      case "sqrt": return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${bouw(f.a)}</m:e></m:rad>`;
      case "root": return `<m:rad><m:deg>${bouw(f.a)}</m:deg><m:e>${bouw(f.b)}</m:e></m:rad>`;
      case "subsup": return `<m:sSubSup><m:e>${bouw(f.a)}</m:e><m:sub>${bouw(f.b)}</m:sub><m:sup>${bouw(f.c)}</m:sup></m:sSubSup>`;
      case "sum": case "int": case "prod": return `<m:nary><m:naryPr><m:chr m:val="${f.soort === "sum" ? "∑" : f.soort === "prod" ? "∏" : "∫"}"/><m:limLoc m:val="${f.soort === "int" ? "subSup" : "undOvr"}"/></m:naryPr><m:sub>${bouw(f.a)}</m:sub><m:sup>${bouw(f.b)}</m:sup><m:e>${bouw(f.c)}</m:e></m:nary>`;
      case "matrix": return `<m:m>${f.rijen.map(r => `<m:mr>${r.map(c => `<m:e>${bouw(c)}</m:e>`).join("")}</m:mr>`).join("")}</m:m>`;
    }
  };
  const inhoud = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${bouw(formule)}</m:oMath>`;
  return display ? `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inhoud}</m:oMathPara>` : inhoud;
}

/** Browserpreview; alle tekst wordt ontsnapt, uitsluitend eigen MathML-tags. */
export function mathml(formule: Formule): string {
  const bouw = (f: Formule): string => {
    switch (f.soort) {
      case "tekst": return `<mtext>${ontsnap(f.tekst)}</mtext>`;
      case "rij": return `<mrow>${f.delen.map(bouw).join("")}</mrow>`;
      case "frac": return `<mfrac>${bouw(f.a)}${bouw(f.b)}</mfrac>`;
      case "sup": return `<msup>${bouw(f.a)}${bouw(f.b)}</msup>`;
      case "sub": return `<msub>${bouw(f.a)}${bouw(f.b)}</msub>`;
      case "sqrt": return `<msqrt>${bouw(f.a)}</msqrt>`;
      case "root": return `<mroot>${bouw(f.b)}${bouw(f.a)}</mroot>`;
      case "subsup": return `<msubsup>${bouw(f.a)}${bouw(f.b)}${bouw(f.c)}</msubsup>`;
      case "sum": case "int": case "prod": return `<mrow><${f.soort === "int" ? "msubsup" : "munderover"}><mo>${f.soort === "sum" ? "∑" : f.soort === "prod" ? "∏" : "∫"}</mo>${bouw(f.a)}${bouw(f.b)}</${f.soort === "int" ? "msubsup" : "munderover"}>${bouw(f.c)}</mrow>`;
      case "matrix": return `<mtable>${f.rijen.map(r => `<mtr>${r.map(c => `<mtd>${bouw(c)}</mtd>`).join("")}</mtr>`).join("")}</mtable>`;
    }
  };
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${bouw(formule)}</math>`;
}
