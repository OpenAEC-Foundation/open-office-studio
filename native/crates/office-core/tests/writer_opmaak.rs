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

fn bewaar_lege_opmaak(naam: &str, bytes: &[u8]) {
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(std::path::PathBuf::from(map).join(naam), bytes).unwrap();
    }
}

#[test]
fn lege_invoegopmaak_na_splitsen_bewaart_bestaande_cursief_en_nieuwe_vetkeuze() {
    let bron = include_bytes!("fixtures/writer-structuur.docx");
    let mut s = Sessie::open(Module::Writer, bron.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    let v = b
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    let n = v.tekst.chars().count();
    let hash = s.bron_hash().to_owned();
    let (_, doel) = s
        .bewerk_alinea_cursor(
            0,
            &hash,
            &v.id,
            n,
            n,
            office_core::writer::CursorActie::Splits,
        )
        .unwrap();
    let leeg = s.bron();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: doel.id.clone(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Vet(true),
        },
    )
    .unwrap();
    let opgemaakt = s.bron();
    let direct = s.weergave(0).unwrap();
    let direct = direct.velden.iter().find(|v| v.id == doel.id).unwrap();
    assert_eq!(direct.opmaak.grootte, Some(11.));
    assert_eq!(direct.opmaak.lettertype.as_deref(), Some("Cambria"));
    let mut heropend = Sessie::open(Module::Writer, opgemaakt.as_ref().clone()).unwrap();
    let b = heropend.weergave(0).unwrap();
    let v = b.velden.iter().find(|v| v.id == doel.id).unwrap();
    assert!(v.tekst.is_empty() && v.opmaak.vet && v.opmaak.cursief);
    bewaar_lege_opmaak("writer-lege-invoegopmaak-leeg.docx", &opgemaakt);
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let engine = docx_edit::EngineSession::new(424244);
        docx_edit::seed_from_docx(engine.doc(), &opgemaakt).unwrap();
        let mut waarden = vec![];
        for verhaal in engine.doc().list_stories().stories {
            if verhaal.root != "body" {
                continue;
            }
            for segment in engine.doc().story_segments(&verhaal.story).unwrap() {
                if let docx_edit::SegmentContent::Pilcrow(p) = segment.content {
                    let decode = p.values.get("defaultTextFormatting").map(|v| {
                        serde_json::to_value(v)
                            .and_then(
                                serde_json::from_value::<docx_parse::formatting::TextFormatting>,
                            )
                            .map(|f| format!("{f:?}"))
                            .unwrap_or_else(|e| format!("Niet gelezen: {e}"))
                    });
                    waarden.push(serde_json::json!({"id":p.para_id,"eigenschappen":p.values,"decode":decode}));
                }
            }
        }
        std::fs::write(
            std::path::PathBuf::from(map).join("writer-lege-vet-markeringen.json"),
            serde_json::to_vec_pretty(&waarden).unwrap(),
        )
        .unwrap();
    }
    assert_eq!(v.opmaak.grootte, Some(11.));
    assert_eq!(v.opmaak.lettertype.as_deref(), Some("Cambria"));
    heropend
        .bewerk(
            0,
            Bewerking::Tekst {
                id: doel.id.clone(),
                tekst: "Nieuwe tekst 🏠".into(),
            },
        )
        .unwrap();
    let b = heropend.weergave(0).unwrap();
    let v = b.velden.iter().find(|v| v.id == doel.id).unwrap();
    assert_eq!(v.tekst, "Nieuwe tekst 🏠");
    assert!(v.opmaak.vet && v.opmaak.cursief);
    assert_eq!(
        b.velden
            .iter()
            .filter(|v| v.tekst == "Links 🏠 café rechts")
            .count(),
        1
    );
    bewaar_lege_opmaak("writer-lege-invoegopmaak.docx", &heropend.bron());
    // Vergelijk de opmaakstap met de al gesplitste, canonieke bron.
    // De ongewijzigde inhoud tegenover het origineel wordt onafhankelijk gelezen.
    let oorspronkelijke_delen = ooxml_opc::unzip_parts(&leeg).unwrap();
    let nieuwe_delen = ooxml_opc::unzip_parts(&heropend.bron()).unwrap();
    for (naam, data) in oorspronkelijke_delen
        .iter()
        .filter(|(n, _)| n != "word/document.xml")
    {
        assert_eq!(
            nieuwe_delen.iter().find(|(n, _)| n == naam).unwrap().1,
            *data,
            "{naam}"
        );
    }
    heropend.terug().unwrap();
    assert_eq!(*heropend.bron(), *opgemaakt);
    s.terug().unwrap();
    assert_eq!(*s.bron(), *leeg);
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron);
}

fn bron_zonder_tekstruns() -> Vec<u8> {
    let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
    let (_, bytes) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/document.xml")
        .unwrap();
    let xml = String::from_utf8(bytes.clone()).unwrap();
    let begin = xml.find("<w:body>").unwrap();
    let eind = xml.find("</w:body>").unwrap() + "</w:body>".len();
    let body = r#"<w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>"#;
    *bytes = format!("{}{}{}", &xml[..begin], body, &xml[eind..]).into_bytes();
    ooxml_opc::rezip_parts(&delen).unwrap()
}

#[test]
fn lege_invoegopmaak_zonder_runs_behoudt_acht_opmaakeigenschappen_na_heropenen() {
    let bron = bron_zonder_tekstruns();
    let mut s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    for stijl in [
        Opmaak::Vet(true),
        Opmaak::Cursief(true),
        Opmaak::Onderstrepen(true),
        Opmaak::Doorhalen(true),
        Opmaak::Lettergrootte(13.5),
        Opmaak::Lettertype("Inter".into()),
        Opmaak::Kleur("#123456".into()),
        Opmaak::Achtergrond("#FFF2CC".into()),
    ] {
        s.bewerk(
            0,
            Bewerking::Opmaak {
                id: id.clone(),
                begin: 0,
                einde: 0,
                stijl,
            },
        )
        .unwrap();
    }
    let opgemaakt = s.bron();
    let mut heropend = Sessie::open(Module::Writer, opgemaakt.as_ref().clone()).unwrap();
    heropend
        .bewerk(
            0,
            Bewerking::Tekst {
                id: id.clone(),
                tekst: "café 🏠".into(),
            },
        )
        .unwrap();
    let b = heropend.weergave(0).unwrap();
    let staat = &b.velden[0].opmaak;
    assert!(staat.vet && staat.cursief && staat.onderstrepen && staat.doorhalen);
    assert_eq!(staat.grootte, Some(13.5));
    assert_eq!(staat.lettertype.as_deref(), Some("Inter"));
    let Document::Writer(d) = Document::open(Module::Writer, &heropend.bron()).unwrap() else {
        panic!()
    };
    let p = d.paragraph(&id).unwrap();
    assert_eq!(
        p.formatting.as_ref().unwrap().alignment.as_deref(),
        Some("center")
    );
    let betteroffice_docx::ParagraphContent::Inline(betteroffice_docx::InlineNode::Run(r)) =
        &p.content[0]
    else {
        panic!()
    };
    let f = r.formatting.as_ref().unwrap();
    assert!(serde_json::to_string(&f.color).unwrap().contains("123456"));
    assert!(
        serde_json::to_string(&f.shading)
            .unwrap()
            .contains("FFF2CC")
    );
    bewaar_lege_opmaak("writer-lege-acht-opmaken.docx", &heropend.bron());
    heropend.terug().unwrap();
    assert_eq!(*heropend.bron(), *opgemaakt);
    for _ in 0..8 {
        s.terug().unwrap();
    }
    assert_eq!(*s.bron(), bron);
    assert!(!s.kan_terug());
}

#[test]
fn lege_invoegopmaak_weigert_verkeerde_grenzen_waarden_en_niet_tekstopmaak_zonder_mutatie() {
    let bron = bron_zonder_tekstruns();
    let mut s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    for (begin, einde, stijl) in [
        (1, 1, Opmaak::Vet(true)),
        (1, 0, Opmaak::Cursief(true)),
        (0, 0, Opmaak::Lettergrootte(f64::NAN)),
        (0, 0, Opmaak::Kleur("ongeldig".into())),
        (0, 0, Opmaak::Getal("0.00".into())),
        (0, 0, Opmaak::Tekstterugloop(true)),
    ] {
        assert!(
            s.bewerk(
                0,
                Bewerking::Opmaak {
                    id: id.clone(),
                    begin,
                    einde,
                    stijl
                }
            )
            .is_err()
        );
        assert_eq!(*s.bron(), bron);
        assert!(!s.kan_terug());
    }
    assert!(s.weergave(0).unwrap().velden[0].tekst.is_empty());
}

#[test]
fn lege_invoegopmaak_lettervelden_erven_de_alineastijl_zonder_bronwijziging() {
    let mut delen = ooxml_opc::unzip_parts(&stijlbron()).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/document.xml")
        .unwrap();
    let mut tekst = String::from_utf8(xml.clone()).unwrap();
    let begin = tekst.find("<w:p>").unwrap();
    let eind = begin + tekst[begin..].find("</w:p>").unwrap() + "</w:p>".len();
    tekst.replace_range(
        begin..eind,
        r#"<w:p><w:pPr><w:pStyle w:val="EigenKop"/></w:pPr><w:r><w:rPr><w:i/></w:rPr></w:r></w:p>"#,
    );
    *xml = tekst.into_bytes();
    let bron = ooxml_opc::rezip_parts(&delen).unwrap();
    let s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    assert!(b.velden[0].tekst.is_empty());
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let engine = docx_edit::EngineSession::new(424243);
        docx_edit::seed_from_docx(engine.doc(), &bron).unwrap();
        let mut waarden = vec![];
        for verhaal in engine.doc().list_stories().stories {
            if verhaal.root != "body" {
                continue;
            }
            for segment in engine.doc().story_segments(&verhaal.story).unwrap() {
                if let docx_edit::SegmentContent::Pilcrow(p) = segment.content {
                    waarden.push(serde_json::json!({"id":p.para_id,"eigenschappen":p.values,"attributen":segment.attributes}));
                }
            }
        }
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            std::path::PathBuf::from(map).join("writer-lege-opmaak-engine-alineamarkeringen.json"),
            serde_json::to_vec_pretty(&waarden).unwrap(),
        )
        .unwrap();
    }
    assert_eq!(b.velden[0].opmaak.grootte, Some(18.));
    assert_eq!(b.velden[0].opmaak.lettertype.as_deref(), Some("Inter"));
    assert!(b.velden[0].opmaak.vet && b.velden[0].opmaak.cursief);
    assert_eq!(*s.bron(), bron);
    assert!(!s.kan_terug());
}

#[test]
fn lege_invoegopmaak_lettervelden_cursor_volgt_het_gekozen_lege_letterformaat() {
    let bron = bron_zonder_tekstruns();
    let mut s = Sessie::open(Module::Writer, bron).unwrap();
    let b = s.weergave(0).unwrap();
    let id = b.velden[0].id.clone();
    let oud = b
        .writer_frame
        .unwrap()
        .markering(&id, 0, 0)
        .unwrap()
        .cursor
        .unwrap()
        .hoogte;
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: id.clone(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Lettergrootte(48.),
        },
    )
    .unwrap();
    let b = s.weergave(0).unwrap();
    let nieuw = b
        .writer_frame
        .unwrap()
        .markering(&id, 0, 0)
        .unwrap()
        .cursor
        .unwrap()
        .hoogte;
    assert!(
        nieuw > oud * 2.,
        "De lege cursor volgt 48 punten niet: {oud} -> {nieuw}"
    );
    assert!(b.velden[0].tekst.is_empty());
    assert_eq!(b.velden[0].opmaak.grootte, Some(48.));
    bewaar_lege_opmaak("writer-lege-48-punten.docx", &s.bron());
}

#[test]
fn alineastijl_toepassen_behoudt_directe_opmaak_en_undo_is_bronexact() {
    let bron = stijlbron();
    let mut s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    let v = &b.velden[2];
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: v.id.clone(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Alineastijl("EigenBasis".into()),
        },
    )
    .unwrap();
    let nieuw = s.weergave(0).unwrap();
    assert_eq!(nieuw.velden[2].tekst, v.tekst);
    assert!(!nieuw.velden[2].opmaak.vet);
    assert_eq!(nieuw.velden[2].opmaak.grootte, Some(10.5));
    assert_eq!(nieuw.velden[2].opmaak.lettertype.as_deref(), Some("Inter"));
    let Document::Writer(d) = Document::open(Module::Writer, &s.bron()).unwrap() else {
        unreachable!()
    };
    assert_eq!(
        d.paragraph(&v.id)
            .unwrap()
            .formatting
            .as_ref()
            .unwrap()
            .style_id
            .as_deref(),
        Some("EigenBasis")
    );
    let voor = ooxml_opc::unzip_parts(&bron).unwrap();
    let na = ooxml_opc::unzip_parts(&s.bron()).unwrap();
    for (naam, bytes) in &voor {
        if naam != "word/document.xml" {
            assert_eq!(
                na.iter().find(|(n, _)| n == naam).unwrap().1,
                *bytes,
                "{naam}"
            );
        }
    }
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(
            std::path::PathBuf::from(map).join("writer-alineastijl-direct.docx"),
            s.bron().as_slice(),
        )
        .unwrap();
    }
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron);
    s.vooruit().unwrap();
    assert_eq!(s.weergave(0).unwrap().velden[2].opmaak.grootte, Some(10.5));
}

fn met_extra_stijlen(bron: &[u8], extra: &str) -> Vec<u8> {
    let mut delen = ooxml_opc::unzip_parts(bron).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/styles.xml")
        .unwrap();
    *xml = String::from_utf8(xml.clone())
        .unwrap()
        .replace("</w:styles>", &format!("{extra}</w:styles>"))
        .into_bytes();
    ooxml_opc::rezip_parts(&delen).unwrap()
}

#[test]
fn alineastijl_catalogus_leest_brondefinities_en_weigert_onveilige_ketens_zonder_mutatie() {
    let extra = r#"
<w:style w:type="paragraph" w:styleId="OntbrekendeBasis"><w:basedOn w:val="BestaatNiet"/></w:style>
<w:style w:type="paragraph" w:styleId="KringEen"><w:basedOn w:val="KringTwee"/></w:style>
<w:style w:type="paragraph" w:styleId="KringTwee"><w:basedOn w:val="KringEen"/></w:style>
<w:style w:type="paragraph" w:styleId="Tekenbasis"><w:basedOn w:val="EigenNadruk"/></w:style>
<w:style w:type="paragraph" w:styleId="Dubbel"/><w:style w:type="paragraph" w:styleId="Dubbel"/>
<w:style w:type="paragraph" w:styleId="ErftDubbel"><w:basedOn w:val="Dubbel"/></w:style>
"#;
    let bron = met_extra_stijlen(&stijlbron(), extra);
    let mut s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    let stijl = b
        .writer_stijlen
        .keuzes
        .iter()
        .find(|s| s.id == "EigenKop")
        .unwrap();
    assert_eq!(stijl.naam, "Eigen kop");
    assert_eq!(
        b.writer_stijlen
            .huidig
            .get(&b.velden[0].id)
            .map(String::as_str),
        Some("EigenKop")
    );
    let hash = s.bron_hash().to_owned();
    for id in [
        "BestaatNiet",
        "EigenNadruk",
        "OntbrekendeBasis",
        "KringEen",
        "KringTwee",
        "Tekenbasis",
        "Dubbel",
        "ErftDubbel",
        "",
        "verkeerd\n",
    ] {
        assert!(!b.writer_stijlen.keuzes.iter().any(|s| s.id == id), "{id}");
        assert!(
            s.bewerk(
                0,
                Bewerking::Opmaak {
                    id: b.velden[0].id.clone(),
                    begin: 0,
                    einde: 0,
                    stijl: Opmaak::Alineastijl(id.into())
                }
            )
            .is_err(),
            "{id}"
        );
        assert_eq!(s.bron().as_slice(), bron);
        assert_eq!(s.bron_hash(), hash);
        assert!(!s.kan_terug() && !s.kan_vooruit());
    }
}

#[test]
fn alineastijl_erfenis_werkt_op_lege_alinea_en_in_een_tabel() {
    let bron = met_extra_stijlen(
        include_bytes!("fixtures/writer-structuur.docx"),
        r#"<w:style w:type="paragraph" w:styleId="EigenGroot"><w:name w:val="Eigen groot"/><w:rPr><w:sz w:val="48"/><w:rFonts w:ascii="Inter" w:hAnsi="Inter"/></w:rPr></w:style>"#,
    );
    let mut s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    let rijk = b
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap();
    s.bewerk(
        0,
        Bewerking::Alinea {
            id: rijk.id.clone(),
            actie: office_core::writer::AlineaActie::Splits {
                positie: rijk.tekst.chars().count(),
            },
        },
    )
    .unwrap();
    let gesplitst = s.bron();
    let b = s.weergave(0).unwrap();
    let leeg = &b.velden[b.velden.iter().position(|v| v.id == rijk.id).unwrap() + 1];
    assert!(leeg.tekst.is_empty());
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: leeg.id.clone(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Alineastijl("EigenGroot".into()),
        },
    )
    .unwrap();
    let n = s.weergave(0).unwrap();
    let v = n.velden.iter().find(|v| v.id == leeg.id).unwrap();
    assert_eq!(v.opmaak.grootte, Some(24.));
    assert_eq!(v.opmaak.lettertype.as_deref(), Some("Inter"));
    let leeg_bron = s.bron();
    let opnieuw = Sessie::open(Module::Writer, leeg_bron.as_ref().clone()).unwrap();
    assert_eq!(
        opnieuw
            .weergave(0)
            .unwrap()
            .writer_stijlen
            .huidig
            .get(&leeg.id)
            .map(String::as_str),
        Some("EigenGroot")
    );
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), gesplitst.as_slice());
    let cel = b.velden.iter().find(|v| v.tekst == "Cel één").unwrap();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: cel.id.clone(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Alineastijl("EigenGroot".into()),
        },
    )
    .unwrap();
    let n = s.weergave(0).unwrap();
    assert_eq!(
        n.writer_stijlen.huidig.get(&cel.id).map(String::as_str),
        Some("EigenGroot")
    );
    assert_eq!(
        n.velden
            .iter()
            .find(|v| v.id == cel.id)
            .unwrap()
            .opmaak
            .grootte,
        Some(24.)
    );
    assert_eq!(
        n.velden.iter().find(|v| v.id == rijk.id).unwrap().tekst,
        rijk.tekst
    );
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), gesplitst.as_slice());
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), bron);
}

#[test]
fn alineastijl_gelezen_standaardstijl_en_ontbrekende_keuze_worden_niet_verzonnen() {
    let s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let b = s.weergave(0).unwrap();
    assert!(b.writer_stijlen.keuzes.iter().any(|s| s.id == "Normal"));
    assert_eq!(
        b.writer_stijlen
            .huidig
            .get(&b.velden[1].id)
            .map(String::as_str),
        Some("Normal")
    );
    assert_eq!(s.bron().as_slice(), BRON);
    assert!(!s.kan_terug());
    let zonder = met_extra_stijlen(BRON, "");
    let mut delen = ooxml_opc::unzip_parts(&zonder).unwrap();
    delen.retain(|(n, _)| n != "word/styles.xml");
    let bron = ooxml_opc::rezip_parts(&delen).unwrap();
    let s = Sessie::open(Module::Writer, bron.clone()).unwrap();
    let b = s.weergave(0).unwrap();
    assert!(b.writer_stijlen.keuzes.is_empty());
    assert!(!b.writer_stijlen.huidig.contains_key(&b.velden[1].id));
    assert_eq!(s.bron().as_slice(), bron);
}
