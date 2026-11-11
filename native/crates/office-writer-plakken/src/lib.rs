//! Bereid Writer-bewerkingen buiten de UI voor zonder de levende documentsessie te wijzigen.
mod hostjournaal;
pub use hostjournaal::{HostJournaal, HostJournaalFout};
#[cfg(feature = "writer-bronjournaal")]
pub mod bronjournaal;
mod bronspiegel;
mod bronvoorraad;
mod tekst;
use base64::{Engine as _, engine::general_purpose::STANDARD};
pub use bronspiegel::{BronSpiegel, IncrementeelAntwoord, IncrementeleTekstAanvraag};
pub use bronvoorraad::BronVoorraad;
use docx_edit::{EditCtx, Loc, LocRange};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Instant;
pub use tekst::{TekstAanvraag, bereid_tekst_voor};

/// De bestaande desktopgrens geldt ook voor een voorbereidingssnapshot.
pub const MAX_SNAPSHOT_BYTES: usize = 100 * 1024 * 1024;
pub const SCHEMA: u8 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Alineapunt {
    pub para_id: String,
    pub offset: u32,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Bereik {
    pub story: String,
    pub start: Alineapunt,
    pub end: Alineapunt,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Auteur {
    pub name: String,
    pub date: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Aanvraag {
    pub schema: u8,
    pub request_id: String,
    pub document_id: String,
    pub source_version: String,
    pub snapshot_sha256: String,
    pub snapshot: String,
    pub client_id: u64,
    pub range: Bereik,
    pub fragment: Value,
    pub author: Option<Auteur>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Cursor {
    pub story: String,
    pub para_id: String,
    pub offset: u32,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Antwoord {
    pub schema: u8,
    pub request_id: String,
    pub document_id: String,
    pub source_version: String,
    pub snapshot_sha256: String,
    pub client_id: u64,
    pub delta: String,
    pub caret: Cursor,
    pub preparation_ms: u64,
}

pub fn snapshot_sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// Een antwoord is slechts een voorstel. De aanroeper moet vóór het overnemen
/// opnieuw dezelfde documentlevensduur en bronversie controleren. Dezelfde
/// client-id mag nooit gelijktijdig tegen een andere bronversie schrijven.
pub fn bereid_voor(aanvraag: Aanvraag) -> Result<Antwoord, String> {
    if aanvraag.schema != SCHEMA {
        return Err("Onbekende versie van de Writer-plakopdracht".into());
    }
    if aanvraag.request_id.is_empty()
        || aanvraag.document_id.is_empty()
        || aanvraag.source_version.is_empty()
    {
        return Err("De document- of bronbinding van de plakopdracht ontbreekt".into());
    }
    if aanvraag.client_id > 9_007_199_254_740_991 {
        return Err("De documentidentiteit van de plakopdracht is ongeldig".into());
    }
    if aanvraag.snapshot.len() > MAX_SNAPSHOT_BYTES.div_ceil(3) * 4 {
        return Err("De Writer-momentopname is te groot voor deze desktopopdracht".into());
    }
    let bytes = STANDARD
        .decode(&aanvraag.snapshot)
        .map_err(|_| "De Writer-momentopname is geen geldige base64")?;
    if bytes.is_empty() || bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err("De Writer-momentopname heeft een ongeldige omvang".into());
    }
    if snapshot_sha256(&bytes) != aanvraag.snapshot_sha256 {
        return Err("De Writer-momentopname wijkt af van de opgegeven bron".into());
    }
    let range = LocRange {
        start: Loc::new(
            &aanvraag.range.story,
            &aanvraag.range.start.para_id,
            aanvraag.range.start.offset,
        ),
        end: Loc::new(
            &aanvraag.range.story,
            &aanvraag.range.end.para_id,
            aanvraag.range.end.offset,
        ),
    };
    let ctx = if let Some(auteur) = &aanvraag.author {
        EditCtx::local(&auteur.name, &auteur.date).suggesting()
    } else {
        EditCtx::local("", "")
    };
    let begin = Instant::now();
    let resultaat = docx_edit::prepare_clipboard_fragment(
        &bytes,
        aanvraag.client_id,
        &range,
        &aanvraag.fragment,
        &ctx,
    )
    .map_err(|fout| fout.to_string())?;
    Ok(Antwoord {
        schema: SCHEMA,
        request_id: aanvraag.request_id,
        document_id: aanvraag.document_id,
        source_version: aanvraag.source_version,
        snapshot_sha256: aanvraag.snapshot_sha256,
        client_id: aanvraag.client_id,
        delta: STANDARD.encode(resultaat.update),
        caret: Cursor {
            story: resultaat.caret.story,
            para_id: resultaat.caret.para,
            offset: resultaat.caret.offset,
        },
        preparation_ms: begin.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use docx_edit::EditingDoc;
    use serde_json::json;

    fn bron() -> (EditingDoc, Aanvraag) {
        let doc = EditingDoc::new(31);
        doc.create_story_with_paragraph_id("body", "alinea", "Voor 😀 na", "Normal", "left")
            .unwrap();
        let snapshot = doc.encode_state_as_update_v1();
        let aanvraag = Aanvraag {
            schema: SCHEMA,
            request_id: "opdracht-1".into(),
            document_id: "document-1".into(),
            source_version: "versie-1".into(),
            snapshot_sha256: snapshot_sha256(&snapshot),
            snapshot: STANDARD.encode(snapshot),
            client_id: 41,
            range: Bereik {
                story: "body".into(),
                start: Alineapunt {
                    para_id: "alinea".into(),
                    offset: 2,
                },
                end: Alineapunt {
                    para_id: "alinea".into(),
                    offset: 4,
                },
            },
            fragment: json!({"paragraphs":[{"text":"Eén 😀"},{"text":"Tweede"}]}),
            author: None,
        };
        (doc, aanvraag)
    }
    #[test]
    fn volledige_voorbereiding_behoudt_bron_en_bindt_het_antwoord() {
        let (doc, a) = bron();
        let voor = doc.encode_state_as_update_v1();
        let r = bereid_voor(a.clone()).unwrap();
        assert_eq!(r.request_id, a.request_id);
        assert_eq!(r.document_id, a.document_id);
        assert_eq!(r.source_version, a.source_version);
        assert_eq!(r.snapshot_sha256, a.snapshot_sha256);
        assert_eq!(r.client_id, a.client_id);
        assert_eq!(doc.encode_state_as_update_v1(), voor);
        let terug = EditingDoc::new(51);
        terug.apply_update_v1(&voor).unwrap();
        terug
            .apply_update_v1(&STANDARD.decode(r.delta).unwrap())
            .unwrap();
        let teksten: Vec<_> = terug
            .paragraphs("body")
            .unwrap()
            .into_iter()
            .map(|p| p.text)
            .collect();
        assert_eq!(teksten, vec!["VoEén 😀", "Tweede 😀 na"]);
        let positie = terug
            .locate(&Loc::new(&r.caret.story, &r.caret.para_id, r.caret.offset))
            .unwrap();
        assert!(positie.index > 0);
    }
    #[test]
    fn verkeerde_snapshot_hash_wordt_voor_de_bewerking_geweigerd() {
        let (_, mut a) = bron();
        a.snapshot_sha256 = "0".repeat(64);
        assert!(bereid_voor(a).unwrap_err().contains("opgegeven bron"));
    }
    #[test]
    fn opdracht_zonder_bronbinding_of_met_andere_schema_wordt_geweigerd() {
        let (_, a) = bron();
        for veld in ["schema", "requestId", "documentId", "sourceVersion"] {
            let mut json = serde_json::to_value(&a).unwrap();
            json[veld] = if veld == "schema" {
                json!(2)
            } else {
                json!("")
            };
            assert!(bereid_voor(serde_json::from_value(json).unwrap()).is_err());
        }
    }
    #[test]
    fn late_tekstfout_levert_geen_gedeeltelijk_antwoord_of_bronmutatie() {
        let (doc, mut a) = bron();
        let voor = doc.encode_state_as_update_v1();
        a.fragment = json!({"paragraphs":[{"text":"Geldig begin"},{"text":"Geen\ngewone tekst"}]});
        assert!(bereid_voor(a).is_err());
        assert_eq!(doc.encode_state_as_update_v1(), voor);
    }
    #[test]
    fn ongeldige_base64_of_onuitwisselbare_replicacode_wordt_geweigerd() {
        let (_, a) = bron();
        let mut fout = a.clone();
        fout.snapshot = "Geen%base64".into();
        assert!(bereid_voor(fout).unwrap_err().contains("base64"));
        let mut fout = a;
        fout.client_id = u64::MAX;
        assert!(bereid_voor(fout).is_err());
    }
}
