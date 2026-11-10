/** Metadata voor groepsknoppen, zonder een extra teken- of bewaarronde bij typen. */
import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { Herladen } from "../lint/editorApi";
import { alleenLezen, leesSelectie } from "../lint/rekenblad-opdrachten";
import { kolomLetters } from "../lint/rekenblad-logica";
import { leesGroepen, wijzigGroep, type OutlineGroep } from "./groepen";
import i18next from "../i18n/config";

interface GroepenCache {
  bytes: Uint8Array;
  vies: boolean;
  bladen: Map<number, OutlineGroep[]>;
}
const boeken = new WeakMap<WorkbookHandle, GroepenCache>();
export function bereidGroepen(h: WorkbookHandle, bytes: Uint8Array) {
  if (boeken.has(h)) return;
  const c: GroepenCache = { bytes, vies: false, bladen: new Map() };
  boeken.set(h, c);
  const ops = h.applyOps.bind(h),
    profiel = h.applyOpsProfiled.bind(h),
    undo = h.undo.bind(h),
    redo = h.redo.bind(h),
    update = h.applyUpdate.bind(h);
  h.applyOps = (lijst) => {
    if (lijst.length) c.vies = true;
    return ops(lijst);
  };
  h.applyOpsProfiled = (lijst) => {
    if (lijst.length) c.vies = true;
    return profiel(lijst);
  };
  h.undo = () => {
    c.vies = true;
    return undo();
  };
  h.redo = () => {
    c.vies = true;
    return redo();
  };
  h.applyUpdate = (bytes) => {
    c.vies = true;
    return update(bytes);
  };
}
export function bladGroepen(h: WorkbookHandle, blad: number): OutlineGroep[] {
  let c = boeken.get(h);
  if (!c) {
    bereidGroepen(h, h.save());
    c = boeken.get(h)!;
  }
  if (c.vies) {
    c.bytes = h.save();
    c.bladen.clear();
    c.vies = false;
  }
  let groepen = c.bladen.get(blad);
  if (!groepen) {
    groepen = leesGroepen(c.bytes, blad);
    c.bladen.set(blad, groepen);
  }
  return groepen;
}
export function groepsBereik(g: OutlineGroep): string {
  return g.as === "rij"
    ? `${g.van + 1}:${g.tot + 1}`
    : `${kolomLetters(g.van)}:${kolomLetters(g.tot)}`;
}
export function verborgenDoorOuder(g: OutlineGroep, groepen: OutlineGroep[]) {
  return groepen.some(
    (o) =>
      o.as === g.as &&
      o.niveau < g.niveau &&
      o.van <= g.van &&
      o.tot >= g.tot &&
      o.marker,
  );
}

/** Eén expliciet bevestigde pakketbewerking, met bescherming tegen verouderde UI. */
export async function schakelGroep(
  api: XlsxEditorApi,
  herlaad: Herladen | undefined | null,
  blad: number,
  g: OutlineGroep,
  versie: string,
) {
  const t = (key: string) => i18next.t(`spreadsheet:${key}`);
  if (!herlaad || alleenLezen(api)) throw Error(t("outline.readOnly"));
  if (api.handle.version() !== versie)
    throw Error(i18next.t("ribbon:spreadsheet.messages.staleVersion"));
  const selectie = leesSelectie(api);
  const bytes = await herlaad.bytes();
  if (
    alleenLezen(api) ||
    api.handle.version() !== versie ||
    api.handle.sheetInfo().activeSheet !== blad
  )
    throw Error(i18next.t("ribbon:spreadsheet.messages.staleVersion"));
  const nieuw = wijzigGroep(
    bytes,
    blad,
    g.as,
    g.van,
    g.tot,
    g.ingeklapt ? "uitklappen" : "inklappen",
  );
  const cel = g.ingeklapt
    ? selectie.focus
    : { ...selectie.focus, [g.as === "rij" ? "row" : "col"]: g.samenvatting };
  herlaad.vervang(nieuw, { blad, cel });
}
