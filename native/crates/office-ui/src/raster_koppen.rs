//! Vaste rij- en kolomkoppen rond het echte raster, ook bij scrollen en zoom.
use super::*;
use iced::{
    Color, Rectangle,
    advanced::{
        Clipboard, Shell, Widget,
        layout::{self, Layout},
        renderer::{self, Renderer as _},
        text::{self, Renderer as _},
        widget::{Operation, Tree},
    },
    mouse,
};
use office_core::interactie::{RasterKop, RasterKoppen};
pub const LINKS: f32 = 38.;
pub const BOVEN: f32 = 24.;
pub fn omlijst<'a>(app: &App, t: &'a Tab, inhoud: Element<'a, Msg>) -> Element<'a, Msg> {
    let Some(koppen) = t.antwoord.as_ref().and_then(|a| a.beeld.raster.as_ref()) else {
        return inhoud;
    };
    Element::new(Koppen {
        inhoud,
        koppen,
        zoom: t.zoom,
        gekozen: t.veld().and_then(|v| celindex(&v.id)),
        accent: app.look().color.accent,
    })
}
fn celindex(id: &str) -> Option<(u32, u32)> {
    // Het adres is al door de documentkern gevalideerd; de UI gebruikt het
    // uitsluitend om de bijbehorende koppen te markeren.
    let grens = id.find(|c: char| c.is_ascii_digit())?;
    let kolom = id[..grens]
        .bytes()
        .try_fold(0u32, |n, c| {
            if !c.is_ascii_uppercase() {
                return None;
            }
            n.checked_mul(26)?.checked_add(u32::from(c - b'A' + 1))
        })?
        .checked_sub(1)?;
    let rij = id[grens..].parse::<u32>().ok()?.checked_sub(1)?;
    Some((rij, kolom))
}
fn kolomnaam(mut index: u32) -> String {
    let mut letters = Vec::new();
    loop {
        letters.push((b'A' + (index % 26) as u8) as char);
        if index < 26 {
            break;
        }
        index = index / 26 - 1;
    }
    letters.into_iter().rev().collect()
}
struct Koppen<'a> {
    inhoud: Element<'a, Msg>,
    koppen: &'a RasterKoppen,
    zoom: f32,
    gekozen: Option<(u32, u32)>,
    accent: Color,
}
/// De koppen blijven in de viewport; hun schaalverdeling beweegt met de cellen.
fn vlakken(grens: Rectangle, viewport: Rectangle) -> Option<(Rectangle, Rectangle, Rectangle)> {
    let clip = grens.intersection(&viewport)?;
    let x = grens.x.max(viewport.x);
    let y = grens.y.max(viewport.y);
    let breedte = LINKS.min(clip.width);
    let hoogte = BOVEN.min(clip.height);
    let hoek = Rectangle {
        x,
        y,
        width: breedte,
        height: hoogte,
    };
    let boven = Rectangle {
        x: x + breedte,
        y,
        width: (clip.width - breedte).max(0.),
        height: hoogte,
    };
    let links = Rectangle {
        x,
        y: y + hoogte,
        width: breedte,
        height: (clip.height - hoogte).max(0.),
    };
    Some((boven, links, hoek))
}
impl Widget<Msg, iced::Theme, iced::Renderer> for Koppen<'_> {
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.inhoud)]
    }
    fn diff(&self, t: &mut Tree) {
        t.diff_children(std::slice::from_ref(&self.inhoud));
    }
    fn size(&self) -> Size<Length> {
        Size::new(Length::Shrink, Length::Shrink)
    }
    fn layout(&mut self, t: &mut Tree, r: &iced::Renderer, l: &layout::Limits) -> layout::Node {
        let kind = self.inhoud.as_widget_mut().layout(
            &mut t.children[0],
            r,
            &l.shrink(Size::new(LINKS, BOVEN)),
        );
        let maat = kind.size();
        layout::Node::with_children(
            Size::new(maat.width + LINKS, maat.height + BOVEN),
            vec![kind.move_to(iced::Point::new(LINKS, BOVEN))],
        )
    }
    fn operate(&mut self, t: &mut Tree, l: Layout<'_>, r: &iced::Renderer, o: &mut dyn Operation) {
        let b = l.bounds();
        for (koppen, horizontaal) in [(&self.koppen.kolommen, true), (&self.koppen.rijen, false)] {
            for k in koppen {
                let naam = if horizontaal {
                    format!("Kolom {}", kolomnaam(k.index))
                } else {
                    format!("Rij {}", k.index + 1)
                };
                let mut node = openaec_ui::design::a11y::Node::new(
                    openaec_ui::design::a11y::Role::Label,
                    naam,
                );
                let rect = if horizontaal {
                    Rectangle {
                        x: b.x + LINKS + k.begin * self.zoom,
                        y: b.y,
                        width: k.omvang * self.zoom,
                        height: BOVEN,
                    }
                } else {
                    Rectangle {
                        x: b.x,
                        y: b.y + BOVEN + k.begin * self.zoom,
                        width: LINKS,
                        height: k.omvang * self.zoom,
                    }
                };
                o.custom(None, rect, &mut node);
            }
        }
        self.inhoud
            .as_widget_mut()
            .operate(&mut t.children[0], l.children().next().unwrap(), r, o);
    }
    fn update(
        &mut self,
        t: &mut Tree,
        e: &iced::Event,
        l: Layout<'_>,
        c: mouse::Cursor,
        r: &iced::Renderer,
        cb: &mut dyn Clipboard,
        s: &mut Shell<'_, Msg>,
        vp: &Rectangle,
    ) {
        if matches!(e, iced::Event::Mouse(mouse::Event::ButtonPressed(_)))
            && vlakken(l.bounds(), *vp).is_some_and(|(boven, links, hoek)| {
                c.is_over(boven) || c.is_over(links) || c.is_over(hoek)
            })
        {
            // Bereikselectie via de koppen volgt apart; nooit een cel onder
            // een vast getekende kop onbedoeld wijzigen of selecteren.
            s.capture_event();
            return;
        }
        self.inhoud.as_widget_mut().update(
            &mut t.children[0],
            e,
            l.children().next().unwrap(),
            c,
            r,
            cb,
            s,
            vp,
        );
    }
    fn mouse_interaction(
        &self,
        t: &Tree,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &Rectangle,
        r: &iced::Renderer,
    ) -> mouse::Interaction {
        if vlakken(l.bounds(), *vp).is_some_and(|(boven, links, hoek)| {
            c.is_over(boven) || c.is_over(links) || c.is_over(hoek)
        }) {
            return mouse::Interaction::default();
        }
        self.inhoud.as_widget().mouse_interaction(
            &t.children[0],
            l.children().next().unwrap(),
            c,
            vp,
            r,
        )
    }
    fn draw(
        &self,
        t: &Tree,
        r: &mut iced::Renderer,
        thema: &iced::Theme,
        stijl: &renderer::Style,
        l: Layout<'_>,
        c: mouse::Cursor,
        vp: &Rectangle,
    ) {
        self.inhoud.as_widget().draw(
            &t.children[0],
            r,
            thema,
            stijl,
            l.children().next().unwrap(),
            c,
            vp,
        );
        let grens = l.bounds();
        let Some((boven, links, hoek)) = vlakken(grens, *vp) else {
            return;
        };
        let achtergrond = Color::from_rgb8(237, 240, 243);
        let rand = Color::from_rgb8(213, 218, 224);
        let vul = |r: &mut iced::Renderer, rect: Rectangle, kleur: Color| {
            r.fill_quad(
                renderer::Quad {
                    bounds: rect,
                    ..Default::default()
                },
                kleur,
            )
        };
        for (gebied, horizontaal, koppen) in [
            (boven, true, &self.koppen.kolommen),
            (links, false, &self.koppen.rijen),
        ] {
            if gebied.width <= 0. || gebied.height <= 0. {
                continue;
            }
            r.with_layer(gebied, |r| {
                vul(r, gebied, achtergrond);
                for k in koppen {
                    self.teken_kop(r, k, horizontaal, grens, gebied, rand);
                }
                let lijn = if horizontaal {
                    Rectangle {
                        y: gebied.y + gebied.height - 1.,
                        height: 1.,
                        ..gebied
                    }
                } else {
                    Rectangle {
                        x: gebied.x + gebied.width - 1.,
                        width: 1.,
                        ..gebied
                    }
                };
                vul(r, lijn, rand);
            });
        }
        // Een eigen laag houdt deze hoek vóór de rasterafbeelding, ook
        // wanneer die na scrollen onder de vaste koppen doorloopt.
        r.with_layer(hoek, |r| {
            vul(r, hoek, achtergrond);
            vul(
                r,
                Rectangle {
                    x: hoek.x + hoek.width - 1.,
                    y: hoek.y,
                    width: 1.,
                    height: hoek.height,
                },
                rand,
            );
            vul(
                r,
                Rectangle {
                    x: hoek.x,
                    y: hoek.y + hoek.height - 1.,
                    width: hoek.width,
                    height: 1.,
                },
                rand,
            );
        });
    }
}
impl Koppen<'_> {
    fn teken_kop(
        &self,
        r: &mut iced::Renderer,
        k: &RasterKop,
        horizontaal: bool,
        b: Rectangle,
        clip: Rectangle,
        rand: Color,
    ) {
        let rect = if horizontaal {
            Rectangle {
                x: b.x + LINKS + k.begin * self.zoom,
                y: clip.y,
                width: k.omvang * self.zoom,
                height: BOVEN,
            }
        } else {
            Rectangle {
                x: clip.x,
                y: b.y + BOVEN + k.begin * self.zoom,
                width: LINKS,
                height: k.omvang * self.zoom,
            }
        };
        if !rect.intersects(&clip) {
            return;
        }
        let gekozen = self.gekozen.is_some_and(|(rij, kolom)| {
            if horizontaal {
                kolom == k.index
            } else {
                rij == k.index
            }
        });
        if gekozen {
            r.fill_quad(
                renderer::Quad {
                    bounds: rect,
                    ..Default::default()
                },
                Color {
                    a: 0.12,
                    ..self.accent
                },
            );
        }
        let lijn = if horizontaal {
            Rectangle {
                x: rect.x + rect.width - 1.,
                y: rect.y,
                width: 1.,
                height: rect.height,
            }
        } else {
            Rectangle {
                x: rect.x,
                y: rect.y + rect.height - 1.,
                width: rect.width,
                height: 1.,
            }
        };
        r.fill_quad(
            renderer::Quad {
                bounds: lijn,
                ..Default::default()
            },
            rand,
        );
        r.fill_text(
            text::Text {
                content: if horizontaal {
                    kolomnaam(k.index)
                } else {
                    (k.index + 1).to_string()
                },
                bounds: Size::new(rect.width, rect.height),
                size: iced::Pixels(11.),
                line_height: text::LineHeight::Relative(1.),
                font: fonts::BODY,
                align_x: text::Alignment::Center,
                align_y: iced::alignment::Vertical::Center,
                shaping: text::Shaping::Basic,
                wrapping: text::Wrapping::None,
            },
            rect.center(),
            if gekozen {
                self.accent
            } else {
                Color::from_rgb8(100, 116, 139)
            },
            clip,
        );
    }
}
