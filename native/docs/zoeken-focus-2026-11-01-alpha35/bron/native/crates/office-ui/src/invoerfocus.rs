//! Een uitgestelde focusvraag vervalt zodra de gebruiker verder bedient.
use super::*;
use iced::advanced::{
    Clipboard, Shell, Widget,
    layout::{self, Layout},
    overlay, renderer,
    widget::{Id, Operation, Tree, operation::Outcome},
};
use iced::{Event, Rectangle, Renderer, Theme, mouse};
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

pub type Generatie = Arc<AtomicU64>;

fn registreer(generatie: &Generatie, event: &Event) {
    if matches!(
        event,
        Event::Mouse(mouse::Event::ButtonPressed(_))
            | Event::Touch(iced::touch::Event::FingerPressed { .. })
            | Event::Keyboard(iced::keyboard::Event::KeyPressed { .. })
            | Event::Window(iced::window::Event::Unfocused)
    ) {
        generatie.fetch_add(1, Ordering::Relaxed);
    }
}

/// Leg de bediening vast vóór de widget zelf berichten of focusvragen maakt.
/// Ook afgehandelde gebeurtenissen en keuzemenu's tellen mee.
pub fn volg<'a>(inhoud: impl Into<Element<'a, Msg>>, generatie: Generatie) -> Element<'a, Msg> {
    Element::new(Bediening {
        inhoud: inhoud.into(),
        generatie,
    })
}

struct Bediening<'a> {
    inhoud: Element<'a, Msg>,
    generatie: Generatie,
}
impl Widget<Msg, Theme, Renderer> for Bediening<'_> {
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
        registreer(&self.generatie, e);
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
    ) -> Option<overlay::Element<'a, Msg, Theme, Renderer>> {
        self.inhoud
            .as_widget_mut()
            .overlay(&mut t.children[0], l, r, vp, v)
            .map(|inhoud| {
                overlay::Element::new(Box::new(Bovenlaag {
                    inhoud,
                    generatie: self.generatie.clone(),
                }))
            })
    }
}

struct Bovenlaag<'a> {
    inhoud: overlay::Element<'a, Msg, Theme, Renderer>,
    generatie: Generatie,
}
impl overlay::Overlay<Msg, Theme, Renderer> for Bovenlaag<'_> {
    fn layout(&mut self, r: &Renderer, b: Size) -> layout::Node {
        self.inhoud.as_overlay_mut().layout(r, b)
    }
    fn operate(&mut self, l: Layout<'_>, r: &Renderer, o: &mut dyn Operation) {
        self.inhoud.as_overlay_mut().operate(l, r, o);
    }
    fn update(
        &mut self,
        e: &Event,
        l: Layout<'_>,
        c: mouse::Cursor,
        r: &Renderer,
        cb: &mut dyn Clipboard,
        s: &mut Shell<'_, Msg>,
    ) {
        registreer(&self.generatie, e);
        self.inhoud.as_overlay_mut().update(e, l, c, r, cb, s);
    }
    fn mouse_interaction(
        &self,
        l: Layout<'_>,
        c: mouse::Cursor,
        r: &Renderer,
    ) -> mouse::Interaction {
        self.inhoud.as_overlay().mouse_interaction(l, c, r)
    }
    fn draw(
        &self,
        r: &mut Renderer,
        thema: &Theme,
        stijl: &renderer::Style,
        l: Layout<'_>,
        c: mouse::Cursor,
    ) {
        self.inhoud.as_overlay().draw(r, thema, stijl, l, c);
    }
    fn overlay<'a>(
        &'a mut self,
        l: Layout<'a>,
        r: &Renderer,
    ) -> Option<overlay::Element<'a, Msg, Theme, Renderer>> {
        self.inhoud.as_overlay_mut().overlay(l, r).map(|inhoud| {
            overlay::Element::new(Box::new(Bovenlaag {
                inhoud,
                generatie: self.generatie.clone(),
            }))
        })
    }
    fn index(&self) -> f32 {
        self.inhoud.as_overlay().index()
    }
}

struct Focusvraag {
    generatie: Generatie,
    verwacht: u64,
    doel: Id,
    aanwezig: bool,
}
impl Operation for Focusvraag {
    fn traverse(&mut self, f: &mut dyn FnMut(&mut dyn Operation)) {
        f(self);
    }
    fn focusable(
        &mut self,
        id: Option<&Id>,
        _: Rectangle,
        _: &mut dyn iced::advanced::widget::operation::Focusable,
    ) {
        self.aanwezig |= id == Some(&self.doel);
    }
    fn finish(&self) -> Outcome<()> {
        if self.aanwezig && self.generatie.load(Ordering::Relaxed) == self.verwacht {
            Outcome::Chain(Box::new(
                iced::advanced::widget::operation::focusable::focus(self.doel.clone()),
            ))
        } else {
            Outcome::None
        }
    }
}
/// Het unieke doel moet nog in de actuele, bedienbare widgetboom staan.
pub fn vraag(generatie: &Generatie, doel: Id) -> Task<Msg> {
    iced::advanced::widget::operate(Focusvraag {
        generatie: generatie.clone(),
        verwacht: generatie.load(Ordering::Relaxed),
        doel,
        aanwezig: false,
    })
    .discard()
}
