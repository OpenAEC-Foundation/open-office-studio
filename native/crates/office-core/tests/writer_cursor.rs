//! Gevormde tekstgeometrie wordt teruggekoppeld aan echte brontekens en tabellen.
use office_core::document::{Bewerking, Document, Module, Sessie};
const RIJK: &[u8] = include_bytes!("fixtures/writer-structuur.docx");
#[test]
fn markeerbudget_weigert_een_geldig_groot_bereik_zonder_gedeeltelijk_resultaat() {
    let mut d = Document::open(Module::Writer, RIJK).unwrap();
    let b = d.weergave(0).unwrap();
    let id = b.velden[0].id.clone();
    d.bewerk(
        0,
        Bewerking::Tekst {
            id: id.clone(),
            tekst: "x".repeat(9000),
        },
    )
    .unwrap();
    let bron = d.bytes().unwrap();
    let s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let e = s
        .tekstmarkering(0, &id, s.bron_hash(), 0, 8193)
        .unwrap_err();
    assert!(e.to_string().contains("markeerbudget"), "{e}");
    assert_eq!(s.bron().as_slice(), bron.as_slice());
    assert!(!s.kan_terug());
}
#[test]
fn markering_en_echte_klikpunten_hebben_dezelfde_unicode_bronposities() {
    let s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let v = b
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    let m = s.tekstmarkering(0, &v.id, s.bron_hash(), 8, 12).unwrap();
    assert!(!m.rechthoeken.is_empty());
    assert!(m.cursor.is_some());
    for (i, r) in m.rechthoeken.iter().enumerate() {
        assert!(r.breedte > 0. && r.hoogte > 0.);
        for verhouding in [0.05, 0.95] {
            let p = s
                .tekstpunt(
                    0,
                    s.bron_hash(),
                    f64::from(r.x + r.breedte * verhouding),
                    f64::from(r.y + r.hoogte * 0.5),
                )
                .unwrap()
                .unwrap();
            assert_eq!(p.id, v.id);
            assert!((8..=12).contains(&p.positie), "Markeervlak {i}: {p:?}");
            if i == 0 && verhouding == 0.05 {
                assert_eq!(p.positie, 8);
            }
            if i == m.rechthoeken.len() - 1 && verhouding == 0.95 {
                assert_eq!(p.positie, 12);
            }
        }
    }
    assert_eq!(s.bron().as_slice(), RIJK);
    assert!(!s.kan_terug());
    assert!(!s.kan_vooruit());
}
#[test]
fn tabelalinea_en_lege_selectie_blijven_binnen_het_eigen_tekstverhaal() {
    let s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    for tekst in ["Cel één", "Tweede celalinea", "Cel twee"] {
        let v = b.velden.iter().find(|v| v.tekst == tekst).unwrap();
        let m = s
            .tekstmarkering(0, &v.id, s.bron_hash(), 0, tekst.chars().count())
            .unwrap();
        for r in &m.rechthoeken {
            let p = s
                .tekstpunt(
                    0,
                    s.bron_hash(),
                    f64::from(r.x + r.breedte * 0.5),
                    f64::from(r.y + r.hoogte * 0.5),
                )
                .unwrap()
                .unwrap();
            assert_eq!(p.id, v.id);
            assert!(p.positie <= tekst.chars().count());
        }
        let cursor = s.tekstmarkering(0, &v.id, s.bron_hash(), 0, 0).unwrap();
        assert!(cursor.rechthoeken.is_empty());
        assert!(cursor.cursor.is_some());
    }
    assert!(s.tekstpunt(0, s.bron_hash(), -1., 0.).unwrap().is_none());
    assert!(s.tekstpunt(0, s.bron_hash(), 1e9, 1e9).unwrap().is_none());
    assert_eq!(s.bron().as_slice(), RIJK);
}
#[test]
fn verouderde_of_ongeldige_geometrie_verandert_geen_bron_of_geschiedenis() {
    let mut s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
    let hash = s.bron_hash().to_owned();
    let b = s.weergave(0).unwrap();
    let v = b.velden.iter().find(|v| v.tekst == "Cel één").unwrap();
    for (id, bron, a, z) in [
        (v.id.as_str(), "oud", 0, 1),
        ("ontbreekt", hash.as_str(), 0, 1),
        (v.id.as_str(), hash.as_str(), 2, 1),
        (v.id.as_str(), hash.as_str(), 0, usize::MAX),
    ] {
        assert!(s.tekstmarkering(0, id, bron, a, z).is_err());
        assert_eq!(s.bron().as_slice(), RIJK);
        assert!(!s.kan_terug());
    }
    assert!(s.tekstpunt(0, &hash, f64::NAN, 0.).is_err());
    assert!(s.tekstpunt(usize::MAX, &hash, 0., 0.).is_err());
    assert!(s.tekstmarkering(usize::MAX, &v.id, &hash, 0, 0).is_err());
    assert!(s.tekstpunt(0, "oud", 0., 0.).is_err());
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: v.id.clone(),
            tekst: "Ander eigen doel".into(),
        },
    )
    .unwrap();
    assert!(s.tekstmarkering(0, &v.id, &hash, 0, 1).is_err());
    let m = s.tekstmarkering(0, &v.id, s.bron_hash(), 0, 5).unwrap();
    assert!(!m.rechthoeken.is_empty());
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), RIJK);
    assert!(s.tekstmarkering(0, &v.id, &hash, 0, 1).is_ok());
    let bron = Document::nieuw(Module::Spreadsheet)
        .unwrap()
        .bytes()
        .unwrap();
    let ander = Sessie::open(Module::Spreadsheet, bron.clone()).unwrap();
    assert!(ander.tekstpunt(0, ander.bron_hash(), 0., 0.).is_err());
    assert_eq!(ander.bron().as_slice(), bron.as_slice());
}
