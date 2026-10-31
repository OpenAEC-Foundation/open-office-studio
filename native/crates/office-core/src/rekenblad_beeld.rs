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
impl FontProvider for Documentletters {
    fn resolve(
        &self,
        family: Option<&str>,
        bold: bool,
        italic: bool,
    ) -> Result<ResolvedFont, String> {
        let f = crate::lettertypen::kies(family.unwrap_or("Calibri"), bold, italic);
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
