//! OpenAEC: expliciet ingeschakelde native replica-API voor het bronjournaal.
use super::*;
/// Importeer uitsluitend in een afzonderlijke replica van de documentwerker.
/// Dit behoudt bronidentiteiten; de aanroeper moet hash, client, bevestigde
/// deltabinding en volledige bronvector zelfstandig controleren. Gebruik dit
/// niet als import-/herstelactie op de levende frontenddocumentsessie.
pub fn import_source_journal_update(doc: &EditingDoc, bytes: &[u8]) -> OpResult<()> {
    doc.apply_verbatim_v1(bytes).map_err(OpError::from)
}
/// Bereid uitsluitend op de eigen replica voor. Een geslaagd voorstel wijzigt
/// die replica; de bevestigde bron blijft verantwoordelijkheid van de aanroeper.
/// Bij een fout moet de aanroeper de replica verlaten/herbouwen, niet teruggeven
/// als bevestigde bron. De bestaande fragmentvalidatie blijft ongewijzigd.
pub fn prepare_source_journal_fragment(
    doc: &EditingDoc,
    range: &LocRange,
    fragment: &Value,
    ctx: &EditCtx,
) -> OpResult<ClipboardBatchResult> {
    let fragment: Fragment =
        serde_json::from_value(fragment.clone()).map_err(|e| ongeldig(e.to_string()))?;
    if range.start.story != range.end.story {
        return Err(ongeldig("Bereik loopt over verschillende verhalen"));
    }
    prepare_clipboard_in_doc(doc, range, fragment, ctx)
}
