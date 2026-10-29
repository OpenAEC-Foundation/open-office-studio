/** IFC: metadatakaart uit de STEP-kop en een telling in een Web Worker. */
import { useEffect, useState } from "react";
import { Box } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../../../../src/i18n/opmaak";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { Geannuleerd, IFC_BOUWDELEN, analyseerIfc, type IfcMeta, type IfcStructuurdeel } from "../ifc-meta";
import { BestandKnoppen, Fout, Kaart, Laden, basisRegels, getal, useBytes } from "./gemeenschappelijk";

const SCHEMANAAM: Record<string, string> = {
  IFC2X3: "IFC 2x3",
  IFC4: "IFC 4",
  IFC4X1: "IFC 4.1",
  IFC4X2: "IFC 4.2",
  IFC4X3: "IFC 4.3",
  IFC4X3_ADD2: "IFC 4.3 ADD2",
};

type Analyse =
  | { stand: "bezig"; voortgang: number }
  | { stand: "klaar"; meta: IfcMeta }
  | { stand: "geannuleerd" }
  | { stand: "fout"; melding: string };

function naamVan(d: IfcStructuurdeel) {
  const n = d.naam || d.langeNaam || `#${d.id}`;
  return d.langeNaam && d.naam && d.langeNaam !== d.naam ? `${d.naam} – ${d.langeNaam}` : n;
}

export function IfcWeergever({ bron, acties }: WeergeverProps) {
  const { t } = useTranslation("email");
  const opmaak = useOpmaak();
  const geladen = useBytes(bron);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const [analyse, zetAnalyse] = useState<Analyse>({ stand: "bezig", voortgang: 0 });
  const [afbreker, zetAfbreker] = useState<AbortController | null>(null);
  const [poging, zetPoging] = useState(0);

  useEffect(() => {
    if (!bytes || bytes.length > LIMIETEN.ifcBytes) return;
    const ac = new AbortController();
    zetAfbreker(ac);
    zetAnalyse({ stand: "bezig", voortgang: 0 });
    analyseerIfc(bytes, {
      signaal: ac.signal,
      opVoortgang: (v) => !ac.signal.aborted && zetAnalyse({ stand: "bezig", voortgang: v }),
    }).then(
      (meta) => !ac.signal.aborted && zetAnalyse({ stand: "klaar", meta }),
      (e) => {
        if (e instanceof Geannuleerd) zetAnalyse({ stand: "geannuleerd" });
        else zetAnalyse({ stand: "fout", melding: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => ac.abort();
  }, [bytes, poging]);

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={t("preview.ifc.loadFailed", { message: geladen.melding })} />;
  const grootte = geladen.waarde.length;
  const meta = analyse.stand === "klaar" ? analyse.meta : null;
  const kop = meta?.kop;
  const telling = new Map(meta?.entiteiten ?? []);
  const bouwdelen = IFC_BOUWDELEN.filter(([type]) => telling.has(type));

  let status: React.ReactNode = null;
  if (grootte > LIMIETEN.ifcBytes) status = <p className="vb-melding">{t("preview.ifc.tooLarge", { size: Math.round(LIMIETEN.ifcBytes / 1024 / 1024) })}</p>;
  else if (analyse.stand === "bezig")
    status = (
      <div className="vb-voortgang">
        <label>
          {t("preview.ifc.analysing", { percent: opmaak.procent(analyse.voortgang, { maximumFractionDigits: 0 }) })}
          <progress max={1} value={analyse.voortgang} />
        </label>
        <button type="button" className="vb-knop" onClick={() => afbreker?.abort()}>
          {t("common:cancel")}
        </button>
      </div>
    );
  else if (analyse.stand === "geannuleerd")
    status = (
      <div className="vb-voortgang">
        <span>{t("preview.ifc.cancelled")}</span>
        <button type="button" className="vb-knop" onClick={() => zetPoging((p) => p + 1)}>
          {t("preview.ifc.retry")}
        </button>
      </div>
    );
  else if (analyse.stand === "fout") status = <p className="vb-melding">{t("preview.ifc.failed", { message: analyse.melding })}</p>;

  return (
    <Kaart
      icoon={<Box size={26} />}
      titel={meta?.project ? naamVan(meta.project) : bron.bestandsnaam}
      ondertitel={
        kop?.schema.length
          ? t("preview.ifc.subtitleWithSchema", { schemas: kop.schema.map((s) => SCHEMANAAM[s.toUpperCase()] ?? s).join(", ") })
          : t("preview.ifc.subtitle")
      }
      regels={[
        ...basisRegels(bron, grootte),
        { label: t("preview.ifc.nameInFile"), waarde: kop?.naam },
        { label: t("preview.ifc.timestamp"), waarde: kop?.tijdstip },
        { label: t("preview.ifc.author"), waarde: kop?.auteurs.filter(Boolean).join(", ") },
        { label: t("preview.ifc.organization"), waarde: kop?.organisaties.filter(Boolean).join(", ") },
        { label: t("preview.ifc.application"), waarde: kop?.toepassing || kop?.preprocessor },
        { label: t("preview.ifc.description"), waarde: kop?.beschrijving.filter(Boolean).join("; ") },
        { label: t("preview.ifc.sites"), waarde: meta?.terreinen.length ? meta.terreinen.map(naamVan).join(", ") : undefined },
        { label: t("preview.ifc.buildings"), waarde: meta?.gebouwen.length ? meta.gebouwen.map(naamVan).join(", ") : undefined },
        { label: t("preview.ifc.entities"), waarde: meta ? getal(meta.totaal) : undefined },
        { label: t("preview.card.attention"), waarde: meta && !meta.volledig ? t("preview.ifc.incomplete") : undefined },
      ]}
      melding={t("preview.ifc.previewLater")}
      knoppen={<BestandKnoppen bron={bron} acties={acties} />}
    >
      {status}
      {meta && meta.verdiepingen.length > 0 && (
        <details className="vb-details" open>
          <summary>{t("preview.ifc.storeys", { n: getal(meta.verdiepingen.length) })}</summary>
          <table className="vb-tabel">
            <tbody>
              {meta.verdiepingen.map((v) => (
                <tr key={v.id}>
                  <th scope="row">{naamVan(v)}</th>
                  <td>{v.hoogte !== undefined ? opmaak.getal(v.hoogte, { maximumFractionDigits: 3 }) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {bouwdelen.length > 0 && (
        <details className="vb-details" open>
          <summary>{t("preview.ifc.elementsHeading")}</summary>
          <table className="vb-tabel">
            <tbody>
              {bouwdelen.map(([type, sleutel]) => (
                <tr key={type}>
                  <th scope="row" title={type}>
                    {t(`preview.ifc.elements.${sleutel}`)}
                  </th>
                  <td>{getal(telling.get(type)!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {meta && meta.entiteiten.length > 0 && (
        <details className="vb-details">
          <summary>{t("preview.ifc.allEntityTypes", { n: getal(meta.entiteiten.length) })}</summary>
          <table className="vb-tabel">
            <tbody>
              {meta.entiteiten.slice(0, 200).map(([type, n]) => (
                <tr key={type}>
                  <th scope="row">{type}</th>
                  <td>{getal(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Kaart>
  );
}
