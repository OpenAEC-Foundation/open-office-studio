//! Native accountbeheer en postvak. HTML wordt niet als actieve webinhoud
//! uitgevoerd; de lezer toont de MIME-tekst, zonder externe afbeeldingen.
use super::*;
use iced::widget::{column, row};
use office_mail::dienst::{Antwoord, Dienst, Opdracht};
use office_mail::{
    Account, AccountInvoer, Authenticatie, Bericht, BerichtKop, Beveiliging, Lijstverzoek, Map,
    ServerInstelling,
};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Veld {
    Naam,
    Volledig,
    Email,
    Imap,
    ImapPoort,
    ImapUser,
    Smtp,
    SmtpPoort,
    SmtpUser,
    Wachtwoord,
}
#[derive(Clone)]
pub enum BerichtUi {
    Laden,
    Account(usize),
    Map(usize),
    Bericht(usize),
    Nieuw,
    Wijzig,
    Annuleer,
    Invoer(Veld, String),
    Beveilig(bool, Beveiliging),
    Bewaar,
    Zoek(String),
    Zoeken,
    Vorige,
    Volgende,
    Archiveer,
    Gereed(Result<Box<Antwoord>, String>),
    AnnuleerSluiten,
    VerwerpEnSluit,
}
impl std::fmt::Debug for BerichtUi {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Geen wachtwoord of berichtinhoud in debugweergave van GUI-berichten.
        match self {
            Self::Invoer(v, _) => f.debug_tuple("Invoer").field(v).field(&"••••").finish(),
            _ => f.write_str("Mailbediening"),
        }
    }
}
struct Formulier {
    bron: Option<Account>,
    naam: String,
    volledig: String,
    email: String,
    imap: String,
    imap_poort: String,
    imap_user: String,
    imap_beveiliging: Beveiliging,
    smtp: String,
    smtp_poort: String,
    smtp_user: String,
    smtp_beveiliging: Beveiliging,
    wachtwoord: String,
    gewijzigd: bool,
}
impl Default for Formulier {
    fn default() -> Self {
        Self {
            bron: None,
            naam: String::new(),
            volledig: String::new(),
            email: String::new(),
            imap: String::new(),
            imap_poort: "993".into(),
            imap_user: String::new(),
            imap_beveiliging: Beveiliging::Ssl,
            smtp: String::new(),
            smtp_poort: "465".into(),
            smtp_user: String::new(),
            smtp_beveiliging: Beveiliging::Ssl,
            wachtwoord: String::new(),
            gewijzigd: false,
        }
    }
}
impl Formulier {
    fn van(a: Account) -> Self {
        Self {
            naam: a.naam.clone(),
            volledig: a.volledige_naam.clone(),
            email: a.email.clone(),
            imap: a.imap.host.clone(),
            imap_poort: a.imap.poort.to_string(),
            imap_user: a.imap.gebruikersnaam.clone(),
            imap_beveiliging: a.imap.beveiliging,
            smtp: a.smtp.host.clone(),
            smtp_poort: a.smtp.poort.to_string(),
            smtp_user: a.smtp.gebruikersnaam.clone(),
            smtp_beveiliging: a.smtp.beveiliging,
            bron: Some(a),
            ..Self::default()
        }
    }
    fn invoer(&self) -> Result<AccountInvoer, String> {
        let imap = ServerInstelling {
            host: self.imap.trim().into(),
            poort: self
                .imap_poort
                .parse()
                .map_err(|_| "Ongeldige IMAP-poort")?,
            gebruikersnaam: self.imap_user.trim().into(),
            beveiliging: self.imap_beveiliging,
            authenticatie: self
                .bron
                .as_ref()
                .map(|a| a.imap.authenticatie)
                .unwrap_or(Authenticatie::Normaal),
        };
        let smtp = ServerInstelling {
            host: self.smtp.trim().into(),
            poort: self
                .smtp_poort
                .parse()
                .map_err(|_| "Ongeldige SMTP-poort")?,
            gebruikersnaam: self.smtp_user.trim().into(),
            beveiliging: self.smtp_beveiliging,
            authenticatie: self
                .bron
                .as_ref()
                .map(|a| a.smtp.authenticatie)
                .unwrap_or(Authenticatie::Normaal),
        };
        let a = self.bron.as_ref();
        let invoer = AccountInvoer {
            id: a.map(|a| a.id.clone()),
            naam: self.naam.trim().into(),
            volledige_naam: self.volledig.trim().into(),
            email: self.email.trim().into(),
            imap,
            smtp,
            antwoord_aan: a.and_then(|a| a.antwoord_aan.clone()),
            handtekening: a.and_then(|a| a.handtekening.clone()),
            mappen: a.and_then(|a| a.mappen.clone()),
            controleer_elke: a.map(|a| a.controleer_elke).unwrap_or(5),
            externe_inhoud: a.is_some_and(|a| a.externe_inhoud),
            wachtwoord: (!self.wachtwoord.is_empty()).then(|| self.wachtwoord.clone()),
            oauth: a.and_then(|a| a.oauth.clone()),
        };
        office_mail::accounts::valideer(&invoer).map_err(|e| e.to_string())?;
        Ok(invoer)
    }
}
#[derive(Default)]
pub struct Postvak {
    dienst: Option<Dienst>,
    pub bezig: bool,
    pub sluitvraag: bool,
    accounts: Vec<Account>,
    account: Option<usize>,
    mappen: Vec<Map>,
    map: Option<usize>,
    berichten: Vec<BerichtKop>,
    bericht: Option<Bericht>,
    totaal: u32,
    start: u32,
    zoek: String,
    actieve_zoek: String,
    formulier: Option<Formulier>,
    melding: String,
}
impl Postvak {
    pub fn concept(&self) -> bool {
        self.formulier.as_ref().is_some_and(|f| f.gewijzigd)
    }
    pub fn verwerp(&mut self) {
        self.formulier = None;
        self.sluitvraag = false;
    }
    fn taak(&mut self, o: Opdracht) -> Task<BerichtUi> {
        let Some(d) = self.dienst.clone() else {
            self.melding = "De mailwerkdraad is niet beschikbaar".into();
            return Task::none();
        };
        self.bezig = true;
        Task::perform(d.voer_uit(o), |r| {
            BerichtUi::Gereed(r.map(Box::new).map_err(|e| e.to_string()))
        })
    }
    fn account_id(&self) -> Option<String> {
        self.account
            .and_then(|i| self.accounts.get(i))
            .map(|a| a.id.clone())
    }
    fn lijst(&mut self) -> Task<BerichtUi> {
        if let (Some(id), Some(m)) = (self.account_id(), self.map.and_then(|i| self.mappen.get(i)))
        {
            self.bericht = None;
            self.taak(Opdracht::Berichten(
                id,
                Lijstverzoek {
                    map: m.pad.clone(),
                    start: self.start,
                    aantal: 50,
                    zoek: (!self.actieve_zoek.trim().is_empty()).then(|| {
                        office_mail::Zoekopdracht {
                            tekst: self.actieve_zoek.clone(),
                            velden: vec![],
                        }
                    }),
                    alleen_ongelezen: None,
                },
            ))
        } else {
            Task::none()
        }
    }
    pub fn update(&mut self, msg: BerichtUi) -> Task<BerichtUi> {
        if self.sluitvraag
            && !matches!(
                msg,
                BerichtUi::AnnuleerSluiten | BerichtUi::VerwerpEnSluit | BerichtUi::Gereed(_)
            )
        {
            return Task::none();
        }
        if self.bezig && !matches!(msg, BerichtUi::Gereed(_) | BerichtUi::AnnuleerSluiten) {
            return Task::none();
        }
        match msg {
            BerichtUi::Laden => {
                if self.dienst.is_none() {
                    let Some(map) = display::settings_path("open-office-studio-native")
                        .and_then(|p| p.parent().map(|p| p.join("mail")))
                    else {
                        self.melding = "De native gegevensmap ontbreekt".into();
                        return Task::none();
                    };
                    match Dienst::start(map, Arc::new(office_mail::accounts::OsKluis)) {
                        Ok(d) => self.dienst = Some(d),
                        Err(e) => {
                            self.melding = format!("Mailwerkdraad niet gestart: {e}");
                            return Task::none();
                        }
                    }
                }
                return self.taak(Opdracht::Accounts);
            }
            BerichtUi::Account(i) if i < self.accounts.len() && self.formulier.is_none() => {
                self.account = Some(i);
                self.mappen.clear();
                self.map = None;
                self.berichten.clear();
                self.bericht = None;
                self.totaal = 0;
                return self.taak(Opdracht::Mappen(self.accounts[i].id.clone()));
            }
            BerichtUi::Map(i) if i < self.mappen.len() && self.mappen[i].selecteerbaar => {
                self.map = Some(i);
                self.start = 0;
                return self.lijst();
            }
            BerichtUi::Bericht(i) => {
                if let (Some(id), Some(k)) = (self.account_id(), self.berichten.get(i)) {
                    return self.taak(Opdracht::Bericht(id, k.map.clone(), k.uid));
                }
            }
            BerichtUi::Nieuw if self.formulier.is_none() => {
                self.formulier = Some(Formulier::default())
            }
            BerichtUi::Wijzig if self.formulier.is_none() => {
                if let Some(a) = self.account.and_then(|i| self.accounts.get(i)) {
                    self.formulier = Some(Formulier::van(a.clone()));
                }
            }
            BerichtUi::Annuleer => self.formulier = None,
            BerichtUi::Invoer(v, s) => {
                if let Some(f) = &mut self.formulier {
                    *match v {
                        Veld::Naam => &mut f.naam,
                        Veld::Volledig => &mut f.volledig,
                        Veld::Email => &mut f.email,
                        Veld::Imap => &mut f.imap,
                        Veld::ImapPoort => &mut f.imap_poort,
                        Veld::ImapUser => &mut f.imap_user,
                        Veld::Smtp => &mut f.smtp,
                        Veld::SmtpPoort => &mut f.smtp_poort,
                        Veld::SmtpUser => &mut f.smtp_user,
                        Veld::Wachtwoord => &mut f.wachtwoord,
                    } = s;
                    f.gewijzigd = true;
                }
            }
            BerichtUi::Beveilig(imap, b) => {
                if let Some(f) = &mut self.formulier {
                    if imap {
                        f.imap_beveiliging = b;
                    } else {
                        f.smtp_beveiliging = b;
                    }
                    f.gewijzigd = true;
                }
            }
            BerichtUi::Bewaar => {
                if let Some(f) = &self.formulier {
                    match f.invoer() {
                        Ok(a) => return self.taak(Opdracht::Bewaar(Box::new(a))),
                        Err(e) => self.melding = e,
                    }
                }
            }
            BerichtUi::Zoek(s) => self.zoek = s,
            BerichtUi::Zoeken => {
                self.actieve_zoek = self.zoek.clone();
                self.start = 0;
                return self.lijst();
            }
            BerichtUi::Vorige => {
                self.start = self.start.saturating_sub(50);
                return self.lijst();
            }
            BerichtUi::Volgende if self.start.saturating_add(50) < self.totaal => {
                self.start += 50;
                return self.lijst();
            }
            BerichtUi::Archiveer => {
                if let (Some(id), Some(b)) = (self.account_id(), &self.bericht) {
                    return self.taak(Opdracht::Bron(id, b.kop.map.clone(), b.kop.uid));
                }
            }
            BerichtUi::Gereed(r) => {
                self.bezig = false;
                match r.map(|a| *a) {
                    Err(e) => self.melding = e,
                    Ok(Antwoord::Accounts(a)) => {
                        let vorig = self.account.and_then(|i| self.accounts.get(i)).cloned();
                        self.accounts = a;
                        self.account = vorig
                            .as_ref()
                            .and_then(|oud| self.accounts.iter().position(|a| a.id == oud.id));
                        if self.account.and_then(|i| self.accounts.get(i)) != vorig.as_ref() {
                            self.mappen.clear();
                            self.map = None;
                            self.berichten.clear();
                            self.bericht = None;
                            self.totaal = 0;
                            self.start = 0;
                        }
                        self.melding = format!("{} accounts", self.accounts.len());
                    }
                    Ok(Antwoord::Bewaard(a)) => {
                        if let Some(i) = self.accounts.iter().position(|x| x.id == a.id) {
                            self.accounts[i] = a;
                            self.account = Some(i);
                        } else {
                            self.accounts.push(a);
                            self.account = Some(self.accounts.len() - 1);
                        }
                        self.formulier = None;
                        self.mappen.clear();
                        self.berichten.clear();
                        self.map = None;
                        self.bericht = None;
                        self.totaal = 0;
                        self.melding =
                            "Account opgeslagen. Selecteer het account om verbinding te maken."
                                .into();
                    }
                    Ok(Antwoord::Mappen(m)) => {
                        self.mappen = m;
                        self.melding = "Selecteer een map".into();
                    }
                    Ok(Antwoord::Berichten(l)) => {
                        self.berichten = l.berichten;
                        self.totaal = l.totaal;
                        self.melding = format!("{} berichten", self.totaal);
                    }
                    Ok(Antwoord::Bericht(b)) => {
                        self.bericht = Some(b);
                        self.melding = "Bericht geladen".into();
                    }
                    Ok(Antwoord::Bron(_)) => {
                        self.melding = "Volledige MIME-bron geopend als IFCX-dossier".into()
                    }
                }
            }
            BerichtUi::AnnuleerSluiten => self.sluitvraag = false,
            BerichtUi::VerwerpEnSluit => self.verwerp(),
            _ => {}
        }
        Task::none()
    }
    pub fn view(&self, l: Look) -> Element<'_, BerichtUi> {
        let knop = |naam: &'static str, msg: BerichtUi, kan: bool| {
            w::button(
                l,
                naam,
                K::Secondary,
                D::Compact,
                None,
                (!self.bezig && kan).then_some(msg),
            )
        };
        let mut accounts = column![w::mono_label(l, "ACCOUNTS")].spacing(6);
        for (i, a) in self.accounts.iter().enumerate() {
            accounts = accounts.push(w::button(
                l,
                &a.naam,
                if self.account == Some(i) {
                    K::Secondary
                } else {
                    K::Quiet
                },
                D::Compact,
                None,
                (!self.bezig && self.formulier.is_none()).then_some(BerichtUi::Account(i)),
            ));
        }
        accounts = accounts
            .push(knop(
                "Account toevoegen",
                BerichtUi::Nieuw,
                self.formulier.is_none(),
            ))
            .push(knop(
                "Account wijzigen",
                BerichtUi::Wijzig,
                self.account.is_some() && self.formulier.is_none(),
            ));
        let mut mappen = column![w::mono_label(l, "MAPPEN")].spacing(5);
        for (i, m) in self.mappen.iter().enumerate() {
            mappen = mappen.push(w::button(
                l,
                &m.naam,
                if self.map == Some(i) {
                    K::Secondary
                } else {
                    K::Quiet
                },
                D::Compact,
                None,
                (!self.bezig && m.selecteerbaar).then_some(BerichtUi::Map(i)),
            ));
        }
        let zij = container(scrollable(column![accounts, mappen].spacing(26)))
            .width(210)
            .height(Length::Fill)
            .padding(18)
            .style(move |_| w::panel_style(l));
        let inhoud: Element<_> = if let Some(f) = &self.formulier {
            let invoer = |label: &'static str, waarde: &str, veld| -> Element<'_, BerichtUi> {
                let input = text_input(label, waarde)
                    .secure(veld == Veld::Wachtwoord)
                    .on_input_maybe((!self.bezig).then_some(move |s| BerichtUi::Invoer(veld, s)));
                column![
                    w::body(l, label),
                    openaec_ui::design::a11y::named(
                        input,
                        openaec_ui::design::a11y::Role::TextField,
                        label
                    )
                ]
                .spacing(5)
                .into()
            };
            let beveilig = |imap: bool, b| {
                let mut r = row![].spacing(6);
                for (naam, v) in [
                    ("TLS", Beveiliging::Ssl),
                    ("STARTTLS", Beveiliging::Starttls),
                    ("Geen · alleen lokaal", Beveiliging::Geen),
                ] {
                    r = r.push(w::button(
                        l,
                        naam,
                        if b == v { K::Secondary } else { K::Quiet },
                        D::Compact,
                        None,
                        (!self.bezig).then_some(BerichtUi::Beveilig(imap, v)),
                    ));
                }
                r
            };
            let form=column![w::heading(l,"Accountinstellingen",24.),
                w::secondary(l,"Wachtwoorden gaan uitsluitend in de systeemsleutelhanger. Een leeg veld behoudt het bestaande wachtwoord."),
                row![invoer("Accountnaam",&f.naam,Veld::Naam),invoer("Volledige naam",&f.volledig,Veld::Volledig),invoer("E-mailadres",&f.email,Veld::Email)].spacing(16),
                w::heading(l,"Inkomend · IMAP",18.),row![invoer("IMAP-server",&f.imap,Veld::Imap),invoer("Poort",&f.imap_poort,Veld::ImapPoort),invoer("IMAP-gebruikersnaam",&f.imap_user,Veld::ImapUser)].spacing(16),beveilig(true,f.imap_beveiliging),
                w::heading(l,"Uitgaand · SMTP",18.),row![invoer("SMTP-server",&f.smtp,Veld::Smtp),invoer("Poort",&f.smtp_poort,Veld::SmtpPoort),invoer("SMTP-gebruikersnaam",&f.smtp_user,Veld::SmtpUser)].spacing(16),beveilig(false,f.smtp_beveiliging),
                invoer("Wachtwoord",&f.wachtwoord,Veld::Wachtwoord),
                row![knop("Account opslaan",BerichtUi::Bewaar,true),knop("Annuleren",BerichtUi::Annuleer,true)].spacing(12),
                w::secondary(l,"OAuth-aanmelding en automatisch serverzoeken worden nog op deze native interface aangesloten.")].spacing(18).padding(26);
            scrollable(form).height(Length::Fill).into()
        } else {
            let mut lijst = column![].spacing(4);
            for (i, b) in self.berichten.iter().enumerate() {
                let afzender = b
                    .van
                    .first()
                    .map(|a| {
                        if a.naam.is_empty() {
                            a.adres.as_str()
                        } else {
                            a.naam.as_str()
                        }
                    })
                    .unwrap_or("");
                let tekst = format!(
                    "{}\n{}",
                    if b.onderwerp.is_empty() {
                        "(Geen onderwerp)"
                    } else {
                        &b.onderwerp
                    },
                    afzender
                );
                let node = openaec_ui::design::a11y::Node::new(
                    openaec_ui::design::a11y::Role::Button,
                    tekst.clone(),
                );
                let knop = iced::widget::button(w::body(l, tekst))
                    .padding(12)
                    .width(Length::Fill)
                    .on_press_maybe((!self.bezig).then_some(BerichtUi::Bericht(i)))
                    .style(move |_, status| w::button_style(l, K::Quiet, status));
                lijst = lijst.push(openaec_ui::design::a11y::node(knop, node));
            }
            let zoeken = openaec_ui::design::a11y::named(
                text_input("Zoeken in berichten", &self.zoek)
                    .on_input(BerichtUi::Zoek)
                    .on_submit(BerichtUi::Zoeken),
                openaec_ui::design::a11y::Role::TextField,
                "Zoeken in berichten",
            );
            let berichten = container(
                column![
                    zoeken,
                    knop("Zoeken", BerichtUi::Zoeken, self.map.is_some()),
                    scrollable(lijst).height(Length::Fill),
                    row![
                        knop("Vorige", BerichtUi::Vorige, self.start > 0),
                        w::body(
                            l,
                            format!(
                                "{} / {}",
                                self.start.saturating_add(self.berichten.len() as u32),
                                self.totaal
                            )
                        ),
                        knop(
                            "Volgende",
                            BerichtUi::Volgende,
                            self.start.saturating_add(50) < self.totaal
                        )
                    ]
                    .spacing(8)
                ]
                .spacing(10),
            )
            .width(330)
            .padding(14);
            let lezer: Element<_> = if let Some(b) = &self.bericht {
                let van = b
                    .kop
                    .van
                    .iter()
                    .map(|a| a.adres.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                let aan = b
                    .kop
                    .aan
                    .iter()
                    .map(|a| a.adres.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                let mut inhoud=column![w::heading(l,&b.kop.onderwerp,24.),w::body(l,format!("Van: {van}")),w::secondary(l,format!("Aan: {aan}")),knop("Openen als IFCX-dossier",BerichtUi::Archiveer,true),w::body(l,if b.tekst.is_empty(){"Dit bericht bevat alleen HTML. Native HTML-weergave is nog niet aangesloten."}else{&b.tekst})].spacing(14);
                for a in &b.bijlagen {
                    inhoud = inhoud.push(w::secondary(
                        l,
                        format!("Bijlage: {} · {} bytes", a.bestandsnaam, a.grootte),
                    ));
                }
                scrollable(inhoud.padding(26)).height(Length::Fill).into()
            } else {
                container(column![w::heading(l,"Je postvak",28.),w::secondary(l,"Selecteer een account, map en bericht. Lokale EML- en IFCX-bestanden kun je ook via Bestand openen.")].spacing(16)).padding(30).into()
            };
            row![berichten, container(lezer).width(Length::Fill)]
                .height(Length::Fill)
                .into()
        };
        let werk: Element<_> = column![
            row![zij, inhoud].height(Length::Fill),
            container(w::secondary(
                l,
                if self.bezig {
                    "Verbinding maken…"
                } else {
                    &self.melding
                }
            ))
            .padding(12)
        ]
        .height(Length::Fill)
        .into();
        if self.sluitvraag {
            let vraag = w::dialog(
                l,
                "Accountinvoer sluiten",
                icoon(Icon::Close),
                Some(BerichtUi::AnnuleerSluiten),
                w::body(
                    l,
                    "Niet opgeslagen accountinstellingen verwerpen en het venster sluiten?",
                )
                .into(),
                None,
                vec![
                    knop("Terug", BerichtUi::AnnuleerSluiten, true),
                    knop("Verwerpen en sluiten", BerichtUi::VerwerpEnSluit, true),
                ],
                false,
            );
            iced::widget::stack![focus::inert(werk, true), w::overlay(l, vraag)].into()
        } else {
            werk
        }
    }
}

#[cfg(test)]
pub fn testvoorbeeld() -> Postvak {
    let a:Account=serde_json::from_str(r#"{"id":"native-proef","naam":"Lokaal voorbeeld","volledigeNaam":"Voorbeeld","email":"post@example.invalid","imap":{"host":"127.0.0.1","poort":993,"beveiliging":"ssl","authenticatie":"normaal","gebruikersnaam":"post@example.invalid"},"smtp":{"host":"127.0.0.1","poort":465,"beveiliging":"ssl","authenticatie":"normaal","gebruikersnaam":"post@example.invalid"},"handtekening":"Vaste ondertekening","controleerElke":5,"externeInhoud":false}"#).unwrap();
    let b=office_mail::mime::bericht(1,"INBOX",b"From: Voorbeeld <post@example.invalid>\r\nTo: studio@example.invalid\r\nSubject: Native mailcontrole\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDit bericht komt uit een synthetische MIME-bron.\r\nEr is geen verbinding met een echte mailserver gemaakt.\r\n",office_mail::mime::Vlaggen::default()).unwrap();
    Postvak {
        accounts: vec![a],
        account: Some(0),
        mappen: vec![Map {
            pad: "INBOX".into(),
            naam: "Postvak IN".into(),
            scheiding: "/".into(),
            speciaal: Some(office_mail::Speciaal::Inbox),
            selecteerbaar: true,
            totaal: Some(1),
            ongelezen: Some(1),
        }],
        map: Some(0),
        berichten: vec![b.kop.clone()],
        bericht: Some(b),
        totaal: 1,
        melding: "Lokaal testbericht".into(),
        ..Postvak::default()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accountverversing_koppelt_berichten_niet_aan_een_andere_identiteit() {
        let mut p = testvoorbeeld();
        let mut ander = p.accounts[0].clone();
        ander.id = "ander-account".into();
        let _ = p.update(BerichtUi::Gereed(Ok(Box::new(Antwoord::Accounts(vec![
            ander,
        ])))));
        assert!(p.account.is_none());
        assert!(p.bericht.is_none());
        assert!(p.berichten.is_empty());
        assert!(p.mappen.is_empty());
    }
    #[test]
    fn accountwijziging_bewaart_verborgen_instellingen_en_toont_geen_geheim() {
        let mut p = testvoorbeeld();
        let _ = p.update(BerichtUi::Wijzig);
        let _ = p.update(BerichtUi::Invoer(Veld::Naam, "Nieuwe naam".into()));
        let f = p.formulier.as_ref().unwrap();
        let a = f.invoer().unwrap();
        assert_eq!(a.id.as_deref(), Some("native-proef"));
        assert_eq!(a.naam, "Nieuwe naam");
        assert_eq!(a.handtekening.as_deref(), Some("Vaste ondertekening"));
        assert_eq!(a.wachtwoord, None);
        assert!(p.concept());
        assert!(
            !format!(
                "{:?}",
                BerichtUi::Invoer(Veld::Wachtwoord, "lokaal-geheim".into())
            )
            .contains("lokaal-geheim")
        );
        let _ = p.update(BerichtUi::Invoer(Veld::ImapPoort, "geen getal".into()));
        assert!(p.formulier.as_ref().unwrap().invoer().is_err());
    }
    #[test]
    fn formulier_weigert_onversleutelde_externe_server_en_sluitvraag_blokkeert_bediening() {
        let mut p = testvoorbeeld();
        let _ = p.update(BerichtUi::Wijzig);
        let _ = p.update(BerichtUi::Invoer(Veld::Imap, "mail.example.invalid".into()));
        let _ = p.update(BerichtUi::Beveilig(true, Beveiliging::Geen));
        assert!(p.formulier.as_ref().unwrap().invoer().is_err());
        p.sluitvraag = true;
        let _ = p.update(BerichtUi::Annuleer);
        assert!(p.concept());
        let _ = p.update(BerichtUi::AnnuleerSluiten);
        assert!(p.concept());
        assert!(!p.sluitvraag);
        let _ = p.update(BerichtUi::Annuleer);
        assert!(!p.concept());
    }
    #[test]
    fn fout_behoudt_accountinvoer_en_bezig_blokkeert_vervolgopdrachten() {
        let mut p = testvoorbeeld();
        let _ = p.update(BerichtUi::Wijzig);
        let _ = p.update(BerichtUi::Invoer(Veld::Wachtwoord, "lokaal-geheim".into()));
        p.bezig = true;
        let _ = p.update(BerichtUi::Annuleer);
        assert!(p.formulier.is_some());
        let _ = p.update(BerichtUi::Gereed(Err("Proeffout".into())));
        assert!(!p.bezig);
        assert!(p.concept());
        assert_eq!(p.formulier.as_ref().unwrap().wachtwoord, "lokaal-geheim");
    }
}
