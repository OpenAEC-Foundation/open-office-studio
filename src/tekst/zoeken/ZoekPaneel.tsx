/**
 * Navigatievenster ‘Zoeken en vervangen’ (#29) met resultatenlijst en
 * markering in het document, en het venster Ga naar (Ctrl+G).
 */
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trans, useTranslation } from "react-i18next";
import { ArrowDownToLine, ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { Groep, RibbonFout } from "../../Ribbon";
import { Dialoog } from "../../werkruimte/Dialoog";
import "../../werkruimte/werkruimte.css";
import { EigenKnop } from "../../lint/tekst-opdrachten";
import { useEditorApi, useEditorZichtbaar, zichtbaarElement } from "../../lint/editorApi";
import { useSneltoetsen } from "../../lint/sneltoetsen";
import { fout } from "../gedeeld/engine";
import { zetMarkeringen, type Markering } from "../gedeeld/markering";
import { usePaneelStaat, zetPaneel } from "./paneelstaat";
import { gaNaar, vervang, zoek, type Resultaat, type ZoekIndex } from "./zoeken";
import { heeftOpmaak, type Opmaakfilter, type ZoekOpties } from "./logica";
import { doelen, huidigNummer, leesNummer, type Doel, type Doelsoort } from "./ganaar";
import { formatGetal } from "../../i18n/opmaak";

/** Speciale tekens: code, sleutel onder `writer:find.special` en of het alleen bij vervangen hoort. */
const SPECIAAL: [string, string, boolean?][] = [
  ["^p", "paragraphMark"],
  ["^t", "tab"],
  ["^l", "lineBreak"],
  ["^m", "pageBreak"],
  ["^g", "graphic"],
  ["^?", "anyCharacter"],
  ["^#", "anyDigit"],
  ["^$", "anyLetter"],
  ["^w", "whiteSpace"],
  ["^s", "nonBreakingSpace"],
  ["^&", "findWhatText", true],
  ["^^", "caret"],
];

/** Lintgroep Zoeken: navigatievenster, vervangen en Ga naar. */
export function ZoekKnoppen({ groot }: { groot?: boolean }) {
  const api = useEditorApi().tekst;
  const { t } = useTranslation("writer");
  const knoppen = (
    <>
      <EigenKnop naam={t("find.buttons.find")} icoon={Search} groot={groot} sneltoets="Ctrl+F" uitleg={t("find.buttons.findTip")} onClick={() => zetPaneel(api, { zoeken: "zoeken" })} />
      <EigenKnop
        naam={t("find.buttons.replace")}
        icoon={Replace}
        groot={groot}
        sneltoets="Ctrl+H"
        uitleg={t("find.buttons.replaceTip")}
        onClick={() => zetPaneel(api, { zoeken: "vervangen" })}
      />
      <EigenKnop naam={t("find.buttons.goTo")} icoon={ArrowDownToLine} groot={groot} sneltoets="Ctrl+G" uitleg={t("find.buttons.goToTip")} onClick={() => zetPaneel(api, { gaNaar: true })} />
    </>
  );
  return <Groep naam={t("find.group")}>{groot ? knoppen : <div className="ribbon-stapel">{knoppen}</div>}</Groep>;
}

function tekstVlak() {
  const tekst = zichtbaarElement<HTMLElement>(".office-tekst");
  if (!tekst) return null;
  const actief = document.activeElement;
  return actief instanceof HTMLElement && actief.classList.contains("paged-editor__yrs-input") ? actief : tekst;
}

/** Hoort bij elke tekst-editor: sneltoetsen, het deelvenster en Ga naar. */
export function ZoekHost() {
  const api = useEditorApi().tekst;
  const staat = usePaneelStaat(api);
  const zichtbaar = useEditorZichtbaar();
  const { t } = useTranslation("writer");
  const vanSelectie = () => {
    const tekst = api()?.getSelectionInfo()?.selectedText ?? "";
    return tekst && tekst.length < 120 && !/\n/.test(tekst) ? tekst : undefined;
  };
  useSneltoetsen(
    tekstVlak,
    [
      { toets: "Ctrl+F", uitvoeren: () => zetPaneel(api, { zoeken: "zoeken" }), omschrijving: t("find.shortcuts.find") },
      { toets: "Ctrl+H", uitvoeren: () => zetPaneel(api, { zoeken: "vervangen" }), omschrijving: t("find.shortcuts.replace") },
      { toets: "Ctrl+G", uitvoeren: () => zetPaneel(api, { gaNaar: true }), omschrijving: t("find.shortcuts.goTo") },
    ],
    "tekst",
  );
  if (!zichtbaar) return null;
  return (
    <>
      {staat.zoeken && <ZoekPaneel modus={staat.zoeken} verzoek={staat.verzoek} beginTekst={vanSelectie} />}
      {staat.gaNaar && <GaNaarVenster sluit={() => zetPaneel(api, { gaNaar: false })} />}
    </>
  );
}

type Drie = "" | "ja" | "nee";
const naarDrie = (d: Drie) => (d === "" ? undefined : d === "ja");

function ZoekPaneel({ modus, verzoek, beginTekst }: { modus: "zoeken" | "vervangen"; verzoek: number; beginTekst: () => string | undefined }) {
  const api = useEditorApi().tekst;
  const { t } = useTranslation("writer");
  const meld = useContext(RibbonFout);
  const [zoekTekst, setZoekTekst] = useState(() => beginTekst() ?? "");
  const [vervangTekst, setVervangTekst] = useState("");
  const [opties, setOpties] = useState<ZoekOpties>({});
  const [vet, setVet] = useState<Drie>("");
  const [cursief, setCursief] = useState<Drie>("");
  const [onderstreept, setOnderstreept] = useState<Drie>("");
  const [stijl, setStijl] = useState("");
  const [meer, setMeer] = useState(false);
  const [resultaten, setResultaten] = useState<Resultaat[]>([]);
  const [index, setIndex] = useState<ZoekIndex | null>(null);
  const [huidig, setHuidig] = useState(-1);
  const [melding, setMelding] = useState("");
  const [plek, setPlek] = useState<{ left: number; top: number; height: number } | null>(null);
  const zoekVeld = useRef<HTMLInputElement>(null);
  const vervangVeld = useRef<HTMLInputElement>(null);
  const laatsteVeld = useRef<HTMLInputElement | null>(null);
  const stijlen = useDocxCommand("paragraphStyle").state.options ?? [];
  // Vervangen kan ook bij wijzigingen bijhouden (de vervanging wordt dan een voorstel).
  const invoegen = useDocxCommand("insertPageBreak").state.enabled;
  const bewerkingsmodus = useDocxCommand("editingMode").state.value;
  const bewerkbaar = invoegen || bewerkingsmodus === "suggesting";
  /** Na vervangen blijft de melding staan tot er een nieuwe zoekopdracht is. */
  const naVervangen = useRef(false);
  const opmaak: Opmaakfilter = useMemo(
    () => ({ vet: naarDrie(vet), cursief: naarDrie(cursief), onderstreept: naarDrie(onderstreept), stijl: stijl || undefined }),
    [vet, cursief, onderstreept, stijl],
  );
  const metOpmaak = heeftOpmaak(opmaak);
  const vervangen = modus === "vervangen";

  // Plaats: links in het documentvlak onder het lint.
  useLayoutEffect(() => {
    const meet = () => {
      const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
      const r = vlak?.getBoundingClientRect();
      if (r) setPlek({ left: r.left + 8, top: r.top + 8, height: Math.max(240, r.height - 16) });
    };
    meet();
    window.addEventListener("resize", meet);
    const waarnemer = new ResizeObserver(meet);
    const vlak = zichtbaarElement<HTMLElement>(".office-tekst .docx-editor__dock-area");
    // Het document schuift op, zoals bij het navigatievenster van Word.
    vlak?.classList.add("tw-met-zoekpaneel");
    if (vlak) waarnemer.observe(vlak);
    return () => {
      vlak?.classList.remove("tw-met-zoekpaneel");
      window.removeEventListener("resize", meet);
      waarnemer.disconnect();
    };
  }, []);

  useEffect(() => {
    const veld = vervangen && zoekTekst ? vervangVeld.current : zoekVeld.current;
    veld?.focus();
    veld?.select();
    // Bij de eerste opening bestaat het veld pas zodra de plek bekend is.
  }, [verzoek, !!plek]);

  const markeer = useCallback((lijst: Resultaat[], idx: ZoekIndex | null, nu: number) => {
    if (!idx) return zetMarkeringen("zoeken", []);
    const uit: Markering[] = [];
    lijst.forEach((r, i) =>
      r.delen.forEach((d) => {
        if (d.tot <= d.van) return;
        uit.push({
          soort: i === nu ? "zoekHuidig" : "zoek",
          doel: { kind: "range", version: idx.versie, range: { story: r.story, start: { paraId: d.paraId, offset: d.van }, end: { paraId: d.paraId, offset: d.tot }, view: "accepted" } },
        });
      }),
    );
    zetMarkeringen("zoeken", uit);
  }, []);

  const zoekNu = useCallback(
    async (behoud = false) => {
      const ref = api();
      if (!ref || (!zoekTekst && !metOpmaak)) {
        setResultaten([]);
        setIndex(null);
        setHuidig(-1);
        setMelding("");
        markeer([], null, -1);
        return;
      }
      try {
        const uit = await zoek(ref, { zoek: zoekTekst, opties, opmaak });
        setIndex(uit.index);
        setResultaten(uit.resultaten);
        const nu = uit.resultaten.length ? (behoud ? Math.min(Math.max(huidig, 0), uit.resultaten.length - 1) : -1) : -1;
        setHuidig(nu);
        if (!(behoud && naVervangen.current)) setMelding(uit.resultaten.length ? "" : t("find.pane.noResults"));
        markeer(uit.resultaten, uit.index, nu);
      } catch (error) {
        setResultaten([]);
        setIndex(null);
        setMelding(fout(error));
        markeer([], null, -1);
      }
    },
    [api, zoekTekst, opties, opmaak, metOpmaak, huidig, markeer],
  );

  // Live zoeken bij typen; opnieuw na een wijziging in het document.
  useEffect(() => {
    naVervangen.current = false;
    const wacht = setTimeout(() => void zoekNu(false), 250);
    return () => clearTimeout(wacht);
  }, [zoekTekst, opties, opmaak]);
  const zoekRef = useRef(zoekNu);
  zoekRef.current = zoekNu;
  useEffect(() => {
    const ref = api();
    if (!ref) return;
    let wacht: ReturnType<typeof setTimeout> | undefined;
    const weg = ref.onContentChange(() => {
      clearTimeout(wacht);
      wacht = setTimeout(() => void zoekRef.current(true), 500);
    });
    return () => {
      clearTimeout(wacht);
      weg();
    };
  }, [api]);
  useEffect(() => () => zetMarkeringen("zoeken", []), []);

  function ga(nr: number) {
    if (!resultaten.length || !index) return;
    const n = ((nr % resultaten.length) + resultaten.length) % resultaten.length;
    setHuidig(n);
    markeer(resultaten, index, n);
    try {
      gaNaar(api(), index, resultaten[n]);
    } catch (error) {
      meld(fout(error));
    }
  }
  /** Volgende treffer vanaf de cursor, zoals Word: de eerste na de huidige. */
  const volgende = () => ga(huidig + 1);
  const vorige = () => ga(huidig < 0 ? resultaten.length - 1 : huidig - 1);

  async function vervangEen() {
    if (!index || !resultaten.length) return;
    if (huidig < 0) return volgende();
    try {
      await vervang(api(), index, [resultaten[huidig]], vervangTekst, opties);
      naVervangen.current = true;
      setMelding(t("find.pane.replacedOne"));
      // De volgende treffer krijgt hetzelfde nummer na opnieuw zoeken.
      const ref = api();
      if (!ref) return;
      const uit = await zoek(ref, { zoek: zoekTekst, opties, opmaak });
      setIndex(uit.index);
      setResultaten(uit.resultaten);
      const n = uit.resultaten.length ? Math.min(huidig, uit.resultaten.length - 1) : -1;
      setHuidig(n);
      markeer(uit.resultaten, uit.index, n);
      if (n >= 0) gaNaar(ref, uit.index, uit.resultaten[n]);
    } catch (error) {
      setMelding(fout(error));
    }
  }
  async function vervangAlles() {
    if (!index || !resultaten.length) return;
    try {
      const uit = await vervang(api(), index, resultaten, vervangTekst, opties);
      await zoekNu(false);
      naVervangen.current = true;
      setMelding(t("find.pane.replacedAll", { count: uit.aantal, number: formatGetal(uit.aantal), undo: "Ctrl+Z" }));
    } catch (error) {
      setMelding(fout(error));
    }
  }
  function voegIn(code: string) {
    const veld = laatsteVeld.current ?? zoekVeld.current;
    if (!veld) return;
    const begin = veld.selectionStart ?? veld.value.length,
      eind = veld.selectionEnd ?? veld.value.length;
    const nieuw = veld.value.slice(0, begin) + code + veld.value.slice(eind);
    if (veld === vervangVeld.current) setVervangTekst(nieuw);
    else setZoekTekst(nieuw);
    requestAnimationFrame(() => {
      veld.focus();
      veld.setSelectionRange(begin + code.length, begin + code.length);
    });
  }
  function sluit() {
    zetMarkeringen("zoeken", []);
    zetPaneel(api, { zoeken: false });
    requestAnimationFrame(() => api()?.focus());
  }
  const keuze = (label: string, waarde: Drie, zet: (d: Drie) => void) => (
    <label className="tw-zoek-opmaak">
      <span>{label}</span>
      <select value={waarde} onChange={(e) => zet(e.target.value as Drie)}>
        <option value="">{t("find.pane.any")}</option>
        <option value="ja">{t("find.pane.yes")}</option>
        <option value="nee">{t("find.pane.no")}</option>
      </select>
    </label>
  );
  if (!plek) return null;
  return createPortal(
    <aside
      className="tw-zoekpaneel"
      role="search"
      aria-label={t("find.pane.label")}
      style={{ left: plek.left, top: plek.top, maxHeight: plek.height }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          sluit();
        }
      }}
    >
      <header>
        <h2>{vervangen ? t("find.pane.titleReplace") : t("find.pane.titleFind")}</h2>
        <button type="button" className="tw-zoek-wissel" onClick={() => zetPaneel(api, { zoeken: vervangen ? "zoeken" : "vervangen" })}>
          {vervangen ? t("find.pane.findOnly") : t("find.pane.showReplace")}
        </button>
        <button type="button" className="tw-zoek-sluit" aria-label={t("common:close")} title={t("common:closeEsc")} onClick={sluit}>
          <X size={15} />
        </button>
      </header>
      <div className="tw-zoek-rij">
        <input
          ref={zoekVeld}
          type="search"
          aria-label={t("find.pane.findWhat")}
          placeholder={t("find.pane.findPlaceholder")}
          value={zoekTekst}
          onFocus={(e) => (laatsteVeld.current = e.currentTarget)}
          onChange={(e) => setZoekTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) vorige();
              else volgende();
            }
          }}
        />
        <button type="button" aria-label={t("find.pane.previousResult")} title={t("find.pane.previousTitle", { key: "Shift+Enter" })} onClick={vorige} disabled={!resultaten.length}>
          <ChevronUp size={15} />
        </button>
        <button type="button" aria-label={t("find.pane.nextResult")} title={t("find.pane.nextTitle", { key: "Enter" })} onClick={volgende} disabled={!resultaten.length}>
          <ChevronDown size={15} />
        </button>
      </div>
      {vervangen && (
        <div className="tw-zoek-rij">
          <input
            ref={vervangVeld}
            type="text"
            aria-label={t("find.pane.replaceWith")}
            placeholder={t("find.pane.replaceWith")}
            value={vervangTekst}
            onFocus={(e) => (laatsteVeld.current = e.currentTarget)}
            onChange={(e) => setVervangTekst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void vervangEen();
              }
            }}
          />
        </div>
      )}
      {vervangen && (
        <div className="tw-zoek-knoppen">
          <button type="button" disabled={!bewerkbaar || !resultaten.length} onClick={() => void vervangEen()}>
            {t("find.pane.replace")}
          </button>
          <button type="button" disabled={!bewerkbaar || !resultaten.length} onClick={() => void vervangAlles()}>
            {t("find.pane.replaceAll")}
          </button>
        </div>
      )}
      <div className="tw-zoek-opties">
        <label>
          <input type="checkbox" checked={!!opties.hoofdlettergevoelig} disabled={opties.jokertekens} onChange={(e) => setOpties({ ...opties, hoofdlettergevoelig: e.target.checked })} />
          {t("find.pane.matchCase")}
        </label>
        <label>
          <input type="checkbox" checked={!!opties.heleWoorden} disabled={opties.jokertekens} onChange={(e) => setOpties({ ...opties, heleWoorden: e.target.checked })} />
          {t("find.pane.wholeWords")}
        </label>
        <label>
          <input type="checkbox" checked={!!opties.jokertekens} onChange={(e) => setOpties({ ...opties, jokertekens: e.target.checked, regex: false })} />
          {t("find.pane.wildcards")}
        </label>
        <label>
          <input type="checkbox" checked={!!opties.regex} onChange={(e) => setOpties({ ...opties, regex: e.target.checked, jokertekens: false })} />
          {t("find.pane.regex")}
        </label>
      </div>
      <details className="tw-zoek-meer" open={meer} onToggle={(e) => setMeer((e.target as HTMLDetailsElement).open)}>
        <summary>{metOpmaak ? t("find.pane.specialAndFormatActive") : t("find.pane.specialAndFormat")}</summary>
        <div className="tw-zoek-speciaal" role="group" aria-label={t("find.pane.insertSpecial")}>
          {SPECIAAL.filter(([, , alleenVervangen]) => !alleenVervangen || vervangen).map(([code, sleutel]) => {
            const naam = t(`find.special.${sleutel}`);
            return (
              <button key={code} type="button" title={naam} onMouseDown={(e) => e.preventDefault()} onClick={() => voegIn(code)}>
                <code>{code}</code> {naam}
              </button>
            );
          })}
        </div>
        <div className="tw-zoek-opmaakrij">
          {keuze(t("find.pane.bold"), vet, setVet)}
          {keuze(t("find.pane.italic"), cursief, setCursief)}
          {keuze(t("find.pane.underline"), onderstreept, setOnderstreept)}
          <label className="tw-zoek-opmaak">
            <span>{t("find.pane.style")}</span>
            <select value={stijl} onChange={(e) => setStijl(e.target.value)}>
              <option value="">{t("find.pane.any")}</option>
              {stijlen.map((o) => (
                <option key={o.args.styleId} value={o.args.styleId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="tw-zoek-hulp">
          <Trans t={t} i18nKey="find.pane.wildcardHelp" shouldUnescape components={{ c: <code /> }} />
        </p>
      </details>
      <p className="tw-zoek-telling" role="status" aria-live="polite">
        {resultaten.length
          ? huidig >= 0
            ? t("find.pane.resultPosition", { count: resultaten.length, current: formatGetal(huidig + 1), number: formatGetal(resultaten.length) })
            : t("find.pane.resultCount", { count: resultaten.length, number: formatGetal(resultaten.length) })
          : melding}
        {resultaten.length > 0 && melding && <span> · {melding}</span>}
      </p>
      <ol className="tw-zoek-resultaten" aria-label={t("find.pane.results")}>
        {resultaten.slice(0, 500).map((r, i) => (
          <li key={i}>
            <button type="button" aria-current={i === huidig} onClick={() => ga(i)}>
              <span className="tw-zoek-plek">{r.plek}</span>
              <span>
                {r.context.voor}
                <mark>{r.context.treffer}</mark>
                {r.context.na}
              </span>
            </button>
          </li>
        ))}
        {resultaten.length > 500 && <li className="tw-zoek-plek">{t("find.pane.more", { number: formatGetal(resultaten.length - 500) })}</li>}
      </ol>
    </aside>,
    document.body,
  );
}

/** Soorten met hun sleutel onder `writer:find.goTo.kinds` (name, number, list, none). */
const SOORTEN: { soort: Doelsoort; sleutel: string; lijst: boolean }[] = [
  { soort: "pagina", sleutel: "page", lijst: false },
  { soort: "sectie", sleutel: "section", lijst: false },
  { soort: "regel", sleutel: "line", lijst: false },
  { soort: "kop", sleutel: "heading", lijst: true },
  { soort: "tabel", sleutel: "table", lijst: true },
  { soort: "afbeelding", sleutel: "picture", lijst: true },
  { soort: "opmerking", sleutel: "comment", lijst: true },
];
const sleutelVan = (soort: Doelsoort) => SOORTEN.find((s) => s.soort === soort)!.sleutel;

function GaNaarVenster({ sluit }: { sluit: () => void }) {
  const api = useEditorApi().tekst;
  const { t } = useTranslation("writer");
  const [soort, setSoort] = useState<Doelsoort>("pagina");
  const [lijst, setLijst] = useState<Doel[]>([]);
  const [invoer, setInvoer] = useState("");
  const [gekozen, setGekozen] = useState(0);
  const [melding, setMelding] = useState("");
  const [bezocht, setBezocht] = useState(false);
  const huidigeSoort = SOORTEN.find((s) => s.soort === soort)!;
  /** Vorige/volgende: bij pagina's vanaf de huidige pagina, anders vanaf het laatst bezochte doel. */
  function stap(richting: 1 | -1) {
    const ref = api();
    if (!ref || !lijst.length) return;
    const basis = soort === "pagina" ? (ref.getCurrentPage() || 1) - 1 : bezocht ? gekozen : richting === 1 ? -1 : lijst.length;
    ga(lijst[Math.max(0, Math.min(lijst.length - 1, basis + richting))]);
  }
  useEffect(() => {
    const ref = api();
    if (!ref) return;
    let actief = true;
    void doelen(ref, soort)
      .then((d) => {
        if (!actief) return;
        setLijst(d);
        setGekozen(0);
        setBezocht(false);
        setMelding(d.length ? "" : t(`find.goTo.kinds.${sleutelVan(soort)}.none`));
      })
      .catch((e) => actief && setMelding(fout(e)));
    return () => {
      actief = false;
    };
  }, [soort, api]);
  const nummer = leesNummer(invoer, api() ? huidigNummer(api()!, soort) || gekozen + 1 : 1, lijst.length);
  function ga(doel: Doel | undefined) {
    const ref = api();
    if (!ref || !doel) return;
    try {
      doel.ga(ref);
      setGekozen(doel.nr - 1);
      setBezocht(true);
      setMelding(`${doel.label.trim()}`);
    } catch (e) {
      setMelding(fout(e));
    }
  }
  function gaNaarInvoer() {
    if (huidigeSoort.lijst && !invoer.trim()) return ga(lijst[gekozen]);
    if (nummer === null) return setMelding(t("find.goTo.enterNumber", { max: lijst.length }));
    ga(lijst[nummer - 1]);
    sluit();
  }
  return (
    <Dialoog
      titel={t("find.goTo.title")}
      sluit={sluit}
      className="tw-venster is-breed"
      acties={
        <>
          <span className="werkruimte-melding" role="status">
            {melding}
          </span>
          <button type="button" className="werkruimte-knop" disabled={!lijst.length} onClick={() => stap(-1)}>
            {t("find.goTo.previous")}
          </button>
          <button type="button" className="werkruimte-knop" disabled={!lijst.length} onClick={() => stap(1)}>
            {t("find.goTo.next")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!lijst.length} onClick={gaNaarInvoer}>
            {t("find.goTo.go")}
          </button>
        </>
      }
    >
      <div className="tw-ganaar">
        <div role="listbox" aria-label={t("find.goTo.what")} className="tw-ganaar-soorten">
          {SOORTEN.map((s) => (
            <button key={s.soort} type="button" role="option" aria-selected={s.soort === soort} onClick={() => setSoort(s.soort)}>
              {t(`find.goTo.kinds.${s.sleutel}.name`)}
            </button>
          ))}
        </div>
        <div className="tw-ganaar-doel">
          <label className="werkruimte-veld">
            <span>
              {lijst.length
                ? t("find.goTo.numberWithRange", { label: t(`find.goTo.kinds.${huidigeSoort.sleutel}.number`), max: lijst.length })
                : t(`find.goTo.kinds.${huidigeSoort.sleutel}.number`)}
            </span>
            <input
              type="text"
              inputMode="numeric"
              data-autofocus=""
              value={invoer}
              placeholder={soort === "pagina" ? t("find.goTo.pagePlaceholder") : t("find.goTo.numberPlaceholder")}
              onChange={(e) => setInvoer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  gaNaarInvoer();
                }
              }}
            />
          </label>
          {huidigeSoort.lijst && lijst.length > 0 && (
            <ul className="tw-ganaar-lijst" aria-label={t(`find.goTo.kinds.${huidigeSoort.sleutel}.list`)}>
              {lijst.map((d, i) => (
                <li key={i}>
                  <button type="button" aria-current={i === gekozen} onClick={() => ga(d)} onDoubleClick={() => (ga(d), sluit())}>
                    {d.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialoog>
  );
}
