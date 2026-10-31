//! Een zichtbaar frame blijft zelfstandig; invoerbatches behouden exacte undo-bronnen.
use office_core::document::{Bewerking, Module, Sessie, TekstReeks, TekstStap};
const RIJK: &[u8] = include_bytes!("fixtures/writer-structuur.docx");
#[test]
fn frame_hoort_bij_de_zichtbare_tekst_ook_na_een_andere_layout_en_eigen_bewerking() {
    let mut s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let f = b.writer_frame.as_ref().unwrap();
    let v = b
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    let m = f.markering(&v.id, 8, 12).unwrap();
    let r = m.rechthoeken[0];
    let x = f64::from(r.x + r.breedte * 0.5);
    let y = f64::from(r.y + r.hoogte * 0.5);
    let punt = f.punt(x, y).unwrap().unwrap();
    assert_eq!(punt.id, v.id);
    assert!((8..=12).contains(&punt.positie));
    assert_eq!(
        s.tekstpunt(0, s.bron_hash(), x, y).unwrap(),
        Some(punt.clone())
    );
    let ander = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer-cachepaginas.docx").to_vec(),
    )
    .unwrap();
    ander.weergave(5).unwrap();
    assert_eq!(f.punt(x, y).unwrap(), Some(punt.clone()));
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: v.id.clone(),
            tekst: "Andere eigen bron".into(),
        },
    )
    .unwrap();
    let nieuw = s.weergave(0).unwrap();
    let nf = nieuw.writer_frame.as_ref().unwrap();
    assert_eq!(nf.tekst(&v.id), Some("Andere eigen bron"));
    assert_eq!(f.tekst(&v.id), Some("Links 🏠 café rechts"));
    assert_eq!(f.punt(x, y).unwrap(), Some(punt));
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), RIJK);
}
#[test]
fn frame_van_de_zesde_pagina_adresseert_die_pagina_en_geen_hernummerde_body() {
    let s = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer-cachepaginas.docx").to_vec(),
    )
    .unwrap();
    let b = s.weergave(5).unwrap();
    let f = b.writer_frame.as_ref().unwrap();
    assert_eq!(f.pagina, 5);
    let v = b
        .velden
        .iter()
        .find(|v| v.tekst.contains("cachepagina 5"))
        .unwrap();
    let a = v.tekst.chars().position(|c| c == '🏠').unwrap();
    let m = f.markering(&v.id, a, a + 1).unwrap();
    assert_eq!(m.pagina, 5);
    for r in m.rechthoeken {
        for verhouding in [0.1, 0.9] {
            let p = f
                .punt(
                    f64::from(r.x + r.breedte * verhouding),
                    f64::from(r.y + r.hoogte * 0.5),
                )
                .unwrap()
                .unwrap();
            assert_eq!(p.id, v.id);
            assert!([a, a + 1].contains(&p.positie));
        }
    }
    assert!(!s.kan_terug());
}
#[test]
fn leeg_document_heeft_een_werkelijk_cursorvlak_en_een_klikbaar_tekstpunt() {
    let mut delen = ooxml_opc::unzip_parts(include_bytes!("fixtures/writer.docx")).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/document.xml")
        .unwrap();
    let oud = String::from_utf8(xml.clone()).unwrap();
    let a = oud.find("<w:body>").unwrap() + "<w:body>".len();
    let b = oud.find("<w:sectPr").unwrap();
    *xml = format!("{}<w:p/>{}", &oud[..a], &oud[b..]).into_bytes();
    let bron = ooxml_opc::rezip_parts(&delen).unwrap();
    let s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    assert_eq!(b.velden.len(), 1);
    assert!(b.velden[0].tekst.is_empty());
    let f = b.writer_frame.as_ref().unwrap();
    let m = f.markering(&b.velden[0].id, 0, 0).unwrap();
    let r = m.cursor.unwrap();
    let p = f
        .punt(f64::from(r.x + 1.), f64::from(r.y + r.hoogte * 0.5))
        .unwrap()
        .unwrap();
    assert_eq!(p.id, b.velden[0].id);
    assert_eq!(p.positie, 0);
    assert_eq!(s.bron().as_slice(), bron.as_slice());
}
fn invoeg(s: &mut Sessie, id: &str, groep: u64, positie: usize, tekst: &str) {
    let b = s.weergave(0).unwrap();
    let v = b.velden.iter().find(|v| v.id == id).unwrap();
    let mut nieuw: Vec<_> = v.tekst.chars().collect();
    nieuw.splice(positie..positie, tekst.chars());
    s.bewerk_tekstgroep(
        0,
        groep,
        TekstReeks {
            id: id.into(),
            bron: v.tekst.clone(),
            tekst: nieuw.into_iter().collect(),
            stappen: vec![TekstStap {
                begin: positie,
                einde: positie,
                verwacht: String::new(),
                tekst: tekst.into(),
            }],
        },
    )
    .unwrap();
}
#[test]
fn aansluitende_invoer_is_een_undo_stap_en_een_nieuwe_groep_blijft_apart() {
    let mut s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    invoeg(&mut s, &id, 1, 0, "é");
    invoeg(&mut s, &id, 1, 1, "🏠");
    invoeg(&mut s, &id, 1, 2, "abc");
    let na = s.bron();
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), RIJK);
    assert!(!s.kan_terug());
    s.vooruit().unwrap();
    assert_eq!(*s.bron(), *na);
    invoeg(&mut s, &id, 2, 0, "Andere groep");
    s.terug().unwrap();
    assert_eq!(*s.bron(), *na);
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), RIJK);
}
#[test]
fn gewone_opdracht_fout_en_een_andere_alinea_onderbreken_invoergroepering() {
    for geval in 0..3 {
        let mut s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
        let b = s.weergave(0).unwrap();
        let id = b.velden[0].id.clone();
        let tweede = b.velden[1].id.clone();
        invoeg(&mut s, &id, 1, 0, "A");
        let eerste = s.bron();
        let bron = s.weergave(0).unwrap().velden[0].tekst.clone();
        match geval {
            0 => {
                invoeg(&mut s, &tweede, 1, 0, "B");
                s.terug().unwrap();
                assert_eq!(*s.bron(), *eerste);
                continue;
            }
            1 => {
                // De groep is hier nog actief. Een fout mag de volgende
                // geldige invoer niet achteraf bij de eerdere invoer voegen.
                assert!(
                    s.bewerk_tekstgroep(
                        0,
                        1,
                        TekstReeks {
                            id: id.clone(),
                            bron: bron.clone(),
                            tekst: format!("C{}", &bron[1..]),
                            stappen: vec![TekstStap {
                                begin: 0,
                                einde: 1,
                                verwacht: "Z".into(),
                                tekst: "C".into()
                            }],
                        }
                    )
                    .is_err()
                );
                assert_eq!(*s.bron(), *eerste);
            }
            _ => {
                // De bronhash blijft gelijk: alleen hashcontrole zou deze
                // gewone opdracht niet als onderbreking herkennen.
                s.bewerk(
                    0,
                    Bewerking::Tekst {
                        id: id.clone(),
                        tekst: bron,
                    },
                )
                .unwrap();
                assert_eq!(*s.bron(), *eerste);
            }
        }
        invoeg(&mut s, &id, 1, 0, "D");
        s.terug().unwrap();
        assert_eq!(*s.bron(), *eerste);
        if geval == 2 {
            s.terug().unwrap();
            assert_eq!(*s.bron(), *eerste);
        }
        s.terug().unwrap();
        assert_eq!(s.bron().as_slice(), RIJK);
    }
}
