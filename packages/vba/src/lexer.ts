import i18next from "i18next";
import { VbaParseerFout } from "./fouten.ts";

export type TokenSoort =
  | "naam" // identificator of sleutelwoord; `[haakjes naam]` met `haak: true`
  | "getal"
  | "tekst"
  | "datum"
  | "op" // operator of leesteken
  | "eol" // einde statement: regeleinde
  | "eof";

export type Typeteken = "%" | "&" | "!" | "#" | "@" | "$";

export interface Token {
  soort: TokenSoort;
  /** Brontekst (bij `naam` zonder typeteken en zonder haken). */
  tekst: string;
  /** Kleine letters, voor het vergelijken van sleutelwoorden. */
  klein: string;
  regel: number;
  kolom: number;
  /** Er stond witruimte direct vóór dit token. */
  spatieVoor: boolean;
  haak?: boolean;
  typeteken?: Typeteken;
  getal?: number;
  /** Typeteken of afgeleid type van een getalliteraal. */
  getalType?: "Integer" | "Long" | "Single" | "Double" | "Currency";
  /** Datumliteraal: brontekst tussen de hekjes. */
  datum?: string;
}

/** Gereserveerde woorden die geen variabelenaam kunnen zijn. */
export const GERESERVEERD = new Set(
  `and as byref byval call case const declare dim do each else elseif end enum eqv erase event exit
false for friend function get global gosub goto if imp implements in is let like loop lset me mod new
next not nothing null on option optional or paramarray preserve private property public raiseevent redim
rem resume return rset select set static stop sub then to true type typeof until wend while with
withevents xor empty attribute`
    .split(/\s+/)
    .filter(Boolean),
);

const TIJD = String.raw`\d{1,2}(:\d{1,2}){1,2}(\s*[AaPp][Mm])?|\d{1,2}\s*[AaPp][Mm]`;
const DATUMVORM = new RegExp(
  String.raw`^\s*(` +
    String.raw`\d{1,4}[\/\-.]\d{1,2}([\/\-.]\d{1,4})?(\s+(${TIJD}))?` +
    `|${TIJD}|` +
    String.raw`[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}|\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-]\d{2,4}` +
    String.raw`)\s*$`,
);
const isNaamStart = (c: string) => /[A-Za-z_À-￿]/.test(c);
const isNaamTeken = (c: string) => /[A-Za-z0-9_À-￿]/.test(c);

export interface LexOpties {
  /** SQL-criteria (FindFirst): `'` opent een tekst in plaats van commentaar. */
  sql?: boolean;
}

/**
 * Zet VBA-bron om in tokens. Regelvoortzetting (` _`) en commentaar worden
 * hier verwerkt; `:` blijft een leesteken zodat de parser statements kan scheiden.
 */
export function lex(bron: string, module = "?", opties: LexOpties = {}): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let regel = 1;
  let regelStart = 0;
  let spatie = true;
  const n = bron.length;
  const pos = () => ({ module, regel, kolom: i - regelStart + 1 });
  const maak = (
    soort: TokenSoort,
    tekst: string,
    start: number,
    extra: Partial<Token> = {},
  ): Token => ({
    soort,
    tekst,
    klein: tekst.toLowerCase(),
    regel,
    kolom: start - regelStart + 1,
    spatieVoor: spatie,
    ...extra,
  });
  const nieuweRegel = () => {
    regel++;
    regelStart = i;
  };
  const laatste = () => tokens[tokens.length - 1];
  const aanBeginStatement = () => {
    const t = laatste();
    return !t || t.soort === "eol" || (t.soort === "op" && t.tekst === ":");
  };

  while (i < n) {
    const c = bron[i];
    // Regeleinden
    if (c === "\r" || c === "\n") {
      const start = i;
      if (c === "\r" && bron[i + 1] === "\n") i++;
      i++;
      if (laatste()?.soort !== "eol") tokens.push(maak("eol", "\n", start));
      nieuweRegel();
      spatie = true;
      continue;
    }
    if (c === " " || c === "\t" || c === " " || c === "\f") {
      i++;
      spatie = true;
      continue;
    }
    // Regelvoortzetting: " _" gevolgd door (spaties en) een regeleinde.
    if (c === "_" && spatie) {
      let j = i + 1;
      while (bron[j] === " " || bron[j] === "\t") j++;
      if (bron[j] === "\r" || bron[j] === "\n" || j >= n) {
        if (bron[j] === "\r" && bron[j + 1] === "\n") j++;
        i = j + 1;
        nieuweRegel();
        spatie = true;
        continue;
      }
    }
    // Commentaar
    const isRem =
      (c === "r" || c === "R") &&
      /^rem\b/i.test(bron.slice(i, i + 4)) &&
      !isNaamTeken(bron[i + 3] ?? "") &&
      aanBeginStatement();
    if ((c === "'" && !opties.sql) || isRem) {
      // Commentaar loopt door bij een voortzettingsteken aan het regeleinde.
      while (i < n) {
        if (bron[i] === "\r" || bron[i] === "\n") {
          const vorige = bron.slice(Math.max(0, i - 2), i);
          if (/ _$/.test(vorige) || (vorige === "_" && i === 1)) {
            if (bron[i] === "\r" && bron[i + 1] === "\n") i++;
            i++;
            nieuweRegel();
            continue;
          }
          break;
        }
        i++;
      }
      continue;
    }
    const start = i;
    // Tekst
    if (c === '"' || (opties.sql && c === "'")) {
      const sluit = c;
      let waarde = "";
      i++;
      for (;;) {
        if (i >= n || bron[i] === "\n" || bron[i] === "\r")
          throw new VbaParseerFout(
            i18next.t("vba:parse.unterminatedString"),
            { module, regel, kolom: start - regelStart + 1 },
            "tekst niet afgesloten",
          );
        if (bron[i] === sluit) {
          if (bron[i + 1] === sluit) {
            waarde += sluit;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        waarde += bron[i++];
      }
      tokens.push(maak("tekst", waarde, start));
      spatie = false;
      continue;
    }
    // Haakjesnaam [Veld naam]
    if (c === "[") {
      const eind = bron.indexOf("]", i + 1);
      const nl = bron.slice(i, eind < 0 ? n : eind).search(/[\r\n]/);
      if (eind < 0 || nl >= 0)
        throw new VbaParseerFout(
          i18next.t("vba:parse.unterminatedBracketName"),
          pos(),
          "naam tussen haken",
        );
      const naam = bron.slice(i + 1, eind);
      i = eind + 1;
      tokens.push(maak("naam", naam, start, { haak: true }));
      spatie = false;
      continue;
    }
    // Datumliteraal #...#
    if (c === "#") {
      const rest = bron.slice(i + 1, i + 60);
      const m = /^([^#\r\n]*)#/.exec(rest);
      if (m && DATUMVORM.test(m[1])) {
        i += m[0].length + 1;
        tokens.push(maak("datum", m[1], start, { datum: m[1].trim() }));
        spatie = false;
        continue;
      }
    }
    // Hexadecimaal / octaal
    if (c === "&" && /[hHoO]/.test(bron[i + 1] ?? "")) {
      const hex = /[hH]/.test(bron[i + 1]);
      const m = (hex ? /^[0-9A-Fa-f]+/ : /^[0-7]+/).exec(bron.slice(i + 2));
      if (m) {
        i += 2 + m[0].length;
        let waarde = parseInt(m[0], hex ? 16 : 8);
        let getalType: Token["getalType"] = "Integer";
        let teken = bron[i];
        if (teken === "&") {
          i++;
          getalType = "Long";
          if (waarde > 0x7fffffff) waarde -= 0x100000000;
        } else if (teken === "%") {
          i++;
          if (waarde > 0x7fff) waarde -= 0x10000;
        } else if (waarde <= 0xffff) {
          if (waarde > 0x7fff) waarde -= 0x10000;
        } else {
          getalType = "Long";
          if (waarde > 0x7fffffff) waarde -= 0x100000000;
        }
        tokens.push(
          maak("getal", bron.slice(start, i), start, {
            getal: waarde,
            getalType,
          }),
        );
        spatie = false;
        continue;
      }
    }
    // Getallen
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(bron[i + 1] ?? ""))) {
      const m = /^(\d*\.?\d*)([eEdD][+-]?\d+)?/.exec(bron.slice(i))!;
      let tekst = m[0];
      i += tekst.length;
      const waarde = Number(tekst.replace(/[dD]/, "e"));
      let getalType: Token["getalType"];
      const t = bron[i];
      if (t && "%&!#@".includes(t) && !isNaamStart(bron[i + 1] ?? "")) {
        i++;
        getalType = (
          {
            "%": "Integer",
            "&": "Long",
            "!": "Single",
            "#": "Double",
            "@": "Currency",
          } as const
        )[t as "%"];
      } else if (/[.eEdD]/.test(tekst)) getalType = "Double";
      else if (Number.isInteger(waarde) && waarde <= 32767) getalType = "Integer";
      else if (Number.isInteger(waarde) && waarde <= 2147483647) getalType = "Long";
      else getalType = "Double";
      tokens.push(
        maak("getal", bron.slice(start, i), start, { getal: waarde, getalType }),
      );
      tekst = "";
      spatie = false;
      continue;
    }
    // Namen
    if (isNaamStart(c)) {
      while (i < n && isNaamTeken(bron[i])) i++;
      const naam = bron.slice(start, i);
      let typeteken: Typeteken | undefined;
      const t = bron[i];
      if (t === "$" || t === "%" || t === "@") typeteken = t;
      else if (t === "!" && !isNaamStart(bron[i + 1] ?? "") && bron[i + 1] !== "[")
        typeteken = "!";
      else if (
        (t === "&" || t === "#") &&
        !isNaamTeken(bron[i + 1] ?? "") &&
        bron[i + 1] !== "#" &&
        bron[i + 1] !== "&" &&
        bron[i + 1] !== '"'
      )
        typeteken = t;
      if (typeteken) i++;
      tokens.push(maak("naam", naam, start, typeteken ? { typeteken } : {}));
      spatie = false;
      continue;
    }
    // Operatoren en leestekens
    const twee = bron.slice(i, i + 2);
    if (["<>", "<=", ">=", ":=", "=<", "=>"].includes(twee)) {
      i += 2;
      const norm = twee === "=<" ? "<=" : twee === "=>" ? ">=" : twee;
      tokens.push(maak("op", norm, start));
      spatie = false;
      continue;
    }
    if ("+-*/\\^&=<>(),.;:!#?{}".includes(c)) {
      i++;
      tokens.push(maak("op", c, start));
      spatie = false;
      continue;
    }
    throw new VbaParseerFout(
      i18next.t("vba:parse.unexpectedCharacter", { char: c }),
      pos(),
      "onbekend teken",
    );
  }
  if (laatste() && laatste().soort !== "eol")
    tokens.push(maak("eol", "\n", i));
  tokens.push(maak("eof", "", i));
  return tokens;
}
