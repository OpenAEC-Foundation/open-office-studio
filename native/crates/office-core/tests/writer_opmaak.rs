use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    opmaak::Opmaak,
    writer_opmaak::selectie,
};
const BRON: &[u8] = include_bytes!("fixtures/writer.docx");
#[test]
fn writer_opmaak_titel_standaardtekst_en_tabel_laten_de_opgeloste_engineopmaak_zien() {
    let s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    assert_eq!(b.velden[0].opmaak.grootte, Some(26.));
    assert_eq!(b.velden[0].opmaak.lettertype.as_deref(), Some("Calibri"));
    for tekst in [
        "Bewerkbare oorspronkelijke alinea.",
        "Tabel kop",
        "Tabel inhoud",
    ] {
        let v = b.velden.iter().find(|v| v.tekst == tekst).unwrap();
        assert_eq!(v.opmaak.grootte, Some(11.));
        assert_eq!(v.opmaak.lettertype.as_deref(), Some("Cambria"));
        let bereiken = b.writer_opmaak.get(&v.id).unwrap();
        assert_eq!(
            selectie(bereiken, 0, tekst.chars().count()).unwrap(),
            v.opmaak
        );
    }
    assert_eq!(s.bron().as_slice(), BRON);
    assert!(!s.kan_terug());
}
#[test]
fn writer_opmaak_gemengde_opmaak_en_unicode_selecties_gebruiken_de_juiste_tekengrenzen() {
    let s = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer-structuur.docx").to_vec(),
    )
    .unwrap();
    let b = s.weergave(0).unwrap();
    let v = b
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    let bereiken = &b.writer_opmaak[&v.id];
    assert!(!v.opmaak.vet && !v.opmaak.cursief);
    let scheiding = "Links 🏠 ".chars().count();
    let links = selectie(bereiken, 0, scheiding).unwrap();
    assert!(links.vet && !links.cursief);
    let rechts = selectie(bereiken, scheiding, v.tekst.chars().count()).unwrap();
    assert!(!rechts.vet && rechts.cursief);
    assert!(
        selectie(
            bereiken,
            v.tekst.chars().count(),
            v.tekst.chars().count() + 1
        )
        .is_none()
    );
    assert!(selectie(bereiken, 2, 1).is_none());
}
fn stijlbron() -> Vec<u8> {
    let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
    for (naam, bytes) in &mut delen {
        if naam == "word/styles.xml" {
            *bytes = String::from_utf8(bytes.clone()).unwrap().replace("</w:styles>", r#"
<w:style w:type="paragraph" w:styleId="EigenBasis"><w:name w:val="Eigen basis"/><w:rPr><w:b/><w:sz w:val="40"/><w:rFonts w:ascii="Inter" w:hAnsi="Inter"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="EigenKop"><w:name w:val="Eigen kop"/><w:basedOn w:val="EigenBasis"/><w:rPr><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="EigenNadruk"><w:name w:val="Eigen nadruk"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>"#).into_bytes();
        }
        if naam == "word/document.xml" {
            let origineel = String::from_utf8(bytes.clone()).unwrap();
            let begin = origineel.find("<w:body>").unwrap();
            let eind = origineel.find("</w:body>").unwrap() + "</w:body>".len();
            let body = r#"<w:body>
<w:p><w:pPr><w:pStyle w:val="EigenKop"/></w:pPr><w:r><w:t>Overgeërfde kop</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="EigenKop"/></w:pPr><w:r><w:rPr><w:rStyle w:val="EigenNadruk"/></w:rPr><w:t>Tekenstijl keert vet om</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="EigenKop"/></w:pPr><w:r><w:rPr><w:b w:val="0"/><w:sz w:val="21"/></w:rPr><w:t>Directe opmaak</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body>"#;
            *bytes = format!("{}{}{}", &origineel[..begin], body, &origineel[eind..]).into_bytes();
        }
    }
    ooxml_opc::rezip_parts(&delen).unwrap()
}
#[test]
fn writer_opmaak_stijlketen_tekenstijl_en_directe_opmaak_blijven_correct_bij_bewerken_en_undo() {
    let bron = stijlbron();
    let mut s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    assert_eq!(b.velden.len(), 3);
    assert!(b.velden[0].opmaak.vet);
    assert_eq!(b.velden[0].opmaak.grootte, Some(18.));
    assert_eq!(b.velden[0].opmaak.lettertype.as_deref(), Some("Inter"));
    assert!(!b.velden[1].opmaak.vet);
    assert_eq!(b.velden[1].opmaak.grootte, Some(18.));
    assert!(!b.velden[2].opmaak.vet);
    assert_eq!(b.velden[2].opmaak.grootte, Some(10.5));
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: b.velden[0].id.clone(),
            begin: 0,
            einde: b.velden[0].tekst.chars().count(),
            stijl: Opmaak::Vet(false),
        },
    )
    .unwrap();
    assert!(!s.weergave(0).unwrap().velden[0].opmaak.vet);
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        let map = std::path::PathBuf::from(map);
        std::fs::write(map.join("writer-stijlerfenis-bron.docx"), &bron).unwrap();
        std::fs::write(map.join("writer-stijlerfenis.docx"), s.bron().as_slice()).unwrap();
    }
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron);
    assert!(s.weergave(0).unwrap().velden[0].opmaak.vet);
}

#[test]
fn writer_opmaak_lettergrootte_volgt_de_werkelijk_bewaarde_halve_punten() {
    let mut s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let v = &b.velden[1];
    // De vaste serializer schrijft gehele halve punten: 10,2*2=20,4 -> 20;
    // 10,25*2=20,5 -> 21; 10,7*2=21,4 -> 21. Terugdelen geeft 10/10,5/10,5.
    for (nummer, (invoer, bewaard)) in [(10.2, 10.), (10.25, 10.5), (10.7, 10.5)]
        .into_iter()
        .enumerate()
    {
        s.bewerk(
            0,
            Bewerking::Opmaak {
                id: v.id.clone(),
                begin: 0,
                einde: v.tekst.chars().count(),
                stijl: Opmaak::Lettergrootte(invoer),
            },
        )
        .unwrap();
        let mut direct = Document::open(Module::Writer, BRON).unwrap();
        direct
            .bewerk(
                0,
                Bewerking::Opmaak {
                    id: v.id.clone(),
                    begin: 0,
                    einde: v.tekst.chars().count(),
                    stijl: Opmaak::Lettergrootte(invoer),
                },
            )
            .unwrap();
        let Document::Writer(d) = direct else {
            unreachable!()
        };
        let p = d.paragraph(&v.id).unwrap();
        let betteroffice_docx::ParagraphContent::Inline(betteroffice_docx::InlineNode::Run(r)) =
            &p.content[0]
        else {
            unreachable!()
        };
        assert_eq!(r.formatting.as_ref().unwrap().font_size, Some(bewaard * 2.));
        assert_eq!(
            s.weergave(0).unwrap().velden[1].opmaak.grootte,
            Some(bewaard)
        );
        let opnieuw = Sessie::open(Module::Writer, s.bron().as_ref().clone()).unwrap();
        assert_eq!(
            opnieuw.weergave(0).unwrap().velden[1].opmaak.grootte,
            Some(bewaard)
        );
        if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
            std::fs::create_dir_all(&map).unwrap();
            std::fs::write(
                std::path::PathBuf::from(map).join(format!("writer-letterprecisie-{nummer}.docx")),
                s.bron().as_slice(),
            )
            .unwrap();
        }
        s.terug().unwrap();
        assert_eq!(s.bron().as_slice(), BRON);
    }
}
