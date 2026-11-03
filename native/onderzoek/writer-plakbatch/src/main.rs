use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_edit::FormatPolicy;
use docx_edit::Loc;
use docx_edit::{EditCtx, EditingDoc, Position, StoryRange};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{fs, time::Instant};
#[derive(Deserialize)]
struct Punt {
    #[serde(rename = "paraId")]
    para_id: String,
    offset: u32,
}
#[derive(Deserialize)]
struct Bereik {
    story: String,
    start: Punt,
    end: Punt,
}
#[derive(Deserialize)]
struct Verzoek {
    snapshot: String,
    range: Bereik,
    fragment: Value,
    #[serde(rename = "clientId")]
    client_id: u64,
    #[serde(default)]
    author: Option<Value>,
}
fn index(doc: &EditingDoc, at: &Loc) -> Result<u32, String> {
    doc.locate(at).map(|p| p.index).map_err(|e| e.to_string())
}
fn voer() -> Result<(), String> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        return Err("Gebruik verzoek.json uitvoer.json".into());
    }
    let r: Verzoek = serde_json::from_slice(&fs::read(&args[1]).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if std::env::var_os("OFFICE_EEN_TRANSACTIE").is_some() {
        let data = STANDARD.decode(r.snapshot).map_err(|e| e.to_string())?;
        let range = docx_edit::LocRange {
            start: Loc::new(&r.range.story, &r.range.start.para_id, r.range.start.offset),
            end: Loc::new(&r.range.story, &r.range.end.para_id, r.range.end.offset),
        };
        let ctx = if let Some(a) = &r.author {
            EditCtx::local(
                a["name"].as_str().unwrap_or(""),
                a["date"].as_str().unwrap_or(""),
            )
            .suggesting()
        } else {
            EditCtx::local("", "")
        };
        let t = Instant::now();
        let out =
            docx_edit::prepare_clipboard_fragment(&data, r.client_id, &range, &r.fragment, &ctx)
                .map_err(|e| e.to_string())?;
        let ms = t.elapsed().as_millis();
        let json = serde_json::json!({"delta":STANDARD.encode(&out.update),"caret":{"story":out.caret.story,"paraId":out.caret.para,"offset":out.caret.offset},"import_ms":0,"toepassen_ms":ms,"delta_ms":0,"delta_bytes":out.update.len()});
        fs::write(
            &args[2],
            serde_json::to_vec(&json).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        println!("Eén transactie {}ms delta {}bytes", ms, out.update.len());
        return Ok(());
    }
    let t = Instant::now();
    let doc = EditingDoc::new(r.client_id);
    doc.apply_update_v1(&STANDARD.decode(r.snapshot).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let vector = doc.encode_state_vector_v1();
    let import_ms = t.elapsed().as_millis();
    let t = Instant::now();
    let ctx = EditCtx::local("", "");
    let mut at = Loc::new(&r.range.story, &r.range.start.para_id, r.range.start.offset);
    let end = Loc::new(&r.range.story, &r.range.end.para_id, r.range.end.offset);
    let mut raw = index(&doc, &at)?;
    let paragraphs = r.fragment["paragraphs"]
        .as_array()
        .ok_or("Geen klembordalineas")?;
    for p in paragraphs {
        for table in p["tables"].as_array().into_iter().flatten() {
            EditingDoc::validate_table_fragment(table).map_err(|e| e.to_string())?;
        }
    }
    if at != end {
        let receipt = doc
            .delete_range(
                &ctx,
                StoryRange::new(&at.story, index(&doc, &at)?, index(&doc, &end)?),
            )
            .map_err(|e| e.to_string())?;
        at = receipt.range.ok_or("Geen wisbereik")?.start;
        raw = index(&doc, &at)?;
    }
    for (i, p) in paragraphs.iter().enumerate() {
        if i > 0 {
            let s = doc
                .split_paragraph(&ctx, Position::new(&at.story, raw), None)
                .map_err(|e| e.to_string())?;
            at = Loc::new(&at.story, s.second_para_id, 0);
            raw += 1;
        }
        for table in p["tables"].as_array().into_iter().flatten() {
            let p = doc
                .insert_table_fragment(&ctx, Position::new(&at.story, raw), table)
                .map_err(|e| e.to_string())?
                .after;
            at = Loc::new(p.story, p.para_id, p.offset);
            raw = index(&doc, &at)?;
        }
        let fallback = vec![json!({"text":p["text"].as_str().ok_or("Geen alineatekst")?})];
        let inlines = p["inlines"].as_array().unwrap_or(&fallback);
        for inline in inlines {
            if inline.get("image").is_some() {
                return Err("Afbeeldingsverkenning nog niet uitgevoerd; geen productroute".into());
            }
            let text = inline["text"].as_str().ok_or("Geen inline tekst")?;
            if text.is_empty() {
                continue;
            }
            let volgende = doc
                .insert_text(
                    &ctx,
                    Position::new(&at.story, raw),
                    text,
                    FormatPolicy::Inherit,
                )
                .map_err(|e| e.to_string())?
                .range
                .ok_or("Geen invoegbereik")?
                .end;
            raw = if volgende.story == at.story && volgende.para == at.para {
                raw - at.offset + volgende.offset
            } else {
                index(&doc, &volgende)?
            };
            at = volgende;
            if std::env::var_os("OFFICE_CHECK_COORDS").is_some() {
                assert_eq!(raw, index(&doc, &at)?);
            }
        }
    }
    let toepassen_ms = t.elapsed().as_millis();
    let t = Instant::now();
    let delta = doc.encode_diff_v1(&vector).map_err(|e| e.to_string())?;
    let out = json!({"delta":STANDARD.encode(&delta),"caret":{"story":at.story,"paraId":at.para,"offset":at.offset},"import_ms":import_ms,"toepassen_ms":toepassen_ms,"delta_ms":t.elapsed().as_millis(),"delta_bytes":delta.len()});
    fs::write(
        &args[2],
        serde_json::to_vec(&out).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    println!(
        "import={}ms toepassen={}ms delta={}bytes",
        import_ms,
        toepassen_ms,
        delta.len()
    );
    Ok(())
}
fn main() {
    if let Err(e) = voer() {
        eprintln!("{e}");
        std::process::exit(1)
    }
}
