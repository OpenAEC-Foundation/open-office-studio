//! Notities met echte, afzonderlijk verplaatsbare tekstvakken en een Markdown-werkruimte.
use super::*;
use iced::widget::{Space, Stack, column, markdown, pin, row};
use office_core::notities::NotitieActie as A;
pub(super) fn vernieuw_editors(t: &mut Tab) {
    t.notitie_woorden = t
        .antwoord
        .as_ref()
        .filter(|a| a.beeld.module == Module::Notition)
        .map(|a| {
            a.beeld
                .velden
                .iter()
                .map(|v| v.tekst.split_whitespace().count())
                .collect()
        })
        .unwrap_or_default();
    t.markdown = t
        .antwoord
        .as_ref()
        .and_then(|a| a.beeld.velden.iter().find(|v| v.naam == "Markdown"))
        .map(|v| iced::widget::markdown::parse(&v.tekst).collect())
        .unwrap_or_default();
    t.notitie_editors = t
        .antwoord
        .as_ref()
        .filter(|a| a.beeld.module == Module::Notition)
        .map(|a| {
            a.beeld
                .velden
                .iter()
                .enumerate()
                .map(|(n, v)| (n != t.gekozen).then(|| text_editor::Content::with_text(&v.tekst)))
                .collect()
        })
        .unwrap_or_default();
}
pub(super) fn inhoud(t: &Tab, n: usize) -> Option<&text_editor::Content> {
    if n == t.gekozen {
        Some(&t.editor)
    } else {
        t.notitie_editors.get(n)?.as_ref()
    }
}
pub(super) fn kies_veld(t: &mut Tab, n: usize) -> bool {
    if t.notitie_editors.len() <= n {
        return false;
    }
    if n != t.gekozen {
        let Some(nieuw) = t.notitie_editors[n].take() else {
            return false;
        };
        t.notitie_editors[t.gekozen] = Some(std::mem::replace(&mut t.editor, nieuw));
        t.gekozen = n;
        t.editerversie = t.editerversie.wrapping_add(1);
        t.adres = t.veld().unwrap().id.clone();
        t.werk_opmaak_bij();
    }
    true
}
fn toets(k: text_editor::KeyPress) -> Option<text_editor::Binding<Msg>> {
    use text_editor::Binding as B;
    let tekst = k.text.clone();
    match klembord::toets(k)? {
        B::Insert(_) => Some(B::Sequence(
            tekst?
                .chars()
                .filter(|c| !c.is_control())
                .map(B::Insert)
                .collect(),
        )),
        ander => Some(ander),
    }
}
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
                        knop("Vrij canvas", A::KopieerSectie { markdown: false }),
                        knop("Markdown", A::KopieerSectie { markdown: true }),
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
    // De oorspronkelijke Office-schil volgt het thema, het notitieblad blijft licht.
    let l = stijl::office(Look::from(ThemeId::Light)).with_text_size(app.look().text_size);
    let c = l.color;
    let Some(p) = &a.beeld.notitie else {
        return row![
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
    let editor = |n: usize, hoogte| {
        let veld = &a.beeld.velden[n];
        let hash = a.hash.clone();
        let id = veld.id.clone();
        openaec_ui::design::a11y::named(
            text_editor(inhoud(t, n).expect("Notitievelden hebben een eigen editor"))
                .key_binding(toets)
                .on_action(move |actie| Msg::NotitieInvoer {
                    document: t.id,
                    hash: hash.clone(),
                    veld: id.clone(),
                    actie,
                })
                .font(iced::Font {
                    weight: if n == 0 || veld.opmaak.vet {
                        iced::font::Weight::Bold
                    } else {
                        iced::font::Weight::Normal
                    },
                    style: if veld.opmaak.cursief {
                        iced::font::Style::Italic
                    } else {
                        iced::font::Style::Normal
                    },
                    ..if n == 0 { fonts::HEADING } else { fonts::BODY }
                })
                .size(if n == 0 {
                    29.
                } else {
                    match veld.naam.as_str() {
                        "kop" => 24.,
                        "subkop" => 18.,
                        _ => 13.,
                    }
                })
                .line_height(iced::advanced::text::LineHeight::Relative(if n == 0 {
                    1.4
                } else {
                    1.9
                }))
                .padding(0)
                .style(move |thema, status| {
                    let mut stijl = text_editor::default(thema, status);
                    stijl.value = c.text;
                    stijl.background = iced::Color::TRANSPARENT.into();
                    stijl.border.color = c.focus;
                    if !matches!(status, text_editor::Status::Focused { .. }) {
                        stijl.border.width = 0.;
                    }
                    stijl
                })
                .height(hoogte),
            openaec_ui::design::a11y::Role::TextField,
            if n == 0 {
                "Paginatitel"
            } else {
                "Notitietekst"
            },
        )
    };
    let werk: Element<_> = if p.markdown {
        let md = a.beeld.velden.iter().position(|v| v.naam == "Markdown");
        let bewerk: Element<_> = md
            .map(|n| editor(n, Length::Fill))
            .unwrap_or_else(|| Space::new().into());
        let voorbeeld = markdown::view(
            t.markdown.iter(),
            markdown::Settings::with_style(markdown::Style::from_palette(
                ThemeId::Light.iced().palette(),
            )),
        )
        .map(|uri| Msg::Koppeling(uri.to_string()));
        row![
            container(bewerk).padding(24).width(Length::FillPortion(1)),
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
            let actief = vak.velden.contains(&t.gekozen) || (t.gekozen == 0 && vak.index == 0);
            let mut tekst = column![].spacing(2);
            for &n in &vak.velden {
                tekst = tekst.push(editor(n, Length::Shrink));
            }
            let inhoud = column![
                container(
                    row![
                        w::glyph(include_str!("../assets/sleepgreep.svg"), 10., greep, greep),
                        iced::widget::text(format!("Tekstvak {}", vak.index + 1))
                            .font(fonts::BODY)
                            .size(9)
                            .color(if actief { c.accent } else { c.text_muted })
                    ]
                    .spacing(8)
                    .align_y(iced::Alignment::Center)
                )
                .height(25)
                .padding([4, 9])
                .width(Length::Fill)
                .style(move |_| container::Style {
                    background: Some(iced::Color::from_rgb8(250, 250, 249).into()),
                    ..Default::default()
                }),
                container(scrollable(tekst))
                    .padding(iced::Padding {
                        top: 11.,
                        right: 18.,
                        bottom: 3.,
                        left: 18.
                    })
                    .height(Length::Fill),
                container(
                    row![
                        w::button(
                            l,
                            "+",
                            K::Quiet,
                            D::Compact,
                            None,
                            (!t.bezig && !t.concept)
                                .then_some(Msg::Notitie(A::NieuwBlok(vak.index)))
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
                        openaec_ui::design::a11y::named(
                            w::glyph(include_str!("../assets/formaatgreep.svg"), 12., hoek, hoek),
                            openaec_ui::design::a11y::Role::Group,
                            format!("Formaatgreep tekstvak {}", vak.index + 1),
                        )
                    ]
                    .spacing(4)
                    .align_y(iced::Alignment::End)
                )
                .padding(iced::Padding {
                    top: 0.,
                    right: 8.,
                    bottom: 8.,
                    left: 8.
                })
            ]
            .height(Length::Fill);
            let kaart = container(inhoud)
                .padding(1)
                .width(g.breedte * t.zoom)
                .height(g.hoogte * t.zoom)
                .style(move |_| container::Style {
                    background: Some(c.panel.into()),
                    border: iced::Border {
                        color: if actief {
                            iced::Color::from_rgba8(217, 119, 6, 0.5)
                        } else {
                            iced::Color::from_rgb8(231, 229, 228)
                        },
                        width: 1.,
                        radius: 5.into(),
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
            super::notitie_raster::raster(
                t,
                a,
                breedte * t.zoom,
                hoogte * t.zoom,
                !t.bezig
                    && !t.concept
                    && !t.schrijft
                    && a.beeld.velden.iter().any(|v| v.bewerkbaar),
            ),
            pin(
                iced::widget::text("Dubbelklik op een lege plek om een tekstvak toe te voegen")
                    .font(fonts::BODY)
                    .size(10)
                    .color(iced::Color::from_rgb8(120, 113, 108)),
            )
            .position([40., 10.])
            .into(),
        ];
        lagen.extend(kaarten);
        openaec_ui::design::a11y::named(
            scrollable(Stack::with_children(lagen))
                .direction(scrollable::Direction::Both {
                    horizontal: Default::default(),
                    vertical: Default::default(),
                })
                .height(Length::Fill),
            openaec_ui::design::a11y::Role::Group,
            "Notitiecanvas",
        )
    };
    let woorden = if t.notitie_woorden.len() == a.beeld.velden.len() {
        t.notitie_woorden.iter().skip(1).sum()
    } else {
        p.woorden
    };
    let boek = &p.overzicht.boeken[p.overzicht.boek];
    let sectie = &boek.secties[p.overzicht.sectie];
    let kop = column![
        container(
            iced::widget::text(format!("{}   /   {}", boek.naam, sectie.naam))
                .font(fonts::BODY)
                .size(10)
                .color(iced::Color::from_rgb8(120, 113, 108))
        )
        .height(48)
        .padding(iced::Padding {
            top: 17.,
            right: 32.,
            bottom: 0.,
            left: 32.
        }),
        Space::new().height(16),
        container(editor(0, Length::Fixed(49.))).padding([0, 32]),
        container(
            iced::widget::text(format!(
                "{}  ·  {} woorden",
                super::notitie_navigatie_ui::datum(&p.bijgewerkt),
                woorden
            ))
            .font(fonts::BODY)
            .size(10)
            .color(iced::Color::from_rgb8(120, 113, 108))
        )
        .height(33)
        .padding(iced::Padding {
            top: 4.,
            right: 32.,
            bottom: 15.,
            left: 32.
        })
    ];
    let blad = container(column![kop, werk].height(Length::Fill))
        .height(Length::Fill)
        .width(Length::Fill)
        .style(move |_| container::Style {
            background: Some(iced::Color::WHITE.into()),
            ..Default::default()
        });
    let (boeken, paginas) = super::notitie_navigatie_ui::kolommen(app, t, p);
    let rij = if t.panelen {
        row![boeken, paginas, blad]
    } else {
        row![blad]
    }
    .height(Length::Fill);
    let voet = container(
        row![
            iced::widget::text(if t.concept || t.gewijzigd() {
                "Niet opgeslagen"
            } else {
                "Lokaal opgeslagen"
            })
            .font(fonts::BODY)
            .size(10)
            .color(iced::Color::from_rgb8(120, 113, 108)),
            Space::new().width(Length::Fill),
            iced::widget::text(format!(
                "{} tekstvakken · {}% · Ctrl+Z ongedaan maken",
                p.vakken.len(),
                (t.zoom * 100.).round()
            ))
            .font(fonts::BODY)
            .size(9)
            .color(iced::Color::from_rgb8(120, 113, 108))
        ]
        .align_y(iced::Alignment::Center),
    )
    .height(26)
    .padding([5, 16])
    .width(Length::Fill)
    .style(move |_| container::Style {
        background: Some(iced::Color::from_rgb8(250, 250, 249).into()),
        ..Default::default()
    });
    column![rij, voet].height(Length::Fill).into()
}
