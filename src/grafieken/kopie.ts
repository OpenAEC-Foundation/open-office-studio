/** Een grafiek overnemen met zijn eigen relaties, zonder de rest van het brondocument. */
import { strToU8, unzipSync, zipSync } from "fflate";
import i18next from "../i18n/config";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Pakket } from "./pakket";
import { attr, attrTekst, kinderen, leesXml, vervang } from "./xml";
import {
  bewerkGrafiek,
  leesGrafiek,
  voegGrafiekToePptx,
  type Formaat,
} from "./documenten";
import { controleerModel, leesGetal, type GrafiekModel } from "./model";
import { ontleedVerwijzing } from "./bron";
import { GrafiekFout, LIMIETEN } from "./fouten";

const PREFIX = "OpenOfficeStudio.Chart/1\n",
  ROOT = "chart/chart.xml",
  MAX = 16 * 1024 * 1024;
const fout = () => new GrafiekFout(i18next.t("charts:transfer.invalid"));
const CT =
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>';

/** Verliesvrije gerichte kopie: ook cycli en gedeelde afhankelijkheden krijgen één nieuw onderdeel. */
function kopieer(bron: Pakket, doel: Pakket, pad: string, nieuw: string) {
  const map = new Map<string, string>(),
    types = leesXml(bron.lees("[Content_Types].xml"));
  const type = (pad: string) =>
    attr(
      kinderen(types, "Override").find(
        (e) => attr(e, "PartName") === "/" + pad,
      ),
      "ContentType",
    ) ??
    attr(
      kinderen(types, "Default").find(
        (e) =>
          attr(e, "Extension")?.toLowerCase() ===
          pad.split(".").pop()?.toLowerCase(),
      ),
      "ContentType",
    );
  let bytes = 0;
  function kopie(oud: string, vasteNaam?: string): string {
    const al = map.get(oud);
    if (al) return al;
    const data = bron.bytes(oud),
      ct = type(oud);
    if (!data || !ct || map.size >= 512) throw fout();
    bytes += data.length;
    if (bytes > MAX) throw fout();
    const ext = /\.([A-Za-z0-9]{1,10})$/.exec(oud)?.[1] ?? "bin";
    const naar = vasteNaam ?? doel.vrijPad(`ppt/import/chartPart#.${ext}`);
    map.set(oud, naar);
    doel.schrijf(naar, data);
    doel.voegOverrideToe(naar, ct);
    const rp = Pakket.relsPad(oud);
    if (bron.heeft(rp)) {
      const xml = bron.lees(rp),
        root = leesXml(xml),
        edits = [];
      for (const rel of kinderen(root, "Relationship")) {
        if (attr(rel, "TargetMode") === "External") continue;
        const target = attr(rel, "Target");
        if (!target) throw fout();
        const bestemming = kopie(Pakket.doelPad(oud, target));
        edits.push({
          start: rel.start,
          eind: rel.inhoudStart,
          tekst: `<${rel.naam}${attrTekst({ ...rel.attrs, Target: Pakket.relatief(naar, bestemming) })}${rel.leeg ? "/>" : ">"}`,
        });
      }
      doel.schrijf(Pakket.relsPad(naar), vervang(xml, edits));
    }
    return naar;
  }
  kopie(pad, nieuw);
}
const naarBase64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
function pakketVanTekst(tekst: string) {
  if (!isGrafiekKopie(tekst) || tekst.length > MAX * 1.4) throw fout();
  const raw = tekst.slice(tekst.indexOf("\n") + 1);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw fout();
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    throw fout();
  }
  let n = 0,
    totaal = 0;
  // Controleer de zipgrootte vóór uitpakken; de gewone pakketlezer controleert daarna de inhoud.
  unzipSync(bytes, {
    filter: (f) => {
      n++;
      totaal += f.originalSize;
      if (n > 1024 || totaal > MAX) throw fout();
      return false;
    },
  });
  return new Pakket(bytes);
}
export const isGrafiekKopie = (tekst: string) =>
  tekst.startsWith(PREFIX) || tekst.startsWith(PREFIX.replace("\n", "\r\n"));
export function maakGrafiekKopie(
  bytes: Uint8Array,
  formaat: Formaat,
  chartPad: string,
  actueel?: GrafiekModel,
) {
  const gelezen = leesGrafiek(bytes, chartPad);
  if (!gelezen.bewerkbaar)
    throw new GrafiekFout(
      gelezen.reden ?? i18next.t("charts:transfer.invalid"),
    );
  const model = actueel ?? gelezen.model;
  controleerModel(model);
  const bron = new Pakket(bewerkGrafiek(bytes, formaat, chartPad, model)),
    mini = new Pakket(zipSync({ "[Content_Types].xml": strToU8(CT) }));
  kopieer(bron, mini, chartPad, ROOT);
  const data = mini.inpakken();
  if (data.length > MAX) throw fout();
  return PREFIX + naarBase64(data);
}
export function leesGrafiekKopie(tekst: string) {
  const p = pakketVanTekst(tekst),
    gelezen = leesGrafiek(p.inpakken(), ROOT);
  if (!gelezen.bewerkbaar) throw fout();
  controleerModel(gelezen.model);
  return gelezen;
}
export function plakGrafiekKopie(
  bytes: Uint8Array,
  tekst: string,
  dia: number,
  model?: GrafiekModel,
) {
  const bron = pakketVanTekst(tekst),
    gelezen = leesGrafiek(bron.inpakken(), ROOT);
  if (!gelezen.bewerkbaar) throw fout();
  const data = model ?? gelezen.model;
  controleerModel(data);
  const r = voegGrafiekToePptx(bytes, data, { dia }),
    doel = new Pakket(r.bytes);
  // Verwijder alleen het zojuist gegenereerde tijdelijke gegevensblad en zijn relaties.
  for (const rel of doel
    .relaties(r.chartPad)
    .filter((r) => !r.extern && r.type.endsWith("/package"))) {
    const part = doel.doel(r.chartPad, rel.id);
    if (part) {
      doel.verwijder(part);
      doel.verwijderOverride(part);
    }
  }
  doel.verwijder(Pakket.relsPad(r.chartPad));
  kopieer(bron, doel, ROOT, r.chartPad);
  return {
    ...r,
    bytes: bewerkGrafiek(doel.inpakken(), "pptx", r.chartPad, data),
  };
}

/** Lees de huidige broncellen in één begrensde batch; oude grafiekcaches zijn niet leidend. */
export async function actueleGrafiek(
  api: Pick<XlsxEditorApi, "handle" | "readCells">,
  model: GrafiekModel,
): Promise<GrafiekModel> {
  const versie = api.handle.version(),
    info = api.handle.sheetInfo();
  const refs = [
    model.categorieenRef,
    ...model.reeksen.flatMap((r) => [r.naamRef, r.waardenRef]),
  ];
  const gevonden = new Map<
    string,
    {
      sheetId: string;
      range: {
        kind: "rowCol";
        start: { row: number; col: number };
        end: { row: number; col: number };
      };
    }
  >();
  let aantal = 0;
  for (const ref of refs) {
    if (!ref || gevonden.has(ref)) continue;
    const v = ontleedVerwijzing(ref);
    if (!v) continue;
    const b = v.bereik,
      blad = info.sheetNames.findIndex(
        (n) => n.toLowerCase() === v.blad.toLowerCase(),
      );
    if (blad < 0) throw fout();
    if (
      b.top < 0 ||
      b.left < 0 ||
      b.bottom >= 1048576 ||
      b.right >= 16384 ||
      (b.top !== b.bottom && b.left !== b.right)
    )
      throw fout();
    aantal += (b.bottom - b.top + 1) * (b.right - b.left + 1);
    if (aantal > LIMIETEN.cellen) throw fout();
    gevonden.set(ref, {
      sheetId: info.sheetIds[blad],
      range: {
        kind: "rowCol",
        start: { row: b.top, col: b.left },
        end: { row: b.bottom, col: b.right },
      },
    });
  }
  if (!gevonden.size) return model;
  const result = await api.readCells({ ranges: [...gevonden.values()] });
  if (!result.ok) throw new GrafiekFout(result.failure.message);
  if (api.handle.version() !== versie)
    throw new GrafiekFout(i18next.t("charts:transfer.changed"));
  const map = new Map(
    [...gevonden.keys()].map((ref, i) => [ref, result.ranges[i].cells.flat()]),
  );
  const text = (ref: string | undefined) =>
    ref
      ? map
          .get(ref)
          ?.map(
            (c) =>
              c.displayText ??
              (c.value.kind === "text"
                ? c.value.value
                : c.value.kind === "number"
                  ? String(c.value.value)
                  : ""),
          )
      : undefined;
  const n: GrafiekModel = {
    ...model,
    categorieen: text(model.categorieenRef) ?? model.categorieen,
    reeksen: model.reeksen.map((r) => ({
      ...r,
      naam: text(r.naamRef)?.[0] ?? r.naam,
      waarden:
        r.waardenRef && map.has(r.waardenRef)
          ? map
              .get(r.waardenRef)!
              .map((c) =>
                c.value.kind === "number" && Number.isFinite(c.value.value)
                  ? c.value.value
                  : c.value.kind === "text"
                    ? leesGetal(c.value.value)
                    : null,
              )
          : r.waarden,
    })),
  };
  controleerModel(n);
  return n;
}
