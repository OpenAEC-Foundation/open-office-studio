use office_core::document::{Document, Module};

#[test]
fn geneste_velden_en_hyperlinks_houden_alle_resultaattekst_na_bewaren() {
    let bron = include_bytes!("fixtures/writer-velden.docx");
    let mut d = Document::open(Module::Writer, bron).unwrap();
    for _ in 0..3 {
        let beeld = d.weergave(0).unwrap();
        let teksten: Vec<_> = beeld.velden.iter().map(|v| v.tekst.as_str()).collect();
        assert_eq!(
            teksten,
            ["Inhoud café 42 🏠", "Einde inhoud", "Verwijzing 7"]
        );
        assert!(!beeld.velden[0].bewerkbaar);
        assert!(!beeld.velden[2].bewerkbaar);
        let bytes = d.bytes().unwrap();
        // Lees de daadwerkelijke XML apart van de tekstprojectie terug. Zowel
        // resultaten als instructies horen in het opgeslagen document te blijven.
        let delen = ooxml_opc::unzip_parts(&bytes).unwrap();
        let xml = &delen
            .iter()
            .find(|(n, _)| n == "word/document.xml")
            .unwrap()
            .1;
        let xml = std::str::from_utf8(xml).unwrap();
        for tekst in [
            "Inhoud café ",
            "42 🏠",
            "Einde inhoud",
            "Verwijzing ",
            "PAGEREF hoofdstuk",
            "PAGE",
        ] {
            assert!(xml.contains(tekst), "Ontbrekende inhoud: {tekst}");
        }
        if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
            let map = std::path::PathBuf::from(map);
            std::fs::create_dir_all(&map).unwrap();
            std::fs::write(map.join("writer-velden.docx"), &bytes).unwrap();
        }
        d = Document::open(Module::Writer, &bytes).unwrap();
    }
}

#[test]
fn bestandscontrole_verwerkt_een_diepe_veldboom_op_de_eigen_werkdraad() {
    let bron = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/writer-diepe-velden.docx"
    );
    let voor = std::fs::read(bron).unwrap();
    let uitvoer = std::process::Command::new(env!("CARGO_BIN_EXE_controleer-bestand"))
        .arg(bron)
        .output()
        .unwrap();
    assert!(
        uitvoer.status.success(),
        "{}",
        String::from_utf8_lossy(&uitvoer.stderr)
    );
    let rapport: serde_json::Value = serde_json::from_slice(&uitvoer.stdout).unwrap();
    assert_eq!(rapport["status"], "geslaagd", "{rapport}");
    assert_eq!(voor, std::fs::read(bron).unwrap());
}
