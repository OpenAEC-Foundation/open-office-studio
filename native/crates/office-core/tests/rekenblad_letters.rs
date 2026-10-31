//! Families en echte stijlgezichten moeten het raster veranderen zonder gegevensverlies.
use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    opmaak::Opmaak,
    rekenblad::Structuur,
};
use std::{collections::HashSet, path::PathBuf};
#[test]
fn spreadsheet_letterfamilies_en_vier_stijlen_tekenen_verschillend_en_undo_herstelt() {
    let mut s = Sessie::open(
        Module::Spreadsheet,
        include_bytes!("fixtures/spreadsheet.xlsx").to_vec(),
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Structuur {
            adres: "A10:E12".into(),
            actie: Structuur::Samenvoegen,
        },
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "A10".into(),
            tekst: "iii WWW café".into(),
        },
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: "A10".into(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Lettergrootte(18.),
        },
    )
    .unwrap();
    let start = s.bron();
    let oorspronkelijk = s.weergave(0).unwrap().afbeelding.unwrap();
    let mut beelden = HashSet::new();
    for (familie, naam) in [("Times New Roman", "serif"), ("Courier New", "mono")] {
        for (vet, cursief, stijlnaam) in [
            (false, false, "normaal"),
            (true, false, "vet"),
            (false, true, "cursief"),
            (true, true, "vet-cursief"),
        ] {
            let mut d = Document::open(Module::Spreadsheet, &start).unwrap();
            for stijl in [
                Opmaak::Lettertype(familie.into()),
                Opmaak::Vet(vet),
                Opmaak::Cursief(cursief),
            ] {
                d.bewerk(
                    0,
                    Bewerking::Opmaak {
                        id: "A10".into(),
                        begin: 0,
                        einde: 0,
                        stijl,
                    },
                )
                .unwrap();
            }
            let b = d.weergave(0).unwrap();
            let veld = b.velden.iter().find(|v| v.id == "A10").unwrap();
            assert_eq!(veld.tekst, "iii WWW café");
            assert_eq!(veld.opmaak.lettertype.as_deref(), Some(familie));
            assert_eq!((veld.opmaak.vet, veld.opmaak.cursief), (vet, cursief));
            let png = b.afbeelding.unwrap();
            assert!(
                beelden.insert(office_core::opslag::hash(&png)),
                "Familie {familie} en stijl {stijlnaam} worden nog als een vorige variant getekend"
            );
            if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
                std::fs::create_dir_all(&map).unwrap();
                std::fs::write(
                    PathBuf::from(&map).join(format!("spreadsheet-font-{naam}-{stijlnaam}.png")),
                    &png,
                )
                .unwrap();
                if naam == "mono" && vet && cursief {
                    std::fs::write(
                        PathBuf::from(map).join("spreadsheet-lettertypen.xlsx"),
                        d.bytes().unwrap(),
                    )
                    .unwrap();
                }
            }
        }
    }
    assert_eq!(beelden.len(), 8);
    for stijl in [
        Opmaak::Lettertype("Times New Roman".into()),
        Opmaak::Vet(true),
    ] {
        s.bewerk(
            0,
            Bewerking::Opmaak {
                id: "A10".into(),
                begin: 0,
                einde: 0,
                stijl,
            },
        )
        .unwrap();
    }
    assert!(s.weergave(0).unwrap().afbeelding.unwrap() != oorspronkelijk);
    s.terug().unwrap();
    s.terug().unwrap();
    assert!(s.bron().as_slice() == start.as_slice());
    assert!(s.weergave(0).unwrap().afbeelding.unwrap() == oorspronkelijk);
}
