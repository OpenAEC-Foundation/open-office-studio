//! Documentbalk op basis van src/TabBalk.tsx en src/tabbalk.css.
use super::office_iconen as oi;
use super::*;
use iced::widget::{Space, button, row, text};
use iced::{Alignment, Border, Color, Padding, Shadow};
use openaec_ui::design::a11y::{self, Node, Role};
fn breedte(naam: &str, font: iced::Font) -> f32 {
    use iced::advanced::text::{self, Paragraph as _};
    type P = <iced::Renderer as text::Renderer>::Paragraph;
    P::with_text(text::Text {
        content: naam,
        bounds: Size::new(f32::INFINITY, f32::INFINITY),
        size: iced::Pixels(12.),
        line_height: text::LineHeight::Relative(1.25),
        font,
        align_x: text::Alignment::Left,
        align_y: iced::alignment::Vertical::Center,
        shaping: text::Shaping::Advanced,
        wrapping: text::Wrapping::None,
    })
    .min_bounds()
    .width
}
/// Dezelfde daadwerkelijke lettermeting als het getekende label; geen schatting
/// op tekenaantal. De volledige naam blijft in de toegankelijkheidsboom staan.
pub(super) fn titel(naam: &str, maximaal: f32) -> (String, f32) {
    let vol = breedte(naam, fonts::BODY);
    if vol <= maximaal {
        return (naam.into(), vol);
    }
    let mut grenzen: Vec<_> = naam.char_indices().map(|(n, _)| n).collect();
    grenzen.push(naam.len());
    let (mut laag, mut hoog) = (0, grenzen.len());
    while laag + 1 < hoog {
        let midden = (laag + hoog) / 2;
        if breedte(&format!("{}…", &naam[..grenzen[midden]]), fonts::BODY) <= maximaal {
            laag = midden;
        } else {
            hoog = midden;
        }
    }
    let kort = format!("{}…", &naam[..grenzen[laag]]);
    let maat = breedte(&kort, fonts::BODY).min(maximaal);
    (kort, maat)
}
fn stijl(l: Look, actief: bool, status: button::Status) -> button::Style {
    let c = l.color;
    button::Style {
        snap: false,
        background: if actief || matches!(status, button::Status::Hovered | button::Status::Pressed)
        {
            Some(
                Color {
                    a: 0.08,
                    ..c.accent
                }
                .into(),
            )
        } else {
            None
        },
        text_color: if actief { c.accent_text } else { c.text_muted },
        border: Border {
            color: if actief { c.accent } else { c.border },
            width: 1.,
            radius: iced::border::Radius {
                top_left: 3.,
                top_right: 3.,
                bottom_left: 0.,
                bottom_right: 0.,
            },
        },
        shadow: Shadow::default(),
    }
}
pub(super) fn weergave(app: &App) -> Element<'_, Msg> {
    let l = app.look();
    let c = l.color;
    let start = app.start || app.tabs.is_empty();
    let home = button(
        row![
            w::glyph(oi::HUIS, 14., c.text_muted, c.text_muted),
            text("Start").font(fonts::MEDIUM).size(12).line_height(1.25)
        ]
        .spacing(6)
        .align_y(Alignment::Center),
    )
    .height(24)
    .padding(Padding {
        top: 1.,
        right: 13.,
        bottom: 0.,
        left: 11.,
    })
    .on_press(Msg::Start)
    .style(move |_, s| stijl(l, start, s));
    let home = a11y::node(
        focus::focusable(l, home, true, 3.),
        Node::new(Role::Tab, "Start").selected(start),
    );
    let mut lijst = row![].spacing(1).align_y(Alignment::End);
    for (n, t) in app.tabs.iter().enumerate() {
        let actief = !start && n == app.actief;
        let fg = if actief { c.accent_text } else { c.text_muted };
        let (naam, maat) = titel(&t.naam, 160.);
        let naam_element = text(naam)
            .font(fonts::BODY)
            .size(12)
            .line_height(1.25)
            .shaping(iced::advanced::text::Shaping::Advanced)
            .wrapping(iced::advanced::text::Wrapping::None)
            .width(maat.max(36.))
            .color(fg);
        let sluit = button(container(w::glyph(oi::SLUITEN, 13., fg, fg)).center(18))
            .width(18)
            .height(18)
            .padding(0)
            .on_press(Msg::Sluit(n))
            .style(move |_, s| button::Style {
                snap: false,
                background: matches!(s, button::Status::Hovered | button::Status::Pressed)
                    .then_some(c.pressed.into()),
                text_color: fg,
                border: Border {
                    radius: 4.into(),
                    ..Default::default()
                },
                shadow: Shadow::default(),
            });
        let sluit = a11y::named(
            focus::focusable(l, sluit, true, 4.),
            Role::Button,
            format!("{} sluiten", t.naam),
        );
        let label = row![
            w::glyph(
                t.antwoord
                    .as_ref()
                    .map(|a| match a.beeld.module {
                        Module::Writer => oi::DOCUMENT,
                        Module::Spreadsheet => oi::REKENBLAD,
                        Module::Presentation => oi::PRESENTATIE,
                        Module::Notition => oi::NOTITIES,
                        Module::Email => oi::EMAIL,
                    })
                    .unwrap_or(oi::DOCUMENT),
                14.,
                fg,
                fg
            ),
            naam_element,
            sluit
        ]
        .spacing(6)
        .align_y(Alignment::Center);
        let b = button(label)
            .height(24)
            .padding(Padding {
                top: 1.,
                right: 5.,
                bottom: 0.,
                left: 11.,
            })
            .on_press(Msg::Selecteer(n))
            .style(move |_, s| stijl(l, actief, s));
        lijst = lijst.push(a11y::node(
            focus::focusable(l, b, true, 3.),
            Node::new(Role::Tab, t.naam.clone())
                .selected(actief)
                .description(if t.gewijzigd() {
                    "Niet opgeslagen wijzigingen"
                } else {
                    "Opgeslagen"
                }),
        ));
    }
    let lijst = scrollable(lijst).direction(scrollable::Direction::Horizontal(Default::default()));
    let nieuw = button(
        container(w::glyph(
            oi::TOEVOEGEN,
            15.,
            c.text_secondary,
            c.text_secondary,
        ))
        .center(24),
    )
    .width(24)
    .height(24)
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
    });
    let nieuw = a11y::named(
        focus::focusable(l, nieuw, true, 4.),
        Role::Button,
        "Tabblad toevoegen",
    );
    let groep = row![home, lijst].spacing(1).align_y(Alignment::End);
    let lijn = row![
        groep,
        container(nieuw).height(26),
        Space::new().width(Length::Fill)
    ]
    .spacing(2)
    .align_y(Alignment::End)
    .padding(Padding {
        top: 3.,
        right: 4.,
        bottom: 1.,
        left: 4.,
    })
    .height(30);
    a11y::named(
        container(lijn)
            .width(Length::Fill)
            .style(move |_| container::Style {
                background: Some(c.docbar.into()),
                ..Default::default()
            }),
        Role::Group,
        "Geopende tabbladen",
    )
}
