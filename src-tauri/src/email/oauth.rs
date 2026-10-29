//! OAuth2-aanmelden voor Microsoft (Outlook.com/Microsoft 365) en Google
//! (Gmail) volgens RFC 8252: systeembrowser, PKCE (S256), `state`, en een
//! tijdelijke terugkoppeling op een loopbackpoort. Het vernieuwingstoken staat
//! in de sleutelhanger (gebruiker `<account-id>:oauth`), het toegangstoken
//! alleen in het geheugen. Tokens komen nooit in meldingen of logboeken.
//!
//! Client-ID's worden niet in de code vastgelegd; zie `docs/email-oauth.md`.

use super::accounts::Kluis;
use super::fout::{MailFout, Uitkomst};
use super::{Authenticatie, Beveiliging, ServerInstelling};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const AANMELD_LIMIET: Duration = Duration::from_secs(5 * 60);
const TOKEN_LIMIET: Duration = Duration::from_secs(30);
/// Zoveel eerder dan het verloopmoment wordt al vernieuwd.
const VERNIEUW_MARGE: Duration = Duration::from_secs(120);
pub const CLIENTBESTAND: &str = "email-oauth.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Microsoft,
    Google,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthKoppeling {
    pub provider: Provider,
    pub aangemeld_als: String,
}

/// `sleutel` en `waarden` maken `melding` vertaalbaar (zie `fout.rs`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct OAuthStatus {
    pub beschikbaar: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub melding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sleutel: Option<&'static str>,
    #[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub waarden: super::fout::Waarden,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct OAuthStatussen {
    pub microsoft: OAuthStatus,
    pub google: OAuthStatus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Eindpunten {
    pub autoriseer: String,
    pub token: String,
}

impl Provider {
    pub fn naam(self) -> &'static str {
        match self {
            Provider::Microsoft => "Microsoft",
            Provider::Google => "Google",
        }
    }

    fn sleutel(self) -> &'static str {
        match self {
            Provider::Microsoft => "microsoft",
            Provider::Google => "google",
        }
    }

    pub fn eindpunten(self) -> Eindpunten {
        match self {
            Provider::Microsoft => Eindpunten {
                autoriseer: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize".into(),
                token: "https://login.microsoftonline.com/common/oauth2/v2.0/token".into(),
            },
            Provider::Google => Eindpunten {
                autoriseer: "https://accounts.google.com/o/oauth2/v2/auth".into(),
                token: "https://oauth2.googleapis.com/token".into(),
            },
        }
    }

    pub fn scope(self) -> &'static str {
        match self {
            Provider::Microsoft => {
                "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access openid email"
            }
            Provider::Google => "https://mail.google.com/ openid email",
        }
    }

    /// Standaardservers (IMAP, SMTP).
    pub fn servers(self) -> (ServerInstelling, ServerInstelling) {
        let s = |host: &str, poort, beveiliging| ServerInstelling {
            host: host.into(),
            poort,
            beveiliging,
            authenticatie: Authenticatie::Oauth2,
            gebruikersnaam: String::new(),
        };
        match self {
            Provider::Microsoft => (
                s("outlook.office365.com", 993, Beveiliging::Ssl),
                s("smtp.office365.com", 587, Beveiliging::Starttls),
            ),
            Provider::Google => (
                s("imap.gmail.com", 993, Beveiliging::Ssl),
                s("smtp.gmail.com", 465, Beveiliging::Ssl),
            ),
        }
    }

    /// Host in de redirect-URI. Microsoft Entra accepteert `http://localhost`
    /// met willekeurige poort; Google raadt het loopback-IP aan. De luisteraar
    /// bindt op 127.0.0.1 én ::1, zodat "localhost" altijd aankomt.
    fn redirect_host(self) -> &'static str {
        match self {
            Provider::Microsoft => "localhost",
            Provider::Google => "127.0.0.1",
        }
    }

    fn omgevingsnamen(self) -> (&'static str, &'static str) {
        match self {
            Provider::Microsoft => (
                "OPENAEC_OAUTH_MICROSOFT_CLIENT_ID",
                "OPENAEC_OAUTH_MICROSOFT_CLIENT_SECRET",
            ),
            Provider::Google => (
                "OPENAEC_OAUTH_GOOGLE_CLIENT_ID",
                "OPENAEC_OAUTH_GOOGLE_CLIENT_SECRET",
            ),
        }
    }

    fn bouwtijd(self) -> (Option<&'static str>, Option<&'static str>) {
        match self {
            Provider::Microsoft => (option_env!("OPENAEC_OAUTH_MICROSOFT_CLIENT_ID"), None),
            Provider::Google => (
                option_env!("OPENAEC_OAUTH_GOOGLE_CLIENT_ID"),
                option_env!("OPENAEC_OAUTH_GOOGLE_CLIENT_SECRET"),
            ),
        }
    }
}

#[derive(Clone)]
pub struct Client {
    pub id: String,
    /// Bij Google-"Desktop app"-clients: niet geheim volgens Google, wel nodig.
    pub geheim: Option<String>,
}

/* ─── Bouwstenen (los testbaar) ─── */

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn willekeurig(aantal: usize) -> Uitkomst<String> {
    use ring::rand::SecureRandom;
    let mut buf = vec![0u8; aantal];
    ring::rand::SystemRandom::new()
        .fill(&mut buf)
        .map_err(|_| {
            MailFout::intern("Geen veilige willekeur beschikbaar.").sleutel("oauth.randomUnavailable")
        })?;
    Ok(b64url(&buf))
}

/// PKCE-uitdaging (RFC 7636, S256).
pub fn pkce_uitdaging(verifier: &str) -> String {
    b64url(ring::digest::digest(&ring::digest::SHA256, verifier.as_bytes()).as_ref())
}

pub fn codeer(t: &str) -> String {
    const SET: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
        .remove(b'-')
        .remove(b'.')
        .remove(b'_')
        .remove(b'~');
    percent_encoding::utf8_percent_encode(t, SET).to_string()
}

fn formulier(velden: &[(&str, &str)]) -> String {
    velden
        .iter()
        .map(|(k, v)| format!("{}={}", codeer(k), codeer(v)))
        .collect::<Vec<_>>()
        .join("&")
}

pub fn autorisatie_url(
    provider: Provider,
    eindpunten: &Eindpunten,
    client_id: &str,
    redirect: &str,
    state: &str,
    uitdaging: &str,
    login_hint: Option<&str>,
) -> String {
    let mut velden = vec![
        ("client_id", client_id),
        ("response_type", "code"),
        ("redirect_uri", redirect),
        ("scope", provider.scope()),
        ("state", state),
        ("code_challenge", uitdaging),
        ("code_challenge_method", "S256"),
    ];
    match provider {
        Provider::Google => {
            velden.push(("access_type", "offline"));
            velden.push(("prompt", "consent"));
        }
        Provider::Microsoft => velden.push(("prompt", "select_account")),
    }
    if let Some(h) = login_hint.filter(|h| !h.is_empty()) {
        velden.push(("login_hint", h));
    }
    format!("{}?{}", eindpunten.autoriseer, formulier(&velden))
}

fn decodeer_query(waarde: &str) -> String {
    percent_encoding::percent_decode_str(&waarde.replace('+', " "))
        .decode_utf8_lossy()
        .into_owned()
}

pub fn query_velden(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|d| d.split_once('=').or(Some((d, ""))))
        .filter(|(k, _)| !k.is_empty())
        .map(|(k, v)| (decodeer_query(k), decodeer_query(v)))
        .collect()
}

/// Uitkomst van één terugkoppelverzoek.
#[derive(Debug, PartialEq, Eq)]
pub enum Terugkoppeling {
    /// Geen terugkoppeling (bijv. /favicon.ico): negeren.
    Overig,
    Code(String),
    Fout(MailFout),
}

/// Controleert de verzoekregel ("GET /?code=…&state=… HTTP/1.1").
pub fn verwerk_terugkoppeling(regel: &str, state: &str, provider: Provider) -> Terugkoppeling {
    let mut delen = regel.split_whitespace();
    let (Some("GET"), Some(doel)) = (delen.next(), delen.next()) else {
        return Terugkoppeling::Overig;
    };
    let (pad, query) = doel.split_once('?').unwrap_or((doel, ""));
    if pad != "/" {
        return Terugkoppeling::Overig;
    }
    let v = query_velden(query);
    if v.get("state").map(String::as_str) != Some(state) {
        if v.contains_key("code") || v.contains_key("error") {
            return Terugkoppeling::Fout(MailFout::geweigerd(
                "De terugkoppeling van de aanmeldpagina hoort niet bij deze aanmelding (state klopt niet).",
            )
            .sleutel("oauth.stateMismatch"));
        }
        return Terugkoppeling::Overig;
    }
    if let Some(fout) = v.get("error") {
        let f = if fout == "access_denied" {
            MailFout::aanmelding(format!(
                "Aanmelden bij {} is geannuleerd of geweigerd.",
                provider.naam()
            ))
            .sleutel("oauth.cancelledOrDenied")
        } else {
            let detail = super::fout::servertekst(fout);
            MailFout::aanmelding(format!(
                "{} weigerde de aanmelding ({detail}).",
                provider.naam()
            ))
            .sleutel("oauth.providerRefused")
            .waarde("detail", detail)
        };
        return Terugkoppeling::Fout(f.waarde("provider", provider.naam()));
    }
    match v.get("code").filter(|c| !c.is_empty()) {
        Some(c) => Terugkoppeling::Code(c.clone()),
        None => Terugkoppeling::Overig,
    }
}

#[derive(Clone)]
pub struct Tokens {
    pub toegang: String,
    pub vernieuw: Option<String>,
    pub verloopt: Instant,
    pub id_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenJson {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<serde_json::Value>,
    id_token: Option<String>,
    error: Option<String>,
}

pub fn opnieuw_aanmelden(provider: Provider) -> MailFout {
    MailFout::aanmelding(format!(
        "Opnieuw aanmelden bij {}: de toestemming is verlopen of ingetrokken.",
        provider.naam()
    ))
    .sleutel("oauth.reauthenticate")
    .waarde("provider", provider.naam())
}

/// Ontleedt het antwoord van het tokeneindpunt; nooit tokens in fouten.
pub fn ontleed_tokenantwoord(status: u16, lichaam: &[u8], provider: Provider) -> Uitkomst<Tokens> {
    let json: TokenJson = serde_json::from_slice(lichaam).map_err(|_| {
        MailFout::verbinding(format!(
            "{} gaf een onverwacht antwoord (HTTP {status}).",
            provider.naam()
        ))
        .sleutel("oauth.unexpectedResponse")
        .waarde("provider", provider.naam())
        .waarde("status", status)
    })?;
    if let Some(fout) = json.error {
        return Err(match fout.as_str() {
            "invalid_grant" | "interaction_required" | "consent_required" => {
                opnieuw_aanmelden(provider)
            }
            "invalid_client" | "unauthorized_client" => MailFout::niet_beschikbaar(format!(
                "De OAuth-client voor {} is niet juist ingesteld (client-ID of -geheim).",
                provider.naam()
            ))
            .sleutel("oauth.clientMisconfigured")
            .waarde("provider", provider.naam()),
            andere => {
                let detail = super::fout::servertekst(andere);
                MailFout::aanmelding(format!("{} weigerde het token ({detail}).", provider.naam()))
                    .sleutel("oauth.tokenRefused")
                    .waarde("provider", provider.naam())
                    .waarde("detail", detail)
            }
        });
    }
    let toegang = json
        .access_token
        .filter(|t| !t.is_empty() && status == 200)
        .ok_or_else(|| {
            MailFout::verbinding(format!(
                "{} gaf geen toegangstoken (HTTP {status}).",
                provider.naam()
            ))
            .sleutel("oauth.noAccessToken")
            .waarde("provider", provider.naam())
            .waarde("status", status)
        })?;
    let seconden = match json.expires_in {
        Some(serde_json::Value::Number(n)) => n.as_u64().unwrap_or(3600),
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(3600),
        _ => 3600,
    };
    Ok(Tokens {
        toegang,
        vernieuw: json.refresh_token.filter(|t| !t.is_empty()),
        verloopt: Instant::now() + Duration::from_secs(seconden.clamp(60, 24 * 3600)),
        id_token: json.id_token,
    })
}

/// E-mailadres uit het id_token, zonder handtekeningcontrole: alleen voor
/// weergave en als voorstel voor het adres, nooit als beveiligingsbeslissing.
/// De server bepaalt bij XOAUTH2 zelf of token en mailbox bij elkaar horen.
pub fn email_uit_id_token(id_token: &str) -> Option<String> {
    let deel = id_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(deel.trim_end_matches('='))
        .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    ["email", "preferred_username", "upn"]
        .iter()
        .find_map(|k| v.get(*k).and_then(|x| x.as_str()))
        .map(|s| s.trim().to_string())
        .filter(|s| super::mime::is_adres(s))
}

/// SASL XOAUTH2 (zoals Y-app mail.rs `XOAuth2`).
pub fn xoauth2(gebruiker: &str, token: &str) -> String {
    format!("user={gebruiker}\x01auth=Bearer {token}\x01\x01")
}

/// Splitst `http(s)://host[:poort]/pad`; HTTP alleen naar loopback.
pub fn ontleed_url(url: &str) -> Uitkomst<(bool, String, u16, String)> {
    let fout =
        || MailFout::intern("Ongeldig tokeneindpunt.").sleutel("oauth.invalidTokenEndpoint");
    let (tls, rest) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = url.strip_prefix("http://") {
        (false, r)
    } else {
        return Err(fout());
    };
    let (hostdeel, pad) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let (host, poort) = match hostdeel.rsplit_once(':') {
        Some((h, p)) if !h.ends_with(':') => (h, p.parse().map_err(|_| fout())?),
        _ => (hostdeel, if tls { 443 } else { 80 }),
    };
    if !tls && !super::accounts::is_localhost(host) {
        return Err(fout());
    }
    Ok((tls, host.to_string(), poort, pad.to_string()))
}

async fn tokenverzoek(
    provider: Provider,
    eindpunt: &str,
    velden: &[(&str, &str)],
) -> Uitkomst<Tokens> {
    let (tls, host, poort, pad) = ontleed_url(eindpunt)?;
    let lichaam = formulier(velden);
    let (status, _, antwoord) = tokio::time::timeout(
        TOKEN_LIMIET,
        super::autoconfig::http_verzoek(
            &host,
            poort,
            tls,
            "POST",
            &pad,
            "application/json",
            Some(&lichaam),
        ),
    )
    .await
    .map_err(|_| {
        MailFout::tijdslimiet(format!("{} reageerde niet op tijd.", provider.naam()))
            .sleutel("oauth.timeout")
            .waarde("provider", provider.naam())
    })??;
    ontleed_tokenantwoord(status, &antwoord, provider)
}

pub async fn wissel_code(
    provider: Provider,
    eindpunten: &Eindpunten,
    client: &Client,
    code: &str,
    verifier: &str,
    redirect: &str,
) -> Uitkomst<Tokens> {
    let mut velden = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect),
        ("client_id", client.id.as_str()),
        ("code_verifier", verifier),
        ("scope", provider.scope()),
    ];
    if let Some(g) = client.geheim.as_deref() {
        velden.push(("client_secret", g));
    }
    tokenverzoek(provider, &eindpunten.token, &velden).await
}

pub async fn vernieuw(
    provider: Provider,
    eindpunten: &Eindpunten,
    client: &Client,
    vernieuwtoken: &str,
) -> Uitkomst<Tokens> {
    let mut velden = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", vernieuwtoken),
        ("client_id", client.id.as_str()),
        ("scope", provider.scope()),
    ];
    if let Some(g) = client.geheim.as_deref() {
        velden.push(("client_secret", g));
    }
    tokenverzoek(provider, &eindpunten.token, &velden).await
}

const PAGINA_OK: &str = "<!doctype html><html lang=\"nl\"><head><meta charset=\"utf-8\"><title>Aangemeld</title>\
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}</style></head>\
<body><h1>Aangemeld</h1><p>OpenAEC Email Studio heeft de toestemming ontvangen. Je kunt dit venster sluiten.</p></body></html>";
const PAGINA_FOUT: &str = "<!doctype html><html lang=\"nl\"><head><meta charset=\"utf-8\"><title>Niet aangemeld</title>\
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}</style></head>\
<body><h1>Niet aangemeld</h1><p>De aanmelding is niet gelukt of geannuleerd. Je kunt dit venster sluiten en het opnieuw proberen in OpenAEC Email Studio.</p></body></html>";

/// Luistert op 127.0.0.1 (en ::1 op dezelfde poort) tot er een geldige
/// terugkoppeling is, de tijd om is of er geannuleerd wordt.
pub struct Luisteraar {
    v4: TcpListener,
    v6: Option<TcpListener>,
    pub poort: u16,
}

impl Luisteraar {
    pub async fn nieuw() -> Uitkomst<Self> {
        let v4 = TcpListener::bind("127.0.0.1:0").await.map_err(|_| {
            MailFout::intern("Geen tijdelijke poort beschikbaar voor de aanmelding.")
                .sleutel("oauth.noFreePort")
        })?;
        let poort = v4
            .local_addr()
            .map_err(|_| MailFout::intern("Geen poort.").sleutel("oauth.noPort"))?
            .port();
        let v6 = TcpListener::bind(("::1", poort)).await.ok();
        Ok(Self { v4, v6, poort })
    }

    pub fn redirect(&self, provider: Provider) -> String {
        format!("http://{}:{}/", provider.redirect_host(), self.poort)
    }

    async fn accepteer(&self) -> std::io::Result<tokio::net::TcpStream> {
        match &self.v6 {
            Some(v6) => tokio::select! {
                r = self.v4.accept() => r.map(|(s, _)| s),
                r = v6.accept() => r.map(|(s, _)| s),
            },
            None => self.v4.accept().await.map(|(s, _)| s),
        }
    }

    pub async fn wacht(&self, state: &str, provider: Provider) -> Uitkomst<String> {
        loop {
            let Ok(mut s) = self.accepteer().await else {
                continue;
            };
            // Alleen de verzoekkop lezen (max. 16 KB, 10 s).
            let mut kop = Vec::new();
            let mut buf = [0u8; 2048];
            let gelezen = tokio::time::timeout(Duration::from_secs(10), async {
                while !kop.windows(4).any(|w| w == b"\r\n\r\n") && kop.len() < 16 * 1024 {
                    match s.read(&mut buf).await {
                        Ok(0) | Err(_) => break,
                        Ok(n) => kop.extend_from_slice(&buf[..n]),
                    }
                }
            })
            .await;
            if gelezen.is_err() {
                continue;
            }
            let tekst = String::from_utf8_lossy(&kop);
            let regel = tekst.lines().next().unwrap_or("");
            let uitkomst = verwerk_terugkoppeling(regel, state, provider);
            let (status, pagina) = match &uitkomst {
                Terugkoppeling::Overig => ("404 Not Found", "Niet gevonden"),
                Terugkoppeling::Code(_) => ("200 OK", PAGINA_OK),
                Terugkoppeling::Fout(_) => ("200 OK", PAGINA_FOUT),
            };
            let antwoord = format!(
                "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{pagina}",
                pagina.len()
            );
            let _ = s.write_all(antwoord.as_bytes()).await;
            let _ = s.shutdown().await;
            match uitkomst {
                Terugkoppeling::Overig => continue,
                Terugkoppeling::Code(c) => return Ok(c),
                Terugkoppeling::Fout(f) => return Err(f),
            }
        }
    }
}

/* ─── Hulp: clientinstellingen, tokencache, annuleren ─── */

pub type Opener = Arc<dyn Fn(&str) -> Result<(), String> + Send + Sync>;

#[derive(Clone)]
pub struct OAuthHulp {
    pub map: PathBuf,
    pub kluis: Arc<dyn Kluis>,
    cache: Arc<Mutex<HashMap<String, (String, Instant)>>>,
    pub eindpunten: Arc<Mutex<HashMap<Provider, Eindpunten>>>,
    annuleer: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    pub opener: Opener,
    /// Alleen tests: omgevingsvariabelen en bouwtijdwaarden negeren.
    pub alleen_app_instelling: bool,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientBestand {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    microsoft: Option<ClientInstelling>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    google: Option<ClientInstelling>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientInstelling {
    client_id: String,
}

fn geheim_sleutel(p: Provider) -> String {
    format!("oauth-client:{}", p.sleutel())
}

pub fn vernieuw_sleutel(account_id: &str) -> String {
    format!("{account_id}:oauth")
}

async fn blokkerend<T: Send + 'static>(
    f: impl FnOnce() -> Uitkomst<T> + Send + 'static,
) -> Uitkomst<T> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|_| super::sleutelhanger_reageert_niet())?
}

impl OAuthHulp {
    pub fn nieuw(map: PathBuf, kluis: Arc<dyn Kluis>) -> Self {
        Self {
            map,
            kluis,
            cache: Arc::default(),
            eindpunten: Arc::default(),
            annuleer: Arc::default(),
            opener: Arc::new(|url: &str| open::that_detached(url).map_err(|e| e.to_string())),
            alleen_app_instelling: false,
        }
    }

    fn eindpunten_van(&self, p: Provider) -> Eindpunten {
        self.eindpunten
            .lock()
            .unwrap()
            .get(&p)
            .cloned()
            .unwrap_or_else(|| p.eindpunten())
    }

    fn lees_bestand(&self) -> ClientBestand {
        std::fs::read(self.map.join(CLIENTBESTAND))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    /// Client in volgorde: app-instelling, bouwtijd, omgevingsvariabele.
    pub async fn client(&self, p: Provider) -> Option<Client> {
        let bestand = self.lees_bestand();
        let eigen = match p {
            Provider::Microsoft => bestand.microsoft,
            Provider::Google => bestand.google,
        };
        if let Some(c) = eigen.filter(|c| !c.client_id.trim().is_empty()) {
            let kluis = self.kluis.clone();
            let geheim = blokkerend(move || kluis.haal(&geheim_sleutel(p)))
                .await
                .ok()
                .flatten()
                .filter(|g| !g.is_empty());
            return Some(Client {
                id: c.client_id.trim().to_string(),
                geheim,
            });
        }
        if self.alleen_app_instelling {
            return None;
        }
        let (id, geheim) = p.bouwtijd();
        if let Some(id) = id.filter(|i| !i.trim().is_empty()) {
            return Some(Client {
                id: id.trim().to_string(),
                geheim: geheim.filter(|g| !g.is_empty()).map(str::to_string),
            });
        }
        let (id_naam, geheim_naam) = p.omgevingsnamen();
        let id = std::env::var(id_naam)
            .ok()
            .filter(|i| !i.trim().is_empty())?;
        Some(Client {
            id: id.trim().to_string(),
            geheim: std::env::var(geheim_naam).ok().filter(|g| !g.is_empty()),
        })
    }

    pub async fn status(&self) -> OAuthStatussen {
        let mut uit = Vec::new();
        for p in [Provider::Microsoft, Provider::Google] {
            uit.push(match self.client(p).await {
                Some(_) => OAuthStatus {
                    beschikbaar: true,
                    melding: None,
                    sleutel: None,
                    waarden: Default::default(),
                },
                None => OAuthStatus {
                    beschikbaar: false,
                    melding: Some(uitleg(p)),
                    sleutel: Some(uitleg_sleutel(p)),
                    waarden: Default::default(),
                },
            });
        }
        let google = uit.pop().unwrap();
        let microsoft = uit.pop().unwrap();
        OAuthStatussen { microsoft, google }
    }

    pub async fn bewaar_client(
        &self,
        p: Provider,
        client_id: &str,
        geheim: Option<String>,
    ) -> Uitkomst<()> {
        let id = client_id.trim();
        if id.len() > 300 || id.contains(|c: char| c.is_whitespace() || c.is_control()) {
            return Err(
                MailFout::geweigerd("Dit is geen geldig client-ID.").sleutel("oauth.invalidClientId")
            );
        }
        let mut bestand = self.lees_bestand();
        let instelling = (!id.is_empty()).then(|| ClientInstelling {
            client_id: id.to_string(),
        });
        match p {
            Provider::Microsoft => bestand.microsoft = instelling,
            Provider::Google => bestand.google = instelling,
        }
        let kluis = self.kluis.clone();
        let geheim = geheim
            .map(|g| g.trim().to_string())
            .filter(|g| !g.is_empty() && !id.is_empty());
        blokkerend(move || match geheim {
            Some(g) => kluis.zet(&geheim_sleutel(p), &g),
            None => kluis.wis(&geheim_sleutel(p)),
        })
        .await?;
        std::fs::create_dir_all(&self.map)
            .map_err(|_| super::accounts::datamap_niet_aangemaakt())?;
        let json = serde_json::to_vec_pretty(&bestand)
            .map_err(|_| MailFout::intern("Opslaan mislukt.").sleutel("common.saveFailed"))?;
        let niet_opgeslagen = || {
            MailFout::intern("De OAuth-instelling kon niet worden opgeslagen.")
                .sleutel("oauth.settingSaveFailed")
        };
        let fout = |_| niet_opgeslagen();
        let mut t = tempfile::NamedTempFile::new_in(&self.map).map_err(fout)?;
        t.write_all(&json).map_err(fout)?;
        t.persist(self.map.join(CLIENTBESTAND))
            .map_err(|_| niet_opgeslagen())?;
        Ok(())
    }

    pub fn annuleer(&self) {
        if let Some(z) = self.annuleer.lock().unwrap().take() {
            let _ = z.send(());
        }
    }

    pub fn vergeet(&self, account_id: &str) {
        self.cache.lock().unwrap().remove(account_id);
    }

    #[cfg(test)]
    pub fn laat_verlopen(&self, account_id: &str) {
        if let Some(t) = self.cache.lock().unwrap().get_mut(account_id) {
            t.1 = Instant::now();
        }
    }

    pub fn onthoud(&self, account_id: &str, t: &Tokens) {
        self.cache
            .lock()
            .unwrap()
            .insert(account_id.to_string(), (t.toegang.clone(), t.verloopt));
    }

    /// Geldig toegangstoken; vernieuwt vóór verloop of als `forceer`.
    pub async fn toegangstoken(
        &self,
        account_id: &str,
        p: Provider,
        forceer: bool,
    ) -> Uitkomst<String> {
        if !forceer {
            if let Some((t, verloopt)) = self.cache.lock().unwrap().get(account_id) {
                if *verloopt > Instant::now() + VERNIEUW_MARGE {
                    return Ok(t.clone());
                }
            }
        }
        let kluis = self.kluis.clone();
        let sleutel = vernieuw_sleutel(account_id);
        let oud = blokkerend(move || kluis.haal(&sleutel))
            .await?
            .filter(|t| !t.is_empty())
            .ok_or_else(|| {
                MailFout::aanmelding(format!(
                    "Opnieuw aanmelden bij {}: er is geen aanmelding opgeslagen voor dit account.",
                    p.naam()
                ))
                .sleutel("oauth.noStoredSignIn")
                .waarde("provider", p.naam())
            })?;
        let client = self.client(p).await.ok_or_else(|| niet_ingesteld(p))?;
        let tokens = vernieuw(p, &self.eindpunten_van(p), &client, &oud).await?;
        if let Some(nieuw) = tokens.vernieuw.clone().filter(|n| *n != oud) {
            // Sommige providers roteren het vernieuwingstoken.
            let kluis = self.kluis.clone();
            let sleutel = vernieuw_sleutel(account_id);
            blokkerend(move || kluis.zet(&sleutel, &nieuw)).await?;
        }
        self.onthoud(account_id, &tokens);
        Ok(tokens.toegang)
    }

    /// Volledige browserflow; geeft de tokens en het e-mailadres uit het id_token.
    pub async fn meld_aan(
        &self,
        p: Provider,
        login_hint: Option<&str>,
    ) -> Uitkomst<(Tokens, Option<String>)> {
        let client = self.client(p).await.ok_or_else(|| niet_ingesteld(p))?;
        let eindpunten = self.eindpunten_van(p);
        let verifier = willekeurig(48)?;
        let state = willekeurig(24)?;
        let luisteraar = Luisteraar::nieuw().await?;
        let redirect = luisteraar.redirect(p);
        let url = autorisatie_url(
            p,
            &eindpunten,
            &client.id,
            &redirect,
            &state,
            &pkce_uitdaging(&verifier),
            login_hint,
        );
        let (zender, ontvanger) = tokio::sync::oneshot::channel();
        // Een nieuwe aanmelding breekt een eventuele vorige af.
        if let Some(oud) = self.annuleer.lock().unwrap().replace(zender) {
            let _ = oud.send(());
        }
        (self.opener)(&url).map_err(|_| {
            MailFout::niet_beschikbaar("De webbrowser kon niet worden geopend voor het aanmelden.")
                .sleutel("oauth.browserFailed")
        })?;
        let code = tokio::select! {
            r = tokio::time::timeout(AANMELD_LIMIET, luisteraar.wacht(&state, p)) => r.map_err(|_| {
                MailFout::tijdslimiet(format!("Het aanmelden bij {} duurde langer dan 5 minuten en is afgebroken.", p.naam()))
                    .sleutel("oauth.signInTimeout")
                    .waarde("provider", p.naam())
            })?,
            _ = ontvanger => Err(MailFout::geweigerd("Het aanmelden is geannuleerd.").sleutel("oauth.cancelled")),
        }?;
        drop(luisteraar);
        let tokens = wissel_code(p, &eindpunten, &client, &code, &verifier, &redirect).await?;
        if tokens.vernieuw.is_none() {
            return Err(MailFout::aanmelding(format!(
                "{} gaf geen vernieuwingstoken; probeer opnieuw aan te melden.",
                p.naam()
            ))
            .sleutel("oauth.noRefreshToken")
            .waarde("provider", p.naam()));
        }
        let email = tokens.id_token.as_deref().and_then(email_uit_id_token);
        Ok((tokens, email))
    }
}

use std::io::Write as _;

/// Vertaalsleutel bij `uitleg`.
pub fn uitleg_sleutel(p: Provider) -> &'static str {
    match p {
        Provider::Microsoft => "oauth.notConfigured.microsoft",
        Provider::Google => "oauth.notConfigured.google",
    }
}

fn niet_ingesteld(p: Provider) -> MailFout {
    MailFout::niet_beschikbaar(uitleg(p)).sleutel(uitleg_sleutel(p))
}

pub fn uitleg(p: Provider) -> String {
    match p {
        Provider::Microsoft => "Aanmelden met Microsoft is nog niet ingesteld: er is geen client-ID. \
            Registreer een app in Microsoft Entra (App-registraties) als 'Openbare client', voeg het platform \
            'Mobiele en desktopapps' toe met redirect-URI http://localhost, en geef de gedelegeerde machtigingen \
            IMAP.AccessAsUser.All, SMTP.Send, offline_access, openid en email. Vul daarna het client-ID in \
            (zie docs/email-oauth.md)."
            .into(),
        Provider::Google => "Aanmelden met Google is nog niet ingesteld: er is geen client-ID. \
            Maak in Google Cloud een OAuth-client van het type 'Desktop-app' (redirect via http://127.0.0.1), \
            schakel de Gmail API in en voeg de scope https://mail.google.com/ toe aan het toestemmingsscherm. \
            Vul daarna client-ID en client-geheim in (zie docs/email-oauth.md)."
            .into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_volgens_rfc7636() {
        // Testvector uit RFC 7636, bijlage B.
        assert_eq!(
            pkce_uitdaging("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let a = willekeurig(48).unwrap();
        assert_eq!(a.len(), 64);
        assert_ne!(a, willekeurig(48).unwrap());
        assert!(a
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn autorisatie_urls() {
        let m = autorisatie_url(
            Provider::Microsoft,
            &Provider::Microsoft.eindpunten(),
            "abc-123",
            "http://localhost:5000/",
            "st",
            "uit",
            Some("jan@example.org"),
        );
        assert!(m.starts_with("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=abc-123&response_type=code"));
        assert!(m.contains("redirect_uri=http%3A%2F%2Flocalhost%3A5000%2F"));
        assert!(m.contains("scope=https%3A%2F%2Foutlook.office.com%2FIMAP.AccessAsUser.All%20https%3A%2F%2Foutlook.office.com%2FSMTP.Send%20offline_access%20openid%20email"));
        assert!(m.contains("code_challenge=uit&code_challenge_method=S256"));
        assert!(m.contains("login_hint=jan%40example.org"));
        assert!(!m.contains("access_type"));
        let g = autorisatie_url(
            Provider::Google,
            &Provider::Google.eindpunten(),
            "g",
            "http://127.0.0.1:1/",
            "s",
            "u",
            None,
        );
        assert!(g.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert!(g.contains("scope=https%3A%2F%2Fmail.google.com%2F%20openid%20email"));
        assert!(g.contains("access_type=offline&prompt=consent"));
        assert!(!g.contains("login_hint"));
    }

    #[test]
    fn state_controle() {
        let p = Provider::Google;
        assert_eq!(
            verwerk_terugkoppeling("GET /?state=goed&code=4%2F0Ab HTTP/1.1", "goed", p),
            Terugkoppeling::Code("4/0Ab".into())
        );
        assert!(matches!(
            verwerk_terugkoppeling("GET /?state=fout&code=x HTTP/1.1", "goed", p),
            Terugkoppeling::Fout(f) if f.code == super::super::fout::Foutcode::Geweigerd
        ));
        assert!(matches!(
            verwerk_terugkoppeling("GET /?code=x HTTP/1.1", "goed", p),
            Terugkoppeling::Fout(_)
        ));
        assert!(matches!(
            verwerk_terugkoppeling("GET /?state=goed&error=access_denied HTTP/1.1", "goed", p),
            Terugkoppeling::Fout(f) if f.code == super::super::fout::Foutcode::Aanmelding
        ));
        assert_eq!(
            verwerk_terugkoppeling("GET /favicon.ico HTTP/1.1", "goed", p),
            Terugkoppeling::Overig
        );
        assert_eq!(
            verwerk_terugkoppeling("POST /?state=goed&code=x HTTP/1.1", "goed", p),
            Terugkoppeling::Overig
        );
    }

    #[test]
    fn tokenantwoorden() {
        let t = ontleed_tokenantwoord(
            200,
            br#"{"access_token":"A","refresh_token":"R","expires_in":3599,"token_type":"Bearer"}"#,
            Provider::Microsoft,
        )
        .ok()
        .unwrap();
        assert_eq!(t.toegang, "A");
        assert_eq!(t.vernieuw.as_deref(), Some("R"));
        let rest = t.verloopt - Instant::now();
        assert!(rest > Duration::from_secs(3590) && rest <= Duration::from_secs(3599));
        let t = ontleed_tokenantwoord(
            200,
            br#"{"access_token":"A","expires_in":"60"}"#,
            Provider::Google,
        )
        .ok()
        .unwrap();
        assert!(t.vernieuw.is_none());
        let f = ontleed_tokenantwoord(
            400,
            br#"{"error":"invalid_grant","error_description":"Token has been expired or revoked."}"#,
            Provider::Google,
        )
        .err()
        .unwrap();
        assert_eq!(f.code, super::super::fout::Foutcode::Aanmelding);
        assert!(f.melding.starts_with("Opnieuw aanmelden bij Google"));
        let f = ontleed_tokenantwoord(401, br#"{"error":"invalid_client"}"#, Provider::Microsoft)
            .err()
            .unwrap();
        assert_eq!(f.code, super::super::fout::Foutcode::NietBeschikbaar);
        assert!(ontleed_tokenantwoord(502, b"<html>", Provider::Google).is_err());
    }

    #[test]
    fn id_token_en_xoauth2() {
        let lading = b64url(br#"{"email":"jan@example.org","sub":"1"}"#);
        assert_eq!(
            email_uit_id_token(&format!("eyJhbGciOiJub25lIn0.{lading}.x")).as_deref(),
            Some("jan@example.org")
        );
        let ms = b64url(br#"{"preferred_username":"piet@contoso.nl"}"#);
        assert_eq!(
            email_uit_id_token(&format!("a.{ms}.b")).as_deref(),
            Some("piet@contoso.nl")
        );
        assert!(email_uit_id_token("geen-token").is_none());
        assert_eq!(
            xoauth2("a@b.nl", "T"),
            "user=a@b.nl\x01auth=Bearer T\x01\x01"
        );
    }

    #[test]
    fn urls_voor_tokeneindpunt() {
        assert_eq!(
            ontleed_url("https://oauth2.googleapis.com/token")
                .ok()
                .unwrap(),
            (true, "oauth2.googleapis.com".into(), 443, "/token".into())
        );
        assert_eq!(
            ontleed_url("http://127.0.0.1:8080/token").ok().unwrap(),
            (false, "127.0.0.1".into(), 8080, "/token".into())
        );
        assert!(ontleed_url("http://evil.example/token").is_err());
    }
}
