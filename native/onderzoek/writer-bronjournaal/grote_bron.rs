//! Werkelijke bytebudgetten met eigen opaque binaire metadata, geen paginabelasting.
mod journaal;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_journal::{EditCtx, EditingDoc, Loc, LocRange};
use journaal::{Fout, Journaal, Middelengrens};
use office_writer_plakken::{BronSpiegel, Cursor, IncrementeleTekstAanvraag as Vraag};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use yrs::{Any, Map, Transact};
fn hash(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect()
}
fn vraag(doc: &EditingDoc, bytes: &[u8], schema: u8) -> Vraag {
    Vraag {
        schema,
        basis: None,
        request_id: "grote-bron".into(),
        document_id: "eigen-binaire-bron".into(),
        source_version: "begin".into(),
        source_vector: STANDARD.encode(doc.encode_state_vector_v1()),
        snapshot_sha256: hash(bytes),
        snapshot: STANDARD.encode(bytes),
        client_id: 21,
        position: Cursor {
            story: "body".into(),
            para_id: "p0".into(),
            offset: 5,
        },
        text: "x".into(),
        author: None,
    }
}
fn vervolgen(
    doc: &EditingDoc,
    j: &mut Journaal,
    eerste: &Value,
    aantal: usize,
) -> Result<Value, Box<dyn std::error::Error>> {
    let mut delta = STANDARD.decode(eerste["delta"].as_str().unwrap())?;
    let mut offset = 6u64;
    let mut resets = 0;
    let mut metingen = vec![];
    let mut volledige_controles = 0;
    for nr in 1..=aantal {
        let tekst = if nr % 7 == 0 { "😀" } else { "x" };
        let mut a = vraag(doc, &delta, 3);
        a.basis = Some(j.actuele_token().ok_or("Token ontbreekt")?.into());
        a.position.offset = offset as u32;
        a.text = tekst.into();
        a.request_id = format!("vervolg-{nr}");
        a.source_version = format!("bron-{nr}");
        let got = match j.bereid_getypeerd(a)? {
            Some(v) => v,
            None => {
                resets += 1;
                let mut a = vraag(doc, &doc.encode_state_as_update_v1(), 3);
                a.position.offset = offset as u32;
                a.text = tekst.into();
                a.request_id = format!("herstart-{nr}");
                a.source_version = format!("bron-{nr}");
                j.bereid_getypeerd(a)?
                    .ok_or("Volledige herstart weigert bron")?
            }
        };
        let loc = Loc::new("body", "p0", offset as u32);
        let oracle = docx_journal::prepare_journal_fragment(
            doc,
            &LocRange {
                start: loc.clone(),
                end: loc,
            },
            &json!({"paragraphs":[{"text":tekst}]}),
            &EditCtx::local("", ""),
        )?;
        assert_eq!(
            got["delta"],
            json!(STANDARD.encode(&oracle.update)),
            "Delta {nr}"
        );
        offset += tekst.encode_utf16().count() as u64;
        assert_eq!(
            got["caret"],
            json!({"story":"body","paraId":"p0","offset":offset})
        );
        delta = STANDARD.decode(got["delta"].as_str().unwrap())?;
        assert!(j.bytes() <= j.grens);
        if nr % 64 == 0 || nr == aantal {
            assert_eq!(
                j.laatste_bron()?,
                doc.encode_state_as_update_v1(),
                "Bron {nr}"
            );
            volledige_controles += 1;
            let status = std::fs::read_to_string("/proc/self/status")?;
            let rss: usize = status
                .lines()
                .find(|v| v.starts_with("VmRSS:"))
                .ok_or("RSS ontbreekt")?
                .split_whitespace()
                .nth(1)
                .unwrap()
                .parse()?;
            metingen.push(json!({"stap":nr,"rss_kib":rss,"opgeslagen_bytes":j.bytes()}));
        }
    }
    assert_eq!(resets, aantal / 257);
    assert_eq!(j.hergebruikt, aantal - resets);
    assert_eq!(j.herbouwd, resets + 1);
    Ok(
        json!({"vervolgen":aantal,"volledige_herstarts":resets,"alle_delta_en_cursors_exact":true,"volledige_broncontroles":volledige_controles,"metingen":metingen,"grens":"Eén begrensde reeks op opaque binaire bron; geen algemene heapgrens of urenlange lektest."}),
    )
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mib: usize = std::env::args()
        .nth(1)
        .ok_or("Geef 63,65,99 of101 MiB")?
        .parse()?;
    assert!([63, 65, 99, 101].contains(&mib));
    let stappen: usize = std::env::args().nth(2).unwrap_or("0".into()).parse()?;
    assert!(stappen <= 1028 && (stappen == 0 || mib == 63));
    let doc = EditingDoc::new(21);
    doc.keep_deleted();
    doc.create_story_with_paragraph_id("body", "p0", "Begin", "Normal", "left")?;
    let blob: Arc<[u8]> = vec![0x5a; mib * 1024 * 1024].into();
    let map = doc
        .yrs_doc()
        .get_or_insert_map("eigen-opaque-proefgegevens");
    map.insert(
        &mut doc.yrs_doc().transact_mut(),
        "bytes",
        Any::Buffer(blob),
    );
    let bytes = doc.encode_state_as_update_v1();
    let n = bytes.len();
    assert!(n > mib * 1024 * 1024 && n < mib * 1024 * 1024 + 2048);
    let mut j = Journaal::default();
    let got = j.bereid_getypeerd(vraag(&doc, &bytes, 3));
    if mib == 101 {
        assert!(matches!(got, Err(Fout::Ongeldig(_))));
        assert!(
            BronSpiegel::default()
                .bereid_voor(vraag(&doc, &bytes, 2))
                .is_err()
        );
        assert!(j.actuele_token().is_none());
        println!(
            "{}",
            json!({"payload_mib":mib,"bronbytes":n,"beide_routes_weigeren_boven_100_mib":true})
        );
        return Ok(());
    }
    let r = if mib == 63 {
        got?.ok_or("Journaal weigert geldige bron")?
    } else {
        assert_eq!(got, Err(Fout::BestaandeRouteNodig(Middelengrens::Bron)));
        assert!(j.actuele_token().is_none());
        serde_json::to_value(
            BronSpiegel::default()
                .bereid_voor(vraag(&doc, &bytes, 2))?
                .ok_or("Oude route weigert volledige bron")?
                .resultaat,
        )?
    };
    let loc = Loc::new("body", "p0", 5);
    let oracle = docx_journal::prepare_journal_fragment(
        &doc,
        &LocRange {
            start: loc.clone(),
            end: loc,
        },
        &json!({"paragraphs":[{"text":"x"}]}),
        &EditCtx::local("", ""),
    )?;
    assert_eq!(r["delta"], json!(STANDARD.encode(&oracle.update)));
    assert_eq!(r["caret"], json!({"story":"body","paraId":"p0","offset":6}));
    if mib == 63 {
        assert_eq!(j.laatste_bron()?, doc.encode_state_as_update_v1());
        assert!(j.bytes() <= j.grens)
    }
    // Onafhankelijke import van de oude bron plus antwoord moet exact de door
    // de fragmentbewerking verkregen bron inclusief alle metadata teruggeven.
    let terug = EditingDoc::new(21);
    terug.keep_deleted();
    docx_journal::import_journal_source(&terug, &bytes)?;
    docx_journal::import_journal_source(&terug, &STANDARD.decode(r["delta"].as_str().unwrap())?)?;
    assert_eq!(
        terug.encode_state_as_update_v1(),
        doc.encode_state_as_update_v1()
    );
    drop(terug);
    let sessie = if stappen > 0 {
        vervolgen(&doc, &mut j, &r, stappen)?
    } else {
        Value::Null
    };
    println!(
        "{}",
        json!({"payload_mib":mib,"bronbytes":n,"bron_sha256":hash(&bytes),"journaalroute":mib==63,"expliciete_bestaande_route":mib>64,"delta_en_utf16_caret_exact":true,"volledige_bron_met_binaire_metadata_bytegelijk":true,"journaal_opgeslagen_bytes":j.bytes(),"sessie":sessie,"grens":"Opaque metadata in eigen kleine tekstbron; geen grote tekst-/pagina-, desktop-, FPS- of langdurige-heapacceptatie."})
    );
    Ok(())
}
