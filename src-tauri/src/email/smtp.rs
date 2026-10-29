//! Opstellen en versturen met `lettre` (SMTP over SSL/TLS of STARTTLS met
//! rustls). Na versturen bewaart `mod.rs` een kopie in Verzonden via IMAP
//! APPEND, behalve bij servers die dat zelf doen (zoals Gmail); aanpak naar
//! de Y-app-desktopimplementatie (zie herkomst in `mod.rs`).

use super::accounts::{controleer_beveiliging, is_localhost};
use super::fout::{
    aanmelden_mislukt, geen_tls_naam, geen_wachtwoord, niet_lokaal, servertekst, MailFout,
    Uitkomst,
};
use super::imap::kale_host;
use super::mime::{adres_uit_tekst, met_haken};
use super::{
    Account, Authenticatie, Beveiliging, Deeluitkomst, Limieten, Opstelling, ServerInstelling,
};
use lettre::address::Envelope;
use lettre::message::header::ContentType;
use lettre::message::{Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::{Credentials, Mechanism};
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::transport::smtp::extension::ClientId;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use std::time::Duration;

const SMTP_LIMIET: Duration = Duration::from_secs(60);
const VERSTUUR_LIMIET: Duration = Duration::from_secs(300);

pub struct Opgesteld {
    pub bericht_id: String,
    pub envelop: Envelope,
    /// Zoals verstuurd (zonder Bcc-kop).
    pub ruw: Vec<u8>,
    /// Met Bcc-kop, voor Verzonden en Concepten.
    pub ruw_met_bcc: Vec<u8>,
}

impl std::fmt::Debug for Opgesteld {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Opgesteld")
            .field("bericht_id", &self.bericht_id)
            .finish_non_exhaustive()
    }
}

/// Vertaalsleutel van een veldnaam zoals die in meldingen staat.
fn veldsleutel(veld: &str) -> &'static str {
    match veld {
        "Van" => "compose.field.from",
        "Aan" => "compose.field.to",
        "Cc" => "compose.field.cc",
        "Bcc" => "compose.field.bcc",
        "Antwoord aan" => "compose.field.replyTo",
        "Het onderwerp" => "compose.field.subject",
        "In-Reply-To" => "compose.field.inReplyTo",
        _ => "compose.field.references",
    }
}

fn ongeldig_adres(adres: String, veld: &str) -> MailFout {
    MailFout::geweigerd(format!("'{adres}' in {veld} is geen geldig e-mailadres."))
        .sleutel("compose.invalidAddress")
        .waarde("address", adres)
        .waarde("fieldKey", veldsleutel(veld))
}

fn mailbox(tekst: &str, veld: &str) -> Uitkomst<Mailbox> {
    let a = adres_uit_tekst(tekst).ok_or_else(|| ongeldig_adres(servertekst(tekst), veld))?;
    let adres = a
        .adres
        .parse()
        .map_err(|_| ongeldig_adres(a.adres.clone(), veld))?;
    Ok(Mailbox::new((!a.naam.is_empty()).then_some(a.naam), adres))
}

fn kopwaarde(t: &str, veld: &str) -> Uitkomst<String> {
    if t.contains(['\r', '\n', '\0']) {
        return Err(MailFout::geweigerd(format!("{veld} bevat ongeldige tekens."))
            .sleutel("compose.invalidCharacters")
            .waarde("fieldKey", veldsleutel(veld)));
    }
    Ok(t.trim().to_string())
}

fn idlijst(t: &str, veld: &str) -> Uitkomst<Option<String>> {
    let t = kopwaarde(t, veld)?;
    let ids: Vec<String> = t
        .split_whitespace()
        .map(met_haken)
        .filter(|i| i.len() > 2 && i.contains('@'))
        .collect();
    Ok((!ids.is_empty()).then(|| ids.join(" ")))
}

fn bestandsnaam(n: &str) -> String {
    let schoon: String = n
        .chars()
        .map(|c| {
            if c.is_control() || r#"/\"#.contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let schoon = schoon.trim().to_string();
    if schoon.is_empty() {
        "bijlage".into()
    } else {
        schoon
    }
}

/// Bouwt het bericht. Bij een concept zijn ontvangers optioneel.
pub fn stel_op(
    account: &Account,
    o: &Opstelling,
    limieten: Limieten,
    concept: bool,
) -> Uitkomst<Opgesteld> {
    use base64::Engine;
    let mut van = mailbox(
        if o.van.trim().is_empty() {
            &account.email
        } else {
            &o.van
        },
        "Van",
    )?;
    if van.name.is_none() && !account.volledige_naam.is_empty() {
        van.name = Some(account.volledige_naam.clone());
    }
    let mut builder = Message::builder()
        .from(van.clone())
        .subject(kopwaarde(&o.onderwerp, "Het onderwerp")?)
        .date(std::time::SystemTime::now());
    let mut ontvangers = 0;
    for (lijst, veld) in [(&o.aan, "Aan"), (&o.cc, "Cc"), (&o.bcc, "Bcc")] {
        for t in lijst.iter().filter(|t| !t.trim().is_empty()) {
            let m = mailbox(t, veld)?;
            ontvangers += 1;
            builder = match veld {
                "Aan" => builder.to(m),
                "Cc" => builder.cc(m),
                _ => builder.bcc(m),
            };
        }
    }
    if ontvangers == 0 && !concept {
        return Err(
            MailFout::geweigerd("Vul minstens één ontvanger in.").sleutel("compose.noRecipients"),
        );
    }
    if let Some(r) = account
        .antwoord_aan
        .as_deref()
        .filter(|r| !r.trim().is_empty())
    {
        builder = builder.reply_to(mailbox(r, "Antwoord aan")?);
    }
    let domein = van.email.domain().to_string();
    let bericht_id = format!("<{}@{}>", uuid::Uuid::new_v4(), domein);
    builder = builder.message_id(Some(bericht_id.clone()));
    if let Some(irt) = o
        .in_reply_to
        .as_deref()
        .map(|t| idlijst(t, "In-Reply-To"))
        .transpose()?
        .flatten()
    {
        builder = builder.in_reply_to(irt);
    }
    if let Some(refs) = o
        .referenties
        .as_deref()
        .map(|t| idlijst(t, "References"))
        .transpose()?
        .flatten()
    {
        builder = builder.references(refs);
    }
    builder = builder.user_agent("OpenAEC Email Studio".into());

    let alternatief = o
        .html
        .as_deref()
        .filter(|h| !h.trim().is_empty())
        .map(|html| MultiPart::alternative_plain_html(o.tekst.clone(), html.to_string()));
    let mut totaal = 0usize;
    let mut bijlagen = Vec::new();
    for b in &o.bijlagen {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b.bytes.trim())
            .map_err(|_| {
                let naam = bestandsnaam(&b.bestandsnaam);
                MailFout::geweigerd(format!("De bijlage '{naam}' is beschadigd."))
                    .sleutel("compose.attachmentCorrupt")
                    .waarde("name", naam)
            })?;
        totaal += bytes.len();
        if totaal > limieten.max_bijlagen {
            let max = limieten.max_bijlagen / (1024 * 1024);
            return Err(MailFout::te_groot(format!(
                "De bijlagen zijn samen groter dan {max} MB. Verstuur grote bestanden via een deellink."
            ))
            .sleutel("compose.attachmentsTooLarge")
            .waarde("max", max));
        }
        let soort = ContentType::parse(b.inhoudstype.trim()).unwrap_or_else(|_| {
            ContentType::parse("application/octet-stream").expect("geldig type")
        });
        bijlagen.push(Attachment::new(bestandsnaam(&b.bestandsnaam)).body(bytes, soort));
    }
    let lichaam: Result<MultiPart, SinglePart> = match (alternatief, bijlagen.is_empty()) {
        (Some(alt), true) => Ok(alt),
        (None, true) => Err(SinglePart::plain(o.tekst.clone())),
        (alt, false) => {
            let mut gemengd = match alt {
                Some(alt) => MultiPart::mixed().multipart(alt),
                None => MultiPart::mixed().singlepart(SinglePart::plain(o.tekst.clone())),
            };
            for b in bijlagen {
                gemengd = gemengd.singlepart(b);
            }
            Ok(gemengd)
        }
    };
    let concept_envelop = || Envelope::new(Some(van.email.clone()), vec![van.email.clone()]);
    let mut met_bcc = builder.clone().keep_bcc();
    let mut zonder_bcc = builder;
    if ontvangers == 0 {
        let fout = |_| MailFout::intern("Ongeldige envelop.").sleutel("compose.invalidEnvelope");
        met_bcc = met_bcc.envelope(concept_envelop().map_err(fout)?);
        zonder_bcc = zonder_bcc.envelope(concept_envelop().map_err(fout)?);
    }
    let bouw = |b: lettre::message::MessageBuilder| {
        match &lichaam {
            Ok(m) => b.multipart(m.clone()),
            Err(e) => b.singlepart(e.clone()),
        }
        .map_err(|e| {
            MailFout::geweigerd(format!("Het bericht kon niet worden opgesteld ({e})."))
                .sleutel("compose.buildFailed")
                .waarde("detail", e)
        })
    };
    let met_bcc = bouw(met_bcc)?;
    let verstuurd = bouw(zonder_bcc)?;
    Ok(Opgesteld {
        bericht_id,
        envelop: verstuurd.envelope().clone(),
        ruw: verstuurd.formatted(),
        ruw_met_bcc: met_bcc.formatted(),
    })
}

/// Servers die verzonden mail zelf in Verzonden zetten; een APPEND zou een
/// dubbele kopie geven.
pub fn server_bewaart_zelf(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    h == "smtp.gmail.com"
        || h.ends_with(".gmail.com")
        || h.ends_with(".googlemail.com")
        || h == "smtp.office365.com"
        || h == "smtp-mail.outlook.com"
}

fn smtpfout(e: lettre::transport::smtp::Error, host: &str) -> MailFout {
    use std::error::Error as _;
    if e.is_timeout() {
        return geen_antwoord(host);
    }
    // TLS- en I/O-fouten zitten in de bronketen.
    let mut bron = e.source();
    while let Some(b) = bron {
        if let Some(tls) = b.downcast_ref::<rustls::Error>() {
            return super::fout::uit_tls(tls, host);
        }
        if let Some(io) = b.downcast_ref::<std::io::Error>() {
            return super::fout::uit_io(io, host);
        }
        bron = b.source();
    }
    if let Some(code) = e.status() {
        let tekst = servertekst(&e.to_string());
        let c: u16 = code.to_string().parse().unwrap_or(0);
        let f = match c {
            530 | 534 | 535 | 454 => return aanmelden_mislukt(host, tekst),
            552 => MailFout::te_groot(format!("{host} weigert het bericht omdat het te groot is ({tekst})."))
                .sleutel("smtp.messageTooLarge"),
            _ if e.is_transient() => MailFout::verbinding(format!("{host} kan het bericht nu niet aannemen; probeer het later opnieuw ({tekst})."))
                .sleutel("smtp.tryLater"),
            _ => MailFout::geweigerd(format!("{host} weigerde het bericht ({tekst})."))
                .sleutel("smtp.rejected"),
        };
        return f.waarde("host", host).waarde("detail", tekst);
    }
    let tekst = servertekst(&e.to_string());
    if e.is_tls() {
        return MailFout::verbinding(format!(
            "De beveiligde verbinding met {host} kwam niet tot stand ({tekst}). Past de beveiliging bij de poort?"
        ))
        .sleutel("smtp.tlsFailed")
        .waarde("host", host)
        .waarde("detail", tekst);
    }
    if tekst.contains("does not expect a challenge") {
        // XOAUTH2 geweigerd: de server stuurt een foutuitdaging.
        return MailFout::aanmelding(format!(
            "{host} weigerde het OAuth2-token; opnieuw aanmelden kan nodig zijn."
        ))
        .sleutel("smtp.oauthRejected")
        .waarde("host", host);
    }
    if tekst.contains("No compatible authentication mechanism") {
        return MailFout::aanmelding(format!(
            "{host} biedt geen aanmeldmethode aan die Email Studio ondersteunt (PLAIN of LOGIN). \
             Kies STARTTLS of SSL/TLS; veel servers bieden aanmelden pas na versleuteling aan."
        ))
        .sleutel("smtp.noAuthMechanism")
        .waarde("host", host);
    }
    MailFout::verbinding(format!("SMTP-fout bij {host}: {tekst}"))
        .sleutel("smtp.error")
        .waarde("host", host)
        .waarde("detail", tekst)
}

fn geen_antwoord(host: &str) -> MailFout {
    MailFout::tijdslimiet(format!("{host} reageerde niet op tijd."))
        .sleutel("server.noTimelyResponse")
        .waarde("host", host)
}

async fn transport(
    server: &ServerInstelling,
    wachtwoord: &str,
) -> Uitkomst<AsyncSmtpTransport<Tokio1Executor>> {
    controleer_beveiliging(server, true)?;
    let methoden = match server.authenticatie {
        Authenticatie::Normaal => vec![Mechanism::Plain, Mechanism::Login],
        Authenticatie::Oauth2 => vec![Mechanism::Xoauth2],
        Authenticatie::Versleuteld => {
            return Err(MailFout::niet_beschikbaar(
                "Deze aanmeldmethode wordt voor SMTP niet ondersteund.",
            )
            .sleutel("smtp.authMethodUnsupported"))
        }
    };
    if wachtwoord.is_empty() {
        return Err(geen_wachtwoord());
    }
    let host = kale_host(&server.host).to_string();
    let tls = match server.beveiliging {
        Beveiliging::Ssl | Beveiliging::Starttls => {
            let p = TlsParameters::new(host.clone()).map_err(|_| geen_tls_naam(&host))?;
            if server.beveiliging == Beveiliging::Ssl {
                Tls::Wrapper(p)
            } else {
                Tls::Required(p)
            }
        }
        Beveiliging::Geen => {
            // Alleen naar deze computer: alle adressen van de naam moeten loopback zijn.
            let adressen: Vec<_> = tokio::net::lookup_host((host.as_str(), server.poort))
                .await
                .map_err(|e| super::fout::uit_io(&e, &host))?
                .collect();
            if adressen.is_empty()
                || !adressen.iter().all(|a| a.ip().is_loopback())
                || !is_localhost(&host)
            {
                return Err(niet_lokaal(&host));
            }
            Tls::None
        }
    };
    Ok(
        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host)
            .port(server.poort)
            .tls(tls)
            .hello_name(ClientId::Ipv4(std::net::Ipv4Addr::LOCALHOST))
            .credentials(Credentials::new(
                server.gebruikersnaam.trim().to_string(),
                wachtwoord.to_string(),
            ))
            .authentication(methoden)
            .timeout(Some(SMTP_LIMIET))
            .build(),
    )
}

pub async fn test(server: &ServerInstelling, wachtwoord: &str) -> Uitkomst<Deeluitkomst> {
    let waarschuwing = controleer_beveiliging(server, true)?;
    let host = kale_host(&server.host).to_string();
    let t = transport(server, wachtwoord).await?;
    tokio::time::timeout(SMTP_LIMIET, t.test_connection())
        .await
        .map_err(|_| geen_antwoord(&host))?
        .map_err(|e| smtpfout(e, &host).zonder_geheim(wachtwoord))?;
    Ok(Deeluitkomst::aangemeld(&host, "SMTP", waarschuwing))
}

pub async fn verstuur(server: &ServerInstelling, wachtwoord: &str, o: &Opgesteld) -> Uitkomst<()> {
    let host = kale_host(&server.host).to_string();
    let t = transport(server, wachtwoord).await?;
    tokio::time::timeout(VERSTUUR_LIMIET, t.send_raw(&o.envelop, &o.ruw))
        .await
        .map_err(|_| {
            MailFout::tijdslimiet(format!("Versturen via {host} duurde te lang."))
                .sleutel("smtp.sendTimeout")
                .waarde("host", &host)
        })?
        .map_err(|e| smtpfout(e, &host).zonder_geheim(wachtwoord))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::accounts::tests::invoer;
    use crate::email::OpstellingBijlage;

    fn opstelling() -> Opstelling {
        Opstelling {
            van: "Jan Jansen <jan@example.org>".into(),
            aan: vec!["Piet <piet@example.org>".into()],
            cc: vec!["klaas@example.org".into()],
            bcc: vec!["geheim@example.org".into()],
            onderwerp: "Re: Offerte".into(),
            tekst: "Hallo Piet".into(),
            html: Some("<p>Hallo <b>Piet</b></p>".into()),
            in_reply_to: Some("<vorige@example.org>".into()),
            referenties: Some("eerste@example.org <vorige@example.org>".into()),
            bijlagen: vec![OpstellingBijlage {
                bestandsnaam: "tekening.pdf".into(),
                inhoudstype: "application/pdf".into(),
                bytes: "JVBERi0xLjQK".into(),
            }],
        }
    }

    #[test]
    fn stelt_bericht_op() {
        let a = invoer("mail.example.org", 993, 465, Beveiliging::Ssl).naar_account("x".into());
        let o = stel_op(&a, &opstelling(), Limieten::default(), false).unwrap();
        let tekst = String::from_utf8_lossy(&o.ruw).to_string();
        assert!(o.bericht_id.starts_with('<') && o.bericht_id.ends_with("@example.org>"));
        assert!(tekst.contains(&format!("Message-ID: {}", o.bericht_id)));
        assert!(tekst.contains("In-Reply-To: <vorige@example.org>"));
        assert!(tekst.contains("References: <eerste@example.org> <vorige@example.org>"));
        assert!(tekst.contains("multipart/alternative"));
        assert!(tekst.contains("multipart/mixed"));
        assert!(tekst.contains("tekening.pdf"));
        assert!(
            !tekst.contains("geheim@example.org"),
            "Bcc hoort niet in het verstuurde bericht"
        );
        assert!(String::from_utf8_lossy(&o.ruw_met_bcc).contains("geheim@example.org"));
        assert_eq!(o.envelop.to().len(), 3);
        let p = crate::email::mime::bericht(1, "Sent", &o.ruw_met_bcc, Default::default()).unwrap();
        assert_eq!(p.bijlagen[0].bestandsnaam, "tekening.pdf");
        assert_eq!(p.kop.onderwerp, "Re: Offerte");
        assert!(p.html.contains("<b>Piet</b>"));
    }

    #[test]
    fn grenzen_en_validatie() {
        let a = invoer("mail.example.org", 993, 465, Beveiliging::Ssl).naar_account("x".into());
        let mut o = opstelling();
        o.aan = vec!["geen adres".into()];
        assert_eq!(
            stel_op(&a, &o, Limieten::default(), false)
                .unwrap_err()
                .code,
            crate::email::fout::Foutcode::Geweigerd
        );
        let mut o = opstelling();
        o.onderwerp = "Hoi\r\nBcc: x@y.org".into();
        assert!(stel_op(&a, &o, Limieten::default(), false).is_err());
        let mut o = opstelling();
        o.aan.clear();
        o.cc.clear();
        o.bcc.clear();
        assert!(stel_op(&a, &o, Limieten::default(), false).is_err());
        // Een concept zonder ontvangers mag.
        assert!(stel_op(&a, &o, Limieten::default(), true).is_ok());
        let klein = Limieten {
            max_bericht: 1000,
            max_bijlagen: 4,
        };
        assert_eq!(
            stel_op(&a, &opstelling(), klein, false).unwrap_err().code,
            crate::email::fout::Foutcode::TeGroot
        );
    }

    #[test]
    fn gmail_bewaart_zelf() {
        assert!(server_bewaart_zelf("smtp.gmail.com"));
        assert!(!server_bewaart_zelf("smtp.example.org"));
    }
}
