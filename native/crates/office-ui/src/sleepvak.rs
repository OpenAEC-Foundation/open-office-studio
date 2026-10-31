//! Canvasgebaren blijven lokaal tot loslaten; één sleepbeweging geeft één undo-stap.
use super::*;
use iced::{
    Event, Rectangle, Renderer, Theme,
    advanced::{
        Clipboard, Shell, Widget,
        layout::{self, Layout},
        renderer,
        widget::{Operation, Tree, tree},
    },
    mouse,
};
use office_core::interactie::Rechthoek;
#[derive(Default)]
struct Staat {
    document: u64,
    begin: Option<(iced::Point, Rechthoek, bool)>,
}
pub fn vak<'a>(
    inhoud: Element<'a, Msg>,
    document: u64,
    index: usize,
    grens: Rechthoek,
    zoom: f32,
    aan: bool,
) -> Element<'a, Msg> {
    Element::new(Sleepvak {
        inhoud,
        document,
        index,
        grens,
        zoom,
        aan,
    })
}
struct Sleepvak<'a> {
    inhoud: Element<'a, Msg>,
    document: u64,
    index: usize,
    grens: Rechthoek,
    zoom: f32,
    aan: bool,
}
impl Widget<Msg, Theme, Renderer> for Sleepvak<'_> {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<Staat>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(Staat {
            document: self.document,
            ..Default::default()
        })
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.inhoud)]
    }
    fn diff(&self, t: &mut Tree) {
        let staat = t.state.downcast_mut::<Staat>();
        if staat.document != self.document || !self.aan {
            staat.begin = None;
            staat.document = self.document;
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
        let staat = t.state.downcast_mut::<Staat>();
        if matches!(e, Event::Window(iced::window::Event::Unfocused))
            && staat.begin.take().is_some()
        {
            s.publish(Msg::CanvasAnnuleer);
            return;
        }
        if matches!(
            e,
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left))
        ) && c.position().is_none()
            && staat.begin.take().is_some()
        {
            s.publish(Msg::CanvasAnnuleer);
            return;
        }
        if self.aan
            && matches!(
                e,
                Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left))
            )
            && c.is_over(*vp)
            && let Some(p) = c.position_in(l.bounds())
        {
            let vergroten = p.x > l.bounds().width - 20. && p.y > l.bounds().height - 20.;
            if (p.y < 24. || vergroten)
                && let Some(punt) = c.position()
            {
                staat.begin = Some((punt, self.grens, vergroten));
                s.capture_event();
                return;
            }
        }
        if let Some((begin, g, vergroten)) = staat.begin {
            if matches!(
                e,
                Event::Mouse(
                    mouse::Event::CursorMoved { .. }
                        | mouse::Event::ButtonReleased(mouse::Button::Left)
                )
            ) && let Some(punt) = c.position()
            {
                let grens = verschuif(
                    g,
                    (punt.x - begin.x) / self.zoom,
                    (punt.y - begin.y) / self.zoom,
                    vergroten,
                );
                let vast = matches!(e, Event::Mouse(mouse::Event::ButtonReleased(_)));
                if vast {
                    staat.begin = None;
                }
                s.publish(Msg::NotitiePlaats(self.index, grens, vast));
                s.capture_event();
                return;
            }
            if matches!(
                e,
                Event::Keyboard(iced::keyboard::Event::KeyPressed {
                    key: iced::keyboard::Key::Named(iced::keyboard::key::Named::Escape),
                    ..
                })
            ) {
                staat.begin = None;
                s.publish(Msg::CanvasAnnuleer);
                s.capture_event();
                return;
            }
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
        if self.aan
            && let Some(p) = c.position_in(l.bounds())
        {
            if p.x > l.bounds().width - 20. && p.y > l.bounds().height - 20. {
                return mouse::Interaction::ResizingDiagonallyDown;
            }
            if p.y < 24. {
                return mouse::Interaction::Grab;
            }
        }
        self.inhoud
            .as_widget()
            .mouse_interaction(&t.children[0], l, c, vp, r)
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
    }
}
pub fn verschuif(mut g: Rechthoek, dx: f32, dy: f32, vergroten: bool) -> Rechthoek {
    if vergroten {
        g.breedte = (g.breedte + dx).clamp(200., 2000.);
        g.hoogte = (g.hoogte + dy).clamp(80., 5000.);
    } else {
        g.x = (g.x + dx).clamp(0., 10000.);
        g.y = (g.y + dy).clamp(0., 20000.);
    }
    g
}
