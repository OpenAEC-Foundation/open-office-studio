use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    writer::AlineaActie as A,
};

const BRON: &[u8] = include_bytes!("fixtures/writer-structuur.docx");
fn id(s: &Sessie, tekst: &str) -> String {
    s.weergave(0)
        .unwrap()
        .velden
        .iter()
        .find(|v| v.tekst == tekst)
        .unwrap()
        .id
        .clone()
}
fn bewerk(s: &mut Sessie, id: &str, actie: A) {
    s.bewerk(
        0,
        Bewerking::Alinea {
            id: id.into(),
            actie,
        },
    )
    .unwrap();
}
fn bewaar(naam: &str, bytes: &[u8]) {
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(map.join(naam), bytes).unwrap();
    }
}
fn ongewijzigde_delen(bytes: &[u8]) {
    let oud = ooxml_opc::unzip_parts(BRON).unwrap();
    let nieuw = ooxml_opc::unzip_parts(bytes).unwrap();
    for naam in ["word/styles.xml", "office-test/blijft.xml"] {
        let lees = |delen: &Vec<(String, Vec<u8>)>| {
            delen.iter().find(|(n, _)| n == naam).unwrap().1.clone()
        };
        assert!(lees(&oud) == lees(&nieuw), "Pakketdeel {naam} is veranderd");
    }
    // De serializer schrijft namespacebindings van verhaalonderdelen opnieuw.
    // Vergelijk het volledige verhaalmodel. De serializer mag aanvullende
    // bekende compatibiliteitsprefixen aangeven, maar geen bestaande weglaten.
    let oud = betteroffice_docx::Document::open(BRON).unwrap();
    let nieuw = betteroffice_docx::Document::open(bytes).unwrap();
    for (oud, nieuw) in [
        (oud.headers(), nieuw.headers()),
        (oud.footers(), nieuw.footers()),
    ] {
        assert_eq!(oud.len(), nieuw.len());
        for ((id, verhaal), (nieuw_id, nieuw_verhaal)) in oud.iter().zip(nieuw) {
            assert_eq!(id, nieuw_id);
            let compat = |h: &docx_parse::HeaderFooter| {
                h.custom_root_bindings
                    .iter()
                    .find(|a| a.name == "mc:Ignorable")
                    .map(|a| {
                        a.value
                            .split_whitespace()
                            .map(str::to_owned)
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default()
            };
            let nieuw_compat = compat(nieuw_verhaal);
            assert!(compat(verhaal).iter().all(|v| nieuw_compat.contains(v)));
            let mut a = verhaal.clone();
            let mut b = nieuw_verhaal.clone();
            a.custom_root_bindings.retain(|a| a.name != "mc:Ignorable");
            b.custom_root_bindings.retain(|a| a.name != "mc:Ignorable");
            assert_eq!(a, b);
        }
    }
}

#[test]
fn splitsen_en_samenvoegen_bewaart_unicode_runs_secties_en_ongedaan_maken() {
    let mut s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let sleutel = id(&s, "Links 🏠 café rechts");
    let aantal = s.weergave(0).unwrap().velden.len();
    bewerk(&mut s, &sleutel, A::Splits { positie: 8 });
    let beeld = s.weergave(0).unwrap();
    assert_eq!(beeld.velden.len(), aantal + 1);
    let index = beeld.velden.iter().position(|v| v.id == sleutel).unwrap();
    assert_eq!(beeld.velden[index].tekst, "Links 🏠 ");
    assert_eq!(beeld.velden[index + 1].tekst, "café rechts");
    assert!(beeld.velden[index].opmaak.vet);
    assert!(beeld.velden[index + 1].opmaak.cursief);
    let gesplitst = s.bron();
    ongewijzigde_delen(&gesplitst);
    bewaar("writer-gesplitst.docx", &gesplitst);
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), BRON);
    s.vooruit().unwrap();
    assert_eq!(s.bron().as_slice(), gesplitst.as_slice());
    bewerk(&mut s, &sleutel, A::VoegVolgendeSamen);
    assert_eq!(s.weergave(0).unwrap().velden.len(), aantal);
    assert_eq!(
        s.weergave(0).unwrap().velden[index].tekst,
        "Links 🏠 café rechts"
    );
    ongewijzigde_delen(&s.bron());
    bewaar("writer-samengevoegd.docx", &s.bron());
    let Document::Writer(d) = Document::open(Module::Writer, &s.bron()).unwrap() else {
        panic!()
    };
    assert_eq!(d.model().body.sections.as_ref().unwrap().len(), 2);
    assert_eq!(d.tables().len(), 1);
    assert_eq!(
        betteroffice_docx::get_paragraph_text(d.paragraph(&sleutel).unwrap()),
        "Links 🏠 café rechts"
    );
}

#[test]
fn tabelcel_splitsen_blijft_binnen_de_cel_en_weigert_samenvoegen_over_grenzen() {
    let mut s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let eerste = id(&s, "Cel één");
    bewerk(&mut s, &eerste, A::Splits { positie: 4 });
    bewerk(&mut s, &eerste, A::VoegVolgendeSamen);
    let laatste = id(&s, "Tweede celalinea");
    let bron = s.bron();
    for sleutel in [
        &laatste,
        &id(&s, "Cel twee"),
        &id(&s, "Links 🏠 café rechts"),
        &id(&s, "Andere sectie"),
    ] {
        assert!(
            s.bewerk(
                0,
                Bewerking::Alinea {
                    id: sleutel.clone(),
                    actie: A::VoegVolgendeSamen
                }
            )
            .is_err()
        );
        assert_eq!(*s.bron(), *bron);
    }
    let Document::Writer(d) = Document::open(Module::Writer, &s.bron()).unwrap() else {
        panic!()
    };
    let t = d.tables()[0];
    assert_eq!(t.rows[0].cells[0].content.len(), 2);
    assert_eq!(t.rows[0].cells[1].content.len(), 1);
    bewaar("writer-celstructuur.docx", &s.bron());
}

#[test]
fn lege_alineas_en_sectie_einde_blijven_heropenbaar() {
    let mut s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let sleutel = id(&s, "Links 🏠 café rechts");
    for positie in [0, "Links 🏠 café rechts".chars().count()] {
        bewerk(&mut s, &sleutel, A::Splits { positie });
        let beeld = s.weergave(0).unwrap();
        let index = beeld.velden.iter().position(|v| v.id == sleutel).unwrap();
        if positie == 0 {
            assert!(beeld.velden[index].opmaak.vet)
        } else {
            assert!(beeld.velden[index + 1].opmaak.cursief)
        }
        assert!(Document::open(Module::Writer, &s.bron()).is_ok());
        bewerk(&mut s, &sleutel, A::VoegVolgendeSamen);
        assert_eq!(id(&s, "Links 🏠 café rechts"), sleutel);
    }
    let Document::Writer(d) = Document::open(Module::Writer, &s.bron()).unwrap() else {
        panic!()
    };
    let einde = d
        .paragraphs()
        .iter()
        .find(|p| p.section_properties.is_some())
        .unwrap()
        .para_id
        .clone()
        .unwrap();
    let oud = s.bron();
    assert!(
        s.bewerk(
            0,
            Bewerking::Alinea {
                id: einde.clone(),
                actie: A::VoegVolgendeSamen
            }
        )
        .is_err()
    );
    assert_eq!(*s.bron(), *oud);
    bewerk(&mut s, &einde, A::Splits { positie: 0 });
    let Document::Writer(d) = Document::open(Module::Writer, &s.bron()).unwrap() else {
        panic!()
    };
    assert!(d.paragraph(&einde).unwrap().section_properties.is_none());
    assert_eq!(
        d.paragraphs()
            .iter()
            .filter(|p| p.section_properties.is_some())
            .count(),
        1
    );
    bewerk(&mut s, &einde, A::VoegVolgendeSamen);
    let Document::Writer(d) = Document::open(Module::Writer, &s.bron()).unwrap() else {
        panic!()
    };
    assert_eq!(d.model().body.sections.as_ref().unwrap().len(), 2);
}

#[test]
fn ongeldige_splitspositie_verandert_bron_en_geschiedenis_niet() {
    let mut s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let sleutel = id(&s, "Links 🏠 café rechts");
    assert!(
        s.bewerk(
            0,
            Bewerking::Alinea {
                id: sleutel,
                actie: A::Splits {
                    positie: usize::MAX
                }
            }
        )
        .is_err()
    );
    assert_eq!(s.bron().as_slice(), BRON);
    assert!(!s.kan_terug());
    assert!(s.weergave(0).is_ok());
}

#[test]
fn verdwijnende_laatste_pagina_breekt_een_geldige_bewerking_niet_af() {
    use betteroffice_docx::BlockContent as B;
    let mut d = Document::open(Module::Writer, include_bytes!("fixtures/writer.docx")).unwrap();
    let Document::Writer(doc) = &mut d else {
        panic!()
    };
    let B::Paragraph(p) = &mut doc.model_mut().body.content[1] else {
        panic!()
    };
    std::sync::Arc::make_mut(p)
        .formatting
        .get_or_insert_with(Default::default)
        .page_break_before = Some(true);
    let mut s = Sessie::open(Module::Writer, d.bytes().unwrap()).unwrap();
    let beeld = s.weergave(1).unwrap();
    assert_eq!(beeld.onderdelen.len(), 2);
    let eerste = beeld.velden[0].id.clone();
    let bron = s.bron();
    let na = s
        .bewerk_met_weergave(
            1,
            Bewerking::Alinea {
                id: eerste,
                actie: A::VoegVolgendeSamen,
            },
        )
        .unwrap();
    assert_eq!(na.onderdelen.len(), 1);
    assert!(na.afbeelding.is_some());
    assert!(
        na.velden[0]
            .tekst
            .contains("Bewerkbare oorspronkelijke alinea.")
    );
    bewaar("writer-pagina-weg.docx", &s.bron());
    s.terug().unwrap();
    assert_eq!(*s.bron(), *bron);
    assert_eq!(s.weergave(1).unwrap().onderdelen.len(), 2);
}
