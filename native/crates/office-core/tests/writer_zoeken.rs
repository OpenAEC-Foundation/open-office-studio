//! Zoekgrenzen, rijke vervanging en behoud van de volledige bron bij late fouten.
use office_core::{
    document::{Bewerking, Document, Module, Sessie, Veld},
    opmaak::OpmaakStaat,
    writer_opmaak::selectie,
    writer_zoeken::{Zoekopdracht, vervangplan, zoek},
};
fn veld(tekst: &str) -> Veld {
    Veld {
        id: "eigen".into(),
        naam: "Eigen alinea".into(),
        tekst: tekst.into(),
        bewerkbaar: true,
        opmaak: OpmaakStaat::default(),
    }
}
fn opdracht(tekst: &str) -> Zoekopdracht {
    Zoekopdracht {
        tekst: tekst.into(),
        ..Default::default()
    }
}
const BRON: &[u8] = include_bytes!("fixtures/writer-structuur.docx");
#[test]
fn zoeken_gebruikt_unicodegrenzen_en_letterlijke_woorden() {
    let velden = vec![veld(
        "🏠 Café café caféïne café_ cafe\u{301} CAFE\u{301} [a.*] Σ σ ς K k",
    )];
    let t = zoek(&velden, &opdracht("café")).unwrap();
    assert_eq!(
        t.iter()
            .map(|t| (t.begin, t.einde, t.tekst.as_str()))
            .collect::<Vec<_>>(),
        vec![
            (2, 6, "Café"),
            (7, 11, "café"),
            (12, 16, "café"),
            (20, 24, "café")
        ]
    );
    let mut o = opdracht("café");
    o.hele_woorden = true;
    assert_eq!(
        zoek(&velden, &o)
            .unwrap()
            .iter()
            .map(|t| t.begin)
            .collect::<Vec<_>>(),
        vec![2, 7]
    );
    o.hoofdlettergevoelig = true;
    assert_eq!(zoek(&velden, &o).unwrap()[0].begin, 7);
    let a = zoek(&velden, &opdracht("[a.*]")).unwrap();
    assert_eq!(a.len(), 1);
    assert_eq!(a[0].tekst, "[a.*]");
    assert_eq!(zoek(&velden, &opdracht("σ")).unwrap().len(), 3);
    assert_eq!(zoek(&velden, &opdracht("k")).unwrap().len(), 2);
    assert_eq!(zoek(&velden, &opdracht("cafe\u{301}")).unwrap().len(), 2);
    assert!(
        zoek(&velden, &opdracht("CAFÉÏNE"))
            .unwrap()
            .iter()
            .all(|t| t.tekst == "caféïne")
    );
    assert!(zoek(&velden, &opdracht("")).unwrap().is_empty());
}
#[test]
fn alles_vervangen_bewaart_runopmaak_en_tabellen_en_is_een_undo_stap() {
    let mut s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let t = zoek(&b.velden, &opdracht("e")).unwrap();
    assert!(t.len() > 8);
    assert!(t.iter().any(|t| b.velden[t.veld].tekst == "Cel één"));
    assert!(t.iter().any(|t| b.velden[t.veld].tekst == "Cel twee"));
    let plan = vervangplan(&b.velden, &t, "Ω").unwrap();
    assert!(plan.len() > 3);
    s.bewerk(0, Bewerking::TekstReeksen(plan)).unwrap();
    let nieuw = s.weergave(0).unwrap();
    assert_eq!(nieuw.velden.len(), b.velden.len());
    let nieuwe_opmaak = &nieuw.writer_opmaak;
    for (oud, nieuw) in b.velden.iter().zip(&nieuw.velden) {
        assert_eq!(nieuw.tekst, oud.tekst.replace(['e', 'E'], "Ω"));
        if let (Some(a), Some(n)) = (b.writer_opmaak.get(&oud.id), nieuwe_opmaak.get(&nieuw.id)) {
            for i in 0..oud.tekst.chars().count() {
                let a = selectie(a, i, i + 1).unwrap();
                let n = selectie(n, i, i + 1).unwrap();
                assert_eq!(
                    (a.vet, a.cursief, a.lettertype, a.grootte),
                    (n.vet, n.cursief, n.lettertype, n.grootte)
                );
            }
        }
    }
    let bytes = s.bron();
    let opnieuw = Document::open(Module::Writer, &bytes)
        .unwrap()
        .weergave(0)
        .unwrap();
    assert_eq!(
        opnieuw.velden.iter().map(|v| &v.tekst).collect::<Vec<_>>(),
        nieuw.velden.iter().map(|v| &v.tekst).collect::<Vec<_>>()
    );
    if let Some(p) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let p = std::path::PathBuf::from(p);
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("writer-zoekvervang.docx"), bytes.as_slice()).unwrap();
    }
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), BRON);
    assert!(!s.kan_terug());
    s.vooruit().unwrap();
    assert_eq!(s.bron().as_slice(), bytes.as_slice());
}
#[test]
fn een_late_fout_en_dubbele_alinea_wijzigen_geen_deel_van_het_document() {
    let mut d = Document::open(Module::Writer, BRON).unwrap();
    let velden = d.weergave(0).unwrap().velden;
    let treffers = zoek(&velden, &opdracht("e")).unwrap();
    let plan = vervangplan(&velden, &treffers, "andere tekst").unwrap();
    assert!(plan.len() > 1);
    let voor = d.bytes().unwrap();
    let mut fout = plan.clone();
    fout.last_mut()
        .unwrap()
        .stappen
        .last_mut()
        .unwrap()
        .verwacht = "verouderd".into();
    assert!(d.bewerk(0, Bewerking::TekstReeksen(fout)).is_err());
    assert_eq!(d.bytes().unwrap(), voor);
    let mut fout = plan.clone();
    fout.push(plan[0].clone());
    assert!(d.bewerk(0, Bewerking::TekstReeksen(fout)).is_err());
    assert_eq!(d.bytes().unwrap(), voor);
    let mut fout = plan;
    fout.last_mut().unwrap().tekst = "onjuist verwacht resultaat".into();
    assert!(d.bewerk(0, Bewerking::TekstReeksen(fout)).is_err());
    assert_eq!(d.bytes().unwrap(), voor);
}
#[test]
fn limieten_en_alleen_lezen_leiden_nooit_tot_stil_overgeslagen_vervangingen() {
    let v = vec![veld("Eigen eigen")];
    let treffers = zoek(&v, &opdracht("eigen")).unwrap();
    let plan = vervangplan(&v, &treffers, "eigen").unwrap();
    assert_eq!(plan[0].stappen.len(), 1);
    assert_eq!(plan[0].tekst, "eigen eigen");
    let v = vec![veld("eigen eigen")];
    let treffers = zoek(&v, &opdracht("eigen")).unwrap();
    assert!(vervangplan(&v, &treffers, "eigen").is_err());
    let mut velden = vec![
        veld("woord woord"),
        Veld {
            id: "tweede".into(),
            ..veld("woord")
        },
    ];
    let t = zoek(&velden, &opdracht("woord")).unwrap();
    velden[1].bewerkbaar = false;
    assert!(vervangplan(&velden, &t, "X").is_err());
    velden[1].bewerkbaar = true;
    let mut fout = t.clone();
    fout.last_mut().unwrap().begin = 5;
    assert!(vervangplan(&velden, &fout, "X").is_err());
    let mut fout = t.clone();
    fout.push(t[0].clone());
    assert!(vervangplan(&velden, &fout, "X").is_err());
    velden[0].tekst = "a ".repeat(4097);
    assert!(zoek(&velden, &opdracht("a")).is_err());
    assert!(zoek(&velden, &opdracht(&"a".repeat(4097))).is_err());
    let velden = vec![veld(&"a ".repeat(4000))];
    let t = zoek(&velden, &opdracht("a")).unwrap();
    assert_eq!(t.len(), 4000);
    assert!(vervangplan(&velden, &t, &"b".repeat(1000)).is_err());
}

#[test]
fn gezamenlijke_vervanging_blijft_correct_over_honderden_alineas() {
    let mut delen = ooxml_opc::unzip_parts(include_bytes!("fixtures/writer.docx")).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/document.xml")
        .unwrap();
    let oud = String::from_utf8(xml.clone()).unwrap();
    let a = oud.find("<w:body>").unwrap() + "<w:body>".len();
    let b = oud.find("<w:sectPr").unwrap();
    let tekst = (0..256)
        .map(|i| format!("<w:p><w:r><w:t>Eigen werk {i} café 🏠</w:t></w:r></w:p>"))
        .collect::<String>();
    *xml = format!("{}{}{}", &oud[..a], tekst, &oud[b..]).into_bytes();
    let bron = ooxml_opc::rezip_parts(&delen).unwrap();
    let mut document = Document::open(Module::Writer, &bron).unwrap();
    let Document::Writer(d) = &document else {
        unreachable!()
    };
    let velden = d
        .paragraphs()
        .into_iter()
        .map(|p| Veld {
            id: p.para_id.clone().unwrap(),
            naam: String::new(),
            tekst: betteroffice_docx::get_paragraph_text(p),
            bewerkbaar: true,
            opmaak: OpmaakStaat::default(),
        })
        .collect::<Vec<_>>();
    let t = zoek(&velden, &opdracht("eigen")).unwrap();
    assert_eq!(t.len(), 256);
    let plan = vervangplan(&velden, &t, "Lokaal").unwrap();
    document.bewerk(0, Bewerking::TekstReeksen(plan)).unwrap();
    let bytes = document.bytes().unwrap();
    let herlezen = Document::open(Module::Writer, &bytes).unwrap();
    let Document::Writer(d) = herlezen else {
        unreachable!()
    };
    let p = d.paragraphs();
    assert_eq!(p.len(), 256);
    for (i, p) in p.iter().enumerate() {
        assert_eq!(
            betteroffice_docx::get_paragraph_text(p),
            format!("Lokaal werk {i} café 🏠")
        );
    }
    if let Some(p) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let p = std::path::PathBuf::from(p);
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("writer-zoekvervang-groot.docx"), bytes).unwrap();
    }
}
