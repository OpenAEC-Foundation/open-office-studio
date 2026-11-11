mod journaal;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_journal::{EditCtx, EditingDoc, Loc, LocRange};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, time::Instant};
fn hash(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect()
}
fn controleer(doc: &EditingDoc, a: &Vraag, r: &Value) {
    let ctx = if let Some(v) = &a.author {
        EditCtx::local(&v.name, &v.date).suggesting()
    } else {
        EditCtx::local("", "")
    };
    let l = Loc::new(&a.position.story, &a.position.para_id, a.position.offset);
    let v = docx_journal::prepare_journal_fragment(
        doc,
        &LocRange {
            start: l.clone(),
            end: l,
        },
        &json!({"paragraphs":[{"text":a.text}]}),
        &ctx,
    )
    .unwrap();
    assert_eq!(r["delta"], json!(STANDARD.encode(v.update)));
    assert_eq!(
        r["caret"],
        json!({"story":v.caret.story,"paraId":v.caret.para,"offset":v.caret.offset})
    );
}
use office_writer_plakken::IncrementeleTekstAanvraag as Vraag;
fn vraag(v: &Value) -> Vraag {
    serde_json::from_value(v.clone()).unwrap()
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).ok_or("Geef eigen aanvraagreeks")?;
    let rows: Vec<Value> = serde_json::from_slice(&fs::read(path)?)?;
    assert!(rows.len() <= 64);
    let mut j = journaal::Journaal::default();
    let mut rondes = vec![];
    for (nr, row) in rows.iter().enumerate() {
        let mut a = row["aanvraag"].clone();
        a["schema"] = json!(3);
        if nr > 0 {
            a["basis"] = json!(j.actuele_token().unwrap())
        }
        let begin = Instant::now();
        let got = j
            .bereid(vraag(&a))?
            .ok_or("Onverwacht nieuwe bron gevraagd")?;
        let ms = begin.elapsed().as_secs_f64() * 1000.;
        let mut expected = row["antwoord"].clone();
        expected.as_object_mut().unwrap().remove("preparationMs");
        expected["schema"] = json!(3);
        expected["basis"] = got["basis"].clone();
        assert_eq!(got, expected, "Groep {nr}: inhoudelijke antwoordafwijking");
        rondes
            .push(json!({"groep":nr,"ms":ms,"antwoord_gelijk_behalve_schema_token_meettijd":true}));
    }
    assert_eq!(j.hergebruikt, rows.len() - 1);
    assert_eq!(j.herbouwd, 1);
    let reference = EditingDoc::new(rows[0]["aanvraag"]["clientId"].as_u64().unwrap());
    reference.keep_deleted();
    docx_journal::import_journal_source(
        &reference,
        &STANDARD.decode(rows[0]["aanvraag"]["snapshot"].as_str().unwrap())?,
    )?;
    for row in &rows {
        docx_journal::import_journal_source(
            &reference,
            &STANDARD.decode(row["antwoord"]["delta"].as_str().unwrap())?,
        )?;
    }
    assert_eq!(
        j.laatste_bron()?,
        reference.encode_state_as_update_v1(),
        "Volledige eindbron wijkt af"
    );
    let token = j.actuele_token().unwrap().to_owned();
    let mut negatief = vec![];
    let mut geldig = rows.last().unwrap()["aanvraag"].clone();
    geldig["schema"] = json!(3);
    geldig["basis"] = json!(token);
    for (naam, veld, waarde, volledig) in [
        ("schema", "schema", json!(2), false),
        ("hash", "snapshotSha256", json!("0".repeat(64)), false),
        ("base64", "snapshot", json!("!"), false),
        ("lege_tekst", "text", json!(""), false),
        ("alineagrens", "text", json!("a\nb"), false),
        ("request", "requestId", json!(""), false),
        ("basis", "basis", json!("0".repeat(64)), true),
        ("document", "documentId", json!("ander"), true),
        ("client", "clientId", json!(1), true),
        ("vector", "sourceVector", json!("AA=="), false),
    ] {
        let mut a = geldig.clone();
        a[veld] = waarde;
        let r = j.bereid(vraag(&a));
        assert!(
            if volledig {
                matches!(r, Ok(None))
            } else {
                r.is_err()
            },
            "Negatief {naam}"
        );
        assert_eq!(j.actuele_token(), Some(token.as_str()));
        negatief.push(naam);
    }

    // Na de mislukte vectorproef is de oude bevestigde bron nog bruikbaar.
    let laatste = rows.last().unwrap();
    let delta = STANDARD.decode(laatste["antwoord"]["delta"].as_str().unwrap())?;
    let mut herstel = laatste["aanvraag"].clone();
    herstel["schema"] = json!(3);
    herstel["basis"] = json!(j.actuele_token().unwrap());
    herstel["snapshot"] = json!(STANDARD.encode(&delta));
    herstel["snapshotSha256"] = json!(hash(&delta));
    herstel["sourceVector"] = json!(STANDARD.encode(reference.encode_state_vector_v1()));
    herstel["position"] = laatste["antwoord"]["caret"].clone();
    herstel["text"] = json!("x");
    herstel["requestId"] = json!("herstel");
    herstel["sourceVersion"] = json!("herstel");
    let antwoord = j
        .bereid(vraag(&herstel))?
        .ok_or("Herstel vraagt onverwacht nieuwe bron")?;
    controleer(&reference, &vraag(&herstel), &antwoord);
    assert_eq!(j.laatste_bron()?, reference.encode_state_as_update_v1());
    negatief.push("herstel_na_vectorfout");
    // Een niet-bevestigd voorstel wordt bij een andere geldige delta verlaten.
    let mut verlaten = journaal::Journaal::default();
    let mut a = rows[0]["aanvraag"].clone();
    a["schema"] = json!(3);
    let _ = verlaten.bereid(vraag(&a))?;
    a["basis"] = json!(verlaten.actuele_token().unwrap());
    a["snapshot"] = json!(STANDARD.encode([0u8, 0]));
    a["snapshotSha256"] = json!(hash(&[0, 0]));
    a["text"] = json!("anders");
    let r = verlaten
        .bereid(vraag(&a))?
        .ok_or("Afwijkend geldig voorstel vraagt nieuwe bron")?;
    let fresh = EditingDoc::new(rows[0]["aanvraag"]["clientId"].as_u64().unwrap());
    fresh.keep_deleted();
    docx_journal::import_journal_source(
        &fresh,
        &STANDARD.decode(rows[0]["aanvraag"]["snapshot"].as_str().unwrap())?,
    )?;
    controleer(&fresh, &vraag(&a), &r);
    assert_eq!(verlaten.laatste_bron()?, fresh.encode_state_as_update_v1());
    assert_eq!(verlaten.hergebruikt, 0);
    assert_eq!(verlaten.herbouwd, 2);
    negatief.push("onbevestigd_voorstel_verlaten");

    // Een fout na voorbereiding mag de bevestigde bron niet vervangen.
    let mut krap = journaal::Journaal::default();
    let mut start = rows[0]["aanvraag"].clone();
    start["schema"] = json!(3);
    let _ = krap.bereid(vraag(&start))?;
    let oud = krap.actuele_token().unwrap().to_owned();
    krap.grens = krap.bytes() + 1;
    let mut tweede = rows[1]["aanvraag"].clone();
    tweede["schema"] = json!(3);
    tweede["basis"] = json!(oud);
    assert!(krap.bereid(vraag(&tweede)).is_err());
    assert_eq!(krap.actuele_token(), Some(oud.as_str()));
    krap.grens = 64 * 1024 * 1024;
    let r = krap
        .bereid(vraag(&tweede))?
        .ok_or("Geen herstel na bytegrens")?;
    let mut verwacht = rows[1]["antwoord"].clone();
    verwacht.as_object_mut().unwrap().remove("preparationMs");
    verwacht["schema"] = json!(3);
    verwacht["basis"] = r["basis"].clone();
    assert_eq!(r, verwacht);
    negatief.push("bytegrens_na_mutatie_en_herstel");
    let oud_token = verlaten.actuele_token().unwrap().to_owned();
    let r = verlaten
        .bereid(vraag(&start))?
        .ok_or("Volledige bronreset mislukt")?;
    assert_ne!(verlaten.actuele_token(), Some(oud_token.as_str()));
    let mut verwacht = rows[0]["antwoord"].clone();
    verwacht.as_object_mut().unwrap().remove("preparationMs");
    verwacht["schema"] = json!(3);
    verwacht["basis"] = r["basis"].clone();
    assert_eq!(r, verwacht);
    negatief.push("volledige_bronreset");
    let mut beperkt = journaal::Journaal::default();
    beperkt.grens = 10;
    let mut a = rows[0]["aanvraag"].clone();
    a["schema"] = json!(3);
    assert!(beperkt.bereid(vraag(&a)).is_err());
    assert!(beperkt.actuele_token().is_none());
    negatief.push("bytegrens");
    let mut stappen = journaal::Journaal::default();
    let _ = stappen.bereid(vraag(&a))?;
    stappen.max_stappen = 0;
    let t = stappen.actuele_token().unwrap().to_owned();
    a = rows[1]["aanvraag"].clone();
    a["schema"] = json!(3);
    a["basis"] = json!(t);
    assert!(stappen.bereid(vraag(&a))?.is_none());
    negatief.push("stapgrens");
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"schema":3,"uitsluitend_proef":true,"rondes":rondes,"hergebruikt":j.hergebruikt,"herbouwd":j.herbouwd,"volledige_eindbron_bytegelijk":true,"journal_en_voorstel_bytes":j.bytes(),"negatieve_bindingen":negatief,"grens":"Geen desktop-, Undo/revisie-, volledige suite- of prestatieacceptatie; schema en bron-token veranderen uitsluitend in deze losse proef."})
        )?
    );
    Ok(())
}
