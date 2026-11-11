//! Rust-testprogramma voor het afzonderlijke schema-3-adaptercontract.
mod adapter;
mod journaal;
use adapter::{Adapter, AdapterFout, Binding};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_journal::EditingDoc;
use office_writer_plakken::{IncrementeleTekstAanvraag as Vraag, snapshot_sha256};
use serde_json::{Value, json};
fn binding() -> Binding {
    Binding {
        eigenaar: "eigen-proefvenster".into(),
        document: "eigen-proefdocument".into(),
        levensduur: 1,
    }
}
fn vraag() -> Vraag {
    let d = EditingDoc::new(21);
    d.create_story_with_paragraph_id("body", "p0", "Begin", "Normal", "left")
        .unwrap();
    let b = d.encode_state_as_update_v1();
    serde_json::from_value(json!({"schema":3,"basis":null,"requestId":"eigen-opdracht","documentId":binding().document,"sourceVersion":"eigen-versie","sourceVector":STANDARD.encode(d.encode_state_vector_v1()),"snapshotSha256":snapshot_sha256(&b),"snapshot":STANDARD.encode(&b),"clientId":21,"position":{"story":"body","paraId":"p0","offset":5},"text":"x"})).unwrap()
}
fn controleer_envelop(a: &Vraag, r: &Value) {
    let a = serde_json::to_value(a).unwrap();
    for naam in [
        "schema",
        "requestId",
        "documentId",
        "sourceVersion",
        "snapshotSha256",
        "clientId",
    ] {
        assert_eq!(a[naam], r[naam], "Envelop {naam}")
    }
}
#[test]
fn standaard_uit_en_slechte_levensduur_geweigerd() {
    assert!(matches!(
        Adapter::nieuw(false, binding()),
        Err(AdapterFout::Uitgeschakeld)
    ));
    let mut b = binding();
    b.levensduur = 0;
    assert!(matches!(
        Adapter::nieuw(true, b),
        Err(AdapterFout::Ongeldig(_))
    ))
}
#[test]
fn verkeerd_venster_document_en_generatie_nemen_geen_opdracht_over() {
    let b = binding();
    let mut k = Adapter::nieuw(true, b.clone()).unwrap();
    for veld in 0..3 {
        let mut vreemd = b.clone();
        match veld {
            0 => vreemd.eigenaar = "ander".into(),
            1 => vreemd.document = "ander".into(),
            _ => vreemd.levensduur += 1,
        };
        assert_eq!(k.bereid(&vreemd, 1, vraag()), Err(AdapterFout::Verouderd))
    }
    let mut a = vraag();
    a.document_id = "ander".into();
    assert_eq!(k.bereid(&b, 1, a), Err(AdapterFout::Verouderd));
    let a = vraag();
    let r = k.bereid(&b, 1, a.clone()).unwrap();
    controleer_envelop(&a, &r);
    assert_eq!(r["route"], "gereed")
}
#[test]
fn volgorde_en_fouten_hebben_eenduidige_toelating() {
    let b = binding();
    let mut k = Adapter::nieuw(true, b.clone()).unwrap();
    assert_eq!(k.bereid(&b, 2, vraag()), Err(AdapterFout::Volgorde));
    let mut a = vraag();
    a.snapshot_sha256 = "0".repeat(64);
    assert!(matches!(k.bereid(&b, 1, a), Err(AdapterFout::Ongeldig(_))));
    assert_eq!(k.bereid(&b, 1, vraag()), Err(AdapterFout::Volgorde));
    assert_eq!(k.bereid(&b, 2, vraag()).unwrap()["route"], "gereed");
    assert_eq!(k.bereid(&b, 2, vraag()), Err(AdapterFout::Volgorde))
}
#[test]
fn onbekende_basis_vraagt_alleen_volledige_bron() {
    let b = binding();
    let mut k = Adapter::nieuw(true, b.clone()).unwrap();
    let mut a = vraag();
    a.basis = Some("onbekend".into());
    let r = k.bereid(&b, 1, a.clone()).unwrap();
    controleer_envelop(&a, &r);
    assert_eq!(r["route"], "volledigeBron");
    assert_eq!(r["retryFull"], true);
    assert_eq!(r["levensduur"], b.levensduur);
    assert_eq!(r["volgnummer"], 1);
    assert!(r.get("fallbackSchema").is_none());
    assert_eq!(k.bereid(&b, 2, vraag()).unwrap()["route"], "gereed")
}
#[test]
fn capaciteit_is_alleen_advies_zonder_delta_en_corruptie_geeft_nooit_advies() {
    let b = binding();
    let mut k = Adapter::nieuw(true, b.clone()).unwrap();
    k.stel_proefgrens(1);
    let a = vraag();
    let r = k.bereid(&b, 1, a.clone()).unwrap();
    controleer_envelop(&a, &r);
    assert_eq!(r["route"], "bestaandeRoute");
    assert_eq!(r["fallbackSchema"], 2);
    assert_eq!(r["requiresFull"], true);
    assert_eq!(r["levensduur"], b.levensduur);
    assert_eq!(r["volgnummer"], 1);
    assert_eq!(r["reden"], "bron");
    assert!(r.get("delta").is_none() && r.get("basis").is_none() && r.get("retryFull").is_none());
    let mut a = vraag();
    a.snapshot_sha256 = "0".repeat(64);
    assert!(matches!(k.bereid(&b, 2, a), Err(AdapterFout::Ongeldig(_))))
}
#[test]
fn vergeten_en_vervangen_document_accepteren_geen_laat_antwoord() {
    let b = binding();
    let mut k = Adapter::nieuw(true, b.clone()).unwrap();
    let _laat = k.bereid(&b, 1, vraag()).unwrap();
    assert!(k.antwoord_actueel(&b));
    k.vergeet();
    assert!(!k.antwoord_actueel(&b));
    assert_eq!(k.bereid(&b, 2, vraag()), Err(AdapterFout::Verouderd));
    let mut nieuw = b.clone();
    nieuw.levensduur += 1;
    let k = Adapter::nieuw(true, nieuw).unwrap();
    assert!(!k.antwoord_actueel(&b))
}
#[test]
fn adapters_op_eigen_werkers_blijven_gescheiden() {
    use std::sync::mpsc;
    let mut threads = vec![];
    for venster in ["links", "rechts"] {
        let (tx, rx) = mpsc::channel::<(Binding, u64, Vraag)>();
        let (ant, ontvangst) = mpsc::channel();
        let mut b = binding();
        b.eigenaar = venster.into();
        let actief = b.clone();
        let th = std::thread::spawn(move || {
            let mut k = Adapter::nieuw(true, actief).unwrap();
            while let Ok((b, n, a)) = rx.recv() {
                ant.send(k.bereid(&b, n, a)).unwrap()
            }
        });
        threads.push((tx, ontvangst, th, b))
    }
    for (tx, _, _, b) in &threads {
        tx.send((b.clone(), 1, vraag())).unwrap()
    }
    for (_, rx, _, _) in &threads {
        assert_eq!(rx.recv().unwrap().unwrap()["route"], "gereed")
    }
    for (tx, _, th, _) in threads {
        drop(tx);
        th.join().unwrap()
    }
}
#[test]
fn echte_opgenomen_geschiedenis_houdt_alle_inhoudelijke_antwoordvelden() {
    let path = std::env::var("WRITER_EIGEN_REEKS").expect("Geef eigen corpus");
    let rows: Vec<Value> = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(rows.len(), 25);
    let mut b = binding();
    b.document = rows[0]["aanvraag"]["documentId"].as_str().unwrap().into();
    let mut k = Adapter::nieuw(true, b.clone()).unwrap();
    let mut basis = Value::Null;
    for (nr, row) in rows.iter().enumerate() {
        let mut a = row["aanvraag"].clone();
        a["schema"] = json!(3);
        if nr > 0 {
            a["basis"] = basis.clone()
        };
        let a: Vraag = serde_json::from_value(a).unwrap();
        let mut got = k.bereid(&b, nr as u64 + 1, a.clone()).unwrap();
        controleer_envelop(&a, &got);
        assert_eq!(got["route"], "gereed");
        assert_eq!(got["levensduur"], b.levensduur);
        assert_eq!(got["volgnummer"], nr as u64 + 1);
        basis = got["basis"].clone();
        got.as_object_mut().unwrap().remove("route");
        got.as_object_mut().unwrap().remove("levensduur");
        got.as_object_mut().unwrap().remove("volgnummer");
        let mut expected = row["antwoord"].clone();
        expected.as_object_mut().unwrap().remove("preparationMs");
        expected["schema"] = json!(3);
        expected["basis"] = basis.clone();
        assert_eq!(got, expected, "Groep {nr}")
    }
}

#[test]
fn legacy_schema_wordt_niet_als_journaal_behandeld() {
    let b = binding();
    let mut k = Adapter::nieuw(true, b.clone()).unwrap();
    for schema in [1, 2, 4] {
        let mut a = vraag();
        a.schema = schema;
        assert!(matches!(k.bereid(&b, 1, a), Err(AdapterFout::Ongeldig(_))));
    }
    assert_eq!(k.bereid(&b, 1, vraag()).unwrap()["route"], "gereed");
}
