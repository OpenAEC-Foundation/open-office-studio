import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleDashed, CircleMinus, CircleX, Globe, KeyRound, LoaderCircle, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Account, AccountInvoer, ConfiguratieVoorstel, MailBackend, OAuthProvider, ServerInstelling, TestUitkomst } from "../contract";
import { isGeldigAdres } from "../adressen";
import { foutTekst, naarMailFout } from "../fouten";
import { domeinVan, gok } from "../voorinstellingen";
import { herkenProvider, oauthServers, PROVIDERNAAM } from "../oauth";
import {
  bereikbaarSoort,
  maakKaarten,
  metVoortgang,
  serverSleutel,
  ServerZoeker,
  voortgangNaarStap,
  zoekStappen,
  type StapStatus,
  type ZoekUitkomst,
  type ZoekVoortgang,
} from "../serverzoeker";
import { isDesktop } from "../backend";
import { Dialoog } from "./Dialoog";
import { ServerVelden } from "./ServerVelden";
import { OAuthKnoppen, OAuthUitleg, OAuthWacht, useOAuth } from "./OAuth";
import { bewaarIspdb, leesIspdb } from "./voorkeuren";

const STAPICOON = {
  wacht: CircleDashed,
  bezig: LoaderCircle,
  gevonden: CircleCheck,
  niets: CircleMinus,
  overgeslagen: CircleMinus,
} as const;
const STAPTEKST = { wacht: "waiting", bezig: "busy", gevonden: "found", niets: "nothing", overgeslagen: "skipped" } as const;

function volledig(server: ConfiguratieVoorstel["imap"], email: string): ServerInstelling {
  return { ...server, gebruikersnaam: server.gebruikersnaam ?? email };
}

/**
 * "Account toevoegen" zoals in Thunderbird: naam, adres en wachtwoord. Zodra
 * het adres geldig is zoekt de app automatisch naar de servers en toont de
 * voorstellen als kaarten; de handmatige configuratie blijft altijd
 * zichtbaar en aanpasbaar. Het wachtwoord gaat pas mee bij Testen of Gereed.
 */
export function AccountWizard({
  backend,
  sluit,
  klaar,
}: {
  backend: MailBackend;
  sluit?: () => void;
  klaar: (account: Account) => void;
}) {
  const { t, i18n } = useTranslation("email");
  const [volledigeNaam, setVolledigeNaam] = useState("");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [ispdb, setIspdb] = useState(leesIspdb);
  const [zoeken, setZoeken] = useState<ZoekUitkomst>({ status: "leeg" });
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [imap, setImap] = useState<ServerInstelling | null>(null);
  const [smtp, setSmtp] = useState<ServerInstelling | null>(null);
  const [aangepast, setAangepast] = useState(false);
  const [uitkomst, setUitkomst] = useState<TestUitkomst | null>(null);
  const [bezig, setBezig] = useState<"" | "testen" | "bewaren">("");
  const [fout, setFout] = useState("");
  const oauth = useOAuth(backend);
  const [oauthUitleg, setOauthUitleg] = useState<OAuthProvider | null>(null);
  const opties = useRef({ ispdb });
  opties.current = { ispdb };
  const aangepastRef = useRef(aangepast);
  aangepastRef.current = aangepast;

  // Eén zoeker per wizard; terugval op de offline voorinstelling als de backend
  // `zoekServers` (nog) niet kent.
  const zoeker = useMemo(
    () =>
      new ServerZoeker(
        async (adres) => {
          try {
            return await backend.zoekServers(adres, { ispdb: opties.current.ispdb, proef: true });
          } catch (e) {
            if (naarMailFout(e).code !== "niet-beschikbaar") throw e;
            const v = await backend.stelConfiguratieVoor(adres, { online: true });
            return v ? [v] : [];
          }
        },
        setZoeken,
      ),
    [backend],
  );
  useEffect(() => () => zoeker.stop(), [zoeker]);
  useEffect(() => zoeker.wijzig(email), [email, zoeker]);

  const domein = domeinVan(email);
  // De kaartteksten (bron, bereikbaarheid) volgen de interfacetaal.
  const taal = i18n.language;
  const kaarten = useMemo(
    () => (zoeken.status === "klaar" ? maakKaarten(zoeken.voorstellen, domein) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoeken, domein, taal],
  );
  // Optionele voortgang van de desktopbackend (`email-zoek-voortgang`).
  const [voortgang, setVoortgang] = useState<Record<string, StapStatus>>({});
  useEffect(() => {
    if (zoeken.status === "wacht") setVoortgang({});
  }, [zoeken.status]);
  // De voortgang is per (vertaalde) stapnaam bijgehouden; bij een taalwissel opnieuw.
  useEffect(() => setVoortgang({}), [taal]);
  useEffect(() => {
    if (!isDesktop()) return;
    let stop: (() => void) | null = null;
    let actief = true;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<ZoekVoortgang>("email-zoek-voortgang", (e) => {
          const stap = voortgangNaarStap(e.payload);
          if (stap) setVoortgang((v) => ({ ...v, [stap.naam]: stap.status }));
        }),
      )
      .then((s) => {
        if (actief) stop = s;
        else s();
      })
      .catch(() => {});
    return () => {
      actief = false;
      stop?.();
    };
  }, []);
  const stappen = metVoortgang(zoekStappen(zoeken, ispdb), voortgang, zoeken.status === "bezig");

  function kies(voorstel: ConfiguratieVoorstel) {
    setGekozen(serverSleutel(voorstel));
    setImap(volledig(voorstel.imap, email.trim()));
    setSmtp(volledig(voorstel.smtp, email.trim()));
    setAangepast(false);
    setUitkomst(null);
  }

  // De beste kaart voorselecteren, tenzij de gebruiker de servers al heeft aangepast.
  useEffect(() => {
    if (zoeken.status !== "klaar" || aangepastRef.current) return;
    if (zoeken.voorstellen.length) kies(zoeken.voorstellen[0]);
    else {
      const g = gok(zoeken.email);
      setGekozen(null);
      setImap(volledig(g.imap, zoeken.email));
      setSmtp(volledig(g.smtp, zoeken.email));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoeken]);

  const gekozenVoorstel = zoeken.status === "klaar" ? zoeken.voorstellen.find((v) => serverSleutel(v) === gekozen) : undefined;
  const aanbevolen = gekozenVoorstel?.oauth ?? kaarten.find((k) => k.oauth)?.oauth ?? herkenProvider(email.trim(), gekozenVoorstel);

  function invoer(): AccountInvoer {
    const adres = email.trim();
    return {
      naam: adres,
      volledigeNaam: volledigeNaam.trim(),
      email: adres,
      imap: imap ?? volledig(gok(adres).imap, adres),
      smtp: smtp ?? volledig(gok(adres).smtp, adres),
      mappen: {},
      controleerElke: 10,
      externeInhoud: false,
      wachtwoord: wachtwoord || undefined,
    };
  }

  async function meldAan(provider: OAuthProvider) {
    setFout("");
    if (!volledigeNaam.trim() || !isGeldigAdres(email.trim())) {
      setFout(t("accounts.wizard.enterNameAndEmailFirst"));
      return;
    }
    if (!oauth.status?.[provider].beschikbaar) {
      setOauthUitleg(provider);
      return;
    }
    setOauthUitleg(null);
    const passend = zoeken.status === "klaar" ? zoeken.voorstellen.find((v) => v.oauth === provider) : undefined;
    const servers = passend ? { imap: volledig(passend.imap, email.trim()), smtp: volledig(passend.smtp, email.trim()) } : oauthServers(provider, email.trim());
    try {
      const account = await oauth.meldAan(provider, {
        ...invoer(),
        imap: { ...servers.imap, authenticatie: "oauth2", gebruikersnaam: email.trim() },
        smtp: { ...servers.smtp, authenticatie: "oauth2", gebruikersnaam: email.trim() },
        wachtwoord: undefined,
      });
      if (account) klaar(account);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }

  async function test() {
    if (!imap || !smtp) return;
    setFout("");
    setBezig("testen");
    try {
      setUitkomst(await backend.test(invoer()));
    } catch (e) {
      setFout(foutTekst(e, t("accounts.test.failed")));
    } finally {
      setBezig("");
    }
  }

  async function bewaar() {
    if (!imap || !smtp) return;
    setFout("");
    setBezig("bewaren");
    try {
      klaar(await backend.bewaarAccount(invoer()));
    } catch (e) {
      setFout(foutTekst(e, t("accounts.wizard.saveFailed")));
    } finally {
      setBezig("");
    }
  }

  const gegevensGeldig = !!volledigeNaam.trim() && isGeldigAdres(email.trim());
  const getest = uitkomst?.imap.ok && uitkomst.smtp.ok;
  const serversIngevuld = !!imap?.host && !!smtp?.host;
  return (
    <Dialoog
      titel={t("accounts.wizard.title")}
      sluit={oauth.bezig ? () => void oauth.annuleer() : sluit}
      breed="groot"
      className="email-wizard"
      acties={
        oauth.bezig ? undefined : (
          <>
            {fout && (
              <span className="email-foutregel" role="alert">
                {fout}
              </span>
            )}
            {sluit && (
              <button className="email-knop" onClick={sluit}>
                {t("common:cancel")}
              </button>
            )}
            <button className="email-knop" onClick={() => void test()} disabled={!!bezig || !gegevensGeldig || !serversIngevuld}>
              {bezig === "testen" ? t("accounts.test.testing") : uitkomst ? t("accounts.test.retest") : t("accounts.test.test")}
            </button>
            <button
              className="email-knop is-primair"
              onClick={() => void bewaar()}
              disabled={!!bezig || !gegevensGeldig || !serversIngevuld}
              title={getest ? t("accounts.wizard.saveTitle") : t("accounts.wizard.saveUntestedTitle")}
            >
              {bezig === "bewaren" ? t("accounts.wizard.saving") : getest ? t("accounts.wizard.done") : t("accounts.wizard.saveAnyway")}
            </button>
          </>
        )
      }
    >
      {oauth.bezig ? (
        <OAuthWacht provider={oauth.bezig} annuleer={() => void oauth.annuleer()} />
      ) : (
        <div className="email-wizard-indeling">
          <form
            className="email-formulier"
            onSubmit={(e) => {
              e.preventDefault();
              zoeker.wijzig(email, true);
            }}
          >
            <p className="email-intro">{t("accounts.wizard.intro")}</p>
            <label>
              {t("accounts.wizard.fullName")}
              <input
                autoFocus
                value={volledigeNaam}
                onChange={(e) => setVolledigeNaam(e.target.value)}
                autoComplete="name"
                placeholder={t("accounts.wizard.fullNamePlaceholder")}
              />
              <small>{t("accounts.wizard.fullNameHint")}</small>
            </label>
            <label>
              {t("accounts.wizard.email")}
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAangepast(false);
                  setOauthUitleg(null);
                }}
                autoComplete="email"
                placeholder={t("accounts.wizard.emailPlaceholder")}
                spellCheck={false}
                dir="ltr"
              />
            </label>
            <label>
              {t("accounts.wizard.password")}
              <input type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} autoComplete="current-password" />
              <small>
                <KeyRound size={12} /> {t("accounts.wizard.passwordHint")}
              </small>
            </label>
            <label className="email-vinkje">
              <input
                type="checkbox"
                checked={ispdb}
                onChange={(e) => {
                  setIspdb(e.target.checked);
                  bewaarIspdb(e.target.checked);
                  opties.current = { ispdb: e.target.checked };
                  zoeker.wijzig(email, true);
                }}
              />
              <span>
                {t("accounts.wizard.ispdb")}
                <small>{t("accounts.wizard.ispdbHint")}</small>
              </span>
            </label>
            <div className="email-oauthblok">
              <span>{t("accounts.wizard.oauthPrompt")}</span>
              <OAuthKnoppen aanbevolen={aanbevolen} kies={(p) => void meldAan(p)} uitgeschakeld={!!bezig} />
            </div>
            {oauthUitleg && <OAuthUitleg provider={oauthUitleg} status={oauth.status?.[oauthUitleg]} />}
            <button type="submit" hidden />
          </form>

          <section className="email-zoekresultaat" aria-label={t("accounts.wizard.foundSettings")} aria-busy={zoeken.status === "bezig" || zoeken.status === "wacht"}>
            <h3>
              <Globe size={15} />{" "}
              {domein && isGeldigAdres(email.trim()) ? t("accounts.wizard.serverSettingsFor", { domain: domein }) : t("accounts.wizard.serverSettings")}
            </h3>
            {zoeken.status === "leeg" ? (
              <p className="email-hint">{t("accounts.wizard.enterEmailHint")}</p>
            ) : (
              <ol className="email-zoekstappen" aria-live="polite">
                {stappen.map((stap) => {
                  const Icoon = STAPICOON[stap.status];
                  return (
                    <li key={stap.naam} className={`is-${stap.status}`}>
                      <Icoon size={13} className={stap.status === "bezig" ? "email-draait" : undefined} />
                      {stap.naam} <small>{t(`accounts.discovery.stepStatus.${STAPTEKST[stap.status]}`)}</small>
                    </li>
                  );
                })}
              </ol>
            )}
            {zoeken.status === "fout" && (
              <p className="email-foutregel" role="alert">
                {foutTekst(zoeken.fout, t("accounts.wizard.searchFailed"))} {t("accounts.wizard.fillInManually")}
              </p>
            )}
            {zoeken.status === "klaar" && !kaarten.length && (
              <p className="email-hint">{t("accounts.wizard.nothingFound")}</p>
            )}
            {kaarten.length > 0 && (
              <div className="email-kaarten" role="radiogroup" aria-label={t("accounts.wizard.proposals")}>
                {kaarten.map((kaart) => {
                  const actief = kaart.sleutel === gekozen && !aangepast;
                  return (
                    <div key={kaart.sleutel} className={`email-kaart ${actief ? "is-gekozen" : ""}`}>
                      <button role="radio" aria-checked={actief} className="email-kaartkeuze" onClick={() => kies(kaart.voorstel)}>
                        <strong>{kaart.titel}</strong>
                        <small>
                          {kaart.bron}
                          {kaart.toelichting ? ` · ${kaart.toelichting}` : ""}
                        </small>
                        <span className="email-kaartserver">
                          IMAP {kaart.imap}{" "}
                          <em className={`email-bereik is-${bereikbaarSoort(kaart.imapBereikbaar.teken)}`}>
                            {kaart.imapBereikbaar.teken} {kaart.imapBereikbaar.tekst}
                          </em>
                        </span>
                        <span className="email-kaartserver">
                          SMTP {kaart.smtp}{" "}
                          <em className={`email-bereik is-${bereikbaarSoort(kaart.smtpBereikbaar.teken)}`}>
                            {kaart.smtpBereikbaar.teken} {kaart.smtpBereikbaar.tekst}
                          </em>
                        </span>
                        {kaart.onversleuteld && (
                          <span className="email-kaartwaarschuwing">
                            <ShieldAlert size={13} /> {t("accounts.wizard.unencrypted")}
                          </span>
                        )}
                      </button>
                      {kaart.oauth && (
                        <button className="email-knop is-primair" onClick={() => void meldAan(kaart.oauth!)}>
                          {t("accounts.oauth.signInWith", { provider: PROVIDERNAAM[kaart.oauth] })}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <h3 className="email-handmatig-kop">
              {t("accounts.wizard.manualConfiguration")} {aangepast && <small>{t("accounts.wizard.adjusted")}</small>}
            </h3>
            {imap && smtp ? (
              <ServerVelden
                imap={imap}
                smtp={smtp}
                uitkomst={uitkomst}
                wijzig={(soort, server) => {
                  (soort === "imap" ? setImap : setSmtp)(server);
                  setAangepast(true);
                  setUitkomst(null);
                }}
              />
            ) : (
              <p className="email-hint">{t("accounts.wizard.fieldsAppear")}</p>
            )}
            {uitkomst && !uitkomst.imap.ok && !uitkomst.smtp.ok && (
              <p className="email-hint">
                <CircleX size={13} /> {t("accounts.wizard.bothServersFailed")}
              </p>
            )}
          </section>
        </div>
      )}
    </Dialoog>
  );
}
