//! Nieuwe invoer en late antwoorden mogen de bewaartoestand niet vervalsen.
mod gereedschap;
use gereedschap::wacht;
use office_core::document::{Bewerking, Module};
use open_office_studio_webview::model::{Doel, Werkruimte};

fn nieuw(w: &mut Werkruimte) -> Doel {
    gereedschap::opdracht(w, |w| w.nieuw(Module::Notition)).unwrap();
    w.tab().unwrap().doel()
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
    gereedschap::opdracht(w, |w| {
        w.bewerk(
            doel,
            Bewerking::Tekst {
                id,
                tekst: tekst.into(),
            },
        )
    })
    .unwrap();
}
fn lees_titel(pad: &std::path::Path) -> String {
    let bron: serde_json::Value = serde_json::from_slice(&std::fs::read(pad).unwrap()).unwrap();
    bron["boeken"][0]["secties"][0]["paginas"][0]["titel"]
        .as_str()
        .unwrap()
        .into()
}

#[test]
fn webview_bewaren_bevestigt_alleen_de_vastgelegde_bron_na_nieuwe_invoer_en_navigatie() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("notitie.json");
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    titel(&mut w, d, "Vastgelegde titel 🏠");
    let taak = w.voorbereid_bewaren(d, Some(&pad)).unwrap();
    assert!(!pad.exists(), "Voorbereiden verricht geen bestands-I/O");
    titel(&mut w, d, "Nieuwe tekst tijdens bewaren");
    gereedschap::opdracht(&mut w, |w| w.kies_deel(d, 0)).unwrap();
    let huidig = w.tab().unwrap().doel();
    assert_ne!(huidig, d);
    let tweede = nieuw(&mut w);
    assert!(w.voltooi_bewaren(wacht(taak.uitvoeren())).unwrap());
    assert_eq!(lees_titel(&pad), "Vastgelegde titel 🏠");
    assert_eq!(w.actief, Some(tweede.document));
    assert!(w.tabbladen[0].gewijzigd());
    assert_eq!(w.tabbladen[0].melding, "Niet opgeslagen");
    assert!(w.sluit(d.document, false).is_err());
    let taak = w.voorbereid_bewaren(huidig, None).unwrap();
    assert!(w.voltooi_bewaren(wacht(taak.uitvoeren())).unwrap());
    assert_eq!(lees_titel(&pad), "Nieuwe tekst tijdens bewaren");
    assert!(!w.tabbladen[0].gewijzigd());
}

#[test]
fn webview_bewaarantwoord_heropent_geen_gesloten_document_en_wijzigt_geen_nieuwe_tab() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("notitie.json");
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    titel(&mut w, d, "Bewuste bewaarkopie");
    let taak = w.voorbereid_bewaren(d, Some(&pad)).unwrap();
    assert!(w.voorbereid_bewaren(d, Some(&pad)).is_err());
    let antwoord = wacht(taak.uitvoeren());
    w.sluit(d.document, true).unwrap();
    let ander = nieuw(&mut w);
    let bron = w.tab().unwrap().bron();
    assert!(!w.voltooi_bewaren(antwoord).unwrap());
    assert_eq!(w.tabbladen.len(), 1);
    assert_eq!(w.actief, Some(ander.document));
    assert_eq!(w.tab().unwrap().bron().as_slice(), bron.as_slice());
    assert!(!w.tab().unwrap().gewijzigd());
    assert_eq!(lees_titel(&pad), "Bewuste bewaarkopie");
}

#[test]
fn webview_mislukte_bewaaractie_behoudt_externe_bytes_en_staat_een_nieuw_doel_toe() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("notitie.json");
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    titel(&mut w, d, "Eigen tekst");
    let taak = w.voorbereid_bewaren(d, Some(&pad)).unwrap();
    std::fs::write(&pad, b"Externe tekst").unwrap();
    assert!(w.voltooi_bewaren(wacht(taak.uitvoeren())).is_err());
    assert_eq!(std::fs::read(&pad).unwrap(), b"Externe tekst");
    assert!(w.tab().unwrap().gewijzigd());
    let nieuw_pad = map.path().join("nieuwe notitie.json");
    let taak = w.voorbereid_bewaren(d, Some(&nieuw_pad)).unwrap();
    assert!(w.voltooi_bewaren(wacht(taak.uitvoeren())).unwrap());
    assert_eq!(lees_titel(&nieuw_pad), "Eigen tekst");
    assert!(!w.tab().unwrap().gewijzigd());
}

#[test]
fn webview_twee_tabs_overschrijven_niet_beide_dezelfde_oude_schijfversie() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("notitie.json");
    let mut w = Werkruimte::default();
    let eerste = nieuw(&mut w);
    let taak = w.voorbereid_bewaren(eerste, Some(&pad)).unwrap();
    w.voltooi_bewaren(wacht(taak.uitvoeren())).unwrap();
    gereedschap::opdracht(&mut w, |w| w.open(&pad)).unwrap();
    let tweede = w.tab().unwrap().doel();
    titel(&mut w, eerste, "Eerste tab");
    titel(&mut w, tweede, "Tweede tab");
    let a = w.voorbereid_bewaren(eerste, None).unwrap();
    let b = w.voorbereid_bewaren(tweede, None).unwrap();
    let a = std::thread::spawn(move || wacht(a.uitvoeren()));
    let b = std::thread::spawn(move || wacht(b.uitvoeren()));
    let a = w.voltooi_bewaren(a.join().unwrap());
    let b = w.voltooi_bewaren(b.join().unwrap());
    assert_ne!(
        a.is_ok(),
        b.is_ok(),
        "Precies één oude schijfhash blijft geldig"
    );
    assert_eq!(w.tabbladen.iter().filter(|t| t.gewijzigd()).count(), 1);
    let opgeslagen = lees_titel(&pad);
    assert!(opgeslagen == "Eerste tab" || opgeslagen == "Tweede tab");
}
