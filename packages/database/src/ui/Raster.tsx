/**
 * Gegevensraster zoals een Access-gegevensblad: gevirtualiseerd (alleen de
 * zichtbare rijen plus buffer), selectie van cellen, bereiken, rijen,
 * kolommen en alles (muis, Shift, slepen, toetsenbord), kopiëren als
 * tabgescheiden tekst en HTML, plakken met typecontrole, en bewerken per cel
 * (Enter/F2, Escape, Tab). Gebruikt voor tabellen, queryresultaten en de
 * gegevensbladweergave van formulieren.
 */
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatGetal } from "../../../../src/i18n/opmaak.ts";
import type { VeldSchema, Veldsoort, Waarde } from "../werkkopie/contract.ts";
import { bewerkTekst, leesbareFout, leesInvoer, SOORTNAMEN, toonWaarde } from "./invoer.ts";
import { useDialogen } from "./Dialoog.tsx";
import { leesKlembord, schrijfKlembord, type KlembordInhoud } from "./klembord.ts";
import {
  bereikKolommen,
  bereikRijen,
  bereikVan,
  breidUit,
  celSelectie,
  inBereik,
  KOPIEER_LIMIET,
  kolomBreedte,
  leesTsv,
  maakPlakPlan,
  metKoppenStandaard,
  naarHtml,
  naarTsv,
  scrollVoorRij,
  selecteerAlles,
  selecteerKolom,
  selecteerRij,
  statistiek,
  statistiekTekst,
  zichtbareRijen,
  type Cel,
  type PlakPlan,
  type Selectie,
} from "./raster-logica.ts";

export interface RasterKolom {
  naam: string;
  soort: Veldsoort | null;
  /** Aanwezig = bewerkbaar met deze veldregels. */
  veld?: VeldSchema;
  sleutel?: boolean;
}
export interface RasterRij {
  sleutel: string | number;
  waarden: Waarde[];
}

/** Gegevensbron voor grote rasters: rijen worden per blok geladen. */
export interface RasterBron {
  totaal: number;
  /** Rij op absolute index, of undefined als die nog niet geladen is. */
  rij(i: number): RasterRij | undefined;
  /** Vraagt rijen [van, tot) te laden; de eigenaar rendert opnieuw als ze er zijn. */
  laad?(van: number, tot: number): void;
  /** Haalt waarden van rijen [van, tot) op (ook buiten de geladen blokken), voor kopiëren. */
  haal?(van: number, tot: number): Promise<Waarde[][]>;
}

/** Wat het lint met het actieve raster kan doen. */
export interface RasterActies {
  label: string;
  kopieer(metKoppen?: boolean): void;
  plak(): void;
  selecteerAlles(): void;
  kanPlakken: boolean;
}
/** Laat een raster zich aanmelden als het actieve raster (voor Kopiëren/Plakken in het lint). */
export const RasterRegister = createContext<((acties: RasterActies | null, eigenaar: object) => void) | null>(null);

const RIJKIEZER = 48;
const STANDAARD_RIJHOOGTE = 31;

export function Raster({
  label,
  kolommen,
  rijen,
  bron,
  sorteer,
  onSorteer,
  onWijzig,
  onPlak,
  kanToevoegen = false,
  actief,
  onActief,
  leeg,
  vul = false,
  focusSignaal,
  voet,
}: {
  label: string;
  kolommen: RasterKolom[];
  /** Rijen in het geheugen (queryresultaten); anders `bron`. */
  rijen?: RasterRij[];
  bron?: RasterBron;
  sorteer?: { kolom: string; aflopend: boolean } | null;
  onSorteer?: (kolom: string, aflopend?: boolean) => void;
  /** Bewaart één cel (absolute rij-index); gooit een fout als dat mislukt. */
  onWijzig?: (rij: number, kolom: number, waarde: Waarde) => Promise<void>;
  /** Voert een plakactie uit als één bewerking; gooit een fout als dat mislukt (dan is niets gewijzigd). */
  onPlak?: (plan: PlakPlan) => Promise<void>;
  /** Plakken onder de laatste rij voegt rijen toe. */
  kanToevoegen?: boolean;
  actief?: Cel;
  onActief?: (cel: Cel) => void;
  leeg?: string;
  /** Vult de hoogte van de ouder (flex) in plaats van een vaste maximale hoogte. */
  vul?: boolean;
  /** Elke nieuwe waarde zet de focus op de actieve cel (bv. na Uitvoeren). */
  focusSignaal?: number;
  /** Extra inhoud rechts in de statusregel (bv. aantal rijen). */
  voet?: ReactNode;
}) {
  const dialogen = useDialogen();
  const { t } = useTranslation("database");
  const register = useContext(RasterRegister);
  /** “3 rijen × 2 kolommen” in de interfacetaal. */
  const omvangTekst = (rijen: number, kols: number) =>
    `${t("grid.count.rows", { count: rijen, formatted: formatGetal(rijen) })} × ${t("grid.count.columns", { count: kols, formatted: formatGetal(kols) })}`;
  const b: RasterBron = useMemo(() => bron ?? { totaal: rijen?.length ?? 0, rij: (i: number) => rijen?.[i] }, [bron, rijen]);
  const N = b.totaal;
  const K = kolommen.length;
  const soorten = useMemo(() => kolommen.map((k) => k.soort), [kolommen]);

  // ------------------------------------------------------------ selectie
  const [sel, setSelState] = useState<Selectie>(() => celSelectie(actief ?? { rij: 0, kolom: 0 }));
  const gemeld = useRef<Cel | null>(actief ?? null);
  const klem = useCallback((c: Cel): Cel => ({ rij: Math.max(0, Math.min(c.rij, N - 1)), kolom: Math.max(0, Math.min(c.kolom, K - 1)) }), [N, K]);
  const zetSel = (s: Selectie | ((oud: Selectie) => Selectie)) =>
    setSelState((oud) => {
      const n = typeof s === "function" ? s(oud) : s;
      const k = { ...n, cursor: klem(n.cursor), anker: klem(n.anker) };
      if (k.cursor.rij !== oud.cursor.rij || k.cursor.kolom !== oud.cursor.kolom) {
        gemeld.current = k.cursor;
        queueMicrotask(() => onActief?.(k.cursor));
      }
      return k;
    });
  // Een actieve cel die de eigenaar zelf zet (bv. na Rij toevoegen) overnemen.
  useEffect(() => {
    if (!actief || (gemeld.current && gemeld.current.rij === actief.rij && gemeld.current.kolom === actief.kolom)) return;
    gemeld.current = actief;
    setSelState(celSelectie(actief));
    zorgZichtbaar.current = true;
  }, [actief?.rij, actief?.kolom]); // eslint-disable-line react-hooks/exhaustive-deps
  const cel = sel.cursor;
  const bereik = bereikVan(sel, N, K);
  const meer = bereikRijen(bereik) * bereikKolommen(bereik) > 1;

  // ------------------------------------------------------------ bewerken
  const [bewerk, setBewerk] = useState<{ rij: number; kolom: number; tekst: string; selecteer?: boolean } | null>(null);
  const [fout, setFout] = useState<{ rij: number; kolom: number; tekst: string } | null>(null);
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const tabel = useRef<HTMLTableElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const focusNaRender = useRef(false);
  const zorgZichtbaar = useRef(false);
  const slepen = useRef<null | "cellen" | "rijen" | "kolommen">(null);
  const plakWacht = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kopieerWacht = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const kanBewerken = (k: number) => !!onWijzig && !!kolommen[k]?.veld;
  const waarde = (r: number, c: number) => b.rij(r)?.waarden[c];

  // ------------------------------------------------------------ virtualisatie
  const [scroll, setScroll] = useState({ top: 0, hoogte: 400 });
  const [maat, setMaat] = useState({ rij: STANDAARD_RIJHOOGTE, kop: 40 });
  const { van, tot } = zichtbareRijen({ scrollTop: scroll.top, hoogte: scroll.hoogte, rijhoogte: maat.rij, totaal: N, kop: maat.kop });
  useEffect(() => {
    b.laad?.(van, tot);
  }, [b, van, tot]);
  // Bij een grote selectie (kolom, alles) de rijen alvast laden, zodat Ctrl+C direct (synchroon) kan kopiëren.
  useEffect(() => {
    if (!b.laad || bereikRijen(bereik) <= tot - van) return;
    const max = Math.max(1, Math.floor(KOPIEER_LIMIET / Math.max(1, bereikKolommen(bereik))));
    b.laad(bereik.r0, Math.min(bereik.r1 + 1, bereik.r0 + max));
  }, [b, bereik.r0, bereik.r1, bereik.c0, bereik.c1]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const w = wrap.current;
    if (!w) return;
    const meet = () => setScroll((s) => (s.hoogte === w.clientHeight ? s : { ...s, hoogte: w.clientHeight }));
    meet();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(meet) : null;
    ro?.observe(w);
    return () => ro?.disconnect();
  }, [N > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const t = tabel.current;
    if (!t) return;
    const rij = t.querySelector<HTMLElement>("tbody tr[data-rij]");
    const kop = t.querySelector<HTMLElement>("thead tr");
    const nieuw = { rij: rij ? rij.getBoundingClientRect().height : maat.rij, kop: kop ? kop.getBoundingClientRect().height : maat.kop };
    if (Math.abs(nieuw.rij - maat.rij) > 0.5 || Math.abs(nieuw.kop - maat.kop) > 0.5) setMaat(nieuw);
  });

  // Kolombreedtes eenmalig uit kop en de eerste geladen rijen (stabiel tijdens scrollen).
  const kolomSleutel = kolommen.map((k) => `${k.naam}:${k.soort}`).join("|");
  const breedtes = useRef<{ sleutel: string; waarden: number[]; metData: boolean } | null>(null);
  const eerste = b.rij(0);
  if (!breedtes.current || breedtes.current.sleutel !== kolomSleutel || (!breedtes.current.metData && eerste)) {
    const monster: RasterRij[] = [];
    for (let i = 0; i < Math.min(N, 60); i++) {
      const r = b.rij(i);
      if (r) monster.push(r);
    }
    breedtes.current = {
      sleutel: kolomSleutel,
      metData: !!eerste,
      waarden: kolommen.map((k, c) => kolomBreedte(k.naam, k.soort, monster.map((r) => r.waarden[c])) + (onSorteer ? 18 : 0)),
    };
  }
  const totaleBreedte = RIJKIEZER + breedtes.current.waarden.reduce((s, w) => s + w, 0);

  function toonCursor(c: Cel) {
    const w = wrap.current;
    if (!w) return;
    const doel = scrollVoorRij({ rij: c.rij, scrollTop: w.scrollTop, hoogte: w.clientHeight, rijhoogte: maat.rij, kop: maat.kop });
    if (doel !== null) {
      w.scrollTop = doel;
      setScroll({ top: doel, hoogte: w.clientHeight });
    }
  }

  // Focus (en horizontaal in beeld) na een render.
  useEffect(() => {
    if (zorgZichtbaar.current) {
      zorgZichtbaar.current = false;
      toonCursor(cel);
      focusNaRender.current = true;
    }
    if (!focusNaRender.current) return;
    const el = tabel.current?.querySelector<HTMLElement>(bewerk ? "td input[data-bewerk]" : `td[data-cel="${cel.rij}:${cel.kolom}"]`);
    if (!el) return;
    focusNaRender.current = false;
    el.focus({ preventScroll: true });
    const w = wrap.current;
    const td = el.closest("td") as HTMLElement | null;
    if (w && td) {
      const links = td.offsetLeft - RIJKIEZER;
      const rechts = td.offsetLeft + td.offsetWidth;
      if (links < w.scrollLeft) w.scrollLeft = Math.max(0, links);
      else if (rechts > w.scrollLeft + w.clientWidth) w.scrollLeft = rechts - w.clientWidth;
    }
    if (el instanceof HTMLInputElement && bewerk) {
      if (bewerk.selecteer) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    }
  });
  useEffect(() => {
    if (focusSignaal === undefined || !N) return;
    zorgZichtbaar.current = true;
    focusNaRender.current = true;
    setScroll((s) => ({ ...s }));
  }, [focusSignaal]); // eslint-disable-line react-hooks/exhaustive-deps

  function gaNaar(c: Cel, uitbreiden = false) {
    const doel = klem(c);
    zetSel((s) => (uitbreiden ? breidUit(s, doel) : celSelectie(doel)));
    toonCursor(doel);
    focusNaRender.current = true;
  }

  // ------------------------------------------------------------ bewerken
  function begin(rij: number, kolom: number, tekst?: string) {
    if (!kanBewerken(kolom) || bezig || !b.rij(rij)) return;
    const kol = kolommen[kolom];
    if (kol.soort === "jaNee") {
      void bewaar(rij, kolom, waarde(rij, kolom) ? "Nee" : "Ja");
      return;
    }
    focusNaRender.current = true;
    setBewerk({ rij, kolom, tekst: tekst ?? bewerkTekst(waarde(rij, kolom), kol.soort), selecteer: tekst === undefined });
    setFout(null);
  }

  async function bewaar(rij: number, kolom: number, tekst: string): Promise<boolean> {
    const kol = kolommen[kolom];
    if (!kol.veld || !onWijzig) return false;
    const r = leesInvoer(tekst, kol.veld);
    if (!r.ok) {
      setFout({ rij, kolom, tekst: r.fout });
      return false;
    }
    const oud = waarde(rij, kolom);
    if (oud === r.waarde || (oud == null && r.waarde == null)) return true;
    setBezig(true);
    try {
      await onWijzig(rij, kolom, r.waarde);
      setFout(null);
      return true;
    } catch (e) {
      setFout({ rij, kolom, tekst: leesbareFout(e) });
      return false;
    } finally {
      setBezig(false);
    }
  }

  async function sluitBewerken(beweging: Cel | null) {
    if (!bewerk) return;
    const ok = await bewaar(bewerk.rij, bewerk.kolom, bewerk.tekst);
    if (!ok) {
      focusNaRender.current = true;
      return;
    }
    setBewerk(null);
    focusNaRender.current = true;
    if (beweging) gaNaar(beweging);
  }

  // ------------------------------------------------------------ kopiëren en plakken
  /**
   * Kopieert de selectie. Vanuit een native copy-event (Ctrl+C, menu van de
   * browser) gaan de gegevens direct in `event.clipboardData` — dat werkt
   * zonder klembordtoestemming; anders via schrijfKlembord.
   */
  async function kopieer(metKoppen = metKoppenStandaard(sel), event?: ClipboardEvent) {
    if (!N || !K) return;
    const g = bereikVan(sel, N, K);
    const kols = bereikKolommen(g);
    let aantalRijen = bereikRijen(g);
    let afgekapt = false;
    if (aantalRijen * kols > KOPIEER_LIMIET) {
      aantalRijen = Math.max(1, Math.floor(KOPIEER_LIMIET / kols));
      afgekapt = true;
    }
    const koppen = metKoppen ? kolommen.slice(g.c0, g.c1 + 1).map((k) => k.naam) : null;
    const s = soorten.slice(g.c0, g.c1 + 1);
    const maak = (waarden: Waarde[][]): KlembordInhoud => ({ tekst: naarTsv(koppen, waarden, s), html: naarHtml(koppen, waarden, s) });
    let alles = true;
    const geladen: Waarde[][] = [];
    for (let r = g.r0; r < g.r0 + aantalRijen; r++) {
      const rij = b.rij(r);
      if (!rij) {
        alles = false;
        break;
      }
      geladen.push(rij.waarden.slice(g.c0, g.c1 + 1));
    }
    const omvang = omvangTekst(aantalRijen, kols);
    const gelukt = () =>
      setMelding(
        t(koppen ? "grid.copy.doneWithHeaders" : "grid.copy.done", { size: omvang }) +
          (afgekapt ? ` ${t("grid.copy.truncated", { max: formatGetal(KOPIEER_LIMIET), rows: formatGetal(aantalRijen) })}` : ""),
      );
    if (event?.clipboardData && alles) {
      const i = maak(geladen);
      event.preventDefault();
      event.clipboardData.setData("text/plain", i.tekst);
      event.clipboardData.setData("text/html", i.html);
      gelukt();
      return;
    }
    event?.preventDefault();
    const inhoud: KlembordInhoud | Promise<KlembordInhoud> = alles
      ? maak(geladen)
      : b.haal
        ? b.haal(g.r0, g.r0 + aantalRijen).then((w) => maak(w.map((r) => r.slice(g.c0, g.c1 + 1))))
        : maak(geladen);
    const ok = await schrijfKlembord(inhoud).catch(() => false);
    if (!ok && !alles) {
      setMelding(t("grid.copy.stillLoading"));
      return;
    }
    if (ok) gelukt();
    else setMelding(t("grid.copy.failed"));
    focusNaRender.current = true;
    setScroll((x) => ({ ...x }));
  }

  /** Plakt tabgescheiden tekst vanaf de selectie; `cellen` direct opgeven kan ook (Delete = één lege waarde over de selectie). */
  async function plak(tekst: string, cellen = leesTsv(tekst)) {
    if (!onPlak) {
      setMelding(t("grid.paste.readOnly"));
      return;
    }
    if (!cellen.length) return;
    const g = bereikVan(sel, N, K);
    const plan = maakPlakPlan(cellen, { rij: g.r0, kolom: g.c0 }, kolommen, N, { kanToevoegen, doel: g });
    if (plan.fouten.length) {
      await dialogen.melding(
        t("grid.paste.notDoneTitle"),
        <>
          <p>{t("grid.paste.typeErrors", { count: plan.fouten.length })}</p>
          <ul className="database-plakfouten">
            {plan.fouten.slice(0, 20).map((f, i) => (
              <li key={i}>
                {t("grid.paste.errorLine", { row: f.rij + 1, column: f.kolomnaam, error: f.tekst })}
              </li>
            ))}
          </ul>
          {plan.fouten.length > 20 && <p className="muted">{t("grid.paste.andMore", { count: plan.fouten.length - 20 })}</p>}
        </>,
      );
      focusNaRender.current = true;
      setScroll((x) => ({ ...x }));
      return;
    }
    const aantalCellen = plan.wijzigingen.length + plan.nieuweRijen.reduce((s, r) => s + Object.keys(r).length, 0);
    if (!aantalCellen) {
      setMelding(plan.waarschuwingen.join(" ") || t("grid.paste.nothing"));
      return;
    }
    if (plan.rijen > 1 || plan.nieuweRijen.length) {
      const voorbeeld = cellen.slice(0, 5);
      const ja = await dialogen.bevestig({
        titel: t("grid.paste.title"),
        tekst: (
          <>
            <p>
              {t("grid.paste.confirm", {
                action: plan.nieuweRijen.length
                  ? t("grid.paste.changeAndAdd", {
                      change: t("grid.paste.changeCells", { count: plan.wijzigingen.length, formatted: formatGetal(plan.wijzigingen.length) }),
                      add: t("grid.paste.addRows", { count: plan.nieuweRijen.length, formatted: formatGetal(plan.nieuweRijen.length) }),
                    })
                  : t("grid.paste.changeCells", { count: plan.wijzigingen.length, formatted: formatGetal(plan.wijzigingen.length) }),
                row: g.r0 + 1,
                column: kolommen[g.c0]?.naam ?? "",
              })}
            </p>
            {plan.waarschuwingen.map((w, i) => (
              <p key={i} className="melding">
                {w}
              </p>
            ))}
            <div className="table-wrap">
              <table className="database-plakvoorbeeld">
                <caption className="sr-only">{t("grid.paste.preview")}</caption>
                <tbody>
                  {voorbeeld.map((r, i) => (
                    <tr key={i}>
                      {r.slice(0, 8).map((w, j) => (
                        <td key={j}>{w}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ),
        ja: t("grid.paste.title"),
        nee: t("common:cancel"),
      });
      if (!ja) {
        focusNaRender.current = true;
        setScroll((x) => ({ ...x }));
        return;
      }
    }
    setBezig(true);
    try {
      await onPlak(plan);
      setFout(null);
      zetSel({ anker: { rij: g.r0, kolom: g.c0 }, cursor: { rij: g.r0 + plan.rijen - 1, kolom: g.c0 + Math.max(0, plan.kolommen - 1) }, modus: "cellen" });
      setMelding(
        (plan.nieuweRijen.length
          ? t("grid.paste.doneWithRows", {
              cells: t("grid.count.cells", { count: plan.wijzigingen.length, formatted: formatGetal(plan.wijzigingen.length) }),
              rows: t("grid.count.newRows", { count: plan.nieuweRijen.length, formatted: formatGetal(plan.nieuweRijen.length) }),
            })
          : t("grid.paste.done", { cells: t("grid.count.cells", { count: plan.wijzigingen.length, formatted: formatGetal(plan.wijzigingen.length) }) })) +
          (plan.waarschuwingen.length ? " " + plan.waarschuwingen.join(" ") : ""),
      );
    } catch (e) {
      setFout({ rij: g.r0, kolom: g.c0, tekst: t("grid.paste.failed", { error: leesbareFout(e) }) });
    } finally {
      setBezig(false);
      focusNaRender.current = true;
    }
  }

  async function plakVanKlembord() {
    const tekst = await leesKlembord();
    if (tekst === null) setMelding(t("grid.paste.clipboardUnavailable"));
    else await plak(tekst);
  }

  // ------------------------------------------------------------ lint
  const acties = useRef<RasterActies>(null as unknown as RasterActies);
  const recent = useRef({ kopieer, plakVanKlembord, alles: () => zetSel(selecteerAlles), onPlak, label });
  recent.current = { kopieer, plakVanKlembord, alles: () => zetSel(selecteerAlles), onPlak, label };
  if (!acties.current)
    acties.current = {
      get label() {
        return recent.current.label;
      },
      kopieer: (m) => void recent.current.kopieer(m),
      plak: () => void recent.current.plakVanKlembord(),
      selecteerAlles: () => {
        recent.current.alles();
        focusNaRender.current = true;
      },
      get kanPlakken() {
        return !!recent.current.onPlak;
      },
    };
  useEffect(() => () => register?.(null, acties.current), [register]);

  // Native copy/paste-events: de focus staat op een cel (niet bewerkbaar), dus luisteren op document.
  const klembordRef = useRef({ kopieer, plak, bewerk });
  klembordRef.current = { kopieer, plak, bewerk };
  useEffect(() => {
    const binnen = () => !!tabel.current && tabel.current.contains(document.activeElement) && !klembordRef.current.bewerk;
    const opKopie = (e: ClipboardEvent) => {
      if (!binnen()) return;
      if (kopieerWacht.current) clearTimeout(kopieerWacht.current);
      kopieerWacht.current = null;
      void klembordRef.current.kopieer(undefined, e);
    };
    const opPlak = (e: ClipboardEvent) => {
      if (!binnen()) return;
      if (plakWacht.current) clearTimeout(plakWacht.current);
      plakWacht.current = null;
      e.preventDefault();
      void klembordRef.current.plak(e.clipboardData?.getData("text/plain") ?? "");
    };
    document.addEventListener("copy", opKopie);
    document.addEventListener("paste", opPlak);
    return () => {
      document.removeEventListener("copy", opKopie);
      document.removeEventListener("paste", opPlak);
    };
  }, []);

  // ------------------------------------------------------------ toetsenbord
  function toets(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("thead, .database-rastermenu")) return;
    if (bewerk) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setBewerk(null);
        setFout(null);
        focusNaRender.current = true;
        zetSel(celSelectie(cel));
      } else if (e.key === "Enter") {
        e.preventDefault();
        void sluitBewerken({ rij: bewerk.rij + 1, kolom: bewerk.kolom });
      } else if (e.key === "Tab") {
        e.preventDefault();
        void sluitBewerken({ rij: bewerk.rij, kolom: bewerk.kolom + (e.shiftKey ? -1 : 1) });
      }
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const { rij, kolom } = cel;
    const per = Math.max(1, Math.floor((scroll.hoogte - maat.kop) / maat.rij) - 1);
    let doel: Cel | null = null;
    if (ctrl && e.key.toLowerCase() === "a") {
      e.preventDefault();
      zetSel(selecteerAlles);
      return;
    }
    if (ctrl && e.key.toLowerCase() === "c") {
      if (e.shiftKey) {
        e.preventDefault();
        void kopieer(true);
        return;
      }
      // Het native copy-event volgt (zonder klembordtoestemming); komt het niet, dan zelf kopiëren.
      if (kopieerWacht.current) clearTimeout(kopieerWacht.current);
      kopieerWacht.current = setTimeout(() => void kopieer(), 200);
      return;
    }
    if (ctrl && e.key.toLowerCase() === "v") {
      // Het paste-event volgt; lukt dat niet, dan via de Clipboard API.
      if (plakWacht.current) clearTimeout(plakWacht.current);
      plakWacht.current = setTimeout(() => void plakVanKlembord(), 200);
      return;
    }
    if (e.key === " " && ctrl) {
      e.preventDefault();
      zetSel((s) => selecteerKolom(s, kolom, false));
      return;
    }
    if (e.key === " " && e.shiftKey) {
      e.preventDefault();
      zetSel((s) => selecteerRij(s, rij, false));
      return;
    }
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const r = (e.target as HTMLElement).getBoundingClientRect();
      setMenu({ x: r.left + 8, y: r.bottom });
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        doel = ctrl ? { rij: N - 1, kolom } : { rij: rij + 1, kolom };
        break;
      case "ArrowUp":
        doel = ctrl ? { rij: 0, kolom } : { rij: rij - 1, kolom };
        break;
      case "ArrowRight":
        doel = ctrl ? { rij, kolom: K - 1 } : { rij, kolom: kolom + 1 };
        break;
      case "ArrowLeft":
        doel = ctrl ? { rij, kolom: 0 } : { rij, kolom: kolom - 1 };
        break;
      case "Home":
        doel = ctrl ? { rij: 0, kolom: 0 } : { rij, kolom: 0 };
        break;
      case "End":
        doel = ctrl ? { rij: N - 1, kolom: K - 1 } : { rij, kolom: K - 1 };
        break;
      case "PageDown":
        doel = { rij: rij + per, kolom };
        break;
      case "PageUp":
        doel = { rij: rij - per, kolom };
        break;
      case "Escape":
        if (meer) {
          e.preventDefault();
          zetSel(celSelectie(cel));
        }
        return;
      case "Enter":
      case "F2":
        e.preventDefault();
        begin(rij, kolom);
        return;
      case " ":
        if (kolommen[kolom]?.soort === "jaNee") {
          e.preventDefault();
          begin(rij, kolom);
        }
        return;
      case "Delete":
      case "Backspace":
        if (meer && onPlak) {
          e.preventDefault();
          void plak("", [[""]]);
          return;
        }
        if (kanBewerken(kolom) && kolommen[kolom].soort !== "jaNee") {
          e.preventDefault();
          begin(rij, kolom, "");
        }
        return;
      default:
        if (e.key.length === 1 && !ctrl && !e.altKey && kanBewerken(kolom) && kolommen[kolom].soort !== "jaNee") {
          e.preventDefault();
          begin(rij, kolom, e.key);
        }
        return;
    }
    e.preventDefault();
    gaNaar(doel, e.shiftKey);
  }

  // ------------------------------------------------------------ muis
  useEffect(() => {
    const stop = () => (slepen.current = null);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);
  function sleepRand(e: React.MouseEvent) {
    const w = wrap.current;
    if (!slepen.current || !w) return;
    const r = w.getBoundingClientRect();
    if (e.clientY > r.bottom - 24) w.scrollTop += maat.rij;
    else if (e.clientY < r.top + maat.kop + 12) w.scrollTop -= maat.rij;
  }

  // ------------------------------------------------------------ statusregel
  const stat = useMemo(() => {
    if (!meer) return null;
    const rijenWaarden: Waarde[][] = [];
    let ontbreekt = false;
    let cellen = 0;
    for (let r = bereik.r0; r <= bereik.r1 && cellen < 500_000; r++) {
      const rij = b.rij(r);
      if (!rij) {
        ontbreekt = true;
        continue;
      }
      rijenWaarden.push(rij.waarden.slice(bereik.c0, bereik.c1 + 1));
      cellen += bereikKolommen(bereik);
    }
    return { s: statistiek(rijenWaarden, soorten.slice(bereik.c0, bereik.c1 + 1)), ontbreekt };
  }, [meer, bereik.r0, bereik.r1, bereik.c0, bereik.c1, b, van, tot, soorten]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!N)
    return (
      <div className={`database-raster-buiten${vul ? " is-vul" : ""}`}>
        <div className="database-raster-leeg" role="status">
          {leeg ?? t("grid.noRows")}
        </div>
      </div>
    );

  const zichtbaar: number[] = [];
  for (let i = van; i < tot; i++) zichtbaar.push(i);

  return (
    <div className={`database-raster-buiten${vul ? " is-vul" : ""}`}>
      <div
        ref={wrap}
        className="table-wrap database-raster-wrap"
        onScroll={(e) => {
          const t = e.currentTarget;
          setScroll({ top: t.scrollTop, hoogte: t.clientHeight });
        }}
        onMouseMove={sleepRand}
      >
        <table
          ref={tabel}
          role="grid"
          aria-label={label}
          aria-rowcount={N + 1}
          aria-colcount={K + 1}
          aria-multiselectable
          aria-busy={bezig}
          aria-describedby={`${id}-hulp`}
          className="database-raster"
          style={{ width: totaleBreedte }}
          onKeyDown={toets}
          onFocus={() => register?.(acties.current, acties.current)}
          onContextMenu={(e) => {
            if (bewerk) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <colgroup>
            <col style={{ width: RIJKIEZER }} />
            {breedtes.current.waarden.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr aria-rowindex={1}>
              <th
                className="database-rijkiezer database-rasterhoek"
                aria-colindex={1}
                title={t("grid.selectAllTitle")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  zetSel(selecteerAlles);
                  focusNaRender.current = true;
                }}
              >
                <span className="sr-only">{t("grid.rowSelector")}</span>
              </th>
              {kolommen.map((k, c) => {
                const richting = sorteer?.kolom === k.naam ? (sorteer.aflopend ? "descending" : "ascending") : "none";
                const gekozen = (sel.modus === "kolommen" || sel.modus === "alles") && c >= bereik.c0 && c <= bereik.c1;
                return (
                  <th
                    key={c}
                    scope="col"
                    aria-colindex={c + 2}
                    aria-sort={onSorteer ? richting : undefined}
                    aria-selected={gekozen || undefined}
                    className={gekozen ? "is-gekozen" : ""}
                    title={t("grid.columnTitle", { column: k.naam })}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      slepen.current = "kolommen";
                      zetSel((s) => selecteerKolom(s, c, e.shiftKey));
                      focusNaRender.current = true;
                    }}
                    onMouseEnter={() => {
                      if (slepen.current === "kolommen") zetSel((s) => selecteerKolom(s, c, true));
                    }}
                  >
                    <span className="database-kolomkop">
                      {k.sleutel && <KeyRound size={12} aria-label={t("grid.primaryKey")} />}
                      <span>{k.naam}</span>
                      {onSorteer && (
                        <button
                          className="database-sorteerknop"
                          aria-label={t(
                            richting === "ascending" ? "grid.sortByAscending" : richting === "descending" ? "grid.sortByDescending" : "grid.sortBy",
                            { column: k.naam },
                          )}
                          title={t("grid.sortBy", { column: k.naam })}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => onSorteer(k.naam)}
                        >
                          {richting === "ascending" ? <ArrowUp size={12} aria-hidden /> : richting === "descending" ? <ArrowDown size={12} aria-hidden /> : <ArrowUpDown size={12} aria-hidden />}
                        </button>
                      )}
                    </span>
                    {k.soort && <small className="database-kolomtype">{SOORTNAMEN[k.soort]}</small>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {van > 0 && (
              <tr aria-hidden className="database-raster-vulling" style={{ height: van * maat.rij }}>
                <td colSpan={K + 1} />
              </tr>
            )}
            {zichtbaar.map((r) => {
              const rij = b.rij(r);
              const rijGekozen = (sel.modus === "rijen" || sel.modus === "alles") && r >= bereik.r0 && r <= bereik.r1;
              return (
                <tr key={rij?.sleutel ?? `laden-${r}`} data-rij={r} aria-rowindex={r + 2} aria-selected={rijGekozen || undefined} className={`${cel.rij === r ? "is-actief" : ""}${rijGekozen ? " is-gekozen" : ""}`}>
                  <th
                    scope="row"
                    role="rowheader"
                    aria-colindex={1}
                    className="database-rijkiezer"
                    title={t("grid.rowTitle")}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      slepen.current = "rijen";
                      zetSel((s) => selecteerRij(s, r, e.shiftKey));
                      focusNaRender.current = true;
                    }}
                    onMouseEnter={() => {
                      if (slepen.current === "rijen") zetSel((s) => selecteerRij(s, r, true));
                    }}
                  >
                    {r + 1}
                  </th>
                  {!rij ? (
                    <td colSpan={K} className="database-raster-laden" aria-busy="true">
                      {t("common:loading")}
                    </td>
                  ) : (
                    kolommen.map((k, c) => {
                      const isActief = cel.rij === r && cel.kolom === c;
                      const isBewerk = bewerk?.rij === r && bewerk.kolom === c;
                      const heeftFout = fout?.rij === r && fout.kolom === c;
                      const gekozen = meer && inBereik(bereik, r, c);
                      const w = rij.waarden[c];
                      return (
                        <td
                          key={c}
                          role="gridcell"
                          aria-colindex={c + 2}
                          data-cel={`${r}:${c}`}
                          tabIndex={isActief && !isBewerk ? 0 : -1}
                          aria-selected={meer ? gekozen : isActief}
                          aria-readonly={!kanBewerken(c)}
                          aria-invalid={heeftFout || undefined}
                          aria-describedby={heeftFout ? `${id}-fout` : undefined}
                          className={`${isActief ? "is-cel" : ""}${gekozen ? " is-gekozen" : ""}${heeftFout ? " is-fout" : ""}${isBewerk ? " is-bewerk" : ""} soort-${k.soort ?? "onbekend"}`}
                          onMouseDown={(e) => {
                            if (isBewerk) return;
                            if (e.button === 2) {
                              if (!inBereik(bereik, r, c)) zetSel(celSelectie({ rij: r, kolom: c }));
                              return;
                            }
                            if (e.button !== 0) return;
                            e.preventDefault();
                            slepen.current = "cellen";
                            zetSel((s) => (e.shiftKey ? breidUit(s, { rij: r, kolom: c }) : celSelectie({ rij: r, kolom: c })));
                            focusNaRender.current = true;
                          }}
                          onMouseEnter={() => {
                            if (slepen.current === "cellen") zetSel((s) => breidUit(s, { rij: r, kolom: c }));
                          }}
                          onDoubleClick={() => begin(r, c)}
                        >
                          {isBewerk ? (
                            <input
                              data-bewerk
                              aria-label={t("grid.cellLabel", { column: k.naam, row: r + 1 })}
                              value={bewerk.tekst}
                              disabled={bezig}
                              onChange={(e) => setBewerk({ ...bewerk, tekst: e.target.value })}
                              onBlur={() => {
                                if (!bezig) void sluitBewerken(null);
                              }}
                            />
                          ) : k.soort === "jaNee" ? (
                            <span className="database-janee" aria-label={toonWaarde(w, "jaNee")}>
                              <input type="checkbox" tabIndex={-1} readOnly checked={!!w} aria-hidden />
                            </span>
                          ) : (
                            toonWaarde(w, k.soort)
                          )}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
            {tot < N && (
              <tr aria-hidden className="database-raster-vulling" style={{ height: (N - tot) * maat.rij }}>
                <td colSpan={K + 1} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {fout && (
        <p id={`${id}-fout`} className="melding fout database-rasterfout" role="alert">
          {fout.tekst}
        </p>
      )}
      <div className="database-raster-status">
        <span role="status" aria-live="polite">
          {meer
            ? `${t("grid.selected", { size: omvangTekst(bereikRijen(bereik), bereikKolommen(bereik)) })}${stat ? ` · ${statistiekTekst(stat.s)}${stat.ontbreekt ? ` ${t("grid.ofLoadedRows")}` : ""}` : ""}`
            : t("grid.rowOf", { row: formatGetal(cel.rij + 1), total: formatGetal(N) })}
          {melding ? ` · ${melding}` : ""}
        </span>
        {voet}
      </div>
      <p id={`${id}-hulp`} className={vul ? "sr-only" : "muted database-rasterhulp"}>
        {t("grid.help.base")}
        {onPlak ? ` · ${t("grid.help.paste")}` : ""}
        {onWijzig ? ` · ${t("grid.help.edit")}` : ""} · {t("grid.help.more")}
      </p>
      {menu && (
        <RasterMenu
          x={menu.x}
          y={menu.y}
          onSluit={() => {
            setMenu(null);
            focusNaRender.current = true;
            setScroll((x) => ({ ...x }));
          }}
          items={[
            { naam: t("grid.menu.copy"), toets: "Ctrl+C", actie: () => void kopieer() },
            { naam: t("grid.menu.copyWithHeaders"), toets: "Ctrl+Shift+C", actie: () => void kopieer(true) },
            ...(onPlak ? [{ naam: t("grid.paste.title"), toets: "Ctrl+V", actie: () => void plakVanKlembord() }] : []),
            { naam: t("grid.menu.selectAll"), toets: "Ctrl+A", actie: () => zetSel(selecteerAlles) },
            ...(onSorteer && kolommen[cel.kolom]
              ? [
                  { naam: t("grid.menu.sortAscending", { column: kolommen[cel.kolom].naam }), actie: () => onSorteer(kolommen[cel.kolom].naam, false), scheiding: true },
                  { naam: t("grid.menu.sortDescending", { column: kolommen[cel.kolom].naam }), actie: () => onSorteer(kolommen[cel.kolom].naam, true) },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}

function RasterMenu({ x, y, items, onSluit }: { x: number; y: number; items: { naam: string; toets?: string; actie: () => void; scheiding?: boolean }[]; onSluit: () => void }) {
  const { t } = useTranslation("database");
  const lijst = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const el = lijst.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth) el.style.left = `${Math.max(4, window.innerWidth - r.width - 4)}px`;
    if (r.bottom > window.innerHeight) el.style.top = `${Math.max(4, window.innerHeight - r.height - 4)}px`;
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, []);
  useEffect(() => {
    const weg = (e: MouseEvent) => {
      if (!lijst.current?.contains(e.target as Node)) onSluit();
    };
    window.addEventListener("mousedown", weg, true);
    return () => window.removeEventListener("mousedown", weg, true);
  }, [onSluit]);
  return (
    <ul
      ref={lijst}
      role="menu"
      aria-label={t("grid.menu.label")}
      className="database-rastermenu"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        const knoppen = [...(lijst.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const i = knoppen.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          onSluit();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const n = knoppen.length;
          const doel = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
          knoppen[doel]?.focus();
        }
      }}
    >
      {items.map((it, i) => (
        <li key={i} role="none" className={it.scheiding ? "met-scheiding" : ""}>
          <button
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              onSluit();
              it.actie();
            }}
          >
            <span>{it.naam}</span>
            {it.toets && <kbd>{it.toets}</kbd>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Laat een element de resterende hoogte van het scrollvlak (article) vullen,
 * met een minimum; in een klein venster scrolt het vlak dan gewoon.
 */
export function useVulHoogte<T extends HTMLElement>(minimum = 320) {
  const ref = useRef<T>(null);
  const meet = useRef(() => {});
  meet.current = () => {
    const el = ref.current;
    const vlak = el?.closest("article") as HTMLElement | null;
    if (!el || !vlak) return;
    const stijl = getComputedStyle(vlak);
    const bovenInVlak = el.getBoundingClientRect().top - vlak.getBoundingClientRect().top + vlak.scrollTop;
    const beschikbaar = vlak.clientHeight - bovenInVlak - parseFloat(stijl.paddingBottom || "0");
    const hoogte = `${Math.max(minimum, Math.floor(beschikbaar) - 2)}px`;
    if (el.style.height !== hoogte) el.style.height = hoogte;
  };
  useLayoutEffect(() => meet.current());
  useEffect(() => {
    const vlak = ref.current?.closest("article") as HTMLElement | null;
    const opnieuw = () => meet.current();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(opnieuw) : null;
    if (vlak) ro?.observe(vlak);
    window.addEventListener("resize", opnieuw);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", opnieuw);
    };
  }, []);
  return ref;
}
