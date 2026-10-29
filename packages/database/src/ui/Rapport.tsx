/**
 * Rapportontwerper (bron, velden, groeperen, sorteren, totalen, kop/voet) en
 * afdrukvoorbeeld. Afdrukken en PDF gaan via het gedeelde afdrukvoorbeeld van
 * Office Studio: dezelfde pagina's op papier en in de PDF.
 */
import { Suspense, lazy, useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Printer, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatGetal, useOpmaak } from "../../../../src/i18n/opmaak";
import type { QueryResultaat, Veldsoort, Werkkopie } from "../werkkopie/contract.ts";
import { leesbareFout, toonWaarde } from "./invoer.ts";
import { bouwRapport, FUNCTIENAMEN, type RapportDefinitie, type Totaal, type Totaalfunctie } from "./rapport-logica.ts";
import { kolommenVan, laadBron } from "./bron.ts";
import { useDialogen } from "./Dialoog.tsx";
import type { AfdrukBron } from "../../../../src/afdrukken/bron";
import type { RapportTabel } from "../../../../src/afdrukken/bronRapport";

const Afdrukvoorbeeld = lazy(() => import("../../../../src/afdrukken/Afdrukvoorbeeld"));

function totaalTekst(totalen: Totaal[], kolom: string, soort: Veldsoort | null) {
  return totalen
    .filter((t) => t.veld.toLowerCase() === kolom.toLowerCase())
    .map(
      (t) =>
        `${FUNCTIENAMEN[t.functie]} ${t.waarde === null ? "–" : t.functie === "aantal" ? formatGetal(t.waarde) : toonWaarde(Math.round(t.waarde * 100) / 100, soort === "valuta" ? "valuta" : "getal")}`,
    )
    .join(" · ");
}

export function RapportOntwerper({
  werkkopie,
  bronnen,
  naam: beginNaam,
  bron: beginBron,
  definitie: beginDefinitie,
  bestaandeNamen,
  nieuw = false,
  onBewaard,
  onVoorbeeld,
}: {
  werkkopie: Werkkopie;
  bronnen: string[];
  naam: string;
  bron: string;
  definitie: RapportDefinitie;
  bestaandeNamen: string[];
  /** Nog niet opgeslagen ontwerp: een bestaande naam vraagt om bevestiging. */
  nieuw?: boolean;
  onBewaard: (naam: string) => void;
  onVoorbeeld: (naam: string, bron: string, def: RapportDefinitie) => void;
}) {
  const { t } = useTranslation("database");
  const dialogen = useDialogen();
  const id = useId();
  const [naam, setNaam] = useState(beginNaam);
  const [bron, setBron] = useState(beginBron);
  const [def, setDef] = useState<RapportDefinitie>(beginDefinitie);
  const [kolommen, setKolommen] = useState<{ naam: string; soort: Veldsoort | null }[]>([]);
  const [fout, setFout] = useState("");
  const [melding, setMelding] = useState("");
  /** Naam waaronder dit ontwerp nu in de werkkopie staat (vervangen zonder te vragen). */
  const [bewaardAls, setBewaardAls] = useState(nieuw ? "" : beginNaam);
  const zet = (deel: Partial<RapportDefinitie>) => setDef((d) => ({ ...d, ...deel }));

  useEffect(() => {
    let actief = true;
    setFout("");
    if (!bron) return setKolommen([]);
    kolommenVan(werkkopie, bron).then(
      (k) => {
        if (!actief) return;
        setKolommen(k);
      },
      (e) => actief && setFout(leesbareFout(e)),
    );
    return () => {
      actief = false;
    };
  }, [werkkopie, bron]);

  const gekozen = def.velden.length ? def.velden : kolommen.map((k) => k.naam);
  // Getalvelden, met bedragen en getallen vóór sleutels (AutoNummering).
  const getallen = kolommen
    .filter((k) => k.soort === null || ["geheel", "getal", "valuta", "autonummer"].includes(k.soort))
    .sort((a, b) => Number(a.soort === "autonummer") - Number(b.soort === "autonummer"));

  function wisselVeld(veld: string, aan: boolean) {
    const basis = def.velden.length ? def.velden : kolommen.map((k) => k.naam);
    zet({ velden: aan ? [...basis.filter((v) => v !== veld), veld] : basis.filter((v) => v !== veld) });
  }
  function verplaats(i: number, d: number) {
    const lijst = [...gekozen];
    const j = i + d;
    if (j < 0 || j >= lijst.length) return;
    [lijst[i], lijst[j]] = [lijst[j], lijst[i]];
    zet({ velden: lijst });
  }

  async function bewaar() {
    const schoon = naam.trim();
    if (!schoon) return setFout(t("report.nameRequired"));
    if (!bron) return setFout(t("report.sourceRequired"));
    if (schoon.toLowerCase() !== bewaardAls.toLowerCase() && bestaandeNamen.some((n) => n.toLowerCase() === schoon.toLowerCase())) {
      const ja = await dialogen.bevestig({ titel: t("report.replaceTitle"), tekst: t("report.replaceText", { name: schoon }), ja: t("report.replace"), gevaarlijk: true });
      if (!ja) return;
    }
    try {
      await werkkopie.bewaarOntwerp({ naam: schoon, soort: "rapport", bron, definitie: { ...def, titel: def.titel || schoon } });
      setMelding(t("report.saved", { name: schoon }));
      setBewaardAls(schoon);
      setFout("");
      onBewaard(schoon);
    } catch (e) {
      setFout(t("report.saveFailed", { error: leesbareFout(e) }));
    }
  }

  return (
    <form
      className="database-ontwerper"
      onSubmit={(e) => {
        e.preventDefault();
        void bewaar();
      }}
    >
      <div className="database-ontwerper-raster">
        <label className="database-veld" htmlFor={`${id}-naam`}>
          <span>{t("report.name")}</span>
          <input id={`${id}-naam`} value={naam} onChange={(e) => setNaam(e.target.value)} />
        </label>
        <label className="database-veld" htmlFor={`${id}-bron`}>
          <span>{t("report.source")}</span>
          <select
            id={`${id}-bron`}
            value={bron}
            onChange={(e) => {
              setBron(e.target.value);
              zet({ velden: [], groepeer: null, sorteer: [], totalen: [] });
            }}
          >
            <option value="">{t("report.chooseSource")}</option>
            {bronnen.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="database-veld" htmlFor={`${id}-titel`}>
          <span>{t("report.title")}</span>
          <input id={`${id}-titel`} value={def.titel} onChange={(e) => zet({ titel: e.target.value })} />
        </label>
        <label className="database-veld" htmlFor={`${id}-kop`}>
          <span>{t("report.header")}</span>
          <input id={`${id}-kop`} value={def.kop} onChange={(e) => zet({ kop: e.target.value })} />
        </label>
        <label className="database-veld" htmlFor={`${id}-voet`}>
          <span>{t("report.footer")}</span>
          <input id={`${id}-voet`} value={def.voet} onChange={(e) => zet({ voet: e.target.value })} />
        </label>
        <label className="database-veld database-veld-rij" htmlFor={`${id}-liggend`}>
          <input id={`${id}-liggend`} type="checkbox" checked={!!def.liggend} onChange={(e) => zet({ liggend: e.target.checked })} />
          <span>{t("report.landscape")}</span>
        </label>
      </div>
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {!!kolommen.length && (
        <div className="database-ontwerper-delen">
          <fieldset>
            <legend>{t("report.fieldsAndOrder")}</legend>
            <ul className="database-keuzelijst">
              {gekozen.map((v, i) => (
                <li key={v}>
                  <label>
                    <input type="checkbox" checked onChange={() => wisselVeld(v, false)} /> {v}
                  </label>
                  <button type="button" aria-label={t("report.moveUp", { field: v })} disabled={i === 0} onClick={() => verplaats(i, -1)}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" aria-label={t("report.moveDown", { field: v })} disabled={i === gekozen.length - 1} onClick={() => verplaats(i, 1)}>
                    <ArrowDown size={14} />
                  </button>
                </li>
              ))}
              {kolommen
                .filter((k) => !gekozen.includes(k.naam))
                .map((k) => (
                  <li key={k.naam} className="is-uit">
                    <label>
                      <input type="checkbox" checked={false} onChange={() => wisselVeld(k.naam, true)} /> {k.naam}
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>
          <fieldset>
            <legend>{t("report.groupAndSort")}</legend>
            <label className="database-veld" htmlFor={`${id}-groep`}>
              <span>{t("report.groupBy")}</span>
              <select id={`${id}-groep`} value={def.groepeer ?? ""} onChange={(e) => zet({ groepeer: e.target.value || null })}>
                <option value="">{t("report.noGrouping")}</option>
                {kolommen.map((k) => (
                  <option key={k.naam} value={k.naam}>
                    {k.naam}
                  </option>
                ))}
              </select>
            </label>
            {def.sorteer.map((s, i) => (
              <div key={i} className="database-ontwerper-regel">
                <select
                  aria-label={t("report.sortField", { number: i + 1 })}
                  value={s.veld}
                  onChange={(e) => zet({ sorteer: def.sorteer.map((x, j) => (j === i ? { ...x, veld: e.target.value } : x)) })}
                >
                  {kolommen.map((k) => (
                    <option key={k.naam} value={k.naam}>
                      {k.naam}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("report.sortOrder", { number: i + 1 })}
                  value={s.aflopend ? "af" : "op"}
                  onChange={(e) => zet({ sorteer: def.sorteer.map((x, j) => (j === i ? { ...x, aflopend: e.target.value === "af" } : x)) })}
                >
                  <option value="op">{t("report.ascending")}</option>
                  <option value="af">{t("report.descending")}</option>
                </select>
                <button type="button" aria-label={t("report.deleteSort", { number: i + 1 })} onClick={() => zet({ sorteer: def.sorteer.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => zet({ sorteer: [...def.sorteer, { veld: kolommen[0].naam, aflopend: false }] })}>
              <Plus size={14} /> {t("report.addSort")}
            </button>
          </fieldset>
          <fieldset>
            <legend>{t("report.totals")}</legend>
            {def.totalen.map((tot, i) => (
              <div key={i} className="database-ontwerper-regel">
                <select
                  aria-label={t("report.totalFunction", { number: i + 1 })}
                  value={tot.functie}
                  onChange={(e) => zet({ totalen: def.totalen.map((x, j) => (j === i ? { ...x, functie: e.target.value as Totaalfunctie } : x)) })}
                >
                  {(Object.keys(FUNCTIENAMEN) as Totaalfunctie[]).map((f) => (
                    <option key={f} value={f}>
                      {FUNCTIENAMEN[f]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("report.totalField", { number: i + 1 })}
                  value={tot.veld}
                  onChange={(e) => zet({ totalen: def.totalen.map((x, j) => (j === i ? { ...x, veld: e.target.value } : x)) })}
                >
                  {(tot.functie === "aantal" ? kolommen : getallen).map((k) => (
                    <option key={k.naam} value={k.naam}>
                      {k.naam}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label={t("report.deleteTotal", { number: i + 1 })} onClick={() => zet({ totalen: def.totalen.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => zet({ totalen: [...def.totalen, { veld: (getallen[0] ?? kolommen[0]).naam, functie: getallen.length ? "som" : "aantal" }] })}
            >
              <Plus size={14} /> {t("report.addTotal")}
            </button>
          </fieldset>
        </div>
      )}
      {melding && (
        <p className="melding" role="status">
          {melding}
        </p>
      )}
      <div className="database-knoppen">
        <button type="submit" className="primary">
          <Save size={16} /> {t("report.saveReport")}
        </button>
        <button type="button" disabled={!bron} onClick={() => onVoorbeeld(naam.trim() || t("report.defaultName"), bron, { ...def, titel: def.titel || naam })}>
          <Eye size={16} /> {t("report.printPreview")}
        </button>
      </div>
    </form>
  );
}

function TotaalCel({ totalen, kolom, soort }: { totalen: Totaal[]; kolom: string; soort: Veldsoort | null }) {
  const { getal } = useOpmaak();
  const lijst = totalen.filter((t) => t.veld.toLowerCase() === kolom.toLowerCase());
  return (
    <td className="database-totaal">
      {lijst.map((t, i) => (
        <div key={i}>
          <small>{FUNCTIENAMEN[t.functie]}</small>{" "}
          {t.waarde === null ? "–" : t.functie === "aantal" ? getal(t.waarde) : toonWaarde(Math.round(t.waarde * 100) / 100, soort === "valuta" ? "valuta" : "getal")}
        </div>
      ))}
    </td>
  );
}

export function RapportVoorbeeld({
  werkkopie,
  naam,
  bron,
  definitie,
  onOntwerp,
}: {
  werkkopie: Werkkopie;
  naam: string;
  bron: string;
  definitie: RapportDefinitie;
  onOntwerp?: () => void;
}) {
  const { t } = useTranslation("database");
  const opmaak = useOpmaak();
  const dialogen = useDialogen();
  const [data, setData] = useState<QueryResultaat | null>(null);
  const [fout, setFout] = useState("");
  const [geannuleerd, setGeannuleerd] = useState(false);

  useEffect(() => {
    let actief = true;
    (async () => {
      await Promise.resolve();
      if (!actief) return;
      try {
        const r = await laadBron(werkkopie, bron, dialogen);
        if (!actief) return;
        if (!r) setGeannuleerd(true);
        else setData(r);
      } catch (e) {
        if (actief) setFout(leesbareFout(e));
      }
    })();
    return () => {
      actief = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [werkkopie, bron]);

  const rapport = useMemo(() => (data ? bouwRapport(data.kolommen, data.rijen, definitie) : null), [data, definitie]);
  const soortVan = (kolom: string) => {
    const i = data?.kolommen.indexOf(kolom) ?? -1;
    return i >= 0 ? (data?.kolomsoorten?.[i] ?? null) : null;
  };
  const groepSoort = definitie.groepeer ? soortVan(data?.kolommen.find((k) => k.toLowerCase() === definitie.groepeer!.toLowerCase()) ?? "") : null;

  const [voorbeeld, setVoorbeeld] = useState(false);
  const [afdrukMelding, setAfdrukMelding] = useState("");

  const afdrukbron = useMemo<AfdrukBron | null>(() => {
    if (!rapport || !data) return null;
    const soorten = rapport.kolommen.map((k) => soortVan(k));
    const tabel: RapportTabel = {
      titel: definitie.titel || naam,
      kop: definitie.kop || undefined,
      voet: definitie.voet || undefined,
      voetRechts: voetTekst(rapport.aantal, !!data.afgekapt),
      kolommen: rapport.kolommen,
      rechts: rapport.indexen.map((idx) => {
        const soort = data.kolomsoorten?.[idx];
        return soort === "getal" || soort === "valuta" || typeof rapport.groepen[0]?.rijen[0]?.[idx] === "number";
      }),
      secties: rapport.groepen.map((g) => ({
        kop:
          g.sleutel !== undefined
            ? `${definitie.groepeer}: ${g.sleutel === null ? t("report.empty") : toonWaarde(g.sleutel, groepSoort)}`
            : undefined,
        rijen: g.rijen.map((rij) => rapport.indexen.map((idx) => toonWaarde(rij[idx], data.kolomsoorten?.[idx] ?? null))),
        totaal:
          g.sleutel !== undefined && g.totalen.length
            ? rapport.kolommen.map((k, i) => totaalTekst(g.totalen, k, soorten[i]))
            : undefined,
      })),
      eindtotaal: rapport.eindtotalen.length
        ? rapport.kolommen.map((k, i) => totaalTekst(rapport.eindtotalen, k, soorten[i]))
        : undefined,
    };
    return {
      soort: "rapport",
      titel: tabel.titel,
      stand: definitie.liggend ? "liggend" : "staand",
      maak: async (stand) => {
        const { rapportPaginas } = await import("../../../../src/afdrukken/bronRapport");
        return rapportPaginas(tabel, stand);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapport, data, definitie, naam, opmaak, t]);

  function voetTekst(aantal: number, afgekapt: boolean) {
    const tekst = t("report.recordCount", { count: aantal, total: opmaak.getal(aantal), date: opmaak.datum(new Date(), { day: "numeric", month: "numeric", year: "numeric" }) });
    return afgekapt ? t("report.recordCountTruncated", { text: tekst, limit: opmaak.getal(50_000) }) : tekst;
  }

  async function bewaarPdf(bytes: Uint8Array, bestandsnaam: string, mime: string) {
    const { bewaarBytes } = await import("../../../../src/afdrukken/bewaren");
    return bewaarBytes(bytes, bestandsnaam, mime, { terugvalDownload: true });
  }

  return (
    <div className="database-rapportvoorbeeld">
      <div className="database-werkbalk" role="toolbar" aria-label={t("report.printPreview")}>
        <button className="primary" onClick={() => setVoorbeeld(true)} disabled={!afdrukbron}>
          <Printer size={16} /> {t("report.printOrPdf")}
        </button>
        {onOntwerp && (
          <button onClick={onOntwerp}>
            <Pencil size={16} /> {t("report.design")}
          </button>
        )}
        <span className="muted">{t("report.previewHint")}</span>
      </div>
      {afdrukMelding && <p role="status">{afdrukMelding}</p>}
      {voorbeeld && afdrukbron && (
        <Suspense fallback={null}>
          <Afdrukvoorbeeld
            bron={afdrukbron}
            sluit={() => setVoorbeeld(false)}
            meld={setAfdrukMelding}
            bewaar={bewaarPdf}
          />
        </Suspense>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {geannuleerd && <p role="status">{t("report.parametersCancelled")}</p>}
      {!rapport && !fout && !geannuleerd && <p role="status">{t("report.building")}</p>}
      {rapport && (
        <div className={`database-afdruk ${definitie.liggend ? "is-liggend" : ""}`} aria-label={t("report.previewOf", { name: naam })}>
          <header className="database-afdrukkop">
            <h1>{definitie.titel || naam}</h1>
            {definitie.kop && <p>{definitie.kop}</p>}
          </header>
          {!!rapport.ontbrekend.length && (
            <p className="melding fout">{t("report.missingFields", { fields: rapport.ontbrekend.join(", ") })}</p>
          )}
          <table>
            <thead>
              <tr>
                {rapport.kolommen.map((k, i) => (
                  <th key={i} scope="col">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            {rapport.groepen.map((g, gi) => (
              <tbody key={gi}>
                {g.sleutel !== undefined && (
                  <tr className="database-groepkop">
                    <th colSpan={rapport.kolommen.length} scope="rowgroup">
                      {definitie.groepeer}: {g.sleutel === null ? t("report.empty") : toonWaarde(g.sleutel, groepSoort)}
                    </th>
                  </tr>
                )}
                {g.rijen.map((rij, ri) => (
                  <tr key={ri}>
                    {rapport.indexen.map((idx, ci) => (
                      <td key={ci} className={typeof rij[idx] === "number" ? "is-getal" : ""}>
                        {toonWaarde(rij[idx], data?.kolomsoorten?.[idx] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
                {g.sleutel !== undefined && !!g.totalen.length && (
                  <tr className="database-groepvoet">
                    {rapport.kolommen.map((k, ci) => (
                      <TotaalCel key={ci} totalen={g.totalen} kolom={k} soort={soortVan(k)} />
                    ))}
                  </tr>
                )}
              </tbody>
            ))}
            {!!rapport.eindtotalen.length && (
              <tfoot>
                <tr>
                  {rapport.kolommen.map((k, ci) => (
                    <TotaalCel key={ci} totalen={rapport.eindtotalen} kolom={k} soort={soortVan(k)} />
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
          {rapport.eindtotalen.some((t) => !rapport.kolommen.some((k) => k.toLowerCase() === t.veld.toLowerCase())) && (
            <p className="muted">
              {t("report.hiddenTotals", {
                totals: rapport.eindtotalen
                  .filter((x) => !rapport.kolommen.some((k) => k.toLowerCase() === x.veld.toLowerCase()))
                  .map((x) => `${FUNCTIENAMEN[x.functie]} ${x.veld}: ${x.waarde === null ? "–" : opmaak.getal(x.waarde)}`)
                  .join(" · "),
              })}
            </p>
          )}
          <footer className="database-afdrukvoet">
            <span>{definitie.voet}</span>
            <span>
              {voetTekst(rapport.aantal, !!data?.afgekapt)}
            </span>
          </footer>
        </div>
      )}
    </div>
  );
}
