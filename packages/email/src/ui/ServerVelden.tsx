import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { Authenticatie, Beveiliging, ServerInstelling, TestUitkomst } from "../contract";
import { STANDAARDPOORT } from "../voorinstellingen";
import { backendTekst } from "../fouten";

// Labels zonder sleutel zijn protocolnamen en worden niet vertaald.
const BEVEILIGING: { waarde: Beveiliging; label?: string; sleutel?: string }[] = [
  { waarde: "ssl", label: "SSL/TLS" },
  { waarde: "starttls", label: "STARTTLS" },
  { waarde: "geen", sleutel: "accounts.server.securityNone" },
];
const AUTHENTICATIE: { waarde: Authenticatie; label?: string; sleutel?: string }[] = [
  { waarde: "normaal", sleutel: "accounts.server.authNormal" },
  { waarde: "versleuteld", sleutel: "accounts.server.authEncrypted" },
  { waarde: "oauth2", label: "OAuth2" },
];

/** Tabel met IMAP- en SMTP-instellingen zoals in Thunderbirds handmatige configuratie. */
export function ServerVelden({
  imap,
  smtp,
  wijzig,
  uitkomst,
}: {
  imap: ServerInstelling;
  smtp: ServerInstelling;
  wijzig: (soort: "imap" | "smtp", server: ServerInstelling) => void;
  uitkomst?: TestUitkomst | null;
}) {
  const { t } = useTranslation("email");
  const rij = (soort: "imap" | "smtp", server: ServerInstelling) => {
    const zet = (deel: Partial<ServerInstelling>) => wijzig(soort, { ...server, ...deel });
    const resultaat = uitkomst?.[soort];
    const protocol = soort.toUpperCase();
    return (
      <tr>
        <th scope="row">
          {soort === "imap" ? t("accounts.server.incoming") : t("accounts.server.outgoing")}
          {resultaat && (
            <span className={`email-testuitkomst ${resultaat.ok ? "is-ok" : "is-fout"}`} role="status">
              {resultaat.ok ? <CircleCheck size={14} /> : <CircleX size={14} />}
              {backendTekst(resultaat)}
            </span>
          )}
        </th>
        <td>
          <input
            className="email-serverhost"
            aria-label={t("accounts.server.hostLabel", { protocol })}
            value={server.host}
            placeholder={soort === "imap" ? t("accounts.server.imapPlaceholder") : t("accounts.server.smtpPlaceholder")}
            onChange={(e) => zet({ host: e.target.value.trim() })}
            spellCheck={false}
            dir="ltr"
          />
        </td>
        <td>
          <input
            aria-label={t("accounts.server.portLabel", { protocol })}
            type="number"
            min={1}
            max={65535}
            value={server.poort || ""}
            onChange={(e) => zet({ poort: Number(e.target.value) })}
            className="email-poort"
            dir="ltr"
          />
        </td>
        <td>
          <select
            aria-label={t("accounts.server.securityLabel", { protocol })}
            value={server.beveiliging}
            onChange={(e) => {
              const beveiliging = e.target.value as Beveiliging;
              // Poort meeschuiven als die nog op de standaard van de vorige keuze stond.
              const standaard = Object.values(STANDAARDPOORT[soort]).includes(server.poort);
              zet({ beveiliging, poort: standaard || !server.poort ? STANDAARDPOORT[soort][beveiliging] : server.poort });
            }}
          >
            {BEVEILIGING.map((b) => (
              <option key={b.waarde} value={b.waarde}>
                {b.sleutel ? t(b.sleutel) : b.label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select aria-label={t("accounts.server.authenticationLabel", { protocol })} value={server.authenticatie} onChange={(e) => zet({ authenticatie: e.target.value as Authenticatie })}>
            {AUTHENTICATIE.map((a) => (
              <option key={a.waarde} value={a.waarde}>
                {a.sleutel ? t(a.sleutel) : a.label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input
            className="email-servergebruiker"
            aria-label={t("accounts.server.usernameLabel", { protocol })}
            value={server.gebruikersnaam}
            onChange={(e) => zet({ gebruikersnaam: e.target.value })}
            spellCheck={false}
            autoComplete="username"
            dir="ltr"
          />
        </td>
      </tr>
    );
  };
  const onversleuteld = [imap, smtp].some((s) => s.beveiliging === "geen");
  return (
    <div className="email-servers">
      <div className="email-servertabel-houder">
        <table className="email-servertabel">
          <thead>
            <tr>
              <th />
              <th>{t("accounts.server.columns.server")}</th>
              <th>{t("accounts.server.columns.port")}</th>
              <th>{t("accounts.server.columns.security")}</th>
              <th>{t("accounts.server.columns.authentication")}</th>
              <th>{t("accounts.server.columns.username")}</th>
            </tr>
          </thead>
          <tbody>
            {rij("imap", imap)}
            {rij("smtp", smtp)}
          </tbody>
        </table>
      </div>
      {onversleuteld && (
        <p className="email-waarschuwing" role="alert">
          <TriangleAlert size={15} />
          <span>
            <Trans t={t} i18nKey="accounts.server.unencryptedWarning" components={{ strong: <strong /> }} />
          </span>
        </p>
      )}
      {(imap.authenticatie === "oauth2" || smtp.authenticatie === "oauth2") && (
        <p className="email-hint">{t("accounts.server.oauthHint")}</p>
      )}
    </div>
  );
}
