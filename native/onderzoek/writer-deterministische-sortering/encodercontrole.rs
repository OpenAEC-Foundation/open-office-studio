// Beide daadwerkelijke encoders: alleen de bestaande algemene testmodule weglaten.
mod referentie { include!(".local/referentie-encoder.rs"); }
mod kandidaat { include!(".local/kandidaat-encoder.rs"); }
use std::{collections::HashMap, sync::Arc};
use yrs::{Any, Doc, Map, Text, Transact, StateVector};

fn vergelijk(v: &Any) {
    assert_eq!(referentie::encodeer_proef(v), kandidaat::encodeer_proef(v));
}
fn waarden() -> Vec<Any> {
    vec![Any::Null, Any::Undefined, Any::Bool(true), Any::Bool(false),
        Any::Number(0.0), Any::Number(-0.0), Any::Number(1.5),
        Any::Number(f64::NAN), Any::Number(f64::INFINITY), Any::Number(f64::NEG_INFINITY),
        Any::Number(9_007_199_254_740_991.0), Any::BigInt(i64::MIN), Any::BigInt(i64::MAX),
        Any::from("Eigen tekst 😀\n\"\\\u{0}"), Any::Buffer(Arc::from([0, 1, 127, 255]))]
}
#[test]
fn alle_waarden_en_geneste_sleutelvolgorden_blijven_bytegelijk() {
    let sleutels = ["z", "a", "", "é", "e\u{301}", "😀", "\u{0}", "aa", "A"];
    for waarde in waarden() {
        vergelijk(&waarde);
        for verschuiving in 0..sleutels.len() {
            let mut map = HashMap::new();
            for i in 0..sleutels.len() {
                let k = sleutels[(i + verschuiving) % sleutels.len()];
                map.insert(k.to_owned(), Any::Array(Arc::from([waarde.clone(), Any::from(k)])));
            }
            let mut genest = Any::Map(Arc::new(map));
            for _ in 0..5 {
                vergelijk(&genest);
                genest = Any::Map(Arc::new(HashMap::from([
                    ("later".into(), genest), ("eerder".into(), waarde.clone()),
                ])));
            }
        }
    }
}
#[test]
fn levende_bron_na_invoegen_verwijderen_en_externe_update_blijft_bytegelijk() {
    let doc = Doc::new();
    let tekst = doc.get_or_insert_text("eigen tekst");
    let kaart = doc.get_or_insert_map("eigen waarden");
    for (i, waarde) in waarden().into_iter().enumerate() {
        kaart.insert(&mut doc.transact_mut(), format!("sleutel-{i}"), waarde);
    }
    tekst.insert(&mut doc.transact_mut(), 0, "Voor 😀 na");
    for i in 0..12 {
        tekst.insert(&mut doc.transact_mut(), 0, "toe ");
        if i % 2 == 0 { tekst.remove_range(&mut doc.transact_mut(), 0, 2); }
        let txn = doc.transact();
        assert_eq!(referentie::encode_state_as_update_v1(&txn, &StateVector::default()),
                   kandidaat::encode_state_as_update_v1(&txn, &StateVector::default()));
    }
    let peer = Doc::new();
    use yrs::{ReadTxn, updates::decoder::Decode};
    peer.transact_mut().apply_update(yrs::Update::decode_v1(&doc.transact().encode_state_as_update_v1(&StateVector::default())).unwrap()).unwrap();
    peer.get_or_insert_text("eigen tekst").insert(&mut peer.transact_mut(), 0, "extern ");
    doc.transact_mut().apply_update(yrs::Update::decode_v1(&peer.transact().encode_state_as_update_v1(&StateVector::default())).unwrap()).unwrap();
    let txn = doc.transact();
    assert_eq!(referentie::encode_state_as_update_v1(&txn, &StateVector::default()),
               kandidaat::encode_state_as_update_v1(&txn, &StateVector::default()));
}
