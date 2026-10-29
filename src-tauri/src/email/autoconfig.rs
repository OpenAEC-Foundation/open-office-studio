//! Automatische configuratie: eerst ingebouwde voorinstellingen voor gangbare
//! providers, daarna (alleen op verzoek) de Thunderbird-autoconfig van het
//! eigen domein via HTTPS, en anders een gok.
//!
//! Bewust níet: de centrale ISPDB-server van Thunderbird (zou elk ingevoerd
//! domein naar een derde sturen) en DNS-SRV (vraagt een extra DNS-resolver als
//! afhankelijkheid). Het e-mailadres zelf wordt nooit meegestuurd.

use super::fout::{servertekst, MailFout, Uitkomst};
use super::{Authenticatie, Beveiliging, ConfiguratieVoorstel, VoorstelServer};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const HTTP_LIMIET: Duration = Duration::from_secs(10);
const HTTP_MAX_BYTES: usize = 256 * 1024;

pub fn is_domein(d: &str) -> bool {
    let d = d.strip_suffix('.').unwrap_or(d);
    if d.is_empty() || d.len() > 253 || !d.contains('.') {
        return false;
    }
    d.split('.').all(|l| {
        !l.is_empty()
            && l.len() <= 63
            && !l.starts_with('-')
            && !l.ends_with('-')
            && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    }) && !d
        .rsplit('.')
        .next()
        .unwrap_or("")
        .chars()
        .all(|c| c.is_ascii_digit())
}

/// Servernaam zoals in de accountinstellingen: domeinnaam, `localhost` of IP-adres.
pub fn is_host(h: &str) -> bool {
    let h = h.trim();
    h.eq_ignore_ascii_case("localhost")
        || is_domein(h)
        || h.parse::<std::net::IpAddr>().is_ok()
        || (h.starts_with('[') && h.ends_with(']') && h[1..h.len() - 1].parse::<std::net::Ipv6Addr>().is_ok())
        // Enkelvoudige namen op het eigen netwerk (bijv. "mailserver").
        || (!h.is_empty() && h.len() <= 63 && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') && !h.starts_with('-'))
}

fn delen(email: &str) -> Option<(String, String)> {
    let email = email.trim();
    let (lokaal, domein) = email.rsplit_once('@')?;
    let domein = domein.trim_end_matches('.').to_ascii_lowercase();
    (!lokaal.is_empty() && is_domein(&domein)).then(|| (lokaal.to_string(), domein))
}

fn server(
    host: &str,
    poort: u16,
    beveiliging: Beveiliging,
    gebruikersnaam: Option<String>,
) -> VoorstelServer {
    VoorstelServer {
        host: host.to_string(),
        poort,
        beveiliging,
        authenticatie: Authenticatie::Normaal,
        gebruikersnaam,
    }
}

/// Ingebouwde voorinstellingen (stand oktober 2026, openbare providerdocumentatie).
pub fn voorinstelling(email: &str) -> Option<ConfiguratieVoorstel> {
    use Beveiliging::*;
    let (lokaal, domein) = delen(email)?;
    let volledig = Some(email.trim().to_string());
    let v = |ih: &str, ip: u16, ib: Beveiliging, sh: &str, sp: u16, sb: Beveiliging| {
        ConfiguratieVoorstel {
            bron: "voorinstelling".into(),
            imap: server(ih, ip, ib, volledig.clone()),
            smtp: server(sh, sp, sb, volledig.clone()),
            ..Default::default()
        }
    };
    let voorstel = match domein.as_str() {
        "gmail.com" | "googlemail.com" => v("imap.gmail.com", 993, Ssl, "smtp.gmail.com", 465, Ssl),
        "outlook.com" | "hotmail.com" | "live.com" | "msn.com" | "outlook.nl" | "hotmail.nl"
        | "live.nl" | "outlook.be" | "hotmail.be" | "live.be" => v(
            "outlook.office365.com",
            993,
            Ssl,
            "smtp-mail.outlook.com",
            587,
            Starttls,
        ),
        "icloud.com" | "me.com" | "mac.com" => {
            let mut x = v(
                "imap.mail.me.com",
                993,
                Ssl,
                "smtp.mail.me.com",
                587,
                Starttls,
            );
            // Apple: IMAP-gebruikersnaam is het deel vóór de @, SMTP het volledige adres.
            x.imap.gebruikersnaam = Some(lokaal.clone());
            x
        }
        "yahoo.com" | "yahoo.nl" | "yahoo.co.uk" | "ymail.com" | "rocketmail.com" => v(
            "imap.mail.yahoo.com",
            993,
            Ssl,
            "smtp.mail.yahoo.com",
            465,
            Ssl,
        ),
        "kpnmail.nl" | "kpnplanet.nl" | "planet.nl" | "hetnet.nl" | "home.nl" | "kpn.com" => v(
            "imap.kpnmail.nl",
            993,
            Ssl,
            "smtp.kpnmail.nl",
            587,
            Starttls,
        ),
        "ziggo.nl" | "upcmail.nl" | "casema.nl" | "chello.nl" | "quicknet.nl" | "zeelandnet.nl" => {
            v("imap.ziggo.nl", 993, Ssl, "smtp.ziggo.nl", 587, Starttls)
        }
        "xs4all.nl" => v("imap.xs4all.nl", 993, Ssl, "smtp.xs4all.nl", 465, Ssl),
        // Proton Mail werkt alleen via de lokale Proton Mail Bridge; die draait op
        // deze computer met een eigen certificaat. Omdat blind accepteren van
        // certificaten niet kan, gebruikt de voorinstelling de lokale
        // onversleutelde verbinding (alleen toegestaan naar localhost).
        "proton.me" | "protonmail.com" | "protonmail.ch" | "pm.me" => {
            v("127.0.0.1", 1143, Geen, "127.0.0.1", 1025, Geen)
        }
        "fastmail.com" | "fastmail.fm" | "fastmail.nl" | "messagingengine.com" => {
            v("imap.fastmail.com", 993, Ssl, "smtp.fastmail.com", 465, Ssl)
        }
        "gmx.net" | "gmx.de" | "gmx.at" | "gmx.ch" => {
            v("imap.gmx.net", 993, Ssl, "mail.gmx.net", 587, Starttls)
        }
        "gmx.com" | "gmx.nl" | "gmx.co.uk" => {
            v("imap.gmx.com", 993, Ssl, "mail.gmx.com", 587, Starttls)
        }
        "zoho.com" | "zohomail.com" => v("imap.zoho.com", 993, Ssl, "smtp.zoho.com", 465, Ssl),
        "zoho.eu" | "zohomail.eu" => v("imap.zoho.eu", 993, Ssl, "smtp.zoho.eu", 465, Ssl),
        _ => return None,
    };
    let (provider, oauth) = provider_bij_host(&voorstel.imap.host);
    Some(ConfiguratieVoorstel {
        provider: provider.map(str::to_string),
        oauth,
        toelichting: provider.map(|p| format!("Bekende instellingen voor {p}.")),
        ..voorstel
    })
}

/// Naam en OAuth2-mogelijkheid bij een bekende IMAP-server.
pub fn provider_bij_host(imap: &str) -> (Option<&'static str>, Option<super::oauth::Provider>) {
    use super::oauth::Provider::*;
    match imap {
        "imap.gmail.com" => (Some("Gmail"), Some(Google)),
        "outlook.office365.com" => (Some("Outlook.com / Microsoft 365"), Some(Microsoft)),
        "imap.mail.me.com" => (Some("iCloud"), None),
        "imap.mail.yahoo.com" => (Some("Yahoo"), None),
        "imap.kpnmail.nl" => (Some("KPN"), None),
        "imap.ziggo.nl" => (Some("Ziggo"), None),
        "imap.xs4all.nl" => (Some("XS4ALL"), None),
        "127.0.0.1" => (Some("Proton Mail (via Proton Mail Bridge)"), None),
        "imap.fastmail.com" => (Some("Fastmail"), None),
        "imap.gmx.net" | "imap.gmx.com" => (Some("GMX"), None),
        "imap.zoho.com" | "imap.zoho.eu" => (Some("Zoho Mail"), None),
        _ => (None, None),
    }
}

pub fn gok(email: &str) -> Option<ConfiguratieVoorstel> {
    let (_, domein) = delen(email)?;
    let volledig = Some(email.trim().to_string());
    Some(ConfiguratieVoorstel {
        bron: "gok".into(),
        imap: server(
            &format!("imap.{domein}"),
            993,
            Beveiliging::Ssl,
            volledig.clone(),
        ),
        smtp: server(
            &format!("smtp.{domein}"),
            587,
            Beveiliging::Starttls,
            volledig,
        ),
        toelichting: Some(format!("Gangbare servernamen voor {domein}.")),
        ..Default::default()
    })
}

#[derive(Default, Debug)]
struct XmlServer {
    soort: String,
    host: String,
    poort: String,
    socket: String,
    auth: Vec<String>,
    gebruiker: String,
}

/// Leest een Thunderbird-autoconfigbestand (`config-v1.1.xml`).
pub fn ontleed_xml(xml: &str, email: &str) -> Option<ConfiguratieVoorstel> {
    use quick_xml::events::Event;
    let (lokaal, domein) = delen(email)?;
    let mut lezer = quick_xml::Reader::from_str(xml);
    let mut servers: Vec<(bool, XmlServer)> = Vec::new();
    let mut huidig: Option<(bool, XmlServer)> = None;
    let mut veld = String::new();
    let mut naam_provider: Option<String> = None;
    loop {
        match lezer.read_event() {
            Ok(Event::Start(e)) => {
                let naam = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                if naam == "incomingServer" || naam == "outgoingServer" {
                    let mut s = XmlServer::default();
                    for a in e.attributes().flatten() {
                        if a.key.local_name().as_ref() == b"type" {
                            s.soort = String::from_utf8_lossy(&a.value).to_ascii_lowercase();
                        }
                    }
                    huidig = Some((naam == "incomingServer", s));
                } else {
                    veld = naam;
                }
            }
            Ok(Event::Text(t))
                if huidig.is_none() && veld == "displayName" && naam_provider.is_none() =>
            {
                let w = t.decode().map(|d| d.trim().to_string()).unwrap_or_default();
                naam_provider = (!w.is_empty() && w.len() < 100).then_some(w);
            }
            Ok(Event::Text(t)) => {
                if let Some((_, s)) = huidig.as_mut() {
                    let waarde = t
                        .decode()
                        .ok()
                        .and_then(|d| quick_xml::escape::unescape(&d).ok().map(|x| x.into_owned()))
                        .unwrap_or_default();
                    let waarde = waarde.trim().to_string();
                    match veld.as_str() {
                        "hostname" => s.host = waarde,
                        "port" => s.poort = waarde,
                        "socketType" => s.socket = waarde,
                        "authentication" => s.auth.push(waarde),
                        "username" => s.gebruiker = waarde,
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let naam = e.local_name();
                if naam.as_ref() == b"incomingServer" || naam.as_ref() == b"outgoingServer" {
                    if let Some(s) = huidig.take() {
                        servers.push(s);
                    }
                }
                veld.clear();
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
    }
    let vervang = |s: &str| {
        s.replace("%EMAILADDRESS%", email.trim())
            .replace("%EMAILLOCALPART%", &lokaal)
            .replace("%EMAILDOMAIN%", &domein)
    };
    let omzetten = |s: &XmlServer, smtp: bool| -> Option<VoorstelServer> {
        let host = vervang(&s.host);
        let poort: u16 = s.poort.parse().ok()?;
        if !is_host(&host) || poort == 0 {
            return None;
        }
        let beveiliging = match s.socket.to_ascii_uppercase().as_str() {
            "SSL" | "TLS" => Beveiliging::Ssl,
            "STARTTLS" => Beveiliging::Starttls,
            "PLAIN" if super::accounts::is_localhost(&host) => Beveiliging::Geen,
            _ => return None,
        };
        let auth = s
            .auth
            .iter()
            .map(|a| a.to_ascii_lowercase())
            .collect::<Vec<_>>();
        let authenticatie = if auth.is_empty() || auth.iter().any(|a| a == "password-cleartext") {
            Authenticatie::Normaal
        } else if !smtp && auth.iter().any(|a| a == "password-encrypted") {
            Authenticatie::Versleuteld
        } else {
            return None;
        };
        let gebruiker = vervang(&s.gebruiker);
        Some(VoorstelServer {
            host,
            poort,
            beveiliging,
            authenticatie,
            gebruikersnaam: (!gebruiker.is_empty()).then_some(gebruiker),
        })
    };
    // Kies per soort de eerste bruikbare, met voorkeur voor versleuteling.
    let kies = |inkomend: bool, soort: &str| {
        let mut kandidaten: Vec<VoorstelServer> = servers
            .iter()
            .filter(|(i, s)| *i == inkomend && s.soort == soort)
            .filter_map(|(_, s)| omzetten(s, !inkomend))
            .collect();
        kandidaten.sort_by_key(|s| match s.beveiliging {
            Beveiliging::Ssl => 0,
            Beveiliging::Starttls => 1,
            Beveiliging::Geen => 2,
        });
        kandidaten.into_iter().next()
    };
    let provider = naam_provider.clone();
    Some(ConfiguratieVoorstel {
        bron: "autoconfig".into(),
        provider,
        toelichting: Some(format!("Configuratiebestand voor {domein}.")),
        imap: kies(true, "imap")?,
        smtp: kies(false, "smtp")?,
        ..Default::default()
    })
}

/// Volledige keten: voorinstelling → (online) autoconfig van het domein → gok.
pub async fn stel_voor(email: &str, online: bool) -> Option<ConfiguratieVoorstel> {
    let (_, domein) = delen(email)?;
    if let Some(v) = voorinstelling(email) {
        return Some(v);
    }
    if online {
        let pogingen = [
            (
                format!("autoconfig.{domein}"),
                "/mail/config-v1.1.xml".to_string(),
            ),
            (
                domein.clone(),
                "/.well-known/autoconfig/mail/config-v1.1.xml".to_string(),
            ),
        ];
        for (host, pad) in pogingen {
            if let Ok(xml) = haal_https(&host, 443, &pad).await {
                if let Some(v) = ontleed_xml(&xml, email) {
                    return Some(v);
                }
            }
        }
    }
    gok(email)
}

/// Minimale HTTPS-GET (HTTP/1.0, dus zonder chunked-codering) met dezelfde
/// TLS-instellingen als IMAP; volgt hooguit drie HTTPS-doorverwijzingen.
pub async fn haal_https(host: &str, poort: u16, pad: &str) -> Uitkomst<String> {
    let mut doel = (host.to_string(), poort, pad.to_string());
    for _ in 0..4 {
        let (status, koppen, lichaam) =
            tokio::time::timeout(HTTP_LIMIET, een_verzoek(&doel.0, doel.1, &doel.2))
                .await
                .map_err(|_| {
                    MailFout::tijdslimiet(format!("{} reageerde niet op tijd.", doel.0))
                        .sleutel("server.noTimelyResponse")
                        .waarde("host", &doel.0)
                })??;
        match status {
            200 => {
                return String::from_utf8(lichaam).map_err(|_| {
                    MailFout::intern("Ongeldige tekencodering in het configuratiebestand.")
                        .sleutel("autoconfig.invalidEncoding")
                })
            }
            301 | 302 | 303 | 307 | 308 => {
                let locatie = koppen
                    .iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case("location"))
                    .map(|(_, v)| v.clone())
                    .ok_or_else(|| {
                        MailFout::niet_gevonden("Doorverwijzing zonder adres.")
                            .sleutel("http.redirectWithoutLocation")
                    })?;
                doel = ontleed_https_url(&locatie).ok_or_else(|| {
                    MailFout::geweigerd("Alleen doorverwijzingen naar HTTPS worden gevolgd.")
                        .sleutel("autoconfig.httpsRedirectOnly")
                })?;
            }
            _ => {
                return Err(MailFout::niet_gevonden(format!(
                    "Geen configuratie gevonden (HTTP {status})."
                ))
                .sleutel("autoconfig.notFound")
                .waarde("status", status))
            }
        }
    }
    Err(MailFout::geweigerd("Te veel doorverwijzingen.").sleutel("autoconfig.tooManyRedirects"))
}

fn ontleed_https_url(url: &str) -> Option<(String, u16, String)> {
    let rest = url.strip_prefix("https://")?;
    let (hostdeel, pad) = match rest.find('/') {
        Some(i) => (&rest[..i], rest[i..].to_string()),
        None => (rest, "/".to_string()),
    };
    let (host, poort) = match hostdeel.rsplit_once(':') {
        Some((h, p)) => (h, p.parse().ok()?),
        None => (hostdeel, 443),
    };
    (is_domein(host) && !pad.contains(['\r', '\n', ' '])).then(|| (host.to_string(), poort, pad))
}

pub type HttpAntwoord = (u16, Vec<(String, String)>, Vec<u8>);

async fn een_verzoek(host: &str, poort: u16, pad: &str) -> Uitkomst<HttpAntwoord> {
    http_verzoek(
        host,
        poort,
        true,
        "GET",
        pad,
        "application/xml, text/xml",
        None,
    )
    .await
}

/// Minimale HTTP/1.0-client. Zonder TLS alleen naar loopback (tests en
/// lokale nepservers); anders altijd HTTPS met dezelfde TLS-instellingen als IMAP.
pub async fn http_verzoek(
    host: &str,
    poort: u16,
    tls: bool,
    methode: &str,
    pad: &str,
    accepteer: &str,
    formulier: Option<&str>,
) -> Uitkomst<HttpAntwoord> {
    if pad.contains(['\r', '\n', ' ']) || host.contains(['\r', '\n', ' ', '/']) {
        return Err(MailFout::geweigerd("Ongeldig webadres.").sleutel("http.invalidUrl"));
    }
    let tcp = tokio::net::TcpStream::connect((super::imap::kale_host(host), poort))
        .await
        .map_err(|e| super::fout::uit_io(&e, host))?;
    let mut verzoek = format!(
        "{methode} {pad} HTTP/1.0\r\nHost: {host}\r\nUser-Agent: OpenAEC-Email-Studio\r\nAccept: {accepteer}\r\nConnection: close\r\n"
    );
    if let Some(f) = formulier {
        verzoek.push_str(&format!(
            "Content-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{f}",
            f.len()
        ));
    } else {
        verzoek.push_str("\r\n");
    }
    if tls {
        let naam = rustls::pki_types::ServerName::try_from(host.to_string())
            .map_err(|_| {
                MailFout::verbinding(format!("Ongeldige servernaam {host}."))
                    .sleutel("http.invalidServerName")
                    .waarde("host", host)
            })?;
        let s = tokio_rustls::TlsConnector::from(super::imap::tls_instellingen())
            .connect(naam, tcp)
            .await
            .map_err(|e| super::fout::uit_io(&e, host))?;
        lees_antwoord(s, &verzoek, host).await
    } else {
        let lokaal = tcp
            .peer_addr()
            .map(|a| a.ip().is_loopback())
            .unwrap_or(false);
        if !lokaal {
            return Err(MailFout::geweigerd(
                "Onversleuteld HTTP is alleen toegestaan naar deze computer.",
            )
            .sleutel("http.plainOnlyLocal"));
        }
        lees_antwoord(tcp, &verzoek, host).await
    }
}

async fn lees_antwoord<S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin>(
    mut s: S,
    verzoek: &str,
    host: &str,
) -> Uitkomst<HttpAntwoord> {
    s.write_all(verzoek.as_bytes())
        .await
        .map_err(|e| super::fout::uit_io(&e, host))?;
    let mut alles = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        match s.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                alles.extend_from_slice(&buf[..n]);
                if alles.len() > HTTP_MAX_BYTES {
                    return Err(MailFout::te_groot("Het antwoord van de server is te groot.")
                        .sleutel("http.responseTooLarge"));
                }
            }
            // Veel servers sluiten zonder TLS close_notify; wat binnen is telt.
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(super::fout::uit_io(&e, host)),
        }
    }
    ontleed_http(&alles).ok_or_else(|| {
        MailFout::intern("Ongeldig HTTP-antwoord.").sleutel("http.invalidHttpResponse")
    })
}

fn ontleed_http(bytes: &[u8]) -> Option<HttpAntwoord> {
    let eind = bytes.windows(4).position(|w| w == b"\r\n\r\n")?;
    let kop = std::str::from_utf8(&bytes[..eind]).ok()?;
    let mut regels = kop.split("\r\n");
    let status: u16 = regels.next()?.split_whitespace().nth(1)?.parse().ok()?;
    let koppen = regels
        .filter_map(|r| r.split_once(':'))
        .map(|(k, v)| (k.trim().to_string(), servertekst(v)))
        .collect();
    Some((status, koppen, bytes[eind + 4..].to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domeinen_en_hosts() {
        assert!(is_domein("example.org"));
        assert!(is_domein("xn--bcher-kva.example"));
        assert!(!is_domein("localhost"));
        assert!(!is_domein("1.2.3.4"));
        assert!(!is_domein("-a.example.org"));
        assert!(!is_domein("a..b"));
        assert!(!is_domein("evil.org/pad"));
        assert!(is_host("127.0.0.1"));
        assert!(is_host("::1"));
        assert!(is_host("mailserver"));
        assert!(!is_host("mail server"));
        assert!(!is_host("host\r\nX"));
    }

    #[test]
    fn voorinstellingen() {
        let g = voorinstelling("iemand@Gmail.com").unwrap();
        assert_eq!(g.bron, "voorinstelling");
        assert_eq!(
            (g.imap.host.as_str(), g.imap.poort, g.imap.beveiliging),
            ("imap.gmail.com", 993, Beveiliging::Ssl)
        );
        assert_eq!(
            (g.smtp.host.as_str(), g.smtp.poort, g.smtp.beveiliging),
            ("smtp.gmail.com", 465, Beveiliging::Ssl)
        );
        let i = voorinstelling("jan@icloud.com").unwrap();
        assert_eq!(i.imap.gebruikersnaam.as_deref(), Some("jan"));
        assert_eq!(i.smtp.gebruikersnaam.as_deref(), Some("jan@icloud.com"));
        for (adres, imap) in [
            ("a@outlook.com", "outlook.office365.com"),
            ("a@hotmail.nl", "outlook.office365.com"),
            ("a@yahoo.com", "imap.mail.yahoo.com"),
            ("a@kpnmail.nl", "imap.kpnmail.nl"),
            ("a@ziggo.nl", "imap.ziggo.nl"),
            ("a@xs4all.nl", "imap.xs4all.nl"),
            ("a@proton.me", "127.0.0.1"),
            ("a@fastmail.com", "imap.fastmail.com"),
            ("a@gmx.net", "imap.gmx.net"),
            ("a@zoho.eu", "imap.zoho.eu"),
        ] {
            assert_eq!(voorinstelling(adres).unwrap().imap.host, imap, "{adres}");
        }
        // Proton Bridge: onversleuteld, maar uitsluitend naar localhost.
        let p = voorinstelling("a@pm.me").unwrap();
        assert_eq!(p.imap.beveiliging, Beveiliging::Geen);
        assert!(crate::email::accounts::is_localhost(&p.imap.host));
        assert!(voorinstelling("a@onbekend-bedrijf.nl").is_none());
        assert!(voorinstelling("geen-adres").is_none());
    }

    #[test]
    fn gok_volgt_gangbare_namen() {
        let g = gok("info@bouwbedrijf.nl").unwrap();
        assert_eq!(g.bron, "gok");
        assert_eq!(
            (g.imap.host.as_str(), g.imap.poort, g.imap.beveiliging),
            ("imap.bouwbedrijf.nl", 993, Beveiliging::Ssl)
        );
        assert_eq!(
            (g.smtp.host.as_str(), g.smtp.poort, g.smtp.beveiliging),
            ("smtp.bouwbedrijf.nl", 587, Beveiliging::Starttls)
        );
        assert!(gok("info@").is_none());
    }

    const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="voorbeeld.nl">
    <domain>voorbeeld.nl</domain>
    <incomingServer type="pop3">
      <hostname>pop.voorbeeld.nl</hostname><port>995</port><socketType>SSL</socketType>
      <authentication>password-cleartext</authentication><username>%EMAILADDRESS%</username>
    </incomingServer>
    <incomingServer type="imap">
      <hostname>mail.voorbeeld.nl</hostname><port>143</port><socketType>plain</socketType>
      <authentication>password-cleartext</authentication><username>%EMAILADDRESS%</username>
    </incomingServer>
    <incomingServer type="imap">
      <hostname>mail.voorbeeld.nl</hostname><port>143</port><socketType>STARTTLS</socketType>
      <authentication>password-encrypted</authentication><username>%EMAILLOCALPART%</username>
    </incomingServer>
    <incomingServer type="imap">
      <hostname>imap.%EMAILDOMAIN%</hostname><port>993</port><socketType>SSL</socketType>
      <authentication>OAuth2</authentication><authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.voorbeeld.nl</hostname><port>587</port><socketType>STARTTLS</socketType>
      <authentication>password-encrypted</authentication><username>%EMAILADDRESS%</username>
    </outgoingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.voorbeeld.nl</hostname><port>465</port><socketType>SSL</socketType>
      <authentication>password-cleartext</authentication><username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>"#;

    #[test]
    fn leest_autoconfig_xml() {
        let v = ontleed_xml(XML, "piet@voorbeeld.nl").unwrap();
        assert_eq!(v.bron, "autoconfig");
        assert_eq!(v.imap.host, "imap.voorbeeld.nl");
        assert_eq!(v.imap.poort, 993);
        assert_eq!(v.imap.beveiliging, Beveiliging::Ssl);
        assert_eq!(v.imap.authenticatie, Authenticatie::Normaal);
        assert_eq!(v.imap.gebruikersnaam.as_deref(), Some("piet@voorbeeld.nl"));
        // De SMTP-server met alleen 'password-encrypted' valt af (niet ondersteund).
        assert_eq!((v.smtp.poort, v.smtp.beveiliging), (465, Beveiliging::Ssl));
        assert!(ontleed_xml("<geen xml", "piet@voorbeeld.nl").is_none());
        assert!(ontleed_xml("<clientConfig/>", "piet@voorbeeld.nl").is_none());
    }

    #[test]
    fn http_en_doorverwijzing() {
        let (s, k, l) =
            ontleed_http(b"HTTP/1.1 301 Moved\r\nLocation: https://x.example.org/a.xml\r\n\r\n")
                .unwrap();
        assert_eq!(s, 301);
        assert_eq!(k[0].1, "https://x.example.org/a.xml");
        assert!(l.is_empty());
        assert_eq!(
            ontleed_https_url("https://x.example.org:8443/a.xml"),
            Some(("x.example.org".into(), 8443, "/a.xml".into()))
        );
        assert!(ontleed_https_url("http://x.example.org/a.xml").is_none());
        assert!(ontleed_https_url("https://127.0.0.1/a.xml").is_none());
    }
}
