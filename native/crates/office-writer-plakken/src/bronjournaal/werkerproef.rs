//! Begrensde werkerproeven met eigen klokken en bronreeks; geen GUI.
use super::adapter;
use super::werker;
use crate::{IncrementeleTekstAanvraag as Vraag, snapshot_sha256};
use adapter::{AdapterFout, Binding};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_edit::EditingDoc;
use serde_json::{Value, json};
use std::sync::{Arc, mpsc};
use std::time::Duration;
use werker::{Proef, Werker, WerkerFout};
fn binding() -> Binding {
    Binding {
        eigenaar: "eigen-venster".into(),
        document: "eigen-document".into(),
        levensduur: 1,
    }
}
fn vraag() -> Vraag {
    let d = EditingDoc::new(21);
    d.create_story_with_paragraph_id("body", "p0", "Begin", "Normal", "left")
        .unwrap();
    let b = d.encode_state_as_update_v1();
    serde_json::from_value(json!({"schema":3,"basis":null,"requestId":"opdracht","documentId":binding().document,"sourceVersion":"versie","sourceVector":STANDARD.encode(d.encode_state_vector_v1()),"snapshotSha256":snapshot_sha256(&b),"snapshot":STANDARD.encode(&b),"clientId":21,"position":{"story":"body","paraId":"p0","offset":5},"text":"x"})).unwrap()
}
fn wacht<T>(rx: &mpsc::Receiver<T>) -> T {
    rx.recv_timeout(Duration::from_secs(3))
        .expect("Eigen werker blijft wachten")
}
fn met_klok() -> (
    Werker,
    mpsc::Receiver<u64>,
    mpsc::Receiver<u64>,
    mpsc::Sender<()>,
    mpsc::Receiver<()>,
) {
    let (start, gestart) = mpsc::channel();
    let (toegelaten, toegang) = mpsc::channel();
    let (hervat, wacht) = mpsc::channel();
    let (klaar, einde) = mpsc::channel();
    let p = Arc::new(Proef {
        start: Some(start),
        toegelaten: Some(toegelaten),
        eerste_wacht: std::sync::Mutex::new(Some(wacht)),
        klaar: Some(klaar),
        ..Proef::default()
    });
    (
        Werker::met_proef(binding(), p).unwrap(),
        gestart,
        toegang,
        hervat,
        einde,
    )
}
#[test]
fn expliciete_inschakeling_en_binding_blijven_verplicht() {
    assert!(matches!(
        Werker::nieuw(false, binding()),
        Err(WerkerFout::Adapter(AdapterFout::Uitgeschakeld))
    ));
    let mut b = binding();
    b.levensduur = 0;
    assert!(matches!(
        Werker::nieuw(true, b),
        Err(WerkerFout::Adapter(AdapterFout::Ongeldig(_)))
    ))
}
#[test]
fn kanaal_bevat_een_wachtende_opdracht_en_behoudt_volgorde() {
    let (w, start, toegang, hervat, klaar) = met_klok();
    let r1 = w.stuur(1, vraag()).unwrap();
    assert_eq!(wacht(&start), 1);
    assert_eq!(wacht(&toegang), 1);
    let r2 = w.stuur(2, vraag()).unwrap();
    assert_eq!(wacht(&toegang), 2);
    let (probeer, geprobeerd) = mpsc::channel();
    let c = w.clone();
    let th = std::thread::spawn(move || {
        probeer.send(()).unwrap();
        c.stuur(3, vraag())
    });
    wacht(&geprobeerd);
    assert!(matches!(
        toegang.recv_timeout(Duration::from_millis(100)),
        Err(mpsc::RecvTimeoutError::Timeout)
    ));
    hervat.send(()).unwrap();
    let r3 = th.join().unwrap().unwrap();
    assert_eq!(wacht(&toegang), 3);
    for (nr, rx) in [(1, r1), (2, r2), (3, r3)] {
        assert_eq!(w.ontvang(rx).unwrap()["volgnummer"], nr)
    }
    assert_eq!(wacht(&start), 2);
    assert_eq!(wacht(&start), 3);
    w.vergeet();
    wacht(&klaar);
    assert_eq!(w.bytes(), 0)
}
#[test]
fn vergeten_tijdens_uitvoering_weigert_ook_queued_en_gebufferd_antwoord() {
    let (w, start, _toegang, hervat, klaar) = met_klok();
    let r1 = w.stuur(1, vraag()).unwrap();
    assert_eq!(wacht(&start), 1);
    let r2 = w.stuur(2, vraag()).unwrap();
    w.vergeet();
    assert!(matches!(w.stuur(3, vraag()), Err(WerkerFout::Verouderd)));
    hervat.send(()).unwrap();
    assert_eq!(w.ontvang(r1), Err(WerkerFout::Verouderd));
    assert_eq!(w.ontvang(r2), Err(WerkerFout::Verouderd));
    wacht(&klaar);
    assert_eq!(w.bytes(), 0)
}
#[test]
fn vergeten_na_berekening_weigert_reeds_verzonden_antwoord() {
    let (klaar, einde) = mpsc::channel();
    let (verzonden, gelezen) = mpsc::channel();
    let p = Arc::new(Proef {
        klaar: Some(klaar),
        verzonden: Some(verzonden),
        ..Proef::default()
    });
    let w = Werker::met_proef(binding(), p).unwrap();
    let rx = w.stuur(1, vraag()).unwrap();
    assert_eq!(wacht(&gelezen), 1); // Het echte antwoord zit nu in de echte antwoordwachtrij.
    w.vergeet();
    assert_eq!(w.ontvang(rx), Err(WerkerFout::Verouderd));
    wacht(&einde)
}
#[test]
fn gedropte_aanvrager_blokkeert_geen_volgende_opdracht() {
    let (w, start, _toegang, hervat, klaar) = met_klok();
    let rx = w.stuur(1, vraag()).unwrap();
    assert_eq!(wacht(&start), 1);
    drop(rx);
    let r2 = w.stuur(2, vraag()).unwrap();
    hervat.send(()).unwrap();
    assert_eq!(w.ontvang(r2).unwrap()["volgnummer"], 2);
    assert!(w.bytes() > 0);
    w.vergeet();
    wacht(&klaar)
}
#[test]
fn laatste_handle_ruimt_op_ook_zonder_vergeet() {
    let (klaar, einde) = mpsc::channel();
    let p = Arc::new(Proef {
        klaar: Some(klaar),
        ..Proef::default()
    });
    let w = Werker::met_proef(binding(), p).unwrap();
    w.bereid(1, vraag()).unwrap();
    drop(w);
    wacht(&einde)
}
#[test]
fn werkerpaniek_is_geen_veroudering_en_andere_werker_blijft_werken() {
    let (klaar, einde) = mpsc::channel();
    let p = Arc::new(Proef {
        klaar: Some(klaar),
        paniek: std::sync::atomic::AtomicBool::new(true),
        ..Proef::default()
    });
    let w = Werker::met_proef(binding(), p).unwrap();
    assert_eq!(w.bereid(1, vraag()), Err(WerkerFout::Gestopt));
    wacht(&einde);
    assert_eq!(w.bereid(2, vraag()), Err(WerkerFout::Gestopt));
    let mut b = binding();
    b.levensduur += 1;
    let andere = Werker::nieuw(true, b).unwrap();
    assert_eq!(andere.bereid(1, vraag()).unwrap()["route"], "gereed");
    andere.vergeet()
}
#[test]
fn geblokkeerde_werker_houdt_andere_documenten_niet_tegen() {
    let (w, start, _toegang, hervat, klaar) = met_klok();
    let rx = w.stuur(1, vraag()).unwrap();
    assert_eq!(wacht(&start), 1);
    let mut b = binding();
    b.document = "tweede-eigen-document".into();
    let mut a = vraag();
    a.document_id = b.document.clone();
    let andere = Werker::nieuw(true, b.clone()).unwrap();
    assert_eq!(andere.binding(), &b);
    let r = andere.stuur(1, a).unwrap();
    assert_eq!(wacht(&r).unwrap()["route"], "gereed");
    andere.vergeet();
    w.vergeet();
    hervat.send(()).unwrap();
    assert_eq!(w.ontvang(rx), Err(WerkerFout::Verouderd));
    wacht(&klaar)
}
#[test]
fn echte_geschiedenisreeks_via_begrensde_documentwerker() {
    let rows: Vec<Value> =
        serde_json::from_slice(&std::fs::read(super::proefpad()).unwrap()).unwrap();
    assert_eq!(rows.len(), 25);
    let mut b = binding();
    b.document = rows[0]["aanvraag"]["documentId"].as_str().unwrap().into();
    let w = Werker::nieuw(true, b.clone()).unwrap();
    let mut basis = Value::Null;
    for (nr, row) in rows.iter().enumerate() {
        let mut a = row["aanvraag"].clone();
        a["schema"] = json!(3);
        if nr > 0 {
            a["basis"] = basis.clone()
        };
        let mut r = w
            .bereid(nr as u64 + 1, serde_json::from_value(a).unwrap())
            .unwrap();
        assert_eq!(r["levensduur"], b.levensduur);
        assert_eq!(r["volgnummer"], nr + 1);
        assert_eq!(r["route"], "gereed");
        basis = r["basis"].clone();
        for k in ["route", "levensduur", "volgnummer"] {
            r.as_object_mut().unwrap().remove(k);
        }
        let mut verwacht = row["antwoord"].clone();
        verwacht.as_object_mut().unwrap().remove("preparationMs");
        verwacht["schema"] = json!(3);
        verwacht["basis"] = basis.clone();
        assert_eq!(r, verwacht, "Groep {nr}")
    }
    w.vergeet()
}

#[test]
fn vergeten_na_voorstel_behoudt_boekhouding_tot_kern_op_werker_is_opgeruimd() {
    let (berekend, start) = mpsc::channel();
    let (hervat, wacht_rx) = mpsc::channel();
    let (klaar, einde) = mpsc::channel();
    let p = Arc::new(Proef {
        berekend: Some(berekend),
        na_bereid_wacht: std::sync::Mutex::new(Some(wacht_rx)),
        klaar: Some(klaar),
        ..Proef::default()
    });
    let w = Werker::met_proef(binding(), p).unwrap();
    let rx = w.stuur(1, vraag()).unwrap();
    assert_eq!(wacht(&start), 1);
    assert!(w.bytes() > 0);
    w.vergeet();
    assert!(w.bytes() > 0); // De nog levende kern telt mee tot opruiming.
    hervat.send(()).unwrap();
    assert_eq!(w.ontvang(rx), Err(WerkerFout::Verouderd));
    wacht(&einde);
    assert_eq!(w.bytes(), 0)
}
#[test]
fn vergeten_ontgrendelt_ook_zender_die_op_volle_wachtrij_wacht() {
    let (w, start, toegang, hervat, klaar) = met_klok();
    let r1 = w.stuur(1, vraag()).unwrap();
    assert_eq!(wacht(&start), 1);
    assert_eq!(wacht(&toegang), 1);
    let r2 = w.stuur(2, vraag()).unwrap();
    assert_eq!(wacht(&toegang), 2);
    let c = w.clone();
    let (probeer, geprobeerd) = mpsc::channel();
    let th = std::thread::spawn(move || {
        probeer.send(()).unwrap();
        c.stuur(3, vraag())
    });
    wacht(&geprobeerd);
    assert!(matches!(
        toegang.recv_timeout(Duration::from_millis(100)),
        Err(mpsc::RecvTimeoutError::Timeout)
    ));
    w.vergeet();
    hervat.send(()).unwrap();
    assert!(matches!(th.join().unwrap(), Err(WerkerFout::Verouderd)));
    assert_eq!(w.ontvang(r1), Err(WerkerFout::Verouderd));
    assert_eq!(w.ontvang(r2), Err(WerkerFout::Verouderd));
    wacht(&klaar)
}
