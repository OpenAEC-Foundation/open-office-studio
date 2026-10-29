/** Eigen implementatie van MS-OVBA 2.4.1 (decompressie) en 2.3.4.2 (dir-stream). Voert niets uit. */
import i18next from "i18next";
export interface VbaModuleVerwijzing {
  naam: string;
  stroom: string;
  offset: number;
  soort: "Standaardmodule" | "Klasse- of documentmodule";
}
export interface VbaVerwijzing {
  naam: string;
  soort:
    | "Geregistreerde bibliotheek"
    | "ActiveX-besturingselement"
    | "Projectverwijzing"
    | "Onbekend";
}
export interface VbaProjectInfo {
  projectnaam: string;
  codepagina: number;
  modules: VbaModuleVerwijzing[];
  verwijzingen: VbaVerwijzing[];
}

export function pakVbaUit(invoer: Uint8Array, start = 0): Uint8Array {
  if (invoer[start] !== 0x01)
    throw new Error("Geen MS-OVBA-container: handtekening 0x01 ontbreekt.");
  const uit: number[] = [];
  let positie = start + 1;
  while (positie < invoer.length) {
    if (positie + 2 > invoer.length)
      throw new Error("Afgebroken MS-OVBA-blokkop.");
    const kop = invoer[positie] | (invoer[positie + 1] << 8);
    const grootte = (kop & 0x0fff) + 3;
    if (((kop >> 12) & 0x07) !== 0b011)
      throw new Error("Ongeldige MS-OVBA-blokhandtekening.");
    const einde = Math.min(positie + grootte, invoer.length);
    const blokStart = uit.length;
    positie += 2;
    if (!(kop & 0x8000)) {
      if (positie + 4096 > invoer.length)
        throw new Error(i18next.t("database:ovba.truncatedChunk"));
      for (let i = 0; i < 4096; i++) uit.push(invoer[positie + i]);
      positie += 4096;
      continue;
    }
    while (positie < einde) {
      const vlaggen = invoer[positie++];
      for (let bit = 0; bit < 8 && positie < einde; bit++) {
        if (!((vlaggen >> bit) & 1)) {
          uit.push(invoer[positie++]);
          continue;
        }
        if (positie + 2 > einde)
          throw new Error("Afgebroken MS-OVBA-kopieertoken.");
        const token = invoer[positie] | (invoer[positie + 1] << 8);
        positie += 2;
        const verschil = uit.length - blokStart;
        let bits = 4;
        while (1 << bits < verschil) bits++;
        const lengteMasker = 0xffff >> bits;
        const lengte = (token & lengteMasker) + 3;
        const afstand = (token >> (16 - bits)) + 1;
        if (afstand > verschil)
          throw new Error(i18next.t("database:ovba.copyTokenOutside"));
        const bron = uit.length - afstand;
        for (let i = 0; i < lengte; i++) uit.push(uit[bron + i]);
      }
    }
    positie = einde;
  }
  return Uint8Array.from(uit);
}

const codepaginas: Record<number, string> = {
  874: "windows-874",
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
  1200: "utf-16le",
  10000: "macintosh",
  20127: "us-ascii",
  28591: "iso-8859-1",
  65001: "utf-8",
};
export function decodeerVbaTekst(bytes: Uint8Array, codepagina: number) {
  const label =
    codepaginas[codepagina] ??
    (codepagina >= 1250 && codepagina <= 1258
      ? `windows-${codepagina}`
      : "windows-1252");
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function leesVbaDir(gecomprimeerd: Uint8Array): VbaProjectInfo {
  const dir = pakVbaUit(gecomprimeerd);
  const zicht = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const info: VbaProjectInfo = {
    projectnaam: "",
    codepagina: 1252,
    modules: [],
    verwijzingen: [],
  };
  const verwijzingen: {
    naam?: Uint8Array;
    unicodeNaam?: Uint8Array;
    soort: VbaVerwijzing["soort"];
  }[] = [];
  const ruw: {
    naam?: Uint8Array;
    stroom?: Uint8Array;
    unicodeNaam?: Uint8Array;
    unicodeStroom?: Uint8Array;
    offset?: number;
    soort?: VbaModuleVerwijzing["soort"];
  }[] = [];
  let module: (typeof ruw)[number] | null = null;
  let projectnaam: Uint8Array | null = null;
  let inControle = false;
  let positie = 0;
  while (positie + 6 <= dir.length) {
    const id = zicht.getUint16(positie, true);
    let grootte = zicht.getUint32(positie + 2, true);
    if (id === 0x0009) grootte = 6;
    const data = dir.subarray(positie + 6, positie + 6 + grootte);
    if (positie + 6 + grootte > dir.length)
      throw new Error(i18next.t("database:ovba.dirTruncated"));
    positie += 6 + grootte;
    if (id === 0x0003 && grootte >= 2)
      info.codepagina = data[0] | (data[1] << 8);
    else if (id === 0x0004) projectnaam = data;
    else if (id === 0x0030) inControle = false;
    else if (inControle && (id === 0x0016 || id === 0x003e)) continue;
    else if (!ruw.length && id === 0x0016)
      verwijzingen.push({ naam: data, soort: "Onbekend" });
    else if (!ruw.length && id === 0x003e && verwijzingen.length)
      verwijzingen[verwijzingen.length - 1].unicodeNaam = data;
    else if (!ruw.length && [0x000d, 0x000e, 0x002f, 0x0033].includes(id)) {
      const laatste = verwijzingen[verwijzingen.length - 1];
      const soort =
        id === 0x000d
          ? "Geregistreerde bibliotheek"
          : id === 0x000e
            ? "Projectverwijzing"
            : "ActiveX-besturingselement";
      if (id === 0x002f) inControle = true;
      if (laatste && laatste.soort === "Onbekend") laatste.soort = soort;
      else if (!laatste || laatste.soort !== soort)
        verwijzingen.push({ soort });
    } else if (id === 0x0019) {
      module = { naam: data };
      ruw.push(module);
    } else if (module && id === 0x0047) module.unicodeNaam = data;
    else if (module && id === 0x001a) module.stroom = data;
    else if (module && id === 0x0032) module.unicodeStroom = data;
    else if (module && id === 0x0031 && grootte >= 4)
      module.offset = new DataView(data.buffer, data.byteOffset, 4).getUint32(
        0,
        true,
      );
    else if (module && id === 0x0021) module.soort = "Standaardmodule";
    else if (module && id === 0x0022)
      module.soort = "Klasse- of documentmodule";
    else if (id === 0x002b) module = null;
    else if (id === 0x0010) break;
  }
  const utf16 = new TextDecoder("utf-16le");
  const tekst = (unicode?: Uint8Array, mbcs?: Uint8Array) =>
    unicode?.length
      ? utf16.decode(unicode)
      : mbcs
        ? decodeerVbaTekst(mbcs, info.codepagina)
        : "";
  info.projectnaam = projectnaam
    ? decodeerVbaTekst(projectnaam, info.codepagina)
    : "";
  info.verwijzingen = verwijzingen.map((v) => ({
    naam: tekst(v.unicodeNaam, v.naam) || "(naamloos)",
    soort: v.soort,
  }));
  for (const item of ruw) {
    const naam = tekst(item.unicodeNaam, item.naam);
    if (item.offset === undefined)
      throw new Error(i18next.t("database:ovba.noSourceOffset", { name: naam }));
    info.modules.push({
      naam,
      stroom: tekst(item.unicodeStroom, item.stroom) || naam,
      offset: item.offset,
      soort: item.soort ?? "Standaardmodule",
    });
  }
  return info;
}

/** Leest modulebron vanaf de dir-offset; geeft null als er geen tekstbron (alleen p-code) is. */
export function leesVbaModuleBron(
  stroom: Uint8Array,
  offset: number,
  codepagina: number,
): string | null {
  if (offset >= stroom.length) return null;
  const bron = decodeerVbaTekst(pakVbaUit(stroom, offset), codepagina);
  return bron.trim() ? bron.replace(/\r?\n/g, "\r\n") : null;
}

/** MS-OVBA 2.4.3: ontsleutelt CMG/DPB/GC-waarden uit de PROJECT-stroom (geen wachtwoordherstel). */
export function ontsleutelProjectwaarde(hex: string): Uint8Array {
  const invoer = Uint8Array.from(hex.match(/../g) ?? [], (paar) =>
    parseInt(paar, 16),
  );
  if (invoer.length < 8) throw new Error(i18next.t("database:ovba.valueTooShort"));
  const [zaad, versieVersleuteld, sleutelVersleuteld] = invoer;
  if ((zaad ^ versieVersleuteld) !== 2)
    throw new Error(i18next.t("database:ovba.unknownEncryptionVersion"));
  let onversleuteld = zaad ^ sleutelVersleuteld;
  let versleuteld1 = sleutelVersleuteld;
  let versleuteld2 = versieVersleuteld;
  let positie = 3;
  const volgende = () => {
    if (positie >= invoer.length) throw new Error(i18next.t("database:ovba.valueTruncated"));
    const versleuteld = invoer[positie++];
    const waarde = versleuteld ^ ((versleuteld2 + onversleuteld) & 0xff);
    versleuteld2 = versleuteld1;
    versleuteld1 = versleuteld;
    onversleuteld = waarde;
    return waarde;
  };
  for (let i = 0; i < (zaad & 6) / 2; i++) volgende();
  let lengte = 0;
  for (let i = 0; i < 4; i++) lengte |= volgende() << (8 * i);
  if (lengte < 0 || lengte > invoer.length)
    throw new Error(i18next.t("database:ovba.invalidValueLength"));
  return Uint8Array.from({ length: lengte }, volgende);
}

export interface VbaBeveiliging {
  wachtwoord: boolean | null;
  vergrendeld: boolean | null;
}
export function leesProjectBeveiliging(project: string): VbaBeveiliging {
  const waarde = (sleutel: string) =>
    project.match(new RegExp(`^${sleutel}="([0-9A-Fa-f]+)"`, "m"))?.[1];
  const veilig = <T>(actie: () => T) => {
    try {
      return actie();
    } catch {
      return null;
    }
  };
  const dpb = waarde("DPB");
  const cmg = waarde("CMG");
  return {
    wachtwoord: dpb
      ? veilig(() => {
          const data = ontsleutelProjectwaarde(dpb);
          return !(data.length === 1 && data[0] === 0);
        })
      : null,
    vergrendeld: cmg
      ? veilig(() => (ontsleutelProjectwaarde(cmg)[0] & 0x01) === 1)
      : null,
  };
}
