//! Modulegebonden lint; alleen aangesloten opdrachten zijn bedienbaar.
use super::*;
use iced::widget::{column, row};
use office_core::{document::Weergave, opmaak::Uitlijning};
use openaec_ui::ribbon_icons::RibbonIcon as R;
fn svg(r: R) -> &'static str {
    std::str::from_utf8(r.bytes()).expect("meegeleverd linticoon")
}
pub fn vul_beeldmaat(beeld: &mut Weergave) {
    if beeld.pagina.breedte > 0. {
        return;
    }
    if let Some(b) = &beeld.afbeelding
        && b.len() >= 24
        && b.starts_with(b"\x89PNG\r\n\x1a\n")
    {
        beeld.pagina.breedte = u32::from_be_bytes(b[16..20].try_into().unwrap()) as f32;
        beeld.pagina.hoogte = u32::from_be_bytes(b[20..24].try_into().unwrap()) as f32;
    }
}
pub fn ribbon(app: &App) -> Option<Element<'_, Msg>> {
    let t = app.tab()?;
    let a = t.antwoord.as_ref()?;
    let module = a.beeld.module;
    let lint = app.lint_soort();
    if module == Module::Writer && lint == LintSoort::Indeling {
        return Some(super::pagina_ui::ribbon(app, t));
    }
    if module == Module::Notition && lint == LintSoort::Start {
        return Some(super::notitie_ui::ribbon(app, t));
    }
    if lint != LintSoort::Start
        || !matches!(
            module,
            Module::Writer | Module::Spreadsheet | Module::Presentation
        )
    {
        return None;
    }
    let l = app.look();
    let veld = t.veld();
    let staat = veld.map(|v| &v.opmaak);
    let kan =
        !t.bezig && !t.concept && veld.is_some_and(|v| v.bewerkbaar && v.id != "__dia_notities");
    let opmaak = |r, naam, actief, o| {
        w::ribbon_small(l, svg(r), naam, actief, kan.then_some(Msg::Opmaak(o)))
    };
    let tekst = column![
        row![
            openaec_ui::design::a11y::named(
                text_input("Lettertype", &t.lettertype)
                    .on_input(Msg::Lettertype)
                    .on_submit_maybe(
                        (kan && !t.lettertype.trim().is_empty())
                            .then(|| Msg::Opmaak(Opmaak::Lettertype(t.lettertype.clone())))
                    )
                    .width(140)
                    .padding(5),
                openaec_ui::design::a11y::Role::TextField,
                "Lettertype"
            ),
            openaec_ui::design::a11y::named(
                text_input("Grootte", &t.grootte)
                    .on_input(Msg::Grootte)
                    .on_submit_maybe(
                        t.grootte
                            .parse::<f64>()
                            .ok()
                            .filter(|n| n.is_finite() && (1.0..=400.).contains(n))
                            .map(|n| Msg::Opmaak(Opmaak::Lettergrootte(n)))
                    )
                    .width(54)
                    .padding(5),
                openaec_ui::design::a11y::Role::TextField,
                "Lettergrootte"
            )
        ]
        .spacing(5),
        row![
            opmaak(
                R::TextBold,
                "Vet",
                staat.is_some_and(|s| s.vet),
                Opmaak::Vet(!staat.is_some_and(|s| s.vet))
            ),
            opmaak(
                R::TextItalic,
                "Cursief",
                staat.is_some_and(|s| s.cursief),
                Opmaak::Cursief(!staat.is_some_and(|s| s.cursief))
            ),
        ]
        .spacing(3),
        if module != Module::Spreadsheet {
            opmaak(
                R::TextUnderline,
                "Onderstrepen",
                staat.is_some_and(|s| s.onderstrepen),
                Opmaak::Onderstrepen(!staat.is_some_and(|s| s.onderstrepen)),
            )
        } else {
            w::ribbon_small(
                l,
                svg(R::TextUnderline),
                "Doorhalen",
                staat.is_some_and(|s| s.doorhalen),
                kan.then_some(Msg::Opmaak(Opmaak::Doorhalen(
                    !staat.is_some_and(|s| s.doorhalen),
                ))),
            )
        }
    ]
    .spacing(3);
    let uitlijning = column![
        opmaak(
            R::TextAlignLeft,
            "Links",
            false,
            Opmaak::Uitlijning(Uitlijning::Links)
        ),
        opmaak(
            R::TextAlignCenter,
            "Centreren",
            false,
            Opmaak::Uitlijning(Uitlijning::Midden)
        ),
        opmaak(
            R::TextAlignRight,
            "Rechts",
            false,
            Opmaak::Uitlijning(Uitlijning::Rechts)
        ),
    ]
    .spacing(2);
    let bewaren = column![
        w::ribbon_small(
            l,
            icoon(Icon::Save),
            "Opslaan",
            false,
            (!t.bezig && !t.schrijft).then_some(Msg::Opslaan(t.id, false))
        ),
        w::ribbon_small(l, icoon(Icon::Open), "Openen", false, Some(Msg::Open)),
        w::ribbon_small(
            l,
            icoon(Icon::Export),
            "IFCX",
            false,
            (!t.bezig).then_some(Msg::Archiveer)
        ),
    ]
    .spacing(2);
    let geschiedenis = column![
        w::ribbon_small(
            l,
            icoon(Icon::Undo),
            "Ongedaan maken",
            false,
            (!t.bezig && (t.concept || a.terug)).then_some(Msg::Terug)
        ),
        w::ribbon_small(
            l,
            icoon(Icon::Redo),
            "Opnieuw",
            false,
            (!t.bezig && !t.concept && a.vooruit).then_some(Msg::Vooruit)
        ),
        w::ribbon_small(
            l,
            icoon(Icon::Check),
            "Tekst toepassen",
            false,
            (!t.bezig && t.concept).then_some(Msg::PasToe)
        ),
    ]
    .spacing(2);
    let zoom = column![
        w::ribbon_small(
            l,
            icoon(Icon::ZoomIn),
            "Inzoomen",
            false,
            (t.zoom < 3.).then_some(Msg::Zoom(t.zoom + 0.1))
        ),
        w::ribbon_small(
            l,
            icoon(Icon::ZoomOut),
            "Uitzoomen",
            false,
            (t.zoom > 0.25).then_some(Msg::Zoom(t.zoom - 0.1))
        ),
        w::button(l, "100%", K::Quiet, D::Compact, None, Some(Msg::Zoom(1.))),
    ]
    .spacing(2);
    let mut groepen = vec![
        w::ribbon_group(l, "Bestand", vec![bewaren.into()]),
        w::ribbon_group(l, "Bewerken", vec![geschiedenis.into()]),
        w::ribbon_group(l, "Lettertype", vec![tekst.into()]),
        w::ribbon_group(l, "Uitlijning", vec![uitlijning.into()]),
    ];
    if module == Module::Spreadsheet {
        let actie = |naam, actie| {
            w::ribbon_small(
                l,
                svg(R::InsertTable),
                naam,
                false,
                kan.then_some(Msg::Structuur(actie)),
            )
        };
        groepen.push(w::ribbon_group(
            l,
            "Cellen",
            vec![
                column![
                    actie("Rij invoegen", Structuur::RijInvoegen),
                    actie("Kolom invoegen", Structuur::KolomInvoegen),
                    actie("Samenvoegen", Structuur::Samenvoegen)
                ]
                .spacing(2)
                .into(),
                column![
                    actie("Rij verwijderen", Structuur::RijVerwijderen),
                    actie("Kolom verwijderen", Structuur::KolomVerwijderen),
                    actie("Samenvoeging opheffen", Structuur::Splitsen)
                ]
                .spacing(2)
                .into(),
            ],
        ));
        groepen.push(w::ribbon_group(
            l,
            "Getal",
            vec![
                column![
                    w::ribbon_small(
                        l,
                        svg(R::TextBold),
                        "Getal",
                        false,
                        kan.then_some(Msg::Opmaak(Opmaak::Getal("0.00".into())))
                    ),
                    w::ribbon_small(
                        l,
                        svg(R::TextBold),
                        "Percentage",
                        false,
                        kan.then_some(Msg::Opmaak(Opmaak::Getal("0.00%".into())))
                    ),
                    w::ribbon_small(
                        l,
                        svg(R::TextBold),
                        "Datum",
                        false,
                        kan.then_some(Msg::Opmaak(Opmaak::Getal("yyyy-mm-dd".into())))
                    ),
                ]
                .spacing(2)
                .into(),
            ],
        ));
    } else if module == Module::Presentation {
        use office_core::presentatie::DiaActie as A;
        groepen.push(w::ribbon_group(
            l,
            "Dia’s",
            vec![
                column![
                    w::ribbon_small(
                        l,
                        icoon(Icon::New),
                        "Nieuwe dia",
                        false,
                        (!t.bezig && !t.concept).then_some(Msg::Dia(A::Toevoegen))
                    ),
                    w::ribbon_small(
                        l,
                        svg(R::DrawingRectangle),
                        "Tekstvak",
                        false,
                        (!t.bezig && !t.concept).then_some(Msg::Dia(A::Tekstvak))
                    ),
                    w::ribbon_small(
                        l,
                        icoon(Icon::Close),
                        "Dia verwijderen",
                        false,
                        (!t.bezig && !t.concept && a.beeld.onderdelen.len() > 1)
                            .then_some(Msg::Dia(A::Verwijderen))
                    ),
                ]
                .spacing(2)
                .into(),
            ],
        ));
    } else {
        groepen.push(w::ribbon_group(
            l,
            "Alinea",
            vec![
                column![
                    w::ribbon_small(
                        l,
                        icoon(Icon::New),
                        "Splitsen bij cursor",
                        false,
                        kan.then_some(Msg::SplitsAlinea)
                    ),
                    w::ribbon_small(
                        l,
                        icoon(Icon::Rename),
                        "Volgende samenvoegen",
                        false,
                        kan.then_some(Msg::VoegAlineasSamen)
                    ),
                ]
                .spacing(2)
                .into(),
            ],
        ));
        groepen.push(w::ribbon_group(
            l,
            "Exporteren",
            vec![
                w::ribbon_large(
                    l,
                    icoon(Icon::Export),
                    "Exporteren",
                    false,
                    (!t.bezig && !t.concept && !app.export_bezig).then_some(Msg::ExportMenu),
                ),
                w::ribbon_large(
                    l,
                    icoon(Icon::Export),
                    "Markdown",
                    false,
                    (!t.bezig).then_some(Msg::Markdown),
                ),
            ],
        ));
    }
    if module != Module::Writer {
        groepen.push(w::ribbon_group(
            l,
            "Exporteren",
            vec![w::ribbon_large(
                l,
                icoon(Icon::Export),
                "Exporteren",
                false,
                (!t.bezig && !t.concept && !app.export_bezig).then_some(Msg::ExportMenu),
            )],
        ));
    }
    groepen.push(w::ribbon_group(
        l,
        "Weergave",
        vec![
            zoom.into(),
            w::ribbon_large(
                l,
                icoon(Icon::Settings),
                "Panelen",
                t.panelen,
                Some(Msg::Panelen),
            ),
        ],
    ));
    Some(w::ribbon(l, groepen))
}

/// Iced levert UTF-8-bytekolommen; de documentopdracht gebruikt Unicode-tekens.
pub fn tekenoffset(
    inhoud: &text_editor::Content,
    p: iced::advanced::text::editor::Position,
) -> usize {
    let vorige = inhoud
        .lines()
        .take(p.line)
        .map(|l| l.text.chars().count() + 1)
        .sum::<usize>();
    vorige
        + inhoud
            .line(p.line)
            .map(|l| {
                l.text
                    .char_indices()
                    .take_while(|(byte, _)| *byte < p.column)
                    .count()
            })
            .unwrap_or_default()
}
