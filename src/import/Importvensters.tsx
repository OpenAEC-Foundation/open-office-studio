import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatGetal } from "../i18n/opmaak";
import { Dialoog } from "../werkruimte/Dialoog";
import "../werkruimte/werkruimte.css";
import {
  CODERINGEN,
  bereidCsvVoor,
  herkenInstellingen,
  scheidingsnaam,
  typeerCel,
  type CsvCodering,
  type CsvInstellingen,
  type Datumvolgorde,
  type Kolomtype,
} from "./csvimport";
import "./import.css";

/** Importvenster op basis van de gedeelde werkruimtedialoog (focusval, Esc, inert). */
function Venster({
  titel,
  smal,
  annuleer,
  acties,
  children,
}: {
  titel: string;
  smal?: boolean;
  annuleer: () => void;
  acties: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialoog
      titel={titel}
      sluit={annuleer}
      className={`importvenster${smal ? " is-smal" : ""}`}
      acties={acties}
    >
      {children}
    </Dialoog>
  );
}

const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Kolomtypen in de keuzelijst; de weergavenaam staat in `import:csv.types`. */
const KOLOMTYPEN: Kolomtype[] = ["standaard", "tekst", "datum", "overslaan"];

/** Weergavesleutel per codering die een vertaalde naam heeft; de rest is een technische naam. */
const CODERINGSLABEL: Partial<Record<CsvCodering, string>> = {
  auto: "csv.encodingAuto",
  "windows-1252": "csv.encodingWestern",
};

function weergave(
  waarde: string,
  type: Kolomtype,
  instellingen: CsvInstellingen,
) {
  const cel = typeerCel(waarde, type, instellingen);
  if (cel.soort === "leeg") return { tekst: "", getal: false };
  if (cel.soort === "tekst")
    return {
      tekst: (cel.formuleachtig ? "'" : "") + cel.waarde,
      getal: false,
    };
  if (cel.soort === "getal")
    return {
      tekst: cel.procent
        ? `${formatGetal(cel.waarde * 100)}%`
        : formatGetal(cel.waarde, { maximumFractionDigits: 10 }),
      getal: true,
    };
  const ms = Date.UTC(1899, 11, 30) + cel.waarde * 86400000;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const datum =
    instellingen.datumvolgorde === "MDJ"
      ? `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`
      : instellingen.datumvolgorde === "JMD"
        ? `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
        : `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  return {
    tekst: cel.tijd
      ? `${datum} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
      : datum,
    getal: true,
  };
}

/** Importvenster voor CSV/TSV met voorvertoning van de eerste 50 rijen. */
export function CsvImportVenster({
  naam,
  bytes,
  ext,
  bevestig,
  annuleer,
}: {
  naam: string;
  bytes: Uint8Array;
  ext: string;
  bevestig: (instellingen: CsvInstellingen) => void;
  annuleer: () => void;
}) {
  const { t } = useTranslation(["import", "common"]);
  const [instellingen, setInstellingen] = useState(() =>
    herkenInstellingen(bytes, ext),
  );
  const [eigenTeken, setEigenTeken] = useState("");
  const zet = (wijziging: Partial<CsvInstellingen>) =>
    setInstellingen((oud) => ({ ...oud, ...wijziging }));
  const voorbeeld = useMemo(() => {
    try {
      return { ...bereidCsvVoor(bytes, instellingen, 51), fout: "" };
    } catch (e) {
      return {
        rijen: [],
        kolommen: 0,
        codering: "",
        scheidingsteken: "",
        fout: String(e),
      };
    }
  }, [bytes, instellingen]);
  const vast = [";", ",", "\t", "|"];
  const scheidingKeuze = vast.includes(instellingen.scheidingsteken)
    ? instellingen.scheidingsteken
    : "eigen";
  const kolommen = Math.min(voorbeeld.kolommen, 200);
  const typen = Array.from(
    { length: kolommen },
    (_, k) => instellingen.kolomtypen[k] ?? "standaard",
  );
  const rijen = voorbeeld.rijen.slice(0, instellingen.kopregel ? 51 : 50);

  return (
    <Venster
      titel={t("csv.title", { name: naam })}
      annuleer={annuleer}
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={annuleer}>
            {t("common:cancel")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            disabled={!!voorbeeld.fout}
            onClick={() => bevestig({ ...instellingen, kolomtypen: typen })}
          >
            {t("csv.import")}
          </button>
        </>
      }
    >
      <div className="importvenster-raster">
        <label>
          {t("csv.separator")}
          <select
            value={scheidingKeuze}
            onChange={(e) =>
              zet({
                scheidingsteken:
                  e.target.value === "eigen"
                    ? eigenTeken || ";"
                    : e.target.value,
              })
            }
          >
            <option value=";">{t("csv.separatorSemicolon")}</option>
            <option value=",">{t("csv.separatorComma")}</option>
            <option value={"\t"}>{t("csv.separatorTab")}</option>
            <option value="|">{t("csv.separatorPipe")}</option>
            <option value="eigen">{t("csv.separatorOther")}</option>
          </select>
        </label>
        {scheidingKeuze === "eigen" && (
          <label>
            {t("csv.otherCharacter")}
            <input
              type="text"
              maxLength={1}
              value={eigenTeken || instellingen.scheidingsteken}
              onChange={(e) => {
                setEigenTeken(e.target.value);
                if (e.target.value) zet({ scheidingsteken: e.target.value });
              }}
            />
          </label>
        )}
        <label>
          {t("csv.textQualifier")}
          <select
            value={instellingen.tekstteken}
            onChange={(e) =>
              zet({
                tekstteken: e.target.value as CsvInstellingen["tekstteken"],
              })
            }
          >
            <option value={'"'}>{t("csv.doubleQuote")}</option>
            <option value="'">{t("csv.singleQuote")}</option>
            <option value="">{t("csv.none")}</option>
          </select>
        </label>
        <label>
          {t("csv.encoding")}
          <select
            value={instellingen.codering}
            onChange={(e) => zet({ codering: e.target.value as CsvCodering })}
          >
            {CODERINGEN.map((c) => (
              <option key={c.waarde} value={c.waarde}>
                {CODERINGSLABEL[c.waarde] ? t(CODERINGSLABEL[c.waarde]!) : c.naam}
                {c.waarde === "auto" && voorbeeld.codering
                  ? t("csvImport.encodingDetected", {
                      name: c.naam,
                      encoding: voorbeeld.codering,
                    })
                  : c.naam}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("csv.numbers")}
          <select
            value={instellingen.getalnotatie}
            onChange={(e) =>
              zet({ getalnotatie: e.target.value as "nl" | "en" })
            }
          >
            <option value="nl">{t("csv.numbersDutch")}</option>
            <option value="en">{t("csv.numbersEnglish")}</option>
          </select>
        </label>
        <label>
          {t("csv.dateOrder")}
          <select
            value={instellingen.datumvolgorde}
            onChange={(e) =>
              zet({ datumvolgorde: e.target.value as Datumvolgorde })
            }
          >
            <option value="DMJ">{t("csv.dateDmy")}</option>
            <option value="MDJ">{t("csv.dateMdy")}</option>
            <option value="JMD">{t("csv.dateYmd")}</option>
          </select>
        </label>
        <label>
          {t("csv.startRow")}
          <input
            type="text"
            inputMode="numeric"
            value={instellingen.beginrij + 1}
            onChange={(e) =>
              zet({
                beginrij: Math.max(
                  0,
                  Math.min(1000, (Number(e.target.value) || 1) - 1),
                ),
              })
            }
          />
        </label>
        <label className="importvenster-vink">
          <input
            type="checkbox"
            checked={instellingen.kopregel}
            onChange={(e) => zet({ kopregel: e.target.checked })}
          />
          {t("csv.headerRow")}
        </label>
      </div>
      {voorbeeld.fout ? (
        <p className="importvenster-fout">{voorbeeld.fout}</p>
      ) : (
        <div
          className="importvenster-voorbeeld"
          role="region"
          aria-label={t("csv.preview")}
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                {typen.map((type, k) => (
                  <th key={k} scope="col">
                    <select
                      aria-label={t("csv.columnType", { column: k + 1 })}
                      value={type}
                      onChange={(e) => {
                        const kolomtypen = [...typen];
                        kolomtypen[k] = e.target.value as Kolomtype;
                        zet({ kolomtypen });
                      }}
                    >
                      {KOLOMTYPEN.map((soort) => (
                        <option key={soort} value={soort}>
                          {t(`csv.types.${soort}`)}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rijen.map((rij, r) => {
                const kop = instellingen.kopregel && r === 0;
                return (
                  <tr key={r} className={kop ? "is-kop" : ""}>
                    {typen.map((type, k) => {
                      if (type === "overslaan")
                        return (
                          <td key={k} aria-hidden>
                            —
                          </td>
                        );
                      const w = weergave(
                        rij[k] ?? "",
                        kop ? "tekst" : type,
                        instellingen,
                      );
                      return (
                        <td
                          key={k}
                          className={w.getal ? "is-getal" : ""}
                          title={rij[k]}
                        >
                          {w.tekst}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="importvenster-uitleg">
        <Trans
          t={t}
          i18nKey="csv.explanation"
          count={kolommen}
          values={{
            separator: hoofdletter(
              scheidingsnaam(voorbeeld.scheidingsteken || ";"),
            ),
          }}
          components={{ b: <b /> }}
        />
      </p>
    </Venster>
  );
}

/** Vraagt het wachtwoord van een versleuteld document. Het wachtwoord wordt nergens bewaard. */
export function WachtwoordVenster({
  naam,
  fout,
  bevestig,
  annuleer,
}: {
  naam: string;
  fout?: string;
  bevestig: (wachtwoord: string) => void;
  annuleer: () => void;
}) {
  const { t } = useTranslation(["import", "common"]);
  const [wachtwoord, setWachtwoord] = useState("");
  const formulier = useId();
  return (
    <Venster
      titel={t("password.title")}
      smal
      annuleer={annuleer}
      acties={
        <>
          <button type="button" className="werkruimte-knop" onClick={annuleer}>
            {t("common:cancel")}
          </button>
          <button
            type="submit"
            form={formulier}
            className="werkruimte-knop is-primair"
            disabled={!wachtwoord}
          >
            {t("common:open")}
          </button>
        </>
      }
    >
      <form
        id={formulier}
        onSubmit={(e) => {
          e.preventDefault();
          if (wachtwoord) bevestig(wachtwoord);
        }}
      >
        <p className="importvenster-uitleg">
          <Trans
            t={t}
            i18nKey="password.explanation"
            values={{ name: naam }}
            components={{ b: <b /> }}
          />
        </p>
        <label>
          {t("password.password")}
          <input
            type="password"
            data-autofocus
            autoComplete="off"
            value={wachtwoord}
            aria-invalid={!!fout}
            onChange={(e) => setWachtwoord(e.target.value)}
          />
        </label>
        {fout && (
          <p className="importvenster-fout" role="alert">
            {fout}
          </p>
        )}
      </form>
    </Venster>
  );
}

type Vraag =
  | {
      soort: "csv";
      naam: string;
      bytes: Uint8Array;
      ext: string;
      antwoord: (instellingen: CsvInstellingen | null) => void;
    }
  | {
      soort: "wachtwoord";
      naam: string;
      fout?: string;
      antwoord: (wachtwoord: string | null) => void;
    };

/**
 * De vragen die de openroute aan de gebruiker stelt, als beloftes, plus het
 * venster dat erbij hoort. Zo blijft de openroute zelf vrij van UI.
 */
export function useImportvragen() {
  const [vraag, setVraag] = useState<Vraag | null>(null);
  const vraagCsv = useCallback(
    (naam: string, bytes: Uint8Array, ext: string) =>
      new Promise<CsvInstellingen | null>((antwoord) =>
        setVraag({ soort: "csv", naam, bytes, ext, antwoord }),
      ),
    [],
  );
  const vraagWachtwoord = useCallback(
    (naam: string, fout?: string) =>
      new Promise<string | null>((antwoord) =>
        setVraag({ soort: "wachtwoord", naam, fout, antwoord }),
      ),
    [],
  );
  const beantwoord = <T,>(antwoord: (w: T) => void, waarde: T) => {
    setVraag(null);
    antwoord(waarde);
  };
  const venster =
    vraag?.soort === "csv" ? (
      <CsvImportVenster
        naam={vraag.naam}
        bytes={vraag.bytes}
        ext={vraag.ext}
        bevestig={(i) => beantwoord(vraag.antwoord, i)}
        annuleer={() => beantwoord(vraag.antwoord, null)}
      />
    ) : vraag?.soort === "wachtwoord" ? (
      <WachtwoordVenster
        key={vraag.fout ?? "eerste"}
        naam={vraag.naam}
        fout={vraag.fout}
        bevestig={(w) => beantwoord(vraag.antwoord, w)}
        annuleer={() => beantwoord(vraag.antwoord, null)}
      />
    ) : null;
  return { vraagCsv, vraagWachtwoord, venster, open: vraag !== null };
}
