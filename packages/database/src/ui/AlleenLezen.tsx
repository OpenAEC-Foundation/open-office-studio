/**
 * Alleen-lezen-weergave van objecten uit de analyse (zonder werkkopie): tabellen
 * per pagina van 200 rijen, querydefinities en VBA-bron. Wordt gebruikt als de
 * werkkopie niet (of nog niet) beschikbaar is.
 */
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatGetal } from "../../../../src/i18n/opmaak.ts";
import type { DatabaseObject } from "../model.ts";
import type { DatabaseClient } from "../database-client.ts";
import { Bron } from "./VbaPaneel.tsx";

export function Details({ object }: { object: DatabaseObject }) {
  const { t } = useTranslation("database");
  return (
    <>
      {!!object.eigenschappen?.length && (
        <dl className="database-eigenschappen">
          {object.eigenschappen.map(([sleutel, waarde]) => (
            <div key={sleutel}>
              <dt>{sleutel}</dt>
              <dd>{waarde}</dd>
            </div>
          ))}
        </dl>
      )}
      {!!object.beperkingen?.length && (
        <ul className="database-beperkingen" aria-label={t("readOnly.limitations")}>
          {object.beperkingen.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export function AlleenLezenObject({ object, lezer }: { object: DatabaseObject; lezer: DatabaseClient | null }) {
  const [tabel, setTabel] = useState<DatabaseObject | null>(object.rijen ? object : null);
  const [start, setStart] = useState(0);
  const [zoek, setZoek] = useState("");
  const [fout, setFout] = useState("");
  const { t } = useTranslation("database");
  useEffect(() => {
    if (object.soort !== "Tabel" || !lezer) return;
    let actief = true;
    lezer.tabel(object.naam, start).then(
      (t) => actief && setTabel({ ...object, ...t }),
      (e) => actief && setFout(t("readOnly.tableReadFailed", { error: String(e) })),
    );
    return () => {
      actief = false;
    };
  }, [object, lezer, start, t]);

  if (object.soort === "Query" || object.soort === "VBA")
    return (
      <>
        <Details object={object} />
        {object.bron ? (
          <Bron bron={object.bron} taal={object.soort === "VBA" ? "vba" : "sql"} />
        ) : (
          <p role="status">{t("readOnly.noSource")}</p>
        )}
      </>
    );
  if (object.soort !== "Tabel") return <Details object={object} />;
  const rijen = tabel?.rijen?.filter((r) => r.some((c) => c.toLowerCase().includes(zoek.toLowerCase()))) ?? [];
  return (
    <>
      <Details object={{ ...object, eigenschappen: [] }} />
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      {!tabel ? (
        <p role="status">{t("readOnly.loadingPage")}</p>
      ) : (
        <>
          <label className="zoek">
            <Search size={17} aria-hidden />
            <input aria-label={t("readOnly.searchLabel")} placeholder={t("readOnly.searchPlaceholder")} value={zoek} onChange={(e) => setZoek(e.target.value)} />
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {tabel.kolommen?.map((k, i) => (
                    <th key={i} scope="col">
                      {k}
                      {tabel.kolomtypen?.[i] && <small className="database-kolomtype">{tabel.kolomtypen[i]}</small>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rijen.map((rij, i) => (
                  <tr key={i}>
                    {rij.map((cel, j) => (
                      <td key={j}>{cel}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            {t("readOnly.rowsShown", { count: rijen.length })}
            {tabel.totaalRijen !== undefined &&
              ` · ${t("readOnly.pageFrom", { start: formatGetal(tabel.totaalRijen ? start + 1 : 0), total: formatGetal(tabel.totaalRijen) })}`}
            {` · ${t("readOnly.readOnly")}`}
          </p>
          {lezer && (
            <div className="database-paginering">
              <button disabled={start === 0} onClick={() => setStart(Math.max(0, start - 200))}>
                {t("readOnly.previousPage")}
              </button>
              <button disabled={start + 200 >= (tabel.totaalRijen ?? 0)} onClick={() => setStart(start + 200)}>
                {t("readOnly.nextPage")}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
