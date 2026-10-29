/**
 * Voorbeeldweergave van een Excel-notatiecode met de scheidingstekens en
 * namen van de landinstelling (#64). Een eigen, beperkte weergave voor het
 * venster Celeigenschappen › Getal: secties (positief;negatief;nul;tekst),
 * kleuren, voorwaarden, letterlijke tekst, decimalen, duizendtallen, schalen,
 * procent, wetenschappelijk, breuken, datum en tijd. Het raster tekent de
 * rekenkern zelf.
 */

export interface Landinstelling {
  decimaal: string;
  groep: string;
  maanden: string[];
  maandenKort: string[];
  dagen: string[];
  dagenKort: string[];
  am: string;
  pm: string;
}

const cacheLand = new Map<string, Landinstelling>();
/** Scheidingstekens en namen voor een Intl-locale (bijvoorbeeld "nl-NL"). */
export function landinstelling(locale: string): Landinstelling {
  const bestaand = cacheLand.get(locale);
  if (bestaand) return bestaand;
  const delen = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const maand = (m: number, month: "long" | "short") =>
    new Intl.DateTimeFormat(locale, { month, timeZone: "UTC" })
      .format(new Date(Date.UTC(2026, m, 1)))
      .replace(/\.$/, "");
  // 4 januari 2026 is een zondag.
  const dag = (d: number, weekday: "long" | "short") =>
    new Intl.DateTimeFormat(locale, { weekday, timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 0, 4 + d)),
    );
  const uren = new Intl.DateTimeFormat(locale, { hour: "numeric", hour12: true, timeZone: "UTC" });
  const periode = (h: number) =>
    uren.formatToParts(new Date(Date.UTC(2026, 0, 1, h))).find((p) => p.type === "dayPeriod")
      ?.value;
  const land: Landinstelling = {
    decimaal: delen.find((p) => p.type === "decimal")?.value ?? ".",
    groep: delen.find((p) => p.type === "group")?.value ?? ",",
    maanden: Array.from({ length: 12 }, (_, m) => maand(m, "long")),
    maandenKort: Array.from({ length: 12 }, (_, m) => maand(m, "short")),
    dagen: Array.from({ length: 7 }, (_, d) => dag(d, "long")),
    dagenKort: Array.from({ length: 7 }, (_, d) => dag(d, "short")),
    am: periode(9) ?? "AM",
    pm: periode(21) ?? "PM",
  };
  cacheLand.set(locale, land);
  return land;
}

export interface Weergave {
  tekst: string;
  /** Kleur uit de code, bijvoorbeeld "red". */
  kleur?: string;
}

/** Splitst op ; buiten aanhalingstekens, haakjes en escapes. */
export function splitsSecties(code: string) {
  const secties: string[] = [];
  let huidig = "";
  let inTekst = false;
  let inHaak = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "\\" && !inTekst) {
      huidig += c + (code[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === '"') inTekst = !inTekst;
    else if (!inTekst && c === "[") inHaak = true;
    else if (!inTekst && c === "]") inHaak = false;
    if (c === ";" && !inTekst && !inHaak) {
      secties.push(huidig);
      huidig = "";
    } else huidig += c;
  }
  secties.push(huidig);
  return secties;
}

const KLEUREN: Record<string, string> = {
  red: "red",
  blue: "blue",
  green: "green",
  black: "black",
  white: "white",
  yellow: "yellow",
  magenta: "magenta",
  cyan: "cyan",
};

interface Token {
  soort: "tekst" | "code";
  waarde: string;
}

interface Sectie {
  kleur?: string;
  voorwaarde?: { op: string; getal: number };
  tokens: Token[];
  /** Alle codetekens achter elkaar, zonder letterlijke tekst. */
  code: string;
}

/** Tekens die buiten aanhalingstekens letterlijk getoond worden. */
const LETTERLIJK = /[$\-+/():!^&'~{}<>=\s€£¥]/;

/** Haalt kleur, voorwaarde en landcode eruit en splitst letterlijke tekst van code. */
function ontleedSectie(sectie: string): Sectie {
  let kleur: string | undefined;
  let voorwaarde: { op: string; getal: number } | undefined;
  const tokens: Token[] = [];
  const tekst = (waarde: string) => tokens.push({ soort: "tekst", waarde });
  const code = (waarde: string) => {
    const laatste = tokens[tokens.length - 1];
    if (laatste?.soort === "code") laatste.waarde += waarde;
    else tokens.push({ soort: "code", waarde });
  };
  for (let i = 0; i < sectie.length; i++) {
    const c = sectie[i];
    const vorige = sectie[i - 1] ?? "";
    const volgende = sectie[i + 1] ?? "";
    if (c === '"') {
      const eind = sectie.indexOf('"', i + 1);
      tekst(sectie.slice(i + 1, eind < 0 ? undefined : eind));
      i = eind < 0 ? sectie.length : eind;
    } else if (c === "\\") {
      tekst(volgende);
      i++;
    } else if (c === "_" || c === "*") {
      // _x: ruimte ter breedte van x; *x: opvullen met x. In het voorbeeld een spatie.
      tekst(" ");
      i++;
    } else if (c === "[") {
      const eind = sectie.indexOf("]", i);
      const inhoud = sectie.slice(i + 1, eind < 0 ? undefined : eind);
      i = eind < 0 ? sectie.length : eind;
      const v = /^(<=|>=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)$/.exec(inhoud);
      if (KLEUREN[inhoud.toLowerCase()]) kleur = KLEUREN[inhoud.toLowerCase()];
      else if (v) voorwaarde = { op: v[1], getal: Number(v[2]) };
      else if (inhoud.startsWith("$")) {
        const symbool = inhoud.slice(1).split("-")[0];
        if (symbool) tekst(symbool);
      } else if (/^(h+|m+|s+)$/i.test(inhoud)) code(`[${inhoud.toLowerCase()}]`);
      // [ColorN], [DBNum1] en dergelijke: niet getoond.
    } else if ((c === "+" || c === "-") && /e/i.test(vorige) && /[0#?]/.test(sectie[i - 2] ?? "")) {
      code(c);
    } else if (c === "/" && /[0-9#?]/.test(vorige) && /[0-9#?]/.test(volgende)) {
      code(c);
    } else if (c === "/" && /[a-z]/i.test(vorige) && /[a-z]/i.test(volgende)) {
      // AM/PM en A/P
      code(c);
    } else if (LETTERLIJK.test(c)) {
      tekst(c);
    } else code(c);
  }
  // Codeblokken die door tekst gescheiden zijn met een spatie ertussen ("# ?/?").
  let alleCode = "";
  let tussen = false;
  for (const t of tokens)
    if (t.soort === "tekst") tussen = alleCode.length > 0;
    else {
      alleCode += (tussen ? " " : "") + t.waarde;
      tussen = false;
    }
  return { kleur, voorwaarde, tokens, code: alleCode };
}

function past(voorwaarde: { op: string; getal: number }, n: number) {
  const g = voorwaarde.getal;
  switch (voorwaarde.op) {
    case "<":
      return n < g;
    case "<=":
      return n <= g;
    case ">":
      return n > g;
    case ">=":
      return n >= g;
    case "=":
      return n === g;
    default:
      return n !== g;
  }
}

/** Is dit een datum- of tijdcode (y, m, d, h, s, AM/PM), zonder cijferplaatsen? */
export function isDatumCode(code: string) {
  const kaal = code.replace(/\.0+/g, "");
  if (/[0#?]/.test(kaal) || /^(general|standaard)$/i.test(kaal.trim())) return false;
  if (/^[\s@]*$/.test(kaal)) return false;
  return /[dyhs]|m|am\/pm|a\/p/i.test(kaal);
}

function groepeer(cijfers: string, groep: string) {
  return cijfers.replace(/\B(?=(\d{3})+(?!\d))/g, groep);
}

/** Geheel deel volgens het patroon: verplichte nullen, ? als spatie, groepering. */
function gehelen(n: string, patroon: string, land: Landinstelling) {
  const plaatsen = patroon.replace(/,/g, "");
  const nullen = (plaatsen.match(/0/g) ?? []).length;
  const vragen = (plaatsen.match(/\?/g) ?? []).length;
  let cijfers = /^0+$/.test(n) && nullen === 0 ? "" : n.replace(/^0+(?=\d)/, "");
  if (cijfers.length < nullen) cijfers = cijfers.padStart(nullen, "0");
  const metGroep = patroon.includes(",") ? groepeer(cijfers, land.groep) : cijfers;
  return metGroep.padStart(Math.max(nullen + vragen, metGroep.length), " ");
}

/** Decimalen volgens het patroon: 0 verplicht, # weglaten, ? als spatie. */
function decimalenTekst(cijfers: string, patroon: string) {
  const tekens = patroon.split("").map((_, i) => cijfers[i] ?? "0");
  let eind = tekens.length;
  while (eind > 0 && tekens[eind - 1] === "0" && patroon[eind - 1] !== "0") eind--;
  let uit = tekens.slice(0, eind).join("");
  for (let i = eind; i < patroon.length; i++) if (patroon[i] === "?") uit += " ";
  return uit;
}

const vast = (n: number, decimalen: number) =>
  n < 1e21 ? n.toFixed(Math.min(decimalen, 100)) : n.toExponential(Math.min(decimalen, 100));

/** Beste benadering teller/noemer met noemer ≤ max (Stern-Brocot). */
export function besteBreuk(x: number, max: number): [number, number] {
  let [a, b, c, d] = [0, 1, 1, 0];
  let beste: [number, number] = [Math.round(x), 1];
  let fout = Math.abs(x - beste[0]);
  for (let i = 0; i < 2000; i++) {
    const t = a + c;
    const n = b + d;
    if (n > max) break;
    const e = Math.abs(x - t / n);
    if (e < fout) {
      fout = e;
      beste = [t, n];
    }
    if (t / n < x) [a, b] = [t, n];
    else if (t / n > x) [c, d] = [t, n];
    else break;
  }
  return beste;
}

/** Een getal (al absoluut) opgemaakt volgens de cijfercode van één sectie. */
function getalCode(waarde: number, code: string, land: Landinstelling) {
  let n = waarde * 100 ** (code.match(/%/g) ?? []).length;
  // Komma's direct achter de laatste cijferplaats delen door 1000.
  const schaal = /([0#?])(,+)(?=[^0#?]*$)/.exec(code);
  if (schaal) n /= 1000 ** schaal[2].length;
  const kaal = (schaal ? code.replace(/([0#?])(,+)(?=[^0#?]*$)/, "$1") : code).replace(/%/g, "");

  const breuk = /(?:([#0?,]+)\s+)?([0?#]+)\/(\d+|[?#0]+)/.exec(kaal);
  if (breuk) {
    const [, geheelPatroon = "", , noemerPatroon] = breuk;
    const metGeheel = geheelPatroon.length > 0;
    let geheel = metGeheel ? Math.floor(n) : 0;
    const rest = n - geheel;
    let [teller, noemer] = /^\d+$/.test(noemerPatroon)
      ? [Math.round(rest * Number(noemerPatroon)), Number(noemerPatroon)]
      : besteBreuk(rest, 10 ** noemerPatroon.length - 1);
    if (metGeheel && teller === noemer) {
      geheel += 1;
      teller = 0;
    }
    const deel = teller ? `${teller}/${noemer}` : "";
    if (!metGeheel) return deel || "0";
    const geheelTekst = geheel || !deel ? gehelen(String(geheel), geheelPatroon, land).trim() || "0" : "";
    return [geheelTekst, deel].filter(Boolean).join(" ");
  }

  const exp = /[Ee]([+-])(0+)/.exec(kaal);
  if (exp) {
    const [mantisse] = kaal.split(/[Ee][+-]/);
    const [geheelPat, deelPat = ""] = mantisse.split(".");
    const plaatsen = geheelPat.replace(/[^0#?]/g, "").length || 1;
    const deelPlaatsen = deelPat.replace(/[^0#?]/g, "").length;
    let macht = n === 0 ? 0 : Math.floor(Math.log10(n));
    if (plaatsen > 1) macht = Math.floor(macht / plaatsen) * plaatsen;
    let m = n / 10 ** macht;
    const grens = plaatsen > 1 ? 10 ** plaatsen : 10;
    if (Number(m.toFixed(deelPlaatsen)) >= grens) {
      macht += plaatsen > 1 ? plaatsen : 1;
      m = n / 10 ** macht;
    }
    const [g, d = ""] = m.toFixed(deelPlaatsen).split(".");
    const machtTekst = String(Math.abs(macht)).padStart(exp[2].length, "0");
    const teken = macht < 0 ? "-" : exp[1] === "+" ? "+" : "";
    const deel = deelPlaatsen ? decimalenTekst(d, deelPat.replace(/[^0#?]/g, "")) : "";
    return `${g}${deel ? land.decimaal + deel : ""}E${teken}${machtTekst}`;
  }

  const punt = kaal.indexOf(".");
  const geheelPat = (punt < 0 ? kaal : kaal.slice(0, punt)).replace(/[^0#?,]/g, "");
  const deelPat = punt < 0 ? "" : kaal.slice(punt + 1).replace(/[^0#?]/g, "");
  const [g, d = ""] = vast(n, deelPat.length).split(".");
  const geheel = gehelen(g, geheelPat, land);
  const deel = deelPat ? decimalenTekst(d, deelPat) : "";
  return `${geheel}${deel ? land.decimaal + deel : ""}` || "0";
}

/** Excel-serienummer (systeem 1900) naar datumdelen, met de schrikkeldag 29-2-1900. */
function datumDelen(serie: number) {
  const dagen = Math.floor(serie);
  const tijd = serie - dagen;
  if (dagen === 60) return { jaar: 1900, maand: 1, dag: 29, weekdag: 3, tijd };
  const d = new Date(Date.UTC(1899, 11, 30) + (dagen < 60 ? dagen + 1 : dagen) * 86400000);
  return {
    jaar: dagen === 0 ? 1900 : d.getUTCFullYear(),
    maand: dagen === 0 ? 0 : d.getUTCMonth(),
    dag: dagen === 0 ? 0 : d.getUTCDate(),
    weekdag: d.getUTCDay(),
    tijd,
  };
}

const DATUMDEEL =
  /\[h+\]|\[m+\]|\[s+\]|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p|\.0+|./gi;
const twee = (n: number) => String(n).padStart(2, "0");

/** Datum en tijd; letterlijke tekst tussen de delen blijft staan. */
function datumTekst(serie: number, tokens: Token[], land: Landinstelling) {
  const delen = datumDelen(serie);
  const code = tokens
    .filter((t) => t.soort === "code")
    .map((t) => t.waarde)
    .join("");
  const ampm = /am\/pm|a\/p/i.test(code);
  const fractie = /s(\.0+)/i.test(code);
  const sec = fractie ? delen.tijd * 86400 : Math.round(delen.tijd * 86400);
  let uur = Math.floor(sec / 3600) % 24;
  const minuut = Math.floor(sec / 60) % 60;
  const seconde = Math.floor(sec) % 60;
  const pm = uur >= 12;
  if (ampm) uur = uur % 12 || 12;

  // Alle delen op een rij, zodat m na h (of vóór s) als minuut telt.
  const reeks: { tekst?: string; deel?: string }[] = [];
  for (const t of tokens)
    if (t.soort === "tekst") reeks.push({ tekst: t.waarde });
    else for (const [deel] of t.waarde.matchAll(DATUMDEEL)) reeks.push({ deel });
  const soortVan = (i: number) => reeks[i]?.deel?.toLowerCase().replace(/[[\]]/g, "")[0];
  const buur = (i: number, stap: number) => {
    for (let j = i + stap; j >= 0 && j < reeks.length; j += stap)
      if (reeks[j].deel && /^\[?[a-z]/i.test(reeks[j].deel!)) return soortVan(j);
    return undefined;
  };
  return reeks
    .map((r, i) => {
      if (r.tekst !== undefined) return r.tekst;
      const deel = r.deel!;
      const l = deel.toLowerCase();
      if (l.startsWith("[h")) return String(Math.floor(serie * 24 + 1e-9)).padStart(l.length - 2, "0");
      if (l.startsWith("[m")) return String(Math.floor(serie * 1440 + 1e-9)).padStart(l.length - 2, "0");
      if (l.startsWith("[s")) return String(Math.floor(serie * 86400 + 1e-6)).padStart(l.length - 2, "0");
      if (l === "yyyy") return String(delen.jaar);
      if (l === "yy") return twee(delen.jaar % 100);
      if (l === "mmmmm") return land.maanden[delen.maand][0];
      if (l === "mmmm") return land.maanden[delen.maand];
      if (l === "mmm") return land.maandenKort[delen.maand];
      if (l === "mm" || l === "m") {
        const minuten = buur(i, -1) === "h" || buur(i, 1) === "s";
        const waarde = minuten ? minuut : delen.maand + 1;
        return l === "mm" ? twee(waarde) : String(waarde);
      }
      if (l === "dddd") return land.dagen[delen.weekdag];
      if (l === "ddd") return land.dagenKort[delen.weekdag];
      if (l === "dd") return twee(delen.dag);
      if (l === "d") return String(delen.dag);
      if (l === "hh") return twee(uur);
      if (l === "h") return String(uur);
      if (l === "ss") return twee(seconde);
      if (l === "s") return String(seconde);
      if (l === "am/pm") return pm ? land.pm : land.am;
      if (l === "a/p") return pm ? "p" : "a";
      if (l.startsWith(".0")) return land.decimaal + (sec % 1).toFixed(l.length - 1).slice(2);
      return deel;
    })
    .join("");
}

/** Algemeen: tot 11 significante cijfers, wetenschappelijk bij heel groot of klein. */
export function algemeen(n: number, land: Landinstelling) {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  let tekst: string;
  if (abs >= 1e11 || abs < 1e-9) {
    const [m, e] = n.toExponential(5).split("e");
    const macht = Number(e);
    tekst = `${m.replace(/\.?0+$/, "")}E${macht < 0 ? "-" : "+"}${twee(Math.abs(macht))}`;
  } else {
    const plaatsen = Math.max(0, 10 - Math.floor(Math.log10(abs)));
    tekst = String(Number(n.toFixed(Math.min(plaatsen, 20))));
  }
  return tekst.replace(".", land.decimaal);
}

/**
 * Toont een waarde met een notatiecode zoals Excel, met de scheidingstekens en
 * namen van `land`. Tekst gaat door de tekstsectie (of blijft ongewijzigd).
 */
export function toonMetCode(waarde: number | string, code: string, land: Landinstelling): Weergave {
  const secties = splitsSecties(code.trim() ? code : "General");
  if (typeof waarde === "string") {
    const bron = secties.length >= 4 ? secties[3] : secties.find((s) => s.includes("@"));
    if (bron === undefined) return { tekst: waarde };
    const { kleur, tokens } = ontleedSectie(bron);
    return {
      tekst: tokens
        .map((t) => (t.soort === "tekst" ? t.waarde : t.waarde.replace(/@/g, waarde)))
        .join(""),
      kleur,
    };
  }
  if (!Number.isFinite(waarde)) return { tekst: "#NUM!" };
  const getalSecties = secties.slice(0, 3).map(ontleedSectie);
  let index = 0;
  let minTeken = false;
  if (getalSecties.some((s) => s.voorwaarde)) {
    index = getalSecties.findIndex((s) => !s.voorwaarde || past(s.voorwaarde, waarde));
    if (index < 0) index = 0;
    // Een sectie zonder voorwaarde krijgt het minteken zelf.
    minTeken = waarde < 0 && !getalSecties[index].voorwaarde;
  } else if (waarde < 0 && getalSecties.length >= 2) index = 1;
  else if (waarde === 0 && getalSecties.length >= 3) index = 2;
  else minTeken = waarde < 0;
  const sectie = getalSecties[index] ?? getalSecties[0];
  const abs = Math.abs(waarde);

  if (!sectie.code.trim() && !sectie.tokens.length) return { tekst: "", kleur: sectie.kleur };
  if (/^(general|standaard)$/i.test(sectie.code.trim())) {
    const tekst = sectie.tokens
      .map((t) => (t.soort === "tekst" ? t.waarde : algemeen(abs, land)))
      .join("");
    return { tekst: minTeken ? `-${tekst}` : tekst, kleur: sectie.kleur };
  }
  if (isDatumCode(sectie.code)) {
    if (waarde < 0) return { tekst: "#".repeat(7), kleur: sectie.kleur };
    return { tekst: datumTekst(waarde, sectie.tokens, land), kleur: sectie.kleur };
  }
  if (!/[0#?]/.test(sectie.code)) {
    // Alleen letterlijke tekst, zoals "nul".
    const tekst = sectie.tokens.map((t) => t.waarde).join("");
    return { tekst: minTeken ? `-${tekst}` : tekst, kleur: sectie.kleur };
  }
  // Getal: het opgemaakte getal komt op de plek van de cijferplaatsen.
  const getal = getalCode(abs, sectie.code, land);
  const cijfers = (t: Token) => t.soort === "code" && /[0#?]/.test(t.waarde);
  const eerste = sectie.tokens.findIndex(cijfers);
  let laatste = eerste;
  sectie.tokens.forEach((t, i) => {
    if (cijfers(t)) laatste = i;
  });
  const voor = sectie.tokens
    .slice(0, eerste)
    .map((t) => t.waarde)
    .join("");
  const procent = "%".repeat((sectie.code.match(/%/g) ?? []).length);
  const na = sectie.tokens
    .slice(laatste + 1)
    .map((t) => (t.soort === "tekst" ? t.waarde : ""))
    .join("");
  const tekst = `${voor}${getal}${procent}${na}`;
  const nul = !/[1-9]/.test(getal);
  return { tekst: minTeken && !nul ? `-${tekst}` : tekst, kleur: sectie.kleur };
}
