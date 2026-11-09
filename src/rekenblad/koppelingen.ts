import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import {
  alleenLezen,
  Melding,
  type Selectie,
} from "../lint/rekenblad-opdrachten";
import { bereikA1, ontleedVerwijzing } from "../lint/rekenblad-logica";
import { meldWijziging } from "../lint/editorApi";
import i18next from "../i18n/config";

export type Koppelingsoort = "web" | "bestand" | "cel";
export interface KoppelingDoel extends Selectie {
  versie: string;
}
const fout = (sleutel: string) =>
  new Melding(i18next.t(`spreadsheet:objects.${sleutel}`));

/** Een werkbladlocatie blijft intern; bestandspaden worden nooit als code uitgevoerd. */
export function koppelingsadres(
  soort: Koppelingsoort,
  invoer: string,
): { externalTarget?: string; location?: string } {
  const adres = invoer.trim();
  if (!adres || /[\u0000-\u001f\u007f]/.test(adres)) throw fout("invalidLink");
  if (soort === "cel") {
    const locatie = adres.replace(/^#/, "");
    if (!ontleedVerwijzing(locatie)) throw fout("invalidLink");
    return { location: locatie };
  }
  if (soort === "web") {
    let url: URL;
    try {
      url = new URL(adres);
    } catch {
      throw fout("invalidLink");
    }
    if (!["https:", "http:", "mailto:"].includes(url.protocol))
      throw fout("invalidLink");
    return { externalTarget: adres };
  }
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(adres) &&
    !/^file:/i.test(adres) &&
    !/^[a-z]:[\\/]/i.test(adres)
  )
    throw fout("invalidLink");
  if (/^file:/i.test(adres)) {
    try {
      return { externalTarget: new URL(adres).href };
    } catch {
      throw fout("invalidLink");
    }
  }
  const pad = adres.replace(/\\/g, "/");
  const codeerPad = (s: string) =>
    s.split("/").map(encodeURIComponent).join("/");
  if (/^[a-z]:\//i.test(pad))
    return {
      externalTarget: `file:///${pad.slice(0, 3)}${codeerPad(pad.slice(3))}`,
    };
  if (pad.startsWith("//"))
    return {
      externalTarget: `file://${pad.slice(2).split("/")[0]}/${codeerPad(pad.slice(2).split("/").slice(1).join("/"))}`,
    };
  // Relatieve Target-URI's blijven relatief aan het opgeslagen werkboek.
  return { externalTarget: codeerPad(pad).replace(/%25([a-f\d]{2})/gi, "%$1") };
}

export function leesKoppeling(api: XlsxEditorApi, doel: Selectie) {
  const r = api.handle.exportStructured({
    scope: [{ sheet: doel.blad, range: bereikA1(doel.bereik) }],
    maxCells: 1,
    includeDefinedNames: false,
    includeHiddenSheets: true,
    includeHiddenRows: true,
    includeHiddenColumns: true,
  });
  if (!r.ok) throw new Melding(r.failure.message);
  return r.content.sheets[0]?.hyperlinks[0] ?? null;
}

export async function openKoppeling(
  api: XlsxEditorApi,
  soort: Koppelingsoort,
  adres: string,
  bestand?: (adres: string) => Promise<void>,
) {
  const link = koppelingsadres(soort, adres);
  if (link.location) {
    const d = ontleedVerwijzing(link.location)!;
    const info = api.handle.sheetInfo(),
      blad =
        d.blad === null
          ? info.activeSheet
          : info.sheetNames.findIndex(
              (n) => n.toLowerCase() === d.blad!.toLowerCase(),
            );
    if (
      blad < 0 ||
      !api.selectCells(blad, {
        anchor: { row: d.bereik.top, col: d.bereik.left },
        focus: { row: d.bereik.top, col: d.bereik.left },
      })
    )
      throw fout("invalidLink");
    api.focus();
    return;
  }
  if (soort === "bestand") {
    try {
      if (!bestand) throw new Error("link-browser");
      await bestand(link.externalTarget!);
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      throw fout(
        `fileErrors.${["link-browser", "link-relative-base", "link-invalid", "link-unsupported", "link-missing", "link-file-size"].includes(code) ? code : "failed"}`,
      );
    }
  } else window.open(link.externalTarget!, "_blank", "noopener,noreferrer");
}

/** Tekst, oorspronkelijke celopmaak en hyperlink worden één native Undo-stap. */
export async function bewaarKoppeling(
  api: XlsxEditorApi,
  doel: KoppelingDoel,
  wijziging: {
    soort: Koppelingsoort;
    adres: string;
    tekst: string;
    tip: string;
  } | null,
) {
  if (alleenLezen(api)) throw fout("readOnly");
  const versie = await api.version(),
    h = api.handle;
  if (
    versie !== doel.versie ||
    h.version() !== doel.versie ||
    h.sheetInfo().sheetIds[doel.blad] !== doel.sheetId
  )
    throw fout("stale");
  if (alleenLezen(api)) throw fout("readOnly");
  const b = doel.bereik,
    range = {
      start: { row: b.top, col: b.left },
      end: { row: b.bottom, col: b.right },
    };
  if ((b.bottom - b.top + 1) * (b.right - b.left + 1) > 10000)
    throw fout("tooLarge");
  const target = {
    sheetId: doel.sheetId,
    range: { kind: "rowCol" as const, ...range },
  };
  // De metadata-opdracht is een host-API; de gewone toelatingscontrole blijft
  // gelden voor beveiligde cellen, matrixformules en samengevoegde volgcellen.
  const lezing = h.readCells({ ranges: [target] });
  if (!lezing.ok) throw new Melding(lezing.failure.message);
  const toegang = h.validateEdits({
    expectVersion: versie,
    steps: [
      {
        op: "setCellValues",
        target,
        values: lezing.ranges[0].cells.map((rij) => rij.map((c) => c.value)),
      },
    ],
  });
  if (!toegang.ok) throw new Melding(toegang.failure.message);
  const ops: unknown[] = [];
  if (!wijziging)
    ops.push({ type: "removeHyperlink", sheet: doel.blad, range });
  else {
    const adres = koppelingsadres(wijziging.soort, wijziging.adres);
    const cel = h.cell(doel.blad, b.top, b.left);
    const huidig = lezing.ranges[0].cells[0]?.[0]?.displayText ?? "";
    const tekst = wijziging.tekst || huidig || wijziging.adres;
    if (tekst !== huidig) {
      if (cel.isFormula) throw fout("formulaLabel");
      const celBereik = { start: range.start, end: range.start };
      const opmaak = h.captureFormat(
        doel.blad,
        bereikA1({ top: b.top, left: b.left, bottom: b.top, right: b.left }),
      );
      ops.push(
        {
          type: "setCell",
          sheet: doel.blad,
          at: range.start,
          cell: { value: { kind: "text", value: tekst } },
        },
        {
          type: "applyRangeFormat",
          sheet: doel.blad,
          range: celBereik,
          format: opmaak,
        },
      );
    }
    ops.push({
      type: "setHyperlink",
      sheet: doel.blad,
      hyperlink: {
        range,
        external_target: adres.externalTarget ?? null,
        location: adres.location ?? null,
        display: tekst,
        tooltip: wijziging.tip || null,
      },
    });
  }
  const r = h.applyOps(ops);
  if (r.applied) meldWijziging(h);
  return r;
}
