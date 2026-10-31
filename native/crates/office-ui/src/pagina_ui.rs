//! Pagina-voorkeuzes werken op de sectie van de gekozen body-alinea.
use super::*;
use iced::widget::column;
use office_core::writer_pagina::{PaginaActie as A, Papier};
use openaec_ui::ribbon_icons::RibbonIcon as R;
fn svg(r: R) -> &'static str {
    std::str::from_utf8(r.bytes()).expect("meegeleverd linticoon")
}
pub fn ribbon<'a>(app: &'a App, t: &'a Tab) -> Element<'a, Msg> {
    let l = app.look();
    let kan = !t.bezig && !t.concept && t.veld().is_some();
    let actie = |naam, r, a| w::ribbon_small(l, svg(r), naam, false, kan.then_some(Msg::Pagina(a)));
    let papier = |p: Papier| actie(p.naam(), R::ReportPortrait, A::Papier(p));
    let marge = |naam, boven, onder, links, rechts| {
        actie(
            naam,
            R::ReportPortrait,
            A::Marges {
                boven,
                onder,
                links,
                rechts,
            },
        )
    };
    w::ribbon(
        l,
        vec![
            w::ribbon_group(
                l,
                "Afdrukstand",
                vec![
                    column![
                        actie("Staand", R::ReportPortrait, A::Liggend(false)),
                        actie("Liggend", R::ReportLandscape, A::Liggend(true))
                    ]
                    .spacing(2)
                    .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Papierformaat",
                vec![
                    column![papier(Papier::A3), papier(Papier::A4), papier(Papier::A5)]
                        .spacing(2)
                        .into(),
                    column![papier(Papier::Letter), papier(Papier::Legal)]
                        .spacing(2)
                        .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Marges",
                vec![
                    column![
                        marge("Normaal", 1440., 1440., 1440., 1440.),
                        marge("Smal", 720., 720., 720., 720.)
                    ]
                    .spacing(2)
                    .into(),
                    column![
                        marge("Gemiddeld", 1440., 1440., 1080., 1080.),
                        marge("Breed", 1440., 1440., 2880., 2880.)
                    ]
                    .spacing(2)
                    .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Tekstkolommen",
                vec![
                    [(1, "Eén kolom"), (2, "Twee kolommen"), (3, "Drie kolommen")]
                        .into_iter()
                        .map(|(aantal, naam)| {
                            actie(
                                naam,
                                R::ReportPortrait,
                                A::Kolommen {
                                    aantal,
                                    tussenruimte: 720.,
                                    lijn: false,
                                },
                            )
                        })
                        .collect::<iced::widget::Column<'_, Msg>>()
                        .spacing(2)
                        .into(),
                ],
            ),
            w::ribbon_group(
                l,
                "Toepassen",
                vec![w::secondary(l, "Op de sectie van de gekozen alinea").into()],
            ),
        ],
    )
}
