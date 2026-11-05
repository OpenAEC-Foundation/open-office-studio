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
pub fn volg<'a>(
    inhoud: impl Into<Element<'a, Msg>>,
    generatie: Generatie,
    zoektoetsen: bool,
) -> Element<'a, Msg> {
    Element::new(Bediening {
        inhoud: inhoud.into(),
        generatie,
        zoektoetsen,
    })
}

struct Bediening<'a> {
    inhoud: Element<'a, Msg>,
    generatie: Generatie,
    zoektoetsen: bool,
}
fn zoektoets(event: &Event) -> Option<bool> {
    let Event::Keyboard(iced::keyboard::Event::KeyPressed {
        key: iced::keyboard::Key::Character(tekst),
        modifiers,
        ..
    }) = event
    else {
        return None;
    };
    if !modifiers.command() {
        return None;
    }
    match tekst.to_lowercase().as_str() {
        "f" => Some(false),
        "h" => Some(true),
        _ => None,
    }
}
fn sluit_ronde(
    shell: &mut Shell<'_, Msg>,
    mut lokaal: Shell<'_, Msg>,
    event: &Event,
    generatie: u64,
    zoektoetsen: bool,
) {
    if zoektoetsen
        && !lokaal.is_event_captured()
        && let Some(vervangen) = zoektoets(event)
    {
        lokaal.publish(Msg::Zoeken(zoeken_ui::Bericht::Open(vervangen)));
        lokaal.capture_event();
    }
    // App::update kan pas volgen nadat meerdere latere gebeurtenissen zijn
    // afgehandeld. Bewaar daarom het stempel van de oorspronkelijke invoer.
    shell.merge(lokaal, |bericht| match bericht {
        Msg::Zoeken(zoek) => Msg::ZoekenInvoer(generatie, zoek),
        ander => ander,
    });
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
        let generatie = self.generatie.load(Ordering::Relaxed);
        let mut berichten = Vec::new();
        let mut lokaal = Shell::new(&mut berichten);
        self.inhoud
            .as_widget_mut()
            .update(&mut t.children[0], e, l, c, r, cb, &mut lokaal, vp);
        sluit_ronde(s, lokaal, e, generatie, self.zoektoetsen);
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
                    zoektoetsen: self.zoektoetsen,
                }))
            })
    }
}

struct Bovenlaag<'a> {
    inhoud: overlay::Element<'a, Msg, Theme, Renderer>,
    generatie: Generatie,
    zoektoetsen: bool,
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
        let generatie = self.generatie.load(Ordering::Relaxed);
        let mut berichten = Vec::new();
        let mut lokaal = Shell::new(&mut berichten);
        self.inhoud
            .as_overlay_mut()
            .update(e, l, c, r, cb, &mut lokaal);
        sluit_ronde(s, lokaal, e, generatie, self.zoektoetsen);
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
                zoektoetsen: self.zoektoetsen,
            }))
        })
    }
    fn index(&self) -> f32 {
        self.inhoud.as_overlay().index()
    }
}

struct Focusvraag {
    selecteer: bool,
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
            if self.selecteer {
                Outcome::Chain(Box::new(FocusMetSelectie {
                    doel: self.doel.clone(),
                }))
            } else {
                Outcome::Chain(Box::new(
                    iced::advanced::widget::operation::focusable::focus(self.doel.clone()),
                ))
            }
        } else {
            Outcome::None
        }
    }
}
/// Het unieke doel moet nog in de actuele, bedienbare widgetboom staan.
pub fn vraag(generatie: &Generatie, doel: Id, verwacht: u64) -> Task<Msg> {
    iced::advanced::widget::operate(Focusvraag {
        selecteer: false,
        generatie: generatie.clone(),
        verwacht,
        doel,
        aanwezig: false,
    })
    .discard()
}

/// Focus en selectie vinden in dezelfde gecontroleerde vervolgstap plaats.
/// Een oud of verdwenen veld mag ook geen latere selectie wissen.
pub fn vraag_met_selectie(generatie: &Generatie, doel: Id, verwacht: u64) -> Task<Msg> {
    iced::advanced::widget::operate(Focusvraag {
        selecteer: true,
        generatie: generatie.clone(),
        verwacht,
        doel,
        aanwezig: false,
    })
    .discard()
}
struct FocusMetSelectie {
    doel: Id,
}
impl Operation for FocusMetSelectie {
    fn traverse(&mut self, f: &mut dyn FnMut(&mut dyn Operation)) {
        f(self);
    }
    fn focusable(
        &mut self,
        id: Option<&Id>,
        _: Rectangle,
        staat: &mut dyn iced::advanced::widget::operation::Focusable,
    ) {
        if id == Some(&self.doel) {
            staat.focus();
        } else {
            staat.unfocus();
        }
    }
    fn finish(&self) -> Outcome<()> {
        // Iced bezoekt tekstinvoer vóór focusable; focus() zet de cursor aan
        // het einde. Selecteer daarom pas na die volledige focusronde.
        Outcome::Chain(Box::new(
            iced::advanced::widget::operation::text_input::select_all(self.doel.clone()),
        ))
    }
}
