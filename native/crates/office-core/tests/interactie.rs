use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    opmaak::{Opmaak, Uitlijning},
    rekenblad::Structuur,
};
fn bewaar(naam: &str, bytes: &[u8]) {
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(map.join(naam), bytes).unwrap();
    }
}
#[test]
fn writer_selectieopmaak_behoudt_tekst_en_andere_runs() {
    let mut d = Document::open(Module::Writer, include_bytes!("fixtures/writer.docx")).unwrap();
    let b = d.weergave(0).unwrap();
    let v = b
        .velden
        .iter()
        .find(|v| v.tekst == "Behoud deze cursieve tekst.")
        .unwrap();
    let id = v.id.clone();
    let tekst = v.tekst.clone();
    d.bewerk(
        0,
        Bewerking::Opmaak {
            id: id.clone(),
            begin: 7,
            einde: 11,
            stijl: Opmaak::Onderstrepen(true),
        },
    )
    .unwrap();
    d.bewerk(
        0,
        Bewerking::Opmaak {
            id: id.clone(),
            begin: 0,
            einde: tekst.chars().count(),
            stijl: Opmaak::Uitlijning(Uitlijning::Midden),
        },
    )
    .unwrap();
    let bytes = d.bytes().unwrap();
    bewaar("writer-opmaak.docx", &bytes);
    let Document::Writer(herlezen) = Document::open(Module::Writer, &bytes).unwrap() else {
        panic!()
    };
    let p = herlezen.paragraph(&id).unwrap();
    assert_eq!(betteroffice_docx::get_paragraph_text(p), tekst);
    assert_eq!(
        p.formatting.as_ref().unwrap().alignment.as_deref(),
        Some("center")
    );
    let eerste = &p.content[0];
    let betteroffice_docx::ParagraphContent::Inline(betteroffice_docx::InlineNode::Run(run)) =
        eerste
    else {
        panic!()
    };
    assert_eq!(run.formatting.as_ref().unwrap().bold, Some(true));
}
#[test]
fn writer_ongeldige_opmaak_is_transactioneel() {
    let mut s = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer.docx").to_vec(),
    )
    .unwrap();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    let oud = s.bron();
    for (begin, einde, stijl) in [
        (0, 1, Opmaak::Lettergrootte(f64::NAN)),
        (100_000, 100_001, Opmaak::Vet(true)),
        (0, 1, Opmaak::Kleur("#ongeldig".into())),
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
        assert_eq!(*s.bron(), *oud);
        assert!(!s.kan_terug());
    }
    assert!(s.weergave(0).is_ok());
}
#[test]
fn writer_paginageometrie_verwijst_naar_bestaande_alineas() {
    let d = Document::open(Module::Writer, include_bytes!("fixtures/writer.docx")).unwrap();
    let b = d.weergave(0).unwrap();
    assert!(b.pagina.breedte > 500. && b.pagina.hoogte > 500.);
    assert!(!b.pagina.vlakken.is_empty());
    for vlak in &b.pagina.vlakken {
        assert!(b.velden.iter().any(|v| v.id == vlak.id));
        let g = vlak.grens;
        assert!(
            b.pagina
                .raak(g.x + g.breedte / 2., g.y + g.hoogte / 2.)
                .is_some()
        );
    }
}
#[test]
fn rekenblad_naar_ver_adres_bewerken_undo_en_opnieuw_openen() {
    let mut s = Sessie::open(
        Module::Spreadsheet,
        include_bytes!("fixtures/spreadsheet.xlsx").to_vec(),
    )
    .unwrap();
    let bron = s.bron();
    let b = s.naar_cel(0, "AZ1000").unwrap();
    assert!(b.velden.iter().any(|v| v.id == "AZ1000"));
    assert_eq!(*s.bron(), *bron);
    assert!(!s.kan_terug());
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "AZ1000".into(),
            tekst: "=SUM(B2:C2)".into(),
        },
    )
    .unwrap();
    assert_eq!(
        s.weergave(0)
            .unwrap()
            .velden
            .iter()
            .find(|v| v.id == "AZ1000")
            .unwrap()
            .tekst,
        "=SUM(B2:C2)"
    );
    let bewerkt = s.bron();
    s.terug().unwrap();
    assert_eq!(*s.bron(), *bron);
    s.vooruit().unwrap();
    assert_eq!(*s.bron(), *bewerkt);
    assert!(s.naar_cel(0, "XFE1").is_err());
    assert!(s.naar_cel(0, "A1048577").is_err());
    assert_eq!(*s.bron(), *bewerkt);
    assert!(
        s.weergave(0)
            .unwrap()
            .velden
            .iter()
            .any(|v| v.id == "AZ1000")
    );
}
#[test]
fn rekenblad_opmaak_en_structuur_bewaren_formules() {
    let mut s = Sessie::open(
        Module::Spreadsheet,
        include_bytes!("fixtures/spreadsheet.xlsx").to_vec(),
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: "B2:C3".into(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Vet(true),
        },
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: "B2:C3".into(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Achtergrond("#FFF2CC".into()),
        },
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Structuur {
            adres: "A2".into(),
            actie: Structuur::RijInvoegen,
        },
    )
    .unwrap();
    bewaar("spreadsheet-structuur.xlsx", &s.bron());
    let Document::Spreadsheet(d) = Document::open(Module::Spreadsheet, &s.bron()).unwrap() else {
        panic!()
    };
    assert_eq!(
        d.cell(
            betteroffice_xlsx::SheetId(0),
            betteroffice_xlsx::CellRef::new(2, 3)
        )
        .unwrap()
        .input,
        "=B3*C3"
    );
    let formaat = d
        .selection_formatting(
            betteroffice_xlsx::SheetId(0),
            betteroffice_xlsx::CellRange::parse_a1("B3:C4").unwrap(),
        )
        .unwrap();
    assert_eq!(formaat.bold, Some(true));
    assert_eq!(formaat.fill_color.as_deref(), Some("#fff2cc"));
}
#[test]
fn rekenblad_samenvoeging_klikt_naar_ankercel() {
    let mut s = Sessie::nieuw(Module::Spreadsheet).unwrap();
    s.bewerk(
        0,
        Bewerking::Structuur {
            adres: "B2:D3".into(),
            actie: Structuur::Samenvoegen,
        },
    )
    .unwrap();
    let b = s.weergave(0).unwrap();
    let cel = b.pagina.vlakken.iter().find(|v| v.id == "B2").unwrap();
    let g = cel.grens;
    assert_eq!(
        b.pagina.raak(g.x + g.breedte - 1., g.y + g.hoogte - 1.),
        Some("B2")
    );
    assert!(!b.pagina.vlakken.iter().any(|v| v.id == "C2"));
    s.bewerk(
        0,
        Bewerking::Structuur {
            adres: "B2:D3".into(),
            actie: Structuur::Splitsen,
        },
    )
    .unwrap();
    assert!(
        s.weergave(0)
            .unwrap()
            .pagina
            .vlakken
            .iter()
            .any(|v| v.id == "C2")
    );
}

#[test]
fn writer_puntgrootte_wordt_als_halve_punten_opgeslagen() {
    let mut s = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer.docx").to_vec(),
    )
    .unwrap();
    let v = s
        .weergave(0)
        .unwrap()
        .velden
        .iter()
        .find(|v| v.tekst == "Bewerkbare oorspronkelijke alinea.")
        .unwrap()
        .clone();
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: v.id.clone(),
            begin: 0,
            einde: v.tekst.chars().count(),
            stijl: Opmaak::Lettergrootte(10.5),
        },
    )
    .unwrap();
    let Document::Writer(d) = Document::open(Module::Writer, &s.bron()).unwrap() else {
        panic!()
    };
    let betteroffice_docx::ParagraphContent::Inline(betteroffice_docx::InlineNode::Run(run)) =
        &d.paragraph(&v.id).unwrap().content[0]
    else {
        panic!()
    };
    assert_eq!(run.formatting.as_ref().unwrap().font_size, Some(21.));
    assert_eq!(
        s.weergave(0)
            .unwrap()
            .velden
            .iter()
            .find(|f| f.id == v.id)
            .unwrap()
            .opmaak
            .grootte,
        Some(10.5)
    );
    bewaar("writer-lettergrootte.docx", &s.bron());
}

#[test]
fn dubbele_alinea_ids_mogen_nooit_een_andere_alinea_wijzigen() {
    let mut s = Sessie::open(
        Module::Writer,
        include_bytes!("fixtures/writer-dubbele-ids.docx").to_vec(),
    )
    .unwrap();
    let b = s.weergave(0).unwrap();
    let doel = b
        .velden
        .iter()
        .find(|v| v.tekst == "Bewerkbare oorspronkelijke alinea.")
        .unwrap()
        .id
        .clone();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: doel,
            tekst: "Alleen deze alinea wijzigt.".into(),
        },
    )
    .unwrap();
    let b = s.weergave(0).unwrap();
    assert!(
        b.velden
            .iter()
            .any(|v| v.tekst == "Native documentcontrole")
    );
    assert_eq!(
        b.velden
            .iter()
            .filter(|v| v.tekst == "Alleen deze alinea wijzigt.")
            .count(),
        1
    );
    bewaar("writer-dubbele-ids.docx", &s.bron());
}

#[test]
fn lettercache_blijft_correct_na_een_ander_document_en_externe_wisactie() {
    let a = Document::open(Module::Writer, include_bytes!("fixtures/writer.docx")).unwrap();
    let beeld = a.weergave(0).unwrap().afbeelding.unwrap();
    assert_eq!(a.weergave(0).unwrap().afbeelding.unwrap(), beeld);
    let mut b = Document::open(Module::Writer, include_bytes!("fixtures/writer.docx")).unwrap();
    let v = b
        .weergave(0)
        .unwrap()
        .velden
        .iter()
        .find(|v| v.tekst == "Bewerkbare oorspronkelijke alinea.")
        .unwrap()
        .clone();
    b.bewerk(
        0,
        Bewerking::Opmaak {
            id: v.id,
            begin: 0,
            einde: v.tekst.chars().count(),
            stijl: Opmaak::Lettertype("Gelasio".into()),
        },
    )
    .unwrap();
    assert_ne!(b.weergave(0).unwrap().afbeelding.unwrap(), beeld);
    assert_eq!(a.weergave(0).unwrap().afbeelding.unwrap(), beeld);
    docx_layout::clear_measure_fonts();
    assert_eq!(a.weergave(0).unwrap().afbeelding.unwrap(), beeld);
}

#[test]
fn samengevoegde_cel_buiten_werkvenster_blijft_aanklikbaar_en_bewerkbaar() {
    let mut s = Sessie::nieuw(Module::Spreadsheet).unwrap();
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "A1".into(),
            tekst: "Ankertekst".into(),
        },
    )
    .unwrap();
    s.bewerk(
        0,
        Bewerking::Structuur {
            adres: "A1:Z150".into(),
            actie: Structuur::Samenvoegen,
        },
    )
    .unwrap();
    let bron = s.bron();
    let beeld = s.naar_cel(0, "H100").unwrap();
    assert_eq!(*s.bron(), *bron);
    assert_eq!(beeld.voorkeursveld.as_deref(), Some("A1"));
    assert_eq!(beeld.velden.len(), 1);
    assert_eq!(beeld.velden[0].id, "A1");
    assert_eq!(beeld.velden[0].tekst, "Ankertekst");
    assert_eq!(beeld.pagina.vlakken.len(), 1);
    assert_eq!(
        beeld
            .pagina
            .raak(beeld.pagina.breedte / 2., beeld.pagina.hoogte / 2.),
        Some("A1")
    );
    s.bewerk(
        0,
        Bewerking::Tekst {
            id: "H100".into(),
            tekst: "Gewijzigd via gedekt adres".into(),
        },
    )
    .unwrap();
    let Document::Spreadsheet(d) = Document::open(Module::Spreadsheet, &s.bron()).unwrap() else {
        panic!()
    };
    assert_eq!(
        d.cell(
            betteroffice_xlsx::SheetId(0),
            betteroffice_xlsx::CellRef::parse_a1("A1").unwrap()
        )
        .unwrap()
        .input,
        "Gewijzigd via gedekt adres"
    );
    bewaar("spreadsheet-anker.xlsx", &s.bron());
    s.terug().unwrap();
    assert_eq!(*s.bron(), *bron);
    assert_eq!(s.weergave(0).unwrap().velden[0].tekst, "Ankertekst");
}
