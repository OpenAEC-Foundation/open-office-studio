//! Experimentele schema-3-kern: bevestigde bronbytes plus bevestigde delta’s.
//! Alleen achter de expliciete Rust-feature. Een voorstel wordt pas bevestigd door exacte terugkomst.
use crate::{IncrementeleTekstAanvraag as Vraag, MAX_SNAPSHOT_BYTES};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_edit::{EditCtx, EditingDoc, Loc, LocRange};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use yrs::{StateVector, updates::decoder::Decode};
#[derive(Debug, PartialEq, Eq)]
pub enum Middelengrens {
    Bron,
    BevestigdJournaal,
    JournaalEnVoorstel,
}
#[derive(Debug, PartialEq, Eq)]
pub enum Fout {
    Ongeldig(String),
    BestaandeRouteNodig(Middelengrens),
}
impl From<String> for Fout {
    fn from(v: String) -> Self {
        Self::Ongeldig(v)
    }
}
impl From<&str> for Fout {
    fn from(v: &str) -> Self {
        Self::Ongeldig(v.into())
    }
}
impl std::fmt::Display for Fout {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ongeldig(v) => write!(f, "{v}"),
            Self::BestaandeRouteNodig(g) => write!(f, "Onderzoeksmiddelengrens: {g:?}"),
        }
    }
}
impl std::error::Error for Fout {}
fn sha(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect()
}
fn token(oud: Option<&str>, b: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b"openaec-bronjournaal-proef-3\0");
    h.update(oud.unwrap_or("").as_bytes());
    h.update((b.len() as u64).to_le_bytes());
    h.update(b);
    h.finalize().iter().map(|v| format!("{v:02x}")).collect()
}
#[derive(Clone)]
struct Bron {
    document: String,
    client: u64,
    token: String,
    basis: Arc<Vec<u8>>,
    delta: Vec<Arc<Vec<u8>>>,
}
impl Bron {
    fn bytes(&self) -> usize {
        self.basis.len() + self.delta.iter().map(|x| x.len()).sum::<usize>()
    }
}
struct Voorstel {
    doc: EditingDoc,
    delta: Vec<u8>,
}
pub struct Journaal {
    bron: Option<Bron>,
    voorstel: Option<Voorstel>,
    pub grens: usize,
    pub max_stappen: usize,
    pub hergebruikt: usize,
    pub herbouwd: usize,
}
impl Default for Journaal {
    fn default() -> Self {
        Self {
            bron: None,
            voorstel: None,
            grens: 64 * 1024 * 1024,
            max_stappen: 256,
            hergebruikt: 0,
            herbouwd: 0,
        }
    }
}
impl Journaal {
    #[cfg(test)]
    pub fn actuele_token(&self) -> Option<&str> {
        self.bron.as_ref().map(|b| b.token.as_str())
    }
    pub fn bytes(&self) -> usize {
        self.bron.as_ref().map_or(0, Bron::bytes)
            + self.voorstel.as_ref().map_or(0, |v| v.delta.len())
    }
    #[cfg(test)]
    pub fn laatste_bron(&self) -> Result<Vec<u8>, String> {
        Ok(self
            .voorstel
            .as_ref()
            .ok_or("Geen voorstel")?
            .doc
            .encode_state_as_update_v1())
    }
    #[cfg(test)]
    pub fn bereid(&mut self, a: Vraag) -> Result<Option<Value>, String> {
        self.bereid_getypeerd(a).map_err(|e| e.to_string())
    }
    /// Alleen de middelengrens mag een poging via de bestaande route uitlokken.
    /// Die route moet de volledige bron zelf opnieuw valideren; dit is geen
    /// goedkeuring van broninhoud. None vraagt een nieuwe volledige bronbinding.
    pub fn bereid_getypeerd(&mut self, a: Vraag) -> Result<Option<Value>, Fout> {
        if a.schema != 3 {
            return Err("Uitsluitend onderzoekschema3".into());
        }
        if a.request_id.is_empty()
            || a.document_id.is_empty()
            || a.source_version.is_empty()
            || a.client_id > 9_007_199_254_740_991
        {
            return Err("Ongeldige binding".into());
        }
        if a.text.is_empty() || a.text.contains(['\r', '\n']) {
            return Err("Ongeldige gewone tekst".into());
        }
        if a.snapshot.len() > MAX_SNAPSHOT_BYTES.div_ceil(3) * 4 {
            return Err("Aanvraag te groot".into());
        }
        let bytes = STANDARD
            .decode(&a.snapshot)
            .map_err(|_| "Ongeldige base64")?;
        if bytes.is_empty() || bytes.len() > MAX_SNAPSHOT_BYTES || sha(&bytes) != a.snapshot_sha256
        {
            return Err("Ongeldige bronhash/omvang".into());
        }
        let vector = STANDARD
            .decode(&a.source_vector)
            .map_err(|_| "Ongeldige vectorbase64")?;
        let expected = StateVector::decode_v1(&vector).map_err(|e| e.to_string())?;
        let vervolg = if let Some(t) = a.basis.as_ref() {
            let Some(b) = self.bron.as_ref().filter(|b| {
                b.token == *t && b.document == a.document_id && b.client == a.client_id
            }) else {
                return Ok(None);
            };
            if b.delta.len() >= self.max_stappen {
                return Ok(None);
            }
            Some(b.clone())
        } else {
            None
        };
        // Beschadigde transportgegevens worden nooit als capaciteitskeuze gemeld.
        // Ook bij een geldige verpakking valideert de bestaande route straks
        // onafhankelijk het bronformaat, de vector en de documentbinding.
        if bytes.len() > self.grens {
            return Err(Fout::BestaandeRouteNodig(Middelengrens::Bron));
        }
        let warm = vervolg.is_some() && self.voorstel.as_ref().is_some_and(|p| p.delta == bytes);
        let bron = if let Some(mut b) = vervolg {
            b.token = token(Some(&b.token), &bytes);
            b.delta.push(Arc::new(bytes.clone()));
            b
        } else {
            Bron {
                document: a.document_id.clone(),
                client: a.client_id,
                token: token(None, &bytes),
                basis: Arc::new(bytes.clone()),
                delta: vec![],
            }
        };
        if bron.bytes() > self.grens {
            return Err(Fout::BestaandeRouteNodig(Middelengrens::BevestigdJournaal));
        }
        let doc = if warm {
            self.voorstel.take().unwrap().doc
        } else {
            self.voorstel = None;
            let d = EditingDoc::new(a.client_id);
            d.keep_deleted();
            docx_edit::import_source_journal_update(&d, &bron.basis).map_err(|e| e.to_string())?;
            for delta in &bron.delta {
                docx_edit::import_source_journal_update(&d, delta).map_err(|e| e.to_string())?
            }
            d
        };
        if doc.holds_pending_update() {
            return Err("Onopgeloste bronafhankelijkheid".into());
        }
        if StateVector::decode_v1(&doc.encode_state_vector_v1()).map_err(|e| e.to_string())?
            != expected
        {
            return Err("Bronvector wijkt af".into());
        }
        let ctx = if let Some(auteur) = &a.author {
            EditCtx::local(&auteur.name, &auteur.date).suggesting()
        } else {
            EditCtx::local("", "")
        };
        let loc = Loc::new(&a.position.story, &a.position.para_id, a.position.offset);
        let r = docx_edit::prepare_source_journal_fragment(
            &doc,
            &LocRange {
                start: loc.clone(),
                end: loc,
            },
            &json!({"paragraphs":[{"text":a.text}]}),
            &ctx,
        )
        .map_err(|e| e.to_string())?;
        if bron.bytes().saturating_add(r.update.len()) > self.grens {
            return Err(Fout::BestaandeRouteNodig(Middelengrens::JournaalEnVoorstel));
        }
        let antwoord = json!({"schema":3,"requestId":a.request_id,"documentId":a.document_id,"sourceVersion":a.source_version,"snapshotSha256":a.snapshot_sha256,"clientId":a.client_id,"delta":STANDARD.encode(&r.update),"caret":{"story":r.caret.story,"paraId":r.caret.para,"offset":r.caret.offset},"basis":bron.token,"bronvector":a.source_vector});
        if warm {
            self.hergebruikt += 1
        } else {
            self.herbouwd += 1
        };
        self.voorstel = Some(Voorstel {
            doc,
            delta: r.update,
        });
        self.bron = Some(bron);
        Ok(Some(antwoord))
    }
}
