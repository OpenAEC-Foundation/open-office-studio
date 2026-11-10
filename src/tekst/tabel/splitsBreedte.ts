import { tableAnchors, type YrsSession } from "@betteroffice/docx/yrs";
import i18next from "../../i18n/config";

interface CelPlek {
  story: string;
  tableIndex: number;
  row: number;
  column: number;
}
type RasterLezer = (plek: CelPlek) => readonly number[] | null;
const lezers = new Map<string, Set<RasterLezer>>();

/** Alleen bij de splitsopdracht meten, nooit tijdens typen of selectie-updates. */
export function registreerSplitsRaster(s: YrsSession, lees: RasterLezer) {
  const versie = s.version();
  const set = lezers.get(versie) ?? new Set<RasterLezer>();
  set.add(lees);
  lezers.set(versie, set);
  return () => {
    set.delete(lees);
    if (!set.size && lezers.get(versie) === set) lezers.delete(versie);
  };
}

/** Bewaart de getekende kolomgrenzen wanneer een AutoFit-cel wordt verdeeld. */
export function splitsCelMetBehoud(
  s: YrsSession,
  plek: CelPlek,
  rijen = 1,
  kolommen = 1,
) {
  const payload = s.tablePayload(plek.story, plek.tableIndex) as {
    grid: number[];
    tblPr?: Record<string, unknown>;
    rows: {
      cells: { story: string; tcPr?: { colspan?: number; rowspan?: number } }[];
    }[];
  };
  if (kolommen <= 1 || payload.tblPr?.tableLayout === "fixed")
    return s.splitCell(plek, rijen, kolommen);
  const set = lezers.get(s.version());
  const raster = set?.size === 1 ? [...set][0](plek) : null;
  if (
    !raster ||
    raster.length !== payload.grid.length ||
    raster.some((w) => !Number.isFinite(w) || w <= 0)
  )
    throw new Error(i18next.t("writer:structure.waitForLayout"));
  // Valideer doel en rijspan vóór het raster wordt vastgelegd.
  if (
    !Number.isInteger(rijen) ||
    rijen < 1 ||
    !Number.isInteger(kolommen) ||
    kolommen < 1 ||
    !Number.isInteger(plek.row) ||
    plek.row < 0 ||
    plek.row >= payload.rows.length ||
    !Number.isInteger(plek.column) ||
    plek.column < 0 ||
    plek.column >= payload.grid.length
  )
    throw new Error(i18next.t("writer:structure.invalidSplit"));
  const anker = tableAnchors(payload).anchors.find(
    (c) =>
      c.row <= plek.row &&
      plek.row < c.row + c.rowspan &&
      c.column <= plek.column &&
      plek.column < c.column + c.colspan,
  );
  if (!anker || rijen < anker.rowspan)
    throw new Error(i18next.t("writer:structure.invalidSplit"));
  let index = 0,
    tabel = 0,
    gevonden = false;
  for (const deel of s.storySegments(plek.story)) {
    if (
      deel.kind === "embed" &&
      deel.embedKind === "table" &&
      tabel++ === plek.tableIndex
    ) {
      gevonden = true;
      break;
    }
    index += deel.kind === "text" ? deel.text.length : 1;
  }
  if (!gevonden) throw new Error(i18next.t("writer:structure.waitForLayout"));
  const modus = s.undoCaptureMode();
  s.beginUndoCapture();
  s.addUndoBoundary();
  s.setUndoCaptureMode("manual");
  try {
    // Splitsen is een expliciete breedtebewerking, net als een kolomgreep:
    // leg de huidige breedtes vast zodat AutoFit geen andere rijen herverdeelt.
    // Celvoorkeuren en inhoud van ongewijzigde cellen blijven onaangeroerd.
    s.applyRawOps(plek.story, [
      { op: "setEmbedAttr", index, key: "grid", value: [...raster] },
      {
        op: "setEmbedAttr",
        index,
        key: "tblPr",
        value: {
          ...payload.tblPr,
          tableLayout: "fixed",
          width: raster.reduce((a, b) => a + b, 0),
          widthType: "dxa",
        },
      },
    ]);
    return s.splitCell(plek, rijen, kolommen);
  } finally {
    s.addUndoBoundary();
    s.setUndoCaptureMode(modus);
  }
}

/** Uitleg bij de bestaande splitsdialoog. */
export const splitsUitleg = () => i18next.t("writer:structure.splitSizing");
