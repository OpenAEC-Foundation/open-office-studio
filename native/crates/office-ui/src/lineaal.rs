//! Maatverdeling in documentcentimeters, op basis van de echte pagina- en inhoudsgrenzen.
use super::*;
use iced::{
    Color, Rectangle, Renderer, Theme,
    advanced::{
        Widget,
        layout::{self, Layout},
        renderer::{self, Renderer as _},
        text::{self, Renderer as _},
        widget::Tree,
    },
    mouse,
};
pub const BOVENRUIMTE: f32 = 24.;

pub fn lineaal(
    pagina: &office_core::interactie::Pagina,
    zoom: f32,
    scroll: iced::Point,
    horizontaal: bool,
) -> Element<'_, Msg> {
    Element::new(Lineaal {
        pagina,
        zoom,
        scroll,
        horizontaal,
    })
}
struct Lineaal<'a> {
    pagina: &'a office_core::interactie::Pagina,
    zoom: f32,
    scroll: iced::Point,
    horizontaal: bool,
}
impl Widget<Msg, Theme, Renderer> for Lineaal<'_> {
    fn size(&self) -> Size<Length> {
        if self.horizontaal {
            Size::new(Length::Fill, Length::Fixed(24.))
        } else {
            Size::new(Length::Fixed(18.), Length::Fill)
        }
    }
    fn layout(&mut self, _: &mut Tree, _: &Renderer, l: &layout::Limits) -> layout::Node {
        let s = self.size();
        layout::Node::new(l.resolve(s.width, s.height, Size::ZERO))
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
        let breedte = self.pagina.breedte * self.zoom;
        let lengte = if self.horizontaal {
            breedte
        } else {
            self.pagina.hoogte * self.zoom
        };
        let offset = if self.horizontaal {
            (b.width.max(breedte + 48.) - breedte) / 2. - self.scroll.x
        } else {
            BOVENRUIMTE - self.scroll.y
        };
        let marge = self
            .pagina
            .inhoud
            .map(|g| if self.horizontaal { g.x } else { g.y })
            .unwrap_or(0.)
            * self.zoom;
        let inhoud = self
            .pagina
            .inhoud
            .map(|g| {
                if self.horizontaal {
                    g.breedte
                } else {
                    g.hoogte
                }
            })
            .unwrap_or(lengte / self.zoom)
            * self.zoom;
        // De schaal en kleuren volgen tekst/liniaal/model.ts en liniaal.css:
        // kwartcentimeters, halve centimeters en cijfers bij hele centimeters.
        let stap = 96. / 2.54 / 4. * self.zoom;
        r.with_layer(clip, |r| {
            let vlak = |langs: f32, maat: f32| {
                if self.horizontaal {
                    Rectangle {
                        x: b.x + langs,
                        y: b.y + 3.,
                        width: maat,
                        height: b.height - 6.,
                    }
                } else {
                    Rectangle {
                        x: b.x + 3.,
                        y: b.y + langs,
                        width: b.width - 6.,
                        height: maat,
                    }
                }
            };
            let mut vul = |grens, kleur| {
                r.fill_quad(
                    renderer::Quad {
                        bounds: grens,
                        ..Default::default()
                    },
                    kleur,
                )
            };
            vul(b, Color::from_rgb8(237, 240, 243));
            if lengte <= 0. {
                return;
            }
            vul(vlak(offset, lengte), Color::from_rgb8(217, 221, 227));
            vul(vlak(offset + marge, inhoud), Color::WHITE);
            let begin = (-marge / stap).ceil() as i32;
            let einde = ((lengte - marge) / stap).floor() as i32;
            for n in (begin..=einde).take(2000) {
                let p = offset + marge + n as f32 * stap;
                let max = if self.horizontaal { b.width } else { b.height };
                if n == 0 || p < 0. || p > max {
                    continue;
                }
                if n % 4 != 0 {
                    let maat = if n % 2 == 0 { 5. } else { 2. };
                    let bounds = if self.horizontaal {
                        Rectangle {
                            x: b.x + p,
                            y: b.y + (b.height - maat) / 2.,
                            width: 1.,
                            height: maat,
                        }
                    } else {
                        Rectangle {
                            x: b.x + (b.width - maat) / 2.,
                            y: b.y + p,
                            width: maat,
                            height: 1.,
                        }
                    };
                    r.fill_quad(
                        renderer::Quad {
                            bounds,
                            ..Default::default()
                        },
                        Color::from_rgb8(122, 128, 138),
                    );
                } else {
                    let punt = if self.horizontaal {
                        iced::Point::new(b.x + p, b.center_y())
                    } else {
                        iced::Point::new(b.center_x(), b.y + p)
                    };
                    r.fill_text(
                        text::Text {
                            content: (n / 4).abs().to_string(),
                            bounds: Size::new(16., 16.),
                            size: iced::Pixels(9.),
                            line_height: text::LineHeight::Relative(1.),
                            font: fonts::BODY,
                            align_x: text::Alignment::Center,
                            align_y: iced::alignment::Vertical::Center,
                            shaping: text::Shaping::Basic,
                            wrapping: text::Wrapping::None,
                        },
                        punt,
                        Color::from_rgb8(74, 80, 90),
                        clip,
                    );
                }
            }
        });
    }
}
