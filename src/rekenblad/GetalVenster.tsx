/** Celeigenschappen › Getal (#64): categorieën, keuzes, eigen code en voorbeeld. */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { NumberFormatMutation, XlsxCellValue } from "@betteroffice/xlsx";
import { useOpmaak } from "../i18n/opmaak";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { leesSelectie, Melding } from "../lint/rekenblad-opdrachten";
import {
  BREUKCODES,
  bouwCode,
  CATEGORIEEN,
  DATUMCODES,
  herkenCode,
  NEGATIEF,
  TIJDCODES,
  VALUTA,
  type Categorie,
  type Keuzes,
} from "./getalnotatie";
import { laadGetalvoorbeelden, type Getalvoorbeelden } from "./getalvoorbeeld";
import { leesWerkmapinstelling, WERKMAPREGIOS, type Werkmapregio } from "./werkmapregio";
import { bewaarGetalopmaak, leesGetalcode } from "./getalopmaak";
import { standaardValuta } from "./notatieOpdrachten";

/** Veelgebruikte codes om een eigen code mee te beginnen. */
const VOORBEELDCODES = [
  "General",
  "0",
  "0.00",
  "#,##0",
  "#,##0.00",
  "#,##0.00;[Red]-#,##0.00",
  "#,##0.00_);(#,##0.00)",
  "0%",
  "0.00%",
  "0.00E+00",
  "# ?/?",
  '0.00" kg"',
  '#,##0" m²"',
  "[$€-413] #,##0.00",
  "d-m-yyyy",
  "dd-mm-yy",
  "d mmm yyyy",
  "[h]:mm",
  "@",
];

function leesHuidige(api: XlsxEditorApi) {
  const { blad, sheetId, bereik, focus } = leesSelectie(api);
  const code = leesGetalcode(api, blad, focus);
  let waarde: XlsxCellValue = { kind: "empty" };
  const lezing = api.handle.readCells({
    ranges: [
      {
        sheetId,
        range: { kind: "rowCol", start: focus, end: focus },
      },
    ],
  });
  if (lezing.ok) waarde = lezing.ranges[0].cells[0]?.[0]?.value ?? waarde;
  return { code, waarde, sheetId, bereik, versie: api.handle.version(), ...leesWerkmapinstelling(api) };
}

export function GetalVenster({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const opmaak = useOpmaak();

  const [huidig] = useState(() => {
    try {
      return leesHuidige(api);
    } catch {
      return null;
    }
  });
  const [regio, setRegio] = useState<Werkmapregio>(huidig?.regio ?? "en-GB");
  const regiotekst = useMemo(() => new Intl.DisplayNames([opmaak.locale], { type: "language" }), [opmaak.locale]);
  const [kernvoorbeeld, setKernvoorbeeld] = useState<Getalvoorbeelden | null>(null);
  const [start] = useState(() => herkenCode(huidig?.code ?? "General"));
  const [categorie, setCategorie] = useState<Categorie>(start.categorie);
  const [keuzes, setKeuzes] = useState<Keuzes>(() =>
    start.categorie === "valuta" || start.categorie === "boekhouding"
      ? start.keuzes
      : { ...start.keuzes, valuta: standaardValuta(regio) },
  );
  const [status, setStatus] = useState(huidig ? "" : t("numberFormat.selectCell"));
  useEffect(() => {
    let gesloten = false;
    let kern: Getalvoorbeelden | undefined;
    void laadGetalvoorbeelden().then((v) => {
      if (gesloten) { v.dispose(); return; }
      kern = v; setKernvoorbeeld(v);
    }).catch((fout) => { if (!gesloten) setStatus(tekstVan(fout)); });
    return () => { gesloten = true; kern?.dispose(); };
  }, []);
  const toon = (waarde: number | string, patroon: string) =>
    kernvoorbeeld?.toon(waarde, patroon, regio, huidig?.datumstelsel ?? "1900") ?? { tekst: "…" };
  const zet = (extra: Partial<Keuzes>) => setKeuzes((k) => ({ ...k, ...extra }));
  const code = bouwCode(categorie, keuzes);

  // Voorbeeld: de waarde van de actieve cel, anders een vast getal.
  const voorbeeldWaarde = useMemo(() => {
    const w = huidig?.waarde;
    if (w?.kind === "number") return w.value;
    if (w?.kind === "text") return w.value;
    return categorie === "datum" || categorie === "tijd" ? 46000.75 : 1234.5678;
  }, [huidig, categorie]);
  const voorbeeld = toon(voorbeeldWaarde, code);
  // Tweede regel: hetzelfde getal met het andere teken, zodat beide secties te zien zijn.
  const negatiefVoorbeeld =
    typeof voorbeeldWaarde === "number" && ["getal", "valuta", "boekhouding"].includes(categorie)
      ? toon(voorbeeldWaarde ? -voorbeeldWaarde : -1234.5678, code)
      : null;

  async function toepassen() {
    if (!huidig) return;
    const format: NumberFormatMutation =
      categorie === "algemeen"
        ? "automatic"
        : categorie === "tekst"
          ? "plainText"
          : { type: "custom", pattern: code };
    try {
      if (!code.trim()) throw new Melding(t("numberFormat.emptyCode"));
      await bewaarGetalopmaak(api, huidig, format, regio);
      sluiten();
    } catch (fout) {
      setStatus(tekstVan(fout));
    }
  }

  const decimalen = (
    <label>
      {t("numberFormat.decimals")}
      <input
        type="number"
        min={0}
        max={30}
        value={keuzes.decimalen}
        onChange={(e) => zet({ decimalen: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
      />
    </label>
  );
  const valuta = (
    <label>
      {t("numberFormat.symbol")}
      <select value={keuzes.valuta} onChange={(e) => zet({ valuta: e.target.value })}>
        {VALUTA.map((v) => (
          <option key={v.id} value={v.id}>
            {t(`numberFormat.currencies.${v.id}`)}
          </option>
        ))}
      </select>
    </label>
  );
  const negatief = (
    <fieldset>
      <legend>{t("numberFormat.negative")}</legend>
      {NEGATIEF.map((n) => {
        const proef = toon(-1234.1, bouwCode(categorie, { ...keuzes, negatief: n }));
        return (
          <label key={n} className="rekenblad-radio">
            <input
              type="radio"
              name="rekenblad-negatief"
              checked={keuzes.negatief === n}
              onChange={() => zet({ negatief: n })}
            />
            <span style={{ color: proef.kleur }}>{proef.tekst.trim()}</span>
          </label>
        );
      })}
    </fieldset>
  );
  const codelijst = (lijst: string[], waarde: string, kies: (code: string) => void, label: string) => (
    <ul className="rekenblad-lijst" role="listbox" aria-label={label}>
      {lijst.map((c) => (
        <li key={c}>
          <button
            type="button"
            role="option"
            aria-selected={c === waarde}
            onClick={() => kies(c)}
          >
            {toon(categorie === "breuk" ? 1.75 : 46000.75, c).tekst}
          </button>
        </li>
      ))}
    </ul>
  );

  let opties: React.ReactNode = null;
  switch (categorie) {
    case "algemeen":
      opties = <p className="rekenblad-hint">{t("numberFormat.generalHint")}</p>;
      break;
    case "getal":
      opties = (
        <>
          {decimalen}
          <label className="rekenblad-vinkje">
            <input
              type="checkbox"
              checked={keuzes.duizendtal}
              onChange={(e) => zet({ duizendtal: e.target.checked })}
            />
            {t("numberFormat.thousands", { separator: new Intl.NumberFormat(regio).formatToParts(1000).find((p) => p.type === "group")?.value ?? "," })}
          </label>
          {negatief}
        </>
      );
      break;
    case "valuta":
      opties = (
        <>
          <div className="rekenblad-raster">
            {decimalen}
            {valuta}
          </div>
          {negatief}
        </>
      );
      break;
    case "boekhouding":
      opties = (
        <>
          <div className="rekenblad-raster">
            {decimalen}
            {valuta}
          </div>
          <p className="rekenblad-hint">{t("numberFormat.accountingHint")}</p>
        </>
      );
      break;
    case "percentage":
    case "wetenschappelijk":
      opties = decimalen;
      break;
    case "datum":
      opties = codelijst(DATUMCODES, keuzes.datum, (datum) => zet({ datum }), t("numberFormat.type"));
      break;
    case "tijd":
      opties = codelijst(TIJDCODES, keuzes.tijd, (tijd) => zet({ tijd }), t("numberFormat.type"));
      break;
    case "breuk":
      opties = (
        <>
          {codelijst(BREUKCODES, keuzes.breuk, (breuk) => zet({ breuk }), t("numberFormat.type"))}
          <p className="rekenblad-hint">{t("numberFormat.fractionHint")}</p>
        </>
      );
      break;
    case "tekst":
      opties = <p className="rekenblad-hint">{t("numberFormat.textHint")}</p>;
      break;
    case "aangepast":
      opties = (
        <>
          <label>
            {t("numberFormat.code")}
            <input
              value={keuzes.code}
              spellCheck={false}
              onChange={(e) => zet({ code: e.target.value })}
            />
          </label>
          <ul className="rekenblad-lijst" role="listbox" aria-label={t("numberFormat.examples")}>
            {VOORBEELDCODES.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c === keuzes.code}
                  onClick={() => zet({ code: c })}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
          <p className="rekenblad-hint">{t("numberFormat.customHint")}</p>
        </>
      );
      break;
  }

  return (
    <Paneel titel={t("numberFormat.title")} sluiten={sluiten} breed>
      <form
        className="rekenblad-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void toepassen();
        }}
      >
        <div className="rekenblad-kolommen">
          <ul
            className="rekenblad-lijst"
            role="listbox"
            aria-label={t("numberFormat.category")}
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const i = CATEGORIEEN.indexOf(categorie);
              const volgende = CATEGORIEEN[(i + (e.key === "ArrowDown" ? 1 : -1) + CATEGORIEEN.length) % CATEGORIEEN.length];
              setCategorie(volgende);
              if (volgende === "aangepast") zet({ code });
              (e.currentTarget.querySelectorAll("button")[CATEGORIEEN.indexOf(volgende)] as HTMLElement)?.focus();
            }}
          >
            {CATEGORIEEN.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c === categorie}
                  tabIndex={c === categorie ? 0 : -1}
                  onClick={() => {
                    // Aangepast begint bij de code van nu.
                    if (c === "aangepast") zet({ code });
                    setCategorie(c);
                  }}
                >
                  {t(`numberFormat.categories.${c}`)}
                </button>
              </li>
            ))}
          </ul>
          <div className="rekenblad-formulier">
            <label>
              {t("numberFormat.workbookLocale")}
              <select value={regio} onChange={(e) => setRegio(e.target.value as Werkmapregio)}>
                {WERKMAPREGIOS.map((r) => <option key={r} value={r}>{regiotekst.of(r) ?? r}</option>)}
              </select>
            </label>
            <p className="rekenblad-hint">{t("numberFormat.localeHint")}</p>
            <div className="rekenblad-voorbeeld" aria-live="polite">
              <span className="rekenblad-hint">{t("numberFormat.preview")}</span>
              <output className={voorbeeld.kleur === "red" ? "is-rood" : undefined} style={voorbeeld.kleur && voorbeeld.kleur !== "red" ? { color: voorbeeld.kleur } : undefined}>
                {voorbeeld.tekst}
              </output>
              {negatiefVoorbeeld && (
                <output className={negatiefVoorbeeld.kleur === "red" ? "is-rood" : undefined}>
                  {negatiefVoorbeeld.tekst}
                </output>
              )}
              <span className="rekenblad-hint">
                {t("numberFormat.codeShown", { code })}
              </span>
            </div>
            {opties}
          </div>
        </div>
        <p className="rekenblad-hint">{t("numberFormat.engineNote")}</p>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair" disabled={!huidig || !kernvoorbeeld || !!voorbeeld.fout}>
            {t("common:ok")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status || voorbeeld.fout}
        </p>
      </form>
    </Paneel>
  );
}
