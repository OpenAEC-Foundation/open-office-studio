/** Dezelfde grenzen voor nieuwe én reeds ingebedde afbeeldingen; bytes blijven behouden. */
export function beeldVoorbeeldToegestaan(b: Uint8Array): boolean {
  return b.byteLength <= 20 * 1024 * 1024 && beeldAfmetingen(b) !== null;
}

/** Controleer rasterafmetingen vóór een browserdecoder veel geheugen reserveert. */
export function beeldAfmetingen(
  b: Uint8Array,
): { breedte: number; hoogte: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tekst = (n: number, lengte: number) =>
    String.fromCharCode(...b.subarray(n, n + lengte));
  let breedte = 0,
    hoogte = 0;
  if (b.length >= 24 && tekst(1, 3) === "PNG" && tekst(12, 4) === "IHDR") {
    breedte = v.getUint32(16);
    hoogte = v.getUint32(20);
  } else if (b.length >= 10 && /^GIF8[79]a$/.test(tekst(0, 6))) {
    breedte = v.getUint16(6, true);
    hoogte = v.getUint16(8, true);
  } else if (b.length >= 26 && tekst(0, 2) === "BM") {
    breedte = v.getInt32(18, true);
    hoogte = Math.abs(v.getInt32(22, true));
  } else if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 4 <= b.length && p < 1024 * 1024) {
      if (b[p++] !== 0xff) break;
      while (b[p] === 0xff) p++;
      const marker = b[p++];
      if (marker === 0xd9 || marker === 0xda || p + 2 > b.length) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      const lengte = v.getUint16(p);
      if (lengte < 2 || p + lengte > b.length) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker) &&
        lengte >= 7
      ) {
        hoogte = v.getUint16(p + 3);
        breedte = v.getUint16(p + 5);
        break;
      }
      p += lengte;
    }
  } else if (
    b.length >= 30 &&
    tekst(0, 4) === "RIFF" &&
    tekst(8, 4) === "WEBP"
  ) {
    if (tekst(12, 4) === "VP8X") {
      breedte = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
      hoogte = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
    } else if (tekst(12, 4) === "VP8L" && b[20] === 0x2f) {
      breedte = 1 + b[21] + ((b[22] & 0x3f) << 8);
      hoogte = 1 + (b[22] >> 6) + (b[23] << 2) + ((b[24] & 0xf) << 10);
    } else if (
      tekst(12, 4) === "VP8 " &&
      b[23] === 0x9d &&
      b[24] === 0x01 &&
      b[25] === 0x2a
    ) {
      breedte = v.getUint16(26, true) & 0x3fff;
      hoogte = v.getUint16(28, true) & 0x3fff;
    }
  }
  return breedte > 0 &&
    hoogte > 0 &&
    breedte <= 32768 &&
    hoogte <= 32768 &&
    breedte * hoogte <= 64 * 1024 * 1024
    ? { breedte, hoogte }
    : null;
}
