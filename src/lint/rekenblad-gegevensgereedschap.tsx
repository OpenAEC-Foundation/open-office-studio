/**
 * Gegevensgereedschap van Open Rekenblad Studio (lint Gegevens): duplicaten
 * verwijderen of markeren, tekst naar kolommen, doelzoeken en statistiek.
 * De vensters staan op de gedeelde werkruimtedialoog (focusval, Esc, inert);
 * het werk zelf staat in de bijbehorende rekenblad-*.ts-bestanden.
 */
import { useContext, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyMinus } from "lucide-react";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Actie, Groep, RibbonFout } from "../Ribbon";
import { Dialoog } from "../werkruimte/Dialoog";
import "../werkruimte/werkruimte.css";
import { useEditorApi } from "./editorApi";
import { formatGetal } from "../i18n/opmaak";
import { leesSelectie, Melding, type Selectie } from "./rekenblad-opdrachten";
import { bereikA1, kolomLetters, type Bereik } from "./rekenblad-logica";
import { bladFilter } from "./rekenblad-filter";
import { gebiedRond, raadKopregel } from "./rekenblad-gegevens";
import { bewerkDuplicaten, type DuplicaatActie } from "./rekenblad-duplicaten";
import "./rekenblad-gereedschap.css";
import "./rekenblad-gegevensgereedschap.css";

export type GereedschapSoort = "duplicaten";

const tekstVan = (fout: unknown) => (fout instanceof Melding || fout instanceof Error ? fout.message : String(fout));

function leesOfFout(api: XlsxEditorApi): Selectie | Error {
  try {
    return leesSelectie(api);
  } catch (fout) {
    return fout instanceof Error ? fout : new Error(String(fout));
  }
}

/** Groepen voor het lint Gegevens. */
export function GereedschapGroepen({ uit, open }: { uit: boolean; open: (soort: GereedschapSoort) => void }) {
  const { t } = useTranslation("spreadsheet");
  const api = useEditorApi().rekenblad;
  const knop = (soort: GereedschapSoort, naam: string, icoon: typeof CopyMinus, groot = false) => (
    <Actie
      naam={naam}
      icoon={icoon}
      groot={groot}
      disabled={!api || uit}
      title={naam}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => open(soort)}
    />
  );
  return (
    <Groep naam={t("dataTools.group")}>
      {knop("duplicaten", t("dataTools.duplicates.button"), CopyMinus, true)}
    </Groep>
  );
}

/** Het geopende gereedschapsvenster. */
export function GereedschapVenster({ soort, api, sluit }: { soort: GereedschapSoort; api: XlsxEditorApi; sluit: () => void }) {
  if (soort === "duplicaten") return <DuplicatenVenster api={api} sluit={sluit} />;
  return null;
}

// ------------------------------------------------------------ gemeenschappelijk

interface Gebied {
  blad: number;
  sheetId: string;
  bereik: Bereik;
  kop: boolean;
}

/** Het filterbereik, de selectie of het gebied rond de cel, zoals bij sorteren. */
async function gegevensGebied(api: XlsxEditorApi, s: Selectie): Promise<Gebied> {
  const { blad, sheetId, bereik, focus } = s;
  const f = bladFilter(api.handle, blad);
  if (f && focus.row >= f.bereik.top && focus.row <= f.bereik.bottom && focus.col >= f.bereik.left && focus.col <= f.bereik.right)
    return { blad, sheetId, bereik: f.bereik, kop: true };
  const enkel = bereik.top === bereik.bottom && bereik.left === bereik.right;
  const b = enkel ? await gebiedRond(api, blad, sheetId, focus) : bereik;
  return { blad, sheetId, bereik: b, kop: await raadKopregel(api, blad, sheetId, b) };
}

// ------------------------------------------------------------ duplicaten

const ACTIES: DuplicaatActie[] = ["verwijderen", "markerenDubbel", "markerenUniek", "filteren"];

function DuplicatenVenster({ api, sluit }: { api: XlsxEditorApi; sluit: () => void }) {
  const { t } = useTranslation("spreadsheet");
  const fout = useContext(RibbonFout);
  const id = useId();
  const [selectie] = useState(() => leesOfFout(api));
  const [gebied, setGebied] = useState<Gebied | null>(null);
  const [kop, setKop] = useState(true);
  const [hoofdletters, setHoofdletters] = useState(false);
  const [gekozen, setGekozen] = useState<Set<number>>(new Set());
  const [actie, setActie] = useState<DuplicaatActie>("verwijderen");
  const [status, setStatus] = useState("");
  const [klaar, setKlaar] = useState(false);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    if (selectie instanceof Error) {
      setStatus(tekstVan(selectie));
      return;
    }
    void gegevensGebied(api, selectie)
      .then((g) => {
        setGebied(g);
        setKop(g.kop);
        setGekozen(new Set(Array.from({ length: g.bereik.right - g.bereik.left + 1 }, (_, i) => g.bereik.left + i)));
      })
      .catch((e) => setStatus(tekstVan(e)));
  }, []);

  const kolommen = gebied ? Array.from({ length: gebied.bereik.right - gebied.bereik.left + 1 }, (_, i) => gebied.bereik.left + i) : [];
  const kolomnaam = (k: number) => {
    const kopTekst = gebied && kop ? api.handle.cell(gebied.blad, gebied.bereik.top, k).input : "";
    return kopTekst ? kopTekst : t("data.sort.columnName", { column: kolomLetters(k) });
  };

  const uitvoeren = async () => {
    if (!gebied || bezig) return;
    setBezig(true);
    try {
      const r = await bewerkDuplicaten(api, {
        ...gebied,
        kop,
        kolommen: [...gekozen].sort((a, b) => a - b),
        hoofdlettergevoelig: hoofdletters,
        actie,
      });
      const aantal = formatGetal(r.aantal);
      const over = formatGetal(r.over);
      setStatus(
        r.aantal === 0 && (actie === "verwijderen" || actie === "filteren")
          ? t("dataTools.duplicates.none", { rows: over })
          : t(`dataTools.duplicates.result.${actie}`, { count: r.aantal, number: aantal, rows: over }),
      );
      setKlaar(true);
    } catch (e) {
      setStatus(tekstVan(e));
      fout(tekstVan(e));
    } finally {
      setBezig(false);
    }
  };

  return (
    <Dialoog
      titel={t("dataTools.duplicates.title")}
      sluit={sluit}
      className="rekenblad-venster is-smal"
      acties={
        klaar ? (
          <button type="button" className="werkruimte-knop is-primair" onClick={sluit} data-autofocus>
            {t("dataTools.ok")}
          </button>
        ) : (
          <>
            <button type="button" className="werkruimte-knop" onClick={sluit}>
              {t("common:cancel")}
            </button>
            <button
              type="button"
              className="werkruimte-knop is-primair"
              disabled={!gebied || !gekozen.size || bezig}
              onClick={() => void uitvoeren()}
            >
              {t(`dataTools.duplicates.run.${actie}`)}
            </button>
          </>
        )
      }
    >
      <div className="rekenblad-vensterinhoud">
        <p className="rekenblad-zacht">
          {gebied ? t("dataTools.range", { range: bereikA1(gebied.bereik) }) : t("data.filter.loading")}
        </p>
        <fieldset className="rekenblad-keuzes" disabled={klaar}>
          <legend>{t("dataTools.duplicates.action")}</legend>
          {ACTIES.map((a) => (
            <label key={a}>
              <input type="radio" name={`${id}-actie`} checked={actie === a} onChange={() => setActie(a)} />
              {t(`dataTools.duplicates.actions.${a}`)}
            </label>
          ))}
        </fieldset>
        <div className="rekenblad-vinkrij">
          <label>
            <input type="checkbox" checked={kop} disabled={klaar} onChange={(e) => setKop(e.target.checked)} />
            {t("dataTools.header")}
          </label>
          <label>
            <input type="checkbox" checked={hoofdletters} disabled={klaar} onChange={(e) => setHoofdletters(e.target.checked)} />
            {t("data.sort.caseSensitive")}
          </label>
        </div>
        <fieldset className="rekenblad-kolomkeuze" disabled={klaar || !gebied}>
          <legend>{t("dataTools.duplicates.columns")}</legend>
          <div className="rekenblad-kolomknoppen">
            <button type="button" className="werkruimte-knop" onClick={() => setGekozen(new Set(kolommen))}>
              {t("dataTools.selectAll")}
            </button>
            <button type="button" className="werkruimte-knop" onClick={() => setGekozen(new Set())}>
              {t("dataTools.selectNone")}
            </button>
          </div>
          <div className="rekenblad-kolomlijst" role="group" aria-label={t("dataTools.duplicates.columns")}>
            {kolommen.map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={gekozen.has(k)}
                  onChange={(e) => {
                    const nieuw = new Set(gekozen);
                    if (e.target.checked) nieuw.add(k);
                    else nieuw.delete(k);
                    setGekozen(nieuw);
                  }}
                />
                {kolomnaam(k)}
              </label>
            ))}
          </div>
        </fieldset>
        <p role="status" id={`${id}-status`} className="rekenblad-status">
          {status}
        </p>
      </div>
    </Dialoog>
  );
}
