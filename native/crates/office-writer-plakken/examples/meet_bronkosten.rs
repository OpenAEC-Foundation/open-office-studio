//! Meet bronbewerkingen op een eigen, vastgelegde native invoeraanvraag.
//! Geen renderer-, IPC-, FPS- of volledige applicatieacceptatie.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_edit::EditingDoc;
use office_writer_plakken::{BronSpiegel, IncrementeleTekstAanvraag, snapshot_sha256};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{hint::black_box, time::Instant};
use yrs::{StateVector, updates::decoder::Decode};

fn meet(mut werk: impl FnMut(), aantal: usize) -> Vec<u64> {
    (0..aantal)
        .map(|_| {
            let begin = Instant::now();
            werk();
            begin.elapsed().as_nanos().try_into().unwrap_or(u64::MAX)
        })
        .collect()
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pad = std::env::args()
        .nth(1)
        .ok_or("Geef een eigen aanvraag-JSON als argument")?;
    let bestand = std::fs::read(pad)?;
    let mut a: IncrementeleTekstAanvraag = serde_json::from_slice(&bestand)?;
    assert!(a.basis.is_none(), "De beginbron moet volledig zijn");
    let bron = STANDARD.decode(&a.snapshot)?;
    assert_eq!(snapshot_sha256(&bron), a.snapshot_sha256);
    let doc = EditingDoc::new(a.client_id);
    doc.keep_deleted();
    doc.apply_update_v1(&bron)?;
    assert_eq!(
        StateVector::decode_v1(&doc.encode_state_vector_v1())?,
        StateVector::decode_v1(&STANDARD.decode(&a.source_vector)?)?,
        "De meetimport heeft de bronvector gewijzigd"
    );
    let momentopname = doc.encode_state_as_update_v1();
    let aantal = 20;
    let sha_ns = meet(
        || {
            black_box(Sha256::digest(black_box(&momentopname)));
        },
        aantal,
    );
    let sha_hex_ns = meet(
        || {
            black_box(snapshot_sha256(black_box(&momentopname)));
        },
        aantal,
    );
    let serialiseer_ns = meet(
        || {
            black_box(doc.encode_state_as_update_v1());
        },
        aantal,
    );
    let mut spiegel = BronSpiegel::default();
    let mut stappen = Vec::new();
    for n in 0..aantal {
        let begin = Instant::now();
        let r = spiegel
            .bereid_voor(a.clone())?
            .ok_or("Onverwacht ontbrekende bron")?;
        let totaal_ns: u64 = begin.elapsed().as_nanos().try_into()?;
        let delta = STANDARD.decode(&r.resultaat.delta)?;
        doc.apply_update_v1(&delta)?;
        let nieuwe_bron = doc.encode_diff_v1(&STANDARD.decode(&r.bronvector)?)?;
        assert_eq!(
            nieuwe_bron, delta,
            "De volgende bron is niet exact het overgenomen voorstel"
        );
        stappen.push(json!({"ronde":n,"voorbereiding_ms":r.resultaat.preparation_ms,"totaal_ns":totaal_ns,"bronbytes":STANDARD.decode(&a.snapshot)?.len(),"bewaarbytes":spiegel.bytes()}));
        a.request_id = format!("meting-{}", n + 1);
        a.source_version = format!("bron-{}", n + 1);
        a.basis = Some(r.basis);
        a.source_vector = STANDARD.encode(doc.encode_state_vector_v1());
        a.snapshot_sha256 = snapshot_sha256(&nieuwe_bron);
        a.snapshot = STANDARD.encode(nieuwe_bron);
        a.position = r.resultaat.caret;
        a.text = "x".into();
    }
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"schema":1,"aanvraag_sha256":snapshot_sha256(&bestand),"bronbytes":bron.len(),"geimporteerde_bytes":momentopname.len(),"sha_ns":sha_ns,"sha_hex_ns":sha_hex_ns,"serialiseer_ns":serialiseer_ns,"voorbereidingen":stappen,"grens":"Geoptimaliseerde losse Rust-meting op één eigen bron; geen IPC, renderer of algemene applicatieacceptatie."})
        )?
    );
    Ok(())
}
