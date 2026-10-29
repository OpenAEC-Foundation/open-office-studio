/**
 * Gegevensweergave van een tabel in de werkkopie: gevirtualiseerd raster
 * waarvan blokken rijen op verzoek uit de werkkopie worden geladen,
 * sorteren, zoeken, cellen bewerken, plakken, rijen toevoegen en verwijderen.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, Download, RefreshCw } from "lucide-react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { formatGetal } from "../../../../src/i18n/opmaak.ts";
import type { Rij, TabelSchema, Waarde, Werkkopie } from "../werkkopie/contract.ts";
import { bewerkbaar, leesbareFout, leesInvoer, SOORTNAMEN } from "./invoer.ts";
import { Raster, useVulHoogte, type RasterBron, type RasterKolom } from "./Raster.tsx";
import type { PlakPlan } from "./raster-logica.ts";
import { useDialogen } from "./Dialoog.tsx";

/** Rijen per blok dat uit de werkkopie wordt geladen. */
export const PAGINA = 200;
/** Rijen per verzoek bij kopiëren van alles. */
const HAAL_BLOK = 2_000;

/**
 * Bron voor het raster: laadt blokken van PAGINA rijen op verzoek (met
 * dezelfde zoekterm en sortering) en houdt ze vast tot er iets verandert.
 */
function useTabelBron(werkkopie: Werkkopie, schema: TabelSchema, zoek: string, sorteer: { kolom: string; aflopend: boolean } | null) {
  const [versie, setVersie] = useState(0);
  const [totaal, setTotaal] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const cache = useRef(new Map<number, Rij[]>());
  const bezig = useRef(new Set<number>());
  const generatie = useRef(0);
  const verzoek = useMemo(
    () => ({ zoek: zoek || undefined, sorteer: sorteer ? { veld: sorteer.kolom, aflopend: sorteer.aflopend } : undefined }),
    [zoek, sorteer],
  );

  const laadBlok = useCallback(
    async (blok: number) => {
      if (cache.current.has(blok) || bezig.current.has(blok)) return;
      const gen = generatie.current;
      bezig.current.add(blok);
      try {
        const r = await werkkopie.rijen(schema.naam, { ...verzoek, start: blok * PAGINA, aantal: PAGINA });
        if (gen !== generatie.current) return;
        cache.current.set(blok, r.rijen);
        setTotaal(r.totaal);
        setFout("");
        setVersie((v) => v + 1);
      } catch (e) {
        if (gen === generatie.current) setFout(i18next.t("database:tableView.rowsReadFailed", { error: leesbareFout(e) }));
      } finally {
        if (gen === generatie.current) bezig.current.delete(blok);
      }
    },
    [werkkopie, schema.naam, verzoek],
  );

  const herlaad = useCallback(() => {
    generatie.current++;
    cache.current = new Map();
    bezig.current = new Set();
    void laadBlok(0);
  }, [laadBlok]);

  useEffect(() => {
    setTotaal(null);
    herlaad();
  }, [herlaad]);

  const veldnamen = schema.velden.map((v) => v.naam);
  const sleutel = veldnamen.join("|");
  const rijVan = useCallback((i: number) => cache.current.get(Math.floor(i / PAGINA))?.[i % PAGINA], []);
  const bron: RasterBron = useMemo(
    () => ({
      totaal: totaal ?? 0,
      rij: (i: number) => {
        const r = rijVan(i);
        return r ? { sleutel: r.rowid, waarden: veldnamen.map((v) => r.waarden[v] ?? null) } : undefined;
      },
      laad: (van: number, tot: number) => {
        for (let blok = Math.floor(van / PAGINA); blok <= Math.floor(Math.max(van, tot - 1) / PAGINA); blok++) void laadBlok(blok);
      },
      haal: async (van: number, tot: number) => {
        const uit: Waarde[][] = [];
        for (let s = van; s < tot; s += HAAL_BLOK) {
          const r = await werkkopie.rijen(schema.naam, { ...verzoek, start: s, aantal: Math.min(HAAL_BLOK, tot - s) });
          for (const rij of r.rijen) uit.push(veldnamen.map((v) => rij.waarden[v] ?? null));
          if (r.rijen.length < Math.min(HAAL_BLOK, tot - s)) break;
        }
        return uit;
      },
    }),
    // versie: nieuwe identiteit als er blokken bij zijn, zodat het raster opnieuw rendert.
    [totaal, versie, sleutel, laadBlok, werkkopie, schema.naam, verzoek, rijVan], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Rowids van rijen [van, tot) in de huidige volgorde (voor plakken buiten de geladen blokken). */
  const rowids = useCallback(
    async (van: number, tot: number) => {
      const uit: number[] = [];
      for (let i = van; i < tot; i++) {
        const r = rijVan(i);
        if (r) uit.push(r.rowid);
        else {
          const rest = await werkkopie.rijen(schema.naam, { ...verzoek, start: i, aantal: tot - i });
          uit.push(...rest.rijen.map((x) => x.rowid));
          break;
        }
      }
      return uit;
    },
    [werkkopie, schema.naam, verzoek, rijVan],
  );

  const vervang = useCallback((i: number, rij: Rij) => {
    const blok = cache.current.get(Math.floor(i / PAGINA));
    if (!blok) return;
    blok[i % PAGINA] = rij;
    setVersie((v) => v + 1);
  }, []);

  return { bron, totaal, fout, herlaad, rijVan, rowids, vervang };
}

export function TabelWeergave({
  werkkopie,
  schema,
  onGewijzigd,
  onExporteer,
}: {
  werkkopie: Werkkopie;
  schema: TabelSchema;
  onGewijzigd: () => void;
  onExporteer: () => void;
}) {
  const dialogen = useDialogen();
  const { t } = useTranslation("database");
  const [zoek, setZoek] = useState("");
  const [zoekterm, setZoekterm] = useState("");
  const [sorteer, setSorteer] = useState<{ kolom: string; aflopend: boolean } | null>(null);
  const [actieFout, setActieFout] = useState("");
  const [cel, setCel] = useState({ rij: 0, kolom: 0 });
  const [nieuw, setNieuw] = useState<Record<string, string> | null>(null);
  const [nieuwFout, setNieuwFout] = useState("");
  const id = useId();
  const vlak = useVulHoogte<HTMLDivElement>(360);
  const { bron, totaal, fout: laadFout, herlaad, rijVan, rowids, vervang } = useTabelBron(werkkopie, schema, zoekterm, sorteer);
  const fout = actieFout || laadFout;

  useEffect(() => {
    const t = setTimeout(() => setZoekterm(zoek.trim()), 300);
    return () => clearTimeout(t);
  }, [zoek]);

  const kolommen: RasterKolom[] = schema.velden.map((v) => ({
    naam: v.naam,
    soort: v.soort,
    veld: bewerkbaar(v.soort) ? v : undefined,
    sleutel: v.primair,
  }));

  async function wijzig(rij: number, kolom: number, waarde: Waarde) {
    const r = rijVan(rij);
    if (!r) return;
    const veld = schema.velden[kolom].naam;
    await werkkopie.wijzig(schema.naam, r.rowid, { [veld]: waarde });
    const nieuw = await werkkopie.rij(schema.naam, r.rowid);
    if (nieuw) vervang(rij, nieuw);
    onGewijzigd();
  }

  /** Plakken als één bewerking: alles in een transactie, bij een fout niets. */
  async function plak(plan: PlakPlan) {
    const rijen = [...new Set(plan.wijzigingen.map((w) => w.rij))].sort((a, b) => a - b);
    const ids = rijen.length ? await rowids(rijen[0], rijen[rijen.length - 1] + 1) : [];
    const perRij = new Map<number, Record<string, Waarde>>();
    for (const w of plan.wijzigingen) {
      const rowid = ids[w.rij - rijen[0]];
      if (rowid === undefined) throw new Error(i18next.t("database:tableView.rowGone", { row: w.rij + 1 }));
      const veld = kolommen[w.kolom].veld!.naam;
      perRij.set(rowid, { ...(perRij.get(rowid) ?? {}), [veld]: w.waarde });
    }
    await werkkopie.begin();
    try {
      for (const [rowid, waarden] of perRij) await werkkopie.wijzig(schema.naam, rowid, waarden);
      for (const [i, waarden] of plan.nieuweRijen.entries())
        try {
          await werkkopie.voegToe(schema.naam, waarden);
        } catch (e) {
          throw new Error(i18next.t("database:tableView.newRowError", { row: i + 1, error: leesbareFout(e) }));
        }
      await werkkopie.bevestig();
    } catch (e) {
      await werkkopie.terugdraaien().catch(() => undefined);
      throw e;
    } finally {
      herlaad();
      onGewijzigd();
    }
  }

  async function verwijderActief() {
    const r = rijVan(cel.rij);
    if (!r) return;
    const omschrijving = schema.velden
      .slice(0, 3)
      .map((v) => `${v.naam}: ${String(r.waarden[v.naam] ?? "")}`)
      .join(", ");
    const ja = await dialogen.bevestig({
      titel: t("tableView.deleteRow.title"),
      tekst: (
        <>
          <p>{t("tableView.deleteRow.text", { table: schema.naam })}</p>
          <p className="muted">{omschrijving}</p>
          <p>{t("tableView.deleteRow.workingCopy")}</p>
        </>
      ),
      ja: t("common:delete"),
      gevaarlijk: true,
    });
    if (!ja) return;
    try {
      await werkkopie.verwijder(schema.naam, r.rowid);
      setActieFout("");
      onGewijzigd();
      if (cel.rij > 0 && cel.rij >= (totaal ?? 1) - 1) setCel({ rij: cel.rij - 1, kolom: cel.kolom });
      herlaad();
    } catch (e) {
      setActieFout(t("tableView.deleteFailed", { error: leesbareFout(e) }));
    }
  }

  async function voegToe() {
    if (!nieuw) return;
    const waarden: Record<string, Waarde> = {};
    for (const v of schema.velden) {
      if (!bewerkbaar(v.soort)) continue;
      const tekst = nieuw[v.naam] ?? "";
      if (!tekst.trim() && v.soort !== "jaNee" && !v.verplicht) continue;
      const r = leesInvoer(v.soort === "jaNee" ? tekst || "Nee" : tekst, v);
      if (!r.ok) return setNieuwFout(r.fout);
      waarden[v.naam] = r.waarde;
    }
    try {
      await werkkopie.voegToe(schema.naam, waarden);
      setNieuw(null);
      setNieuwFout("");
      onGewijzigd();
      setSorteer(null);
      setZoek("");
      setZoekterm("");
      const t = (await werkkopie.rijen(schema.naam, { aantal: 0 })).totaal;
      herlaad();
      // Naar de nieuwe (laatste) rij.
      setCel({ rij: Math.max(0, t - 1), kolom: cel.kolom });
    } catch (e) {
      setNieuwFout(leesbareFout(e));
    }
  }

  return (
    <div ref={vlak} className="database-tabelweergave">
      <div className="database-werkbalk" role="toolbar" aria-label={t("tableView.toolbar", { table: schema.naam })}>
        <label className="zoek">
          <Search size={16} aria-hidden />
          <input
            aria-label={t("tableView.searchLabel")}
            placeholder={t("tableView.searchPlaceholder")}
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
        </label>
        <button onClick={() => setNieuw(nieuw ? null : {})} aria-expanded={!!nieuw}>
          <Plus size={16} /> {t("tableView.addRow")}
        </button>
        <button onClick={() => void verwijderActief()} disabled={!rijVan(cel.rij)}>
          <Trash2 size={16} /> {t("tableView.deleteRow.title")}
        </button>
        <button onClick={() => herlaad()}>
          <RefreshCw size={16} /> {t("tableView.refresh")}
        </button>
        <button onClick={onExporteer}>
          <Download size={16} /> CSV
        </button>
      </div>
      {nieuw && (
        <form
          className="database-nieuwe-rij"
          aria-label={t("tableView.newRow")}
          onSubmit={(e) => {
            e.preventDefault();
            void voegToe();
          }}
        >
          <div className="database-nieuwe-rij-velden">
            {schema.velden.map((v, i) => (
              <label key={v.naam} className="database-veld" htmlFor={`${id}-${i}`}>
                <span>
                  {v.naam}
                  {v.verplicht && !bewerkbaar(v.soort) ? "" : v.verplicht ? " *" : ""}
                  <small>{SOORTNAMEN[v.soort]}</small>
                </span>
                {v.soort === "jaNee" ? (
                  <input
                    id={`${id}-${i}`}
                    type="checkbox"
                    checked={nieuw[v.naam] === "Ja"}
                    onChange={(e) => setNieuw({ ...nieuw, [v.naam]: e.target.checked ? "Ja" : "Nee" })}
                  />
                ) : (
                  <input
                    id={`${id}-${i}`}
                    disabled={!bewerkbaar(v.soort)}
                    placeholder={v.soort === "autonummer" ? t("tableView.automatic") : v.soort === "datum" ? t("tableView.datePlaceholder") : ""}
                    value={nieuw[v.naam] ?? ""}
                    onChange={(e) => setNieuw({ ...nieuw, [v.naam]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          {nieuwFout && (
            <p className="melding fout" role="alert">
              {nieuwFout}
            </p>
          )}
          <div className="database-knoppen">
            <button type="submit" className="primary">
              {t("tableView.saveRow")}
            </button>
            <button type="button" onClick={() => setNieuw(null)}>
              {t("common:cancel")}
            </button>
          </div>
        </form>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {totaal === null ? (
        <p role="status">{t("tableView.loadingRows")}</p>
      ) : (
        <Raster
          label={t("tableView.gridLabel", { table: schema.naam })}
          kolommen={kolommen}
          bron={bron}
          vul
          sorteer={sorteer}
          onSorteer={(kolom, aflopend) =>
            setSorteer((s) =>
              aflopend !== undefined ? { kolom, aflopend } : s?.kolom === kolom ? (s.aflopend ? null : { kolom, aflopend: true }) : { kolom, aflopend: false },
            )
          }
          onWijzig={wijzig}
          onPlak={plak}
          kanToevoegen={!zoekterm}
          actief={cel}
          onActief={setCel}
          leeg={zoekterm ? t("tableView.noMatches", { term: zoekterm }) : t("tableView.empty")}
          voet={
            <span className="muted">
              {t(zoekterm ? "tableView.rowsFiltered" : "tableView.rows", { count: totaal, formatted: formatGetal(totaal) })}
            </span>
          }
        />
      )}
    </div>
  );
}
