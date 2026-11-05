use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    opmaak::Opmaak,
    rekenblad::{self, Richting, Structuur},
};
#[test]
fn celbereik_sluit_aangesneden_samenvoegingen_in_beide_richtingen() {
    let mut d = Document::nieuw(Module::Spreadsheet).unwrap();
    for adres in ["B2:C3", "D3:F4", "A4:B5"] {
        d.bewerk(
            0,
            Bewerking::Structuur {
                adres: adres.into(),
                actie: Structuur::Samenvoegen,
            },
        )
        .unwrap();
    }
    let bytes = d.bytes().unwrap();
    let Document::Spreadsheet(d) = &d else {
        panic!()
    };
    // C2 ligt in B2:C3; D2 raakt na uitbreiding D3:F4 en vervolgens A4:B5.
    for (a, b) in [("C2", "D2"), ("D2", "C2")] {
        let s = rekenblad::selectie(d, 0, a, b).unwrap();
        assert_eq!(s.adres, "A2:F5");
        assert_eq!(s.anker, if a == "C2" { "B2" } else { "D2" });
    }
    assert_eq!(d.save().unwrap(), bytes);
}
#[test]
fn celbereik_volgt_werkvenster_zonder_bron_of_geschiedenis_te_veranderen() {
    let mut s = Sessie::open(
        Module::Spreadsheet,
        include_bytes!("fixtures/spreadsheet.xlsx").to_vec(),
    )
    .unwrap();
    let bron = s.bron();
    let (_, a) = s
        .selecteer_cellen(0, "X59", "X59", Some(Richting::Rechts))
        .unwrap();
    assert_eq!(a.adres, "X59:Y59");
    let (b, a) = s
        .selecteer_cellen(0, &a.anker, "Y60", Some(Richting::Onder))
        .unwrap();
    assert_eq!(a.adres, "X59:Y61");
    assert_eq!(b.voorkeursveld.as_deref(), Some("Y61"));
    assert!(b.pagina.vlakken.iter().any(|v| v.id == "Y61"));
    let (_, a) = s.selecteer_cellen(0, "Y61", "X59", None).unwrap();
    assert_eq!(a.adres, "X59:Y61");
    assert_eq!(a.anker, "Y61");
    assert_eq!(*s.bron(), *bron);
    assert!(!s.kan_terug() && !s.kan_vooruit());
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: a.adres,
            begin: 0,
            einde: 0,
            stijl: Opmaak::Vet(true),
        },
    )
    .unwrap();
    s.terug().unwrap();
    assert_eq!(*s.bron(), *bron);
}
#[test]
fn celbereik_weigert_overschrijding_en_verkeerde_module_zonder_gedeeltelijke_navigatie() {
    let mut s = Sessie::nieuw(Module::Spreadsheet).unwrap();
    let bron = s.bron();
    let beeld = s.weergave(0).unwrap();
    for (deel, a, b) in [
        (0, "A1", "XFD1048576"),
        (0, "A1", "A10001"),
        (0, "A0", "B2"),
        (0, "B2", "XFE1"),
        (usize::MAX, "A1", "B2"),
    ] {
        assert!(s.selecteer_cellen(deel, a, b, None).is_err());
        assert_eq!(*s.bron(), *bron);
        assert!(!s.kan_terug());
        assert_eq!(s.weergave(0).unwrap().afbeelding, beeld.afbeelding);
    }
    let (_, a) = s.selecteer_cellen(0, "A1", "J1000", None).unwrap();
    assert_eq!(a.adres, "A1:J1000");
    let mut writer = Sessie::nieuw(Module::Writer).unwrap();
    assert!(writer.selecteer_cellen(0, "A1", "B2", None).is_err());
}
