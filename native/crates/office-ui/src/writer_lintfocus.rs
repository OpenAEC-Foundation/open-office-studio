//! Een opmaakknop is geen tekstveld: een reeds actieve paginacursor houdt
//! zijn toetsen tijdens de klik, ook vóór de asynchrone focusoperatie.
use super::*;
use iced::advanced::{
    Clipboard, Shell, Widget,
    layout::{self, Layout},
    renderer,
    widget::{Operation, Tree},
};
use iced::{Event, Rectangle, Renderer, Theme, mouse};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

pub fn behoud<'a>(t: &Tab, inhoud: Element<'a, Msg>, aangesloten: bool) -> Element<'a, Msg> {
    if !t
        .antwoord
        .as_ref()
        .is_some_and(|a| a.beeld.module == Module::Writer)
    {
        return inhoud;
    }
    Element::new(Opmaakknop {
        inhoud,
        aangesloten,
        paginafocus: t.writer_focus.clone(),
        lintdruk: t.writer_lintdruk.clone(),
    })
}
struct Opmaakknop<'a> {
    inhoud: Element<'a, Msg>,
    aangesloten: bool,
    paginafocus: Arc<AtomicBool>,
    lintdruk: Arc<AtomicBool>,
}
impl Widget<Msg, Theme, Renderer> for Opmaakknop<'_> {
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
        s: &mut Shell<'_, Msg>,
        vp: &Rectangle,
    ) {
        match e {
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left))
                if self.aangesloten
                    && c.is_over(l.bounds())
                    && c.is_over(*vp)
                    && self.paginafocus.load(Ordering::Relaxed) =>
            {
                self.lintdruk.store(true, Ordering::Relaxed);
            }
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left))
            | Event::Window(iced::window::Event::Unfocused) => {
                self.lintdruk.store(false, Ordering::Relaxed)
            }
            _ => {}
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
        self.inhoud
            .as_widget()
            .mouse_interaction(&t.children[0], l, c, vp, r)
    }
    fn draw(
        &self,
        t: &Tree,
        r: &mut Renderer,
        thema: &Theme,
        stijl: &renderer::Style,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &Rectangle,
    ) {
        self.inhoud
            .as_widget()
            .draw(&t.children[0], r, thema, stijl, l, c, vp);
    }
    fn overlay<'a>(
        &'a mut self,
        t: &'a mut Tree,
        l: Layout<'a>,
        r: &Renderer,
        vp: &Rectangle,
        v: iced::Vector,
    ) -> Option<iced::advanced::overlay::Element<'a, Msg, Theme, Renderer>> {
        self.inhoud
            .as_widget_mut()
            .overlay(&mut t.children[0], l, r, vp, v)
    }
}
