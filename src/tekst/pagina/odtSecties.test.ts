import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { Pakket } from "../../grafieken/pakket";
import {
  leesXml,
  ontsnap,
  tekstVan,
  vervang,
  zoekAlle,
} from "../../grafieken/xml";
import { leesSecties, wijzigSecties } from "./secties";
import { koppelAanVorige, voegPaginanummerIn } from "./kopvoet";
import { bewaarOdtSecties, herstelOdtSecties } from "./odtSecties";

function bron() {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  let xml = p.lees("word/document.xml");
  const sect = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)![0];
  xml = xml.replace(
    /<w:body>[\s\S]*?<\/w:body>/,
    `<w:body><w:p><w:pPr>${sect}</w:pPr><w:r><w:t>First.</w:t></w:r></w:p><w:p><w:r><w:t>Second.</w:t></w:r></w:p>${sect}</w:body>`,
  );
  p.schrijf("word/document.xml", xml);
  let bytes = wijzigSecties(p.inpakken(), 1, {
    begin: "continuous",
    kolommen: { aantal: 4, tussenruimte: 479, lijn: true },
    formaat: { breedte: 16838, hoogte: 11906 },
    afdrukstand: "liggend",
    marges: { links: 1200, rechts: 1100, boven: 800, onder: 900 },
    nummering: { notatie: "upperRoman", beginBij: 7 },
  });
  return voegPaginanummerIn(bytes, {
    positie: "boven",
    vorm: "paginaVan",
    uitlijning: "links",
    opEerstePagina: true,
    doel: 0,
  });
}
function odt() {
  return zipSync({
    mimetype: [
      strToU8("application/vnd.oasis.opendocument.text"),
      { level: 0 },
    ],
    "content.xml": strToU8("<content>Text</content>"),
    "styles.xml": strToU8("<styles/>"),
    "meta.xml": strToU8(
      '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"><office:meta><meta:user-defined meta:name="UserProperty">Keep me</meta:user-defined></office:meta></office:document-meta>',
    ),
  });
}
const semantiek = (b: Uint8Array) =>
  leesSecties(b).map(({ verwijzingen, ...s }) => ({
    ...s,
    eigen: verwijzingen.map((r) => `${r.soort}/${r.type}`).sort(),
  }));
function andereMetadata(bytes: Uint8Array, wijzig: (m: any) => void) {
  const z = unzipSync(bytes),
    xml = strFromU8(z["meta.xml"]),
    el = zoekAlle(leesXml(xml), "user-defined").find((e) =>
      tekstVan(e).startsWith("{"),
    )!;
  const m = JSON.parse(tekstVan(el));
  wijzig(m);
  z["meta.xml"] = strToU8(
    vervang(xml, [
      {
        start: el.inhoudStart,
        eind: el.inhoudEind,
        tekst: ontsnap(JSON.stringify(m)),
      },
    ]),
  );
  return zipSync(z);
}

describe("ODF-sectie-auteursmetadata (#55)", () => {
  it("bewaart inhoud en standaard ODF-mimetype, en herstelt continuous/kolommen/nummering/headerkoppeling", async () => {
    const docx = bron(),
      origineel = odt(),
      uit = await bewaarOdtSecties(docx, origineel),
      z = unzipSync(uit);
    expect(z["content.xml"]).toEqual(unzipSync(origineel)["content.xml"]);
    expect(z["styles.xml"]).toEqual(unzipSync(origineel)["styles.xml"]);
    expect(strFromU8(z["meta.xml"])).toContain("Keep me");
    const head = new DataView(uit.buffer, uit.byteOffset, uit.byteLength);
    expect(head.getUint16(8, true)).toBe(0);
    expect(strFromU8(uit.slice(30, 38))).toBe("mimetype");
    const genormaliseerd = wijzigSecties(
      koppelAanVorige(docx, 1, "header", false),
      1,
      {
        begin: "nextPage",
        kolommen: { aantal: 2, tussenruimte: 720, lijn: false },
        nummering: { notatie: "decimal", beginBij: 1 },
      },
    );
    const terug = await herstelOdtSecties(uit, genormaliseerd);
    expect(semantiek(terug)).toEqual(semantiek(docx));
    const nogmaals = await bewaarOdtSecties(docx, uit);
    expect(
      zoekAlle(
        leesXml(strFromU8(unzipSync(nogmaals)["meta.xml"])),
        "user-defined",
      ),
    ).toHaveLength(2);
  });
  it.each(["content.xml", "styles.xml"])(
    "laat externe wijzigingen in %s leidend",
    async (naam) => {
      const docx = bron(),
        z = unzipSync(await bewaarOdtSecties(docx, odt()));
      z[naam] = strToU8("<changed/>");
      expect(await herstelOdtSecties(zipSync(z), docx)).toBe(docx);
    },
  );
  it.each(["future", "invalid", "duplicate", "hash"])(
    "negeert %s metadata zonder de geconverteerde bron te wijzigen",
    async (soort) => {
      const docx = bron();
      let bytes = await bewaarOdtSecties(docx, odt());
      bytes = andereMetadata(bytes, (m) => {
        if (soort === "future") m.versie = 2;
        if (soort === "invalid") m.secties[0].kolommen.aantal = -9;
        if (soort === "hash") m.inhoud = "bad";
      });
      if (soort === "duplicate") {
        const z = unzipSync(bytes),
          s = strFromU8(z["meta.xml"]),
          entry = s.match(
            /<meta:user-defined xmlns:meta=[\s\S]*?<\/meta:user-defined>/,
          )![0];
        z["meta.xml"] = strToU8(
          s.replace("</office:meta>", entry + "</office:meta>"),
        );
        bytes = zipSync(z);
      }
      expect(await herstelOdtSecties(bytes, docx)).toBe(docx);
    },
  );
  it("past niets toe bij een ander aantal secties of ontbrekende metadata", async () => {
    const docx = readFileSync("public/templates/nieuw.docx"),
      bytes = await bewaarOdtSecties(bron(), odt());
    expect(await herstelOdtSecties(bytes, docx)).toBe(docx);
    expect(await herstelOdtSecties(odt(), docx)).toBe(docx);
  });
  it("herstelt expliciet gedeelde headeronderdelen zonder gekoppeld-aan-vorige af te dwingen", async () => {
    const onafhankelijk = koppelAanVorige(bron(), 1, "header", false),
      instellingen = leesSecties(onafhankelijk),
      p = new Pakket(onafhankelijk);
    let xml = p.lees("word/document.xml");
    for (const ref of instellingen[1].verwijzingen.filter(
      (r) => r.soort === "header",
    )) {
      const eerste = instellingen[0].verwijzingen.find(
        (r) => r.soort === "header" && r.type === ref.type,
      )!;
      xml = xml.replaceAll(
        'r:id="' + ref.rid + '"',
        'r:id="' + eerste.rid + '"',
      );
    }
    p.schrijf("word/document.xml", xml);
    const gedeeld = p.inpakken(),
      odf = await bewaarOdtSecties(gedeeld, odt()),
      terug = leesSecties(await herstelOdtSecties(odf, onafhankelijk));
    for (const r of terug[1].verwijzingen.filter((r) => r.soort === "header"))
      expect(r.rid).toBe(
        terug[0].verwijzingen.find(
          (x) => x.soort === "header" && x.type === r.type,
        )!.rid,
      );
    expect(
      terug[1].verwijzingen.filter((r) => r.soort === "header"),
    ).toHaveLength(instellingen[1].verwijzingen.filter(r=>r.soort==="header").length);
  });
});
