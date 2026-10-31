use office_core::lettertypen::{SYMBOLEN, keten};
use ooxml_text::FontStore;
#[test]
fn ontbrekend_huissymbool_krijgt_een_echt_glyph_met_tekenbaar_contour() {
    for (vet, cursief) in [(false, false), (true, false), (false, true), (true, true)] {
        let letters = keten("Times New Roman", vet, cursief, &[]);
        let mut store = FontStore::new();
        let ids: Vec<_> = letters
            .iter()
            .map(|f| store.register(f.bytes.to_vec()).unwrap())
            .collect();
        assert!(!store.covers(ids[0], '🏠').unwrap());
        let font = store
            .resolve(&ids, '🏠')
            .expect("Huissymbool ontbreekt in de documentketen");
        let glyph = store.glyph_id(font, '🏠').unwrap().unwrap();
        assert_ne!(glyph, 0);
        assert!(!store.outline_glyph(font, glyph).unwrap().cmds.is_empty());
        let glyphs = ooxml_text::shape(&store, font, "🏠", 16., &[]).unwrap();
        assert!(!glyphs.is_empty());
        assert!(
            glyphs
                .iter()
                .all(|g| g.glyph_id != 0 && g.x_advance.is_finite() && g.x_advance > 0.)
        );
        assert!(std::ptr::eq(
            letters[ids.iter().position(|id| *id == font).unwrap()],
            &SYMBOLEN
        ));
    }
}

#[test]
fn writer_en_presentatie_rasteren_een_symbool_in_plaats_van_een_ontbrekend_teken() {
    use office_core::document::{Bewerking, Module, Sessie};
    for (module, bytes) in [
        (
            Module::Writer,
            include_bytes!("fixtures/writer.docx").as_slice(),
        ),
        (
            Module::Presentation,
            include_bytes!("fixtures/presentation.pptx").as_slice(),
        ),
    ] {
        let mut s = Sessie::open(module, bytes.to_vec()).unwrap();
        let sleutel = s
            .weergave(0)
            .unwrap()
            .velden
            .into_iter()
            .find(|v| v.bewerkbaar && v.id != "__dia_notities")
            .unwrap()
            .id;
        let mut beelden = vec![];
        for (naam, tekst) in [("symbool", "🏠"), ("ontbrekend", "\u{f0000}")] {
            s.bewerk(
                0,
                Bewerking::Tekst {
                    id: sleutel.clone(),
                    tekst: tekst.into(),
                },
            )
            .unwrap();
            let beeld = s.weergave(0).unwrap();
            let png = beeld.afbeelding.unwrap();
            if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
                let map = std::path::PathBuf::from(map);
                std::fs::create_dir_all(&map).unwrap();
                std::fs::write(map.join(format!("{}-{naam}.png", module.extensie())), &png)
                    .unwrap();
            }
            beelden.push(png);
        }
        assert!(
            beelden[0] != beelden[1],
            "{} tekent voor beide tekens hetzelfde ontbrekende glyph",
            module.naam()
        );
    }
}
