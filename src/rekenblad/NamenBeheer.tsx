/** Naamdefinities beheren en maken uit kopregels (#70). */
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { alleenLezen, leesSelectie } from "../lint/rekenblad-opdrachten";
import {
  bewaarKopnamen,
  bewaarNaam,
  Naamfout,
  namenLijst,
  namenUitKoppen,
  naamVerwijzing,
  verwijderNaam,
  type Bereiknaam,
  type Kopkant,
  type Kopvoorstel,
} from "./namen";
import "./namen.css";

export function NamenBeheer({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet");
  const id = useId();
  const [namen, setNamen] = useState<Bereiknaam[]>([]);
  const [filter, setFilter] = useState("");
  const [gekozen, setGekozen] = useState<Bereiknaam | null>(null);
  const [invoer, setInvoer] = useState<Bereiknaam | null>(null);
  const [oorspronkelijk, setOorspronkelijk] = useState<
    Bereiknaam | undefined
  >();
  const [status, setStatus] = useState("");
  const [bevestig, setBevestig] = useState(false);
  const [koppen, setKoppen] = useState<ReturnType<typeof leesSelectie> | null>(
    null,
  );
  const [kanten, setKanten] = useState<Kopkant[]>(["boven"]);
  const [scope, setScope] = useState<number | null>(null);
  const [voorstel, setVoorstel] = useState<Kopvoorstel | null>(null);
  const [bezig, setBezig] = useState(false);
  const lopend = useRef(false);
  const bladenBijStart = useRef<string[]>([]);
  const info = api.handle.sheetInfo();
  const alleen = alleenLezen(api);
  const vast = !!gekozen && /^_xlnm\./i.test(gekozen.naam);
  const melding = (fout: unknown) =>
    fout instanceof Naamfout
      ? t(`names.errors.${fout.code}`, { name: fout.naam })
      : tekstVan(fout);
  useEffect(() => {
    const vernieuw = () => {
      try {
        setNamen(namenLijst(api));
      } catch (fout) {
        setStatus(
          fout instanceof Naamfout
            ? t(`names.errors.${fout.code}`)
            : tekstVan(fout),
        );
      }
    };
    vernieuw();
    return api.handle.onUpdate(vernieuw);
  }, [api, t]);
  async function doe(actie: () => Promise<void>) {
    if (lopend.current) return;
    lopend.current = true;
    setBezig(true);
    setStatus("");
    try {
      await actie();
    } catch (fout) {
      setStatus(melding(fout));
    } finally {
      lopend.current = false;
      setBezig(false);
    }
  }
  function nieuw() {
    try {
      const s = leesSelectie(api);
      bladenBijStart.current = [...info.sheetNames];
      setInvoer({
        naam: "",
        verwijzing: naamVerwijzing(info.sheetNames[s.blad], s.bereik),
        blad: null,
        verborgen: false,
      });
      setOorspronkelijk(undefined);
      setKoppen(null);
      setBevestig(false);
      setStatus("");
    } catch (fout) {
      setStatus(melding(fout));
    }
  }
  function beginKoppen() {
    try {
      bladenBijStart.current = [...info.sheetNames];
      setKoppen(leesSelectie(api));
      setInvoer(null);
      setVoorstel(null);
      setStatus("");
      setBevestig(false);
    } catch (fout) {
      setStatus(melding(fout));
    }
  }
  const bereiknaam = (n: Bereiknaam) =>
    n.blad === null ? t("names.workbook") : info.sheetNames[n.blad];
  const lijst = namen.filter((n) =>
    `${n.naam} ${n.verwijzing} ${bereiknaam(n)}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const scopeKeuze = (
    waarde: number | null,
    verander: (n: number | null) => void,
  ) => (
    <>
      <label htmlFor={`${id}-scope`}>{t("names.scope")}</label>
      <select
        id={`${id}-scope`}
        value={waarde ?? "werkmap"}
        onChange={(e) =>
          verander(e.target.value === "werkmap" ? null : Number(e.target.value))
        }
      >
        <option value="werkmap">{t("names.workbook")}</option>
        {info.sheetNames.map((naam, i) => (
          <option key={i} value={i}>
            {naam}
          </option>
        ))}
      </select>
    </>
  );
  return (
    <Paneel titel={t("names.title")} sluiten={sluiten} breed>
      <div className="rekenblad-formulier rekenblad-naambeheer">
        {!invoer && !koppen && (
          <>
            <label>
              {t("common:search")}
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <div className="rekenblad-namentabel">
              <table aria-label={t("names.title")}>
                <thead>
                  <tr>
                    <th>{t("names.name")}</th>
                    <th>{t("names.scope")}</th>
                    <th>{t("names.refersTo")}</th>
                    <th>{t("names.hidden")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lijst.map((n) => (
                    <tr
                      key={`${n.blad}:${n.naam}`}
                      className={
                        gekozen?.naam === n.naam && gekozen.blad === n.blad
                          ? "is-gekozen"
                          : ""
                      }
                    >
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            bladenBijStart.current = [...info.sheetNames];
                            setGekozen(n);
                            setBevestig(false);
                            setStatus("");
                          }}
                        >
                          {n.naam}
                        </button>
                      </td>
                      <td>{bereiknaam(n)}</td>
                      <td>
                        <code>{n.verwijzing}</code>
                      </td>
                      <td>{n.verborgen ? t("common:yes") : t("common:no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!lijst.length && <p>{t("names.empty")}</p>}
            </div>
            {vast && (
              <p className="rekenblad-hint">{t("names.reservedHint")}</p>
            )}
            <div className="rekenblad-knoppen">
              <button type="button" disabled={alleen || bezig} onClick={nieuw}>
                {t("names.new")}
              </button>
              <button
                type="button"
                disabled={alleen || bezig || !gekozen || vast}
                onClick={() => {
                  setInvoer(gekozen);
                  setOorspronkelijk(gekozen ?? undefined);
                  setStatus("");
                  setBevestig(false);
                }}
              >
                {t("common:edit")}
              </button>
              <button
                type="button"
                disabled={alleen || bezig || !gekozen || vast}
                onClick={() => setBevestig(true)}
              >
                {t("common:delete")}
              </button>
              <button
                type="button"
                disabled={alleen || bezig}
                onClick={beginKoppen}
              >
                {t("names.fromSelection")}
              </button>
            </div>
            {bevestig && gekozen && (
              <div
                role="group"
                aria-label={t("names.deleteQuestion", { name: gekozen.naam })}
              >
                <p>{t("names.deleteQuestion", { name: gekozen.naam })}</p>
                <p className="rekenblad-hint">{t("names.deleteHint")}</p>
                <div className="rekenblad-knoppen">
                  <button
                    type="button"
                    disabled={bezig}
                    onClick={() => setBevestig(false)}
                  >
                    {t("common:cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={bezig || alleen}
                    onClick={() =>
                      void doe(async () => {
                        await verwijderNaam(
                          api,
                          gekozen,
                          bladenBijStart.current,
                        );
                        setGekozen(null);
                        setBevestig(false);
                        setStatus(t("names.deleted"));
                      })
                    }
                  >
                    {t("common:delete")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {invoer && (
          <form
            className="rekenblad-formulier"
            onSubmit={(e) => {
              e.preventDefault();
              void doe(async () => {
                await bewaarNaam(
                  api,
                  invoer,
                  oorspronkelijk,
                  bladenBijStart.current,
                );
                setInvoer(null);
                setGekozen(null);
                setStatus(t("names.saved"));
              });
            }}
          >
            <label>
              {t("names.name")}
              <input
                autoFocus
                value={invoer.naam}
                readOnly={!!oorspronkelijk}
                onChange={(e) => setInvoer({ ...invoer, naam: e.target.value })}
              />
            </label>
            {oorspronkelijk && (
              <p className="rekenblad-hint">{t("names.editHint")}</p>
            )}
            {scopeKeuze(invoer.blad, (blad) => setInvoer({ ...invoer, blad }))}
            <label htmlFor={`${id}-definition`}>{t("names.refersTo")}</label>
            <textarea
              id={`${id}-definition`}
              rows={3}
              spellCheck={false}
              value={invoer.verwijzing}
              onChange={(e) =>
                setInvoer({ ...invoer, verwijzing: e.target.value })
              }
            />
            <p className="rekenblad-hint">{t("names.definitionHint")}</p>
            <label className="rekenblad-vinkje">
              <input
                type="checkbox"
                checked={invoer.verborgen}
                onChange={(e) =>
                  setInvoer({ ...invoer, verborgen: e.target.checked })
                }
              />
              {t("names.hidden")}
            </label>
            <div className="rekenblad-knoppen">
              <button
                type="button"
                disabled={bezig}
                onClick={() => {
                  setInvoer(null);
                  setStatus("");
                }}
              >
                {t("common:cancel")}
              </button>
              <button
                type="submit"
                className="rekenblad-primair"
                disabled={
                  bezig ||
                  alleen ||
                  !invoer.naam.trim() ||
                  !invoer.verwijzing.trim()
                }
              >
                {t("common:save")}
              </button>
            </div>
          </form>
        )}
        {koppen && (
          <>
            <p>
              {t("names.selection", {
                range: naamVerwijzing(
                  info.sheetNames[koppen.blad],
                  koppen.bereik,
                ),
              })}
            </p>
            <p className="rekenblad-hint">{t("names.headersHint")}</p>
            <fieldset disabled={bezig}>
              <legend>{t("names.headerSides")}</legend>
              {(["boven", "onder", "links", "rechts"] as const).map((kant) => (
                <label className="rekenblad-vinkje" key={kant}>
                  <input
                    type="checkbox"
                    checked={kanten.includes(kant)}
                    onChange={(e) => {
                      setKanten(
                        e.target.checked
                          ? [...kanten, kant]
                          : kanten.filter((k) => k !== kant),
                      );
                      setVoorstel(null);
                    }}
                  />
                  {t(`names.sides.${kant}`)}
                </label>
              ))}
            </fieldset>
            {scopeKeuze(scope, (blad) => {
              setScope(blad);
              setVoorstel(null);
            })}
            <button
              type="button"
              disabled={bezig || !kanten.length}
              onClick={() =>
                void doe(async () => {
                  setVoorstel(null);
                  setVoorstel(
                    await namenUitKoppen(
                      api,
                      koppen.blad,
                      koppen.bereik,
                      kanten,
                      scope,
                      bladenBijStart.current,
                    ),
                  );
                })
              }
            >
              {t("names.preview")}
            </button>
            {voorstel && (
              <div className="rekenblad-namentabel">
                <table aria-label={t("names.preview")}>
                  <thead>
                    <tr>
                      <th>{t("names.name")}</th>
                      <th>{t("names.refersTo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voorstel.namen.map((n) => (
                      <tr key={n.naam}>
                        <td>{n.naam}</td>
                        <td>
                          <code>{n.verwijzing}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!!voorstel.overgeslagen.length && (
                  <p>
                    {t("names.skipped", {
                      cells: voorstel.overgeslagen.join(", "),
                    })}
                  </p>
                )}
              </div>
            )}
            <div className="rekenblad-knoppen">
              <button
                type="button"
                disabled={bezig}
                onClick={() => {
                  setKoppen(null);
                  setStatus("");
                }}
              >
                {t("common:cancel")}
              </button>
              <button
                type="button"
                className="rekenblad-primair"
                disabled={!voorstel || bezig || alleen}
                onClick={() =>
                  void doe(async () => {
                    if (!voorstel) return;
                    await bewaarKopnamen(api, voorstel);
                    setKoppen(null);
                    setGekozen(null);
                    setStatus(t("names.saved"));
                  })
                }
              >
                {t("common:apply")}
              </button>
            </div>
          </>
        )}
        <p role="status" className="rekenblad-status">
          {status}
        </p>
        {!invoer && !koppen && (
          <div className="rekenblad-knoppen">
            <button type="button" onClick={sluiten}>
              {t("common:close")}
            </button>
          </div>
        )}
      </div>
    </Paneel>
  );
}
