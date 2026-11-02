/**
 * PDF-beveiliging met wachtwoord en rechten (#37): standaardbeveiliging van
 * ISO 32000-2 (PDF 2.0) met AES-256 (V 5, R 6, crypt filter AESV3).
 *
 * - Openwachtwoord (gebruikerswachtwoord): nodig om de PDF te openen; leeg =
 *   iedereen kan openen, maar de rechten gelden wel.
 * - Rechtenwachtwoord (eigenaarswachtwoord): geeft alle rechten. Zonder
 *   rechtenwachtwoord maakt de app een willekeurig wachtwoord, zodat de
 *   gekozen beperkingen niet met het openwachtwoord te omzeilen zijn.
 *
 * De wachtwoorden blijven alleen in het geheugen; ze worden nergens bewaard.
 * Versleuteling gaat via WebCrypto (SHA-256/384/512, AES-CBC), dus ook in de
 * browser. AES-CBC van WebCrypto voegt altijd PKCS#7-opvulling toe: waar de
 * specificatie "zonder opvulling" vraagt (lengte een veelvoud van 16) wordt
 * het laatste blok weggelaten; de eerdere blokken zijn daar niet van afhankelijk.
 */

export interface PdfBeveiliging {
  /** Wachtwoord om te openen; leeg of ontbrekend = openen zonder wachtwoord. */
  openWachtwoord?: string;
  /** Wachtwoord voor alle rechten; ontbrekend = willekeurig (niet te gebruiken). */
  rechtenWachtwoord?: string;
  afdrukken: boolean;
  kopieren: boolean;
  wijzigen: boolean;
}

/** Moet de PDF versleuteld worden? Niet zonder openwachtwoord en zonder beperkingen. */
export function heeftBeveiliging(b: PdfBeveiliging | undefined): b is PdfBeveiliging {
  return !!b && (!!b.openWachtwoord || !b.afdrukken || !b.kopieren || !b.wijzigen || !!b.rechtenWachtwoord);
}

/** Rechtenwaarde /P (tabel 22 van ISO 32000-2), als 32-bits getal met teken. */
export function rechtenWaarde(b: Pick<PdfBeveiliging, "afdrukken" | "kopieren" | "wijzigen">) {
  // Bits 7–8 en 13–32 altijd 1; bit 10 (toegankelijkheid) altijd toegestaan.
  let p = 0xfffff0c0 | 512;
  if (b.afdrukken) p |= 4 | 2048; // afdrukken, ook in hoge kwaliteit
  if (b.wijzigen) p |= 8 | 32 | 256 | 1024; // wijzigen, opmerkingen, formulieren, samenstellen
  if (b.kopieren) p |= 16; // tekst en afbeeldingen kopiëren
  return p | 0;
}

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Versleuteling is in deze omgeving niet beschikbaar (WebCrypto ontbreekt).");
  return s;
};

const buf = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>;

function samen(...delen: Uint8Array[]) {
  const uit = new Uint8Array(delen.reduce((n, d) => n + d.length, 0));
  let p = 0;
  for (const d of delen) {
    uit.set(d, p);
    p += d.length;
  }
  return uit;
}

async function hashVan(soort: "SHA-256" | "SHA-384" | "SHA-512", data: Uint8Array) {
  return new Uint8Array(await subtle().digest(soort, buf(data)));
}

/** AES-CBC zonder opvulling (lengte moet een veelvoud van 16 zijn). */
async function aesZonderOpvulling(sleutel: Uint8Array, iv: Uint8Array, data: Uint8Array) {
  const k = await subtle().importKey("raw", buf(sleutel), "AES-CBC", false, ["encrypt"]);
  const uit = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: buf(iv) }, k, buf(data)));
  return uit.subarray(0, data.length);
}

/** Wachtwoord als bytes: Unicode genormaliseerd (benadering van SASLprep), UTF-8, hooguit 127 bytes. */
export function wachtwoordBytes(wachtwoord: string) {
  return new TextEncoder().encode(wachtwoord.normalize("NFKC")).subarray(0, 127);
}

/** Algoritme 2.B van ISO 32000-2: de wachtwoordhash voor R 6. */
export async function hash2B(wachtwoord: Uint8Array, zout: Uint8Array, gebruiker: Uint8Array) {
  let k = await hashVan("SHA-256", samen(wachtwoord, zout, gebruiker));
  let e = new Uint8Array([0]);
  let ronde = 0;
  while (ronde < 64 || e[e.length - 1] > ronde - 32) {
    const k1 = samen(wachtwoord, k, gebruiker);
    const herhaald = new Uint8Array(k1.length * 64);
    for (let i = 0; i < 64; i++) herhaald.set(k1, i * k1.length);
    e = await aesZonderOpvulling(k.subarray(0, 16), k.subarray(16, 32), herhaald);
    let som = 0;
    for (let i = 0; i < 16; i++) som += e[i];
    const rest = som % 3;
    k = await hashVan(rest === 0 ? "SHA-256" : rest === 1 ? "SHA-384" : "SHA-512", e);
    ronde++;
  }
  return k.subarray(0, 32);
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

export interface Versleuteling {
  /** Het /Encrypt-woordenboek (zelf niet versleuteld). */
  woordenboek: string;
  /** Versleutelt één string of stroom: willekeurige IV + AES-256-CBC met opvulling. */
  versleutel: (data: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Maakt de sleutels en het /Encrypt-woordenboek (algoritmen 8, 9 en 10).
 * `willekeurig` alleen voor tests (vaste zouten).
 */
export async function maakVersleuteling(
  b: PdfBeveiliging,
  willekeurig: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
): Promise<Versleuteling> {
  const bestandssleutel = willekeurig(32);
  const gebruiker = wachtwoordBytes(b.openWachtwoord ?? "");
  const eigenaar = b.rechtenWachtwoord
    ? wachtwoordBytes(b.rechtenWachtwoord)
    : // Geen rechtenwachtwoord: een willekeurig, onbekend wachtwoord.
      new TextEncoder().encode(hex(willekeurig(24)));
  const nul = new Uint8Array(16);

  // Algoritme 8: U en UE.
  const uZout = willekeurig(16);
  const u = samen(await hash2B(gebruiker, uZout.subarray(0, 8), new Uint8Array()), uZout);
  const ue = await aesZonderOpvulling(
    await hash2B(gebruiker, uZout.subarray(8, 16), new Uint8Array()),
    nul,
    bestandssleutel,
  );
  // Algoritme 9: O en OE (met U als extra invoer).
  const oZout = willekeurig(16);
  const o = samen(await hash2B(eigenaar, oZout.subarray(0, 8), u), oZout);
  const oe = await aesZonderOpvulling(await hash2B(eigenaar, oZout.subarray(8, 16), u), nul, bestandssleutel);
  // Algoritme 10: Perms.
  const p = rechtenWaarde(b);
  const perms = new Uint8Array(16);
  perms.set([p & 255, (p >>> 8) & 255, (p >>> 16) & 255, (p >>> 24) & 255, 255, 255, 255, 255]);
  perms.set([0x54 /* T: metadata versleuteld */, 0x61, 0x64, 0x62], 8);
  perms.set(willekeurig(4), 12);
  const permsVersleuteld = await aesZonderOpvulling(bestandssleutel, nul, perms);

  const sleutel = await subtle().importKey("raw", buf(bestandssleutel), "AES-CBC", false, ["encrypt"]);
  return {
    woordenboek:
      `<< /Filter /Standard /V 5 /R 6 /Length 256` +
      ` /CF << /StdCF << /Type /CryptFilter /CFM /AESV3 /AuthEvent /DocOpen /Length 32 >> >> /StmF /StdCF /StrF /StdCF` +
      ` /P ${p} /O <${hex(o)}> /U <${hex(u)}> /OE <${hex(oe)}> /UE <${hex(ue)}> /Perms <${hex(permsVersleuteld)}> /EncryptMetadata true >>`,
    versleutel: async (data) => {
      const iv = willekeurig(16);
      const versleuteld = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: buf(iv) }, sleutel, buf(data)));
      return samen(iv, versleuteld);
    },
  };
}

/** Decodeert een letterlijke PDF-string (zonder de buitenste haakjes). */
function letterlijkNaarBytes(s: string) {
  const uit: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      uit.push(s.charCodeAt(i) & 255);
      continue;
    }
    const v = s[++i];
    if (v === undefined) break;
    const vast: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
    if (v in vast) uit.push(vast[v]);
    else if (/[0-7]/.test(v)) {
      let oct = v;
      while (oct.length < 3 && /[0-7]/.test(s[i + 1] ?? "")) oct += s[++i];
      uit.push(parseInt(oct, 8) & 255);
    } else if (v === "\r") {
      if (s[i + 1] === "\n") i++;
    } else if (v !== "\n") uit.push(s.charCodeAt(i) & 255);
  }
  return new Uint8Array(uit);
}

function hexNaarBytes(s: string) {
  const schoon = s.replace(/[^0-9a-fA-F]/g, "");
  const even = schoon.length % 2 ? `${schoon}0` : schoon;
  const uit = new Uint8Array(even.length / 2);
  for (let i = 0; i < uit.length; i++) uit[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
  return uit;
}

/**
 * Versleutelt alle strings in een objecttekst (woordenboeken en reeksen zoals
 * deze schrijver ze maakt) en schrijft ze terug als hexstrings.
 */
export async function versleutelStrings(tekst: string, versleutel: Versleuteling["versleutel"]) {
  let uit = "";
  let i = 0;
  while (i < tekst.length) {
    const c = tekst[i];
    if (c === "(") {
      let diepte = 1;
      let j = i + 1;
      while (j < tekst.length && diepte > 0) {
        if (tekst[j] === "\\") j++;
        else if (tekst[j] === "(") diepte++;
        else if (tekst[j] === ")") diepte--;
        j++;
      }
      uit += `<${hex(await versleutel(letterlijkNaarBytes(tekst.slice(i + 1, j - 1))))}>`;
      i = j;
    } else if (c === "<" && tekst[i + 1] === "<") {
      uit += "<<";
      i += 2;
    } else if (c === "<") {
      const j = tekst.indexOf(">", i);
      uit += `<${hex(await versleutel(hexNaarBytes(tekst.slice(i + 1, j))))}>`;
      i = j + 1;
    } else {
      uit += c;
      i++;
    }
  }
  return uit;
}
