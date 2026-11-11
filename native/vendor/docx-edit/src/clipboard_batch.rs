// OpenAEC: gewijzigd voor brongebonden plakbatches en begrensde lezingen (2026-11-04).
//! Bereid een gestructureerde plakactie op een afzonderlijke replica voor.
//! De aanroeper neemt pas het volledige resultaat over; fouten wijzigen nooit de bronreplica.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use serde_json::Value;
use yrs::{Any, StateVector, updates::decoder::Decode};
use crate::{EditingDoc, EditCtx, FormatPolicy, Loc, LocRange, OpError, OpResult, Position, StoryRange, story_ref};
use crate::op::global_of_loc;
mod revision_ids;

#[derive(Deserialize)]
struct Fragment { paragraphs: Vec<Alinea> }
#[derive(Deserialize)]
struct Alinea {
    text: String,
    #[serde(default)] tables: Vec<Value>,
    inlines: Option<Vec<Value>>,
}
pub struct ClipboardBatchResult {
    pub update: Vec<u8>,
    pub base_vector: Vec<u8>,
    pub caret: Loc,
}

/// OpenAEC: de bron wordt eenmaal geïmporteerd. Haar bytes blijven van vóór
/// het voorstel en de bronvector moet inhoudelijk bij de editor passen.
pub struct ConfirmedClipboardBatchResult {
    pub snapshot: Vec<u8>,
    pub vector: Vec<u8>,
    pub batch: ClipboardBatchResult,
    pub replica: PreparedClipboardReplica,
    pub reused: bool,
}
/// OpenAEC: een afzonderlijk voorstel, nooit de bevestigde bron. Alleen exact
/// dezelfde bevestigde basis én exact de teruggekomen voorstelbytes maken deze
/// replica bruikbaar voor een volgende voorbereiding. Een vector alleen volstaat niet.
pub struct PreparedClipboardReplica {
    doc: EditingDoc,
    client_id: u64,
    base_digest: [u8; 32],
    proposed_update: Vec<u8>,
}
pub fn prepare_confirmed_clipboard_fragment(base: Option<&[u8]>, update: &[u8], client_id: u64,
    expected_vector: &[u8], range: &LocRange, fragment: &Value, ctx: &EditCtx, max_source_bytes: usize) -> OpResult<ConfirmedClipboardBatchResult> {
    prepare_confirmed_clipboard_fragment_cached(None, base, update, client_id, expected_vector, range, fragment, ctx, max_source_bytes)
}
#[allow(clippy::too_many_arguments)]
pub fn prepare_confirmed_clipboard_fragment_cached(cached: Option<PreparedClipboardReplica>, base: Option<&[u8]>, update: &[u8], client_id: u64,
    expected_vector: &[u8], range: &LocRange, fragment: &Value, ctx: &EditCtx, max_source_bytes: usize) -> OpResult<ConfirmedClipboardBatchResult> {
    let expected = StateVector::decode_v1(expected_vector).map_err(|e|ongeldig(e.to_string()))?;
    let fragment: Fragment = serde_json::from_value(fragment.clone()).map_err(|e|ongeldig(e.to_string()))?;
    if range.start.story != range.end.story { return Err(ongeldig("Bereik loopt over verschillende verhalen")); }
    let cached = cached.filter(|c| c.client_id == client_id && c.proposed_update == update
        && base.is_some_and(|b| <[u8;32]>::from(Sha256::digest(b)) == c.base_digest));
    let reused = cached.is_some();
    let doc = if let Some(c) = cached { c.doc } else {
        let doc = EditingDoc::new(client_id);
        doc.keep_deleted();
        if let Some(base) = base { doc.apply_verbatim_v1(base).map_err(OpError::from)?; }
        doc.apply_verbatim_v1(update).map_err(OpError::from)?;
        doc
    };
    if doc.holds_pending_update() { return Err(ongeldig("De Writer-bron bevat nog onopgeloste afhankelijkheden")); }
    let vector = doc.encode_state_vector_v1();
    if StateVector::decode_v1(&vector).map_err(|e|ongeldig(e.to_string()))? != expected {
        return Err(ongeldig("De samengestelde Writer-bron heeft een andere bronvector"));
    }
    let snapshot = doc.encode_state_as_update_v1();
    if snapshot.len() > max_source_bytes { return Err(ongeldig("De samengestelde Writer-bron is te groot")); }
    let batch = prepare_clipboard_in_doc(&doc, range, fragment, ctx)?;
    let replica = PreparedClipboardReplica { doc, client_id, base_digest: Sha256::digest(&snapshot).into(), proposed_update: batch.update.clone() };
    Ok(ConfirmedClipboardBatchResult { snapshot, vector, batch, replica, reused })
}
fn ongeldig(tekst: impl Into<String>) -> OpError { OpError::InvalidFormatValue(tekst.into()) }
fn afbeelding(value: &Value) -> OpResult<Vec<(String,Any)>> {
    let mut image=value.as_object().ok_or_else(||ongeldig("Afbeelding is geen object"))?.clone();
    if image.contains_key("_kind") { return Err(ongeldig("Beschermd afbeeldingsveld")) }
    let src=image.get("src").and_then(Value::as_str).ok_or_else(||ongeldig("Afbeeldingsbron ontbreekt"))?;
    let (media,data)=src.split_once(',').ok_or_else(||ongeldig("Geen data-afbeelding"))?;
    let media=media.to_ascii_lowercase();
    let subtype=media.strip_prefix("data:image/").and_then(|s|s.strip_suffix(";base64")).ok_or_else(||ongeldig("Geen base64-afbeelding"))?;
    if src.len()>64*1024*1024 || subtype.is_empty() || !subtype.bytes().all(|b|b.is_ascii_alphanumeric()||b".+-".contains(&b)) || data.is_empty(){return Err(ongeldig("Ongeldige afbeeldingsbron"))}
    let zonder=data.trim_end_matches('=');
    if zonder.is_empty() || data.len()-zonder.len()>2 || !zonder.bytes().all(|b|b.is_ascii_alphanumeric()||b"+/".contains(&b)){return Err(ongeldig("Ongeldige base64-afbeelding"))}
    for sleutel in ["widthEmu","heightEmu"] {if let Some(v)=image.get(sleutel){if v.as_f64().is_none_or(|n|!n.is_finite()||n<=0.){return Err(ongeldig("Ongeldige afbeeldingsmaat"))}}}
    for sleutel in ["rId","id","embedId","docPrId","drawingId"] { image.remove(sleutel); }
    image.entry("noChangeAspect").or_insert(Value::Bool(true));
    let Any::Map(map)=Any::from_json(&Value::Object(image).to_string()).map_err(|e|ongeldig(e.to_string()))? else {unreachable!()};
    Ok(map.iter().map(|(k,v)|(k.clone(),v.clone())).collect())
}

pub fn prepare_clipboard_fragment(snapshot:&[u8],client_id:u64,range:&LocRange,fragment:&Value,ctx:&EditCtx)->OpResult<ClipboardBatchResult>{
    let fragment:Fragment=serde_json::from_value(fragment.clone()).map_err(|e|ongeldig(e.to_string()))?;
    if range.start.story!=range.end.story{return Err(ongeldig("Bereik loopt over verschillende verhalen"))}
    let doc=EditingDoc::new(client_id);
    doc.keep_deleted();
    doc.apply_update_v1(snapshot).map_err(OpError::from)?;
    prepare_clipboard_in_doc(&doc,range,fragment,ctx)
}
fn prepare_clipboard_in_doc(doc: &EditingDoc,range: &LocRange,fragment: Fragment,ctx: &EditCtx) -> OpResult<ClipboardBatchResult> {
    let base_vector=doc.encode_state_vector_v1();
    let start=doc.locate(&range.start)?.index;
    let end=doc.locate(&range.end)?.index;
    if end<start{return Err(OpError::InvalidRange{start,end})}
    for p in &fragment.paragraphs {
        for t in &p.tables {EditingDoc::validate_table_fragment(t)?;}
        if let Some(inlines)=&p.inlines {for inline in inlines {if let Some(image)=inline.get("image"){afbeelding(image)?;}else if inline.get("text").and_then(Value::as_str).is_none(){return Err(ongeldig("Ongeldige inline"))}}}
    }
    doc.begin_native_revisions(ctx)?;
    let story_id=range.start.story.clone();
    let mut position=start;
    let mut para_start=start-range.start.offset;
    {
        let mut txn=doc.transact_for(ctx);
        if start!=end {
            let receipt=doc.delete_range_in(&mut txn,ctx,StoryRange::new(&story_id,start,end))?;
            let at=receipt.range.ok_or_else(||ongeldig("Wisbereik ontbreekt"))?.start;
            let story=story_ref(&txn,&story_id)?;
            position=global_of_loc(&story,&txn,&at)?;
            para_start=position-at.offset;
        }
        for (i,p) in fragment.paragraphs.iter().enumerate(){
            if i>0 {
                let (_,after)=doc.split_paragraph_placed_in(ctx,&mut txn,Position::new(&story_id,position),None,None)?;
                position=after;para_start=after;
            }
            for table in &p.tables {
                let (receipt,after)=doc.insert_table_fragment_placed_in(ctx,&mut txn,Position::new(&story_id,position),table)?;
                position=after;para_start=after-receipt.after.offset;
            }
            let fallback=if p.text.is_empty(){Vec::new()}else{vec![serde_json::json!({"text":p.text})]};
            for inline in p.inlines.as_ref().unwrap_or(&fallback){
                let at=Position::new(&story_id,position);
                if let Some(image)=inline.get("image") {
                    let receipt=doc.insert_embed_in(ctx,&mut txn,at,"image",afbeelding(image)?)?;
                    let end=receipt.range.ok_or_else(||ongeldig("Invoegbereik ontbreekt"))?.end;
                    position=para_start+end.offset;
                }else{
                    let text=inline.get("text").and_then(Value::as_str).ok_or_else(||ongeldig("Inline tekst ontbreekt"))?;
                    position=doc.insert_text_placed_in(&mut txn,ctx,at,text,FormatPolicy::Inherit)?;
                }
            }
        }
    }
    doc.persist_native_revisions(ctx)?;
    let caret=doc.loc_at(&Position::new(story_id,position))?;
    let update=doc.encode_diff_v1(&base_vector).map_err(OpError::from)?;
    Ok(ClipboardBatchResult{update,base_vector,caret})
}

// OpenAEC: de native journaalroute blijft standaard uitgeschakeld.
#[cfg(feature = "writer-bronjournaal")]
mod journal_api;
#[cfg(feature = "writer-bronjournaal")]
pub use journal_api::{import_source_journal_update, prepare_source_journal_fragment};
