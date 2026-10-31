//! Cursorvragen veranderen geen bron en gebruiken dezelfde gevormde regels als het beeld.
use office_core::{
    document::{Module, Sessie},
    writer_navigatie::{CursorDoel, Richting},
};
const RIJK: &[u8] = include_bytes!("fixtures/writer-structuur.docx");
fn beweeg(s: &Sessie, c: &CursorDoel, r: Richting) -> CursorDoel {
    s.verplaats_cursor(c.pagina, s.bron_hash(), &c.punt, r, Some(c), c.doel_x)
        .unwrap()
}
#[test]
fn cursor_verticaal_tussen_echte_paginas_slaat_koppen_over_en_laat_de_bron_ongemoeid() {
    let bron = include_bytes!("fixtures/writer-cachepaginas.docx");
    let s = Sessie::open(Module::Writer, bron.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let id = &b
        .velden
        .iter()
        .find(|v| v.tekst.contains("cachepagina 0"))
        .unwrap()
        .id;
    let begin = b.writer_frame.as_ref().unwrap().cursordoel(id, 0).unwrap();
    let mut c = begin.clone();
    for pagina in 1..6 {
        c = beweeg(&s, &c, Richting::Omlaag);
        assert_eq!(c.pagina, pagina);
        let b = s.weergave(pagina).unwrap();
        assert!(
            b.velden
                .iter()
                .any(|v| v.id == c.punt.id && v.tekst.contains(&format!("cachepagina {pagina}")))
        );
    }
    for pagina in (0..5).rev() {
        c = beweeg(&s, &c, Richting::Omhoog);
        assert_eq!(c.pagina, pagina);
    }
    assert_eq!(c.punt, begin.punt);
    assert!(s.bron().as_slice() == bron);
    assert!(!s.kan_terug());
}
#[test]
fn cursor_tabelnavigatie_volgt_regels_binnen_de_cel_en_springt_niet_naar_de_buurkolom() {
    let s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let cel = b.velden.iter().find(|v| v.tekst == "Cel één").unwrap();
    let begin = b
        .writer_frame
        .as_ref()
        .unwrap()
        .cursordoel(&cel.id, 2)
        .unwrap();
    let c = beweeg(&s, &begin, Richting::Omlaag);
    assert_eq!(
        b.velden.iter().find(|v| v.id == c.punt.id).unwrap().tekst,
        "Tweede celalinea"
    );
    let terug = beweeg(&s, &c, Richting::Omhoog);
    assert_eq!(terug.punt, begin.punt);
    assert!(s.bron().as_slice() == RIJK);
    assert!(!s.kan_terug());
}
fn lange_bron() -> Vec<u8> {
    let mut delen = ooxml_opc::unzip_parts(include_bytes!("fixtures/writer.docx")).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/document.xml")
        .unwrap();
    let oud = String::from_utf8(xml.clone()).unwrap();
    let begin = oud.find("<w:body>").unwrap() + "<w:body>".len();
    let einde = oud.find("<w:sectPr").unwrap();
    *xml = format!(
        "{}<w:p><w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>{}",
        &oud[..begin],
        "Lange 🏠 regel met café ".repeat(12),
        &oud[einde..]
    )
    .into_bytes();
    ooxml_opc::rezip_parts(&delen).unwrap()
}
#[test]
fn cursor_home_end_en_een_klik_bewaren_de_affiniteit_van_een_automatische_regelgrens() {
    let bron = lange_bron();
    let s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    let v = &b.velden[0];
    let f = b.writer_frame.as_ref().unwrap();
    let eerste = f.cursordoel(&v.id, 2).unwrap();
    let tweede = (3..v.tekst.chars().count())
        .map(|p| f.cursordoel(&v.id, p).unwrap())
        .find(|c| c.regel != eerste.regel)
        .unwrap();
    let einde = beweeg(&s, &eerste, Richting::RegelEinde);
    assert_eq!(einde.punt, tweede.punt);
    assert_eq!(einde.cursor.y, eerste.cursor.y);
    assert_ne!(einde.cursor.y, tweede.cursor.y);
    f.controleer_cursor(&einde).unwrap();
    let klik = f
        .cursorpunt(
            f64::from(einde.cursor.x) - 0.01,
            f64::from(einde.cursor.y + einde.cursor.hoogte * 0.5),
        )
        .unwrap()
        .unwrap();
    assert_eq!(klik.punt, einde.punt);
    assert_eq!(klik.cursor.y, einde.cursor.y);
    let beneden = beweeg(&s, &einde, Richting::Omlaag);
    assert!(beneden.cursor.y > einde.cursor.y);
    assert_eq!(beneden.doel_x, Some(f64::from(einde.cursor.x)));
    let boven = beweeg(&s, &beneden, Richting::Omhoog);
    assert_eq!(boven.punt, einde.punt);
    assert_eq!(boven.cursor.y, einde.cursor.y);
    let begin = beweeg(&s, &beneden, Richting::RegelBegin);
    assert_eq!(begin.punt, tweede.punt);
    assert_eq!(begin.cursor.y, tweede.cursor.y);
    assert!(s.bron().as_slice() == bron.as_slice());
    assert!(!s.kan_terug());
}
#[test]
fn cursor_ongeldige_versie_pagina_kolom_en_voorkeur_schatten_geen_cursorpositie() {
    let s = Sessie::open(Module::Writer, RIJK.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let v = &b.velden[0];
    let mut c = b
        .writer_frame
        .as_ref()
        .unwrap()
        .cursordoel(&v.id, 0)
        .unwrap();
    assert!(
        s.verplaats_cursor(0, "verouderd", &c.punt, Richting::Omlaag, None, None)
            .is_err()
    );
    assert!(
        s.verplaats_cursor(
            usize::MAX,
            s.bron_hash(),
            &c.punt,
            Richting::Omlaag,
            None,
            None
        )
        .is_err()
    );
    assert!(
        s.verplaats_cursor(
            0,
            s.bron_hash(),
            &c.punt,
            Richting::Omlaag,
            Some(&c),
            Some(f64::NAN)
        )
        .is_err()
    );
    c.cursor.x += 1.;
    assert!(
        s.verplaats_cursor(0, s.bron_hash(), &c.punt, Richting::Omlaag, Some(&c), None)
            .is_err()
    );
    assert!(s.bron().as_slice() == RIJK);
    assert!(!s.kan_terug());
}
