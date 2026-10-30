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
        let bg = Color::from_rgb8(238, 240, 244);
        let fg = Color::from_rgb8(100, 105, 114);
        r.fill_quad(
            renderer::Quad {
                bounds: b,
                ..Default::default()
            },
            bg,
        );
        let breedte = self.pagina.breedte * self.zoom;
        let offset = if self.horizontaal {
            (b.width.max(breedte + 48.) - breedte) / 2. - self.scroll.x
        } else {
            23. - self.scroll.y
        };
        let marge = self
            .pagina
            .inhoud
            .map(|g| if self.horizontaal { g.x } else { g.y })
            .unwrap_or(0.)
            * self.zoom;
        let stap = 96. / 2.54 / 5. * self.zoom;
        let clip = vp.intersection(&b).unwrap_or_default();
        for n in -50i32..200 {
            let p = offset + marge + n as f32 * stap;
            let max = if self.horizontaal { b.width } else { b.height };
            if p < 0. || p > max {
                continue;
            }
            let groot = n % 5 == 0;
            let bounds = if self.horizontaal {
                Rectangle {
                    x: b.x + p,
                    y: b.y + if groot { 17. } else { 20. },
                    width: 1.,
                    height: if groot { 6. } else { 3. },
                }
            } else {
                Rectangle {
                    x: b.x + if groot { 11. } else { 14. },
                    y: b.y + p,
                    width: if groot { 6. } else { 3. },
                    height: 1.,
                }
            };
            r.fill_quad(
                renderer::Quad {
                    bounds,
                    ..Default::default()
                },
                fg,
            );
            if groot && n != 0 {
                let punt = if self.horizontaal {
                    iced::Point::new(b.x + p, b.y + 8.)
                } else {
                    iced::Point::new(b.x + 5., b.y + p)
                };
                r.fill_text(
                    text::Text {
                        content: (n / 5).abs().to_string(),
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
                    fg,
                    clip,
                );
            }
        }
    }
}
