import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Save, TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { Soort } from "./editors";
import {
  GROEPEN,
  conversieStatus,
  kiesConversieprogramma,
  kiesRoute,
  uitvoerlijst,
  type ConversieStatus,
  type Groep,
  type Route,
  type Uitvoerformaat,
} from "./formaten";
import type { OpslaanKeuze } from "./export/bewaar";
import type { Rapport } from "./import/rapport";
import { Verliesrapport } from "./import/RapportMelding";
import { VERSLEUTELBAAR } from "./import/bron";
import type { Codering, Scheidingsteken } from "./export/csv";
import { PdfOpties, standaardAppPdf } from "./export/PdfOpties";
import "./OpslaanAlsDialoog.css";

/** Sleutel onder `backstage:saveAs.routes` per route. */
const ROUTENAMEN: Record<Route, string> = {
  engine: "inApp",
  runtime: "runtime",
  afdrukken: "print",
  tekst: "inApp",
  html: "inApp",
};

/** Sleutel onder `backstage:saveAs.groups` per groep uit formaten.ts. */
const GROEPSLEUTEL: Record<Groep, string> = {
  eigen: "own",
  opendocument: "openDocument",
  "office-oud": "legacyOffice",
  sjablonen: "templates",
  macro: "macro",
  "web-tekst": "webText",
  "pdf-afbeelding": "pdfImage",
};

export interface OpslaanAlsProps {
  soort: Soort;
  /** Huidige bestandsnaam, met of zonder extensie. */
  naam: string;
  /** Voorgeselecteerd formaat. */
  formaat: string;
  /** Verliesrapport voor dit formaat en deze route, of null. */
  verlies: (
    formaat: Uitvoerformaat,
    route: Route | null,
    metWachtwoord: boolean,
  ) => Rapport | null;
  /** Het origineel was met een wachtwoord versleuteld. */
  versleuteld?: boolean;
  /** Het document is als macrobestand geopend (VBA-project beschikbaar). */
  macros?: boolean;
  /** Wachtwoord dat in deze sessie al voor dit document is gekozen. */
  wachtwoord?: string;
  bladen?: { namen: string[]; actief: number } | null;
  dias?: { aantal: number; huidig: number } | null;
  bevestig: (keuze: OpslaanKeuze) => void;
  annuleer: () => void;
  vorigeFocus: HTMLElement | null;
}

export function OpslaanAlsDialoog(props: OpslaanAlsProps) {
  const { t } = useTranslation(["backstage", "common"]);
  const desktop = "__TAURI_INTERNALS__" in window;
  const id = useId();
  const dialoog = useRef<HTMLElement>(null);
  const naamveld = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ConversieStatus | null>(
    desktop ? null : { gevonden: false, profiel: "veilig" },
  );
  const [statusFout, setStatusFout] = useState("");
  const [naam, setNaam] = useState(props.naam.replace(/\.[^.]+$/, ""));
  const [ext, setExt] = useState(props.formaat);
  const [scheidingsteken, setScheidingsteken] = useState<Scheidingsteken>(";");
  const [codering, setCodering] = useState<Codering>("utf8-bom");
  const [tekstcodering, setTekstcodering] = useState<Codering>("utf8");
  const [beveiligen, setBeveiligen] = useState(
    !!props.versleuteld || !!props.wachtwoord,
  );
  const [wachtwoord, setWachtwoord] = useState(props.wachtwoord ?? "");
  const [herhaling, setHerhaling] = useState(props.wachtwoord ?? "");
  const [blad, setBlad] = useState(props.bladen?.actief ?? 0);
  const [dia, setDia] = useState(props.dias?.huidig ?? 0);
  const [pdfa, setPdfa] = useState<0 | 1 | 2 | 3>(0);
  const [bladwijzers, setBladwijzers] = useState(true);
  const [bereik, setBereik] = useState("");
  const [pdfViaRuntime, setPdfViaRuntime] = useState(false);
  const [appPdf, setAppPdf] = useState(standaardAppPdf);

  useEffect(() => {
    if (!desktop) return;
    let actief = true;
    conversieStatus()
      .then((s) => actief && setStatus(s))
      .catch((e) => {
        if (!actief) return;
        setStatus({ gevonden: false, profiel: "veilig" });
        setStatusFout(String(e));
      });
    return () => {
      actief = false;
    };
  }, [desktop]);
  useEffect(() => {
    naamveld.current?.focus();
    naamveld.current?.select();
    const vorige = props.vorigeFocus;
    return () => {
      if (vorige?.isConnected) vorige.focus();
    };
  }, [props.vorigeFocus]);

  // Het gekozen formaat zichtbaar houden in de lijst.
  useEffect(() => {
    dialoog.current
      ?.querySelector(".opslaanals-formaat.is-gekozen")
      ?.scrollIntoView({ block: "nearest" });
  }, [ext]);
  const runtime = status?.gevonden ?? false;
  // Macroformaten alleen voor een geopend macrobestand (met het VBA-project).
  const formaten = useMemo(
    () =>
      uitvoerlijst(props.soort).filter(
        (f) => f.groep !== "macro" || props.macros,
      ),
    [props.soort, props.macros],
  );
  const gekozen = formaten.find((f) => f.ext === ext) ?? formaten[0];
  // Zolang de status laadt, rekenen we in de desktopapp op de runtime.
  const routeVan = (f: Uitvoerformaat) =>
    kiesRoute(f, desktop && (status === null || runtime));
  // PDF maakt de app zelf; met runtime kan de gebruiker ervoor kiezen (PDF/A).
  const route =
    gekozen.ext === "pdf" && pdfViaRuntime && runtime
      ? "runtime"
      : routeVan(gekozen);
  const kanBeveiligen = VERSLEUTELBAAR.has(gekozen.ext) && route === "engine";
  const metWachtwoord = kanBeveiligen && beveiligen;
  const wachtwoordFout = !metWachtwoord
    ? ""
    : !wachtwoord
      ? t("saveAs.passwordMissing")
      : wachtwoord !== herhaling
        ? t("saveAs.passwordMismatch")
        : wachtwoord.length > 255
          ? t("saveAs.passwordTooLong", { max: 255 })
          : "";
  const verlies = props.verlies(gekozen, route, metWachtwoord);
  const groepen = (Object.keys(GROEPEN) as Groep[])
    .map((groep) => ({
      groep,
      formaten: formaten.filter((f) => f.groep === groep),
    }))
    .filter((g) => g.formaten.length);
  const bereikGeldig = !bereik.trim() || /^[\d\s,-]+$/.test(bereik);
  // Naam en verwachting per formaat vertaald; de catalogus is de terugval.
  const formaatNaam = (f: Uitvoerformaat) =>
    t(`saveAs.formats.${props.soort}.${f.ext}.name`, { defaultValue: f.naam });
  const formaatBehoud = (f: Uitvoerformaat) =>
    t(`saveAs.formats.${props.soort}.${f.ext}.keeps`, { defaultValue: f.behoud });
  const kan = !!route && !!naam.trim() && bereikGeldig && !wachtwoordFout;

  function bevestig() {
    if (!kan || !route) return;
    props.bevestig({
      naam: naam.trim(),
      ext: gekozen.ext,
      route,
      ...(gekozen.ext === "csv" || gekozen.ext === "tsv"
        ? {
            scheidingsteken: gekozen.ext === "tsv" ? "tab" : scheidingsteken,
            codering,
            blad,
          }
        : {}),
      ...(metWachtwoord ? { wachtwoord } : {}),
      ...(gekozen.ext === "txt" && route === "tekst"
        ? { codering: tekstcodering }
        : {}),
      ...(gekozen.ext === "png" && props.soort === "xlsx" ? { blad } : {}),
      ...(gekozen.ext === "png" && props.soort === "pptx" ? { dia } : {}),
      ...(gekozen.ext === "pdf" && route === "runtime"
        ? { pdfa, bladwijzers, bereik: bereik.trim() || undefined }
        : {}),
      ...(gekozen.ext === "pdf" && route === "engine"
        ? { pdf: appPdf, bereik: bereik.trim() || undefined }
        : {}),
    });
  }

  async function kiesProgramma() {
    try {
      const nieuw = await kiesConversieprogramma();
      if (nieuw) {
        setStatus(nieuw);
        setStatusFout("");
      }
    } catch (e) {
      setStatusFout(String(e));
    }
  }

  const bladkeuze = props.bladen && props.bladen.namen.length > 1 && (
    <label>
      {t("saveAs.sheet")}
      <select value={blad} onChange={(e) => setBlad(Number(e.target.value))}>
        {props.bladen.namen.map((naam, index) => (
          <option key={index} value={index}>
            {index === props.bladen!.actief ? t("saveAs.activeSheet", { name: naam }) : naam}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="office-dialoogachtergrond">
      <section
        ref={dialoog}
        className="office-dialoog opslaanals"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titel`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            props.annuleer();
          }
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            event.target.type === "text"
          ) {
            event.preventDefault();
            bevestig();
          }
          if (event.key === "Tab") {
            const focusbaar = [
              ...(dialoog.current?.querySelectorAll<HTMLElement>(
                "input:not([disabled]), select:not([disabled]), button:not([disabled])",
              ) ?? []),
            ];
            const eerste = focusbaar[0],
              laatste = focusbaar[focusbaar.length - 1];
            if (event.shiftKey && document.activeElement === eerste) {
              event.preventDefault();
              laatste?.focus();
            } else if (!event.shiftKey && document.activeElement === laatste) {
              event.preventDefault();
              eerste?.focus();
            }
          }
        }}
      >
        <h2 id={`${id}-titel`}>{t("saveAs.title")}</h2>
        <label className="opslaanals-naam">
          {t("saveAs.fileName")}
          <span>
            <input
              ref={naamveld}
              type="text"
              value={naam}
              spellCheck={false}
              onChange={(e) => setNaam(e.target.value)}
            />
            <em>.{gekozen.ext}</em>
          </span>
        </label>

        <div className="opslaanals-runtime" role="status">
          {!desktop ? (
            <>{t("saveAs.browserInfo")}</>
          ) : status === null ? (
            <>{t("saveAs.runtimeSearching")}</>
          ) : runtime ? (
            <>
              {t("saveAs.runtimeFound", { version: status.versie ?? status.pad })}{" "}
              <small>
                {t("saveAs.runtimeDetails", {
                  source:
                    status.bron === "omgeving"
                      ? t("saveAs.sourceEnvironment")
                      : status.bron === "instelling"
                        ? t("saveAs.sourceSetting")
                        : t("saveAs.sourceAutomatic"),
                  profile:
                    status.profiel === "veilig"
                      ? t("saveAs.profileSafe")
                      : t("saveAs.profileOwn"),
                })}
              </small>
            </>
          ) : (
            <>
              <TriangleAlert size={14} /> {t("saveAs.runtimeMissing")}{" "}
              <button type="button" onClick={() => void kiesProgramma()}>
                {t("saveAs.chooseConverter")}
              </button>
            </>
          )}
          {statusFout && <p className="opslaanals-fout">{statusFout}</p>}
        </div>

        <fieldset className="opslaanals-formaten">
          <legend>{t("saveAs.format")}</legend>
          {groepen.map(({ groep, formaten }) => (
            <div
              key={groep}
              role="group"
              aria-label={t(`saveAs.groups.${GROEPSLEUTEL[groep]}`, { defaultValue: GROEPEN[groep] })}
            >
              <h3>{t(`saveAs.groups.${GROEPSLEUTEL[groep]}`, { defaultValue: GROEPEN[groep] })}</h3>
              {formaten.map((formaat) => {
                const r = routeVan(formaat);
                return (
                  <label
                    key={formaat.ext}
                    className={`opslaanals-formaat${r ? "" : " is-uit"}${formaat.ext === gekozen.ext ? " is-gekozen" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`${id}-formaat`}
                      value={formaat.ext}
                      checked={formaat.ext === gekozen.ext}
                      disabled={!r}
                      aria-label={`${formaatNaam(formaat)} (.${formaat.ext})`}
                      onChange={() => setExt(formaat.ext)}
                    />
                    <span>
                      <b>
                        {formaatNaam(formaat)} <code>.{formaat.ext}</code>
                      </b>
                      <small>{formaatBehoud(formaat)}</small>
                    </span>
                    <i>
                      {r
                        ? t(`saveAs.routes.${ROUTENAMEN[r]}`)
                        : desktop
                          ? t("saveAs.runtimeMissingShort")
                          : t("saveAs.desktopOnly")}
                    </i>
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>

        {(gekozen.ext === "csv" || gekozen.ext === "tsv") && (
          <div className="opslaanals-opties">
            {gekozen.ext === "csv" && (
              <label>
                {t("saveAs.separator")}
                <select
                  value={scheidingsteken}
                  onChange={(e) =>
                    setScheidingsteken(e.target.value as Scheidingsteken)
                  }
                >
                  <option value=";">{t("saveAs.separatorSemicolon")}</option>
                  <option value=",">{t("saveAs.separatorComma")}</option>
                  <option value="tab">{t("saveAs.separatorTab")}</option>
                  <option value="|">{t("saveAs.separatorPipe")}</option>
                </select>
              </label>
            )}
            <label>
              {t("saveAs.encoding")}
              <select
                value={codering}
                onChange={(e) => setCodering(e.target.value as Codering)}
              >
                <option value="utf8-bom">{t("saveAs.encodingUtf8BomExcel")}</option>
                <option value="utf8">UTF-8</option>
                <option value="windows-1252">Windows-1252 (ANSI)</option>
              </select>
            </label>
            {bladkeuze}
            <p>{t("saveAs.csvInfo")}</p>
          </div>
        )}
        {kanBeveiligen && (
          <div className="opslaanals-opties">
            <label className="opslaanals-vink">
              <input
                type="checkbox"
                checked={beveiligen}
                onChange={(e) => setBeveiligen(e.target.checked)}
              />
              {t("saveAs.protect")}
            </label>
            {beveiligen && (
              <>
                <label>
                  {t("saveAs.password")}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={wachtwoord}
                    onChange={(e) => setWachtwoord(e.target.value)}
                  />
                </label>
                <label>
                  {t("saveAs.repeatPassword")}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={herhaling}
                    aria-invalid={!!herhaling && !!wachtwoordFout}
                    onChange={(e) => setHerhaling(e.target.value)}
                  />
                </label>
              </>
            )}
            <p>
              {beveiligen
                ? t("saveAs.encryptionInfo")
                : t("saveAs.noEncryptionInfo")}
              {wachtwoordFout && beveiligen && (wachtwoord || herhaling) ? (
                <span className="opslaanals-fout"> {wachtwoordFout}</span>
              ) : null}
            </p>
          </div>
        )}
        {gekozen.ext === "txt" && route === "tekst" && (
          <div className="opslaanals-opties">
            <label>
              {t("saveAs.encoding")}
              <select
                value={tekstcodering}
                onChange={(e) => setTekstcodering(e.target.value as Codering)}
              >
                <option value="utf8">UTF-8</option>
                <option value="utf8-bom">{t("saveAs.encodingUtf8BomNotepad")}</option>
                <option value="windows-1252">Windows-1252 (ANSI)</option>
              </select>
            </label>
          </div>
        )}
        {gekozen.ext === "png" && props.soort === "xlsx" && bladkeuze && (
          <div className="opslaanals-opties">{bladkeuze}</div>
        )}
        {gekozen.ext === "png" && props.soort === "pptx" && props.dias && (
          <div className="opslaanals-opties">
            <label>
              {t("saveAs.slide")}
              <select
                value={dia}
                onChange={(e) => setDia(Number(e.target.value))}
              >
                {Array.from({ length: props.dias.aantal }, (_, index) => (
                  <option key={index} value={index}>
                    {index === props.dias!.huidig
                      ? t("saveAs.currentSlide", { number: index + 1 })
                      : t("saveAs.slideNumber", { number: index + 1 })}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {gekozen.ext === "pdf" && (
          <PdfOpties
            soort={props.soort}
            runtime={runtime}
            viaRuntime={route === "runtime"}
            setViaRuntime={setPdfViaRuntime}
            keuze={appPdf}
            wijzig={setAppPdf}
            bereik={bereik}
            setBereik={setBereik}
            bereikGeldig={bereikGeldig}
          />
        )}
        {gekozen.ext === "pdf" && route === "runtime" && (
          <div className="opslaanals-opties">
            <label>
              {t("saveAs.pdfVariant")}
              <select
                value={pdfa}
                onChange={(e) =>
                  setPdfa(Number(e.target.value) as 0 | 1 | 2 | 3)
                }
              >
                <option value={0}>{t("saveAs.pdfPlain")}</option>
                <option value={2}>{t("saveAs.pdfA2b")}</option>
                <option value={1}>PDF/A-1b</option>
                <option value={3}>PDF/A-3b</option>
              </select>
            </label>
            <label>
              {props.soort === "pptx" ? t("saveAs.slides") : t("saveAs.pages")}
              <input
                type="text"
                placeholder={t("saveAs.rangePlaceholder")}
                value={bereik}
                aria-invalid={!bereikGeldig}
                onChange={(e) => setBereik(e.target.value)}
              />
            </label>
            {props.soort === "docx" && (
              <label className="opslaanals-vink">
                <input
                  type="checkbox"
                  checked={bladwijzers}
                  onChange={(e) => setBladwijzers(e.target.checked)}
                />
                {t("saveAs.bookmarks")}
              </label>
            )}
          </div>
        )}
        {route === "afdrukken" && (
          <p className="opslaanals-uitleg">
            <Trans t={t} i18nKey="saveAs.printRoute" components={{ strong: <strong /> }} />
          </p>
        )}
        {verlies && (
          <Verliesrapport
            rapport={verlies}
            bestandsnaam={`${naam.trim() || t("saveAs.untitled")}.${props.soort}`}
          />
        )}
        {gekozen.ext !== props.soort && route && (
          <p className="opslaanals-uitleg">{t("saveAs.copyInfo", { ext: props.soort })}</p>
        )}
        <div className="office-dialoogacties">
          <button type="button" onClick={props.annuleer}>
            {t("common:cancel")}
          </button>
          <button
            type="button"
            className="office-dialoogdoorgaan"
            disabled={!kan}
            onClick={bevestig}
          >
            <Save size={13} />{" "}
            {route === "afdrukken" ? t("saveAs.print") : t("common:save")}
          </button>
        </div>
      </section>
    </div>
  );
}
