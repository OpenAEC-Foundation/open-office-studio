/** Kopieer ongewijzigde ZIP-onderdelen gecomprimeerd; pak grote werkbladen niet opnieuw uit. */
import { strFromU8 } from "fflate";
export interface ZipDeel { naam: string; lokaal: Uint8Array; centraal: Uint8Array }
export function zipDelen(bytes: Uint8Array): ZipDeel[] | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (n: number) => v.getUint16(n, true), u32 = (n: number) => v.getUint32(n, true);
  try {
    let eind = bytes.length - 22;
    while (eind >= Math.max(0, bytes.length - 65557) && (u32(eind) !== 0x06054b50 || eind + 22 + u16(eind + 20) !== bytes.length)) eind--;
    if (eind < 0 || u32(eind) !== 0x06054b50) return null;
    const aantal = u16(eind + 10), begin = u32(eind + 16);
    // ZIP64 en meerdelige archieven blijven bij de bestaande fflate-route.
    if (u16(eind + 4) || u16(eind + 6) || u16(eind + 8) !== aantal || aantal === 65535 || begin === 0xffffffff) return null;
    const lijst: { naam: string; start: number; dataEind: number; centraal: Uint8Array }[] = [];
    let pos = begin;
    for (let n = 0; n < aantal; n++) {
      if (u32(pos) !== 0x02014b50) return null;
      const lengte = u16(pos + 28), extra = u16(pos + 30), commentaar = u16(pos + 32), start = u32(pos + 42), grootte = u32(pos + 20);
      const volgend = pos + 46 + lengte + extra + commentaar;
      if (start === 0xffffffff || grootte === 0xffffffff || u16(pos + 34) || volgend > eind || u32(start) !== 0x04034b50) return null;
      const dataEind = start + 30 + u16(start + 26) + u16(start + 28) + grootte;
      if (dataEind > begin) return null;
      lijst.push({ naam: strFromU8(bytes.subarray(pos + 46, pos + 46 + lengte), !(u16(pos + 8) & 2048)), start, dataEind, centraal: bytes.subarray(pos, volgend) });
      pos = volgend;
    }
    if (pos !== begin + u32(eind + 12)) return null;
    const fysiek = [...lijst].sort((a, b) => a.start - b.start);
    const grenzen = new Map(fysiek.map((deel, i) => [deel.start, fysiek[i + 1]?.start ?? begin]));
    if (fysiek.some((d) => d.dataEind > grenzen.get(d.start)!)) return null;
    return lijst.map((d) => ({ naam: d.naam, lokaal: bytes.subarray(d.start, grenzen.get(d.start)), centraal: d.centraal }));
  } catch { return null; }
}
export function voegZipDelenSamen(delen: ZipDeel[]): Uint8Array {
  const lokaal = delen.reduce((n, d) => n + d.lokaal.length, 0), centraal = delen.reduce((n, d) => n + d.centraal.length, 0);
  if (delen.length >= 65535 || lokaal + centraal + 22 >= 0xffffffff) throw new Error("ZIP64 output is not supported");
  const uit = new Uint8Array(lokaal + centraal + 22), v = new DataView(uit.buffer);
  let p = 0, c = lokaal;
  for (const d of delen) {
    uit.set(d.lokaal, p); uit.set(d.centraal, c); v.setUint32(c + 42, p, true);
    p += d.lokaal.length; c += d.centraal.length;
  }
  v.setUint32(c, 0x06054b50, true); v.setUint16(c + 8, delen.length, true); v.setUint16(c + 10, delen.length, true);
  v.setUint32(c + 12, centraal, true); v.setUint32(c + 16, lokaal, true);
  return uit;
}
