//! Expliciete tekststappen bewaren de identiteit van herhaalde en gestileerde tekens.
use office_core::{
    document::{Bewerking, Document, Module, Sessie, TekstStap},
    writer_opmaak::selectie,
};
fn bron() -> Vec<u8> {
    let mut delen = ooxml_opc::unzip_parts(include_bytes!("fixtures/writer.docx")).unwrap();
    let (_, bytes) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/document.xml")
        .unwrap();
    let xml = String::from_utf8(bytes.clone()).unwrap();
    let begin = xml.find("<w:body>").unwrap();
    let einde = xml.find("</w:body>").unwrap() + "</w:body>".len();
    let body = r#"<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>a</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>aaa</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>"#;
    *bytes = format!("{}{}{}", &xml[..begin], body, &xml[einde..]).into_bytes();
    ooxml_opc::rezip_parts(&delen).unwrap()
}
fn stap(begin: usize, einde: usize, verwacht: &str, tekst: &str) -> TekstStap {
    TekstStap {
        begin,
        einde,
        verwacht: verwacht.into(),
        tekst: tekst.into(),
    }
}
fn opdracht(id: &str, tekst: &str, stappen: Vec<TekstStap>) -> Bewerking {
    Bewerking::TekstReeks {
        id: id.into(),
        bron: "aaaa".into(),
        tekst: tekst.into(),
        stappen,
    }
}
#[test]
fn gelijke_tekens_verwijderen_en_vervangen_gebruikt_de_echte_selectie() {
    for (s, uit, verwachte_opmaak) in [
        (stap(0, 1, "a", ""), "aaa", vec![(false, true); 3]),
        (
            stap(3, 4, "a", ""),
            "aaa",
            vec![(true, false), (false, true), (false, true)],
        ),
        (
            stap(1, 2, "a", "X"),
            "aXaa",
            vec![(true, false), (false, true), (false, true), (false, true)],
        ),
        (
            stap(4, 4, "", "!"),
            "aaaa!",
            vec![
                (true, false),
                (false, true),
                (false, true),
                (false, true),
                (false, true),
            ],
        ),
    ] {
        let mut d = Document::open(Module::Writer, &bron()).unwrap();
        let id = d.weergave(0).unwrap().velden[0].id.clone();
        d.bewerk(0, opdracht(&id, uit, vec![s])).unwrap();
        let bytes = d.bytes().unwrap();
        let d = Document::open(Module::Writer, &bytes).unwrap();
        let b = d.weergave(0).unwrap();
        assert_eq!(b.velden[0].tekst, uit);
        for (i, verwacht) in verwachte_opmaak.into_iter().enumerate() {
            let s = selectie(&b.writer_opmaak[&id], i, i + 1).unwrap();
            assert_eq!((s.vet, s.cursief), verwacht, "{uit}, teken {i}");
        }
    }
}
#[test]
fn unicode_lege_alinea_en_meerdere_stappen_vormen_een_undo_stap() {
    let bytes = bron();
    let mut s = Sessie::open(Module::Writer, bytes.clone()).unwrap();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    s.bewerk(
        0,
        opdracht(
            &id,
            "🏠é\n\t",
            vec![
                stap(0, 4, "aaaa", ""),
                stap(0, 0, "", "🏠e\u{301}\n\t"),
                stap(1, 3, "e\u{301}", "é"),
            ],
        ),
    )
    .unwrap();
    let b = s.weergave(0).unwrap();
    assert_eq!(b.velden[0].tekst, "🏠é\n\t");
    let staat = selectie(&b.writer_opmaak[&id], 0, 4).unwrap();
    assert!(
        staat.vet && !staat.cursief,
        "De lege alinea houdt haar invoegopmaak"
    );
    let uit = s.bron();
    s.terug().unwrap();
    assert_eq!(*s.bron(), bytes);
    assert!(!s.kan_terug());
    s.vooruit().unwrap();
    assert_eq!(*s.bron(), *uit);
}
#[test]
fn foute_late_stap_versie_grens_resultaat_en_budget_schrijven_niets() {
    let bytes = bron();
    let mut d = Document::open(Module::Writer, &bytes).unwrap();
    let id = d.weergave(0).unwrap().velden[0].id.clone();
    let voor = d.bytes().unwrap();
    let mut opdrachten = vec![
        opdracht(
            &id,
            "fout",
            vec![stap(0, 1, "a", "x"), stap(2, 3, "b", "y")],
        ),
        opdracht(&id, "fout", vec![stap(0, 1, "a", "x")]),
        opdracht(&id, "fout", vec![stap(4, 5, "a", "x")]),
        opdracht(&id, "fout", vec![stap(2, 1, "", "x")]),
        opdracht(&id, "fout", vec![stap(0, 4, "aaaa", &"x".repeat(500_001))]),
        opdracht(&id, "aaaa", vec![stap(0, 0, "", ""); 4097]),
    ];
    opdrachten.push(Bewerking::TekstReeks {
        id,
        bron: "andere bron".into(),
        tekst: "fout".into(),
        stappen: vec![],
    });
    for b in opdrachten {
        assert!(d.bewerk(0, b).is_err());
        assert_eq!(d.bytes().unwrap(), voor);
    }
}
