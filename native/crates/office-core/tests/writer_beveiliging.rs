use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    opmaak::Opmaak,
    writer::AlineaActie,
    writer_pagina::PaginaActie,
};
const BRON: &[u8] = include_bytes!("fixtures/writer.docx");
fn bron(kenmerken: &str) -> Vec<u8> {
    let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
    let (_, xml) = delen
        .iter_mut()
        .find(|(n, _)| n == "word/settings.xml")
        .unwrap();
    let tekst = String::from_utf8(xml.clone()).unwrap();
    *xml = tekst
        .replace(
            "</w:settings>",
            &format!("<w:documentProtection w:edit=\"readOnly\" {kenmerken}/></w:settings>"),
        )
        .into_bytes();
    ooxml_opc::rezip_parts(&delen).unwrap()
}
fn opdrachten(id: &str) -> Vec<Bewerking> {
    vec![
        Bewerking::TekstReeksen(vec![]),
        Bewerking::TekstReeks {
            id: id.into(),
            bron: "".into(),
            tekst: "".into(),
            stappen: vec![],
        },
        Bewerking::Tekst {
            id: id.into(),
            tekst: "Een eigen gewijzigde alinea.".into(),
        },
        Bewerking::Opmaak {
            id: id.into(),
            begin: 0,
            einde: 1,
            stijl: Opmaak::Vet(false),
        },
        Bewerking::Alinea {
            id: id.into(),
            actie: AlineaActie::Splits { positie: 1 },
        },
        Bewerking::Pagina {
            id: id.into(),
            actie: PaginaActie::Liggend(true),
        },
    ]
}
#[test]
fn actieve_beveiliging_blokkeert_alle_writeropdrachten_in_de_document_api() {
    for attrs in [
        "w:enforcement=\"1\"",
        "w:enforcement=\"true\"",
        "w:enforcement=\"on\"",
        "w:enforcement=\"onbekend\"",
        "xmlns:p=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" p:enforcement=\"1\"",
        "xmlns:p=\"urn:eigen-test\" w:enforcement=\"false\" p:enforcement=\"1\"",
    ] {
        let bytes = bron(attrs);
        let mut d = Document::open(Module::Writer, &bytes).unwrap();
        let beeld = d.weergave(0).unwrap();
        let id = beeld.velden[0].id.clone();
        assert!(
            beeld
                .bewerkingsbeperking
                .as_deref()
                .unwrap()
                .contains("documentbeveiliging")
        );
        assert!(beeld.velden.iter().all(|v| !v.bewerkbaar));
        let voor = d.bytes().unwrap();
        for opdracht in opdrachten(&id) {
            assert!(d.bewerk(0, opdracht).is_err());
            assert_eq!(d.bytes().unwrap(), voor);
        }
    }
}
#[test]
fn geweigerde_sessieopdrachten_houden_exact_de_bron_en_geschiedenis() {
    let bytes = bron("w:enforcement=\"1\"");
    let mut s = Sessie::open(Module::Writer, bytes.clone()).unwrap();
    let id = s.weergave(0).unwrap().velden[0].id.clone();
    let hash = s.bron_hash().to_owned();
    for opdracht in opdrachten(&id) {
        assert!(s.bewerk(0, opdracht).is_err());
        assert_eq!(s.bron().as_slice(), bytes);
        assert_eq!(s.bron_hash(), hash);
        assert!(!s.kan_terug());
        assert!(!s.kan_vooruit());
        assert!(s.weergave(0).unwrap().velden.iter().all(|v| !v.bewerkbaar));
    }
}
#[test]
fn niet_afgedwongen_beveiliging_blijft_bewerkbaar_en_behoudt_de_instelling() {
    for attrs in [
        "",
        "w:enforcement=\"0\"",
        "w:enforcement=\"false\"",
        "w:enforcement=\"off\"",
    ] {
        let bytes = bron(attrs);
        let mut s = Sessie::open(Module::Writer, bytes.clone()).unwrap();
        let b = s.weergave(0).unwrap();
        assert!(b.bewerkingsbeperking.is_none());
        let id = b.velden[0].id.clone();
        s.bewerk(
            0,
            Bewerking::Tekst {
                id,
                tekst: "Een nieuwe eigen alinea.".into(),
            },
        )
        .unwrap();
        assert!(s.kan_terug());
        let oud = ooxml_opc::unzip_parts(&bytes).unwrap();
        let nieuw = ooxml_opc::unzip_parts(&s.bron()).unwrap();
        assert_eq!(
            oud.iter()
                .find(|(n, _)| n == "word/settings.xml")
                .unwrap()
                .1,
            nieuw
                .iter()
                .find(|(n, _)| n == "word/settings.xml")
                .unwrap()
                .1
        );
        s.terug().unwrap();
        assert_eq!(s.bron().as_slice(), bytes);
    }
}

#[test]
fn geldige_gezamenlijke_vervanging_wordt_bij_bronbeveiliging_geweigerd() {
    let bytes = bron("w:enforcement=\"1\"");
    let mut d = Document::open(Module::Writer, &bytes).unwrap();
    let b = d.weergave(0).unwrap();
    let v = b.velden.iter().find(|v| !v.tekst.is_empty()).unwrap();
    let voor = d.bytes().unwrap();
    let tekst = format!("{}!", v.tekst);
    let reeks = office_core::document::TekstReeks {
        id: v.id.clone(),
        bron: v.tekst.clone(),
        tekst,
        stappen: vec![office_core::document::TekstStap {
            begin: v.tekst.chars().count(),
            einde: v.tekst.chars().count(),
            verwacht: String::new(),
            tekst: "!".into(),
        }],
    };
    assert!(
        d.bewerk(0, Bewerking::TekstReeksen(vec![reeks]))
            .unwrap_err()
            .to_string()
            .contains("documentbeveiliging")
    );
    assert_eq!(d.bytes().unwrap(), voor);
}
#[test]
fn bijhouden_en_inhoudssloten_worden_niet_stil_genegeerd() {
    for (deel, xml, vergrendeld, reden) in [
        (
            "word/settings.xml",
            "<w:trackRevisions/>",
            true,
            "wijzigingen bijhouden",
        ),
        (
            "word/settings.xml",
            "<w:trackRevisions w:val=\"true\"/>",
            true,
            "wijzigingen bijhouden",
        ),
        (
            "word/settings.xml",
            "<w:trackRevisions w:val=\"onbekend\"/>",
            true,
            "wijzigingen bijhouden",
        ),
        (
            "word/settings.xml",
            "<w:trackRevisions w:val=\"false\"/>",
            false,
            "",
        ),
        (
            "word/document.xml",
            "<w:sdt><w:sdtPr><w:lock w:val=\"contentLocked\"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Eigen inhoud</w:t></w:r></w:p></w:sdtContent></w:sdt>",
            true,
            "inhoudsbesturing",
        ),
        (
            "word/document.xml",
            "<w:sdt><w:sdtPr><w:lock w:val=\"onbekend\"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Eigen inhoud</w:t></w:r></w:p></w:sdtContent></w:sdt>",
            true,
            "inhoudsbesturing",
        ),
    ] {
        let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
        let (_, bytes) = delen.iter_mut().find(|(n, _)| n == deel).unwrap();
        let s = String::from_utf8(bytes.clone()).unwrap();
        let eind = if deel.ends_with("settings.xml") {
            "</w:settings>"
        } else {
            "<w:sectPr"
        };
        assert!(s.contains(eind));
        *bytes = s.replacen(eind, &format!("{xml}{eind}"), 1).into_bytes();
        let bron = ooxml_opc::rezip_parts(&delen).unwrap();
        let mut d = Document::open(Module::Writer, &bron).unwrap();
        let b = d.weergave(0).unwrap();
        assert_eq!(b.bewerkingsbeperking.is_some(), vergrendeld);
        if vergrendeld {
            assert!(b.bewerkingsbeperking.unwrap().contains(reden));
            assert!(b.velden.iter().all(|v| !v.bewerkbaar));
            let voor = d.bytes().unwrap();
            assert!(
                d.bewerk(
                    0,
                    Bewerking::Tekst {
                        id: b.velden[0].id.clone(),
                        tekst: "Andere eigen tekst".into()
                    }
                )
                .is_err()
            );
            assert_eq!(d.bytes().unwrap(), voor);
        }
    }
}
