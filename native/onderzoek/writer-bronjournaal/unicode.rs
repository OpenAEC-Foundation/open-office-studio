//! Alleen de laatste tekst van de eigen geschiedenisreeks krijgt Unicode.
//! Dit is een native afgeleide proef, geen GUI-/IME-invoerbewijs.
use office_writer_plakken::{BronSpiegel, IncrementeleTekstAanvraag};
use serde_json::{Value, json};
use std::fs;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let mut rows: Vec<Value> = serde_json::from_slice(&fs::read(&args[1])?)?;
    assert!(rows.len() > 1 && rows.len() <= 64);
    let last = rows.len() - 1;
    let tekst = " café, naïef — € 😀 漢字";
    let mut spiegel = BronSpiegel::default();
    for (nr, row) in rows.iter_mut().enumerate() {
        if nr == last {
            row["aanvraag"]["text"] = json!(tekst);
            if args.iter().any(|v| v == "--revisie") {
                row["aanvraag"]["author"] =
                    json!({"name":"Proefauteur","date":"2026-11-11T00:00:00Z"});
            }
            row["aanvraag"]["requestId"] = json!("unicode-proef");
        }
        let a: IncrementeleTekstAanvraag = serde_json::from_value(row["aanvraag"].clone())?;
        let p = a.position.clone();
        let r = spiegel.bereid_voor(a)?.ok_or("Onverwachte nieuwe bron")?;
        let mut antwoord = serde_json::to_value(r.resultaat)?;
        antwoord["schema"] = json!(2);
        antwoord["basis"] = json!(r.basis);
        antwoord["bronvector"] = json!(r.bronvector);
        if nr < last {
            let mut oud = row["antwoord"].clone();
            oud.as_object_mut().unwrap().remove("preparationMs");
            let mut nieuw = antwoord.clone();
            nieuw.as_object_mut().unwrap().remove("preparationMs");
            assert_eq!(oud, nieuw, "Eerdere werkelijke groep wijkt af");
        } else {
            assert_eq!(antwoord["caret"]["story"], json!(p.story));
            assert_eq!(antwoord["caret"]["paraId"], json!(p.para_id));
            assert_eq!(
                antwoord["caret"]["offset"].as_u64().unwrap(),
                u64::from(p.offset) + tekst.encode_utf16().count() as u64,
                "Unicode-cursor telt niet in UTF-16"
            );
        }
        row["antwoord"] = antwoord;
    }
    fs::write(&args[2], serde_json::to_vec_pretty(&rows)?)?;
    println!(
        "Unicode-orakel en UTF-16-cursor groen; {} groepen",
        rows.len()
    );
    Ok(())
}
