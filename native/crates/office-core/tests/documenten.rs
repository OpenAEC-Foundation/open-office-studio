use office_core::document::{Bewerking, Document, Module, Sessie};
fn bewaar(naam: &str, bytes: &[u8]) {
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(std::path::Path::new(&map).join(naam), bytes).unwrap();
    }
}
#[test]
fn writer_bewerken_tabel_markdown_en_ongedaan_maken() {
    let mut s = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer.docx").to_vec(),
    )
    .unwrap();
    let bron = s.bron();
    let beeld = s.weergave(0).unwrap();
    let v = beeld
        .velden
        .iter()
        .find(|v| v.tekst == "Bewerkbare oorspronkelijke alinea.")
        .unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: v.id.clone(),
            tekst: "Nieuwe tekst met café en 🏠".into(),
        },
    )
    .unwrap();
    let uit = s.bron();
    bewaar("writer.docx", &uit);
    let opnieuw = Document::open(Module::Writer, &uit).unwrap();
    assert!(
        opnieuw
            .weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == "Nieuwe tekst met café en 🏠")
    );
    let md = s.markdown().unwrap();
    assert!(md.contains("Tabel inhoud"));
    assert!(md.contains("Nieuwe tekst"));
    s.terug().unwrap();
    assert_eq!(*s.bron(), *bron);
    s.vooruit().unwrap();
    assert_eq!(*s.bron(), *uit);
}
#[test]
fn writer_telt_tabelwoorden() {
    let d = Document::open(Module::Writer, include_bytes!("fixtures/tabel.docx")).unwrap();
    assert!(d.weergave(0).unwrap().melding.starts_with("4 woorden"));
}
#[test]
fn spreadsheet_formules_bladen_en_herstel_na_ongeldige_formule() {
    let mut s = Sessie::open(
        Module::Spreadsheet,
        include_bytes!("fixtures/spreadsheet.xlsx").to_vec(),
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "B2".into(),
            tekst: "4".into(),
        },
    )
    .unwrap();
    let uit = s.bron();
    bewaar("spreadsheet.xlsx", &uit);
    assert_eq!(s.weergave(0).unwrap().onderdelen.len(), 2);
    // Oude WASM-engine crashte op deze invoer. Een formulefout of weigering is
    // toegestaan; een verdwenen sessie of mislukte volgende bewerking nooit.
    let _ = s.bewerk(
        0,
        Bewerking::Tekst {
            id: "A10".into(),
            tekst: "=ISOWEEKNUM()".into(),
        },
    );
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "A10".into(),
            tekst: "42".into(),
        },
    )
    .unwrap();
    let beeld = s.weergave(0).unwrap();
    assert_eq!(
        beeld.velden.iter().find(|v| v.id == "A10").unwrap().tekst,
        "42"
    );
    let png = beeld.afbeelding.unwrap();
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
}
#[test]
fn presentatie_bewerken_renderen_en_opnieuw_openen() {
    let mut s = Sessie::open(
        Module::Presentation,
        include_bytes!("fixtures/presentation.pptx").to_vec(),
    )
    .unwrap();
    let beeld = s.weergave(0).unwrap();
    let v = beeld
        .velden
        .iter()
        .find(|v| v.tekst == "Bewerk deze tekst")
        .unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: v.id.clone(),
            tekst: "Gewijzigde diatekst".into(),
        },
    )
    .unwrap();
    s.bewerk(0, Bewerking::DiaNotities("Sprekersnotities".into()))
        .unwrap();
    let uit = s.bron();
    bewaar("presentation.pptx", &uit);
    let d = Document::open(Module::Presentation, &uit).unwrap();
    assert_eq!(d.weergave(0).unwrap().onderdelen.len(), 2);
    assert!(
        d.weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == "Gewijzigde diatekst")
    );
    assert!(
        d.weergave(1)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst.contains("Tweede dia"))
    );
    let png = d.weergave(0).unwrap().afbeelding.unwrap();
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
}
#[test]
fn notities_onbekende_velden_en_canvasposities_behouden() {
    let bron=br#"{"formaat":"openaec-notities","versie":3,"boeken":[{"naam":"Boek","secties":[{"soort":"canvas","paginas":[{"titel":"Pagina","vakken":[{"x":123,"y":456,"breedte":560,"hoogte":80,"blokken":[{"tekst":"Oud","vet":true}]}]}]}]}],"uitbreiding":{"bewaren":true}}"#;
    let mut s = Sessie::open(Module::Notition, bron.to_vec()).unwrap();
    let v = s
        .weergave(0)
        .unwrap()
        .velden
        .into_iter()
        .find(|v| v.tekst == "Oud")
        .unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: v.id,
            tekst: "Nieuw".into(),
        },
    )
    .unwrap();
    let data: serde_json::Value = serde_json::from_slice(&s.bron()).unwrap();
    assert_eq!(data["uitbreiding"]["bewaren"], true);
    assert_eq!(
        data["boeken"][0]["secties"][0]["paginas"][0]["vakken"][0]["x"],
        123
    );
}
#[test]
fn email_bewaart_alle_oorspronkelijke_bytes() {
    let bron=b"From: a@example.invalid\r\nSubject: Voorbeeld\r\nX-Test: een\r\nX-Test: twee\r\nContent-Type: multipart/mixed; boundary=a\r\n\r\n--a\r\nContent-Type: text/plain\r\n\r\nBericht\r\n--a\r\nContent-Type: text/csv\r\nContent-Disposition: attachment; filename=test.csv\r\n\r\na,b\r\n1,2\r\n--a--\r\n";
    let d = Document::open(Module::Email, bron).unwrap();
    assert_eq!(d.bytes().unwrap(), bron);
    assert!(d.weergave(0).unwrap().melding.starts_with("1 bijlagen"));
}
#[test]
fn alle_nieuwe_documenten_openen_en_opslaan() {
    for module in Module::ALLE {
        let s = Sessie::nieuw(module).unwrap();
        assert!(s.weergave(0).is_ok(), "{module:?}");
        Document::open(module, &s.bron()).unwrap();
    }
}
#[test]
fn ongeldige_tekstbewerking_verandert_geen_bron() {
    let mut s = Sessie::nieuw(Module::Writer).unwrap();
    let bron = s.bron();
    assert!(
        s.bewerk(
            0,
            Bewerking::Tekst {
                id: "bestaat-niet".into(),
                tekst: "fout".into()
            }
        )
        .is_err()
    );
    assert_eq!(*bron, *s.bron());
    assert!(!s.kan_terug());
}

#[test]
fn writer_gemengde_opmaak_unicode_en_regelovergangen_blijven_bewaard() {
    let mut s = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer.docx").to_vec(),
    )
    .unwrap();
    let v = s
        .weergave(0)
        .unwrap()
        .velden
        .into_iter()
        .find(|v| v.tekst == "Behoud deze cursieve tekst.")
        .unwrap();
    assert!(v.bewerkbaar);
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: v.id,
            tekst: "Behoud deze cursieve tekst.\nTweede regel met 🏠".into(),
        },
    )
    .unwrap();
    let uit = s.bron();
    bewaar("writer-rijk.docx", &uit);
    let d = Document::open(Module::Writer, &uit).unwrap();
    assert!(
        d.weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == "Behoud deze cursieve tekst.\nTweede regel met 🏠")
    );
}
#[test]
fn ifcx_herschrijven_bewaart_onbekende_attributen() {
    let bron =
        office_core::ifcx::maak(Module::Email, "bron.eml", b"Subject: Een\r\n\r\nEen").unwrap();
    let mut data: serde_json::Value = serde_json::from_slice(&bron).unwrap();
    data["data"][1]["attributes"]["voorbeeld::extra"] =
        serde_json::json!({"waarde":1234567890123456789_u64});
    let uit = office_core::ifcx::vervang(
        &serde_json::to_vec(&data).unwrap(),
        b"Subject: Twee\r\n\r\nTwee",
    )
    .unwrap();
    let resultaat: serde_json::Value = serde_json::from_slice(&uit).unwrap();
    assert_eq!(
        resultaat["data"][1]["attributes"]["voorbeeld::extra"],
        data["data"][1]["attributes"]["voorbeeld::extra"]
    );
}
