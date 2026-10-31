//! Een deelhertekening mag pixels buiten haar gebied niet opnieuw mengen.
use super::*;
use iced::advanced::Renderer as _;
#[test]
fn schaduw_deelhertekening_blijft_pixelgelijk_aan_een_verse_volle_render() {
    let mut fouten = Vec::new();
    for schaal in [1., 1.25, 1.5, 2.] {
        for (naam, x, y) in [("binnen", 20., 20.), ("rand", -8., -4.)] {
            let breedte = (160. * schaal) as u32;
            let hoogte = (120. * schaal) as u32;
            let viewport = iced_tiny_skia::graphics::Viewport::with_physical_size(
                Size::new(breedte, hoogte),
                schaal,
            );
            let mut r = iced_tiny_skia::Renderer::new(iced::Font::DEFAULT, iced::Pixels(12.));
            r.fill_quad(
                iced::advanced::renderer::Quad {
                    bounds: iced::Rectangle::new(iced::Point::new(x, y), Size::new(80., 60.)),
                    shadow: iced::Shadow {
                        color: iced::Color::from_rgba(0., 0., 0., 0.25),
                        offset: iced::Vector::new(4., 4.),
                        blur_radius: 12.,
                    },
                    ..Default::default()
                },
                iced::Color::WHITE,
            );
            let mut pixels = tiny_skia::Pixmap::new(breedte, hoogte).unwrap();
            let mut masker = tiny_skia::Mask::new(breedte, hoogte).unwrap();
            r.draw(
                &mut pixels.as_mut(),
                &mut masker,
                &viewport,
                &[iced::Rectangle::with_size(Size::new(160., 120.))],
                iced::Color::WHITE,
            );
            let vol = pixels.data().to_vec();
            let vak = iced::Rectangle::new(iced::Point::new(30., 30.), Size::new(8., 8.));
            for _ in 0..3 {
                r.draw(
                    &mut pixels.as_mut(),
                    &mut masker,
                    &viewport,
                    &[vak],
                    iced::Color::WHITE,
                );
            }
            let verschil = pixels
                .data()
                .as_chunks::<4>()
                .0
                .iter()
                .zip(vol.as_chunks::<4>().0.iter())
                .filter(|(a, b)| a != b)
                .count();
            if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
                let map = PathBuf::from(map);
                std::fs::create_dir_all(&map).unwrap();
                tiny_skia::Pixmap::from_vec(
                    vol,
                    tiny_skia::IntSize::from_wh(breedte, hoogte).unwrap(),
                )
                .unwrap()
                .save_png(map.join(format!("schaduw-{naam}-{schaal}-vol.png")))
                .unwrap();
                pixels
                    .save_png(map.join(format!("schaduw-{naam}-{schaal}-deel.png")))
                    .unwrap();
            }
            if verschil > 0 {
                fouten.push((naam, schaal, verschil));
            }
        }
    }
    assert!(
        fouten.is_empty(),
        "Ongewijzigde pixels veranderen bij deelhertekenen: {fouten:?}"
    );
}

#[test]
fn gekleurde_ronde_randen_veranderen_niet_bij_deelhertekenen() {
    let mut fouten = Vec::new();
    for schaal in [1., 1.25, 1.5, 2.] {
        let (w, h) = ((100. * schaal) as u32, (80. * schaal) as u32);
        let viewport =
            iced_tiny_skia::graphics::Viewport::with_physical_size(Size::new(w, h), schaal);
        let mut r = iced_tiny_skia::Renderer::new(iced::Font::DEFAULT, iced::Pixels(12.));
        r.fill_quad(
            iced::advanced::renderer::Quad {
                bounds: iced::Rectangle::new(iced::Point::new(8., 35.), Size::new(72., 22.)),
                border: iced::Border {
                    radius: 6.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            },
            iced::Color::from_rgb8(217, 119, 6),
        );
        let mut pixels = tiny_skia::Pixmap::new(w, h).unwrap();
        let mut masker = tiny_skia::Mask::new(w, h).unwrap();
        r.draw(
            &mut pixels.as_mut(),
            &mut masker,
            &viewport,
            &[iced::Rectangle::with_size(Size::new(100., 80.))],
            iced::Color::WHITE,
        );
        let vol = pixels.data().to_vec();
        for _ in 0..3 {
            r.draw(
                &mut pixels.as_mut(),
                &mut masker,
                &viewport,
                &[iced::Rectangle::new(
                    iced::Point::new(7., 34.),
                    Size::new(8., 12.),
                )],
                iced::Color::WHITE,
            );
        }
        let verschil = pixels
            .data()
            .as_chunks::<4>()
            .0
            .iter()
            .zip(vol.as_chunks::<4>().0.iter())
            .filter(|(a, b)| a != b)
            .count();
        if verschil > 0 {
            fouten.push((schaal, verschil));
        }
    }
    assert!(
        fouten.is_empty(),
        "Gekleurde ronde randen hebben een afwijkende menging: {fouten:?}"
    );
}
