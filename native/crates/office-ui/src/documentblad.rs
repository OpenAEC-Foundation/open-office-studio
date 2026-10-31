//! Klikgeometrie en selectie liggen in dezelfde coördinaten als het native paginabeeld.
use office_core::interactie::Pagina;
use openaec_ui::iced::{
    Border, Color, Element, Event, Length, Rectangle, Renderer, Size, Theme,
    advanced::{
        Clipboard, Shell, Widget,
        layout::{self, Layout},
        renderer::{self, Renderer as _},
        widget::{Operation, Tree},
    },
    mouse,
};

pub fn blad<'a, M: 'a>(
    inhoud: impl Into<Element<'a, M>>,
    pagina: &'a Pagina,
    gekozen: Option<&'a str>,
    markering: Option<&'a office_core::writer_cursor::TekstMarkering>,
    accent: Color,
    klik: impl Fn(String) -> M + 'a,
) -> Element<'a, M> {
    Element::new(Blad {
        inhoud: inhoud.into(),
        pagina,
        gekozen,
        markering,
        accent,
        klik: Box::new(klik),
    })
}
struct Blad<'a, M> {
    inhoud: Element<'a, M>,
    pagina: &'a Pagina,
    gekozen: Option<&'a str>,
    markering: Option<&'a office_core::writer_cursor::TekstMarkering>,
    accent: Color,
    klik: Box<dyn Fn(String) -> M + 'a>,
}
impl<M> Widget<M, Theme, Renderer> for Blad<'_, M> {
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.inhoud)]
    }
    fn diff(&self, t: &mut Tree) {
        t.diff_children(std::slice::from_ref(&self.inhoud));
    }
    fn size(&self) -> Size<Length> {
        self.inhoud.as_widget().size()
    }
    fn layout(&mut self, t: &mut Tree, r: &Renderer, l: &layout::Limits) -> layout::Node {
        self.inhoud.as_widget_mut().layout(&mut t.children[0], r, l)
    }
    fn operate(&mut self, t: &mut Tree, l: Layout<'_>, r: &Renderer, o: &mut dyn Operation) {
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
        s: &mut Shell<'_, M>,
        vp: &Rectangle,
    ) {
        if matches!(
            e,
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left))
        ) && let Some(p) = c.position_in(l.bounds())
            && c.is_over(*vp)
            && l.bounds().width > 0.
            && l.bounds().height > 0.
            && let Some(id) = self.pagina.raak(
                p.x * self.pagina.breedte / l.bounds().width,
                p.y * self.pagina.hoogte / l.bounds().height,
            )
        {
            s.publish((self.klik)(id.into()));
            s.capture_event();
            return;
        }
        self.inhoud
            .as_widget_mut()
            .update(&mut t.children[0], e, l, c, r, cb, s, vp);
    }
    fn mouse_interaction(
        &self,
        _: &Tree,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &Rectangle,
        _: &Renderer,
    ) -> mouse::Interaction {
        if let Some(p) = c.position_in(l.bounds())
            && c.is_over(*vp)
            && self
                .pagina
                .raak(
                    p.x * self.pagina.breedte / l.bounds().width,
                    p.y * self.pagina.hoogte / l.bounds().height,
                )
                .is_some()
        {
            mouse::Interaction::Pointer
        } else {
            mouse::Interaction::default()
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
        if self.pagina.breedte <= 0. || self.pagina.hoogte <= 0. {
            return;
        }
        let b = l.bounds();
        let sx = b.width / self.pagina.breedte;
        let sy = b.height / self.pagina.hoogte;
        if let Some(m) = self.markering
            && let Some(clip) = b.intersection(vp)
        {
            // Alleen het getekende documentvlak; geen herberekende
            // tekstbreedtes of een tweede editorlayout voor de selectie.
            r.with_layer(clip, |r| {
                for g in &m.rechthoeken {
                    let bounds = Rectangle {
                        x: b.x + g.x * sx,
                        y: b.y + g.y * sy,
                        width: g.breedte * sx,
                        height: g.hoogte * sy,
                    };
                    r.fill_quad(
                        renderer::Quad {
                            bounds,
                            ..Default::default()
                        },
                        Color {
                            a: 0.24,
                            ..self.accent
                        },
                    );
                }
            });
        }
        for vlak in &self.pagina.vlakken {
            if Some(vlak.id.as_str()) != self.gekozen {
                continue;
            }
            let g = vlak.grens;
            let bounds = Rectangle {
                x: b.x + g.x * sx,
                y: b.y + g.y * sy,
                width: g.breedte * sx,
                height: g.hoogte * sy,
            };
            if bounds.intersection(vp).is_some() {
                r.fill_quad(
                    renderer::Quad {
                        bounds,
                        border: Border {
                            color: self.accent,
                            width: 1.5,
                            radius: 0.into(),
                        },
                        ..Default::default()
                    },
                    Color::TRANSPARENT,
                );
            }
        }
    }
}
