/**
 * Access-functies die SQLite niet (of met andere betekenis) kent, als eigen
 * SQL-functies voor sql.js. De vertaler in `access-sql.ts` roept ze aan met
 * het voorvoegsel `acc_` en altijd met een vast aantal argumenten, omdat
 * sql.js per naam één functie met een vaste ariteit registreert.
 *
 * Landinstelling: Nederlands (zoals Access op een Nederlandse Windows):
 * decimale komma in CStr/Format, maand- en dagnamen in het Nederlands.
 */
import i18next from "i18next";
import type { Database } from "sql.js";

type SqlWaarde = number | string | Uint8Array | null;

const DAG_MS = 86_400_000;
const OLE_NUL = Date.UTC(1899, 11, 30);

export const MAANDEN = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];
export const MAANDEN_KORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];
const DAGEN = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];
const DAGEN_KORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MAANDEN_EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function utc(
  jaar: number,
  maand: number,
  dag: number,
  uur = 0,
  minuut = 0,
  seconde = 0,
  ms = 0,
) {
  // setUTCFullYear verwerkt ook maand- en dagoverloop (DateSerial(2026, 13, 0)).
  const d = new Date(0);
  d.setUTCFullYear(jaar, maand, dag);
  d.setUTCHours(uur, minuut, seconde, ms);
  return d.getTime();
}

/** Serieel Access-getal (dagen sinds 30-12-1899) uit milliseconden sinds 1970. */
const serieel = (ms: number) => (ms - OLE_NUL) / DAG_MS;
const msUit = (s: number) => OLE_NUL + Math.round(s * DAG_MS);

const twee = (n: number) => String(n).padStart(2, "0");

/** ISO-tekst zoals de werkkopie datums bewaart: alleen datum als er geen tijd is. */
export function isoUitMs(ms: number): string {
  const d = new Date(ms);
  const jaar = d.getUTCFullYear();
  const datum = `${jaar < 0 ? "-" : ""}${String(Math.abs(jaar)).padStart(4, "0")}-${twee(d.getUTCMonth() + 1)}-${twee(d.getUTCDate())}`;
  const h = d.getUTCHours(),
    m = d.getUTCMinutes(),
    s = d.getUTCSeconds(),
    milli = d.getUTCMilliseconds();
  if (!h && !m && !s && !milli) return datum;
  return `${datum}T${twee(h)}:${twee(m)}:${twee(s)}${milli ? "." + String(milli).padStart(3, "0") : ""}`;
}
export const isoUitSerieel = (s: number) => isoUitMs(msUit(s));

const ISO =
  /^(-?\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?Z?$/;

/** Leest ISO-tekst; geeft milliseconden (UTC-gebaseerd, zonder tijdzone) of null. */
export function msUitIso(tekst: string): number | null {
  const m = ISO.exec(tekst.trim());
  if (!m) return null;
  const maand = +m[2],
    dag = +m[3];
  if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return null;
  return utc(
    +m[1],
    maand - 1,
    dag,
    +(m[4] ?? 0),
    +(m[5] ?? 0),
    +(m[6] ?? 0),
    m[7] ? Math.round(Number("0." + m[7]) * 1000) : 0,
  );
}

function jaar2(j: number) {
  return j < 100 ? (j < 30 ? 2000 + j : 1900 + j) : j;
}
function maandUitNaam(naam: string): number | null {
  const n = naam.toLowerCase().replace(/\.$/, "");
  if (n.length < 3) return null;
  for (const lijst of [MAANDEN, MAANDEN_EN, MAANDEN_KORT]) {
    const i = lijst.findIndex((m) => m.startsWith(n) || n.startsWith(m));
    if (i >= 0) return i;
  }
  return null;
}
function tijdUit(tekst: string): [number, number, number] | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i.exec(
    tekst.trim(),
  );
  if (!m) return null;
  let uur = +m[1];
  const ampm = m[4]?.toLowerCase();
  if (ampm?.startsWith("p") && uur < 12) uur += 12;
  if (ampm?.startsWith("a") && uur === 12) uur = 0;
  if (uur > 23 || +m[2] > 59 || +(m[3] ?? 0) > 59) return null;
  return [uur, +m[2], +(m[3] ?? 0)];
}

/**
 * Leest een datum zoals Access die in tekst tegenkomt.
 * `volgorde` "mdj" voor datumliteralen in SQL (VS-notatie), "dmj" voor CDate
 * met Nederlandse landinstelling. Onmogelijke volgordes worden omgedraaid,
 * zoals Access doet (#26/10/2026# is 26 oktober).
 */
export function msUitTekst(
  invoer: string,
  volgorde: "mdj" | "dmj" = "dmj",
): number | null {
  // Access verdraagt spaties rond scheidingstekens: #12: 00: 00#.
  const tekst = invoer.trim().replace(/\s*:\s*/g, ":");
  if (!tekst) return null;
  const iso = msUitIso(tekst);
  if (iso !== null) return iso;
  const alleenTijd = tijdUit(tekst);
  if (alleenTijd) return utc(1899, 11, 30, ...alleenTijd);
  // Datumdeel en optioneel tijddeel.
  const m =
    /^([\p{L}\d]+)[\s/.-]+([\p{L}\d]+),?[\s/.-]+(\d{2,4})(?:\s+(.+))?$/u.exec(
      tekst,
    );
  if (!m) return null;
  let tijd: [number, number, number] = [0, 0, 0];
  if (m[4]) {
    const t = tijdUit(m[4]);
    if (!t) return null;
    tijd = t;
  }
  let [a, b] = [m[1], m[2]];
  const c = +m[3];
  let jaar: number, maand: number, dag: number;
  if (/^\d{4}$/.test(a)) {
    // jjjj/m/d
    jaar = +a;
    maand = +b - 1;
    dag = c;
  } else {
    jaar = jaar2(c);
    const naamA = /\D/.test(a) ? maandUitNaam(a) : null;
    const naamB = /\D/.test(b) ? maandUitNaam(b) : null;
    if (naamA !== null) {
      maand = naamA;
      dag = +b;
    } else if (naamB !== null) {
      maand = naamB;
      dag = +a;
    } else {
      if (/\D/.test(a) || /\D/.test(b)) return null;
      let [x, y] = [+a, +b];
      if (volgorde === "dmj") [x, y] = [y, x]; // x = maand, y = dag
      if (x > 12 && y <= 12) [x, y] = [y, x];
      maand = x - 1;
      dag = y;
    }
  }
  if (maand < 0 || maand > 11 || dag < 1 || dag > 31) return null;
  const ms = utc(jaar, maand, dag, ...tijd);
  if (new Date(ms).getUTCDate() !== dag) return null;
  return ms;
}

/** Waarde naar milliseconden: ISO-tekst, losse datumtekst of serieel getal. */
export function msUitWaarde(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? msUit(v) : null;
  if (typeof v === "string") return msUitTekst(v, "dmj");
  return null;
}

/** VBA-afronding: half naar even (bankiersafronding). */
export function rondAf(x: number, decimalen = 0): number {
  const f = 10 ** decimalen;
  const y = x * f;
  const r = Math.round(y);
  const exact = Math.abs(y - Math.trunc(y)) === 0.5 || Math.abs(Math.abs(y % 1) - 0.5) < 1e-9;
  const uit = exact ? (r % 2 === 0 ? r : r - 1) : r;
  return uit / f;
}

function getal(v: SqlWaarde): number | null {
  if (v === null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** VBA CStr met Nederlandse decimale komma. */
export function cstr(v: SqlWaarde): string {
  if (v === null) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    const t = String(Number(v.toPrecision(15)));
    return t.replace(".", ",");
  }
  if (v instanceof Uint8Array) return `[${v.byteLength} bytes]`;
  return v;
}

function groepeer(geheel: string) {
  return geheel.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getalOpmaak(n: number, sectie: string): string {
  // Letterlijke tekst tussen aanhalingstekens of na \ blijft staan.
  const delen: { lit: boolean; t: string }[] = [];
  for (let i = 0; i < sectie.length; i++) {
    const c = sectie[i];
    if (c === '"') {
      const eind = sectie.indexOf('"', i + 1);
      delen.push({ lit: true, t: sectie.slice(i + 1, eind < 0 ? undefined : eind) });
      i = eind < 0 ? sectie.length : eind;
    } else if (c === "\\") delen.push({ lit: true, t: sectie[++i] ?? "" });
    else delen.push({ lit: !/[0#,.%Ee+-]/.test(c), t: c });
  }
  const eerste = delen.findIndex((d) => !d.lit && /[0#.]/.test(d.t));
  if (eerste < 0) return delen.map((d) => d.t).join("");
  let laatste = eerste;
  delen.forEach((d, i) => {
    if (!d.lit && /[0#]/.test(d.t)) laatste = Math.max(laatste, i);
  });
  const patroon = delen
    .slice(eerste, laatste + 1)
    .filter((d) => !d.lit)
    .map((d) => d.t)
    .join("");
  const procent = delen.some((d) => !d.lit && d.t === "%");
  if (procent) n *= 100;
  const sci = /[Ee][+-]/.exec(patroon);
  const mantisse = sci ? patroon.slice(0, sci.index) : patroon;
  const [gp, dp = ""] = mantisse.replace(/%/g, "").split(".");
  const maxDec = (dp.match(/[0#]/g) ?? []).length;
  const minDec = (dp.match(/0/g) ?? []).length;
  const minInt = (gp.match(/0/g) ?? []).length;
  const duizend = gp.includes(",");
  let exponent = "";
  if (sci) {
    const e = n === 0 ? 0 : Math.floor(Math.log10(Math.abs(n)));
    n = n / 10 ** e;
    const cijfers = (patroon.slice(sci.index + 2).match(/0/g) ?? []).length;
    exponent =
      "E" +
      (e < 0 ? "-" : sci[0][1] === "+" ? "+" : "") +
      String(Math.abs(e)).padStart(cijfers, "0");
  }
  const afgerond = rondAf(n, maxDec);
  let [geheel, frac = ""] = Math.abs(afgerond).toFixed(maxDec).split(".");
  while (frac.length > minDec && frac.endsWith("0")) frac = frac.slice(0, -1);
  if (geheel === "0" && minInt === 0) geheel = "";
  geheel = geheel.padStart(minInt, "0");
  if (duizend) geheel = groepeer(geheel);
  let tekst = geheel + (frac ? "," + frac : "") + exponent;
  if (afgerond < 0) tekst = "-" + tekst;
  const rand = (lijst: { lit: boolean; t: string }[]) =>
    lijst.map((d) => (d.lit || /[%+-]/.test(d.t) ? d.t : "")).join("");
  return rand(delen.slice(0, eerste)) + tekst + rand(delen.slice(laatste + 1));
}

function kiesSectie(n: number | null, opmaak: string): [string, number | null] {
  const secties: string[] = [];
  let huidig = "";
  for (let i = 0; i < opmaak.length; i++) {
    const c = opmaak[i];
    if (c === '"') {
      const eind = opmaak.indexOf('"', i + 1);
      huidig += opmaak.slice(i, eind < 0 ? undefined : eind + 1);
      i = eind < 0 ? opmaak.length : eind;
    } else if (c === ";") {
      secties.push(huidig);
      huidig = "";
    } else huidig += c;
  }
  secties.push(huidig);
  if (n === null) return [secties[3] ?? "", null];
  if (n < 0 && secties.length > 1 && secties[1] !== "") return [secties[1], -n];
  if (n === 0 && secties.length > 2 && secties[2] !== "") return [secties[2], 0];
  return [secties[0], n];
}

function datumOpmaak(ms: number, opmaak: string): string {
  const d = new Date(ms);
  const jaar = d.getUTCFullYear(),
    maand = d.getUTCMonth(),
    dag = d.getUTCDate(),
    wd = d.getUTCDay(),
    uur = d.getUTCHours(),
    min = d.getUTCMinutes(),
    sec = d.getUTCSeconds();
  const heeftAmPm = /am\/pm|a\/p|ampm/i.test(opmaak);
  const uur12 = uur % 12 || 12;
  const dagVanJaar =
    Math.floor((Date.UTC(2001, maand, dag) - Date.UTC(2001, 0, 1)) / DAG_MS) +
    1 +
    (maand > 1 && ((jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0) ? 1 : 0);
  const tokens: { t: string; lit: boolean }[] = [];
  for (let i = 0; i < opmaak.length; ) {
    const rest = opmaak.slice(i);
    const c = opmaak[i];
    if (c === '"') {
      const eind = opmaak.indexOf('"', i + 1);
      tokens.push({ t: opmaak.slice(i + 1, eind < 0 ? undefined : eind), lit: true });
      i = eind < 0 ? opmaak.length : eind + 1;
      continue;
    }
    if (c === "\\") {
      tokens.push({ t: opmaak[i + 1] ?? "", lit: true });
      i += 2;
      continue;
    }
    const ampm = /^(am\/pm|a\/p|ampm)/i.exec(rest);
    if (ampm) {
      tokens.push({ t: ampm[0], lit: false });
      i += ampm[0].length;
      continue;
    }
    const reeks = /^([dmyhnswq])\1*/i.exec(rest);
    if (reeks) {
      tokens.push({ t: reeks[0], lit: false });
      i += reeks[0].length;
      continue;
    }
    if (/^ttttt/i.test(rest)) {
      tokens.push({ t: "ttttt", lit: false });
      i += 5;
      continue;
    }
    tokens.push({ t: c, lit: c !== "/" && c !== ":" && c !== "c" && c !== "C" });
    i++;
  }
  const uit: string[] = [];
  tokens.forEach((tok, i) => {
    if (tok.lit) return uit.push(tok.t);
    const t = tok.t.toLowerCase();
    const k = t[0];
    const vorige = tokens.slice(0, i).reverse().find((x) => !x.lit && /[dmyhnsw]/.test(x.t[0].toLowerCase()));
    const volgende = tokens.slice(i + 1).find((x) => !x.lit && /[dmyhnsw]/.test(x.t[0].toLowerCase()));
    const isMinuut =
      k === "m" &&
      t.length <= 2 &&
      ((vorige && vorige.t[0].toLowerCase() === "h") ||
        (volgende && volgende.t[0].toLowerCase() === "s"));
    if (t === "/") return uit.push("-");
    if (t === ":") return uit.push(":");
    if (t === "c") return uit.push(datumOpmaak(ms, uur || min || sec ? "dd-mm-yyyy hh:nn:ss" : "d-m-yyyy"));
    if (t === "ttttt") return uit.push(`${uur}:${twee(min)}:${twee(sec)}`);
    if (/^(am\/pm|ampm)$/.test(t)) return uit.push(uur < 12 ? (tok.t[0] === "A" ? "AM" : "am") : tok.t[0] === "A" ? "PM" : "pm");
    if (t === "a/p") return uit.push(uur < 12 ? (tok.t[0] === "A" ? "A" : "a") : tok.t[0] === "A" ? "P" : "p");
    switch (k) {
      case "d":
        return uit.push(
          [
            "",
            String(dag),
            twee(dag),
            DAGEN_KORT[wd],
            DAGEN[wd],
            `${dag}-${maand + 1}-${jaar}`,
            `${DAGEN[wd]} ${dag} ${MAANDEN[maand]} ${jaar}`,
          ][Math.min(t.length, 6)],
        );
      case "w":
        if (t.length === 1) return uit.push(String(wd + 1));
        return uit.push(String(Math.floor((dagVanJaar - 1 + new Date(Date.UTC(jaar, 0, 1)).getUTCDay()) / 7) + 1));
      case "m":
        if (isMinuut) return uit.push(t.length === 2 ? twee(min) : String(min));
        return uit.push(["", String(maand + 1), twee(maand + 1), MAANDEN_KORT[maand], MAANDEN[maand]][Math.min(t.length, 4)]);
      case "n":
        return uit.push(t.length >= 2 ? twee(min) : String(min));
      case "q":
        return uit.push(String(Math.floor(maand / 3) + 1));
      case "y":
        if (t.length === 1) return uit.push(String(dagVanJaar));
        if (t.length <= 3) return uit.push(twee(jaar % 100));
        return uit.push(String(jaar));
      case "h": {
        const u = heeftAmPm ? uur12 : uur;
        return uit.push(t.length >= 2 ? twee(u) : String(u));
      }
      case "s":
        return uit.push(t.length >= 2 ? twee(sec) : String(sec));
    }
    uit.push(tok.t);
  });
  return uit.join("");
}

const BENOEMD_DATUM: Record<string, string> = {
  "long date": "dddddd",
  "medium date": "dd-mmm-yy",
  "short date": "ddddd",
  "long time": "h:nn:ss",
  "medium time": "hh:nn AM/PM",
  "short time": "hh:nn",
};
const ISO_TEKST = /^-?\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/;

/** VBA Format met de gangbare benoemde en eigen notaties. */
export function formatteer(v: SqlWaarde, opmaak: SqlWaarde): SqlWaarde {
  const fmt = opmaak === null ? "" : String(opmaak);
  const sleutel = fmt.toLowerCase().trim();
  if (v === null) {
    if (fmt.includes(";")) return getalOpmaak(0, kiesSectie(null, fmt)[0]) || "";
    return "";
  }
  if (v instanceof Uint8Array) return cstr(v);
  const alsDatum =
    typeof v === "string" && ISO_TEKST.test(v.trim()) ? msUitIso(v) : null;
  if (sleutel === "") {
    if (alsDatum !== null) return datumOpmaak(alsDatum, "c");
    return cstr(v);
  }
  if (sleutel === "general date") {
    const ms = alsDatum ?? msUitWaarde(v);
    return ms === null ? cstr(v) : datumOpmaak(ms, "c");
  }
  if (sleutel in BENOEMD_DATUM) {
    const ms = alsDatum ?? msUitWaarde(v);
    return ms === null ? cstr(v) : datumOpmaak(ms, BENOEMD_DATUM[sleutel]);
  }
  const n = getal(v);
  const benoemdGetal: Record<string, string> = {
    "general number": "",
    currency: '"€ "#,##0.00;"€ -"#,##0.00',
    euro: '"€ "#,##0.00;"€ -"#,##0.00',
    fixed: "0.00",
    standard: "#,##0.00",
    percent: "0.00%",
    scientific: "0.00E+00",
  };
  const jaNee: Record<string, [string, string]> = {
    "yes/no": ["Ja", "Nee"],
    "true/false": ["Waar", "Onwaar"],
    "on/off": ["Aan", "Uit"],
  };
  if (sleutel in jaNee) {
    if (n === null) return cstr(v);
    return n !== 0 ? jaNee[sleutel][0] : jaNee[sleutel][1];
  }
  if (sleutel in benoemdGetal) {
    if (n === null) return cstr(v);
    if (sleutel === "general number") return cstr(n);
    const [sectie, waarde] = kiesSectie(n, benoemdGetal[sleutel]);
    return getalOpmaak(waarde ?? 0, sectie);
  }
  // Tekstnotaties.
  if (/^[@&<>!]+$/.test(fmt)) {
    const t = cstr(v);
    if (fmt.includes(">")) return t.toUpperCase();
    if (fmt.includes("<")) return t.toLowerCase();
    return t;
  }
  // Eigen datumnotatie als de opmaak datumletters bevat en de waarde een datum is.
  const datumletters = /[dmyhnsqw]|am\/pm|a\/p/i.test(fmt.replace(/"[^"]*"/g, ""));
  if (datumletters && !/[0#]/.test(fmt.replace(/"[^"]*"/g, ""))) {
    const ms = alsDatum ?? msUitWaarde(v);
    if (ms !== null) return datumOpmaak(ms, fmt);
    return cstr(v);
  }
  if (n === null) return cstr(v);
  const [sectie, waarde] = kiesSectie(n, fmt);
  return getalOpmaak(waarde ?? 0, sectie);
}

// ---------------------------------------------------------------------------
// Datumrekenen zoals DateAdd/DateDiff/DatePart.

function intervalNorm(i: SqlWaarde) {
  return String(i ?? "").toLowerCase().trim();
}
function dateAdd(interval: string, n: number, ms: number): number {
  const d = new Date(ms);
  const maandenErbij = (aantal: number) => {
    const jaar = d.getUTCFullYear(),
      maand = d.getUTCMonth() + aantal,
      dag = d.getUTCDate();
    const doelJaar = jaar + Math.floor(maand / 12);
    const doelMaand = ((maand % 12) + 12) % 12;
    const laatste = new Date(utc(doelJaar, doelMaand + 1, 0)).getUTCDate();
    return utc(
      doelJaar,
      doelMaand,
      Math.min(dag, laatste),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    );
  };
  const geheel = Math.trunc(n);
  switch (interval) {
    case "yyyy":
      return maandenErbij(geheel * 12);
    case "q":
      return maandenErbij(geheel * 3);
    case "m":
      return maandenErbij(geheel);
    case "y":
    case "d":
    case "w":
      return ms + geheel * DAG_MS;
    case "ww":
      return ms + geheel * 7 * DAG_MS;
    case "h":
      return ms + geheel * 3_600_000;
    case "n":
      return ms + geheel * 60_000;
    case "s":
      return ms + geheel * 1000;
  }
  throw new Error(i18next.t("database:functions.unknownInterval", { interval, fn: "DateAdd" }));
}
function dagNummer(ms: number) {
  return Math.floor((ms - OLE_NUL) / DAG_MS);
}
function datePart(interval: string, ms: number, eersteDag = 1): number {
  const d = new Date(ms);
  const wd = d.getUTCDay(); // 0 = zondag
  switch (interval) {
    case "yyyy":
      return d.getUTCFullYear();
    case "q":
      return Math.floor(d.getUTCMonth() / 3) + 1;
    case "m":
      return d.getUTCMonth() + 1;
    case "y":
      return (
        dagNummer(ms) -
        dagNummer(utc(d.getUTCFullYear(), 0, 1)) +
        1
      );
    case "d":
      return d.getUTCDate();
    case "w":
      return ((wd - (eersteDag - 1) + 7) % 7) + 1;
    case "ww": {
      const jan1 = new Date(utc(d.getUTCFullYear(), 0, 1)).getUTCDay();
      const verschuiving = (jan1 - (eersteDag - 1) + 7) % 7;
      return Math.floor((datePart("y", ms) - 1 + verschuiving) / 7) + 1;
    }
    case "h":
      return d.getUTCHours();
    case "n":
      return d.getUTCMinutes();
    case "s":
      return d.getUTCSeconds();
  }
  throw new Error(i18next.t("database:functions.unknownInterval", { interval, fn: "DatePart" }));
}
function dateDiff(interval: string, a: number, b: number, eersteDag = 1): number {
  const da = new Date(a),
    db = new Date(b);
  switch (interval) {
    case "yyyy":
      return db.getUTCFullYear() - da.getUTCFullYear();
    case "q":
      return (
        (db.getUTCFullYear() - da.getUTCFullYear()) * 4 +
        Math.floor(db.getUTCMonth() / 3) -
        Math.floor(da.getUTCMonth() / 3)
      );
    case "m":
      return (
        (db.getUTCFullYear() - da.getUTCFullYear()) * 12 +
        db.getUTCMonth() -
        da.getUTCMonth()
      );
    case "y":
    case "d":
      return dagNummer(b) - dagNummer(a);
    case "w":
      return Math.trunc((dagNummer(b) - dagNummer(a)) / 7);
    case "ww": {
      // Aantal keren dat de eerste dag van de week wordt gepasseerd.
      const weekBegin = (ms: number) => {
        const dag = dagNummer(ms);
        const wd = new Date(OLE_NUL + dag * DAG_MS).getUTCDay();
        return dag - ((wd - (eersteDag - 1) + 7) % 7);
      };
      return (weekBegin(b) - weekBegin(a)) / 7;
    }
    case "h":
      return Math.floor((b - OLE_NUL) / 3_600_000) - Math.floor((a - OLE_NUL) / 3_600_000);
    case "n":
      return Math.floor((b - OLE_NUL) / 60_000) - Math.floor((a - OLE_NUL) / 60_000);
    case "s":
      return Math.floor((b - OLE_NUL) / 1000) - Math.floor((a - OLE_NUL) / 1000);
  }
  throw new Error(i18next.t("database:functions.unknownInterval", { interval, fn: "DateDiff" }));
}

// ---------------------------------------------------------------------------
// Jokertekens van Access-Like.

const likeCache = new Map<string, RegExp>();
export function likePatroon(patroon: string): RegExp {
  let r = likeCache.get(patroon);
  if (r) return r;
  let bron = "";
  for (let i = 0; i < patroon.length; i++) {
    const c = patroon[i];
    if (c === "*") bron += "[\\s\\S]*";
    else if (c === "?") bron += "[\\s\\S]";
    else if (c === "#") bron += "[0-9]";
    else if (c === "[") {
      const eind = patroon.indexOf("]", i + 1);
      if (eind < 0) {
        bron += "\\[";
        continue;
      }
      let inhoud = patroon.slice(i + 1, eind);
      i = eind;
      let niet = false;
      if (inhoud.startsWith("!") && inhoud.length > 1) {
        niet = true;
        inhoud = inhoud.slice(1);
      }
      if (inhoud === "") {
        bron += niet ? "!" : "";
        continue;
      }
      const klasse = inhoud.replace(/[\\\]^]/g, "\\$&");
      bron += `[${niet ? "^" : ""}${klasse}]`;
    } else bron += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  r = new RegExp(`^${bron}$`, "iu");
  if (likeCache.size > 500) likeCache.clear();
  likeCache.set(patroon, r);
  return r;
}

// ---------------------------------------------------------------------------

function val(v: SqlWaarde): number {
  if (v === null) return 0;
  if (typeof v === "number") return v;
  const t = String(v).replace(/[\s\t\n]/g, "");
  const hex = /^&[hH]([0-9a-fA-F]+)/.exec(t);
  if (hex) return parseInt(hex[1], 16);
  const oct = /^&[oO]([0-7]+)/.exec(t);
  if (oct) return parseInt(oct[1], 8);
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?/.exec(t);
  return m ? Number(m[0].replace(/[dD]/, "e")) : 0;
}

function datumUit(v: SqlWaarde): number | null {
  return msUitWaarde(v);
}

function eersteDag(v: SqlWaarde) {
  const n = getal(v);
  return n && n >= 1 && n <= 7 ? n : 1;
}

/** Variance-hulp voor StDev/Var. */
interface Statistiek {
  n: number;
  som: number;
  kwadraten: number;
}

/**
 * Registreert alle `acc_`-functies op een sql.js-database. Moet na elke
 * `export()` opnieuw, omdat sql.js dan de verbinding heropent.
 */
export function registreerAccessFuncties(db: Database) {
  const f = (naam: string, arity: number, fn: (...a: SqlWaarde[]) => SqlWaarde) => {
    const wrapper = (...args: SqlWaarde[]) => {
      const uit = fn(...args);
      return typeof uit === "number" && !Number.isFinite(uit) ? null : uit;
    };
    Object.defineProperty(wrapper, "length", { value: arity });
    db.create_function(naam, wrapper);
  };
  f("acc_concat", 2, (a, b) =>
    a === null && b === null ? null : cstr(a) + cstr(b),
  );
  f("acc_cstr", 1, (a) => (a === null ? null : cstr(a)));
  f("acc_str", 1, (a) => {
    if (a === null) return null;
    const n = getal(a);
    if (n === null) return String(a);
    return (n >= 0 ? " " : "") + String(Number(n.toPrecision(15)));
  });
  f("acc_ucase", 1, (a) => (a === null ? null : cstr(a).toUpperCase()));
  f("acc_lcase", 1, (a) => (a === null ? null : cstr(a).toLowerCase()));
  f("acc_right", 2, (s, n) => {
    if (s === null) return null;
    const t = cstr(s);
    const k = Math.max(0, Math.trunc(getal(n) ?? 0));
    return k === 0 ? "" : t.slice(-k);
  });
  f("acc_instr", 4, (start, s1, s2, cmp) => {
    if (s1 === null || s2 === null) return null;
    const begin = Math.max(1, Math.trunc(getal(start) ?? 1));
    const binair = getal(cmp) === 0;
    const a = binair ? cstr(s1) : cstr(s1).toLowerCase();
    const b = binair ? cstr(s2) : cstr(s2).toLowerCase();
    if (b === "") return begin <= a.length + 1 ? begin : 0;
    return a.indexOf(b, begin - 1) + 1;
  });
  f("acc_instrrev", 4, (s1, s2, start, cmp) => {
    if (s1 === null || s2 === null) return null;
    const binair = getal(cmp) === 0;
    const a = binair ? cstr(s1) : cstr(s1).toLowerCase();
    const b = binair ? cstr(s2) : cstr(s2).toLowerCase();
    const s = getal(start);
    const vanaf = s === null || s < 0 ? a.length : s - 1;
    return a.lastIndexOf(b, vanaf - b.length + 1) + 1;
  });
  f("acc_space", 1, (n) => " ".repeat(Math.max(0, Math.trunc(getal(n) ?? 0))));
  f("acc_string", 2, (n, c) => {
    if (c === null) return null;
    const teken = typeof c === "number" ? String.fromCharCode(c) : cstr(c)[0] ?? "";
    return teken.repeat(Math.max(0, Math.trunc(getal(n) ?? 0)));
  });
  f("acc_strreverse", 1, (s) => (s === null ? null : [...cstr(s)].reverse().join("")));
  f("acc_strcomp", 3, (a, b, cmp) => {
    if (a === null || b === null) return null;
    const binair = getal(cmp) === 0;
    const x = binair ? cstr(a) : cstr(a).toLowerCase();
    const y = binair ? cstr(b) : cstr(b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  f("acc_format", 2, (v, fmt) => formatteer(v, fmt));
  f("acc_val", 1, (v) => val(v));
  f("acc_hex", 1, (v) => {
    const n = getal(v);
    return n === null ? null : (Math.round(n) >>> 0).toString(16).toUpperCase();
  });
  f("acc_oct", 1, (v) => {
    const n = getal(v);
    return n === null ? null : (Math.round(n) >>> 0).toString(8);
  });
  f("acc_cint", 1, (v) => {
    const n = getal(v);
    if (n === null) return v === null ? null : 0;
    return rondAf(n);
  });
  f("acc_int", 1, (v) => {
    const n = getal(v);
    return n === null ? null : Math.floor(n);
  });
  f("acc_fix", 1, (v) => {
    const n = getal(v);
    return n === null ? null : Math.trunc(n);
  });
  f("acc_round", 2, (v, d) => {
    const n = getal(v);
    return n === null ? null : rondAf(n, Math.trunc(getal(d) ?? 0));
  });
  f("acc_intdiv", 2, (a, b) => {
    const x = getal(a),
      y = getal(b);
    if (x === null || y === null) return null;
    const ry = rondAf(y);
    return ry === 0 ? null : Math.trunc(rondAf(x) / ry);
  });
  f("acc_mod", 2, (a, b) => {
    const x = getal(a),
      y = getal(b);
    if (x === null || y === null) return null;
    const ry = rondAf(y);
    return ry === 0 ? null : rondAf(x) % ry;
  });
  f("acc_cbool", 1, (v) => {
    if (v === null) return null;
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (["true", "waar", "ja", "yes", "on", "aan"].includes(t)) return 1;
      if (["false", "onwaar", "nee", "no", "off", "uit"].includes(t)) return 0;
    }
    const n = getal(v);
    return n === null ? null : n !== 0 ? 1 : 0;
  });
  f("acc_isnumeric", 1, (v) => (v !== null && getal(v) !== null ? 1 : 0));
  f("acc_isdate", 1, (v) =>
    typeof v === "string" && msUitTekst(v) !== null ? 1 : 0,
  );
  f("acc_like", 2, (v, p) => {
    if (v === null || p === null) return null;
    return likePatroon(cstr(p)).test(cstr(v)) ? 1 : 0;
  });
  f("acc_rnd", 1, () => Math.random());
  // Datums.
  f("acc_cdate", 1, (v) => {
    const ms = datumUit(v);
    return ms === null ? null : isoUitMs(ms);
  });
  f("acc_datevalue", 1, (v) => {
    const ms = datumUit(v);
    if (ms === null) return null;
    return isoUitMs(Math.floor((ms - OLE_NUL) / DAG_MS) * DAG_MS + OLE_NUL);
  });
  f("acc_timevalue", 1, (v) => {
    const ms = datumUit(v);
    if (ms === null) return null;
    const rest = (((ms - OLE_NUL) % DAG_MS) + DAG_MS) % DAG_MS;
    return isoUitMs(OLE_NUL + rest).replace(/^1899-12-30$/, "1899-12-30T00:00:00");
  });
  f("acc_datumplus", 2, (d, n) => {
    const ms = datumUit(d);
    const dagen = getal(n);
    if (ms === null || dagen === null) return null;
    return isoUitMs(ms + Math.round(dagen * DAG_MS));
  });
  f("acc_dateadd", 3, (i, n, d) => {
    const ms = datumUit(d);
    const aantal = getal(n);
    if (ms === null || aantal === null) return null;
    return isoUitMs(dateAdd(intervalNorm(i), aantal, ms));
  });
  f("acc_datediff", 4, (i, a, b, fdow) => {
    const x = datumUit(a),
      y = datumUit(b);
    if (x === null || y === null) return null;
    return dateDiff(intervalNorm(i), x, y, eersteDag(fdow));
  });
  f("acc_datepart", 3, (i, d, fdow) => {
    const ms = datumUit(d);
    if (ms === null) return null;
    return datePart(intervalNorm(i), ms, eersteDag(fdow));
  });
  f("acc_dateserial", 3, (j, m, d) => {
    const jaar = getal(j),
      maand = getal(m),
      dag = getal(d);
    if (jaar === null || maand === null || dag === null) return null;
    return isoUitMs(utc(jaar2(Math.trunc(jaar)), Math.trunc(maand) - 1, Math.trunc(dag)));
  });
  f("acc_timeserial", 3, (h, m, s) => {
    const uur = getal(h),
      min = getal(m),
      sec = getal(s);
    if (uur === null || min === null || sec === null) return null;
    const ms = OLE_NUL + ((uur * 60 + min) * 60 + sec) * 1000;
    const iso = isoUitMs(ms);
    return iso.includes("T") ? iso : iso + "T00:00:00";
  });
  f("acc_monthname", 2, (m, kort) => {
    const n = getal(m);
    if (n === null || n < 1 || n > 12) return null;
    return (getal(kort) ? MAANDEN_KORT : MAANDEN)[Math.trunc(n) - 1];
  });
  f("acc_weekdayname", 3, (w, kort, fdow) => {
    const n = getal(w);
    if (n === null || n < 1 || n > 7) return null;
    const index = (Math.trunc(n) - 1 + eersteDag(fdow) - 1) % 7;
    return (getal(kort) ? DAGEN_KORT : DAGEN)[index];
  });
  f("acc_nu", 0, () => isoUitMs(lokaalNu()));
  f("acc_vandaag", 0, () => isoUitMs(Math.floor(lokaalNu() / DAG_MS) * DAG_MS));
  f("acc_tijd", 0, () => {
    const nu = lokaalNu();
    const t = isoUitMs(OLE_NUL + (((nu % DAG_MS) + DAG_MS) % DAG_MS));
    return t.includes("T") ? t : t + "T00:00:00";
  });

  // Aggregaten: First, Last, StDev, StDevP, Var, VarP.
  const aggregaat = (
    naam: string,
    definitie: {
      init: () => unknown;
      step: (staat: never, waarde: SqlWaarde) => unknown;
      finalize: (staat: never) => SqlWaarde;
    },
  ) =>
    (
      db as unknown as {
        create_aggregate: (naam: string, d: typeof definitie) => void;
      }
    ).create_aggregate(naam, definitie);
  aggregaat("acc_first", {
    init: () => ({ gezet: false, waarde: null }),
    step: (s: { gezet: boolean; waarde: SqlWaarde }, v) => {
      if (!s.gezet) {
        s.gezet = true;
        s.waarde = v;
      }
      return s;
    },
    finalize: (s: { waarde: SqlWaarde }) => s.waarde ?? null,
  });
  aggregaat("acc_last", {
    init: () => ({ waarde: null }),
    step: (s: { waarde: SqlWaarde }, v) => {
      s.waarde = v;
      return s;
    },
    finalize: (s: { waarde: SqlWaarde }) => s.waarde ?? null,
  });
  const statistiek = (populatie: boolean, wortel: boolean) => ({
    init: (): Statistiek => ({ n: 0, som: 0, kwadraten: 0 }),
    step: (s: Statistiek, v: SqlWaarde) => {
      const n = getal(v);
      if (n !== null) {
        s.n++;
        s.som += n;
        s.kwadraten += n * n;
      }
      return s;
    },
    finalize: (s: Statistiek) => {
      const noemer = populatie ? s.n : s.n - 1;
      if (noemer <= 0) return null;
      const variantie = Math.max(0, (s.kwadraten - (s.som * s.som) / s.n) / noemer);
      return wortel ? Math.sqrt(variantie) : variantie;
    },
  });
  aggregaat("acc_stdev", statistiek(false, true));
  aggregaat("acc_stdevp", statistiek(true, true));
  aggregaat("acc_var", statistiek(false, false));
  aggregaat("acc_varp", statistiek(true, false));
}

/** Lokale kloktijd als ‘UTC-milliseconden’, zoals Access datums zonder tijdzone bewaart. */
function lokaalNu() {
  const nu = new Date();
  return nu.getTime() - nu.getTimezoneOffset() * 60_000;
}
