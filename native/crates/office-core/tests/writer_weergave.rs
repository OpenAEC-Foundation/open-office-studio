use office_core::document::{Document, Module, Sessie};

const NOOT: &[u8] = include_bytes!("fixtures/writer-voetnoot.docx");
const GRAFIEK: &[u8] = include_bytes!("fixtures/writer-grafiek.docx");
fn bewaar(naam: &str, bytes: &[u8]) {
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(map.join(naam), bytes).unwrap();
    }
}
#[test]
fn voetnoot_en_grafiek_buiten_alineatekst_renderen_na_teruglezen() {
    for (naam, bytes) in [
        ("writer-voetnoot.docx", NOOT),
        ("writer-grafiek.docx", GRAFIEK),
    ] {
        let s = Sessie::open(Module::Writer, bytes.to_vec()).unwrap();
        assert_eq!(s.bron().as_slice(), bytes);
        let a = s.weergave(0).unwrap();
        assert!(!a.onderdelen.is_empty());
        let png = a.afbeelding.as_ref().unwrap();
        assert!(png.len() > 1000);
        bewaar(&format!("{naam}-pagina.png"), png);
        let d = Document::open(Module::Writer, bytes).unwrap();
        let nieuw = d.bytes().unwrap();
        let herlezen = Document::open(Module::Writer, &nieuw)
            .unwrap()
            .weergave(0)
            .unwrap();
        assert!(herlezen.afbeelding.unwrap().len() > 1000);
        assert_eq!(herlezen.onderdelen, a.onderdelen);
        bewaar(naam, &nieuw);
    }
}
#[test]
fn lettertype_in_grafiek_blijft_een_eigen_familie_en_vervuilt_volgend_document_niet() {
    let oorspronkelijke = Document::open(Module::Writer, GRAFIEK)
        .unwrap()
        .weergave(0)
        .unwrap()
        .afbeelding
        .unwrap();
    let mut delen = ooxml_opc::unzip_parts(GRAFIEK).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/charts/chart1.xml")
        .unwrap();
    *xml = String::from_utf8(xml.clone())
        .unwrap()
        .replace("+mn-lt", "Gelasio")
        .into_bytes();
    let bytes = ooxml_opc::rezip_parts(&delen).unwrap();
    let ander = Document::open(Module::Writer, &bytes)
        .unwrap()
        .weergave(0)
        .unwrap()
        .afbeelding
        .unwrap();
    assert!(
        ander != oorspronkelijke,
        "De rasterletters veranderden niet na de familiewissel"
    );
    let opnieuw = Document::open(Module::Writer, GRAFIEK)
        .unwrap()
        .weergave(0)
        .unwrap()
        .afbeelding
        .unwrap();
    assert!(
        opnieuw == oorspronkelijke,
        "De fontwissel vervuilde het volgende document"
    );
    bewaar("writer-grafiek-lettertype.docx", &bytes);
}
#[test]
fn een_gebroken_voetnootnummer_wordt_niet_stil_afgerond() {
    let mut delen = ooxml_opc::unzip_parts(NOOT).unwrap();
    for (naam, xml) in &mut delen {
        if naam == "word/footnotes.xml" || naam == "word/document.xml" {
            *xml = String::from_utf8(xml.clone())
                .unwrap()
                .replace("w:id=\"1\"", "w:id=\"1.5\"")
                .into_bytes();
        }
    }
    let bytes = ooxml_opc::rezip_parts(&delen).unwrap();
    assert!(
        Document::open(Module::Writer, &bytes)
            .and_then(|d| d.weergave(0))
            .is_err()
    );
}

#[test]
fn kop_en_voettekst_veranderen_het_werkelijke_paginabeeld() {
    let bron = include_bytes!("fixtures/writer-structuur.docx");
    let origineel = Document::open(Module::Writer, bron).unwrap();
    let beelden: Vec<_> = (0..2).map(|n| origineel.weergave(n).unwrap()).collect();
    for (onderdeel, oud, nieuw, naam) in [
        (
            "word/header1.xml",
            "Vaste koptekst",
            "Andere koptekst",
            "koptekst",
        ),
        (
            "word/footer1.xml",
            "Vaste voettekst",
            "Andere voettekst",
            "voettekst",
        ),
    ] {
        let mut delen = ooxml_opc::unzip_parts(bron).unwrap();
        let (_, xml) = delen.iter_mut().find(|(n, _)| n == onderdeel).unwrap();
        let tekst = String::from_utf8(xml.clone()).unwrap();
        assert!(tekst.contains(oud));
        *xml = tekst.replace(oud, nieuw).into_bytes();
        let bytes = ooxml_opc::rezip_parts(&delen).unwrap();
        let document = Document::open(Module::Writer, &bytes).unwrap();
        for (n, origineel) in beelden.iter().enumerate() {
            let beeld = document.weergave(n).unwrap();
            assert_eq!(
                origineel
                    .velden
                    .iter()
                    .map(|v| &v.tekst)
                    .collect::<Vec<_>>(),
                beeld.velden.iter().map(|v| &v.tekst).collect::<Vec<_>>()
            );
            if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
                let map = std::path::PathBuf::from(map);
                std::fs::create_dir_all(&map).unwrap();
                std::fs::write(
                    map.join(format!("writer-{naam}-beeld-{}.png", n + 1)),
                    beeld.afbeelding.as_ref().unwrap(),
                )
                .unwrap();
            }
            assert!(
                origineel.afbeelding != beeld.afbeelding,
                "Gewijzigde {naam} is niet zichtbaar op pagina {}",
                n + 1
            );
        }
    }
}

#[test]
fn kopvoet_varianten_veranderen_uitsluitend_hun_eigen_paginas() {
    let bron = include_bytes!("fixtures/writer-kopvoet.docx");
    let s = Sessie::open(Module::Writer, bron.to_vec()).unwrap();
    assert_eq!(s.weergave(0).unwrap().onderdelen.len(), 3);
    let oorspronkelijk: Vec<_> = (0..3)
        .map(|n| s.weergave(n).unwrap().afbeelding.unwrap())
        .collect();
    for (onderdeel, oud, nieuw, pagina) in [
        ("word/header1.xml", "Oneven koptekst", "Gewijzigd oneven", 2),
        ("word/header2.xml", "Even koptekst", "Gewijzigd even", 1),
        ("word/header3.xml", "Eerste koptekst", "Gewijzigd eerste", 0),
        (
            "word/footer1.xml",
            "Oneven voettekst",
            "Gewijzigde oneven voet",
            2,
        ),
        (
            "word/footer2.xml",
            "Even voettekst",
            "Gewijzigde even voet",
            1,
        ),
        (
            "word/footer3.xml",
            "Eerste voettekst",
            "Gewijzigde eerste voet",
            0,
        ),
    ] {
        let mut delen = ooxml_opc::unzip_parts(bron).unwrap();
        let (_, xml) = delen.iter_mut().find(|(n, _)| n == onderdeel).unwrap();
        let tekst = String::from_utf8(xml.clone()).unwrap();
        assert!(tekst.contains(oud));
        *xml = tekst.replace(oud, nieuw).into_bytes();
        let bytes = ooxml_opc::rezip_parts(&delen).unwrap();
        let s = Sessie::open(Module::Writer, bytes).unwrap();
        for (n, verwacht) in oorspronkelijk.iter().enumerate() {
            let beeld = s.weergave(n).unwrap();
            let png = beeld.afbeelding.unwrap();
            assert_eq!(
                png != *verwacht,
                n == pagina,
                "{onderdeel} op pagina {}",
                n + 1
            );
            if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
                let map = std::path::PathBuf::from(map);
                std::fs::create_dir_all(&map).unwrap();
                std::fs::write(map.join(format!("writer-varianten-{}.png", n + 1)), &png).unwrap();
            }
        }
    }
}
