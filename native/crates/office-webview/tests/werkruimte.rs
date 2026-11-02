//! Eigenaarschap, bronbehoud en opslag testen onafhankelijk van de DOM.
use office_core::{
    document::{Bewerking, Module},
    notities::NotitieActie as N,
};
use open_office_studio_webview::model::{Doel, Werkruimte};

fn notities() -> (Werkruimte, Doel) {
    let mut w = Werkruimte::default();
    w.nieuw(Module::Notition).unwrap();
    let d = w.tab().unwrap().doel();
    (w, d)
}
fn titel(w: &mut Werkruimte, doel: Doel, tekst: &str) {
    let id = w
        .tabbladen
        .iter()
        .find(|t| t.id == doel.document)
        .unwrap()
        .beeld
        .velden[0]
        .id
        .clone();
    w.bewerk(
        doel,
        Bewerking::Tekst {
            id,
            tekst: tekst.into(),
        },
    )
    .unwrap();
}

#[test]
fn webview_invoer_blijft_bij_oorspronkelijk_document_na_tabwissel() {
    let (mut w, d) = notities();
    let origineel = w.tab().unwrap().sessie.bron();
    let tweede = w.nieuw(Module::Notition).unwrap();
    let tweede_bron = w.tab().unwrap().sessie.bron();
    titel(&mut w, d, "Eigen notitie 🏠");
    assert_eq!(w.actief, Some(tweede));
    assert_eq!(
        w.tab().unwrap().sessie.bron().as_slice(),
        tweede_bron.as_slice()
    );
    assert_eq!(w.tabbladen[0].beeld.velden[0].tekst, "Eigen notitie 🏠");
    w.kies(None);
    w.historie(d, false).unwrap();
    assert_eq!(
        w.tabbladen[0].sessie.bron().as_slice(),
        origineel.as_slice()
    );
    assert_eq!(w.actief, None);
}

#[test]
fn webview_verlate_invoer_na_navigatie_undo_en_sluiten_wordt_geweigerd() {
    let (mut w, d) = notities();
    w.bewerk(d, Bewerking::Notitie(N::NieuwePagina)).unwrap();
    let huidig = w.tab().unwrap().doel();
    assert_ne!(huidig, d);
    let bron = w.tab().unwrap().sessie.bron();
    assert!(w.bewerk(d, Bewerking::Notitie(N::NieuwBoek)).is_err());
    assert_eq!(w.tab().unwrap().sessie.bron().as_slice(), bron.as_slice());
    w.historie(huidig, false).unwrap();
    assert!(w.bewerk(huidig, Bewerking::Notitie(N::NieuwBoek)).is_err());
    let d = w.tab().unwrap().doel();
    w.sluit(d.document, true).unwrap();
    let nieuw = w.nieuw(Module::Notition).unwrap();
    assert_ne!(nieuw, d.document);
    assert!(w.bewerk(d, Bewerking::Notitie(N::NieuwBoek)).is_err());
    assert!(!w.tab().unwrap().gewijzigd());
}

#[test]
fn webview_opslaan_weigert_externe_wijziging_en_bewaart_fout_bij_eigenaar() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("Eigen notitie.json");
    let (mut w, d) = notities();
    titel(&mut w, d, "Bewaarde titel");
    assert!(w.sluit(d.document, false).is_err());
    w.bewaar(d, Some(&pad)).unwrap();
    assert!(!w.tab().unwrap().gewijzigd());
    let bytes = std::fs::read(&pad).unwrap();
    let mut ander = Werkruimte::default();
    ander.open(&pad).unwrap();
    assert_eq!(ander.tab().unwrap().beeld.velden[0].tekst, "Bewaarde titel");
    assert_eq!(ander.tab().unwrap().sessie.bron().as_slice(), bytes);
    titel(&mut w, d, "Onopgeslagen titel");
    std::fs::write(&pad, b"Externe wijziging").unwrap();
    let tweede = w.nieuw(Module::Notition).unwrap();
    assert!(w.bewaar(d, None).is_err());
    assert_eq!(std::fs::read(&pad).unwrap(), b"Externe wijziging");
    assert!(
        w.tabbladen[0]
            .melding
            .contains("buiten dit venster gewijzigd")
    );
    assert!(w.tabbladen[0].gewijzigd());
    assert!(w.tab().unwrap().melding.is_empty());
    assert_eq!(w.actief, Some(tweede));
    assert!(w.bewaar(d, Some(&pad)).is_err());
    assert_eq!(std::fs::read(&pad).unwrap(), b"Externe wijziging");
}

#[test]
fn webview_onbekende_notitievelden_en_html_tekst_blijven_brongegevens() {
    let mut bron: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../docs/voorbeelden/Notitieboek.json"
    ))
    .unwrap();
    bron["uitbreiding"] = serde_json::json!({"bewaren":42});
    let bytes = serde_json::to_vec(&bron).unwrap();
    let mut w = Werkruimte::default();
    w.voeg_toe(
        office_core::document::Sessie::open(Module::Notition, bytes.clone()).unwrap(),
        "Eigen bron.json".into(),
        None,
        None,
    )
    .unwrap();
    let d = w.tab().unwrap().doel();
    titel(&mut w, d, "<img src=x onerror=alert(1)> 🏠");
    let gewijzigd: serde_json::Value =
        serde_json::from_slice(&w.tab().unwrap().sessie.bron()).unwrap();
    assert_eq!(gewijzigd["uitbreiding"], bron["uitbreiding"]);
    assert_eq!(
        gewijzigd["boeken"][0]["secties"][0]["paginas"][0]["titel"],
        "<img src=x onerror=alert(1)> 🏠"
    );
    w.historie(d, false).unwrap();
    assert_eq!(w.tab().unwrap().sessie.bron().as_slice(), bytes);
}

#[test]
fn webview_boek_sectie_en_markdown_hebben_werkelijke_rust_bewerkingen() {
    let (mut w, d) = notities();
    for actie in [
        N::BoekNaam("Mijn werkboek".into()),
        N::SectieNaam("Onderzoek".into()),
    ] {
        w.bewerk(d, Bewerking::Notitie(actie)).unwrap();
    }
    let p = w.tab().unwrap().beeld.notitie.as_ref().unwrap();
    assert_eq!(p.overzicht.boeken[0].naam, "Mijn werkboek");
    assert_eq!(p.overzicht.boeken[0].secties[0].naam, "Onderzoek");
    assert!(p.markdown);
    let id = w.tab().unwrap().beeld.velden[1].id.clone();
    w.bewerk(
        d,
        Bewerking::Tekst {
            id,
            tekst: "# Onderzoek\n\nVrije tekst 🏠".into(),
        },
    )
    .unwrap();
    let bytes = w.tab().unwrap().sessie.bron();
    let heropend = office_core::document::Sessie::open(Module::Notition, bytes.to_vec()).unwrap();
    assert_eq!(
        heropend.weergave(0).unwrap().velden[1].tekst,
        "# Onderzoek\n\nVrije tekst 🏠"
    );
    w.bewerk(d, Bewerking::Notitie(N::NieuweSectie { markdown: false }))
        .unwrap();
    assert!(!w.tab().unwrap().beeld.notitie.as_ref().unwrap().markdown);
    let d = w.tab().unwrap().doel();
    w.bewerk(d, Bewerking::Notitie(N::NieuwVak { x: 360., y: 240. }))
        .unwrap();
    let vak = &w.tab().unwrap().beeld.notitie.as_ref().unwrap().vakken[0];
    assert_eq!((vak.grens.x, vak.grens.y), (360., 240.));
}

#[test]
fn webview_invoerveld_blijft_stabiel_bij_typen_en_vernieuwt_bij_herstel() {
    let (mut w, d) = notities();
    let sleutel = d.sleutel();
    titel(&mut w, d, "Snelle invoer");
    assert_eq!(w.tab().unwrap().doel().sleutel(), sleutel);
    w.historie(d, false).unwrap();
    let hersteld = w.tab().unwrap().doel();
    assert_ne!(hersteld.sleutel(), sleutel);
    assert_ne!(w.tab().unwrap().beeld.velden[0].tekst, "Snelle invoer");
    w.historie(hersteld, true).unwrap();
    let opnieuw = w.tab().unwrap().doel();
    assert_ne!(opnieuw.sleutel(), hersteld.sleutel());
    assert_eq!(w.tab().unwrap().beeld.velden[0].tekst, "Snelle invoer");
    w.kies_deel(opnieuw, 0).unwrap();
    assert_ne!(w.tab().unwrap().doel().sleutel(), opnieuw.sleutel());
    assert!(w.bewerk(opnieuw, Bewerking::Notitie(N::NieuwBoek)).is_err());
    assert_eq!(w.tab().unwrap().tabnaam(), "Notities");
    assert_eq!(
        w.tab().unwrap().venstertitel(),
        "Open Office Studio (Notities) •"
    );
}

#[test]
fn webview_geweigerde_invoer_herstelt_het_zichtbare_veld_en_behoudt_de_bron() {
    let (mut w, d) = notities();
    let bron = w.tab().unwrap().sessie.bron();
    let veld = w.tab().unwrap().beeld.velden[1].clone();
    assert!(
        w.bewerk(
            d,
            Bewerking::Tekst {
                id: veld.id.clone(),
                tekst: "é".repeat(250_001),
            }
        )
        .is_err()
    );
    assert_eq!(w.tab().unwrap().sessie.bron().as_slice(), bron.as_slice());
    assert_eq!(w.tab().unwrap().beeld.velden[1].tekst, veld.tekst);
    assert!(!w.tab().unwrap().gewijzigd());
    assert!(!w.tab().unwrap().sessie.kan_terug());
    let hersteld = w.tab().unwrap().doel();
    assert_ne!(
        hersteld.sleutel(),
        d.sleutel(),
        "Een geweigerd browserconcept moet uit het zichtbare veld verdwijnen"
    );
    assert!(w.tab().unwrap().melding.contains("Notitietekst te lang"));
    assert!(
        w.bewerk(
            d,
            Bewerking::Tekst {
                id: veld.id.clone(),
                tekst: "Verlate invoer".into()
            }
        )
        .is_err()
    );
    w.bewerk(
        hersteld,
        Bewerking::Tekst {
            id: veld.id,
            tekst: "Geldige invoer na herstel".into(),
        },
    )
    .unwrap();
    assert_eq!(
        w.tab().unwrap().beeld.velden[1].tekst,
        "Geldige invoer na herstel"
    );
}
