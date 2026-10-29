/**
 * Runtimebibliotheek: de ingebouwde VBA-functies en -constanten. Access- en
 * DAO-onderdelen staan in access.ts en dao.ts; afgeschermde functies in afscherming.ts.
 */
import i18next from "i18next";
import { GEWEIGERDE_FUNCTIES, weiger } from "./afscherming.ts";
import { dagenInMaand, delenVan, serieVan, serieVanJs, splits } from "./datum.ts";
import { fout, foutTekst, VbaAfbreking } from "./fouten.ts";
import { dagVanJaar, formatteer, langeDatum, vastGetal, weekdag, weekVanJaar } from "./format.ts";
import type { Bibliotheek, Ingebouwd, VbaRuntime } from "./interpreter.ts";
import { lijktOp, vergelijkTekst, type Vergelijking } from "./operatoren.ts";
import {
  Datum,
  Foutwaarde,
  Getal,
  LEEG,
  Leeg,
  NIETS,
  NULL,
  Niets,
  NullWaarde,
  Ontbrekend,
  VbaMatrix,
  VbaObject,
  VbaRecord,
  bankAfronden,
  dbl,
  int,
  lng,
  maakGetal,
  naarBool,
  naarDatum,
  naarGetal,
  naarTekst,
  naarType,
  rondAf,
  sng,
  tekstNaarGetal,
  typeNaam,
  varType,
  type VbaWaarde,
} from "./waarden.ts";
import { DebugObject, ErrObject, Collectie, Woordenboek } from "./objecten.ts";
import { accessFuncties, accessGlobalen, ACCESS_CONSTANTEN } from "./access.ts";
import { daoFuncties, daoGlobalen, DAO_CONSTANTEN } from "./dao.ts";

const ontbreekt = (w: VbaWaarde | undefined): w is undefined | Ontbrekend => w === undefined || w instanceof Ontbrekend;

function getal(w: VbaWaarde, rt: VbaRuntime) {
  return naarGetal(w, rt.land);
}
function geheel(w: VbaWaarde, rt: VbaRuntime) {
  return bankAfronden(naarGetal(w, rt.land));
}
function tekst(w: VbaWaarde, rt: VbaRuntime) {
  return naarTekst(w, rt.land);
}
function vergelijkModus(w: VbaWaarde | undefined, rt: VbaRuntime): Vergelijking {
  if (ontbreekt(w)) return rt.vergelijkModus;
  const n = geheel(w, rt);
  return n === 0 ? "binary" : n === 1 ? "text" : n === 2 ? "database" : "binary";
}
function nodig(w: VbaWaarde | undefined): VbaWaarde {
  if (ontbreekt(w)) throw fout(449);
  return w;
}
const lengteTekst = (n: number) => {
  if (n < 0) throw fout(5);
  return n;
};

// ---------- tekst ----------

function zoekIn(hooi: string, naald: string, start: number, modus: Vergelijking) {
  if (modus !== "binary") {
    hooi = hooi.toLocaleLowerCase();
    naald = naald.toLocaleLowerCase();
  }
  return hooi.indexOf(naald, start);
}

const functies: Record<string, Ingebouwd> = {
  len: {
    fn: ([s], rt) => (s instanceof NullWaarde ? NULL : lng(s instanceof VbaRecord ? 0 : tekst(nodig(s), rt).length)),
  },
  left: {
    params: ["String", "Length"],
    fn: ([s, n], rt) => (s instanceof NullWaarde ? NULL : tekst(s, rt).slice(0, lengteTekst(getal(nodig(n), rt)))),
  },
  right: {
    params: ["String", "Length"],
    fn: ([s, n], rt) => {
      if (s instanceof NullWaarde) return NULL;
      const t = tekst(s, rt);
      const l = lengteTekst(getal(nodig(n), rt));
      return l === 0 ? "" : t.slice(-l);
    },
  },
  mid: {
    params: ["String", "Start", "Length"],
    fn: ([s, start, n], rt) => {
      if (s instanceof NullWaarde) return NULL;
      const t = tekst(s, rt);
      const b = geheel(nodig(start), rt);
      if (b < 1) throw fout(5);
      if (ontbreekt(n)) return t.slice(b - 1);
      return t.substr(b - 1, lengteTekst(geheel(n, rt)));
    },
  },
  instr: {
    params: ["Start", "String1", "String2", "Compare"],
    fn: (args, rt) => {
      let [start, s1, s2, cmp]: (VbaWaarde | undefined)[] = args;
      if (ontbreekt(s2) && !ontbreekt(s1)) {
        // InStr(s1, s2)
        cmp = undefined;
        s2 = s1;
        s1 = start;
        start = int(1);
      }
      if (s1 instanceof NullWaarde || s2 instanceof NullWaarde) return NULL;
      const b = ontbreekt(start) ? 1 : geheel(start, rt);
      if (b < 1) throw fout(5);
      const hooi = tekst(nodig(s1), rt);
      const naald = tekst(nodig(s2), rt);
      if (b > hooi.length) return lng(0);
      if (naald === "") return lng(b);
      return lng(zoekIn(hooi, naald, b - 1, vergelijkModus(cmp, rt)) + 1);
    },
  },
  instrrev: {
    params: ["StringCheck", "StringMatch", "Start", "Compare"],
    fn: ([s1, s2, start, cmp], rt) => {
      if (s1 instanceof NullWaarde || s2 instanceof NullWaarde) return NULL;
      let hooi = tekst(nodig(s1), rt);
      let naald = tekst(nodig(s2), rt);
      const b = ontbreekt(start) ? -1 : geheel(start, rt);
      if (b === 0 || b < -1) throw fout(5);
      const vanaf = b === -1 ? hooi.length : b;
      if (naald === "") return lng(vanaf > hooi.length ? 0 : vanaf);
      if (vergelijkModus(cmp, rt) !== "binary") {
        hooi = hooi.toLocaleLowerCase();
        naald = naald.toLocaleLowerCase();
      }
      if (vanaf - naald.length < 0) return lng(0);
      return lng(hooi.lastIndexOf(naald, vanaf - naald.length) + 1);
    },
  },
  replace: {
    params: ["Expression", "Find", "Replace", "Start", "Count", "Compare"],
    fn: ([s, zoek, door, start, aantal, cmp], rt) => {
      if (s instanceof NullWaarde) throw fout(94);
      const t = tekst(s, rt);
      const z = tekst(nodig(zoek), rt);
      const d = tekst(nodig(door), rt);
      const b = ontbreekt(start) ? 1 : geheel(start, rt);
      let max = ontbreekt(aantal) ? -1 : geheel(aantal, rt);
      if (b < 1) throw fout(5);
      const rest = t.slice(b - 1);
      if (z === "" || max === 0) return rest;
      const modus = vergelijkModus(cmp, rt);
      let uit = "";
      let i = 0;
      for (;;) {
        const j = zoekIn(rest, z, i, modus);
        if (j < 0 || max === 0) break;
        uit += rest.slice(i, j) + d;
        i = j + z.length;
        if (max > 0) max--;
      }
      return uit + rest.slice(i);
    },
  },
  split: {
    params: ["Expression", "Delimiter", "Limit", "Compare"],
    fn: ([s, scheiding, limiet, cmp], rt) => {
      const t = s instanceof NullWaarde ? "" : tekst(nodig(s), rt);
      const sch = ontbreekt(scheiding) ? " " : tekst(scheiding, rt);
      const max = ontbreekt(limiet) ? -1 : geheel(limiet, rt);
      let delen: string[];
      if (t === "") delen = [];
      else if (sch === "") delen = [t];
      else {
        delen = [];
        const modus = vergelijkModus(cmp, rt);
        let i = 0;
        for (;;) {
          if (max > 0 && delen.length === max - 1) break;
          const j = zoekIn(t, sch, i, modus);
          if (j < 0) break;
          delen.push(t.slice(i, j));
          i = j + sch.length;
        }
        delen.push(t.slice(i));
      }
      return new VbaMatrix([{ onder: 0, boven: delen.length - 1 }], delen, "String");
    },
  },
  join: {
    params: ["SourceArray", "Delimiter"],
    fn: ([m, scheiding], rt) => {
      if (!(m instanceof VbaMatrix)) throw fout(13);
      if (m.grenzen.length > 1) throw fout(5);
      return m.data.map((w) => (w instanceof NullWaarde ? "" : tekst(w, rt))).join(ontbreekt(scheiding) ? " " : tekst(scheiding, rt));
    },
  },
  trim: { fn: ([s], rt) => (s instanceof NullWaarde ? NULL : tekst(nodig(s), rt).replace(/^ +| +$/g, "")) },
  ltrim: { fn: ([s], rt) => (s instanceof NullWaarde ? NULL : tekst(nodig(s), rt).replace(/^ +/, "")) },
  rtrim: { fn: ([s], rt) => (s instanceof NullWaarde ? NULL : tekst(nodig(s), rt).replace(/ +$/, "")) },
  ucase: { fn: ([s], rt) => (s instanceof NullWaarde ? NULL : tekst(nodig(s), rt).toUpperCase()) },
  lcase: { fn: ([s], rt) => (s instanceof NullWaarde ? NULL : tekst(nodig(s), rt).toLowerCase()) },
  strcomp: {
    params: ["String1", "String2", "Compare"],
    fn: ([a, b, cmp], rt) => {
      if (a instanceof NullWaarde || b instanceof NullWaarde) return NULL;
      return int(vergelijkTekst(tekst(nodig(a), rt), tekst(nodig(b), rt), vergelijkModus(cmp, rt)));
    },
  },
  space: { fn: ([n], rt) => " ".repeat(lengteTekst(geheel(nodig(n), rt))) },
  string: {
    params: ["Number", "Character"],
    fn: ([n, c], rt) => {
      if (c instanceof NullWaarde) return NULL;
      const teken = typeof c === "string" ? c[0] : String.fromCharCode(geheel(nodig(c), rt) % 256);
      if (teken === undefined) throw fout(5);
      return teken.repeat(lengteTekst(geheel(nodig(n), rt)));
    },
  },
  chr: {
    fn: ([n], rt) => {
      const c = geheel(nodig(n), rt);
      if (c < -32768 || c > 65535) throw fout(5);
      return String.fromCharCode(c < 0 ? c + 65536 : c);
    },
  },
  asc: {
    fn: ([s], rt) => {
      const t = tekst(nodig(s), rt);
      if (!t) throw fout(5);
      return int(t.charCodeAt(0) > 32767 ? t.charCodeAt(0) - 65536 : t.charCodeAt(0));
    },
  },
  strconv: {
    params: ["String", "Conversion", "LocaleID"],
    fn: ([s, c], rt) => {
      if (s instanceof NullWaarde) return NULL;
      const t = tekst(s, rt);
      const n = geheel(nodig(c), rt);
      if (n & 1 && !(n & 2)) return t.toUpperCase();
      if (n & 2 && !(n & 1)) return t.toLowerCase();
      if ((n & 3) === 3) return t.toLowerCase().replace(/(^|[\s\-.,;:'"(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
      return t;
    },
  },
  strreverse: { fn: ([s], rt) => [...tekst(nodig(s), rt)].reverse().join("") },
  hex: {
    fn: ([n], rt) => {
      if (n instanceof NullWaarde) return NULL;
      const x = geheel(nodig(n), rt);
      return (x < 0 ? (x >>> 0) & (x >= -32768 && n instanceof Getal && n.soort === "Integer" ? 0xffff : 0xffffffff) : x).toString(16).toUpperCase();
    },
  },
  oct: {
    fn: ([n], rt) => {
      if (n instanceof NullWaarde) return NULL;
      const x = geheel(nodig(n), rt);
      return (x < 0 ? x >>> 0 : x).toString(8);
    },
  },
  val: {
    fn: ([s], rt) => {
      const t = tekst(nodig(s), rt).replace(/[\s]/g, "");
      const hex = /^&[hH]([0-9a-fA-F]+)/.exec(t);
      if (hex) return dbl(parseInt(hex[1], 16));
      const oct = /^&[oO]?([0-7]+)/.exec(t);
      if (oct) return dbl(parseInt(oct[1], 8));
      const m = /^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?/.exec(t);
      return dbl(m ? Number(m[0].replace(/[dD]/, "e")) : 0);
    },
  },
  str: {
    fn: ([n], rt) => {
      if (n instanceof NullWaarde) return NULL;
      const w = nodig(n);
      const t = naarTekst(w instanceof Getal ? w : dbl(getal(w, rt)), { ...rt.land, decimaal: "." });
      return t.startsWith("-") ? t : " " + t;
    },
  },
  format: {
    params: ["Expression", "Format", "FirstDayOfWeek", "FirstWeekOfYear"],
    fn: ([w, patroon, eersteDag, eersteWeek], rt) =>
      formatteer(
        nodig(w),
        ontbreekt(patroon) ? undefined : tekst(patroon, rt),
        rt.land,
        ontbreekt(eersteDag) ? 1 : geheel(eersteDag, rt) || 1,
        ontbreekt(eersteWeek) ? 1 : geheel(eersteWeek, rt) || 1,
      ),
  },
  formatnumber: {
    params: ["Expression", "NumDigitsAfterDecimal", "IncludeLeadingDigit", "UseParensForNegativeNumbers", "GroupDigits"],
    fn: (args, rt) => formatGetal(args, rt, ""),
  },
  formatcurrency: {
    params: ["Expression", "NumDigitsAfterDecimal", "IncludeLeadingDigit", "UseParensForNegativeNumbers", "GroupDigits"],
    fn: (args, rt) => formatGetal(args, rt, "valuta"),
  },
  formatpercent: {
    params: ["Expression", "NumDigitsAfterDecimal", "IncludeLeadingDigit", "UseParensForNegativeNumbers", "GroupDigits"],
    fn: (args, rt) => formatGetal(args, rt, "%"),
  },
  formatdatetime: {
    params: ["Date", "NamedFormat"],
    fn: ([d, soort], rt) => {
      const n = ontbreekt(soort) ? 0 : geheel(soort, rt);
      const naam = ["General Date", "Long Date", "Short Date", "Long Time", "Short Time"][n];
      if (!naam) throw fout(5);
      return formatteer(new Datum(naarDatum(nodig(d), rt.land)), naam, rt.land);
    },
  },

  // ---------- conversie ----------
  cint: { fn: ([w], rt) => naarType(nodig(w), "Integer", rt.land) },
  clng: { fn: ([w], rt) => naarType(nodig(w), "Long", rt.land) },
  clnglng: { fn: ([w], rt) => naarType(nodig(w), "Double", rt.land) },
  clngptr: { fn: ([w], rt) => naarType(nodig(w), "Long", rt.land) },
  cbyte: { fn: ([w], rt) => naarType(nodig(w), "Byte", rt.land) },
  cdbl: { fn: ([w], rt) => naarType(nodig(w), "Double", rt.land) },
  csng: { fn: ([w], rt) => naarType(nodig(w), "Single", rt.land) },
  ccur: { fn: ([w], rt) => naarType(nodig(w), "Currency", rt.land) },
  cdec: { fn: ([w], rt) => maakGetal("Decimal", getal(nodig(w), rt)) },
  cstr: { fn: ([w], rt) => naarType(nodig(w), "String", rt.land) },
  cbool: { fn: ([w], rt) => naarType(nodig(w), "Boolean", rt.land) },
  cdate: { fn: ([w], rt) => naarType(nodig(w), "Date", rt.land) },
  cvdate: { fn: ([w], rt) => (w instanceof NullWaarde ? NULL : naarType(nodig(w), "Date", rt.land)) },
  cvar: { fn: ([w]) => nodig(w) },
  cverr: { fn: ([w], rt) => new Foutwaarde(geheel(nodig(w), rt)) },
  isnumeric: {
    fn: ([w], rt) => {
      if (w instanceof Getal) return true;
      if (typeof w === "boolean" || w instanceof Leeg) return true;
      if (typeof w === "string") return tekstNaarGetal(w, rt.land) !== null;
      return false;
    },
  },
  isdate: {
    fn: ([w], rt) => {
      if (w instanceof Datum) return true;
      if (typeof w === "string") {
        try {
          naarDatum(w, rt.land);
          return !/^\s*[+-]?\d+([.,]\d+)?\s*$/.test(w);
        } catch {
          return false;
        }
      }
      return false;
    },
  },
  isnull: { fn: ([w]) => w instanceof NullWaarde },
  isempty: { fn: ([w]) => w instanceof Leeg },
  isarray: { ruw: true, fn: ([w]) => w instanceof VbaMatrix },
  isobject: { ruw: true, fn: ([w]) => w instanceof VbaObject || w instanceof Niets },
  ismissing: { ruw: true, fn: ([w]) => w instanceof Ontbrekend },
  iserror: { fn: ([w]) => w instanceof Foutwaarde },
  typename: { ruw: true, fn: ([w]) => typeNaam(nodig(w)) },
  vartype: { ruw: true, fn: ([w]) => int(varType(nodig(w))) },

  // ---------- wiskunde ----------
  abs: {
    fn: ([w], rt) => {
      if (w instanceof NullWaarde) return NULL;
      const v = nodig(w);
      if (v instanceof Getal) return maakGetal(v.soort, Math.abs(v.w));
      return dbl(Math.abs(getal(v, rt)));
    },
  },
  int: { fn: ([w], rt) => afkappen(w, rt, Math.floor) },
  fix: { fn: ([w], rt) => afkappen(w, rt, Math.trunc) },
  round: {
    params: ["Number", "NumDigitsAfterDecimal"],
    fn: ([w, d], rt) => {
      if (w instanceof NullWaarde) return NULL;
      const n = ontbreekt(d) ? 0 : geheel(d, rt);
      if (n < 0) throw fout(5);
      const v = nodig(w);
      const r = rondAf(getal(v, rt), n);
      if (v instanceof Getal) return maakGetal(v.soort === "Single" ? "Single" : v.soort, r);
      return dbl(r);
    },
  },
  sqr: {
    fn: ([w], rt) => {
      const x = getal(nodig(w), rt);
      if (x < 0) throw fout(5);
      return dbl(Math.sqrt(x));
    },
  },
  sgn: { fn: ([w], rt) => (w instanceof NullWaarde ? NULL : int(Math.sign(getal(nodig(w), rt)))) },
  exp: {
    fn: ([w], rt) => {
      const r = Math.exp(getal(nodig(w), rt));
      if (!Number.isFinite(r)) throw fout(6);
      return dbl(r);
    },
  },
  log: {
    fn: ([w], rt) => {
      const x = getal(nodig(w), rt);
      if (x <= 0) throw fout(5);
      return dbl(Math.log(x));
    },
  },
  sin: { fn: ([w], rt) => dbl(Math.sin(getal(nodig(w), rt))) },
  cos: { fn: ([w], rt) => dbl(Math.cos(getal(nodig(w), rt))) },
  tan: { fn: ([w], rt) => dbl(Math.tan(getal(nodig(w), rt))) },
  atn: { fn: ([w], rt) => dbl(Math.atan(getal(nodig(w), rt))) },
  rnd: {
    fn: ([w], rt) => {
      const st = rt.staat;
      const n = ontbreekt(w) ? 1 : getal(w, rt);
      if (n === 0) return sng((st.get("rnd") as number) ?? 0);
      if (n < 0) st.set("rndZaad", Math.abs(n) * 7919);
      let r: number;
      if (st.has("rndZaad")) {
        // Deterministische reeks na Randomize n of Rnd(-n)
        let z = st.get("rndZaad") as number;
        z = (z * 1103515245 + 12345) % 2147483648;
        st.set("rndZaad", z);
        r = z / 2147483648;
      } else r = (rt.opties.willekeurig ?? Math.random)();
      st.set("rnd", r);
      return sng(r);
    },
  },
  randomize: {
    fn: ([w], rt) => {
      if (!ontbreekt(w)) rt.staat.set("rndZaad", Math.abs(getal(w, rt)) * 7919 + 1);
      else rt.staat.delete("rndZaad");
      return LEEG;
    },
  },

  // ---------- datum en tijd ----------
  date: { fn: (_a, rt) => new Datum(Math.trunc(serieVanJs(rt.nu()))) },
  now: { fn: (_a, rt) => new Datum(serieVanJs(rt.nu())) },
  time: {
    fn: (_a, rt) => {
      const s = serieVanJs(rt.nu());
      return new Datum(s - Math.trunc(s));
    },
  },
  timer: {
    fn: (_a, rt) => {
      const d = rt.nu();
      return sng(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000);
    },
  },
  year: { fn: ([w], rt) => datumDeel(w, rt, (d) => d.jaar) },
  month: { fn: ([w], rt) => datumDeel(w, rt, (d) => d.maand) },
  day: { fn: ([w], rt) => datumDeel(w, rt, (d) => d.dag) },
  hour: { fn: ([w], rt) => datumDeel(w, rt, (d) => d.uur) },
  minute: { fn: ([w], rt) => datumDeel(w, rt, (d) => d.minuut) },
  second: { fn: ([w], rt) => datumDeel(w, rt, (d) => d.seconde) },
  weekday: {
    params: ["Date", "FirstDayOfWeek"],
    fn: ([w, eerste], rt) => datumDeel(w, rt, (d) => weekdag(d, ontbreekt(eerste) ? 1 : geheel(eerste, rt) || 1)),
  },
  dateserial: {
    params: ["Year", "Month", "Day"],
    fn: ([j, m, d], rt) => {
      let jaar = geheel(nodig(j), rt);
      if (jaar >= 0 && jaar < 30) jaar += 2000;
      else if (jaar >= 30 && jaar < 100) jaar += 1900;
      const s = serieVan(jaar, geheel(nodig(m), rt), geheel(nodig(d), rt));
      if (s < -657434 || s > 2958465) throw fout(5);
      return new Datum(s);
    },
  },
  timeserial: {
    params: ["Hour", "Minute", "Second"],
    fn: ([u, m, s], rt) => {
      const sec = geheel(nodig(u), rt) * 3600 + geheel(nodig(m), rt) * 60 + geheel(nodig(s), rt);
      return new Datum(rt.combineer(0, sec / 86400));
    },
  },
  datevalue: {
    fn: ([w], rt) => {
      const s = naarDatum(nodig(w), rt.land);
      return new Datum(Math.trunc(s));
    },
  },
  timevalue: {
    fn: ([w], rt) => {
      const s = naarDatum(nodig(w), rt.land);
      return new Datum(splits(s).tijd);
    },
  },
  dateadd: {
    params: ["Interval", "Number", "Date"],
    fn: ([i, n, d], rt) => {
      if (d instanceof NullWaarde) return NULL;
      return new Datum(datumOptellen(tekst(nodig(i), rt).toLowerCase(), Math.trunc(getal(nodig(n), rt)), naarDatum(nodig(d), rt.land)));
    },
  },
  datediff: {
    params: ["Interval", "Date1", "Date2", "FirstDayOfWeek", "FirstWeekOfYear"],
    fn: ([i, a, b, eersteDag, eersteWeek], rt) => {
      if (a instanceof NullWaarde || b instanceof NullWaarde) return NULL;
      return lng(
        datumVerschil(
          tekst(nodig(i), rt).toLowerCase(),
          naarDatum(nodig(a), rt.land),
          naarDatum(nodig(b), rt.land),
          ontbreekt(eersteDag) ? 1 : geheel(eersteDag, rt) || 1,
          ontbreekt(eersteWeek) ? 1 : geheel(eersteWeek, rt) || 1,
        ),
      );
    },
  },
  datepart: {
    params: ["Interval", "Date", "FirstDayOfWeek", "FirstWeekOfYear"],
    fn: ([i, w, eersteDag, eersteWeek], rt) => {
      if (w instanceof NullWaarde) return NULL;
      const s = naarDatum(nodig(w), rt.land);
      const d = delenVan(s);
      const ed = ontbreekt(eersteDag) ? 1 : geheel(eersteDag, rt) || 1;
      const ew = ontbreekt(eersteWeek) ? 1 : geheel(eersteWeek, rt) || 1;
      switch (tekst(nodig(i), rt).toLowerCase()) {
        case "yyyy":
          return int(d.jaar);
        case "q":
          return int(Math.floor((d.maand - 1) / 3) + 1);
        case "m":
          return int(d.maand);
        case "y":
          return int(dagVanJaar(s));
        case "d":
          return int(d.dag);
        case "w":
          return int(weekdag(d, ed));
        case "ww":
          return int(weekVanJaar(s, ed, ew));
        case "h":
          return int(d.uur);
        case "n":
          return int(d.minuut);
        case "s":
          return int(d.seconde);
      }
      throw fout(5);
    },
  },
  monthname: {
    params: ["Month", "Abbreviate"],
    fn: ([m, kort], rt) => {
      const n = geheel(nodig(m), rt);
      if (n < 1 || n > 12) throw fout(5);
      return (!ontbreekt(kort) && naarBool(kort, rt.land) ? rt.land.maandenKort : rt.land.maanden)[n - 1];
    },
  },
  weekdayname: {
    params: ["Weekday", "Abbreviate", "FirstDayOfWeek"],
    fn: ([w, kort, eerste], rt) => {
      const n = geheel(nodig(w), rt);
      if (n < 1 || n > 7) throw fout(5);
      const ed = ontbreekt(eerste) ? 1 : geheel(eerste, rt) || 1;
      const index = (n - 1 + ed - 1) % 7;
      return (!ontbreekt(kort) && naarBool(kort, rt.land) ? rt.land.dagenKort : rt.land.dagen)[index];
    },
  },

  // ---------- overig ----------
  iif: {
    params: ["Expression", "TruePart", "FalsePart"],
    ruw: true,
    fn: async ([v, a, b], rt) => (rt.alsBool(await rt.deref(nodig(v))) ? nodig(a) : nodig(b)),
  },
  nz: {
    params: ["Value", "ValueIfNull"],
    fn: ([v, alsNull]) => (v instanceof NullWaarde ? (ontbreekt(alsNull) ? LEEG : alsNull) : ontbreekt(v) ? LEEG : v),
  },
  choose: {
    ruw: true,
    fn: async ([i, ...keuzes], rt) => {
      const n = Math.trunc(getal(await rt.deref(nodig(i)), rt));
      if (n < 1 || n > keuzes.length) return NULL;
      return keuzes[n - 1];
    },
  },
  switch: {
    ruw: true,
    fn: async (args, rt) => {
      if (args.length % 2) throw fout(5);
      for (let i = 0; i < args.length; i += 2) if (rt.alsBool(await rt.deref(args[i]))) return args[i + 1];
      return NULL;
    },
  },
  array: {
    ruw: true,
    fn: (args) => new VbaMatrix([{ onder: 0, boven: args.length - 1 }], args.map((a) => (a instanceof Ontbrekend ? LEEG : a)), "Variant"),
  },
  lbound: {
    params: ["ArrayName", "Dimension"],
    fn: ([m, d], rt) => matrixGrens(m, d, rt, "onder"),
  },
  ubound: {
    params: ["ArrayName", "Dimension"],
    fn: ([m, d], rt) => matrixGrens(m, d, rt, "boven"),
  },
  filter: {
    params: ["SourceArray", "Match", "Include", "Compare"],
    fn: ([m, zoek, incl, cmp], rt) => {
      if (!(m instanceof VbaMatrix)) throw fout(13);
      const z = tekst(nodig(zoek), rt);
      const opnemen = ontbreekt(incl) ? true : naarBool(incl, rt.land);
      const modus = vergelijkModus(cmp, rt);
      const uit = m.data.map((w) => tekst(w, rt)).filter((t) => (zoekIn(t, z, 0, modus) >= 0) === opnemen);
      return new VbaMatrix([{ onder: 0, boven: uit.length - 1 }], uit, "String");
    },
  },
  rgb: {
    params: ["Red", "Green", "Blue"],
    fn: ([r, g, b], rt) => {
      const c = (w: VbaWaarde) => Math.max(0, Math.min(255, geheel(nodig(w), rt)));
      return lng(c(r) + c(g) * 256 + c(b) * 65536);
    },
  },
  qbcolor: {
    fn: ([w], rt) => {
      const tabel = [0x000000, 0x800000, 0x008000, 0x808000, 0x000080, 0x800080, 0x008080, 0xc0c0c0, 0x808080, 0xff0000, 0x00ff00, 0xffff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xffffff];
      const n = geheel(nodig(w), rt);
      if (n < 0 || n > 15) throw fout(5);
      return lng(tabel[n]);
    },
  },
  doevents: { fn: async () => (await new Promise((r) => setTimeout(r, 0)), int(0)) },
  beep: {
    fn: async (_a, rt) => {
      await rt.host?.gebeurtenis?.({ soort: "Beep", args: [] });
      return LEEG;
    },
  },
  erl: { fn: (_a, rt) => lng(rt.erl) },
  error: {
    fn: ([n], rt) => {
      const err = rt.errObject() as unknown as ErrObject | undefined;
      if (ontbreekt(n)) return err?.beschrijving ?? "";
      const nummer = geheel(n, rt);
      return nummer === 0 ? "" : (foutTekst(nummer) ?? i18next.t("vba:runtime.applicationOrObjectError"));
    },
  },
  msgbox: {
    params: ["Prompt", "Buttons", "Title", "HelpFile", "Context"],
    fn: async ([tekstW, knoppen, titel], rt) => {
      const verzoek = {
        tekst: tekstW instanceof NullWaarde ? "" : tekst(nodig(tekstW), rt),
        knoppen: ontbreekt(knoppen) ? 0 : geheel(knoppen, rt),
        titel: ontbreekt(titel) ? "Microsoft Access" : tekst(titel, rt),
      };
      if (rt.host?.msgBox) return int(await rt.host.msgBox(verzoek));
      if ((verzoek.knoppen & 7) === 0) {
        rt.uitvoer.push(`[MsgBox] ${verzoek.titel}: ${verzoek.tekst}`);
        return int(1);
      }
      throw new VbaAfbreking(
        "niet-ondersteund",
        i18next.t("vba:library.msgBoxNeedsHost"),
      );
    },
  },
  inputbox: {
    params: ["Prompt", "Title", "Default", "XPos", "YPos", "HelpFile", "Context"],
    fn: async ([tekstW, titel, standaard], rt) => {
      if (!rt.host?.inputBox)
        throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:library.inputBoxNeedsHost"));
      const r = await rt.host.inputBox({
        tekst: tekst(nodig(tekstW), rt),
        titel: ontbreekt(titel) ? "Microsoft Access" : tekst(titel, rt),
        standaard: ontbreekt(standaard) ? "" : tekst(standaard, rt),
      });
      return r ?? "";
    },
  },
  eval: {
    fn: () => {
      throw new VbaAfbreking("niet-ondersteund", i18next.t("vba:library.evalUnsupported"));
    },
  },
  callbyname: {
    params: ["Object", "ProcName", "CallType", "Args"],
    ruw: true,
    fn: async ([obj, naam, soort, ...rest], rt) => {
      if (!(obj instanceof VbaObject)) throw fout(424);
      const n = tekst(await rt.deref(nodig(naam)), rt).toLowerCase();
      const s = ontbreekt(soort) ? 1 : geheel(await rt.deref(soort), rt);
      if (s === 4 || s === 8) {
        await obj.zetLid(n, rest.slice(0, -1), rest[rest.length - 1] ?? LEEG, rt);
        return LEEG;
      }
      return obj.lid(n, rest, rt);
    },
  },
};


function afkappen(w: VbaWaarde, rt: VbaRuntime, f: (x: number) => number): VbaWaarde {
  if (w instanceof NullWaarde) return NULL;
  const v = nodig(w);
  if (v instanceof Getal) return new Getal(v.soort, f(v.w));
  if (v instanceof Datum) return new Datum(f(v.w));
  return dbl(f(getal(v, rt)));
}

function datumDeel(w: VbaWaarde, rt: VbaRuntime, f: (d: ReturnType<typeof delenVan>) => number): VbaWaarde {
  if (w instanceof NullWaarde) return NULL;
  return int(f(delenVan(naarDatum(nodig(w), rt.land))));
}

function matrixGrens(m: VbaWaarde, d: VbaWaarde | undefined, rt: VbaRuntime, kant: "onder" | "boven") {
  if (!(m instanceof VbaMatrix)) throw fout(13);
  const dim = ontbreekt(d) ? 1 : geheel(d, rt);
  if (!m.toegewezen) {
    // Leeg resultaat van Split/Array: 0 tot -1
    throw fout(9);
  }
  const g = m.grenzen[dim - 1];
  if (!g) throw fout(9);
  return lng(g[kant]);
}

function formatGetal(args: VbaWaarde[], rt: VbaRuntime, soort: "" | "valuta" | "%") {
  const [w, dec, voorloop, haakjes, groep] = args;
  let x = getal(nodig(w), rt);
  if (soort === "%") x *= 100;
  const decimalen = ontbreekt(dec) || geheel(dec, rt) === -1 ? 2 : geheel(dec, rt);
  const voorloopNul = ontbreekt(voorloop) || geheel(voorloop, rt) !== 0;
  const metHaakjes = !ontbreekt(haakjes) && geheel(haakjes, rt) === -1;
  const groepen = ontbreekt(groep) || geheel(groep, rt) !== 0;
  const { tekst: t, negatief } = vastGetal(x, decimalen, rt.land, groepen, voorloopNul);
  let uit = t;
  if (soort === "%") uit += "%";
  if (soort === "valuta") uit = rt.land.waar === "Waar" ? `${rt.land.valuta} ${negatief && !metHaakjes ? "-" : ""}${uit}` : `${rt.land.valuta}${uit}`;
  if (negatief) return metHaakjes ? `(${uit})` : soort === "valuta" && rt.land.waar === "Waar" ? uit : `-${uit}`;
  return uit;
}

// ---------- datumrekenen ----------

function datumOptellen(interval: string, n: number, s: number): number {
  const { dagen, tijd } = splits(s);
  const d = delenVan(s);
  const maanden = (m: number) => {
    const totaal = d.maand - 1 + m;
    const jaar = d.jaar + Math.floor(totaal / 12);
    const maand = (((totaal % 12) + 12) % 12) + 1;
    const dag = Math.min(d.dag, dagenInMaand(jaar, maand));
    if (jaar < 100 || jaar > 9999) throw fout(5);
    return rtCombineer(serieVan(jaar, maand, dag), tijd);
  };
  switch (interval) {
    case "yyyy":
      return maanden(12 * n);
    case "q":
      return maanden(3 * n);
    case "m":
      return maanden(n);
    case "y":
    case "d":
    case "w":
      return rtCombineer(dagen + n, tijd);
    case "ww":
      return rtCombineer(dagen + 7 * n, tijd);
    case "h":
      return metSeconden(s, n * 3600);
    case "n":
      return metSeconden(s, n * 60);
    case "s":
      return metSeconden(s, n);
  }
  throw fout(5);
}

function rtCombineer(dagen: number, tijd: number) {
  return dagen >= 0 ? dagen + tijd : dagen - tijd;
}

function totaleSeconden(s: number) {
  const { dagen, tijd } = splits(s);
  return dagen * 86400 + Math.round(tijd * 86400) * (dagen < 0 ? 1 : 1);
}

function metSeconden(s: number, extra: number) {
  const totaal = totaleSeconden(s) + extra;
  const dagen = Math.floor(totaal / 86400);
  const rest = totaal - dagen * 86400;
  return rtCombineer(dagen, rest / 86400);
}

function datumVerschil(interval: string, a: number, b: number, eersteDag: number, eersteWeek: number): number {
  const da = delenVan(a);
  const db = delenVan(b);
  const dagA = splits(a).dagen;
  const dagB = splits(b).dagen;
  switch (interval) {
    case "yyyy":
      return db.jaar - da.jaar;
    case "q":
      return db.jaar * 4 + Math.floor((db.maand - 1) / 3) - (da.jaar * 4 + Math.floor((da.maand - 1) / 3));
    case "m":
      return db.jaar * 12 + db.maand - (da.jaar * 12 + da.maand);
    case "y":
    case "d":
      return dagB - dagA;
    case "w":
      return Math.trunc((dagB - dagA) / 7);
    case "ww": {
      // aantal week-beginnen (eersteDag) tussen a (exclusief) en b (inclusief)
      const begin = (dag: number) => dag - (weekdag(delenVan(dag), eersteDag) - 1);
      void eersteWeek;
      return Math.round((begin(dagB) - begin(dagA)) / 7);
    }
    case "h":
      return Math.floor(totaleSeconden(b) / 3600) - Math.floor(totaleSeconden(a) / 3600);
    case "n":
      return Math.floor(totaleSeconden(b) / 60) - Math.floor(totaleSeconden(a) / 60);
    case "s":
      return totaleSeconden(b) - totaleSeconden(a);
  }
  throw fout(5);
}

// ---------- constanten ----------

const VBA_CONSTANTEN: Record<string, VbaWaarde> = {
  vbcrlf: "\r\n",
  vbcr: "\r",
  vblf: "\n",
  vbnewline: "\r\n",
  vbtab: "\t",
  vbnullstring: "",
  vbnullchar: "\0",
  vbback: "\b",
  vbformfeed: "\f",
  vbverticaltab: "\v",
  vbobjecterror: lng(-2147221504),
  vbokonly: int(0),
  vbokcancel: int(1),
  vbabortretryignore: int(2),
  vbyesnocancel: int(3),
  vbyesno: int(4),
  vbretrycancel: int(5),
  vbcritical: int(16),
  vbquestion: int(32),
  vbexclamation: int(48),
  vbinformation: int(64),
  vbdefaultbutton1: int(0),
  vbdefaultbutton2: int(256),
  vbdefaultbutton3: int(512),
  vbdefaultbutton4: int(768),
  vbapplicationmodal: int(0),
  vbsystemmodal: int(4096),
  vbmsgboxhelpbutton: lng(16384),
  vbmsgboxsetforeground: lng(65536),
  vbmsgboxright: lng(524288),
  vbmsgboxrtlreading: lng(1048576),
  vbok: int(1),
  vbcancel: int(2),
  vbabort: int(3),
  vbretry: int(4),
  vbignore: int(5),
  vbyes: int(6),
  vbno: int(7),
  vbusesystemdayofweek: int(0),
  vbsunday: int(1),
  vbmonday: int(2),
  vbtuesday: int(3),
  vbwednesday: int(4),
  vbthursday: int(5),
  vbfriday: int(6),
  vbsaturday: int(7),
  vbusesystem: int(0),
  vbfirstjan1: int(1),
  vbfirstfourdays: int(2),
  vbfirstfullweek: int(3),
  vbbinarycompare: int(0),
  vbtextcompare: int(1),
  vbdatabasecompare: int(2),
  vbuppercase: int(1),
  vblowercase: int(2),
  vbpropercase: int(3),
  vbunicode: int(64),
  vbfromunicode: int(128),
  vbempty: int(0),
  vbnull: int(1),
  vbinteger: int(2),
  vblong: int(3),
  vbsingle: int(4),
  vbdouble: int(5),
  vbcurrency: int(6),
  vbdate: int(7),
  vbstring: int(8),
  vbobject: int(9),
  vberror: int(10),
  vbboolean: int(11),
  vbvariant: int(12),
  vbdataobject: int(13),
  vbdecimal: int(14),
  vbbyte: int(17),
  vbuserdefinedtype: int(36),
  vbarray: int(8192),
  vbgeneraldate: int(0),
  vblongdate: int(1),
  vbshortdate: int(2),
  vblongtime: int(3),
  vbshorttime: int(4),
  vbtrue: int(-1),
  vbfalse: int(0),
  vbusedefault: int(-2),
  vbget: int(2),
  vblet: int(4),
  vbmethod: int(1),
  vbset: int(8),
  vbblack: lng(0),
  vbred: lng(0xff),
  vbgreen: lng(0xff00),
  vbyellow: lng(0xffff),
  vbblue: lng(0xff0000),
  vbmagenta: lng(0xff00ff),
  vbcyan: lng(0xffff00),
  vbwhite: lng(0xffffff),
  vbnormal: int(0),
  vbreadonly: int(1),
  vbhidden: int(2),
  vbsystem: int(4),
  vbdirectory: int(16),
  vbarchive: int(32),
  vbnormalfocus: int(1),
  vbhide: int(0),
  vbmaximizedfocus: int(3),
  vbminimizedfocus: int(2),
};

const ALIASSEN: Record<string, string> = {
  chrw: "chr",
  chrb: "chr",
  ascw: "asc",
  ascb: "asc",
  lenb: "len",
  leftb: "left",
  rightb: "right",
  midb: "mid",
  instrb: "instr",
};

for (const k of ["cint", "clng", "clnglng", "clngptr", "cbyte", "cdbl", "csng", "ccur", "cdec"]) functies[k].getypeerd = true;

export function maakBibliotheek(): Bibliotheek {
  const map = new Map<string, Ingebouwd>(Object.entries(functies));
  for (const [alias, doel] of Object.entries(ALIASSEN)) map.set(alias, functies[doel]);
  for (const [k, v] of Object.entries(daoFuncties)) map.set(k, v);
  for (const [k, v] of Object.entries(accessFuncties)) map.set(k, v);
  for (const [k, a] of GEWEIGERDE_FUNCTIES) map.set(k, { weiger: () => weiger(a), fn: () => weiger(a) });
  const constanten = new Map<string, VbaWaarde>([
    ...Object.entries(VBA_CONSTANTEN),
    ...Object.entries(DAO_CONSTANTEN),
    ...Object.entries(ACCESS_CONSTANTEN),
  ]);
  return {
    functies: map,
    constanten,
    globalen(rt) {
      const g = new Map<string, VbaWaarde>();
      g.set("err", new ErrObject());
      g.set("debug", new DebugObject());
      for (const [k, v] of daoGlobalen(rt)) g.set(k, v);
      for (const [k, v] of accessGlobalen(rt)) g.set(k, v);
      return g;
    },
    nieuw(type) {
      const k = type.toLowerCase().replace(/^(vba|scripting)\./, "");
      if (k === "collection") return new Collectie();
      if (k === "dictionary") return new Woordenboek();
      return null;
    },
  };
}

export { NIETS, langeDatum, lijktOp };
