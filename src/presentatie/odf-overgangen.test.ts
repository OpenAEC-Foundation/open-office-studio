import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { initWasm, openPresentation } from "@betteroffice/pptx";
import { attrNs, kinderen, leesXml, zoekAlle } from "../grafieken/xml";
import { zipDelen } from "../grafieken/zipdelen";
import { Pakket } from "../grafieken/pakket";
import { GEEN_OVERGANG, leesOvergangen, schrijfOvergangen } from "./overgangen";
import { naPresentatieConversie, odfDuurMs } from "./odf-overgangen";

const O = "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  D = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  S = "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  P = "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0",
  SM = "urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0",
  AN = "urn:oasis:names:tc:opendocument:xmlns:animation:1.0",
  XL = "http://www.w3.org/1999/xlink";
const native = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
function source(click = false) {
  return schrijfOvergangen(native(), [0, 1, 2], {
    ...GEEN_OVERGANG,
    effect: "push",
    richting: "r",
    duur: 400,
    na: 1800,
    klik: click,
  });
}
const declarations = `xmlns:office="${O}" xmlns:draw="${D}" xmlns:style="${S}" xmlns:presentation="${P}" xmlns:smil="${SM}" xmlns:anim="${AN}" xmlns:xlink="${XL}"`;
function flat({
  mode = "automatic",
  duration = "PT1S",
  settings = "",
  count = 3,
  styleExtra = "",
  parent = "",
} = {}) {
  return `<office:document ${declarations} office:version="1.3"><office:automatic-styles>${parent}<style:style style:name="shared" style:family="drawing-page"><style:drawing-page-properties presentation:transition-type="${mode}" presentation:duration="${duration}" smil:type="pushWipe" smil:subtype="fromRight" draw:fill-color="#123456"><presentation:sound xlink:href="vnd.sun.star.Package:Media/tone.wav"/></style:drawing-page-properties></style:style>${styleExtra}</office:automatic-styles><office:body><office:presentation>${Array.from({ length: count }, (_, i) => `<draw:page draw:name="page${i + 1}" draw:style-name="shared"><anim:par presentation:node-type="timing-root"><anim:par smil:begin="id${i}.begin"><anim:transitionFilter smil:type="pushWipe" smil:subtype="fromRight" smil:dur="0.4s"/><anim:audio xlink:href="${i ? "" : "Media/tone.wav"}"/></anim:par><anim:seq><anim:par><anim:transitionFilter smil:type="pushWipe" smil:subtype="fromRight"/></anim:par></anim:seq></anim:par><presentation:notes><draw:page draw:style-name="shared"/></presentation:notes></draw:page>`).join("")}<presentation:settings ${settings}/></office:presentation></office:body></office:document>`;
}
function packageOdf(xml = flat(), extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    mimetype: [
      strToU8("application/vnd.oasis.opendocument.presentation"),
      { level: 0 },
    ],
    "content.xml": strToU8(xml),
    "Media/tone.wav": new Uint8Array([1, 2, 3]),
    ...extra,
  });
}
function xml(bytes: Uint8Array) {
  return strFromU8(unzipSync(bytes)["content.xml"]);
}
const convertOut = (b: Uint8Array, doc = packageOdf()) =>
  naPresentatieConversie(b, "pptx", "odp", doc);

beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
describe("standaard ODF overgangsbehoud (#33)", () => {
  it("schrijft exacte milliseconden, bewegingsrichting en uniform klikbeleid zonder gedeelde stijlen te wijzigen", () => {
    const before = packageOdf(),
      after = convertOut(source(), before),
      root = leesXml(xml(after));
    const styles = zoekAlle(root, "style"),
      pages = zoekAlle(root, "page").filter(
        (p) => p.ouder?.lokaal === "presentation",
      );
    expect(styles).toHaveLength(4);
    expect(styles[0].attrs["style:name"]).toBe("shared");
    expect(xml(after)).toContain('presentation:duration="PT1S"');
    for (const page of pages) {
      const s = styles.find(
        (s) => attrNs(s, S, "name") === attrNs(page, D, "style-name"),
      )!;
      const prop = kinderen(s, "drawing-page-properties")[0];
      expect(attrNs(prop, P, "duration")).toBe("PT1.8S");
      expect(attrNs(prop, SM, "subtype")).toBe("fromLeft");
      expect(attrNs(prop, D, "fill-color")).toBe("#123456");
    }
    expect(
      attrNs(zoekAlle(root, "settings")[0], P, "transition-on-click"),
    ).toBe("disabled");
    // Objectanimaties en notitiepagina’s gebruiken de oude stijl/richting.
    expect(
      xml(after).match(
        /<anim:seq><anim:par><anim:transitionFilter smil:type="pushWipe" smil:subtype="fromRight"\/>/g,
      ),
    ).toHaveLength(3);
    expect(
      xml(after).match(
        /<presentation:notes><draw:page draw:style-name="shared"\/>/g,
      ),
    ).toHaveLength(3);
    const a = zipDelen(before)!,
      b = zipDelen(after)!;
    expect(b[0].naam).toBe("mimetype");
    expect(b[0].lokaal).toEqual(a[0].lokaal);
    for (const p of a.filter((p) => p.naam !== "content.xml"))
      expect(b.find((x) => x.naam === p.naam)!.lokaal).toEqual(p.lokaal);
  });
  it.each([
    ["r", "fromLeft"],
    ["l", "fromRight"],
    ["u", "fromBottom"],
    ["d", "fromTop"],
  ] as const)("zet pushrichting %s om naar %s", (dir, expected) => {
    const b = schrijfOvergangen(native(), [0, 1, 2], {
      ...GEEN_OVERGANG,
      effect: "push",
      richting: dir,
    });
    const root = leesXml(xml(convertOut(b)));
    const filters = zoekAlle(root, "transitionFilter").filter(
      (f) => f.ouder?.ouder?.lokaal === "par",
    );
    expect(attrNs(filters[0], SM, "subtype")).toBe(expected);
  });
  it("herstelt lege gedeelde geluidsverwijzingen uitsluitend voor bestaand intern geluid", () => {
    const wav = new Uint8Array(46),
      v = new DataView(wav.buffer);
    wav.set(strToU8("RIFF"));
    v.setUint32(4, 38, true);
    wav.set(strToU8("WAVEfmt "), 8);
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    wav.set(strToU8("data"), 36);
    v.setUint32(40, 2, true);
    const b = schrijfOvergangen(
      source(),
      [0, 1, 2],
      {
        ...GEEN_OVERGANG,
        effect: "push",
        richting: "r",
        na: 1800,
        klik: false,
      },
      true,
      { bytes: wav, naam: "tone.wav" },
    );
    const after = leesXml(xml(convertOut(b)));
    expect(zoekAlle(after, "audio").map((a) => attrNs(a, XL, "href"))).toEqual([
      "Media/tone.wav",
      "Media/tone.wav",
      "Media/tone.wav",
    ]);
    const external = packageOdf(
      flat().replaceAll(
        "vnd.sun.star.Package:Media/tone.wav",
        "https://example.invalid/tone.wav",
      ),
    );
    expect(
      zoekAlle(leesXml(xml(convertOut(b, external))), "audio").map((a) =>
        attrNs(a, XL, "href"),
      ),
    ).toEqual(["Media/tone.wav", "", ""]);
  });
  it("houdt gemengd klikbeleid ongemoeid en kiest vrije stijlnamen", () => {
    const b = schrijfOvergangen(source(), [1], {
      ...GEEN_OVERGANG,
      effect: "fade",
      klik: true,
      na: 500,
    });
    const after = xml(
      convertOut(
        b,
        packageOdf(
          flat({
            styleExtra:
              '<style:style style:name="OOSTransition1" style:family="drawing-page"/>',
          }),
        ),
      ),
    );
    expect(after).not.toContain("transition-on-click");
    expect(after).toContain('style:name="OOSTransition2"');
  });
  it("weigert toewijzing bij een afwijkend aantal dia’s en raakt andere conversies niet aan", () => {
    const result = packageOdf(flat({ count: 2 }));
    expect(convertOut(source(), result)).toBe(result);
    expect(naPresentatieConversie(source(), "pptx", "pdf", result)).toBe(
      result,
    );
  });
  it.each(["odp", "otp", "fodp"])(
    "herstelt %s timing na native afronding, ook in beide MCE-takken",
    (ext) => {
      const odf =
        ext === "fodp"
          ? strToU8(
              flat({
                duration: "PT1.234S",
                settings: 'presentation:transition-on-click="disabled"',
              }),
            )
          : packageOdf(
              flat({
                duration: "PT1.234S",
                settings: 'presentation:transition-on-click="disabled"',
              }),
            );
      const b = schrijfOvergangen(native(), [0, 1, 2], {
        ...GEEN_OVERGANG,
        effect: "push",
        richting: "r",
        duur: 400,
        na: 1000,
      });
      const fixed = naPresentatieConversie(odf, ext, "pptx", b);
      expect(
        leesOvergangen(fixed).map((o) => [o.na, o.klik, o.effect, o.duur]),
      ).toEqual(Array(3).fill([1234, false, "push", 400]));
      const p = new Pakket(fixed);
      for (const i of [1, 2, 3])
        expect(
          zoekAlle(
            leesXml(p.lees(`ppt/slides/slide${i}.xml`)),
            "transition",
          ).map((t) => t.attrs.advTm),
        ).toEqual(["1234", "1234"]);
      const h = openPresentation(fixed);
      try {
        expect(leesOvergangen(h.save()).map((o) => [o.na, o.klik])).toEqual(
          Array(3).fill([1234, false]),
        );
      } finally {
        h.dispose();
      }
    },
  );
  it("leest geërfde paginastijlen uit styles.xml en respecteert force-manual", () => {
    const content = flat()
      .replace(
        'presentation:transition-type="automatic" presentation:duration="PT1S"',
        "",
      )
      .replace(
        'style:name="shared" style:family="drawing-page"',
        'style:name="shared" style:family="drawing-page" style:parent-style-name="parent"',
      );
    const styles = strToU8(
      `<office:document-styles ${declarations}><office:styles><style:style style:name="parent" style:family="drawing-page"><style:drawing-page-properties presentation:duration="PT2.345S" presentation:transition-type="semi-automatic"/></style:style></office:styles></office:document-styles>`,
    );
    const b = source(true),
      doc = packageOdf(content, { "styles.xml": styles });
    expect(
      leesOvergangen(naPresentatieConversie(doc, "odp", "pptx", b))[0].na,
    ).toBe(2345);
    expect(
      leesOvergangen(
        naPresentatieConversie(
          packageOdf(
            content.replace(
              "<presentation:settings ",
              '<presentation:settings presentation:force-manual="true" ',
            ),
            { "styles.xml": styles },
          ),
          "odp",
          "pptx",
          b,
        ),
      ).every((o) => o.na === null && o.klik),
    ).toBe(true);
  });
  it("laat onbekende overgangseffecten, animaties, opmaak en overige PPTX-onderdelen intact", () => {
    const p = new Pakket(source());
    for (const i of [1, 2, 3])
      p.schrijf(
        `ppt/slides/slide${i}.xml`,
        p
          .lees(`ppt/slides/slide${i}.xml`)
          .replaceAll('<p:push dir="r"/>', "<p:random/>"),
      );
    const b = p.inpakken(),
      after = naPresentatieConversie(
        packageOdf(flat({ duration: "PT1.8S" })),
        "odp",
        "pptx",
        b,
      ),
      a = unzipSync(b),
      z = unzipSync(after);
    for (const path of Object.keys(a))
      if (!/^ppt\/slides\/slide\d+\.xml$/.test(path))
        expect(Buffer.from(z[path]).equals(Buffer.from(a[path])), path).toBe(
          true,
        );
    expect(leesOvergangen(after).every((o) => o.effect === "unknown")).toBe(
      true,
    );
  });
  it("voegt alleen een ontbrekende timingovergang toe en behoudt de native kindvolgorde", () => {
    const after = naPresentatieConversie(
      packageOdf(flat({ duration: "PT0S" })),
      "odp",
      "pptx",
      native(),
    );
    expect(
      leesOvergangen(after).every((o) => o.na === 0 && o.effect === "none"),
    ).toBe(true);
    const h = openPresentation(after);
    try {
      expect(h.snapshot().slides).toHaveLength(3);
    } finally {
      h.dispose();
    }
  });
  it("bewerkt platte uitvoer met de daadwerkelijke namespaces, zonder ZIP of externe bestanden", () => {
    const after = naPresentatieConversie(
      source(),
      "pptx",
      "fodp",
      strToU8(
        flat()
          .replaceAll("<presentation:", "<pr:")
          .replaceAll("</presentation:", "</pr:")
          .replaceAll(" presentation:", " pr:")
          .replace("xmlns:presentation=", "xmlns:pr="),
      ),
    );
    const root = leesXml(strFromU8(after));
    expect(
      attrNs(zoekAlle(root, "settings")[0], P, "transition-on-click"),
    ).toBe("disabled");
    expect(strFromU8(after)).toContain("PT1.8S");
  });
});
describe("ODF duur in milliseconden", () => {
  it.each([
    ["PT1.8S", 1800],
    ["PT0.001S", 1],
    ["PT0S", 0],
    ["P1DT2H3M4.005S", 93784005],
    ["PT12M", 720000],
  ])("leest %s", (text, ms) => expect(odfDuurMs(String(text))).toBe(ms));
  it.each([
    "P",
    "PT",
    "P1YT1S",
    "P1M",
    "-PT1S",
    "PTNaNS",
    "PT9999999999999S",
    "PT1ST",
    "1.8s",
  ])("laat ongeldige of kalenderduur %s ongemoeid", (text) =>
    expect(odfDuurMs(text)).toBeNull(),
  );
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
it("de echte conversieroute past de presentatiecorrectie na de native uitvoer toe", async () => {
  const { invoke } = await import("@tauri-apps/api/core"),
    { converteer } = await import("../formaten");
  const original = source(),
    result = packageOdf();
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  vi.mocked(invoke).mockResolvedValue(
    result.buffer.slice(
      result.byteOffset,
      result.byteOffset + result.byteLength,
    ),
  );
  try {
    const converted = await converteer(original, "pptx", "odp", "pptx");
    expect(xml(converted)).toContain("PT1.8S");
    expect(invoke).toHaveBeenCalledWith("converteer_document", original, {
      headers: {
        "x-office-bron": "pptx",
        "x-office-doel": "odp",
        "x-office-module": "pptx",
      },
    });
  } finally {
    vi.unstubAllGlobals();
    vi.mocked(invoke).mockReset();
  }
});
