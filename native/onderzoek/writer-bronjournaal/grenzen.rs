//! Werkelijke standaardstapgrens, gecontroleerde bronreset en Unicode-cursorpariteit.
//! Alleen een kleine eigen bron; geen langdurige native-heapmeting.
mod journaal;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_journal::EditingDoc;
use office_writer_plakken::{BronSpiegel, IncrementeleTekstAanvraag as Vraag};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
fn hash(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect()
}
fn aanvraag(
    doc: &EditingDoc,
    basis: Option<String>,
    bytes: &[u8],
    positie: &Value,
    nr: usize,
) -> Value {
    json!({"schema":2,"basis":basis,"requestId":format!("grens-{nr}"),"documentId":"eigen-grensproef","sourceVersion":format!("versie-{nr}"),"sourceVector":STANDARD.encode(doc.encode_state_vector_v1()),"snapshotSha256":hash(bytes),"snapshot":STANDARD.encode(bytes),"clientId":21,"position":positie,"text":if nr%7==0 {"😀"}else{"x"}})
}
fn uitvoeren(
    refs: &mut BronSpiegel,
    j: &mut journaal::Journaal,
    vraag: &Value,
) -> Result<Value, String> {
    let r = refs
        .bereid_voor(serde_json::from_value(vraag.clone()).unwrap())?
        .ok_or("Referentie vraagt onverwacht nieuwe bron")?;
    let mut input = vraag.clone();
    input["schema"] = json!(3);
    if input["basis"].is_string() {
        input["basis"] = json!(j.actuele_token().ok_or("Journaalbasis ontbreekt")?);
    }
    let got = j
        .bereid(serde_json::from_value(input).unwrap())?
        .ok_or("Journaal weigert geldige groep")?;
    let mut expected = serde_json::to_value(r.resultaat).unwrap();
    expected.as_object_mut().unwrap().remove("preparationMs");
    expected["schema"] = json!(3);
    expected["basis"] = got["basis"].clone();
    expected["bronvector"] = json!(r.bronvector);
    assert_eq!(got, expected);
    let mut uit = got;
    uit["basis_referentie"] = json!(r.basis);
    Ok(uit)
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let doc = EditingDoc::new(21);
    doc.keep_deleted();
    doc.create_story_with_paragraph_id("body", "p0", "Begin", "Normal", "left")?;
    let mut refs = BronSpiegel::default();
    let mut j = journaal::Journaal::default();
    assert_eq!(j.max_stappen, 256);
    let mut bytes = doc.encode_state_as_update_v1();
    let mut basis = None;
    let mut positie = json!({"story":"body","paraId":"p0","offset":5});
    let mut verwachte_offset = 5u64;
    let mut grootste = 0;
    for nr in 0..=256 {
        let a = aanvraag(&doc, basis, &bytes, &positie, nr);
        let got = uitvoeren(&mut refs, &mut j, &a)?;
        bytes = STANDARD.decode(got["delta"].as_str().unwrap())?;
        docx_journal::import_journal_source(&doc, &bytes)?;
        verwachte_offset += a["text"].as_str().unwrap().encode_utf16().count() as u64;
        assert_eq!(got["caret"]["offset"].as_u64().unwrap(), verwachte_offset);
        assert_eq!(j.laatste_bron()?, doc.encode_state_as_update_v1());
        assert!(j.bytes() <= j.grens);
        grootste = grootste.max(j.bytes());
        positie = got["caret"].clone();
        basis = Some(got["basis_referentie"].as_str().unwrap().to_owned());
    }
    assert_eq!(j.hergebruikt, 256);
    assert_eq!(j.herbouwd, 1);
    let oud = j.actuele_token().unwrap().to_owned();
    let mut grens = aanvraag(&doc, basis, &bytes, &positie, 257);
    grens["schema"] = json!(3);
    grens["basis"] = json!(oud);
    let geweigerd = j.bereid(serde_json::from_value::<Vraag>(grens).unwrap())?;
    assert!(geweigerd.is_none());
    assert_eq!(j.actuele_token(), Some(oud.as_str()));
    assert_eq!(j.laatste_bron()?, doc.encode_state_as_update_v1());
    let resync = aanvraag(&doc, None, &doc.encode_state_as_update_v1(), &positie, 258);
    let got = uitvoeren(&mut refs, &mut j, &resync)?;
    docx_journal::import_journal_source(&doc, &STANDARD.decode(got["delta"].as_str().unwrap())?)?;
    assert_eq!(j.laatste_bron()?, doc.encode_state_as_update_v1());
    assert_eq!(j.herbouwd, 2);
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"257_groepen_exact":true,"256_vervolgen_hergebruikt":true,"volgende_groep_vraagt_volledige_bron":true,"afkeuring_behoudt_bron_en_voorstel":true,"volledige_bronreset_exact":true,"unicode_caret_UTF16_exact":true,"grootste_opgeslagen_bytes_voor_reset":grootste,"geconfigureerde_bytegrens":j.grens,"grens":"Kleine eigen bron en opgeslagen bytes; geen native-heap-, GUI-, platform- of langdurige grote-documentacceptatie."})
        )?
    );
    Ok(())
}
