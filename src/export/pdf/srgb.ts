/**
 * Eigen sRGB-kleurprofiel (ICC v2.1, beeldscherm) voor de OutputIntent van
 * PDF/A-2b (#37).
 *
 * Het profiel wordt hier uit de gepubliceerde sRGB-parameters (IEC 61966-2-1:
 * primaire kleuren naar D50 aangepast met Bradford, de sRGB-overdrachtscurve)
 * opgebouwd. Er zit dus geen profiel van derden in en er geldt geen aparte
 * licentie: het valt onder de licentie van de app. Zie docs/formaten.md.
 */

/** s15Fixed16Number zoals ICC die gebruikt. */
const vast = (v: number) => Math.round(v * 65536) | 0;

/** Kleurwaarden van het profiel (D50, Bradford-aangepast, zoals gangbare sRGB-profielen). */
const WIT_D50 = [0.9642, 1, 0.8249];
const ROOD = [0.4360747, 0.2225045, 0.0139322];
const GROEN = [0.3850649, 0.7168786, 0.0971045];
const BLAUW = [0.1430804, 0.0606169, 0.7141733];

export const SRGB_NAAM = "sRGB IEC61966-2.1";

let cache: Uint8Array | null = null;

/** Het profiel als bytes (altijd hetzelfde, ±3 kB). */
export function srgbProfiel(): Uint8Array {
  if (cache) return cache;
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0x7f);
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
  const xyz = (v: number[]) => [...ascii("XYZ "), 0, 0, 0, 0, ...v.flatMap((w) => u32(vast(w)))];

  const omschrijving = `${SRGB_NAAM} (OpenAEC)`;
  const desc = [
    ...ascii("desc"), 0, 0, 0, 0,
    ...u32(omschrijving.length + 1), ...ascii(omschrijving), 0,
    ...u32(0), ...u32(0), // Unicode: taalcode en lengte
    ...u16(0), 0, ...new Array<number>(67).fill(0), // ScriptCode
  ];
  const cprt = [...ascii("text"), 0, 0, 0, 0, ...ascii("No copyright, use freely (OpenAEC Office Studio)"), 0];
  // sRGB-overdrachtscurve in 1024 punten.
  const punten = 1024;
  const curve = [...ascii("curv"), 0, 0, 0, 0, ...u32(punten)];
  for (let i = 0; i < punten; i++) {
    const x = i / (punten - 1);
    const y = x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    curve.push(...u16(Math.round(y * 65535)));
  }
  const tags: [string, number[]][] = [
    ["desc", desc],
    ["cprt", cprt],
    ["wtpt", xyz(WIT_D50)],
    ["rXYZ", xyz(ROOD)],
    ["gXYZ", xyz(GROEN)],
    ["bXYZ", xyz(BLAUW)],
    ["rTRC", curve],
  ];
  // gTRC en bTRC delen de gegevens van rTRC.
  const aantal = tags.length + 2;
  const positie = 128 + 4 + aantal * 12;
  const tabel: number[] = [];
  const data: number[] = [];
  let curvePositie = 0;
  for (const [sig, inhoud] of tags) {
    while ((positie + data.length) % 4) data.push(0);
    const begin = positie + data.length;
    tabel.push(...ascii(sig), ...u32(begin), ...u32(inhoud.length));
    if (sig === "rTRC") curvePositie = begin;
    data.push(...inhoud);
  }
  for (const sig of ["gTRC", "bTRC"]) tabel.push(...ascii(sig), ...u32(curvePositie), ...u32(curve.length));
  while (data.length % 4) data.push(0);
  const grootte = 128 + 4 + tabel.length + data.length;
  const kop = [
    ...u32(grootte),
    0, 0, 0, 0, // CMM
    0x02, 0x10, 0, 0, // versie 2.1.0
    ...ascii("mntr"),
    ...ascii("RGB "),
    ...ascii("XYZ "),
    ...u16(2026), ...u16(1), ...u16(1), ...u16(0), ...u16(0), ...u16(0),
    ...ascii("acsp"),
    0, 0, 0, 0, // platform
    0, 0, 0, 0, // vlaggen
    0, 0, 0, 0, // fabrikant
    0, 0, 0, 0, // model
    0, 0, 0, 0, 0, 0, 0, 0, // kenmerken
    0, 0, 0, 0, // weergavebedoeling: perceptueel
    ...WIT_D50.flatMap((w) => u32(vast(w))),
    0, 0, 0, 0, // maker
  ];
  while (kop.length < 128) kop.push(0);
  cache = new Uint8Array([...kop, ...u32(aantal), ...tabel, ...data]);
  return cache;
}
