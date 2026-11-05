//! OpenAEC: herhaalbare, van de WebView gescheiden revisie-identiteiten.
use crate::{
    EditCtx, EditingDoc, NATIVE_REVISION_SEQUENCES, NativeRevisionIds, OpError, OpResult, STORIES,
};
use yrs::{Any, Map, Out, ReadTxn, Transact};

fn ongeldig() -> OpError {
    OpError::InvalidFormatValue("De revisiegegevens zijn ongeldig of uitgeput".into())
}
impl EditingDoc {
    pub(crate) fn begin_native_revisions(&self, ctx: &EditCtx) -> OpResult<()> {
        if !ctx.is_suggesting() {
            *self.native_revision_ids.borrow_mut() = None;
            return Ok(());
        }
        let (stored, stories) = {
            let txn = self.yrs_doc().transact();
            let map = txn
                .get_map(NATIVE_REVISION_SEQUENCES)
                .ok_or_else(ongeldig)?;
            let stored = match map.get(&txn, &self.client_id.to_string()) {
                None => None,
                Some(Out::Any(Any::String(s))) => Some(s.parse::<u64>().map_err(|_| ongeldig())?),
                _ => return Err(ongeldig()),
            };
            let stories: Vec<String> = txn
                .get_map(STORIES)
                .map(|map| {
                    crate::live_stories(&map, &txn)
                        .map(|(name, _)| name.to_owned())
                        .collect()
                })
                .unwrap_or_default();
            (stored, stories)
        };
        // Ook een aangeleverde of verlaagde teller moet de werkelijk aanwezige
        // revisies respecteren. De blijvende teller bewaart daarna de grens
        // wanneer revisies verwijderd of door GC opgeruimd zijn.
        let prefix = format!("openaec-revision-v1:{}:", self.client_id);
        let mut next = stored.unwrap_or(0);
        for story in stories {
            for change in self.list_changes(&story)? {
                if let Some(suffix) = change.revision_id.strip_prefix(&prefix) {
                    if let Ok(value) = suffix.parse::<u64>() {
                        next = next.max(value.checked_add(1).ok_or_else(ongeldig)?);
                    }
                }
            }
        }
        *self.native_revision_ids.borrow_mut() = Some(NativeRevisionIds { next, stored });
        Ok(())
    }

    pub(crate) fn next_revision_id(&self) -> OpResult<String> {
        let mut state = self.native_revision_ids.borrow_mut();
        let Some(state) = state.as_mut() else {
            return Ok(self.next_id());
        };
        let value = state.next;
        state.next = value.checked_add(1).ok_or_else(ongeldig)?;
        // Behoud de volgorde van overige lokale identiteiten, zoals nieuwe
        // alinea’s. Alleen de revisienaam zelf krijgt een eigen naamruimte.
        let _ = self.next_id();
        // De levende SDK gebruikt client:teller. Een eigen naamruimte voorkomt
        // botsingen wanneer die SDK na een native voorstel zelf verder bewerkt.
        Ok(format!("openaec-revision-v1:{}:{value}", self.client_id))
    }

    pub(crate) fn persist_native_revisions(&self, ctx: &EditCtx) -> OpResult<()> {
        let Some(state) = *self.native_revision_ids.borrow() else {
            return Ok(());
        };
        if state.stored == Some(state.next) || state.stored.is_none() && state.next == 0 {
            return Ok(());
        }
        let mut txn = self.transact_for(ctx);
        let map = txn
            .get_map(NATIVE_REVISION_SEQUENCES)
            .ok_or_else(ongeldig)?;
        map.insert(&mut txn, self.client_id.to_string(), state.next.to_string());
        self.native_revision_ids
            .borrow_mut()
            .as_mut()
            .unwrap()
            .stored = Some(state.next);
        Ok(())
    }
}
