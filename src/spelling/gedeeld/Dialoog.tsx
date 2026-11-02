/**
 * Venster "Spelling" (F7) voor Rekenblad en Presentatie: loopt vanaf de
 * selectie door de werkmap of presentatie (en daarna rond tot het begin),
 * met suggesties, Wijzigen, Alles wijzigen, Negeren, Alles negeren,
 * Toevoegen aan woordenlijst en de documenttaal. Los van de editor: de bron
 * levert de fouten in documentvolgorde en voert de vervangingen uit.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { spellingControleur } from "../dienst";
import { genegeerd, persoonlijk } from "../woordenlijst";
import { TALEN, taalNaam, type Taal, type TaalId } from "../talen";
import "../tekst/spelling.css";

export interface DialoogTreffer {
  /** Uniek per plek (voor "Negeren": alleen deze plek overslaan). */
  sleutel: string;
  /** Volgorde in het document, bijvoorbeeld [blad, rij, kolom, offset]. */
  positie: readonly number[];
  woord: string;
  taal: TaalId;
  /** Tekst rond het woord. */
  voor: string;
  na: string;
  /** Waar het staat ("Blad1!B3", "Dia 2"). */
  plek: string;
}

export interface DialoogBron {
  /** Alle fouten in documentvolgorde, na de laatste wijziging. */
  lijst(): Promise<DialoogTreffer[]>;
  /** De positie van de selectie: daar begint het venster. */
  start(): readonly number[];
  /** De fout tonen en selecteren in de editor. */
  toon(treffer: DialoogTreffer): void;
  /** Vervangt deze plekken door `door` (één ongedaan-maakstap). */
  vervang(treffers: readonly DialoogTreffer[], door: string): Promise<void>;
  taal: Taal;
  /** "Taal van de werkmap", "Taal van de presentatie". */
  taalLabel: string;
  zetTaal(taal: Taal): void;
  /** Venster dicht: focus terug naar de editor. */
  sluit(): void;
}

export const vergelijkPositie = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -Infinity) - (b[i] ?? -Infinity);
    if (d) return d;
  }
  return 0;
};

/**
 * De volgende fout vanaf `vanaf` (inclusief), rondgaand tot `begin`: eerst
 * van `vanaf` tot het einde; is die ronde klaar (`rond`), dan van het begin
 * van het document tot waar het venster begon.
 */
export function volgendeTreffer(
  lijst: readonly DialoogTreffer[],
  vanaf: readonly number[],
  begin: readonly number[],
  rond: boolean,
  overslaan: ReadonlySet<string>,
): { treffer: DialoogTreffer | null; rond: boolean } {
  const kandidaten = lijst.filter((t) => !overslaan.has(t.sleutel));
  if (!rond) {
    const t = kandidaten.find((x) => vergelijkPositie(x.positie, vanaf) >= 0);
    if (t) return { treffer: t, rond: false };
    vanaf = [];
    rond = true;
  }
  const t = kandidaten.find(
    (x) => vergelijkPositie(x.positie, vanaf) >= 0 && vergelijkPositie(x.positie, begin) < 0,
  );
  return { treffer: t ?? null, rond };
}

export function SpellingDialoog({ bron }: { bron: DialoogBron }) {
  const { t } = useTranslation("spelling");
  const [doel, setDoel] = useState<DialoogTreffer | null>(null);
  const [bezig, setBezig] = useState(true);
  const [probleem, setProbleem] = useState<string | null>(null);
  const [suggesties, setSuggesties] = useState<string[] | null>(null);
  const [vervang, setVervang] = useState("");
  const begin = useRef(bron.start());
  const rond = useRef(false);
  const eenmalig = useRef(new Set<string>());
  const venster = useRef<HTMLElement>(null);
  const recent = useRef(bron);
  recent.current = bron;
  const zoekNr = useRef(0);

  const zoek = async (vanaf: readonly number[]) => {
    const nr = ++zoekNr.current;
    setBezig(true);
    try {
      const lijst = await recent.current.lijst();
      if (nr !== zoekNr.current) return;
      const uit = volgendeTreffer(lijst, vanaf, begin.current, rond.current, eenmalig.current);
      rond.current = uit.rond;
      setDoel(uit.treffer);
      setSuggesties(null);
      setVervang(uit.treffer?.woord ?? "");
      setProbleem(null);
      if (uit.treffer) recent.current.toon(uit.treffer);
    } catch (e) {
      if (nr === zoekNr.current) setProbleem(e instanceof Error ? e.message : String(e));
    } finally {
      if (nr === zoekNr.current) setBezig(false);
    }
  };

  useEffect(() => {
    void zoek(begin.current);
  }, []);

  useEffect(() => {
    if (!doel) return;
    let actief = true;
    spellingControleur()
      .suggesties(doel.woord, doel.taal, 8)
      .then((s) => {
        if (!actief) return;
        setSuggesties(s);
        if (s[0]) setVervang(s[0]);
      })
      .catch(() => actief && setSuggesties([]));
    return () => {
      actief = false;
    };
  }, [doel]);

  const focusInVenster = () => {
    const v = venster.current;
    (
      v?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") ??
      v?.querySelector<HTMLElement>(".spelling-knoppen button:not(:disabled)")
    )?.focus();
  };
  useEffect(focusInVenster, [doel, bezig]);
  useEffect(() => {
    const actief = document.activeElement;
    if (!venster.current?.contains(actief) || actief?.closest(".spelling-knoppen")) focusInVenster();
  }, [suggesties]);

  const sluit = () => recent.current.sluit();
  const verder = () => doel && void zoek(doel.positie);
  const wijzig = async (lijst: readonly DialoogTreffer[], door: string) => {
    if (!doel || !door || door === doel.woord) return;
    setBezig(true);
    try {
      await recent.current.vervang(lijst, door);
    } catch (e) {
      setProbleem(e instanceof Error ? e.message : String(e));
      setBezig(false);
      return;
    }
    await zoek(doel.positie);
  };
  const allemaal = async () => {
    if (!doel) return [];
    const lijst = await recent.current.lijst();
    return lijst.filter((x) => x.woord === doel.woord && x.taal === doel.taal);
  };

  const kan = !!doel && !bezig && !!vervang && vervang !== doel.woord;

  return createPortal(
    <aside
      ref={venster}
      className="spelling-venster"
      role="dialog"
      aria-label={t("dialog.title")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          sluit();
        }
      }}
    >
      <h2>
        {t("dialog.title")}
        <button type="button" aria-label={t("common:close")} title={t("dialog.closeTooltip")} onClick={sluit}>
          ×
        </button>
      </h2>
      {probleem ? (
        <p role="alert">{probleem}</p>
      ) : bezig && !doel ? (
        <p role="status">{t("dialog.checking")}</p>
      ) : !doel ? (
        <div className="spelling-klaar" role="status">
          <p>{t("dialog.complete")}</p>
          <button type="button" className="werkruimte-knop" data-autofocus onClick={sluit}>
            {t("common:ok")}
          </button>
        </div>
      ) : (
        <>
          <div className="werkruimte-label">{t("dialog.notInDictionary", { language: taalNaam(doel.taal) })}</div>
          <p className="spelling-context" aria-live="polite">
            {doel.voor}
            <mark>{doel.woord}</mark>
            {doel.na}
          </p>
          <div className="spelling-plek">{doel.plek}</div>
          <label>
            {t("dialog.changeTo")}
            <input
              value={vervang}
              onChange={(e) => setVervang(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && kan) void wijzig([doel], vervang);
              }}
            />
          </label>
          <div className="werkruimte-label">{t("dialog.suggestions")}</div>
          <ul role="listbox" aria-label={t("dialog.suggestions")}>
            {suggesties === null ? (
              <li>
                <button type="button" disabled>
                  {t("dialog.searching")}
                </button>
              </li>
            ) : !suggesties.length ? (
              <li>
                <button type="button" disabled>
                  {t("actions.noSuggestions")}
                </button>
              </li>
            ) : (
              suggesties.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={s === vervang}
                    onClick={() => setVervang(s)}
                    onDoubleClick={() => void wijzig([doel], s)}
                  >
                    {s}
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="spelling-knoppen">
            <button type="button" className="is-primair" data-autofocus disabled={!kan} onClick={() => void wijzig([doel], vervang)}>
              {t("dialog.change")}
            </button>
            <button type="button" disabled={!kan} onClick={() => void allemaal().then((l) => wijzig(l, vervang))}>
              {t("dialog.changeAll")}
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() => {
                eenmalig.current.add(doel.sleutel);
                verder();
              }}
            >
              {t("dialog.ignoreOnce")}
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() => {
                genegeerd.voegToe(doel.woord);
                verder();
              }}
            >
              {t("actions.ignoreAll")}
            </button>
            <button
              type="button"
              disabled={bezig}
              style={{ gridColumn: "1 / -1" }}
              onClick={() => {
                persoonlijk.voegToe(doel.woord);
                verder();
              }}
            >
              {t("actions.addToDictionary")}
            </button>
          </div>
        </>
      )}
      <label>
        {bron.taalLabel}
        <select
          value={bron.taal}
          onChange={(e) => {
            recent.current.zetTaal(e.target.value as Taal);
            rond.current = false;
            begin.current = doel?.positie ?? begin.current;
            void zoek(begin.current);
          }}
        >
          {[...TALEN.map((x) => x.id), "geen" as const].map((taal) => (
            <option key={taal} value={taal}>
              {taalNaam(taal)}
            </option>
          ))}
        </select>
      </label>
    </aside>,
    document.body,
  );
}
