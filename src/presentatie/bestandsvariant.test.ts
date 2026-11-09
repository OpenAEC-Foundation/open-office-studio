import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bereidOpenen } from "../import/openen";
import { bewaarInFormaat } from "../export/bewaar";
import { kiesRoute, uitvoerformaat } from "../formaten";
import { controleerPakket } from "../pakketcontrole";
import { Pakket } from "../grafieken/pakket";
import {
  presentatieVariant,
  PRESENTATIETYPEN,
  PPSX_MIME,
} from "./bestandsvariant";

function bron() {
  const pakket = new Pakket(
    new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpvisie.pptx")),
  );
  pakket.schrijf(
    "ppt/media/test.wav",
    new Uint8Array([82, 73, 70, 70, 0, 3, 255]),
  );
  pakket.voegOverrideToe("ppt/media/test.wav", "audio/wav");
  const id = pakket.voegRelatieToe(
    "ppt/slides/slide1.xml",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio",
    "ppt/media/test.wav",
  );
  const xml = pakket.lees("ppt/slides/slide1.xml");
  pakket.schrijf(
    "ppt/slides/slide1.xml",
    xml.replace(
      "</p:sld>",
      `<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" p14:dur="400" advClick="0" advTm="1800"><p:push dir="r"/><p:sndAc><p:stSnd><p:snd r:embed="${id}" name="test.wav"/></p:stSnd></p:sndAc></p:transition></p:sld>`,
    ),
  );
  return pakket.inpakken();
}
function gelijkBehalveType(voor: Uint8Array, na: Uint8Array) {
  const a = unzipSync(voor),
    b = unzipSync(na);
  expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
  for (const [pad, bytes] of Object.entries(a))
    if (pad !== "[Content_Types].xml") expect(b[pad], pad).toEqual(bytes);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PPSX/POTX zonder conversie (#36)", () => {
  it.each(["ppsx", "potx"] as const)(
    "wijzigt voor %s uitsluitend het hoofdinhoudstype",
    (ext) => {
      const voor = bron(),
        na = presentatieVariant(voor, ext);
      gelijkBehalveType(voor, na);
      expect(strFromU8(unzipSync(na)["[Content_Types].xml"])).toContain(
        PRESENTATIETYPEN[ext],
      );
      gelijkBehalveType(na, presentatieVariant(na, "pptx"));
      expect(presentatieVariant(na, ext)).toBe(na);
    },
  );
  it.each(["ppsx", "potx"] as const)(
    "opent %s zonder runtime met dia's, media, modellen en notities intact",
    async (ext) => {
      const source = presentatieVariant(bron(), ext),
        converteer = vi.fn(async () => {
          throw new Error("Runtime must not run");
        });
      const result = await bereidOpenen(`Voorbeeld.${ext}`, source, {
        converteer,
      });
      expect(converteer).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        soort: "pptx",
        naam: "Voorbeeld.pptx",
        gewijzigd: true,
      });
      expect(result?.exportFormaat).toBe(ext === "ppsx" ? "ppsx" : undefined);
      expect(result?.voorstelling).toBe(ext === "ppsx" ? true : undefined);
      gelijkBehalveType(source, result!.bytes);
    },
  );
  it("houdt onverwachte VBA apart van de editor en rapporteert dat die niet wordt uitgevoerd", async () => {
    const pakket = new Pakket(presentatieVariant(bron(), "ppsx")),
      vba = new Uint8Array([1, 9, 2, 8, 3]);
    pakket.schrijf("ppt/vbaProject.bin", vba);
    pakket.voegOverrideToe(
      "ppt/vbaProject.bin",
      "application/vnd.ms-office.vbaProject",
    );
    pakket.voegRelatieToe(
      "ppt/presentation.xml",
      "http://schemas.microsoft.com/office/2006/relationships/vbaProject",
      "ppt/vbaProject.bin",
    );
    const result = await bereidOpenen("Voorbeeld.ppsx", pakket.inpakken(), {
      converteer: vi.fn(),
    });
    expect(controleerPakket(result!.bytes, "pptx").macros).toBe(false);
    expect(result?.bron?.macro?.delen["ppt/vbaProject.bin"]).toEqual(vba);
    expect(
      result?.rapport?.regels.find((r) => r.id === "macros")?.gevolg,
    ).toContain("nooit uitgevoerd");
  });
  it("weigert een document met een ander hoofdinhoudstype", () => {
    const delen = unzipSync(bron());
    delen["[Content_Types].xml"] = strToU8(
      strFromU8(delen["[Content_Types].xml"]).replace(
        PRESENTATIETYPEN.pptx,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      ),
    );
    expect(() => presentatieVariant(zipSync(delen), "ppsx")).toThrow();
  });
  it("maakt PPSX beschikbaar zonder kantoorruntime", () =>
    expect(kiesRoute(uitvoerformaat("pptx", "ppsx")!, false)).toBe("engine"));
  it.each(["ppt", "pps", "pot"])(
    "behoudt de binaire %s-route en stelt PPTX voor",
    async (ext) => {
      const converteer = vi.fn(async () => bron());
      const result = await bereidOpenen(
        `Oud.${ext}`,
        new Uint8Array([1, 2, 3]),
        { converteer },
      );
      expect(converteer).toHaveBeenCalledOnce();
      expect(converteer.mock.calls[0]).toEqual([
        new Uint8Array([1, 2, 3]),
        ext,
        "pptx",
        "pptx",
      ]);
      expect(result?.exportFormaat).toBeUndefined();
      expect(result?.voorstelling).toBe(ext === "pps" ? true : undefined);
    },
  );
  it("de echte opslagroute downloadt PPSX met de juiste MIME en ongewijzigde diaonderdelen", async () => {
    vi.useFakeTimers();
    let download: Blob | undefined;
    const a = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => a,
      body: { append: vi.fn() },
    });
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (!(blob instanceof Blob)) throw new Error("Expected a file Blob");
      download = blob;
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const bytes = bron();
    const result = await bewaarInFormaat("pptx", bytes, {
      naam: "Show",
      ext: "ppsx",
      route: "engine",
    });
    expect(result.status).toBe("download");
    expect(a.download).toBe("Show.ppsx");
    expect(a.click).toHaveBeenCalledOnce();
    expect(download?.type).toBe(PPSX_MIME);
    gelijkBehalveType(bytes, new Uint8Array(await download!.arrayBuffer()));
    await vi.runOnlyPendingTimersAsync();
  });
  it("de engine opent, bewaart en heropent de genormaliseerde diavoorstelling", async () => {
    const pptx = await import("@betteroffice/pptx");
    await pptx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
    const voor = bron(),
      show = presentatieVariant(voor, "ppsx");
    const result = await bereidOpenen("Voorbeeld.ppsx", show, {
      converteer: vi.fn(),
    });
    const doc = pptx.openPresentation(result!.bytes);
    expect(doc.snapshot().slides).toEqual(
      pptx.openPresentation(voor).snapshot().slides,
    );
    const saved = presentatieVariant(doc.save(), "ppsx");
    const reopened = await bereidOpenen("Bewaard.ppsx", saved, {
      converteer: vi.fn(),
    });
    expect(pptx.openPresentation(reopened!.bytes).snapshot().slides).toEqual(
      doc.snapshot().slides,
    );
    expect(strFromU8(unzipSync(saved)["ppt/slides/slide1.xml"])).toContain(
      'advTm="1800"',
    );
    expect(unzipSync(saved)["ppt/media/test.wav"]).toEqual(
      unzipSync(voor)["ppt/media/test.wav"],
    );
  });
});
