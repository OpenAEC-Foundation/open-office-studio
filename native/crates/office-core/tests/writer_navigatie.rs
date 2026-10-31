//! Paginanavigatie gebruikt de behouden layout en verandert geen documentgeschiedenis.
use office_core::document::{Bewerking, Document, Module, Sessie};
const ZES: &[u8] = include_bytes!("fixtures/writer-cachepaginas.docx");
const TABEL: &[u8] = include_bytes!("fixtures/writer-structuur.docx");
#[test]
fn tekstnavigatie_vindt_alle_zes_paginas_zonder_bron_of_undo_te_veranderen() {
    let s = Sessie::open(Module::Writer, ZES.to_vec()).unwrap();
    let hash = s.bron_hash().to_owned();
    let b = s.weergave(0).unwrap();
    assert_eq!(b.onderdelen.len(), 6);
    for n in [5, 1, 4, 0, 3, 2] {
        let v = b
            .velden
            .iter()
            .find(|v| v.tekst.contains(&format!("cachepagina {n} ")))
            .unwrap();
        let begin = v.tekst.chars().position(|c| c == '🏠').unwrap();
        let (pagina, beeld) = s.naar_tekstbereik(&v.id, &hash, begin, begin + 1).unwrap();
        assert_eq!(pagina, n);
        assert_eq!(beeld.voorkeursveld.as_deref(), Some(v.id.as_str()));
        assert!(beeld.pagina.vlakken.iter().any(|r| r.id == v.id));
        assert_eq!(s.bron().as_slice(), ZES);
        assert!(!s.kan_terug());
        assert!(!s.kan_vooruit());
    }
}
#[test]
fn tabelposities_en_een_andere_sessie_vervuilen_de_paginakaart_niet() {
    let mut a = Sessie::open(Module::Writer, TABEL.to_vec()).unwrap();
    let b = a.weergave(0).unwrap();
    let hash = a.bron_hash().to_owned();
    let ander = Sessie::open(Module::Writer, ZES.to_vec()).unwrap();
    ander.weergave(5).unwrap();
    for tekst in ["Cel één", "Tweede celalinea", "Cel twee"] {
        let v = b.velden.iter().find(|v| v.tekst == tekst).unwrap();
        let (pagina, beeld) = a.naar_tekstbereik(&v.id, &hash, 0, 1).unwrap();
        assert_eq!(pagina, 0);
        assert_eq!(beeld.voorkeursveld.as_deref(), Some(v.id.as_str()));
    }
    let v = b.velden.iter().find(|v| v.tekst == "Cel één").unwrap();
    a.bewerk(
        0,
        Bewerking::Tekst {
            id: v.id.clone(),
            tekst: "Andere eigen celtekst 🏠".into(),
        },
    )
    .unwrap();
    assert!(a.naar_tekstbereik(&v.id, &hash, 0, 1).is_err());
    let nieuw = a.bron_hash().to_owned();
    assert_eq!(a.naar_tekstbereik(&v.id, &nieuw, 0, 6).unwrap().0, 0);
    a.terug().unwrap();
    assert_eq!(a.bron().as_slice(), TABEL);
    assert_eq!(a.naar_tekstbereik(&v.id, &hash, 0, 1).unwrap().0, 0);
}
#[test]
fn ongeldige_selecties_versies_en_modules_veranderen_niets() {
    let s = Sessie::open(Module::Writer, ZES.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let v = &b.velden[0];
    for (id, hash, begin, einde) in [
        (v.id.as_str(), "verouderd", 0, 1),
        ("ontbreekt", s.bron_hash(), 0, 1),
        (v.id.as_str(), s.bron_hash(), 2, 1),
        (v.id.as_str(), s.bron_hash(), 0, usize::MAX),
    ] {
        assert!(s.naar_tekstbereik(id, hash, begin, einde).is_err());
        assert_eq!(s.bron().as_slice(), ZES);
        assert!(!s.kan_terug());
    }
    let bron = Document::nieuw(Module::Spreadsheet)
        .unwrap()
        .bytes()
        .unwrap();
    let s = Sessie::open(Module::Spreadsheet, bron.clone()).unwrap();
    assert!(s.naar_tekstbereik("A1", s.bron_hash(), 0, 1).is_err());
    assert_eq!(s.bron().as_slice(), bron.as_slice());
}
