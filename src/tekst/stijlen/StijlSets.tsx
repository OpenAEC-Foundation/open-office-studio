/**
 * Stijlset en thema-lettertypen (eenvoudig): het lettertypepaar van het
 * thema (koppen/hoofdtekst) en de alinea-afstand van het document
 * (docDefaults). Stijlen die thema-lettertypen gebruiken veranderen mee.
 */
import { useMemo, useState } from "react";
import { useDocxCommand } from "@betteroffice/docx-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../i18n/opmaak";
import { Dialoog } from "../../werkruimte/Dialoog";
import { useStijlen } from "./StijlenBeheer";
import { wijzigDocStandaarden, wijzigThemaLettertypen } from "./stijlenxml";

/**
 * Lettertypeparen. `id` is stabiel; de weergavenaam komt uit
 * `writer:styles.sets.fontPair.<id>` (productnamen als "Office" blijven gelijk).
 */
export const LETTERTYPEPAREN: { id: string; koppen: string; tekst: string }[] = [
  { id: "office", koppen: "Calibri Light", tekst: "Calibri" },
  { id: "office2007", koppen: "Cambria", tekst: "Calibri" },
  { id: "classic", koppen: "Liberation Serif", tekst: "Liberation Serif" },
  { id: "modern", koppen: "Montserrat", tekst: "Inter" },
  { id: "report", koppen: "Source Serif 4", tekst: "Source Sans 3" },
  { id: "elegant", koppen: "Playfair Display", tekst: "Lato" },
  { id: "book", koppen: "EB Garamond", tekst: "EB Garamond" },
  { id: "technical", koppen: "IBM Plex Sans", tekst: "Noto Serif" },
  { id: "accessible", koppen: "Atkinson Hyperlegible", tekst: "Atkinson Hyperlegible" },
];

/**
 * Alinea-afstanden. `id` is stabiel; naam en uitleg komen uit
 * `writer:styles.sets.spacing.<id>` en `…spacingHint.<soort>`.
 */
export const AFSTANDEN: { id: string; ruimteNa: number; regelafstand: number }[] = [
  { id: "default", ruimteNa: 8, regelafstand: 1.08 },
  { id: "compact", ruimteNa: 4, regelafstand: 1 },
  { id: "noSpacing", ruimteNa: 0, regelafstand: 1 },
  { id: "relaxed", ruimteNa: 10, regelafstand: 1.15 },
  { id: "open", ruimteNa: 12, regelafstand: 1.5 },
  { id: "double", ruimteNa: 8, regelafstand: 2 },
];

export function StijlSets() {
  const { t } = useTranslation(["writer", "common"]);
  const { getal } = useOpmaak();
  const staat = useStijlen();
  const fonts = staat.thema?.fontScheme;
  const huidigKoppen = fonts?.majorFont?.latin ?? "";
  const huidigTekst = fonts?.minorFont?.latin ?? "";
  const beschikbaar = useDocxCommand("fontFamily").state.options ?? [];
  const [koppen, setKoppen] = useState(huidigKoppen);
  const [tekst, setTekst] = useState(huidigTekst);
  const [afstand, setAfstand] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const paar = useMemo(
    () => LETTERTYPEPAREN.findIndex((p) => p.koppen === koppen && p.tekst === tekst),
    [koppen, tekst],
  );
  const zonderThema = !staat.thema?.fontScheme;
  /** "8 pt na, regelafstand 1,08"; enkel/dubbel als woord. */
  const afstandUitleg = (a: (typeof AFSTANDEN)[number]) => {
    const na = getal(a.ruimteNa);
    if (a.regelafstand === 1) return t("styles.sets.spacingHint.single", { after: na });
    if (a.regelafstand === 2) return t("styles.sets.spacingHint.double", { after: na });
    if (a.id === "default") return t("styles.sets.spacingHint.withLabel", { after: na, lineSpacing: getal(a.regelafstand) });
    return t("styles.sets.spacingHint.multiple", { after: na, lineSpacing: getal(a.regelafstand) });
  };

  async function toepassen() {
    setBezig(true);
    setFout("");
    try {
      const veranderd = await staat.herlaadStijlen((o) => {
        const uit: { stijlen?: string; thema?: string } = {};
        if ((koppen !== huidigKoppen || tekst !== huidigTekst) && o.thema)
          uit.thema = wijzigThemaLettertypen(o.thema, {
            koppen: koppen.trim() || undefined,
            tekst: tekst.trim() || undefined,
          });
        if (afstand !== null) {
          const a = AFSTANDEN[afstand];
          uit.stijlen = wijzigDocStandaarden(o.stijlen, { ruimteNa: a.ruimteNa, regelafstand: a.regelafstand });
        }
        return uit;
      });
      if (!veranderd) setBezig(false);
      staat.sluit();
    } catch (error) {
      setBezig(false);
      setFout(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialoog
      titel={t("styles.sets.title")}
      sluit={staat.sluit}
      acties={
        <>
          {fout && <span className="werkruimte-melding werkruimte-fout" role="alert">{fout}</span>}
          <button type="button" className="werkruimte-knop" onClick={staat.sluit}>{t("common:cancel")}</button>
          <button type="button" className="werkruimte-knop is-primair" disabled={bezig} onClick={() => void toepassen()}>
            {t("common:apply")}
          </button>
        </>
      }
    >
      <fieldset className="werkruimte-groep" disabled={zonderThema}>
        <legend>{t("styles.sets.themeFonts")}</legend>
        {zonderThema && <p className="werkruimte-uitleg">{t("styles.sets.noTheme")}</p>}
        <label className="werkruimte-veld">
          <span>{t("styles.sets.fontPairLabel")}</span>
          <select
            value={paar}
            onChange={(e) => {
              const p = LETTERTYPEPAREN[Number(e.target.value)];
              if (p) {
                setKoppen(p.koppen);
                setTekst(p.tekst);
              }
            }}
          >
            <option value={-1}>{t("styles.sets.customChoice")}</option>
            {LETTERTYPEPAREN.map((p, i) => (
              <option key={p.id} value={i}>
                {t("styles.sets.fontPairOption", { name: t(`styles.sets.fontPair.${p.id}`), headings: p.koppen, body: p.tekst })}
              </option>
            ))}
          </select>
        </label>
        <label className="werkruimte-veld">
          <span>{t("styles.sets.headings")}</span>
          <input type="text" list="tekst-set-lettertypen" value={koppen} onChange={(e) => setKoppen(e.target.value)} />
        </label>
        <label className="werkruimte-veld">
          <span>{t("styles.sets.body")}</span>
          <input type="text" list="tekst-set-lettertypen" value={tekst} onChange={(e) => setTekst(e.target.value)} />
        </label>
        <datalist id="tekst-set-lettertypen">
          {beschikbaar.map((o) => (
            <option key={o.label} value={o.label} />
          ))}
        </datalist>
        <div className="tekst-set-voorbeeld" aria-hidden="true">
          <strong style={{ fontFamily: `"${koppen}", sans-serif` }}>{t("styles.sets.headingSample", { font: koppen || "—" })}</strong>
          <span style={{ fontFamily: `"${tekst}", sans-serif` }}>{t("styles.sets.bodySample", { font: tekst || "—" })}</span>
        </div>
        <p className="werkruimte-uitleg">{t("styles.sets.themeFontsHint")}</p>
      </fieldset>
      <fieldset className="werkruimte-groep">
        <legend>{t("styles.sets.spacingTitle")}</legend>
        <div className="werkruimte-keuzes">
          <label>
            <input type="radio" name="tekst-afstand" checked={afstand === null} onChange={() => setAfstand(null)} /> {t("styles.sets.dontChange")}
          </label>
          {AFSTANDEN.map((a, i) => (
            <label key={a.id} title={afstandUitleg(a)}>
              <input type="radio" name="tekst-afstand" checked={afstand === i} onChange={() => setAfstand(i)} /> {t(`styles.sets.spacing.${a.id}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="werkruimte-uitleg">{t("styles.reloadNotice")}</p>
    </Dialoog>
  );
}
