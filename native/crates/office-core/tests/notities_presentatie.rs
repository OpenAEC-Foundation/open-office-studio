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
