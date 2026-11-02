//! Namen wijzigen met een vastgelegd document, paginadoel en bronversie.
use super::*;
use iced::widget::{Space, button, column, row, text, text_input};
use office_core::notities::NotitieActie as A;
use openaec_ui::design::a11y::{self, Role};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Soort {
    Boek,
    Sectie,
}
#[derive(Debug, Clone)]
pub enum Bericht {
    Open(Doel, Soort),
    Waarde(u64, String),
    Bevestig(u64),
    Annuleer(u64),
}
#[derive(Debug, Clone)]
pub struct Doel {
    document: u64,
    deel: usize,
    hash: String,
}
/// Alleen het zichtbare document kan een naamformulier aanvragen.
pub fn openen(t: &Tab, soort: Soort) -> Msg {
    Msg::NotitieNaam(Bericht::Open(
        Doel {
            document: t.id,
            deel: t.deel,
            hash: t
                .antwoord
                .as_ref()
                .map(|a| a.hash.clone())
                .unwrap_or_default(),
        },
        soort,
    ))
}
pub struct Naamblad {
    nummer: u64,
    document: u64,
    deel: usize,
    hash: String,
    soort: Soort,
    waarde: String,
    fout: Option<String>,
}
impl Naamblad {
    pub fn nummer(&self) -> u64 {
        self.nummer
    }
}
fn naam_geldig(waarde: &str) -> bool {
    let naam = waarde.trim();
    !naam.is_empty() && naam.chars().count() <= 200 && !naam.chars().any(char::is_control)
}
pub fn update(app: &mut App, bericht: Bericht) -> Task<Msg> {
    match bericht {
        Bericht::Open(doel, soort) => {
            if app.notitienaam.is_some()
                || app.bestand
                || app.instellingen
                || app.postvak_zichtbaar
                || app.exportblad.is_some()
                || app.sluiten.is_some()
            {
                return Task::none();
            }
            let Some(t) = app.tab() else {
                return Task::none();
            };
            if t.id != doel.document
                || t.deel != doel.deel
                || !t.antwoord.as_ref().is_some_and(|a| a.hash == doel.hash)
            {
                return Task::none();
            }
            if t.bezig || t.schrijft || t.concept {
                return app
                    .waarschuwing("Pas de huidige tekst eerst toe en wacht tot bewaren gereed is");
            }
            let Some(a) = &t.antwoord else {
                return Task::none();
            };
            let Some(p) = &a.beeld.notitie else {
                return Task::none();
            };
            let boek = &p.overzicht.boeken[p.overzicht.boek];
            let waarde = match soort {
                Soort::Boek => boek.naam.clone(),
                Soort::Sectie => boek.secties[p.overzicht.sectie].naam.clone(),
            };
            static VOLGEND: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
            let nummer = VOLGEND.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            app.notitienaam = Some(Naamblad {
                nummer,
                document: t.id,
                deel: t.deel,
                hash: a.hash.clone(),
                soort,
                waarde,
                fout: None,
            });
            app.zoeken = None;
            let id = format!("notitie-naam-{nummer}");
            return invoerfocus::vraag_met_selectie(
                &app.invoergeneratie,
                id.into(),
                app.invoergeneratie
                    .load(std::sync::atomic::Ordering::Relaxed),
            );
        }
        Bericht::Waarde(nummer, waarde) => {
            if let Some(b) = &mut app.notitienaam
                && b.nummer == nummer
            {
                b.waarde = waarde;
                b.fout = None;
            }
        }
        Bericht::Annuleer(nummer) => {
            if app.notitienaam.as_ref().is_some_and(|b| b.nummer == nummer) {
                app.notitienaam = None;
            }
        }
        Bericht::Bevestig(nummer) => {
            let Some(b) = app.notitienaam.as_ref().filter(|b| b.nummer == nummer) else {
                return Task::none();
            };
            if !naam_geldig(&b.waarde) {
                app.notitienaam.as_mut().unwrap().fout =
                    Some("Kies een naam van 1 tot en met 200 tekens zonder regelovergangen".into());
                return Task::none();
            }
            if !app.tab().is_some_and(|t| {
                t.id == b.document
                    && t.deel == b.deel
                    && !t.bezig
                    && !t.schrijft
                    && !t.concept
                    && t.antwoord
                        .as_ref()
                        .is_some_and(|a| a.hash == b.hash && a.beeld.notitie.is_some())
            }) {
                app.notitienaam.as_mut().unwrap().fout = Some(
                    "De bron of selectie is gewijzigd. Annuleer en open het naamvenster opnieuw."
                        .into(),
                );
                return Task::none();
            }
            let b = app.notitienaam.take().unwrap();
            let naam = b.waarde.trim().to_string();
            let actie = match b.soort {
                Soort::Boek => A::BoekNaam(naam),
                Soort::Sectie => A::SectieNaam(naam),
            };
            return app.opdracht(
                b.document,
                Opdracht::Bewerk(b.deel, Bewerking::Notitie(actie)),
            );
        }
    }
    Task::none()
}
pub fn weergave(app: &App) -> Option<Element<'_, Msg>> {
    let b = app.notitienaam.as_ref()?;
    let nummer = b.nummer;
    // De bestaande notitiedialoog blijft licht, ook in een donkere Office-schil.
    let l = stijl::office(Look::from(ThemeId::Light));
    let donker = iced::Color::from_rgb8(54, 54, 62);
    let titel = match b.soort {
        Soort::Boek => "Notitieboek hernoemen",
        Soort::Sectie => "Sectie hernoemen",
    };
    let invoer = a11y::named(
        text_input("Naam", &b.waarde)
            .id(format!("notitie-naam-{nummer}"))
            .font(fonts::BODY)
            .size(13)
            .padding(10)
            .on_input(move |s| Msg::NotitieNaam(Bericht::Waarde(nummer, s)))
            .on_submit(Msg::NotitieNaam(Bericht::Bevestig(nummer)))
            .style(move |_, status| text_input::Style {
                background: iced::Color::WHITE.into(),
                border: iced::Border {
                    color: if matches!(status, text_input::Status::Focused { .. }) {
                        l.color.focus
                    } else {
                        iced::Color::from_rgb8(214, 211, 209)
                    },
                    width: 1.,
                    radius: 4.into(),
                },
                icon: donker,
                placeholder: l.color.text_muted,
                value: donker,
                selection: l.color.selected,
            }),
        Role::TextField,
        "Naam",
    );
    let actieknop = |naam: &'static str, primair: bool, aan: bool, bericht| {
        let knop = button(text(naam).font(fonts::BODY).size(13))
            .padding([9, 13])
            .on_press_maybe(aan.then_some(Msg::NotitieNaam(bericht)))
            .style(move |_, status| button::Style {
                background: Some(if primair { donker } else { iced::Color::WHITE }.into()),
                text_color: if !aan {
                    l.color.text_muted
                } else if primair {
                    iced::Color::WHITE
                } else {
                    donker
                },
                border: iced::Border {
                    color: if matches!(status, button::Status::Hovered | button::Status::Pressed) {
                        l.color.accent
                    } else if primair {
                        donker
                    } else {
                        iced::Color::from_rgb8(231, 229, 228)
                    },
                    width: 1.,
                    radius: 4.into(),
                },
                ..Default::default()
            });
        a11y::named(focus::focusable(l, knop, aan, 4.), Role::Button, naam)
    };
    let mut velden = column![
        text("Naam").font(fonts::BODY).size(12).color(donker),
        invoer
    ]
    .spacing(8);
    if let Some(fout) = &b.fout {
        velden = velden.push(a11y::named(
            text(fout).font(fonts::BODY).size(12).color(donker),
            Role::Alert,
            fout.clone(),
        ));
    }
    let inhoud = column![
        text(titel)
            .font(iced::Font {
                weight: iced::font::Weight::Bold,
                ..fonts::HEADING
            })
            .size(21)
            .color(donker),
        velden,
        row![
            Space::new().width(Length::Fill),
            actieknop("Annuleren", false, true, Bericht::Annuleer(nummer)),
            actieknop(
                "Opslaan",
                true,
                naam_geldig(&b.waarde),
                Bericht::Bevestig(nummer)
            )
        ]
        .spacing(8)
    ]
    .spacing(24);
    let kaart = a11y::named(
        container(inhoud)
            .width(420)
            .padding(28)
            .style(move |_| container::Style {
                background: Some(iced::Color::WHITE.into()),
                border: iced::Border {
                    color: iced::Color::from_rgb8(231, 229, 228),
                    width: 1.,
                    radius: 8.into(),
                },
                shadow: iced::Shadow {
                    color: iced::Color {
                        a: 37. / 255.,
                        ..donker
                    },
                    offset: iced::Vector::new(0., 15.),
                    blur_radius: 60.,
                },
                ..Default::default()
            }),
        Role::Dialog,
        titel,
    );
    Some(
        iced::widget::mouse_area(container(kaart).center(Length::Fill).style(move |_| {
            container::Style {
                background: Some(
                    iced::Color {
                        a: 69. / 255.,
                        ..donker
                    }
                    .into(),
                ),
                ..Default::default()
            }
        }))
        .into(),
    )
}

/// Een gefocust naamveld handelt Escape zelf af. Ook die gebeurtenis sluit
/// het modale formulier, zonder opdrachten naar het onderliggende document.
pub fn afgevangen_escape(
    event: iced::Event,
    status: iced::event::Status,
    _: iced::window::Id,
) -> Option<()> {
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
    .then_some(())
}
