//! Paginacursor op de behouden documentgeometrie; tekst wordt niet opnieuw gevormd in de interface.
use super::*;
use iced::advanced::input_method;
use iced::advanced::{
    Clipboard, Shell, Widget,
    layout::{self, Layout},
    renderer::{self, Renderer as _},
    widget::{Operation, Tree, tree},
};
use iced::{Event, Rectangle, Renderer, Theme, keyboard, mouse};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};

pub fn blad<'a>(t: &'a Tab, inhoud: Element<'a, Msg>, accent: iced::Color) -> Element<'a, Msg> {
    let Some(a) = &t.antwoord else { return inhoud };
    let Some(frame) = &a.beeld.writer_frame else {
        return inhoud;
    };
    let blad = Element::new(Blad {
        inhoud,
        frame,
        document: t.id,
        hash: &a.hash,
        focus: t.writer_focus.clone(),
        markering: t.writer_direct.geometrie(t),
        accent,
        breedte: a.beeld.pagina.breedte,
        hoogte: a.beeld.pagina.hoogte,
    });
    openaec_ui::design::a11y::node(
        blad,
        openaec_ui::design::a11y::Node::new(
            openaec_ui::design::a11y::Role::Label,
            "Writer-documentpagina",
        ),
    )
}
struct Blad<'a> {
    inhoud: Element<'a, Msg>,
    frame: &'a office_core::writer_cursor::InteractieFrame,
    document: u64,
    hash: &'a str,
    focus: Arc<AtomicBool>,
    markering: Option<&'a office_core::writer_cursor::TekstMarkering>,
    accent: iced::Color,
    breedte: f32,
    hoogte: f32,
}
struct Focus {
    actief: Arc<AtomicBool>,
    document: u64,
    slepen: bool,
    modifiers: keyboard::Modifiers,
    venster: bool,
    laatste: Instant,
    nu: Instant,
    preedit: Option<input_method::Preedit>,
}
impl Focus {
    fn nieuw(document: u64, actief: Arc<AtomicBool>) -> Self {
        let nu = Instant::now();
        Self {
            actief,
            document,
            slepen: false,
            modifiers: keyboard::Modifiers::default(),
            venster: true,
            laatste: nu,
            nu,
            preedit: None,
        }
    }
}
impl iced::advanced::widget::operation::Focusable for Focus {
    fn is_focused(&self) -> bool {
        self.actief.load(Ordering::Relaxed)
    }
    fn focus(&mut self) {
        self.actief.store(true, Ordering::Relaxed);
        self.laatste = Instant::now();
    }
    fn unfocus(&mut self) {
        self.actief.store(false, Ordering::Relaxed);
        self.slepen = false;
        self.preedit = None;
    }
}
impl Blad<'_> {
    fn punt(
        &self,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &Rectangle,
    ) -> Option<office_core::writer_navigatie::CursorDoel> {
        if !c.is_over(*vp) || self.breedte <= 0. || self.hoogte <= 0. {
            return None;
        }
        let p = c.position_in(l.bounds())?;
        let b = l.bounds();
        self.frame
            .cursorpunt(
                f64::from(p.x * self.breedte / b.width),
                f64::from(p.y * self.hoogte / b.height),
            )
            .ok()
            .flatten()
    }
    fn bericht(&self, b: writer_direct::Bericht) -> Msg {
        Msg::WriterDirect(self.document, b)
    }
    fn rechthoek(&self, l: Layout<'_>, g: office_core::interactie::Rechthoek) -> Rectangle {
        let b = l.bounds();
        let sx = b.width / self.breedte;
        let sy = b.height / self.hoogte;
        Rectangle {
            x: b.x + g.x * sx,
            y: b.y + g.y * sy,
            width: (g.breedte * sx).max(1.),
            height: g.hoogte * sy,
        }
    }
}
impl Widget<Msg, Theme, Renderer> for Blad<'_> {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<Focus>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(Focus::nieuw(self.document, self.focus.clone()))
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.inhoud)]
    }
    fn diff(&self, t: &mut Tree) {
        let f = t.state.downcast_mut::<Focus>();
        if f.document != self.document {
            *f = Focus::nieuw(self.document, self.focus.clone());
        }
        t.diff_children(std::slice::from_ref(&self.inhoud));
    }
    fn size(&self) -> Size<Length> {
        self.inhoud.as_widget().size()
    }
    fn layout(&mut self, t: &mut Tree, r: &Renderer, l: &layout::Limits) -> layout::Node {
        self.inhoud.as_widget_mut().layout(&mut t.children[0], r, l)
    }
    fn operate(&mut self, t: &mut Tree, l: Layout<'_>, r: &Renderer, o: &mut dyn Operation) {
        o.focusable(
            Some(&iced::advanced::widget::Id::new("writer-pagina-invoer")),
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
        e: &Event,
        l: Layout<'_>,
        c: mouse::Cursor,
        r: &Renderer,
        cb: &mut dyn Clipboard,
        s: &mut Shell<'_, Msg>,
        vp: &Rectangle,
    ) {
        use iced::advanced::widget::operation::Focusable;
        let f = t.state.downcast_mut::<Focus>();
        let mut bericht = None;
        match e {
            Event::Keyboard(keyboard::Event::ModifiersChanged(m)) => f.modifiers = *m,
            Event::Window(iced::window::Event::Unfocused) => {
                f.venster = false;
                f.preedit = None;
                f.slepen = false;
            }
            Event::Window(iced::window::Event::Focused) => {
                f.venster = true;
                f.laatste = Instant::now();
            }
            Event::Window(iced::window::Event::RedrawRequested(nu)) => {
                f.nu = *nu;
                if f.is_focused() && f.venster {
                    s.request_redraw_at(*nu + Duration::from_millis(500));
                }
            }
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) => {
                if let Some(punt) = self.punt(l, c, vp) {
                    f.focus();
                    f.slepen = true;
                    bericht = Some(writer_direct::Bericht::Punt {
                        hash: self.hash.into(),
                        punt: punt.punt.clone(),
                        cursor: Some(punt),
                        selecteren: f.modifiers.shift(),
                    });
                } else {
                    f.unfocus();
                }
            }
            Event::Mouse(mouse::Event::CursorMoved { .. }) if f.slepen => {
                if let Some(punt) = self.punt(l, c, vp) {
                    bericht = Some(writer_direct::Bericht::Punt {
                        hash: self.hash.into(),
                        punt: punt.punt.clone(),
                        cursor: Some(punt),
                        selecteren: true,
                    });
                }
            }
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)) => f.slepen = false,
            Event::Keyboard(keyboard::Event::KeyPressed {
                key,
                text,
                modifiers,
                ..
            }) if f.is_focused() && f.venster => {
                use keyboard::{Key, key::Named};
                use text_editor::{Action as A, Edit as E, Motion as M};
                f.modifiers = *modifiers;
                if f.preedit.as_ref().is_none_or(|p| p.content.is_empty()) {
                    let mut actie = None;
                    if modifiers.command() && !modifiers.alt() {
                        if let Key::Character(k) = key {
                            bericht = match k.to_lowercase().as_str() {
                                "a" => Some(writer_direct::Bericht::Invoer(A::SelectAll)),
                                "c" => {
                                    Some(writer_direct::Bericht::Klembord(klembord::Actie::Kopieer))
                                }
                                "x" => {
                                    Some(writer_direct::Bericht::Klembord(klembord::Actie::Knip))
                                }
                                "v" => {
                                    Some(writer_direct::Bericht::Klembord(klembord::Actie::Plak))
                                }
                                "s" => Some(writer_direct::Bericht::Opslaan(modifiers.shift())),
                                "b" => Some(writer_direct::Bericht::OpmaakToets('b')),
                                "i" => Some(writer_direct::Bericht::OpmaakToets('i')),
                                "u" => Some(writer_direct::Bericht::OpmaakToets('u')),
                                "z" => Some(if modifiers.shift() {
                                    writer_direct::Bericht::Vooruit
                                } else {
                                    writer_direct::Bericht::Terug
                                }),
                                "y" => Some(writer_direct::Bericht::Vooruit),
                                _ => None,
                            };
                        }
                        if let Key::Named(k) = key {
                            actie = match k {
                                Named::ArrowLeft => Some(if modifiers.shift() {
                                    A::Select(M::WordLeft)
                                } else {
                                    A::Move(M::WordLeft)
                                }),
                                Named::ArrowRight => Some(if modifiers.shift() {
                                    A::Select(M::WordRight)
                                } else {
                                    A::Move(M::WordRight)
                                }),
                                _ => None,
                            };
                        }
                    } else if let Key::Named(k) = key {
                        actie = match k {
                            Named::ArrowLeft => Some(if modifiers.shift() {
                                A::Select(M::Left)
                            } else {
                                A::Move(M::Left)
                            }),
                            Named::ArrowRight => Some(if modifiers.shift() {
                                A::Select(M::Right)
                            } else {
                                A::Move(M::Right)
                            }),
                            Named::ArrowUp => {
                                bericht = Some(writer_direct::Bericht::Beweeg(
                                    office_core::writer_navigatie::Richting::Omhoog,
                                    modifiers.shift(),
                                ));
                                None
                            }
                            Named::ArrowDown => {
                                bericht = Some(writer_direct::Bericht::Beweeg(
                                    office_core::writer_navigatie::Richting::Omlaag,
                                    modifiers.shift(),
                                ));
                                None
                            }
                            Named::Home => {
                                bericht = Some(writer_direct::Bericht::Beweeg(
                                    office_core::writer_navigatie::Richting::RegelBegin,
                                    modifiers.shift(),
                                ));
                                None
                            }
                            Named::End => {
                                bericht = Some(writer_direct::Bericht::Beweeg(
                                    office_core::writer_navigatie::Richting::RegelEinde,
                                    modifiers.shift(),
                                ));
                                None
                            }
                            Named::Backspace => Some(A::Edit(E::Backspace)),
                            Named::Delete => Some(A::Edit(E::Delete)),
                            Named::Enter => Some(A::Edit(E::Enter)),
                            Named::Escape => {
                                bericht = Some(writer_direct::Bericht::Ontsnap);
                                None
                            }
                            _ => None,
                        };
                    }
                    if bericht.is_none() {
                        bericht = actie.map(writer_direct::Bericht::Invoer);
                    }
                    if bericht.is_none()
                        && (!modifiers.command() || modifiers.alt())
                        && let Some(tekst) = text
                            .as_ref()
                            .filter(|s| !s.is_empty() && s.chars().all(|c| !c.is_control()))
                    {
                        bericht = Some(writer_direct::Bericht::Invoer(A::Edit(E::Paste(
                            Arc::new(tekst.to_string()),
                        ))));
                    }
                }
            }
            Event::InputMethod(m) if f.is_focused() && f.venster => {
                match m {
                    input_method::Event::Preedit(tekst, selectie) => {
                        f.preedit = Some(input_method::Preedit {
                            content: tekst.clone(),
                            selection: selectie.clone(),
                            text_size: None,
                        })
                    }
                    input_method::Event::Commit(tekst) => {
                        f.preedit = None;
                        if !tekst.is_empty() {
                            bericht =
                                Some(writer_direct::Bericht::Invoer(text_editor::Action::Edit(
                                    text_editor::Edit::Paste(Arc::new(tekst.clone())),
                                )));
                        }
                    }
                    input_method::Event::Closed => f.preedit = None,
                    input_method::Event::Opened => {}
                }
                s.capture_event();
                s.request_redraw();
            }
            _ => {}
        }
        if f.is_focused()
            && f.venster
            && let Some(g) = self.markering.and_then(|m| m.cursor)
        {
            let cursor = self.rechthoek(l, g);
            if cursor.intersection(vp).is_some() {
                s.request_input_method(&input_method::InputMethod::Enabled {
                    cursor,
                    purpose: input_method::Purpose::Normal,
                    preedit: f.preedit.clone(),
                });
            }
        }
        if let Some(b) = bericht {
            f.laatste = Instant::now();
            s.publish(self.bericht(b));
            s.capture_event();
            s.request_redraw();
            return;
        }
        if s.is_event_captured() {
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
        vp: &Rectangle,
        r: &Renderer,
    ) -> mouse::Interaction {
        if self.punt(l, c, vp).is_some() {
            mouse::Interaction::Text
        } else {
            self.inhoud
                .as_widget()
                .mouse_interaction(&t.children[0], l, c, vp, r)
        }
    }
    fn draw(
        &self,
        t: &Tree,
        r: &mut Renderer,
        theme: &Theme,
        style: &renderer::Style,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &Rectangle,
    ) {
        self.inhoud
            .as_widget()
            .draw(&t.children[0], r, theme, style, l, c, vp);
        let f = t.state.downcast_ref::<Focus>();
        if !self.focus.load(Ordering::Relaxed) || !f.venster {
            return;
        }
        let Some(m) = self.markering else { return };
        let Some(clip) = l.bounds().intersection(vp) else {
            return;
        };
        r.with_layer(clip, |r| {
            for &g in &m.rechthoeken {
                r.fill_quad(
                    renderer::Quad {
                        bounds: self.rechthoek(l, g),
                        ..Default::default()
                    },
                    iced::Color {
                        a: 0.24,
                        ..self.accent
                    },
                );
            }
            if m.rechthoeken.is_empty()
                && f.nu.saturating_duration_since(f.laatste).as_millis() % 1000 < 500
                && let Some(g) = m.cursor
            {
                r.fill_quad(
                    renderer::Quad {
                        bounds: self.rechthoek(l, g),
                        ..Default::default()
                    },
                    self.accent,
                );
            }
        });
    }
}
