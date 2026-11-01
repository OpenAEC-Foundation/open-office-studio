use office_core::{
    document::{Bewerking, Document, Module, Sessie},
    opmaak::Opmaak,
    rekenblad::Structuur,
};
const BRON: &[u8] = include_bytes!("fixtures/spreadsheet.xlsx");
fn beveiliging(onderdeel: &str, kenmerk: &str) -> Vec<u8> {
    let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
    let (_, xml) = delen.iter_mut().find(|(n, _)| n == onderdeel).unwrap();
    let tekst = String::from_utf8(xml.clone()).unwrap();
    *xml = if onderdeel == "xl/workbook.xml" {
        if tekst.contains("<workbookProtection/>") {
            tekst.replace(
                "<workbookProtection/>",
                &format!("<workbookProtection {kenmerk}/>"),
            )
        } else {
            tekst.replace(
                "<bookViews>",
                &format!("<workbookProtection {kenmerk}/><bookViews>"),
            )
        }
    } else {
        tekst.replace(
            "</sheetData>",
            &format!("</sheetData><sheetProtection {kenmerk}/>"),
        )
    }
    .into_bytes();
    ooxml_opc::rezip_parts(&delen).unwrap()
}
fn opdrachten() -> Vec<Bewerking> {
    vec![
        Bewerking::CelTekst {
            adres: "B2".into(),
            tekst: office_core::celtekst::CelTekst::lees("7\t8\n9\t10").unwrap(),
        },
        Bewerking::Tekst {
            id: "B2".into(),
            tekst: "7".into(),
        },
        Bewerking::Opmaak {
            id: "A1:D4".into(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Vet(true),
        },
        Bewerking::Structuur {
            adres: "B2".into(),
            actie: Structuur::RijInvoegen,
        },
        Bewerking::Structuur {
            adres: "B2:C3".into(),
            actie: Structuur::Samenvoegen,
        },
        Bewerking::Structuur {
            adres: "A1".into(),
            actie: Structuur::BladToevoegen("Eigen blad".into()),
        },
    ]
}
#[test]
fn bladbeveiliging_actief_onbekend_en_werkmapblokkade_weigeren_elke_documentopdracht() {
    for (part, attrs) in [
        ("xl/worksheets/sheet1.xml", "sheet=\"1\""),
        ("xl/worksheets/sheet2.xml", "sheet=\"true\""),
        ("xl/worksheets/sheet1.xml", "sheet=\"onbekend\""),
        ("xl/worksheets/sheet1.xml", "objects=\"1\""),
        (
            "xl/worksheets/sheet1.xml",
            "sheet=\"false\" xmlns:p=\"urn:eigen\" p:sheet=\"true\"",
        ),
        ("xl/workbook.xml", "lockStructure=\"1\""),
        ("xl/workbook.xml", "lockWindows=\"onbekend\""),
    ] {
        let bytes = beveiliging(part, attrs);
        let mut d = Document::open(Module::Spreadsheet, &bytes).unwrap();
        let voor = d.bytes().unwrap();
        for n in [0, 1] {
            let b = d.weergave(n).unwrap();
            assert!(
                b.bewerkingsbeperking
                    .as_ref()
                    .unwrap()
                    .contains("Alleen lezen")
            );
            assert!(b.velden.iter().all(|v| !v.bewerkbaar));
        }
        for b in opdrachten() {
            assert!(d.bewerk(0, b).is_err(), "{part}: {attrs}");
            assert_eq!(d.bytes().unwrap(), voor);
        }
    }
}
#[test]
fn bladbeveiliging_sessie_houdt_bron_geschiedenis_en_navigatie_intact() {
    let bytes = include_bytes!("fixtures/spreadsheet-beveiligd.xlsx").to_vec();
    let mut s = Sessie::open(Module::Spreadsheet, bytes.clone()).unwrap();
    let hash = s.bron_hash().to_owned();
    for b in opdrachten() {
        assert!(s.bewerk(0, b).is_err());
        assert_eq!(*s.bron(), bytes);
        assert_eq!(s.bron_hash(), hash);
        assert!(!s.kan_terug() && !s.kan_vooruit());
    }
    let (b, selectie) = s.selecteer_cellen(0, "X59", "Y61", None).unwrap();
    assert_eq!(selectie.adres, "X59:Y61");
    assert!(b.velden.iter().all(|v| !v.bewerkbaar));
    assert_eq!(*s.bron(), bytes);
    assert!(s.weergave(1).unwrap().bewerkingsbeperking.is_some());
}
#[test]
fn bladbeveiliging_inactief_ongebruikte_delen_en_afwijkende_relatiedoelen_worden_juist_gelezen() {
    for attrs in ["sheet=\"0\"", "sheet=\"false\""] {
        let bytes = beveiliging("xl/worksheets/sheet1.xml", attrs);
        let mut s = Sessie::open(Module::Spreadsheet, bytes.clone()).unwrap();
        assert!(s.weergave(0).unwrap().bewerkingsbeperking.is_none());
        s.bewerk(0, opdrachten().remove(0)).unwrap();
        s.terug().unwrap();
        assert_eq!(*s.bron(), bytes);
    }
    for doel in ["/afwijkend/blad.xml", "../afwijkend/./blad.xml"] {
        let b = beveiliging("xl/worksheets/sheet1.xml", "sheet=\"1\"");
        let mut delen = ooxml_opc::unzip_parts(&b).unwrap();
        for (naam, xml) in &mut delen {
            if naam == "xl/worksheets/sheet1.xml" {
                *naam = "afwijkend/blad.xml".into();
            } else if naam == "xl/_rels/workbook.xml.rels" {
                *xml = String::from_utf8(xml.clone())
                    .unwrap()
                    .replace("/xl/worksheets/sheet1.xml", doel)
                    .replace("\"worksheets/sheet1.xml\"", &format!("\"{doel}\""))
                    .into_bytes();
            } else if naam == "[Content_Types].xml" {
                *xml = String::from_utf8(xml.clone())
                    .unwrap()
                    .replace("/xl/worksheets/sheet1.xml", "/afwijkend/blad.xml")
                    .into_bytes();
            }
        }
        let bytes = ooxml_opc::rezip_parts(&delen).unwrap();
        let mut s = Sessie::open(Module::Spreadsheet, bytes.clone()).unwrap();
        assert!(
            s.weergave(0).unwrap().bewerkingsbeperking.is_some(),
            "{doel}"
        );
        assert!(s.bewerk(0, opdrachten().remove(0)).is_err());
        assert_eq!(*s.bron(), bytes);
    }
    let mut delen = ooxml_opc::unzip_parts(BRON).unwrap();
    delen.push((
        "xl/worksheets/ongebruikt.xml".into(),
        br#"<worksheet><sheetProtection sheet="1"/></worksheet>"#.to_vec(),
    ));
    let bytes = ooxml_opc::rezip_parts(&delen).unwrap();
    let d = Document::open(Module::Spreadsheet, &bytes).unwrap();
    assert!(d.weergave(0).unwrap().bewerkingsbeperking.is_none());
}
#[test]
fn bladbeveiliging_ongeldige_bladindex_mag_nooit_naar_een_bestaand_blad_teruglopen() {
    let mut s = Sessie::open(Module::Spreadsheet, BRON.to_vec()).unwrap();
    let bron = s.bron();
    let mut indices = vec![2, usize::MAX];
    if let Ok(n) = usize::try_from(1u64 << 32) {
        indices.push(n);
    }
    for n in indices {
        assert!(s.weergave(n).is_err());
        assert!(s.selecteer_cellen(n, "A1", "B2", None).is_err());
        for b in opdrachten() {
            assert!(s.bewerk(n, b).is_err());
            assert_eq!(*s.bron(), *bron);
            assert!(!s.kan_terug());
        }
    }
}
