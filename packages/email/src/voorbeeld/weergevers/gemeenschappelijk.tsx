/** Gedeelde bouwstenen voor de weergevers: bytes laden, blob-URL's, kaart. */
import { useEffect, useState, type ReactNode } from "react";
import { Download, ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../../../../../src/i18n/config";
import { formatDatumTijd, formatGetal } from "../../../../../src/i18n/opmaak";
import type { VoorbeeldActies, VoorbeeldBron } from "../contract";
import { grootteTekst } from "../herkenning";

export type Laadstand<T> = { stand: "laden" } | { stand: "klaar"; waarde: T } | { stand: "fout"; melding: string };

/** Laadt de bytes van de bron (gecachet door de bron zelf). */
export function useBytes(bron: VoorbeeldBron): Laadstand<Uint8Array> {
  const [stand, zetStand] = useState<Laadstand<Uint8Array>>({ stand: "laden" });
  useEffect(() => {
    let actief = true;
    zetStand({ stand: "laden" });
    bron.bytes().then(
      (waarde) => actief && zetStand({ stand: "klaar", waarde }),
      (e) => actief && zetStand({ stand: "fout", melding: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      actief = false;
    };
  }, [bron]);
  return stand;
}

/** Maakt een blob-URL en trekt die in zodra het onderdeel verdwijnt of de invoer wijzigt. */
export function useBlobUrl(bytes: Uint8Array | null | undefined, type: string): string | null {
  const [url, zetUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) {
      zetUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
    zetUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, type]);
  return url;
}

export function Laden({ tekst }: { tekst?: string }) {
  const { t } = useTranslation("email");
  return (
    <div className="vb-midden" role="status">
      <LoaderCircle className="vb-draai" size={22} aria-hidden />
      <span>{tekst ?? t("preview.loading")}</span>
    </div>
  );
}

export function Fout({ melding }: { melding: string }) {
  return (
    <div className="vb-midden vb-fout" role="alert">
      <TriangleAlert size={22} aria-hidden />
      <span>{melding}</span>
    </div>
  );
}

export interface KaartRegel {
  label: string;
  waarde: ReactNode;
}

/** Informatiekaart voor soorten zonder (volledig) voorbeeld. */
export function Kaart({
  icoon,
  titel,
  ondertitel,
  regels = [],
  melding,
  knoppen,
  children,
}: {
  icoon: ReactNode;
  titel: string;
  ondertitel?: string;
  regels?: KaartRegel[];
  melding?: ReactNode;
  knoppen?: ReactNode;
  children?: ReactNode;
}) {
  const zichtbaar = regels.filter((r) => r.waarde !== undefined && r.waarde !== null && r.waarde !== "");
  return (
    <div className="vb-kaartvlak">
      <section className="vb-kaart" aria-label={titel}>
        <header className="vb-kaartkop">
          <span className="vb-kaarticoon" aria-hidden>
            {icoon}
          </span>
          <div>
            <h3>{titel}</h3>
            {ondertitel && <p>{ondertitel}</p>}
          </div>
        </header>
        {zichtbaar.length > 0 && (
          <dl className="vb-eigenschappen">
            {zichtbaar.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.waarde}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
        {melding && <p className="vb-melding">{melding}</p>}
        {knoppen && <div className="vb-kaartknoppen">{knoppen}</div>}
      </section>
    </div>
  );
}

/** Standaardknoppen "Openen met standaardprogramma" en "Opslaan". */
export function BestandKnoppen({
  bron,
  acties,
  extern = true,
}: {
  bron: VoorbeeldBron;
  acties: VoorbeeldActies;
  extern?: boolean;
}) {
  const { t } = useTranslation("email");
  return (
    <>
      {extern && acties.openExtern && (
        <button type="button" className="vb-knop" onClick={() => void acties.openExtern!(bron)}>
          <ExternalLink size={15} aria-hidden /> {t("preview.card.openExternal")}
        </button>
      )}
      {acties.opslaan && (
        <button type="button" className="vb-knop" onClick={() => void acties.opslaan!(bron)}>
          <Download size={15} aria-hidden /> {t("common:save")}
        </button>
      )}
    </>
  );
}

/**
 * Bestandsnaam en grootte. Tijdens het tekenen aanroepen (niet bewaren): de
 * labels volgen de interfacetaal van dat moment.
 */
export function basisRegels(bron: VoorbeeldBron, echteGrootte?: number): KaartRegel[] {
  return [
    { label: i18next.t("email:preview.card.fileName"), waarde: bron.bestandsnaam },
    { label: i18next.t("email:preview.card.size"), waarde: grootteTekst(echteGrootte ?? bron.grootte) },
  ];
}

export function datumTekst(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  return formatDatumTijd(d, { dateStyle: "long", timeStyle: "short" });
}

export function getal(n: number): string {
  return formatGetal(n);
}
