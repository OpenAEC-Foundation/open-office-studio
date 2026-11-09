import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  GEEN_OVERGANG,
  leesOvergangen,
  schrijfOvergangen,
  type Overgang,
} from "./overgangen";

const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
const p = "ppt/slides/slide2.xml";
const deel = (b: Uint8Array) => strFromU8(unzipSync(b)[p]);
const opties: Overgang = {
  ...GEEN_OVERGANG,
  effect: "push",
  duur: 1300,
  richting: "r",
  na: 3200,
};
function fixture(inhoud: string) {
  const delen = unzipSync(bron());
  delen[p] = strToU8(
    strFromU8(delen[p]).replace("</p:sld>", `${inhoud}</p:sld>`),
  );
  return zipSync(delen);
}

describe("diaovergangen (#83)", () => {
  it("leest ontbrekende overgangen zonder de presentatie te wijzigen", () => {
    expect(leesOvergangen(bron())).toEqual(
      Array.from({ length: 3 }, () => GEEN_OVERGANG),
    );
  });
  it.each(["fade", "push", "wipe", "split", "zoom", "none"] as const)(
    "schrijft en leest %s op gekozen dia's",
    (effect) => {
      const o = {
        ...opties,
        effect,
        orientatie: "vert" as const,
        inUit: "in" as const,
      };
      const na = schrijfOvergangen(bron(), [1], o);
      expect(leesOvergangen(na)[1]).toMatchObject({
        effect,
        duur: 1300,
        klik: true,
        na: 3200,
      });
      if (effect === "push" || effect === "wipe")
        expect(leesOvergangen(na)[1].richting).toBe("r");
      if (effect === "split")
        expect(leesOvergangen(na)[1].orientatie).toBe("vert");
      if (effect === "zoom" || effect === "split")
        expect(leesOvergangen(na)[1].inUit).toBe("in");
      expect(leesOvergangen(na)[0]).toEqual(GEEN_OVERGANG);
      const voor = unzipSync(bron()),
        naDelen = unzipSync(na);
      for (const [pad, bytes] of Object.entries(voor))
        if (pad !== p) expect(naDelen[pad]).toEqual(bytes);
    },
  );
  it("plaatst de overgang voor timing en houdt de volgorde bij herhaald toepassen", () => {
    let na = schrijfOvergangen(
      fixture("<p:timing><p:tnLst/></p:timing><p:extLst/>"),
      [1],
      opties,
    );
    na = schrijfOvergangen(na, [1], { ...opties, duur: 2000, na: null });
    expect(deel(na).indexOf("<mc:AlternateContent")).toBeLessThan(
      deel(na).indexOf("<p:timing>"),
    );
    expect(deel(na).match(/<p:transition\b/g)).toHaveLength(2);
    expect(leesOvergangen(na)[1]).toMatchObject({ duur: 2000, na: null });
  });
  it("behoudt onbekende effecten, geluid en extensies bij timing wijzigen", () => {
    const effect = '<p:wheel spokes="8"/>';
    const geluid = "<p:sndAc><p:endSnd/></p:sndAc>";
    const ext = '<p:extLst><p:ext uri="onbekend"/></p:extLst>';
    const b = fixture(
      `<p:transition spd="slow">${effect}${geluid}${ext}</p:transition>`,
    );
    expect(leesOvergangen(b)[1]).toMatchObject({
      effect: "unknown",
      duur: 1000,
      geluid: true,
    });
    const na = schrijfOvergangen(b, [1], { ...opties, effect: "unknown" });
    for (const f of [effect, geluid, ext]) expect(deel(na)).toContain(f);
    expect(leesOvergangen(na)[1]).toMatchObject({
      effect: "unknown",
      duur: 1300,
    });
    const vervangen = schrijfOvergangen(na, [1], opties, false);
    expect(deel(vervangen)).not.toContain(effect);
    expect(deel(vervangen)).not.toContain(geluid);
    expect(deel(vervangen)).toContain(ext);
  });
  it("leest exacte duur via een ander namespacevoorvoegsel", () => {
    const b = fixture(
      '<p:transition xmlns:q="http://schemas.microsoft.com/office/powerpoint/2010/main" q:dur="2400" advClick="false" advTm="5000"><p:fade/></p:transition>',
    );
    expect(leesOvergangen(b)[1]).toMatchObject({
      effect: "fade",
      duur: 2400,
      klik: false,
      na: 5000,
    });
  });
  it.each([-1, 60001, NaN, 1.5])("weigert ongeldige duur %s", (duur) => {
    expect(() => schrijfOvergangen(bron(), [1], { ...opties, duur })).toThrow();
  });
  it("weigert een lege/ongeldige selectie of een dia zonder doorgang", () => {
    for (const s of [[], [-1], [3], [1.5]])
      expect(() => schrijfOvergangen(bron(), s, opties)).toThrow();
    expect(() =>
      schrijfOvergangen(bron(), [1], { ...opties, klik: false, na: null }),
    ).toThrow();
  });
  it("behoudt overgangen bij openen, opslaan en heropenen met de engine", async () => {
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const bytes = schrijfOvergangen(bron(), [0, 1, 2], opties);
    const doc = pptx.openPresentation(bytes);
    const save = doc.save();
    expect(leesOvergangen(save)).toEqual(leesOvergangen(bytes));
    const heropend = pptx.openPresentation(save);
    expect(heropend.snapshot().slides).toHaveLength(3);
  });
});
