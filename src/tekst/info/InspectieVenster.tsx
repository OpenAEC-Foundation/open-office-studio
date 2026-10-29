/**
 * Document inspecteren: toont verborgen tekst, opmerkingen, bijgehouden
 * wijzigingen en persoonlijke gegevens en verwijdert desgewenst (pakketroute
 * en herladen; ongedaan maken van eerdere wijzigingen vervalt).
 */
import { useEffect, useState } from "react";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { useTranslation } from "react-i18next";
import i18next from "../../i18n/config";
import type { Herladen } from "../../lint/editorApi";
import { Dialoog } from "../../werkruimte/Dialoog";
import { inspecteer, schoonOp, type InspectieUitslag, type Opschonen } from "./inspectie";
import { zetEigenschappen } from "./opslaan";

export function InspectieVenster({
  api,
  herlaad,
  sluit,
  naHerladen = sluit,
}: {
  api: () => DocxEditorRef | null;
  herlaad: Herladen | null;
  sluit: () => void;
  /** Na verwijderen (het document is opnieuw geladen). */
  naHerladen?: () => void;
}) {
  const [uitslag, setUitslag] = useState<InspectieUitslag | null>(null);
  const [keuze, setKeuze] = useState<Opschonen>({});
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const { t } = useTranslation("writer");

  useEffect(() => {
    let actief = true;
    void (async () => {
      try {
        if (!herlaad) throw new Error(i18next.t("writer:info.inspect.notAvailable"));
        const u = inspecteer(await herlaad.bytes());
        if (actief) setUitslag(u);
      } catch (error) {
        if (actief) setFout(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  const p = uitslag?.eigenschappen;
  const persoonlijk = uitslag ? uitslag.personen.length + (p?.bedrijf ? 1 : 0) : 0;
  const rijen: { sleutel: keyof Opschonen; naam: string; aantal: number; uitleg: string; leeg: string }[] = uitslag
    ? [
        {
          sleutel: "verborgenTekst",
          naam: t("info.inspect.hiddenText.name"),
          aantal: uitslag.verborgenTekst,
          uitleg: t("info.inspect.hiddenText.detail", { count: uitslag.verborgenTekst }),
          leeg: t("info.inspect.hiddenText.none"),
        },
        {
          sleutel: "opmerkingen",
          naam: t("info.inspect.comments.name"),
          aantal: uitslag.opmerkingen,
          uitleg: t("info.inspect.comments.detail", { count: uitslag.opmerkingen }),
          leeg: t("info.inspect.comments.none"),
        },
        {
          sleutel: "revisies",
          naam: t("info.inspect.revisions.name"),
          aantal: uitslag.revisies,
          uitleg: t("info.inspect.revisions.detail", { count: uitslag.revisies }),
          leeg: t("info.inspect.revisions.none"),
        },
        {
          sleutel: "persoonlijk",
          naam: t("info.inspect.personal.name"),
          aantal: persoonlijk,
          uitleg: [
            uitslag.personen.length ? t("info.inspect.personal.names", { names: uitslag.personen.join(", ") }) : "",
            p?.bedrijf ? t("info.inspect.personal.company", { company: p.bedrijf }) : "",
            t("info.inspect.personal.detail", { author: t("info.inspect.personal.anonymousAuthor") }),
          ]
            .filter(Boolean)
            .join(" "),
          leeg: t("info.inspect.personal.none"),
        },
      ]
    : [];
  const iets = Object.values(keuze).some(Boolean);

  async function verwijderen() {
    if (!herlaad || !iets) return;
    setBezig(true);
    try {
      const ref = api();
      await ref?.flushPendingInput();
      // Namen worden vervangen door ‘Auteur’ in de interfacetaal (zoals Word).
      const nieuw = schoonOp(await herlaad.bytes(), keuze, i18next.t("writer:info.inspect.personal.anonymousAuthor"));
      // Een wachtende auteur uit Bestand › Info zou de naam bij opslaan terugzetten.
      if (keuze.persoonlijk) zetEigenschappen(herlaad, { auteur: "" });
      herlaad.vervang(nieuw, { paraId: ref?.getSelectionInfo()?.paraId ?? undefined });
      naHerladen();
    } catch (error) {
      setBezig(false);
      setFout(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialoog
      titel={t("info.inspect.title")}
      sluit={sluit}
      className="tekst-info"
      acties={
        <>
          {fout && <span className="werkruimte-melding werkruimte-fout" role="alert">{fout}</span>}
          <button type="button" className="werkruimte-knop" onClick={sluit}>
            {t("common:close")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" disabled={!iets || bezig} onClick={() => void verwijderen()}>
            {t("info.inspect.removeSelected")}
          </button>
        </>
      }
    >
      {!uitslag ? (
        !fout && <p className="werkruimte-uitleg">{t("info.inspect.inspecting")}</p>
      ) : (
        <>
          <ul className="tekst-inspectie">
            {rijen.map((r) => (
              <li key={r.sleutel}>
                <label className="werkruimte-vink">
                  <input
                    type="checkbox"
                    disabled={!r.aantal}
                    checked={!!keuze[r.sleutel]}
                    onChange={(e) => setKeuze({ ...keuze, [r.sleutel]: e.target.checked })}
                  />
                  <strong>{r.naam}</strong>
                  <span className={`tekst-inspectie-telling ${r.aantal ? "is-gevonden" : ""}`}>{r.aantal ? t("info.inspect.found") : t("info.inspect.nothing")}</span>
                </label>
                <p className="werkruimte-uitleg">{r.aantal ? r.uitleg : r.leeg}</p>
              </li>
            ))}
          </ul>
          <p className="werkruimte-uitleg">{t("info.inspect.reloadNote")}</p>
        </>
      )}
    </Dialoog>
  );
}
