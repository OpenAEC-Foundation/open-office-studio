//! Diavoorbeelden worden afzonderlijk en begrensd op de documentwerkdraad gemaakt.
use super::*;
use iced::widget::column;
use std::collections::{HashSet, VecDeque};
const CACHE: usize = 20;
const RIJ: f32 = 96.;
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Doel {
    pub document: u64,
    pub hash: String,
    pub deel: usize,
    nummer: u64,
}
#[derive(Debug, Clone)]
pub(super) enum Bericht {
    Gereed(Doel, Result<office_core::presentatie::Miniatuur, String>),
    Schuif {
        document: u64,
        hash: String,
        y: f32,
    },
    Invoer {
        document: u64,
        hash: String,
        deel: usize,
        actie: text_editor::Action,
    },
}
#[derive(Default)]
pub(super) struct Staat {
    hash: String,
    beelden: VecDeque<(usize, image::Handle)>,
    bezig: Option<Doel>,
    nummer: u64,
    eerste: usize,
    fouten: HashSet<usize>,
    editors: Vec<Option<text_editor::Content>>,
}
impl Staat {
    fn synchroniseer(&mut self, hash: &str) {
        if self.hash != hash {
            self.hash = hash.into();
            self.beelden.clear();
            self.fouten.clear();
            self.bezig = None;
        }
    }
    fn volgende(&mut self, document: u64, hash: &str, aantal: usize) -> Option<Doel> {
        self.synchroniseer(hash);
        if self.bezig.is_some() {
            return None;
        }
        let eerste = self.eerste.min(aantal.saturating_sub(1));
        let deel = (eerste..aantal.min(eerste.saturating_add(CACHE)))
            .find(|n| !self.beelden.iter().any(|(d, _)| d == n) && !self.fouten.contains(n))?;
        self.nummer = self.nummer.wrapping_add(1);
        let doel = Doel {
            document,
            hash: hash.into(),
            deel,
            nummer: self.nummer,
        };
        self.bezig = Some(doel.clone());
        Some(doel)
    }
}
pub(super) fn vernieuw_editors(t: &mut Tab) {
    t.presentatie.editors = t
        .antwoord
        .as_ref()
        .filter(|a| a.beeld.module == Module::Presentation)
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
pub(super) fn kies_veld(t: &mut Tab, n: usize) -> bool {
    if n >= t.presentatie.editors.len() {
        return false;
    }
    if n != t.gekozen {
        let Some(inhoud) = t.presentatie.editors[n].take() else {
            return false;
        };
        t.presentatie.editors[t.gekozen] = Some(std::mem::replace(&mut t.editor, inhoud));
        t.gekozen = n;
        t.editerversie = t.editerversie.wrapping_add(1);
        t.adres = t.veld().unwrap().id.clone();
        t.werk_opmaak_bij();
    }
    true
}
pub(super) fn vraag(app: &mut App) -> Task<Msg> {
    if app.bestand
        || app.instellingen
        || app.postvak_zichtbaar
        || app.exportblad.is_some()
        || app.sluiten.is_some()
    {
        return Task::none();
    }
    let Some(t) = app.tab_mut().filter(|t| !t.bezig) else {
        return Task::none();
    };
    let Some(a) = &t.antwoord else {
        return Task::none();
    };
    if a.beeld.module != Module::Presentation {
        return Task::none();
    }
    let Some(doel) = t
        .presentatie
        .volgende(t.id, &a.hash, a.beeld.onderdelen.len())
    else {
        return Task::none();
    };
    Task::perform(
        app.werker
            .clone()
            .miniatuur(doel.document, doel.hash.clone(), doel.deel),
        move |r| Msg::Presentatie(Bericht::Gereed(doel.clone(), r)),
    )
}
pub(super) fn update(app: &mut App, bericht: Bericht) -> Task<Msg> {
    if matches!(&bericht, Bericht::Invoer { .. })
        && (app.bestand || app.instellingen || app.postvak_zichtbaar)
    {
        return Task::none();
    }
    match bericht {
        Bericht::Gereed(doel, r) => {
            if let Some(t) = app.tabs.iter_mut().find(|t| t.id == doel.document)
                && t.presentatie.bezig.as_ref() == Some(&doel)
            {
                t.presentatie.bezig = None;
                if t.antwoord
                    .as_ref()
                    .is_some_and(|a| a.hash == doel.hash && a.beeld.module == Module::Presentation)
                {
                    match r {
                        Ok(m) => {
                            t.presentatie.beelden.retain(|(n, _)| *n != doel.deel);
                            if t.presentatie.beelden.len() >= CACHE {
                                t.presentatie.beelden.pop_front();
                            }
                            t.presentatie
                                .beelden
                                .push_back((doel.deel, image::Handle::from_bytes(m.bytes)));
                            if m.overgeslagen_afbeeldingen > 0 {
                                t.presentatie.fouten.insert(doel.deel);
                            }
                        }
                        Err(_) => {
                            t.presentatie.fouten.insert(doel.deel);
                        }
                    }
                }
            }
        }
        Bericht::Schuif { document, hash, y } => {
            if let Some(t) = app
                .tab_mut()
                .filter(|t| t.id == document && t.antwoord.as_ref().is_some_and(|a| a.hash == hash))
                && y.is_finite()
                && y >= 0.
            {
                t.presentatie.eerste = (y / RIJ) as usize;
            }
        }
        Bericht::Invoer {
            document,
            hash,
            deel,
            actie,
        } => {
            let Some(t) = app.tab_mut().filter(|t| {
                t.id == document
                    && t.deel == deel
                    && !t.bezig
                    && !t.schrijft
                    && t.antwoord
                        .as_ref()
                        .is_some_and(|a| a.hash == hash && a.beeld.module == Module::Presentation)
            }) else {
                return Task::none();
            };
            let Some(n) = t
                .antwoord
                .as_ref()
                .unwrap()
                .beeld
                .velden
                .iter()
                .position(|v| v.id == "__dia_notities")
            else {
                return Task::none();
            };
            if n != t.gekozen && t.concept {
                return app
                    .waarschuwing("Pas de huidige tekst eerst toe of maak de invoer ongedaan");
            }
            if kies_veld(t, n) {
                return app.update(Msg::Invoer(actie));
            }
        }
    }
    vraag(app)
}
pub(super) fn navigator<'a>(app: &'a App, t: &'a Tab, a: &'a Antwoord) -> Element<'a, Msg> {
    use iced::widget::{Space, button};
    let licht = stijl::office(
        Display {
            theme: ThemeId::Light,
            ..app.display
        }
        .look(),
    );
    let mut dias = column![].spacing(0);
    for (n, naam) in a.beeld.onderdelen.iter().enumerate() {
        let inhoud: Element<'_, Msg> = match t.presentatie.beelden.iter().find(|(i, _)| *i == n) {
            Some((_, h)) => image(h.clone())
                .width(128)
                .height(72)
                .content_fit(iced::ContentFit::Contain)
                .into(),
            None => container(w::body(
                licht,
                if t.presentatie.fouten.contains(&n) {
                    "Niet beschikbaar"
                } else {
                    "Laden…"
                },
            ))
            .width(128)
            .height(72)
            .center(Length::Fill)
            .into(),
        };
        let geselecteerd = n == t.deel;
        let actie = openaec_ui::design::a11y::named(
            button(
                row![
                    container(
                        iced::widget::text((n + 1).to_string())
                            .font(fonts::BODY)
                            .size(11)
                            .color(iced::Color::from_rgb8(100, 112, 135))
                    )
                    .width(18)
                    .align_x(iced::Alignment::End),
                    inhoud
                ]
                .spacing(7),
            )
            .padding(4)
            .width(164)
            .height(84)
            .on_press_maybe((!t.bezig && !t.concept).then_some(Msg::Deel(n)))
            .style(move |_, status| iced::widget::button::Style {
                background: Some(
                    if geselecteerd {
                        iced::Color::from_rgb8(255, 250, 241)
                    } else if status == iced::widget::button::Status::Hovered {
                        iced::Color::from_rgb8(231, 234, 238)
                    } else {
                        iced::Color::TRANSPARENT
                    }
                    .into(),
                ),
                border: iced::Border {
                    color: if geselecteerd {
                        iced::Color::from_rgb8(193, 138, 55)
                    } else {
                        iced::Color::TRANSPARENT
                    },
                    width: 2.,
                    radius: 4.into(),
                },
                text_color: iced::Color::from_rgb8(71, 85, 105),
                ..Default::default()
            }),
            openaec_ui::design::a11y::Role::Button,
            format!("Dia {}: {}", n + 1, naam),
        );
        dias = dias.push(container(actie).height(RIJ));
    }
    let id = t.id;
    let hash = a.hash.clone();
    container(
        scrollable(column![Space::new().height(14), dias].padding([0, 10])).on_scroll(move |v| {
            Msg::Presentatie(Bericht::Schuif {
                document: id,
                hash: hash.clone(),
                y: v.absolute_offset().y,
            })
        }),
    )
    .width(184)
    .height(Length::Fill)
    .style(|_| container::Style {
        background: Some(iced::Color::from_rgb8(241, 243, 245).into()),
        border: iced::Border {
            color: iced::Color::from_rgb8(220, 225, 231),
            width: 1.,
            ..Default::default()
        },
        ..Default::default()
    })
    .into()
}
pub(super) fn met_notities<'a>(
    app: &'a App,
    t: &'a Tab,
    a: &'a Antwoord,
    werk: Element<'a, Msg>,
) -> Element<'a, Msg> {
    let Some(n) = a.beeld.velden.iter().position(|v| v.id == "__dia_notities") else {
        return werk;
    };
    let inhoud = if n == t.gekozen {
        Some(&t.editor)
    } else {
        t.presentatie.editors.get(n).and_then(|v| v.as_ref())
    };
    let Some(inhoud) = inhoud else {
        return werk;
    };
    let id = t.id;
    let hash = a.hash.clone();
    let deel = t.deel;
    let kan = !t.bezig && !t.schrijft;
    let editor = text_editor(inhoud)
        .id("presentatie-notities")
        .key_binding(klembord::toets)
        .height(64)
        .padding(8)
        .size(12)
        .style(|_, status| text_editor::Style {
            background: if matches!(status, text_editor::Status::Disabled) {
                iced::Color::from_rgb8(248, 250, 252)
            } else {
                iced::Color::WHITE
            }
            .into(),
            border: iced::Border {
                color: if matches!(status, text_editor::Status::Focused { .. }) {
                    iced::Color::from_rgb8(218, 137, 30)
                } else {
                    iced::Color::from_rgb8(220, 225, 231)
                },
                width: 1.,
                radius: 3.into(),
            },
            placeholder: iced::Color::from_rgb8(100, 116, 139),
            value: iced::Color::from_rgb8(71, 85, 105),
            selection: iced::Color::from_rgb8(253, 225, 185),
        });
    let editor = if kan {
        editor.on_action(move |actie| {
            Msg::Presentatie(Bericht::Invoer {
                document: id,
                hash: hash.clone(),
                deel,
                actie,
            })
        })
    } else {
        editor
    };
    let editor = openaec_ui::design::a11y::node(
        editor,
        openaec_ui::design::a11y::Node::new(
            openaec_ui::design::a11y::Role::TextField,
            "Sprekersnotities",
        )
        .disabled(!kan),
    );
    let licht = stijl::office(
        Display {
            theme: ThemeId::Light,
            ..app.display
        }
        .look(),
    );
    column![
        column![
            iced::widget::Space::new().height(9),
            container(iced::widget::Space::new().height(1).width(Length::Fill)).style(|_| {
                container::Style {
                    background: Some(iced::Color::from_rgb8(226, 232, 240).into()),
                    ..Default::default()
                }
            })
        ],
        werk,
        container(column![w::mono_label(licht, "NOTITIES"), editor].spacing(3))
            .padding([8, 14])
            .height(98)
            .width(Length::Fill)
            .style(|_| container::Style {
                background: Some(iced::Color::WHITE.into()),
                ..Default::default()
            })
    ]
    .height(Length::Fill)
    .into()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn miniatuurcache_begrenst_werk_en_negeert_oude_antwoorden() {
        let mut s = Staat::default();
        let d = s.volgende(1, "eerste", 100).unwrap();
        assert_eq!(d.deel, 0);
        assert!(s.volgende(1, "eerste", 100).is_none());
        let nieuw = s.volgende(1, "tweede", 100).unwrap();
        assert_ne!(d, nieuw);
        let mut app = App::default();
        let mut tab = Tab::nieuw(1, "Test.pptx".into());
        tab.presentatie = s;
        app.tabs.push(tab);
        let _ = update(&mut app, Bericht::Gereed(d, Err("oud antwoord".into())));
        assert_eq!(app.tab().unwrap().presentatie.bezig.as_ref(), Some(&nieuw));
        assert!(app.tab().unwrap().presentatie.fouten.is_empty());
        app.tab_mut().unwrap().presentatie.bezig = None;
        for n in 0..100 {
            let t = app.tab_mut().unwrap();
            t.presentatie.eerste = n;
            let d = t.presentatie.volgende(1, "tweede", 100).unwrap();
            // Een mislukte miniatuur wordt slechts eenmaal per bronversie gevraagd.
            t.presentatie.bezig = None;
            t.presentatie.fouten.insert(d.deel);
        }
        assert!(
            app.tab_mut()
                .unwrap()
                .presentatie
                .volgende(1, "tweede", 100)
                .is_none()
        );
        let s = &mut app.tab_mut().unwrap().presentatie;
        s.synchroniseer("derde");
        assert!(s.fouten.is_empty());
        assert!(s.beelden.is_empty());
    }
}

#[cfg(test)]
mod cacheproeven {
    use super::*;
    #[test]
    fn miniatuurcache_bewaart_maximaal_twintig_handles_en_wist_bij_bronwijziging() {
        let mut app = crate::tests::app_met_werkdraad(
            Module::Presentation,
            include_bytes!("../../office-core/tests/fixtures/presentation.pptx"),
        );
        let hash = app.tab().unwrap().antwoord.as_ref().unwrap().hash.clone();
        app.tab_mut()
            .unwrap()
            .antwoord
            .as_mut()
            .unwrap()
            .beeld
            .onderdelen = (0..100).map(|n| format!("Cacheproef {n}")).collect();
        let bron = app.tab().unwrap().antwoord.as_ref().unwrap().bron.clone();
        for n in 0..100 {
            let t = app.tab_mut().unwrap();
            t.presentatie.eerste = n;
            let d = t
                .presentatie
                .bezig
                .clone()
                .unwrap_or_else(|| t.presentatie.volgende(1, &hash, 100).unwrap());
            assert_eq!(d.deel, n);
            let _ = update(
                &mut app,
                Bericht::Gereed(
                    d,
                    Ok(office_core::presentatie::Miniatuur {
                        bytes: vec![],
                        breedte: 1,
                        hoogte: 1,
                        overgeslagen_afbeeldingen: 0,
                    }),
                ),
            );
            assert!(app.tab().unwrap().presentatie.beelden.len() <= CACHE);
        }
        let t = app.tab_mut().unwrap();
        assert_eq!(
            t.presentatie
                .beelden
                .iter()
                .map(|(n, _)| *n)
                .collect::<Vec<_>>(),
            (80..100).collect::<Vec<_>>()
        );
        assert_eq!(
            t.antwoord.as_ref().unwrap().bron.as_slice(),
            bron.as_slice()
        );
        t.presentatie.synchroniseer("gewijzigde-versie");
        assert!(t.presentatie.beelden.is_empty());
        assert!(t.presentatie.bezig.is_none());
    }
}

/// De dia blijft gecentreerd zolang deze past; grotere dia's blijven volledig scrollbaar.
pub(super) fn werkblad<'a>(app: &App, t: &Tab, blad: Element<'a, Msg>) -> Element<'a, Msg> {
    use openaec_ui::design::shell;
    let pagina = &t.antwoord.as_ref().unwrap().beeld.pagina;
    let kop = shell::TITLEBAR + shell::RIBBON_TABS + shell::RIBBON + shell::DOCUMENT_TABS;
    let hoogte = (app.venster_grootte.height - kop - shell::STATUSBAR - 98. - 10.)
        .max(pagina.hoogte * t.zoom + 40.);
    let breedte = (app.venster_grootte.width - 184. - if t.panelen { 300. } else { 0. })
        .max(pagina.breedte * t.zoom + 40.);
    container(container(blad).style(|_| container::Style {
        background: Some(iced::Color::WHITE.into()),
        shadow: iced::Shadow {
            color: iced::Color::from_rgba8(27, 39, 61, 0.2),
            offset: iced::Vector::new(0., 8.),
            blur_radius: 32.,
        },
        ..Default::default()
    }))
    .padding(20)
    .width(breedte)
    .height(hoogte)
    .align_x(iced::Alignment::Center)
    .align_y(iced::Alignment::Center)
    .into()
}
