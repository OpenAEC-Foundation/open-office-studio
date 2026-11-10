/** Sheet/table references are rewritten outside strings and structured-reference labels. */
export function kopieFormule(
  formule: string,
  bron: string,
  naam: string,
  tabellen: ReadonlyMap<string, string> = new Map(),
): string {
  const zelf = (s: string) => s.toLowerCase() === bron.toLowerCase();
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  let uit = "",
    i = 0;
  while (i < formule.length) {
    const begin = i,
      c = formule[i];
    if (c === '"') {
      i++;
      while (i < formule.length) {
        if (formule[i++] === '"') {
          if (formule[i] === '"') i++;
          else break;
        }
      }
      uit += formule.slice(begin, i);
      continue;
    }
    if (c === "'") {
      let tekst = "";
      i++;
      while (i < formule.length) {
        if (formule[i] === "'") {
          i++;
          if (formule[i] === "'") {
            tekst += "'";
            i++;
          } else break;
        } else tekst += formule[i++];
      }
      if (formule[i] === "!" && formule[begin - 1] !== ":" && zelf(tekst)) {
        uit += quote(naam) + "!";
        i++;
      } else uit += formule.slice(begin, i);
      continue;
    }
    if (c === "[") {
      let diepte = 0;
      do {
        if (formule[i] === "'") {
          i += 2;
          continue;
        }
        if (formule[i] === "[") diepte++;
        else if (formule[i] === "]") diepte--;
        i++;
      } while (i < formule.length && diepte > 0);
      uit += formule.slice(begin, i);
      continue;
    }
    if (/[\p{L}\p{N}_.\\]/u.test(c)) {
      while (i < formule.length && /[\p{L}\p{N}_.\\]/u.test(formule[i])) i++;
      const token = formule.slice(begin, i),
        vorig = formule[begin - 1];
      if (formule[i] === "!" && vorig !== "]" && vorig !== ":" && zelf(token)) {
        uit += quote(naam) + "!";
        i++;
      } else if (formule[i] === "[" && vorig !== "!" && vorig !== "]")
        uit += tabellen.get(token.toLowerCase()) ?? token;
      else uit += token;
      continue;
    }
    uit += c;
    i++;
  }
  return uit;
}

export interface XmlToken {
  begin: number;
  eind: number;
  naam: string;
  lokaal: string;
  sluit: boolean;
  leeg: boolean;
}
/** A streaming tag walk: strings, comments, CDATA and quoted '>' remain untouched. */
export function* xmlTags(xml: string): Generator<XmlToken> {
  let i = 0;
  while ((i = xml.indexOf("<", i)) >= 0) {
    if (
      xml.startsWith("<!--", i) ||
      xml.startsWith("<![CDATA[", i) ||
      xml.startsWith("<?", i)
    ) {
      const slot = xml.startsWith("<!--", i)
        ? "-->"
        : xml.startsWith("<?", i)
          ? "?>"
          : "]]>";
      const einde = xml.indexOf(slot, i + 2);
      if (einde < 0) throw Error("Unclosed XML token");
      i = einde + slot.length;
      continue;
    }
    const begin = i;
    let quote = "";
    i++;
    while (i < xml.length) {
      const c = xml[i++];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (xml[i - 1] !== ">") throw Error("Unclosed XML tag");
    const text = xml.slice(begin, i),
      m = /^<\/?([^\s/>]+)/.exec(text);
    if (!m) continue;
    const naam = m[1];
    yield {
      begin,
      eind: i,
      naam,
      lokaal: naam.slice(naam.indexOf(":") + 1),
      sluit: text.startsWith("</"),
      leeg: /\/\s*>$/.test(text),
    };
  }
}
