/** Eigen, alleen-lezende paginalezer voor Jet/ACE-tabeldefinities (indexen) en een onafhankelijke rijtelling. */
import i18next from "i18next";
export interface RuwFormaat {
  naam: string;
  jet3: boolean;
  paginagrootte: number;
  sleutel: number;
}
export interface RuweKolom {
  nummer: number;
  naam: string;
  type: number;
  vast: boolean;
  variabelIndex: number;
  vasteOffset: number;
  lengte: number;
}
export interface RuweIndex {
  naam: string;
  kolommen: { naam: string; oplopend: boolean }[];
  primair: boolean;
  uniek: boolean;
  extern: boolean;
}
export interface RuweTabel {
  rijen: number;
  kolommen: RuweKolom[];
  indexen: RuweIndex[];
}

const versies: Record<number, string> = {
  0: "Jet 3 (Access 97)",
  1: "Jet 4 (Access 2000–2003)",
  2: "ACE 12 (Access 2007)",
  3: "ACE 14 (Access 2010)",
  4: "ACE 15 (Access 2013)",
  5: "ACE 16 (Access 2016+)",
  6: "ACE 17 (Access 2019+)",
};

function rc4(sleutel: Uint8Array, data: Uint8Array) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + sleutel[i % sleutel.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const uit = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    uit[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return uit;
}

export function leesFormaat(bytes: Uint8Array): RuwFormaat {
  if (bytes.length < 2048 || bytes[0] !== 0 || bytes[1] !== 1)
    throw new Error(i18next.t("database:analysis.page.noHeader"));
  const versie = bytes[0x14];
  const jet3 = versie === 0;
  const kop = rc4(
    Uint8Array.of(0xc7, 0xda, 0x39, 0x6b),
    bytes.subarray(0x18, 0x18 + (jet3 ? 126 : 128)),
  );
  const sleutel = new DataView(kop.buffer).getUint32(0x3e - 0x18, true);
  return {
    naam: versies[versie] ?? i18next.t("database:analysis.page.unknownVersion", { version: versie }),
    jet3,
    paginagrootte: jet3 ? 2048 : 4096,
    sleutel: versie >= 2 ? 0 : sleutel,
  };
}

/**
 * Herkent Office-versleuteling van een ACCDB (een databasewachtwoord in
 * Access 2007+ versleutelt het hele bestand). De coderingssleutel staat op
 * 0x3E in de RC4-ontsleutelde kop; het versleutelingsschema op 0x299
 * (zoals Jackcess-encrypt en mdb-reader). Jet 4-RC4-paginacodering zonder
 * wachtwoord leest de eigen lezer en mdb-reader wel; die geeft null.
 */
export function leesVersleuteling(bytes: Uint8Array): string | null {
  if (bytes.length < 0x2a3 || bytes[0] !== 0 || bytes[1] !== 1) return null;
  const versie = bytes[0x14];
  if (versie < 2) return null;
  const kop = rc4(
    Uint8Array.of(0xc7, 0xda, 0x39, 0x6b),
    bytes.subarray(0x18, 0x18 + 128),
  );
  const sleutel = kop.subarray(0x3e - 0x18, 0x3e - 0x18 + 4);
  if (sleutel.every((b) => b === 0)) return null;
  const z = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hoofd = z.getUint16(0x29b, true);
  const sub = z.getUint16(0x29d, true);
  const vlaggen = bytes.length >= 0x2a3 ? z.getUint32(0x29f, true) : 0;
  if (hoofd === 4 && sub === 4) return i18next.t("database:analysis.page.encAgile");
  if ((hoofd === 3 || hoofd === 4) && sub === 3)
    return i18next.t("database:analysis.page.encExtensible");
  if ([2, 3, 4].includes(hoofd) && sub === 2)
    return vlaggen & 0x20
      ? i18next.t("database:analysis.page.encStandard")
      : i18next.t("database:analysis.page.encRc4CryptoApi");
  if (hoofd === 1 && sub === 1) return i18next.t("database:analysis.page.encRc4");
  return i18next.t("database:analysis.page.encOffice");
}

export function leesPagina(
  bytes: Uint8Array,
  formaat: RuwFormaat,
  nummer: number,
) {
  const start = nummer * formaat.paginagrootte;
  if (nummer < 1 || start + formaat.paginagrootte > bytes.length)
    throw new Error(i18next.t("database:analysis.page.outsideFile", { page: nummer }));
  const pagina = bytes.subarray(start, start + formaat.paginagrootte);
  if (!formaat.sleutel) return pagina;
  const sleutel = new Uint8Array(4);
  new DataView(sleutel.buffer).setUint32(
    0,
    (formaat.sleutel ^ nummer) >>> 0,
    true,
  );
  return rc4(sleutel, pagina);
}

function naamLezer(data: Uint8Array, jet3: boolean) {
  const latin = new TextDecoder("windows-1252");
  return (positie: number): [string, number] => {
    if (jet3) {
      const lengte = data[positie];
      return [
        latin.decode(data.subarray(positie + 1, positie + 1 + lengte)),
        positie + 1 + lengte,
      ];
    }
    const lengte = data[positie] | (data[positie + 1] << 8);
    const ruw = data.subarray(positie + 2, positie + 2 + lengte);
    return [decodeerJet4Tekst(ruw), positie + 2 + lengte];
  };
}

export function leesTabeldefinitie(
  bytes: Uint8Array,
  formaat: RuwFormaat,
  paginaNummer: number,
): RuweTabel {
  const delen: Uint8Array[] = [];
  const gezien = new Set<number>();
  for (let n = paginaNummer; n; ) {
    if (gezien.has(n) || gezien.size > 1000)
      throw new Error(i18next.t("database:analysis.page.circular"));
    gezien.add(n);
    const pagina = leesPagina(bytes, formaat, n);
    if (pagina[0] !== 0x02)
      throw new Error(
        i18next.t("database:analysis.page.notTableDef", { page: n }),
      );
    delen.push(delen.length ? pagina.subarray(8) : pagina);
    n = new DataView(pagina.buffer, pagina.byteOffset).getUint32(4, true);
  }
  const data = new Uint8Array(
    delen.reduce((som, deel) => som + deel.length, 0),
  );
  delen.reduce(
    (positie, deel) => (data.set(deel, positie), positie + deel.length),
    0,
  );
  const z = new DataView(data.buffer);
  const j3 = formaat.jet3;
  const rijen = z.getUint32(j3 ? 12 : 16, true);
  const aantalKolommen = z.getUint16(j3 ? 25 : 45, true);
  const aantalIndexen = z.getUint32(j3 ? 27 : 47, true);
  const aantalEcht = z.getUint32(j3 ? 31 : 51, true);
  if (aantalKolommen > 4096 || aantalIndexen > 1024 || aantalEcht > 1024)
    throw new Error(i18next.t("database:analysis.page.implausible"));
  let positie = (j3 ? 43 : 63) + aantalEcht * (j3 ? 8 : 12);
  const kolommen: RuweKolom[] = [];
  for (let i = 0; i < aantalKolommen; i++) {
    kolommen.push({
      type: data[positie],
      nummer: z.getUint16(positie + (j3 ? 1 : 5), true),
      naam: "",
      vast: !!(data[positie + (j3 ? 13 : 15)] & 0x01),
      variabelIndex: z.getUint16(positie + (j3 ? 3 : 7), true),
      vasteOffset: z.getUint16(positie + (j3 ? 14 : 21), true),
      lengte: z.getUint16(positie + (j3 ? 16 : 23), true),
    });
    positie += j3 ? 18 : 25;
  }
  const naam = naamLezer(data, j3);
  for (const kolom of kolommen) [kolom.naam, positie] = naam(positie);
  const kolomNaam = new Map(kolommen.map((k) => [k.nummer, k.naam]));
  const echt: { kolommen: RuweIndex["kolommen"]; uniek: boolean }[] = [];
  for (let i = 0; i < aantalEcht; i++) {
    const basis = positie + (j3 ? 0 : 4);
    const lijst: RuweIndex["kolommen"] = [];
    for (let k = 0; k < 10; k++) {
      const nummer = z.getUint16(basis + k * 3, true);
      if (nummer !== 0xffff)
        lijst.push({
          naam: kolomNaam.get(nummer) ?? `kolom ${nummer}`,
          oplopend: data[basis + k * 3 + 2] !== 2,
        });
    }
    // Na de tien kolomplaatsen (30 bytes) volgen de usage map (4) en de eerste
    // indexpagina (4). Jet 4/ACE heeft daarna nog 4 onbekende bytes vóór de
    // vlaggen (Jackcess: SKIP_BEFORE_INDEX_FLAGS); Jet 3 niet. Vlag 0x01 = uniek.
    echt.push({
      kolommen: lijst,
      uniek: !!(data[basis + (j3 ? 38 : 42)] & 0x01),
    });
    positie += j3 ? 39 : 52;
  }
  const logisch: { echt: number; type: number }[] = [];
  for (let i = 0; i < aantalIndexen; i++) {
    const basis = positie + (j3 ? 0 : 4);
    logisch.push({
      echt: z.getUint32(basis + 4, true),
      type: data[basis + 19],
    });
    positie += j3 ? 20 : 28;
  }
  // Een fysieke index die de primaire sleutel draagt is altijd uniek, ook voor
  // andere logische indexen die hem delen (zoals Jackcess isBackingPrimaryKey).
  const draagtSleutel = new Set(
    logisch.filter((l) => l.type === 1).map((l) => l.echt),
  );
  const indexen = logisch.map((item) => {
    let indexNaam: string;
    [indexNaam, positie] = naam(positie);
    const bron = echt[item.echt];
    return {
      naam: indexNaam,
      kolommen: bron?.kolommen ?? [],
      primair: item.type === 1,
      uniek: draagtSleutel.has(item.echt) || !!bron?.uniek,
      extern: item.type === 2,
    };
  });
  return { rijen, kolommen, indexen };
}

/** Telt rijen per tabeldefinitiepagina door alle datapagina’s te scannen, los van mdb-reader. */
export function telRijenRuw(
  bytes: Uint8Array,
  formaat: RuwFormaat,
): Map<number, number> {
  const tellingen = new Map<number, number>();
  const aantal = Math.floor(bytes.length / formaat.paginagrootte);
  for (let n = 1; n < aantal; n++) {
    if (bytes[n * formaat.paginagrootte] !== 0x01 && !formaat.sleutel) continue;
    const pagina = leesPagina(bytes, formaat, n);
    if (pagina[0] !== 0x01) continue;
    const z = new DataView(pagina.buffer, pagina.byteOffset, pagina.byteLength);
    const eigenaar = z.getUint32(4, true);
    const kop = formaat.jet3 ? 8 : 12;
    let rijen = 0;
    for (let r = 0; r < z.getUint16(kop, true); r++)
      if (!(z.getUint16(kop + 2 + r * 2, true) & 0x8000)) rijen++;
    tellingen.set(eigenaar, (tellingen.get(eigenaar) ?? 0) + rijen);
  }
  return tellingen;
}

/** Jet 4/ACE-tekst: UTF-16LE, of met 0xFF 0xFE gecomprimeerde Unicode. */
function decodeerJet4Tekst(ruw: Uint8Array): string {
  if (ruw[0] !== 0xff || ruw[1] !== 0xfe)
    return new TextDecoder("utf-16le").decode(ruw);
  let tekst = "";
  let gecomprimeerd = true;
  for (let i = 2; i < ruw.length; ) {
    if (ruw[i] === 0) {
      gecomprimeerd = !gecomprimeerd;
      i++;
    } else if (gecomprimeerd) tekst += String.fromCharCode(ruw[i++]);
    else {
      tekst += String.fromCharCode(ruw[i] | (ruw[i + 1] << 8));
      i += 2;
    }
  }
  return tekst;
}

export type RuweWaarde = number | string | Uint8Array | null;
export interface RuweRijenOpties {
  /** Krijgt per overgeslagen rij de reden (bijvoorbeeld een verwijzing buiten het bestand). */
  overgeslagen?: (reden: string) => void;
}

/**
 * Leest rijen ruw (alleen Jet 4/ACE): Long-, tekst-, binaire, OLE- en
 * memokolommen (lange waarden via LVAL-pagina’s); andere typen worden null.
 * Bedoeld voor systeemtabellen die mdb-reader weigert. Rijen die niet te
 * lezen zijn (bijvoorbeeld een verwijzing naar een pagina buiten een
 * afgebroken bestand) worden overgeslagen en via `opties.overgeslagen` gemeld.
 */
export function leesRijenRuw(
  bytes: Uint8Array,
  formaat: RuwFormaat,
  tabelPagina: number,
  opties: RuweRijenOpties = {},
): Record<string, RuweWaarde>[] {
  if (formaat.jet3)
    throw new Error(i18next.t("database:analysis.page.rawRowsJet4Only"));
  const { kolommen } = leesTabeldefinitie(bytes, formaat, tabelPagina);
  const rijen: Record<string, RuweWaarde>[] = [];
  const plaats = (pagina: Uint8Array, rij: number) => {
    const z = new DataView(pagina.buffer, pagina.byteOffset, pagina.byteLength);
    if (rij >= z.getUint16(12, true))
      throw new Error(i18next.t("database:analysis.page.rowOutsidePage"));
    const offset = z.getUint16(14 + rij * 2, true);
    const start = offset & 0x1fff;
    const einde = rij
      ? z.getUint16(14 + (rij - 1) * 2, true) & 0x1fff
      : pagina.length;
    if (start > einde) throw new Error(i18next.t("database:analysis.page.invalidRowBounds"));
    return { offset, inhoud: pagina.subarray(start, einde) };
  };
  const verwijzing = (data: Uint8Array, positie: number) => ({
    rij: data[positie],
    pagina:
      data[positie + 1] | (data[positie + 2] << 8) | (data[positie + 3] << 16),
  });
  const leesRij = (
    pagina: Uint8Array,
    rij: number,
    diepte: number,
  ): Uint8Array | null => {
    const { offset, inhoud } = plaats(pagina, rij);
    if (offset & 0x8000 && !diepte) return null;
    if (!(offset & 0x4000)) return inhoud;
    if (diepte > 3) throw new Error(i18next.t("database:analysis.page.overflowTooDeep"));
    const doel = verwijzing(inhoud, 0);
    return leesRij(leesPagina(bytes, formaat, doel.pagina), doel.rij, diepte + 1);
  };
  // Lange waarde (OLE/memo): 12 bytes kop; 0x80000000 = in de rij,
  // 0x40000000 = één LVAL-rij, anders een keten van LVAL-rijen.
  const langeWaarde = (veld: Uint8Array): Uint8Array => {
    if (veld.length < 12) throw new Error(i18next.t("database:analysis.page.invalidLongValue"));
    const kop = new DataView(veld.buffer, veld.byteOffset, 12).getUint32(0, true);
    const lengte = kop & 0x3fffffff;
    if (kop & 0x80000000) return veld.slice(12, 12 + lengte);
    let doel = verwijzing(veld, 4);
    if (kop & 0x40000000)
      return plaats(leesPagina(bytes, formaat, doel.pagina), doel.rij).inhoud.slice(0, lengte);
    const uit = new Uint8Array(lengte);
    let gevuld = 0;
    for (let stap = 0; gevuld < lengte && doel.pagina; stap++) {
      if (stap > 100000) throw new Error(i18next.t("database:analysis.page.lvalChainTooLong"));
      const deel = plaats(leesPagina(bytes, formaat, doel.pagina), doel.rij).inhoud;
      const stuk = deel.subarray(4, 4 + Math.min(deel.length - 4, lengte - gevuld));
      uit.set(stuk, gevuld);
      gevuld += stuk.length;
      doel = verwijzing(deel, 0);
    }
    if (gevuld < lengte) throw new Error(i18next.t("database:analysis.page.longValueIncomplete"));
    return uit;
  };
  const aantal = Math.floor(bytes.length / formaat.paginagrootte);
  for (let n = 1; n < aantal; n++) {
    if (bytes[n * formaat.paginagrootte] !== 0x01 && !formaat.sleutel) continue;
    const pagina = leesPagina(bytes, formaat, n);
    const z = new DataView(pagina.buffer, pagina.byteOffset, pagina.byteLength);
    if (pagina[0] !== 0x01 || z.getUint32(4, true) !== tabelPagina) continue;
    for (let r = 0; r < z.getUint16(12, true); r++) {
      try {
        const rij = leesRij(pagina, r, 0);
        if (rij) rijen.push(decodeerRij(rij));
      } catch (fout) {
        opties.overgeslagen?.(
          i18next.t("database:analysis.page.skippedRow", { page: n, row: r, error: fout instanceof Error ? fout.message : String(fout) }),
        );
      }
    }
  }
  function decodeerRij(rij: Uint8Array) {
    const rz = new DataView(rij.buffer, rij.byteOffset, rij.byteLength);
    const aantalKolommen = rz.getUint16(0, true);
    const maskerLengte = Math.ceil(aantalKolommen / 8);
    const masker = rij.subarray(rij.length - maskerLengte);
    const variabel = rz.getUint16(rij.length - maskerLengte - 2, true);
    const varOffset = (i: number) =>
      rz.getUint16(rij.length - maskerLengte - 4 - i * 2, true);
    const waarden: Record<string, RuweWaarde> = {};
    for (const kolom of kolommen) {
      const aanwezig =
        kolom.nummer < aantalKolommen &&
        (masker[kolom.nummer >> 3] >> (kolom.nummer & 7)) & 1;
      const inhoud = !aanwezig
        ? null
        : kolom.vast
          ? rij.subarray(
              2 + kolom.vasteOffset,
              2 + kolom.vasteOffset + kolom.lengte,
            )
          : kolom.variabelIndex < variabel
            ? rij.subarray(
                varOffset(kolom.variabelIndex),
                varOffset(kolom.variabelIndex + 1),
              )
            : null;
      let waarde: RuweWaarde = null;
      if (inhoud)
        switch (kolom.type) {
          case 4:
            waarde =
              inhoud.length === 4
                ? new DataView(inhoud.buffer, inhoud.byteOffset, 4).getInt32(0, true)
                : null;
            break;
          case 9:
          case 17:
            waarde = inhoud.slice();
            break;
          case 10:
            waarde = decodeerJet4Tekst(inhoud);
            break;
          case 11:
            waarde = langeWaarde(inhoud);
            break;
          case 12:
            waarde = decodeerJet4Tekst(langeWaarde(inhoud));
            break;
        }
      waarden[kolom.naam] = waarde;
    }
    return waarden;
  }
  return rijen;
}
