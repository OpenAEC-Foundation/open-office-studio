//! Modulegebonden lint; alleen aangesloten opdrachten zijn bedienbaar.
use super::*;
use iced::widget::{column, row};
use office_core::{document::Weergave, opmaak::Uitlijning};
use openaec_ui::ribbon_icons::RibbonIcon as R;
fn svg(r: R) -> &'static str {
    std::str::from_utf8(r.bytes()).expect("meegeleverd linticoon")
}
/// Een komma en een punt zijn toegestaan; duizendtallen horen niet in dit veld.
pub fn lettergrootte(tekst: &str) -> Option<f64> {
    let tekst = tekst.trim();
    if tekst.is_empty()
        || !tekst
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, ',' | '.'))
        || tekst.chars().filter(|c| matches!(c, ',' | '.')).count() > 1
    {
        return None;
    }
    tekst
        .replace(',', ".")
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite() && (1.0..=400.).contains(n))
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
    let selectie = t.opmaak_van_selectie();
    let staat = selectie.as_ref();
    let kan =
        !t.bezig && !t.concept && veld.is_some_and(|v| v.bewerkbaar && v.id != "__dia_notities");
    let knop = |bron, naam, actief, bericht| {
        w::with_tooltip(
            l,
            w::icon_button(l, bron, 22., actief, naam, bericht),
            naam,
            None,
        )
    };
    let compact = |bron, naam, actief, o| {
        w::with_tooltip(
            l,
            w::icon_button_with(
                l,
                bron,
                26.,
                actief,
                openaec_ui::design::a11y::Node::new(
                    openaec_ui::design::a11y::Role::ToggleButton,
                    naam,
                )
                .checked(actief)
                .disabled(!kan),
                kan.then_some(Msg::Opmaak(o)),
            ),
            naam,
            None,
        )
    };
    let mut tekstopmaak = row![
        compact(
            svg(R::TextBold),
            "Vet",
            staat.is_some_and(|s| s.vet),
            Opmaak::Vet(!staat.is_some_and(|s| s.vet))
        ),
        compact(
            svg(R::TextItalic),
            "Cursief",
            staat.is_some_and(|s| s.cursief),
            Opmaak::Cursief(!staat.is_some_and(|s| s.cursief))
        )
    ]
    .spacing(2);
    if module != Module::Spreadsheet {
        tekstopmaak = tekstopmaak.push(compact(
            svg(R::TextUnderline),
            "Onderstrepen",
            staat.is_some_and(|s| s.onderstrepen),
            Opmaak::Onderstrepen(!staat.is_some_and(|s| s.onderstrepen)),
        ));
    }
    if module != Module::Presentation {
        tekstopmaak = tekstopmaak.push(compact(
            DOORHALEN,
            "Doorhalen",
            staat.is_some_and(|s| s.doorhalen),
            Opmaak::Doorhalen(!staat.is_some_and(|s| s.doorhalen)),
        ));
    }
    let invoer = row![
        openaec_ui::design::a11y::node(
            text_input("Lettertype", &t.lettertype)
                .on_input_maybe(kan.then_some(Msg::Lettertype))
                .on_submit_maybe(
                    (kan && !t.lettertype.trim().is_empty())
                        .then(|| Msg::Opmaak(Opmaak::Lettertype(t.lettertype.clone())))
                )
                .width(152)
                .padding(5),
            openaec_ui::design::a11y::Node::new(
                openaec_ui::design::a11y::Role::TextField,
                "Lettertype"
            )
            .disabled(!kan)
        ),
        openaec_ui::design::a11y::node(
            text_input("Grootte", &t.grootte)
                .on_input_maybe(kan.then_some(Msg::Grootte))
                .on_submit_maybe(
                    kan.then(|| lettergrootte(&t.grootte))
                        .flatten()
                        .map(|n| Msg::Opmaak(Opmaak::Lettergrootte(n)))
                )
                .width(54)
                .padding(5),
            openaec_ui::design::a11y::Node::new(
                openaec_ui::design::a11y::Role::TextField,
                "Lettergrootte"
            )
            .disabled(!kan)
        )
    ]
    .spacing(3);
    let maat = staat.and_then(|s| s.grootte);
    let tekst = column![
        row![
            invoer,
            knop(
                GROTER,
                "Lettertype vergroten",
                false,
                kan.then(|| maat.and_then(|n| volgende_grootte(n, true)))
                    .flatten()
                    .map(|n| Msg::Opmaak(Opmaak::Lettergrootte(n)))
            ),
            knop(
                KLEINER,
                "Lettertype verkleinen",
                false,
                kan.then(|| maat.and_then(|n| volgende_grootte(n, false)))
                    .flatten()
                    .map(|n| Msg::Opmaak(Opmaak::Lettergrootte(n)))
            )
        ]
        .spacing(2)
        .width(266),
        tekstopmaak
    ]
    .spacing(6);
    // Zonder opgeloste alineastatus zijn dit opdrachten, geen onterecht
    // uitgeschakelde wisselknoppen voor de huidige uitlijning.
    let alinea = |bron, naam, o| {
        w::with_tooltip(
            l,
            w::icon_button(l, bron, 26., false, naam, kan.then_some(Msg::Opmaak(o))),
            naam,
            None,
        )
    };
    let mut uitlijning = row![
        alinea(
            svg(R::TextAlignLeft),
            "Links",
            Opmaak::Uitlijning(Uitlijning::Links)
        ),
        alinea(
            svg(R::TextAlignCenter),
            "Centreren",
            Opmaak::Uitlijning(Uitlijning::Midden)
        ),
        alinea(
            svg(R::TextAlignRight),
            "Rechts",
            Opmaak::Uitlijning(Uitlijning::Rechts)
        )
    ]
    .spacing(2);
    if module != Module::Spreadsheet {
        uitlijning = uitlijning.push(alinea(
            UITVULLEN,
            "Uitvullen",
            Opmaak::Uitlijning(Uitlijning::Uitvullen),
        ));
    }
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
    let klembord = w::ribbon_group(
        l,
        "Klembord",
        vec![
            w::ribbon_large(
                l,
                svg(R::ClipboardPaste),
                "Plakken",
                false,
                klembord::kan(app, klembord::Actie::Plak)
                    .then_some(Msg::Klembord(klembord::Actie::Plak)),
            ),
            column![
                knop(
                    svg(R::ClipboardCut),
                    "Knippen",
                    false,
                    klembord::kan(app, klembord::Actie::Knip)
                        .then_some(Msg::Klembord(klembord::Actie::Knip))
                ),
                knop(
                    svg(R::ClipboardCopy),
                    "Kopiëren",
                    false,
                    klembord::kan(app, klembord::Actie::Kopieer)
                        .then_some(Msg::Klembord(klembord::Actie::Kopieer))
                )
            ]
            .spacing(4)
            .width(26)
            .into(),
        ],
    );
    let mut groepen = vec![];
    if module == Module::Writer {
        let historie = column![
            knop(
                icoon(Icon::Undo),
                "Ongedaan maken",
                false,
                (!t.bezig && (t.concept || a.terug)).then_some(Msg::Terug)
            ),
            knop(
                icoon(Icon::Redo),
                "Opnieuw",
                false,
                (!t.bezig && !t.concept && a.vooruit).then_some(Msg::Vooruit)
            ),
            knop(
                icoon(Icon::Check),
                "Tekst toepassen",
                false,
                (!t.bezig && t.concept).then_some(Msg::PasToe)
            )
        ]
        .spacing(2)
        .width(55)
        .align_x(iced::Alignment::Center);
        groepen.push(w::ribbon_group(l, "Bewerken", vec![historie.into()]));
    } else {
        groepen.push(w::ribbon_group(l, "Bestand", vec![bewaren.into()]));
        groepen.push(w::ribbon_group(l, "Bewerken", vec![geschiedenis.into()]));
    }
    groepen.push(klembord);
    groepen.extend(vec![
        w::ribbon_group(l, "Lettertype", vec![tekst.into()]),
        w::ribbon_group(l, "Uitlijning", vec![uitlijning.into()]),
    ]);
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
    }
    if module == Module::Writer {
        groepen.push(w::ribbon_group(
            l,
            "Zoeken",
            vec![w::ribbon_large(
                l,
                icoon(Icon::Search),
                "Zoeken",
                false,
                (!t.bezig && !t.concept && !t.schrijft)
                    .then_some(Msg::Zoeken(crate::zoeken_ui::Bericht::Open(false))),
            )],
        ));
    }
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

// Eigen lijniconen voor opdrachten buiten de vaste catalogus.
const DOORHALEN: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M17 5c-1-1-3-2-5-2-3 0-5 2-5 4 0 1 1 2 2 3m6 4c2 1 3 2 3 3 0 3-3 4-6 4-2 0-4-1-5-2"/></svg>"#;
const UITVULLEN: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5h16M4 10h16M4 15h16M4 20h16"/></svg>"#;
const GROTER: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 19 4-12 4 12m-6-4h4m9-10v9m-3-6 3-3 3 3"/></svg>"#;
const KLEINER: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 19 4-12 4 12m-6-4h4m9-10v9m-3-3 3 3 3-3"/></svg>"#;
fn volgende_grootte(n: f64, groter: bool) -> Option<f64> {
    if !n.is_finite() || !(1.0..=400.0).contains(&n) {
        return None;
    }
    let reeks = [
        1., 2., 3., 4., 5., 6., 7., 8., 9., 10., 11., 12., 14., 16., 18., 20., 22., 24., 26., 28.,
        36., 48., 72.,
    ];
    // Boven de keuzereeks blijven de stappen één punt; verkleinen mag
    // bijvoorbeeld 80 punt niet ineens naar 72 punt laten springen.
    let doel = if n > 72. {
        if groter {
            (n + 1.).min(400.)
        } else {
            (n - 1.).max(72.)
        }
    } else if groter {
        reeks
            .into_iter()
            .find(|v| *v > n)
            .unwrap_or((n + 1.).min(400.))
    } else {
        reeks
            .into_iter()
            .rev()
            .find(|v| *v < n)
            .unwrap_or((n - 1.).max(1.))
    };
    (doel != n).then_some(doel)
}
