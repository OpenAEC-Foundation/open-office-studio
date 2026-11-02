use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    interactie::Rechthoek,
    notities::NotitieActie as N,
    opmaak::Opmaak,
    presentatie::DiaActie as P,
};
fn data(s: &Sessie) -> serde_json::Value {
    serde_json::from_slice(&s.bron()).unwrap()
}
#[test]
fn diaminiaturen_zijn_begrensd_verschillend_en_veranderen_geen_sessiestaat() {
    let s = Sessie::open(
        Module::Presentation,
        include_bytes!("fixtures/presentation.pptx").to_vec(),
    )
    .unwrap();
    let bron = s.bron();
    let hash = s.bron_hash().to_string();
    let groot = s.weergave(0).unwrap().afbeelding.unwrap();
    let a = s.dia_miniatuur(&hash, 0, 144).unwrap();
    let b = s.dia_miniatuur(&hash, 1, 144).unwrap();
    assert_ne!(a.bytes, b.bytes);
    for m in [&a, &b] {
        assert_eq!(&m.bytes[..8], b"\x89PNG\r\n\x1a\n");
        assert_eq!(
            u32::from_be_bytes(m.bytes[16..20].try_into().unwrap()),
            m.breedte
        );
        assert_eq!(
            u32::from_be_bytes(m.bytes[20..24].try_into().unwrap()),
            m.hoogte
        );
        assert!(m.breedte > 0 && m.breedte <= 144 && m.hoogte > 0 && m.hoogte <= 512);
    }
    assert_eq!(s.bron().as_slice(), bron.as_slice());
    assert_eq!(s.bron_hash(), hash);
    assert!(!s.kan_terug() && !s.kan_vooruit());
    assert_eq!(s.weergave(0).unwrap().afbeelding.unwrap(), groot);
    assert_eq!(s.dia_miniatuur(&hash, 0, 144).unwrap().bytes, a.bytes);
}
#[test]
fn diaminiaturen_weigeren_verouderde_bron_deel_en_budget_en_volgen_undo() {
    let mut s = Sessie::open(
        Module::Presentation,
        include_bytes!("fixtures/presentation.pptx").to_vec(),
    )
    .unwrap();
    let bron = s.bron();
    let hash = s.bron_hash().to_string();
    let a = s.dia_miniatuur(&hash, 0, 144).unwrap();
    for breedte in [0, 15, 321, u32::MAX] {
        assert!(s.dia_miniatuur(&hash, 0, breedte).is_err());
    }
    assert!(s.dia_miniatuur("oude-versie", 0, 144).is_err());
    assert!(s.dia_miniatuur(&hash, usize::MAX, 144).is_err());
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id,
            tekst: "Andere titel".into(),
        },
    )
    .unwrap();
    assert!(s.dia_miniatuur(&hash, 0, 144).is_err());
    assert_ne!(
        s.dia_miniatuur(s.bron_hash(), 0, 144).unwrap().bytes,
        a.bytes
    );
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron.as_slice());
    assert!(s.kan_vooruit());
    assert_eq!(s.dia_miniatuur(&hash, 0, 144).unwrap().bytes, a.bytes);
    assert!(s.kan_vooruit());
    let writer = Sessie::nieuw(Module::Writer).unwrap();
    assert!(writer.dia_miniatuur(writer.bron_hash(), 0, 144).is_err());
}
#[test]
fn notitie_sectiekopie_behoudt_bron_opmaak_volgorde_en_onbekende_velden() {
    use serde_json::json;
    let mut bron: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../docs/voorbeelden/Notitieboek.json"
    ))
    .unwrap();
    let sectie = &mut bron["boeken"][0]["secties"][0];
    sectie["uitbreiding"] = json!({"bewaar":42});
    let pagina = &mut sectie["paginas"][0];
    pagina["uitbreiding"] = json!(["blijft", "staan"]);
    pagina["vakken"][0]["y"] = json!(400);
    pagina["vakken"][1]["y"] = json!(20);
    pagina["vakken"][0]["blokken"][0]["tekst"] = json!("A * [é] 🏠\nvervolg");
    pagina["vakken"][0]["blokken"][0]["soort"] = json!("taak");
    pagina["vakken"][0]["blokken"][0]["klaar"] = json!(true);
    pagina["vakken"][0]["blokken"][0]["vet"] = json!(true);
    pagina["vakken"][1]["blokken"][0]["tekst"] = json!("Eerst");
    pagina["vakken"][1]["blokken"][0]["soort"] = json!("kop");
    let bytes = serde_json::to_vec(&bron).unwrap();
    let mut s = Sessie::open(Module::Notition, bytes.clone()).unwrap();
    let b = s
        .bewerk_met_weergave(0, Bewerking::Notitie(N::KopieerSectie { markdown: true }))
        .unwrap();
    assert_eq!(b.notitie.unwrap().deel, 2);
    let d = data(&s);
    assert_eq!(
        d["boeken"][0]["secties"][0],
        bron["boeken"][0]["secties"][0]
    );
    assert_eq!(
        d["boeken"][0]["secties"][1],
        bron["boeken"][0]["secties"][1]
    );
    let kopie = &d["boeken"][0]["secties"][2];
    assert_eq!(kopie["uitbreiding"], json!({"bewaar":42}));
    assert_eq!(
        kopie["paginas"][0]["uitbreiding"],
        json!(["blijft", "staan"])
    );
    assert_eq!(
        kopie["paginas"][0]["markdown"],
        "## Eerst\n\n- [x] **A \\* \\[é\\] 🏠\n  vervolg**\n"
    );
    assert_ne!(kopie["id"], bron["boeken"][0]["secties"][0]["id"]);
    assert_ne!(
        kopie["paginas"][0]["id"],
        bron["boeken"][0]["secties"][0]["paginas"][0]["id"]
    );
    let heropen = Sessie::open(Module::Notition, s.bron().as_ref().clone()).unwrap();
    assert_eq!(
        heropen.weergave(2).unwrap().velden[1].tekst,
        kopie["paginas"][0]["markdown"].as_str().unwrap()
    );
    let anker = s.notitie_anker(2);
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bytes);
    assert_eq!(s.notitiepositie(anker.as_ref(), 2), 0);
    s.vooruit().unwrap();
    assert_eq!(data(&s), d);
}
#[test]
fn notitie_markdownkopie_splitst_unicode_veilig_en_weigert_te_grote_omzetting_atomair() {
    use serde_json::json;
    let mut s = Sessie::nieuw(Module::Notition).unwrap();
    let id = s.weergave(0).unwrap().velden[1].id.clone();
    let tekst = format!("{}🏠{}", "a".repeat(99_999), "é".repeat(17));
    s.bewerk(
        0,
        Bewerking::Tekst {
            id,
            tekst: tekst.clone(),
        },
    )
    .unwrap();
    s.bewerk(0, Bewerking::Notitie(N::KopieerSectie { markdown: false }))
        .unwrap();
    let d = data(&s);
    let blokken = d["boeken"][0]["secties"][1]["paginas"][0]["vakken"][0]["blokken"]
        .as_array()
        .unwrap();
    assert_eq!(blokken.len(), 2);
    assert_eq!(
        blokken[0]["tekst"].as_str().unwrap().encode_utf16().count(),
        99_999
    );
    assert_eq!(
        blokken
            .iter()
            .map(|b| b["tekst"].as_str().unwrap())
            .collect::<String>(),
        tekst
    );
    assert_ne!(blokken[0]["id"], blokken[1]["id"]);
    let mut bron = d;
    bron["boeken"][0]["secties"][1]["paginas"][0]["vakken"][0]["blokken"][0]["tekst"] =
        json!("*".repeat(250_000));
    let bytes = serde_json::to_vec(&bron).unwrap();
    let mut s = Sessie::open(Module::Notition, bytes.clone()).unwrap();
    assert!(
        s.bewerk(1, Bewerking::Notitie(N::KopieerSectie { markdown: true }))
            .is_err()
    );
    assert_eq!(s.bron().as_slice(), bytes);
    assert!(!s.kan_terug());
    assert!(
        s.bewerk(0, Bewerking::Notitie(N::KopieerSectie { markdown: true }))
            .is_err()
    );
    assert_eq!(s.bron().as_slice(), bytes);
}
#[test]
fn notitie_nieuwe_onderdelen_openen_hun_eigen_pagina_en_teksten_zijn_een_transactie() {
    let mut s = Sessie::nieuw(Module::Notition).unwrap();
    for (actie, verwacht) in [
        (N::NieuwePagina, 1),
        (N::NieuweSectie { markdown: false }, 2),
        (N::NieuwBoek, 3),
    ] {
        let b = s.bewerk_met_weergave(0, Bewerking::Notitie(actie)).unwrap();
        assert_eq!(b.notitie.unwrap().deel, verwacht);
    }
    let bron = s.bron();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    assert!(
        s.bewerk(
            0,
            Bewerking::Notitie(N::Teksten(vec![
                (id, "Veranderd".into()),
                ("/onbestaand".into(), "Mag niet".into())
            ]))
        )
        .is_err()
    );
    assert_eq!(s.bron().as_slice(), bron.as_slice());
}
#[test]
fn vrije_vakken_verplaatsen_vergroten_en_undo_behouden_onbekende_inhoud() {
    let bron=br#"{"formaat":"openaec-notities","versie":3,"boeken":[{"id":"b","naam":"Boek","secties":[{"id":"s","naam":"Sectie","soort":"canvas","paginas":[{"id":"p","titel":"Pagina","vakken":[{"id":"v","x":40,"y":32,"breedte":560,"hoogte":160,"blokken":[{"id":"t","tekst":"Blijft staan","soort":"tekst","vet":false,"cursief":false,"klaar":false}],"uitbreiding":{"kleur":"amber"}}],"markdown":"Bestaande markdown","verwijderd":false}]}]}],"extra":{"bewaar":42}}"#;
    let mut s = Sessie::open(Module::Notition, bron.to_vec()).unwrap();
    let grens = Rechthoek {
        x: 620.,
        y: 410.,
        breedte: 420.,
        hoogte: 220.,
    };
    s.bewerk(0, Bewerking::Notitie(N::Plaats { vak: 0, grens }))
        .unwrap();
    let d = data(&s);
    let v = &d["boeken"][0]["secties"][0]["paginas"][0]["vakken"][0];
    assert_eq!(v["x"], 620.);
    assert_eq!(v["breedte"], 420.);
    assert_eq!(v["blokken"][0]["tekst"], "Blijft staan");
    assert_eq!(v["uitbreiding"]["kleur"], "amber");
    assert_eq!(d["extra"]["bewaar"], 42);
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron);
    s.vooruit().unwrap();
    assert_eq!(
        s.weergave(0).unwrap().notitie.unwrap().vakken[0].grens,
        grens
    );
}
#[test]
fn sectie_wisselt_tussen_canvas_en_markdown_zonder_inhoudsverlies() {
    let mut s = Sessie::nieuw(Module::Notition).unwrap();
    s.bewerk(0, Bewerking::Notitie(N::Sectiesoort { markdown: false }))
        .unwrap();
    s.bewerk(0, Bewerking::Notitie(N::NieuwVak { x: 40., y: 32. }))
        .unwrap();
    let id = s
        .weergave(0)
        .unwrap()
        .velden
        .iter()
        .find(|v| v.id.ends_with("/tekst"))
        .unwrap()
        .id
        .clone();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: id.clone(),
            tekst: "Idee op het canvas".into(),
        },
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: id.clone(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Vet(true),
        },
    )
    .unwrap();
    s.bewerk(0, Bewerking::Notitie(N::Sectiesoort { markdown: true }))
        .unwrap();
    let b = s.weergave(0).unwrap();
    assert!(b.notitie.unwrap().markdown);
    assert!(
        b.velden
            .iter()
            .any(|v| v.naam == "Markdown" && v.tekst.contains("Nieuwe pagina"))
    );
    s.bewerk(0, Bewerking::Notitie(N::Sectiesoort { markdown: false }))
        .unwrap();
    assert!(
        s.weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == "Idee op het canvas" && v.opmaak.vet)
    );
    s.bewerk(0, Bewerking::Notitie(N::Prullenbak(true)))
        .unwrap();
    let oud = s.bron();
    assert!(
        s.bewerk(
            0,
            Bewerking::Tekst {
                id: id.clone(),
                tekst: "Mag niet".into()
            }
        )
        .is_err()
    );
    assert_eq!(*s.bron(), *oud);
    assert!(
        s.bewerk(
            0,
            Bewerking::Opmaak {
                id,
                begin: 0,
                einde: 0,
                stijl: Opmaak::Vet(false)
            }
        )
        .is_err()
    );
    assert_eq!(*s.bron(), *oud);
    s.bewerk(0, Bewerking::Notitie(N::Prullenbak(false)))
        .unwrap();
    assert!(
        s.weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == "Idee op het canvas" && v.bewerkbaar)
    );
}
#[test]
fn notitie_geometriefouten_en_leeg_boek_verliezen_geen_bron() {
    let mut s = Sessie::open(
        Module::Notition,
        br#"{"formaat":"openaec-notities","versie":3,"boeken":[]}"#.to_vec(),
    )
    .unwrap();
    assert!(s.weergave(0).unwrap().onderdelen.is_empty());
    s.bewerk(0, Bewerking::Notitie(N::NieuwBoek)).unwrap();
    assert_eq!(s.weergave(0).unwrap().onderdelen.len(), 1);
    s.bewerk(0, Bewerking::Notitie(N::NieuwVak { x: 40., y: 32. }))
        .unwrap();
    let bron = s.bron();
    for grens in [
        Rechthoek {
            x: -1.,
            y: 32.,
            breedte: 560.,
            hoogte: 160.,
        },
        Rechthoek {
            x: 0.,
            y: f32::NAN,
            breedte: 560.,
            hoogte: 160.,
        },
        Rechthoek {
            x: 0.,
            y: 0.,
            breedte: 199.,
            hoogte: 160.,
        },
    ] {
        assert!(
            s.bewerk(0, Bewerking::Notitie(N::Plaats { vak: 0, grens }))
                .is_err()
        );
        assert_eq!(*s.bron(), *bron);
    }
    s.bewerk(0, Bewerking::Notitie(N::NieuwePagina)).unwrap();
    assert_eq!(
        s.weergave(1).unwrap().notitie.unwrap().titel,
        "Nieuwe pagina"
    );
    s.bewerk(0, Bewerking::Notitie(N::NieuweSectie { markdown: true }))
        .unwrap();
    assert!(s.weergave(2).unwrap().notitie.unwrap().markdown);
}
#[test]
fn oude_notitiebron_wordt_pas_bij_bewerking_gemigreerd() {
    let bron=br#"{"formaat":"openaec-notities","versie":1,"boeken":[{"naam":"Boek","secties":[{"naam":"Sectie","paginas":[{"titel":"Pagina","blokken":[{"tekst":"Oud maar bewaard","vet":true,"klaar":true}],"extra":12}]}]}]}"#;
    let mut s = Sessie::open(Module::Notition, bron.to_vec()).unwrap();
    assert_eq!(s.bron().as_slice(), bron);
    let b = s.weergave(0).unwrap();
    let id = b
        .velden
        .iter()
        .find(|v| v.tekst == "Oud maar bewaard")
        .unwrap()
        .id
        .clone();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id,
            tekst: "Oud en nieuw".into(),
        },
    )
    .unwrap();
    let d = data(&s);
    assert_eq!(d["versie"], 3);
    assert_eq!(d["boeken"][0]["secties"][0]["paginas"][0]["extra"], 12);
    assert!(Document::open(Module::Notition, &s.bron()).is_ok());
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron);
}
#[test]
fn diatekstopmaak_gebruikt_correcte_unicodegrenzen_en_bewaart_runs() {
    let mut s = Sessie::open(
        Module::Presentation,
        include_bytes!("fixtures/presentation-rijk.pptx").to_vec(),
    )
    .unwrap();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: id.clone(),
            tekst: "Native 🏠 tekst".into(),
        },
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: id.clone(),
            begin: 7,
            einde: 8,
            stijl: Opmaak::Onderstrepen(true),
        },
    )
    .unwrap();
    let Document::Presentation(d) = Document::open(Module::Presentation, &s.bron()).unwrap() else {
        panic!()
    };
    let verhaal = d.story(&id).unwrap();
    assert_eq!(verhaal.plain_text(), "Native 🏠 tekst");
    assert!(
        verhaal.paragraphs[0]
            .runs
            .iter()
            .any(|r| r.text == "🏠" && r.style.underline.as_deref() == Some("sng"))
    );
    assert!(
        verhaal.paragraphs[0]
            .runs
            .iter()
            .any(|r| r.text == "Native " && r.style.bold == Some(true))
    );
}
#[test]
fn diabeheer_tekstvak_notities_en_verwijderen_laatste_dia() {
    let mut s = Sessie::open(
        Module::Presentation,
        include_bytes!("fixtures/presentation.pptx").to_vec(),
    )
    .unwrap();
    s.bewerk(1, Bewerking::Dia(P::Toevoegen)).unwrap();
    assert_eq!(s.weergave(2).unwrap().onderdelen.len(), 3);
    s.bewerk(2, Bewerking::Dia(P::Tekstvak)).unwrap();
    assert!(
        s.weergave(2)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == "Nieuwe tekst")
    );
    s.bewerk(
        2,
        Bewerking::Tekst {
            id: "__dia_notities".into(),
            tekst: "Nieuwe sprekersnotities".into(),
        },
    )
    .unwrap();
    s.bewerk(2, Bewerking::Dia(P::Verplaatsen(0))).unwrap();
    assert!(
        s.weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.tekst == "Nieuwe sprekersnotities")
    );
    s.bewerk(2, Bewerking::Dia(P::Verwijderen)).unwrap();
    assert_eq!(s.weergave(1).unwrap().onderdelen.len(), 2);
    s.terug().unwrap();
    assert_eq!(s.weergave(2).unwrap().onderdelen.len(), 3);
}
#[test]
fn lettercatalogus_resolveert_bold_italic_en_metricfamilies() {
    use office_core::lettertypen::kies;
    let cursief = kies("Calibri", false, true);
    assert_eq!(cursief.familie, "Carlito");
    assert!(cursief.cursief && !cursief.vet);
    let vet = kies("Cambria", true, true);
    assert_eq!(vet.familie, "Caladea");
    assert!(vet.cursief && vet.vet);
    assert_eq!(kies("Arial", false, false).familie, "Liberation Sans");
    assert_ne!(
        kies("Inter", true, false).bytes,
        kies("Inter", false, false).bytes
    );
    assert!(kies("Noto Sans SC", false, false).bytes.len() > 1_000_000);
}

#[test]
fn sectielimiet_levert_geen_onleesbare_opgeslagen_bron_op() {
    let mut d: serde_json::Value =
        serde_json::from_slice(&Sessie::nieuw(Module::Notition).unwrap().bron()).unwrap();
    let sectie = d["boeken"][0]["secties"][0].clone();
    d["boeken"][0]["secties"] = serde_json::json!(vec![sectie; 200]);
    let mut s = Sessie::open(Module::Notition, serde_json::to_vec(&d).unwrap()).unwrap();
    let oud = s.bron();
    assert!(
        s.bewerk(0, Bewerking::Notitie(N::NieuweSectie { markdown: false }))
            .is_err()
    );
    assert_eq!(*s.bron(), *oud);
    assert!(!s.kan_terug());
    assert!(Document::open(Module::Notition, &s.bron()).is_ok());
}

#[test]
fn diaminiatuur_van_een_extreem_hoge_dia_blijft_binnen_het_pixelbudget() {
    let mut delen = ooxml_opc::unzip_parts(include_bytes!("fixtures/presentation.pptx")).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "ppt/presentation.xml")
        .unwrap();
    let tekst = String::from_utf8(xml.clone()).unwrap();
    let oud = "<p:sldSz cx=\"9144000\" cy=\"6858000\" type=\"screen4x3\"/>";
    assert_eq!(tekst.matches(oud).count(), 1);
    *xml = tekst
        .replace(oud, "<p:sldSz cx=\"914400\" cy=\"68580000\"/>")
        .into_bytes();
    let bron = ooxml_opc::rezip_parts(&delen).unwrap();
    let s = Sessie::open(Module::Presentation, bron.clone()).unwrap();
    let m = s.dia_miniatuur(s.bron_hash(), 0, 320).unwrap();
    assert!(m.hoogte <= 512 && m.hoogte >= 511);
    assert!(m.breedte > 0 && m.breedte < 16);
    assert_eq!(s.bron().as_slice(), bron.as_slice());
    assert!(!s.kan_terug());
}
