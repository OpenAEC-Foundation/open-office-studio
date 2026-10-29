/**
 * Instellingen volgens de OpenAEC-standaard (Style Book, SettingsDialog.tsx):
 * modal van 560 × 500 met een zijbalk van 120 px en tabs, voorbeeld bij elke
 * wijziging, Annuleren zet terug, Opslaan bewaart, en "Standaardwaarden
 * herstellen" met een bevestiging van 340 px. Teksten: namespace "settings".
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { ThemedSelect, Kleurstalen, type Keuze } from "./ThemedSelect";
import { toonSneltoetsen } from "./gebeurtenissen";
import {
  bewaarInstellingen,
  leesBewaardeInstellingen,
  pasToe,
  standaardInstellingen,
  toonVoorbeeld,
  type Instellingen,
  type Wijziging,
} from "../instellingen";
import { herstelInterval, INTERVAL_SLEUTEL, STANDAARD_INTERVAL_MINUTEN } from "../herstel";
import { useWoordenlijsten } from "../spelling/woordenlijst";
import {
  conversieStatus,
  kiesConversieprogramma,
  wisConversieprogramma,
  type ConversieStatus,
} from "../formaten";
import { TAALCODES, TAALNAMEN, bepaalTaal, type TaalKeuze } from "../i18n/talen";
import versie from "../../versie.json";
import "./InstellingenVenster.css";

/** Dezelfde sleutel als de auteursnaam in Tekst (src/lint/tekst-opdrachten.tsx). */
const AUTEUR = "open-tekst-auteur";
function leesAuteur() {
  try {
    return localStorage.getItem(AUTEUR) ?? "";
  } catch {
    return "";
  }
}

export const TABS = ["algemeen", "uiterlijk", "bewerken", "email", "over"] as const;
type Tab = (typeof TABS)[number];

/** Thema's met vier kleurstalen (achtergrond, paneel, accent, tekst) zoals in het Style Book. */
const THEMAS: { waarde: Instellingen["thema"]; stalen: string[] }[] = [
  { waarde: "light", stalen: ["#FAFAF9", "#FFFFFF", "#D97706", "#36363E"] },
  { waarde: "forge", stalen: ["#36363E", "#2A2A32", "#D97706", "#FAFAF9"] },
  { waarde: "systeem", stalen: ["#FAFAF9", "#36363E", "#D97706", "#A1A1AA"] },
];

const FORMATEN: { soort: keyof Instellingen["opslagformaat"]; opties: [string, string][] }[] = [
  { soort: "docx", opties: [["docx", "Word (.docx)"], ["odt", "OpenDocument (.odt)"]] },
  { soort: "xlsx", opties: [["xlsx", "Excel (.xlsx)"], ["ods", "OpenDocument (.ods)"]] },
  { soort: "pptx", opties: [["pptx", "PowerPoint (.pptx)"], ["odp", "OpenDocument (.odp)"]] },
];

const STATUSITEMS: (keyof Instellingen["statusbalk"])[] = [
  "zoom",
  "tekst",
  "taal",
  "bijhouden",
  "weergave",
  "rekenblad",
  "presentatie",
  "database",
];

const SPELLING: (keyof Instellingen["spelling"])[] = [
  "controleren",
  "hoofdletterwoordenNegeren",
  "cijferwoordenNegeren",
  "autocorrectie",
];

/** Concept van alles wat Opslaan bewaart. */
interface Concept {
  instellingen: Instellingen;
  auteur: string;
  /** Herstelinterval in minuten, als tekst uit het invoerveld. */
  interval: string;
}

const leesConcept = (): Concept => ({
  instellingen: leesBewaardeInstellingen(),
  auteur: leesAuteur(),
  interval: String(herstelInterval() / 60_000),
});

export function InstellingenVenster({ sluit }: { sluit: () => void }) {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const [tab, setTab] = useState<Tab>("algemeen");
  const [concept, setConcept] = useState<Concept>(leesConcept);
  const [herstellen, setHerstellen] = useState(false);
  const [fout, setFout] = useState("");

  // Sluit het venster op een andere manier (Ctrl+, nogmaals), dan vervalt het voorbeeld.
  useEffect(() => () => toonVoorbeeld(null), []);

  const wijzig = (wijziging: Wijziging) => {
    const instellingen = pasToe(concept.instellingen, wijziging);
    setConcept({ ...concept, instellingen });
    toonVoorbeeld(instellingen);
  };

  const annuleer = () => {
    toonVoorbeeld(null);
    sluit();
  };

  const bewaar = () => {
    try {
      localStorage.setItem(AUTEUR, concept.auteur);
      const minuten = Number(concept.interval);
      if (concept.interval !== "" && Number.isFinite(minuten))
        localStorage.setItem(INTERVAL_SLEUTEL, String(Math.min(60, Math.max(1, Math.round(minuten)))));
    } catch {
      setFout(t("saveFailed"));
      return;
    }
    bewaarInstellingen(concept.instellingen);
    sluit();
  };

  const herstel = () => {
    // Alleen het concept; pas Opslaan bewaart het (zoals in de template).
    const instellingen = standaardInstellingen;
    setConcept({ ...concept, instellingen, interval: String(STANDAARD_INTERVAL_MINUTEN) });
    toonVoorbeeld(instellingen);
    setHerstellen(false);
  };

  const voet = (
    <>
      <button type="button" className="oa-knop" onClick={() => setHerstellen(true)}>
        {t("resetToDefaults")}
      </button>
      <span className="instellingen-fout" role="alert">
        {fout}
      </span>
      <div className="instellingen-voet-rechts">
        <button type="button" className="oa-knop" onClick={annuleer}>
          {tc("cancel")}
        </button>
        <button type="button" className="oa-knop is-primair" onClick={bewaar}>
          {tc("save")}
        </button>
      </div>
    </>
  );

  return (
    <>
      <Modal
        titel={t("title")}
        sluit={annuleer}
        breedte={560}
        hoogte={500}
        className="instellingen-venster"
        voet={voet}
      >
        <div className="instellingen-lichaam">
          <div className="instellingen-zijbalk" role="tablist" aria-orientation="vertical" aria-label={t("title")}>
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`instellingen-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="instellingen-paneel"
                tabIndex={tab === id ? 0 : -1}
                className={`instellingen-tab${tab === id ? " active" : ""}`}
                data-autofocus={tab === id && id === "algemeen" ? "" : undefined}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  const i = TABS.indexOf(id);
                  const volgende =
                    e.key === "ArrowDown" ? TABS[(i + 1) % TABS.length]
                    : e.key === "ArrowUp" ? TABS[(i - 1 + TABS.length) % TABS.length]
                    : e.key === "Home" ? TABS[0]
                    : e.key === "End" ? TABS[TABS.length - 1]
                    : null;
                  if (!volgende) return;
                  e.preventDefault();
                  setTab(volgende);
                  document.getElementById(`instellingen-tab-${volgende}`)?.focus();
                }}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
          <div
            className="instellingen-inhoud"
            id="instellingen-paneel"
            role="tabpanel"
            aria-labelledby={`instellingen-tab-${tab}`}
          >
            {tab === "algemeen" && (
              <Algemeen concept={concept} setConcept={setConcept} wijzig={wijzig} />
            )}
            {tab === "uiterlijk" && <Uiterlijk instellingen={concept.instellingen} wijzig={wijzig} />}
            {tab === "bewerken" && <Bewerken instellingen={concept.instellingen} wijzig={wijzig} />}
            {tab === "email" && <Email instellingen={concept.instellingen} wijzig={wijzig} />}
            {tab === "over" && <Over />}
          </div>
        </div>
      </Modal>

      {herstellen && (
        <Modal
          titel={t("resetToDefaults")}
          sluit={() => setHerstellen(false)}
          breedte={340}
          rol="alertdialog"
          className="instellingen-bevestiging"
          voet={
            <>
              <button type="button" className="oa-knop" onClick={() => setHerstellen(false)} data-autofocus="">
                {tc("cancel")}
              </button>
              <button type="button" className="oa-knop is-primair" onClick={herstel}>
                {t("resetToDefaults")}
              </button>
            </>
          }
        >
          <p className="instellingen-bevestigtekst">{t("resetConfirm")}</p>
        </Modal>
      )}
    </>
  );
}

function Sectie({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="instellingen-sectie">
      <h3>{titel}</h3>
      {children}
    </section>
  );
}

function Rij({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return (
    <div className="instellingen-rij">
      {id ? (
        <label className="instellingen-label" htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className="instellingen-label">{label}</span>
      )}
      {children}
    </div>
  );
}

function Vink({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (waarde: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="instellingen-vink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function Algemeen({
  concept,
  setConcept,
  wijzig,
}: {
  concept: Concept;
  setConcept: (concept: Concept) => void;
  wijzig: (wijziging: Wijziging) => void;
}) {
  const { t } = useTranslation("settings");
  const id = useId();
  const { instellingen } = concept;
  const automatisch = bepaalTaal("auto");
  const talen: Keuze<TaalKeuze>[] = [
    {
      waarde: "auto",
      label: t("general.languageAuto", { language: TAALNAMEN[automatisch] }),
    },
    ...TAALCODES.map((code) => ({
      waarde: code,
      label: TAALNAMEN[code],
      lang: code,
      extra: t(`languages.${code}`),
    })),
  ];
  const getoond = bepaalTaal(instellingen.taal);
  return (
    <>
      <Sectie titel={t("general.application")}>
        <Rij label={t("general.language")}>
          <ThemedSelect
            label={t("general.language")}
            waarde={instellingen.taal}
            keuzes={talen}
            onChange={(taal) => wijzig({ taal })}
            stijl={{ width: 220 }}
            zoekbaar
            zoekLabel={t("general.languageSearch")}
            geenResultaat={t("general.languageNone")}
          />
        </Rij>
        {getoond !== "nl" && getoond !== "en" && (
          <p className="instellingen-uitleg">{t("general.machineTranslation")}</p>
        )}
      </Sectie>

      <Sectie titel={t("general.saving")}>
        <p className="instellingen-uitleg">{t("general.formatsHelp")}</p>
        {FORMATEN.map(({ soort, opties }) => (
          <Rij key={soort} label={t(`general.format.${soort}`)}>
            <ThemedSelect
              label={t(`general.format.${soort}`)}
              waarde={instellingen.opslagformaat[soort]}
              keuzes={opties.map(([waarde, label]) => ({ waarde, label }))}
              onChange={(waarde) =>
                wijzig({ opslagformaat: { [soort]: waarde } as Partial<Instellingen["opslagformaat"]> })
              }
              stijl={{ width: 220 }}
            />
          </Rij>
        ))}
        <Rij label={t("general.recoveryInterval")} id={`${id}-herstel`}>
          <span className="instellingen-eenheid">
            <input
              id={`${id}-herstel`}
              className="instellingen-invoer"
              type="number"
              min={1}
              max={60}
              step={1}
              value={concept.interval}
              aria-describedby={`${id}-herstel-uitleg`}
              onChange={(e) => setConcept({ ...concept, interval: e.target.value })}
            />
            {t("general.minutes")}
          </span>
        </Rij>
        <p id={`${id}-herstel-uitleg`} className="instellingen-uitleg">
          {t("general.recoveryHelp")}
        </p>
        <Rij label={t("general.authorName")} id={`${id}-auteur`}>
          <input
            id={`${id}-auteur`}
            className="instellingen-invoer is-breed"
            type="text"
            value={concept.auteur}
            autoComplete="name"
            onChange={(e) => setConcept({ ...concept, auteur: e.target.value })}
          />
        </Rij>
      </Sectie>

      <Sectie titel={t("general.converter")}>
        <Conversie />
      </Sectie>
    </>
  );
}

function Conversie() {
  const { t } = useTranslation("settings");
  const desktop = "__TAURI_INTERNALS__" in window;
  const [status, setStatus] = useState<ConversieStatus | null>(null);
  const [fout, setFout] = useState("");
  useEffect(() => {
    if (!desktop) return;
    conversieStatus()
      .then(setStatus)
      .catch((e) => setFout(String(e)));
  }, [desktop]);
  if (!desktop) return <p className="instellingen-uitleg">{t("general.converterBrowser")}</p>;
  return (
    <>
      <p className="instellingen-uitleg" role="status">
        {status === null
          ? t("general.converterLoading")
          : status.gevonden
            ? t(status.bron === "instelling" ? "general.converterFoundChosen" : "general.converterFoundAuto", {
                path: status.pad ?? "soffice",
                version: status.versie ? ` (${status.versie})` : "",
              })
            : t("general.converterMissing")}
      </p>
      {fout && <p className="instellingen-fout">{fout}</p>}
      <div className="instellingen-knoppen">
        <button
          type="button"
          className="oa-knop"
          onClick={() =>
            kiesConversieprogramma()
              .then((nieuw) => nieuw && setStatus(nieuw))
              .catch((e) => setFout(String(e)))
          }
        >
          {t("general.converterChoose")}
        </button>
        <button
          type="button"
          className="oa-knop"
          disabled={status?.bron !== "instelling"}
          onClick={() =>
            wisConversieprogramma()
              .then(setStatus)
              .catch((e) => setFout(String(e)))
          }
        >
          {t("general.converterAuto")}
        </button>
      </div>
    </>
  );
}

function Uiterlijk({ instellingen, wijzig }: { instellingen: Instellingen; wijzig: (w: Wijziging) => void }) {
  const { t } = useTranslation("settings");
  return (
    <>
      <Sectie titel={t("appearance.theme")}>
        <div className="instellingen-thema">
          <ThemedSelect
            label={t("appearance.theme")}
            waarde={instellingen.thema}
            keuzes={THEMAS.map(({ waarde, stalen }) => ({
              waarde,
              label: t(`appearance.themes.${waarde}`),
              voor: <Kleurstalen kleuren={stalen} />,
            }))}
            onChange={(thema) => wijzig({ thema })}
            className="instellingen-themakeuze"
          />
        </div>
      </Sectie>
      <Sectie titel={t("appearance.ribbon")}>
        <Vink checked={instellingen.lint.compact} onChange={(compact) => wijzig({ lint: { compact } })}>
          {t("appearance.ribbonCompact")}
        </Vink>
        <Vink checked={instellingen.lint.ingeklapt} onChange={(ingeklapt) => wijzig({ lint: { ingeklapt } })}>
          {t("appearance.ribbonCollapsed")}
        </Vink>
      </Sectie>
      <Sectie titel={t("appearance.statusbar")}>
        {STATUSITEMS.map((sleutel) => (
          <Vink
            key={sleutel}
            checked={instellingen.statusbalk[sleutel]}
            onChange={(aan) => wijzig({ statusbalk: { [sleutel]: aan } })}
          >
            {t(`appearance.status.${sleutel}`)}
          </Vink>
        ))}
      </Sectie>
    </>
  );
}

function Bewerken({ instellingen, wijzig }: { instellingen: Instellingen; wijzig: (w: Wijziging) => void }) {
  const { t } = useTranslation("settings");
  const { persoonlijk } = useWoordenlijsten();
  const [lijstOpen, setLijstOpen] = useState(false);
  const woorden = persoonlijk.alle();
  return (
    <>
      <Sectie titel={t("editing.text")}>
        <Rij label={t("editing.shortcutProfile")}>
          <ThemedSelect
            label={t("editing.shortcutProfile")}
            waarde={instellingen.tekst.sneltoetsprofiel}
            keuzes={(["standaard", "word"] as const).map((waarde) => ({
              waarde,
              label: t(`editing.profiles.${waarde}`),
            }))}
            onChange={(sneltoetsprofiel) => wijzig({ tekst: { sneltoetsprofiel } })}
            stijl={{ width: 220 }}
          />
        </Rij>
        <p className="instellingen-uitleg">{t(`editing.profilesHelp.${instellingen.tekst.sneltoetsprofiel}`)}</p>
        <Vink
          checked={instellingen.tekst.miniWerkbalk}
          onChange={(miniWerkbalk) => wijzig({ tekst: { miniWerkbalk } })}
        >
          {t("editing.miniToolbar")}
        </Vink>
      </Sectie>
      <Sectie titel={t("editing.spelling")}>
        {SPELLING.map((sleutel) => (
          <Vink
            key={sleutel}
            checked={instellingen.spelling[sleutel]}
            onChange={(aan) => wijzig({ spelling: { [sleutel]: aan } })}
          >
            {t(`editing.spellingOptions.${sleutel}`)}
          </Vink>
        ))}
        <p className="instellingen-uitleg">{t("editing.spellingHelp")}</p>
        <button
          type="button"
          className="oa-knop"
          onClick={() => setLijstOpen(!lijstOpen)}
          aria-expanded={lijstOpen}
        >
          {t("editing.personalDictionary", { count: woorden.length })}
        </button>
        {lijstOpen && (
          <ul className="instellingen-woorden" aria-label={t("editing.personalDictionaryLabel")}>
            {!woorden.length && <li>{t("editing.personalDictionaryEmpty")}</li>}
            {woorden.map((w) => (
              <li key={w}>
                <span>{w}</span>
                <button
                  type="button"
                  className="oa-knop"
                  aria-label={t("editing.removeWord", { word: w })}
                  onClick={() => persoonlijk.verwijder(w)}
                >
                  {t("editing.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sectie>
      <Sectie titel={t("editing.keyboard")}>
        <button type="button" className="oa-knop" onClick={toonSneltoetsen}>
          {t("editing.showShortcuts")}
        </button>
      </Sectie>
    </>
  );
}

function Email({ instellingen, wijzig }: { instellingen: Instellingen; wijzig: (w: Wijziging) => void }) {
  const { t } = useTranslation("settings");
  const id = useId();
  return (
    <Sectie titel={t("email.privacy")}>
      <div className="instellingen-keuzes" role="radiogroup" aria-labelledby={`${id}-extern`}>
        <span id={`${id}-extern`} className="instellingen-label">
          {t("email.externalImages")}
        </span>
        {(["account", "nooit"] as const).map((waarde) => (
          <label key={waarde} className="instellingen-vink">
            <input
              type="radio"
              name={`${id}-extern`}
              checked={instellingen.emailExterneInhoud === waarde}
              onChange={() => wijzig({ emailExterneInhoud: waarde })}
            />
            <span>{t(`email.external.${waarde}`)}</span>
          </label>
        ))}
      </div>
    </Sectie>
  );
}

function Over() {
  const { t } = useTranslation("settings");
  return (
    <Sectie titel={t("about.appName")}>
      <dl className="instellingen-over">
        <dt>{t("about.version")}</dt>
        <dd>
          {versie.label} ({versie.versie})
        </dd>
        <dt>{t("about.framework")}</dt>
        <dd>Tauri + React + TypeScript</dd>
        <dt>{t("about.design")}</dt>
        <dd>OpenAEC Style Book (CC BY-SA 4.0)</dd>
        <dt>{t("about.licenses")}</dt>
        <dd>
          <a href="licenses/npm.txt" target="_blank" rel="noreferrer">
            {t("about.licensesLink")}
          </a>
        </dd>
      </dl>
      <p className="instellingen-uitleg">{t("about.description")}</p>
      <p className="instellingen-uitleg">{t("about.translations")}</p>
    </Sectie>
  );
}
