/** Minimale, alleen-lezende lezer voor Compound File Binary (MS-CFB), voor VBA-opslag. */
import i18next from "i18next";
export interface CfbItem {
  pad: string;
  soort: "opslag" | "stroom";
  data?: Uint8Array;
}

const EINDE = 0xfffffffe;
const VRIJ = 0xffffffff;

export function isCfb(bytes: Uint8Array) {
  return (
    bytes.length >= 512 &&
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (waarde, index) => bytes[index] === waarde,
    )
  );
}

export function leesCfb(bytes: Uint8Array): CfbItem[] {
  if (!isCfb(bytes)) throw new Error(i18next.t("database:ovba.notCfb"));
  const zicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (positie: number) => zicht.getUint32(positie, true);
  const sectorGrootte = 1 << zicht.getUint16(30, true);
  const miniGrootte = 1 << zicht.getUint16(32, true);
  if (sectorGrootte !== 512 && sectorGrootte !== 4096)
    throw new Error("Onbekende CFB-sectorgrootte.");
  const sector = (nummer: number) => sectorGrootte + nummer * sectorGrootte;
  const fatSectoren: number[] = [];
  for (let i = 0; i < 109; i++) {
    const nummer = u32(76 + i * 4);
    if (nummer !== VRIJ) fatSectoren.push(nummer);
  }
  let difat = u32(68);
  for (
    let ronde = 0;
    difat !== EINDE && difat !== VRIJ && ronde < 10000;
    ronde++
  ) {
    const basis = sector(difat);
    for (let i = 0; i < sectorGrootte / 4 - 1; i++) {
      const nummer = u32(basis + i * 4);
      if (nummer !== VRIJ) fatSectoren.push(nummer);
    }
    difat = u32(basis + sectorGrootte - 4);
  }
  const fat: number[] = [];
  for (const nummer of fatSectoren) {
    const basis = sector(nummer);
    if (basis + sectorGrootte > bytes.length)
      throw new Error(i18next.t("database:ovba.fatOutside"));
    for (let i = 0; i < sectorGrootte / 4; i++) fat.push(u32(basis + i * 4));
  }
  const keten = (start: number, tabel: number[]) => {
    const reeks: number[] = [];
    const gezien = new Set<number>();
    for (let n = start; n !== EINDE && n !== VRIJ; n = tabel[n]) {
      if (n === undefined || gezien.has(n))
        throw new Error("Ongeldige CFB-sectorketen.");
      gezien.add(n);
      reeks.push(n);
    }
    return reeks;
  };
  const leesKeten = (start: number) => {
    const reeks = keten(start, fat);
    const uit = new Uint8Array(reeks.length * sectorGrootte);
    reeks.forEach((n, i) => {
      if (sector(n) + sectorGrootte > bytes.length)
        throw new Error(i18next.t("database:ovba.sectorOutside"));
      uit.set(
        bytes.subarray(sector(n), sector(n) + sectorGrootte),
        i * sectorGrootte,
      );
    });
    return uit;
  };
  const map = leesKeten(u32(48));
  const mapZicht = new DataView(map.buffer);
  const miniFatStart = u32(60);
  const miniFat: number[] = [];
  if (miniFatStart !== EINDE && miniFatStart !== VRIJ) {
    const ruw = leesKeten(miniFatStart);
    const z = new DataView(ruw.buffer);
    for (let i = 0; i < ruw.length / 4; i++)
      miniFat.push(z.getUint32(i * 4, true));
  }
  const items: {
    naam: string;
    type: number;
    links: number;
    rechts: number;
    kind: number;
    start: number;
    grootte: number;
  }[] = [];
  for (let i = 0; i + 128 <= map.length; i += 128) {
    const lengte = Math.max(0, mapZicht.getUint16(i + 64, true) - 2);
    items.push({
      naam: new TextDecoder("utf-16le").decode(
        map.subarray(i, i + Math.min(lengte, 62)),
      ),
      type: map[i + 66],
      links: mapZicht.getUint32(i + 68, true),
      rechts: mapZicht.getUint32(i + 72, true),
      kind: mapZicht.getUint32(i + 76, true),
      start: mapZicht.getUint32(i + 116, true),
      grootte: mapZicht.getUint32(i + 120, true),
    });
  }
  const wortel = items[0];
  if (!wortel || wortel.type !== 5) throw new Error(i18next.t("database:ovba.rootMissing"));
  const miniStroom =
    wortel.start === EINDE ? new Uint8Array() : leesKeten(wortel.start);
  const stroom = (item: (typeof items)[number]) => {
    if (item.grootte < 4096) {
      const reeks = keten(item.start, miniFat);
      const uit = new Uint8Array(reeks.length * miniGrootte);
      reeks.forEach((n, i) =>
        uit.set(
          miniStroom.subarray(n * miniGrootte, (n + 1) * miniGrootte),
          i * miniGrootte,
        ),
      );
      return uit.subarray(0, item.grootte);
    }
    return leesKeten(item.start).subarray(0, item.grootte);
  };
  const resultaat: CfbItem[] = [];
  const bezocht = new Set<number>();
  const loop = (index: number, ouder: string) => {
    if (index === VRIJ || index >= items.length || bezocht.has(index)) return;
    bezocht.add(index);
    const item = items[index];
    loop(item.links, ouder);
    const pad = ouder ? `${ouder}/${item.naam}` : item.naam;
    if (item.type === 1) {
      resultaat.push({ pad, soort: "opslag" });
      loop(item.kind, pad);
    } else if (item.type === 2)
      resultaat.push({ pad, soort: "stroom", data: stroom(item) });
    loop(item.rechts, ouder);
  };
  loop(wortel.kind, "");
  return resultaat;
}
