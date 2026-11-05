use betteroffice_xlsx as x;
use office_core::{
    celtekst::CelTekst,
    document::{Bewerking, Document, Module, Sessie},
    rekenblad::{Structuur, bereik},
    rekenblad_klembord,
};
const BRON: &[u8] = include_bytes!("fixtures/spreadsheet.xlsx");
fn plak(adres: &str, tekst: &str) -> Bewerking {
    Bewerking::CelTekst {
        adres: adres.into(),
        tekst: CelTekst::lees(tekst).unwrap(),
    }
}
fn uitvoer(naam: &str, b: &[u8]) {
    if let Some(p) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let p = std::path::PathBuf::from(p);
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join(naam), b).unwrap();
    }
}
#[test]
fn celklembord_kopieert_opgemaakte_waarden_zonder_bronwijziging_of_geschiedenis() {
    let s = Sessie::open(Module::Spreadsheet, BRON.to_vec()).unwrap();
    let t = CelTekst::lees(&s.celtekst(0, "B2:D4").unwrap()).unwrap();
    assert_eq!(
        t.rijen(),
        &[
            vec!["3".to_string(), "12.5".into(), "37.5".into()],
            vec!["2".into(), "15".into(), "30".into()],
            vec!["".into(), "".into(), "67.50".into()]
        ]
    );
    assert_eq!(s.bron().as_slice(), BRON);
    assert!(!s.kan_terug());
    assert!(s.celtekst(usize::MAX, "A1").is_err());
    assert!(s.celtekst(0, "A1:XFD1048576").is_err());
}
#[test]
fn celklembord_plakt_formules_getallen_en_unicode_als_een_bronexacte_undo() {
    let mut s = Sessie::open(Module::Spreadsheet, BRON.to_vec()).unwrap();
    s.bewerk(0, plak("B2", "7\t8\r\n9\t=SUM(B2:C3)")).unwrap();
    let nieuw = s.bron();
    let b = x::Workbook::open(&nieuw).unwrap();
    for (adres, invoer) in [("B2", "7"), ("C2", "8"), ("B3", "9"), ("C3", "=SUM(B2:C3)")] {
        assert_eq!(
            b.cell(x::SheetId(0), x::CellRef::parse_a1(adres).unwrap())
                .unwrap()
                .input,
            invoer
        );
    }
    assert_eq!(
        b.cell(x::SheetId(0), x::CellRef::parse_a1("D2").unwrap())
            .unwrap()
            .input,
        "=B2*C2"
    );
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), BRON);
    assert!(!s.kan_terug());
    s.vooruit().unwrap();
    assert_eq!(s.bron(), nieuw);
    // Zelfverwijzende formules zijn geldige invoer met een rekenfout; de
    // afzonderlijke, onafhankelijk teruggelezen proef hieronder gebruikt geen kring.
    s.terug().unwrap();
    s.bewerk(0, plak("B2", "7\t8\r\n9\t=SUM(B2:C2)")).unwrap();
    s.bewerk(
        0,
        plak(
            "F2",
            "\"café 🏠\"\t\"regel één\nregel twee\"\r\n\"een \"\"citaat\"\"\"\t'0012",
        ),
    )
    .unwrap();
    uitvoer("spreadsheet-klembord.xlsx", s.bron().as_slice());
}
#[test]
fn celklembord_tegelvulling_lege_randen_en_wissen_behouden_celopmaak() {
    let mut s = Sessie::open(Module::Spreadsheet, BRON.to_vec()).unwrap();
    s.bewerk(0, plak("F2:I5", "1\t2\n3\t4")).unwrap();
    let d = x::Workbook::open(s.bron().as_slice()).unwrap();
    for rij in 1..5 {
        for kol in 5..9 {
            assert_eq!(
                d.cell(x::SheetId(0), x::CellRef::new(rij, kol))
                    .unwrap()
                    .input,
                ((rij - 1) % 2 * 2 + (kol - 5) % 2 + 1).to_string()
            );
        }
    }
    s.bewerk(0, plak("F2:I5", "")).unwrap();
    let t = CelTekst::lees(&s.celtekst(0, "F2:I5").unwrap()).unwrap();
    assert!(t.rijen().iter().flatten().all(String::is_empty));
    s.bewerk(0, plak("F2", "a\tb\n1")).unwrap();
    let t = CelTekst::lees(&s.celtekst(0, "F2:G3").unwrap()).unwrap();
    assert_eq!(t.rijen()[1], vec!["1".to_string(), "".into()]);
    assert!(rekenblad_klembord::doel("A1:C2", &CelTekst::lees("1\t2").unwrap()).is_err());
    assert!(rekenblad_klembord::doel("XFD1048576", &CelTekst::lees("1\t2").unwrap()).is_err());
    assert!(bereik("A1:Z1000").is_err());
    assert!(rekenblad_klembord::doel("A1", &CelTekst::lees("1").unwrap()).is_ok());
}
#[test]
fn celklembord_late_ongeldige_formule_verandert_geen_enkele_cel() {
    let mut s = Sessie::open(Module::Spreadsheet, BRON.to_vec()).unwrap();
    for (adres, tekst) in [
        ("B2", "7\t8\n9\t=1+"),
        ("A1:C2", "1\t2"),
        ("XFD1048576", "1\t2"),
    ] {
        assert!(s.bewerk(0, plak(adres, tekst)).is_err());
        assert_eq!(s.bron().as_slice(), BRON);
        assert!(!s.kan_terug() && !s.kan_vooruit());
    }
}
#[test]
fn celklembord_samenvoegingen_alleen_als_hele_anker_of_gezamenlijk_wissen() {
    let mut s = Sessie::open(Module::Spreadsheet, BRON.to_vec()).unwrap();
    s.bewerk(
        0,
        Bewerking::Structuur {
            adres: "F2:G3".into(),
            actie: Structuur::Samenvoegen,
        },
    )
    .unwrap();
    let samengevoegd = s.bron();
    s.bewerk(0, plak("G3", "café 🏠")).unwrap();
    let d = x::Workbook::open(s.bron().as_slice()).unwrap();
    assert_eq!(
        d.cell(x::SheetId(0), x::CellRef::parse_a1("F2").unwrap())
            .unwrap()
            .input,
        "café 🏠"
    );
    let kopie = CelTekst::lees(&s.celtekst(0, "G3").unwrap()).unwrap();
    assert_eq!((kopie.hoogte(), kopie.breedte()), (2, 2));
    assert_eq!(kopie.rijen()[0][0], "café 🏠");
    let voor = s.bron();
    for (adres, tekst) in [("F2", "1\t2"), ("E2:F3", "1"), ("E2:H4", "1\t2\n3\t4")] {
        assert!(s.bewerk(0, plak(adres, tekst)).is_err());
        assert_eq!(s.bron(), voor);
    }
    s.bewerk(0, plak("E2:H4", "")).unwrap();
    assert!(
        CelTekst::lees(&s.celtekst(0, "F2:G3").unwrap())
            .unwrap()
            .rijen()
            .iter()
            .flatten()
            .all(String::is_empty)
    );
    s.terug().unwrap();
    assert_eq!(s.bron(), voor);
    s.terug().unwrap();
    assert_eq!(s.bron(), samengevoegd);
}
#[test]
fn celklembord_beveiliging_en_matrixformules_worden_nooit_omzeild() {
    let b = include_bytes!("fixtures/spreadsheet-beveiligd.xlsx");
    let mut s = Sessie::open(Module::Spreadsheet, b.to_vec()).unwrap();
    assert!(s.bewerk(0, plak("B2", "7\t8")).is_err());
    assert_eq!(s.bron().as_slice(), b);
    assert!(s.celtekst(0, "B2:D4").is_ok());
    let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "xl/worksheets/sheet1.xml")
        .unwrap();
    let oud = String::from_utf8(xml.clone()).unwrap();
    assert!(oud.contains("<f>B2*C2</f>"));
    *xml = oud
        .replace("<f>B2*C2</f>", "<f t=\"array\" ref=\"D2:E3\">B2*C2</f>")
        .into_bytes();
    let bytes = ooxml_opc::rezip_parts(&delen).unwrap();
    let mut d = Document::open(Module::Spreadsheet, &bytes).unwrap();
    let voor = d.bytes().unwrap();
    assert!(d.bewerk(0, plak("B2:E3", "1")).is_err());
    assert_eq!(d.bytes().unwrap(), voor);
}
