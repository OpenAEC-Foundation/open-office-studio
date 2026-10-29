/** Onbekende of niet te tonen bestanden: type, grootte en Opslaan. */
import { FileQuestion } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WeergeverProps } from "../contract";
import { BestandKnoppen, Kaart, basisRegels } from "./gemeenschappelijk";

export function OnbekendWeergever({ bron, herkenning, acties }: WeergeverProps) {
  const { t } = useTranslation("email");
  return (
    <Kaart
      icoon={<FileQuestion size={26} />}
      titel={bron.bestandsnaam}
      ondertitel={t("preview.unknown.subtitle")}
      regels={[
        ...basisRegels(bron),
        { label: t("preview.unknown.declaredType"), waarde: bron.inhoudstype || t("preview.card.unknown") },
        { label: t("preview.unknown.extension"), waarde: herkenning.extensie ? `.${herkenning.extensie}` : t("preview.unknown.none") },
      ]}
      melding={t("preview.unknown.message")}
      // Bewust geen "Openen met standaardprogramma": onbekende bestanden kunnen uitvoerbaar zijn.
      knoppen={<BestandKnoppen bron={bron} acties={acties} extern={false} />}
    />
  );
}
