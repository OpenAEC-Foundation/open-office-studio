//! Zoeken in de volledige Writer-hoofdtekst en tabellen; resultaten openen in de alinea-editor.
use super::*;
use iced::widget::{checkbox, column, row};
use office_core::writer_zoeken::{self as kern, Treffer, Zoekopdracht};
use std::sync::atomic::{AtomicU64, Ordering};
static VOLGEND: AtomicU64 = AtomicU64::new(1);
const INVOER: &str = "writer-zoektekst";
#[derive(Debug, Clone)]
pub enum Bericht {
    Open(bool),
    Sluit,
    Tekst(String),
    Vervangtekst(String),
    Hoofdletters(bool),
    Woorden(bool),
    Vorige,
    Volgende,
    Kies(usize),
    Vervang(bool),
}
#[derive(Debug, Clone)]
pub struct Doel {
    paneel: u64,
    generatie: u64,
    document: u64,
    hash: String,
}
pub struct Zoekpaneel {
    id: u64,
    generatie: u64,
    document: u64,
    hash: String,
    bezig: bool,
    opdracht: Zoekopdracht,
    vervangtekst: String,
    vervangen: bool,
    treffers: Vec<Treffer>,
    gekozen: usize,
    na_vervanging: Option<(String, usize, usize)>,
    fout: String,
}
impl Zoekpaneel {
    fn nieuw(document: u64, hash: String, vervangen: bool, tekst: String) -> Self {
        Self {
            id: VOLGEND.fetch_add(1, Ordering::Relaxed),
            generatie: 0,
            document,
            hash,
            bezig: false,
            opdracht: Zoekopdracht {
                tekst,
                ..Default::default()
            },
            vervangtekst: String::new(),
            vervangen,
            treffers: vec![],
            gekozen: 0,
            na_vervanging: None,
            fout: String::new(),
        }
    }
    pub fn view(&self, app: &App) -> Element<'_, Msg> {
        let l = app.look();
        let knop = |naam: &'static str, bericht, kan: bool| {
            w::button(
                l,
                naam,
                K::Secondary,
                D::Compact,
                None,
                kan.then_some(Msg::Zoeken(bericht)),
            )
        };
        let mut rij = column![
            row![
                w::heading(
                    l,
                    if self.vervangen {
                        "Zoeken en vervangen"
                    } else {
                        "Zoeken"
                    },
                    16.
                )
                .width(Length::Fill),
                w::icon_button(
                    l,
                    icoon(Icon::Close),
                    24.,
                    false,
                    "Zoekpaneel sluiten",
                    Some(Msg::Zoeken(Bericht::Sluit))
                )
            ]
            .spacing(8),
            openaec_ui::design::a11y::named(
                text_input("Zoeken in hoofdtekst en tabellen", &self.opdracht.tekst)
                    .id(INVOER)
                    .on_input(|s| Msg::Zoeken(Bericht::Tekst(s)))
                    .on_submit(Msg::Zoeken(Bericht::Volgende))
                    .padding(8)
                    .size(13),
                openaec_ui::design::a11y::Role::TextField,
                "Zoektekst"
            ),
            row![
                knop("Vorige", Bericht::Vorige, !self.treffers.is_empty()),
                knop("Volgende", Bericht::Volgende, !self.treffers.is_empty()),
                knop(
                    if self.vervangen {
                        "Alleen zoeken"
                    } else {
                        "Vervangen"
                    },
                    Bericht::Open(!self.vervangen),
                    true
                )
            ]
            .spacing(6),
            checkbox(self.opdracht.hoofdlettergevoelig)
                .label("Hoofdlettergevoelig")
                .on_toggle(|v| Msg::Zoeken(Bericht::Hoofdletters(v))),
            checkbox(self.opdracht.hele_woorden)
                .label("Alleen hele woorden")
                .on_toggle(|v| Msg::Zoeken(Bericht::Woorden(v))),
        ]
        .spacing(10);
        if self.vervangen {
            let kan = app.tab().is_some_and(|t| {
                !t.bezig
                    && !t.schrijft
                    && !t.concept
                    && t.antwoord
                        .as_ref()
                        .is_some_and(|a| a.hash == self.hash && t.id == self.document)
            }) && !self.bezig
                && !self.treffers.is_empty()
                && self.fout.is_empty();
            let bewerkbaar = |treffer: &Treffer| {
                app.tab()
                    .and_then(|t| t.antwoord.as_ref())
                    .and_then(|a| a.beeld.velden.get(treffer.veld))
                    .is_some_and(|v| v.bewerkbaar)
            };
            let een = kan && self.treffers.get(self.gekozen).is_some_and(bewerkbaar);
            let alles = kan && self.treffers.iter().all(bewerkbaar);
            rij = rij
                .push(openaec_ui::design::a11y::named(
                    text_input("Vervangen door", &self.vervangtekst)
                        .on_input(|s| Msg::Zoeken(Bericht::Vervangtekst(s)))
                        .on_submit(Msg::Zoeken(Bericht::Vervang(false)))
                        .padding(8)
                        .size(13),
                    openaec_ui::design::a11y::Role::TextField,
                    "Vervangen door",
                ))
                .push(
                    row![
                        knop("Vervangen", Bericht::Vervang(false), een),
                        knop("Alles vervangen", Bericht::Vervang(true), alles)
                    ]
                    .spacing(8),
                );
        }
        let status = if !self.fout.is_empty() {
            self.fout.clone()
        } else if self.bezig {
            "Zoeken…".into()
        } else if self.opdracht.tekst.is_empty() {
            "Typ een zoektekst".into()
        } else if self.treffers.is_empty() {
            "Geen resultaten".into()
        } else {
            format!(
                "{} van {} resultaten",
                self.gekozen + 1,
                self.treffers.len()
            )
        };
        rij=rij.push(w::body(l,status)).push(w::secondary(l,"Zoekt in hoofdtekst en tabellen. Klik op een resultaat om de tekst rechts te bewerken. Koppen en noten worden niet doorzocht."));
        let mut lijst = column![].spacing(4);
        let begin = self.gekozen.saturating_sub(25);
        for (i, t) in self.treffers.iter().enumerate().skip(begin).take(75) {
            let geselecteerd = i == self.gekozen;
            lijst = lijst.push(tekstknop(
                l,
                format!("{} · {}", i + 1, t.context.replace('\n', " ↵ ")),
                if geselecteerd { K::Secondary } else { K::Quiet },
                D::Compact,
                None,
                Some(Msg::Zoeken(Bericht::Kies(i))),
            ));
        }
        if self.treffers.len() > 75 {
            rij = rij.push(w::secondary(
                l,
                format!(
                    "Lijst {}–{} van {}; Vorige/Volgende doorloopt alle resultaten",
                    begin + 1,
                    (begin + 75).min(self.treffers.len()),
                    self.treffers.len()
                ),
            ));
        }
        rij = rij.push(scrollable(lijst).height(Length::Fill));
        openaec_ui::design::a11y::named(
            container(rij.padding(14))
                .width(340)
                .height((app.venster_grootte.height - 214.).max(200.))
                .style(move |_| w::panel_style(l)),
            openaec_ui::design::a11y::Role::Group,
            "Zoeken en vervangen",
        )
    }
}
fn tab_gereed(app: &App) -> Option<&Tab> {
    app.tab().filter(|t| {
        !app.postvak_zichtbaar
            && !app.bestand
            && !app.instellingen
            && app.exportblad.is_none()
            && app.sluiten.is_none()
            && !t.bezig
            && !t.schrijft
            && !t.concept
            && t.antwoord
                .as_ref()
                .is_some_and(|a| a.beeld.module == Module::Writer)
    })
}

/// Tekstvelden vangen Escape zelf af om focus te verliezen. Een zichtbaar
/// zoekpaneel sluit ook na die afgehandelde toets, zonder een tweede Escape.
pub fn afgevangen_escape(
    event: iced::Event,
    status: iced::event::Status,
    _: iced::window::Id,
) -> Option<Msg> {
    matches!(
        (event, status),
        (
            iced::Event::Keyboard(iced::keyboard::Event::KeyPressed {
                key: iced::keyboard::Key::Named(iced::keyboard::key::Named::Escape),
                ..
            }),
            iced::event::Status::Captured
        )
    )
    .then_some(Msg::Zoeken(Bericht::Sluit))
}
fn vraag(app: &mut App) -> Task<Msg> {
    let Some(t) = tab_gereed(app) else {
        return Task::none();
    };
    let a = t.antwoord.as_ref().unwrap();
    let id = t.id;
    let hash = a.hash.clone();
    let Some(z) = app.zoeken.as_ref() else {
        return Task::none();
    };
    if z.bezig {
        return Task::none();
    }
    // Maak geen onbegrensde kopie op de vensterdraad.
    if a.beeld
        .velden
        .iter()
        .try_fold(0usize, |n, v| n.checked_add(v.tekst.len()))
        .is_none_or(|n| n > 16 * 1024 * 1024)
    {
        let z = app.zoeken.as_mut().unwrap();
        z.fout = "Hoofdtekst overschrijdt de zoeklimiet".into();
        return Task::none();
    }
    if z.opdracht.tekst.is_empty() {
        let z = app.zoeken.as_mut().unwrap();
        z.treffers.clear();
        z.fout.clear();
        z.hash = hash;
        z.document = id;
        return Task::none();
    }
    let velden = a.beeld.velden.clone();
    let z = app.zoeken.as_mut().unwrap();
    z.document = id;
    z.hash = hash.clone();
    z.bezig = true;
    let doel = Doel {
        paneel: z.id,
        generatie: z.generatie,
        document: id,
        hash,
    };
    let opdracht = z.opdracht.clone();
    Task::perform(
        werker::achtergrond(move || kern::zoek(&velden, &opdracht).map_err(|e| e.to_string())),
        move |r| Msg::ZoekGereed(doel.clone(), r.and_then(|r| r)),
    )
}
pub fn gereed(app: &mut App, doel: Doel, resultaat: Result<Vec<Treffer>, String>) -> Task<Msg> {
    let huidig = app
        .tab()
        .and_then(|t| t.antwoord.as_ref().map(|a| (t.id, a.hash.clone())));
    let Some(z) = app.zoeken.as_mut().filter(|z| z.id == doel.paneel) else {
        return Task::none();
    };
    z.bezig = false;
    if z.generatie != doel.generatie || huidig != Some((doel.document, doel.hash)) {
        return vraag(app);
    }
    match resultaat {
        Ok(t) => {
            z.gekozen = z
                .na_vervanging
                .take()
                .filter(|(hash, _, _)| hash != &z.hash)
                .and_then(|(_, veld, na)| {
                    t.iter()
                        .position(|t| t.veld > veld || (t.veld == veld && t.begin >= na))
                })
                .unwrap_or(0);
            z.treffers = t;
            z.fout.clear();
        }
        Err(e) => {
            z.fout = e;
            z.treffers.clear();
        }
    }
    let keuze = app.zoeken.as_ref().map(|z| z.gekozen).unwrap_or(0);
    kies(app, keuze, false)
}
/// Na bewaren/bewerken/undo of een tabwissel mag geen oude zoekselectie blijven gelden.
pub fn bij_document(app: &mut App) -> Task<Msg> {
    if app.zoeken.is_none() {
        return Task::none();
    }
    let Some(t) = app.tab() else {
        app.zoeken = None;
        return Task::none();
    };
    let Some(a) = t.antwoord.as_ref() else {
        return Task::none();
    };
    if a.beeld.module != Module::Writer {
        app.zoeken = None;
        return Task::none();
    }
    let z = app.zoeken.as_ref().unwrap();
    if z.document == t.id && z.hash == a.hash {
        return Task::none();
    }
    let z = app.zoeken.as_mut().unwrap();
    z.generatie = z.generatie.wrapping_add(1);
    z.treffers.clear();
    z.gekozen = 0;
    vraag(app)
}
pub fn update(app: &mut App, m: Bericht) -> Task<Msg> {
    match m {
        Bericht::Sluit => {
            app.zoeken = None;
            return Task::none();
        }
        Bericht::Open(vervangen) => {
            let Some(t) = tab_gereed(app) else {
                return app.waarschuwing("Zoeken is beschikbaar in een geopend Writer-document; pas huidige invoer eerst toe");
            };
            let a = t.antwoord.as_ref().unwrap();
            let tekst = t
                .editor
                .selection()
                .filter(|s| s.len() <= 4096)
                .unwrap_or_default();
            let (id, hash) = (t.id, a.hash.clone());
            if let Some(z) = app.zoeken.as_mut() {
                z.vervangen = vervangen;
            } else {
                app.zoeken = Some(Zoekpaneel::nieuw(id, hash, vervangen, tekst));
            }
            return Task::batch([vraag(app), iced::widget::operation::focus(INVOER)]);
        }
        Bericht::Vervang(alles) => {
            let Some(t) = tab_gereed(app) else {
                return app
                    .waarschuwing("Pas de huidige invoer toe en wacht tot het document gereed is");
            };
            let a = t.antwoord.as_ref().unwrap();
            let Some(z) = app.zoeken.as_ref() else {
                return Task::none();
            };
            if z.bezig || z.document != t.id || z.hash != a.hash || !z.fout.is_empty() {
                return app.waarschuwing("Zoek opnieuw in de huidige documentversie");
            }
            let treffers = if alles {
                z.treffers.as_slice()
            } else {
                z.treffers
                    .get(z.gekozen)
                    .map(std::slice::from_ref)
                    .unwrap_or_default()
            };
            let plan = match kern::vervangplan(&a.beeld.velden, treffers, &z.vervangtekst) {
                Ok(p) => p,
                Err(e) => return app.waarschuwing(&e.to_string()),
            };
            let (id, deel) = (t.id, t.deel);
            let na = (!alles)
                .then(|| z.treffers.get(z.gekozen))
                .flatten()
                .map(|v| {
                    (
                        a.hash.clone(),
                        v.veld,
                        v.begin + z.vervangtekst.chars().count(),
                    )
                });
            app.zoeken.as_mut().unwrap().na_vervanging = na;
            return app.opdracht(id, Opdracht::Bewerk(deel, Bewerking::TekstReeksen(plan)));
        }
        Bericht::Kies(n) => return kies(app, n, true),
        Bericht::Vorige | Bericht::Volgende => {
            let Some(z) = app.zoeken.as_ref().filter(|z| !z.treffers.is_empty()) else {
                return Task::none();
            };
            let n = if matches!(m, Bericht::Vorige) {
                (z.gekozen + z.treffers.len() - 1) % z.treffers.len()
            } else {
                (z.gekozen + 1) % z.treffers.len()
            };
            return Task::batch([kies(app, n, false), iced::widget::operation::focus(INVOER)]);
        }
        Bericht::Vervangtekst(s) => {
            if let Some(z) = app.zoeken.as_mut() {
                z.vervangtekst = s;
            }
            return Task::none();
        }
        _ => {}
    }
    let Some(z) = app.zoeken.as_mut() else {
        return Task::none();
    };
    match m {
        Bericht::Tekst(s) => z.opdracht.tekst = s,
        Bericht::Hoofdletters(v) => z.opdracht.hoofdlettergevoelig = v,
        Bericht::Woorden(v) => z.opdracht.hele_woorden = v,
        _ => unreachable!(),
    }
    z.generatie = z.generatie.wrapping_add(1);
    z.na_vervanging = None;
    z.treffers.clear();
    z.fout.clear();
    z.gekozen = 0;
    vraag(app)
}
fn positie(tekst: &str, n: usize) -> iced::advanced::text::editor::Position {
    let mut line = 0;
    let mut column = 0;
    for c in tekst.chars().take(n) {
        if c == '\n' {
            line += 1;
            column = 0
        } else {
            column += c.len_utf8()
        }
    }
    iced::advanced::text::editor::Position { line, column }
}
fn kies(app: &mut App, n: usize, focus: bool) -> Task<Msg> {
    let Some(t) = tab_gereed(app) else {
        return app.waarschuwing("Pas de huidige invoer eerst toe");
    };
    let a = t.antwoord.as_ref().unwrap();
    let Some(z) = app.zoeken.as_ref() else {
        return Task::none();
    };
    if z.document != t.id || z.hash != a.hash || z.bezig {
        return Task::none();
    }
    let Some(v) = z.treffers.get(n).cloned() else {
        return Task::none();
    };
    let z = app.zoeken.as_mut().unwrap();
    z.gekozen = n;
    let t = app.tab_mut().unwrap();
    t.toon_veld(v.veld);
    t.panelen = true;
    let tekst = t.editor.text();
    t.editor.move_to(iced::advanced::text::editor::Cursor {
        position: positie(&tekst, v.einde),
        selection: Some(positie(&tekst, v.begin)),
    });
    t.werk_opmaak_bij();
    if focus {
        iced::widget::operation::focus("document-tekst-editor")
    } else {
        Task::none()
    }
}

#[cfg(test)]
mod proeven {
    use super::*;
    fn app() -> App {
        crate::tests::app_met_document(
            Module::Writer,
            include_bytes!("../../office-core/tests/fixtures/writer-structuur.docx"),
        )
    }
    fn doel(a: &App) -> Doel {
        let z = a.zoeken.as_ref().unwrap();
        Doel {
            paneel: z.id,
            generatie: z.generatie,
            document: z.document,
            hash: z.hash.clone(),
        }
    }
    #[test]
    fn late_zoekresultaten_mogen_geen_nieuwe_query_of_nieuw_paneel_overschrijven() {
        let mut a = app();
        let _ = update(&mut a, Bericht::Open(false));
        let _ = update(&mut a, Bericht::Tekst("café".into()));
        let oud = doel(&a);
        let velden = &a.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden;
        let t = kern::zoek(
            velden,
            &Zoekopdracht {
                tekst: "café".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(t.len(), 1);
        let _ = update(&mut a, Bericht::Tekst("Cel".into()));
        let _ = gereed(&mut a, oud.clone(), Ok(t.clone()));
        assert!(a.zoeken.as_ref().unwrap().treffers.is_empty());
        assert!(a.zoeken.as_ref().unwrap().bezig);
        let nieuw = doel(&a);
        let _ = update(&mut a, Bericht::Sluit);
        let _ = update(&mut a, Bericht::Open(false));
        let id = a.zoeken.as_ref().unwrap().id;
        let _ = gereed(&mut a, nieuw, Ok(t.clone()));
        assert_eq!(a.zoeken.as_ref().unwrap().id, id);
        assert!(a.zoeken.as_ref().unwrap().treffers.is_empty());
        let _ = gereed(&mut a, oud, Ok(t));
        assert!(a.zoeken.as_ref().unwrap().treffers.is_empty());
    }
    #[test]
    fn verouderde_bron_en_onverwerkte_invoer_blokkeren_vervangen() {
        let mut a = app();
        let _ = update(&mut a, Bericht::Open(true));
        let _ = update(&mut a, Bericht::Tekst("café".into()));
        let d = doel(&a);
        let t = kern::zoek(
            &a.tab().unwrap().antwoord.as_ref().unwrap().beeld.velden,
            &a.zoeken.as_ref().unwrap().opdracht,
        )
        .unwrap();
        let _ = gereed(&mut a, d, Ok(t));
        assert_eq!(a.zoeken.as_ref().unwrap().treffers.len(), 1);
        let bron = a.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
        a.tab_mut().unwrap().concept = true;
        let _ = update(&mut a, Bericht::Vervang(true));
        assert_eq!(*a.tab().unwrap().antwoord.as_ref().unwrap().bron, *bron);
        a.tab_mut().unwrap().concept = false;
        a.zoeken.as_mut().unwrap().hash = "verouderde bron".into();
        let _ = update(&mut a, Bericht::Vervang(false));
        assert!(!a.tab().unwrap().bezig);
        assert!(a.melding.contains("Zoek opnieuw"));
    }
}
