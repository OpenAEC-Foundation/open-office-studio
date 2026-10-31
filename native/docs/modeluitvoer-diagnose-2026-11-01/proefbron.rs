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
    let d = x::Workbook::open(include_bytes!("fixtures/spreadsheet.xlsx")).unwrap();
    let mut model = d.model().clone();
    let b = &mut model.sheets[0];
    match variant {
        1 => {
            b.merges
                .extend(["B2:D8", "F2:H3", "J5:M7"].map(|s| x::CellRange::parse_a1(s).unwrap()));
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
        4 => {
            // Bij zeroHeight blijven rijen met inhoud zichtbaar. Gebruik daarom
            // een leeg blad met uitsluitend twee expliciete hoogte-uitzonderingen.
            let mut leeg = x::Sheet::new("Schaars");
            leeg.format.zero_height = true;
            leeg.row_heights.insert(0, 15.);
            leeg.row_heights.insert(999_999, 15.);
            model.sheets[0] = leeg;
        }
        _ => (),
    }
    let boek = x::Workbook::from_model(model).unwrap();
    if variant == 4 {
        assert!(boek.model().sheets[0].format.zero_height);
        assert_eq!(
            volgende_cel(&boek, 0, "A1", Richting::Onder).unwrap(),
            "A1000000",
            "De proefbron is niet werkelijk schaars"
        );
    }
    let bytes = boek.save().unwrap();
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            map.join(format!("spreadsheet-navigatie-bron-{variant}.xlsx")),
            &bytes,
        )
        .unwrap();
    }
    if variant == 4 {
        let opnieuw = x::Workbook::open(&bytes).unwrap();
        assert!(
            opnieuw.model().sheets[0].format.zero_height,
            "De opgeslagen proefbron is niet werkelijk schaars"
        );
        assert_eq!(
            volgende_cel(&opnieuw, 0, "A1", Richting::Onder).unwrap(),
            "A1000000",
            "De ingelezen proefbron is niet werkelijk schaars"
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
