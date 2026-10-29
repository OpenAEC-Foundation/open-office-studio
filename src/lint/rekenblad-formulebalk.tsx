/**
 * Formulebalk van Open Rekenblad Studio (#58): een bewerkbaar naamvak, de
 * fx-knop met het venster Functie invoegen, een uitvouwbare formulebalk voor
 * lange formules, functienamen aanvullen met uitleg per argument, F4 voor
 * $-verwijzingen en gekleurde verwijzingen in het raster.
 *
 * De formule-invoer zelf blijft die van de engine (`EditorToolbar.FormulaBar`);
 * aanvullen en F4 werken op dat veld en op de celinvoer via gewone
 * invoergebeurtenissen, zoals een gebruiker zelf typt.
 */
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EditorToolbar, type XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Dialoog } from "../werkruimte/Dialoog";
import "../werkruimte/werkruimte.css";
import { RibbonFout } from "../Ribbon";
import { leesNederlands } from "../rekenbladinvoer";
import { alleenLezen, benoemdeBereiken, gaNaar, Melding, rekenbladHost } from "./rekenblad-opdrachten";
import { adres, ontleedVerwijzing, serieleDatum, type Cel } from "./rekenblad-logica";
import {
  aanvullingen,
  argumentBij,
  argumentOnderCursor,
  CATEGORIEEN,
  functie,
  FUNCTIES,
  syntaxis,
  verwijzingenIn,
  wisselAbsoluut,
  woordBijCursor,
  type Categorie,
  type Functie,
} from "./rekenblad-functies";
import { VERWIJZINGSKLEUREN, type RekenbladLaag } from "./rekenblad-laag";
import "./rekenblad-gereedschap.css";

const VELDEN = '[data-testid="xlsx-cell-editor"], [data-testid="xlsx-formula-input"], .rekenblad-formule-uitgebreid';
type Veld = HTMLInputElement | HTMLTextAreaElement;
const isVeld = (e: EventTarget | null): e is Veld =>
  (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) && e.matches(VELDEN);

/** Zet de tekst van een (React-)invoerveld zoals typen dat doet, en de cursor. */
export function zetVeld(veld: Veld, tekst: string, begin: number, eind = begin) {
  const proto = veld instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(veld, tekst);
  veld.dispatchEvent(new Event("input", { bubbles: true }));
  veld.setSelectionRange(begin, eind);
  requestAnimationFrame(() => {
    if (document.activeElement === veld && veld.value === tekst) veld.setSelectionRange(begin, eind);
  });
}

const tekstVan = (fout: unknown) => (fout instanceof Melding || fout instanceof Error ? fout.message : String(fout));

/** Huidige cel en selectie volgens de laag. */
function useSelectie(laag: RekenbladLaag | null | undefined) {
  const [, ververs] = useReducer((n: number) => n + 1, 0);
  useEffect(() => laag?.abonneer(ververs), [laag]);
  return laag?.selectie() ?? null;
}

// ------------------------------------------------------------ voorbeeld

let sjabloon: Promise<Uint8Array> | null = null;
const leegWerkboek = () =>
  (sjabloon ??= fetch(new URL("/templates/nieuw.xlsx", location.href))
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b))
    .catch((e) => {
      sjabloon = null;
      throw e;
    }));

/**
 * Rekent een formule uit zonder het werkboek te wijzigen: de waarden van de
 * verwijzingen gaan in een klad-werkboek, waar de formule op dezelfde plek
 * komt. Null als dat niet lukt of te groot is.
 */
export async function voorbeeldResultaat(api: XlsxEditorApi, formule: string, blad: number, cel: Cel): Promise<string | null> {
  // Deze functie laat de rekenkern vastlopen (docs/tests/2026-10-26-rekenbladen.md).
  if (/ISOWEEKNUM/i.test(formule) || !formule.trim()) return null;
  const refs = verwijzingenIn(`=${formule}`);
  const cellen = refs.reduce(
    (n, r) => n + (r.bereik.bottom - r.bereik.top + 1) * (r.bereik.right - r.bereik.left + 1),
    0,
  );
  if (cellen > 20000) return null;
  const { openWorkbook } = await import("@betteroffice/xlsx");
  const info = api.handle.sheetInfo();
  const klad = openWorkbook(await leegWerkboek());
  try {
    const namen = [info.sheetNames[blad]];
    klad.applyOps([{ type: "renameSheet", sheet: 0, name: namen[0] }]);
    for (const r of refs) {
      const naam = r.blad ?? namen[0];
      const bron = info.sheetNames.findIndex((n) => n.toLowerCase() === naam.toLowerCase());
      if (bron < 0) continue;
      let index = namen.findIndex((n) => n.toLowerCase() === naam.toLowerCase());
      if (index < 0) {
        klad.applyOps([{ type: "addSheet", index: namen.length, name: info.sheetNames[bron] }]);
        namen.push(info.sheetNames[bron]);
        index = namen.length - 1;
      }
      const lezing = await api.readCells({
        ranges: [
          {
            sheetId: info.sheetIds[bron],
            range: { kind: "rowCol", start: { row: r.bereik.top, col: r.bereik.left }, end: { row: r.bereik.bottom, col: r.bereik.right } },
          },
        ],
      });
      if (!lezing.ok) continue;
      const invoer: { row: number; col: number; input: string }[] = [];
      lezing.ranges[0].cells.forEach((rij, i) =>
        rij.forEach((c, j) => {
          const w = c.value;
          const input =
            w.kind === "number"
              ? String(w.value)
              : w.kind === "text"
                ? `'${w.value}`
                : w.kind === "bool"
                  ? (w.value ? "TRUE" : "FALSE")
                  : w.kind === "error" && w.value === "#N/A"
                    ? "=NA()"
                    : "";
          if (input) invoer.push({ row: r.bereik.top + i, col: r.bereik.left + j, input });
        }),
      );
      if (invoer.length) klad.editCells(index, invoer);
    }
    const sheetId = klad.sheetInfo().sheetIds[0];
    const doel = { sheetId, range: { kind: "rowCol" as const, start: cel, end: cel } };
    const r = klad.applyEdits({
      expectVersion: klad.version(),
      calculation: { nowSerial: (() => { const s = serieleDatum(new Date()); return s.datum + s.tijd; })() },
      steps: [{ op: "setFormulas", target: doel, formulas: [[formule]] }],
    });
    if (!r.ok) return null;
    const lezing = klad.readCells({ ranges: [doel] });
    return lezing.ok ? lezing.ranges[0].cells[0][0].displayText : null;
  } catch {
    return null;
  } finally {
    klad.dispose();
  }
}

// ------------------------------------------------------------ Functie invoegen

const RECENT = "openaec.rekenblad.recenteFuncties";
function leesRecent(): string[] {
  try {
    const lijst = JSON.parse(localStorage.getItem(RECENT) ?? "[]");
    return Array.isArray(lijst) ? lijst.filter((n) => typeof n === "string" && functie(n)) : [];
  } catch {
    return [];
  }
}
function bewaarRecent(naam: string) {
  try {
    localStorage.setItem(RECENT, JSON.stringify([naam, ...leesRecent().filter((n) => n !== naam)].slice(0, 10)));
  } catch {
    // Alleen een gemak.
  }
}

/** Argumentvelden: een herhalende groep groeit mee met wat is ingevuld. */
function argumentVelden(f: Functie, waarden: string[]) {
  const velden: { naam: string; id: string; optioneel: boolean }[] = [];
  const args = f.argumenten;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.herhaalt) {
      velden.push({ naam: a.naam, id: a.id, optioneel: a.optioneel });
      continue;
    }
    const groep = [a];
    while (args[i + 1]?.herhaalt) groep.push(args[++i]);
    const basis = (x: (typeof groep)[number]) => x.naam.replace(/\d+$/, "");
    for (let n = 1; n <= 30; n++) {
      const start = velden.length;
      groep.forEach((x) => velden.push({ naam: `${basis(x)}${n}`, id: x.id, optioneel: x.optioneel || n > 1 }));
      // Toon één lege groep na de laatst ingevulde.
      const gevuld = velden.slice(start).some((_, k) => (waarden[start + k] ?? "").trim() !== "");
      if (!gevuld && n > 1) break;
      if (!gevuld && n === 1 && groep.every((x) => x.optioneel)) break;
    }
  }
  return velden;
}

function formuleTekst(f: Functie, waarden: string[], aantal: number) {
  const lijst = waarden.slice(0, aantal).map((w) => w.trim());
  while (lijst.length && !lijst[lijst.length - 1]) lijst.pop();
  return `${f.naam}(${lijst.join(",")})`;
}

export interface Invoegplek {
  blad: number;
  cel: Cel;
  /** Tekst die werd bewerkt (met "="), en de cursor daarin. */
  concept: { tekst: string; cursor: number } | null;
}

export function FunctieVenster({
  api,
  plek,
  sluit,
}: {
  api: XlsxEditorApi;
  plek: Invoegplek;
  sluit: () => void;
}) {
  const { t } = useTranslation("functions");
  const { t: ts } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const id = useId();
  const [zoek, setZoek] = useState("");
  const [categorie, setCategorie] = useState<"alle" | "recent" | Categorie>(() => (leesRecent().length ? "recent" : "alle"));
  const [gekozen, setGekozen] = useState<string>(() => leesRecent()[0] ?? "SUM");
  const [waarden, setWaarden] = useState<string[]>([]);
  const [actiefArg, setActiefArg] = useState(0);
  const [resultaat, setResultaat] = useState<string | null | undefined>(undefined);
  const recent = useMemo(leesRecent, []);

  const term = zoek.trim().toLowerCase();
  const lijst = useMemo(() => {
    const basis =
      categorie === "recent"
        ? recent.map((n) => functie(n)!).filter(Boolean)
        : categorie === "alle"
          ? FUNCTIES
          : FUNCTIES.filter((f) => f.categorie === categorie);
    if (!term) return basis;
    return FUNCTIES.filter(
      (f) => f.naam.toLowerCase().includes(term) || t(`fn.${f.naam}`).toLowerCase().includes(term),
    ).sort((a, b) => Number(!a.naam.toLowerCase().startsWith(term)) - Number(!b.naam.toLowerCase().startsWith(term)));
  }, [categorie, term, recent, t]);
  const f = functie(gekozen) ?? lijst[0] ?? FUNCTIES[0];
  const velden = argumentVelden(f, waarden);
  const tekst = formuleTekst(f, waarden, velden.length);

  useEffect(() => {
    if (lijst.length && !lijst.some((x) => x.naam === gekozen)) setGekozen(lijst[0].naam);
  }, [lijst]);
  useEffect(() => {
    setResultaat(undefined);
    const klok = setTimeout(() => {
      void voorbeeldResultaat(api, tekst, plek.blad, plek.cel).then(setResultaat);
    }, 250);
    return () => clearTimeout(klok);
  }, [tekst]);

  const kies = (naam: string) => {
    setGekozen(naam);
    setWaarden([]);
    setActiefArg(0);
  };

  const invoegen = async () => {
    try {
      if (alleenLezen(api)) throw new Melding(ts("data.messages.readOnly"));
      const c = plek.concept;
      const nieuw = c && c.tekst.startsWith("=") ? `${c.tekst.slice(0, c.cursor)}${tekst}${c.tekst.slice(c.cursor)}` : `=${tekst}`;
      const info = api.handle.sheetInfo();
      const r = await api.applyEdits({
        expectVersion: await api.version(),
        steps: [
          {
            op: "setCellInputs",
            target: { sheetId: info.sheetIds[plek.blad], range: { kind: "rowCol", start: plek.cel, end: plek.cel } },
            inputs: [[nieuw]],
          },
        ],
      });
      if (!r.ok) throw new Melding(r.failure.message);
      bewaarRecent(f.naam);
      sluit();
    } catch (e) {
      fout(tekstVan(e));
    }
  };

  const lijstRef = useRef<HTMLDivElement>(null);
  const actieveArg = velden[actiefArg];

  return (
    <Dialoog
      titel={ts("insertFunction.title")}
      sluit={sluit}
      className="rekenblad-venster rekenblad-functievenster"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {ts("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={() => void invoegen()}>
            {ts("insertFunction.insert")}
          </button>
        </>
      }
    >
      <div className="rekenblad-vensterinhoud">
        <div className="rekenblad-functiezoek">
          <label>
            {ts("insertFunction.search")}
            <input
              type="search"
              value={zoek}
              data-autofocus
              placeholder={ts("insertFunction.searchPlaceholder")}
              onChange={(e) => setZoek(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  lijstRef.current?.focus();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById(`${id}-arg-0`)?.focus();
                }
              }}
            />
          </label>
          <label>
            {ts("insertFunction.category")}
            <select value={categorie} onChange={(e) => setCategorie(e.target.value as typeof categorie)} disabled={!!term}>
              <option value="recent">{ts("insertFunction.recent")}</option>
              <option value="alle">{ts("insertFunction.all")}</option>
              {CATEGORIEEN.map((c) => (
                <option key={c} value={c}>
                  {t(`cat.${c}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rekenblad-functiekolommen">
          <div
            ref={lijstRef}
            className="rekenblad-functielijst"
            role="listbox"
            tabIndex={0}
            aria-label={ts("insertFunction.functions")}
            aria-activedescendant={`${id}-f-${f.naam}`}
            onKeyDown={(e) => {
              const i = lijst.findIndex((x) => x.naam === f.naam);
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = lijst[Math.max(0, Math.min(lijst.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
                if (n) {
                  kies(n.naam);
                  document.getElementById(`${id}-f-${n.naam}`)?.scrollIntoView({ block: "nearest" });
                }
              } else if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById(`${id}-arg-0`)?.focus();
              }
            }}
          >
            {lijst.map((x) => (
              <div
                key={x.naam}
                id={`${id}-f-${x.naam}`}
                role="option"
                aria-selected={x.naam === f.naam}
                className={x.naam === f.naam ? "is-gekozen" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => kies(x.naam)}
                onDoubleClick={() => {
                  kies(x.naam);
                  setTimeout(() => document.getElementById(`${id}-arg-0`)?.focus());
                }}
              >
                {x.naam}
              </div>
            ))}
            {!lijst.length && <p className="rekenblad-zacht">{ts("insertFunction.noResults")}</p>}
          </div>
          <div className="rekenblad-functiedetail">
            <p className="rekenblad-syntaxis">{syntaxis(f)}</p>
            <p>{t(`fn.${f.naam}`)}</p>
            <p className="rekenblad-zacht">{t(`cat.${f.categorie}`)}</p>
            {velden.length > 0 && (
              <fieldset className="rekenblad-argumenten">
                <legend>{ts("insertFunction.arguments")}</legend>
                {velden.map((v, i) => (
                  <label key={`${v.naam}-${i}`} className={i === actiefArg ? "is-actief" : ""}>
                    <span>
                      {v.naam}
                      {v.optioneel && <em> ({ts("insertFunction.optional")})</em>}
                    </span>
                    <input
                      id={`${id}-arg-${i}`}
                      value={waarden[i] ?? ""}
                      onFocus={() => setActiefArg(i)}
                      onChange={(e) => {
                        const nieuw = [...waarden];
                        nieuw[i] = e.target.value;
                        setWaarden(nieuw);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void invoegen();
                        }
                      }}
                      aria-describedby={`${id}-uitleg`}
                    />
                  </label>
                ))}
                <p id={`${id}-uitleg`} className="rekenblad-zacht">
                  {actieveArg ? `${actieveArg.naam}: ${t(`arg.${actieveArg.id}`)}` : ""}
                </p>
              </fieldset>
            )}
            <p className="rekenblad-formulevoorbeeld">
              <span>{ts("insertFunction.formula")}</span> <code>={tekst}</code>
            </p>
            <p className="rekenblad-formulevoorbeeld" aria-live="polite">
              <span>{ts("insertFunction.result")}</span>{" "}
              <strong>
                {resultaat === undefined ? "…" : resultaat === null ? ts("insertFunction.resultUnavailable") : resultaat || "—"}
              </strong>
            </p>
          </div>
        </div>
      </div>
    </Dialoog>
  );
}

/** Waar Functie invoegen naartoe schrijft: de actieve cel, met een formule die al bewerkt werd. */
export function invoegplek(api: XlsxEditorApi, laag: RekenbladLaag | null | undefined, veld: Element | null): Invoegplek | null {
  const s = laag?.selectie();
  const info = api.handle.sheetInfo();
  const cel = s?.cells?.focus;
  if (!s || !cel) return null;
  const concept =
    veld instanceof HTMLInputElement || veld instanceof HTMLTextAreaElement
      ? veld.matches(VELDEN) && veld.value.startsWith("=")
        ? { tekst: veld.value, cursor: veld.selectionStart ?? veld.value.length }
        : null
      : null;
  return { blad: s.sheetIndex ?? info.activeSheet, cel: { row: cel.row, col: cel.col }, concept };
}

// ------------------------------------------------------------ naamvak en balk

function Naamvak({ api, laag }: { api: XlsxEditorApi; laag: RekenbladLaag | null | undefined }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const s = useSelectie(laag);
  const lijst = useId();
  const [tekst, setTekst] = useState<string | null>(null);
  const [namen, setNamen] = useState<{ naam: string; verwijzing: string }[]>([]);
  const veld = useRef<HTMLInputElement>(null);

  const cel = s?.cells?.focus;
  const bereik = s?.cells
    ? {
        top: Math.min(s.cells.anchor.row, s.cells.focus.row),
        left: Math.min(s.cells.anchor.col, s.cells.focus.col),
        bottom: Math.max(s.cells.anchor.row, s.cells.focus.row),
        right: Math.max(s.cells.anchor.col, s.cells.focus.col),
      }
    : null;
  // Een benoemd bereik dat precies de selectie is, toont zijn naam (zoals Excel).
  const naam = useMemo(() => {
    if (!bereik) return null;
    const info = api.handle.sheetInfo();
    return (
      namen.find((n) => {
        const v = ontleedVerwijzing(n.verwijzing);
        if (!v) return false;
        const bladOk = v.blad === null || v.blad.toLowerCase() === info.sheetNames[info.activeSheet]?.toLowerCase();
        return bladOk && JSON.stringify(v.bereik) === JSON.stringify(bereik);
      })?.naam ?? null
    );
  }, [namen, bereik?.top, bereik?.left, bereik?.bottom, bereik?.right]);
  useEffect(() => setNamen(benoemdeBereiken(api)), [api]);
  const toon = tekst ?? naam ?? (cel ? adres(cel) : "");

  return (
    <>
      <input
        ref={veld}
        className="rekenblad-naamvak"
        value={toon}
        aria-label={t("formulaBar.nameBox")}
        title={t("formulaBar.nameBoxHint")}
        list={namen.length ? lijst : undefined}
        spellCheck={false}
        onFocus={(e) => {
          setNamen(benoemdeBereiken(api));
          setTekst(toon);
          e.currentTarget.select();
        }}
        onBlur={() => setTekst(null)}
        onChange={(e) => setTekst(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            setTekst(null);
            api.focus();
          } else if (e.key === "Enter") {
            e.preventDefault();
            const doel = (tekst ?? "").trim();
            if (!doel) return;
            void gaNaar(api, doel)
              .then(() => setTekst(null))
              .catch((fout2) => {
                fout(tekstVan(fout2));
                veld.current?.select();
              });
          }
        }}
      />
      {namen.length > 0 && (
        <datalist id={lijst}>
          {namen.map((n) => (
            <option key={n.naam} value={n.naam}>
              {n.verwijzing}
            </option>
          ))}
        </datalist>
      )}
    </>
  );
}

/** Formulebalk met eigen naamvak, fx-knop en uitvouwen; de invoer zelf is die van de engine. */
export function Formulebalk({
  api,
  laag,
  functieInvoegen,
}: {
  api: XlsxEditorApi | null;
  laag: RekenbladLaag | null | undefined;
  functieInvoegen: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const [uitgevouwen, setUitgevouwen] = useState(false);
  return (
    <div className={`office-formulebalk${uitgevouwen ? " is-uitgevouwen" : ""}`}>
      {api && <Naamvak api={api} laag={laag} />}
      <button
        type="button"
        className="rekenblad-fx"
        disabled={!api}
        aria-label={t("formulaBar.insertFunction")}
        title={`${t("formulaBar.insertFunction")} · Shift+F3`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={functieInvoegen}
      >
        <i>fx</i>
      </button>
      <EditorToolbar.FormulaBar />
      {api && uitgevouwen && <UitgevouwenFormule api={api} laag={laag} />}
      <button
        type="button"
        className="rekenblad-uitvouwen"
        aria-expanded={uitgevouwen}
        aria-label={t(uitgevouwen ? "formulaBar.collapse" : "formulaBar.expand")}
        title={t(uitgevouwen ? "formulaBar.collapse" : "formulaBar.expand")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setUitgevouwen(!uitgevouwen)}
      >
        {uitgevouwen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    </div>
  );
}

/**
 * Meerregelige formulebalk: toont de inhoud van de actieve cel en schrijft
 * bij Enter of Tab via een bewerkingsbatch (één ongedaan-maakstap).
 * Alt+Enter of Shift+Enter geeft een nieuwe regel.
 */
function UitgevouwenFormule({ api, laag }: { api: XlsxEditorApi; laag: RekenbladLaag | null | undefined }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const s = useSelectie(laag);
  const cel = s?.cells?.focus ?? null;
  const blad = s?.sheetIndex ?? api.handle.sheetInfo().activeSheet;
  const inhoud = useCallback(() => (cel ? api.handle.cell(blad, cel.row, cel.col).input : ""), [api, blad, cel?.row, cel?.col]);
  const [tekst, setTekst] = useState(inhoud);
  const [gewijzigd, setGewijzigd] = useState(false);
  useEffect(() => {
    if (!gewijzigd) setTekst(inhoud());
    return api.handle.onUpdate(() => {
      if (!gewijzigd) setTekst(inhoud());
    });
  }, [inhoud, gewijzigd]);
  useEffect(() => setGewijzigd(false), [cel?.row, cel?.col, blad]);

  const vastleggen = async (naar: "omlaag" | "rechts" | null) => {
    if (!cel) return;
    if (gewijzigd) {
      try {
        const info = api.handle.sheetInfo();
        const target = { sheetId: info.sheetIds[blad], range: { kind: "rowCol" as const, start: cel, end: cel } };
        const nl = leesNederlands(tekst);
        const r = await api.applyEdits({
          expectVersion: await api.version(),
          steps: [
            { op: "setCellInputs", target, inputs: [[nl ? nl.invoer : tekst]] },
            ...(nl?.notatie ? [{ op: "setNumberFormat" as const, target, format: { type: "custom" as const, pattern: nl.notatie } }] : []),
          ],
        });
        if (!r.ok) throw new Melding(r.failure.message);
        setGewijzigd(false);
      } catch (e) {
        fout(tekstVan(e));
        return;
      }
    }
    laag?.zetMarkeringen([]);
    if (naar) {
      const volgende = naar === "omlaag" ? { row: cel.row + 1, col: cel.col } : { row: cel.row, col: cel.col + 1 };
      api.selectCells(blad, { anchor: volgende, focus: volgende });
    }
    api.focus();
  };

  return (
    <textarea
      className="rekenblad-formule-uitgebreid"
      value={tekst}
      rows={4}
      spellCheck={false}
      readOnly={alleenLezen(api) || !cel}
      aria-label={t("formulaBar.expandedLabel", { cell: cel ? adres(cel) : "" })}
      onChange={(e) => {
        setTekst(e.target.value);
        setGewijzigd(true);
      }}
      onBlur={() => laag?.zetMarkeringen([])}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          void vastleggen("omlaag");
        } else if (e.key === "Enter" && e.altKey) {
          e.preventDefault();
          const v = e.currentTarget;
          const p = v.selectionStart;
          zetVeld(v, `${v.value.slice(0, p)}\n${v.value.slice(v.selectionEnd)}`, p + 1);
        } else if (e.key === "Tab") {
          e.preventDefault();
          void vastleggen("rechts");
        } else if (e.key === "Escape") {
          e.preventDefault();
          setTekst(inhoud());
          setGewijzigd(false);
          laag?.zetMarkeringen([]);
          api.focus();
        }
      }}
    />
  );
}

// ------------------------------------------------------------ aanvullen, argumenten en F4

interface Hulp {
  veld: Veld;
  rect: DOMRect;
  begin: number;
  voorstellen: Functie[];
  gekozen: number;
  /** Of de gebruiker met de pijltjes koos (dan accepteert Enter ook). */
  genavigeerd: boolean;
  argument: { functie: Functie; index: number } | null;
}

/**
 * Functienamen aanvullen (Tab, of Enter na kiezen met de pijltjes), uitleg
 * bij het actieve argument, F4 en gekleurde verwijzingen, in de celinvoer en
 * de formulebalk. Geeft het zwevende hulpvenster terug.
 */
export function useFormuleHulp(laag: RekenbladLaag | null | undefined, actief: boolean) {
  const [hulp, setHulp] = useState<Hulp | null>(null);
  const recent = useRef<Hulp | null>(null);
  recent.current = hulp;

  useEffect(() => {
    if (!actief) return;
    const inHost = (veld: Element) => !!rekenbladHost()?.contains(veld);
    const werkBij = (veld: Veld) => {
      if (!inHost(veld) || document.activeElement !== veld) return;
      const cursor = veld.selectionStart ?? veld.value.length;
      const tekst = veld.value;
      const formule = tekst.startsWith("=");
      // Verwijzingen kleuren.
      laag?.zetMarkeringen(
        formule
          ? verwijzingenIn(tekst).map((r, i) => ({ blad: r.blad, bereik: r.bereik, kleur: VERWIJZINGSKLEUREN[i % VERWIJZINGSKLEUREN.length] }))
          : [],
      );
      if (!formule || veld.selectionStart !== veld.selectionEnd) {
        setHulp(null);
        return;
      }
      const woord = woordBijCursor(tekst, cursor);
      const voorstellen = woord ? aanvullingen(woord.woord) : [];
      const arg = argumentOnderCursor(tekst, cursor);
      const f = arg ? functie(arg.functie) : null;
      if (!voorstellen.length && !f) {
        setHulp(null);
        return;
      }
      const vorige = recent.current;
      setHulp({
        veld,
        rect: veld.getBoundingClientRect(),
        begin: woord?.begin ?? cursor,
        voorstellen,
        gekozen: vorige?.veld === veld && vorige.voorstellen.length ? Math.min(vorige.gekozen, Math.max(0, voorstellen.length - 1)) : 0,
        genavigeerd: false,
        argument: f ? { functie: f, index: arg!.index } : null,
      });
    };
    const opInvoer = (e: Event) => {
      if (isVeld(e.target)) werkBij(e.target);
    };
    const opKlik = (e: Event) => {
      if (isVeld(e.target)) requestAnimationFrame(() => werkBij(e.target as Veld));
    };
    const opVerlaten = (e: FocusEvent) => {
      if (!isVeld(e.target)) return;
      setTimeout(() => {
        if (!isVeld(document.activeElement)) {
          setHulp(null);
          laag?.zetMarkeringen([]);
        }
      }, 120);
    };
    const kies = (h: Hulp, f: Functie) => {
      const cursor = h.veld.selectionStart ?? h.veld.value.length;
      const tekst = `${h.veld.value.slice(0, h.begin)}${f.naam}(${h.veld.value.slice(cursor)}`;
      zetVeld(h.veld, tekst, h.begin + f.naam.length + 1);
    };
    const opToets = (e: KeyboardEvent) => {
      if (!isVeld(e.target) || !inHost(e.target) || e.isComposing) return;
      const veld = e.target;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      };
      if (e.key === "F4" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const r = wisselAbsoluut(veld.value, veld.selectionStart ?? 0, veld.selectionEnd ?? 0);
        stop();
        if (r) zetVeld(veld, r.tekst, r.begin, r.eind);
        return;
      }
      const h = recent.current;
      if (!h || h.veld !== veld || !h.voorstellen.length) {
        if (e.key === "Escape" && h) setHulp(null);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        stop();
        const n = h.voorstellen.length;
        setHulp({ ...h, gekozen: (h.gekozen + (e.key === "ArrowDown" ? 1 : -1) + n) % n, genavigeerd: true });
      } else if (e.key === "Tab" || (e.key === "Enter" && h.genavigeerd)) {
        stop();
        kies(h, h.voorstellen[h.gekozen]);
      } else if (e.key === "Escape") {
        stop();
        setHulp({ ...h, voorstellen: [] });
      }
    };
    document.addEventListener("input", opInvoer, true);
    document.addEventListener("click", opKlik, true);
    const opLos = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && isVeld(e.target)) werkBij(e.target);
    };
    document.addEventListener("keyup", opLos, true);
    document.addEventListener("focusout", opVerlaten, true);
    window.addEventListener("keydown", opToets, true);
    return () => {
      document.removeEventListener("input", opInvoer, true);
      document.removeEventListener("click", opKlik, true);
      document.removeEventListener("keyup", opLos, true);
      document.removeEventListener("focusout", opVerlaten, true);
      window.removeEventListener("keydown", opToets, true);
    };
  }, [actief, laag]);

  return hulp ? (
    <FormuleHulp
      hulp={hulp}
      kies={(f) => {
        const cursor = hulp.veld.selectionStart ?? hulp.veld.value.length;
        zetVeld(hulp.veld, `${hulp.veld.value.slice(0, hulp.begin)}${f.naam}(${hulp.veld.value.slice(cursor)}`, hulp.begin + f.naam.length + 1);
      }}
    />
  ) : null;
}

function FormuleHulp({ hulp, kies }: { hulp: Hulp; kies: (f: Functie) => void }) {
  const { t } = useTranslation("functions");
  const { t: ts } = useTranslation("spreadsheet");
  const id = useId();
  const plek = { left: Math.max(4, Math.min(hulp.rect.left, window.innerWidth - 380)), top: hulp.rect.bottom + 2 };
  if (hulp.voorstellen.length)
    return createPortal(
      <div className="rekenblad-aanvullen" style={plek} role="listbox" aria-label={ts("formulaBar.suggestions")} id={id}>
        {hulp.voorstellen.map((f, i) => (
          <div
            key={f.naam}
            role="option"
            aria-selected={i === hulp.gekozen}
            className={i === hulp.gekozen ? "is-gekozen" : ""}
            onMouseDown={(e) => {
              e.preventDefault();
              kies(f);
            }}
          >
            <strong>{f.naam}</strong>
            <span>{t(`fn.${f.naam}`)}</span>
          </div>
        ))}
        <p className="rekenblad-zacht">{ts("formulaBar.suggestionsHint")}</p>
      </div>,
      document.body,
    );
  const a = hulp.argument;
  if (!a) return null;
  const index = a.functie.argumenten.length ? argumentBij(a.functie, a.index) : -1;
  const delen = syntaxis(a.functie).replace(/^[^(]*\(|\)$/g, "").split(", ");
  // Het actieve deel in de syntaxis: bij herhalende groepen het eerste exemplaar.
  const huidig = index >= 0 ? a.functie.argumenten[index] : null;
  return createPortal(
    <div className="rekenblad-argumenthulp" style={plek} role="tooltip">
      <div>
        <strong>{a.functie.naam}</strong>(
        {delen.map((d, i) => (
          <span key={i}>
            {i > 0 && ", "}
            {huidig && d.replace(/[[\]]/g, "").replace(/\d+$/, "") === huidig.naam.replace(/\d+$/, "") ? (
              <b>{d}</b>
            ) : (
              d
            )}
          </span>
        ))}
        )
      </div>
      {huidig && (
        <p>
          <i>{huidig.naam.replace(/\d+$/, "")}</i>: {t(`arg.${huidig.id}`)}
        </p>
      )}
    </div>,
    document.body,
  );
}
