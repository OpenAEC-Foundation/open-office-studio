import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Info, LoaderCircle } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import i18next from "../../../../src/i18n/config";
import type { Account, AccountInvoer, MailBackend, OAuthProvider, OAuthStatus } from "../contract";
import { backendTekst, foutTekst, naarMailFout } from "../fouten";
import { OAUTH_DOCUMENTATIE, PROVIDERNAAM } from "../oauth";

export type OAuthStatussen = Record<OAuthProvider, OAuthStatus>;
/** Terugval als de backend geen OAuth-status kent; tekst in de taal van het moment. */
const nietBeschikbaar = (): OAuthStatus => ({
  beschikbaar: false,
  melding: i18next.t("email:accounts.oauth.notSupported"),
});

/** Status van de providers en een lopende aanmelding, met annuleren. */
export function useOAuth(backend: MailBackend) {
  const [status, setStatus] = useState<OAuthStatussen | null>(null);
  const [bezig, setBezig] = useState<OAuthProvider | null>(null);
  const geannuleerd = useRef(false);
  const ververs = useCallback(() => {
    backend
      .oauthStatus()
      .then(setStatus)
      .catch(() => setStatus({ microsoft: nietBeschikbaar(), google: nietBeschikbaar() }));
  }, [backend]);
  useEffect(ververs, [ververs]);

  /** Geeft het account terug, null bij annuleren; gooit een leesbare fout. */
  const meldAan = useCallback(
    async (provider: OAuthProvider, account: AccountInvoer): Promise<Account | null> => {
      geannuleerd.current = false;
      setBezig(provider);
      try {
        return await backend.meldAanMetOAuth(provider, account);
      } catch (e) {
        if (geannuleerd.current) return null;
        throw new Error(foutTekst(e, i18next.t("email:accounts.oauth.signInFailed", { provider: PROVIDERNAAM[provider] })));
      } finally {
        setBezig(null);
      }
    },
    [backend],
  );
  const annuleer = useCallback(async () => {
    geannuleerd.current = true;
    try {
      await backend.annuleerOAuth();
    } catch (e) {
      // Niets meer om af te breken.
      void naarMailFout(e);
    }
    setBezig(null);
  }, [backend]);
  return { status, bezig, meldAan, annuleer, ververs };
}

export function OAuthWacht({ provider, annuleer }: { provider: OAuthProvider; annuleer: () => void }) {
  const { t } = useTranslation("email");
  return (
    <div className="email-oauthwacht" role="status" aria-live="polite">
      <LoaderCircle size={30} className="email-draait" />
      <h3>{t("accounts.oauth.waitTitle")}</h3>
      <p>{t("accounts.oauth.waitText", { provider: PROVIDERNAAM[provider] })}</p>
      <button className="email-knop" onClick={annuleer}>
        {t("common:cancel")}
      </button>
    </div>
  );
}

export function OAuthUitleg({ provider, status }: { provider: OAuthProvider; status?: OAuthStatus }) {
  const { t } = useTranslation("email");
  return (
    <div className="email-oauthuitleg" role="note">
      <Info size={15} />
      <div>
        <strong>{t("accounts.oauth.unavailableTitle", { provider: PROVIDERNAAM[provider] })}</strong>
        <p>{backendTekst(status) || t("accounts.oauth.notSupported")}</p>
        <p>
          <Trans
            t={t}
            i18nKey="accounts.oauth.unavailableHelp"
            values={{ provider: PROVIDERNAAM[provider], doc: OAUTH_DOCUMENTATIE }}
            components={{ em: <em />, code: <code /> }}
          />
        </p>
      </div>
    </div>
  );
}

/** De twee aanmeldknoppen; de herkende provider staat voorop en is primair. */
export function OAuthKnoppen({
  aanbevolen,
  kies,
  uitgeschakeld,
}: {
  aanbevolen: OAuthProvider | null;
  kies: (provider: OAuthProvider) => void;
  uitgeschakeld?: boolean;
}) {
  const { t } = useTranslation("email");
  const volgorde: OAuthProvider[] = aanbevolen === "google" ? ["google", "microsoft"] : ["microsoft", "google"];
  return (
    <div className="email-oauthknoppen">
      {volgorde.map((provider) => (
        <button
          key={provider}
          type="button"
          className={`email-knop ${provider === aanbevolen ? "is-primair" : ""}`}
          disabled={uitgeschakeld}
          onClick={() => kies(provider)}
        >
          <ExternalLink size={14} /> {t("accounts.oauth.signInWith", { provider: PROVIDERNAAM[provider] })}
          {provider === aanbevolen && <small className="email-aanbevolen">{t("accounts.oauth.recommended")}</small>}
        </button>
      ))}
    </div>
  );
}
