import { useEffect, useMemo, useState } from "react";
import type { Account, MailBackend } from "../contract";
import { kiesBackend } from "../backend";
import { useTranslation } from "react-i18next";
import { demoMelding } from "../demo-backend";
import { foutTekst } from "../fouten";
import { inhoudstype } from "../kantoor";
import { AccountWizard } from "./AccountWizard";
import { Dialoog } from "./Dialoog";
import { Opstelvenster, type OpstelActies } from "./Opstelvenster";
import "../email.css";

/**
 * "Verzenden als bijlage" vanuit Tekst, Rekenblad of Presentatie: opent een
 * opstelvenster boven het document, met het geserialiseerde document als
 * bijlage. Het document zelf blijft open.
 */
export default function VerzendAlsBijlage({
  naam,
  bytes,
  sluit,
  melding,
  onOnverzonden,
  registreer,
  backend: gegevenBackend,
}: {
  naam: string;
  bytes: Uint8Array;
  sluit: () => void;
  melding: (tekst: string) => void;
  onOnverzonden: (waarde: boolean) => void;
  registreer?: (acties: OpstelActies | null) => void;
  backend?: MailBackend;
}) {
  const { t } = useTranslation("email");
  const backend = useMemo(() => gegevenBackend ?? kiesBackend(), [gegevenBackend]);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [fout, setFout] = useState("");
  useEffect(() => {
    backend.accounts().then(setAccounts, (e) => setFout(foutTekst(e, t("studio.errors.loadAccounts"))));
  }, [backend]);

  if (fout)
    return (
      <Dialoog titel={t("sendAsAttachment.title")} sluit={sluit}>
        <p role="alert">{fout}</p>
      </Dialoog>
    );
  if (!accounts) return null;
  if (!accounts.length)
    return (
      <AccountWizard
        backend={backend}
        sluit={sluit}
        klaar={(account) => {
          setAccounts([account]);
          melding(t("studio.accountAdded", { email: account.email }));
        }}
      />
    );
  const titel = naam.replace(/\.[^.]+$/, "");
  return (
    <div className="email-studio-overlay">
      {backend.soort === "demo" && <div className="email-demobalk is-zwevend">{demoMelding()}</div>}
      <Opstelvenster
        backend={backend}
        accounts={accounts}
        accountId={accounts[0].id}
        begin={{ onderwerp: titel, bijlagen: [{ bestandsnaam: naam, inhoudstype: inhoudstype(naam), bytes }] }}
        sluit={sluit}
        verzonden={melding}
        onOnverzonden={onOnverzonden}
        registreer={registreer}
      />
    </div>
  );
}
