//! Office-titelbalk op basis van src/Titelbalk.tsx en src/titelbalk.css.
//! Het OpenAEC-beeldmerk blijft de oorspronkelijke Foundation-SVG.
use super::*;
use iced::widget::{Space, button, mouse_area, row, svg, text};
use iced::{Alignment, Border, Color, Padding, Shadow};
use openaec_ui::design::a11y::{self, Node, Role};

use super::office_iconen as oi;
const MIN: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor"/></svg>"#;
const MAX: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>"#;
const SLUIT: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 10 10M10 0 0 10" stroke="currentColor" stroke-width="1.2"/></svg>"#;

pub(super) fn titel(app: &App) -> String {
    if app.postvak_zichtbaar {
        return "Email Studio — Open Office Studio".into();
    }
    app.tab()
        .map(|t| {
            let module = t.antwoord.as_ref().map(|a| match a.beeld.module {
                Module::Writer => "Tekst",
                Module::Spreadsheet => "Rekenblad",
                Module::Presentation => "Presentatie",
                Module::Notition => "Notities",
                Module::Email => "E-mail",
            });
            format!(
                "{}{} — Open Office Studio{}",
                t.naam,
                if t.gewijzigd() { " •" } else { "" },
                module.map(|m| format!(" ({m})")).unwrap_or_default()
            )
        })
        .unwrap_or_else(|| "Open Office Studio".into())
}
fn knop<'a>(
    look: Look,
    bron: &'static str,
    naam: &'static str,
    actie: Option<Msg>,
    accent: bool,
    gekozen: Option<bool>,
) -> Element<'a, Msg> {
    let c = look.color;
    let actief = actie.is_some();
    let kleur = if !actief {
        c.text_disabled
    } else if accent {
        c.accent_text
    } else {
        c.text
    };
    let node = Node::new(
        if gekozen.is_some() {
            Role::ToggleButton
        } else {
            Role::Button
        },
        naam,
    )
    .disabled(!actief);
    let node = if let Some(b) = gekozen {
        node.checked(b)
    } else {
        node
    };
    let b = button(container(w::glyph(bron, 16., kleur, kleur)).center(Length::Fill))
        .width(28)
        .height(24)
        .padding(0)
        .on_press_maybe(actie)
        .style(move |_, s| {
            let over = matches!(s, button::Status::Hovered | button::Status::Pressed);
            button::Style {
                snap: false,
                background: over.then_some(c.hover.into()),
                text_color: kleur,
                border: Border {
                    color: if over { c.border } else { Color::TRANSPARENT },
                    width: 1.,
                    radius: 3.into(),
                },
                shadow: Shadow::default(),
            }
        });
    w::with_tooltip(
        look,
        a11y::node(focus::focusable(look, b, actief, 3.), node),
        naam,
        None,
    )
}
fn vensterknop<'a>(
    look: Look,
    bron: &'static str,
    naam: &'static str,
    actie: Msg,
    sluiten: bool,
) -> Element<'a, Msg> {
    let c = look.color;
    let b = button(container(w::glyph(bron, 10., c.text, c.text)).center(Length::Fill))
        .width(44)
        .height(32)
        .padding(0)
        .on_press(actie)
        .style(move |_, s| {
            let over = matches!(s, button::Status::Hovered | button::Status::Pressed);
            let rood = over && sluiten && !look.high_contrast();
            button::Style {
                snap: false,
                background: if rood {
                    Some(Color::from_rgb8(196, 43, 28).into())
                } else if over {
                    Some(c.hover.into())
                } else {
                    None
                },
                text_color: if rood { Color::WHITE } else { c.text },
                border: Border::default(),
                shadow: Shadow::default(),
            }
        });
    a11y::named(focus::focusable(look, b, true, 0.), Role::Button, naam)
}
pub(super) fn weergave(app: &App) -> Element<'_, Msg> {
    let l = app.look();
    let c = l.color;
    let bewaar = app
        .tab()
        .filter(|t| !app.postvak_zichtbaar && !t.bezig && !t.schrijft && t.antwoord.is_some());
    let beeldmerk = container(
        svg(svg::Handle::from_memory(include_bytes!(
            "../assets/openaec-symbol.svg"
        )))
        .width(18)
        .height(20),
    )
    .width(26)
    .height(26)
    .center(26);
    let merk = a11y::named(
        focus::focusable(
            l,
            button(beeldmerk)
                .width(26)
                .height(26)
                .padding(0)
                .on_press(Msg::Start)
                .style(move |_, s| button::Style {
                    snap: false,
                    background: matches!(s, button::Status::Hovered | button::Status::Pressed)
                        .then_some(c.pressed.into()),
                    text_color: c.text,
                    border: Border {
                        radius: 4.into(),
                        ..Default::default()
                    },
                    shadow: Shadow::default(),
                }),
            true,
            4.,
        ),
        Role::Button,
        "OpenAEC Office Studio · Start",
    );
    let scheiding = container(Space::new().width(1).height(22)).style(move |_| container::Style {
        background: Some(c.border.into()),
        ..Default::default()
    });
    let links = row![
        merk,
        Space::new().width(6),
        scheiding,
        Space::new().width(6),
        row![
            knop(
                l,
                oi::OPSLAAN,
                "Opslaan",
                bewaar.map(|t| Msg::Opslaan(t.id, false)),
                true,
                None
            ),
            knop(l, oi::OPENEN, "Openen", Some(Msg::Open), true, None),
            knop(
                l,
                oi::OPSLAAN_ALS,
                "Opslaan als",
                bewaar.map(|t| Msg::Opslaan(t.id, true)),
                true,
                None
            )
        ]
        .spacing(1)
    ]
    .align_y(Alignment::Center);
    let vensters = row![
        vensterknop(l, MIN, "Minimaliseren", Msg::Minimaliseer, false),
        vensterknop(l, MAX, "Maximaliseren", Msg::Maximaliseer, false),
        vensterknop(l, SLUIT, "Sluiten", Msg::SluitVenster, true)
    ];
    let rechts = row![
        knop(
            l,
            icoon(Icon::PanelRight),
            "Panelen",
            app.tab().map(|_| Msg::Panelen),
            false,
            app.tab().map(|t| t.panelen)
        ),
        knop(
            l,
            if app.thema == ThemeId::Dark {
                oi::ZON
            } else {
                oi::MAAN
            },
            "Thema wisselen",
            Some(Msg::Thema(if app.thema == ThemeId::Dark {
                ThemeId::Light
            } else {
                ThemeId::Dark
            })),
            false,
            Some(app.thema == ThemeId::Dark)
        ),
        knop(
            l,
            oi::INSTELLINGEN,
            "Instellingen",
            Some(Msg::Instellingen(true)),
            false,
            None
        ),
        container(vensters).padding(Padding {
            left: 6.,
            ..Padding::ZERO
        })
    ]
    .spacing(2)
    .align_y(Alignment::Center);
    let titel = titel(app);
    let naam = a11y::named(
        text(titel.clone())
            .size(12)
            .font(fonts::MEDIUM)
            .color(c.text)
            .wrapping(iced::widget::text::Wrapping::None),
        Role::Label,
        titel,
    );
    let midden = mouse_area(
        container(naam)
            .max_width(600)
            .height(32)
            .align_y(Alignment::Center)
            .clip(true),
    )
    .on_press(Msg::Sleep);
    let rij = row![
        container(row![
            links,
            mouse_area(Space::new().width(Length::Fill).height(32)).on_press(Msg::Sleep)
        ])
        .width(Length::FillPortion(1)),
        midden,
        row![
            mouse_area(Space::new().width(Length::Fill).height(32)).on_press(Msg::Sleep),
            rechts
        ]
        .width(Length::FillPortion(1))
    ]
    .height(32)
    .padding(Padding {
        left: 6.,
        ..Padding::ZERO
    })
    .align_y(Alignment::Center);
    container(rij)
        .width(Length::Fill)
        .height(32)
        .style(move |_| container::Style {
            background: Some(c.frame.into()),
            ..Default::default()
        })
        .into()
}
