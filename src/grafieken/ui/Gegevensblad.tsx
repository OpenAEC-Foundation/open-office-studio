import { useRef } from "react";
import { Columns3, Rows3, Trash2, ClipboardPaste, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { leesTabgescheiden } from "../model.ts";
import { LIMIETEN } from "../fouten.ts";

/**
 * Klein rekenblad om categorieën (eerste kolom), reeksnamen (eerste rij) en
 * waarden in te voeren. Plakken van tabgescheiden tekst vult vanaf de cel.
 */
export function Gegevensblad({
  raster,
  wijzig,
  uitTabel,
  meld,
}: {
  raster: string[][];
  wijzig: (raster: string[][]) => void;
  /** Haalt gegevens uit de tabel waar de cursor staat; ontbreekt als dat niet kan. */
  uitTabel?: () => void;
  meld: (tekst: string) => void;
}) {
  const { t } = useTranslation("charts");
  /** Standaardnaam van een nieuwe reeks (kolom 1, 2, …). */
  const kolomNaam = (i: number) => t("defaults.seriesName", { n: i });
  const vak = useRef<HTMLTableElement>(null);
  const rijen = raster.length;
  const kolommen = raster[0]?.length ?? 0;
  const zet = (r: number, k: number, w: string) =>
    wijzig(raster.map((rij, i) => (i === r ? rij.map((c, j) => (j === k ? w : c)) : rij)));
  function plak(r: number, k: number, tekst: string) {
    let blok: string[][];
    try {
      blok = leesTabgescheiden(tekst);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e));
      return;
    }
    const hoogte = Math.max(rijen, r + blok.length);
    const breedte = Math.max(kolommen, k + Math.max(...blok.map((b) => b.length)));
    if (hoogte * breedte > LIMIETEN.cellen) {
      meld(t("errors.pasteTooLarge"));
      return;
    }
    const nieuw = Array.from({ length: hoogte }, (_, i) =>
      Array.from({ length: breedte }, (_, j) => raster[i]?.[j] ?? ""),
    );
    blok.forEach((rij, i) => rij.forEach((c, j) => (nieuw[r + i][k + j] = c.trim())));
    wijzig(nieuw);
  }
  function plakKlembord() {
    if (!navigator.clipboard?.readText) {
      meld(t("dataSheet.pasteNotAllowed"));
      return;
    }
    navigator.clipboard
      .readText()
      .then((klembord) => klembord && plak(0, 0, klembord))
      .catch(() => meld(t("dataSheet.pasteNotAllowed")));
  }
  const focus = (r: number, k: number) =>
    requestAnimationFrame(() =>
      vak.current?.querySelector<HTMLInputElement>(`input[data-cel="${r}:${k}"]`)?.focus(),
    );
  return (
    <div className="grafiek-gegevensblad">
      <div className="grafiek-gegevensblad-knoppen">
        <button type="button" onClick={() => wijzig([...raster, Array(kolommen).fill("")])} disabled={rijen >= LIMIETEN.categorieen + 1}>
          <Rows3 size={14} /> {t("dataSheet.row")}
        </button>
        <button type="button" onClick={() => wijzig(raster.map((r, i) => [...r, i === 0 ? kolomNaam(kolommen) : ""]))} disabled={kolommen > LIMIETEN.reeksen}>
          <Columns3 size={14} /> {t("dataSheet.series")}
        </button>
        <button type="button" onClick={() => rijen > 2 && wijzig(raster.slice(0, -1))} disabled={rijen <= 2} title={t("dataSheet.removeLastRow")}>
          <Trash2 size={14} /> {t("dataSheet.row")}
        </button>
        <button type="button" onClick={() => kolommen > 2 && wijzig(raster.map((r) => r.slice(0, -1)))} disabled={kolommen <= 2} title={t("dataSheet.removeLastSeries")}>
          <Trash2 size={14} /> {t("dataSheet.series")}
        </button>
        <button type="button" onClick={plakKlembord} title={t("dataSheet.pasteTitle")}>
          <ClipboardPaste size={14} /> {t("dataSheet.paste")}
        </button>
        {uitTabel && (
          <button type="button" onClick={uitTabel} title={t("dataSheet.fromTableTitle")}>
            <Table2 size={14} /> {t("dataSheet.fromTable")}
          </button>
        )}
      </div>
      <div className="grafiek-gegevensblad-raster">
        <table ref={vak}>
          <tbody>
            {raster.map((rij, r) => (
              <tr key={r}>
                {rij.map((cel, k) => (
                  <td key={k} className={r === 0 || k === 0 ? "grafiek-kopcel" : undefined}>
                    <input
                      data-cel={`${r}:${k}`}
                      value={cel}
                      aria-label={
                        r === 0 && k === 0
                          ? t("dataSheet.corner")
                          : r === 0
                            ? t("dataSheet.seriesNameLabel", { n: k })
                            : k === 0
                              ? t("dataSheet.categoryLabel", { n: r })
                              : t("dataSheet.valueLabel", { row: r, series: k })
                      }
                      placeholder={r === 0 && k > 0 ? kolomNaam(k) : ""}
                      inputMode={r > 0 && k > 0 ? "decimal" : undefined}
                      onChange={(e) => zet(r, k, e.target.value)}
                      onPaste={(e) => {
                        const geplakt = e.clipboardData.getData("text/plain");
                        if (geplakt.includes("\t") || geplakt.includes("\n")) {
                          e.preventDefault();
                          plak(r, k, geplakt);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (r + 1 >= rijen) wijzig([...raster, Array(kolommen).fill("")]);
                          focus(r + 1, k);
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
