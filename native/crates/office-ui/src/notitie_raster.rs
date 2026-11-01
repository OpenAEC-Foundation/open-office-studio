//! Het vrije canvas tekent alleen zichtbare rasterpunten en verwerkt echte dubbelklikken.
use super::*;
use iced::advanced::{
    Clipboard, Shell, Widget,
    layout::{self, Layout},
    renderer::{self, Renderer as _},
    widget::{Tree, tree},
};
use iced::{Event, Rectangle, Renderer, Theme, mouse};
use std::time::{Duration, Instant};

#[derive(Default)]
struct Staat {
    document: u64,
    deel: usize,
    hash: String,
    zoom: f32,
    klik: Option<(Instant, iced::Point)>,
}
pub fn raster<'a>(t: &Tab, a: &Antwoord, breedte: f32, hoogte: f32, aan: bool) -> Element<'a, Msg> {
    Element::new(Raster {
        document: t.id,
        deel: t.deel,
        hash: a.hash.clone(),
        zoom: t.zoom,
        breedte,
        hoogte,
        aan,
    })
}
struct Raster {
    document: u64,
    deel: usize,
    hash: String,
    zoom: f32,
    breedte: f32,
    hoogte: f32,
    aan: bool,
}
impl Widget<Msg, Theme, Renderer> for Raster {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<Staat>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(Staat {
            document: self.document,
            deel: self.deel,
            hash: self.hash.clone(),
            zoom: self.zoom,
            klik: None,
        })
    }
    fn diff(&self, t: &mut Tree) {
        let s = t.state.downcast_mut::<Staat>();
        if s.document != self.document
            || s.deel != self.deel
            || s.hash != self.hash
            || s.zoom != self.zoom
            || !self.aan
        {
            *s = Staat {
                document: self.document,
                deel: self.deel,
                hash: self.hash.clone(),
                zoom: self.zoom,
                klik: None,
            };
        }
    }
    fn size(&self) -> Size<Length> {
        Size::new(Length::Fixed(self.breedte), Length::Fixed(self.hoogte))
    }
    fn layout(&mut self, _: &mut Tree, _: &Renderer, l: &layout::Limits) -> layout::Node {
        let s = self.size();
        layout::Node::new(l.resolve(s.width, s.height, Size::ZERO))
    }
    fn update(
        &mut self,
        t: &mut Tree,
        e: &Event,
        l: Layout<'_>,
        c: mouse::Cursor,
        _: &Renderer,
        _: &mut dyn Clipboard,
        s: &mut Shell<'_, Msg>,
        vp: &Rectangle,
    ) {
        let staat = t.state.downcast_mut::<Staat>();
        if matches!(e, Event::Window(iced::window::Event::Unfocused)) {
            staat.klik = None;
            return;
        }
        if !self.aan {
            return;
        }
        let Some(punt) = c.position_over(l.bounds()).filter(|p| vp.contains(*p)) else {
            return;
        };
        if matches!(
            e,
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left))
        ) {
            let nu = Instant::now();
            let dubbel = staat.klik.is_some_and(|(tijd, p)| {
                nu.duration_since(tijd) <= Duration::from_millis(500)
                    && (p.x - punt.x).abs() <= 5.
                    && (p.y - punt.y).abs() <= 5.
            });
            staat.klik = if dubbel { None } else { Some((nu, punt)) };
            if dubbel {
                let x = (punt.x - l.bounds().x) / self.zoom;
                let y = (punt.y - l.bounds().y) / self.zoom;
                if x <= 10000. && y <= 20000. {
                    s.publish(Msg::NotitieNieuwVak {
                        document: self.document,
                        hash: self.hash.clone(),
                        deel: self.deel,
                        x,
                        y,
                    });
                }
            }
            s.capture_event();
        }
    }
    fn draw(
        &self,
        _: &Tree,
        r: &mut Renderer,
        _: &Theme,
        _: &renderer::Style,
        l: Layout<'_>,
        _: mouse::Cursor,
        vp: &Rectangle,
    ) {
        let b = l.bounds();
        let Some(clip) = vp.intersection(&b) else {
            return;
        };
        let stap = 20. * self.zoom;
        let straal = 0.7 * self.zoom;
        let x0 = ((clip.x - b.x - stap / 2.) / stap).ceil() as i32;
        let x1 = ((clip.x + clip.width - b.x - stap / 2.) / stap).floor() as i32;
        let y0 = ((clip.y - b.y - stap / 2.) / stap).ceil() as i32;
        let y1 = ((clip.y + clip.height - b.y - stap / 2.) / stap).floor() as i32;
        r.with_layer(clip, |r| {
            r.fill_quad(
                renderer::Quad {
                    bounds: b,
                    ..Default::default()
                },
                iced::Color::from_rgb8(250, 250, 249),
            );
            for y in y0..=y1 {
                for x in x0..=x1 {
                    r.fill_quad(
                        renderer::Quad {
                            bounds: Rectangle {
                                x: b.x + stap * (x as f32 + 0.5) - straal,
                                y: b.y + stap * (y as f32 + 0.5) - straal,
                                width: straal * 2.,
                                height: straal * 2.,
                            },
                            border: iced::Border {
                                radius: straal.into(),
                                ..Default::default()
                            },
                            ..Default::default()
                        },
                        iced::Color::from_rgba8(168, 162, 158, 56. / 255.),
                    );
                }
            }
        });
    }
}
