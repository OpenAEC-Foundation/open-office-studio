//! Automatisch zoeken naar de mailservers bij een e-mailadres, zoals
//! Thunderbird: voorinstellingen, autoconfig van het eigen domein, DNS-SRV
//! (RFC 6186/8314), herkenning van de provider aan de MX-records, optioneel
//! de Thunderbird-ISPDB, en gangbare hostnamen met een verbindingsproef
//! zonder aanmelden. Alles loopt parallel binnen een totale tijdslimiet;
//! wat op tijd binnen is telt.

use super::autoconfig::{self, is_domein};
use super::fout::{Foutcode, servertekst, uit_io};
use super::oauth::Provider as OAuthProvider;
use super::{Authenticatie, Bereikbaar, Beveiliging, ConfiguratieVoorstel, VoorstelServer};
use serde::Deserialize;
use std::collections::HashMap;
use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::Instant;

pub type BoxFut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Clone, Debug, Default, Deserialize)]
pub struct ZoekOpties {
    #[serde(default)]
    pub ispdb: Option<bool>,
    #[serde(default)]
    pub proef: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SrvRecord {
    pub prioriteit: u16,
    pub gewicht: u16,
    pub poort: u16,
    pub doel: String,
}

/// DNS-toegang; in tests vervangen door een nepversie.
pub trait Dns: Send + Sync {
    fn srv<'a>(&'a self, naam: &'a str) -> BoxFut<'a, Vec<SrvRecord>>;
    fn mx<'a>(&'a self, domein: &'a str) -> BoxFut<'a, Vec<(u16, String)>>;
    fn adressen<'a>(&'a self, host: &'a str, poort: u16) -> BoxFut<'a, Vec<SocketAddr>>;
}

/// Systeemresolver (resolv.conf / Windows-register) via hickory-resolver.
#[derive(Default)]
pub struct SysteemDns {
    resolver: OnceLock<Option<hickory_resolver::TokioResolver>>,
}

impl SysteemDns {
    fn resolver(&self) -> Option<&hickory_resolver::TokioResolver> {
        self.resolver
            .get_or_init(|| {
                hickory_resolver::TokioResolver::builder_tokio()
                    .ok()
                    .and_then(|b| b.build().ok())
            })
            .as_ref()
    }
}

fn naamtekst(n: &hickory_resolver::proto::rr::Name) -> String {
    n.to_ascii().trim_end_matches('.').to_ascii_lowercase()
}

impl Dns for SysteemDns {
    fn srv<'a>(&'a self, naam: &'a str) -> BoxFut<'a, Vec<SrvRecord>> {
        Box::pin(async move {
            use hickory_resolver::proto::rr::RData;
            let Some(r) = self.resolver() else {
                return Vec::new();
            };
            let Ok(l) = r.srv_lookup(format!("{naam}.")).await else {
                return Vec::new();
            };
            l.answers()
                .iter()
                .filter_map(|rec| match &rec.data {
                    RData::SRV(s) => Some(SrvRecord {
                        prioriteit: s.priority,
                        gewicht: s.weight,
                        poort: s.port,
                        doel: naamtekst(&s.target),
                    }),
                    _ => None,
                })
                .collect()
        })
    }
    fn mx<'a>(&'a self, domein: &'a str) -> BoxFut<'a, Vec<(u16, String)>> {
        Box::pin(async move {
            use hickory_resolver::proto::rr::RData;
            let Some(r) = self.resolver() else {
                return Vec::new();
            };
            let Ok(l) = r.mx_lookup(format!("{domein}.")).await else {
                return Vec::new();
            };
            l.answers()
                .iter()
                .filter_map(|rec| match &rec.data {
                    RData::MX(m) => Some((m.preference, naamtekst(&m.exchange))),
                    _ => None,
                })
                .collect()
        })
    }
    fn adressen<'a>(&'a self, host: &'a str, poort: u16) -> BoxFut<'a, Vec<SocketAddr>> {
        Box::pin(async move {
            tokio::net::lookup_host((host, poort))
                .await
                .map(|a| a.collect())
                .unwrap_or_default()
        })
    }
}

/// Voortgangsmelding (stap, status) voor de interface.
pub type Voortgang = Arc<dyn Fn(&str, &str) + Send + Sync>;

pub struct Zoeker {
    pub dns: Arc<dyn Dns>,
    pub tls: Arc<rustls::ClientConfig>,
    /// Sjablonen met `{domein}`.
    pub autoconfig_urls: Vec<String>,
    pub ispdb_url: String,
    pub limiet_bronnen: Duration,
    pub limiet_totaal: Duration,
    pub limiet_proef: Duration,
    pub gelijktijdig: usize,
    pub voortgang: Option<Voortgang>,
}

impl Default for Zoeker {
    fn default() -> Self {
        Self {
            dns: Arc::new(SysteemDns::default()),
            tls: super::imap::tls_instellingen(),
            autoconfig_urls: vec![
                "https://autoconfig.{domein}/mail/config-v1.1.xml".into(),
                "https://{domein}/.well-known/autoconfig/mail/config-v1.1.xml".into(),
            ],
            ispdb_url: "https://autoconfig.thunderbird.net/v1.1/{domein}".into(),
            limiet_bronnen: Duration::from_secs(7),
            limiet_totaal: Duration::from_secs(10),
            limiet_proef: Duration::from_secs(5),
            gelijktijdig: 6,
            voortgang: None,
        }
    }
}

/* ─── MX-herkenning ─── */

pub struct MxProvider {
    pub naam: &'static str,
    pub imap: (String, u16, Beveiliging),
    pub smtp: (String, u16, Beveiliging),
    pub oauth: Option<OAuthProvider>,
    pub opmerking: Option<&'static str>,
    /// Hostingprovider: ook in de ISPDB opzoeken onder het MX-domein.
    pub hosting: bool,
}

fn eindigt_op(host: &str, achtervoegsel: &str) -> bool {
    host == achtervoegsel || host.ends_with(&format!(".{achtervoegsel}"))
}

/// Herkent bekende providers aan het doel van een MX-record.
pub fn mx_provider(mx: &str, domein: &str) -> Option<MxProvider> {
    use Beveiliging::*;
    let mx = mx.trim_end_matches('.').to_ascii_lowercase();
    let p = |naam, ih: &str, ip, ib, sh: &str, sp, sb| MxProvider {
        naam,
        imap: (ih.to_string(), ip, ib),
        smtp: (sh.to_string(), sp, sb),
        oauth: None,
        opmerking: None,
        hosting: false,
    };
    let hosting_algemeen = |naam| MxProvider {
        opmerking: Some(
            "Deze hostingprovider gebruikt per pakket eigen servernamen; controleer ze in het klantenpaneel.",
        ),
        hosting: true,
        ..p(
            naam,
            &format!("mail.{domein}"),
            993,
            Ssl,
            &format!("mail.{domein}"),
            465,
            Ssl,
        )
    };
    let e = |s| eindigt_op(&mx, s);
    Some(if e("google.com") || e("googlemail.com") {
        MxProvider {
            oauth: Some(OAuthProvider::Google),
            ..p(
                "Google Workspace / Gmail",
                "imap.gmail.com",
                993,
                Ssl,
                "smtp.gmail.com",
                465,
                Ssl,
            )
        }
    } else if e("mail.protection.outlook.com") || e("outlook.com") {
        MxProvider {
            oauth: Some(OAuthProvider::Microsoft),
            ..p(
                "Microsoft 365",
                "outlook.office365.com",
                993,
                Ssl,
                "smtp.office365.com",
                587,
                Starttls,
            )
        }
    } else if e("ovh.net") || e("ovh.com") {
        MxProvider {
            hosting: true,
            ..p(
                "OVHcloud",
                "ssl0.ovh.net",
                993,
                Ssl,
                "ssl0.ovh.net",
                465,
                Ssl,
            )
        }
    } else if e("transip.email") || e("transip.nl") || e("transip.net") {
        MxProvider {
            hosting: true,
            ..p(
                "TransIP",
                "imap.transip.email",
                993,
                Ssl,
                "smtp.transip.email",
                465,
                Ssl,
            )
        }
    } else if e("rzone.de") || e("strato.de") || e("strato.nl") {
        MxProvider {
            hosting: true,
            ..p(
                "STRATO",
                "imap.strato.de",
                993,
                Ssl,
                "smtp.strato.de",
                465,
                Ssl,
            )
        }
    } else if e("one.com") {
        MxProvider {
            hosting: true,
            ..p(
                "one.com",
                "imap.one.com",
                993,
                Ssl,
                "send.one.com",
                465,
                Ssl,
            )
        }
    } else if e("hostnet.nl") {
        MxProvider {
            hosting: true,
            ..p(
                "Hostnet",
                "imap.hostnet.nl",
                993,
                Ssl,
                "smtp.hostnet.nl",
                465,
                Ssl,
            )
        }
    } else if e("antagonist.nl") {
        hosting_algemeen("Antagonist")
    } else if e("mijndomein.nl") {
        hosting_algemeen("Mijndomein")
    } else if e("versio.nl") || e("versio.eu") {
        hosting_algemeen("Versio")
    } else if e("ionos.nl") {
        MxProvider {
            hosting: true,
            ..p(
                "IONOS",
                "imap.ionos.nl",
                993,
                Ssl,
                "smtp.ionos.nl",
                465,
                Ssl,
            )
        }
    } else if e("ionos.de")
        || e("ionos.com")
        || e("1and1.com")
        || e("1and1.nl")
        || e("kundenserver.de")
    {
        MxProvider {
            hosting: true,
            ..p(
                "IONOS (1&1)",
                "imap.ionos.de",
                993,
                Ssl,
                "smtp.ionos.de",
                465,
                Ssl,
            )
        }
    } else if e("zoho.eu") {
        p(
            "Zoho Mail",
            "imap.zoho.eu",
            993,
            Ssl,
            "smtp.zoho.eu",
            465,
            Ssl,
        )
    } else if e("zoho.com") || e("zohomail.com") {
        p(
            "Zoho Mail",
            "imap.zoho.com",
            993,
            Ssl,
            "smtp.zoho.com",
            465,
            Ssl,
        )
    } else if e("messagingengine.com") || e("fastmail.com") {
        p(
            "Fastmail",
            "imap.fastmail.com",
            993,
            Ssl,
            "smtp.fastmail.com",
            465,
            Ssl,
        )
    } else if e("kpnmail.nl") || e("kpn.com") {
        p(
            "KPN",
            "imap.kpnmail.nl",
            993,
            Ssl,
            "smtp.kpnmail.nl",
            587,
            Starttls,
        )
    } else if e("ziggo.nl") {
        p(
            "Ziggo",
            "imap.ziggo.nl",
            993,
            Ssl,
            "smtp.ziggo.nl",
            587,
            Starttls,
        )
    } else if e("xs4all.nl") {
        p(
            "XS4ALL",
            "imap.xs4all.nl",
            993,
            Ssl,
            "smtp.xs4all.nl",
            465,
            Ssl,
        )
    } else if e("mailbox.org") {
        p(
            "mailbox.org",
            "imap.mailbox.org",
            993,
            Ssl,
            "smtp.mailbox.org",
            465,
            Ssl,
        )
    } else if e("protonmail.ch") || e("proton.me") {
        MxProvider {
            opmerking: Some(
                "Proton Mail werkt alleen via de Proton Mail Bridge op deze computer; start de Bridge en gebruik het wachtwoord dat de Bridge toont.",
            ),
            ..p(
                "Proton Mail (via Proton Mail Bridge)",
                "127.0.0.1",
                1143,
                Geen,
                "127.0.0.1",
                1025,
                Geen,
            )
        }
    } else if e("yandex.net") || e("yandex.ru") || e("yandex.com") {
        p(
            "Yandex Mail",
            "imap.yandex.com",
            993,
            Ssl,
            "smtp.yandex.com",
            465,
            Ssl,
        )
    } else {
        return None;
    })
}

/// Grof het registreerbare domein (laatste twee labels) van een MX-doel.
fn basisdomein(host: &str) -> String {
    let delen: Vec<&str> = host.trim_end_matches('.').split('.').collect();
    delen[delen.len().saturating_sub(2)..].join(".")
}

/* ─── SRV ─── */

/// Kiest het beste SRV-doel (laagste prioriteit, hoogste gewicht); "." betekent
/// dat de dienst niet wordt aangeboden (RFC 2782).
pub fn beste_srv(records: &[SrvRecord]) -> Option<SrvRecord> {
    let mut r: Vec<&SrvRecord> = records
        .iter()
        .filter(|s| !s.doel.is_empty() && s.doel != "." && s.poort != 0)
        .collect();
    r.sort_by(|a, b| {
        a.prioriteit
            .cmp(&b.prioriteit)
            .then(b.gewicht.cmp(&a.gewicht))
    });
    r.first().map(|s| SrvRecord {
        doel: s.doel.trim_end_matches('.').to_ascii_lowercase(),
        ..(*s).clone()
    })
}

fn server(host: &str, poort: u16, beveiliging: Beveiliging, gebruiker: &str) -> VoorstelServer {
    VoorstelServer {
        host: host.to_string(),
        poort,
        beveiliging,
        authenticatie: Authenticatie::Normaal,
        gebruikersnaam: Some(gebruiker.to_string()),
    }
}

/// Voorstel uit SRV-records (RFC 8314: impliciete TLS heeft voorkeur).
pub fn srv_voorstel(
    imaps: &[SrvRecord],
    imap: &[SrvRecord],
    submissions: &[SrvRecord],
    submission: &[SrvRecord],
    email: &str,
    domein: &str,
) -> Option<ConfiguratieVoorstel> {
    let i = beste_srv(imaps)
        .map(|s| (s, Beveiliging::Ssl))
        .or_else(|| beste_srv(imap).map(|s| (s, Beveiliging::Starttls)));
    let o = beste_srv(submissions)
        .map(|s| (s, Beveiliging::Ssl))
        .or_else(|| beste_srv(submission).map(|s| (s, Beveiliging::Starttls)));
    if i.is_none() && o.is_none() {
        return None;
    }
    let mut toelichting = format!("DNS-SRV-records van {domein}");
    let imap = match i {
        Some((s, b)) => server(&s.doel, s.poort, b, email),
        None => {
            toelichting.push_str(" (alleen SMTP; IMAP is een gok)");
            server(&format!("imap.{domein}"), 993, Beveiliging::Ssl, email)
        }
    };
    let smtp = match o {
        Some((s, b)) => server(&s.doel, s.poort, b, email),
        None => {
            toelichting.push_str(" (alleen IMAP; SMTP is een gok)");
            server(&format!("smtp.{domein}"), 587, Beveiliging::Starttls, email)
        }
    };
    if !autoconfig::is_host(&imap.host) || !autoconfig::is_host(&smtp.host) {
        return None;
    }
    Some(ConfiguratieVoorstel {
        bron: "srv".into(),
        toelichting: Some(format!("{toelichting}.")),
        imap,
        smtp,
        ..Default::default()
    })
}

/* ─── Rangschikken en ontdubbelen ─── */

fn rang(v: &ConfiguratieVoorstel) -> u8 {
    match v.bron.as_str() {
        "voorinstelling" | "autoconfig" | "ispdb" => 0,
        "srv" => 1,
        "mx" => 2,
        _ => match v.bereikbaar {
            Some(Bereikbaar {
                imap: Some(true),
                smtp: Some(true),
            }) => 3,
            _ => 4,
        },
    }
}

fn bronnaam(b: &str) -> &str {
    match b {
        "voorinstelling" => "ingebouwde lijst",
        "autoconfig" => "configuratiebestand van het domein",
        "srv" => "DNS-SRV",
        "mx" => "MX-record",
        "ispdb" => "Thunderbird-ISPDB",
        _ => "gangbare servernamen",
    }
}

/// Beste eerst; gelijke servers samengevoegd (bronnen in de toelichting).
pub fn rangschik(mut lijst: Vec<ConfiguratieVoorstel>) -> Vec<ConfiguratieVoorstel> {
    lijst.sort_by_key(rang); // stabiel: volgorde binnen een rang blijft
    let mut uit: Vec<ConfiguratieVoorstel> = Vec::new();
    for v in lijst {
        let sleutel = |x: &ConfiguratieVoorstel| {
            (
                x.imap.host.to_ascii_lowercase(),
                x.imap.poort,
                x.smtp.host.to_ascii_lowercase(),
                x.smtp.poort,
            )
        };
        match uit.iter_mut().find(|u| sleutel(u) == sleutel(&v)) {
            Some(u) => {
                let extra = format!("Ook gevonden via {}.", bronnaam(&v.bron));
                if !u.toelichting.as_deref().unwrap_or("").contains(&extra) && u.bron != v.bron {
                    u.toelichting = Some(match u.toelichting.take() {
                        Some(t) => format!("{t} {extra}"),
                        None => extra,
                    });
                }
                if u.provider.is_none() {
                    u.provider = v.provider;
                }
                if u.oauth.is_none() {
                    u.oauth = v.oauth;
                }
                if u.bereikbaar.is_none() {
                    u.bereikbaar = v.bereikbaar;
                }
            }
            None => uit.push(v),
        }
    }
    uit
}

/* ─── Verbindingsproef zonder aanmelden ─── */

async fn lees_regel<S: AsyncRead + Unpin>(s: &mut S) -> std::io::Result<String> {
    let mut regel = Vec::new();
    let mut b = [0u8; 1];
    loop {
        if s.read(&mut b).await? == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        regel.push(b[0]);
        if b[0] == b'\n' || regel.len() > 8192 {
            return Ok(String::from_utf8_lossy(&regel).trim_end().to_string());
        }
    }
}

/// Leest een (meerregelig) SMTP-antwoord: (code, alle regels).
async fn smtp_antwoord<S: AsyncRead + Unpin>(s: &mut S) -> std::io::Result<(u16, Vec<String>)> {
    let mut regels = Vec::new();
    loop {
        let r = lees_regel(s).await?;
        let einde = r.as_bytes().get(3) != Some(&b'-');
        let code = r.get(..3).and_then(|c| c.parse().ok()).unwrap_or(0);
        regels.push(r);
        if einde || regels.len() > 100 {
            return Ok((code, regels));
        }
    }
}

async fn imap_tot_tag<S: AsyncRead + Unpin>(
    s: &mut S,
    tag: &str,
) -> std::io::Result<(bool, Vec<String>)> {
    let mut regels = Vec::new();
    loop {
        let r = lees_regel(s).await?;
        if let Some(rest) = r.strip_prefix(&format!("{tag} ")) {
            return Ok((rest.to_ascii_uppercase().starts_with("OK"), regels));
        }
        regels.push(r);
        if regels.len() > 100 {
            return Ok((false, regels));
        }
    }
}

async fn imap_capability<S: AsyncRead + AsyncWrite + Unpin>(s: &mut S) -> std::io::Result<bool> {
    s.write_all(b"p1 CAPABILITY\r\n").await?;
    let (ok, regels) = imap_tot_tag(s, "p1").await?;
    let _ = s.write_all(b"p2 LOGOUT\r\n").await;
    Ok(ok
        && regels
            .iter()
            .any(|r| r.to_ascii_uppercase().contains("IMAP4")))
}

async fn smtp_ehlo<S: AsyncRead + AsyncWrite + Unpin>(
    s: &mut S,
) -> std::io::Result<(bool, Vec<String>)> {
    s.write_all(b"EHLO [127.0.0.1]\r\n").await?;
    let (code, regels) = smtp_antwoord(s).await?;
    Ok((code == 250, regels))
}

type Proefuitkomst = (bool, Option<String>);

impl Zoeker {
    async fn tls(
        &self,
        tcp: TcpStream,
        host: &str,
    ) -> Result<tokio_rustls::client::TlsStream<TcpStream>, String> {
        let naam = rustls::pki_types::ServerName::try_from(host.to_string())
            .map_err(|_| "ongeldige servernaam".to_string())?;
        tokio_rustls::TlsConnector::from(self.tls.clone())
            .connect(naam, tcp)
            .await
            .map_err(|e| {
                let f = uit_io(&e, host);
                if f.code == Foutcode::Certificaat {
                    f.melding
                } else {
                    format!("geen beveiligde verbinding met {host}")
                }
            })
    }

    async fn verbind(&self, s: &VoorstelServer) -> Result<TcpStream, String> {
        let adressen = self.dns.adressen(&s.host, s.poort).await;
        for a in adressen {
            if s.beveiliging == Beveiliging::Geen && !a.ip().is_loopback() {
                continue;
            }
            if let Ok(Ok(t)) =
                tokio::time::timeout(Duration::from_secs(3), TcpStream::connect(a)).await
            {
                return Ok(t);
            }
        }
        Err(format!("{}:{} is niet bereikbaar", s.host, s.poort))
    }

    /// TCP + TLS (met certificaatcontrole) + CAPABILITY of EHLO, zonder aanmelden.
    pub async fn proef(&self, s: &VoorstelServer, smtp: bool) -> Proefuitkomst {
        let r: Result<bool, String> = async {
            let mut tcp = self.verbind(s).await?;
            let io = |e: std::io::Error| servertekst(&e.to_string());
            match (s.beveiliging, smtp) {
                (Beveiliging::Ssl, false) => {
                    let mut t = self.tls(tcp, &s.host).await?;
                    let groet = lees_regel(&mut t).await.map_err(io)?;
                    Ok(groet.starts_with("* OK") && imap_capability(&mut t).await.map_err(io)?)
                }
                (Beveiliging::Starttls, false) => {
                    lees_regel(&mut tcp).await.map_err(io)?;
                    tcp.write_all(b"p0 STARTTLS\r\n").await.map_err(io)?;
                    if !imap_tot_tag(&mut tcp, "p0").await.map_err(io)?.0 {
                        return Err("de server biedt geen STARTTLS aan".into());
                    }
                    let mut t = self.tls(tcp, &s.host).await?;
                    imap_capability(&mut t).await.map_err(io)
                }
                (Beveiliging::Geen, false) => {
                    let groet = lees_regel(&mut tcp).await.map_err(io)?;
                    Ok(groet.starts_with("* OK") && imap_capability(&mut tcp).await.map_err(io)?)
                }
                (Beveiliging::Ssl, true) => {
                    let mut t = self.tls(tcp, &s.host).await?;
                    let (code, _) = smtp_antwoord(&mut t).await.map_err(io)?;
                    let ok = code == 220 && smtp_ehlo(&mut t).await.map_err(io)?.0;
                    let _ = t.write_all(b"QUIT\r\n").await;
                    Ok(ok)
                }
                (Beveiliging::Starttls, true) => {
                    if smtp_antwoord(&mut tcp).await.map_err(io)?.0 != 220 {
                        return Ok(false);
                    }
                    let (ok, regels) = smtp_ehlo(&mut tcp).await.map_err(io)?;
                    if !ok
                        || !regels
                            .iter()
                            .any(|r| r.to_ascii_uppercase().contains("STARTTLS"))
                    {
                        return Err("de server biedt geen STARTTLS aan".into());
                    }
                    tcp.write_all(b"STARTTLS\r\n").await.map_err(io)?;
                    if smtp_antwoord(&mut tcp).await.map_err(io)?.0 != 220 {
                        return Err("STARTTLS geweigerd".into());
                    }
                    let mut t = self.tls(tcp, &s.host).await?;
                    let ok = smtp_ehlo(&mut t).await.map_err(io)?.0;
                    let _ = t.write_all(b"QUIT\r\n").await;
                    Ok(ok)
                }
                (Beveiliging::Geen, true) => {
                    let ok = smtp_antwoord(&mut tcp).await.map_err(io)?.0 == 220
                        && smtp_ehlo(&mut tcp).await.map_err(io)?.0;
                    let _ = tcp.write_all(b"QUIT\r\n").await;
                    Ok(ok)
                }
            }
        }
        .await;
        match r {
            Ok(true) => (true, None),
            Ok(false) => (
                false,
                Some(format!("{} antwoordde niet als mailserver", s.host)),
            ),
            Err(m) => (false, Some(m)),
        }
    }

    fn meld(&self, stap: &str, status: &str) {
        if let Some(v) = &self.voortgang {
            v(stap, status);
        }
    }

    async fn haal(&self, url: &str) -> Option<String> {
        let (tls, host, poort, pad) = super::oauth::ontleed_url(url).ok()?;
        if tls {
            autoconfig::haal_https(&host, poort, &pad).await.ok()
        } else {
            let (status, _, lichaam) = autoconfig::http_verzoek(
                &host,
                poort,
                false,
                "GET",
                &pad,
                "application/xml, text/xml",
                None,
            )
            .await
            .ok()?;
            (status == 200)
                .then(|| String::from_utf8(lichaam).ok())
                .flatten()
        }
    }

    async fn xml_bron(
        &self,
        sjabloon: &str,
        domein: &str,
        email: &str,
        bron: &str,
        uitleg: String,
    ) -> Option<ConfiguratieVoorstel> {
        let xml = self.haal(&sjabloon.replace("{domein}", domein)).await?;
        let mut v = autoconfig::ontleed_xml(&xml, email)?;
        v.bron = bron.into();
        v.toelichting = Some(uitleg);
        let (naam, oauth) = autoconfig::provider_bij_host(&v.imap.host);
        v.provider = v.provider.or(naam.map(str::to_string));
        v.oauth = oauth;
        Some(v)
    }

    async fn ispdb(
        &self,
        domein: &str,
        email: &str,
        waarom: String,
    ) -> Option<ConfiguratieVoorstel> {
        self.xml_bron(&self.ispdb_url, domein, email, "ispdb", waarom)
            .await
    }

    async fn autoconfig(&self, domein: &str, email: &str) -> Vec<ConfiguratieVoorstel> {
        let pogingen = self.autoconfig_urls.iter().map(|u| {
            self.xml_bron(
                u,
                domein,
                email,
                "autoconfig",
                format!("Configuratiebestand van {domein}."),
            )
        });
        futures::future::join_all(pogingen)
            .await
            .into_iter()
            .flatten()
            .take(1)
            .collect()
    }

    async fn srv(&self, domein: &str, email: &str) -> Option<ConfiguratieVoorstel> {
        let namen = [
            "_imaps._tcp",
            "_imap._tcp",
            "_submissions._tcp",
            "_submission._tcp",
        ]
        .map(|n| format!("{n}.{domein}"));
        let [a, b, c, d] = &namen;
        let (a, b, c, d) = tokio::join!(
            self.dns.srv(a),
            self.dns.srv(b),
            self.dns.srv(c),
            self.dns.srv(d)
        );
        srv_voorstel(&a, &b, &c, &d, email, domein)
    }

    async fn mx(&self, domein: &str, email: &str, ispdb: bool) -> Vec<ConfiguratieVoorstel> {
        let mut mx = self.dns.mx(domein).await;
        mx.sort();
        let Some((_, doel)) = mx.into_iter().find(|(_, d)| is_domein(d)) else {
            return Vec::new();
        };
        let mut uit = Vec::new();
        let herkend = mx_provider(&doel, domein);
        if let Some(p) = &herkend {
            let mut toelichting = format!("MX-record wijst naar {doel} ({}).", p.naam);
            if let Some(o) = p.opmerking {
                toelichting = format!("{toelichting} {o}");
            }
            uit.push(ConfiguratieVoorstel {
                bron: "mx".into(),
                provider: Some(p.naam.to_string()),
                toelichting: Some(toelichting),
                oauth: p.oauth,
                imap: server(&p.imap.0, p.imap.1, p.imap.2, email),
                smtp: server(&p.smtp.0, p.smtp.1, p.smtp.2, email),
                ..Default::default()
            });
        }
        // Zoals Thunderbird: ook de ISPDB van het MX-domein (hostingproviders).
        let basis = basisdomein(&doel);
        if ispdb
            && basis != domein
            && herkend.as_ref().is_none_or(|p| p.hosting)
            && let Some(v) = self
                .ispdb(
                    &basis,
                    email,
                    format!("Thunderbird-ISPDB voor {basis} (MX-record wijst naar {doel})."),
                )
                .await
        {
            uit.push(v);
        }
        uit
    }

    pub async fn zoek(&self, email: &str, opties: &ZoekOpties) -> Vec<ConfiguratieVoorstel> {
        let email = email.trim();
        let Some((_, domein)) = email
            .rsplit_once('@')
            .map(|(l, d)| (l, d.trim_end_matches('.').to_ascii_lowercase()))
        else {
            return Vec::new();
        };
        if !super::mime::is_adres(email) {
            return Vec::new();
        }
        let ispdb = opties.ispdb.unwrap_or(false);
        let proef = opties.proef.unwrap_or(true);
        let begin = Instant::now();
        let bronnen_tot = begin + self.limiet_bronnen;
        let totaal_tot = begin + self.limiet_totaal;

        self.meld("voorinstelling", "bezig");
        let mut lijst: Vec<ConfiguratieVoorstel> =
            autoconfig::voorinstelling(email).into_iter().collect();
        self.meld("voorinstelling", "klaar");

        let binnen = |f| tokio::time::timeout_at(bronnen_tot, f);
        let domeinstap = async {
            self.meld("autoconfig", "bezig");
            let r = binnen(self.autoconfig(&domein, email))
                .await
                .unwrap_or_default();
            self.meld("autoconfig", "klaar");
            r
        };
        let dnsstap = async {
            let srv = async {
                self.meld("srv", "bezig");
                let r = tokio::time::timeout_at(bronnen_tot, self.srv(&domein, email)).await;
                self.meld("srv", "klaar");
                r.ok().flatten()
            };
            let mx = async {
                self.meld("mx", "bezig");
                let r = tokio::time::timeout_at(bronnen_tot, self.mx(&domein, email, ispdb)).await;
                self.meld("mx", "klaar");
                r.unwrap_or_default()
            };
            tokio::join!(srv, mx)
        };
        let ispdbstap = async {
            if !ispdb {
                return None;
            }
            self.meld("ispdb", "bezig");
            let r = tokio::time::timeout_at(
                bronnen_tot,
                self.ispdb(&domein, email, format!("Thunderbird-ISPDB voor {domein}.")),
            )
            .await
            .ok()
            .flatten();
            self.meld("ispdb", "klaar");
            r
        };
        let (auto, (srv, mx), isp) = tokio::join!(domeinstap, dnsstap, ispdbstap);
        lijst.extend(auto);
        lijst.extend(isp);
        lijst.extend(srv);
        lijst.extend(mx);

        // Gok: gangbare namen per protocol, de proef kiest de beste.
        let imap_gok: Vec<VoorstelServer> = [
            format!("imap.{domein}"),
            format!("mail.{domein}"),
            domein.clone(),
        ]
        .iter()
        .flat_map(|h| {
            [
                server(h, 993, Beveiliging::Ssl, email),
                server(h, 143, Beveiliging::Starttls, email),
            ]
        })
        .collect();
        let smtp_gok: Vec<VoorstelServer> = [format!("smtp.{domein}"), format!("mail.{domein}")]
            .iter()
            .flat_map(|h| {
                [
                    server(h, 465, Beveiliging::Ssl, email),
                    server(h, 587, Beveiliging::Starttls, email),
                ]
            })
            .collect();

        let mut uitkomsten: HashMap<(bool, String, u16, Beveiliging), Proefuitkomst> =
            HashMap::new();
        if proef {
            self.meld("proef", "bezig");
            let mut te_proberen: Vec<(bool, VoorstelServer)> = Vec::new();
            for v in &lijst {
                te_proberen.push((false, v.imap.clone()));
                te_proberen.push((true, v.smtp.clone()));
            }
            te_proberen.extend(imap_gok.iter().cloned().map(|s| (false, s)));
            te_proberen.extend(smtp_gok.iter().cloned().map(|s| (true, s)));
            let mut gezien = std::collections::HashSet::new();
            te_proberen.retain(|(smtp, s)| {
                gezien.insert((*smtp, s.host.to_ascii_lowercase(), s.poort, s.beveiliging))
            });
            let slot = Arc::new(tokio::sync::Semaphore::new(self.gelijktijdig.max(1)));
            let taken = te_proberen.into_iter().map(|(smtp, s)| {
                let slot = slot.clone();
                async move {
                    let _vergunning = slot.acquire().await.ok()?;
                    let tot = (Instant::now() + self.limiet_proef).min(totaal_tot);
                    let r = tokio::time::timeout_at(tot, self.proef(&s, smtp))
                        .await
                        .ok()?;
                    Some((
                        (smtp, s.host.to_ascii_lowercase(), s.poort, s.beveiliging),
                        r,
                    ))
                }
            });
            let resultaten = tokio::time::timeout_at(
                totaal_tot + Duration::from_millis(200),
                futures::future::join_all(taken),
            )
            .await
            .unwrap_or_default();
            uitkomsten.extend(resultaten.into_iter().flatten());
            self.meld("proef", "klaar");
        }
        let uitkomst = |smtp: bool, s: &VoorstelServer| {
            uitkomsten
                .get(&(smtp, s.host.to_ascii_lowercase(), s.poort, s.beveiliging))
                .cloned()
        };
        if proef {
            for v in lijst.iter_mut() {
                let (i, o) = (uitkomst(false, &v.imap), uitkomst(true, &v.smtp));
                v.bereikbaar = Some(Bereikbaar {
                    imap: i.as_ref().map(|x| x.0),
                    smtp: o.as_ref().map(|x| x.0),
                });
                let fouten: Vec<String> =
                    [i, o].into_iter().flatten().filter_map(|x| x.1).collect();
                if !fouten.is_empty() {
                    v.toelichting = Some(
                        format!(
                            "{} Proef: {}.",
                            v.toelichting.clone().unwrap_or_default(),
                            fouten.join("; ")
                        )
                        .trim()
                        .to_string(),
                    );
                }
            }
        }
        // Gok: eerste bereikbare per protocol, anders de standaardgok.
        let kies = |lijst: &[VoorstelServer], smtp: bool, standaard: usize| {
            lijst
                .iter()
                .find(|s| uitkomst(smtp, s).is_some_and(|u| u.0))
                .unwrap_or(&lijst[standaard])
                .clone()
        };
        let gi = kies(&imap_gok, false, 0);
        let gs = kies(&smtp_gok, true, 1);
        let bereikbaar = proef.then(|| Bereikbaar {
            imap: uitkomst(false, &gi).map(|u| u.0),
            smtp: uitkomst(true, &gs).map(|u| u.0),
        });
        let bevestigd = matches!(
            bereikbaar,
            Some(Bereikbaar {
                imap: Some(true),
                smtp: Some(true)
            })
        );
        lijst.push(ConfiguratieVoorstel {
            bron: "gok".into(),
            toelichting: Some(if bevestigd {
                format!("Gangbare servernamen voor {domein}, bevestigd door een verbindingsproef.")
            } else {
                format!("Gangbare servernamen voor {domein} (niet bevestigd).")
            }),
            bereikbaar,
            imap: gi,
            smtp: gs,
            ..Default::default()
        });
        rangschik(lijst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mx_herkenning() {
        let g = mx_provider("aspmx.l.google.com.", "bedrijf.nl").unwrap();
        assert_eq!(g.imap.0, "imap.gmail.com");
        assert_eq!(g.oauth, Some(OAuthProvider::Google));
        let m = mx_provider("bedrijf-nl.mail.protection.outlook.com", "bedrijf.nl").unwrap();
        assert_eq!(
            (m.smtp.0.as_str(), m.smtp.1, m.smtp.2),
            ("smtp.office365.com", 587, Beveiliging::Starttls)
        );
        assert_eq!(m.oauth, Some(OAuthProvider::Microsoft));
        assert_eq!(
            mx_provider("mx1.mail.ovh.net", "x.nl").unwrap().naam,
            "OVHcloud"
        );
        assert_eq!(
            mx_provider("mx.transip.email", "x.nl").unwrap().imap.0,
            "imap.transip.email"
        );
        assert_eq!(
            mx_provider("smtpin.rzone.de", "x.nl").unwrap().naam,
            "STRATO"
        );
        assert_eq!(
            mx_provider("mx00.ionos.nl", "x.nl").unwrap().imap.0,
            "imap.ionos.nl"
        );
        assert_eq!(
            mx_provider("mx01.kundenserver.de", "x.nl").unwrap().imap.0,
            "imap.ionos.de"
        );
        assert_eq!(
            mx_provider("mx.zoho.eu", "x.nl").unwrap().imap.0,
            "imap.zoho.eu"
        );
        assert_eq!(
            mx_provider("in1-smtp.messagingengine.com", "x.nl")
                .unwrap()
                .naam,
            "Fastmail"
        );
        assert_eq!(
            mx_provider("mx1.mailbox.org", "x.nl").unwrap().naam,
            "mailbox.org"
        );
        let p = mx_provider("mail.protonmail.ch", "x.nl").unwrap();
        assert!(p.opmerking.unwrap().contains("Bridge"));
        let a = mx_provider("mx1.antagonist.nl", "bouw.nl").unwrap();
        assert_eq!(a.imap.0, "mail.bouw.nl");
        assert!(a.hosting);
        assert!(mx_provider("mail.eigenserver.nl", "eigenserver.nl").is_none());
        assert!(mx_provider("nietgoogle.com", "x.nl").is_none());
        assert_eq!(basisdomein("mx1.mail.ovh.net."), "ovh.net");
    }

    fn srv(p: u16, w: u16, poort: u16, doel: &str) -> SrvRecord {
        SrvRecord {
            prioriteit: p,
            gewicht: w,
            poort,
            doel: doel.into(),
        }
    }

    #[test]
    fn srv_verwerking() {
        assert_eq!(
            beste_srv(&[
                srv(10, 0, 993, "b.example.org."),
                srv(5, 0, 993, "A.example.org.")
            ])
            .unwrap()
            .doel,
            "a.example.org"
        );
        assert_eq!(
            beste_srv(&[srv(5, 1, 993, "a."), srv(5, 9, 993, "b.")])
                .unwrap()
                .doel,
            "b"
        );
        assert!(beste_srv(&[srv(0, 0, 0, ".")]).is_none());
        let v = srv_voorstel(
            &[srv(0, 1, 993, "mail.example.org.")],
            &[srv(0, 1, 143, "mail.example.org.")],
            &[],
            &[srv(0, 1, 587, "smtp.example.org.")],
            "a@example.org",
            "example.org",
        )
        .unwrap();
        assert_eq!(v.bron, "srv");
        assert_eq!(
            (v.imap.host.as_str(), v.imap.poort, v.imap.beveiliging),
            ("mail.example.org", 993, Beveiliging::Ssl)
        );
        assert_eq!(
            (v.smtp.poort, v.smtp.beveiliging),
            (587, Beveiliging::Starttls)
        );
        assert_eq!(v.imap.gebruikersnaam.as_deref(), Some("a@example.org"));
        // RFC 6186: "." = dienst niet beschikbaar.
        assert!(
            srv_voorstel(
                &[srv(0, 0, 0, ".")],
                &[],
                &[],
                &[],
                "a@example.org",
                "example.org"
            )
            .is_none()
        );
        let half = srv_voorstel(
            &[srv(0, 0, 993, "imap.x.org")],
            &[],
            &[],
            &[],
            "a@x.org",
            "x.org",
        )
        .unwrap();
        assert!(half.toelichting.unwrap().contains("SMTP is een gok"));
    }

    fn v(bron: &str, imap: &str, bereikbaar: Option<(bool, bool)>) -> ConfiguratieVoorstel {
        ConfiguratieVoorstel {
            bron: bron.into(),
            imap: server(imap, 993, Beveiliging::Ssl, "a@x.nl"),
            smtp: server("smtp.x.nl", 465, Beveiliging::Ssl, "a@x.nl"),
            bereikbaar: bereikbaar.map(|(i, s)| Bereikbaar {
                imap: Some(i),
                smtp: Some(s),
            }),
            ..Default::default()
        }
    }

    #[test]
    fn rangschikking_en_ontdubbeling() {
        let mut mx = v("mx", "imap.provider.nl", None);
        mx.provider = Some("Provider".into());
        let r = rangschik(vec![
            v("gok", "imap.x.nl", Some((false, false))),
            v("gok", "mail.x.nl", Some((true, true))),
            mx,
            v("srv", "imap.provider.nl", None),
            v("autoconfig", "imap.x.nl", None),
        ]);
        let bronnen: Vec<&str> = r.iter().map(|x| x.bron.as_str()).collect();
        assert_eq!(bronnen, vec!["autoconfig", "srv", "gok"]);
        // SRV en MX met dezelfde servers: samengevoegd, provider overgenomen.
        assert_eq!(r[1].provider.as_deref(), Some("Provider"));
        assert!(r[1].toelichting.as_deref().unwrap().contains("MX-record"));
        // De onbereikbare gok viel samen met autoconfig (zelfde servers).
        assert!(
            r[0].toelichting
                .as_deref()
                .unwrap()
                .contains("gangbare servernamen")
        );
        assert_eq!(r[2].imap.host, "mail.x.nl");
    }

    /* ─── Integratie: nep-DNS, nep-HTTP en nep-TLS-mailservers op 127.0.0.1 ─── */

    // Testcertificaten (alleen voor deze tests): een eigen CA en een
    // servercertificaat voor imap.voorbeeld.test en smtp.voorbeeld.test.
    const CA: &str = "MIIBojCCAUmgAwIBAgIUJeiBQmcfdpFFyU9lAYz0Z1ZLUbIwCgYIKoZIzj0EAwIwHjEcMBoGA1UEAwwTTmVwLUNBIEVtYWlsIFN0dWRpbzAgFw0yNjEwMjcwNTE0MzdaGA8yMTI2MTAwMzA1MTQzN1owHjEcMBoGA1UEAwwTTmVwLUNBIEVtYWlsIFN0dWRpbzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJpuqUokaCXdmRupi86oxSkG6wXOpmRm91aywseaiRqY5LDS97SuCehaspiyeG/FikgdkBmetSpsck24saGQHQ+jYzBhMB0GA1UdDgQWBBT+qCGRFyFankRawhUqlRE9fGV1OjAfBgNVHSMEGDAWgBT+qCGRFyFankRawhUqlRE9fGV1OjAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwICBDAKBggqhkjOPQQDAgNHADBEAiAmti60t/whW20Ah2eGbcDPQyjG7quMjXG2P7ZARow9KwIgHyc1CxZ6B2QPamYJts/UWQfAz+ADJXWZ/4gHWgDwnjo=";
    const BLAD: &str = "MIIB3DCCAYKgAwIBAgIUJH050r+CIUMH8ARtxDtGyrKtpfIwCgYIKoZIzj0EAwIwHjEcMBoGA1UEAwwTTmVwLUNBIEVtYWlsIFN0dWRpbzAgFw0yNjEwMjcwNTE0MzdaGA8yMTI2MTAwMzA1MTQzN1owHjEcMBoGA1UEAwwTaW1hcC52b29yYmVlbGQudGVzdDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABBDeQPhKTmc5w1g3e7S37aDQszDZr1E3Im1V83YKAykToWGDw33xeT+0J0Zl/2hgXHT62tP6joMPqOPJfk+5erqjgZswgZgwMwYDVR0RBCwwKoITaW1hcC52b29yYmVlbGQudGVzdIITc210cC52b29yYmVlbGQudGVzdDAMBgNVHRMBAf8EAjAAMBMGA1UdJQQMMAoGCCsGAQUFBwMBMB0GA1UdDgQWBBRhxQPqVQuoQm9RIsDFet6DiSotxjAfBgNVHSMEGDAWgBT+qCGRFyFankRawhUqlRE9fGV1OjAKBggqhkjOPQQDAgNIADBFAiAfy1AB/i5eazVpo1asG4noGIvOm3RXmr7QiYgZ6BO6RwIhAN3mzgOxQUWKsDUi05uyGp0DTndQJK3rW16+WH9NAbFE";
    const SLEUTEL: &str = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgrxmqN1uirhKjc4gMIQ+jiUTF4r/YCyl/wh8mrViJbRGhRANCAAQQ3kD4Sk5nOcNYN3u0t+2g0LMw2a9RNyJtVfN2CgMpE6Fhg8N98Xk/tCdGZf9oYFx0+trT+o6DD6jjyX5PuXq6";

    fn b64(s: &str) -> Vec<u8> {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.decode(s).unwrap()
    }

    fn client_tls() -> Arc<rustls::ClientConfig> {
        let mut wortels = rustls::RootCertStore::empty();
        wortels
            .add(rustls::pki_types::CertificateDer::from(b64(CA)))
            .unwrap();
        Arc::new(
            rustls::ClientConfig::builder_with_provider(Arc::new(
                rustls::crypto::ring::default_provider(),
            ))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_root_certificates(wortels)
            .with_no_client_auth(),
        )
    }

    fn server_tls() -> tokio_rustls::TlsAcceptor {
        let cfg = rustls::ServerConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(
            vec![rustls::pki_types::CertificateDer::from(b64(BLAD))],
            rustls::pki_types::PrivateKeyDer::Pkcs8(b64(SLEUTEL).into()),
        )
        .unwrap();
        tokio_rustls::TlsAcceptor::from(Arc::new(cfg))
    }

    /// IMAP over TLS (poort 993-stijl).
    async fn nep_imaps() -> SocketAddr {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let a = l.local_addr().unwrap();
        let tls = server_tls();
        tokio::spawn(async move {
            while let Ok((s, _)) = l.accept().await {
                let tls = tls.clone();
                tokio::spawn(async move {
                    let Ok(mut t) = tls.accept(s).await else {
                        return;
                    };
                    let _ = t.write_all(b"* OK nep klaar\r\n").await;
                    while let Ok(r) = lees_regel(&mut t).await {
                        let tag = r.split(' ').next().unwrap_or("").to_string();
                        if r.contains("CAPABILITY") {
                            let _ = t
                                .write_all(
                                    format!("* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n{tag} OK\r\n")
                                        .as_bytes(),
                                )
                                .await;
                        } else {
                            let _ = t
                                .write_all(format!("* BYE\r\n{tag} OK\r\n").as_bytes())
                                .await;
                            break;
                        }
                    }
                });
            }
        });
        a
    }

    /// SMTP met STARTTLS (poort 587-stijl).
    async fn nep_submission() -> SocketAddr {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let a = l.local_addr().unwrap();
        let tls = server_tls();
        tokio::spawn(async move {
            while let Ok((mut s, _)) = l.accept().await {
                let tls = tls.clone();
                tokio::spawn(async move {
                    let _ = s.write_all(b"220 nep ESMTP\r\n").await;
                    loop {
                        let Ok(r) = lees_regel(&mut s).await else {
                            return;
                        };
                        if r.starts_with("EHLO") {
                            let _ = s
                                .write_all(b"250-nep\r\n250-STARTTLS\r\n250 8BITMIME\r\n")
                                .await;
                        } else if r == "STARTTLS" {
                            let _ = s.write_all(b"220 ga je gang\r\n").await;
                            break;
                        } else {
                            return;
                        }
                    }
                    let Ok(mut t) = tls.accept(s).await else {
                        return;
                    };
                    while let Ok(r) = lees_regel(&mut t).await {
                        if r.starts_with("EHLO") {
                            let _ = t.write_all(b"250-nep\r\n250 AUTH PLAIN\r\n").await;
                        } else {
                            let _ = t.write_all(b"221 tot ziens\r\n").await;
                            break;
                        }
                    }
                });
            }
        });
        a
    }

    async fn nep_http(xml: &'static str) -> SocketAddr {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let a = l.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((mut s, _)) = l.accept().await {
                tokio::spawn(async move {
                    while let Ok(r) = lees_regel(&mut s).await {
                        if r.is_empty() {
                            break;
                        }
                    }
                    let _ = s
                        .write_all(format!("HTTP/1.0 200 OK\r\nContent-Type: text/xml\r\nContent-Length: {}\r\n\r\n{xml}", xml.len()).as_bytes())
                        .await;
                });
            }
        });
        a
    }

    struct NepDns {
        srv: HashMap<String, Vec<SrvRecord>>,
        mx: Vec<(u16, String)>,
        adressen: HashMap<(String, u16), SocketAddr>,
    }

    impl Dns for NepDns {
        fn srv<'a>(&'a self, naam: &'a str) -> BoxFut<'a, Vec<SrvRecord>> {
            Box::pin(async move { self.srv.get(naam).cloned().unwrap_or_default() })
        }
        fn mx<'a>(&'a self, _: &'a str) -> BoxFut<'a, Vec<(u16, String)>> {
            Box::pin(async move { self.mx.clone() })
        }
        fn adressen<'a>(&'a self, host: &'a str, poort: u16) -> BoxFut<'a, Vec<SocketAddr>> {
            Box::pin(async move {
                self.adressen
                    .get(&(host.to_string(), poort))
                    .into_iter()
                    .copied()
                    .collect()
            })
        }
    }

    const AUTOCONFIG: &str = r#"<clientConfig version="1.1"><emailProvider id="voorbeeld.test">
<displayName>Voorbeeld Hosting</displayName>
<incomingServer type="imap"><hostname>imap.voorbeeld.test</hostname><port>993</port><socketType>SSL</socketType><authentication>password-cleartext</authentication><username>%EMAILADDRESS%</username></incomingServer>
<outgoingServer type="smtp"><hostname>smtp.voorbeeld.test</hostname><port>587</port><socketType>STARTTLS</socketType><authentication>password-cleartext</authentication><username>%EMAILADDRESS%</username></outgoingServer>
</emailProvider></clientConfig>"#;

    const ISPDB: &str = r#"<clientConfig version="1.1"><emailProvider id="x">
<incomingServer type="imap"><hostname>imap.ispdb.test</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username><authentication>password-cleartext</authentication></incomingServer>
<outgoingServer type="smtp"><hostname>smtp.ispdb.test</hostname><port>465</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username><authentication>password-cleartext</authentication></outgoingServer>
</emailProvider></clientConfig>"#;

    async fn zoeker() -> Zoeker {
        let imaps = nep_imaps().await;
        let submission = nep_submission().await;
        let auto = nep_http(AUTOCONFIG).await;
        let isp = nep_http(ISPDB).await;
        let mut adressen = HashMap::new();
        adressen.insert(("imap.voorbeeld.test".to_string(), 993), imaps);
        // mail.voorbeeld.test wijst naar dezelfde server: certificaat past niet.
        adressen.insert(("mail.voorbeeld.test".to_string(), 993), imaps);
        adressen.insert(("smtp.voorbeeld.test".to_string(), 587), submission);
        let mut srv = HashMap::new();
        srv.insert(
            "_imaps._tcp.voorbeeld.test".to_string(),
            vec![SrvRecord {
                prioriteit: 0,
                gewicht: 1,
                poort: 993,
                doel: "mail.voorbeeld.test.".into(),
            }],
        );
        srv.insert(
            "_submission._tcp.voorbeeld.test".to_string(),
            vec![SrvRecord {
                prioriteit: 0,
                gewicht: 1,
                poort: 587,
                doel: "smtp.voorbeeld.test.".into(),
            }],
        );
        srv.insert(
            "_imap._tcp.voorbeeld.test".to_string(),
            vec![SrvRecord {
                prioriteit: 0,
                gewicht: 0,
                poort: 0,
                doel: ".".into(),
            }],
        );
        Zoeker {
            dns: Arc::new(NepDns {
                srv,
                mx: vec![(10, "voorbeeld-test.mail.protection.outlook.com".into())],
                adressen,
            }),
            tls: client_tls(),
            autoconfig_urls: vec![format!(
                "http://127.0.0.1:{}/mail/config-v1.1.xml",
                auto.port()
            )],
            ispdb_url: format!("http://127.0.0.1:{}/v1.1/{{domein}}", isp.port()),
            limiet_bronnen: Duration::from_secs(3),
            limiet_totaal: Duration::from_secs(6),
            limiet_proef: Duration::from_secs(3),
            gelijktijdig: 6,
            voortgang: None,
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn zoekt_servers_met_proef() {
        let mut z = zoeker().await;
        let stappen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let s2 = stappen.clone();
        z.voortgang = Some(Arc::new(move |stap: &str, status: &str| {
            s2.lock().unwrap().push(format!("{stap}:{status}"))
        }));
        let r = z
            .zoek(
                "jan@voorbeeld.test",
                &ZoekOpties {
                    ispdb: None,
                    proef: None,
                },
            )
            .await;
        let bronnen: Vec<&str> = r.iter().map(|v| v.bron.as_str()).collect();
        assert_eq!(bronnen, vec!["autoconfig", "srv", "mx"], "{r:#?}");

        // Autoconfig: bereikbaar via TLS met certificaatcontrole, gok samengevoegd.
        let a = &r[0];
        assert_eq!(a.provider.as_deref(), Some("Voorbeeld Hosting"));
        assert_eq!(
            a.bereikbaar,
            Some(Bereikbaar {
                imap: Some(true),
                smtp: Some(true)
            })
        );
        assert!(
            a.toelichting
                .as_deref()
                .unwrap()
                .contains("gangbare servernamen")
        );
        assert_eq!(a.imap.gebruikersnaam.as_deref(), Some("jan@voorbeeld.test"));

        // SRV: mail.voorbeeld.test heeft een certificaat voor een andere naam.
        let s = &r[1];
        assert_eq!(s.imap.host, "mail.voorbeeld.test");
        assert_eq!(s.bereikbaar.unwrap().imap, Some(false));
        assert_eq!(s.bereikbaar.unwrap().smtp, Some(true));
        assert!(
            s.toelichting.as_deref().unwrap().contains("certificaat"),
            "{:?}",
            s.toelichting
        );

        // MX naar Microsoft 365: OAuth mogelijk, niet bereikbaar in de test.
        let m = &r[2];
        assert_eq!(m.provider.as_deref(), Some("Microsoft 365"));
        assert_eq!(m.oauth, Some(OAuthProvider::Microsoft));
        assert!(
            m.toelichting
                .as_deref()
                .unwrap()
                .starts_with("MX-record wijst naar voorbeeld-test.mail.protection.outlook.com")
        );
        assert_eq!(m.bereikbaar.unwrap().imap, Some(false));

        let stappen = stappen.lock().unwrap();
        for stap in ["voorinstelling", "autoconfig", "srv", "mx", "proef"] {
            assert!(stappen.contains(&format!("{stap}:klaar")), "{stap}");
        }
        assert!(
            !stappen.iter().any(|s| s.starts_with("ispdb")),
            "ISPDB alleen met toestemming"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn ispdb_alleen_op_verzoek_en_zonder_proef() {
        let z = zoeker().await;
        let r = z
            .zoek(
                "jan@voorbeeld.test",
                &ZoekOpties {
                    ispdb: Some(true),
                    proef: Some(false),
                },
            )
            .await;
        let i = r
            .iter()
            .find(|v| v.bron == "ispdb")
            .expect("ISPDB-voorstel");
        assert_eq!(i.imap.host, "imap.ispdb.test");
        assert!(r.iter().all(|v| v.bereikbaar.is_none()));
        // Zonder proef is de gok de standaardgok (imap.… 993 + smtp.… 587);
        // die valt samen met het autoconfig-voorstel.
        assert!(r.iter().all(|v| v.bron != "gok"));
        assert!(
            r[0].toelichting
                .as_deref()
                .unwrap()
                .contains("gangbare servernamen")
        );
        assert!(
            z.zoek("geen-adres", &ZoekOpties::default())
                .await
                .is_empty()
        );
    }
}
