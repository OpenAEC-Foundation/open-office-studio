// De werkelijke ongewijzigde encoder en een kopie met uitsluitend methodeklokken.
mod referentie { include!(".local/referentie-encoder.rs"); }
mod gemeten { include!(".local/fasen-encoder.rs"); }
use yrs::{Transact, ReadTxn, StateVector, updates::decoder::Decode};
use std::{fs, time::Instant};

fn main() {
    let root = std::path::PathBuf::from(std::env::args().nth(1).expect("Eigen proefmap ontbreekt"));
    let bytes = fs::read(root.join("encoderbron.bin")).unwrap();
    let vector = fs::read(root.join("encoderbron-vector.bin")).unwrap();
    let doc = docx_edit::EditingDoc::new(20264562);
    doc.keep_deleted();
    // Exact dezelfde laag-niveautoepassing als de bevestigde native bronimport.
    doc.yrs_doc().transact_mut().apply_update(yrs::Update::decode_v1(&bytes).unwrap()).unwrap();
    assert_eq!(doc.yrs_doc().transact().state_vector(), StateVector::decode_v1(&vector).unwrap());
    let txn = doc.yrs_doc().transact();
    let verwacht = referentie::encode_state_as_update_v1(&txn, &StateVector::default());
    assert_eq!(verwacht, bytes, "De oorspronkelijke bronbytes moeten behouden blijven");
    assert_eq!(verwacht, doc.encode_state_as_update_v1());
    assert_eq!(verwacht, gemeten::encode_state_as_update_v1(&txn, &StateVector::default()));
    for ronde in 0..3 {
        let begin = Instant::now();
        for _ in 0..10 { assert_eq!(referentie::encode_state_as_update_v1(&txn, &StateVector::default()), verwacht); }
        let referentie_ns = begin.elapsed().as_nanos() as u64;
        gemeten::reset_proef();
        let begin = Instant::now();
        for _ in 0..10 { assert_eq!(gemeten::encode_state_as_update_v1(&txn, &StateVector::default()), verwacht); }
        let gemeten_ns = begin.elapsed().as_nanos() as u64;
        println!("{}", serde_json::json!({"ronde":ronde,"herhalingen":10,"bytes":verwacht.len(),"referentie_ns":referentie_ns,"gemeten_ns":gemeten_ns,"methodeklokken":gemeten::lees_proef(),"alle_bytes_exact":true,"invoer_bytegelijk":verwacht==bytes}));
    }
}
