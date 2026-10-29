/** Relatievenster: bestaande relaties, nieuwe relatie (met of zonder integriteit) en verwijderen. */
import { useId, useState } from "react";
import { Link2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RelatieSchema, TabelSchema, Werkkopie } from "../werkkopie/contract.ts";
import { useDialogen } from "./Dialoog.tsx";
import { leesbareFout } from "./invoer.ts";
import { relatieUitConcept, sleutelVelden, type RelatieConcept } from "./ontwerp-logica.ts";

export function RelatieVenster({
  werkkopie,
  relaties,
  tabellen,
  onGewijzigd,
}: {
  werkkopie: Werkkopie;
  relaties: RelatieSchema[];
  tabellen: TabelSchema[];
  onGewijzigd: (melding: string) => void | Promise<void>;
}) {
  const id = useId();
  const dialogen = useDialogen();
  const { t } = useTranslation("database");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const eerste = tabellen[0]?.naam ?? "";
  const [concept, setConcept] = useState<RelatieConcept>(() => ({
    naam: "",
    tabel: tabellen[1]?.naam ?? eerste,
    veld: "",
    naarTabel: eerste,
    naarVeld: sleutelVelden(tabellen[0])[0] ?? "",
    integriteit: true,
    trapsBijwerken: false,
    trapsVerwijderen: false,
  }));
  const zet = (deel: Partial<RelatieConcept>) => setConcept((c) => ({ ...c, ...deel }));
  const vanTabel = tabellen.find((t) => t.naam === concept.tabel);
  const naarTabel = tabellen.find((t) => t.naam === concept.naarTabel);

  async function voer(actie: () => Promise<string>) {
    setFout("");
    setBezig(true);
    try {
      await onGewijzigd(await actie());
    } catch (e) {
      setFout(leesbareFout(e));
    } finally {
      setBezig(false);
    }
  }

  async function maak() {
    const r = relatieUitConcept(concept);
    if ("fout" in r) return setFout(r.fout);
    await voer(async () => {
      const naam = await werkkopie.maakRelatie(r);
      zet({ naam: "" });
      return r.integriteit ? t("relationships.createdWithIntegrity", { name: naam, table: r.tabel }) : t("relationships.created", { name: naam });
    });
  }

  async function verwijder(r: RelatieSchema) {
    const ja = await dialogen.bevestig({
      titel: t("relationships.delete.title"),
      tekst: t(r.integriteit ? "relationships.delete.textWithIntegrity" : "relationships.delete.text", { name: r.naam, from: r.tabel, to: r.naarTabel }),
      ja: t("common:delete"),
      gevaarlijk: true,
    });
    if (!ja) return;
    await voer(async () => {
      await werkkopie.verwijderRelatie(r.naam);
      return t("relationships.deleted", { name: r.naam });
    });
  }

  const veldKeuze = (label: string, tabel: TabelSchema | undefined, waarde: string, kies: (v: string) => void, idDeel: string) => (
    <label className="database-veld" htmlFor={`${id}-${idDeel}`}>
      <span>{label}</span>
      <select id={`${id}-${idDeel}`} value={waarde} disabled={bezig || !tabel} onChange={(e) => kies(e.target.value)}>
        <option value="">{t("relationships.chooseField")}</option>
        {tabel?.velden.map((v) => (
          <option key={v.naam} value={v.naam}>
            {v.naam}
            {v.primair ? ` ${t("relationships.keySuffix")}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
  const tabelKeuze = (label: string, waarde: string, kies: (v: string) => void, idDeel: string) => (
    <label className="database-veld" htmlFor={`${id}-${idDeel}`}>
      <span>{label}</span>
      <select id={`${id}-${idDeel}`} value={waarde} disabled={bezig} onChange={(e) => kies(e.target.value)}>
        {tabellen.map((t) => (
          <option key={t.naam} value={t.naam}>
            {t.naam}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="database-overzicht" aria-busy={bezig}>
      <h2>{t("relationships.title")}</h2>
      {!relaties.length ? (
        <p>{t("relationships.none")}</p>
      ) : (
        <div className="table-wrap">
          <table aria-label={t("relationships.tableLabel")}>
            <thead>
              <tr>
                <th scope="col">{t("relationships.column.name")}</th>
                <th scope="col">{t("relationships.column.from")}</th>
                <th scope="col">{t("relationships.column.to")}</th>
                <th scope="col">{t("relationships.column.integrity")}</th>
                <th scope="col">
                  <span className="sr-only">{t("relationships.column.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {relaties.map((r) => (
                <tr key={r.naam}>
                  <td>{r.naam}</td>
                  <td>
                    {r.tabel} ({r.velden.join(", ")})
                  </td>
                  <td>
                    {r.naarTabel} ({r.naarVelden.join(", ")})
                  </td>
                  <td>
                    {r.integriteit
                      ? [
                          t("relationships.enforced"),
                          r.trapsBijwerken ? t("relationships.cascadeUpdate") : "",
                          r.trapsVerwijderen ? t("relationships.cascadeDelete") : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : t("relationships.notEnforced")}
                  </td>
                  <td className="database-rij-acties">
                    <button type="button" aria-label={t("relationships.deleteNamed", { name: r.naam })} title={t("relationships.delete.title")} disabled={bezig} onClick={() => void verwijder(r)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>{t("relationships.new")}</h3>
      {tabellen.length === 0 ? (
        <p className="muted">{t("relationships.createTableFirst")}</p>
      ) : (
        <form
          className="database-relatieformulier"
          aria-label={t("relationships.new")}
          onSubmit={(e) => {
            e.preventDefault();
            void maak();
          }}
        >
          <fieldset disabled={bezig}>
            <legend>{t("relationships.referencedTable")}</legend>
            {tabelKeuze(t("relationships.table"), concept.naarTabel, (t) => zet({ naarTabel: t, naarVeld: sleutelVelden(tabellen.find((x) => x.naam === t))[0] ?? "" }), "naar")}
            {veldKeuze(t("relationships.field"), naarTabel, concept.naarVeld, (v) => zet({ naarVeld: v }), "naarveld")}
          </fieldset>
          <fieldset disabled={bezig}>
            <legend>{t("relationships.referencingTable")}</legend>
            {tabelKeuze(t("relationships.table"), concept.tabel, (t) => zet({ tabel: t, veld: "" }), "van")}
            {veldKeuze(t("relationships.field"), vanTabel, concept.veld, (v) => zet({ veld: v }), "vanveld")}
          </fieldset>
          <fieldset disabled={bezig}>
            <legend>{t("relationships.properties")}</legend>
            <label className="database-veld" htmlFor={`${id}-naam`}>
              <span>{t("relationships.nameOptional")}</span>
              <input id={`${id}-naam`} value={concept.naam} placeholder={`${concept.naarTabel}${concept.tabel}`} onChange={(e) => zet({ naam: e.target.value })} />
            </label>
            <label className="database-vink">
              <input type="checkbox" checked={concept.integriteit} onChange={(e) => zet({ integriteit: e.target.checked })} /> {t("relationships.enforceIntegrity")}
            </label>
            <label className="database-vink">
              <input type="checkbox" checked={concept.trapsBijwerken} disabled={!concept.integriteit} onChange={(e) => zet({ trapsBijwerken: e.target.checked })} /> {t("relationships.cascadeUpdateFields")}
            </label>
            <label className="database-vink">
              <input type="checkbox" checked={concept.trapsVerwijderen} disabled={!concept.integriteit} onChange={(e) => zet({ trapsVerwijderen: e.target.checked })} /> {t("relationships.cascadeDeleteRecords")}
            </label>
          </fieldset>
          <p className="muted">
            {t("relationships.integrityHint")}
          </p>
          <div className="database-knoppen">
            <button type="submit" className="primary" disabled={bezig}>
              <Link2 size={16} /> {t("relationships.create")}
            </button>
          </div>
        </form>
      )}
      {fout && (
        <p className="melding fout" role="alert">
          {fout}
        </p>
      )}
    </div>
  );
}
