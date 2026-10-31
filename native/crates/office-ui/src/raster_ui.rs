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
}
#[derive(Debug, Clone)]
pub enum Bericht {
    Kies(String),
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
    !app.postvak_zichtbaar
        && !app.bestand
        && !app.instellingen
        && !app.postvak.sluitvraag
        && app.sluiten.is_none()
        && app.exportblad.is_none()
        && app.tab().is_some_and(|t| {
            !t.bezig
                && !t.schrijft
                && t.antwoord
                    .as_ref()
                    .is_some_and(|a| a.beeld.module == Module::Spreadsheet)
        })
}
pub fn update(app: &mut App, bericht: Bericht) -> Task<Msg> {
    if !beschikbaar(app) {
        return Task::none();
    }
    match bericht {
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
            iced::widget::operation::focus(RASTER_ID)
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
            let opdracht = Opdracht::VerplaatsCel(t.deel, v.id.clone(), richting);
            let id = t.id;
            t.raster.focus = true;
            app.opdracht(id, opdracht)
        }
        Bericht::Voltooi(richting) => {
            let t = app.tab_mut().unwrap();
            if !t.raster.bewerken {
                return Task::none();
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
                iced::widget::operation::focus(RASTER_ID)
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
            }
            iced::widget::operation::focus(RASTER_ID)
        }
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
                    _ => text_editor::Binding::from_key_press(k),
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
                    Named::ArrowLeft => Some(Bericht::Verplaats(Richting::Links)),
                    Named::ArrowRight => Some(Bericht::Verplaats(Richting::Rechts)),
                    Named::ArrowUp => Some(Bericht::Verplaats(Richting::Boven)),
                    Named::ArrowDown => Some(Bericht::Verplaats(Richting::Onder)),
                    Named::Enter => Some(Bericht::Verplaats(if modifiers.shift() {
                        Richting::Boven
                    } else {
                        Richting::Onder
                    })),
                    Named::Tab => Some(Bericht::Verplaats(if modifiers.shift() {
                        Richting::Links
                    } else {
                        Richting::Rechts
                    })),
                    Named::F2 => self.gekozen.map(|id| Bericht::Begin {
                        id: id.into(),
                        vervang: None,
                        alles: false,
                    }),
                    _ => None,
                },
                Key::Named(Named::F2) => self.gekozen.map(|id| Bericht::Begin {
                    id: id.into(),
                    vervang: None,
                    alles: false,
                }),
                _ if !modifiers.command() || (modifiers.control() && modifiers.alt()) => text
                    .as_ref()
                    .filter(|tekst| tekst.chars().any(|c| !c.is_control()))
                    .and_then(|tekst| {
                        self.gekozen.map(|id| Bericht::Begin {
                            id: id.into(),
                            vervang: Some(tekst.to_string()),
                            alles: false,
                        })
                    }),
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
            let bericht = if klik.kind() == mouse::click::Kind::Single {
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
    }
}
