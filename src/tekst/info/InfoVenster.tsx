/**
 * Bestand › Info: documenteigenschappen lezen en wijzigen. Wijzigingen gaan
 * bij de volgende keer opslaan in docProps/core.xml (zonder herladen); de
 * statistieken en de bewerkingstijd werkt het opslaan zelf bij.
 */
import { useEffect, useState } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18next from "../../i18n/config";
import { formatDatumTijd, formatGetal } from "../../i18n/opmaak";
import type { Herladen } from "../../lint/editorApi";
import { telTekst } from "../../lint/tekst-logica";
import { Dialoog } from "../../werkruimte/Dialoog";
import { leesEigenschappen, type DocumentEigenschappen, type KernEigenschappen } from "./docprops";
import { sessieMinuten, wachtendeEigenschappen, zetEigenschappen } from "./opslaan";

/** Velden; de weergavenaam is `writer:info.properties.fields.<sleutel>`. */
const VELDEN: { sleutel: keyof KernEigenschappen; lang?: boolean }[] = [
  { sleutel: "titel" },
  { sleutel: "onderwerp" },
  { sleutel: "auteur" },
  { sleutel: "trefwoorden" },
  { sleutel: "categorie" },
  { sleutel: "status" },
  { sleutel: "opmerkingen", lang: true },
];

const getal = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatGetal(n));
export function datumTekst(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatDatumTijd(d, { dateStyle: "long", timeStyle: "short" });
}
function duur(minuten: number, t: TFunction = i18next.t) {
  if (minuten < 60) return t("writer:info.properties.minutes", { minutes: formatGetal(minuten) });
  const uur = Math.floor(minuten / 60);
  return t("writer:info.properties.hoursMinutes", { hours: formatGetal(uur), minutes: formatGetal(minuten % 60) });
}

export function InfoVenster({
  api,
  herlaad,
  sluit,
  inspecteren,
}: {
  api: () => DocxEditorRef | null;
  herlaad: Herladen | null;
  sluit: () => void;
  inspecteren: () => void;
}) {
  const [eigenschappen, setEigenschappen] = useState<DocumentEigenschappen | null>(null);
  const [velden, setVelden] = useState<KernEigenschappen | null>(null);
  const [telling, setTelling] = useState<{ woorden: number; tekens: number; tekensMetSpaties: number; alineas: number; paginas: number } | null>(null);
  const [fout, setFout] = useState("");
  const { t } = useTranslation("writer");

  useEffect(() => {
    let actief = true;
    void (async () => {
      try {
        if (!herlaad) throw new Error(i18next.t("writer:info.properties.notAvailable"));
        const e = leesEigenschappen(await herlaad.bytes());
        if (!actief) return;
        const wachtend = wachtendeEigenschappen(herlaad);
        setEigenschappen(e);
        setVelden({
          titel: e.titel,
          onderwerp: e.onderwerp,
          auteur: e.auteur,
          trefwoorden: e.trefwoorden,
          opmerkingen: e.opmerkingen,
          categorie: e.categorie,
          status: e.status,
          ...wachtend,
        });
        const ref = api();
        if (ref) {
          const gelezen = await ref.readParagraphs({ view: "accepted" });
          if (gelezen.ok && actief) {
            const t = telTekst(gelezen.paragraphs.map((a) => a.text));
            setTelling({ woorden: t.woorden, tekens: t.tekensZonderSpaties, tekensMetSpaties: t.tekens, alineas: t.alineas, paginas: ref.getTotalPages() || ref.getCurrentPage() });
          }
        }
      } catch (error) {
        if (actief) setFout(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  function toepassen() {
    if (!herlaad || !velden || !eigenschappen) return;
    const wachtend = wachtendeEigenschappen(herlaad);
    const wijziging: Partial<KernEigenschappen> = {};
    for (const { sleutel } of VELDEN) {
      const oud = wachtend[sleutel] ?? eigenschappen[sleutel];
      if (velden[sleutel] !== oud) wijziging[sleutel] = velden[sleutel];
    }
    if (Object.keys(wijziging).length) zetEigenschappen(herlaad, wijziging);
    sluit();
  }

  const minuten = (eigenschappen?.bewerkingstijd ?? 0) + sessieMinuten(herlaad);
  return (
    <Dialoog
      titel={t("info.properties.title")}
      sluit={sluit}
      className="tekst-info"
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={inspecteren} style={{ marginInlineEnd: "auto" }}>
            <ShieldCheck size={14} aria-hidden="true" /> {t("info.properties.inspect")}
          </button>
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!velden} onClick={toepassen}>
            {t("common:apply")}
          </button>
        </>
      }
    >
      {fout && <p className="werkruimte-fout" role="alert">{fout}</p>}
      {!velden ? (
        !fout && <p className="werkruimte-uitleg">{t("info.properties.reading")}</p>
      ) : (
        <div className="tekst-info-kolommen">
          <fieldset className="werkruimte-groep">
            <legend>{t("info.properties.properties")}</legend>
            {VELDEN.map(({ sleutel, lang }) => (
              <label key={sleutel} className="werkruimte-veld">
                <span>{t(`info.properties.fields.${sleutel}`)}</span>
                {lang ? (
                  <textarea
                    rows={3}
                    value={velden[sleutel]}
                    onChange={(e) => setVelden({ ...velden, [sleutel]: e.target.value })}
                  />
                ) : (
                  <input
                    type="text"
                    value={velden[sleutel]}
                    data-autofocus={sleutel === "titel" ? true : undefined}
                    onChange={(e) => setVelden({ ...velden, [sleutel]: e.target.value })}
                  />
                )}
              </label>
            ))}
            <p className="werkruimte-uitleg">{t("info.properties.savedOnNextSave")}</p>
          </fieldset>
          <div>
            <fieldset className="werkruimte-groep">
              <legend>{t("info.properties.statistics")}</legend>
              <dl className="tekst-info-lijst">
                <dt>{t("info.properties.pages")}</dt>
                <dd>{getal(telling?.paginas ?? eigenschappen?.paginas)}</dd>
                <dt>{t("info.properties.words")}</dt>
                <dd>{getal(telling?.woorden ?? eigenschappen?.woorden)}</dd>
                <dt>{t("info.properties.charactersNoSpaces")}</dt>
                <dd>{getal(telling?.tekens ?? eigenschappen?.tekens)}</dd>
                <dt>{t("info.properties.charactersWithSpaces")}</dt>
                <dd>{getal(telling?.tekensMetSpaties ?? eigenschappen?.tekensMetSpaties)}</dd>
                <dt>{t("info.properties.paragraphs")}</dt>
                <dd>{getal(telling?.alineas ?? eigenschappen?.alineas)}</dd>
                <dt>{t("info.properties.editingTime")}</dt>
                <dd>{duur(minuten, t)}</dd>
              </dl>
            </fieldset>
            <fieldset className="werkruimte-groep">
              <legend>{t("info.properties.datesAndPeople")}</legend>
              <dl className="tekst-info-lijst">
                <dt>{t("info.properties.created")}</dt>
                <dd>{datumTekst(eigenschappen?.aangemaakt)}</dd>
                <dt>{t("info.properties.lastModified")}</dt>
                <dd>{datumTekst(eigenschappen?.gewijzigd)}</dd>
                <dt>{t("info.properties.lastModifiedBy")}</dt>
                <dd>{eigenschappen?.laatstGewijzigdDoor || "—"}</dd>
                <dt>{t("info.properties.revision")}</dt>
                <dd>{getal(eigenschappen?.revisie)}</dd>
                {eigenschappen?.toepassing && (
                  <>
                    <dt>{t("info.properties.application")}</dt>
                    <dd>{eigenschappen.toepassing}</dd>
                  </>
                )}
                {eigenschappen?.bedrijf && (
                  <>
                    <dt>{t("info.properties.company")}</dt>
                    <dd>{eigenschappen.bedrijf}</dd>
                  </>
                )}
              </dl>
            </fieldset>
          </div>
        </div>
      )}
    </Dialoog>
  );
}
