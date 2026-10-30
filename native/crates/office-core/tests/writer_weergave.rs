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
