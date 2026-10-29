/**
 * TrueType lezen en uitdunnen voor ingesloten PDF-lettertypen (#18).
 *
 * Alleen wat de PDF nodig heeft: tekens naar glyphs (cmap 4/12), breedtes
 * (hmtx), maten (head, hhea, OS/2, post) en een deelverzameling van de
 * glyphs. Het uitdunnen houdt de glyph-nummers gelijk (CIDToGIDMap
 * Identity) en maakt ongebruikte glyphs leeg; samengestelde glyphs nemen
 * hun onderdelen mee. CFF-lettertypen (OpenType met PostScript-contouren) en
 * collecties worden niet ondersteund: dan valt de pagina terug op een beeld.
 */

export class LettertypeFout extends Error {}

interface Tabel {
  offset: number;
  lengte: number;
}

export class TrueType {
  readonly bytes: Uint8Array;
  private v: DataView;
  private tabellen = new Map<string, Tabel>();
  readonly eenheden: number;
  readonly aantalGlyphs: number;
  readonly stijgen: number;
  readonly dalen: number;
  readonly hoofdletterHoogte: number;
  readonly kader: [number, number, number, number];
  readonly cursiefHoek: number;
  readonly gewicht: number;
  readonly vasteBreedte: boolean;
  readonly postscriptNaam: string;
  private breedtes: Uint16Array;
  private kaart = new Map<number, number>();
  private lang: boolean;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 12) throw new LettertypeFout("te kort");
    const soort = this.v.getUint32(0);
    if (soort === 0x4f54544f) throw new LettertypeFout("CFF-lettertype"); // 'OTTO'
    if (soort === 0x74746366) throw new LettertypeFout("lettertypecollectie"); // 'ttcf'
    if (soort !== 0x00010000 && soort !== 0x74727565) throw new LettertypeFout("geen TrueType");
    const aantal = this.v.getUint16(4);
    for (let i = 0; i < aantal; i++) {
      const p = 12 + i * 16;
      if (p + 16 > bytes.length) throw new LettertypeFout("tabellijst beschadigd");
      const tag = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
      const offset = this.v.getUint32(p + 8);
      const lengte = this.v.getUint32(p + 12);
      if (offset + lengte > bytes.length) throw new LettertypeFout(`tabel ${tag} beschadigd`);
      this.tabellen.set(tag, { offset, lengte });
    }
    for (const nodig of ["head", "hhea", "maxp", "hmtx", "loca", "glyf", "cmap"])
      if (!this.tabellen.has(nodig)) throw new LettertypeFout(`tabel ${nodig} ontbreekt`);
    const head = this.t("head").offset;
    this.eenheden = this.v.getUint16(head + 18) || 1000;
    this.kader = [
      this.v.getInt16(head + 36),
      this.v.getInt16(head + 38),
      this.v.getInt16(head + 40),
      this.v.getInt16(head + 42),
    ];
    this.lang = this.v.getInt16(head + 50) === 1;
    this.aantalGlyphs = this.v.getUint16(this.t("maxp").offset + 4);
    const hhea = this.t("hhea").offset;
    let stijgen = this.v.getInt16(hhea + 4);
    let dalen = this.v.getInt16(hhea + 6);
    const metriek = this.v.getUint16(hhea + 34);
    const os2 = this.tabellen.get("OS/2");
    let hoofdletter = 0;
    let gewicht = 400;
    if (os2 && os2.lengte >= 78) {
      gewicht = this.v.getUint16(os2.offset + 4);
      const typoStijgen = this.v.getInt16(os2.offset + 68);
      const typoDalen = this.v.getInt16(os2.offset + 70);
      if (!stijgen && typoStijgen) {
        stijgen = typoStijgen;
        dalen = typoDalen;
      }
      if (os2.lengte >= 90 && this.v.getUint16(os2.offset) >= 2) hoofdletter = this.v.getInt16(os2.offset + 88);
    }
    this.stijgen = stijgen;
    this.dalen = dalen;
    this.hoofdletterHoogte = hoofdletter || Math.round(stijgen * 0.7);
    this.gewicht = gewicht;
    const post = this.tabellen.get("post");
    this.cursiefHoek = post ? this.v.getInt32(post.offset + 4) / 65536 : 0;
    this.vasteBreedte = post ? this.v.getUint32(post.offset + 12) !== 0 : false;
    // Breedtes per glyph; na numberOfHMetrics herhaalt de laatste.
    this.breedtes = new Uint16Array(this.aantalGlyphs);
    const hmtx = this.t("hmtx").offset;
    let laatste = 0;
    for (let g = 0; g < this.aantalGlyphs; g++) {
      if (g < metriek) laatste = this.v.getUint16(hmtx + g * 4);
      this.breedtes[g] = laatste;
    }
    this.leesCmap();
    this.postscriptNaam = this.leesNaam() ?? "Lettertype";
  }

  private t(tag: string) {
    return this.tabellen.get(tag)!;
  }

  private leesCmap() {
    const cmap = this.t("cmap").offset;
    const aantal = this.v.getUint16(cmap + 2);
    let beste: { offset: number; formaat: number; score: number } | null = null;
    for (let i = 0; i < aantal; i++) {
      const p = cmap + 4 + i * 8;
      const platform = this.v.getUint16(p);
      const codering = this.v.getUint16(p + 2);
      const offset = cmap + this.v.getUint32(p + 4);
      if (offset + 4 > this.bytes.length) continue;
      const formaat = this.v.getUint16(offset);
      const score =
        formaat === 12 && (platform === 3 && codering === 10 || platform === 0)
          ? 3
          : formaat === 4 && (platform === 3 && codering === 1 || platform === 0)
            ? 2
            : 0;
      if (score && (!beste || score > beste.score)) beste = { offset, formaat, score };
    }
    if (!beste) throw new LettertypeFout("geen Unicode-cmap");
    const o = beste.offset;
    if (beste.formaat === 4) {
      const seg = this.v.getUint16(o + 6) / 2;
      const eind = o + 14;
      const begin = eind + seg * 2 + 2;
      const delta = begin + seg * 2;
      const bereik = delta + seg * 2;
      for (let s = 0; s < seg; s++) {
        const e = this.v.getUint16(eind + s * 2);
        const b = this.v.getUint16(begin + s * 2);
        const d = this.v.getInt16(delta + s * 2);
        const r = this.v.getUint16(bereik + s * 2);
        for (let c = b; c <= e && c !== 0xffff; c++) {
          let g: number;
          if (r === 0) g = (c + d) & 0xffff;
          else {
            const p = bereik + s * 2 + r + (c - b) * 2;
            if (p + 2 > this.bytes.length) continue;
            g = this.v.getUint16(p);
            if (g) g = (g + d) & 0xffff;
          }
          if (g) this.kaart.set(c, g);
        }
      }
    } else {
      const groepen = this.v.getUint32(o + 12);
      for (let i = 0; i < groepen; i++) {
        const p = o + 16 + i * 12;
        const b = this.v.getUint32(p);
        const e = this.v.getUint32(p + 4);
        const g0 = this.v.getUint32(p + 8);
        if (e - b > 0x110000) continue;
        for (let c = b; c <= e; c++) this.kaart.set(c, g0 + (c - b));
      }
    }
  }

  private leesNaam(): string | null {
    const naam = this.tabellen.get("name");
    if (!naam) return null;
    const o = naam.offset;
    const aantal = this.v.getUint16(o + 2);
    const opslag = o + this.v.getUint16(o + 4);
    for (let i = 0; i < aantal; i++) {
      const p = o + 6 + i * 12;
      const platform = this.v.getUint16(p);
      const id = this.v.getUint16(p + 6);
      if (id !== 6) continue;
      const lengte = this.v.getUint16(p + 8);
      const start = opslag + this.v.getUint16(p + 10);
      let s = "";
      if (platform === 3 || platform === 0)
        for (let j = 0; j + 1 < lengte; j += 2) s += String.fromCharCode(this.v.getUint16(start + j));
      else for (let j = 0; j < lengte; j++) s += String.fromCharCode(this.bytes[start + j]);
      const schoon = s.replace(/[^A-Za-z0-9_.-]/g, "");
      if (schoon) return schoon.slice(0, 60);
    }
    return null;
  }

  /** Glyph voor een codepunt; 0 als het lettertype het teken niet heeft. */
  glyph(codepunt: number) {
    return this.kaart.get(codepunt) ?? 0;
  }
  /** Voortgang van een glyph in lettertype-eenheden. */
  breedte(glyph: number) {
    return this.breedtes[glyph] ?? 0;
  }

  private glyphBereik(g: number): [number, number] {
    const loca = this.t("loca").offset;
    const glyf = this.t("glyf").offset;
    if (this.lang) return [glyf + this.v.getUint32(loca + g * 4), glyf + this.v.getUint32(loca + g * 4 + 4)];
    return [glyf + this.v.getUint16(loca + g * 2) * 2, glyf + this.v.getUint16(loca + g * 2 + 2) * 2];
  }

  /** Onderdelen van een samengestelde glyph. */
  private onderdelen(g: number): number[] {
    const [a, b] = this.glyphBereik(g);
    if (b - a < 10 || this.v.getInt16(a) >= 0) return [];
    const uit: number[] = [];
    let p = a + 10;
    for (let veilig = 0; veilig < 256 && p + 4 <= b; veilig++) {
      const vlag = this.v.getUint16(p);
      uit.push(this.v.getUint16(p + 2));
      p += 4 + (vlag & 1 ? 4 : 2);
      if (vlag & 8) p += 2;
      else if (vlag & 0x40) p += 4;
      else if (vlag & 0x80) p += 8;
      if (!(vlag & 0x20)) break;
    }
    return uit;
  }

  /**
   * Een geldig TrueType-bestand met alleen deze glyphs (plus .notdef en
   * onderdelen van samengestelde glyphs); de nummering blijft gelijk.
   */
  deelverzameling(glyphs: Iterable<number>): Uint8Array {
    const houden = new Set<number>([0]);
    const stapel = [...glyphs].filter((g) => g >= 0 && g < this.aantalGlyphs);
    while (stapel.length) {
      const g = stapel.pop()!;
      if (houden.has(g)) continue;
      houden.add(g);
      for (const o of this.onderdelen(g)) if (!houden.has(o) && o < this.aantalGlyphs) stapel.push(o);
    }
    // Ook onderdelen van glyph 0 en van al gevonden glyphs.
    for (const g of [...houden]) for (const o of this.onderdelen(g)) if (o < this.aantalGlyphs) houden.add(o);
    const n = this.aantalGlyphs;
    let grootte = 0;
    for (const g of houden) {
      const [a, b] = this.glyphBereik(g);
      grootte += (b - a + 3) & ~3;
    }
    const glyf = new Uint8Array(grootte);
    const loca = new Uint8Array((n + 1) * 4);
    const lv = new DataView(loca.buffer);
    let pos = 0;
    for (let g = 0; g < n; g++) {
      lv.setUint32(g * 4, pos);
      if (!houden.has(g)) continue;
      const [a, b] = this.glyphBereik(g);
      if (b > a) {
        glyf.set(this.bytes.subarray(a, b), pos);
        pos += (b - a + 3) & ~3;
      }
    }
    lv.setUint32(n * 4, pos);
    const head = this.bytes.slice(this.t("head").offset, this.t("head").offset + this.t("head").lengte);
    const hv = new DataView(head.buffer);
    hv.setUint32(8, 0); // checkSumAdjustment, later ingevuld
    hv.setInt16(50, 1); // lange loca
    const tabellen: [string, Uint8Array][] = [
      ["glyf", glyf.subarray(0, pos)],
      ["head", head],
      ["loca", loca],
    ];
    for (const tag of ["cvt ", "fpgm", "hhea", "hmtx", "maxp", "prep"]) {
      const t = this.tabellen.get(tag);
      if (t) tabellen.push([tag, this.bytes.subarray(t.offset, t.offset + t.lengte)]);
    }
    tabellen.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return bouwLettertype(tabellen);
  }
}

function controlesom(data: Uint8Array) {
  let som = 0;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const heel = data.length & ~3;
  for (let i = 0; i < heel; i += 4) som = (som + v.getUint32(i)) >>> 0;
  if (heel < data.length) {
    let rest = 0;
    for (let i = heel; i < data.length; i++) rest |= data[i] << (24 - (i - heel) * 8);
    som = (som + (rest >>> 0)) >>> 0;
  }
  return som;
}

/** Zet tabellen (gesorteerd op tag) in een TrueType-bestand met kloppende controlesommen. */
function bouwLettertype(tabellen: [string, Uint8Array][]) {
  const aantal = tabellen.length;
  let macht = 1;
  let log = 0;
  while (macht * 2 <= aantal) {
    macht *= 2;
    log++;
  }
  const kop = 12 + aantal * 16;
  let totaal = kop;
  for (const [, d] of tabellen) totaal += (d.length + 3) & ~3;
  const uit = new Uint8Array(totaal);
  const v = new DataView(uit.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, aantal);
  v.setUint16(6, macht * 16);
  v.setUint16(8, log);
  v.setUint16(10, aantal * 16 - macht * 16);
  let pos = kop;
  let headPos = -1;
  tabellen.forEach(([tag, data], i) => {
    const p = 12 + i * 16;
    for (let j = 0; j < 4; j++) uit[p + j] = tag.charCodeAt(j);
    v.setUint32(p + 4, controlesom(data));
    v.setUint32(p + 8, pos);
    v.setUint32(p + 12, data.length);
    uit.set(data, pos);
    if (tag === "head") headPos = pos;
    pos += (data.length + 3) & ~3;
  });
  if (headPos >= 0) v.setUint32(headPos + 8, (0xb1b0afba - controlesom(uit)) >>> 0);
  return uit;
}
