//! IMAP met `async-imap` over tokio en rustls. Sessiepool per account met
//! wachttijd na mislukte aanmelding en een korte mappencache; aanpak naar de
//! Y-app-desktopimplementatie (zie herkomst in `mod.rs`).

use super::accounts::controleer_beveiliging;
use super::fout::{
    aanmelden_mislukt, geen_tls_naam, geen_wachtwoord, niet_lokaal, servertekst, uit_io,
    MailFout, Uitkomst,
};
use super::mime::{self, Vlaggen};
use super::{
    Account, Adres, Authenticatie, Bericht, BerichtKop, BerichtLijst, Beveiliging, Deeluitkomst,
    Lijstverzoek, Limieten, Map, ServerInstelling, Speciaal, Vlag, Zoekveld,
};
use async_imap::types::{Fetch, Flag, Name, NameAttribute};
use futures::TryStreamExt;
use std::collections::{HashMap, HashSet};
use std::pin::Pin;
use std::sync::{Arc, Mutex, OnceLock};
use std::task::{Context as TaakContext, Poll};
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;

pub const VERBIND_LIMIET: Duration = Duration::from_secs(20);
pub const OPDRACHT_LIMIET: Duration = Duration::from_secs(60);
/// Voor grote berichten en APPEND.
pub const GROOT_LIMIET: Duration = Duration::from_secs(300);
const STIL_TTL: Duration = Duration::from_secs(25 * 60);
const MAPPEN_TTL: Duration = Duration::from_secs(30);
const CONTACTEN_TTL: Duration = Duration::from_secs(5 * 60);
const WACHT_START: Duration = Duration::from_secs(15);
const WACHT_MAX: Duration = Duration::from_secs(5 * 60);
const MAX_TELLINGEN: usize = 150;
const KOPVELDEN: &str =
    "(UID FLAGS RFC822.SIZE INTERNALDATE BODY.PEEK[HEADER.FIELDS (DATE FROM TO CC SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES CONTENT-TYPE)])";

/* ─── TLS ─── */

/// rustls met de ring-cryptoprovider en de Mozilla-basiscertificaten
/// (webpki-roots). Er is bewust geen optie om certificaten blind te
/// accepteren.
pub fn tls_instellingen() -> Arc<rustls::ClientConfig> {
    static INSTELLINGEN: OnceLock<Arc<rustls::ClientConfig>> = OnceLock::new();
    INSTELLINGEN
        .get_or_init(|| {
            let mut wortels = rustls::RootCertStore::empty();
            wortels.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
            let config = rustls::ClientConfig::builder_with_provider(Arc::new(
                rustls::crypto::ring::default_provider(),
            ))
            .with_safe_default_protocol_versions()
            .expect("TLS-protocolversies")
            .with_root_certificates(wortels)
            .with_no_client_auth();
            Arc::new(config)
        })
        .clone()
}

pub fn kale_host(host: &str) -> &str {
    host.trim().trim_start_matches('[').trim_end_matches(']')
}

/// TCP-verbinding met tijdslimiet. Bij `beveiliging: geen` moet het werkelijke
/// peeradres loopback zijn (ook als een naam als "localhost" anders zou
/// verwijzen).
pub async fn verbind_tcp(server: &ServerInstelling) -> Uitkomst<TcpStream> {
    let host = kale_host(&server.host);
    let tcp = tokio::time::timeout(VERBIND_LIMIET, TcpStream::connect((host, server.poort)))
        .await
        .map_err(|_| {
            MailFout::tijdslimiet(format!(
                "Geen antwoord van {host}:{} binnen {} seconden. Controleer servernaam, poort en firewall.",
                server.poort,
                VERBIND_LIMIET.as_secs()
            ))
            .sleutel("imap.connectTimeout")
            .waarde("host", host)
            .waarde("port", server.poort)
            .waarde("seconds", VERBIND_LIMIET.as_secs())
        })?
        .map_err(|e| uit_io(&e, host))?;
    if server.beveiliging == Beveiliging::Geen {
        let lokaal = tcp
            .peer_addr()
            .map(|a| a.ip().is_loopback())
            .unwrap_or(false);
        if !lokaal {
            return Err(niet_lokaal(host));
        }
    }
    let _ = tcp.set_nodelay(true);
    Ok(tcp)
}

pub async fn tls_over(tcp: TcpStream, host: &str) -> Uitkomst<TlsStream<TcpStream>> {
    let host = kale_host(host);
    let naam =
        rustls::pki_types::ServerName::try_from(host.to_string()).map_err(|_| geen_tls_naam(host))?;
    tokio::time::timeout(
        VERBIND_LIMIET,
        tokio_rustls::TlsConnector::from(tls_instellingen()).connect(naam, tcp),
    )
    .await
    .map_err(|_| {
        MailFout::tijdslimiet(format!("De TLS-handdruk met {host} duurde te lang."))
            .sleutel("tls.handshakeTimeout")
            .waarde("host", host)
    })?
    .map_err(|e| uit_io(&e, host))
}

/* ─── Stroom: platte TCP of TLS ─── */

pub enum Stroom {
    Plat(TcpStream),
    Tls(Box<TlsStream<TcpStream>>),
}

impl std::fmt::Debug for Stroom {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Stroom::Plat(_) => "Stroom::Plat",
            Stroom::Tls(_) => "Stroom::Tls",
        })
    }
}

impl AsyncRead for Stroom {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut TaakContext<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Stroom::Plat(s) => Pin::new(s).poll_read(cx, buf),
            Stroom::Tls(s) => Pin::new(s.as_mut()).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for Stroom {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut TaakContext<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match self.get_mut() {
            Stroom::Plat(s) => Pin::new(s).poll_write(cx, buf),
            Stroom::Tls(s) => Pin::new(s.as_mut()).poll_write(cx, buf),
        }
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut TaakContext<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Stroom::Plat(s) => Pin::new(s).poll_flush(cx),
            Stroom::Tls(s) => Pin::new(s.as_mut()).poll_flush(cx),
        }
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut TaakContext<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            Stroom::Plat(s) => Pin::new(s).poll_shutdown(cx),
            Stroom::Tls(s) => Pin::new(s.as_mut()).poll_shutdown(cx),
        }
    }
}

pub type Sessie = async_imap::Session<Stroom>;
type Client = async_imap::Client<Stroom>;

/* ─── Aanmelden ─── */

/// Haalt een vers OAuth2-toegangstoken op (na AUTHENTICATIONFAILED).
pub type Vernieuwer = Arc<
    dyn Fn() -> Pin<Box<dyn std::future::Future<Output = Uitkomst<String>> + Send>> + Send + Sync,
>;

#[derive(Clone)]
pub struct Aanmelding {
    pub server: ServerInstelling,
    /// Wachtwoord, of bij OAuth2 het toegangstoken.
    pub wachtwoord: String,
    pub vernieuw: Option<Vernieuwer>,
}

/// SASL XOAUTH2; een foutuitdaging van de server krijgt een leeg antwoord.
struct XOAuth2<'a> {
    gebruiker: &'a str,
    token: &'a str,
    verstuurd: bool,
}

impl async_imap::Authenticator for XOAuth2<'_> {
    type Response = String;
    fn process(&mut self, _uitdaging: &[u8]) -> String {
        if std::mem::replace(&mut self.verstuurd, true) {
            String::new()
        } else {
            super::oauth::xoauth2(self.gebruiker, self.token)
        }
    }
}

impl std::fmt::Debug for Aanmelding {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Aanmelding")
            .field("server", &self.server)
            .finish_non_exhaustive()
    }
}

/// De IMAP-handeling waarbij een fout optrad; begint de melding van
/// `imapfout` ("Map aanmaken: …") en gaat als `actionKey` mee.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Wat {
    Aanmelden,
    Starttls,
    MappenOphalen,
    MappenTellen,
    MapAanmaken,
    MapHernoemen,
    MapVerwijderen,
    /// Met de (gedecodeerde) mapnaam.
    MapOpenenNaam(String),
    MapOpenen,
    BerichtenOphalen,
    Zoeken,
    BerichtOphalen,
    Markeren,
    Verplaatsen,
    Kopieren,
    Verwijderen,
    Opruimen,
    OpslaanIn(Speciaal),
}

impl Wat {
    /// Nederlandse tekst en vertaalsleutel.
    fn tekst(&self) -> (String, &'static str) {
        let (t, s) = match self {
            Wat::Aanmelden => ("Aanmelden", "imap.action.signIn"),
            Wat::Starttls => ("STARTTLS", "imap.action.startTls"),
            Wat::MappenOphalen => ("Mappen ophalen", "imap.action.listFolders"),
            Wat::MappenTellen => ("Mappen tellen", "imap.action.countFolders"),
            Wat::MapAanmaken => ("Map aanmaken", "imap.action.createFolder"),
            Wat::MapHernoemen => ("Map hernoemen", "imap.action.renameFolder"),
            Wat::MapVerwijderen => ("Map verwijderen", "imap.action.deleteFolder"),
            Wat::MapOpenenNaam(naam) => {
                return (format!("Map '{naam}' openen"), "imap.action.openNamedFolder")
            }
            Wat::MapOpenen => ("Map openen", "imap.action.openFolder"),
            Wat::BerichtenOphalen => ("Berichten ophalen", "imap.action.fetchMessages"),
            Wat::Zoeken => ("Zoeken", "imap.action.search"),
            Wat::BerichtOphalen => ("Bericht ophalen", "imap.action.fetchMessage"),
            Wat::Markeren => ("Markeren", "imap.action.flag"),
            Wat::Verplaatsen => ("Verplaatsen", "imap.action.move"),
            Wat::Kopieren => ("Kopiëren", "imap.action.copy"),
            Wat::Verwijderen => ("Verwijderen", "imap.action.delete"),
            Wat::Opruimen => ("Opruimen", "imap.action.expunge"),
            Wat::OpslaanIn(Speciaal::Verzonden) => {
                ("Opslaan in Verzonden", "imap.action.saveToSent")
            }
            Wat::OpslaanIn(Speciaal::Concepten) => {
                ("Opslaan in Concepten", "imap.action.saveToDrafts")
            }
            Wat::OpslaanIn(_) => ("Opslaan in map", "imap.action.saveToFolder"),
        };
        (t.to_string(), s)
    }
}

/// Vertaalt een IMAP-fout. `niet_gevonden` geeft aan dat een NO van de server
/// betekent dat de map of het bericht niet bestaat.
pub fn imapfout(
    e: async_imap::error::Error,
    host: &str,
    handeling: Wat,
    niet_gevonden: bool,
) -> MailFout {
    use async_imap::error::Error::*;
    let (wat, wat_sleutel) = handeling.tekst();
    let met_detail = |f: MailFout, sleutel: &'static str, detail: String| {
        f.sleutel(sleutel).waarde("detail", detail)
    };
    let f = match e {
        Io(io) => return uit_io(&io, host),
        ConnectionLost => {
            return MailFout::verbinding(format!("De verbinding met {host} is verbroken."))
                .sleutel("imap.connectionLost")
                .waarde("host", host)
        }
        No(t) if niet_gevonden => {
            let t = servertekst(&t);
            met_detail(
                MailFout::niet_gevonden(format!("{wat}: {t}")),
                "imap.notFound",
                t,
            )
        }
        No(t) => {
            let t = servertekst(&t);
            if t.to_ascii_uppercase().contains("OVERQUOTA")
                || t.to_ascii_lowercase().contains("quota")
            {
                met_detail(
                    MailFout::te_groot(format!("{wat}: de mailbox is vol ({t}).")),
                    "imap.quotaExceeded",
                    t,
                )
            } else {
                met_detail(
                    MailFout::geweigerd(format!("{wat}: de server weigerde ({t}).")),
                    "imap.refused",
                    t,
                )
            }
        }
        Bad(t) => {
            let t = servertekst(&t);
            met_detail(
                MailFout::geweigerd(format!("{wat}: de server begreep de opdracht niet ({t}).")),
                "imap.badCommand",
                t,
            )
        }
        Validate(_) => MailFout::geweigerd(format!("{wat}: ongeldige tekens in de naam."))
            .sleutel("imap.invalidName"),
        Append => MailFout::geweigerd(format!("{wat}: de server weigerde het bericht."))
            .sleutel("imap.appendRejected"),
        Parse(_) => MailFout::intern(format!("{wat}: onverwacht antwoord van de server."))
            .sleutel("imap.unexpectedResponse"),
        _ => MailFout::intern(format!("{wat}: onverwachte fout.")).sleutel("imap.unexpectedError"),
    };
    let f = f.waarde("actionKey", wat_sleutel);
    match handeling {
        Wat::MapOpenenNaam(naam) => f.waarde("folder", naam),
        _ => f,
    }
}

fn aanmeldfout(e: async_imap::error::Error, host: &str) -> MailFout {
    use async_imap::error::Error::*;
    match e {
        No(t) | Bad(t) => aanmelden_mislukt(host, servertekst(&t)),
        andere => imapfout(andere, host, Wat::Aanmelden, false),
    }
}

async fn lees_begroeting(client: &mut Client, host: &str) -> Uitkomst<()> {
    use async_imap::imap_proto::{Response, Status};
    match client.read_response().await {
        Ok(Some(r)) => match r.parsed() {
            Response::Data {
                status: Status::Bye,
                information,
                ..
            } => {
                let detail = servertekst(information.as_deref().unwrap_or(""));
                Err(
                    MailFout::verbinding(format!("{host} weigerde de verbinding: {detail}"))
                        .sleutel("imap.greetingRefused")
                        .waarde("host", host)
                        .waarde("detail", detail),
                )
            }
            _ => Ok(()),
        },
        Ok(None) => Err(MailFout::verbinding(format!(
            "{host} sloot de verbinding meteen. Past de beveiliging (SSL/TLS of STARTTLS) bij de poort?"
        ))
        .sleutel("imap.closedImmediately")
        .waarde("host", host)),
        Err(e) => Err(uit_io(&e, host)),
    }
}

/// CRAM-MD5 (RFC 2195) voor "versleuteld wachtwoord".
struct CramMd5<'a> {
    gebruiker: &'a str,
    wachtwoord: &'a str,
}

impl async_imap::Authenticator for CramMd5<'_> {
    type Response = String;
    fn process(&mut self, uitdaging: &[u8]) -> String {
        let mac = hmac_md5(self.wachtwoord.as_bytes(), uitdaging);
        let hex: String = mac.iter().map(|b| format!("{b:02x}")).collect();
        format!("{} {hex}", self.gebruiker)
    }
}

pub async fn verbind_en_meld_aan(a: &Aanmelding) -> Uitkomst<(Sessie, HashSet<String>)> {
    controleer_beveiliging(&a.server, false)?;
    if a.wachtwoord.is_empty() {
        return Err(geen_wachtwoord());
    }
    let host = kale_host(&a.server.host).to_string();
    let werk = async {
        let tcp = verbind_tcp(&a.server).await?;
        let client = match a.server.beveiliging {
            Beveiliging::Ssl => {
                let mut c = Client::new(Stroom::Tls(Box::new(tls_over(tcp, &host).await?)));
                lees_begroeting(&mut c, &host).await?;
                c
            }
            Beveiliging::Starttls => {
                let mut c = Client::new(Stroom::Plat(tcp));
                lees_begroeting(&mut c, &host).await?;
                c.run_command_and_check_ok("STARTTLS", None).await.map_err(|e| match e {
                    async_imap::error::Error::No(_) | async_imap::error::Error::Bad(_) => MailFout::verbinding(format!(
                        "{host} ondersteunt geen STARTTLS op poort {}. Kies SSL/TLS (meestal poort 993).",
                        a.server.poort
                    ))
                    .sleutel("imap.noStarttls")
                    .waarde("host", &host)
                    .waarde("port", a.server.poort),
                    andere => imapfout(andere, &host, Wat::Starttls, false),
                })?;
                let Stroom::Plat(tcp) = c.into_inner() else {
                    return Err(MailFout::intern("Onverwachte verbindingstoestand.")
                        .sleutel("imap.unexpectedState"));
                };
                Client::new(Stroom::Tls(Box::new(tls_over(tcp, &host).await?)))
            }
            Beveiliging::Geen => {
                let mut c = Client::new(Stroom::Plat(tcp));
                lees_begroeting(&mut c, &host).await?;
                c
            }
        };
        let gebruiker = a.server.gebruikersnaam.trim();
        let mut sessie = match a.server.authenticatie {
            Authenticatie::Normaal => client
                .login(gebruiker, &a.wachtwoord)
                .await
                .map_err(|(e, _)| aanmeldfout(e, &host))?,
            Authenticatie::Versleuteld => client
                .authenticate(
                    "CRAM-MD5",
                    CramMd5 {
                        gebruiker,
                        wachtwoord: &a.wachtwoord,
                    },
                )
                .await
                .map_err(|(e, _)| aanmeldfout(e, &host))?,
            Authenticatie::Oauth2 => client
                .authenticate(
                    "XOAUTH2",
                    XOAuth2 {
                        gebruiker,
                        token: &a.wachtwoord,
                        verstuurd: false,
                    },
                )
                .await
                .map_err(|(e, _)| aanmeldfout(e, &host))?,
        };
        let mogelijkheden = sessie
            .capabilities()
            .await
            .map(|c| {
                c.iter()
                    .map(|m| match m {
                        async_imap::types::Capability::Imap4rev1 => "IMAP4REV1".to_string(),
                        async_imap::types::Capability::Auth(s) => {
                            format!("AUTH={}", s.to_ascii_uppercase())
                        }
                        async_imap::types::Capability::Atom(s) => s.to_ascii_uppercase(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok((sessie, mogelijkheden))
    };
    tokio::time::timeout(VERBIND_LIMIET * 2, werk)
        .await
        .map_err(|_| {
            MailFout::tijdslimiet(format!("Aanmelden bij {host} duurde te lang."))
                .sleutel("imap.signInTimeout")
                .waarde("host", &host)
        })?
        .map_err(|f: MailFout| f.zonder_geheim(&a.wachtwoord))
}

/// Verbindingstest voor de accountinstellingen.
pub async fn test(server: &ServerInstelling, wachtwoord: &str) -> Uitkomst<Deeluitkomst> {
    let waarschuwing = controleer_beveiliging(server, false)?;
    let (mut sessie, _) = verbind_en_meld_aan(&Aanmelding {
        server: server.clone(),
        wachtwoord: wachtwoord.to_string(),
        vernieuw: None,
    })
    .await?;
    let _ = tokio::time::timeout(Duration::from_secs(5), sessie.logout()).await;
    Ok(Deeluitkomst::aangemeld(
        kale_host(&server.host),
        "IMAP",
        waarschuwing,
    ))
}

/* ─── Sessiepool ─── */

struct Slot {
    sessie: Option<Sessie>,
    mogelijkheden: HashSet<String>,
    laatst: Instant,
}

struct Wacht {
    tot: Instant,
    duur: Duration,
    fout: MailFout,
}

#[derive(Default)]
pub struct ImapPool {
    slots: Mutex<HashMap<String, Arc<tokio::sync::Mutex<Slot>>>>,
    wachten: Mutex<HashMap<String, Wacht>>,
    mappen: Mutex<HashMap<String, (Instant, Vec<Map>)>>,
    contacten: Mutex<HashMap<String, (Instant, Vec<(Adres, u32)>)>>,
}

/// Een uitgeleende sessie; de slotvergrendeling zorgt dat één account nooit
/// gelijktijdig dezelfde IMAP-verbinding gebruikt.
pub struct Bezet {
    slot: tokio::sync::OwnedMutexGuard<Slot>,
    host: String,
}

impl Bezet {
    fn s(&mut self) -> &mut Sessie {
        self.slot.sessie.as_mut().expect("sessie aanwezig")
    }
    fn kan(&self, mogelijkheid: &str) -> bool {
        self.slot.mogelijkheden.contains(mogelijkheid)
    }
    /// Voert een stap uit met tijdslimiet; bij verbindingsproblemen wordt de
    /// sessie weggegooid zodat de volgende opdracht opnieuw verbindt.
    async fn stap<T, F>(&mut self, limiet: Duration, f: F) -> Uitkomst<T>
    where
        F: for<'s> FnOnce(
            &'s mut Sessie,
            &'s str,
        )
            -> Pin<Box<dyn std::future::Future<Output = Uitkomst<T>> + Send + 's>>,
    {
        let host = self.host.clone();
        let uitkomst = match tokio::time::timeout(limiet, f(self.s(), &host)).await {
            Ok(r) => r,
            Err(_) => Err(MailFout::tijdslimiet(format!(
                "{host} reageerde niet binnen {} seconden.",
                limiet.as_secs()
            ))
            .sleutel("imap.commandTimeout")
            .waarde("host", &host)
            .waarde("seconds", limiet.as_secs())),
        };
        if let Err(f) = &uitkomst {
            use super::fout::Foutcode::*;
            if matches!(f.code, Verbinding | Tijdslimiet | Intern) {
                self.slot.sessie = None;
            }
        }
        // Ongevraagde meldingen (EXISTS, EXPUNGE …) niet laten ophopen.
        if let Some(s) = self.slot.sessie.as_mut() {
            while s.unsolicited_responses.try_recv().is_ok() {}
        }
        uitkomst
    }
}

impl ImapPool {
    pub async fn neem(&self, sleutel: &str, a: &Aanmelding) -> Uitkomst<Bezet> {
        let slot = self
            .slots
            .lock()
            .unwrap()
            .entry(sleutel.to_string())
            .or_insert_with(|| {
                Arc::new(tokio::sync::Mutex::new(Slot {
                    sessie: None,
                    mogelijkheden: HashSet::new(),
                    laatst: Instant::now(),
                }))
            })
            .clone();
        let mut g = slot.lock_owned().await;
        if g.sessie.is_some() && g.laatst.elapsed() > STIL_TTL {
            if let Some(mut oud) = g.sessie.take() {
                let _ = tokio::time::timeout(Duration::from_secs(3), oud.logout()).await;
            }
        }
        if g.sessie.is_none() {
            if let Some(w) = self.wachten.lock().unwrap().get(sleutel) {
                let rest = w.tot.saturating_duration_since(Instant::now());
                if !rest.is_zero() {
                    let mut fout = w.fout.clone();
                    let seconden = rest.as_secs().max(1);
                    fout.melding = format!(
                        "{} (Email Studio probeert het over {} seconden opnieuw, om blokkering door de server te voorkomen.)",
                        fout.melding,
                        seconden
                    );
                    // De oorspronkelijke melding wordt de deeltekst `{{message}}`.
                    if let Some(oorspronkelijk) = fout.sleutel {
                        fout = fout
                            .sleutel("imap.retryLater")
                            .waarde("messageKey", oorspronkelijk)
                            .waarde("retrySeconds", seconden);
                    }
                    return Err(fout);
                }
            }
            let mut poging = verbind_en_meld_aan(a).await;
            if let (Err(f), Some(vernieuw)) = (&poging, &a.vernieuw) {
                if f.code == super::fout::Foutcode::Aanmelding {
                    // OAuth2: token vernieuwen en één keer opnieuw proberen.
                    let mut opnieuw = a.clone();
                    opnieuw.wachtwoord = vernieuw().await?;
                    opnieuw.vernieuw = None;
                    poging = verbind_en_meld_aan(&opnieuw).await;
                }
            }
            match poging {
                Ok((s, m)) => {
                    self.wachten.lock().unwrap().remove(sleutel);
                    g.sessie = Some(s);
                    g.mogelijkheden = m;
                }
                Err(f) => {
                    let mut wachten = self.wachten.lock().unwrap();
                    let duur = wachten
                        .get(sleutel)
                        .map(|w| (w.duur * 2).min(WACHT_MAX))
                        .unwrap_or(WACHT_START);
                    wachten.insert(
                        sleutel.to_string(),
                        Wacht {
                            tot: Instant::now() + duur,
                            duur,
                            fout: f.clone(),
                        },
                    );
                    return Err(f);
                }
            }
        }
        g.laatst = Instant::now();
        Ok(Bezet {
            slot: g,
            host: kale_host(&a.server.host).to_string(),
        })
    }

    /// Vergeet sessie, wachttijd en caches (na wijzigen of verwijderen van een account).
    pub async fn vergeet(&self, sleutel: &str) {
        let slot = self.slots.lock().unwrap().remove(sleutel);
        self.wachten.lock().unwrap().remove(sleutel);
        self.mappen.lock().unwrap().remove(sleutel);
        self.contacten.lock().unwrap().remove(sleutel);
        if let Some(slot) = slot {
            if let Ok(mut g) = slot.try_lock() {
                if let Some(mut s) = g.sessie.take() {
                    let _ = tokio::time::timeout(Duration::from_secs(3), s.logout()).await;
                }
            }
        }
    }

    fn wis_mappen(&self, sleutel: &str) {
        self.mappen.lock().unwrap().remove(sleutel);
    }
}

pub struct Context<'a> {
    pub pool: &'a ImapPool,
    pub account: Account,
    pub aanmelding: Aanmelding,
    pub limieten: Limieten,
}

impl Context<'_> {
    async fn neem(&self) -> Uitkomst<Bezet> {
        self.pool.neem(&self.account.id, &self.aanmelding).await
    }
}

/* ─── Mapnamen: gewijzigd UTF-7 (RFC 3501 §5.1.3) ─── */

fn mutf7_engine() -> base64::engine::GeneralPurpose {
    base64::engine::GeneralPurpose::new(
        &base64::alphabet::IMAP_MUTF7,
        base64::engine::general_purpose::NO_PAD,
    )
}

pub fn decodeer_mapnaam(naam: &str) -> String {
    use base64::Engine;
    let mut uit = String::new();
    let mut rest = naam;
    while let Some(i) = rest.find('&') {
        uit.push_str(&rest[..i]);
        rest = &rest[i + 1..];
        let Some(eind) = rest.find('-') else {
            uit.push('&');
            continue;
        };
        let deel = &rest[..eind];
        rest = &rest[eind + 1..];
        if deel.is_empty() {
            uit.push('&');
            continue;
        }
        match mutf7_engine().decode(deel) {
            Ok(bytes) if bytes.len() % 2 == 0 => {
                let eenheden: Vec<u16> = bytes
                    .chunks(2)
                    .map(|c| u16::from_be_bytes([c[0], c[1]]))
                    .collect();
                uit.push_str(&String::from_utf16_lossy(&eenheden));
            }
            _ => {
                uit.push('&');
                uit.push_str(deel);
                uit.push('-');
            }
        }
    }
    uit.push_str(rest);
    uit
}

/// Codeert niet-ASCII naar gewijzigd UTF-7. Bestaande, geldige `&…-`-reeksen
/// (van een pad dat de server zelf gaf) blijven staan; een losse `&` wordt `&-`.
pub fn codeer_mapnaam(naam: &str) -> String {
    use base64::Engine;
    let mut uit = String::new();
    let tekens: Vec<char> = naam.chars().collect();
    let mut i = 0;
    while i < tekens.len() {
        let c = tekens[i];
        if c == '&' {
            let rest: String = tekens[i + 1..].iter().collect();
            if let Some(eind) = rest.find('-') {
                let deel = &rest[..eind];
                let geldig = !deel.is_empty()
                    && deel
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == ',')
                    && mutf7_engine()
                        .decode(deel)
                        .map(|b| b.len() % 2 == 0)
                        .unwrap_or(false);
                if geldig || deel.is_empty() {
                    uit.push('&');
                    uit.push_str(deel);
                    uit.push('-');
                    i += deel.chars().count() + 2;
                    continue;
                }
            }
            uit.push_str("&-");
            i += 1;
        } else if (' '..='~').contains(&c) {
            uit.push(c);
            i += 1;
        } else {
            let mut eenheden = Vec::new();
            while i < tekens.len() && !(' '..='~').contains(&tekens[i]) {
                let mut buf = [0u16; 2];
                eenheden.extend_from_slice(tekens[i].encode_utf16(&mut buf));
                i += 1;
            }
            let bytes: Vec<u8> = eenheden.iter().flat_map(|e| e.to_be_bytes()).collect();
            uit.push('&');
            uit.push_str(&mutf7_engine().encode(bytes));
            uit.push('-');
        }
    }
    uit
}

fn controleer_mapnaam(pad: &str) -> Uitkomst<()> {
    if pad.trim().is_empty() || pad.len() > 1000 || pad.contains(['\r', '\n', '\0']) {
        return Err(MailFout::geweigerd("Ongeldige mapnaam.").sleutel("imap.invalidFolderName"));
    }
    Ok(())
}

/* ─── Speciale mappen ─── */

fn speciaal_uit_attributen(n: &Name) -> Option<Speciaal> {
    n.attributes().iter().find_map(|a| match a {
        NameAttribute::Sent => Some(Speciaal::Verzonden),
        NameAttribute::Drafts => Some(Speciaal::Concepten),
        NameAttribute::Trash => Some(Speciaal::Prullenbak),
        NameAttribute::Junk => Some(Speciaal::Ongewenst),
        NameAttribute::Archive => Some(Speciaal::Archief),
        NameAttribute::All => Some(Speciaal::Alle),
        NameAttribute::Flagged => Some(Speciaal::Gemarkeerd),
        NameAttribute::Extension(e) => match e.to_ascii_lowercase().as_str() {
            "\\sent" => Some(Speciaal::Verzonden),
            "\\drafts" => Some(Speciaal::Concepten),
            "\\trash" => Some(Speciaal::Prullenbak),
            "\\junk" | "\\spam" => Some(Speciaal::Ongewenst),
            "\\archive" => Some(Speciaal::Archief),
            _ => None,
        },
        _ => None,
    })
}

/// Herkenning op naam (Nederlands, Engels, Duits) voor servers zonder SPECIAL-USE.
pub fn speciaal_uit_naam(pad: &str, blad: &str) -> Option<Speciaal> {
    if pad.eq_ignore_ascii_case("INBOX") {
        return Some(Speciaal::Inbox);
    }
    let b = blad.trim().to_lowercase();
    Some(match b.as_str() {
        "sent"
        | "sent items"
        | "sent messages"
        | "sent mail"
        | "verzonden"
        | "verzonden items"
        | "verzonden berichten"
        | "gesendet"
        | "gesendete elemente"
        | "gesendete objekte" => Speciaal::Verzonden,
        "drafts" | "draft" | "concepten" | "concept" | "entwürfe" => Speciaal::Concepten,
        "trash"
        | "deleted items"
        | "deleted messages"
        | "deleted"
        | "bin"
        | "prullenbak"
        | "verwijderde items"
        | "verwijderde berichten"
        | "papierkorb"
        | "gelöschte elemente" => Speciaal::Prullenbak,
        "junk" | "spam" | "junk e-mail" | "junk email" | "bulk mail" | "ongewenst"
        | "ongewenste e-mail" | "ongewenste mail" | "spamverdacht" => Speciaal::Ongewenst,
        "archive" | "archives" | "archief" | "archiv" => Speciaal::Archief,
        _ => return None,
    })
}

fn blad(pad: &str, scheiding: &str) -> String {
    let deel = if scheiding.is_empty() {
        pad
    } else {
        pad.rsplit(scheiding).next().unwrap_or(pad)
    };
    decodeer_mapnaam(deel)
}

/// Bepaalt de speciale mappen: accountinstelling > SPECIAL-USE > naam.
fn wijs_speciaal_toe(mappen: &mut [Map], namen_speciaal: &[Option<Speciaal>], account: &Account) {
    for (m, s) in mappen.iter_mut().zip(namen_speciaal) {
        m.speciaal = *s;
    }
    // Op naam alleen als geen enkele map die rol via SPECIAL-USE heeft.
    let via_attributen: HashSet<Speciaal> = namen_speciaal.iter().flatten().copied().collect();
    let mut gezien: HashSet<Speciaal> = via_attributen.clone();
    for m in mappen.iter_mut() {
        if m.speciaal.is_none() {
            if let Some(s) = speciaal_uit_naam(&m.pad, &m.naam) {
                if s == Speciaal::Inbox || !gezien.contains(&s) {
                    m.speciaal = Some(s);
                    gezien.insert(s);
                }
            }
        }
    }
    if let Some(eigen) = &account.mappen {
        for (soort, pad) in [
            (Speciaal::Verzonden, &eigen.verzonden),
            (Speciaal::Concepten, &eigen.concepten),
            (Speciaal::Prullenbak, &eigen.prullenbak),
            (Speciaal::Archief, &eigen.archief),
        ] {
            let Some(pad) = pad else { continue };
            if !mappen.iter().any(|m| &m.pad == pad) {
                continue;
            }
            for m in mappen.iter_mut() {
                if m.speciaal == Some(soort) {
                    m.speciaal = None;
                }
                if &m.pad == pad {
                    m.speciaal = Some(soort);
                }
            }
        }
    }
}

/* ─── Operaties ─── */

pub async fn mappen(ctx: &Context<'_>) -> Uitkomst<Vec<Map>> {
    let sleutel = &ctx.account.id;
    if let Some((t, lijst)) = ctx.pool.mappen.lock().unwrap().get(sleutel) {
        if t.elapsed() < MAPPEN_TTL {
            return Ok(lijst.clone());
        }
    }
    let mut b = ctx.neem().await?;
    let namen: Vec<Name> = b
        .stap(OPDRACHT_LIMIET, |s, h| {
            Box::pin(async move {
                s.list(Some(""), Some("*"))
                    .await
                    .map_err(|e| imapfout(e, h, Wat::MappenOphalen, false))?
                    .try_collect::<Vec<_>>()
                    .await
                    .map_err(|e| imapfout(e, h, Wat::MappenOphalen, false))
            })
        })
        .await?;
    let mut lijst = Vec::with_capacity(namen.len());
    let mut speciaal = Vec::with_capacity(namen.len());
    for n in &namen {
        let pad = n.name().to_string();
        let scheiding = n.delimiter().unwrap_or("/").to_string();
        let selecteerbaar = !n.attributes().iter().any(|a| match a {
            NameAttribute::NoSelect => true,
            NameAttribute::Extension(e) => e.eq_ignore_ascii_case("\\NonExistent"),
            _ => false,
        });
        speciaal.push(speciaal_uit_attributen(n));
        lijst.push(Map {
            naam: if pad.eq_ignore_ascii_case("INBOX") {
                "Inbox".into()
            } else {
                blad(&pad, &scheiding)
            },
            pad,
            scheiding,
            speciaal: None,
            selecteerbaar,
            totaal: None,
            ongelezen: None,
        });
    }
    wijs_speciaal_toe(&mut lijst, &speciaal, &ctx.account);
    // Inbox en speciale mappen eerst; de rest in serverordening.
    lijst.sort_by_key(|m| match m.speciaal {
        Some(Speciaal::Inbox) => 0,
        Some(_) => 1,
        None => 2,
    });
    // Tellingen via STATUS; bij heel veel mappen alleen de eerste.
    for m in lijst
        .iter_mut()
        .filter(|m| m.selecteerbaar)
        .take(MAX_TELLINGEN)
    {
        let pad = m.pad.clone();
        let telling = b
            .stap(Duration::from_secs(15), move |s, h| {
                Box::pin(async move {
                    match s.status(&pad, "(MESSAGES UNSEEN)").await {
                        Ok(mb) => Ok(Some((mb.exists, mb.unseen))),
                        Err(async_imap::error::Error::No(_))
                        | Err(async_imap::error::Error::Bad(_)) => Ok(None),
                        Err(e) => Err(imapfout(e, h, Wat::MappenTellen, false)),
                    }
                })
            })
            .await?;
        if let Some((totaal, ongelezen)) = telling {
            m.totaal = Some(totaal);
            m.ongelezen = ongelezen;
        }
    }
    ctx.pool
        .mappen
        .lock()
        .unwrap()
        .insert(sleutel.clone(), (Instant::now(), lijst.clone()));
    Ok(lijst)
}

/// Pad van een speciale map, of `None` als die niet bestaat.
pub async fn speciale_map(ctx: &Context<'_>, soort: Speciaal) -> Uitkomst<Option<String>> {
    Ok(mappen(ctx)
        .await?
        .into_iter()
        .find(|m| m.speciaal == Some(soort) && m.selecteerbaar)
        .map(|m| m.pad))
}

pub async fn maak_map(ctx: &Context<'_>, pad: &str) -> Uitkomst<()> {
    controleer_mapnaam(pad)?;
    let pad = codeer_mapnaam(pad);
    let mut b = ctx.neem().await?;
    b.stap(OPDRACHT_LIMIET, |s, h| {
        Box::pin(async move {
            s.create(&pad)
                .await
                .map_err(|e| imapfout(e, h, Wat::MapAanmaken, false))?;
            let _ = s.subscribe(&pad).await;
            Ok(())
        })
    })
    .await?;
    ctx.pool.wis_mappen(&ctx.account.id);
    Ok(())
}

pub async fn hernoem_map(ctx: &Context<'_>, pad: &str, nieuw: &str) -> Uitkomst<()> {
    controleer_mapnaam(pad)?;
    controleer_mapnaam(nieuw)?;
    if pad.eq_ignore_ascii_case("INBOX") {
        return Err(MailFout::geweigerd("De Inbox kan niet worden hernoemd.")
            .sleutel("imap.cannotRenameInbox"));
    }
    let (oud, nieuw) = (codeer_mapnaam(pad), codeer_mapnaam(nieuw));
    let mut b = ctx.neem().await?;
    b.stap(OPDRACHT_LIMIET, |s, h| {
        Box::pin(async move {
            s.rename(&oud, &nieuw)
                .await
                .map_err(|e| imapfout(e, h, Wat::MapHernoemen, false))
        })
    })
    .await?;
    ctx.pool.wis_mappen(&ctx.account.id);
    Ok(())
}

pub async fn verwijder_map(ctx: &Context<'_>, pad: &str) -> Uitkomst<()> {
    controleer_mapnaam(pad)?;
    if pad.eq_ignore_ascii_case("INBOX") {
        return Err(MailFout::geweigerd("De Inbox kan niet worden verwijderd.")
            .sleutel("imap.cannotDeleteInbox"));
    }
    let pad = codeer_mapnaam(pad);
    let mut b = ctx.neem().await?;
    b.stap(OPDRACHT_LIMIET, |s, h| {
        Box::pin(async move {
            // Een geselecteerde map kan niet altijd worden verwijderd.
            let _ = s.run_command_and_check_ok("UNSELECT").await;
            s.delete(&pad)
                .await
                .map_err(|e| imapfout(e, h, Wat::MapVerwijderen, false))
        })
    })
    .await?;
    ctx.pool.wis_mappen(&ctx.account.id);
    Ok(())
}

fn vlaggen(f: &Fetch) -> Vlaggen {
    let mut v = Vlaggen::default();
    for vlag in f.flags() {
        match vlag {
            Flag::Seen => v.gelezen = true,
            Flag::Flagged => v.gemarkeerd = true,
            Flag::Answered => v.beantwoord = true,
            _ => {}
        }
    }
    v
}

fn kop_uit_fetch(f: &Fetch, map: &str) -> Option<BerichtKop> {
    let uid = f.uid?;
    Some(mime::kop(
        uid,
        map,
        f.header().unwrap_or_default(),
        vlaggen(f),
        f.size.unwrap_or(0),
        f.internal_date().map(|d| d.to_rfc3339()),
    ))
}

/// IMAP-string: ASCII als quoted string, anders als literal. Met LITERAL+
/// (of LITERAL-) is dat een niet-synchroniserende literal; zonder valt het
/// terug op een UTF-8 quoted string (RFC 9051), wat de meeste servers
/// accepteren.
pub fn imap_tekst(t: &str, literal_plus: bool) -> Uitkomst<String> {
    if t.contains(['\r', '\n', '\0']) {
        return Err(MailFout::geweigerd("Zoektekst bevat ongeldige tekens.")
            .sleutel("imap.invalidSearchCharacters"));
    }
    if !t.is_ascii() && literal_plus {
        return Ok(format!("{{{}+}}\r\n{t}", t.len()));
    }
    Ok(format!(
        "\"{}\"",
        t.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

/// SEARCH-criteria voor `zoek` en `alleenOngelezen`.
pub fn zoekcriteria(v: &Lijstverzoek, literal_plus: bool) -> Uitkomst<String> {
    let mut delen: Vec<String> = vec!["NOT DELETED".into()];
    if v.alleen_ongelezen == Some(true) {
        delen.push("UNSEEN".into());
    }
    let mut utf8 = false;
    if let Some(z) = v.zoek.as_ref().filter(|z| !z.tekst.trim().is_empty()) {
        let tekst = z.tekst.trim();
        if tekst.chars().count() > 200 {
            return Err(MailFout::geweigerd("De zoektekst is te lang.").sleutel("imap.searchTooLong"));
        }
        utf8 = !tekst.is_ascii();
        let waarde = imap_tekst(tekst, literal_plus)?;
        let mut velden: Vec<&str> = Vec::new();
        let gekozen: &[Zoekveld] = if z.velden.is_empty() {
            &[
                Zoekveld::Onderwerp,
                Zoekveld::Van,
                Zoekveld::Aan,
                Zoekveld::Inhoud,
            ]
        } else {
            &z.velden
        };
        for veld in gekozen {
            let sleutel = match veld {
                Zoekveld::Onderwerp => "SUBJECT",
                Zoekveld::Van => "FROM",
                Zoekveld::Aan => "TO",
                Zoekveld::Inhoud => "BODY",
            };
            if !velden.contains(&sleutel) {
                velden.push(sleutel);
            }
            if *veld == Zoekveld::Aan && !velden.contains(&"CC") {
                velden.push("CC");
            }
        }
        let termen: Vec<String> = velden.iter().map(|s| format!("{s} {waarde}")).collect();
        // OR is binair: OR (OR a b) c …
        let mut uitdrukking = termen[0].clone();
        for t in &termen[1..] {
            uitdrukking = format!("OR ({uitdrukking}) ({t})");
        }
        delen.push(if termen.len() == 1 {
            uitdrukking
        } else {
            format!("({uitdrukking})")
        });
    }
    let criteria = delen.join(" ");
    Ok(if utf8 {
        format!("CHARSET UTF-8 {criteria}")
    } else {
        criteria
    })
}

fn uidset(uids: &[u32]) -> Uitkomst<String> {
    if uids.is_empty() || uids.contains(&0) {
        return Err(MailFout::geweigerd("Geen geldige berichten opgegeven.")
            .sleutel("imap.noValidMessages"));
    }
    Ok(uids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(","))
}

pub async fn berichten(ctx: &Context<'_>, v: &Lijstverzoek) -> Uitkomst<BerichtLijst> {
    controleer_mapnaam(&v.map)?;
    let aantal = v.aantal.clamp(1, 500);
    let map = v.map.clone();
    let mut b = ctx.neem().await?;
    let literal_plus = b.kan("LITERAL+") || b.kan("LITERAL-");
    let met_zoek = v.alleen_ongelezen == Some(true)
        || v.zoek.as_ref().is_some_and(|z| !z.tekst.trim().is_empty());
    let criteria = if met_zoek {
        Some(zoekcriteria(v, literal_plus)?)
    } else {
        None
    };
    let start = v.start;
    let limiet = OPDRACHT_LIMIET;
    b.stap(limiet, move |s, h| {
        Box::pin(async move {
            let mb = s.examine(&map).await.map_err(|e| {
                imapfout(
                    e,
                    h,
                    Wat::MapOpenenNaam(decodeer_mapnaam(&map)),
                    true,
                )
            })?;
            let mut koppen: Vec<BerichtKop>;
            let totaal: u32;
            match criteria {
                None => {
                    totaal = mb.exists;
                    if start >= totaal {
                        return Ok(BerichtLijst {
                            berichten: vec![],
                            totaal,
                        });
                    }
                    let hoog = totaal - start;
                    let laag = hoog.saturating_sub(aantal - 1).max(1);
                    let fetches: Vec<Fetch> = s
                        .fetch(format!("{laag}:{hoog}"), KOPVELDEN)
                        .await
                        .map_err(|e| imapfout(e, h, Wat::BerichtenOphalen, false))?
                        .try_collect()
                        .await
                        .map_err(|e| imapfout(e, h, Wat::BerichtenOphalen, false))?;
                    let mut met_volgorde: Vec<(u32, BerichtKop)> = fetches
                        .iter()
                        .filter_map(|f| kop_uit_fetch(f, &map).map(|k| (f.message, k)))
                        .collect();
                    met_volgorde.sort_by(|a, b| b.0.cmp(&a.0));
                    koppen = met_volgorde.into_iter().map(|(_, k)| k).collect();
                }
                Some(criteria) => {
                    let mut uids: Vec<u32> = s
                        .uid_search(&criteria)
                        .await
                        .map_err(|e| imapfout(e, h, Wat::Zoeken, false))?
                        .into_iter()
                        .collect();
                    uids.sort_unstable_by(|a, b| b.cmp(a));
                    totaal = uids.len() as u32;
                    let pagina: Vec<u32> = uids
                        .into_iter()
                        .skip(start as usize)
                        .take(aantal as usize)
                        .collect();
                    if pagina.is_empty() {
                        return Ok(BerichtLijst {
                            berichten: vec![],
                            totaal,
                        });
                    }
                    let set = pagina
                        .iter()
                        .map(u32::to_string)
                        .collect::<Vec<_>>()
                        .join(",");
                    let fetches: Vec<Fetch> = s
                        .uid_fetch(set, KOPVELDEN)
                        .await
                        .map_err(|e| imapfout(e, h, Wat::BerichtenOphalen, false))?
                        .try_collect()
                        .await
                        .map_err(|e| imapfout(e, h, Wat::BerichtenOphalen, false))?;
                    let mut per_uid: HashMap<u32, BerichtKop> = fetches
                        .iter()
                        .filter_map(|f| kop_uit_fetch(f, &map).map(|k| (k.uid, k)))
                        .collect();
                    koppen = pagina.iter().filter_map(|u| per_uid.remove(u)).collect();
                }
            }
            koppen.retain(|k| k.uid != 0);
            Ok(BerichtLijst {
                berichten: koppen,
                totaal,
            })
        })
    })
    .await
}

fn bericht_weg() -> MailFout {
    MailFout::niet_gevonden("Dit bericht bestaat niet meer (mogelijk verplaatst of verwijderd).")
        .sleutel("imap.messageGone")
}

/// Haalt de ruwe bron op, na controle van de grootte. `lezen` zet \Seen.
async fn haal_bron(
    ctx: &Context<'_>,
    map: &str,
    uid: u32,
    lezen: bool,
) -> Uitkomst<(Vec<u8>, Vlaggen)> {
    controleer_mapnaam(map)?;
    if uid == 0 {
        return Err(MailFout::geweigerd("Ongeldig bericht.").sleutel("imap.invalidMessage"));
    }
    let max = ctx.limieten.max_bericht;
    let map = map.to_string();
    let mut b = ctx.neem().await?;
    b.stap(GROOT_LIMIET, move |s, h| {
        Box::pin(async move {
            let open = if lezen {
                s.select(&map).await
            } else {
                s.examine(&map).await
            };
            open.map_err(|e| {
                imapfout(
                    e,
                    h,
                    Wat::MapOpenenNaam(decodeer_mapnaam(&map)),
                    true,
                )
            })?;
            let info: Vec<Fetch> = s
                .uid_fetch(uid.to_string(), "(UID FLAGS RFC822.SIZE)")
                .await
                .map_err(|e| imapfout(e, h, Wat::BerichtOphalen, false))?
                .try_collect()
                .await
                .map_err(|e| imapfout(e, h, Wat::BerichtOphalen, false))?;
            let info = info
                .iter()
                .find(|f| f.uid == Some(uid))
                .ok_or_else(bericht_weg)?;
            let grootte = info.size.unwrap_or(0) as usize;
            if grootte > max {
                let (mb, max_mb) = (grootte / (1024 * 1024), max / (1024 * 1024));
                return Err(MailFout::te_groot(format!(
                    "Het bericht is {mb} MB; Email Studio opent berichten tot {max_mb} MB."
                ))
                .sleutel("imap.messageTooLarge")
                .waarde("size", mb)
                .waarde("max", max_mb));
            }
            let mut v = vlaggen(info);
            let query = if lezen {
                "(UID FLAGS BODY[])"
            } else {
                "(UID BODY.PEEK[])"
            };
            let delen: Vec<Fetch> = s
                .uid_fetch(uid.to_string(), query)
                .await
                .map_err(|e| imapfout(e, h, Wat::BerichtOphalen, false))?
                .try_collect()
                .await
                .map_err(|e| imapfout(e, h, Wat::BerichtOphalen, false))?;
            let bron = delen
                .iter()
                .find_map(|f| f.body())
                .ok_or_else(bericht_weg)?
                .to_vec();
            if lezen {
                v.gelezen = true;
            }
            Ok((bron, v))
        })
    })
    .await
}

/// Volledig bericht; openen markeert het als gelezen (zoals gangbare mailprogramma's).
pub async fn bericht(ctx: &Context<'_>, map: &str, uid: u32) -> Uitkomst<Bericht> {
    let (bron, v) = haal_bron(ctx, map, uid, true).await?;
    mime::bericht(uid, map, &bron, v)
}

pub async fn bron(ctx: &Context<'_>, map: &str, uid: u32) -> Uitkomst<Vec<u8>> {
    Ok(haal_bron(ctx, map, uid, false).await?.0)
}

pub async fn markeer(
    ctx: &Context<'_>,
    map: &str,
    uids: &[u32],
    vlag: Vlag,
    aan: bool,
) -> Uitkomst<()> {
    controleer_mapnaam(map)?;
    let set = uidset(uids)?;
    let imapvlag = match vlag {
        Vlag::Gelezen => "\\Seen",
        Vlag::Gemarkeerd => "\\Flagged",
        Vlag::Beantwoord => "\\Answered",
    };
    let map = map.to_string();
    let mut b = ctx.neem().await?;
    b.stap(OPDRACHT_LIMIET, move |s, h| {
        Box::pin(async move {
            s.select(&map)
                .await
                .map_err(|e| imapfout(e, h, Wat::MapOpenen, true))?;
            let opdracht = format!("{}FLAGS.SILENT ({imapvlag})", if aan { "+" } else { "-" });
            s.uid_store(&set, &opdracht)
                .await
                .map_err(|e| imapfout(e, h, Wat::Markeren, false))?
                .try_collect::<Vec<_>>()
                .await
                .map_err(|e| imapfout(e, h, Wat::Markeren, false))?;
            Ok(())
        })
    })
    .await?;
    ctx.pool.wis_mappen(&ctx.account.id);
    Ok(())
}

async fn verplaats_binnen(b: &mut Bezet, map: String, set: String, doel: String) -> Uitkomst<()> {
    let kan_move = b.kan("MOVE");
    let kan_uidplus = b.kan("UIDPLUS");
    b.stap(GROOT_LIMIET, move |s, h| {
        Box::pin(async move {
            s.select(&map)
                .await
                .map_err(|e| imapfout(e, h, Wat::MapOpenen, true))?;
            if kan_move {
                return s
                    .uid_mv(&set, &doel)
                    .await
                    .map_err(|e| imapfout(e, h, Wat::Verplaatsen, false));
            }
            s.uid_copy(&set, &doel)
                .await
                .map_err(|e| imapfout(e, h, Wat::Kopieren, false))?;
            verwijder_in_sessie(s, h, &set, kan_uidplus).await
        })
    })
    .await
}

/// \Deleted zetten en opruimen; met UIDPLUS alleen de eigen berichten.
async fn verwijder_in_sessie(
    s: &mut Sessie,
    h: &str,
    set: &str,
    kan_uidplus: bool,
) -> Uitkomst<()> {
    s.uid_store(set, "+FLAGS.SILENT (\\Deleted)")
        .await
        .map_err(|e| imapfout(e, h, Wat::Verwijderen, false))?
        .try_collect::<Vec<_>>()
        .await
        .map_err(|e| imapfout(e, h, Wat::Verwijderen, false))?;
    if kan_uidplus {
        s.uid_expunge(set)
            .await
            .map_err(|e| imapfout(e, h, Wat::Opruimen, false))?
            .try_collect::<Vec<_>>()
            .await
            .map_err(|e| imapfout(e, h, Wat::Opruimen, false))?;
    } else {
        s.expunge()
            .await
            .map_err(|e| imapfout(e, h, Wat::Opruimen, false))?
            .try_collect::<Vec<_>>()
            .await
            .map_err(|e| imapfout(e, h, Wat::Opruimen, false))?;
    }
    Ok(())
}

pub async fn verplaats(ctx: &Context<'_>, map: &str, uids: &[u32], doel: &str) -> Uitkomst<()> {
    controleer_mapnaam(map)?;
    controleer_mapnaam(doel)?;
    let set = uidset(uids)?;
    if map == doel {
        return Ok(());
    }
    let mut b = ctx.neem().await?;
    verplaats_binnen(&mut b, map.to_string(), set, doel.to_string()).await?;
    drop(b);
    ctx.pool.wis_mappen(&ctx.account.id);
    Ok(())
}

pub async fn verwijder(
    ctx: &Context<'_>,
    map: &str,
    uids: &[u32],
    definitief: bool,
) -> Uitkomst<()> {
    controleer_mapnaam(map)?;
    let set = uidset(uids)?;
    if definitief {
        let map = map.to_string();
        let mut b = ctx.neem().await?;
        let kan_uidplus = b.kan("UIDPLUS");
        b.stap(OPDRACHT_LIMIET, move |s, h| {
            Box::pin(async move {
                s.select(&map)
                    .await
                    .map_err(|e| imapfout(e, h, Wat::MapOpenen, true))?;
                verwijder_in_sessie(s, h, &set, kan_uidplus).await
            })
        })
        .await?;
    } else {
        // Prullenbak eerst opzoeken: `mappen` gebruikt zelf de sessie.
        let prullenbak = speciale_map(ctx, Speciaal::Prullenbak).await?.ok_or_else(|| {
            MailFout::niet_gevonden(
                "Er is geen prullenbak gevonden op de server. Kies een prullenbakmap in de accountinstellingen of verwijder definitief.",
            )
            .sleutel("imap.noTrash")
        })?;
        if prullenbak == map {
            return Err(MailFout::geweigerd(
                "Deze berichten staan al in de prullenbak; verwijder ze definitief.",
            )
            .sleutel("imap.alreadyInTrash"));
        }
        let mut b = ctx.neem().await?;
        verplaats_binnen(&mut b, map.to_string(), set, prullenbak).await?;
    }
    ctx.pool.wis_mappen(&ctx.account.id);
    Ok(())
}

/// APPEND naar een speciale map (Verzonden of Concepten).
pub async fn bewaar_in(
    ctx: &Context<'_>,
    soort: Speciaal,
    ruw: &[u8],
    vlaggen: &str,
) -> Uitkomst<()> {
    let (naam, sleutel) = match soort {
        Speciaal::Verzonden => ("Verzonden", "imap.sentFolderMissing"),
        Speciaal::Concepten => ("Concepten", "imap.draftsFolderMissing"),
        _ => ("map", "imap.specialFolderMissing"),
    };
    let doel = speciale_map(ctx, soort).await?.ok_or_else(|| {
        MailFout::niet_gevonden(format!(
            "Er is geen map voor {naam} gevonden op de server. Kies die map in de accountinstellingen."
        ))
        .sleutel(sleutel)
    })?;
    let ruw = ruw.to_vec();
    let vlaggen = vlaggen.to_string();
    let mut b = ctx.neem().await?;
    b.stap(GROOT_LIMIET, move |s, h| {
        Box::pin(async move {
            s.append(&doel, Some(&vlaggen), None, &ruw)
                .await
                .map_err(|e| imapfout(e, h, Wat::OpslaanIn(soort), false))
        })
    })
    .await?;
    drop(b);
    ctx.pool.wis_mappen(&ctx.account.id);
    Ok(())
}

/// Adressen uit recente berichten (Inbox en Verzonden) voor aanvullen.
pub async fn contacten(ctx: &Context<'_>, zoek: &str) -> Uitkomst<Vec<Adres>> {
    let sleutel = ctx.account.id.clone();
    let bekend = ctx
        .pool
        .contacten
        .lock()
        .unwrap()
        .get(&sleutel)
        .filter(|(t, _)| t.elapsed() < CONTACTEN_TTL)
        .map(|(_, l)| l.clone());
    let lijst = match bekend {
        Some(l) => l,
        None => {
            let mut te_lezen = vec!["INBOX".to_string()];
            if let Some(v) = speciale_map(ctx, Speciaal::Verzonden).await? {
                te_lezen.push(v);
            }
            let eigen = ctx.account.email.to_lowercase();
            let mut tellingen: HashMap<String, (Adres, u32)> = HashMap::new();
            for map in te_lezen {
                let verzoek = Lijstverzoek {
                    map,
                    start: 0,
                    aantal: 300,
                    zoek: None,
                    alleen_ongelezen: None,
                };
                let Ok(lijst) = berichten(ctx, &verzoek).await else {
                    continue;
                };
                for kop in &lijst.berichten {
                    for a in kop.van.iter().chain(&kop.aan).chain(&kop.cc) {
                        let sleutel = a.adres.to_lowercase();
                        if sleutel.is_empty() || sleutel == eigen {
                            continue;
                        }
                        let e = tellingen.entry(sleutel).or_insert_with(|| (a.clone(), 0));
                        e.1 += 1;
                        if e.0.naam.is_empty() && !a.naam.is_empty() {
                            e.0.naam = a.naam.clone();
                        }
                    }
                }
            }
            let mut l: Vec<(Adres, u32)> = tellingen.into_values().collect();
            l.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.adres.cmp(&b.0.adres)));
            ctx.pool
                .contacten
                .lock()
                .unwrap()
                .insert(sleutel, (Instant::now(), l.clone()));
            l
        }
    };
    let zoek = zoek.trim().to_lowercase();
    Ok(lijst
        .into_iter()
        .filter(|(a, _)| {
            zoek.is_empty()
                || a.adres.to_lowercase().contains(&zoek)
                || a.naam.to_lowercase().contains(&zoek)
        })
        .take(20)
        .map(|(a, _)| a)
        .collect())
}

/* ─── MD5 / HMAC-MD5 (RFC 1321, RFC 2104) voor CRAM-MD5 ─── */

pub fn md5(invoer: &[u8]) -> [u8; 16] {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5,
        9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10,
        15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    let k: Vec<u32> = (0..64)
        .map(|i| ((i as f64 + 1.0).sin().abs() * 4294967296.0) as u32)
        .collect();
    let (mut a0, mut b0, mut c0, mut d0) =
        (0x67452301u32, 0xefcdab89u32, 0x98badcfeu32, 0x10325476u32);
    let mut bericht = invoer.to_vec();
    let lengte = (invoer.len() as u64).wrapping_mul(8);
    bericht.push(0x80);
    while bericht.len() % 64 != 56 {
        bericht.push(0);
    }
    bericht.extend_from_slice(&lengte.to_le_bytes());
    for blok in bericht.chunks(64) {
        let m: Vec<u32> = blok
            .chunks(4)
            .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect();
        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | (!b & d), i),
                16..=31 => ((d & b) | (!d & c), (5 * i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | !d), (7 * i) % 16),
            };
            let f = f.wrapping_add(a).wrapping_add(k[i]).wrapping_add(m[g]);
            a = d;
            d = c;
            c = b;
            b = b.wrapping_add(f.rotate_left(S[i]));
        }
        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }
    let mut uit = [0u8; 16];
    for (i, w) in [a0, b0, c0, d0].iter().enumerate() {
        uit[i * 4..i * 4 + 4].copy_from_slice(&w.to_le_bytes());
    }
    uit
}

pub fn hmac_md5(sleutel: &[u8], data: &[u8]) -> [u8; 16] {
    let mut k = [0u8; 64];
    if sleutel.len() > 64 {
        k[..16].copy_from_slice(&md5(sleutel));
    } else {
        k[..sleutel.len()].copy_from_slice(sleutel);
    }
    let mut binnen: Vec<u8> = k.iter().map(|b| b ^ 0x36).collect();
    binnen.extend_from_slice(data);
    let mut buiten: Vec<u8> = k.iter().map(|b| b ^ 0x5c).collect();
    buiten.extend_from_slice(&md5(&binnen));
    md5(&buiten)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    #[test]
    fn md5_en_cram_md5_volgens_rfc() {
        assert_eq!(hex(&md5(b"")), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(
            hex(&md5(b"The quick brown fox jumps over the lazy dog")),
            "9e107d9d372bb6826bd81d3542a419d6"
        );
        // RFC 2104, testgeval 2
        assert_eq!(
            hex(&hmac_md5(b"Jefe", b"what do ya want for nothing?")),
            "750c783e6ab0b503eaa86e310a5db738"
        );
        // RFC 2195
        let mut a = CramMd5 {
            gebruiker: "tim",
            wachtwoord: "tanstaaftanstaaf",
        };
        use async_imap::Authenticator;
        assert_eq!(
            a.process(b"<1896.697170952@postoffice.reston.mci.net>"),
            "tim b913a602c7eda7a495b4e6e7334d3890"
        );
    }

    #[test]
    fn gewijzigd_utf7() {
        assert_eq!(decodeer_mapnaam("INBOX"), "INBOX");
        assert_eq!(decodeer_mapnaam("Entw&APw-rfe"), "Entwürfe");
        assert_eq!(decodeer_mapnaam("&ZeVnLIqe-"), "日本語");
        assert_eq!(decodeer_mapnaam("A&-B"), "A&B");
        assert_eq!(codeer_mapnaam("Entwürfe"), "Entw&APw-rfe");
        assert_eq!(codeer_mapnaam("日本語"), "&ZeVnLIqe-");
        assert_eq!(codeer_mapnaam("A&B"), "A&-B");
        assert_eq!(
            codeer_mapnaam("Entw&APw-rfe/Prüfung"),
            "Entw&APw-rfe/Pr&APw-fung"
        );
        for naam in ["Projecten/Café", "Ω & Co", "a&-b", "😀"] {
            assert_eq!(
                decodeer_mapnaam(&codeer_mapnaam(naam)),
                naam.replace("&-", "&")
            );
        }
    }

    #[test]
    fn speciale_mappen_op_naam() {
        assert_eq!(speciaal_uit_naam("INBOX", "INBOX"), Some(Speciaal::Inbox));
        assert_eq!(
            speciaal_uit_naam("INBOX.Sent", "Sent"),
            Some(Speciaal::Verzonden)
        );
        assert_eq!(
            speciaal_uit_naam("Verzonden items", "Verzonden items"),
            Some(Speciaal::Verzonden)
        );
        assert_eq!(
            speciaal_uit_naam("Prullenbak", "Prullenbak"),
            Some(Speciaal::Prullenbak)
        );
        assert_eq!(
            speciaal_uit_naam("Deleted Items", "Deleted Items"),
            Some(Speciaal::Prullenbak)
        );
        assert_eq!(
            speciaal_uit_naam("Concepten", "Concepten"),
            Some(Speciaal::Concepten)
        );
        assert_eq!(speciaal_uit_naam("Spam", "Spam"), Some(Speciaal::Ongewenst));
        assert_eq!(
            speciaal_uit_naam("Archief", "Archief"),
            Some(Speciaal::Archief)
        );
        assert_eq!(speciaal_uit_naam("Projecten", "Projecten"), None);
    }

    #[test]
    fn zoekcriteria_opbouw() {
        let v = |tekst: &str, velden: Vec<Zoekveld>, ongelezen| Lijstverzoek {
            map: "INBOX".into(),
            start: 0,
            aantal: 50,
            zoek: Some(super::super::Zoekopdracht {
                tekst: tekst.into(),
                velden,
            }),
            alleen_ongelezen: Some(ongelezen),
        };
        assert_eq!(
            zoekcriteria(&v("offerte", vec![Zoekveld::Onderwerp], false), false).unwrap(),
            "NOT DELETED SUBJECT \"offerte\""
        );
        assert_eq!(
            zoekcriteria(
                &v("a\"b", vec![Zoekveld::Onderwerp, Zoekveld::Van], true),
                false
            )
            .unwrap(),
            "NOT DELETED UNSEEN (OR (SUBJECT \"a\\\"b\") (FROM \"a\\\"b\"))"
        );
        assert_eq!(
            zoekcriteria(&v("x", vec![Zoekveld::Aan], false), false).unwrap(),
            "NOT DELETED (OR (TO \"x\") (CC \"x\"))"
        );
        assert_eq!(
            zoekcriteria(&v("café", vec![Zoekveld::Inhoud], false), true).unwrap(),
            "CHARSET UTF-8 NOT DELETED BODY {5+}\r\ncafé"
        );
        assert_eq!(
            zoekcriteria(&v("café", vec![Zoekveld::Inhoud], false), false).unwrap(),
            "CHARSET UTF-8 NOT DELETED BODY \"café\""
        );
        assert!(zoekcriteria(&v("a\r\nb", vec![], false), false).is_err());
        let leeg = Lijstverzoek {
            map: "INBOX".into(),
            start: 0,
            aantal: 1,
            zoek: None,
            alleen_ongelezen: Some(true),
        };
        assert_eq!(zoekcriteria(&leeg, false).unwrap(), "NOT DELETED UNSEEN");
    }

    #[test]
    fn uidsets() {
        assert_eq!(uidset(&[3, 1, 2]).unwrap(), "3,1,2");
        assert!(uidset(&[]).is_err());
        assert!(uidset(&[0]).is_err());
    }
}
