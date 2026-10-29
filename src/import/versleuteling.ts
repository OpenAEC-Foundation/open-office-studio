/**
 * Wachtwoordbeveiligde Office-bestanden (MS-OFFCRYPTO), met WebCrypto.
 *
 * - Herkennen: versleutelde OOXML (CFB met EncryptionInfo en
 *   EncryptedPackage), en oude binaire bestanden met RC4 (.doc, .xls, .ppt).
 * - Ontsleutelen: ECMA-376 Agile (AES, SHA-1/256/384/512) en Standard
 *   (AES-128/192/256 met SHA-1). RC4 wordt alleen herkend.
 * - Versleutelen: Agile met AES-256-CBC en SHA-512 (100.000 rondes), zoals
 *   Office zelf, inclusief gegevensintegriteit (HMAC).
 *
 * Wachtwoorden worden alleen als argument doorgegeven; deze module bewaart
 * of logt ze nooit en foutmeldingen bevatten ze niet.
 */
import i18next from "../i18n/config";
import { isCfb, leesCfb } from "../../packages/database/src/cfb";
import { schrijfCfb } from "./cfbschrijver";
import { herhaalHash } from "./sha";

const DATASPACES = String.fromCharCode(6) + "DataSpaces";
const PRIMARY = String.fromCharCode(6) + "Primary";

export type Versleuteling =
  | { soort: "agile"; info: Uint8Array; pakket: Uint8Array }
  | { soort: "standard"; info: Uint8Array; pakket: Uint8Array }
  | { soort: "rc4"; formaat: "doc" | "xls" | "ppt" }
  | { soort: "onbekend"; versie: string };

export class VerkeerdWachtwoord extends Error {
  constructor() {
    super(i18next.t("import:errors.wrongPassword"));
    this.name = "VerkeerdWachtwoord";
  }
}

const u16 = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8);
const u32 = (b: Uint8Array, p: number) =>
  (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;

/** Herkent versleuteling; null als het bestand niet versleuteld is (of geen CFB). */
export function herkenVersleuteling(bytes: Uint8Array): Versleuteling | null {
  if (!isCfb(bytes)) return null;
  let items;
  try {
    items = leesCfb(bytes);
  } catch {
    // Sommige schrijvers kappen de laatste sector af; aanvullen en opnieuw.
    try {
      const aangevuld = new Uint8Array(Math.ceil(bytes.length / 4096) * 4096);
      aangevuld.set(bytes);
      items = leesCfb(aangevuld);
    } catch {
      return null;
    }
  }
  const stroom = (pad: string) =>
    items.find(
      (i) => i.soort === "stroom" && i.pad.toLowerCase() === pad.toLowerCase(),
    )?.data;
  const info = stroom("EncryptionInfo");
  const pakket = stroom("EncryptedPackage");
  if (info && pakket) {
    const groot = u16(info, 0),
      klein = u16(info, 2);
    if (groot === 4 && klein === 4) return { soort: "agile", info, pakket };
    if ((groot === 2 || groot === 3 || groot === 4) && klein === 2)
      return { soort: "standard", info, pakket };
    return { soort: "onbekend", versie: `${groot}.${klein}` };
  }
  // Word 97–2003: bit fEncrypted in de FIB (offset 0x0B, bit 0).
  const word = stroom("WordDocument");
  if (word && word.length > 12 && u16(word, 0) === 0xa5ec && word[0x0b] & 0x01)
    return { soort: "rc4", formaat: "doc" };
  // Excel 97–2003: een FILEPASS-record (0x002F) direct na BOF.
  const werkmap = stroom("Workbook") ?? stroom("Book");
  if (werkmap) {
    let p = 0;
    for (let n = 0; n < 64 && p + 4 <= werkmap.length; n++) {
      const type = u16(werkmap, p),
        lengte = u16(werkmap, p + 2);
      if (type === 0x002f) return { soort: "rc4", formaat: "xls" };
      p += 4 + lengte;
    }
  }
  // PowerPoint 97–2003: een versleutelde sessie of het kenmerk in CurrentUser.
  const gebruiker = stroom("Current User");
  if (
    stroom("EncryptedSummary") ||
    (gebruiker && gebruiker.length >= 16 && u32(gebruiker, 12) === 0xf3d1c4df)
  )
    return { soort: "rc4", formaat: "ppt" };
  return null;
}

/* ── Hulpfuncties ─────────────────────────────────────────────────────── */

const subtle = () => {
  const c = globalThis.crypto?.subtle;
  if (!c)
    throw new Error(i18next.t("import:errors.noWebCrypto"));
  return c;
};

type Hash = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
const HASHGROOTTE: Record<Hash, number> = {
  "SHA-1": 20,
  "SHA-256": 32,
  "SHA-384": 48,
  "SHA-512": 64,
};
function hashNaam(naam: string): Hash {
  const n = naam.toUpperCase().replace(/-/g, "");
  if (n === "SHA1") return "SHA-1";
  if (n === "SHA256") return "SHA-256";
  if (n === "SHA384") return "SHA-384";
  if (n === "SHA512") return "SHA-512";
  throw new Error(i18next.t("import:errors.hashNotSupported", { name: naam }));
}

const samen = (...delen: Uint8Array[]) => {
  const uit = new Uint8Array(delen.reduce((n, d) => n + d.length, 0));
  let p = 0;
  for (const d of delen) {
    uit.set(d, p);
    p += d.length;
  }
  return uit;
};
const le32 = (n: number) =>
  new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);
const utf16 = (tekst: string) => {
  const uit = new Uint8Array(tekst.length * 2);
  for (let i = 0; i < tekst.length; i++) {
    uit[i * 2] = tekst.charCodeAt(i) & 0xff;
    uit[i * 2 + 1] = tekst.charCodeAt(i) >> 8;
  }
  return uit;
};
const b64 = (tekst: string) =>
  Uint8Array.from(atob(tekst), (c) => c.charCodeAt(0));
const naarB64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const buffer = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

async function hash(algoritme: Hash, ...delen: Uint8Array[]) {
  return new Uint8Array(
    await subtle().digest(algoritme, buffer(samen(...delen))),
  );
}

/** Wachtwoordhash met iteraties (MS-OFFCRYPTO 2.3.4.7 / 2.3.4.11). */
async function wachtwoordHash(
  algoritme: Hash,
  zout: Uint8Array,
  wachtwoord: string,
  rondes: number,
) {
  if (rondes > 10_000_000)
    throw new Error(i18next.t("import:errors.tooManyHashRounds"));
  return herhaalHash(
    algoritme,
    await hash(algoritme, zout, utf16(wachtwoord)),
    rondes,
  );
}

/** Breng op lengte: afkappen of aanvullen met 0x36 (MS-OFFCRYPTO 2.3.4.11). */
function opLengte(b: Uint8Array, lengte: number, vul = 0x36) {
  if (b.length >= lengte) return b.slice(0, lengte);
  const uit = new Uint8Array(lengte).fill(vul);
  uit.set(b);
  return uit;
}

async function aesSleutel(sleutel: Uint8Array) {
  return subtle().importKey(
    "raw",
    buffer(sleutel),
    { name: "AES-CBC" },
    false,
    ["encrypt", "decrypt"],
  );
}

/** AES-CBC zonder opvulling, versleutelen: WebCrypto voegt PKCS#7 toe, die knippen we af. */
async function aesVersleutel(
  sleutel: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
) {
  if (data.length % 16) throw new Error(i18next.t("import:errors.dataNotBlockAligned"));
  const k = await aesSleutel(sleutel);
  const uit = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-CBC", iv: buffer(iv) },
      k,
      buffer(data),
    ),
  );
  return uit.subarray(0, data.length);
}

/**
 * AES-CBC zonder opvulling, ontsleutelen. WebCrypto eist PKCS#7; daarom
 * voegen we één blok toe dat na ontsleutelen precies een volledig
 * opvulblok oplevert.
 */
async function aesOntsleutel(
  sleutel: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
) {
  if (!data.length) return new Uint8Array();
  if (data.length % 16)
    throw new Error(i18next.t("import:errors.encryptedDataNotBlockAligned"));
  const k = await aesSleutel(sleutel);
  const laatste = data.subarray(data.length - 16);
  const opvul = new Uint8Array(16).fill(16);
  const extra = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-CBC", iv: buffer(laatste) },
      k,
      buffer(opvul),
    ),
  ).subarray(0, 16);
  const uit = await subtle().decrypt(
    { name: "AES-CBC", iv: buffer(iv) },
    k,
    buffer(samen(data, extra)),
  );
  return new Uint8Array(uit);
}

/** AES-ECB ontsleutelen via CBC: elk blok daarna met het vorige cijferblok XOR-en. */
async function aesEcbOntsleutel(sleutel: Uint8Array, data: Uint8Array) {
  const cbc = await aesOntsleutel(sleutel, new Uint8Array(16), data);
  for (let i = 16; i < cbc.length; i++) cbc[i] ^= data[i - 16];
  return cbc;
}

function gelijk(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a[i] ^ b[i];
  return verschil === 0;
}

/* ── Agile ───────────────────────────────────────────────────────────── */

const BLOK_INVOER = new Uint8Array([
  0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79,
]);
const BLOK_WAARDE = new Uint8Array([
  0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e,
]);
const BLOK_SLEUTEL = new Uint8Array([
  0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6,
]);
const BLOK_HMAC_SLEUTEL = new Uint8Array([
  0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6,
]);
const BLOK_HMAC_WAARDE = new Uint8Array([
  0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33,
]);

function attribuut(xml: string, element: string, naam: string) {
  const el = new RegExp(`<(?:\\w+:)?${element}\\b[^>]*>`).exec(xml)?.[0];
  return el ? new RegExp(`\\b${naam}="([^"]*)"`).exec(el)?.[1] : undefined;
}

interface AgileInfo {
  keyData: { zout: Uint8Array; blok: number; bits: number; hash: Hash };
  wachtwoord: {
    zout: Uint8Array;
    rondes: number;
    bits: number;
    hash: Hash;
    invoer: Uint8Array;
    waarde: Uint8Array;
    sleutel: Uint8Array;
  };
  hmac?: { sleutel: Uint8Array; waarde: Uint8Array };
}

function leesAgileInfo(info: Uint8Array): AgileInfo {
  const xml = new TextDecoder().decode(info.subarray(8));
  const keyData = /<(?:\w+:)?keyData\b[^>]*>/.exec(xml)?.[0] ?? "";
  const attr = (el: string, n: string) =>
    new RegExp(`\\b${n}="([^"]*)"`).exec(el)?.[1];
  const encryptor = /<(?:\w+:)?encryptedKey\b[^>]*>/.exec(
    xml.slice(xml.search(/keyEncryptor\b[^>]*password/)),
  )?.[0];
  if (!keyData || !encryptor)
    throw new Error(i18next.t("import:errors.encryptionInfoIncomplete"));
  const cipher = attr(keyData, "cipherAlgorithm");
  if (cipher && cipher !== "AES")
    throw new Error(i18next.t("import:errors.cipherNotSupported", { cipher }));
  if (
    (attr(keyData, "cipherChaining") ?? "ChainingModeCBC") !== "ChainingModeCBC"
  )
    throw new Error(i18next.t("import:errors.chainingNotSupported"));
  const integriteit = attribuut(xml, "dataIntegrity", "encryptedHmacKey");
  return {
    keyData: {
      zout: b64(attr(keyData, "saltValue") ?? ""),
      blok: Number(attr(keyData, "blockSize") ?? 16),
      bits: Number(attr(keyData, "keyBits") ?? 256),
      hash: hashNaam(attr(keyData, "hashAlgorithm") ?? "SHA512"),
    },
    wachtwoord: {
      zout: b64(attr(encryptor, "saltValue") ?? ""),
      rondes: Number(attr(encryptor, "spinCount") ?? 100000),
      bits: Number(attr(encryptor, "keyBits") ?? 256),
      hash: hashNaam(attr(encryptor, "hashAlgorithm") ?? "SHA512"),
      invoer: b64(attr(encryptor, "encryptedVerifierHashInput") ?? ""),
      waarde: b64(attr(encryptor, "encryptedVerifierHashValue") ?? ""),
      sleutel: b64(attr(encryptor, "encryptedKeyValue") ?? ""),
    },
    hmac: integriteit
      ? {
          sleutel: b64(integriteit),
          waarde: b64(
            attribuut(xml, "dataIntegrity", "encryptedHmacValue") ?? "",
          ),
        }
      : undefined,
  };
}

async function agileSleutel(info: AgileInfo, wachtwoord: string) {
  const w = info.wachtwoord;
  const h = await wachtwoordHash(w.hash, w.zout, wachtwoord, w.rondes);
  const afgeleid = async (blok: Uint8Array) =>
    opLengte(await hash(w.hash, h, blok), w.bits / 8);
  const invoer = await aesOntsleutel(
    await afgeleid(BLOK_INVOER),
    w.zout,
    w.invoer,
  );
  const waarde = await aesOntsleutel(
    await afgeleid(BLOK_WAARDE),
    w.zout,
    w.waarde,
  );
  const controle = await hash(w.hash, invoer.subarray(0, w.zout.length));
  if (!gelijk(controle, waarde.subarray(0, HASHGROOTTE[w.hash])))
    throw new VerkeerdWachtwoord();
  const sleutel = await aesOntsleutel(
    await afgeleid(BLOK_SLEUTEL),
    w.zout,
    w.sleutel,
  );
  return sleutel.subarray(0, info.keyData.bits / 8);
}

async function agileIv(info: AgileInfo["keyData"], blok: Uint8Array) {
  return opLengte(await hash(info.hash, info.zout, blok), info.blok);
}

async function ontsleutelAgile(
  info: Uint8Array,
  pakket: Uint8Array,
  wachtwoord: string,
) {
  const gegevens = leesAgileInfo(info);
  const sleutel = await agileSleutel(gegevens, wachtwoord);
  // Integriteit controleren als die is meegegeven.
  if (gegevens.hmac) {
    const hmacSleutel = (
      await aesOntsleutel(
        sleutel,
        await agileIv(gegevens.keyData, BLOK_HMAC_SLEUTEL),
        gegevens.hmac.sleutel,
      )
    ).subarray(0, HASHGROOTTE[gegevens.keyData.hash]);
    const verwacht = (
      await aesOntsleutel(
        sleutel,
        await agileIv(gegevens.keyData, BLOK_HMAC_WAARDE),
        gegevens.hmac.waarde,
      )
    ).subarray(0, HASHGROOTTE[gegevens.keyData.hash]);
    const k = await subtle().importKey(
      "raw",
      buffer(hmacSleutel),
      { name: "HMAC", hash: gegevens.keyData.hash },
      false,
      ["sign"],
    );
    const werkelijk = new Uint8Array(
      await subtle().sign("HMAC", k, buffer(pakket)),
    );
    if (!gelijk(werkelijk, verwacht))
      throw new Error(i18next.t("import:errors.integrityFailed"));
  }
  const grootte = u32(pakket, 0) + u32(pakket, 4) * 2 ** 32;
  if (grootte > 512 * 1024 * 1024)
    throw new Error(i18next.t("import:errors.encryptedPackageTooLarge"));
  const uit = new Uint8Array(grootte);
  const SEGMENT = 4096;
  for (
    let i = 0, p = 8;
    p < pakket.length && i * SEGMENT < grootte;
    i++, p += SEGMENT
  ) {
    let deel = pakket.subarray(p, Math.min(p + SEGMENT, pakket.length));
    deel = deel.subarray(0, deel.length - (deel.length % 16));
    const iv = await agileIv(gegevens.keyData, le32(i));
    const klaar = await aesOntsleutel(sleutel, iv, deel);
    uit.set(
      klaar.subarray(0, Math.min(klaar.length, grootte - i * SEGMENT)),
      i * SEGMENT,
    );
  }
  return uit;
}

/* ── Standard ────────────────────────────────────────────────────────── */

async function ontsleutelStandard(
  info: Uint8Array,
  pakket: Uint8Array,
  wachtwoord: string,
) {
  const kopGrootte = u32(info, 8);
  const kop = info.subarray(12, 12 + kopGrootte);
  const algoritme = u32(kop, 8);
  const hashAlg = u32(kop, 12);
  const bits = u32(kop, 16);
  if (![0x660e, 0x660f, 0x6610].includes(algoritme))
    throw new Error(i18next.t("import:errors.rc4NotSupported"));
  if (hashAlg !== 0x8004 && hashAlg !== 0)
    throw new Error(i18next.t("import:errors.unknownHash"));
  const v = info.subarray(12 + kopGrootte);
  const zoutGrootte = u32(v, 0);
  const zout = v.subarray(4, 4 + zoutGrootte);
  const versleuteldeControle = v.subarray(4 + zoutGrootte, 20 + zoutGrootte);
  const controleHashGrootte = u32(v, 20 + zoutGrootte);
  const versleuteldeHash = v.subarray(24 + zoutGrootte, 24 + zoutGrootte + 32);
  // Sleutelafleiding (MS-OFFCRYPTO 2.3.4.7).
  const h = await wachtwoordHash("SHA-1", zout, wachtwoord, 50000);
  const hFinaal = await hash("SHA-1", h, le32(0));
  const buf1 = new Uint8Array(64).fill(0x36);
  const buf2 = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < hFinaal.length; i++) {
    buf1[i] ^= hFinaal[i];
    buf2[i] ^= hFinaal[i];
  }
  const x = samen(await hash("SHA-1", buf1), await hash("SHA-1", buf2));
  const sleutel = x.subarray(0, (bits || 128) / 8);
  const controle = await aesEcbOntsleutel(sleutel, versleuteldeControle);
  const controleHash = await aesEcbOntsleutel(sleutel, versleuteldeHash);
  if (
    !gelijk(
      await hash("SHA-1", controle),
      controleHash.subarray(0, controleHashGrootte || 20),
    )
  )
    throw new VerkeerdWachtwoord();
  const grootte = u32(pakket, 0) + u32(pakket, 4) * 2 ** 32;
  if (grootte > 512 * 1024 * 1024)
    throw new Error(i18next.t("import:errors.encryptedPackageTooLarge"));
  let data = pakket.subarray(8);
  data = data.subarray(0, data.length - (data.length % 16));
  return (await aesEcbOntsleutel(sleutel, data)).slice(0, grootte);
}

/** Ontsleutelt een herkend OOXML-bestand; gooit VerkeerdWachtwoord bij een fout wachtwoord. */
export async function ontsleutel(
  versleuteling: Versleuteling,
  wachtwoord: string,
): Promise<Uint8Array> {
  if (versleuteling.soort === "agile")
    return ontsleutelAgile(
      versleuteling.info,
      versleuteling.pakket,
      wachtwoord,
    );
  if (versleuteling.soort === "standard")
    return ontsleutelStandard(
      versleuteling.info,
      versleuteling.pakket,
      wachtwoord,
    );
  throw new Error(versleutelingsMelding(versleuteling));
}

export function versleutelingsMelding(versleuteling: Versleuteling) {
  if (versleuteling.soort === "rc4")
    return i18next.t("import:errors.rc4Binary", { format: versleuteling.formaat });
  if (versleuteling.soort === "onbekend")
    return i18next.t("import:errors.unknownEncryption", {
      version: versleuteling.versie,
    });
  return i18next.t("import:errors.encryptedGeneric");
}

/* ── Versleutelen (Agile) ────────────────────────────────────────────── */

function willekeurig(n: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

function unicodeLp(tekst: string) {
  const data = utf16(tekst);
  const opvulling = (4 - (data.length % 4)) % 4;
  return samen(le32(data.length), data, new Uint8Array(opvulling));
}

function dataSpaces() {
  const versie = (major: number, minor: number) =>
    new Uint8Array([major, 0, minor, 0]);
  const versieInfo = samen(
    unicodeLp("Microsoft.Container.DataSpaces"),
    versie(1, 0),
    versie(1, 0),
    versie(1, 0),
  );
  const entry = samen(
    le32(1),
    le32(0),
    unicodeLp("EncryptedPackage"),
    unicodeLp("StrongEncryptionDataSpace"),
  );
  const map = samen(le32(8), le32(1), le32(entry.length + 4), entry);
  const definitie = samen(
    le32(8),
    le32(1),
    unicodeLp("StrongEncryptionTransform"),
  );
  const id = unicodeLp("{FF9A3F03-56EF-4613-BDD5-5A41C1D07246}");
  const transform = samen(
    le32(8 + id.length),
    le32(1),
    id,
    unicodeLp("Microsoft.Container.EncryptionTransform"),
    versie(1, 0),
    versie(1, 0),
    versie(1, 0),
    le32(0),
    le32(0),
    le32(0),
    le32(4),
  );
  return [
    { pad: `${DATASPACES}/Version`, data: versieInfo },
    { pad: `${DATASPACES}/DataSpaceMap`, data: map },
    {
      pad: `${DATASPACES}/DataSpaceInfo/StrongEncryptionDataSpace`,
      data: definitie,
    },
    {
      pad: `${DATASPACES}/TransformInfo/StrongEncryptionTransform/${PRIMARY}`,
      data: transform,
    },
  ];
}

export interface VersleutelOpties {
  /** Standaard 100.000, zoals Office. Alleen lager voor tests. */
  rondes?: number;
}

/** Versleutelt een OOXML-pakket met een wachtwoord (Agile, AES-256, SHA-512). */
export async function versleutel(
  pakket: Uint8Array,
  wachtwoord: string,
  opties: VersleutelOpties = {},
) {
  if (!wachtwoord) throw new Error(i18next.t("import:errors.choosePassword"));
  if (wachtwoord.length > 255)
    throw new Error(i18next.t("import:errors.passwordTooLong"));
  const rondes = opties.rondes ?? 100000;
  const algoritme: Hash = "SHA-512";
  const keyZout = willekeurig(16);
  const wwZout = willekeurig(16);
  const geheim = willekeurig(32);
  const controle = willekeurig(16);
  const keyData = { zout: keyZout, blok: 16, bits: 256, hash: algoritme };

  // Pakket in segmenten van 4096 bytes, elk met een eigen IV.
  const SEGMENT = 4096;
  const delen: Uint8Array[] = [
    le32(pakket.length),
    le32(Math.floor(pakket.length / 2 ** 32)),
  ];
  for (let i = 0, p = 0; p < pakket.length; i++, p += SEGMENT) {
    const ruw = pakket.subarray(p, Math.min(p + SEGMENT, pakket.length));
    const deel = new Uint8Array(Math.ceil(ruw.length / 16) * 16);
    deel.set(ruw);
    delen.push(
      await aesVersleutel(geheim, await agileIv(keyData, le32(i)), deel),
    );
  }
  const versleuteld = samen(...delen);

  // Gegevensintegriteit
  const hmacSleutel = willekeurig(64);
  const k = await subtle().importKey(
    "raw",
    buffer(hmacSleutel),
    { name: "HMAC", hash: algoritme },
    false,
    ["sign"],
  );
  const hmacWaarde = new Uint8Array(
    await subtle().sign("HMAC", k, buffer(versleuteld)),
  );
  const versleuteldeHmacSleutel = await aesVersleutel(
    geheim,
    await agileIv(keyData, BLOK_HMAC_SLEUTEL),
    hmacSleutel,
  );
  const versleuteldeHmacWaarde = await aesVersleutel(
    geheim,
    await agileIv(keyData, BLOK_HMAC_WAARDE),
    hmacWaarde,
  );

  // Wachtwoordsleutel
  const h = await wachtwoordHash(algoritme, wwZout, wachtwoord, rondes);
  const afgeleid = async (blok: Uint8Array) =>
    opLengte(await hash(algoritme, h, blok), 32);
  const vInvoer = await aesVersleutel(
    await afgeleid(BLOK_INVOER),
    wwZout,
    controle,
  );
  const vWaarde = await aesVersleutel(
    await afgeleid(BLOK_WAARDE),
    wwZout,
    await hash(algoritme, controle),
  );
  const vSleutel = await aesVersleutel(
    await afgeleid(BLOK_SLEUTEL),
    wwZout,
    geheim,
  );

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password" xmlns:c="http://schemas.microsoft.com/office/2006/keyEncryptor/certificate">` +
    `<keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${naarB64(keyZout)}"/>` +
    `<dataIntegrity encryptedHmacKey="${naarB64(versleuteldeHmacSleutel)}" encryptedHmacValue="${naarB64(versleuteldeHmacWaarde)}"/>` +
    `<keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password">` +
    `<p:encryptedKey spinCount="${rondes}" saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${naarB64(wwZout)}" ` +
    `encryptedVerifierHashInput="${naarB64(vInvoer)}" encryptedVerifierHashValue="${naarB64(vWaarde)}" encryptedKeyValue="${naarB64(vSleutel)}"/>` +
    `</keyEncryptor></keyEncryptors></encryption>`;
  const info = samen(
    new Uint8Array([4, 0, 4, 0, 0x40, 0, 0, 0]),
    new TextEncoder().encode(xml),
  );
  return schrijfCfb([
    ...dataSpaces(),
    { pad: "EncryptionInfo", data: info },
    { pad: "EncryptedPackage", data: versleuteld },
  ]);
}
