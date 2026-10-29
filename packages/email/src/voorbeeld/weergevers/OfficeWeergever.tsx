/** Office-documenten: kaart met "Openen in …" (koppeling via `openInModule`). */
import { useState } from "react";
import { Database, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "../../../../../src/i18n/config";
import type { Kantoorsoort, WeergeverProps } from "../contract";
import { BestandKnoppen, Kaart, basisRegels } from "./gemeenschappelijk";

/** Naam van de module in de interfacetaal (`common:modules`). */
export function kantoormodule(k: Kantoorsoort): string {
  return i18next.t(`common:modules.${k}`);
}

const ICOON: Record<Kantoorsoort, typeof FileText> = {
  tekst: FileText,
  rekenblad: FileSpreadsheet,
  presentatie: Presentation,
  database: Database,
};

/** Sleutel onder `email:preview.office.kinds`. */
const OMSCHRIJVING: Record<Kantoorsoort, string> = {
  tekst: "document",
  rekenblad: "spreadsheet",
  presentatie: "presentation",
  database: "database",
};

export function OfficeWeergever({ bron, herkenning, acties }: WeergeverProps) {
  const { t } = useTranslation("email");
  const k = herkenning.kantoor;
  const Icoon = k ? ICOON[k] : FileText;
  const [bezig, zetBezig] = useState(false);
  const [fout, zetFout] = useState<string | null>(null);

  const openen = async () => {
    if (!k || !acties.openInModule) return;
    zetBezig(true);
    zetFout(null);
    try {
      await acties.openInModule(k, bron.bestandsnaam, await bron.bytes());
    } catch (e) {
      zetFout(e instanceof Error ? e.message : String(e));
    } finally {
      zetBezig(false);
    }
  };

  return (
    <Kaart
      icoon={<Icoon size={26} />}
      titel={bron.bestandsnaam}
      ondertitel={k ? t(`preview.office.kinds.${OMSCHRIJVING[k]}`) : t("preview.office.genericDocument")}
      regels={[
        ...basisRegels(bron),
        { label: t("preview.office.type"), waarde: herkenning.extensie ? herkenning.extensie.toUpperCase() : bron.inhoudstype },
      ]}
      melding={
        fout
          ? t("preview.office.openFailed", { message: fout })
          : k
            ? t("preview.office.openCopyHint", { module: kantoormodule(k) })
            : t("preview.office.cannotOpen")
      }
      knoppen={
        <>
          {k && acties.openInModule && (
            <button type="button" className="vb-knop is-primair" onClick={() => void openen()} disabled={bezig}>
              <Icoon size={15} aria-hidden /> {bezig ? t("preview.office.opening") : t("preview.office.openIn", { module: kantoormodule(k) })}
            </button>
          )}
          <BestandKnoppen bron={bron} acties={acties} />
        </>
      }
    />
  );
}
