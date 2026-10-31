//! Directe celbewerking op hetzelfde paginabeeld en met dezelfde tekstinhoud als de formulebalk.
use super::*;
use iced::advanced::mouse;
use iced::advanced::{
    Widget,
    layout::{self, Layout},
    renderer,
    widget::{Operation, Tree, tree},
};
use office_core::rekenblad::Richting;
pub const RASTER_ID: &str = "werkbladraster";
const EDITOR_ID: &str = "cel-editor";
#[derive(Default)]
pub struct Staat {
    pub bewerken: bool,
    pub focus: bool,
    pub na_bewerking: Option<String>,
    pub na_richting: Option<Richting>,
    pub selectie: Option<office_core::rekenblad::CelSelectie>,
    pub wachtend: std::collections::VecDeque<Bericht>,
}
#[derive(Debug, Clone)]
pub enum Bericht {
    Focus {
        document: u64,
        editerversie: u64,
    },
    Kies(String),
    Typ(String),
    BewerkActief,
    Pijl {
        richting: Richting,
        selecteer: bool,
    },
    BreidUit(String),
    Vergroot(Richting),
    Begin {
        id: String,
        vervang: Option<String>,
        alles: bool,
    },
    Invoer(text_editor::Action),
    Bevestig,
    Voltooi(Richting),
    Verplaats(Richting),
    Annuleer,
}
pub(super) fn beschikbaar(app: &App) -> bool {
    toegankelijk(app) && app.tab().is_some_and(|t| !t.bezig && !t.schrijft)
}
fn toegankelijk(app: &App) -> bool {
    !app.postvak_zichtbaar
        && !app.bestand
        && !app.instellingen
        && !app.postvak.sluitvraag
        && app.sluiten.is_none()
        && app.exportblad.is_none()
        && app.tab().is_some_and(|t| {
            t.antwoord
                .as_ref()
                .is_some_and(|a| a.beeld.module == Module::Spreadsheet)
        })
}
fn vraag_focus(app: &App) -> Task<Msg> {
    let Some(t) = app.tab() else {
        return Task::none();
    };
    Task::done(Msg::Raster(Bericht::Focus {
        document: t.id,
        editerversie: t.editerversie,
    }))
}
pub fn update(app: &mut App, bericht: Bericht) -> Task<Msg> {
    if !beschikbaar(app) {
        if toegankelijk(app)
            && let Some(t) = app
                .tab_mut()
                .filter(|t| t.bezig && !t.schrijft && !t.concept)
            && matches!(
                bericht,
                Bericht::Kies(_)
                    | Bericht::BreidUit(_)
                    | Bericht::Vergroot(_)
                    | Bericht::Verplaats(_)
                    | Bericht::Pijl { .. }
                    | Bericht::Voltooi(_)
            )
        {
            // Slepen bewaart alleen het laatste absolute doel. Relatieve
            // toetsstappen blijven in volgorde, ook tijdens een paginaraster.
            if matches!(bericht, Bericht::BreidUit(_))
                && matches!(t.raster.wachtend.back(), Some(Bericht::BreidUit(_)))
            {
                t.raster.wachtend.pop_back();
            }
            if t.raster.wachtend.len() >= 256 {
                return app
                    .waarschuwing("De navigatiewachtrij is vol; wacht tot het raster gereed is");
            }
            t.raster.wachtend.push_back(bericht);
        }
        return Task::none();
    }
    match bericht {
        Bericht::Focus {
            document,
            editerversie,
        } => {
            // Een oude navigatietaak mag geen latere editor, ander tabblad of
            // inmiddels geopend modaal venster opnieuw focus afpakken.
            if app.tab().is_some_and(|t| {
                t.id == document
                    && t.editerversie == editerversie
                    && t.raster.focus
                    && !t.raster.bewerken
            }) {
                iced::widget::operation::focus(RASTER_ID)
            } else {
                Task::none()
            }
        }
        Bericht::Typ(tekst) => {
            if app.tab().is_some_and(|t| t.raster.bewerken) {
                return app.update(Msg::Invoer(text_editor::Action::Edit(
                    text_editor::Edit::Paste(std::sync::Arc::new(tekst)),
                )));
            }
            let Some(id) = app.tab().and_then(Tab::veld).map(|v| v.id.clone()) else {
                return Task::none();
            };
            update(
                app,
                Bericht::Begin {
                    id,
                    vervang: Some(tekst),
                    alles: false,
                },
            )
        }
        Bericht::BewerkActief => {
            let Some(id) = app.tab().and_then(Tab::veld).map(|v| v.id.clone()) else {
                return Task::none();
            };
            update(
                app,
                Bericht::Begin {
                    id,
                    vervang: None,
                    alles: false,
                },
            )
        }
        Bericht::Pijl {
            richting,
            selecteer,
        } => {
            if app.tab().is_some_and(|t| t.raster.bewerken) {
                let motion = match richting {
                    Richting::Links => text_editor::Motion::Left,
                    Richting::Rechts => text_editor::Motion::Right,
                    Richting::Boven => text_editor::Motion::Up,
                    Richting::Onder => text_editor::Motion::Down,
                };
                return app.update(Msg::Invoer(if selecteer {
                    text_editor::Action::Select(motion)
                } else {
                    text_editor::Action::Move(motion)
                }));
            }
            update(
                app,
                if selecteer {
                    Bericht::Vergroot(richting)
                } else {
                    Bericht::Verplaats(richting)
                },
            )
        }
        Bericht::Kies(id) => {
            let t = app.tab_mut().unwrap();
            if t.concept {
                if !t.raster.bewerken {
                    return app
                        .waarschuwing("Pas de huidige invoer eerst toe of maak haar ongedaan");
                }
                t.raster.na_bewerking = Some(id);
                return app.update(Msg::PasToe);
            }
            let Some(n) = t
                .antwoord
                .as_ref()
                .unwrap()
                .beeld
                .velden
                .iter()
                .position(|v| v.id == id)
            else {
                return Task::none();
            };
            t.toon_veld(n);
            t.raster.focus = true;
            vraag_focus(app)
        }
        Bericht::Begin { id, vervang, alles } => {
            let t = app.tab_mut().unwrap();
            if t.concept {
                return app.waarschuwing("Pas de huidige invoer eerst toe of maak haar ongedaan");
            }
            let b = &t.antwoord.as_ref().unwrap().beeld;
            let Some(n) = b.velden.iter().position(|v| v.id == id && v.bewerkbaar) else {
                return Task::none();
            };
            if !b.pagina.vlakken.iter().any(|v| v.id == id) {
                return app.waarschuwing("De cel is niet zichtbaar in het huidige werkvenster");
            }
            t.toon_veld(n);
            t.raster.bewerken = true;
            t.raster.focus = true;
            if let Some(tekst) = vervang {
                t.editor = text_editor::Content::with_text(&tekst);
                t.concept = true;
            }
            t.editor.perform(if alles {
                text_editor::Action::SelectAll
            } else {
                text_editor::Action::Move(text_editor::Motion::DocumentEnd)
            });
            registreer_letters(t);
            iced::widget::operation::focus(EDITOR_ID)
        }
        Bericht::BreidUit(doel) => selecteer(app, doel, None),
        Bericht::Vergroot(richting) => {
            let Some(doel) = app.tab().and_then(Tab::veld).map(|v| v.id.clone()) else {
                return Task::none();
            };
            selecteer(app, doel, Some(richting))
        }
        Bericht::Invoer(actie) => {
            if app.tab().is_some_and(|t| t.raster.bewerken) {
                app.update(Msg::Invoer(actie))
            } else {
                Task::none()
            }
        }
        Bericht::Verplaats(richting) => {
            let t = app.tab_mut().unwrap();
            if t.concept || t.raster.bewerken {
                return Task::none();
            }
            let Some(v) = t.veld() else {
                return Task::none();
            };
            let van = v.id.clone();
            let lokaal = t
                .antwoord
                .as_ref()
                .and_then(|a| super::raster_navigatie::volgende(&a.beeld, &van, richting));
            if let Some(doel) = lokaal
                && let Some(n) = t
                    .antwoord
                    .as_ref()
                    .unwrap()
                    .beeld
                    .velden
                    .iter()
                    .position(|v| v.id == doel)
            {
                t.toon_veld(n);
                t.raster.focus = true;
                return vraag_focus(app);
            }
            let opdracht = Opdracht::VerplaatsCel(t.deel, van.clone(), richting);
            t.adres = van;
            t.raster.selectie = None;
            let id = t.id;
            t.raster.focus = true;
            app.opdracht(id, opdracht)
        }
        Bericht::Voltooi(richting) => {
            let t = app.tab_mut().unwrap();
            if !t.raster.bewerken {
                return update(app, Bericht::Verplaats(richting));
            }
            if t.concept {
                t.raster.na_richting = Some(richting);
                app.update(Msg::Raster(Bericht::Bevestig))
            } else {
                t.raster.bewerken = false;
                app.update(Msg::Raster(Bericht::Verplaats(richting)))
            }
        }
        Bericht::Bevestig => {
            let t = app.tab_mut().unwrap();
            if !t.raster.bewerken {
                return Task::none();
            }
            if t.concept {
                app.update(Msg::PasToe)
            } else {
                t.raster.bewerken = false;
                vraag_focus(app)
            }
        }
        Bericht::Annuleer => {
            let t = app.tab_mut().unwrap();
            if t.raster.bewerken {
                let n = t.gekozen;
                t.toon_veld(n);
                t.raster.na_bewerking = None;
                t.raster.na_richting = None;
                t.raster.focus = true;
            } else if let Some(v) = t.veld() {
                t.adres = v.id.clone();
                t.raster.selectie = None;
            }
            vraag_focus(app)
        }
    }
}
fn selecteer(app: &mut App, doel: String, richting: Option<Richting>) -> Task<Msg> {
    let t = app.tab_mut().unwrap();
    if t.concept || t.raster.bewerken {
        return app.waarschuwing("Pas de huidige invoer eerst toe of maak haar ongedaan");
    }
    let Some(anker) = t
        .raster
        .selectie
        .as_ref()
        .map(|s| s.anker.clone())
        .or_else(|| {
            office_core::rekenblad::bereik(&t.adres)
                .ok()
                .map(|r| r.start.to_a1())
        })
    else {
        return Task::none();
    };
    t.raster.focus = true;
    let id = t.id;
    let opdracht = Opdracht::SelecteerCellen {
        deel: t.deel,
        anker,
        doel,
        richting,
    };
    app.opdracht(id, opdracht)
}
pub fn vervolg(app: &mut App) -> Task<Msg> {
    if !beschikbaar(app) {
        return Task::none();
    }
    let Some(b) = app.tab_mut().and_then(|t| t.raster.wachtend.pop_front()) else {
        return vraag_focus(app);
    };
    let taak = update(app, b);
    if app
        .tab()
        .is_some_and(|t| !t.bezig && !t.raster.wachtend.is_empty())
    {
        Task::batch([taak, vervolg(app)])
    } else {
        taak
    }
}
pub fn registreer_letters(t: &Tab) {
    if let Some(v) = t.veld() {
        let f = &v.opmaak;
        lettertypen_ui::registreer_tekst(
            f.lettertype.as_deref().unwrap_or("Calibri"),
            f.vet,
            f.cursief,
            &t.editor.text(),
        );
    }
}
pub fn blad<'a>(app: &'a App, t: &'a Tab, inhoud: Element<'a, Msg>) -> Element<'a, Msg> {
    let b = &t.antwoord.as_ref().unwrap().beeld;
    let basis = documentblad::blad(
        inhoud,
        &b.pagina,
        t.veld().map(|v| v.id.as_str()),
        None,
        app.look().color.accent,
        Msg::Raak,
    );
    let mut lagen = vec![basis];
    let rect = t
        .veld()
        .and_then(|v| b.pagina.vlakken.iter().find(|r| r.id == v.id));
    if t.raster.bewerken
        && let (Some(v), Some(r)) = (t.veld(), rect)
    {
        let f = &v.opmaak;
        let letter = office_core::lettertypen::kies(
            f.lettertype.as_deref().unwrap_or("Calibri"),
            f.vet,
            f.cursief,
        );
        let font = iced::Font {
            family: iced::font::Family::Name(letter.familie),
            weight: if f.vet {
                iced::font::Weight::Bold
            } else {
                iced::font::Weight::Normal
            },
            style: if f.cursief {
                iced::font::Style::Italic
            } else {
                iced::font::Style::Normal
            },
            ..Default::default()
        };
        let hoogte = (r.grens.hoogte * t.zoom).max(1.);
        let mut editor = text_editor(&t.editor)
            .id(EDITOR_ID)
            .font(font)
            .size((f.grootte.unwrap_or(11.) as f32 * 4. / 3. * t.zoom).max(1.))
            .width((r.grens.breedte * t.zoom).max(1.))
            .height(hoogte)
            .max_height(hoogte)
            .padding(iced::Padding {
                top: 1.,
                bottom: 1.,
                left: 2.,
                right: 2.,
            })
            .wrapping(iced::widget::text::Wrapping::None)
            .key_binding(|k| {
                if !matches!(k.status, text_editor::Status::Focused { .. }) {
                    return text_editor::Binding::from_key_press(k);
                }
                use iced::keyboard::{Key, key::Named};
                match k.key {
                    Key::Named(Named::Escape) => {
                        Some(text_editor::Binding::Custom(Msg::Raster(Bericht::Annuleer)))
                    }
                    Key::Named(Named::Enter) if !k.modifiers.alt() => {
                        Some(text_editor::Binding::Custom(Msg::Raster(Bericht::Voltooi(
                            if k.modifiers.shift() {
                                Richting::Boven
                            } else {
                                Richting::Onder
                            },
                        ))))
                    }
                    Key::Named(Named::Tab) => Some(text_editor::Binding::Custom(Msg::Raster(
                        Bericht::Voltooi(if k.modifiers.shift() {
                            Richting::Links
                        } else {
                            Richting::Rechts
                        }),
                    ))),
                    _ => klembord::toets(k),
                }
            })
            .style(move |_, _| text_editor::Style {
                background: iced::Background::Color(iced::Color::WHITE),
                border: iced::Border {
                    color: app.look().color.accent,
                    width: 2.,
                    radius: 0.into(),
                },
                placeholder: iced::Color::BLACK,
                value: iced::Color::BLACK,
                selection: app.look().color.selected,
            });
        if !t.bezig {
            editor = editor.on_action(|a| Msg::Raster(Bericht::Invoer(a)));
        }
        let editor = openaec_ui::design::a11y::node(
            editor,
            openaec_ui::design::a11y::Node::new(
                openaec_ui::design::a11y::Role::TextField,
                format!("Cel {}", v.id),
            )
            .disabled(t.bezig),
        );
        lagen.push(
            container(editor)
                .padding(iced::Padding {
                    top: r.grens.y * t.zoom,
                    left: r.grens.x * t.zoom,
                    right: 0.,
                    bottom: 0.,
                })
                .width(Length::Fill)
                .height(Length::Fill)
                .into(),
        );
    }
    let widget = Raster {
        inhoud: iced::widget::Stack::with_children(lagen).into(),
        pagina: &b.pagina,
        gekozen: t.veld().map(|v| v.id.as_str()),
        bewerken: t.raster.bewerken,
        bereik: &t.adres,
        accent: app.look().color.accent,
    };
    openaec_ui::design::a11y::node(
        Element::new(widget),
        openaec_ui::design::a11y::Node::new(
            openaec_ui::design::a11y::Role::Label,
            "Werkbladraster",
        ),
    )
}
#[derive(Default)]
struct Focus {
    actief: bool,
    klik: Option<mouse::Click>,
    id: String,
    slepen: bool,
    modifiers: iced::keyboard::Modifiers,
}
impl iced::advanced::widget::operation::Focusable for Focus {
    fn is_focused(&self) -> bool {
        self.actief
    }
    fn focus(&mut self) {
        self.actief = true;
    }
    fn unfocus(&mut self) {
        self.actief = false;
    }
}
struct Raster<'a> {
    inhoud: Element<'a, Msg>,
    pagina: &'a office_core::interactie::Pagina,
    gekozen: Option<&'a str>,
    bewerken: bool,
    bereik: &'a str,
    accent: iced::Color,
}
impl Widget<Msg, iced::Theme, iced::Renderer> for Raster<'_> {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<Focus>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(Focus::default())
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.inhoud)]
    }
    fn diff(&self, t: &mut Tree) {
        t.diff_children(std::slice::from_ref(&self.inhoud));
    }
    fn size(&self) -> Size<Length> {
        self.inhoud.as_widget().size()
    }
    fn layout(&mut self, t: &mut Tree, r: &iced::Renderer, l: &layout::Limits) -> layout::Node {
        self.inhoud.as_widget_mut().layout(&mut t.children[0], r, l)
    }
    fn operate(&mut self, t: &mut Tree, l: Layout<'_>, r: &iced::Renderer, o: &mut dyn Operation) {
        o.focusable(
            Some(&iced::advanced::widget::Id::new(RASTER_ID)),
            l.bounds(),
            t.state.downcast_mut::<Focus>(),
        );
        self.inhoud
            .as_widget_mut()
            .operate(&mut t.children[0], l, r, o);
    }
    fn update(
        &mut self,
        t: &mut Tree,
        e: &iced::Event,
        l: Layout<'_>,
        c: mouse::Cursor,
        r: &iced::Renderer,
        cb: &mut dyn iced::advanced::Clipboard,
        s: &mut iced::advanced::Shell<'_, Msg>,
        vp: &iced::Rectangle,
    ) {
        if let iced::Event::Keyboard(iced::keyboard::Event::ModifiersChanged(m)) = e {
            t.state.downcast_mut::<Focus>().modifiers = *m;
        }
        if matches!(
            e,
            iced::Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left))
        ) {
            t.state.downcast_mut::<Focus>().slepen = false;
        }
        if matches!(e, iced::Event::Mouse(mouse::Event::CursorMoved { .. }))
            && t.state.downcast_ref::<Focus>().slepen
            && !self.bewerken
            && c.is_over(*vp)
            && l.bounds().width > 0.
            && l.bounds().height > 0.
            && let Some(p) = c.position_in(l.bounds())
            && let Some(id) = self.pagina.raak(
                p.x * self.pagina.breedte / l.bounds().width,
                p.y * self.pagina.hoogte / l.bounds().height,
            )
            && t.state.downcast_ref::<Focus>().id != id
        {
            let staat = t.state.downcast_mut::<Focus>();
            staat.id = id.into();
            staat.klik = None;
            s.publish(Msg::Raster(Bericht::BreidUit(id.into())));
            s.capture_event();
            return;
        }
        if matches!(e, iced::Event::Keyboard(_) | iced::Event::InputMethod(_)) {
            // Een klik na typen of navigeren begint een nieuwe klikreeks.
            // De vorige selectie mag geen toevallige dubbelklik opleveren.
            t.state.downcast_mut::<Focus>().klik = None;
        }
        if let iced::Event::Keyboard(iced::keyboard::Event::KeyPressed {
            key,
            text,
            modifiers,
            ..
        }) = e
            && t.state.downcast_ref::<Focus>().actief
            && !self.bewerken
        {
            use iced::keyboard::{Key, key::Named};
            let bericht = match key {
                Key::Named(k) if !modifiers.command() && !modifiers.alt() => match k {
                    Named::ArrowLeft => Some(Bericht::Pijl {
                        richting: Richting::Links,
                        selecteer: modifiers.shift(),
                    }),
                    Named::ArrowRight => Some(Bericht::Pijl {
                        richting: Richting::Rechts,
                        selecteer: modifiers.shift(),
                    }),
                    Named::ArrowUp => Some(Bericht::Pijl {
                        richting: Richting::Boven,
                        selecteer: modifiers.shift(),
                    }),
                    Named::ArrowDown => Some(Bericht::Pijl {
                        richting: Richting::Onder,
                        selecteer: modifiers.shift(),
                    }),
                    Named::Enter => Some(Bericht::Voltooi(if modifiers.shift() {
                        Richting::Boven
                    } else {
                        Richting::Onder
                    })),
                    Named::Tab => Some(Bericht::Voltooi(if modifiers.shift() {
                        Richting::Links
                    } else {
                        Richting::Rechts
                    })),
                    Named::F2 => self.gekozen.map(|_| Bericht::BewerkActief),
                    _ => None,
                },
                Key::Named(Named::F2) => self.gekozen.map(|_| Bericht::BewerkActief),
                _ if !modifiers.command() || (modifiers.control() && modifiers.alt()) => text
                    .as_ref()
                    .filter(|tekst| tekst.chars().any(|c| !c.is_control()))
                    .and_then(|tekst| self.gekozen.map(|_| Bericht::Typ(tekst.to_string()))),
                _ => None,
            };
            if let Some(b) = bericht {
                s.publish(Msg::Raster(b));
                s.capture_event();
                return;
            }
        }
        if matches!(
            e,
            iced::Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left))
        ) && c.is_over(*vp)
            && l.bounds().width > 0.
            && l.bounds().height > 0.
            && let Some(p) = c.position_in(l.bounds())
            && let Some(id) = self.pagina.raak(
                p.x * self.pagina.breedte / l.bounds().width,
                p.y * self.pagina.hoogte / l.bounds().height,
            )
            && (!self.bewerken || self.gekozen != Some(id))
        {
            let staat = t.state.downcast_mut::<Focus>();
            let klik = mouse::Click::new(
                p,
                mouse::Button::Left,
                if staat.id == id { staat.klik } else { None },
            );
            staat.id = id.into();
            staat.klik = Some(klik);
            staat.slepen = !self.bewerken;
            let bericht = if staat.modifiers.shift() && !self.bewerken {
                Bericht::BreidUit(id.into())
            } else if klik.kind() == mouse::click::Kind::Single {
                Bericht::Kies(id.into())
            } else {
                Bericht::Begin {
                    id: id.into(),
                    vervang: None,
                    alles: false,
                }
            };
            s.publish(Msg::Raster(bericht));
            s.capture_event();
            return;
        }
        self.inhoud
            .as_widget_mut()
            .update(&mut t.children[0], e, l, c, r, cb, s, vp);
    }
    fn mouse_interaction(
        &self,
        t: &Tree,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &iced::Rectangle,
        r: &iced::Renderer,
    ) -> mouse::Interaction {
        self.inhoud
            .as_widget()
            .mouse_interaction(&t.children[0], l, c, vp, r)
    }
    fn draw(
        &self,
        t: &Tree,
        r: &mut iced::Renderer,
        theme: &iced::Theme,
        style: &renderer::Style,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &iced::Rectangle,
    ) {
        self.inhoud
            .as_widget()
            .draw(&t.children[0], r, theme, style, l, c, vp);
        if !self.bewerken && self.bereik.contains(':') {
            teken_selectie(r, self.pagina, self.bereik, self.accent, l.bounds(), *vp);
        }
    }
}
fn teken_selectie(
    r: &mut iced::Renderer,
    pagina: &office_core::interactie::Pagina,
    adres: &str,
    accent: iced::Color,
    bounds: iced::Rectangle,
    vp: iced::Rectangle,
) {
    use iced::advanced::Renderer as _;
    let Ok(bereik) = office_core::rekenblad::bereik(adres) else {
        return;
    };
    if pagina.breedte <= 0. || pagina.hoogte <= 0. {
        return;
    }
    let Some(clip) = bounds.intersection(&vp) else {
        return;
    };
    let sx = bounds.width / pagina.breedte;
    let sy = bounds.height / pagina.hoogte;
    let mut totaal: Option<iced::Rectangle> = None;
    r.with_layer(clip, |r| {
        for v in &pagina.vlakken {
            let Ok(c) = office_core::rekenblad::bereik(&v.id) else {
                continue;
            };
            if c.start.row < bereik.start.row
                || c.start.row > bereik.end.row
                || c.start.col < bereik.start.col
                || c.start.col > bereik.end.col
            {
                continue;
            }
            let b = iced::Rectangle {
                x: bounds.x + v.grens.x * sx,
                y: bounds.y + v.grens.y * sy,
                width: v.grens.breedte * sx,
                height: v.grens.hoogte * sy,
            };
            totaal = Some(totaal.map(|a| a.union(&b)).unwrap_or(b));
            r.fill_quad(
                renderer::Quad {
                    bounds: b,
                    ..Default::default()
                },
                iced::Color { a: 0.12, ..accent },
            );
        }
        if let Some(b) = totaal {
            r.fill_quad(
                renderer::Quad {
                    bounds: b,
                    border: iced::Border {
                        color: accent,
                        width: 1.5,
                        ..Default::default()
                    },
                    ..Default::default()
                },
                iced::Color::TRANSPARENT,
            );
        }
    });
}
