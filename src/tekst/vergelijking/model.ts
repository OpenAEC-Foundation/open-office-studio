import { ontsnap, leesXml, elementen, kind, tekstVan, type XmlElement } from "../../grafieken/xml";

export type Formule = { soort: "tekst"; tekst: string } | { soort: "rij"; delen: Formule[] }
  | { soort: "frac" | "sup" | "sub"; a: Formule; b: Formule }
  | { soort: "sqrt"; a: Formule };

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
      if (einde && !haakjes && (bron[index] === "," || bron[index] === ")")) break;
      const functie = index > 0 && /[\p{L}\p{N}_]/u.test(bron[index - 1]) ? null : /^(frac|sup|sub|sqrt)\(/.exec(bron.slice(index));
      if (!functie) {
        if (bron[index] === "(") haakjes++;
        if (bron[index] === ")" && --haakjes < 0) throw new Error("Een openingshaakje ontbreekt.");
        tekst += bron[index++]; continue;
      }
      klaar(); index += functie[0].length;
      const a = rij(diepte + 1, true);
      if (a.soort === "rij" && !a.delen.length) throw new Error("Een formuleargument is leeg.");
      if (functie[1] === "sqrt") {
        if (bron[index++] !== ")") throw new Error("sqrt verwacht één argument tussen haakjes.");
        delen.push({ soort: "sqrt", a });
      } else {
        if (bron[index++] !== ",") throw new Error("Gebruik twee argumenten, gescheiden door een komma.");
        const b = rij(diepte + 1, true);
        if (b.soort === "rij" && !b.delen.length) throw new Error("Een formuleargument is leeg.");
        if (bron[index++] !== ")") throw new Error("Een sluithaakje ontbreekt.");
        delen.push({ soort: functie[1] as "frac" | "sup" | "sub", a, b });
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
    const toegelaten: Record<string, string[]> = { f: ["num", "den"], sSup: ["e", "sup"], sSub: ["e", "sub"], rad: ["radPr", "deg", "e"] };
    if (toegelaten[el.lokaal] && elementen(el).some(e => !toegelaten[el.lokaal].includes(e.lokaal))) throw new Error("unsupported");
    switch (el.lokaal) {
      case "oMath": case "oMathPara": case "num": case "den": case "e": case "sup": case "sub": return inhoud();
      case "t": return tekstVan(el);
      case "r": {
        if (elementen(el).some(e => e.lokaal !== "t")) throw new Error("unsupported");
        return inhoud();
      }
      case "f": return `frac(${argument("num")},${argument("den")})`;
      case "sSup": return `sup(${argument("e")},${argument("sup")})`;
      case "sSub": return `sub(${argument("e")},${argument("sub")})`;
      case "rad": {
        const deg = kind(el, "deg");
        if (deg && tekstVan(deg)) throw new Error("unsupported");
        return `sqrt(${argument("e")})`;
      }
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
    }
  };
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${bouw(formule)}</math>`;
}
