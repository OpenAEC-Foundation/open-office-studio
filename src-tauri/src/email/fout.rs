//! Foutmodel van Email Studio: elke fout gaat als `{code, melding}` naar de
//! interface (zie `MailFout` in `packages/email/src/contract.ts`), zo nodig
//! aangevuld met `sleutel` en `waarden` zodat de interface hem kan vertalen.
//!
//! - `melding` is de Nederlandse tekst; die blijft altijd aanwezig (terugval
//!   voor de interface, en voor logboek en tests).
//! - `sleutel` is een stabiele, Engelstalige sleutel in camelCase met punten
//!   (bijv. `connection.timeout`). De interface vertaalt
//!   `email:backend.<sleutel>` met i18next; zonder sleutel toont zij `melding`.
//!   Eén sleutel per betekenis: dezelfde Nederlandse tekst = dezelfde sleutel.
//! - `waarden` zijn de interpolatiewaarden (`{{host}}`, `{{port}}` …), altijd
//!   als tekst. Servertekst (`servertekst`) en foutteksten van bibliotheken
//!   staan onvertaald in `detail`.
//! - Een waarde waarvan de naam op `Key` eindigt (bijv. `reasonKey`,
//!   `actionKey`, `messageKey`) bevat zelf een sleutel, zonder het voorvoegsel
//!   `backend.`. De interface vertaalt eerst die deeltekst (met dezelfde
//!   waarden; dat kan genest zijn) en vult het resultaat in onder de naam
//!   zonder `Key`: `reasonKey` → `{{reason}}`.
//! - Zonder sleutel blijft de JSON exact `{code, melding}`: lege velden worden
//!   niet geserialiseerd.
//!
//! `Tekst` is dezelfde vorm zonder code, voor gewone meldingen (de uitkomst
//! van de verbindingstest, de OAuth-status).
//!
//! Meldingen en waarden bevatten nooit wachtwoorden, tokens, client-geheimen
//! of autorisatiecodes.

use serde::Serialize;
use std::collections::BTreeMap;
use std::fmt;

/// Interpolatiewaarden bij een sleutel.
pub type Waarden = BTreeMap<&'static str, String>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Foutcode {
    Verbinding,
    Aanmelding,
    Certificaat,
    Tijdslimiet,
    NietGevonden,
    Geweigerd,
    TeGroot,
    NietBeschikbaar,
    Intern,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MailFout {
    pub code: Foutcode,
    pub melding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sleutel: Option<&'static str>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub waarden: Waarden,
}

pub type Uitkomst<T> = Result<T, MailFout>;

/// Vertaalbare melding zonder foutcode.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Tekst {
    pub melding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sleutel: Option<&'static str>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub waarden: Waarden,
}

impl Tekst {
    pub fn nieuw(sleutel: &'static str, melding: impl Into<String>) -> Self {
        Self {
            melding: melding.into(),
            sleutel: Some(sleutel),
            waarden: Waarden::new(),
        }
    }
    pub fn waarde(mut self, naam: &'static str, waarde: impl ToString) -> Self {
        self.waarden.insert(naam, waarde.to_string());
        self
    }
}

/// Vervangt een geheim in een tekst door bolletjes.
fn schoon(tekst: &mut String, geheim: &str) {
    if geheim.len() >= 3 && tekst.contains(geheim) {
        *tekst = tekst.replace(geheim, "••••");
    }
}

impl MailFout {
    pub fn nieuw(code: Foutcode, melding: impl Into<String>) -> Self {
        Self {
            code,
            melding: melding.into(),
            sleutel: None,
            waarden: Waarden::new(),
        }
    }
    pub fn verbinding(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Verbinding, m)
    }
    pub fn aanmelding(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Aanmelding, m)
    }
    pub fn certificaat(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Certificaat, m)
    }
    pub fn tijdslimiet(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Tijdslimiet, m)
    }
    pub fn niet_gevonden(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::NietGevonden, m)
    }
    pub fn geweigerd(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Geweigerd, m)
    }
    pub fn te_groot(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::TeGroot, m)
    }
    pub fn niet_beschikbaar(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::NietBeschikbaar, m)
    }
    pub fn intern(m: impl Into<String>) -> Self {
        Self::nieuw(Foutcode::Intern, m)
    }

    /// Vertaalsleutel (zonder `backend.`); zie de uitleg bovenaan.
    pub fn sleutel(mut self, sleutel: &'static str) -> Self {
        self.sleutel = Some(sleutel);
        self
    }

    /// Interpolatiewaarde bij de sleutel; nooit een geheim.
    pub fn waarde(mut self, naam: &'static str, waarde: impl ToString) -> Self {
        self.waarden.insert(naam, waarde.to_string());
        self
    }

    /// Verwijdert een geheim uit de melding en uit de waarden, voor het geval
    /// een server of bibliotheek het (onverhoopt) terugkaatst.
    pub fn zonder_geheim(mut self, geheim: &str) -> Self {
        schoon(&mut self.melding, geheim);
        for w in self.waarden.values_mut() {
            schoon(w, geheim);
        }
        self
    }
}

impl fmt::Display for MailFout {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.code, self.melding)
    }
}

impl std::error::Error for MailFout {}

/// Kort en veilig: servertekst wordt ingekort en ontdaan van stuurtekens.
pub fn servertekst(tekst: &str) -> String {
    let schoon: String = tekst
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let schoon = schoon.trim();
    if schoon.chars().count() > 200 {
        format!("{}…", schoon.chars().take(200).collect::<String>())
    } else {
        schoon.to_string()
    }
}

/* ─── Gedeelde meldingen van IMAP en SMTP ─── */

/// Geen wachtwoord of token beschikbaar.
pub fn geen_wachtwoord() -> MailFout {
    MailFout::aanmelding("Er is geen wachtwoord ingevuld of opgeslagen voor dit account.")
        .sleutel("auth.noPassword")
}

/// De servernaam is niet bruikbaar voor TLS.
pub fn geen_tls_naam(host: &str) -> MailFout {
    MailFout::verbinding(format!("'{host}' is geen geldige servernaam voor TLS."))
        .sleutel("tls.invalidServerName")
        .waarde("host", host)
}

/// Onversleuteld mag alleen naar deze computer.
pub fn niet_lokaal(host: &str) -> MailFout {
    MailFout::geweigerd(format!(
        "{host} is niet deze computer; een onversleutelde verbinding is daarom geweigerd."
    ))
    .sleutel("security.notLocalhost")
    .waarde("host", host)
}

/// Aanmelden mislukt (IMAP NO/BAD of SMTP 530/534/535/454).
pub fn aanmelden_mislukt(host: &str, detail: String) -> MailFout {
    MailFout::aanmelding(format!(
        "Aanmelden bij {host} is mislukt: gebruikersnaam of wachtwoord klopt niet ({detail}). \
         Bij Gmail, Outlook, iCloud en Yahoo is een app-wachtwoord nodig."
    ))
    .sleutel("auth.failed")
    .waarde("host", host)
    .waarde("detail", detail)
}

/// Vertaalt een I/O-fout (inclusief TLS-fouten van rustls) naar een mailfout.
pub fn uit_io(fout: &std::io::Error, host: &str) -> MailFout {
    if let Some(binnen) = fout.get_ref() {
        if let Some(tls) = binnen.downcast_ref::<rustls::Error>() {
            return uit_tls(tls, host);
        }
    }
    use std::io::ErrorKind::*;
    let f = match fout.kind() {
        TimedOut => MailFout::tijdslimiet(format!(
            "De server {host} reageerde niet op tijd. Controleer de servernaam, de poort en de firewall."
        ))
        .sleutel("connection.timeout"),
        ConnectionRefused => MailFout::verbinding(format!(
            "De server {host} weigerde de verbinding. Controleer de poort en de beveiligingsinstelling."
        ))
        .sleutel("connection.refused"),
        NotFound => MailFout::verbinding(format!("De servernaam {host} is niet gevonden."))
            .sleutel("connection.hostNotFound"),
        ConnectionReset | ConnectionAborted | BrokenPipe | UnexpectedEof => {
            MailFout::verbinding(format!(
                "De verbinding met {host} werd onverwacht verbroken. Past de beveiliging (SSL/TLS of STARTTLS) bij de poort?"
            ))
            .sleutel("connection.reset")
        }
        _ => {
            let detail = servertekst(&fout.to_string());
            MailFout::verbinding(format!("Geen verbinding met {host}: {detail}"))
                .sleutel("connection.failed")
                .waarde("detail", detail)
        }
    };
    f.waarde("host", host)
}

pub fn uit_tls(fout: &rustls::Error, host: &str) -> MailFout {
    use rustls::{CertificateError, Error};
    match fout {
        Error::InvalidCertificate(c) => {
            let mut detail = None;
            let (reden, reden_sleutel) = match c {
                CertificateError::Expired | CertificateError::ExpiredContext { .. } => {
                    ("het certificaat is verlopen".to_string(), "tls.reason.expired")
                }
                CertificateError::NotValidYet | CertificateError::NotValidYetContext { .. } => (
                    "het certificaat is nog niet geldig (klopt de klok van deze computer?)".into(),
                    "tls.reason.notYetValid",
                ),
                CertificateError::UnknownIssuer => (
                    "het certificaat is niet uitgegeven door een vertrouwde certificaatautoriteit (mogelijk zelfondertekend)".into(),
                    "tls.reason.unknownIssuer",
                ),
                CertificateError::NotValidForName
                | CertificateError::NotValidForNameContext { .. } => (
                    format!("het certificaat hoort niet bij de naam {host}; gebruik de servernaam die op het certificaat staat"),
                    "tls.reason.wrongName",
                ),
                CertificateError::Revoked => {
                    ("het certificaat is ingetrokken".into(), "tls.reason.revoked")
                }
                andere => {
                    let d = format!("{andere:?}");
                    let tekst = format!("het certificaat is ongeldig ({d})");
                    detail = Some(d);
                    (tekst, "tls.reason.invalid")
                }
            };
            let f = MailFout::certificaat(format!(
                "De beveiligde verbinding met {host} is geweigerd: {reden}. \
                 Om je wachtwoord te beschermen maakt Email Studio geen verbinding met een server waarvan de identiteit niet vaststaat."
            ))
            .sleutel("tls.certificateRejected")
            .waarde("host", host)
            .waarde("reasonKey", reden_sleutel);
            match detail {
                Some(d) => f.waarde("detail", d),
                None => f,
            }
        }
        andere => {
            let detail = servertekst(&andere.to_string());
            MailFout::verbinding(format!(
                "De beveiligde verbinding met {host} kwam niet tot stand ({detail}). Past de beveiliging (SSL/TLS of STARTTLS) bij de poort?"
            ))
            .sleutel("tls.handshakeFailed")
            .waarde("host", host)
            .waarde("detail", detail)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialiseert_volgens_contract() {
        let f = MailFout::niet_beschikbaar("x");
        assert_eq!(
            serde_json::to_value(&f).unwrap(),
            serde_json::json!({"code": "niet-beschikbaar", "melding": "x"})
        );
        assert_eq!(
            serde_json::to_value(Foutcode::TeGroot).unwrap(),
            serde_json::json!("te-groot")
        );
    }

    #[test]
    fn serialiseert_sleutel_en_waarden() {
        let f = MailFout::tijdslimiet("De server mail.example.org reageerde niet op tijd.")
            .sleutel("connection.timeout")
            .waarde("host", "mail.example.org")
            .waarde("port", 993);
        assert_eq!(
            serde_json::to_value(&f).unwrap(),
            serde_json::json!({
                "code": "tijdslimiet",
                "melding": "De server mail.example.org reageerde niet op tijd.",
                "sleutel": "connection.timeout",
                "waarden": {"host": "mail.example.org", "port": "993"}
            })
        );
        let t = Tekst::nieuw("test.signedIn", "Aangemeld bij x.").waarde("host", "x");
        assert_eq!(
            serde_json::to_value(&t).unwrap(),
            serde_json::json!({
                "melding": "Aangemeld bij x.",
                "sleutel": "test.signedIn",
                "waarden": {"host": "x"}
            })
        );
    }

    #[test]
    fn verwijdert_geheim_uit_melding() {
        let f = MailFout::aanmelding("server zei: geheim123 fout").zonder_geheim("geheim123");
        assert!(!f.melding.contains("geheim123"));
    }

    #[test]
    fn verwijdert_geheim_uit_waarden() {
        let f = MailFout::aanmelding("server zei: geheim123 fout")
            .sleutel("auth.failed")
            .waarde("detail", "geheim123 fout")
            .waarde("host", "mail.example.org")
            .zonder_geheim("geheim123");
        assert!(!f.melding.contains("geheim123"));
        assert_eq!(f.waarden["detail"], "•••• fout");
        assert_eq!(f.waarden["host"], "mail.example.org");
        assert!(!serde_json::to_string(&f).unwrap().contains("geheim123"));
    }

    #[test]
    fn certificaatfout_wordt_herkend() {
        let io = std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            rustls::Error::InvalidCertificate(rustls::CertificateError::UnknownIssuer),
        );
        let f = uit_io(&io, "mail.example.org");
        assert_eq!(f.code, Foutcode::Certificaat);
        assert!(f.melding.contains("vertrouwde"));
        assert_eq!(f.sleutel, Some("tls.certificateRejected"));
        assert_eq!(f.waarden["reasonKey"], "tls.reason.unknownIssuer");
        assert_eq!(f.waarden["host"], "mail.example.org");
    }
}
