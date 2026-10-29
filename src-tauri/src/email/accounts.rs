//! Accountbeheer: instellingen als JSON in de app-datamap (zonder wachtwoord),
//! wachtwoorden uitsluitend in de sleutelhanger van het besturingssysteem.
//! Is die sleutelhanger niet beschikbaar, dan volgt een duidelijke fout en
//! nooit een terugval naar platte tekst.

use super::fout::{MailFout, Uitkomst};
use super::{Account, AccountInvoer, Authenticatie, Beveiliging, ServerInstelling};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const SLEUTELHANGER_DIENST: &str = "OpenAEC Email Studio";
pub const ACCOUNTBESTAND: &str = "email-accounts.json";

/// Opslag voor geheimen. In de app is dat de OS-sleutelhanger; tests gebruiken
/// een geheugenvariant.
pub trait Kluis: Send + Sync {
    fn zet(&self, account_id: &str, wachtwoord: &str) -> Uitkomst<()>;
    fn haal(&self, account_id: &str) -> Uitkomst<Option<String>>;
    fn wis(&self, account_id: &str) -> Uitkomst<()>;
}

/// OS-sleutelhanger via `keyring` (macOS-sleutelhanger, Windows
/// Referentiebeheer, Secret Service op Linux).
pub struct OsKluis;

fn sleutelhangerfout(e: keyring::Error) -> MailFout {
    use keyring::Error::*;
    match e {
        NoDefaultStore | NoStorageAccess(_) | PlatformFailure(_) => MailFout::niet_beschikbaar(
            "De sleutelhanger van het besturingssysteem is niet beschikbaar. \
             Email Studio bewaart wachtwoorden nooit in platte tekst; \
             op Linux is een Secret Service nodig (bijvoorbeeld GNOME Keyring of KWallet).",
        )
        .sleutel("keychain.unavailable"),
        _ => MailFout::intern("De sleutelhanger gaf een onverwachte fout.")
            .sleutel("keychain.unexpected"),
    }
}

impl Kluis for OsKluis {
    fn zet(&self, account_id: &str, wachtwoord: &str) -> Uitkomst<()> {
        keyring::Entry::new(SLEUTELHANGER_DIENST, account_id)
            .and_then(|e| e.set_password(wachtwoord))
            .map_err(sleutelhangerfout)
    }
    fn haal(&self, account_id: &str) -> Uitkomst<Option<String>> {
        match keyring::Entry::new(SLEUTELHANGER_DIENST, account_id).and_then(|e| e.get_password()) {
            Ok(w) => Ok(Some(w)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(sleutelhangerfout(e)),
        }
    }
    fn wis(&self, account_id: &str) -> Uitkomst<()> {
        match keyring::Entry::new(SLEUTELHANGER_DIENST, account_id)
            .and_then(|e| e.delete_credential())
        {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(sleutelhangerfout(e)),
        }
    }
}

/// Kluis in het geheugen, voor tests.
#[cfg(test)]
#[derive(Default)]
pub struct GeheugenKluis {
    pub inhoud: Mutex<std::collections::HashMap<String, String>>,
    pub onbeschikbaar: bool,
}

#[cfg(test)]
impl Kluis for GeheugenKluis {
    fn zet(&self, id: &str, w: &str) -> Uitkomst<()> {
        if self.onbeschikbaar {
            return Err(sleutelhangerfout(keyring::Error::NoDefaultStore));
        }
        self.inhoud.lock().unwrap().insert(id.into(), w.into());
        Ok(())
    }
    fn haal(&self, id: &str) -> Uitkomst<Option<String>> {
        if self.onbeschikbaar {
            return Err(sleutelhangerfout(keyring::Error::NoDefaultStore));
        }
        Ok(self.inhoud.lock().unwrap().get(id).cloned())
    }
    fn wis(&self, id: &str) -> Uitkomst<()> {
        if self.onbeschikbaar {
            return Err(sleutelhangerfout(keyring::Error::NoDefaultStore));
        }
        self.inhoud.lock().unwrap().remove(id);
        Ok(())
    }
}

/// Alleen loopback telt als lokaal; zie ook de controle op het werkelijke
/// peeradres in `imap::verbind_tcp`.
pub fn is_localhost(host: &str) -> bool {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']');
    h.eq_ignore_ascii_case("localhost")
        || h.parse::<std::net::IpAddr>()
            .map(|ip| ip.is_loopback())
            .unwrap_or(false)
}

/// Beveiligingsregels per server. Geeft een waarschuwing terug als de
/// verbinding is toegestaan maar onversleuteld is.
pub fn controleer_beveiliging(s: &ServerInstelling, smtp: bool) -> Uitkomst<Option<String>> {
    let soort = if smtp { "SMTP" } else { "IMAP" };
    if smtp && s.authenticatie == Authenticatie::Versleuteld {
        return Err(MailFout::niet_beschikbaar(
            "Versleuteld wachtwoord (CRAM-MD5) wordt voor SMTP niet ondersteund. \
             Kies 'normaal wachtwoord'; over SSL/TLS of STARTTLS is het wachtwoord dan ook versleuteld.",
        )
        .sleutel("security.cramMd5SmtpUnsupported"));
    }
    if !super::autoconfig::is_host(&s.host) {
        return Err(MailFout::geweigerd(format!(
            "'{}' is geen geldige servernaam voor {soort}.",
            s.host.trim()
        ))
        .sleutel("security.invalidServerName")
        .waarde("host", s.host.trim())
        .waarde("protocol", soort));
    }
    if s.poort == 0 {
        return Err(MailFout::geweigerd(format!("De poort voor {soort} ontbreekt."))
            .sleutel("security.portMissing")
            .waarde("protocol", soort));
    }
    if s.beveiliging == Beveiliging::Geen {
        if !is_localhost(&s.host) {
            return Err(MailFout::geweigerd(format!(
                "Aanmelden bij {} zonder versleuteling is geweigerd: je wachtwoord zou leesbaar over het netwerk gaan. \
                 Kies SSL/TLS of STARTTLS. Onversleuteld is alleen toegestaan naar deze computer (localhost), \
                 bijvoorbeeld voor Proton Mail Bridge.",
                s.host.trim()
            ))
            .sleutel("security.unencryptedRefused")
            .waarde("host", s.host.trim()));
        }
        return Ok(Some(format!(
            "Let op: de {soort}-verbinding is niet versleuteld. Dat is alleen toegestaan omdat de server op deze computer draait."
        )));
    }
    Ok(None)
}

fn account_niet_gevonden() -> MailFout {
    MailFout::niet_gevonden("Dit account bestaat niet (meer).").sleutel("accounts.notFound")
}

pub fn datamap_niet_aangemaakt() -> MailFout {
    MailFout::intern("De datamap kon niet worden aangemaakt.")
        .sleutel("storage.dataDirCreateFailed")
}

/// Accounts in een JSON-bestand; schrijven gebeurt atomair.
pub struct AccountOpslag {
    pad: PathBuf,
    slot: Mutex<()>,
}

impl AccountOpslag {
    /// De map waarin het accountbestand staat.
    pub fn map(&self) -> PathBuf {
        self.pad.parent().map(Path::to_path_buf).unwrap_or_default()
    }

    pub fn nieuw(map: &Path) -> Self {
        Self {
            pad: map.join(ACCOUNTBESTAND),
            slot: Mutex::new(()),
        }
    }

    fn lees_ruw(&self) -> Uitkomst<Vec<Account>> {
        match std::fs::read(&self.pad) {
            Ok(b) => serde_json::from_slice(&b).map_err(|_| {
                let pad = self.pad.display();
                MailFout::intern(format!("Het accountbestand {pad} is beschadigd."))
                    .sleutel("accounts.fileCorrupt")
                    .waarde("path", pad)
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(_) => Err(
                MailFout::intern("Het accountbestand kon niet worden gelezen.")
                    .sleutel("accounts.fileUnreadable"),
            ),
        }
    }

    fn schrijf(&self, accounts: &[Account]) -> Uitkomst<()> {
        let map = self
            .pad
            .parent()
            .ok_or_else(|| MailFout::intern("De datamap ontbreekt.").sleutel("storage.dataDirMissing"))?;
        std::fs::create_dir_all(map).map_err(|_| datamap_niet_aangemaakt())?;
        // Nooit een wachtwoordvlag of wachtwoord op schijf.
        let schoon: Vec<Account> = accounts
            .iter()
            .cloned()
            .map(|mut a| {
                a.wachtwoord_opgeslagen = false;
                a
            })
            .collect();
        let json = serde_json::to_vec_pretty(&schoon).map_err(|_| {
            MailFout::intern("Accounts konden niet worden opgeslagen.")
                .sleutel("accounts.saveFailed")
        })?;
        let niet_geschreven = || {
            MailFout::intern("Het accountbestand kon niet worden geschreven.")
                .sleutel("accounts.fileWriteFailed")
        };
        let fout = |_| niet_geschreven();
        let mut tijdelijk = tempfile::NamedTempFile::new_in(map).map_err(fout)?;
        tijdelijk.write_all(&json).map_err(fout)?;
        tijdelijk.as_file().sync_all().map_err(fout)?;
        tijdelijk
            .persist(&self.pad)
            .map_err(|_| niet_geschreven())?;
        Ok(())
    }

    fn met_vlag(a: Account, kluis: &dyn Kluis) -> Account {
        let opgeslagen = matches!(kluis.haal(&a.id), Ok(Some(w)) if !w.is_empty());
        Account {
            wachtwoord_opgeslagen: opgeslagen,
            ..a
        }
    }

    pub fn lijst(&self, kluis: &dyn Kluis) -> Uitkomst<Vec<Account>> {
        let _slot = self.slot.lock().unwrap();
        Ok(self
            .lees_ruw()?
            .into_iter()
            .map(|a| Self::met_vlag(a, kluis))
            .collect())
    }

    pub fn haal(&self, id: &str, kluis: &dyn Kluis) -> Uitkomst<Account> {
        let _slot = self.slot.lock().unwrap();
        self.lees_ruw()?
            .into_iter()
            .find(|a| a.id == id)
            .map(|a| Self::met_vlag(a, kluis))
            .ok_or_else(account_niet_gevonden)
    }

    pub fn bewaar(&self, invoer: AccountInvoer, kluis: &dyn Kluis) -> Uitkomst<Account> {
        valideer(&invoer)?;
        let _slot = self.slot.lock().unwrap();
        let mut accounts = self.lees_ruw()?;
        let id = match &invoer.id {
            Some(id) if !id.is_empty() => {
                if !accounts.iter().any(|a| &a.id == id) {
                    return Err(account_niet_gevonden());
                }
                id.clone()
            }
            _ => uuid::Uuid::new_v4().to_string(),
        };
        // Eerst het geheim: lukt dat niet, dan wordt er ook niets opgeslagen.
        if let Some(w) = invoer.wachtwoord.as_deref().filter(|w| !w.is_empty()) {
            kluis.zet(&id, w)?;
        }
        let mut account = invoer.naar_account(id.clone());
        if account.oauth.is_none() {
            // Een gewone wijziging laat de OAuth2-koppeling staan.
            account.oauth = accounts
                .iter()
                .find(|a| a.id == id)
                .and_then(|a| a.oauth.clone());
        }
        match accounts.iter_mut().find(|a| a.id == id) {
            Some(a) => *a = account.clone(),
            None => accounts.push(account.clone()),
        }
        self.schrijf(&accounts)?;
        Ok(Self::met_vlag(account, kluis))
    }

    pub fn verwijder(&self, id: &str, kluis: &dyn Kluis) -> Uitkomst<()> {
        let _slot = self.slot.lock().unwrap();
        let mut accounts = self.lees_ruw()?;
        let voor = accounts.len();
        accounts.retain(|a| a.id != id);
        if accounts.len() == voor {
            return Err(account_niet_gevonden());
        }
        kluis.wis(id)?;
        kluis.wis(&super::oauth::vernieuw_sleutel(id))?;
        self.schrijf(&accounts)
    }
}

pub fn valideer(a: &AccountInvoer) -> Uitkomst<()> {
    if !super::mime::is_adres(a.email.trim()) {
        return Err(
            MailFout::geweigerd("Vul een geldig e-mailadres in.").sleutel("accounts.invalidEmail"),
        );
    }
    if let Some(r) = a.antwoord_aan.as_deref().filter(|r| !r.trim().is_empty()) {
        if super::mime::adres_uit_tekst(r).is_none() {
            return Err(
                MailFout::geweigerd("Het antwoordadres is geen geldig e-mailadres.")
                    .sleutel("accounts.invalidReplyTo"),
            );
        }
    }
    if a.volledige_naam.contains(['\r', '\n']) || a.naam.contains(['\r', '\n']) {
        return Err(MailFout::geweigerd("Namen mogen geen regeleinden bevatten.")
            .sleutel("accounts.lineBreakInName"));
    }
    controleer_beveiliging(&a.imap, false)?;
    controleer_beveiliging(&a.smtp, true)?;
    if a.imap.gebruikersnaam.trim().is_empty() || a.smtp.gebruikersnaam.trim().is_empty() {
        return Err(
            MailFout::geweigerd("Vul de gebruikersnaam in voor IMAP en SMTP.")
                .sleutel("accounts.usernameMissing"),
        );
    }
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn invoer(
        host: &str,
        poort_imap: u16,
        poort_smtp: u16,
        beveiliging: Beveiliging,
    ) -> AccountInvoer {
        let server = |poort| ServerInstelling {
            host: host.into(),
            poort,
            beveiliging,
            authenticatie: Authenticatie::Normaal,
            gebruikersnaam: "jan@example.org".into(),
        };
        AccountInvoer {
            id: None,
            naam: "Werk".into(),
            volledige_naam: "Jan Jansen".into(),
            email: "jan@example.org".into(),
            antwoord_aan: None,
            handtekening: Some("Groet, Jan".into()),
            imap: server(poort_imap),
            smtp: server(poort_smtp),
            mappen: None,
            controleer_elke: 5,
            externe_inhoud: false,
            wachtwoord: Some("geheim-wachtwoord".into()),
            oauth: None,
        }
    }

    #[test]
    fn bewaart_zonder_wachtwoord_op_schijf() {
        let map = tempfile::tempdir().unwrap();
        let opslag = AccountOpslag::nieuw(map.path());
        let kluis = GeheugenKluis::default();
        let a = opslag
            .bewaar(
                invoer("mail.example.org", 993, 465, Beveiliging::Ssl),
                &kluis,
            )
            .unwrap();
        assert!(a.wachtwoord_opgeslagen);
        assert_eq!(a.id.len(), 36);
        let schijf = std::fs::read_to_string(map.path().join(ACCOUNTBESTAND)).unwrap();
        assert!(!schijf.contains("geheim-wachtwoord"));
        assert!(schijf.contains("\"volledigeNaam\""));
        assert_eq!(
            kluis.haal(&a.id).unwrap().as_deref(),
            Some("geheim-wachtwoord")
        );

        // Bijwerken zonder wachtwoord laat het geheim staan.
        let mut wijziging = invoer("mail.example.org", 993, 465, Beveiliging::Ssl);
        wijziging.id = Some(a.id.clone());
        wijziging.naam = "Kantoor".into();
        wijziging.wachtwoord = None;
        let b = opslag.bewaar(wijziging, &kluis).unwrap();
        assert_eq!(b.naam, "Kantoor");
        assert!(b.wachtwoord_opgeslagen);
        assert_eq!(opslag.lijst(&kluis).unwrap().len(), 1);

        opslag.verwijder(&a.id, &kluis).unwrap();
        assert!(kluis.haal(&a.id).unwrap().is_none());
        assert!(opslag.lijst(&kluis).unwrap().is_empty());
        assert_eq!(
            opslag.verwijder(&a.id, &kluis).unwrap_err().code,
            super::super::fout::Foutcode::NietGevonden
        );
    }

    #[test]
    fn sleutelhanger_onbeschikbaar_geeft_fout_en_slaat_niets_op() {
        let map = tempfile::tempdir().unwrap();
        let opslag = AccountOpslag::nieuw(map.path());
        let kluis = GeheugenKluis {
            onbeschikbaar: true,
            ..Default::default()
        };
        let f = opslag
            .bewaar(
                invoer("mail.example.org", 993, 465, Beveiliging::Ssl),
                &kluis,
            )
            .unwrap_err();
        assert_eq!(f.code, super::super::fout::Foutcode::NietBeschikbaar);
        assert!(!map.path().join(ACCOUNTBESTAND).exists());
    }

    #[test]
    fn beveiligingsregels() {
        let s = |host: &str, b, a| ServerInstelling {
            host: host.into(),
            poort: 143,
            beveiliging: b,
            authenticatie: a,
            gebruikersnaam: "x".into(),
        };
        use super::super::fout::Foutcode::*;
        assert_eq!(
            controleer_beveiliging(
                &s("mail.example.org", Beveiliging::Ssl, Authenticatie::Normaal),
                false
            ),
            Ok(None)
        );
        assert_eq!(
            controleer_beveiliging(
                &s(
                    "mail.example.org",
                    Beveiliging::Geen,
                    Authenticatie::Normaal
                ),
                false
            )
            .unwrap_err()
            .code,
            Geweigerd
        );
        assert_eq!(
            controleer_beveiliging(
                &s(
                    "192.168.1.10",
                    Beveiliging::Geen,
                    Authenticatie::Versleuteld
                ),
                false
            )
            .unwrap_err()
            .code,
            Geweigerd
        );
        let w = controleer_beveiliging(
            &s("127.0.0.1", Beveiliging::Geen, Authenticatie::Normaal),
            true,
        )
        .unwrap();
        assert!(w.unwrap().contains("niet versleuteld"));
        assert!(controleer_beveiliging(
            &s("localhost", Beveiliging::Geen, Authenticatie::Normaal),
            false
        )
        .is_ok());
        assert!(controleer_beveiliging(
            &s("[::1]", Beveiliging::Geen, Authenticatie::Normaal),
            false
        )
        .is_ok());
        assert!(controleer_beveiliging(
            &s("imap.gmail.com", Beveiliging::Ssl, Authenticatie::Oauth2),
            false
        )
        .is_ok());
        assert_eq!(
            controleer_beveiliging(
                &s(
                    "smtp.example.org",
                    Beveiliging::Ssl,
                    Authenticatie::Versleuteld
                ),
                true
            )
            .unwrap_err()
            .code,
            NietBeschikbaar
        );
        assert!(controleer_beveiliging(
            &s(
                "imap.example.org",
                Beveiliging::Starttls,
                Authenticatie::Versleuteld
            ),
            false
        )
        .is_ok());
        assert_eq!(
            controleer_beveiliging(
                &s("evil host\r\n", Beveiliging::Ssl, Authenticatie::Normaal),
                false
            )
            .unwrap_err()
            .code,
            Geweigerd
        );
        assert!(!is_localhost("localhost.evil.org"));
        assert!(!is_localhost("127.0.0.1.nip.io"));
        assert!(is_localhost("127.0.0.2"));
    }

    #[test]
    fn validatie_van_invoer() {
        let mut a = invoer("mail.example.org", 993, 465, Beveiliging::Ssl);
        a.email = "geen-adres".into();
        assert!(valideer(&a).is_err());
        let mut a = invoer("mail.example.org", 993, 465, Beveiliging::Ssl);
        a.volledige_naam = "Jan\r\nBcc: x@y.z".into();
        assert!(valideer(&a).is_err());
    }
}
