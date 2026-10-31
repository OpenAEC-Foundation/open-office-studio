//! Tekstklembord voor de actieve editor, met controle van vertraagde leesantwoorden.
use super::*;
#[derive(Debug, Clone, Copy)]
pub enum Actie {
    Kopieer,
    Knip,
    Plak,
}
#[derive(Debug, Clone, PartialEq)]
pub struct Doel {
    document: u64,
    editerversie: u64,
    deel: usize,
    veld: String,
    bron_hash: String,
    editor_hash: String,
    cursor: iced::advanced::text::editor::Cursor,
}
impl Doel {
    fn van_tab(t: &Tab) -> Option<Self> {
        Some(Self {
            document: t.id,
            editerversie: t.editerversie,
            deel: t.deel,
            veld: t.veld()?.id.clone(),
            bron_hash: t.antwoord.as_ref()?.hash.clone(),
            editor_hash: opslag::hash(t.editor.text().as_bytes()),
            cursor: t.editor.cursor(),
        })
    }
}
pub fn kan(app: &App, actie: Actie) -> bool {
    if app.postvak_zichtbaar
        || app.postvak.sluitvraag
        || app.bestand
        || app.instellingen
        || app.sluiten.is_some()
        || app.exportblad.is_some()
    {
        return false;
    }
    let Some(t) = app.tab() else {
        return false;
    };
    let Some(v) = t.veld() else {
        return false;
    };
    if t.bezig || t.schrijft {
        return false;
    }
    match actie {
        Actie::Kopieer => t.editor.selection().is_some_and(|s| !s.is_empty()),
        Actie::Knip => v.bewerkbaar && t.editor.selection().is_some_and(|s| !s.is_empty()),
        Actie::Plak => v.bewerkbaar,
    }
}
pub fn voer_uit(app: &mut App, actie: Actie) -> Task<Msg> {
    if !kan(app, actie) {
        return Task::none();
    }
    if matches!(actie, Actie::Plak)
        && app
            .tab()
            .is_some_and(|t| t.raster.focus && !t.raster.bewerken && !t.concept)
    {
        let id = app
            .tab()
            .and_then(Tab::veld)
            .map(|v| v.id.clone())
            .unwrap_or_default();
        let focus = raster_ui::update(
            app,
            raster_ui::Bericht::Begin {
                id,
                vervang: None,
                alles: true,
            },
        );
        if app.tab().is_some_and(|t| t.raster.bewerken) {
            return Task::batch([focus, voer_uit(app, actie)]);
        }
        return Task::none();
    }
    let t = app.tab().expect("actieve editor zojuist gecontroleerd");
    match actie {
        Actie::Kopieer | Actie::Knip => {
            let Some(tekst) = t.editor.selection() else {
                return Task::none();
            };
            let schrijf = iced::clipboard::write(tekst);
            if matches!(actie, Actie::Knip) {
                Task::batch([
                    schrijf,
                    app.update(Msg::Invoer(text_editor::Action::Edit(
                        text_editor::Edit::Delete,
                    ))),
                ])
            } else {
                schrijf
            }
        }
        Actie::Plak => {
            let Some(doel) = Doel::van_tab(t) else {
                return Task::none();
            };
            iced::clipboard::read().map(move |tekst| Msg::KlembordGelezen(doel.clone(), tekst))
        }
    }
}
pub fn plak(app: &mut App, doel: Doel, tekst: Option<String>) -> Task<Msg> {
    let Some(tekst) = tekst.filter(|s| !s.is_empty()) else {
        return Task::none();
    };
    if !kan(app, Actie::Plak) {
        return Task::none();
    }
    if app.tab().and_then(Doel::van_tab).as_ref() != Some(&doel) {
        return app.waarschuwing("De editor of selectie is gewijzigd; kies opnieuw Plakken");
    }
    app.update(Msg::Invoer(text_editor::Action::Edit(
        text_editor::Edit::Paste(std::sync::Arc::new(tekst)),
    )))
}

/// De editor publiceert selectiewijzigingen als berichten. Laat het klembord
/// daarom in dezelfde berichtenreeks volgen, in plaats van de oude selectie
/// al tijdens de widgetgebeurtenis uit te lezen. Dit geldt ook voor Knippen.
pub fn toets(k: text_editor::KeyPress) -> Option<text_editor::Binding<Msg>> {
    use text_editor::Binding as B;
    Some(match B::from_key_press(k)? {
        B::Copy => B::Custom(Msg::Klembord(Actie::Kopieer)),
        B::Cut => B::Custom(Msg::Klembord(Actie::Knip)),
        B::Paste => B::Custom(Msg::Klembord(Actie::Plak)),
        anders => anders,
    })
}
