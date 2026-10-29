/**
 * Zet een canvasopname (`opname.ts`) om naar een PDF-inhoudsstroom met
 * vectoren, echte tekst in ingesloten (uitgedunde) lettertypen en
 * afbeeldingen (#18). Wat niet getrouw kan (patronen, schaduwen, mengmodi,
 * onbekende Path2D's, tekst zonder passend lettertype) gooit
 * `Onvectoriseerbaar`; de pagina wordt dan een beeld zoals voorheen.
 */
import { opnameVan, padVan, verloopVan, type Beeldbron, type Opdracht, type Opname, type Verloop } from "./opname";
import { ontleedFont, type GeladenLettertype } from "./lettertypebron";
import { getal } from "./getal.ts";

export class Onvectoriseerbaar extends Error {}

type M = [number, number, number, number, number, number];
const EENHEID: M = [1, 0, 0, 1, 0, 0];
const maal = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const punt = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function omgekeerd(m: M): M | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
const matrixTekst = (m: M) => m.map(getal).join(" ");

// ---------------------------------------------------------------------------
// Kleuren

export interface Kleur {
  r: number;
  g: number;
  b: number;
  a: number;
}
/** Leest #rgb, #rrggbb(aa) en rgb()/rgba() zoals canvas ze teruggeeft. */
export function leesKleur(tekst: string): Kleur | null {
  const s = tekst.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}
const rgb = (k: Kleur) => `${getal(k.r / 255)} ${getal(k.g / 255)} ${getal(k.b / 255)}`;

// ---------------------------------------------------------------------------
// Bronnen (lettertypen, afbeeldingen, transparantie, verlopen) voor het hele document

interface FontGebruik {
  naam: string;
  lt: GeladenLettertype;
  /** glyph → tekst (voor ToUnicode). */
  glyphs: Map<number, string>;
}

export interface BeeldVerzoek {
  naam: string;
  bron: CanvasImageSource;
  /** Uitsnede in bronpixels. */
  uit: [number, number, number, number];
  filter: string | null;
  /** Rand rond het beeld voor een filter (vervaging), in bronpixels. */
  rand: number;
  /** Grootste getekende maat in punten (voor de resolutie). */
  maxPunten: number;
}

export class Bronnen {
  fonts = new Map<string, FontGebruik>();
  beelden: BeeldVerzoek[] = [];
  private beeldSleutels = new Map<CanvasImageSource, Map<string, BeeldVerzoek>>();
  toestanden = new Map<string, { naam: string; ca: number; CA: number }>();
  verlopen: { naam: string; verloop: Verloop; kleuren: Kleur[] }[] = [];

  font(lt: GeladenLettertype) {
    let f = this.fonts.get(lt.sleutel);
    if (!f) {
      f = { naam: `F${this.fonts.size + 1}`, lt, glyphs: new Map() };
      this.fonts.set(lt.sleutel, f);
    }
    return f;
  }
  toestand(ca: number, CA: number) {
    const a = Math.round(Math.max(0, Math.min(1, ca)) * 1000) / 1000;
    const b = Math.round(Math.max(0, Math.min(1, CA)) * 1000) / 1000;
    if (a === 1 && b === 1) return "";
    const sleutel = `${a}|${b}`;
    let t = this.toestanden.get(sleutel);
    if (!t) {
      t = { naam: `G${this.toestanden.size + 1}`, ca: a, CA: b };
      this.toestanden.set(sleutel, t);
    }
    return `/${t.naam} gs `;
  }
  beeld(bron: CanvasImageSource, uit: [number, number, number, number], filter: string | null, rand: number, punten: number) {
    let perBron = this.beeldSleutels.get(bron);
    if (!perBron) {
      perBron = new Map();
      this.beeldSleutels.set(bron, perBron);
    }
    const sleutel = `${uit.join(",")}|${filter ?? ""}`;
    let b = perBron.get(sleutel);
    if (!b) {
      b = { naam: `Im${this.beelden.length + 1}`, bron, uit, filter, rand, maxPunten: 0 };
      perBron.set(sleutel, b);
      this.beelden.push(b);
    }
    b.maxPunten = Math.max(b.maxPunten, punten);
    return b.naam;
  }
  verloop(verloop: Verloop) {
    const kleuren = verloop.stops.map(([, k]) => leesKleur(k));
    if (kleuren.some((k) => !k)) throw new Onvectoriseerbaar("onbekende verloopkleur");
    const naam = `Sh${this.verlopen.length + 1}`;
    this.verlopen.push({ naam, verloop, kleuren: kleuren as Kleur[] });
    return naam;
  }
}

// ---------------------------------------------------------------------------
// Tekenen

interface Toestand {
  ctm: M;
  fill: unknown;
  stroke: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  alpha: number;
  composite: string;
  textAlign: string;
  textBaseline: string;
  direction: string;
  letterSpacing: number;
  wordSpacing: number;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  filter: string;
  /** Er is een knippad actief (dan kan niets "eronder" worden gezet). */
  knip: boolean;
}
const beginToestand = (): Toestand => ({
  ctm: EENHEID,
  fill: "#000000",
  stroke: "#000000",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
  alpha: 1,
  composite: "source-over",
  textAlign: "start",
  textBaseline: "alphabetic",
  direction: "ltr",
  letterSpacing: 0,
  wordSpacing: 0,
  shadowColor: "rgba(0, 0, 0, 0)",
  shadowBlur: 0,
  shadowX: 0,
  shadowY: 0,
  filter: "none",
  knip: false,
});

type Segment =
  | { k: "M" | "L"; x: number; y: number }
  | { k: "C"; p: number[] }
  | { k: "Z" }
  /** Rechthoek langs de assen (apparaatcoördinaten). */
  | { k: "R"; x: number; y: number; w: number; h: number };

const px = (v: unknown) => {
  const m = /(-?[\d.]+)px/.exec(String(v));
  return m ? Number(m[1]) : 0;
};

/** Tekens die vormgeving (shaping) of rechts-naar-links nodig hebben: die laten we aan het beeld. */
const COMPLEX = /[֐-ࣿऀ-෿฀-໿ༀ-႟ᄀ-ᇿក-៿‌‍יִ-﷿ﹰ-﻿]/;

export interface VectorContext {
  bronnen: Bronnen;
  lettertype: (font: string) => GeladenLettertype | null;
  /** Punten per canvaspixel van de pagina. */
  schaal: number;
}

class Tekenaar {
  uit: string[] = [];
  /** Verfopdrachten met destination-over: onder alles wat er al staat. */
  private onder: string[] = [];
  private s: Toestand = beginToestand();
  private stapel: Toestand[] = [];
  private diepte = 0;
  private pad: Segment[] = [];
  private huidig: [number, number] | null = null;
  private begin: [number, number] | null = null;
  private getekend = false;

  constructor(
    private ctx: VectorContext,
    private genest: boolean,
  ) {}

  private controleer(beeld = false) {
    const s = this.s;
    if (s.composite !== "source-over" && !(s.composite === "destination-over" && !this.genest && !s.knip))
      throw new Onvectoriseerbaar(`mengmodus ${s.composite}`);
    const schaduw = leesKleur(s.shadowColor);
    if (schaduw && schaduw.a > 0 && (s.shadowBlur > 0 || s.shadowX || s.shadowY)) throw new Onvectoriseerbaar("schaduw");
    if (!beeld && s.filter && s.filter !== "none") throw new Onvectoriseerbaar("filter");
  }

  // --- pad -------------------------------------------------------------
  private zet(x: number, y: number, verplaats: boolean) {
    const [a, b] = punt(this.s.ctm, x, y);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if (verplaats || !this.huidig) {
      this.pad.push({ k: "M", x: a, y: b });
      this.begin = [a, b];
    } else this.pad.push({ k: "L", x: a, y: b });
    this.huidig = [a, b];
  }
  private kromme(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    if (!this.huidig) this.zet(x1, y1, true);
    const m = this.s.ctm;
    const p = [...punt(m, x1, y1), ...punt(m, x2, y2), ...punt(m, x, y)];
    if (p.some((v) => !Number.isFinite(v))) return;
    this.pad.push({ k: "C", p });
    this.huidig = [p[4], p[5]];
  }
  private sluitPad() {
    if (!this.huidig) return;
    this.pad.push({ k: "Z" });
    this.huidig = this.begin;
  }
  /** Ellipsboog in gebruikerscoördinaten, met een lijn vanaf het huidige punt. */
  private boog(cx: number, cy: number, rx: number, ry: number, draai: number, a0: number, a1: number, tegen: boolean) {
    if (rx < 0 || ry < 0) throw new Onvectoriseerbaar("negatieve straal");
    const TAU = Math.PI * 2;
    let zwaai: number;
    if (!tegen) zwaai = a1 - a0 >= TAU ? TAU : (((a1 - a0) % TAU) + TAU) % TAU;
    else zwaai = a0 - a1 >= TAU ? -TAU : -((((a0 - a1) % TAU) + TAU) % TAU);
    const cos = Math.cos(draai);
    const sin = Math.sin(draai);
    const op = (t: number): [number, number] => {
      const x = rx * Math.cos(t);
      const y = ry * Math.sin(t);
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    };
    const afgeleide = (t: number): [number, number] => {
      const x = -rx * Math.sin(t);
      const y = ry * Math.cos(t);
      return [x * cos - y * sin, x * sin + y * cos];
    };
    const [sx, sy] = op(a0);
    this.zet(sx, sy, false);
    const stukken = Math.max(1, Math.ceil(Math.abs(zwaai) / (Math.PI / 2) - 1e-9));
    const stap = zwaai / stukken;
    const k = (4 / 3) * Math.tan(stap / 4);
    let t = a0;
    for (let i = 0; i < stukken; i++) {
      const t2 = t + stap;
      const [x0, y0] = op(t);
      const [x3, y3] = op(t2);
      const [d0x, d0y] = afgeleide(t);
      const [d3x, d3y] = afgeleide(t2);
      this.kromme(x0 + k * d0x, y0 + k * d0y, x3 - k * d3x, y3 - k * d3y, x3, y3);
      t = t2;
    }
  }
  private boogNaar(x1: number, y1: number, x2: number, y2: number, r: number) {
    const inv = omgekeerd(this.s.ctm);
    if (!this.huidig || !inv) {
      this.zet(x1, y1, !this.huidig);
      return;
    }
    const [x0, y0] = punt(inv, ...this.huidig);
    const v1x = x0 - x1, v1y = y0 - y1, v2x = x2 - x1, v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    const kruis = v1x * v2y - v1y * v2x;
    if (!r || !l1 || !l2 || Math.abs(kruis) < 1e-9) {
      this.zet(x1, y1, false);
      return;
    }
    const hoek = Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2))));
    const d = r / Math.tan(hoek / 2);
    const t1x = x1 + (v1x / l1) * d, t1y = y1 + (v1y / l1) * d;
    const t2x = x1 + (v2x / l2) * d, t2y = y1 + (v2y / l2) * d;
    const bx = v1x / l1 + v2x / l2, by = v1y / l1 + v2y / l2;
    const bl = Math.hypot(bx, by);
    const afstand = r / Math.sin(hoek / 2);
    const cx = x1 + (bx / bl) * afstand, cy = y1 + (by / bl) * afstand;
    this.zet(t1x, t1y, false);
    this.boog(cx, cy, r, r, 0, Math.atan2(t1y - cy, t1x - cx), Math.atan2(t2y - cy, t2x - cx), kruis > 0);
  }
  private rechthoek(x: number, y: number, w: number, h: number) {
    const m = this.s.ctm;
    if (!m[1] && !m[2]) {
      const [a, b] = punt(m, x, y);
      if (![a, b, w, h].every(Number.isFinite)) return;
      this.pad.push({ k: "R", x: a, y: b, w: w * m[0], h: h * m[3] });
      this.huidig = this.begin = [a, b];
      return;
    }
    this.zet(x, y, true);
    this.zet(x + w, y, false);
    this.zet(x + w, y + h, false);
    this.zet(x, y + h, false);
    this.sluitPad();
    this.zet(x, y, true);
  }
  private rondeRechthoek(x: number, y: number, w: number, h: number, radii: unknown) {
    const lijst = Array.isArray(radii) ? radii : [radii ?? 0];
    const r = lijst.map((v) => (typeof v === "number" ? { x: v, y: v } : (v as { x: number; y: number }) ?? { x: 0, y: 0 }));
    const [tl, tr, br, bl] =
      r.length === 1 ? [r[0], r[0], r[0], r[0]] : r.length === 2 ? [r[0], r[1], r[0], r[1]] : r.length === 3 ? [r[0], r[1], r[2], r[1]] : r;
    const f = Math.min(1, Math.abs(w) / Math.max(1e-9, tl.x + tr.x, bl.x + br.x), Math.abs(h) / Math.max(1e-9, tl.y + bl.y, tr.y + br.y));
    const k = (v: { x: number; y: number }) => ({ x: v.x * f, y: v.y * f });
    const [a, b, c, d] = [k(tl), k(tr), k(br), k(bl)];
    const K = 0.5522847498;
    this.zet(x + a.x, y, true);
    this.zet(x + w - b.x, y, false);
    this.kromme(x + w - b.x + b.x * K, y, x + w, y + b.y - b.y * K, x + w, y + b.y);
    this.zet(x + w, y + h - c.y, false);
    this.kromme(x + w, y + h - c.y + c.y * K, x + w - c.x + c.x * K, y + h, x + w - c.x, y + h);
    this.zet(x + d.x, y + h, false);
    this.kromme(x + d.x - d.x * K, y + h, x, y + h - d.y + d.y * K, x, y + h - d.y);
    this.zet(x, y + a.y, false);
    this.kromme(x, y + a.y - a.y * K, x + a.x - a.x * K, y, x + a.x, y);
    this.sluitPad();
    this.zet(x, y, true);
  }
  private padOpdracht(m: string, a: unknown[]) {
    const n = a as number[];
    switch (m) {
      case "moveTo":
        return this.zet(n[0], n[1], true);
      case "lineTo":
        return this.zet(n[0], n[1], false);
      case "bezierCurveTo":
        return this.kromme(n[0], n[1], n[2], n[3], n[4], n[5]);
      case "quadraticCurveTo": {
        if (!this.huidig) this.zet(n[0], n[1], true);
        const inv = omgekeerd(this.s.ctm);
        const [x0, y0] = inv ? punt(inv, ...this.huidig!) : [n[0], n[1]];
        return this.kromme(x0 + (2 / 3) * (n[0] - x0), y0 + (2 / 3) * (n[1] - y0), n[2] + (2 / 3) * (n[0] - n[2]), n[3] + (2 / 3) * (n[1] - n[3]), n[2], n[3]);
      }
      case "arc":
        return this.boog(n[0], n[1], n[2], n[2], 0, n[3], n[4], Boolean(a[5]));
      case "ellipse":
        return this.boog(n[0], n[1], n[2], n[3], n[4], n[5], n[6], Boolean(a[7]));
      case "arcTo":
        return this.boogNaar(n[0], n[1], n[2], n[3], n[4]);
      case "rect":
        return this.rechthoek(n[0], n[1], n[2], n[3]);
      case "roundRect":
        return this.rondeRechthoek(n[0], n[1], n[2], n[3], a[4]);
      case "closePath":
        return this.sluitPad();
    }
  }
  private padTekst(segmenten: Segment[], m: M | null = null) {
    const t = (x: number, y: number) => (m ? punt(m, x, y) : [x, y]);
    let s = "";
    for (const seg of segmenten) {
      if (seg.k === "Z") s += "h ";
      else if (seg.k === "R") {
        if (!m) s += `${getal(seg.x)} ${getal(seg.y)} ${getal(seg.w)} ${getal(seg.h)} re `;
        else {
          const hoeken = [t(seg.x, seg.y), t(seg.x + seg.w, seg.y), t(seg.x + seg.w, seg.y + seg.h), t(seg.x, seg.y + seg.h)];
          s += hoeken.map(([a, b], i) => `${getal(a)} ${getal(b)} ${i ? "l" : "m"} `).join("") + "h ";
        }
      }
      else if (seg.k === "C") {
        const [a, b] = t(seg.p[0], seg.p[1]);
        const [c, d] = t(seg.p[2], seg.p[3]);
        const [e, f] = t(seg.p[4], seg.p[5]);
        s += `${getal(a)} ${getal(b)} ${getal(c)} ${getal(d)} ${getal(e)} ${getal(f)} c `;
      } else {
        const [a, b] = t(seg.x, seg.y);
        s += `${getal(a)} ${getal(b)} ${seg.k === "M" ? "m" : "l"} `;
      }
    }
    return s;
  }
  /** Een Path2D-argument als segmenten (in de huidige transformatie). */
  private padUit(pad: unknown): Segment[] {
    const opdrachten = padVan(pad);
    if (!opdrachten) throw new Onvectoriseerbaar("onbekend Path2D");
    const bewaard = { pad: this.pad, huidig: this.huidig, begin: this.begin };
    this.pad = [];
    this.huidig = null;
    this.begin = null;
    for (const o of opdrachten) if ("m" in o) this.padOpdracht(o.m, o.a);
    const uit = this.pad;
    this.pad = bewaard.pad;
    this.huidig = bewaard.huidig;
    this.begin = bewaard.begin;
    return uit;
  }

  // --- verven ----------------------------------------------------------
  /** Eén verfopdracht; met destination-over komt hij onder alles wat er al is. */
  private verf(op: string) {
    if (this.s.composite === "destination-over") this.onder.unshift(op);
    else this.uit.push(op);
  }
  private vul(segmenten: Segment[], regel: string) {
    this.controleer();
    if (!segmenten.length) return;
    const stijl = this.s.fill;
    const pad = this.padTekst(segmenten);
    const eo = regel === "evenodd" ? "*" : "";
    if (typeof stijl === "string") {
      const k = leesKleur(stijl);
      if (!k || k.a * this.s.alpha <= 0) return;
      this.verf(`q ${this.ctx.bronnen.toestand(k.a * this.s.alpha, 1)}${rgb(k)} rg ${pad}f${eo} Q`);
    } else this.verloopVullen(stijl, pad, eo);
    this.getekend = true;
  }
  private verloopVullen(stijl: unknown, pad: string, eo: string) {
    const info = verloopVan(stijl);
    if (!info || info.soort === "patroon" || !info.stops.length) throw new Onvectoriseerbaar("patroon of onbekende vulling");
    const alfas = info.stops.map(([, k]) => leesKleur(k)?.a ?? 1);
    if (alfas.some((a) => Math.abs(a - alfas[0]) > 0.01)) throw new Onvectoriseerbaar("verloop met wisselende transparantie");
    const naam = this.ctx.bronnen.verloop(info);
    this.verf(`q ${pad}W${eo} n ${matrixTekst(this.s.ctm)} cm ${this.ctx.bronnen.toestand(alfas[0] * this.s.alpha, 1)}/${naam} sh Q`);
  }
  private lijn(segmenten: Segment[]) {
    this.controleer();
    if (!segmenten.length || !(this.s.lineWidth > 0)) return;
    const k = typeof this.s.stroke === "string" ? leesKleur(this.s.stroke) : null;
    if (!k) throw new Onvectoriseerbaar("lijn met verloop of patroon");
    if (k.a * this.s.alpha <= 0) return;
    const inv = omgekeerd(this.s.ctm);
    if (!inv) return;
    const s = this.s;
    const dash = s.dash.length % 2 ? [...s.dash, ...s.dash] : s.dash;
    this.verf(
      `q ${matrixTekst(s.ctm)} cm ${this.ctx.bronnen.toestand(1, k.a * s.alpha)}${rgb(k)} RG ${getal(s.lineWidth)} w ${s.lineCap === "round" ? 1 : s.lineCap === "square" ? 2 : 0} J ${s.lineJoin === "round" ? 1 : s.lineJoin === "bevel" ? 2 : 0} j ${getal(Math.max(1, s.miterLimit))} M [${dash.map(getal).join(" ")}] ${getal(s.dashOffset)} d ${this.padTekst(segmenten, inv)}S Q`,
    );
    this.getekend = true;
  }
  private knip(segmenten: Segment[], regel: string) {
    this.uit.push(`${this.padTekst(segmenten) || "0 0 m "}W${regel === "evenodd" ? "*" : ""} n`);
    this.s.knip = true;
  }
  private wis(x: number, y: number, w: number, h: number) {
    if (!this.getekend) return;
    if (this.genest) throw new Onvectoriseerbaar("wissen in een tussencanvas");
    const bewaard = this.pad;
    this.pad = [];
    this.rechthoek(x, y, w, h);
    this.uit.push(`q 1 g ${this.padTekst(this.pad)}f Q`);
    this.pad = bewaard;
  }

  private tekst(o: Extract<Opdracht, { t: string }>) {
    this.controleer();
    const s = this.s;
    if (!o.tekst || !Number.isFinite(o.x + o.y)) return;
    if (s.direction === "rtl" || COMPLEX.test(o.tekst)) throw new Onvectoriseerbaar("tekst met complexe vormgeving");
    const opgave = ontleedFont(o.font);
    const lt = this.ctx.lettertype(o.font);
    if (!opgave || !lt) throw new Onvectoriseerbaar(`lettertype ${o.font}`);
    const stijl = o.t === "fill" ? s.fill : s.stroke;
    const k = typeof stijl === "string" ? leesKleur(stijl) : null;
    if (!k) throw new Onvectoriseerbaar("tekst met verloop");
    if (k.a * s.alpha <= 0) return;
    const font = lt.font;
    const gebruik = this.ctx.bronnen.font(lt);
    const S = opgave.grootte;
    let hex = "";
    let natuur = 0;
    const delen: string[] = [];
    let spaties = 0;
    for (const teken of o.tekst) {
      const c = teken.codePointAt(0)!;
      if (c < 0x20 && c !== 9) continue;
      let g = font.glyph(c === 9 || c === 0xa0 ? 0x20 : c);
      if (!g) {
        if (/\s/.test(teken) || c === 0xad || c === 0x200b) g = font.glyph(0x20);
        if (!g) throw new Onvectoriseerbaar(`teken U+${c.toString(16)} ontbreekt in ${font.postscriptNaam}`);
      }
      if (!gebruik.glyphs.has(g)) gebruik.glyphs.set(g, teken);
      hex += g.toString(16).padStart(4, "0");
      natuur += (font.breedte(g) / font.eenheden) * S + s.letterSpacing;
      if (teken === " " && s.wordSpacing) {
        delen.push(`<${hex}>`, getal((-s.wordSpacing / S) * 1000));
        hex = "";
        spaties++;
      }
    }
    if (hex) delen.push(`<${hex}>`);
    if (!delen.length) return;
    natuur += spaties * s.wordSpacing;
    let breedte = o.breedte > 0 ? o.breedte : natuur;
    if (o.max !== undefined && o.max >= 0 && breedte > o.max) breedte = o.max;
    let h = natuur > 0 ? breedte / natuur : 1;
    if (!(h > 0.5 && h < 2)) h = 1;
    const stijgen = (font.stijgen / (font.stijgen - font.dalen)) * S;
    const dalen = S - stijgen;
    const basis =
      s.textBaseline === "top" || s.textBaseline === "hanging"
        ? o.y + stijgen
        : s.textBaseline === "middle"
          ? o.y + stijgen - S / 2
          : s.textBaseline === "bottom" || s.textBaseline === "ideographic"
            ? o.y - dalen
            : o.y;
    const w = breedte;
    const x0 =
      s.textAlign === "center"
        ? o.x - w / 2
        : s.textAlign === "right" || s.textAlign === "end"
          ? o.x - w
          : o.x;
    const schuin = lt.synthetischCursief ? 0.2 * S : 0;
    const tm = maal(s.ctm, [S, 0, schuin, -S, x0, basis]);
    const vet = lt.synthetischVet && o.t === "fill";
    const schaalCtm = Math.sqrt(Math.abs(s.ctm[0] * s.ctm[3] - s.ctm[1] * s.ctm[2])) || 1;
    const modus = o.t === "stroke" ? `1 Tr ${getal(s.lineWidth * schaalCtm)} w ${rgb(k)} RG ` : vet ? `2 Tr ${getal(S * 0.03 * schaalCtm)} w ${rgb(k)} RG ` : "";
    const toestand = o.t === "stroke" ? this.ctx.bronnen.toestand(1, k.a * s.alpha) : this.ctx.bronnen.toestand(k.a * s.alpha, vet ? k.a * s.alpha : 1);
    this.verf(
      `q ${toestand}${rgb(k)} rg BT /${gebruik.naam} 1 Tf ${getal(h * 100)} Tz ${getal(s.letterSpacing / S)} Tc ${modus}${matrixTekst(tm)} Tm [${delen.join(" ")}] TJ ET Q`,
    );
    this.getekend = true;
  }

  private beeld(o: Extract<Opdracht, { b: Beeldbron }>) {
    this.controleer(true);
    const bron = o.b;
    const a = o.a;
    let sx = 0, sy = 0, sw = bron.breedte, sh = bron.hoogte, dx: number, dy: number, dw = bron.breedte, dh = bron.hoogte;
    if (a.length >= 8) [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    else if (a.length >= 4) [dx, dy, dw, dh] = a;
    else [dx, dy] = a;
    if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite) || !sw || !sh || !dw || !dh) return;
    // Uitsnede binnen de bron houden (canvas knipt ook).
    if (sw < 0) [sx, sw] = [sx + sw, -sw];
    if (sh < 0) [sy, sh] = [sy + sh, -sh];
    const s = this.s;
    if (bron.soort === "opname") {
      if (s.alpha < 1 || (s.filter && s.filter !== "none") || s.composite !== "source-over")
        throw new Onvectoriseerbaar("doorzichtig tussencanvas");
      const binnen: M = [dw / sw, 0, 0, dh / sh, dx - (sx * dw) / sw, dy - (sy * dh) / sh];
      const kader = `${getal(dx)} ${getal(dy)} ${getal(dw)} ${getal(dh)} re W n`;
      this.uit.push(`q ${matrixTekst(s.ctm)} cm ${kader} ${matrixTekst(binnen)} cm`);
      const genest = new Tekenaar(this.ctx, true);
      genest.speel(bron.opname.opdrachten.slice(0, bron.tot));
      this.uit.push(...genest.uit, "Q");
      this.getekend = true;
      return;
    }
    const filter = s.filter && s.filter !== "none" ? s.filter : null;
    const vervaging = filter ? Math.max(0, ...[...filter.matchAll(/blur\(([\d.]+)px\)/g)].map((m) => Number(m[1]))) : 0;
    const rand = Math.ceil(vervaging * 3);
    const schaal = Math.sqrt(Math.abs(s.ctm[0] * s.ctm[3] - s.ctm[1] * s.ctm[2])) || 1;
    const punten = Math.max(Math.abs(dw), Math.abs(dh)) * schaal * this.ctx.schaal;
    const naam = this.ctx.bronnen.beeld(bron.bron, [sx, sy, sw, sh], filter, rand, punten);
    const rx = (rand * dw) / sw, ry = (rand * dh) / sh;
    const plaats: M = [dw + 2 * rx, 0, 0, -(dh + 2 * ry), dx - rx, dy + dh + ry];
    this.verf(`q ${matrixTekst(s.ctm)} cm ${this.ctx.bronnen.toestand(s.alpha, 1)}${matrixTekst(plaats)} cm /${naam} Do Q`);
    this.getekend = true;
  }

  speel(opdrachten: readonly Opdracht[]) {
    for (const o of opdrachten) {
      if ("t" in o) this.tekst(o);
      else if ("b" in o) this.beeld(o);
      else if ("s" in o) this.eigenschap(o.s, o.v);
      else this.methode(o.m, o.a);
    }
    while (this.diepte > 0) {
      this.uit.push("Q");
      this.diepte--;
    }
    if (this.onder.length) {
      this.uit.unshift(...this.onder);
      this.onder = [];
    }
  }

  private eigenschap(naam: string, v: unknown) {
    const s = this.s;
    switch (naam) {
      case "fillStyle":
        s.fill = v;
        break;
      case "strokeStyle":
        s.stroke = v;
        break;
      case "lineWidth":
        s.lineWidth = Number(v);
        break;
      case "lineCap":
        s.lineCap = String(v);
        break;
      case "lineJoin":
        s.lineJoin = String(v);
        break;
      case "miterLimit":
        s.miterLimit = Number(v);
        break;
      case "lineDashOffset":
        s.dashOffset = Number(v);
        break;
      case "globalAlpha":
        s.alpha = Number(v);
        break;
      case "globalCompositeOperation":
        s.composite = String(v);
        break;
      case "textAlign":
        s.textAlign = String(v);
        break;
      case "textBaseline":
        s.textBaseline = String(v);
        break;
      case "direction":
        s.direction = String(v) === "inherit" ? "ltr" : String(v);
        break;
      case "letterSpacing":
        s.letterSpacing = px(v);
        break;
      case "wordSpacing":
        s.wordSpacing = px(v);
        break;
      case "shadowColor":
        s.shadowColor = String(v);
        break;
      case "shadowBlur":
        s.shadowBlur = Number(v);
        break;
      case "shadowOffsetX":
        s.shadowX = Number(v);
        break;
      case "shadowOffsetY":
        s.shadowY = Number(v);
        break;
      case "filter":
        s.filter = String(v);
        break;
      // font, imageSmoothing*, fontKerning, textRendering: de tekst neemt het font mee; de rest is weergave.
    }
  }

  private methode(m: string, a: unknown[]) {
    const n = a as number[];
    switch (m) {
      case "save":
        this.stapel.push({ ...this.s, dash: [...this.s.dash] });
        this.uit.push("q");
        this.diepte++;
        return;
      case "restore":
        if (!this.stapel.length) return;
        this.s = this.stapel.pop()!;
        this.uit.push("Q");
        this.diepte--;
        return;
      case "reset":
        throw new Onvectoriseerbaar("reset");
      case "setTransform": {
        if (!a.length) this.s.ctm = EENHEID;
        else if (typeof a[0] === "object" && a[0]) {
          const t = a[0] as Record<string, number>;
          this.s.ctm = [t.a ?? t.m11 ?? 1, t.b ?? t.m12 ?? 0, t.c ?? t.m21 ?? 0, t.d ?? t.m22 ?? 1, t.e ?? t.m41 ?? 0, t.f ?? t.m42 ?? 0];
        } else this.s.ctm = [n[0], n[1], n[2], n[3], n[4], n[5]];
        return;
      }
      case "resetTransform":
        this.s.ctm = EENHEID;
        return;
      case "transform":
        this.s.ctm = maal(this.s.ctm, [n[0], n[1], n[2], n[3], n[4], n[5]]);
        return;
      case "translate":
        this.s.ctm = maal(this.s.ctm, [1, 0, 0, 1, n[0], n[1]]);
        return;
      case "scale":
        this.s.ctm = maal(this.s.ctm, [n[0], 0, 0, n[1], 0, 0]);
        return;
      case "rotate": {
        const c = Math.cos(n[0]), si = Math.sin(n[0]);
        this.s.ctm = maal(this.s.ctm, [c, si, -si, c, 0, 0]);
        return;
      }
      case "setLineDash":
        this.s.dash = Array.isArray(a[0]) ? (a[0] as number[]).filter((v) => Number.isFinite(v) && v >= 0) : [];
        return;
      case "beginPath":
        this.pad = [];
        this.huidig = null;
        this.begin = null;
        return;
      case "fill":
        if (a[0] && typeof a[0] === "object") return this.vul(this.padUit(a[0]), String(a[1] ?? "nonzero"));
        return this.vul(this.pad, String(a[0] ?? "nonzero"));
      case "stroke":
        if (a[0] && typeof a[0] === "object") return this.lijn(this.padUit(a[0]));
        return this.lijn(this.pad);
      case "clip":
        if (a[0] && typeof a[0] === "object") return this.knip(this.padUit(a[0]), String(a[1] ?? "nonzero"));
        return this.knip(this.pad, String(a[0] ?? "nonzero"));
      case "fillRect":
      case "strokeRect": {
        const bewaard = { pad: this.pad, huidig: this.huidig, begin: this.begin };
        this.pad = [];
        this.huidig = null;
        this.begin = null;
        this.rechthoek(n[0], n[1], n[2], n[3]);
        const pad = this.pad;
        this.pad = bewaard.pad;
        this.huidig = bewaard.huidig;
        this.begin = bewaard.begin;
        if (m === "fillRect") this.vul(pad, "nonzero");
        else this.lijn(pad);
        return;
      }
      case "clearRect": {
        const bewaard = { pad: this.pad, huidig: this.huidig, begin: this.begin };
        this.wis(n[0], n[1], n[2], n[3]);
        this.pad = bewaard.pad;
        this.huidig = bewaard.huidig;
        this.begin = bewaard.begin;
        return;
      }
      case "scrollPathIntoView":
      case "drawFocusIfNeeded":
        return;
      default:
        if (["moveTo", "lineTo", "bezierCurveTo", "quadraticCurveTo", "arc", "ellipse", "arcTo", "rect", "roundRect", "closePath"].includes(m))
          return this.padOpdracht(m, a);
        throw new Onvectoriseerbaar(`canvasopdracht ${m}`);
    }
  }
}

/**
 * Inhoudsstroom voor een pagina van `breedte`×`hoogte` punten uit de opname
 * van het paginacanvas. Gooit `Onvectoriseerbaar` als het niet getrouw kan.
 */
export function vectorPagina(opname: Opname, breedte: number, hoogte: number, ctx: Omit<VectorContext, "schaal">) {
  if (opname.onvectoriseerbaar) throw new Onvectoriseerbaar(opname.onvectoriseerbaar);
  const schaal = breedte / Math.max(1, opname.breedte);
  const t = new Tekenaar({ ...ctx, schaal }, false);
  t.speel(opname.opdrachten);
  return `q ${getal(schaal)} 0 0 ${getal(-schaal)} 0 ${getal(hoogte)} cm\n${t.uit.join("\n")}\nQ\n`;
}

/** Alle fontopgaven in een opname (ook in tussencanvassen), om vooraf te laden. */
export function fontsIn(opname: Opname, gezien = new Set<Opname>()): Set<string> {
  const uit = new Set<string>();
  if (gezien.has(opname)) return uit;
  gezien.add(opname);
  for (const o of opname.opdrachten) {
    if ("t" in o) uit.add(o.font);
    else if ("b" in o && o.b.soort === "opname") for (const f of fontsIn(o.b.opname, gezien)) uit.add(f);
  }
  return uit;
}

export { opnameVan };
