mod referentie { include!(".local/referentie.rs"); }
mod kandidaat { include!(".local/kandidaat.rs"); }
use yrs::{Transact,StateVector,updates::decoder::Decode};
use std::{fs,time::Instant};
fn main() {
    let root=std::path::PathBuf::from(std::env::args().nth(1).unwrap());
    let bytes=fs::read(root.join("bron.bin")).unwrap();
    let doc=docx_edit::EditingDoc::new(20264562);doc.keep_deleted();
    doc.yrs_doc().transact_mut().apply_update(yrs::Update::decode_v1(&bytes).unwrap()).unwrap();
    let txn=doc.yrs_doc().transact();
    assert_eq!(referentie::encode_state_as_update_v1(&txn,&StateVector::default()),bytes);
    let grens=std::env::args().nth(2).map(|s|s.parse::<usize>().unwrap()).unwrap_or(8*1024*1024);
    let mut cache=kandidaat::ProefReplica::nieuw(&bytes,grens);
    let begin=Instant::now(); assert_eq!(cache.snapshot(),bytes);
    println!("{}",serde_json::json!({"fase":"koud","ns":begin.elapsed().as_nanos(),"cijfers":cache.cijfers(),"bytes":bytes.len(),"exact":true}));
    // Afwisselende volgorde beperkt opwarming/verloop; elke byte wordt vergeleken.
    for ronde in 0..4 {
        let volgorde=if ronde%2==0 {[false,true]}else{[true,false]};
        for kandidaat in volgorde {
            let begin=Instant::now();
            for _ in 0..10 {let uit=if kandidaat {cache.snapshot()}else{referentie::encode_state_as_update_v1(&txn,&StateVector::default())};assert_eq!(uit,bytes);}
            println!("{}",serde_json::json!({"fase":"warm","ronde":ronde,"kandidaat":kandidaat,"herhalingen":10,"ns":begin.elapsed().as_nanos(),"cijfers":cache.cijfers(),"exact":true}));
        }
    }
}
