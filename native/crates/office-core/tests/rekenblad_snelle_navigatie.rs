//! Dezelfde pure UI-sprongfunctie wordt vergeleken met de echte werkmapkern.
//! Er ontstaat geen productafhankelijkheid van de kern naar de interface.
#[path = "../../office-ui/src/raster_navigatie.rs"]
mod raster_navigatie;
use betteroffice_xlsx as x;
use office_core::{
    document::{Document, Module, Sessie},
    interactie::RasterSamenvoeging,
    rekenblad::{Richting, volgende_cel},
};
fn boek(variant: usize) -> Vec<u8> {
    let bytes = if variant == 4 {
        // Lees hier bewust de werkelijke bronattributen. Afzonderlijke
        // modeluitvoerproeven controleren de nieuwe schrijfroute.
        let mut delen =
            ooxml_opc::unzip_parts(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
        let (_, xml) = delen
            .iter_mut()
            .find(|(n, _)| n == "xl/worksheets/sheet1.xml")
            .unwrap();
        *xml=br#"<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultRowHeight="15" zeroHeight="1"/><sheetData><row r="1" ht="15" customHeight="1"/><row r="1000000" ht="15" customHeight="1"/></sheetData></worksheet>"#.to_vec();
        ooxml_opc::rezip_parts(&delen).unwrap()
    } else {
        let d = x::Workbook::open(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
        let mut model = d.model().clone();
        let b = &mut model.sheets[0];
        match variant {
            1 => {
                b.merges.extend(
                    ["B2:D8", "F2:H3", "J5:M7"].map(|s| x::CellRange::parse_a1(s).unwrap()),
                );
                b.col_widths.insert(4, 0.);
                b.row_heights.insert(3, 0.);
            }
            2 => {
                b.col_widths.insert(0, 250.);
                b.row_heights.insert(0, 400.);
            }
            3 => {
                b.col_widths.insert(1, 0.00001);
                b.row_heights.insert(1, 0.00001);
            }
            _ => (),
        }
        x::Workbook::from_model(model).unwrap().save().unwrap()
    };
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            map.join(format!("spreadsheet-navigatie-bron-{variant}.xlsx")),
            &bytes,
        )
        .unwrap();
    }
    if variant == 1 {
        let opnieuw = x::Workbook::open(&bytes).unwrap();
        assert_eq!(
            volgende_cel(&opnieuw, 0, "B2", Richting::Rechts).unwrap(),
            "F2"
        );
        assert_eq!(
            volgende_cel(&opnieuw, 0, "A3", Richting::Onder).unwrap(),
            "A5"
        );
    }
    if variant == 3 {
        let opnieuw = x::Workbook::open(&bytes).unwrap();
        assert!(
            opnieuw.model().sheets[0]
                .col_widths
                .get(&1)
                .is_some_and(|v| *v > 0. && *v < 0.00002)
        );
        assert!(
            opnieuw.model().sheets[0]
                .row_heights
                .get(&1)
                .is_some_and(|v| *v > 0. && *v < 0.00002)
        );
    }
    if variant == 4 {
        let opnieuw = x::Workbook::open(&bytes).unwrap();
        assert!(opnieuw.model().sheets[0].format.zero_height);
        assert_eq!(
            volgende_cel(&opnieuw, 0, "A1", Richting::Onder).unwrap(),
            "A1000000"
        );
    }
    bytes
}

#[test]
fn snelle_celsprongen_geven_hetzelfde_doel_als_de_kern_bij_merges_verborgen_en_geknipte_assen() {
    let mut metingen = vec![];
    for variant in 0..5 {
        let bytes = boek(variant);
        let document = Document::open(Module::Spreadsheet, &bytes).unwrap();
        let Document::Spreadsheet(d) = &document else {
            panic!()
        };
        let mut sessie = Sessie::open(Module::Spreadsheet, bytes.clone()).unwrap();
        let posities = if variant == 4 {
            vec!["A1", "A1000000"]
        } else {
            vec!["A1", "A7", "F1", "XFC1048575"]
        };
        for adres in posities {
            let b = sessie
                .naar_cel(0, adres)
                .unwrap_or_else(|e| panic!("Variant {variant}, venster {adres}: {e}"));
            let (mut lokaal, mut via_kern) = (0, 0);
            for v in &b.velden {
                for richting in [
                    Richting::Links,
                    Richting::Rechts,
                    Richting::Boven,
                    Richting::Onder,
                ] {
                    let verwacht = volgende_cel(d, 0, &v.id, richting).unwrap();
                    if let Some(naar) = raster_navigatie::volgende(&b, &v.id, richting) {
                        assert_eq!(
                            naar, verwacht,
                            "Variant {variant}, venster {adres}, van {}, richting {richting:?}",
                            v.id
                        );
                        lokaal += 1;
                    } else {
                        via_kern += 1;
                    }
                }
            }
            assert!(
                lokaal > 0,
                "Geen lokale sprong geverifieerd voor {variant}/{adres}"
            );
            assert_eq!(sessie.bron().as_slice(), bytes.as_slice());
            assert!(!sessie.kan_terug() && !sessie.kan_vooruit());
            metingen.push(serde_json::json!({"variant":variant,"venster":adres,"zichtbare_velden":b.velden.len(),"lokaal_geverifieerd":lokaal,"teruggevallen_op_kern":via_kern}));
        }
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            map.join("spreadsheet-lokale-navigatie.json"),
            serde_json::to_vec_pretty(&metingen).unwrap(),
        )
        .unwrap();
    }
}
#[test]
fn snelle_celsprongen_raden_nooit_een_ontbrekend_of_te_klein_doel() {
    let mut s = Sessie::open(Module::Spreadsheet, boek(0)).unwrap();
    let b = s.naar_cel(0, "A1").unwrap();
    assert_eq!(
        raster_navigatie::volgende(&b, "A1", Richting::Links).as_deref(),
        Some("A1")
    );
    assert_eq!(
        raster_navigatie::volgende(&b, "X60", Richting::Rechts),
        None
    );
    assert_eq!(
        raster_navigatie::volgende(&b, "A1:B2", Richting::Rechts),
        None
    );
    let mut s = Sessie::open(Module::Spreadsheet, boek(2)).unwrap();
    let b = s.naar_cel(0, "A1").unwrap();
    assert_eq!(
        raster_navigatie::volgende(&b, "A1", Richting::Rechts),
        None,
        "Een brede kolom geeft geen toestemming een onzichtbare buurcel over te slaan"
    );
    let mut s = Sessie::open(Module::Spreadsheet, boek(3)).unwrap();
    let b = s.naar_cel(0, "A1").unwrap();
    if let Some(naar) = raster_navigatie::volgende(&b, "A1", Richting::Rechts) {
        assert_eq!(naar, "B1");
    }
    let mut s = Sessie::open(Module::Spreadsheet, boek(4)).unwrap();
    let b = s.naar_cel(0, "A1").unwrap();
    assert_eq!(
        raster_navigatie::volgende(&b, "A1", Richting::Onder),
        None,
        "De verborgen sprong naar rij een miljoen hoort bij de volledige werkmapkern"
    );
}
#[test]
fn snelle_celsprongen_weigeren_dubbelzinnige_of_ongeldige_geometrie() {
    let mut s = Sessie::open(Module::Spreadsheet, boek(0)).unwrap();
    let bron = s.naar_cel(0, "A1").unwrap();
    let mut b = bron.clone();
    b.raster.as_mut().unwrap().kolommen[1].omvang = f32::NAN;
    assert_eq!(raster_navigatie::volgende(&b, "B2", Richting::Rechts), None);
    let mut b = bron.clone();
    b.raster.as_mut().unwrap().bereik.clear();
    assert_eq!(raster_navigatie::volgende(&b, "B2", Richting::Rechts), None);
    let mut b = bron.clone();
    b.raster.as_mut().unwrap().samenvoegingen.extend([
        RasterSamenvoeging {
            anker: "C2".into(),
            einde: "D4".into(),
        },
        RasterSamenvoeging {
            anker: "C2".into(),
            einde: "E5".into(),
        },
    ]);
    assert_eq!(raster_navigatie::volgende(&b, "B2", Richting::Rechts), None);
    let mut b = bron.clone();
    b.raster.as_mut().unwrap().verborgen_kolommen = vec![(2, 1)];
    assert_eq!(raster_navigatie::volgende(&b, "B2", Richting::Rechts), None);
    let mut b = bron;
    let dubbel = b
        .pagina
        .vlakken
        .iter()
        .find(|v| v.id == "C2")
        .unwrap()
        .clone();
    b.pagina.vlakken.push(dubbel);
    assert_eq!(raster_navigatie::volgende(&b, "B2", Richting::Rechts), None);
}

#[test]
fn snelle_navigatie_bewaart_het_schaarse_blad_na_invoer_en_bronexacte_undo() {
    use office_core::document::Bewerking;
    let bron = boek(4);
    let mut s = Sessie::open(Module::Spreadsheet, bron.clone()).unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "A1".into(),
            tekst: "café 🏠".into(),
        },
    )
    .unwrap();
    let nieuw = s.bron();
    let d = x::Workbook::open(&nieuw).unwrap();
    assert!(d.model().sheets[0].format.zero_height);
    assert_eq!(
        volgende_cel(&d, 0, "A1", Richting::Onder).unwrap(),
        "A1000000"
    );
    assert_eq!(
        d.cell(x::SheetId(0), x::CellRef::new(0, 0)).unwrap().input,
        "café 🏠"
    );
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::write(
            std::path::PathBuf::from(map).join("spreadsheet-schaars-bewerkt.xlsx"),
            nieuw.as_slice(),
        )
        .unwrap();
    }
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron.as_slice());
}

fn bewaar_modeluitvoer(naam: &str, bytes: &[u8]) {
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(map.join(naam), bytes).unwrap();
    }
}
#[test]
fn modeluitvoer_bewaart_standaard_verborgen_rijen_en_hun_hoogte_uitzonderingen() {
    let d = x::Workbook::open(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
    let mut model = d.model().clone();
    let mut blad = x::Sheet::new("Schaars");
    blad.format.zero_height = true;
    blad.format.default_row_height_pt = Some(15.);
    blad.row_heights.insert(0, 15.);
    blad.row_heights.insert(999_999, 15.);
    model.sheets[0] = blad;
    let d = x::Workbook::from_model(model).unwrap();
    assert_eq!(
        volgende_cel(&d, 0, "A1", Richting::Onder).unwrap(),
        "A1000000"
    );
    let bytes = d.save().unwrap();
    bewaar_modeluitvoer("spreadsheet-model-verborgen.xlsx", &bytes);
    let opnieuw = x::Workbook::open(&bytes).unwrap();
    assert!(opnieuw.model().sheets[0].format.zero_height);
    assert_eq!(
        volgende_cel(&opnieuw, 0, "A1", Richting::Onder).unwrap(),
        "A1000000"
    );
    assert_eq!(
        volgende_cel(&opnieuw, 0, "A1000000", Richting::Boven).unwrap(),
        "A1"
    );
    assert!(opnieuw.model().sheets[0].row_hidden(1));
    assert!(!opnieuw.model().sheets[0].row_hidden(0));
}
#[test]
fn modeluitvoer_bewaart_expliciete_standaardrijhoogte_en_vaste_hoogte() {
    let d = x::Workbook::open(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
    let mut model = d.model().clone();
    model.sheets[0].format.default_row_height_pt = Some(27.25);
    model.sheets[0].format.custom_height = true;
    let verwacht = model.sheets[0].format;
    let bytes = x::Workbook::from_model(model).unwrap().save().unwrap();
    bewaar_modeluitvoer("spreadsheet-model-standaardhoogte.xlsx", &bytes);
    let opnieuw = x::Workbook::open(&bytes).unwrap();
    assert_eq!(opnieuw.model().sheets[0].format, verwacht);
    assert_eq!(opnieuw.model().sheets[1].name, "Tweede blad");
}
#[test]
fn modeluitvoer_weigert_niet_eindige_of_onleesbare_standaardhoogten() {
    let d = x::Workbook::open(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
    for hoogte in [-1., 409.5001, f64::INFINITY, f64::NAN] {
        let mut model = d.model().clone();
        model.sheets[0].format.default_row_height_pt = Some(hoogte);
        let geweigerd = match x::Workbook::from_model(model) {
            Err(_) => true,
            Ok(d) => d.save().is_err(),
        };
        assert!(
            geweigerd,
            "Een onbruikbare standaardhoogte werd stil weggelaten: {hoogte}"
        );
    }
}

#[test]
fn modeluitvoer_alle_rijformaatcombinaties_bewaren_waarden_en_xml_volgorde() {
    let d = x::Workbook::open(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
    let mut metingen = vec![];
    for hoogte in [None, Some(0.), Some(15.), Some(27.25), Some(409.5)] {
        for vast in [false, true] {
            for verborgen in [false, true] {
                let mut model = d.model().clone();
                let mut blad = x::Sheet::new("Rijopmaak");
                blad.format.default_row_height_pt = hoogte;
                blad.format.custom_height = vast;
                blad.format.zero_height = verborgen;
                let mut verwacht = blad.format;
                if hoogte.is_none() && (vast || verborgen) {
                    verwacht.default_row_height_pt = Some(15.);
                }
                model.sheets[0] = blad;
                let bytes = x::Workbook::from_model(model).unwrap().save().unwrap();
                let opnieuw = x::Workbook::open(&bytes).unwrap();
                assert_eq!(opnieuw.model().sheets[0].format, verwacht);
                let delen = ooxml_opc::unzip_parts(&bytes).unwrap();
                let xml = String::from_utf8(
                    delen
                        .into_iter()
                        .find(|(n, _)| n == "xl/worksheets/sheet1.xml")
                        .unwrap()
                        .1,
                )
                .unwrap();
                let aanwezig = hoogte.is_some() || vast || verborgen;
                assert_eq!(xml.matches("<sheetFormatPr").count(), usize::from(aanwezig));
                if aanwezig {
                    assert!(xml.find("<sheetFormatPr").unwrap() < xml.find("<sheetData").unwrap());
                }
                let naam = format!("spreadsheet-model-format-{}.xlsx", metingen.len());
                bewaar_modeluitvoer(&naam, &bytes);
                metingen.push(serde_json::json!({"bestand":naam,"standaardhoogte":verwacht.default_row_height_pt,"vaste_hoogte":vast,"standaard_verborgen":verborgen}));
            }
        }
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            std::path::PathBuf::from(map).join("spreadsheet-model-format-combinaties.json"),
            serde_json::to_vec_pretty(&metingen).unwrap(),
        )
        .unwrap();
    }
    assert_eq!(metingen.len(), 20);
}
#[test]
fn modeluitvoer_bestaande_bron_behoudt_bekende_en_onbekende_rijformaat_attributen() {
    let mut delen = ooxml_opc::unzip_parts(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "xl/worksheets/sheet1.xml")
        .unwrap();
    let mut tekst = String::from_utf8(xml.clone()).unwrap();
    let begin = tekst.find("<sheetFormatPr").unwrap();
    let einde = begin + tekst[begin..].find("/>").unwrap() + 2;
    tekst.replace_range(begin..einde,r#"<sheetFormatPr xmlns:eigen="urn:openaec:test" defaultRowHeight="18.5" customHeight="1" zeroHeight="1" baseColWidth="12" eigen:bewaar="blijft"/>"#);
    *xml = tekst.into_bytes();
    let bron = ooxml_opc::rezip_parts(&delen).unwrap();
    let mut s = Sessie::open(Module::Spreadsheet, bron.clone()).unwrap();
    s.bewerk(
        0,
        office_core::document::Bewerking::Tekst {
            id: "B2".into(),
            tekst: "7".into(),
        },
    )
    .unwrap();
    let bytes = s.bron();
    let d = x::Workbook::open(&bytes).unwrap();
    assert_eq!(d.model().sheets[0].format.default_row_height_pt, Some(18.5));
    assert!(d.model().sheets[0].format.custom_height && d.model().sheets[0].format.zero_height);
    let delen = ooxml_opc::unzip_parts(&bytes).unwrap();
    let xml = &delen
        .iter()
        .find(|(n, _)| n == "xl/worksheets/sheet1.xml")
        .unwrap()
        .1;
    let mut lezer = quick_xml::NsReader::from_reader(xml.as_slice());
    let mut onbekend = false;
    let mut basisbreedte = false;
    let mut aantal = 0;
    loop {
        match lezer.read_event().unwrap() {
            quick_xml::events::Event::Start(e) | quick_xml::events::Event::Empty(e)
                if e.local_name().as_ref() == b"sheetFormatPr" =>
            {
                aantal += 1;
                for a in e.attributes() {
                    let a = a.unwrap();
                    let (ns, naam) = lezer.resolver().resolve_attribute(a.key);
                    if naam.as_ref() == b"bewaar"
                        && matches!(ns,quick_xml::name::ResolveResult::Bound(n) if n.as_ref()==b"urn:openaec:test")
                    {
                        assert_eq!(
                            a.decoded_and_normalized_value(
                                quick_xml::XmlVersion::Explicit1_0,
                                lezer.decoder()
                            )
                            .unwrap(),
                            "blijft"
                        );
                        onbekend = true;
                    }
                    if a.key.as_ref() == b"baseColWidth" {
                        basisbreedte = true;
                        assert_eq!(
                            a.decoded_and_normalized_value(
                                quick_xml::XmlVersion::Explicit1_0,
                                lezer.decoder()
                            )
                            .unwrap(),
                            "12"
                        );
                    }
                }
            }
            quick_xml::events::Event::Eof => break,
            _ => (),
        }
    }
    assert_eq!(aantal, 1);
    assert!(onbekend && basisbreedte);
    bewaar_modeluitvoer("spreadsheet-model-bestaande-bron.xlsx", &bytes);
    s.terug().unwrap();
    assert_eq!(*s.bron(), bron);
}
