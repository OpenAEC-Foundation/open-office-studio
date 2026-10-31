//! Notities met echte, afzonderlijk verplaatsbare tekstvakken en een Markdown-werkruimte.
use super::*;
use iced::widget::{Space, Stack, column, markdown, pin, row};
use office_core::notities::NotitieActie as A;
pub fn ribbon<'a>(app: &'a App, t: &'a Tab) -> Element<'a, Msg> {
    let l = app.look();
    let kan = !t.bezig && !t.concept;
    let knop = |naam, a| {
        w::ribbon_small(
            l,
            icoon(Icon::New),
            naam,
            false,
            kan.then_some(Msg::Notitie(a)),
        )
    };
    let actief = t.veld();
    let blok = actief.is_some_and(|v| v.bewerkbaar && v.id.ends_with("/tekst"));
    w::ribbon(
        l,
        vec![
            w::ribbon_group(
                l,
                "Notitieboek",
                vec![
                    column![
                        knop("Nieuw boek", A::NieuwBoek),
                        knop("Nieuwe sectie", A::NieuweSectie { markdown: false }),
                        knop("Nieuwe pagina", A::NieuwePagina)
                    ]
                    .spacing(2)
                    .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Sectie",
                vec![
                    column![
                        knop("Vrij canvas", A::Sectiesoort { markdown: false }),
                        knop("Markdown", A::Sectiesoort { markdown: true }),
                        knop("Herstellen", A::Prullenbak(false))
                    ]
                    .spacing(2)
                    .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Tekst",
                vec![
                    column![
                        knop("Tekstvak", A::NieuwVak { x: 40., y: 32. }),
                        w::ribbon_small(
                            l,
                            icoon(Icon::Rename),
                            "Vet",
                            actief.is_some_and(|v| v.opmaak.vet),
                            (kan && blok).then_some(Msg::Opmaak(Opmaak::Vet(
                                !actief.is_some_and(|v| v.opmaak.vet)
                            )))
                        ),
                        w::ribbon_small(
                            l,
                            icoon(Icon::Rename),
                            "Cursief",
                            actief.is_some_and(|v| v.opmaak.cursief),
                            (kan && blok).then_some(Msg::Opmaak(Opmaak::Cursief(
                                !actief.is_some_and(|v| v.opmaak.cursief)
                            )))
                        ),
                    ]
                    .spacing(2)
                    .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Bewerken",
                vec![
                    column![
                        w::ribbon_small(
                            l,
                            icoon(Icon::Check),
                            "Tekst toepassen",
                            false,
                            (!t.bezig && t.concept).then_some(Msg::PasToe)
                        ),
                        w::ribbon_small(
                            l,
                            icoon(Icon::Undo),
                            "Ongedaan maken",
                            false,
                            (!t.bezig
                                && (t.concept || t.antwoord.as_ref().is_some_and(|a| a.terug)))
                            .then_some(Msg::Terug)
                        ),
                        w::ribbon_small(
                            l,
                            icoon(Icon::Redo),
                            "Opnieuw",
                            false,
                            (!t.bezig
                                && !t.concept
                                && t.antwoord.as_ref().is_some_and(|a| a.vooruit))
                            .then_some(Msg::Vooruit)
                        )
                    ]
                    .spacing(2)
                    .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Pagina",
                vec![
                    column![
                        knop("Vastzetten", A::Vastzetten(true)),
                        knop("Naar prullenbak", A::Prullenbak(true)),
                        w::ribbon_small(
                            l,
                            icoon(Icon::Save),
                            "Opslaan",
                            false,
                            (!t.bezig && !t.schrijft).then_some(Msg::Opslaan(t.id, false))
                        )
                    ]
                    .spacing(2)
                    .into(),
                ],
            ),
        ],
    )
}
pub fn weergave<'a>(app: &'a App, t: &'a Tab, a: &'a Antwoord) -> Element<'a, Msg> {
    let l = app.look();
    let c = l.color;
    let nav = column(a.beeld.onderdelen.iter().enumerate().map(|(n, naam)| {
        tekstknop(
            l,
            naam.clone(),
            if n == t.deel { K::Secondary } else { K::Quiet },
            D::Compact,
            None,
            (!t.bezig).then_some(Msg::Deel(n)),
        )
    }))
    .spacing(4)
    .padding(10);
    let Some(p) = &a.beeld.notitie else {
        return row![
            w::panel(l, "Notitieboeken", 230., vec![], scrollable(nav).into()),
            container(w::button(
                l,
                "Maak een notitieboek",
                K::Primary,
                D::Regular,
                None,
                Some(Msg::Notitie(A::NieuwBoek))
            ))
            .center(Length::Fill)
        ]
        .into();
    };
    let title = w::button(l, &p.titel, K::Quiet, D::Regular, None, Some(Msg::Veld(0)));
    let editor = |hoogte| {
        openaec_ui::design::a11y::named(
            text_editor(&t.editor)
                .key_binding(klembord::toets)
                .on_action(Msg::Invoer)
                .font(iced::Font {
                    weight: if t.veld().is_some_and(|v| v.opmaak.vet) {
                        iced::font::Weight::Bold
                    } else {
                        iced::font::Weight::Normal
                    },
                    style: if t.veld().is_some_and(|v| v.opmaak.cursief) {
                        iced::font::Style::Italic
                    } else {
                        iced::font::Style::Normal
                    },
                    ..fonts::BODY
                })
                .size(14)
                .padding(12)
                .height(hoogte),
            openaec_ui::design::a11y::Role::TextField,
            "Notitietekst",
        )
    };
    let werk: Element<_> = if p.markdown {
        let md = a.beeld.velden.iter().position(|v| v.naam == "Markdown");
        let bewerk: Element<_> = if md == Some(t.gekozen) && t.notitie_invoer {
            editor(Length::Fill)
        } else {
            w::button(
                l,
                "Markdown bewerken",
                K::Secondary,
                D::Regular,
                None,
                md.map(Msg::Veld),
            )
        };
        let voorbeeld = markdown::view(
            t.markdown.iter(),
            markdown::Settings::with_style(markdown::Style::from_palette(
                app.thema.iced().palette(),
            )),
        )
        .map(|uri| Msg::Koppeling(uri.to_string()));
        row![
            container(bewerk).width(Length::FillPortion(1)),
            container(scrollable(voorbeeld))
                .padding(24)
                .width(Length::FillPortion(1))
        ]
        .spacing(12)
        .height(Length::Fill)
        .into()
    } else {
        let mut breedte = 1000f32;
        let mut hoogte = 700f32;
        let mut kaarten = vec![];
        for vak in &p.vakken {
            let g = t
                .canvas_voorbeeld
                .filter(|(n, _)| *n == vak.index)
                .map(|(_, g)| g)
                .unwrap_or(vak.grens);
            breedte = breedte.max(g.x + g.breedte + 80.);
            hoogte = hoogte.max(g.y + g.hoogte + 80.);
            // Bedieningssymbolen zijn vectoren, zodat systeembackupfonts de
            // vorm en maat op een ander besturingssysteem niet veranderen.
            // De gedeelde SVG-helper verwacht een ondoorzichtige kleur.
            // Meng de tekstkleur vooraf met de kaart, zodat de greep even
            // gedempt blijft als het bijbehorende label, in ieder thema.
            let greep = openaec_ui::design::mix(c.text_muted, c.text_muted.a, c.panel);
            let hoek = openaec_ui::design::mix(c.text_secondary, c.text_secondary.a, c.panel);
            let mut inhoud = column![
                row![
                    w::glyph(include_str!("../assets/sleepgreep.svg"), 10., greep, greep),
                    w::mono_label(l, "TEKSTVAK")
                ]
                .spacing(8)
                .align_y(iced::Alignment::Center)
            ]
            .spacing(5);
            for &n in &vak.velden {
                let veld = &a.beeld.velden[n];
                if n == t.gekozen && t.notitie_invoer {
                    inhoud = inhoud.push(editor(Length::Fill));
                } else {
                    let letter = iced::Font {
                        weight: if veld.opmaak.vet {
                            iced::font::Weight::Bold
                        } else {
                            iced::font::Weight::Normal
                        },
                        style: if veld.opmaak.cursief {
                            iced::font::Style::Italic
                        } else {
                            iced::font::Style::Normal
                        },
                        ..fonts::BODY
                    };
                    let label = if veld.tekst.is_empty() {
                        "Klik om te schrijven"
                    } else {
                        &veld.tekst
                    };
                    let knop = iced::widget::button(
                        iced::widget::text(label)
                            .font(letter)
                            .size(match veld.naam.as_str() {
                                "kop" => 24.,
                                "subkop" => 18.,
                                _ => 14.,
                            })
                            .color(c.text),
                    )
                    .width(Length::Fill)
                    .padding(8)
                    .on_press(Msg::Veld(n))
                    .style(move |_, s| w::button_style(l, K::Quiet, s));
                    inhoud = inhoud.push(openaec_ui::design::a11y::named(
                        knop,
                        openaec_ui::design::a11y::Role::Button,
                        label,
                    ));
                }
            }
            inhoud = inhoud.push(
                row![
                    w::button(
                        l,
                        "+",
                        K::Quiet,
                        D::Compact,
                        None,
                        (!t.bezig && !t.concept).then_some(Msg::Notitie(A::NieuwBlok(vak.index)))
                    ),
                    w::button(
                        l,
                        "×",
                        K::Quiet,
                        D::Compact,
                        None,
                        (!t.bezig && !t.concept)
                            .then_some(Msg::Notitie(A::VerwijderVak(vak.index)))
                    ),
                    Space::new().width(Length::Fill),
                    w::glyph(include_str!("../assets/formaatgreep.svg"), 12., hoek, hoek)
                ]
                .spacing(4),
            );
            let kaart = container(inhoud)
                .width(g.breedte * t.zoom)
                .height(g.hoogte * t.zoom)
                .padding(8)
                .style(move |_| container::Style {
                    background: Some(c.panel.into()),
                    border: iced::Border {
                        color: c.border,
                        width: 1.,
                        radius: 4.into(),
                    },
                    ..Default::default()
                });
            let kaart = super::sleepvak::vak(
                kaart.into(),
                t.id,
                vak.index,
                g,
                t.zoom,
                !t.bezig
                    && !t.concept
                    && a.beeld.velden.iter().any(|v| v.bewerkbaar)
                    && !app.instellingen
                    && app.sluiten.is_none(),
            );
            kaarten.push(
                pin(kaart)
                    .position([g.x * t.zoom, g.y * t.zoom])
                    .width(Length::Fill)
                    .height(Length::Fill)
                    .into(),
            );
        }
        let mut lagen = vec![
            Space::new()
                .width(breedte * t.zoom)
                .height(hoogte * t.zoom)
                .into(),
        ];
        lagen.extend(kaarten);
        scrollable(Stack::with_children(lagen))
            .direction(scrollable::Direction::Both {
                horizontal: Default::default(),
                vertical: Default::default(),
            })
            .height(Length::Fill)
            .into()
    };
    let mut blad = column![title].spacing(8);
    if t.gekozen == 0 && t.notitie_invoer {
        blad = blad.push(editor(Length::Fixed(70.)));
    }
    blad = blad.push(werk);
    row![
        w::panel(l, "Notitieboeken", 230., vec![], scrollable(nav).into()),
        container(blad)
            .padding(16)
            .height(Length::Fill)
            .width(Length::Fill)
            .style(move |_| container::Style {
                background: Some(c.workspace.into()),
                ..Default::default()
            })
    ]
    .height(Length::Fill)
    .into()
}
