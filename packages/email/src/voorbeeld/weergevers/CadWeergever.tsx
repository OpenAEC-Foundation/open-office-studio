/** DWG en DXF: metadatakaart; de tekening zelf volgt via de Rust-viewer. */
import { useMemo } from "react";
import { DraftingCompass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { autocadNaam, eenheidNaam, leesDwgMeta, leesDxfMeta } from "../cad-meta";
import { BestandKnoppen, Fout, Kaart, Laden, basisRegels, getal, useBlobUrl, useBytes } from "./gemeenschappelijk";

const MAX_LAGEN = 40;

export function CadWeergever({ bron, soort, acties }: WeergeverProps) {
  const { t } = useTranslation("email");
  const geladen = useBytes(bron);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const dwg = useMemo(() => (bytes && soort === "dwg" ? leesDwgMeta(bytes) : null), [bytes, soort]);
  const dxf = useMemo(() => {
    if (!bytes || soort !== "dxf" || bytes.length > LIMIETEN.dxfBytes) return null;
    try {
      return leesDxfMeta(bytes);
    } catch {
      return null;
    }
  }, [bytes, soort]);
  const miniatuur = useBlobUrl(dwg?.miniatuur?.bytes, dwg?.miniatuur?.type ?? "image/png");

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={t("preview.cad.loadFailed", { message: geladen.melding })} />;
  const grootte = geladen.waarde.length;

  if (soort === "dwg") {
    return (
      <Kaart
        icoon={<DraftingCompass size={26} />}
        titel={bron.bestandsnaam}
        ondertitel={t("preview.cad.dwgSubtitle")}
        regels={[
          ...basisRegels(bron, grootte),
          {
            label: t("preview.cad.format"),
            waarde: dwg?.code ? `${dwg.code}${dwg.versie ? ` (${dwg.versie.release})` : ""}` : t("preview.card.unknown"),
          },
          {
            label: t("preview.cad.savedAs"),
            waarde: dwg?.code ? (autocadNaam(dwg.code) ?? t("preview.cad.unknownAutocadVersion")) : undefined,
          },
        ]}
        melding={t("preview.cad.previewLater")}
        knoppen={<BestandKnoppen bron={bron} acties={acties} />}
      >
        {miniatuur && (
          <figure className="vb-miniatuur">
            <img src={miniatuur} alt={t("preview.cad.thumbnailAlt")} />
            <figcaption>{t("preview.cad.thumbnailCaption")}</figcaption>
          </figure>
        )}
      </Kaart>
    );
  }

  const lagen = dxf?.lagen ?? [];
  return (
    <Kaart
      icoon={<DraftingCompass size={26} />}
      titel={bron.bestandsnaam}
      ondertitel={dxf?.binair ? t("preview.cad.dxfBinarySubtitle") : t("preview.cad.dxfSubtitle")}
      regels={[
        ...basisRegels(bron, grootte),
        {
          label: t("preview.cad.format"),
          waarde: dxf?.acadver ? `${dxf.acadver}${dxf.versie ? ` (${autocadNaam(dxf.acadver)})` : ""}` : undefined,
        },
        // Opnieuw uit de code, zodat de eenheid de interfacetaal volgt.
        { label: t("preview.cad.units"), waarde: dxf?.insunits !== undefined ? eenheidNaam(dxf.insunits) : undefined },
        { label: t("preview.cad.entities"), waarde: dxf && !dxf.binair ? getal(dxf.totaalEntiteiten) : undefined },
        { label: t("preview.cad.blocks"), waarde: dxf?.blokken ? getal(dxf.blokken) : undefined },
        { label: t("preview.cad.layers"), waarde: lagen.length ? getal(lagen.length) : undefined },
      ]}
      melding={!dxf && grootte > LIMIETEN.dxfBytes ? t("preview.cad.tooLargeToParse") : t("preview.cad.previewLater")}
      knoppen={<BestandKnoppen bron={bron} acties={acties} />}
    >
      {dxf && dxf.entiteiten.length > 0 && (
        <details className="vb-details" open>
          <summary>{t("preview.cad.entitiesByType")}</summary>
          <table className="vb-tabel">
            <tbody>
              {dxf.entiteiten.slice(0, 30).map(([type, n]) => (
                <tr key={type}>
                  <th scope="row">{type}</th>
                  <td>{getal(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {lagen.length > 0 && (
        <details className="vb-details">
          <summary>{t("preview.cad.layersCount", { n: getal(lagen.length) })}</summary>
          <ul className="vb-lijst">
            {lagen.slice(0, MAX_LAGEN).map((l) => (
              <li key={l}>{l}</li>
            ))}
            {lagen.length > MAX_LAGEN && <li>{t("preview.cad.andMore", { n: getal(lagen.length - MAX_LAGEN) })}</li>}
          </ul>
        </details>
      )}
    </Kaart>
  );
}
