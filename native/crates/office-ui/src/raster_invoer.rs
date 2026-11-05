//! Eén volgorde voor toetsen, klembord, bronbewerkingen en bewaarsnapshots.
use super::*;
use raster_ui::Bericht as B;
use std::sync::atomic::{AtomicU64, Ordering};
static VOLGEND: AtomicU64 = AtomicU64::new(1);
const MAX_OPDRACHTEN: usize = 256;
const MAX_BYTES: usize = 4 * 1024 * 1024;

pub(super) struct Wachtend {
    bericht: B,
    bron: Option<String>,
    bytes: usize,
}
pub(super) enum KlembordVlucht {
    Lezen {
        nummer: u64,
        doel: PlakDoel,
        antwoord: Option<Option<String>>,
    },
    Kopieren {
        nummer: u64,
        doel: RasterDoel,
        antwoord: Option<Result<String, String>>,
    },
    Schrijven(u64),
}
pub(super) enum PlakDoel {
    Editor(klembord::Doel),
    Raster(RasterDoel),
}
#[derive(PartialEq, Eq)]
pub(super) struct RasterDoel {
    document: u64,
    deel: usize,
    bron: String,
    adres: String,
    editerversie: u64,
}
impl RasterDoel {
    fn van(t: &Tab) -> Self {
        Self {
            document: t.id,
            deel: t.deel,
            bron: t.antwoord.as_ref().unwrap().hash.clone(),
            adres: t.adres.clone(),
            editerversie: t.editerversie,
        }
    }
}
impl raster_ui::Staat {
    pub fn heeft_werk(&self) -> bool {
        self.klembord.is_some() || !self.wachtend.is_empty()
    }
    pub fn heeft_invoer(&self) -> bool {
        matches!(self.klembord, Some(KlembordVlucht::Lezen { .. }))
            || self.wachtend.iter().any(|w| {
                matches!(
                    &w.bericht,
                    B::Typ(_)
                        | B::Begin {
                            vervang: Some(_),
                            ..
                        }
                        | B::Terug
                        | B::Vooruit
                        | B::Opmaak(_)
                        | B::Structuur(_)
                        | B::OpmaakToets(_)
                        | B::Wis
                        | B::Klembord(klembord::Actie::Knip | klembord::Actie::Plak)
                ) || matches!(&w.bericht,B::Toets(k) if raster_toetsen::wijzigt_invoer(k))
                    || matches!(&w.bericht, B::Invoer(a) | B::ZijInvoer(a) if a.is_edit())
            })
    }
}
pub fn neemt_over(app: &App) -> bool {
    app.tab().is_some_and(|t| {
        !t.raster.delegeert
            && (t.raster.focus || t.raster.heeft_werk())
            && t.antwoord
                .as_ref()
                .is_some_and(|a| a.beeld.module == Module::Spreadsheet)
    })
}
fn wachtend(t: &Tab, bericht: B) -> Wachtend {
    // Een muisdoel hoort bij de bron waarop het werd aangewezen. Relatieve
    // toetsen worden juist pas tegen de dan actuele cel uitgevoerd.
    let absoluut = matches!(bericht, B::Kies(_) | B::BreidUit(_) | B::Begin { .. });
    let bytes = match &bericht {
        B::Toets(k) => k.text.as_ref().map_or(0, |s| s.len()),
        B::Typ(s)
        | B::Begin {
            vervang: Some(s), ..
        } => s.len(),
        B::Invoer(text_editor::Action::Edit(text_editor::Edit::Paste(s)))
        | B::ZijInvoer(text_editor::Action::Edit(text_editor::Edit::Paste(s))) => s.len(),
        _ => 0,
    };
    Wachtend {
        bericht,
        bron: absoluut.then(|| t.antwoord.as_ref().unwrap().hash.clone()),
        bytes,
    }
}
pub fn update(app: &mut App, bericht: B) -> Task<Msg> {
    if matches!(bericht, B::Focus { .. } | B::EditorFocus { .. }) {
        return raster_ui::voer_uit(app, bericht);
    }
    if !raster_ui::toegankelijk(app) {
        return Task::none();
    }
    let t = app.tab_mut().unwrap();
    if matches!(bericht, B::HerstelKopie) {
        return t
            .raster
            .plaktekst
            .clone()
            .map(iced::clipboard::write)
            .unwrap_or_else(Task::none);
    }
    if matches!(bericht, B::MeldingGelezen) {
        t.raster.afgewezen = 0;
        return Task::none();
    }
    if t.raster.fout && matches!(bericht, B::Terug) {
        let aantal = t.raster.wachtend.len();
        t.raster.wachtend.clear();
        t.raster.klembord = None;
        t.raster.fout = false;
        t.raster.plaktekst = None;
        t.raster.plakbereik = None;
        t.raster.afgewezen = 0;
        t.raster.na_bewerking = None;
        t.raster.na_richting = None;
        let n = t.gekozen;
        t.toon_veld(n);
        t.raster.focus = true;
        return app.waarschuwing(&format!(
            "Niet toegepaste invoer en {aantal} wachtende opdrachten op jouw verzoek verworpen"
        ));
    }
    let w = wachtend(t, bericht);
    if matches!(w.bericht, B::BreidUit(_))
        && t.raster
            .wachtend
            .back()
            .is_some_and(|vorig| matches!(vorig.bericht, B::BreidUit(_)) && vorig.bron == w.bron)
    {
        t.raster.wachtend.pop_back();
    }
    if t.raster.wachtend.len() >= MAX_OPDRACHTEN
        || t.raster
            .wachtend
            .iter()
            .map(|w| w.bytes)
            .sum::<usize>()
            .saturating_add(w.bytes)
            > MAX_BYTES
    {
        t.raster.afgewezen = t.raster.afgewezen.saturating_add(1);
        return app.waarschuwing("De invoerwachtrij is vol; deze opdracht is niet aangenomen. Wacht tot het werkblad gereed is");
    }
    t.raster.wachtend.push_back(w);
    vervolg(app)
}
pub fn na_bevestiging(app: &mut App, id: u64, richting: office_core::rekenblad::Richting) {
    if let Some(t) = app.tabs.iter_mut().find(|t| t.id == id) {
        let w = wachtend(t, B::Verplaats(richting));
        // De bevestiging en haar vervolgstap vormen samen één gebruikersactie.
        t.raster.wachtend.push_front(w);
    }
}
pub fn mislukking(t: &mut Tab) {
    // Een gewone ongeldige inline-formule blijft een herstelbaar concept.
    // Alleen vervolgopdrachten of een ontvangen plakblok vragen een expliciete
    // pauze; anders moeten corrigeren en Escape bereikbaar blijven.
    if t.raster.heeft_werk() || t.raster.plaktekst.is_some() {
        t.raster.fout = true;
        t.raster.na_bewerking = None;
        t.raster.na_richting = None;
    }
}
pub fn vervolg(app: &mut App) -> Task<Msg> {
    if !raster_ui::toegankelijk(app) {
        return Task::none();
    }
    let Some(t) = app.tab() else {
        return Task::none();
    };
    if t.raster.delegeert || t.bezig || t.schrijft || t.raster.fout {
        return Task::none();
    }
    if let Some(KlembordVlucht::Lezen {
        antwoord: Some(_), ..
    }) = &t.raster.klembord
    {
        return voltooi_plakken(app);
    }
    if matches!(
        t.raster.klembord,
        Some(KlembordVlucht::Kopieren {
            antwoord: Some(_),
            ..
        })
    ) {
        return voltooi_kopieren(app);
    }
    if t.raster.klembord.is_some() {
        return Task::none();
    }
    let mut taken = Vec::new();
    while raster_ui::beschikbaar(app) {
        let Some(w) = app.tab_mut().unwrap().raster.wachtend.pop_front() else {
            break;
        };
        if w.bron.as_ref().is_some_and(|hash| {
            app.tab()
                .unwrap()
                .antwoord
                .as_ref()
                .is_none_or(|a| &a.hash != hash)
        }) {
            app.melding="Het werkblad is gewijzigd; het oude muisdoel is niet uitgevoerd. Klik opnieuw op de gewenste cel".into();
            continue;
        }
        app.tab_mut().unwrap().raster.delegeert = true;
        let taak = voer_uit(app, w.bericht);
        app.tab_mut().unwrap().raster.delegeert = false;
        taken.push(taak);
    }
    Task::batch(taken)
}
pub(super) fn voer_uit(app: &mut App, bericht: B) -> Task<Msg> {
    match bericht {
        B::Toets(k) => raster_toetsen::voer_uit(app, k),
        B::MuisInvoer {
            document,
            cel,
            editerversie,
            tekstversie,
            actie,
        } => {
            if app.tab().is_some_and(|t| {
                t.id == document
                    && t.editerversie == editerversie
                    && t.raster.tekstversie == tekstversie
                    && t.raster.bewerken
                    && t.veld().is_some_and(|v| v.id == cel)
            }) {
                raster_ui::voer_uit(app, B::Invoer(actie))
            } else {
                Task::none()
            }
        }

        B::ZijInvoer(a) => app.update(Msg::Invoer(a)),
        B::PasToe => app.update(Msg::PasToe),
        B::Invoer(a) if !app.tab().unwrap().raster.bewerken => {
            use text_editor::{Action as A, Edit as E, Motion as M};
            match a {
                A::Edit(E::Insert(c)) => voer_uit(app, B::Typ(c.to_string())),
                A::Edit(E::Paste(s)) => voer_uit(app, B::Typ(s.as_ref().clone())),
                A::Edit(E::Enter) => voer_uit(app, B::Typ("\n".into())),
                A::Edit(E::Delete) => voer_uit(app, B::Wis),
                A::Edit(E::Backspace) => voer_uit(app, B::Typ(String::new())),
                A::Move(m) | A::Select(m) => {
                    let richting = match m {
                        M::Left => office_core::rekenblad::Richting::Links,
                        M::Right => office_core::rekenblad::Richting::Rechts,
                        M::Up => office_core::rekenblad::Richting::Boven,
                        M::Down => office_core::rekenblad::Richting::Onder,
                        _ => return Task::none(),
                    };
                    voer_uit(
                        app,
                        B::Pijl {
                            richting,
                            selecteer: matches!(a, A::Select(_)),
                        },
                    )
                }
                _ => Task::none(),
            }
        }
        B::Klembord(actie) => klembord(app, actie),
        B::Opslaan(als) => {
            let t = app.tab_mut().unwrap();
            let id = t.id;
            if t.concept {
                let w = wachtend(t, B::Opslaan(als));
                t.raster.wachtend.push_front(w);
                app.update(Msg::PasToe)
            } else {
                app.update(Msg::Opslaan(id, als))
            }
        }
        B::Terug => app.update(Msg::Terug),
        B::Vooruit => app.update(Msg::Vooruit),
        B::Structuur(actie) => {
            let t = app.tab_mut().unwrap();
            if t.concept {
                let w = wachtend(t, B::Structuur(actie));
                t.raster.wachtend.push_front(w);
                app.update(Msg::PasToe)
            } else {
                app.update(Msg::Structuur(actie))
            }
        }
        B::OpmaakToets(c) => {
            let Some(s) = app.tab().unwrap().opmaak_van_selectie() else {
                return Task::none();
            };
            match c {
                'b' => voer_uit(app, B::Opmaak(Opmaak::Vet(!s.vet))),
                'i' => voer_uit(app, B::Opmaak(Opmaak::Cursief(!s.cursief))),
                _ => Task::none(),
            }
        }
        B::Opmaak(o) => {
            let t = app.tab_mut().unwrap();
            if t.concept {
                app.waarschuwing(
                    "Bevestig de celinvoer voordat je de hele cel opmaakt; de invoer is behouden",
                )
            } else {
                app.update(Msg::Opmaak(o))
            }
        }
        B::Wis => {
            if app.tab().unwrap().raster.bewerken {
                app.update(Msg::Invoer(text_editor::Action::Edit(
                    text_editor::Edit::Delete,
                )))
            } else {
                plakbereik(app, "")
            }
        }
        anders => raster_ui::voer_uit(app, anders),
    }
}
fn klembord(app: &mut App, actie: klembord::Actie) -> Task<Msg> {
    if !klembord::kan(app, actie) {
        return Task::none();
    }
    if matches!(actie, klembord::Actie::Plak) {
        let t = app.tab_mut().unwrap();
        let doel = if !t.raster.bewerken && !t.concept {
            PlakDoel::Raster(RasterDoel::van(t))
        } else {
            let Some(d) = klembord::Doel::van_tab(t) else {
                return Task::none();
            };
            PlakDoel::Editor(d)
        };
        let document = t.id;
        let nummer = VOLGEND.fetch_add(1, Ordering::Relaxed);
        t.raster.klembord = Some(KlembordVlucht::Lezen {
            nummer,
            doel,
            antwoord: None,
        });
        return iced::clipboard::read().map(move |tekst| Msg::RasterPlak {
            document,
            nummer,
            tekst,
        });
    }
    if !app.tab().unwrap().raster.bewerken && !app.tab().unwrap().concept {
        let t = app.tab_mut().unwrap();
        let document = t.id;
        let deel = t.deel;
        let adres = t.adres.clone();
        let nummer = VOLGEND.fetch_add(1, Ordering::Relaxed);
        t.raster.klembord = Some(KlembordVlucht::Kopieren {
            nummer,
            doel: RasterDoel::van(t),
            antwoord: None,
        });
        return Task::perform(
            app.werker.clone().celtekst(document, deel, adres),
            move |resultaat| Msg::RasterKopie {
                document,
                nummer,
                resultaat,
            },
        );
    }
    let Some(tekst) = app
        .tab()
        .unwrap()
        .editor
        .selection()
        .filter(|s| !s.is_empty())
    else {
        return Task::none();
    };
    let wijzig = if matches!(actie, klembord::Actie::Knip) {
        app.update(Msg::Invoer(text_editor::Action::Edit(
            text_editor::Edit::Delete,
        )))
    } else {
        Task::none()
    };
    let t = app.tab_mut().unwrap();
    let document = t.id;
    let nummer = VOLGEND.fetch_add(1, Ordering::Relaxed);
    t.raster.klembord = Some(KlembordVlucht::Schrijven(nummer));
    Task::batch([
        wijzig,
        iced::clipboard::write(tekst).chain(Task::done(Msg::RasterKlembordGeschreven {
            document,
            nummer,
        })),
    ])
}
pub fn geplakt(app: &mut App, document: u64, nummer: u64, tekst: Option<String>) -> Task<Msg> {
    let Some(t) = app.tabs.iter_mut().find(|t| t.id == document) else {
        return Task::none();
    };
    let Some(KlembordVlucht::Lezen {
        nummer: n,
        antwoord,
        ..
    }) = &mut t.raster.klembord
    else {
        return Task::none();
    };
    if *n != nummer || antwoord.is_some() {
        return Task::none();
    }
    *antwoord = Some(tekst);
    if app.tab().is_some_and(|t| t.id == document) {
        vervolg(app)
    } else {
        Task::none()
    }
}
fn voltooi_plakken(app: &mut App) -> Task<Msg> {
    let t = app.tab_mut().unwrap();
    let Some(KlembordVlucht::Lezen {
        doel,
        antwoord: Some(tekst),
        ..
    }) = t.raster.klembord.take()
    else {
        unreachable!();
    };
    let gelijk = match &doel {
        PlakDoel::Editor(d) => klembord::Doel::van_tab(t).as_ref() == Some(d),
        PlakDoel::Raster(d) => RasterDoel::van(t) == *d,
    };
    if !gelijk {
        t.raster.fout = true;
        return app.waarschuwing("De editor of selectie is gewijzigd; plakken is niet toegepast. Wachtende invoer blijft bewaard; Ctrl+Z verwerpt haar");
    }
    let taak = if let Some(s) = tekst.filter(|s| !s.is_empty()) {
        if matches!(doel, PlakDoel::Raster(_)) {
            return plakbereik(app, &s);
        }
        app.tab_mut().unwrap().raster.delegeert = true;
        let taak = app.update(Msg::Invoer(text_editor::Action::Edit(
            text_editor::Edit::Paste(std::sync::Arc::new(s)),
        )));
        app.tab_mut().unwrap().raster.delegeert = false;
        taak
    } else {
        Task::none()
    };
    Task::batch([taak, vervolg(app)])
}
fn plakbereik(app: &mut App, tekst: &str) -> Task<Msg> {
    let t = app.tab_mut().unwrap();
    let adres = t.adres.clone();
    if tekst.len() <= MAX_BYTES {
        t.raster.plaktekst = Some(tekst.to_string());
    }
    if !t.veld().is_some_and(|v| v.bewerkbaar) {
        return app.waarschuwing("Dit werkblad is alleen-lezen");
    }
    let voorbereiding = (|| -> Result<_, String> {
        let tekst = office_core::celtekst::CelTekst::lees(tekst)?;
        let r = office_core::rekenblad_klembord::doel(&adres, &tekst).map_err(|e| e.to_string())?;
        let selectie = office_core::rekenblad::CelSelectie {
            anker: r.start.to_a1(),
            doel: r.start.to_a1(),
            adres: if r.start == r.end {
                r.start.to_a1()
            } else {
                format!("{}:{}", r.start.to_a1(), r.end.to_a1())
            },
        };
        Ok((tekst, selectie))
    })();
    let (tekst, selectie) = match voorbereiding {
        Ok(x) => x,
        Err(e) => {
            t.raster.fout = true;
            return app.waarschuwing(&format!(
                "Niet geplakt: {e}. Wachtende opdrachten blijven bewaard; Ctrl+Z verwerpt haar"
            ));
        }
    };
    let id = t.id;
    let deel = t.deel;
    t.raster.plakbereik = Some(selectie);
    app.opdracht(
        id,
        Opdracht::Bewerk(deel, Bewerking::CelTekst { adres, tekst }),
    )
}
pub fn gekopieerd(
    app: &mut App,
    document: u64,
    nummer: u64,
    resultaat: Result<String, String>,
) -> Task<Msg> {
    let Some(t) = app.tabs.iter_mut().find(|t| t.id == document) else {
        return Task::none();
    };
    let Some(KlembordVlucht::Kopieren {
        nummer: n,
        antwoord,
        ..
    }) = &mut t.raster.klembord
    else {
        return Task::none();
    };
    if *n != nummer || antwoord.is_some() {
        return Task::none();
    }
    *antwoord = Some(resultaat);
    if app.tab().is_some_and(|t| t.id == document) {
        vervolg(app)
    } else {
        Task::none()
    }
}
fn voltooi_kopieren(app: &mut App) -> Task<Msg> {
    let t = app.tab_mut().unwrap();
    let Some(KlembordVlucht::Kopieren {
        nummer,
        doel,
        antwoord: Some(r),
    }) = t.raster.klembord.take()
    else {
        unreachable!();
    };
    if RasterDoel::van(t) != doel {
        t.raster.fout = true;
        return app.waarschuwing("Het kopieerbereik is gewijzigd; het klembord blijft behouden. Ctrl+Z verwerpt de wachtende opdrachten");
    }
    match r {
        Ok(tekst) => {
            let document = t.id;
            t.raster.klembord = Some(KlembordVlucht::Schrijven(nummer));
            iced::clipboard::write(tekst).chain(Task::done(Msg::RasterKlembordGeschreven {
                document,
                nummer,
            }))
        }
        Err(e) => {
            t.raster.fout = true;
            app.waarschuwing(&format!(
                "Niet gekopieerd: {e}. Ctrl+Z verwerpt de wachtende opdrachten"
            ))
        }
    }
}
pub fn geschreven(app: &mut App, document: u64, nummer: u64) -> Task<Msg> {
    let Some(t) = app.tabs.iter_mut().find(|t| t.id == document) else {
        return Task::none();
    };
    if !matches!(t.raster.klembord,Some(KlembordVlucht::Schrijven(n)) if n==nummer) {
        return Task::none();
    }
    t.raster.klembord = None;
    if app.tab().is_some_and(|t| t.id == document) {
        vervolg(app)
    } else {
        Task::none()
    }
}
