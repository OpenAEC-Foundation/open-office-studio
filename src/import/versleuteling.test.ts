import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { isCfb, leesCfb } from "../../packages/database/src/cfb";
import { schrijfCfb } from "./cfbschrijver";
import { herhaalHash, type HashNaam } from "./sha";
import {
  VerkeerdWachtwoord,
  herkenVersleuteling,
  ontsleutel,
  versleutel,
} from "./versleuteling";
import { bereidOpenen } from "./openen";

async function webcryptoHerhaal(
  alg: HashNaam,
  begin: Uint8Array,
  rondes: number,
) {
  let h = begin;
  for (let i = 0; i < rondes; i++) {
    const blok = new Uint8Array(4 + h.length);
    new DataView(blok.buffer).setUint32(0, i, true);
    blok.set(h, 4);
    h = new Uint8Array(await crypto.subtle.digest(alg, blok));
  }
  return h;
}

describe("Herhaalde hash", () => {
  for (const alg of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const)
    it(`${alg} is gelijk aan WebCrypto`, async () => {
      const begin = new Uint8Array(
        await crypto.subtle.digest(alg, strToU8("zout en wachtwoord")),
      );
      expect(herhaalHash(alg, begin, 257)).toEqual(
        await webcryptoHerhaal(alg, begin, 257),
      );
    });
});

describe("CFB-schrijver", () => {
  it("schrijft stromen en opslagen die de lezer terugleest, ook met DIFAT", () => {
    const groot = new Uint8Array(7_500_000);
    for (let i = 0; i < groot.length; i += 997) groot[i] = i & 0xff;
    const klein = strToU8("klein");
    const cfb = schrijfCfb([
      { pad: "Groot", data: groot },
      { pad: "Map/Sub/Klein", data: klein },
      { pad: "Leeg", data: new Uint8Array() },
      { pad: "Midden", data: new Uint8Array(5000).fill(7) },
    ]);
    expect(isCfb(cfb)).toBe(true);
    const items = leesCfb(cfb);
    const data = (pad: string) => items.find((i) => i.pad === pad)?.data;
    expect(Buffer.from(data("Groot")!).equals(Buffer.from(groot))).toBe(true);
    expect(data("Map/Sub/Klein")).toEqual(klein);
    expect(data("Midden")).toEqual(new Uint8Array(5000).fill(7));
    expect(data("Leeg")).toEqual(new Uint8Array());
    expect(items.find((i) => i.pad === "Map")?.soort).toBe("opslag");
  });
});

describe("Versleutelen en ontsleutelen (Agile)", () => {
  const pakket = zipSync({
    "word/document.xml": strToU8("<w:document/>".repeat(900)),
  });
  it("versleutelt naar een CFB die we herkennen en met het wachtwoord terugkrijgen", async () => {
    const cfb = await versleutel(pakket, "Geheim wachtwoord €", {
      rondes: 1000,
    });
    const herkend = herkenVersleuteling(cfb)!;
    expect(herkend.soort).toBe("agile");
    expect(await ontsleutel(herkend, "Geheim wachtwoord €")).toEqual(pakket);
    await expect(ontsleutel(herkend, "fout")).rejects.toBeInstanceOf(
      VerkeerdWachtwoord,
    );
    const namen = leesCfb(cfb).map((i) => i.pad);
    expect(namen).toContain("EncryptionInfo");
    expect(namen.some((n) => n.endsWith("StrongEncryptionDataSpace"))).toBe(
      true,
    );
    // Het wachtwoord staat nergens leesbaar in het bestand.
    expect(Buffer.from(cfb).includes(Buffer.from("Geheim"))).toBe(false);
  });
  it("weigert een beschadigd pakket via de integriteitscontrole", async () => {
    const cfb = await versleutel(pakket, "x", { rondes: 10 });
    const herkend = herkenVersleuteling(cfb)!;
    if (herkend.soort !== "agile") throw new Error();
    herkend.pakket[100] ^= 0xff;
    await expect(ontsleutel(herkend, "x")).rejects.toThrow("integriteit");
  });
  it("herkent RC4 in oude binaire bestanden alleen", () => {
    const word = new Uint8Array(64);
    word.set([0xec, 0xa5]);
    word[0x0b] = 0x01;
    expect(
      herkenVersleuteling(schrijfCfb([{ pad: "WordDocument", data: word }])),
    ).toEqual({ soort: "rc4", formaat: "doc" });
    const xls = new Uint8Array([
      0x09, 0x08, 0x02, 0x00, 0, 0, 0x2f, 0x00, 0x02, 0x00, 0, 0,
    ]);
    expect(
      herkenVersleuteling(schrijfCfb([{ pad: "Workbook", data: xls }])),
    ).toEqual({ soort: "rc4", formaat: "xls" });
    word[0x0b] = 0;
    expect(
      herkenVersleuteling(schrijfCfb([{ pad: "WordDocument", data: word }])),
    ).toBeNull();
  });
  it("vraagt in de openroute om het wachtwoord, opnieuw na een fout", async () => {
    const cfb = await versleutel(pakket, "goed", { rondes: 10 });
    const vragen: (string | undefined)[] = [];
    const antwoorden = ["fout", "goed"];
    const resultaat = (await bereidOpenen("Brief.docx", cfb, {
      converteer: async () => {
        throw new Error("geen runtime");
      },
      vraagWachtwoord: async (_naam, fout) => {
        vragen.push(fout);
        return antwoorden.shift() ?? null;
      },
    }))!;
    expect(vragen).toEqual([
      undefined,
      "Onjuist wachtwoord. Probeer het opnieuw.",
    ]);
    expect(resultaat.bytes).toEqual(pakket);
    expect(resultaat.bron).toEqual({ versleuteling: "agile" });
    expect(resultaat.rapport!.regels[0].onderdeel).toBe(
      "Wachtwoordbeveiliging",
    );
    const geannuleerd = await bereidOpenen("Brief.docx", cfb, {
      converteer: async () => new Uint8Array(),
      vraagWachtwoord: async () => null,
    });
    expect(geannuleerd).toBeNull();
  });
});

// Testbestanden van Apache POI met bekende wachtwoorden (alleen lokaal aanwezig).
const corpus = fileURLToPath(
  new URL("../../.local/corpus/bestanden/", import.meta.url),
);
const poi = [
  ["poi-71c6b4cbe81e7591ee9a96d6d2a2bf461615f746.xlsx", "Test001!!", "agile"],
  [
    "poi-1f0ea828b7afcf13b538d03db7a0d524c46f4ea0.xlsx",
    "this is a test",
    "agile",
  ],
  ["poi-a6ae896f91b8dafbd178807bef00c78b5c7ae5a7.xlsx", "pwd123", "standard"],
  [
    "poi-1767b14377539d30c5111fd616a612c87867fa9c.xlsx",
    "VelvetSweatshop",
    "standard",
  ],
] as const;
describe.skipIf(!existsSync(corpus))("Corpus (Apache POI)", () => {
  for (const [bestand, wachtwoord, soort] of poi)
    it(`${bestand.slice(4, 12)} (${soort})`, async () => {
      const herkend = herkenVersleuteling(readFileSync(corpus + bestand))!;
      expect(herkend.soort).toBe(soort);
      const bytes = await ontsleutel(herkend, wachtwoord);
      expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    }, 30000);
});

describe("Door LibreOffice 24.2 versleuteld (wachtwoord: Proef-wachtwoord €1)", () => {
  it("ontsleutelt het Standard-bestand", async () => {
    const herkend = herkenVersleuteling(
      readFileSync("src/import/testbestanden/libreoffice-standard.docx"),
    )!;
    expect(herkend.soort).toBe("standard");
    const zip = await ontsleutel(herkend, "Proef-wachtwoord €1");
    expect([zip[0], zip[1]]).toEqual([0x50, 0x4b]);
    await expect(ontsleutel(herkend, "proef")).rejects.toBeInstanceOf(
      VerkeerdWachtwoord,
    );
  });
});
