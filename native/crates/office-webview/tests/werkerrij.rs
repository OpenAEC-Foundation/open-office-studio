//! Toelating, antwoordvolgorde, navigatie en bewaarsnapshots zonder UI-sessies.
mod gereedschap;
use gereedschap::{opdracht, wacht};
use office_core::document::{Bewerking, Module};
use open_office_studio_webview::model::{DocumentTaak, Doel, Werkruimte};

fn nieuw(w: &mut Werkruimte) -> Doel {
    opdracht(w, |w| w.nieuw(Module::Notition)).unwrap();
    w.tab().unwrap().doel()
}
fn titel(w: &mut Werkruimte, doel: Doel, tekst: &str) -> DocumentTaak {
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
    .unwrap()
}
fn lees(pad: &std::path::Path) -> serde_json::Value {
    serde_json::from_slice(&std::fs::read(pad).unwrap()).unwrap()
}

#[test]
fn webview_ingevoerde_tekst_is_meteen_gewijzigd_en_late_antwoorden_bevestigen_in_volgorde() {
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    let begin = w.tab().unwrap().beeld.velden[0].tekst.clone();
    let a = titel(&mut w, d, "Eerste concept 🏠");
    let b = titel(&mut w, d, "Tweede concept 🏠");
    assert!(w.tab().unwrap().gewijzigd());
    assert!(w.tab().unwrap().kan_terug());
    assert!(w.sluit(d.document, false).is_err());
    let antwoord_b = wacht(b.uitvoeren());
    w.voltooi(antwoord_b).unwrap();
    assert_eq!(w.tab().unwrap().beeld.velden[0].tekst, begin);
    assert!(w.tab().unwrap().bezig());
    w.voltooi(wacht(a.uitvoeren())).unwrap();
    assert_eq!(w.tab().unwrap().beeld.velden[0].tekst, "Tweede concept 🏠");
    assert!(!w.tab().unwrap().bezig());
    assert_eq!(w.tab().unwrap().doel(), d);
}

#[test]
fn webview_bewaren_van_wachtende_invoer_haalt_de_bron_van_de_werker_en_niet_de_ui_kopie() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("notitie.json");
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    let taak = titel(&mut w, d, "Nog niet in de UI bevestigde invoer");
    let bewaar = w.voorbereid_bewaren(d, Some(&pad)).unwrap();
    assert!(!pad.exists());
    w.voltooi_bewaren(wacht(bewaar.uitvoeren())).unwrap();
    assert_eq!(
        lees(&pad)["boeken"][0]["secties"][0]["paginas"][0]["titel"],
        "Nog niet in de UI bevestigde invoer"
    );
    assert!(
        w.tab().unwrap().gewijzigd(),
        "Wachtende bevestiging blijft conservatief gewijzigd"
    );
    w.voltooi(wacht(taak.uitvoeren())).unwrap();
    assert!(!w.tab().unwrap().gewijzigd());
}

#[test]
fn webview_de_bewaarmomentopname_staat_precies_tussen_twee_toegelaten_concepten() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("notitie.json");
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    let a = titel(&mut w, d, "Vóór de momentopname");
    let bewaren = w.voorbereid_bewaren(d, Some(&pad)).unwrap();
    let b = titel(&mut w, d, "Ná de momentopname");
    w.voltooi(wacht(b.uitvoeren())).unwrap();
    w.voltooi_bewaren(wacht(bewaren.uitvoeren())).unwrap();
    w.voltooi(wacht(a.uitvoeren())).unwrap();
    assert_eq!(
        lees(&pad)["boeken"][0]["secties"][0]["paginas"][0]["titel"],
        "Vóór de momentopname"
    );
    assert_eq!(w.tab().unwrap().beeld.velden[0].tekst, "Ná de momentopname");
    assert!(w.tab().unwrap().gewijzigd());
}

#[test]
fn webview_een_laat_geopend_document_steelt_geen_focus_en_een_gesloten_opening_komt_niet_terug() {
    let mut w = Werkruimte::default();
    let a = w.nieuw(Module::Notition).unwrap();
    let id_a = a.document();
    let b = w.nieuw(Module::Notition).unwrap();
    let id_b = b.document();
    w.voltooi(wacht(a.uitvoeren())).unwrap();
    assert_eq!(w.actief, Some(id_b));
    assert!(w.opent());
    w.kies(None);
    w.voltooi(wacht(b.uitvoeren())).unwrap();
    assert_eq!(w.actief, None);
    assert_eq!(w.tabbladen.len(), 2);
    let c = w.nieuw(Module::Notition).unwrap();
    let id_c = c.document();
    w.sluit(id_c, true).unwrap();
    assert!(!w.voltooi(wacht(c.uitvoeren())).unwrap());
    assert_eq!(w.tabbladen.len(), 2);
    assert_ne!(w.actief, Some(id_c));
    w.kies(Some(id_a));
    assert_eq!(w.tab().unwrap().id, id_a);
}

#[test]
fn webview_oudere_invoer_gaat_mee_voordat_navigatie_het_doel_en_de_invoervelden_vervangt() {
    use office_core::notities::NotitieActie as N;
    let mut w = Werkruimte::default();
    nieuw(&mut w);
    let d = w.tab().unwrap().doel();
    opdracht(&mut w, |w| w.bewerk(d, Bewerking::Notitie(N::NieuwePagina))).unwrap();
    let d = w.tab().unwrap().doel();
    opdracht(&mut w, |w| w.kies_deel(d, 0)).unwrap();
    let d = w.tab().unwrap().doel();
    let a = titel(&mut w, d, "Bij de oorspronkelijke pagina");
    let navigatie = w.kies_deel(d, 1).unwrap();
    assert!(w.tab().unwrap().geblokkeerd());
    let id = w.tab().unwrap().beeld.velden[0].id.clone();
    assert!(
        w.bewerk(
            d,
            Bewerking::Tekst {
                id: id.clone(),
                tekst: "Te laat".into()
            }
        )
        .is_err()
    );
    w.voltooi(wacht(navigatie.uitvoeren())).unwrap();
    assert_eq!(w.tab().unwrap().doel(), d);
    w.voltooi(wacht(a.uitvoeren())).unwrap();
    assert_eq!(w.tab().unwrap().deel, 1);
    assert_ne!(w.tab().unwrap().doel(), d);
    assert!(!w.tab().unwrap().geblokkeerd());
    assert!(
        w.bewerk(
            d,
            Bewerking::Tekst {
                id,
                tekst: "Nog steeds oud".into()
            }
        )
        .is_err()
    );
    let bron: serde_json::Value = serde_json::from_slice(&w.tab().unwrap().bron()).unwrap();
    assert_eq!(
        bron["boeken"][0]["secties"][0]["paginas"][0]["titel"],
        "Bij de oorspronkelijke pagina"
    );
    assert_eq!(
        bron["boeken"][0]["secties"][0]["paginas"][1]["titel"],
        "Nieuwe pagina"
    );
}

#[test]
fn webview_een_later_geweigerde_bewerking_verbergt_geen_eerdere_onopgeslagen_bron() {
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    let a = titel(&mut w, d, "Geldige eerdere invoer");
    let b = titel(&mut w, d, &"é".repeat(250_001));
    w.voltooi(wacht(b.uitvoeren())).unwrap();
    assert!(w.voltooi(wacht(a.uitvoeren())).is_err());
    assert_eq!(
        w.tab().unwrap().beeld.velden[0].tekst,
        "Geldige eerdere invoer"
    );
    assert!(w.tab().unwrap().gewijzigd());
    assert!(w.tab().unwrap().fout.is_some());
    assert_ne!(w.tab().unwrap().doel(), d);
    assert!(w.sluit(d.document, false).is_err());
}

#[test]
fn webview_verwerpen_wacht_niet_op_achtergrondantwoorden_en_heropent_geen_document() {
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    let a = titel(&mut w, d, "Bewust verworpen invoer");
    w.sluit(d.document, true).unwrap();
    let ander = nieuw(&mut w);
    assert!(!w.voltooi(wacht(a.uitvoeren())).unwrap());
    assert_eq!(w.tabbladen.len(), 1);
    assert_eq!(w.actief, Some(ander.document));
    assert!(!w.tab().unwrap().gewijzigd());
}

#[test]
fn webview_een_late_fout_blijft_bij_het_eigen_document_en_verandert_de_actieve_tab_niet() {
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    let fout = titel(&mut w, d, &"é".repeat(250_001));
    let ander = nieuw(&mut w);
    assert!(w.voltooi(wacht(fout.uitvoeren())).is_err());
    assert_eq!(w.actief, Some(ander.document));
    assert!(w.tab().unwrap().fout.is_none());
    assert!(w.melding.is_empty());
    assert!(
        w.tabbladen
            .iter()
            .find(|t| t.id == d.document)
            .unwrap()
            .fout
            .is_some()
    );
}

#[test]
fn webview_ook_een_ongewijzigde_bron_mag_niet_ongemerkt_sluiten_tijdens_opslaan_als() {
    let map = tempfile::tempdir().unwrap();
    let pad = map.path().join("nieuwe kopie.json");
    let mut w = Werkruimte::default();
    let d = nieuw(&mut w);
    assert!(!w.tab().unwrap().gewijzigd());
    let taak = w.voorbereid_bewaren(d, Some(&pad)).unwrap();
    assert!(
        w.tab().unwrap().gewijzigd(),
        "De aanvaarde bewaaractie is nog niet bevestigd"
    );
    assert!(w.sluit(d.document, false).is_err());
    w.voltooi_bewaren(wacht(taak.uitvoeren())).unwrap();
    assert!(pad.is_file());
    assert!(!w.tab().unwrap().gewijzigd());
    w.sluit(d.document, false).unwrap();
}

#[test]
fn webview_documenttabs_houden_hun_toelatingsvolgorde_bij_omgekeerd_ontvangen_openantwoorden() {
    let mut w = Werkruimte::default();
    let a = w.nieuw(Module::Notition).unwrap();
    let id_a = a.document();
    let b = w.nieuw(Module::Notition).unwrap();
    let id_b = b.document();
    assert_eq!(
        w.tablijst().iter().map(|t| t.id).collect::<Vec<_>>(),
        [id_a, id_b]
    );
    assert!(w.tablijst().iter().all(|t| t.laden));
    w.voltooi(wacht(b.uitvoeren())).unwrap();
    assert_eq!(
        w.tablijst().iter().map(|t| t.id).collect::<Vec<_>>(),
        [id_a, id_b]
    );
    assert!(w.tablijst()[0].laden);
    assert!(!w.tablijst()[1].laden);
    w.voltooi(wacht(a.uitvoeren())).unwrap();
    assert_eq!(
        w.tabbladen.iter().map(|t| t.id).collect::<Vec<_>>(),
        [id_a, id_b]
    );
    assert_eq!(w.actief, Some(id_b));
    w.sluit(id_b, false).unwrap();
    assert_eq!(w.actief, Some(id_a));
}
