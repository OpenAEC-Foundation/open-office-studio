import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import {
  actueleGrafiek,
  leesGrafiekKopie,
  maakGrafiekKopie,
  plakGrafiekKopie,
} from "./kopie";
import {
  bewerkGrafiek,
  leesGrafiek,
  lijstGrafieken,
  voegGrafiekToeXlsx,
} from "./documenten";
import { SOORTEN, standaardModel } from "./model";
import { ingeslotenWerkboek, metIngeslotenVerwijzingen } from "./werkboek";
import { Pakket } from "./pakket";

beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
const handles: PresentationHandle[] = [];
afterEach(() => handles.splice(0).forEach((h) => h.dispose()));
const model = () =>
  metIngeslotenVerwijzingen(
    standaardModel({
      titel: "Projectkosten",
      categorieen: ["2025", "2026"],
      reeksen: [
        { naam: "A", waarden: [12, 14], kleur: "336699" },
        { naam: "B", waarden: [8, 9], kleur: "996633" },
      ],
    }),
  );
const doel = () => new Uint8Array(readFileSync("public/templates/nieuw.pptx"));
function bron() {
  const m = model();
  return voegGrafiekToeXlsx(ingeslotenWerkboek(m), m, {
    blad: 0,
    col: 4,
    row: 1,
    kolommen: 8,
    rijen: 16,
  });
}
function open(b: Uint8Array) {
  const h = openPresentation(b);
  h.registerFont({
    family: "Arial",
    bytes: readFileSync(
      "node_modules/@betteroffice/fonts/assets/LiberationSans-Regular.ttf",
    ),
  });
  handles.push(h);
  return h;
}
describe("grafieken kopiëren naar Presentatie (#82)", () => {
  it.each(SOORTEN)(
    "bewaart $soort en maakt een bewerkbaar ingesloten werkboek",
    ({ soort }) => {
      const m = { ...model(), soort },
        b = voegGrafiekToeXlsx(ingeslotenWerkboek(m), m, {
          blad: 0,
          col: 4,
          row: 1,
          kolommen: 8,
          rijen: 16,
        });
      const clip = maakGrafiekKopie(b.bytes, "xlsx", b.chartPad),
        r = plakGrafiekKopie(doel(), clip, 0);
      expect(leesGrafiek(r.bytes, r.chartPad).model.soort).toBe(soort);
      expect(
        leesGrafiek(r.bytes, r.chartPad).model.reeksen.map((r) => r.waarden),
      ).toEqual(
        soort === "taart"
          ? [[12, 14]]
          : [
              [12, 14],
              [8, 9],
            ],
      );
      const p = new Pakket(r.bytes),
        workbook = p
          .relaties(r.chartPad)
          .find((r) => r.type.endsWith("/package"))!;
      expect(p.doel(r.chartPad, workbook.id)).toMatch(/\.xlsx$/);
      const h = open(r.bytes);
      expect(h.layoutSlide(0).primitives.some((p) => p.kind === "chart")).toBe(
        true,
      );
      const saved = h.save();
      expect(leesGrafiek(saved, r.chartPad).model.soort).toBe(soort);
      expect(lijstGrafieken(saved, "pptx")).toHaveLength(1);
    },
  );
  it("neemt alleen de grafiekafhankelijkheden mee en behoudt onbekende XML, media en cycli", () => {
    const b = bron(),
      p = new Pakket(b.bytes);
    p.schrijf(
      b.chartPad,
      p
        .lees(b.chartPad)
        .replace(
          "</c:chartSpace>",
          '<c:extLst><c:ext uri="test"><x:keep xmlns:x="urn:chart-copy">source</x:keep></c:ext></c:extLst></c:chartSpace>',
        ),
    );
    p.schrijf("xl/media/chart.bin", new Uint8Array([1, 2, 3]));
    p.voegOverrideToe("xl/media/chart.bin", "application/octet-stream");
    p.voegRelatieToe(b.chartPad, "urn:test:media", "xl/media/chart.bin");
    p.voegRelatieToe("xl/media/chart.bin", "urn:test:back", b.chartPad);
    p.schrijf("private/never-copy.xml", "<data>UNRELATED</data>");
    p.voegOverrideToe("private/never-copy.xml", "application/xml");
    const clip = maakGrafiekKopie(p.inpakken(), "xlsx", b.chartPad),
      mini = new Pakket(
        new Uint8Array(Buffer.from(clip.split("\n")[1], "base64")),
      );
    expect(
      mini
        .namen()
        .some((n) => n.includes("worksheets") || n.includes("private")),
    ).toBe(false);
    const r = plakGrafiekKopie(doel(), clip, 0),
      q = new Pakket(r.bytes);
    expect(q.lees(r.chartPad)).toContain("urn:chart-copy");
    const media = q
        .relaties(r.chartPad)
        .find((r) => r.type === "urn:test:media")!,
      path = q.doel(r.chartPad, media.id)!;
    expect(q.bytes(path)).toEqual(new Uint8Array([1, 2, 3]));
    expect(q.doel(path, q.relaties(path)[0].id)).toBe(r.chartPad);
    expect(new Pakket(open(r.bytes).save()).lees(r.chartPad)).toContain(
      "urn:chart-copy",
    );
  });
  it("wijzigt data en opmaak na plakken zonder het brondocument te veranderen", () => {
    const b = bron(),
      original = b.bytes.slice(),
      clip = maakGrafiekKopie(b.bytes, "xlsx", b.chartPad),
      m = leesGrafiekKopie(clip).model;
    m.titel = "Bijgewerkt";
    m.reeksen[0].waarden[0] = 999;
    const r = plakGrafiekKopie(doel(), clip, 0, m),
      n = leesGrafiek(r.bytes, r.chartPad).model;
    expect(n.titel).toBe("Bijgewerkt");
    expect(n.reeksen[0].waarden[0]).toBe(999);
    expect(b.bytes).toEqual(original);
    const edited = bewerkGrafiek(r.bytes, "pptx", r.chartPad, {
      ...n,
      titel: "Nogmaals",
    });
    expect(leesGrafiek(open(edited).save(), r.chartPad).model.titel).toBe(
      "Nogmaals",
    );
  });
  it("weigert ongeldige of niet-grafiekclipboarddata zonder doelmutatie", () => {
    const b = doel(),
      copy = b.slice();
    for (const s of [
      "text",
      "OpenOfficeStudio.Chart/1\n!",
      "OpenOfficeStudio.Chart/1\nAAAA",
    ]) {
      expect(() => plakGrafiekKopie(b, s, 0)).toThrow();
    }
    expect(b).toEqual(copy);
  });
  it("accepteert ook de CRLF-regeleinden van het Windows-klembord", () => {
    const b = bron(),
      tekst = maakGrafiekKopie(b.bytes, "xlsx", b.chartPad).replace(
        "\n",
        "\r\n",
      );
    expect(leesGrafiekKopie(tekst).model.titel).toBe("Projectkosten");
    expect(
      lijstGrafieken(plakGrafiekKopie(doel(), tekst, 0).bytes, "pptx"),
    ).toHaveLength(1);
  });
  it("leest actuele bronwaarden in één batch en bewaart stijl", async () => {
    let calls = 0;
    const m = model();
    const texts = [
      ["2025", "2026"],
      ["Nieuw A"],
      [25, 26],
      ["Nieuw B"],
      [30, 31],
    ];
    const api = {
      handle: {
        version: () => "v1",
        sheetInfo: () => ({ sheetNames: ["Blad1"], sheetIds: ["s1"] }),
      },
      readCells: async ({ ranges }: { ranges: unknown[] }) => {
        calls++;
        expect(ranges).toHaveLength(5);
        return {
          ok: true,
          ranges: texts.map((row) => ({
            cells: row.map((v) => [
              {
                value:
                  typeof v === "number"
                    ? { kind: "number", value: v }
                    : { kind: "text", value: v },
                displayText: String(v),
              },
            ]),
          })),
        };
      },
    } as unknown as Pick<XlsxEditorApi, "handle" | "readCells">;
    const n = await actueleGrafiek(api, m);
    expect(calls).toBe(1);
    expect(n.reeksen[0].naam).toBe("Nieuw A");
    expect(n.reeksen[0].waarden).toEqual([25, 26]);
    expect(n.reeksen[0].kleur).toBe("336699");
    expect(m.reeksen[0].waarden).toEqual([12, 14]);
  });
  it("weigert een bron die tijdens de gegevenslezing verandert", async () => {
    let versie = "v1";
    const api = {
      handle: {
        version: () => versie,
        sheetInfo: () => ({ sheetNames: ["Blad1"], sheetIds: ["s1"] }),
      },
      readCells: async () => {
        versie = "v2";
        return { ok: true, ranges: [] };
      },
    } as unknown as Pick<XlsxEditorApi, "handle" | "readCells">;
    await expect(actueleGrafiek(api, model())).rejects.toThrow();
  });
});
