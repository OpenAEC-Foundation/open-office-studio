/** Platte tekst (TXT, CSV, LOG, JSON, XML …) met codering, regelnummers en limiet. */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMIETEN, type WeergeverProps } from "../contract";
import { CODERINGNAAM, decodeerTekst } from "../codering";
import { grootteTekst } from "../herkenning";
import { Fout, Laden, useBytes } from "./gemeenschappelijk";

/** Regelnummers als één tekstblok (goedkoper dan een element per regel). */
export function regelnummers(tekst: string): string {
  let n = 1;
  for (let i = tekst.indexOf("\n"); i >= 0; i = tekst.indexOf("\n", i + 1)) n++;
  if (tekst.endsWith("\n")) n--;
  const uit: string[] = new Array(Math.max(n, 1));
  for (let i = 0; i < uit.length; i++) uit[i] = String(i + 1);
  return uit.join("\n");
}

export function TekstWeergever({ bron, herkenning }: WeergeverProps) {
  const { t } = useTranslation("email");
  const geladen = useBytes(bron);
  const [opgemaakt, zetOpgemaakt] = useState(false);
  const [afbreken, zetAfbreken] = useState(false);
  const bytes = geladen.stand === "klaar" ? geladen.waarde : null;
  const gedecodeerd = useMemo(() => (bytes ? decodeerTekst(bytes, LIMIETEN.tekstBytes) : null), [bytes]);
  const isJson = herkenning.extensie === "json" || /json/i.test(bron.inhoudstype);
  const json = useMemo(() => {
    if (!isJson || !gedecodeerd || gedecodeerd.afgekapt) return null;
    try {
      return JSON.stringify(JSON.parse(gedecodeerd.tekst), null, 2);
    } catch {
      return null;
    }
  }, [isJson, gedecodeerd]);

  if (geladen.stand === "laden") return <Laden />;
  if (geladen.stand === "fout") return <Fout melding={t("preview.text.loadFailed", { message: geladen.melding })} />;
  const tekst = (opgemaakt && json) || gedecodeerd!.tekst;
  const nummers = afbreken ? "" : regelnummers(tekst);

  return (
    <div className="vb-tekst">
      <div className="vb-werkbalk" role="toolbar" aria-label={t("preview.text.toolbar")}>
        <span className="vb-werkbalkinfo">
          {t("preview.text.encoding", {
            // Alleen "met BOM" is taal; de rest zijn vaste coderingsnamen.
            encoding: gedecodeerd!.codering === "utf-8-bom" ? t("preview.text.utf8Bom") : CODERINGNAAM[gedecodeerd!.codering],
          })}
        </span>
        {json && (
          <label className="vb-schakel">
            <input type="checkbox" checked={opgemaakt} onChange={(e) => zetOpgemaakt(e.target.checked)} /> {t("preview.text.formatJson")}
          </label>
        )}
        <label className="vb-schakel">
          <input type="checkbox" checked={afbreken} onChange={(e) => zetAfbreken(e.target.checked)} /> {t("preview.text.wrapLines")}
        </label>
      </div>
      {gedecodeerd!.afgekapt && (
        <p className="vb-band" role="note">
          {t("preview.text.truncated", { limit: grootteTekst(LIMIETEN.tekstBytes), size: grootteTekst(geladen.waarde.length) })}
        </p>
      )}
      <div className={`vb-tekstvlak${afbreken ? " is-afbreken" : ""}`} tabIndex={0} aria-label={t("preview.text.contentOf", { name: bron.bestandsnaam })} dir="ltr">
        {!afbreken && (
          <pre className="vb-regelnummers" aria-hidden>
            {nummers}
          </pre>
        )}
        <pre className="vb-tekstinhoud">{tekst}</pre>
      </div>
    </div>
  );
}
