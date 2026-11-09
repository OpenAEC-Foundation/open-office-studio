import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  GEEN_OVERGANG,
  geldigOvergangGeluid,
  leesOvergangGeluiden,
  leesOvergangen,
  schrijfOvergangen,
  type Overgang,
} from "./overgangen";

const bron = () =>
  new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"));
function wav() {
  const bytes = new Uint8Array(44 + 1600),
    view = new DataView(bytes.buffer);
  const tekst = (i: number, s: string) =>
    bytes.set(new TextEncoder().encode(s), i);
  tekst(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  tekst(8, "WAVE");
  tekst(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tekst(36, "data");
  view.setUint32(40, 1600, true);
  return bytes;
}
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
  it("herkent WAV-inhoud en weigert lege, vervalste en afgekapt verklaarde bestanden", () => {
    expect(geldigOvergangGeluid(wav())).toBe(true);
    expect(geldigOvergangGeluid(new Uint8Array())).toBe(false);
    const fake = wav();
    fake[12] = 0;
    expect(geldigOvergangGeluid(fake)).toBe(false);
    expect(geldigOvergangGeluid(wav().slice(0, 100))).toBe(false);
    expect(() =>
      schrijfOvergangen(bron(), [1], opties, true, {
        naam: "bad.wav",
        bytes: fake,
      }),
    ).toThrow();
  });
  it("sluit één geluidsbestand in voor alle gekozen dia's en behoudt de bytes bij opslaan", async () => {
    const geluid = wav();
    const bytes = schrijfOvergangen(bron(), [0, 1, 2], opties, true, {
      naam: 'A & B "test".wav',
      bytes: geluid,
    });
    const delen = unzipSync(bytes);
    expect(
      Object.keys(delen).filter((n) => /transition\d+\.wav$/.test(n)),
    ).toHaveLength(1);
    for (const g of leesOvergangGeluiden(bytes))
      expect(g).toMatchObject({
        bytes: geluid,
        mime: "audio/wav",
        naam: 'A & B "test".wav',
        loop: false,
      });
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const opgeslagen = pptx.openPresentation(bytes).save();
    expect(leesOvergangGeluiden(opgeslagen)).toEqual(
      leesOvergangGeluiden(bytes),
    );
    expect(
      leesOvergangGeluiden(schrijfOvergangen(opgeslagen, [1], opties, false)),
    ).toEqual([
      leesOvergangGeluiden(bytes)[0],
      null,
      leesOvergangGeluiden(bytes)[2],
    ]);
  });
  it("leest een stopcommando en haalt externe geluiden niet op", () => {
    expect(
      leesOvergangGeluiden(
        fixture("<p:transition><p:sndAc><p:endSnd/></p:sndAc></p:transition>"),
      )[1],
    ).toEqual({ stop: true });
    expect(
      leesOvergangGeluiden(
        fixture(
          '<p:transition><p:sndAc><p:stSnd><p:snd r:link="extern"/></p:stSnd></p:sndAc></p:transition>',
        ),
      )[1],
    ).toBeNull();
  });
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
