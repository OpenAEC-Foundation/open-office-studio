use betteroffice_docx as docx;
use office_core::document;
use office_core::writer_pagina::{PaginaActie as A, Papier, pagina};
const BRON: &[u8] = include_bytes!("fixtures/writer-structuur.docx");
fn open() -> Box<office_core::writer_document::WriterDocument> {
    match document::Document::open(document::Module::Writer, BRON).unwrap() {
        document::Document::Writer(d) => d,
        _ => unreachable!(),
    }
}
fn id(d: &docx::Document, tekst: &str) -> String {
    d.paragraphs()
        .into_iter()
        .find(|p| docx::get_paragraph_text(p) == tekst)
        .unwrap()
        .para_id
        .clone()
        .unwrap()
}
#[test]
fn papier_en_afdrukstand_veranderen_alleen_de_gekozen_sectie() {
    let mut d = open();
    let sleutel = id(&d, "Links 🏠 café rechts");
    let laatste = d.body().final_section_properties.clone();
    pagina(&mut d, &sleutel, A::Papier(Papier::A4)).unwrap();
    pagina(&mut d, &sleutel, A::Liggend(true)).unwrap();
    let n = docx::Document::open(&d.save().unwrap()).unwrap();
    let s = &n.sections()[0].properties;
    assert_eq!(
        (s.page_width, s.page_height, s.orientation.as_deref()),
        (Some(16838.), Some(11906.), Some("landscape"))
    );
    assert_eq!(n.body().final_section_properties, laatste);
    assert_eq!(n.sections()[0].properties, d.sections()[0].properties);
}
#[test]
fn marges_en_kolommen_houden_verwijzingen_en_andere_sectie_intact() {
    let mut d = open();
    let sleutel = id(&d, "Andere sectie");
    let eerste = d.sections()[0].clone();
    let laatste = d.body().final_section_properties.clone().unwrap();
    pagina(
        &mut d,
        &sleutel,
        A::Marges {
            boven: 720.,
            onder: 720.,
            links: 720.,
            rechts: 720.,
        },
    )
    .unwrap();
    pagina(
        &mut d,
        &sleutel,
        A::Kolommen {
            aantal: 2,
            tussenruimte: 360.,
            lijn: true,
        },
    )
    .unwrap();
    let n = docx::Document::open(&d.save().unwrap()).unwrap();
    let s = n.body().final_section_properties.as_ref().unwrap();
    assert_eq!(
        (s.margin_top, s.margin_bottom, s.margin_left, s.margin_right),
        (Some(720.), Some(720.), Some(720.), Some(720.))
    );
    assert_eq!(
        (s.column_count, s.column_space, s.equal_width, s.separator),
        (Some(2.), Some(360.), Some(true), Some(true))
    );
    assert_eq!(s.header_references, laatste.header_references);
    assert_eq!(s.footer_references, laatste.footer_references);
    assert_eq!(n.sections()[0].properties, eerste.properties);
}
#[test]
fn ongeldige_invoer_wijzigt_niets() {
    let mut d = open();
    let sleutel = id(&d, "Andere sectie");
    let bron = d.save().unwrap();
    for a in [
        A::Kolommen {
            aantal: 0,
            tussenruimte: 360.,
            lijn: false,
        },
        A::Kolommen {
            aantal: 4,
            tussenruimte: 360.,
            lijn: false,
        },
        A::Kolommen {
            aantal: 3,
            tussenruimte: 14400.,
            lijn: false,
        },
        A::Marges {
            boven: f64::NAN,
            onder: 0.,
            links: 0.,
            rechts: 0.,
        },
        A::Marges {
            boven: 0.,
            onder: 0.,
            links: 0.,
            rechts: 32000.,
        },
    ] {
        assert!(pagina(&mut d, &sleutel, a).is_err());
        assert_eq!(d.save().unwrap(), bron);
    }
    assert!(pagina(&mut d, "ontbrekend", A::Papier(Papier::A5)).is_err());
    assert_eq!(d.save().unwrap(), bron);
}

#[test]
fn alle_papierformaten_houden_de_afdrukstand_en_staan_weer_omkeerbaar() {
    for (papier, w, h) in [
        (Papier::A3, 16838., 23811.),
        (Papier::A4, 11906., 16838.),
        (Papier::A5, 8391., 11906.),
        (Papier::Letter, 12240., 15840.),
        (Papier::Legal, 12240., 20160.),
    ] {
        let mut d = open();
        let sleutel = id(&d, "Andere sectie");
        pagina(&mut d, &sleutel, A::Liggend(true)).unwrap();
        pagina(&mut d, &sleutel, A::Papier(papier)).unwrap();
        let s = d.body().final_section_properties.as_ref().unwrap();
        assert_eq!((s.page_width, s.page_height), (Some(h), Some(w)));
        pagina(&mut d, &sleutel, A::Liggend(false)).unwrap();
        let n = docx::Document::open(&d.save().unwrap()).unwrap();
        let s = n.body().final_section_properties.as_ref().unwrap();
        assert_eq!((s.page_width, s.page_height), (Some(w), Some(h)));
    }
    assert_eq!(Papier::ALLE.len(), 5);
}

#[test]
fn sectie_einde_hoort_bij_de_voorgaande_sectie() {
    let mut d = open();
    let sleutel = d
        .body()
        .content
        .iter()
        .find_map(|b| match b {
            docx::BlockContent::Paragraph(p) if p.section_properties.is_some() => p.para_id.clone(),
            _ => None,
        })
        .unwrap();
    let laatste = d.body().final_section_properties.clone();
    pagina(&mut d, &sleutel, A::Papier(Papier::A3)).unwrap();
    let n = docx::Document::open(&d.save().unwrap()).unwrap();
    assert_eq!(n.sections()[0].properties.page_width, Some(16838.));
    assert_eq!(n.body().final_section_properties, laatste);
}
#[test]
fn wijzigingen_bijhouden_worden_niet_onzichtbaar_omzeild() {
    let mut d = open();
    let sleutel = id(&d, "Andere sectie");
    d.model_mut().settings.track_revisions = Some(true);
    let bron = d.save().unwrap();
    assert!(pagina(&mut d, &sleutel, A::Liggend(true)).is_err());
    assert_eq!(d.save().unwrap(), bron);
}

#[test]
fn vergrendelde_inhoudsbesturing_wordt_niet_via_paginaomweg_gewijzigd() {
    let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/document.xml")
        .unwrap();
    let tekst = String::from_utf8(xml.clone()).unwrap();
    let begin = tekst.find("<w:body>").unwrap() + "<w:body>".len();
    let eind = begin + tekst[begin..].find("</w:p>").unwrap() + "</w:p>".len();
    *xml=format!("{}<w:sdt><w:sdtPr><w:lock w:val=\"sdtContentLocked\"/></w:sdtPr><w:sdtContent>{}</w:sdtContent></w:sdt>{}",&tekst[..begin],&tekst[begin..eind],&tekst[eind..]).into_bytes();
    let bron = ooxml_opc::rezip_parts(&delen).unwrap();
    let document::Document::Writer(mut d) =
        document::Document::open(document::Module::Writer, &bron).unwrap()
    else {
        unreachable!()
    };
    let sleutel = id(&d, "Voor de rijke alinea");
    let bron = d.save().unwrap();
    let e = pagina(&mut d, &sleutel, A::Liggend(true)).unwrap_err();
    assert!(e.to_string().contains("inhoudsbesturing"));
    assert_eq!(d.save().unwrap(), bron);
}

#[test]
fn sessie_pagina_bewaart_en_herstelt_via_echte_paginering() {
    use document::{Bewerking, Module, Sessie};
    let mut s = Sessie::open(Module::Writer, BRON.to_vec()).unwrap();
    let sleutel = s
        .weergave(0)
        .unwrap()
        .velden
        .iter()
        .find(|v| v.tekst == "Links 🏠 café rechts")
        .unwrap()
        .id
        .clone();
    for actie in [A::Papier(Papier::A4), A::Liggend(true)] {
        s.bewerk(
            0,
            Bewerking::Pagina {
                id: sleutel.clone(),
                actie,
            },
        )
        .unwrap();
    }
    let beeld = s.weergave(0).unwrap();
    assert!((beeld.pagina.breedte - 16838. / 15.).abs() < 0.1);
    assert!((beeld.pagina.hoogte - 11906. / 15.).abs() < 0.1);
    let bewaard = s.bron();
    if let Some(map) = std::env::var_os("OFFICE_TEST_UITVOER") {
        let map = std::path::PathBuf::from(map);
        std::fs::create_dir_all(&map).unwrap();
        std::fs::write(map.join("writer-pagina.docx"), &*bewaard).unwrap();
    }
    s.terug().unwrap();
    s.terug().unwrap();
    assert_eq!(s.bron().as_slice(), BRON);
    s.vooruit().unwrap();
    s.vooruit().unwrap();
    assert_eq!(s.bron().as_slice(), bewaard.as_slice());
}

#[test]
fn sectierevisie_en_documentbeveiliging_blijven_in_de_oorspronkelijke_bron() {
    for soort in 0..3 {
        let beveiliging = soort != 0;
        let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
        let onderdeel = if beveiliging {
            "word/settings.xml"
        } else {
            "word/document.xml"
        };
        let (_, bytes) = delen.iter_mut().find(|(n, _)| n == onderdeel).unwrap();
        let xml = String::from_utf8(bytes.clone()).unwrap();
        *bytes = if soort == 2 {
            xml.replace("</w:settings>", "<p:documentProtection xmlns:p=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" p:edit=\"readOnly\" p:enforcement=\"true\"/></w:settings>").into_bytes()
        } else if beveiliging {
            xml.replace(
                "</w:settings>",
                "<w:documentProtection w:edit=\"readOnly\" w:enforcement=\"1\"/></w:settings>",
            )
            .into_bytes()
        } else {
            let einde = xml.find("</w:sectPr>").unwrap();
            format!("{}<w:sectPrChange w:id=\"1\" w:author=\"OpenAEC\" w:date=\"2026-10-31T00:00:00Z\"><w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/></w:sectPr></w:sectPrChange>{}",&xml[..einde],&xml[einde..]).into_bytes()
        };
        let bron = ooxml_opc::rezip_parts(&delen).unwrap();
        let mut s = document::Sessie::open(document::Module::Writer, bron.clone()).unwrap();
        let sleutel = s.weergave(0).unwrap().velden[0].id.clone();
        let e = s
            .bewerk(
                0,
                document::Bewerking::Pagina {
                    id: sleutel,
                    actie: A::Liggend(true),
                },
            )
            .unwrap_err();
        assert!(
            e.to_string().contains(if beveiliging {
                "documentbeveiliging"
            } else {
                "sectierevisies"
            }),
            "{e}"
        );
        assert_eq!(s.bron().as_slice(), bron.as_slice());
        assert!(!s.kan_terug());
    }
}
