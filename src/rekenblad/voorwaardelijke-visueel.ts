/** Getalafhankelijke kleurenschalen, gegevensbalken en pictogrammen. */
import type { WorkbookHandle } from "@betteroffice/xlsx";
import { attr, kinderen, kind, leesXml } from "../grafieken/xml";
import { ontleedBereik, type Bereik } from "../lint/rekenblad-logica";
import type { VoorwaardelijkeRegel } from "./voorwaardelijke-opmaak";
import { visueleGrenzen } from "./voorwaardelijke-grenzen";
import { pictogramset, type Pictogram } from "./pictogrammen";

export interface VisueleCel {
  fill?: string;
  balk?: { deel: number; nul: number; kleur: string };
  icoon?: Pictogram;
  alleen?: boolean;
  bereik?: Bereik;
}
export function visueleRegel(
  h: WorkbookHandle,
  blad: number,
  regel: VoorwaardelijkeRegel,
  nowSerial?: number,
): Map<string, VisueleCel> {
  const uit = new Map<string, VisueleCel>();
  const exporteer = h.exportStructured({
    scope: regel.range.split(/\s+/).map((range) => ({ sheet: blad, range })),
    includeHiddenSheets: true,
    includeHiddenRows: true,
    includeHiddenColumns: true,
    includeDefinedNames: false,
    maxCells: 1000000,
    maxBytes: 16 * 1024 * 1024,
  });
  if (!exporteer.ok) throw new Error(exporteer.failure.message);
  if (exporteer.content.diagnostics.some((d) => d.code === "truncated"))
    return uit;
  const cellen = exporteer.content.sheets
    .flatMap((s) => s.cells)
    .flatMap((c) =>
      c.anchor.kind === "cell" &&
      c.value.kind === "number" &&
      Number.isFinite(c.value.value)
        ? [
            {
              a1: c.anchor.a1,
              n: c.value.value,
              bereik: c.merge?.origin
                ? (ontleedBereik(c.merge.range) ?? undefined)
                : undefined,
            },
          ]
        : [],
    );
  if (!cellen.length) return uit;
  const root = leesXml(regel.rawXml),
    opties = kind(root, regel.type);
  if (!opties) return uit;
  const grens = visueleGrenzen(
    h,
    blad,
    regel,
    opties,
    cellen.map((c) => c.n),
    nowSerial,
  );
  if (!grens) return uit;
  const kleuren =
    regel.visueleKleuren ??
    kinderen(opties, "color").map((c) => {
      const rgb = attr(c, "rgb");
      return rgb && /^(?:[\da-f]{6}|[\da-f]{8})$/i.test(rgb)
        ? "#" + rgb.slice(-6)
        : "#638ec6";
    });
  const mengen = (a: string, b: string, f: number) =>
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - f) +
            parseInt(b.slice(i, i + 2), 16) * f,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  for (const c of cellen) {
    const zet = (cel: VisueleCel) =>
      uit.set(c.a1, c.bereik ? { ...cel, bereik: c.bereik } : cel);
    const alleen = ["0", "false"].includes(attr(opties, "showValue") ?? "1");
    if (
      regel.type === "colorScale" &&
      grens.length === kleuren.length &&
      grens.length >= 2
    ) {
      const boven = grens.findIndex((n) => c.n <= n);
      const i = boven < 0 ? grens.length - 2 : Math.max(0, boven - 1);
      const f =
        grens[i + 1] === grens[i]
          ? 0
          : Math.max(
              0,
              Math.min(1, (c.n - grens[i]) / (grens[i + 1] - grens[i])),
            );
      zet({ fill: mengen(kleuren[i], kleuren[i + 1], f) });
    } else if (regel.type === "dataBar" && grens.length === 2) {
      const laag = Number(attr(opties, "minLength") ?? 10),
        hoog = Number(attr(opties, "maxLength") ?? 90);
      if (
        !Number.isInteger(laag) ||
        !Number.isInteger(hoog) ||
        laag < 0 ||
        hoog > 100 ||
        laag > hoog
      )
        return new Map();
      const span = grens[1] - grens[0],
        deel = span
          ? Math.max(0, Math.min(1, (c.n - grens[0]) / span))
          : c.n === 0
            ? 0
            : 1;
      zet({
        balk: {
          deel: (laag + deel * (hoog - laag)) / 100,
          nul: 0,
          kleur: kleuren[0] ?? "#638ec6",
        },
        alleen,
      });
    } else if (regel.type === "iconSet" && grens.length >= 3) {
      let index = 0;
      for (let i = 1; i < grens.length; i++)
        if (
          c.n > grens[i] ||
          (c.n === grens[i] &&
            !["0", "false"].includes(
              attr(kinderen(opties, "cfvo")[i], "gte") ?? "1",
            ))
        )
          index = i;
      if (["1", "true"].includes(attr(opties, "reverse") ?? ""))
        index = grens.length - 1 - index;
      const set = attr(opties, "iconSet") ?? "3TrafficLights1";
      if (!pictogramset(set) || Number(set[0]) !== grens.length)
        return new Map();
      zet({ icoon: { set, index }, alleen });
    }
  }
  return uit;
}

export { tekenVisueleCellen } from "./voorwaardelijke-laag";
