//! MIME-ontleding met `mail-parser`: berichtkoppen voor de lijst, volledige
//! berichten, bijlagen en adressen. Aanpak naar de Y-app-desktopimplementatie
//! (zie de herkomstvermelding in `mod.rs`).

use super::fout::{MailFout, Uitkomst};
use super::{Adres, Bericht, BerichtKop, BijlageInfo};
use mail_parser::{HeaderValue, Message, MessageParser, MessagePart, MimeHeaders, PartType};

/// IMAP-vlaggen die voor de interface tellen.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Vlaggen {
    pub gelezen: bool,
    pub gemarkeerd: bool,
    pub beantwoord: bool,
}

pub fn ontleed(bytes: &[u8]) -> Option<Message<'_>> {
    MessageParser::default().parse(bytes)
}

pub fn adressen(adres: Option<&mail_parser::Address<'_>>) -> Vec<Adres> {
    let Some(adres) = adres else {
        return Vec::new();
    };
    adres
        .iter()
        .filter_map(|a| {
            let adres = a.address().unwrap_or("").trim().to_string();
            let naam = a.name().unwrap_or("").trim().to_string();
            (!adres.is_empty() || !naam.is_empty()).then_some(Adres { naam, adres })
        })
        .collect()
}

/// Message-ID's in kopvorm (`<id>`), gescheiden door spaties.
pub fn idlijst(waarde: &HeaderValue<'_>) -> Option<String> {
    let ids: Vec<String> = match waarde {
        HeaderValue::Text(t) => vec![t.to_string()],
        HeaderValue::TextList(l) => l.iter().map(|t| t.to_string()).collect(),
        _ => Vec::new(),
    };
    let ids: Vec<String> = ids
        .iter()
        .map(|i| met_haken(i))
        .filter(|i| i.len() > 2)
        .collect();
    (!ids.is_empty()).then(|| ids.join(" "))
}

pub fn met_haken(id: &str) -> String {
    let kaal = id.trim().trim_start_matches('<').trim_end_matches('>');
    format!("<{kaal}>")
}

fn inhoudstype(deel: &MessagePart<'_>) -> String {
    deel.content_type()
        .map(|ct| match ct.subtype() {
            Some(sub) => format!("{}/{}", ct.ctype(), sub),
            None => ct.ctype().to_string(),
        })
        .unwrap_or_else(|| "application/octet-stream".into())
        .to_ascii_lowercase()
}

fn is_inline(deel: &MessagePart<'_>) -> bool {
    match deel.content_disposition() {
        Some(cd) => cd.is_inline(),
        None => deel.content_id().is_some(),
    }
}

/// Bijlagen in volgorde; de `index` is de positie die `bijlage` verwacht.
pub fn bijlagen(bericht: &Message<'_>) -> Vec<BijlageInfo> {
    bericht
        .attachments()
        .enumerate()
        .map(|(index, deel)| {
            let bestandsnaam = deel
                .attachment_name()
                .map(str::to_string)
                .or_else(|| {
                    deel.message()
                        .and_then(|m| m.subject())
                        .map(|s| format!("{}.eml", veilige_naam(s)))
                })
                .unwrap_or_else(|| format!("bijlage-{}", index + 1));
            BijlageInfo {
                index: index as u32,
                bestandsnaam,
                inhoudstype: if matches!(deel.body, PartType::Message(_)) {
                    "message/rfc822".into()
                } else {
                    inhoudstype(deel)
                },
                grootte: deel.len() as u64,
                content_id: deel.content_id().map(|c| {
                    c.trim()
                        .trim_start_matches('<')
                        .trim_end_matches('>')
                        .to_string()
                }),
                inline: is_inline(deel),
            }
        })
        .collect()
}

fn veilige_naam(s: &str) -> String {
    let schoon: String = s
        .chars()
        .map(|c| {
            if r#"<>:"/\|?*"#.contains(c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .take(80)
        .collect();
    let schoon = schoon.trim().trim_start_matches('.').to_string();
    if schoon.is_empty() {
        "bericht".into()
    } else {
        schoon
    }
}

pub fn bijlage_bytes(bron: &[u8], index: u32) -> Uitkomst<Vec<u8>> {
    let bericht = ontleed(bron).ok_or_else(|| {
        MailFout::intern("Het bericht kon niet worden gelezen.").sleutel("messages.unreadable")
    })?;
    let deel = bericht
        .attachments()
        .nth(index as usize)
        .map(|d| d.contents().to_vec());
    deel.ok_or_else(|| {
        MailFout::niet_gevonden(format!("Bijlage {index} bestaat niet in dit bericht."))
            .sleutel("attachments.notFound")
            .waarde("index", index)
    })
}

/// Kop uit de (gedeeltelijke) kopregels van een FETCH.
pub fn kop(
    uid: u32,
    map: &str,
    kopbytes: &[u8],
    vlaggen: Vlaggen,
    grootte: u32,
    interne_datum: Option<String>,
) -> BerichtKop {
    let tekst = String::from_utf8_lossy(kopbytes).to_ascii_lowercase();
    let heeft_bijlagen = tekst.contains("multipart/mixed");
    let mut kop = match ontleed(kopbytes) {
        Some(p) => kop_uit(&p, uid, map),
        None => BerichtKop {
            uid,
            map: map.to_string(),
            ..Default::default()
        },
    };
    if kop.datum.is_none() {
        kop.datum = interne_datum;
    }
    kop.gelezen = vlaggen.gelezen;
    kop.gemarkeerd = vlaggen.gemarkeerd;
    kop.beantwoord = vlaggen.beantwoord;
    kop.grootte = grootte as u64;
    kop.heeft_bijlagen = heeft_bijlagen;
    kop
}

fn kop_uit(p: &Message<'_>, uid: u32, map: &str) -> BerichtKop {
    BerichtKop {
        uid,
        map: map.to_string(),
        datum: p.date().map(|d| d.to_rfc3339()),
        onderwerp: p.subject().unwrap_or("").to_string(),
        van: adressen(p.from()),
        aan: adressen(p.to()),
        cc: adressen(p.cc()),
        bericht_id: p.message_id().map(met_haken),
        in_reply_to: idlijst(p.in_reply_to()),
        referenties: idlijst(p.references()),
        ..Default::default()
    }
}

/// Volledig bericht uit de ruwe bron.
pub fn bericht(uid: u32, map: &str, bron: &[u8], vlaggen: Vlaggen) -> Uitkomst<Bericht> {
    let p = ontleed(bron).ok_or_else(|| {
        MailFout::intern("Het bericht kon niet worden gelezen (ongeldige MIME-opbouw).")
            .sleutel("messages.invalidMime")
    })?;
    let mut kop = kop_uit(&p, uid, map);
    kop.gelezen = vlaggen.gelezen;
    kop.gemarkeerd = vlaggen.gemarkeerd;
    kop.beantwoord = vlaggen.beantwoord;
    kop.grootte = bron.len() as u64;
    let bijlagen = bijlagen(&p);
    kop.heeft_bijlagen = bijlagen.iter().any(|b| !b.inline);
    // Alleen echte HTML-delen: mail-parser zet platte tekst anders om naar HTML.
    let html = p
        .html_body
        .iter()
        .filter_map(|id| p.parts.get(*id as usize))
        .find_map(|deel| match &deel.body {
            PartType::Html(h) => Some(h.to_string()),
            _ => None,
        })
        .unwrap_or_default();
    let tekst = p.body_text(0).map(|t| t.into_owned()).unwrap_or_default();
    Ok(Bericht {
        kop,
        bcc: adressen(p.bcc()),
        antwoord_aan: adressen(p.reply_to()),
        tekst,
        html,
        bijlagen,
    })
}

/// Splitst "Naam <adres>" of een kaal adres op; `None` als er geen geldig
/// adres in staat.
pub fn adres_uit_tekst(tekst: &str) -> Option<Adres> {
    let tekst = tekst.trim();
    if tekst.contains(['\r', '\n']) {
        return None;
    }
    let (naam, adres) = match (tekst.rfind('<'), tekst.rfind('>')) {
        (Some(b), Some(e)) if b < e => (
            tekst[..b].trim().trim_matches('"').trim().to_string(),
            tekst[b + 1..e].trim().to_string(),
        ),
        _ => (String::new(), tekst.to_string()),
    };
    is_adres(&adres).then_some(Adres { naam, adres })
}

/// Eenvoudige, bewust strenge controle van een e-mailadres.
pub fn is_adres(adres: &str) -> bool {
    let Some((lokaal, domein)) = adres.rsplit_once('@') else {
        return false;
    };
    !lokaal.is_empty()
        && lokaal.len() <= 64
        && !lokaal
            .contains(|c: char| c.is_whitespace() || c.is_control() || "<>()[]\\,;:\"".contains(c))
        && super::autoconfig::is_domein(domein)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EENVOUDIG: &[u8] = b"From: \"Jan Jansen\" <jan@example.org>\r\n\
To: piet@example.org, Klaas <klaas@example.org>\r\n\
Cc: undisclosed-recipients:;\r\n\
Subject: =?UTF-8?Q?Overleg_=C3=A9n_planning?=\r\n\
Date: Tue, 27 Oct 2026 10:15:00 +0100\r\n\
Message-ID: <abc123@example.org>\r\n\
In-Reply-To: <vorige@example.org>\r\n\
References: <eerste@example.org> <vorige@example.org>\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
Hallo Piet,\r\n\r\nTot morgen.\r\n";

    const MET_BIJLAGE: &[u8] = b"From: a@example.org\r\n\
To: b@example.org\r\n\
Subject: Tekening\r\n\
Message-ID: <x@example.org>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary=\"GRENS\"\r\n\
\r\n\
--GRENS\r\n\
Content-Type: multipart/alternative; boundary=\"ALT\"\r\n\
\r\n\
--ALT\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
Zie bijlage.\r\n\
--ALT\r\n\
Content-Type: text/html; charset=utf-8\r\n\
\r\n\
<p>Zie <b>bijlage</b>.<img src=\"cid:logo@x\"></p>\r\n\
--ALT--\r\n\
--GRENS\r\n\
Content-Type: image/png\r\n\
Content-ID: <logo@x>\r\n\
Content-Disposition: inline\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
iVBORw0KGgo=\r\n\
--GRENS\r\n\
Content-Type: application/pdf; name=\"tekening.pdf\"\r\n\
Content-Disposition: attachment; filename=\"tekening.pdf\"\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
JVBERi0xLjQK\r\n\
--GRENS--\r\n";

    #[test]
    fn ontleedt_kop_en_adressen() {
        let b = bericht(7, "INBOX", EENVOUDIG, Vlaggen::default()).unwrap();
        assert_eq!(b.kop.onderwerp, "Overleg én planning");
        assert_eq!(
            b.kop.van,
            vec![Adres {
                naam: "Jan Jansen".into(),
                adres: "jan@example.org".into()
            }]
        );
        assert_eq!(b.kop.aan.len(), 2);
        assert_eq!(b.kop.aan[1].naam, "Klaas");
        assert!(b.kop.cc.is_empty());
        assert_eq!(b.kop.bericht_id.as_deref(), Some("<abc123@example.org>"));
        assert_eq!(b.kop.in_reply_to.as_deref(), Some("<vorige@example.org>"));
        assert_eq!(
            b.kop.referenties.as_deref(),
            Some("<eerste@example.org> <vorige@example.org>")
        );
        assert!(b
            .kop
            .datum
            .as_deref()
            .unwrap()
            .starts_with("2026-10-27T10:15:00"));
        assert!(b.tekst.contains("Tot morgen."));
        assert_eq!(b.html, "", "platte tekst mag niet als HTML terugkomen");
        assert!(!b.kop.heeft_bijlagen);
    }

    #[test]
    fn ontleedt_bijlagen_en_html() {
        let b = bericht(
            1,
            "INBOX",
            MET_BIJLAGE,
            Vlaggen {
                gelezen: true,
                ..Default::default()
            },
        )
        .unwrap();
        assert!(b.html.contains("<b>bijlage</b>"));
        assert!(b.tekst.contains("Zie bijlage."));
        assert_eq!(b.bijlagen.len(), 2);
        assert_eq!(b.bijlagen[0].content_id.as_deref(), Some("logo@x"));
        assert!(b.bijlagen[0].inline);
        assert_eq!(b.bijlagen[1].bestandsnaam, "tekening.pdf");
        assert_eq!(b.bijlagen[1].inhoudstype, "application/pdf");
        assert!(!b.bijlagen[1].inline);
        assert!(b.kop.heeft_bijlagen);
        assert!(b.kop.gelezen);
        assert_eq!(bijlage_bytes(MET_BIJLAGE, 1).unwrap(), b"%PDF-1.4\n");
        assert_eq!(
            bijlage_bytes(MET_BIJLAGE, 5).unwrap_err().code,
            super::super::fout::Foutcode::NietGevonden
        );
    }

    #[test]
    fn kop_uit_header_fields_met_interne_datum() {
        let kopdeel = b"Subject: Hoi\r\nFrom: x@example.org\r\nContent-Type: multipart/mixed; boundary=a\r\n\r\n";
        let k = kop(
            3,
            "Map",
            kopdeel,
            Vlaggen {
                gemarkeerd: true,
                ..Default::default()
            },
            1234,
            Some("2026-01-01T00:00:00+00:00".into()),
        );
        assert_eq!(k.onderwerp, "Hoi");
        assert!(k.heeft_bijlagen);
        assert!(k.gemarkeerd);
        assert_eq!(k.grootte, 1234);
        assert_eq!(k.datum.as_deref(), Some("2026-01-01T00:00:00+00:00"));
    }

    #[test]
    fn adressen_uit_tekst() {
        assert_eq!(
            adres_uit_tekst("\"Jan, J.\" <jan@example.org>"),
            Some(Adres {
                naam: "Jan, J.".into(),
                adres: "jan@example.org".into()
            })
        );
        assert_eq!(adres_uit_tekst("piet@example.nl").unwrap().naam, "");
        assert!(adres_uit_tekst("geen adres").is_none());
        assert!(adres_uit_tekst("a@b").is_none());
        assert!(adres_uit_tekst("x@example.org\r\nBcc: y@example.org").is_none());
        assert!(is_adres("voornaam.achternaam+tag@sub.example.co.uk"));
        assert!(!is_adres("a b@example.org"));
    }
}
