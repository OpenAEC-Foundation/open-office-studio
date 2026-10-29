/** Ontwerpweergave van een tabel (velden, typen, sleutel bewerken) en de editor voor een nieuwe tabel. */
import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Check, KeyRound, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { formatGetal } from "../../../../src/i18n/opmaak.ts";
import type { RelatieSchema, TabelSchema, VeldSchema, Veldsoort, Werkkopie } from "../werkkopie/contract.ts";
import { leesbareFout, SOORTNAMEN } from "./invoer.ts";
import { useDialogen } from "./Dialoog.tsx";
import {
  conceptNaarVeld,
  conceptUitVeld,
  ONTWERPSOORTEN,
  sleutelPlan,
  structuurTekst,
  veldPlan,
  type ConceptVeld,
} from "./ontwerp-logica.ts";

const LEEG_VELD = (sleutel: number): ConceptVeld => ({ sleutel, naam: "", soort: "tekst", lengte: "255", verplicht: false, primair: false, standaard: "" });

export function TabelOntwerp({
  werkkopie,
  schema,
  relaties,
  onVerwijderd,
  onGewijzigd,
}: {
  werkkopie: Werkkopie;
  schema: TabelSchema;
  relaties: RelatieSchema[];
  onVerwijderd: () => void;
  /** Na een geslaagde structuurwijziging, met een leesbare uitkomst. */
  onGewijzigd: (melding: string) => void | Promise<void>;
}) {
  const id = useId();
  const dialogen = useDialogen();
  const { t } = useTranslation("database");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [concepten, setConcepten] = useState<ConceptVeld[]>(() => schema.velden.map(conceptUitVeld));
  const [nieuw, setNieuw] = useState<ConceptVeld>(() => LEEG_VELD(-1));
  useEffect(() => {
    setConcepten(schema.velden.map(conceptUitVeld));
  }, [schema]);
  const eigen = relaties.filter(
    (r) => r.tabel.toLowerCase() === schema.naam.toLowerCase() || r.naarTabel.toLowerCase() === schema.naam.toLowerCase(),
  );
  const zet = (i: number, deel: Partial<ConceptVeld>) => setConcepten((l) => l.map((v, j) => (j === i ? { ...v, ...deel } : v)));
  const sleutel = sleutelPlan(schema, concepten);

  async function voer(actie: () => Promise<string>) {
    setFout("");
    setBezig(true);
    try {
      const melding = await actie();
      await onGewijzigd(melding);
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setBezig(false);
    }
  }

  async function pasToe(i: number) {
    const oud = schema.velden[i];
    const plan = veldPlan(oud, concepten[i]);
    if ("fout" in plan) return setFout(plan.fout);
    if (!plan.hernoem && !plan.wijziging) return;
    if (plan.wijziging?.soort) {
      const ja = await dialogen.bevestig({
        titel: t("tableDesign.changeType.title"),
        tekst: t("tableDesign.changeType.text", {
          field: oud.naam,
          from: SOORTNAMEN[oud.soort],
          to: SOORTNAMEN[plan.wijziging.soort],
          count: schema.aantal,
          rows: formatGetal(schema.aantal),
        }),
        ja: t("tableDesign.changeType.confirm"),
        standaardNee: true,
      });
      if (!ja) return;
    }
    await voer(async () => {
      const delen: string[] = [];
      let naam = oud.naam;
      if (plan.hernoem) {
        const r = await werkkopie.hernoemVeld(schema.naam, oud.naam, plan.hernoem);
        delen.push(structuurTekst(t("tableDesign.result.renamed", { from: oud.naam, to: plan.hernoem }), r));
        naam = plan.hernoem;
      }
      if (plan.wijziging) {
        const r = await werkkopie.wijzigVeld(schema.naam, naam, plan.wijziging);
        delen.push(structuurTekst(t("tableDesign.result.changed", { field: naam }), r));
      }
      return delen.join(" ");
    });
  }

  async function verwijderVeld(i: number) {
    const v = schema.velden[i];
    const ja = await dialogen.bevestig({
      titel: t("tableDesign.deleteField.title"),
      tekst: t("tableDesign.deleteField.text", { field: v.naam, count: schema.aantal, rows: formatGetal(schema.aantal) }),
      ja: t("common:delete"),
      gevaarlijk: true,
    });
    if (!ja) return;
    await voer(async () => structuurTekst(t("tableDesign.result.deleted", { field: v.naam }), await werkkopie.verwijderVeld(schema.naam, v.naam)));
  }

  async function bewaarSleutel() {
    if (!sleutel) return;
    const ja = await dialogen.bevestig({
      titel: t("tableDesign.primaryKey.title"),
      tekst: sleutel.length
        ? t("tableDesign.primaryKey.set", { table: schema.naam, fields: sleutel.join(", ") })
        : t("tableDesign.primaryKey.remove", { table: schema.naam }),
      ja: t("tableDesign.primaryKey.confirm"),
      standaardNee: true,
    });
    if (!ja) return;
    await voer(async () =>
      structuurTekst(
        sleutel.length ? t("tableDesign.result.keySet", { fields: sleutel.join(", ") }) : t("tableDesign.result.keyRemoved"),
        await werkkopie.zetPrimaireSleutel(schema.naam, sleutel)),
    );
  }

  async function voegToe() {
    const r = conceptNaarVeld({ ...nieuw, primair: false });
    if ("fout" in r) return setFout(r.fout);
    await voer(async () => {
      const uit = structuurTekst(t("tableDesign.result.added", { field: r.veld.naam }), await werkkopie.voegVeldToe(schema.naam, r.veld));
      setNieuw(LEEG_VELD(-1));
      return uit;
    });
  }

  const rij = (v: ConceptVeld, i: number | null) => {
    const label = v.naam || (i === null ? t("tableDesign.newField") : t("tableDesign.fieldN", { n: i + 1 }));
    const wijzig = (deel: Partial<ConceptVeld>) => (i === null ? setNieuw((n) => ({ ...n, ...deel })) : zet(i, deel));
    const plan = i === null ? null : veldPlan(schema.velden[i], v);
    const gewijzigd = !!plan && ("fout" in plan || !!plan.hernoem || !!plan.wijziging);
    return (
      <tr key={v.sleutel} className={gewijzigd ? "is-gewijzigd" : undefined}>
        <td>
          {i === null ? (
            <span className="sr-only">{t("tableDesign.noKey")}</span>
          ) : (
            <input type="checkbox" aria-label={t("tableDesign.aria.inKey", { field: label })} checked={v.primair} disabled={bezig} onChange={(e) => wijzig({ primair: e.target.checked })} />
          )}
          {i !== null && schema.velden[i].primair && <KeyRound size={14} aria-hidden />}
        </td>
        <td>
          <input aria-label={i === null ? t("tableDesign.aria.newFieldName") : t("tableDesign.aria.name", { field: label })} value={v.naam} disabled={bezig} onChange={(e) => wijzig({ naam: e.target.value })} />
        </td>
        <td>
          <select aria-label={t("tableDesign.aria.type", { field: label })} value={v.soort} disabled={bezig} onChange={(e) => wijzig({ soort: e.target.value as Veldsoort, lengte: e.target.value === "tekst" ? v.lengte || "255" : "" })}>
            {ONTWERPSOORTEN.map((s) => (
              <option key={s} value={s}>
                {SOORTNAMEN[s]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input aria-label={t("tableDesign.aria.length", { field: label })} disabled={bezig || v.soort !== "tekst"} inputMode="numeric" size={4} value={v.soort === "tekst" ? v.lengte : ""} onChange={(e) => wijzig({ lengte: e.target.value })} />
        </td>
        <td>
          <input type="checkbox" aria-label={t("tableDesign.aria.required", { field: label })} checked={v.verplicht} disabled={bezig} onChange={(e) => wijzig({ verplicht: e.target.checked })} />
        </td>
        <td>
          <input
            aria-label={t("tableDesign.aria.default", { field: label })}
            disabled={bezig || v.soort === "autonummer" || v.soort === "binair"}
            value={v.standaard}
            onChange={(e) => wijzig({ standaard: e.target.value })}
          />
        </td>
        <td className="database-rij-acties">
          {i === null ? (
            <button type="button" className="primary" disabled={bezig || !v.naam.trim()} onClick={() => void voegToe()}>
              <Plus size={14} /> {t("tableDesign.add")}
            </button>
          ) : (
            <>
              <button type="button" aria-label={t("tableDesign.aria.apply", { field: schema.velden[i].naam })} title={t("common:apply")} disabled={bezig || !gewijzigd} onClick={() => void pasToe(i)}>
                <Check size={14} />
              </button>
              <button
                type="button"
                aria-label={t("tableDesign.aria.revert", { field: schema.velden[i].naam })}
                title={t("tableDesign.revert")}
                disabled={bezig || !gewijzigd}
                onClick={() => zet(i, { ...conceptUitVeld(schema.velden[i], v.sleutel), primair: v.primair })}
              >
                <RotateCcw size={14} />
              </button>
              <button type="button" aria-label={t("tableDesign.aria.delete", { field: schema.velden[i].naam })} title={t("tableDesign.deleteField.title")} disabled={bezig || schema.velden.length < 2} onClick={() => void verwijderVeld(i)}>
                <Trash2 size={14} />
              </button>
            </>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="database-ontwerp" aria-busy={bezig}>
      <div className="table-wrap">
        <table aria-label={t("tableDesign.fieldsOf", { table: schema.naam })} aria-describedby={`${id}-uitleg`}>
          <thead>
            <tr>
              <th scope="col">{t("tableDesign.column.key")}</th>
              <th scope="col">{t("tableDesign.column.name")}</th>
              <th scope="col">{t("tableDesign.column.type")}</th>
              <th scope="col">{t("tableDesign.column.length")}</th>
              <th scope="col">{t("tableDesign.column.required")}</th>
              <th scope="col">{t("tableDesign.column.default")}</th>
              <th scope="col">
                <span className="sr-only">{t("tableDesign.column.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {concepten.map((v, i) => rij(v, i))}
            {rij(nieuw, null)}
          </tbody>
        </table>
      </div>
      <p id={`${id}-uitleg`} className="muted">
        {schema.herkomst === "access" ? t("tableDesign.originAccess") : t("tableDesign.originWorkingCopy")} ·{" "}
        {t("tableDesign.rows", { count: schema.aantal, formatted: formatGetal(schema.aantal) })} {t("tableDesign.hint")}
      </p>
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      <div className="database-knoppen">
        <button type="button" className="primary" disabled={bezig || !sleutel} onClick={() => void bewaarSleutel()}>
          <KeyRound size={16} /> {t("tableDesign.saveKey")}
        </button>
        <button
          className="is-gevaar"
          disabled={bezig}
          onClick={async () => {
            const ja = await dialogen.bevestig({
              titel: t("tableDesign.deleteTable.title"),
              tekst: t("tableDesign.deleteTable.text", { table: schema.naam, count: schema.aantal, rows: formatGetal(schema.aantal) }),
              ja: t("common:delete"),
              gevaarlijk: true,
            });
            if (!ja) return;
            try {
              await werkkopie.verwijderTabel(schema.naam);
              onVerwijderd();
            } catch (e) {
              setFout(leesbareFout(e));
            }
          }}
        >
          <Trash2 size={16} /> {t("tableDesign.deleteTable.title")}
        </button>
      </div>
      {!!eigen.length && (
        <>
          <h3>{t("relationships.title")}</h3>
          <ul className="database-relatielijst">
            {eigen.map((r) => (
              <li key={r.naam}>
                {r.tabel}.{r.velden.join(", ")} → {r.naarTabel}.{r.naarVelden.join(", ")}
                {r.integriteit ? ` · ${t("tableDesign.integrity")}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const SOORTEN: Veldsoort[] = ["autonummer", "tekst", "memo", "geheel", "getal", "valuta", "datum", "jaNee", "guid"];

/** Zet de concepten om naar een schema of geeft de eerste fout. */
export function conceptNaarSchema(naam: string, velden: ConceptVeld[]): { schema: { naam: string; velden: VeldSchema[] } } | { fout: string } {
  if (!naam.trim()) return { fout: i18next.t("database:tableDesign.errors.tableName") };
  if (!velden.length) return { fout: i18next.t("database:tableDesign.errors.noFields") };
  const uit: VeldSchema[] = [];
  for (const v of velden) {
    const r = conceptNaarVeld(v);
    if ("fout" in r) return r;
    uit.push(r.veld);
  }
  return { schema: { naam: naam.trim(), velden: uit } };
}

export function NieuweTabel({ werkkopie, onGemaakt }: { werkkopie: Werkkopie; onGemaakt: (naam: string) => void }) {
  const id = useId();
  const { t } = useTranslation("database");
  const [naam, setNaam] = useState(() => t("tableDesign.defaultTableName", { n: 1 }));
  const [teller, setTeller] = useState(2);
  const [velden, setVelden] = useState<ConceptVeld[]>(() => [
    { sleutel: 0, naam: "Id", soort: "autonummer", lengte: "", verplicht: false, primair: true, standaard: "" },
    { sleutel: 1, naam: t("tableDesign.defaultNameField"), soort: "tekst", lengte: "255", verplicht: false, primair: false, standaard: "" },
  ]);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const zet = (i: number, deel: Partial<ConceptVeld>) => setVelden((l) => l.map((v, j) => (j === i ? { ...v, ...deel } : v)));
  const verplaats = (i: number, d: number) =>
    setVelden((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const kopie = [...l];
      [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
      return kopie;
    });
  async function bewaar() {
    const r = conceptNaarSchema(naam, velden);
    if ("fout" in r) return setFout(r.fout);
    setBezig(true);
    try {
      await werkkopie.maakTabel(r.schema);
      onGemaakt(r.schema.naam);
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setBezig(false);
    }
  }
  return (
    <form
      className="database-ontwerp"
      onSubmit={(e) => {
        e.preventDefault();
        void bewaar();
      }}
    >
      <label className="database-veld database-veld-breed" htmlFor={`${id}-naam`}>
        <span>{t("tableDesign.tableName")}</span>
        <input id={`${id}-naam`} value={naam} onChange={(e) => setNaam(e.target.value)} />
      </label>
      <div className="table-wrap">
        <table aria-label={t("tableDesign.fieldsOfNew")}>
          <thead>
            <tr>
              <th scope="col">{t("tableDesign.column.key")}</th>
              <th scope="col">{t("tableDesign.column.name")}</th>
              <th scope="col">{t("tableDesign.column.type")}</th>
              <th scope="col">{t("tableDesign.column.length")}</th>
              <th scope="col">{t("tableDesign.column.required")}</th>
              <th scope="col">{t("tableDesign.column.default")}</th>
              <th scope="col">
                <span className="sr-only">{t("tableDesign.column.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {velden.map((v, i) => (
              <tr key={v.sleutel}>
                <td>
                  <input type="checkbox" aria-label={t("tableDesign.aria.isKey", { field: v.naam || t("tableDesign.field") })} checked={v.primair} onChange={(e) => zet(i, { primair: e.target.checked })} />
                </td>
                <td>
                  <input aria-label={t("tableDesign.aria.name", { field: t("tableDesign.fieldN", { n: i + 1 }) })} value={v.naam} onChange={(e) => zet(i, { naam: e.target.value })} />
                </td>
                <td>
                  <select aria-label={t("tableDesign.aria.type", { field: v.naam || t("tableDesign.fieldN", { n: i + 1 }) })} value={v.soort} onChange={(e) => zet(i, { soort: e.target.value as Veldsoort })}>
                    {SOORTEN.map((s) => (
                      <option key={s} value={s}>
                        {SOORTNAMEN[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={t("tableDesign.aria.length", { field: v.naam || t("tableDesign.fieldN", { n: i + 1 }) })}
                    disabled={v.soort !== "tekst"}
                    inputMode="numeric"
                    size={4}
                    value={v.soort === "tekst" ? v.lengte : ""}
                    onChange={(e) => zet(i, { lengte: e.target.value })}
                  />
                </td>
                <td>
                  <input type="checkbox" aria-label={t("tableDesign.aria.required", { field: v.naam || t("tableDesign.field") })} checked={v.verplicht} onChange={(e) => zet(i, { verplicht: e.target.checked })} />
                </td>
                <td>
                  <input
                    aria-label={t("tableDesign.aria.default", { field: v.naam || t("tableDesign.fieldN", { n: i + 1 }) })}
                    disabled={v.soort === "autonummer"}
                    value={v.standaard}
                    onChange={(e) => zet(i, { standaard: e.target.value })}
                  />
                </td>
                <td className="database-rij-acties">
                  <button type="button" aria-label={t("tableDesign.aria.up", { field: v.naam })} onClick={() => verplaats(i, -1)} disabled={i === 0}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" aria-label={t("tableDesign.aria.down", { field: v.naam })} onClick={() => verplaats(i, 1)} disabled={i === velden.length - 1}>
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" aria-label={t("tableDesign.aria.delete", { field: v.naam })} onClick={() => setVelden((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
      <div className="database-knoppen">
        <button
          type="button"
          onClick={() => {
            setVelden((l) => [...l, { sleutel: teller, naam: t("tableDesign.defaultFieldName", { n: l.length + 1 }), soort: "tekst", lengte: "255", verplicht: false, primair: false, standaard: "" }]);
            setTeller(teller + 1);
          }}
        >
          <Plus size={16} /> {t("tableDesign.addField")}
        </button>
        <button type="submit" className="primary" disabled={bezig}>
          <Save size={16} /> {t("tableDesign.createTable")}
        </button>
      </div>
    </form>
  );
}
