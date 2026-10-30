#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
//! Volledig native venster: geen browser, React, JavaScript of Tauri-runtime.
mod documentblad;
mod lineaal;
mod lint;
mod notitie_ui;
mod sleepvak;
mod stijl;
mod werker;
use iced::widget::{column, container, image, row, scrollable, text_editor, text_input};
use office_core::{
    document::{Bewerking, Module, Veld},
    ifcx,
    opmaak::Opmaak,
    opslag,
    rekenblad::Structuur,
};
use openaec_ui::design::{
    Look, ThemeId,
    chrome::{self, WindowActions, WindowIcons},
    display::{self, Display},
    focus,
    widgets::{self as w, ButtonKind as K, Density as D, DocumentTab},
};
use openaec_ui::{
    fonts,
    iced::{self, Element, Length, Size, Subscription, Task},
    icons::Icon,
};
use std::path::PathBuf;
use werker::{Antwoord, Opdracht, Werker};
fn icoon(i: Icon) -> &'static str {
    // De vaste semantische SVG's gebruiken zwart; Blueprint kleurt currentColor.
    // Een eenmalige adapter maakt dezelfde bron ook leesbaar in donkere thema's.
    static BRONNEN: std::sync::OnceLock<Vec<(Icon, &'static str)>> = std::sync::OnceLock::new();
    BRONNEN
        .get_or_init(|| {
            Icon::ALL
                .into_iter()
                .map(|icoon| {
                    let tekst = std::str::from_utf8(icoon.bytes())
                        .expect("meegeleverd SVG")
                        .replace("\"#000\"", "\"currentColor\"")
                        .replace("\"#000000\"", "\"currentColor\"");
                    (icoon, &*Box::leak(tekst.into_boxed_str()))
                })
                .collect()
        })
        .iter()
        .find(|(icoon, _)| *icoon == i)
        .expect("icoon in vaste catalogus")
        .1
}
#[derive(Debug, Clone)]
enum Msg {
    Nieuw(Module),
    Open,
    Pad(Option<PathBuf>),
    Gelezen(u64, PathBuf, Result<Geopend, String>),
    Gereed(u64, Result<Antwoord, String>),
    Selecteer(usize),
    Sluit(usize),
    SluitVenster,
    SluitKeuze(bool),
    Annuleer,
    Deel(usize),
    Veld(usize),
    Adres(String),
    GaNaar,
    Raak(String),
    Opmaak(Opmaak),
    Structuur(Structuur),
    Dia(office_core::presentatie::DiaActie),
    Formule(String),
    Panelen,
    Notitie(office_core::notities::NotitieActie),
    NotitiePlaats(usize, office_core::interactie::Rechthoek, bool),
    CanvasAnnuleer,
    Koppeling(String),
    Grootte(String),
    Lettertype(String),
    Zoom(f32),
    VensterGrootte(Size),
    Schuif(iced::Point),
    Invoer(text_editor::Action),
    PasToe,
    Opslaan(u64, bool),
    Doel(u64, Option<PathBuf>),
    Geschreven(
        u64,
        PathBuf,
        Result<(String, String, Option<Vec<u8>>), String>,
    ),
    Terug,
    Vooruit,
    Bestand(bool),
    Lint(usize),
    Thema(ThemeId),
    Instellingen(bool),
    Archiveer,
    Markdown,
    MarkdownKlaar(Result<Antwoord, String>),
    MarkdownDoel(String, Option<PathBuf>),
    ExportKlaar(Result<String, String>),
    Sleep,
    Minimaliseer,
    Maximaliseer,
    Toets(openaec_ui::keyboard::KeyPress),
    Navigeer(openaec_ui::keyboard::Navigation),
}
#[derive(Debug, Clone)]
struct Geopend {
    module: Module,
    bytes: Vec<u8>,
    hash: String,
    archief: Option<Vec<u8>>,
}
struct Tab {
    id: u64,
    naam: String,
    pad: Option<PathBuf>,
    verwacht: Option<String>,
    opgeslagen: Option<String>,
    archief: Option<Vec<u8>>,
    ifcx: bool,
    export_ifcx: bool,
    antwoord: Option<Antwoord>,
    afbeelding: Option<image::Handle>,
    bezig: bool,
    schrijft: bool,
    deel: usize,
    gekozen: usize,
    editor: text_editor::Content,
    concept: bool,
    adres: String,
    doel_cel: Option<String>,
    zoom: f32,
    grootte: String,
    lettertype: String,
    panelen: bool,
    canvas_voorbeeld: Option<(usize, office_core::interactie::Rechthoek)>,
    markdown: Vec<iced::widget::markdown::Item>,
    notitie_invoer: bool,
    scroll: iced::Point,
    na_bewerking: Option<bool>, // Opslaan; bool geeft Opslaan als aan.
}
impl Tab {
    fn nieuw(id: u64, naam: String) -> Self {
        Self {
            id,
            naam,
            pad: None,
            verwacht: None,
            opgeslagen: None,
            archief: None,
            ifcx: false,
            export_ifcx: false,
            antwoord: None,
            afbeelding: None,
            bezig: true,
            schrijft: false,
            deel: 0,
            gekozen: 0,
            editor: text_editor::Content::new(),
            concept: false,
            adres: "A1".into(),
            doel_cel: None,
            zoom: 1.,
            grootte: "11".into(),
            lettertype: "Inter".into(),
            panelen: true,
            canvas_voorbeeld: None,
            markdown: vec![],
            notitie_invoer: false,
            scroll: iced::Point::ORIGIN,
            na_bewerking: None,
        }
    }
    fn gewijzigd(&self) -> bool {
        self.concept
            || self
                .antwoord
                .as_ref()
                .is_some_and(|a| self.opgeslagen.as_ref() != Some(&a.hash))
    }
    fn veld(&self) -> Option<&Veld> {
        self.antwoord.as_ref()?.beeld.velden.get(self.gekozen)
    }
    fn toon_veld(&mut self, n: usize) {
        if let Some(veld) = self.antwoord.as_ref().and_then(|a| a.beeld.velden.get(n)) {
            self.gekozen = n;
            self.editor = text_editor::Content::with_text(&veld.tekst);
            self.adres = veld.id.clone();
            self.concept = false;
            self.grootte = veld.opmaak.grootte.unwrap_or(11.).to_string();
            self.lettertype = veld
                .opmaak
                .lettertype
                .clone()
                .unwrap_or_else(|| "Inter".into());
        }
    }
}
struct App {
    tabs: Vec<Tab>,
    actief: usize,
    volgend: u64,
    werker: Werker,
    thema: ThemeId,
    display: Display,
    bestand: bool,
    lint: usize,
    instellingen: bool,
    melding: String,
    sluiten: Option<u64>,
    venster_sluiten: bool,
    venster_grootte: Size,
}
impl Default for App {
    fn default() -> Self {
        let pad = display::settings_path("open-office-studio-native");
        let display = pad.as_ref().map(|p| Display::load(p)).unwrap_or_default();
        Self {
            tabs: vec![],
            actief: 0,
            volgend: 1,
            werker: Werker::start(),
            thema: display.theme,
            display,
            bestand: false,
            lint: 0,
            instellingen: false,
            melding: "Gereed".into(),
            sluiten: None,
            venster_sluiten: false,
            venster_grootte: Size::new(1440., 900.),
        }
    }
}
impl App {
    fn look(&self) -> Look {
        stijl::office(
            Display {
                theme: self.thema,
                ..self.display
            }
            .look(),
        )
    }
    fn tab(&self) -> Option<&Tab> {
        self.tabs.get(self.actief)
    }
    fn tab_mut(&mut self) -> Option<&mut Tab> {
        self.tabs.get_mut(self.actief)
    }
    fn opdracht(&mut self, id: u64, opdracht: Opdracht) -> Task<Msg> {
        if let Some(t) = self.tabs.iter_mut().find(|t| t.id == id) {
            t.bezig = true;
        }
        Task::perform(self.werker.clone().voer_uit(id, opdracht), move |r| {
            Msg::Gereed(id, r)
        })
    }
    fn verder_sluiten(&mut self) -> Task<Msg> {
        if let Some(t) = self.tabs.iter().find(|t| t.bezig || t.schrijft) {
            self.melding = format!("Wacht tot {} gereed is", t.naam);
            self.venster_sluiten = false;
            return Task::none();
        }
        if let Some(t) = self.tabs.iter().find(|t| t.gewijzigd()) {
            self.sluiten = Some(t.id);
            Task::none()
        } else {
            iced::exit()
        }
    }
    fn update(&mut self, msg: Msg) -> Task<Msg> {
        // Een modale sluitvraag blokkeert ook sneltoetsen achter de overlay.
        if self.sluiten.is_some()
            && !matches!(
                msg,
                Msg::SluitKeuze(_)
                    | Msg::Annuleer
                    | Msg::Doel(..)
                    | Msg::Geschreven(..)
                    | Msg::VensterGrootte(..)
                    | Msg::Gereed(..)
                    | Msg::Opslaan(..)
            )
        {
            return Task::none();
        }
        match msg {
            Msg::Nieuw(module) => {
                let id = self.volgend;
                self.volgend += 1;
                let mut tab = Tab::nieuw(id, format!("Naamloos {id}.{}", module.extensie()));
                if module == Module::Email {
                    tab.ifcx = true;
                    tab.naam = format!("Naamloos {id}.ifcx");
                }
                self.tabs.push(tab);
                self.actief = self.tabs.len() - 1;
                self.bestand = false;
                return self.opdracht(id, Opdracht::Nieuw(module));
            }
            Msg::Open => {
                return Task::perform(
                    async {
                        rfd::AsyncFileDialog::new()
                            .add_filter(
                                "Office-bestanden",
                                &[
                                    "docx",
                                    "xlsx",
                                    "pptx",
                                    "json",
                                    "openaec-notities",
                                    "eml",
                                    "ifcx",
                                ],
                            )
                            .pick_file()
                            .await
                            .map(|f| f.path().to_path_buf())
                    },
                    Msg::Pad,
                );
            }
            Msg::Pad(Some(pad)) => {
                let id = self.volgend;
                self.volgend += 1;
                let terug = pad.clone();
                return Task::perform(
                    werker::achtergrond(move || {
                        let (b, h) = opslag::lees(&pad).map_err(|e| e.to_string())?;
                        let ext = pad.extension().and_then(|s| s.to_str()).unwrap_or_default();
                        if ext.eq_ignore_ascii_case("ifcx") {
                            let (m, _, bytes) = ifcx::lees(&b).map_err(|e| e.to_string())?;
                            Ok(Geopend {
                                module: m,
                                bytes,
                                hash: h,
                                archief: Some(b),
                            })
                        } else {
                            let m = Module::van_extensie(ext).map_err(|e| e.to_string())?;
                            Ok(Geopend {
                                module: m,
                                bytes: b,
                                hash: h,
                                archief: None,
                            })
                        }
                    }),
                    move |r| Msg::Gelezen(id, terug.clone(), r.and_then(|v| v)),
                );
            }
            Msg::Gelezen(id, pad, Ok(bron)) => {
                let mut tab = Tab::nieuw(
                    id,
                    pad.file_name().unwrap_or_default().to_string_lossy().into(),
                );
                tab.ifcx = bron.archief.is_some() || bron.module == Module::Email;
                tab.archief = bron.archief;
                tab.opgeslagen = Some(opslag::hash(&bron.bytes));
                if bron.module == Module::Email && tab.archief.is_none() {
                    tab.naam = pad
                        .with_extension("ifcx")
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into();
                    tab.opgeslagen = None;
                } else {
                    tab.pad = Some(pad);
                    tab.verwacht = Some(bron.hash);
                }
                self.tabs.push(tab);
                self.actief = self.tabs.len() - 1;
                self.bestand = false;
                return self.opdracht(id, Opdracht::Open(bron.module, bron.bytes));
            }
            Msg::Gelezen(_, _, Err(e)) => self.melding = e,
            Msg::Gereed(id, resultaat) => {
                let mut vervolg = None;
                let mut fout = false;
                if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
                    tab.bezig = false;
                    match resultaat {
                        Ok(mut antwoord) => {
                            lint::vul_beeldmaat(&mut antwoord.beeld);
                            if tab.antwoord.is_none()
                                && antwoord.beeld.module == Module::Spreadsheet
                            {
                                tab.panelen = false;
                            }
                            self.melding = antwoord.beeld.melding.clone();
                            tab.afbeelding = antwoord
                                .beeld
                                .afbeelding
                                .as_ref()
                                .map(|b| image::Handle::from_bytes(b.clone()));
                            tab.canvas_voorbeeld = None;
                            tab.notitie_invoer = false;
                            tab.markdown = antwoord
                                .beeld
                                .velden
                                .iter()
                                .find(|v| v.naam == "Markdown")
                                .map(|v| iced::widget::markdown::parse(&v.tekst).collect())
                                .unwrap_or_default();
                            tab.antwoord = Some(antwoord);
                            tab.deel = tab.deel.min(
                                tab.antwoord
                                    .as_ref()
                                    .unwrap()
                                    .beeld
                                    .onderdelen
                                    .len()
                                    .saturating_sub(1),
                            );
                            let bereik = tab.doel_cel.take().unwrap_or_else(|| tab.adres.clone());
                            let doel = bereik.split(':').next().unwrap_or_default();
                            let keuze = tab
                                .antwoord
                                .as_ref()
                                .and_then(|a| {
                                    a.beeld
                                        .velden
                                        .iter()
                                        .position(|v| v.id.eq_ignore_ascii_case(doel))
                                })
                                .unwrap_or(
                                    tab.gekozen.min(
                                        tab.antwoord
                                            .as_ref()
                                            .unwrap()
                                            .beeld
                                            .velden
                                            .len()
                                            .saturating_sub(1),
                                    ),
                                );
                            tab.toon_veld(keuze);
                            if bereik.contains(':')
                                && tab.antwoord.as_ref().unwrap().beeld.module
                                    == Module::Spreadsheet
                            {
                                tab.adres = bereik;
                            }
                            vervolg = tab.na_bewerking.take();
                        }
                        Err(e) => {
                            self.melding = e;
                            tab.na_bewerking = None;
                            tab.canvas_voorbeeld = None;
                            fout = true;
                        }
                    }
                }
                if fout && self.tabs.iter().any(|t| t.id == id && t.antwoord.is_none()) {
                    self.verwijder(id);
                }
                if let Some(als) = vervolg {
                    return self.update(Msg::Opslaan(id, als));
                }
            }
            Msg::Selecteer(n) => {
                if n < self.tabs.len() {
                    self.actief = n;
                    self.bestand = false;
                }
            }
            Msg::Deel(n) => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.concept {
                        return self.waarschuwing(
                            "Pas de huidige tekst eerst toe of maak de invoer ongedaan",
                        );
                    }
                    t.deel = n;
                    t.gekozen = 0;
                    let id = t.id;
                    return self.opdracht(id, Opdracht::Deel(n));
                }
            }
            Msg::Veld(n) => {
                if let Some(t) = self.tab_mut() {
                    if t.concept {
                        return self.waarschuwing(
                            "Pas de huidige tekst eerst toe of maak de invoer ongedaan",
                        );
                    }
                    t.toon_veld(n);
                    t.notitie_invoer = true;
                }
            }
            Msg::Adres(a) => {
                if let Some(t) = self.tab_mut() {
                    t.adres = a;
                }
            }
            Msg::Raak(id) => {
                if let Some(n) = self
                    .tab()
                    .and_then(|t| t.antwoord.as_ref())
                    .and_then(|a| a.beeld.velden.iter().position(|v| v.id == id))
                {
                    return self.update(Msg::Veld(n));
                }
            }
            Msg::VensterGrootte(g) => {
                self.venster_grootte = g;
            }
            Msg::Schuif(p) => {
                if let Some(t) = self.tab_mut() {
                    t.scroll = p;
                }
            }
            Msg::Zoom(z) => {
                if let Some(t) = self.tab_mut() {
                    t.zoom = z.clamp(0.25, 3.);
                }
            }
            Msg::CanvasAnnuleer => {
                if let Some(t) = self.tab_mut() {
                    t.canvas_voorbeeld = None;
                }
            }
            Msg::NotitiePlaats(vak, grens, vast) => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.concept {
                        return Task::none();
                    }
                    t.canvas_voorbeeld = Some((vak, grens));
                    if vast {
                        return self.update(Msg::Notitie(
                            office_core::notities::NotitieActie::Plaats { vak, grens },
                        ));
                    }
                }
            }
            Msg::Notitie(actie) => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.concept {
                        return self.waarschuwing("Pas de huidige tekst eerst toe");
                    }
                    let opdracht = Opdracht::Bewerk(t.deel, Bewerking::Notitie(actie));
                    let id = t.id;
                    return self.opdracht(id, opdracht);
                }
            }
            Msg::Koppeling(uri) => {
                if uri.starts_with("https://") || uri.starts_with("http://") {
                    return Task::perform(
                        async move {
                            std::thread::spawn(move || {
                                #[cfg(target_os = "windows")]
                                let opdracht = "explorer.exe";
                                #[cfg(target_os = "macos")]
                                let opdracht = "open";
                                #[cfg(not(any(target_os = "windows", target_os = "macos")))]
                                let opdracht = "xdg-open";
                                std::process::Command::new(opdracht)
                                    .arg(uri)
                                    .status()
                                    .map_err(|e| e.to_string())
                                    .and_then(|s| {
                                        if s.success() {
                                            Ok("Koppeling geopend".into())
                                        } else {
                                            Err("Koppeling kon niet worden geopend".into())
                                        }
                                    })
                            })
                            .join()
                            .unwrap_or_else(|_| Err("Koppeling kon niet worden geopend".into()))
                        },
                        Msg::ExportKlaar,
                    );
                }
                return self.waarschuwing("Alleen webkoppelingen kunnen worden geopend");
            }
            Msg::Panelen => {
                if let Some(t) = self.tab_mut() {
                    t.panelen = !t.panelen;
                }
            }
            Msg::Formule(tekst) => {
                if let Some(t) = self.tab_mut()
                    && !t.bezig
                    && t.veld().is_some_and(|v| v.bewerkbaar)
                {
                    t.editor = text_editor::Content::with_text(&tekst);
                    t.concept = true;
                }
            }
            Msg::Dia(actie) => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.concept {
                        return self.waarschuwing("Pas de ingevoerde tekst eerst toe");
                    }
                    let opdracht = Opdracht::Bewerk(t.deel, Bewerking::Dia(actie));
                    let id = t.id;
                    return self.opdracht(id, opdracht);
                }
            }
            Msg::Grootte(g) => {
                if let Some(t) = self.tab_mut() {
                    t.grootte = g;
                }
            }
            Msg::Lettertype(g) => {
                if let Some(t) = self.tab_mut() {
                    t.lettertype = g;
                }
            }
            Msg::Opmaak(stijl) => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.concept {
                        return self.waarschuwing("Pas de ingevoerde tekst eerst toe");
                    }
                    if let Some(v) = t.veld() {
                        let module = t.antwoord.as_ref().unwrap().beeld.module;
                        let id = if module == Module::Spreadsheet {
                            t.adres.clone()
                        } else {
                            v.id.clone()
                        };
                        let cursor = t.editor.cursor();
                        let offset = |p: iced::advanced::text::editor::Position| {
                            lint::tekenoffset(&t.editor, p)
                        };
                        let (begin, einde) = if let Some(anchor) = cursor.selection {
                            let a = offset(anchor);
                            let b = offset(cursor.position);
                            (a.min(b), a.max(b))
                        } else {
                            (0, v.tekst.chars().count())
                        };
                        let opdracht = Opdracht::Bewerk(
                            t.deel,
                            Bewerking::Opmaak {
                                id,
                                begin,
                                einde,
                                stijl,
                            },
                        );
                        let id = t.id;
                        return self.opdracht(id, opdracht);
                    }
                }
            }
            Msg::Structuur(actie) => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.concept {
                        return self.waarschuwing("Pas de ingevoerde tekst eerst toe");
                    }
                    let id = t.id;
                    let opdracht = Opdracht::Bewerk(
                        t.deel,
                        Bewerking::Structuur {
                            adres: t.adres.clone(),
                            actie,
                        },
                    );
                    return self.opdracht(id, opdracht);
                }
            }
            Msg::GaNaar => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.concept {
                        return self.waarschuwing(
                            "Pas de huidige tekst eerst toe of maak de invoer ongedaan",
                        );
                    }
                    let adres = t.adres.trim().to_ascii_uppercase();
                    match office_core::rekenblad::bereik(&adres) {
                        Ok(r) => {
                            let cel = r.start.to_a1();
                            if let Some(n) = t
                                .antwoord
                                .as_ref()
                                .and_then(|a| a.beeld.velden.iter().position(|v| v.id == cel))
                            {
                                t.toon_veld(n);
                                t.adres = adres;
                            } else {
                                let id = t.id;
                                t.doel_cel = Some(adres.clone());
                                let opdracht = Opdracht::Cel(t.deel, adres);
                                return self.opdracht(id, opdracht);
                            }
                        }
                        Err(e) => return self.waarschuwing(&e.to_string()),
                    }
                }
            }
            Msg::Invoer(actie) => {
                if let Some(t) = self.tab_mut()
                    && !t.bezig
                    && (!actie.is_edit() || t.veld().is_some_and(|v| v.bewerkbaar))
                {
                    let bewerkt = actie.is_edit();
                    t.editor.perform(actie);
                    t.concept |= bewerkt;
                }
            }
            Msg::PasToe => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || !t.concept {
                        return Task::none();
                    }
                    if let Some(v) = t.veld() {
                        let id = t.id;
                        let opdracht = Opdracht::Bewerk(
                            t.deel,
                            Bewerking::Tekst {
                                id: v.id.clone(),
                                tekst: t.editor.text(),
                            },
                        );
                        return self.opdracht(id, opdracht);
                    }
                }
            }
            Msg::Opslaan(id, als) => {
                if let Some(t) = self.tabs.iter_mut().find(|t| t.id == id) {
                    if t.bezig || t.schrijft {
                        return self.waarschuwing("Dit document wordt nog verwerkt");
                    }
                    if t.concept {
                        t.na_bewerking = Some(als);
                        let v = t.veld().unwrap();
                        let opdracht = Opdracht::Bewerk(
                            t.deel,
                            Bewerking::Tekst {
                                id: v.id.clone(),
                                tekst: t.editor.text(),
                            },
                        );
                        return self.opdracht(id, opdracht);
                    }
                    if t.antwoord.is_none() {
                        return Task::none();
                    }
                    t.schrijft = true;
                    if !als && let Some(p) = t.pad.clone() {
                        return self.schrijf(id, p);
                    }
                    let naam = if t.export_ifcx {
                        PathBuf::from(&t.naam)
                            .with_extension("ifcx")
                            .to_string_lossy()
                            .into_owned()
                    } else {
                        t.naam.clone()
                    };
                    let ext = if t.ifcx || t.export_ifcx {
                        "ifcx"
                    } else {
                        t.antwoord.as_ref().unwrap().beeld.module.extensie()
                    };
                    return Task::perform(
                        async move {
                            rfd::AsyncFileDialog::new()
                                .set_file_name(naam)
                                .add_filter("Document", &[ext])
                                .save_file()
                                .await
                                .map(|f| f.path().to_path_buf())
                        },
                        move |p| Msg::Doel(id, p),
                    );
                }
            }
            Msg::Doel(id, Some(pad)) => return self.schrijf(id, pad),
            Msg::Doel(id, None) => {
                if let Some(t) = self.tabs.iter_mut().find(|t| t.id == id) {
                    t.schrijft = false;
                    t.export_ifcx = false;
                }
                self.sluiten = None;
                self.venster_sluiten = false;
            }
            Msg::Geschreven(id, pad, resultaat) => {
                if let Some(t) = self.tabs.iter_mut().find(|t| t.id == id) {
                    t.schrijft = false;
                    match resultaat {
                        Ok((hash, bronhash, archief)) => {
                            t.ifcx = archief.is_some();
                            t.export_ifcx = false;
                            t.archief = archief;
                            t.pad = Some(pad.clone());
                            t.naam = pad.file_name().unwrap_or_default().to_string_lossy().into();
                            t.verwacht = Some(hash.clone());
                            t.opgeslagen = Some(bronhash);
                            self.melding = "Opgeslagen".into();
                        }
                        Err(e) => {
                            self.melding = e;
                            self.sluiten = None;
                            self.venster_sluiten = false;
                        }
                    }
                }
                if self.sluiten == Some(id)
                    && self.tabs.iter().any(|t| t.id == id && !t.gewijzigd())
                {
                    self.verwijder(id);
                    self.sluiten = None;
                    if self.venster_sluiten {
                        return self.verder_sluiten();
                    }
                }
            }
            Msg::Terug => {
                if let Some(t) = self.tab_mut() {
                    if t.concept {
                        let n = t.gekozen;
                        t.toon_veld(n);
                        return Task::none();
                    }
                    if !t.bezig && t.antwoord.as_ref().is_some_and(|a| a.terug) {
                        let id = t.id;
                        return self.opdracht(id, Opdracht::Terug);
                    }
                }
            }
            Msg::Vooruit => {
                if let Some(t) = self.tab()
                    && !t.bezig
                    && !t.concept
                    && t.antwoord.as_ref().is_some_and(|a| a.vooruit)
                {
                    let id = t.id;
                    return self.opdracht(id, Opdracht::Vooruit);
                }
            }
            Msg::Sluit(n) => {
                if let Some(t) = self.tabs.get(n) {
                    if t.bezig || t.schrijft {
                        return self.waarschuwing("Wacht tot het document gereed is");
                    }
                    let id = t.id;
                    if t.gewijzigd() {
                        self.sluiten = Some(id);
                    } else {
                        self.verwijder(id);
                    }
                }
            }
            Msg::SluitVenster => {
                self.instellingen = false;
                self.venster_sluiten = true;
                return self.verder_sluiten();
            }
            Msg::SluitKeuze(opslaan) => {
                if let Some(id) = self.sluiten {
                    if opslaan {
                        return self.update(Msg::Opslaan(id, false));
                    }
                    self.verwijder(id);
                    self.sluiten = None;
                    if self.venster_sluiten {
                        return self.verder_sluiten();
                    }
                }
            }
            Msg::Annuleer => {
                self.sluiten = None;
                self.venster_sluiten = false;
            }
            Msg::Bestand(b) => self.bestand = b,
            Msg::Lint(n) => {
                self.lint = n;
                self.bestand = false;
            }
            Msg::Thema(thema) => {
                self.thema = thema;
                self.display.theme = thema;
                if let Some(p) = display::settings_path("open-office-studio-native")
                    && let Err(e) = self.display.save(&p)
                {
                    self.melding = e.to_string();
                }
            }
            Msg::Instellingen(b) => self.instellingen = b,
            Msg::Archiveer => {
                if let Some(t) = self.tab_mut() {
                    if t.bezig || t.schrijft {
                        return Task::none();
                    }
                    t.export_ifcx = true;
                    let id = t.id;
                    return self.update(Msg::Opslaan(id, true));
                }
            }
            Msg::Markdown => {
                if let Some(t) = self.tab() {
                    if t.concept {
                        return self.waarschuwing("Pas de huidige tekst eerst toe");
                    }
                    let id = t.id;
                    return Task::perform(
                        self.werker.clone().voer_uit(id, Opdracht::Markdown),
                        Msg::MarkdownKlaar,
                    );
                }
            }
            Msg::MarkdownKlaar(Ok(a)) => {
                let tekst = a.beeld.melding;
                return Task::perform(
                    async {
                        rfd::AsyncFileDialog::new()
                            .set_file_name("document.md")
                            .add_filter("Markdown", &["md"])
                            .save_file()
                            .await
                            .map(|f| f.path().to_path_buf())
                    },
                    move |p| Msg::MarkdownDoel(tekst.clone(), p),
                );
            }
            Msg::MarkdownKlaar(Err(e)) => self.melding = e,
            Msg::MarkdownDoel(tekst, Some(p)) => {
                return Task::perform(
                    werker::achtergrond(move || {
                        let verwacht = doelhash(&p)?;
                        opslag::schrijf(&p, tekst.as_bytes(), verwacht.as_deref())
                            .map_err(|e| e.to_string())
                    }),
                    |r| Msg::ExportKlaar(r.and_then(|r| r)),
                );
            }
            Msg::ExportKlaar(r) => {
                self.melding = match r {
                    Ok(_) => "Export opgeslagen".into(),
                    Err(e) => e,
                }
            }
            Msg::Sleep => return iced::window::latest().and_then(iced::window::drag),
            Msg::Minimaliseer => {
                return iced::window::latest().and_then(|id| iced::window::minimize(id, true));
            }
            Msg::Maximaliseer => {
                return iced::window::latest().and_then(iced::window::toggle_maximize);
            }
            Msg::Toets(k) => {
                use iced::keyboard::{Key, key::Named};
                if k.key == Key::Named(Named::Escape) {
                    self.instellingen = false;
                    self.bestand = false;
                    return Task::none();
                }
                if self.instellingen {
                    return Task::none();
                }
                if k.modifiers.command()
                    && let Key::Character(s) = k.key
                {
                    let msg = match s.to_lowercase().as_str() {
                        "o" => Some(Msg::Open),
                        "n" => Some(Msg::Nieuw(Module::Writer)),
                        "s" => self.tab().map(|t| Msg::Opslaan(t.id, k.modifiers.shift())),
                        "z" => Some(if k.modifiers.shift() {
                            Msg::Vooruit
                        } else {
                            Msg::Terug
                        }),
                        "y" => Some(Msg::Vooruit),
                        _ => None,
                    };
                    if let Some(m) = msg {
                        return self.update(m);
                    }
                }
            }
            Msg::Navigeer(n) => return openaec_ui::keyboard::navigate(n),
            Msg::Pad(None) | Msg::MarkdownDoel(_, None) => {}
        }
        Task::none()
    }
    fn waarschuwing(&mut self, m: &str) -> Task<Msg> {
        self.melding = m.into();
        Task::none()
    }
    fn verwijder(&mut self, id: u64) {
        self.tabs.retain(|t| t.id != id);
        self.actief = self.actief.min(self.tabs.len().saturating_sub(1));
        self.werker.sluit(id);
    }
    fn schrijf(&mut self, id: u64, pad: PathBuf) -> Task<Msg> {
        let Some(t) = self.tabs.iter().find(|t| t.id == id) else {
            return Task::none();
        };
        let a = t.antwoord.as_ref().unwrap();
        if pad.extension().and_then(|e| e.to_str()).is_none_or(|e| {
            !(a.beeld.module == Module::Notition
                && !t.ifcx
                && !t.export_ifcx
                && e.eq_ignore_ascii_case("openaec-notities"))
                && !e.eq_ignore_ascii_case(if t.ifcx || t.export_ifcx {
                    "ifcx"
                } else {
                    a.beeld.module.extensie()
                })
        }) {
            if let Some(t) = self.tabs.iter_mut().find(|t| t.id == id) {
                t.schrijft = false;
            }
            return self.waarschuwing(
                "Kies de oorspronkelijke bestandsextensie. Gebruik export voor een ander formaat.",
            );
        }
        let bron = a.bron.clone();
        let module = a.beeld.module;
        let archief = t.archief.clone();
        let is_ifcx = t.ifcx || t.export_ifcx;
        let naam = PathBuf::from(&t.naam)
            .with_extension(module.extensie())
            .to_string_lossy()
            .into_owned();
        let verwacht = if t.pad.as_ref() == Some(&pad) {
            Some(t.verwacht.clone())
        } else {
            None
        };
        let terug = pad.clone();
        Task::perform(
            werker::achtergrond(move || {
                let h = match verwacht {
                    Some(h) => h,
                    None => doelhash(&pad)?,
                };
                let container = if is_ifcx {
                    Some(
                        match archief {
                            Some(oud) => ifcx::vervang(&oud, &bron),
                            None => ifcx::maak(module, &naam, &bron),
                        }
                        .map_err(|e| e.to_string())?,
                    )
                } else {
                    None
                };
                let bytes = container.as_deref().unwrap_or(&bron);
                let hash = opslag::schrijf(&pad, bytes, h.as_deref()).map_err(|e| e.to_string())?;
                Ok((hash, opslag::hash(&bron), container))
            }),
            move |r| Msg::Geschreven(id, terug.clone(), r.and_then(|r| r)),
        )
    }
    fn subscription(&self) -> Subscription<Msg> {
        Subscription::batch([
            openaec_ui::keyboard::presses().map(Msg::Toets),
            openaec_ui::keyboard::navigation().map(Msg::Navigeer),
            iced::window::close_requests().map(|_| Msg::SluitVenster),
            iced::window::resize_events().map(|(_, g)| Msg::VensterGrootte(g)),
        ])
    }
    fn view(&self) -> Element<'_, Msg> {
        let look = self.look();
        let c = look.color;
        let titel = self
            .tab()
            .map(|t| {
                format!(
                    "{}{} · Open Office Studio",
                    t.naam,
                    if t.gewijzigd() { " •" } else { "" }
                )
            })
            .unwrap_or("Open Office Studio".into());
        let knop = |i, label, msg| {
            w::with_tooltip(
                look,
                w::icon_button(look, icoon(i), 28., false, label, msg),
                label,
                None,
            )
        };
        let snel = vec![
            knop(Icon::Open, "Openen", Some(Msg::Open)),
            knop(
                Icon::Save,
                "Opslaan",
                self.tab()
                    .filter(|t| !t.bezig && !t.schrijft)
                    .map(|t| Msg::Opslaan(t.id, false)),
            ),
            knop(
                Icon::Undo,
                "Ongedaan maken",
                self.tab()
                    .filter(|t| t.concept || t.antwoord.as_ref().is_some_and(|a| a.terug))
                    .map(|_| Msg::Terug),
            ),
        ];
        let balk = chrome::title_bar(
            look,
            titel,
            snel,
            vec![knop(
                Icon::Settings,
                "Instellingen",
                Some(Msg::Instellingen(true)),
            )],
            WindowActions {
                drag: Msg::Sleep,
                minimize: Msg::Minimaliseer,
                maximize: Msg::Maximaliseer,
                close: Msg::SluitVenster,
                maximized: false,
            },
            WindowIcons {
                minimize: icoon(Icon::Minimize),
                maximize: icoon(Icon::Maximize),
                restore: icoon(Icon::Restore),
                close: icoon(Icon::Close),
            },
        );
        let inhoud = if self.bestand {
            self.bestand_view()
        } else {
            column![self.ribbon(), self.documenten()]
                .height(Length::Fill)
                .into()
        };
        let scherm = column![
            balk,
            w::ribbon_tabs(
                look,
                "Bestand",
                Some(Msg::Bestand(!self.bestand)),
                &["Start", "Weergave"],
                self.lint,
                Msg::Lint
            ),
            inhoud,
            w::status_bar(
                look,
                vec![self.melding.clone()],
                vec![format!("{} · native preview", office_core::VERSIE)]
            )
        ]
        .height(Length::Fill);
        let modaal = self.sluiten.is_some() || self.instellingen;
        let mut lagen = vec![focus::inert(
            container(scherm).style(move |_| container::Style {
                background: Some(c.frame.into()),
                ..Default::default()
            }),
            modaal,
        )];
        if self.sluiten.is_some() {
            let naam = self
                .sluiten
                .and_then(|id| self.tabs.iter().find(|t| t.id == id))
                .map(|t| t.naam.as_str())
                .unwrap_or("document");
            let body = column![
                w::body(look, format!("Wijzigingen in {naam} opslaan?")),
                w::secondary(look, "Ook nog niet toegepaste tekst wordt meegenomen.")
            ]
            .spacing(12)
            .into();
            lagen.push(
                iced::widget::mouse_area(w::overlay(
                    look,
                    w::dialog(
                        look,
                        "Document sluiten",
                        icoon(Icon::Close),
                        Some(Msg::Annuleer),
                        body,
                        None,
                        vec![
                            w::button(
                                look,
                                "Annuleren",
                                K::Quiet,
                                D::Regular,
                                None,
                                Some(Msg::Annuleer),
                            ),
                            w::button(
                                look,
                                "Niet opslaan",
                                K::Quiet,
                                D::Regular,
                                None,
                                Some(Msg::SluitKeuze(false)),
                            ),
                            w::button(
                                look,
                                "Opslaan",
                                K::Primary,
                                D::Regular,
                                None,
                                Some(Msg::SluitKeuze(true)),
                            ),
                        ],
                        true,
                    ),
                ))
                .into(),
            );
        }
        if self.instellingen {
            let body=column![w::heading(look,"Weergave",16.),openaec_ui::design::a11y::named(w::select(look,&ThemeId::ALL,Some(self.thema),Msg::Thema,D::Regular),openaec_ui::design::a11y::Role::ComboBox,"Thema"),w::secondary(look,"Native Rust-interface op basis van OpenAEC Blueprint. De webversie blijft apart beschikbaar tijdens de migratie.")].spacing(12).into();
            lagen.push(
                iced::widget::mouse_area(w::overlay(
                    look,
                    w::dialog(
                        look,
                        "Instellingen",
                        icoon(Icon::Close),
                        Some(Msg::Instellingen(false)),
                        body,
                        None,
                        vec![w::button(
                            look,
                            "Sluiten",
                            K::Primary,
                            D::Regular,
                            None,
                            Some(Msg::Instellingen(false)),
                        )],
                        true,
                    ),
                ))
                .into(),
            );
        }
        iced::widget::Stack::with_children(lagen).into()
    }
    fn ribbon(&self) -> Element<'_, Msg> {
        if let Some(lint) = lint::ribbon(self) {
            return lint;
        }
        let l = self.look();
        if self.lint == 1 {
            return w::ribbon(
                l,
                vec![w::ribbon_group(
                    l,
                    "Thema",
                    ThemeId::ALL
                        .iter()
                        .map(|&t| {
                            w::button(
                                l,
                                t.name(),
                                if self.thema == t {
                                    K::Secondary
                                } else {
                                    K::Quiet
                                },
                                D::Compact,
                                None,
                                Some(Msg::Thema(t)),
                            )
                        })
                        .collect(),
                )],
            );
        }
        let nieuw = column(
            Module::ALLE
                .iter()
                .map(|&m| {
                    w::ribbon_small(l, icoon(Icon::New), m.naam(), false, Some(Msg::Nieuw(m)))
                })
                .take(3),
        )
        .spacing(2);
        let extra =
            column(Module::ALLE.iter().skip(3).map(|&m| {
                w::ribbon_small(l, icoon(Icon::New), m.naam(), false, Some(Msg::Nieuw(m)))
            }))
            .spacing(2);
        w::ribbon(
            l,
            vec![
                w::ribbon_group(l, "Nieuw", vec![nieuw.into(), extra.into()]),
                w::ribbon_group(
                    l,
                    "Bestand",
                    vec![
                        w::ribbon_large(l, icoon(Icon::Open), "Openen", false, Some(Msg::Open)),
                        w::ribbon_large(
                            l,
                            icoon(Icon::Save),
                            "Opslaan",
                            false,
                            self.tab()
                                .filter(|t| !t.bezig && !t.schrijft)
                                .map(|t| Msg::Opslaan(t.id, false)),
                        ),
                    ],
                ),
                w::ribbon_group(
                    l,
                    "Bewerken",
                    vec![
                        column![
                            w::ribbon_small(
                                l,
                                icoon(Icon::Undo),
                                "Ongedaan maken",
                                false,
                                self.tab()
                                    .filter(|t| !t.bezig
                                        && (t.concept
                                            || t.antwoord.as_ref().is_some_and(|a| a.terug)))
                                    .map(|_| Msg::Terug)
                            ),
                            w::ribbon_small(
                                l,
                                icoon(Icon::Redo),
                                "Opnieuw",
                                false,
                                self.tab()
                                    .filter(|t| !t.bezig
                                        && !t.concept
                                        && t.antwoord.as_ref().is_some_and(|a| a.vooruit))
                                    .map(|_| Msg::Vooruit)
                            )
                        ]
                        .spacing(2)
                        .into(),
                    ],
                ),
                w::ribbon_group(
                    l,
                    "Document",
                    vec![
                        w::ribbon_large(
                            l,
                            icoon(Icon::Check),
                            "Tekst toepassen",
                            false,
                            self.tab()
                                .filter(|t| t.concept && !t.bezig)
                                .map(|_| Msg::PasToe),
                        ),
                        w::ribbon_large(
                            l,
                            icoon(Icon::Export),
                            "Markdown",
                            false,
                            self.tab()
                                .filter(|t| {
                                    !t.bezig
                                        && t.antwoord
                                            .as_ref()
                                            .is_some_and(|a| a.beeld.module == Module::Writer)
                                })
                                .map(|_| Msg::Markdown),
                        ),
                        w::ribbon_large(
                            l,
                            icoon(Icon::Export),
                            "IFCX",
                            false,
                            self.tab().filter(|t| !t.bezig).map(|_| Msg::Archiveer),
                        ),
                    ],
                ),
            ],
        )
    }
    fn bestand_view(&self) -> Element<'_, Msg> {
        let l = self.look();
        let mut acties = column![
            w::heading(l, "Bestand", 28.),
            w::button(
                l,
                "Terug naar document",
                K::Quiet,
                D::Regular,
                Some(icoon(Icon::Back)),
                Some(Msg::Bestand(false))
            ),
            w::button(
                l,
                "Openen…",
                K::Secondary,
                D::Regular,
                Some(icoon(Icon::Open)),
                Some(Msg::Open)
            )
        ]
        .spacing(14);
        for m in Module::ALLE {
            acties = acties.push(w::button(
                l,
                m.naam(),
                K::Quiet,
                D::Regular,
                Some(icoon(Icon::New)),
                Some(Msg::Nieuw(m)),
            ));
        }
        if let Some(t) = self.tab() {
            acties = acties.push(w::button(
                l,
                "Opslaan als…",
                K::Primary,
                D::Regular,
                Some(icoon(Icon::SaveAs)),
                Some(Msg::Opslaan(t.id, true)),
            ));
        }
        container(acties)
            .padding(40)
            .height(Length::Fill)
            .width(Length::Fill)
            .style(move |_| w::panel_style(l))
            .into()
    }
    fn documenten(&self) -> Element<'_, Msg> {
        let l = self.look();
        let c = l.color;
        if self.tabs.is_empty() {
            let mut kaarten = row![].spacing(14);
            for m in Module::ALLE {
                let kaart = column![
                    w::heading(l, m.naam(), 20.),
                    w::secondary(
                        l,
                        match m {
                            Module::Writer => "Documenten en teksten",
                            Module::Spreadsheet => "Rekenbladen en formules",
                            Module::Presentation => "Dia’s en presentaties",
                            Module::Notition => "Notitieboeken",
                            Module::Email => "Lokale e-mailarchieven",
                        }
                    ),
                    w::button(
                        l,
                        "Nieuw",
                        K::Secondary,
                        D::Regular,
                        None,
                        Some(Msg::Nieuw(m))
                    )
                ]
                .spacing(16);
                kaarten = kaarten.push(
                    container(kaart)
                        .width(200)
                        .padding(22)
                        .style(move |_| w::panel_style(l)),
                );
            }
            return container(
                column![
                    w::mono_label(l, "OPENAEC · OFFICE"),
                    w::heading(l, "Ruimte voor je werk", 36.),
                    w::secondary(l, "Open een bestand of begin een nieuw document."),
                    scrollable(kaarten)
                        .direction(scrollable::Direction::Horizontal(Default::default())),
                    w::button(
                        l,
                        "Bestand openen…",
                        K::Primary,
                        D::Regular,
                        Some(icoon(Icon::Open)),
                        Some(Msg::Open)
                    )
                ]
                .spacing(22),
            )
            .padding(40)
            .width(Length::Fill)
            .height(Length::Fill)
            .style(move |_| container::Style {
                background: Some(c.workspace.into()),
                ..Default::default()
            })
            .into();
        }
        let tabs: Vec<_> = self
            .tabs
            .iter()
            .map(|t| DocumentTab::new(&t.naam, t.gewijzigd()))
            .collect();
        let t = self.tab().unwrap();
        let werk: Element<_> = if let Some(a) = &t.antwoord {
            if a.beeld.module == Module::Notition {
                notitie_ui::weergave(self, t, a)
            } else {
                let mut nav = column![w::mono_label(l, a.beeld.module.naam())].spacing(6);
                for (i, naam) in a.beeld.onderdelen.iter().enumerate() {
                    nav = nav.push(w::button(
                        l,
                        naam,
                        if i == t.deel { K::Secondary } else { K::Quiet },
                        D::Compact,
                        None,
                        (!t.bezig).then_some(Msg::Deel(i)),
                    ));
                }
                let navigator = w::panel(
                    l,
                    "Navigatie",
                    190.,
                    vec![],
                    scrollable(nav.padding(12)).into(),
                );
                let inhoud: Element<_> = if let Some(afbeelding) = &t.afbeelding {
                    let pagina = &a.beeld.pagina;
                    let inhoud = image(afbeelding.clone())
                        .width((pagina.breedte * t.zoom).max(1.))
                        .height((pagina.hoogte * t.zoom).max(1.))
                        .content_fit(iced::ContentFit::Fill);
                    container(
                        container(documentblad::blad(
                            inhoud,
                            pagina,
                            t.veld().map(|v| v.id.as_str()),
                            c.accent,
                            Msg::Raak,
                        ))
                        .style(|_| container::Style {
                            background: Some(iced::Color::WHITE.into()),
                            border: iced::Border {
                                color: iced::Color::from_rgb8(231, 229, 228),
                                width: 1.,
                                radius: 0.into(),
                            },
                            shadow: iced::Shadow {
                                color: iced::Color::from_rgba8(0, 0, 0, 0.06),
                                offset: iced::Vector::new(0., 1.),
                                blur_radius: 4.,
                            },
                            ..Default::default()
                        }),
                    )
                    .padding(iced::Padding {
                        top: 23.,
                        bottom: 24.,
                        left: 24.,
                        right: 24.,
                    })
                    .width(
                        (self.venster_grootte.width
                            - if t.panelen { 490. } else { 0. }
                            - if a.beeld.module == Module::Writer {
                                18.
                            } else {
                                40.
                            })
                        .max(pagina.breedte * t.zoom + 48.),
                    )
                    .align_x(iced::Alignment::Center)
                    .into()
                } else {
                    let mut blad =
                        column![w::mono_label(l, "OPENAEC"), w::heading(l, &t.naam, 26.)]
                            .spacing(14);
                    for (i, veld) in a.beeld.velden.iter().enumerate() {
                        if !veld.tekst.is_empty() || veld.bewerkbaar {
                            let tekst = if veld.tekst.is_empty() {
                                "Klik om te schrijven"
                            } else {
                                &veld.tekst
                            };
                            blad = blad.push(w::button(
                                l,
                                tekst,
                                if i == t.gekozen {
                                    K::Secondary
                                } else {
                                    K::Quiet
                                },
                                D::Regular,
                                None,
                                Some(Msg::Veld(i)),
                            ));
                        }
                    }
                    container(blad.padding(38))
                        .max_width(820)
                        .width(Length::Fill)
                        .style(move |_| w::panel_style(l))
                        .into()
                };
                let pagina = &a.beeld.pagina;
                let scroller = scrollable(inhoud)
                    .direction(scrollable::Direction::Both {
                        horizontal: Default::default(),
                        vertical: Default::default(),
                    })
                    .on_scroll(|vp| {
                        let p = vp.absolute_offset();
                        Msg::Schuif(iced::Point::new(p.x, p.y))
                    })
                    .height(Length::Fill);
                let midden: Element<_> = if a.beeld.module == Module::Writer {
                    container(
                        column![
                            row![
                                iced::widget::Space::new().width(18),
                                lineaal::lineaal(pagina, t.zoom, t.scroll, true)
                            ],
                            row![lineaal::lineaal(pagina, t.zoom, t.scroll, false), scroller]
                                .height(Length::Fill)
                        ]
                        .height(Length::Fill),
                    )
                    .width(Length::Fill)
                    .height(Length::Fill)
                    .style(|_| container::Style {
                        background: Some(iced::Color::from_rgb8(245, 245, 243).into()),
                        ..Default::default()
                    })
                    .into()
                } else {
                    container(scroller)
                        .padding(20)
                        .width(Length::Fill)
                        .height(Length::Fill)
                        .style(move |_| container::Style {
                            background: Some(c.workspace.into()),
                            ..Default::default()
                        })
                        .into()
                };
                let mut velden = column![].spacing(3);
                for (i, veld) in a.beeld.velden.iter().enumerate() {
                    let label = if a.beeld.module == Module::Spreadsheet {
                        format!("{}  {}", veld.naam, veld.tekst)
                    } else {
                        format!(
                            "{}  {}",
                            veld.naam,
                            veld.tekst.chars().take(36).collect::<String>()
                        )
                    };
                    velden = velden.push(tekstknop(
                        l,
                        label,
                        if i == t.gekozen {
                            K::Secondary
                        } else {
                            K::Quiet
                        },
                        D::Compact,
                        None,
                        (!t.bezig).then_some(Msg::Veld(i)),
                    ));
                }
                let veld = t.veld();
                let mut editor = column![w::mono_label(l, "TEKST BEWERKEN")].spacing(10);
                if a.beeld.module == Module::Spreadsheet {
                    editor = editor.push(
                        row![
                            openaec_ui::design::a11y::named(
                                text_input("Celadres", &t.adres)
                                    .on_input(Msg::Adres)
                                    .on_submit(Msg::GaNaar),
                                openaec_ui::design::a11y::Role::TextField,
                                "Celadres"
                            ),
                            w::button(l, "Ga", K::Secondary, D::Compact, None, Some(Msg::GaNaar))
                        ]
                        .spacing(4),
                    );
                }
                editor = editor.push(w::body(
                    l,
                    veld.map(|v| v.naam.as_str()).unwrap_or("Geen tekstveld"),
                ));
                let bewerkbaar = veld.is_some_and(|v| v.bewerkbaar) && !t.bezig;
                editor = editor.push(openaec_ui::design::a11y::named(
                    text_editor(&t.editor)
                        .on_action(Msg::Invoer)
                        .height(190)
                        .padding(12),
                    openaec_ui::design::a11y::Role::TextField,
                    "Tekst van geselecteerd veld",
                ));
                editor = editor.push(w::button(
                    l,
                    if t.bezig { "Verwerken…" } else { "Toepassen" },
                    K::Primary,
                    D::Regular,
                    Some(icoon(Icon::Check)),
                    (bewerkbaar && t.concept).then_some(Msg::PasToe),
                ));
                editor = editor.push(w::secondary(
                    l,
                    if t.concept {
                        "Tekst is nog niet toegepast"
                    } else if !bewerkbaar {
                        "Alleen lezen"
                    } else {
                        "Selecteer een tekstveld of cel"
                    },
                ));
                editor = editor.push(scrollable(velden).height(Length::Fill));
                let inhoudspaneel = w::panel(l, "Inhoud", 300., vec![], editor.padding(14).into());
                let werkvlak: Element<_> = if t.panelen {
                    row![navigator, midden, inhoudspaneel]
                        .height(Length::Fill)
                        .into()
                } else {
                    midden
                };
                if a.beeld.module == Module::Spreadsheet {
                    let formule = openaec_ui::design::a11y::named(
                        text_input("Waarde of formule", &t.editor.text())
                            .on_input_maybe((!t.bezig).then_some(Msg::Formule))
                            .on_submit(Msg::PasToe)
                            .padding(6)
                            .width(Length::Fill),
                        openaec_ui::design::a11y::Role::TextField,
                        "Formulebalk",
                    );
                    let adres = openaec_ui::design::a11y::named(
                        text_input("Cel of bereik", &t.adres)
                            .on_input(Msg::Adres)
                            .on_submit(Msg::GaNaar)
                            .width(110)
                            .padding(6),
                        openaec_ui::design::a11y::Role::TextField,
                        "Cel of bereik",
                    );
                    let bladen = row(a.beeld.onderdelen.iter().enumerate().map(|(n, naam)| {
                        w::button(
                            l,
                            naam,
                            if n == t.deel { K::Secondary } else { K::Quiet },
                            D::Compact,
                            None,
                            (!t.bezig).then_some(Msg::Deel(n)),
                        )
                    }))
                    .spacing(4)
                    .padding(4);
                    column![
                        container(
                            row![adres, w::mono_label(l, "ƒx"), formule]
                                .align_y(iced::Alignment::Center)
                                .spacing(10)
                        )
                        .padding(5)
                        .style(move |_| w::panel_style(l)),
                        werkvlak,
                        scrollable(bladen)
                            .direction(scrollable::Direction::Horizontal(Default::default()))
                    ]
                    .height(Length::Fill)
                    .into()
                } else {
                    werkvlak
                }
            }
        } else {
            container(w::heading(l, "Document openen…", 22.))
                .center(Length::Fill)
                .into()
        };
        column![
            w::document_tabs(
                l,
                &tabs,
                self.actief,
                icoon(Icon::Close),
                Msg::Selecteer,
                Msg::Sluit,
                Msg::Selecteer
            ),
            werk
        ]
        .height(Length::Fill)
        .into()
    }
}
fn tekstknop<'a>(
    look: Look,
    label: String,
    soort: K,
    dichtheid: D,
    _icoon: Option<&'static str>,
    bericht: Option<Msg>,
) -> Element<'a, Msg> {
    let node =
        openaec_ui::design::a11y::Node::new(openaec_ui::design::a11y::Role::Button, label.clone());
    let knop = iced::widget::button(w::body(look, label))
        .padding(if matches!(dichtheid, D::Compact) {
            6
        } else {
            10
        })
        .width(Length::Fill)
        .style(move |_, status| w::button_style(look, soort, status));
    openaec_ui::design::a11y::node(
        if let Some(m) = bericht {
            knop.on_press(m)
        } else {
            knop
        },
        node,
    )
}
fn doelhash(p: &std::path::Path) -> Result<Option<String>, String> {
    match opslag::lees(p) {
        Ok((_, h)) => Ok(Some(h)),
        Err(office_core::document::Fout::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(None)
        }
        Err(e) => Err(e.to_string()),
    }
}
fn main() -> iced::Result {
    let argumenten: Vec<_> = std::env::args().skip(1).collect();
    if argumenten.first().is_some_and(|a| a == "--version") {
        println!("Open Office Studio {} (native)", office_core::VERSIE);
        return Ok(());
    }
    if argumenten.first().is_some_and(|a| a == "--help") {
        println!(
            "Open Office Studio [bestand]\nOpen Office Studio --module writer|spreadsheet|presentation|notition|email\nOpen Office Studio --version"
        );
        return Ok(());
    }
    let start = if argumenten.first().is_some_and(|a| a == "--module") {
        let module = match argumenten.get(1).map(|s| s.as_str()) {
            Some("writer") => Module::Writer,
            Some("spreadsheet") => Module::Spreadsheet,
            Some("presentation") => Module::Presentation,
            Some("notition") => Module::Notition,
            Some("email") => Module::Email,
            _ => {
                eprintln!("Onbekende module; gebruik --help");
                std::process::exit(2);
            }
        };
        Some(Msg::Nieuw(module))
    } else {
        argumenten.first().map(|a| Msg::Pad(Some(PathBuf::from(a))))
    };
    fonts::install_fallback();
    let init = std::sync::Mutex::new(Some(App::default()));
    let builder = iced::application(
        move || {
            (
                init.lock().unwrap().take().unwrap(),
                start.clone().map(Task::done).unwrap_or_else(Task::none),
            )
        },
        App::update,
        App::view,
    )
    .title("Open Office Studio")
    .subscription(App::subscription)
    .theme(|app: &App| app.thema.iced())
    .default_font(fonts::BODY);
    fonts::FILES
        .iter()
        .fold(builder, |b, f| b.font(*f))
        .font(office_core::lettertypen::kies("Inter", true, false).bytes)
        .font(office_core::lettertypen::kies("Inter", false, true).bytes)
        .font(office_core::lettertypen::kies("Inter", true, true).bytes)
        .window(iced::window::Settings {
            size: Size::new(1440., 900.),
            min_size: Some(Size::new(1024., 650.)),
            decorations: false,
            exit_on_close_request: false,
            ..Default::default()
        })
        .run()
}

#[cfg(test)]
mod tests;
