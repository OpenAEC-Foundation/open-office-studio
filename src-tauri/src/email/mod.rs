//! OpenAEC Email Studio — Rust-backend van de zelfstandige e-mailclient
//! (IMAP/SMTP, zonder ERP-koppeling). Elke methode van `MailBackend` uit
//! `packages/email/src/contract.ts` is hier een Tauri-opdracht
//! `email_<methode_in_snake_case>`.
//!
//! Herkomst: de IMAP/SMTP-aanpak (sessiepool met wachttijd na mislukte
//! aanmelding, korte mappencache, berichtlijst via (UID) FETCH van
//! kopregels, MIME-ontleding met mail-parser, kopie naar Verzonden via
//! APPEND na SMTP) is overgenomen en bewerkt uit
//! `packages/desktop/src-tauri/src/mail.rs` van Y-app-ERPNext
//! (https://github.com/OpenAEC-Foundation/Y-app-ERPNext, commit
//! cc51488bed97d251cb5c98ff91d5a0d56a49fd0a), zonder de ERPNext-, instance-
//! en Frappe-onderdelen.
//!
//! Copyright (c) 2026 OpenAEC Foundation i.o. — MIT-licentie:
//! Permission is hereby granted, free of charge, to any person obtaining a
//! copy of this software and associated documentation files (the
//! "Software"), to deal in the Software without restriction, including
//! without limitation the rights to use, copy, modify, merge, publish,
//! distribute, sublicense, and/or sell copies of the Software, and to permit
//! persons to whom the Software is furnished to do so, subject to the
//! following conditions: The above copyright notice and this permission
//! notice shall be included in all copies or substantial portions of the
//! Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//! EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//! MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
//! NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
//! DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//! OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
//! USE OR OTHER DEALINGS IN THE SOFTWARE.
//! (Volledige tekst: docs/licenties/Y-app-ERPNext-LICENSE.txt.)

pub mod accounts;
pub mod autoconfig;
pub mod bestanden;
pub mod fout;
pub mod imap;
pub mod mime;
#[cfg(test)]
mod nepserver;
pub mod oauth;
pub mod smtp;
pub mod zoeken;

use accounts::{AccountOpslag, Kluis};
use fout::{MailFout, Uitkomst};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, OnceLock};
use tauri::Manager;

/* ─── Contracttypen (exacte veldnamen uit contract.ts) ─── */

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Beveiliging {
    #[default]
    Ssl,
    Starttls,
    Geen,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Authenticatie {
    #[default]
    Normaal,
    Versleuteld,
    Oauth2,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInstelling {
    pub host: String,
    pub poort: u16,
    pub beveiliging: Beveiliging,
    pub authenticatie: Authenticatie,
    pub gebruikersnaam: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecialeMappen {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verzonden: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub concepten: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prullenbak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archief: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub naam: String,
    pub volledige_naam: String,
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub antwoord_aan: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handtekening: Option<String>,
    pub imap: ServerInstelling,
    pub smtp: ServerInstelling,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mappen: Option<SpecialeMappen>,
    #[serde(default)]
    pub controleer_elke: u32,
    #[serde(default)]
    pub externe_inhoud: bool,
    #[serde(default)]
    pub wachtwoord_opgeslagen: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oauth: Option<oauth::OAuthKoppeling>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInvoer {
    #[serde(default)]
    pub id: Option<String>,
    pub naam: String,
    pub volledige_naam: String,
    pub email: String,
    #[serde(default)]
    pub antwoord_aan: Option<String>,
    #[serde(default)]
    pub handtekening: Option<String>,
    pub imap: ServerInstelling,
    pub smtp: ServerInstelling,
    #[serde(default)]
    pub mappen: Option<SpecialeMappen>,
    #[serde(default)]
    pub controleer_elke: u32,
    #[serde(default)]
    pub externe_inhoud: bool,
    #[serde(default)]
    pub wachtwoord: Option<String>,
    #[serde(default)]
    pub oauth: Option<oauth::OAuthKoppeling>,
}

// Nooit het wachtwoord in logs of foutmeldingen.
impl std::fmt::Debug for AccountInvoer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AccountInvoer")
            .field("id", &self.id)
            .field("email", &self.email)
            .field("imap", &self.imap)
            .field("smtp", &self.smtp)
            .field("wachtwoord", &self.wachtwoord.as_ref().map(|_| "••••"))
            .finish_non_exhaustive()
    }
}

fn leeg_is_geen(s: Option<String>) -> Option<String> {
    s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

impl AccountInvoer {
    pub fn naar_account(self, id: String) -> Account {
        let trim = |mut s: ServerInstelling| {
            s.host = s.host.trim().to_string();
            s.gebruikersnaam = s.gebruikersnaam.trim().to_string();
            s
        };
        Account {
            id,
            naam: self.naam.trim().to_string(),
            volledige_naam: self.volledige_naam.trim().to_string(),
            email: self.email.trim().to_string(),
            antwoord_aan: leeg_is_geen(self.antwoord_aan),
            handtekening: self.handtekening.filter(|h| !h.is_empty()),
            imap: trim(self.imap),
            smtp: trim(self.smtp),
            mappen: self.mappen.map(|m| SpecialeMappen {
                verzonden: leeg_is_geen(m.verzonden),
                concepten: leeg_is_geen(m.concepten),
                prullenbak: leeg_is_geen(m.prullenbak),
                archief: leeg_is_geen(m.archief),
            }),
            controleer_elke: self.controleer_elke,
            externe_inhoud: self.externe_inhoud,
            wachtwoord_opgeslagen: false,
            oauth: self.oauth,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoorstelServer {
    pub host: String,
    pub poort: u16,
    pub beveiliging: Beveiliging,
    pub authenticatie: Authenticatie,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gebruikersnaam: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguratieVoorstel {
    /// "voorinstelling" | "autoconfig" | "srv" | "mx" | "ispdb" | "gok"
    pub bron: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toelichting: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bereikbaar: Option<Bereikbaar>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth: Option<oauth::Provider>,
    pub imap: VoorstelServer,
    pub smtp: VoorstelServer,
}

/// Uitkomst van de verbindingsproef; `None` (null) = niet geprobeerd.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Bereikbaar {
    pub imap: Option<bool>,
    pub smtp: Option<bool>,
}

/// Uitkomst van één deel van de verbindingstest. `sleutel` en `waarden`
/// maken de melding vertaalbaar (zie `fout.rs`); bij een fout zijn het die
/// van de `MailFout`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Deeluitkomst {
    pub ok: bool,
    pub melding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sleutel: Option<&'static str>,
    #[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub waarden: fout::Waarden,
}

impl Deeluitkomst {
    /// Geslaagde aanmelding, eventueel met de waarschuwing van
    /// `controleer_beveiliging` voor een onversleutelde verbinding.
    pub fn aangemeld(host: &str, protocol: &str, waarschuwing: Option<String>) -> Self {
        let mut melding = format!("Aangemeld bij {host}.");
        let mut waarden = fout::Waarden::new();
        waarden.insert("host", host.to_string());
        let sleutel = match waarschuwing {
            Some(w) => {
                melding = format!("{melding} {w}");
                waarden.insert("protocol", protocol.to_string());
                "test.signedInUnencrypted"
            }
            None => "test.signedIn",
        };
        Self {
            ok: true,
            melding,
            sleutel: Some(sleutel),
            waarden,
        }
    }
}

impl From<MailFout> for Deeluitkomst {
    fn from(f: MailFout) -> Self {
        Self {
            ok: false,
            melding: f.melding,
            sleutel: f.sleutel,
            waarden: f.waarden,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct TestUitkomst {
    pub imap: Deeluitkomst,
    pub smtp: Deeluitkomst,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Speciaal {
    Inbox,
    Verzonden,
    Concepten,
    Prullenbak,
    Ongewenst,
    Archief,
    Alle,
    Gemarkeerd,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Map {
    pub pad: String,
    pub naam: String,
    pub scheiding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speciaal: Option<Speciaal>,
    pub selecteerbaar: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub totaal: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ongelezen: Option<u32>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize)]
pub struct Adres {
    pub naam: String,
    pub adres: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BerichtKop {
    pub uid: u32,
    pub map: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub datum: Option<String>,
    pub onderwerp: String,
    pub van: Vec<Adres>,
    pub aan: Vec<Adres>,
    pub cc: Vec<Adres>,
    pub gelezen: bool,
    pub gemarkeerd: bool,
    pub beantwoord: bool,
    pub grootte: u64,
    pub heeft_bijlagen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bericht_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub in_reply_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referenties: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct BerichtLijst {
    pub berichten: Vec<BerichtKop>,
    pub totaal: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BijlageInfo {
    pub index: u32,
    pub bestandsnaam: String,
    pub inhoudstype: String,
    pub grootte: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_id: Option<String>,
    pub inline: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bericht {
    #[serde(flatten)]
    pub kop: BerichtKop,
    pub bcc: Vec<Adres>,
    pub antwoord_aan: Vec<Adres>,
    pub tekst: String,
    pub html: String,
    pub bijlagen: Vec<BijlageInfo>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Zoekveld {
    Onderwerp,
    Van,
    Aan,
    Inhoud,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Zoekopdracht {
    pub tekst: String,
    #[serde(default)]
    pub velden: Vec<Zoekveld>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lijstverzoek {
    pub map: String,
    #[serde(default)]
    pub start: u32,
    pub aantal: u32,
    #[serde(default)]
    pub zoek: Option<Zoekopdracht>,
    #[serde(default)]
    pub alleen_ongelezen: Option<bool>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpstellingBijlage {
    pub bestandsnaam: String,
    #[serde(default)]
    pub inhoudstype: String,
    /// Base64-gecodeerde inhoud.
    pub bytes: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Opstelling {
    pub van: String,
    #[serde(default)]
    pub aan: Vec<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    #[serde(default)]
    pub bcc: Vec<String>,
    #[serde(default)]
    pub onderwerp: String,
    #[serde(default)]
    pub tekst: String,
    #[serde(default)]
    pub html: Option<String>,
    #[serde(default)]
    pub in_reply_to: Option<String>,
    #[serde(default)]
    pub referenties: Option<String>,
    #[serde(default)]
    pub bijlagen: Vec<OpstellingBijlage>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct Configuratieopties {
    #[serde(default)]
    pub online: Option<bool>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Vlag {
    Gelezen,
    Gemarkeerd,
    Beantwoord,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verzonden {
    pub bericht_id: String,
}

/* ─── Kern: alles wat zonder Tauri testbaar is ─── */

/// Grenzen; de bijlagelimiet is in te stellen met de omgevingsvariabele
/// `OPENAEC_EMAIL_MAX_BIJLAGEN_MB`.
#[derive(Clone, Copy, Debug)]
pub struct Limieten {
    pub max_bericht: usize,
    pub max_bijlagen: usize,
}

impl Default for Limieten {
    fn default() -> Self {
        let mb = std::env::var("OPENAEC_EMAIL_MAX_BIJLAGEN_MB")
            .ok()
            .and_then(|v| v.trim().parse::<usize>().ok())
            .filter(|&m| (1..=500).contains(&m))
            .unwrap_or(25);
        Self {
            max_bericht: 50 * 1024 * 1024,
            max_bijlagen: mb * 1024 * 1024,
        }
    }
}

pub struct EmailKern {
    pub opslag: Arc<AccountOpslag>,
    pub kluis: Arc<dyn Kluis>,
    pub pool: imap::ImapPool,
    pub limieten: Limieten,
    pub oauth: oauth::OAuthHulp,
}

impl EmailKern {
    pub fn nieuw(opslag: AccountOpslag, kluis: Arc<dyn Kluis>) -> Self {
        let oauth = oauth::OAuthHulp::nieuw(opslag.map(), kluis.clone());
        Self {
            opslag: Arc::new(opslag),
            kluis,
            pool: imap::ImapPool::default(),
            limieten: Limieten::default(),
            oauth,
        }
    }

    async fn blokkerend<T: Send + 'static>(
        &self,
        f: impl FnOnce(Arc<dyn Kluis>) -> Uitkomst<T> + Send + 'static,
    ) -> Uitkomst<T> {
        // De sleutelhanger kan blokkeren (D-Bus, Keychain-dialoog).
        let kluis = self.kluis.clone();
        tokio::task::spawn_blocking(move || f(kluis))
            .await
            .map_err(|_| sleutelhanger_reageert_niet())?
    }

    async fn wachtwoord(&self, id: &str) -> Uitkomst<String> {
        let id = id.to_string();
        self.blokkerend(move |k| k.haal(&id))
            .await?
            .filter(|w| !w.is_empty())
            .ok_or_else(|| {
                MailFout::aanmelding("Er is geen wachtwoord opgeslagen voor dit account. Vul het wachtwoord in bij de accountinstellingen.")
                    .sleutel("auth.noStoredPassword")
            })
    }

    /// Wachtwoord of (bij OAuth2) een geldig toegangstoken voor deze server.
    async fn geheim(
        &self,
        account: &Account,
        server: &ServerInstelling,
        forceer: bool,
    ) -> Uitkomst<String> {
        if server.authenticatie != Authenticatie::Oauth2 {
            return self.wachtwoord(&account.id).await;
        }
        let provider = account.oauth.as_ref().map(|o| o.provider).ok_or_else(|| {
            MailFout::aanmelding(
                "Dit account gebruikt OAuth2: meld je eerst aan met Microsoft of Google.",
            )
            .sleutel("oauth.signInFirst")
        })?;
        self.oauth
            .toegangstoken(&account.id, provider, forceer)
            .await
    }

    pub async fn accounts(&self) -> Uitkomst<Vec<Account>> {
        let lijst = self.opslag.lijst(&NooitKluis)?;
        self.blokkerend(move |k| {
            Ok(lijst
                .into_iter()
                .map(|mut a| {
                    let gevuld = |s: &str| matches!(k.haal(s), Ok(Some(w)) if !w.is_empty());
                    a.wachtwoord_opgeslagen = gevuld(&a.id)
                        || (a.oauth.is_some() && gevuld(&oauth::vernieuw_sleutel(&a.id)));
                    a
                })
                .collect())
        })
        .await
    }

    pub async fn account(&self, id: &str) -> Uitkomst<Account> {
        self.opslag.haal(id, &NooitKluis)
    }

    pub async fn bewaar_account(&self, invoer: AccountInvoer) -> Uitkomst<Account> {
        let opslag_pad = self.opslag.clone();
        let account = self
            .blokkerend(move |k| opslag_pad.bewaar(invoer, k.as_ref()))
            .await?;
        self.pool.vergeet(&account.id).await;
        Ok(account)
    }

    pub async fn verwijder_account(&self, id: &str) -> Uitkomst<()> {
        let opslag_pad = self.opslag.clone();
        let id_kopie = id.to_string();
        self.blokkerend(move |k| opslag_pad.verwijder(&id_kopie, k.as_ref()))
            .await?;
        self.pool.vergeet(id).await;
        self.oauth.vergeet(id);
        Ok(())
    }

    async fn context(&self, account_id: &str) -> Uitkomst<imap::Context<'_>> {
        let account = self.account(account_id).await?;
        let wachtwoord = self.geheim(&account, &account.imap, false).await?;
        // Bij OAuth2: bij AUTHENTICATIONFAILED één keer vernieuwen en opnieuw.
        let vernieuw: Option<imap::Vernieuwer> = match (&account.oauth, account.imap.authenticatie)
        {
            (Some(k), Authenticatie::Oauth2) => {
                let hulp = self.oauth.clone();
                let id = account.id.clone();
                let provider = k.provider;
                Some(Arc::new(move || {
                    let hulp = hulp.clone();
                    let id = id.clone();
                    Box::pin(async move { hulp.toegangstoken(&id, provider, true).await })
                }))
            }
            _ => None,
        };
        Ok(imap::Context {
            pool: &self.pool,
            aanmelding: imap::Aanmelding {
                server: account.imap.clone(),
                wachtwoord,
                vernieuw,
            },
            account,
            limieten: self.limieten,
        })
    }

    async fn test_geheim(
        &self,
        id: Option<&str>,
        server: &ServerInstelling,
        invoer: &Option<String>,
    ) -> Uitkomst<String> {
        if server.authenticatie == Authenticatie::Oauth2 {
            let id = id.ok_or_else(|| {
                MailFout::aanmelding(
                    "Meld je eerst aan met Microsoft of Google om OAuth2 te testen.",
                )
                .sleutel("oauth.signInFirstToTest")
            })?;
            let account = self.account(id).await?;
            return self.geheim(&account, server, false).await;
        }
        match invoer.clone().filter(|w| !w.is_empty()) {
            Some(w) => Ok(w),
            None => match id {
                Some(id) => Ok(self.wachtwoord(id).await.unwrap_or_default()),
                None => Ok(String::new()),
            },
        }
    }

    pub async fn test(&self, invoer: AccountInvoer) -> Uitkomst<TestUitkomst> {
        let id = invoer.id.clone().filter(|i| !i.is_empty());
        let ingevuld = invoer.wachtwoord.clone();
        let account = invoer.naar_account(String::new());
        let mut geheimen = Vec::new();
        let imap = match self
            .test_geheim(id.as_deref(), &account.imap, &ingevuld)
            .await
        {
            Ok(g) => {
                geheimen.push(g.clone());
                imap::test(&account.imap, &g).await
            }
            Err(f) => Err(f),
        };
        let smtp = match self
            .test_geheim(id.as_deref(), &account.smtp, &ingevuld)
            .await
        {
            Ok(g) => {
                geheimen.push(g.clone());
                smtp::test(&account.smtp, &g).await
            }
            Err(f) => Err(f),
        };
        let deel = |r: Uitkomst<Deeluitkomst>| match r {
            Ok(d) => d,
            Err(mut f) => {
                for g in &geheimen {
                    f = f.zonder_geheim(g);
                }
                Deeluitkomst::from(f)
            }
        };
        Ok(TestUitkomst {
            imap: deel(imap),
            smtp: deel(smtp),
        })
    }

    pub async fn oauth_status(&self) -> oauth::OAuthStatussen {
        self.oauth.status().await
    }

    pub async fn bewaar_oauth_client(
        &self,
        provider: oauth::Provider,
        client_id: &str,
        geheim: Option<String>,
    ) -> Uitkomst<()> {
        self.oauth.bewaar_client(provider, client_id, geheim).await
    }

    pub fn annuleer_oauth(&self) {
        self.oauth.annuleer();
    }

    /// Browseraanmelding; bewaart daarna het account met het
    /// vernieuwingstoken in de sleutelhanger.
    pub async fn meld_aan_met_oauth(
        &self,
        provider: oauth::Provider,
        mut invoer: AccountInvoer,
    ) -> Uitkomst<Account> {
        let hint = Some(invoer.email.trim().to_string()).filter(|e| mime::is_adres(e));
        let (tokens, email) = self.oauth.meld_aan(provider, hint.as_deref()).await?;
        let aangemeld = email.or(hint).ok_or_else(|| {
            MailFout::aanmelding("Het e-mailadres van de aanmelding kon niet worden bepaald; vul het adres in en probeer opnieuw.")
                .sleutel("oauth.emailUnknown")
        })?;
        if invoer.email.trim().is_empty() {
            invoer.email = aangemeld.clone();
        }
        let (imap_std, smtp_std) = provider.servers();
        for (server, standaard) in [(&mut invoer.imap, imap_std), (&mut invoer.smtp, smtp_std)] {
            if server.host.trim().is_empty() {
                server.host = standaard.host;
                server.poort = standaard.poort;
                server.beveiliging = standaard.beveiliging;
            }
            server.authenticatie = Authenticatie::Oauth2;
            if server.gebruikersnaam.trim().is_empty() {
                server.gebruikersnaam = aangemeld.clone();
            }
        }
        invoer.wachtwoord = None;
        invoer.oauth = Some(oauth::OAuthKoppeling {
            provider,
            aangemeld_als: aangemeld,
        });
        let nieuw = invoer.id.as_deref().is_none_or(str::is_empty);
        let account = self.bewaar_account(invoer).await?;
        let vernieuwtoken = tokens.vernieuw.clone().unwrap_or_default();
        let sleutel = oauth::vernieuw_sleutel(&account.id);
        if let Err(f) = self
            .blokkerend(move |k| k.zet(&sleutel, &vernieuwtoken))
            .await
        {
            if nieuw {
                let _ = self.verwijder_account(&account.id).await;
            }
            return Err(f);
        }
        self.oauth.onthoud(&account.id, &tokens);
        Ok(Account {
            wachtwoord_opgeslagen: true,
            ..account
        })
    }

    pub async fn mappen(&self, id: &str) -> Uitkomst<Vec<Map>> {
        imap::mappen(&self.context(id).await?).await
    }
    pub async fn maak_map(&self, id: &str, pad: &str) -> Uitkomst<()> {
        imap::maak_map(&self.context(id).await?, pad).await
    }
    pub async fn hernoem_map(&self, id: &str, pad: &str, nieuw: &str) -> Uitkomst<()> {
        imap::hernoem_map(&self.context(id).await?, pad, nieuw).await
    }
    pub async fn verwijder_map(&self, id: &str, pad: &str) -> Uitkomst<()> {
        imap::verwijder_map(&self.context(id).await?, pad).await
    }
    pub async fn berichten(&self, id: &str, verzoek: Lijstverzoek) -> Uitkomst<BerichtLijst> {
        imap::berichten(&self.context(id).await?, &verzoek).await
    }
    pub async fn bericht(&self, id: &str, map: &str, uid: u32) -> Uitkomst<Bericht> {
        imap::bericht(&self.context(id).await?, map, uid).await
    }
    pub async fn bijlage(&self, id: &str, map: &str, uid: u32, index: u32) -> Uitkomst<Vec<u8>> {
        let bron = imap::bron(&self.context(id).await?, map, uid).await?;
        mime::bijlage_bytes(&bron, index)
    }
    pub async fn bron(&self, id: &str, map: &str, uid: u32) -> Uitkomst<Vec<u8>> {
        imap::bron(&self.context(id).await?, map, uid).await
    }
    pub async fn markeer(
        &self,
        id: &str,
        map: &str,
        uids: &[u32],
        vlag: Vlag,
        aan: bool,
    ) -> Uitkomst<()> {
        imap::markeer(&self.context(id).await?, map, uids, vlag, aan).await
    }
    pub async fn verplaats(&self, id: &str, map: &str, uids: &[u32], doel: &str) -> Uitkomst<()> {
        imap::verplaats(&self.context(id).await?, map, uids, doel).await
    }
    pub async fn verwijder(
        &self,
        id: &str,
        map: &str,
        uids: &[u32],
        definitief: bool,
    ) -> Uitkomst<()> {
        imap::verwijder(&self.context(id).await?, map, uids, definitief).await
    }
    pub async fn contacten(&self, id: &str, zoek: &str) -> Uitkomst<Vec<Adres>> {
        imap::contacten(&self.context(id).await?, zoek).await
    }

    pub async fn verstuur(&self, id: &str, opstelling: Opstelling) -> Uitkomst<Verzonden> {
        let ctx = self.context(id).await?;
        let opgesteld = smtp::stel_op(&ctx.account, &opstelling, ctx.limieten, false)?;
        let smtp_server = &ctx.account.smtp;
        let geheim = self.geheim(&ctx.account, smtp_server, false).await?;
        match smtp::verstuur(smtp_server, &geheim, &opgesteld).await {
            Err(f)
                if f.code == fout::Foutcode::Aanmelding
                    && smtp_server.authenticatie == Authenticatie::Oauth2 =>
            {
                // Token mogelijk ingetrokken of verlopen: één keer vernieuwen.
                let nieuw = self.geheim(&ctx.account, smtp_server, true).await?;
                smtp::verstuur(smtp_server, &nieuw, &opgesteld).await?;
            }
            r => r?,
        }
        if !smtp::server_bewaart_zelf(&ctx.account.smtp.host) {
            // De mail is al weg: een mislukte kopie mag het versturen niet
            // laten mislukken. Geen inhoud of adressen in het logboek.
            if let Err(f) = imap::bewaar_in(
                &ctx,
                Speciaal::Verzonden,
                &opgesteld.ruw_met_bcc,
                "(\\Seen)",
            )
            .await
            {
                eprintln!("[email] kopie naar Verzonden mislukt ({:?})", f.code);
            }
        }
        Ok(Verzonden {
            bericht_id: opgesteld.bericht_id,
        })
    }

    pub async fn bewaar_concept(&self, id: &str, opstelling: Opstelling) -> Uitkomst<()> {
        let ctx = self.context(id).await?;
        let opgesteld = smtp::stel_op(&ctx.account, &opstelling, ctx.limieten, true)?;
        imap::bewaar_in(
            &ctx,
            Speciaal::Concepten,
            &opgesteld.ruw_met_bcc,
            "(\\Seen \\Draft)",
        )
        .await
    }
}

/// Een blokkerende sleutelhangertaak liep vast of brak af.
pub fn sleutelhanger_reageert_niet() -> MailFout {
    MailFout::intern("De sleutelhanger reageerde niet.").sleutel("keychain.notResponding")
}

/// Voor het lezen van de accountlijst zonder sleutelhanger; de vlag
/// `wachtwoordOpgeslagen` wordt daarna apart (blokkerend) ingevuld.
struct NooitKluis;
impl Kluis for NooitKluis {
    fn zet(&self, _: &str, _: &str) -> Uitkomst<()> {
        Err(MailFout::intern("niet gebruikt"))
    }
    fn haal(&self, _: &str) -> Uitkomst<Option<String>> {
        Ok(None)
    }
    fn wis(&self, _: &str) -> Uitkomst<()> {
        Ok(())
    }
}

/* ─── Tauri-opdrachten ─── */

/// Beheerde toestand; de kern wordt bij de eerste aanroep gemaakt omdat de
/// app-datamap pas dan bekend is.
#[derive(Default)]
pub struct EmailStaat {
    kern: OnceLock<Arc<EmailKern>>,
}

fn kern(app: &tauri::AppHandle, staat: &EmailStaat) -> Uitkomst<Arc<EmailKern>> {
    if let Some(k) = staat.kern.get() {
        return Ok(k.clone());
    }
    let map = app
        .path()
        .app_data_dir()
        .map_err(|_| {
            MailFout::intern("De datamap van de app is niet gevonden.")
                .sleutel("storage.appDataDirNotFound")
        })?;
    Ok(staat
        .kern
        .get_or_init(|| {
            Arc::new(EmailKern::nieuw(
                AccountOpslag::nieuw(&map),
                Arc::new(accounts::OsKluis),
            ))
        })
        .clone())
}

type Staat<'a> = tauri::State<'a, EmailStaat>;

#[tauri::command]
pub async fn email_accounts(app: tauri::AppHandle, staat: Staat<'_>) -> Uitkomst<Vec<Account>> {
    kern(&app, &staat)?.accounts().await
}

#[tauri::command]
pub async fn email_bewaar_account(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account: AccountInvoer,
) -> Uitkomst<Account> {
    kern(&app, &staat)?.bewaar_account(account).await
}

#[tauri::command]
pub async fn email_verwijder_account(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    id: String,
) -> Uitkomst<()> {
    kern(&app, &staat)?.verwijder_account(&id).await
}

#[tauri::command]
pub async fn email_stel_configuratie_voor(
    email: String,
    opties: Option<Configuratieopties>,
) -> Uitkomst<Option<ConfiguratieVoorstel>> {
    let online = opties.and_then(|o| o.online).unwrap_or(false);
    Ok(autoconfig::stel_voor(&email, online).await)
}

#[tauri::command]
pub async fn email_zoek_servers(
    app: tauri::AppHandle,
    email: String,
    opties: Option<zoeken::ZoekOpties>,
) -> Uitkomst<Vec<ConfiguratieVoorstel>> {
    use tauri::Emitter;
    let zoeker = zoeken::Zoeker {
        voortgang: Some(Arc::new(move |stap: &str, status: &str| {
            let _ = app.emit(
                "email-zoek-voortgang",
                serde_json::json!({ "stap": stap, "status": status }),
            );
        })),
        ..Default::default()
    };
    Ok(zoeker.zoek(&email, &opties.unwrap_or_default()).await)
}

#[tauri::command]
pub async fn email_test(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account: AccountInvoer,
) -> Uitkomst<TestUitkomst> {
    kern(&app, &staat)?.test(account).await
}

#[tauri::command]
pub async fn email_mappen(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
) -> Uitkomst<Vec<Map>> {
    kern(&app, &staat)?.mappen(&account_id).await
}

#[tauri::command]
pub async fn email_maak_map(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    pad: String,
) -> Uitkomst<()> {
    kern(&app, &staat)?.maak_map(&account_id, &pad).await
}

#[tauri::command]
pub async fn email_hernoem_map(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    pad: String,
    nieuw_pad: String,
) -> Uitkomst<()> {
    kern(&app, &staat)?
        .hernoem_map(&account_id, &pad, &nieuw_pad)
        .await
}

#[tauri::command]
pub async fn email_verwijder_map(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    pad: String,
) -> Uitkomst<()> {
    kern(&app, &staat)?.verwijder_map(&account_id, &pad).await
}

#[tauri::command]
pub async fn email_berichten(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    verzoek: Lijstverzoek,
) -> Uitkomst<BerichtLijst> {
    kern(&app, &staat)?.berichten(&account_id, verzoek).await
}

#[tauri::command]
pub async fn email_bericht(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    map: String,
    uid: u32,
) -> Uitkomst<Bericht> {
    kern(&app, &staat)?.bericht(&account_id, &map, uid).await
}

#[tauri::command]
pub async fn email_bijlage(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    map: String,
    uid: u32,
    index: u32,
) -> Uitkomst<tauri::ipc::Response> {
    let bytes = kern(&app, &staat)?
        .bijlage(&account_id, &map, uid, index)
        .await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn email_bron(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    map: String,
    uid: u32,
) -> Uitkomst<tauri::ipc::Response> {
    let bytes = kern(&app, &staat)?.bron(&account_id, &map, uid).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn email_markeer(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    map: String,
    uids: Vec<u32>,
    vlag: Vlag,
    aan: bool,
) -> Uitkomst<()> {
    kern(&app, &staat)?
        .markeer(&account_id, &map, &uids, vlag, aan)
        .await
}

#[tauri::command]
pub async fn email_verplaats(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    map: String,
    uids: Vec<u32>,
    doel: String,
) -> Uitkomst<()> {
    kern(&app, &staat)?
        .verplaats(&account_id, &map, &uids, &doel)
        .await
}

#[tauri::command]
pub async fn email_verwijder(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    map: String,
    uids: Vec<u32>,
    definitief: bool,
) -> Uitkomst<()> {
    kern(&app, &staat)?
        .verwijder(&account_id, &map, &uids, definitief)
        .await
}

#[tauri::command]
pub async fn email_verstuur(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    opstelling: Opstelling,
) -> Uitkomst<Verzonden> {
    kern(&app, &staat)?.verstuur(&account_id, opstelling).await
}

#[tauri::command]
pub async fn email_bewaar_concept(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    opstelling: Opstelling,
) -> Uitkomst<()> {
    kern(&app, &staat)?
        .bewaar_concept(&account_id, opstelling)
        .await
}

#[tauri::command]
pub async fn email_contacten(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    account_id: String,
    zoek: String,
) -> Uitkomst<Vec<Adres>> {
    kern(&app, &staat)?.contacten(&account_id, &zoek).await
}

#[tauri::command]
pub async fn email_oauth_status(
    app: tauri::AppHandle,
    staat: Staat<'_>,
) -> Uitkomst<oauth::OAuthStatussen> {
    Ok(kern(&app, &staat)?.oauth_status().await)
}

#[tauri::command]
pub async fn email_meld_aan_met_oauth(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    provider: oauth::Provider,
    account: AccountInvoer,
) -> Uitkomst<Account> {
    kern(&app, &staat)?
        .meld_aan_met_oauth(provider, account)
        .await
}

#[tauri::command]
pub async fn email_annuleer_oauth(app: tauri::AppHandle, staat: Staat<'_>) -> Uitkomst<()> {
    kern(&app, &staat)?.annuleer_oauth();
    Ok(())
}

#[tauri::command]
pub async fn email_bewaar_oauth_client(
    app: tauri::AppHandle,
    staat: Staat<'_>,
    provider: oauth::Provider,
    client_id: String,
    client_secret: Option<String>,
) -> Uitkomst<()> {
    kern(&app, &staat)?
        .bewaar_oauth_client(provider, &client_id, client_secret)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contractvelden_in_camelcase() {
        let kop = BerichtKop {
            uid: 1,
            map: "INBOX".into(),
            bericht_id: Some("<a@b>".into()),
            in_reply_to: Some("<c@d>".into()),
            heeft_bijlagen: true,
            ..Default::default()
        };
        let b = Bericht {
            kop,
            bcc: vec![],
            antwoord_aan: vec![],
            tekst: String::new(),
            html: String::new(),
            bijlagen: vec![BijlageInfo {
                index: 0,
                bestandsnaam: "a.pdf".into(),
                inhoudstype: "application/pdf".into(),
                grootte: 3,
                content_id: None,
                inline: false,
            }],
        };
        let v = serde_json::to_value(&b).unwrap();
        for veld in [
            "uid",
            "map",
            "berichtId",
            "inReplyTo",
            "heeftBijlagen",
            "antwoordAan",
            "bijlagen",
            "bcc",
        ] {
            assert!(v.get(veld).is_some(), "{veld} ontbreekt");
        }
        assert!(
            v.get("datum").is_none(),
            "afwezige optionele velden weglaten"
        );
        assert!(v["bijlagen"][0].get("contentId").is_none());
        let m = serde_json::to_value(Map {
            pad: "INBOX".into(),
            naam: "Inbox".into(),
            scheiding: "/".into(),
            speciaal: Some(Speciaal::Prullenbak),
            selecteerbaar: true,
            totaal: Some(2),
            ongelezen: None,
        })
        .unwrap();
        assert_eq!(m["speciaal"], "prullenbak");
        let verzoek: Lijstverzoek = serde_json::from_value(serde_json::json!({
            "map": "INBOX", "start": 0, "aantal": 50,
            "zoek": {"tekst": "offerte", "velden": ["onderwerp", "van"]}, "alleenOngelezen": true
        }))
        .unwrap();
        assert_eq!(
            verzoek.zoek.unwrap().velden,
            vec![Zoekveld::Onderwerp, Zoekveld::Van]
        );
        let invoer: AccountInvoer = serde_json::from_value(serde_json::json!({
            "naam": "Werk", "volledigeNaam": "Jan", "email": "jan@example.org",
            "imap": {"host": "imap.example.org", "poort": 993, "beveiliging": "ssl", "authenticatie": "normaal", "gebruikersnaam": "jan"},
            "smtp": {"host": "smtp.example.org", "poort": 587, "beveiliging": "starttls", "authenticatie": "normaal", "gebruikersnaam": "jan"},
            "mappen": {"verzonden": "Sent"}, "controleerElke": 5, "externeInhoud": false, "wachtwoord": "x1y2z3"
        }))
        .unwrap();
        assert!(!format!("{invoer:?}").contains("x1y2z3"));
        let a = invoer.naar_account("id".into());
        let v = serde_json::to_value(&a).unwrap();
        assert_eq!(v["mappen"]["verzonden"], "Sent");
        assert_eq!(v["controleerElke"], 5);
        assert_eq!(v["wachtwoordOpgeslagen"], false);
        assert!(v.get("wachtwoord").is_none());
    }
}
