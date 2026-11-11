//! Speel een werkelijk opgenomen invoerreeks met tussentijdse bronwijzigingen na.
//! Tokenvertaling is alleen toegestaan na controle van de oorspronkelijke binding.
mod journaal;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_journal::EditingDoc;
use office_writer_plakken::IncrementeleTekstAanvraag as Vraag;
use serde_json::{Value, json};
use std::{fs, time::Instant};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pad = std::env::args().nth(1).ok_or("Geef eigen aanvraagreeks")?;
    let bytes = fs::read(pad)?;
    assert!(bytes.len() < 48 * 1024 * 1024);
    let rows: Vec<Value> = serde_json::from_slice(&bytes)?;
    assert!(!rows.is_empty() && rows.len() <= 64);
    let mut j = journaal::Journaal::default();
    let mut reference: Option<EditingDoc> = None;
    let mut vorige: Option<&Value> = None;
    let mut rondes = vec![];
    let mut afwijkende_deltas = 0;
    for (nr, row) in rows.iter().enumerate() {
        let mut input = row["aanvraag"].clone();
        assert_eq!(input["schema"], json!(2));
        assert!(row["antwoord"]["delta"].is_string());
        let mut kopie = false;
        if input["basis"].is_string() {
            let oud = vorige.ok_or("Eerste aanvraag mag geen onbekende basis hebben")?;
            assert_eq!(
                input["basis"], oud["antwoord"]["basis"],
                "Oorspronkelijke bronbinding wijkt af"
            );
            assert_eq!(input["clientId"], oud["aanvraag"]["clientId"]);
            assert_eq!(input["documentId"], oud["aanvraag"]["documentId"]);
            kopie = input["snapshot"] == oud["antwoord"]["delta"];
            if !kopie {
                afwijkende_deltas += 1;
            }
            input["basis"] = json!(j.actuele_token().ok_or("Journaal mist basis")?);
        } else {
            assert!(input["basis"].is_null());
            let doc = EditingDoc::new(input["clientId"].as_u64().ok_or("Client ontbreekt")?);
            doc.keep_deleted();
            reference = Some(doc);
        }
        input["schema"] = json!(3);
        let aanvraag: Vraag = serde_json::from_value(input.clone())?;
        let begin = Instant::now();
        let got = j
            .bereid(aanvraag)?
            .ok_or("Journaal vraagt onverwacht een volledige bron")?;
        let duur_ms = begin.elapsed().as_secs_f64() * 1000.;
        let mut verwacht = row["antwoord"].clone();
        verwacht.as_object_mut().unwrap().remove("preparationMs");
        verwacht["schema"] = json!(3);
        verwacht["basis"] = got["basis"].clone();
        assert_eq!(got, verwacht, "Groep {nr}: inhoudelijk antwoord wijkt af");
        let doc = reference.as_ref().ok_or("Onafhankelijke bron ontbreekt")?;
        // Ook de werkelijk aangeboden Undo/Redo-/opmaakdelta wordt overgenomen.
        // Alleen antwoorddelta’s optellen zou die tussenliggende handelingen missen.
        docx_journal::import_journal_source(
            doc,
            &STANDARD.decode(row["aanvraag"]["snapshot"].as_str().unwrap())?,
        )?;
        docx_journal::import_journal_source(
            doc,
            &STANDARD.decode(row["antwoord"]["delta"].as_str().unwrap())?,
        )?;
        assert_eq!(
            j.laatste_bron()?,
            doc.encode_state_as_update_v1(),
            "Groep {nr}: volledige bron wijkt af"
        );
        rondes.push(json!({"groep":nr,"antwoord_gelijk_behalve_schema_token_tijd":true,"volledige_bron_bytegelijk":true,"vorig_voorstel_bytegelijk":kopie,"duur_ms_diagnostisch":duur_ms}));
        vorige = Some(row);
    }
    assert!(
        afwijkende_deltas > 0,
        "Deze geschiedenisproef mist een echte afwijkende vervolgdeltareeks"
    );
    assert!(
        j.herbouwd > 1,
        "Hergroepering/geschiedenis heeft geen herbouw beproefd"
    );
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"uitsluitend_proef":true,"schema":3,"rondes":rondes,"hergebruikt":j.hergebruikt,"herbouwd":j.herbouwd,"afwijkende_vervolgdeltas":afwijkende_deltas,"grens":"Inhoudelijke native bronpariteit op één eigen werkelijke reeks; geen productintegratie, GUI-/prestatie-/platform- of volledige geschiedenisacceptatie."})
        )?
    );
    Ok(())
}
