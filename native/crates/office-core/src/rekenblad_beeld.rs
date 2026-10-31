//! De paginarasterizer en de cel-editor gebruiken dezelfde vastgepinde letters.
use crate::document::{Fout, Resultaat};
use betteroffice_xlsx as x;
use std::{cell::RefCell, collections::HashMap, sync::Arc};
use xlsx_raster::{FontFace, FontProvider, ResolvedFont};

type Sleutel = (usize, bool, bool);
thread_local! {
    // Alleen statische fontbytes; geen bron-, pagina- of documentinhoud.
    static LETTERS: RefCell<HashMap<Sleutel, Arc<FontFace<'static>>>> = RefCell::default();
}
struct Documentletters;
fn gezicht(
    f: &'static crate::lettertypen::Lettertype,
    bold: bool,
    italic: bool,
) -> Result<ResolvedFont, String> {
    let sleutel = (f.bytes.as_ptr() as usize, bold, italic);
    let face = LETTERS.with(|slot| {
        if let Some(face) = slot.borrow().get(&sleutel) {
            return Ok(Arc::clone(face));
        }
        let face = FontFace::from_slice(f.bytes, 0)
            .ok_or_else(|| format!("Documentletter kan niet worden gelezen: {}", f.familie))?;
        let face = Arc::new(face);
        slot.borrow_mut().insert(sleutel, Arc::clone(&face));
        Ok::<_, String>(face)
    })?;
    Ok(ResolvedFont {
        face,
        synthetic_bold: bold && !f.vet,
        synthetic_italic: italic && !f.cursief,
    })
}
impl FontProvider for Documentletters {
    fn resolve(
        &self,
        family: Option<&str>,
        bold: bool,
        italic: bool,
    ) -> Result<ResolvedFont, String> {
        gezicht(
            crate::lettertypen::kies(family.unwrap_or("Calibri"), bold, italic),
            bold,
            italic,
        )
    }
    fn fallbacks(
        &self,
        family: Option<&str>,
        bold: bool,
        italic: bool,
        text: &str,
    ) -> Result<Vec<ResolvedFont>, String> {
        let hoofd = self.resolve(family, bold, italic)?;
        if text
            .chars()
            .all(|c| hoofd.face.glyph_index(c).is_some_and(|g| g.0 != 0))
        {
            return Ok(vec![]);
        }
        let symbool = gezicht(&crate::lettertypen::SYMBOLEN, bold, italic)?;
        if text.chars().any(|c| {
            hoofd.face.glyph_index(c).is_none_or(|g| g.0 == 0)
                && symbool.face.glyph_index(c).is_some_and(|g| g.0 != 0)
        }) {
            Ok(vec![symbool])
        } else {
            Ok(vec![])
        }
    }
}
pub fn teken(
    d: &x::Workbook,
    sheet: x::SheetId,
    viewport: &x::Viewport,
) -> Resultaat<x::RenderedPng> {
    // De oorspronkelijke facade bewaakt nog steeds cel-/pixelbudgetten en
    // zichtbare/fixeerde gebieden. De scoped leverancier verandert alleen letters.
    xlsx_raster::with_fonts(Arc::new(Documentletters), || {
        d.render_png_for(sheet, viewport)
    })
    .map_err(|e| Fout::Document(e.to_string()))
}

#[cfg(test)]
mod proeven {
    use super::*;
    fn boek() -> x::Workbook {
        x::Workbook::open(include_bytes!("../tests/fixtures/spreadsheet.xlsx")).unwrap()
    }
    fn venster(d: &x::Workbook) -> x::Viewport {
        x::viewport_for_range(
            d.sheet(x::SheetId(0)).unwrap(),
            &d.model().styles,
            x::CellRange::parse_a1("A1:D12").unwrap(),
        )
    }
    struct Dwing(&'static str);
    impl FontProvider for Dwing {
        fn resolve(
            &self,
            _family: Option<&str>,
            bold: bool,
            italic: bool,
        ) -> Result<ResolvedFont, String> {
            Documentletters.resolve(Some(self.0), bold, italic)
        }
    }
    struct Fout(bool);
    impl FontProvider for Fout {
        fn resolve(&self, _: Option<&str>, _: bool, _: bool) -> Result<ResolvedFont, String> {
            assert!(!self.0, "Eigen proefpaniek in de fontleverancier");
            Err("Eigen proeffout in de fontleverancier".into())
        }
    }
    #[test]
    fn rasterletters_zijn_scoped_genest_en_geisoleerd_bij_fouten_paniek_en_draden() {
        let d = boek();
        let v = venster(&d);
        let id = x::SheetId(0);
        let normaal = d.render_png_for(id, &v).unwrap().bytes;
        let serif = xlsx_raster::with_fonts(Arc::new(Dwing("Times New Roman")), || {
            let eerste = d.render_png_for(id, &v).unwrap().bytes;
            let mono = xlsx_raster::with_fonts(Arc::new(Dwing("Courier New")), || {
                d.render_png_for(id, &v).unwrap().bytes
            });
            assert!(
                eerste != mono,
                "Verschillende familiebronnen moeten echt anders worden getekend"
            );
            let draad = std::thread::spawn(|| {
                let d = boek();
                d.render_png_for(x::SheetId(0), &venster(&d)).unwrap().bytes
            });
            assert!(
                draad.join().unwrap() == normaal,
                "Een andere draad mag geen scoped leverancier erven"
            );
            assert!(
                d.render_png_for(id, &v).unwrap().bytes == eerste,
                "Een geneste leverancier moet de buitenste herstellen"
            );
            eerste
        });
        assert!(serif != normaal);
        assert!(d.render_png_for(id, &v).unwrap().bytes == normaal);
        assert!(
            xlsx_raster::with_fonts(Arc::new(Fout(false)), || d.render_png_for(id, &v)).is_err()
        );
        assert!(d.render_png_for(id, &v).unwrap().bytes == normaal);
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| xlsx_raster::with_fonts(
                Arc::new(Fout(true)),
                || d.render_png_for(id, &v)
            )))
            .is_err()
        );
        assert!(
            d.render_png_for(id, &v).unwrap().bytes == normaal,
            "Ook na een paniek moet de oorspronkelijke leverancier terugkeren"
        );
    }
    #[test]
    fn rasterletters_behouden_de_oorspronkelijke_facadebudgetten() {
        let d = boek();
        let bron = d.save().unwrap();
        let id = x::SheetId(0);
        let mut v = venster(&d);
        v.width = x::MAX_PIXMAP_DIM as f32 + 1.;
        assert!(teken(&d, id, &v).is_err());
        v.width = 100.;
        v.y = f32::NAN;
        assert!(teken(&d, id, &v).is_err());
        assert!(d.save().unwrap() == bron);
        let v = venster(&d);
        assert!(!teken(&d, id, &v).unwrap().bytes.is_empty());
    }
}

#[cfg(test)]
mod symboolproeven {
    use super::*;
    use xlsx_render::{Align, DisplayList, DrawCmd, GridMeta, Rect};
    struct AlleenSymbolen;
    impl FontProvider for AlleenSymbolen {
        fn resolve(
            &self,
            _: Option<&str>,
            vet: bool,
            cursief: bool,
        ) -> Result<ResolvedFont, String> {
            gezicht(&crate::lettertypen::SYMBOLEN, vet, cursief)
        }
    }
    fn vlak(tekst: &str, align: Align, vet: bool, cursief: bool) -> DisplayList {
        DisplayList {
            width: 180.,
            height: 70.,
            truncated: false,
            grid: GridMeta::default(),
            hyperlinks: vec![],
            charts: vec![],
            commands: vec![DrawCmd::Text {
                x: match align {
                    Align::Left => 20.,
                    Align::Center => 90.,
                    Align::Right => 160.,
                },
                y: 45.,
                text: tekst.into(),
                font_size: 22.,
                color: "#123456".into(),
                clip: Rect {
                    x: 10.,
                    y: 5.,
                    w: 160.,
                    h: 60.,
                },
                align,
                bold: vet,
                italic: cursief,
                underline: false,
                strike: false,
                highlight: None,
                dashed_underline: false,
                font_family: Some("Calibri".into()),
                number_format: None,
                ghost: false,
                chart: false,
                rotation_deg: None,
                rotation_box: None,
                rotation_valign: None,
                stacked: false,
                wrap: None,
            }],
        }
    }
    #[test]
    fn spreadsheet_aanvullend_huisglyph_heeft_dezelfde_schaal_uitlijning_en_stijl_als_zijn_eigen_font()
     {
        let hoofd = Documentletters
            .resolve(Some("Calibri"), false, false)
            .unwrap();
        assert!(hoofd.face.glyph_index('🏠').is_none_or(|id| id.0 == 0));
        for (vet, cursief) in [(false, false), (true, false), (false, true), (true, true)] {
            let extra = Documentletters
                .fallbacks(Some("Calibri"), vet, cursief, "café 🏠")
                .unwrap();
            assert_eq!(extra.len(), 1);
            let id = extra[0].face.glyph_index('🏠').unwrap();
            assert_ne!(id.0, 0);
            assert!(extra[0].face.glyph_bounding_box(id).is_some());
            assert_eq!(
                (extra[0].synthetic_bold, extra[0].synthetic_italic),
                (vet, cursief)
            );
            for align in [Align::Left, Align::Center, Align::Right] {
                let beeld = vlak("🏠", align, vet, cursief);
                assert_eq!(
                    xlsx_raster::render_png_with_fonts(&beeld, &Documentletters).unwrap(),
                    xlsx_raster::render_png_with_fonts(&beeld, &AlleenSymbolen).unwrap(),
                    "Het aanvullende glyph moet zijn eigen schaal en gezamenlijke uitlijning gebruiken"
                );
                let mut afgesneden = beeld.clone();
                let DrawCmd::Text { clip, .. } = &mut afgesneden.commands[0] else {
                    panic!()
                };
                *clip = Rect {
                    x: 25.,
                    y: 10.,
                    w: 8.,
                    h: 40.,
                };
                assert_eq!(
                    xlsx_raster::render_png_with_fonts(&afgesneden, &Documentletters).unwrap(),
                    xlsx_raster::render_png_with_fonts(&afgesneden, &AlleenSymbolen).unwrap(),
                    "Een aanvullend glyph mag niet buiten de celclip tekenen"
                );
            }
        }
        assert!(
            Documentletters
                .fallbacks(None, false, false, "café AV")
                .unwrap()
                .is_empty()
        );
        assert!(
            Documentletters
                .fallbacks(None, false, false, "\u{f0000}")
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn spreadsheet_aanvullend_glyph_blijft_zichtbaar_bij_rotatie_stapeling_en_regelterugloop() {
        for (vet, cursief) in [(false, false), (true, false), (false, true), (true, true)] {
            for align in [Align::Left, Align::Center, Align::Right] {
                for variant in 0..5 {
                    let mut beelden = vec![];
                    for tekst in ["🏠🏠", "\u{f0000}\u{f0000}"] {
                        let mut beeld = vlak(tekst, align, vet, cursief);
                        let DrawCmd::Text {
                            rotation_deg,
                            rotation_box,
                            stacked,
                            wrap,
                            ..
                        } = &mut beeld.commands[0]
                        else {
                            panic!()
                        };
                        match variant {
                            0..=2 => {
                                *rotation_deg = Some([-45., 45., 90.][variant]);
                                *rotation_box = Some(Rect {
                                    x: 10.,
                                    y: 5.,
                                    w: 160.,
                                    h: 60.,
                                });
                            }
                            3 => *stacked = true,
                            _ => {
                                *wrap = Some(xlsx_render::TextWrap {
                                    width: 28.,
                                    line_height: 30.,
                                    valign: xlsx_render::TextValign::Center,
                                })
                            }
                        }
                        let png =
                            xlsx_raster::render_png_with_fonts(&beeld, &Documentletters).unwrap();
                        if variant >= 3 && tekst == "🏠🏠" {
                            assert_eq!(
                                png,
                                xlsx_raster::render_png_with_fonts(&beeld, &AlleenSymbolen)
                                    .unwrap(),
                                "Stapeling/terugloop variant {variant}, vet {vet}, cursief {cursief}, uitlijning {align:?} moet de eigen glyphbreedte en pixelafronding gebruiken"
                            );
                        }
                        beelden.push(png);
                    }
                    assert_ne!(
                        beelden[0], beelden[1],
                        "Variant {variant}, vet {vet}, cursief {cursief}, uitlijning {align:?} tekent nog het ontbrekende glyph"
                    );
                }
            }
        }
    }
}
