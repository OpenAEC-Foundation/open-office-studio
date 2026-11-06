/** Normalisatie van afgeleide platformbestanden; de goedgekeurde bron blijft intact. */
import { unzlibSync, zlibSync } from "fflate";

const crc = bytes => {
  let n = 0xffffffff;
  for (const b of bytes) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
};
function pngDeel(naam, inhoud) {
  const uit = Buffer.alloc(inhoud.length + 12);
  uit.writeUInt32BE(inhoud.length); uit.write(naam, 4, 4, "ascii"); inhoud.copy(uit, 8);
  uit.writeUInt32BE(crc(uit.subarray(4, uit.length - 4)), uit.length - 4);
  return uit;
}
const paeth = (a, b, c) => {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
};

/** Verwijder uitsluitend de zeer geringe resizerrand op de vier hoekpixels. */
export function helderePngHoeken(bytes) {
  const png = Buffer.from(bytes);
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Geen gegenereerde PNG");
  const delen = [], idat = [];
  for (let i = 8; i < png.length;) {
    const lengte = png.readUInt32BE(i), naam = png.toString("ascii", i + 4, i + 8), eind = i + lengte + 12;
    if (eind > png.length) throw new Error("Onvolledig PNG-onderdeel");
    const inhoud = png.subarray(i + 8, eind - 4);
    if (png.readUInt32BE(eind - 4) !== crc(png.subarray(i + 4, eind - 4))) throw new Error("Ongeldige PNG-controlesom");
    delen.push({ naam, inhoud, bytes: png.subarray(i, eind) });
    if (naam === "IDAT") idat.push(inhoud);
    i = eind;
  }
  const header = delen[0];
  if (header.naam !== "IHDR" || header.inhoud[8] !== 8 || header.inhoud[9] !== 6 || header.inhoud[12] !== 0)
    throw new Error("Alleen de gegenereerde niet-geïnterlinieerde RGBA-PNG's worden genormaliseerd");
  const w = header.inhoud.readUInt32BE(0), h = header.inhoud.readUInt32BE(4), stap = w * 4;
  const raw = unzlibSync(Buffer.concat(idat)), pixels = Buffer.alloc(stap * h);
  if (raw.length !== (stap + 1) * h) throw new Error("Onjuiste PNG-rasterlengte");
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stap + 1)];
    if (filter > 4) throw new Error("Onbekend PNG-filter");
    for (let x = 0; x < stap; x++) {
      const p = y * stap + x;
      const a = x >= 4 ? pixels[p - 4] : 0, b = y ? pixels[p - stap] : 0, c = y && x >= 4 ? pixels[p - stap - 4] : 0;
      const extra = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[p] = (raw[y * (stap + 1) + 1 + x] + extra) & 255;
    }
  }
  let gewijzigd = false;
  for (const p of [3, (w - 1) * 4 + 3, (h - 1) * stap + 3, h * stap - 1]) {
    if (pixels[p] > 8) throw new Error("Hoek heeft zichtbare inhoud; bron en afgeleide maat controleren");
    if (pixels[p]) { pixels[p] = 0; gewijzigd = true; }
  }
  if (!gewijzigd) return png;
  const regels = Buffer.alloc((stap + 1) * h);
  for (let y = 0; y < h; y++) pixels.copy(regels, y * (stap + 1) + 1, y * stap, (y + 1) * stap);
  let geschreven = false;
  return Buffer.concat([png.subarray(0, 8), ...delen.flatMap(d => {
    if (d.naam !== "IDAT") return [d.bytes];
    if (geschreven) return [];
    geschreven = true;
    return [pngDeel("IDAT", Buffer.from(zlibSync(regels, { level: 9 })))];
  })]);
}

/** De CLI gebruikt PNG-frames in ICO; behoud afmetingen en bits, vernieuw alleen offsets. */
export function heldereIcoHoeken(bytes) {
  const ico = Buffer.from(bytes), aantal = ico.readUInt16LE(4), begin = 6 + aantal * 16;
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || begin > ico.length) throw new Error("Geen gegenereerd ICO-bestand");
  const kop = Buffer.from(ico.subarray(0, begin)), delen = [];
  let positie = begin;
  for (let n = 0; n < aantal; n++) {
    const p = 6 + n * 16, lengte = ico.readUInt32LE(p + 8), start = ico.readUInt32LE(p + 12);
    if (start < begin || start + lengte > ico.length) throw new Error("Ongeldige ICO-framegrens");
    const beeld = helderePngHoeken(ico.subarray(start, start + lengte));
    kop.writeUInt32LE(beeld.length, p + 8); kop.writeUInt32LE(positie, p + 12);
    delen.push(beeld); positie += beeld.length;
  }
  return Buffer.concat([kop, ...delen]);
}

/** ICNS-records zijn op type adresseerbaar; alleen hun container-volgorde verandert. */
export function vasteIcnsVolgorde(bytes) {
  const icns = Buffer.from(bytes);
  if (icns.toString("ascii", 0, 4) !== "icns" || icns.readUInt32BE(4) !== icns.length) throw new Error("Geen gegenereerd ICNS-bestand");
  const delen = [];
  for (let p = 8; p < icns.length;) {
    const lengte = icns.readUInt32BE(p + 4);
    if (lengte < 8 || p + lengte > icns.length) throw new Error("Ongeldige ICNS-recordgrens");
    const deel = icns.subarray(p, p + lengte);
    if (deel.toString("ascii", 0, 4) === "TOC ") throw new Error("ICNS-inhoudstabel vereist een afzonderlijke conversie");
    delen.push(deel); p += lengte;
  }
  delen.sort((a, b) => Buffer.compare(a.subarray(0, 4), b.subarray(0, 4)));
  return Buffer.concat([icns.subarray(0, 8), ...delen]);
}
