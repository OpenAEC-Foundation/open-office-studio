//! Afzonderlijke boek- en paginakolom, rechtstreeks uit het bronoverzicht.
use super::*;
use iced::widget::{Space, button, column, pick_list, row, text};
use office_core::notities::{NotitieActie as A, NotitiePagina};
use openaec_ui::design::a11y::{self, Role};

#[derive(Debug, Clone, PartialEq, Eq)]
struct BoekKeuze {
    index: usize,
    naam: String,
}
impl std::fmt::Display for BoekKeuze {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.naam.fmt(f)
    }
}
fn label<'a>(s: impl Into<String>, maat: f32, kleur: iced::Color) -> iced::widget::Text<'a> {
    text(s.into()).font(fonts::BODY).size(maat).color(kleur)
}
pub fn datum(zone: office_core::klok::Dagzone, tekst: &str) -> String {
    let Some((_, maand, dag)) = zone.kalenderdag(tekst) else {
        return tekst.into();
    };
    let maanden = [
        "jan.", "feb.", "mrt.", "apr.", "mei", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.",
        "dec.",
    ];
    format!("{dag} {}", maanden[maand as usize - 1])
}
pub fn kolommen<'a>(
    app: &'a App,
    t: &'a Tab,
    p: &'a NotitiePagina,
) -> (Element<'a, Msg>, Element<'a, Msg>) {
    let l = app.look();
    let c = l.color;
    let licht = stijl::office(Look::from(ThemeId::Light));
    let wit = licht.color;
    let overzicht = &p.overzicht;
    let boek = &overzicht.boeken[overzicht.boek];
    let sectie = &boek.secties[overzicht.sectie];
    let keuzes: Vec<_> = overzicht
        .boeken
        .iter()
        .enumerate()
        .map(|(index, b)| BoekKeuze {
            index,
            naam: b.naam.clone(),
        })
        .collect();
    let geselecteerd = keuzes[overzicht.boek].clone();
    let kiezer = a11y::named(
        pick_list(keuzes, Some(geselecteerd), |b| Msg::NotitieBoek(b.index))
            .font(fonts::STRONG)
            .text_size(13)
            .padding([4, 4])
            .width(Length::Fill)
            .style(move |_, status| pick_list::Style {
                text_color: c.text,
                placeholder_color: c.text_secondary,
                handle_color: c.text,
                background: c.panel.into(),
                border: iced::Border {
                    color: if matches!(status, pick_list::Status::Opened { .. }) {
                        c.focus
                    } else {
                        iced::Color::TRANSPARENT
                    },
                    width: 1.,
                    radius: 4.into(),
                },
            }),
        Role::ComboBox,
        "Notitieboek kiezen",
    );
    let mut links = column![
        label("MIJN NOTITIEBOEKEN", 9., c.text_secondary),
        row![
            w::glyph(icoon(Icon::New), 19., c.text, c.text),
            kiezer,
            w::icon_button(
                l,
                icoon(Icon::Rename),
                22.,
                false,
                "Notitieboek hernoemen",
                (!t.bezig && !t.concept && !t.schrijft)
                    .then_some(notitie_naam_ui::openen(t, notitie_naam_ui::Soort::Boek))
            )
        ]
        .spacing(8)
        .padding([13, 4]),
        row![
            label("SECTIES", 9., c.text_secondary),
            Space::new().width(Length::Fill),
            w::icon_button(
                l,
                icoon(Icon::New),
                24.,
                false,
                "Nieuwe sectie",
                (!t.bezig && !t.concept)
                    .then_some(Msg::Notitie(A::NieuweSectie { markdown: false }))
            )
        ]
        .align_y(iced::Alignment::Center)
    ]
    .spacing(12);
    for (index, s) in boek.secties.iter().enumerate() {
        let actief = index == overzicht.sectie;
        let kleur = [
            iced::Color::from_rgb8(217, 119, 6),
            iced::Color::from_rgb8(59, 122, 113),
            iced::Color::from_rgb8(123, 108, 153),
            iced::Color::from_rgb8(110, 130, 148),
        ][index % 4];
        let doel = s
            .paginas
            .iter()
            .find(|p| !p.verwijderd)
            .or_else(|| s.paginas.first())
            .map(|p| p.deel);
        let inhoud = row![
            container(Space::new().width(5).height(20)).style(move |_| container::Style {
                background: Some(kleur.into()),
                border: iced::Border {
                    radius: 2.into(),
                    ..Default::default()
                },
                ..Default::default()
            }),
            label(s.naam.clone(), 13., c.text).width(Length::Fill),
            label(if s.markdown { "</>" } else { "" }, 10., c.text_secondary),
            label(
                s.paginas
                    .iter()
                    .filter(|p| !p.verwijderd)
                    .count()
                    .to_string(),
                10.,
                c.text_secondary
            )
        ]
        .spacing(10)
        .align_y(iced::Alignment::Center);
        let knop = button(inhoud)
            .width(Length::Fill)
            .padding([10, 9])
            .on_press_maybe((!t.bezig).then_some(doel).flatten().map(Msg::Deel))
            .style(move |_, status| button::Style {
                background: Some(
                    if actief {
                        c.selected
                    } else if matches!(status, button::Status::Hovered) {
                        c.hover
                    } else {
                        iced::Color::TRANSPARENT
                    }
                    .into(),
                ),
                text_color: c.text,
                border: iced::Border {
                    width: 1.,
                    color: if actief {
                        c.border
                    } else {
                        iced::Color::TRANSPARENT
                    },
                    radius: 5.into(),
                },
                ..Default::default()
            });
        links = links.push(a11y::node(
            knop,
            a11y::Node::new(Role::Button, format!("Sectie {}", s.naam)).selected(actief),
        ));
    }
    links = links.push(w::button(
        l,
        "+ Notitieboek toevoegen",
        K::Quiet,
        D::Compact,
        None,
        (!t.bezig && !t.concept).then_some(Msg::Notitie(A::NieuwBoek)),
    ));
    let verwijderd = overzicht
        .boeken
        .iter()
        .flat_map(|b| &b.secties)
        .flat_map(|s| &s.paginas)
        .filter(|p| p.verwijderd)
        .count();
    let boeken = container(
        column![
            scrollable(links).height(Length::Fill),
            label(format!("Prullenbak   {verwijderd}"), 11., c.text_secondary),
            label("Alleen op jouw computer", 10., c.text_secondary)
        ]
        .spacing(20),
    )
    .padding(iced::Padding {
        top: 24.,
        right: 14.,
        bottom: 12.,
        left: 14.,
    })
    .width(228)
    .height(Length::Fill)
    .style(move |_| container::Style {
        background: Some(c.panel.into()),
        ..Default::default()
    });
    let mut kaarten = column![].spacing(5);
    let mut paginas: Vec<_> = sectie.paginas.iter().collect();
    paginas.sort_by(|a, b| {
        b.vastgezet
            .cmp(&a.vastgezet)
            .then_with(|| b.bijgewerkt.cmp(&a.bijgewerkt))
    });
    for pagina in paginas {
        let actief = pagina.deel == t.deel;
        let titel = if pagina.verwijderd {
            format!("Prullenbak · {}", pagina.titel)
        } else {
            pagina.titel.clone()
        };
        let inhoud = column![
            label(titel.clone(), 12., wit.text).font(fonts::STRONG),
            label(
                pagina.voorbeeld.clone(),
                11.,
                iced::Color::from_rgb8(120, 113, 108)
            )
            .height(36),
            label(
                datum(app.dagzone, &pagina.bijgewerkt),
                9.,
                iced::Color::from_rgb8(120, 113, 108)
            )
        ]
        .spacing(7);
        let knop = button(inhoud)
            .width(Length::Fill)
            .padding([14, 10])
            .on_press_maybe((!t.bezig).then_some(Msg::Deel(pagina.deel)))
            .style(move |_, status| button::Style {
                background: Some(
                    if actief || matches!(status, button::Status::Hovered) {
                        iced::Color::WHITE
                    } else {
                        iced::Color::TRANSPARENT
                    }
                    .into(),
                ),
                text_color: wit.text,
                border: iced::Border {
                    width: 1.,
                    color: if actief {
                        iced::Color::from_rgb8(231, 229, 228)
                    } else {
                        iced::Color::TRANSPARENT
                    },
                    radius: 5.into(),
                },
                ..Default::default()
            });
        let marker = container(Space::new().width(3).height(Length::Fill)).style(move |_| {
            container::Style {
                background: actief.then_some(wit.accent.into()),
                ..Default::default()
            }
        });
        kaarten = kaarten.push(a11y::node(
            iced::widget::Stack::with_children([
                knop.into(),
                iced::widget::pin(marker)
                    .position([0., 0.])
                    .width(Length::Fill)
                    .height(Length::Fill)
                    .into(),
            ]),
            a11y::Node::new(Role::Button, format!("Pagina {titel}")).selected(actief),
        ));
    }
    let document = t.id;
    let deel = t.deel;
    let hash = t.antwoord.as_ref().unwrap().hash.clone();
    let soort = a11y::named(
        w::select(
            licht,
            &["Canvas", "Markdown"],
            Some(if p.markdown { "Markdown" } else { "Canvas" }),
            move |s| Msg::NotitieSoort {
                document,
                hash: hash.clone(),
                deel,
                markdown: s == "Markdown",
            },
            D::Regular,
        ),
        Role::ComboBox,
        "Sectietype",
    );
    let soort = w::with_tooltip(
        licht,
        soort,
        "Maakt een sectiekopie; de oorspronkelijke sectie blijft behouden",
        None,
    );
    let nieuw = button(label(
        "+   Nieuwe pagina",
        11.,
        iced::Color::from_rgb8(87, 83, 78),
    ))
    .width(Length::Fill)
    .height(36)
    .on_press_maybe((!t.bezig && !t.concept).then_some(Msg::Notitie(A::NieuwePagina)))
    .style(move |_, status| button::Style {
        background: Some(iced::Color::WHITE.into()),
        text_color: wit.text,
        border: iced::Border {
            width: 1.,
            color: if matches!(status, button::Status::Hovered) {
                wit.accent
            } else {
                iced::Color::from_rgb8(214, 211, 209)
            },
            radius: 5.into(),
        },
        ..Default::default()
    });
    let midden = container(column![
        container(
            column![
                label("PAGINA'S", 9., iced::Color::from_rgb8(120, 113, 108)),
                row![
                    label(sectie.naam.clone(), 19., wit.text)
                        .font(iced::Font {
                            weight: iced::font::Weight::Bold,
                            ..fonts::HEADING
                        })
                        .width(Length::Fill),
                    w::icon_button(
                        licht,
                        icoon(Icon::Rename),
                        22.,
                        false,
                        "Sectie hernoemen",
                        (!t.bezig && !t.concept && !t.schrijft)
                            .then_some(notitie_naam_ui::openen(t, notitie_naam_ui::Soort::Sectie))
                    )
                ]
                .align_y(iced::Alignment::Center)
            ]
            .spacing(5)
        )
        .height(86)
        .padding(iced::Padding {
            top: 27.,
            right: 18.,
            bottom: 0.,
            left: 18.
        }),
        container(
            row![
                label("Sectietype", 11., iced::Color::from_rgb8(120, 113, 108)).width(58),
                container(soort).width(146)
            ]
            .spacing(12)
            .align_y(iced::Alignment::Center)
        )
        .height(36)
        .padding([0, 16]),
        Space::new().height(14),
        container(a11y::named(nieuw, Role::Button, "Nieuwe pagina")).padding([0, 16]),
        container(scrollable(kaarten))
            .padding([17, 9])
            .height(Length::Fill)
    ])
    .width(250)
    .height(Length::Fill)
    .style(move |_| container::Style {
        background: Some(iced::Color::from_rgb8(250, 250, 249).into()),
        border: iced::Border {
            width: 1.,
            color: iced::Color::from_rgb8(231, 229, 228),
            ..Default::default()
        },
        ..Default::default()
    });
    (
        a11y::named(boeken, Role::Group, "Notitieboeken"),
        a11y::named(midden, Role::Group, "Notitiepagina's"),
    )
}
