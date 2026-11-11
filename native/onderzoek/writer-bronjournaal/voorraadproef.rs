//! Afzonderlijke voorraadproeven; geen Tauri/GUI of tabregistratie.
mod adapter;
mod journaal;
mod voorraad;
mod werker;
use adapter::Binding;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_journal::EditingDoc;
use office_writer_plakken::{IncrementeleTekstAanvraag as Vraag, snapshot_sha256};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;
use voorraad::{Voorraad, VoorraadFout, VoorraadProef};
use werker::Proef;
fn wacht<T>(r: &mpsc::Receiver<T>) -> T {
    r.recv_timeout(Duration::from_secs(3))
        .expect("Eigen voorraad blijft wachten")
}
fn vraag(b: &Binding) -> Vraag {
    let d = EditingDoc::new(21);
    d.create_story_with_paragraph_id("body", "p0", "Begin", "Normal", "left")
        .unwrap();
    let bytes = d.encode_state_as_update_v1();
    serde_json::from_value(json!({"schema":3,"requestId":"proef","documentId":b.document,"sourceVersion":"bron","sourceVector":STANDARD.encode(d.encode_state_vector_v1()),"snapshotSha256":snapshot_sha256(&bytes),"snapshot":STANDARD.encode(bytes),"clientId":21,"position":{"story":"body","paraId":"p0","offset":5},"text":"x"})).unwrap()
}
fn poort() -> (
    Arc<Proef>,
    mpsc::Receiver<u64>,
    mpsc::Sender<()>,
    mpsc::Receiver<()>,
) {
    let (berekend, start) = mpsc::channel();
    let (hervat, w) = mpsc::channel();
    let (klaar, einde) = mpsc::channel();
    (
        Arc::new(Proef {
            berekend: Some(berekend),
            na_bereid_wacht: Mutex::new(Some(w)),
            klaar: Some(klaar),
            ..Proef::default()
        }),
        start,
        hervat,
        einde,
    )
}
#[test]
fn expliciete_inschakeling_en_positieve_grenzen() {
    assert!(matches!(
        Voorraad::nieuw(false, 4, 1024),
        Err(VoorraadFout::Uitgeschakeld)
    ));
    assert!(matches!(
        Voorraad::nieuw(true, 0, 1024),
        Err(VoorraadFout::Ongeldig)
    ));
    assert!(matches!(
        Voorraad::nieuw(true, 4, 0),
        Err(VoorraadFout::Ongeldig)
    ))
}
#[test]
fn dubbele_opening_en_verkeerde_host_worden_geweigerd() {
    let v = Voorraad::nieuw(true, 2, 1_000_000).unwrap();
    let b = v.open("eigen", "doc").unwrap();
    assert!(matches!(
        v.open("eigen", "doc"),
        Err(VoorraadFout::Ongeldig)
    ));
    assert_eq!(
        v.bereid("ander", &b, 1, vraag(&b)),
        Err(VoorraadFout::Verouderd)
    );
    assert_eq!(v.vergeet("ander", &b), Err(VoorraadFout::Verouderd));
    assert_eq!(
        v.bereid("eigen", &b, 1, vraag(&b)).unwrap()["route"],
        "gereed"
    );
    v.vergeet("eigen", &b).unwrap()
}
#[test]
fn volle_voorraad_verdringt_niet_stilzwijgend_een_andere_koppeling() {
    let v = Voorraad::nieuw(true, 1, 1_000_000).unwrap();
    let b = v.open("eigen", "a").unwrap();
    assert!(matches!(
        v.open("eigen", "b"),
        Err(VoorraadFout::Capaciteit)
    ));
    assert_eq!(
        v.bereid("eigen", &b, 1, vraag(&b)).unwrap()["route"],
        "gereed"
    );
    v.vergeet("eigen", &b).unwrap()
}
#[test]
fn verwijderde_levende_kern_blijft_meetellen_tot_opruiming() {
    let v = Voorraad::nieuw(true, 1, 1_000_000).unwrap();
    let (p, start, hervat, klaar) = poort();
    let b = v.met_proef("eigen", "a", p).unwrap();
    let c = v.clone();
    let oud = b.clone();
    let th = std::thread::spawn(move || c.bereid("eigen", &oud, 1, vraag(&oud)));
    assert_eq!(wacht(&start), 1);
    assert!(v.stand().unwrap().2 > 0);
    v.vergeet("eigen", &b).unwrap();
    let stand = v.stand().unwrap();
    assert_eq!((stand.0, stand.1), (0, 1));
    assert!(stand.2 > 0);
    assert!(matches!(
        v.open("eigen", "b"),
        Err(VoorraadFout::Capaciteit)
    ));
    hervat.send(()).unwrap();
    wacht(&klaar);
    assert_eq!(th.join().unwrap(), Err(VoorraadFout::Verouderd));
    assert_eq!(v.stand().unwrap(), (0, 0, 0));
    let nieuw = v.open("eigen", "a").unwrap();
    assert_ne!(nieuw.levensduur, b.levensduur);
    assert_eq!(
        v.bereid("eigen", &b, 2, vraag(&b)),
        Err(VoorraadFout::Verouderd)
    );
    v.vergeet("eigen", &b).unwrap();
    assert_eq!(
        v.bereid("eigen", &nieuw, 1, vraag(&nieuw)).unwrap()["route"],
        "gereed"
    );
    v.vergeet("eigen", &nieuw).unwrap()
}
#[test]
fn globaal_slot_blijft_vrij_terwijl_documentwerker_wacht() {
    let v = Voorraad::nieuw(true, 2, 1_000_000).unwrap();
    let (p, start, hervat, klaar) = poort();
    let b = v.met_proef("eigen", "a", p).unwrap();
    let c = v.clone();
    let bb = b.clone();
    let th = std::thread::spawn(move || c.bereid("eigen", &bb, 1, vraag(&bb)));
    assert_eq!(wacht(&start), 1);
    let c = v.clone();
    let (tx, rx) = mpsc::channel();
    let ander = std::thread::spawn(move || {
        let b = c.open("eigen", "b").unwrap();
        let r = c.bereid("eigen", &b, 1, vraag(&b));
        c.vergeet("eigen", &b).unwrap();
        tx.send(r).unwrap()
    });
    assert_eq!(wacht(&rx).unwrap()["route"], "gereed");
    ander.join().unwrap();
    v.vergeet("eigen", &b).unwrap();
    hervat.send(()).unwrap();
    wacht(&klaar);
    assert_eq!(th.join().unwrap(), Err(VoorraadFout::Verouderd))
}
#[test]
fn oude_antwoordafronding_registreert_oude_koppeling_niet_opnieuw() {
    let (binnen, start) = mpsc::channel();
    let (hervat, w) = mpsc::channel();
    let v = Voorraad::nieuw(true, 2, 1_000_000)
        .unwrap()
        .met_antwoordpoort(Arc::new(VoorraadProef {
            binnen,
            wacht: Mutex::new(Some(w)),
        }));
    let (klaar, einde) = mpsc::channel();
    let p = Arc::new(Proef {
        klaar: Some(klaar),
        ..Proef::default()
    });
    let oud = v.met_proef("eigen", "a", p).unwrap();
    let c = v.clone();
    let b = oud.clone();
    let th = std::thread::spawn(move || c.bereid("eigen", &b, 1, vraag(&b)));
    wacht(&start);
    v.vergeet("eigen", &oud).unwrap();
    wacht(&einde);
    let nieuw = v.open("eigen", "a").unwrap();
    hervat.send(()).unwrap();
    assert_eq!(th.join().unwrap(), Err(VoorraadFout::Verouderd));
    assert_eq!(v.stand().unwrap().0, 1);
    assert_eq!(
        v.bereid("eigen", &nieuw, 1, vraag(&nieuw)).unwrap()["levensduur"],
        nieuw.levensduur
    );
    v.vergeet("eigen", &nieuw).unwrap()
}
#[test]
fn bytegrens_geeft_capaciteit_zonder_voorstel_toe_te_passen() {
    let v = Voorraad::nieuw(true, 2, 1).unwrap();
    let (klaar, einde) = mpsc::channel();
    let p = Arc::new(Proef {
        klaar: Some(klaar),
        ..Proef::default()
    });
    let b = v.met_proef("eigen", "a", p).unwrap();
    assert_eq!(
        v.bereid("eigen", &b, 1, vraag(&b)),
        Err(VoorraadFout::Capaciteit)
    );
    wacht(&einde);
    assert_eq!(v.stand().unwrap(), (0, 0, 0));
    assert_eq!(
        v.bereid("eigen", &b, 2, vraag(&b)),
        Err(VoorraadFout::Verouderd)
    )
}
#[test]
fn venstersluiting_trekt_alleen_eigen_koppelingen_in() {
    let v = Voorraad::nieuw(true, 3, 1_000_000).unwrap();
    let a = v.open("een", "a").unwrap();
    let b = v.open("een", "b").unwrap();
    let c = v.open("twee", "c").unwrap();
    v.vergeet_eigenaar("een").unwrap();
    for b in [a, b] {
        assert_eq!(
            v.bereid("een", &b, 1, vraag(&b)),
            Err(VoorraadFout::Verouderd)
        )
    }
    assert_eq!(
        v.bereid("twee", &c, 1, vraag(&c)).unwrap()["route"],
        "gereed"
    );
    v.vergeet_eigenaar("twee").unwrap()
}
#[test]
fn volledige_echte_geschiedenis_gaat_door_voorraad_en_werker() {
    let rows: Vec<Value> = serde_json::from_slice(
        &std::fs::read(std::env::var("WRITER_EIGEN_REEKS").unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(rows.len(), 25);
    let v = Voorraad::nieuw(true, 4, 64 * 1024 * 1024).unwrap();
    let b = v
        .open("eigen", rows[0]["aanvraag"]["documentId"].as_str().unwrap())
        .unwrap();
    let mut basis = Value::Null;
    for (nr, row) in rows.iter().enumerate() {
        let mut a = row["aanvraag"].clone();
        a["schema"] = json!(3);
        if nr > 0 {
            a["basis"] = basis.clone()
        };
        let mut r = v
            .bereid(
                "eigen",
                &b,
                nr as u64 + 1,
                serde_json::from_value(a).unwrap(),
            )
            .unwrap();
        assert_eq!(r["levensduur"], b.levensduur);
        assert_eq!(r["volgnummer"], nr + 1);
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
    v.vergeet("eigen", &b).unwrap()
}

#[test]
fn nieuwe_voorraad_hergebruikt_geen_levensduur_van_oude_voorraad() {
    let v = Voorraad::nieuw(true, 1, 1_000_000).unwrap();
    let oud = v.open("eigen", "a").unwrap();
    v.vergeet_eigenaar("eigen").unwrap();
    drop(v);
    let v = Voorraad::nieuw(true, 1, 1_000_000).unwrap();
    let nieuw = v.open("eigen", "a").unwrap();
    assert_ne!(oud.levensduur, nieuw.levensduur);
    assert_eq!(
        v.bereid("eigen", &oud, 1, vraag(&oud)),
        Err(VoorraadFout::Verouderd)
    );
    assert_eq!(
        v.bereid("eigen", &nieuw, 1, vraag(&nieuw)).unwrap()["route"],
        "gereed"
    );
    v.vergeet_eigenaar("eigen").unwrap()
}
