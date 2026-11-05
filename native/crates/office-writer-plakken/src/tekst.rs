//! Gewone tekstinvoer deelt de oorspronkelijke volledige invoegbewerking.
use crate::{Aanvraag, Alineapunt, Antwoord, Auteur, Bereik, Cursor, bereid_voor};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TekstAanvraag {
    pub schema: u8,
    pub request_id: String,
    pub document_id: String,
    pub source_version: String,
    pub snapshot_sha256: String,
    pub snapshot: String,
    pub client_id: u64,
    pub position: Cursor,
    pub text: String,
    pub author: Option<Auteur>,
}

/// Dit antwoord is een voorstel voor precies deze bron. De aanroeper moet vóór
/// overnemen opnieuw documentlevensduur en bronversie controleren. Deze opdracht
/// voegt geen alineagrens in en vervangt nooit een ongemerkt ontstane selectie.
pub fn bereid_tekst_voor(a: TekstAanvraag) -> Result<Antwoord, String> {
    if a.text.is_empty() || a.text.contains(['\r', '\n']) {
        return Err(
            "Gewone Writer-tekst moet niet leeg zijn en mag geen alineagrens bevatten".into(),
        );
    }
    let punt = Alineapunt {
        para_id: a.position.para_id,
        offset: a.position.offset,
    };
    bereid_voor(Aanvraag {
        schema: a.schema,
        request_id: a.request_id,
        document_id: a.document_id,
        source_version: a.source_version,
        snapshot_sha256: a.snapshot_sha256,
        snapshot: a.snapshot,
        client_id: a.client_id,
        range: Bereik {
            story: a.position.story,
            start: punt.clone(),
            end: punt,
        },
        fragment: serde_json::json!({"paragraphs": [{"text": a.text}]}),
        author: a.author,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use docx_edit::EditingDoc;

    fn bron() -> (EditingDoc, TekstAanvraag) {
        let doc = EditingDoc::new(11);
        doc.create_story_with_paragraph_id("body", "alinea", "Voor 😀 na", "Normal", "left")
            .unwrap();
        let snapshot = doc.encode_state_as_update_v1();
        let aanvraag = TekstAanvraag {
            schema: 1,
            request_id: "invoer-1".into(),
            document_id: "document-1".into(),
            source_version: "bron-1".into(),
            snapshot_sha256: crate::snapshot_sha256(&snapshot),
            snapshot: STANDARD.encode(snapshot),
            client_id: 21,
            position: Cursor {
                story: "body".into(),
                para_id: "alinea".into(),
                offset: 7,
            },
            text: " één 😀".into(),
            author: None,
        };
        (doc, aanvraag)
    }

    #[test]
    fn unicode_invoer_is_brongebonden_en_wijzigt_de_levende_bron_niet() {
        let (doc, a) = bron();
        let voor = doc.encode_state_as_update_v1();
        let r = bereid_tekst_voor(a.clone()).unwrap();
        assert_eq!(doc.encode_state_as_update_v1(), voor);
        assert_eq!(r.request_id, a.request_id);
        assert_eq!(r.document_id, a.document_id);
        assert_eq!(r.source_version, a.source_version);
        assert_eq!(r.snapshot_sha256, a.snapshot_sha256);
        assert_eq!(r.client_id, a.client_id);
        let terug = EditingDoc::new(31);
        terug.apply_update_v1(&voor).unwrap();
        terug
            .apply_update_v1(&STANDARD.decode(r.delta).unwrap())
            .unwrap();
        assert_eq!(
            terug.paragraphs("body").unwrap()[0].text,
            "Voor 😀 één 😀 na"
        );
        assert_eq!(r.caret.para_id, "alinea");
        assert_eq!(r.caret.offset, 14);
    }

    #[test]
    fn lege_tekst_en_alineagrenzen_worden_zonder_bronmutatie_geweigerd() {
        let (doc, a) = bron();
        let voor = doc.encode_state_as_update_v1();
        for text in ["", "Eerste\nTweede", "Eerste\rTweede", "\r\n"] {
            assert!(
                bereid_tekst_voor(TekstAanvraag {
                    text: text.into(),
                    ..a.clone()
                })
                .is_err()
            );
            assert_eq!(doc.encode_state_as_update_v1(), voor);
        }
    }

    #[test]
    fn ongeldige_bron_of_cursor_levert_geen_invoerantwoord_op() {
        let (doc, a) = bron();
        let voor = doc.encode_state_as_update_v1();
        assert!(
            bereid_tekst_voor(TekstAanvraag {
                snapshot_sha256: "0".repeat(64),
                ..a.clone()
            })
            .is_err()
        );
        let mut fout = a;
        fout.position.para_id = "ontbreekt".into();
        assert!(bereid_tekst_voor(fout).is_err());
        assert_eq!(doc.encode_state_as_update_v1(), voor);
    }
}
