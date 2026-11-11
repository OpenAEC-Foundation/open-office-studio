/** Standard SpreadsheetML icon families; indices run from low to high. */
import type { DrawCmd, GeometryPathCommand, Rect } from "@betteroffice/xlsx";
export const PICTOGRAMSETS = [
  "3Arrows",
  "3ArrowsGray",
  "3Flags",
  "3TrafficLights1",
  "3TrafficLights2",
  "3Signs",
  "3Symbols",
  "3Symbols2",
  "4Arrows",
  "4ArrowsGray",
  "4RedToBlack",
  "4Rating",
  "4TrafficLights",
  "5Arrows",
  "5ArrowsGray",
  "5Rating",
  "5Quarters",
] as const;
export type Pictogramset = (typeof PICTOGRAMSETS)[number];
export function pictogramset(naam: string): naam is Pictogramset {
  return (PICTOGRAMSETS as readonly string[]).includes(naam);
}

export interface Pictogram {
  set: Pictogramset;
  index: number;
}

/** Font-independent functional symbols, using the same vector commands for print. */
export function tekenPictogram(
  icoon: Pictogram,
  r: Rect,
  clip: Rect,
): DrawCmd[] {
  const count = Number(icoon.set[0]),
    i = icoon.index;
  if (
    !pictogramset(icoon.set) ||
    !Number.isInteger(i) ||
    i < 0 ||
    i >= count ||
    r.w <= 0 ||
    r.h <= 0
  )
    return [];
  const uit: DrawCmd[] = [],
    unit = r.w / 16;
  const punt = (x: number, y: number) => ({
    x: r.x + x * r.w,
    y: r.y + y * r.h,
  });
  const pad = (
    commands: GeometryPathCommand[],
    fill: string,
    stroke?: string,
    width = 0.8,
  ) =>
    uit.push({
      op: "path",
      commands,
      fill,
      ...(stroke ? { stroke: { color: stroke, width: width * unit } } : {}),
      clip,
    });
  const poly = (punten: number[][], fill: string, stroke?: string) =>
    pad(
      punten
        .map(
          ([x, y], n) =>
            ({
              type: n ? "line" : "move",
              ...punt(x, y),
            }) as GeometryPathCommand,
        )
        .concat({ type: "close" }),
      fill,
      stroke,
    );
  const lijn = (punten: number[][], color: string, width = 1.8) =>
    pad(
      punten.map(
        ([x, y], n) =>
          ({ type: n ? "line" : "move", ...punt(x, y) }) as GeometryPathCommand,
      ),
      "transparent",
      color,
      width,
    );
  const rect = (x: number, y: number, w: number, h: number, color: string) =>
    poly(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      color,
    );
  const cirkel = (
    fill: string,
    stroke?: string,
    cx = 0.5,
    cy = 0.5,
    rad = 0.43,
  ) => {
    const k = rad * 0.5522847498307936,
      p = (x: number, y: number) => punt(x, y);
    const cubic = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x: number,
      y: number,
    ): GeometryPathCommand => ({
      type: "cubic",
      cp1x: p(x1, y1).x,
      cp1y: p(x1, y1).y,
      cp2x: p(x2, y2).x,
      cp2y: p(x2, y2).y,
      ...p(x, y),
    });
    pad(
      [
        { type: "move", ...p(cx, cy - rad) },
        cubic(cx + k, cy - rad, cx + rad, cy - k, cx + rad, cy),
        cubic(cx + rad, cy + k, cx + k, cy + rad, cx, cy + rad),
        cubic(cx - k, cy + rad, cx - rad, cy + k, cx - rad, cy),
        cubic(cx - rad, cy - k, cx - k, cy - rad, cx, cy - rad),
        { type: "close" },
      ],
      fill,
      stroke,
    );
  };
  const rood = "#d22f27",
    geel = "#c9a000",
    groen = "#27913a";
  const kleur =
    count === 3
      ? [rood, geel, groen][i]
      : count === 4
        ? [rood, geel, geel, groen][i]
        : [rood, geel, geel, geel, groen][i];
  if (icoon.set.includes("Arrows")) {
    const hoek =
      ((count === 3
        ? [180, 90, 0]
        : count === 4
          ? [180, 135, 45, 0]
          : [180, 135, 90, 45, 0])[i] *
        Math.PI) /
      180;
    const punten = [
      [0.5, 0.04],
      [0.06, 0.45],
      [0.32, 0.45],
      [0.32, 0.95],
      [0.68, 0.95],
      [0.68, 0.45],
      [0.94, 0.45],
    ].map(([x, y]) => [
      0.5 + (x - 0.5) * Math.cos(hoek) - (y - 0.5) * Math.sin(hoek),
      0.5 + (x - 0.5) * Math.sin(hoek) + (y - 0.5) * Math.cos(hoek),
    ]);
    poly(punten, icoon.set.endsWith("Gray") ? "#b7b7b7" : kleur, "#707070");
  } else if (icoon.set === "3Flags") {
    lijn(
      [
        [0.16, 0.05],
        [0.16, 0.96],
      ],
      "#666666",
      1,
    );
    poly(
      [
        [0.2, 0.08],
        [0.92, 0.08],
        [0.76, 0.3],
        [0.92, 0.53],
        [0.2, 0.53],
      ],
      kleur,
      "#777777",
    );
  } else if (icoon.set.includes("TrafficLights")) {
    if (icoon.set === "3TrafficLights2")
      rect(0.01, 0.01, 0.98, 0.98, "#202020");
    cirkel(
      count === 4 ? ["#222222", rood, geel, groen][i] : kleur,
      "#777777",
      0.5,
      0.5,
      icoon.set === "3TrafficLights2" ? 0.35 : 0.43,
    );
  } else if (icoon.set === "3Signs") {
    if (i === 0)
      poly(
        [
          [0.5, 0.04],
          [0.96, 0.5],
          [0.5, 0.96],
          [0.04, 0.5],
        ],
        rood,
        "#777777",
      );
    else if (i === 1)
      poly(
        [
          [0.5, 0.05],
          [0.97, 0.92],
          [0.03, 0.92],
        ],
        geel,
        "#777777",
      );
    else cirkel(groen, "#777777");
  } else if (icoon.set === "3Symbols" || icoon.set === "3Symbols2") {
    const rond = icoon.set === "3Symbols",
      voor = rond ? "#ffffff" : kleur;
    if (rond) cirkel(kleur, "#777777");
    if (i === 0) {
      lijn(
        [
          [0.28, 0.28],
          [0.72, 0.72],
        ],
        voor,
      );
      lijn(
        [
          [0.72, 0.28],
          [0.28, 0.72],
        ],
        voor,
      );
    } else if (i === 1) {
      rect(0.45, 0.2, 0.1, 0.4, voor);
      cirkel(voor, undefined, 0.5, 0.77, 0.055);
    } else
      lijn(
        [
          [0.22, 0.52],
          [0.43, 0.72],
          [0.79, 0.27],
        ],
        voor,
      );
  } else if (icoon.set === "4RedToBlack") {
    cirkel(["#222222", "#bfbfbf", "#ee9999", rood][i], "#777777");
  } else if (icoon.set.endsWith("Rating")) {
    const step = 0.86 / count;
    for (let bar = 0; bar < count; bar++) {
      const height = 0.2 + (0.68 * bar) / (count - 1);
      rect(
        0.06 + bar * step,
        0.94 - height,
        step * 0.66,
        height,
        bar <= i ? "#416e91" : "#d4d4d4",
      );
    }
  } else if (icoon.set === "5Quarters") {
    cirkel(i === 4 ? "#333333" : "#ffffff", "#777777");
    if (i > 0 && i < 4) {
      const punten = [[0.5, 0.5]];
      // A bounded polygonal sector is crisp at 16 px and remains vector on paper.
      for (let n = 0; n <= i * 8; n++) {
        const hoek = -Math.PI / 2 + (n * Math.PI) / 16;
        punten.push([0.5 + 0.42 * Math.cos(hoek), 0.5 + 0.42 * Math.sin(hoek)]);
      }
      poly(punten, "#333333");
    }
  }
  return uit;
}
