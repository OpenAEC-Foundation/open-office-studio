import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { Account, AccountInvoer, MailBackend, Map, OAuthProvider, TestUitkomst } from "../contract";
import { kanOAuthClientBewaren, OAUTH_DOCUMENTATIE, PROVIDERNAAM } from "../oauth";
import { OAuthWacht, useOAuth } from "./OAuth";
import { isGeldigAdres } from "../adressen";
import { backendTekst, foutTekst } from "../fouten";
import { Dialoog, useVraag } from "./Dialoog";
import { ServerVelden } from "./ServerVelden";
import { bewaarIspdb, leesIspdb, vergeetExterneAfzender, vertrouwdeAfzenders } from "./voorkeuren";

type Tab = "identiteit" | "servers" | "mappen" | "ophalen" | "geavanceerd";
const TABS: { id: Tab; sleutel: string }[] = [
  { id: "identiteit", sleutel: "identity" },
  { id: "servers", sleutel: "servers" },
  { id: "mappen", sleutel: "folders" },
  { id: "ophalen", sleutel: "fetching" },
  { id: "geavanceerd", sleutel: "advanced" },
];
const ROLLEN = [
  { rol: "verzonden", sleutel: "sent" },
  { rol: "concepten", sleutel: "drafts" },
  { rol: "prullenbak", sleutel: "trash" },
  { rol: "archief", sleutel: "archive" },
] as const;

/** Accountinstellingen achteraf, per account, met een lijst links zoals in Thunderbird. */
export function AccountInstellingen({
  backend,
  accounts,
  gekozen: beginKeuze,
  sluit,
  gewijzigd,
  nieuwAccount,
}: {
  backend: MailBackend;
  accounts: Account[];
  gekozen?: string;
  sluit: () => void;
  gewijzigd: (accountId?: string) => void;
  nieuwAccount: () => void;
}) {
  const { t } = useTranslation("email");
  const [gekozen, setGekozen] = useState<string | undefined>(beginKeuze ?? accounts[0]?.id);
  const [tab, setTab] = useState<Tab>("identiteit");
  const origineel = accounts.find((a) => a.id === gekozen);
  const [concept, setConcept] = useState<AccountInvoer | null>(null);
  const [wachtwoord, setWachtwoord] = useState("");
  const [mappen, setMappen] = useState<Map[]>([]);
  const [uitkomst, setUitkomst] = useState<TestUitkomst | null>(null);
  const [bezig, setBezig] = useState("");
  const [melding, setMelding] = useState("");
  const [fout, setFout] = useState("");
  const [vraagElement, vraag, vraagOpen] = useVraag();
  const [afzenders, setAfzenders] = useState(vertrouwdeAfzenders);
  const oauth = useOAuth(backend);
  const [ispdb, setIspdb] = useState(leesIspdb);
  const [clients, setClients] = useState<Record<OAuthProvider, { id: string; geheim: string }>>({
    microsoft: { id: "", geheim: "" },
    google: { id: "", geheim: "" },
  });

  useEffect(() => {
    if (!origineel) return;
    const { wachtwoordOpgeslagen: _w, ...rest } = origineel;
    setConcept(structuredClone(rest));
    setWachtwoord("");
    setUitkomst(null);
    setMelding("");
    setFout("");
    backend.mappen(origineel.id).then(setMappen, () => setMappen([]));
    // Alleen bij een andere accountkeuze; na opslaan blijft het concept staan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origineel?.id, backend]);

  if (!origineel || !concept)
    return (
      <Dialoog titel={t("accounts.settings.title")} sluit={sluit}>
        <p>{t("accounts.settings.noAccount")}</p>
        <button className="email-knop is-primair" onClick={nieuwAccount}>
          <Plus size={14} /> {t("accounts.settings.addAccount")}
        </button>
      </Dialoog>
    );

  const zet = (deel: Partial<AccountInvoer>) => {
    setConcept({ ...concept, ...deel });
    setMelding("");
  };
  const geldig = concept.volledigeNaam.trim() && isGeldigAdres(concept.email.trim()) && concept.imap.host && concept.smtp.host && (!concept.antwoordAan || isGeldigAdres(concept.antwoordAan));

  async function bewaar() {
    setBezig("bewaren");
    setFout("");
    try {
      await backend.bewaarAccount({ ...concept!, wachtwoord: wachtwoord || undefined });
      setWachtwoord("");
      setMelding(t("accounts.settings.saved"));
      gewijzigd(origineel!.id);
    } catch (e) {
      setFout(foutTekst(e, t("accounts.settings.saveFailed")));
    } finally {
      setBezig("");
    }
  }

  async function verwijder() {
    const keuze = await vraag({
      titel: t("accounts.settings.deleteAccount.title"),
      tekst: (
        <Trans
          t={t}
          i18nKey="accounts.settings.deleteAccount.confirm"
          values={{ name: origineel!.naam, email: origineel!.email }}
          components={{ strong: <strong /> }}
        />
      ),
      knoppen: [
        { waarde: "nee", label: t("common:cancel") },
        { waarde: "ja", label: t("accounts.settings.deleteAccount.button"), soort: "gevaar" },
      ],
      annuleer: "nee",
    });
    if (keuze !== "ja") return;
    try {
      await backend.verwijderAccount(origineel!.id);
      gewijzigd();
      setGekozen(accounts.find((a) => a.id !== origineel!.id)?.id);
    } catch (e) {
      setFout(foutTekst(e, t("accounts.settings.deleteAccount.failed")));
    }
  }

  async function opnieuwAanmelden() {
    if (!origineel?.oauth || !concept) return;
    setFout("");
    setMelding("");
    try {
      const account = await oauth.meldAan(origineel.oauth.provider, { ...concept, id: origineel.id, wachtwoord: undefined });
      if (account) {
        setMelding(t("accounts.settings.oauthAccount.signedInAgain", { account: account.oauth?.aangemeldAls ?? account.email }));
        gewijzigd(account.id);
      }
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }

  async function bewaarClient(provider: OAuthProvider) {
    if (!kanOAuthClientBewaren(backend)) return;
    setFout("");
    try {
      await backend.bewaarOAuthClient(provider, clients[provider].id.trim(), clients[provider].geheim.trim() || undefined);
      setClients({ ...clients, [provider]: { id: "", geheim: "" } });
      setMelding(t("accounts.settings.advanced.clientIdSaved", { provider: PROVIDERNAAM[provider] }));
      oauth.ververs();
    } catch (e) {
      setFout(foutTekst(e, t("accounts.settings.advanced.clientIdSaveFailed")));
    }
  }

  async function test() {
    setBezig("testen");
    setFout("");
    try {
      setUitkomst(await backend.test({ ...concept!, wachtwoord: wachtwoord || undefined }));
    } catch (e) {
      setFout(foutTekst(e, t("accounts.test.failed")));
    } finally {
      setBezig("");
    }
  }

  return (
    <>
      <Dialoog
        titel={t("accounts.settings.title")}
        sluit={sluit}
        breed="groot"
        className="email-instellingen"
        acties={
          <>
            {melding && <span className="email-okregel" role="status">{melding}</span>}
            {fout && <span className="email-foutregel" role="alert">{fout}</span>}
            <button className="email-knop" onClick={sluit}>
              {t("common:close")}
            </button>
            <button className="email-knop is-primair" disabled={!geldig || !!bezig} onClick={() => void bewaar()}>
              {bezig === "bewaren" ? t("accounts.settings.saving") : t("common:save")}
            </button>
          </>
        }
      >
        <div className="email-instellingen-indeling" inert={vraagOpen}>
          <nav aria-label={t("accounts.settings.accountList")}>
            {accounts.map((a) => (
              <button key={a.id} className={a.id === gekozen ? "is-gekozen" : ""} aria-current={a.id === gekozen} onClick={() => setGekozen(a.id)}>
                <UserRound size={15} />
                <span>
                  {a.naam}
                  <small dir="ltr">{a.email}</small>
                </span>
              </button>
            ))}
            <button className="email-account-nieuw" onClick={nieuwAccount}>
              <Plus size={15} /> {t("accounts.settings.addAccount")}
            </button>
          </nav>
          <div className="email-instellingen-paneel">
            <div className="email-tabs" role="tablist">
              {TABS.map((tb) => (
                <button key={tb.id} role="tab" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}>
                  {t(`accounts.settings.tabs.${tb.sleutel}`)}
                </button>
              ))}
            </div>
            {tab === "identiteit" && (
              <div className="email-formulier" role="tabpanel">
                <label>
                  {t("accounts.settings.identity.accountName")}
                  <input value={concept.naam} onChange={(e) => zet({ naam: e.target.value })} />
                  <small>{t("accounts.settings.identity.accountNameHint")}</small>
                </label>
                <label>
                  {t("accounts.settings.identity.yourName")}
                  <input value={concept.volledigeNaam} onChange={(e) => zet({ volledigeNaam: e.target.value })} />
                </label>
                <label>
                  {t("accounts.settings.identity.email")}
                  <input value={concept.email} onChange={(e) => zet({ email: e.target.value.trim() })} spellCheck={false} dir="ltr" />
                </label>
                <label>
                  {t("accounts.settings.identity.replyTo")}
                  <input
                    value={concept.antwoordAan ?? ""}
                    onChange={(e) => zet({ antwoordAan: e.target.value.trim() || undefined })}
                    placeholder={t("accounts.settings.identity.replyToPlaceholder")}
                    spellCheck={false}
                    dir="ltr"
                  />
                </label>
                <label>
                  {t("accounts.settings.identity.signature")}
                  <textarea rows={4} value={concept.handtekening ?? ""} onChange={(e) => zet({ handtekening: e.target.value })} />
                  <small>{t("accounts.settings.identity.signatureHint")}</small>
                </label>
              </div>
            )}
            {tab === "servers" && (
              <div className="email-formulier" role="tabpanel">
                <ServerVelden
                  imap={concept.imap}
                  smtp={concept.smtp}
                  uitkomst={uitkomst}
                  wijzig={(soort, server) => {
                    zet({ [soort]: server });
                    setUitkomst(null);
                  }}
                />
                {origineel.oauth ? (
                  oauth.bezig ? (
                    <OAuthWacht provider={oauth.bezig} annuleer={() => void oauth.annuleer()} />
                  ) : (
                    <div className="email-oauthaccount">
                      <ShieldCheck size={18} />
                      <span>
                        <span>
                          <Trans
                            t={t}
                            i18nKey="accounts.settings.oauthAccount.signedInAs"
                            values={{ account: origineel.oauth.aangemeldAls, provider: PROVIDERNAAM[origineel.oauth.provider] }}
                            components={{ strong: <strong /> }}
                          />
                        </span>
                        <small>{t("accounts.settings.oauthAccount.noPasswordStored")}</small>
                      </span>
                      <button className="email-knop" onClick={() => void opnieuwAanmelden()}>
                        {t("accounts.settings.oauthAccount.signInAgain")}
                      </button>
                    </div>
                  )
                ) : (
                <label>
                  <span>
                    <KeyRound size={13} /> {t("accounts.settings.password.change")}
                  </span>
                  <input
                    type="password"
                    value={wachtwoord}
                    onChange={(e) => setWachtwoord(e.target.value)}
                    placeholder={origineel.wachtwoordOpgeslagen ? t("accounts.settings.password.storedPlaceholder") : t("accounts.settings.password.noneStoredPlaceholder")}
                    autoComplete="new-password"
                  />
                </label>
                )}
                <div>
                  <button className="email-knop" disabled={!!bezig} onClick={() => void test()}>
                    {bezig === "testen" ? t("accounts.test.testing") : uitkomst ? t("accounts.test.retest") : t("accounts.test.testConnection")}
                  </button>
                </div>
              </div>
            )}
            {tab === "mappen" && (
              <div className="email-formulier" role="tabpanel">
                <p className="email-hint">{t("accounts.settings.folders.hint")}</p>
                {ROLLEN.map(({ rol, sleutel }) => {
                  const automatisch = mappen.find((m) => m.speciaal === rol);
                  return (
                  <label key={rol}>
                    {t(`accounts.settings.folders.roles.${sleutel}`)}
                    <select value={concept.mappen?.[rol] ?? ""} onChange={(e) => zet({ mappen: { ...concept.mappen, [rol]: e.target.value || undefined } })}>
                      <option value="">
                        {automatisch ? t("accounts.settings.folders.automaticWithFolder", { folder: automatisch.naam }) : t("accounts.settings.folders.automatic")}
                      </option>
                      {mappen
                        .filter((m) => m.selecteerbaar)
                        .map((m) => (
                          <option key={m.pad} value={m.pad}>
                            {m.pad.split(m.scheiding || "/").join(" › ")}
                          </option>
                        ))}
                    </select>
                  </label>
                  );
                })}
              </div>
            )}
            {tab === "ophalen" && (
              <div className="email-formulier" role="tabpanel">
                <label>
                  {t("accounts.settings.fetching.checkForNew")}
                  <select value={concept.controleerElke} onChange={(e) => zet({ controleerElke: Number(e.target.value) })}>
                    <option value={0}>{t("accounts.settings.fetching.manualOnly")}</option>
                    {[1, 5, 10, 15, 30, 60].map((n) => (
                      <option key={n} value={n}>
                        {t("accounts.settings.fetching.everyMinutes", { count: n })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="email-vinkje">
                  <input type="checkbox" checked={concept.externeInhoud} onChange={(e) => zet({ externeInhoud: e.target.checked })} />
                  <span>
                    {t("accounts.settings.fetching.externalContent")}
                    <small>{t("accounts.settings.fetching.externalContentHint")}</small>
                  </span>
                </label>
                {afzenders.length > 0 && (
                  <div className="email-afzenders">
                    <span>{t("accounts.settings.fetching.trustedSenders")}</span>
                    <ul>
                      {afzenders.map((a) => (
                        <li key={a}>
                          {a}
                          <button
                            className="email-iconknop"
                            aria-label={t("accounts.settings.fetching.forgetSender", { sender: a })}
                            onClick={() => {
                              vergeetExterneAfzender(a);
                              setAfzenders(vertrouwdeAfzenders());
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {tab === "geavanceerd" && (
              <div className="email-formulier" role="tabpanel">
                <p className="email-hint">
                  <Trans t={t} i18nKey="accounts.settings.advanced.oauthIntro" values={{ doc: OAUTH_DOCUMENTATIE }} components={{ code: <code /> }} />
                </p>
                <label className="email-vinkje">
                  <input
                    type="checkbox"
                    checked={ispdb}
                    onChange={(e) => {
                      setIspdb(e.target.checked);
                      bewaarIspdb(e.target.checked);
                    }}
                  />
                  <span>
                    {t("accounts.settings.advanced.ispdb")}
                    <small>{t("accounts.settings.advanced.ispdbHint")}</small>
                  </span>
                </label>
                {(["microsoft", "google"] as const).map((provider) => (
                  <fieldset key={provider} className="email-oauthclient">
                    <legend>{PROVIDERNAAM[provider]}</legend>
                    <p className={oauth.status?.[provider].beschikbaar ? "email-okregel" : "email-hint"}>
                      {oauth.status
                        ? oauth.status[provider].beschikbaar
                          ? t("accounts.settings.advanced.available")
                          : (backendTekst(oauth.status[provider]) || t("accounts.settings.advanced.unavailable"))
                        : t("accounts.settings.advanced.loadingStatus")}
                    </p>
                    <label>
                      {t("accounts.settings.advanced.clientId")}
                      <input
                        value={clients[provider].id}
                        disabled={!kanOAuthClientBewaren(backend)}
                        spellCheck={false}
                        dir="ltr"
                        onChange={(e) => setClients({ ...clients, [provider]: { ...clients[provider], id: e.target.value } })}
                      />
                    </label>
                    {provider === "google" && (
                      <label>
                        {t("accounts.settings.advanced.clientSecret")}
                        <input
                          type="password"
                          value={clients.google.geheim}
                          disabled={!kanOAuthClientBewaren(backend)}
                          autoComplete="off"
                          onChange={(e) => setClients({ ...clients, google: { ...clients.google, geheim: e.target.value } })}
                        />
                      </label>
                    )}
                    <div>
                      <button className="email-knop" disabled={!kanOAuthClientBewaren(backend) || !clients[provider].id.trim()} onClick={() => void bewaarClient(provider)}>
                        {t("accounts.settings.advanced.saveClientId")}
                      </button>
                    </div>
                  </fieldset>
                ))}
                {!kanOAuthClientBewaren(backend) && <p className="email-hint">{t("accounts.settings.advanced.desktopOnly")}</p>}
              </div>
            )}
            <div className="email-gevarenzone">
              <button className="email-knop is-gevaar" onClick={() => void verwijder()}>
                <Trash2 size={14} /> {t("accounts.settings.deleteAccount.button")}
              </button>
            </div>
          </div>
        </div>
      </Dialoog>
      {vraagElement}
    </>
  );
}
