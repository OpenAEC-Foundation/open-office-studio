//! Warme bronovername moet ook bij wisselende verhalen en revisieauteurs
//! dezelfde delta opleveren als een onafhankelijke volledige voorbereiding.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_edit::{EditCtx, EditingDoc, FormatPolicy, Loc, Position};
use office_writer_plakken::{
    Auteur, BronSpiegel, Cursor, IncrementeleTekstAanvraag, snapshot_sha256,
};

#[test]
fn warme_overname_behoudt_celverhalen_en_wisselende_revisieauteurs() {
    let doc = EditingDoc::new(21);
    doc.keep_deleted();
    doc.create_story_with_paragraph_id("body", "p-body", "Hoofdtekst 😀", "Normal", "left")
        .unwrap();
    doc.create_story_with_paragraph_id("cell:tabel/0/0", "p-cel", "Celtekst é", "Normal", "left")
        .unwrap();
    // De bron bevat vanaf het begin ook een andere clientidentiteit.
    let ander = EditingDoc::new(22);
    ander.keep_deleted();
    ander
        .apply_update_v1(&doc.encode_state_as_update_v1())
        .unwrap();
    let index = ander.locate(&Loc::new("body", "p-body", 0)).unwrap().index;
    ander
        .insert_text(
            &EditCtx::local("", ""),
            Position::new("body", index),
            "A",
            FormatPolicy::Inherit,
        )
        .unwrap();
    doc.apply_update_v1(&ander.encode_state_as_update_v1())
        .unwrap();
    let mut spiegel = BronSpiegel::default();
    let mut basis: Option<String> = None;
    let mut vorige_vector: Option<Vec<u8>> = None;
    let mut vorig_voorstel: Option<Vec<u8>> = None;
    for stap in 0..80 {
        let bron = doc.encode_state_as_update_v1();
        let update = match &vorige_vector {
            Some(vector) => doc.encode_diff_v1(vector).unwrap(),
            None => bron.clone(),
        };
        if let Some(voorstel) = &vorig_voorstel {
            assert_eq!(
                &update, voorstel,
                "De ontvangen update bevestigt exact het vorige voorstel"
            );
        }
        let (story, para_id) = if stap % 2 == 0 {
            ("body", "p-body")
        } else {
            ("cell:tabel/0/0", "p-cel")
        };
        let a = IncrementeleTekstAanvraag {
            schema: 2,
            basis: basis.clone(),
            request_id: format!("opdracht-{stap}"),
            document_id: "eigen-celproef".into(),
            source_version: format!("bron-{stap}"),
            source_vector: STANDARD.encode(doc.encode_state_vector_v1()),
            snapshot_sha256: snapshot_sha256(&update),
            snapshot: STANDARD.encode(&update),
            client_id: 21,
            position: Cursor {
                story: story.into(),
                para_id: para_id.into(),
                offset: 0,
            },
            text: if stap % 3 == 0 {
                "é😀".into()
            } else {
                " nieuw ".into()
            },
            author: match stap % 3 {
                0 => Some(Auteur {
                    name: "Auteur A".into(),
                    date: "2026-11-04T00:00:00Z".into(),
                }),
                1 => Some(Auteur {
                    name: "Auteur B".into(),
                    date: "2026-11-04T01:00:00Z".into(),
                }),
                _ => None,
            },
        };
        let mut volledig = a.clone();
        volledig.basis = None;
        volledig.snapshot_sha256 = snapshot_sha256(&bron);
        volledig.snapshot = STANDARD.encode(&bron);
        let verwacht = BronSpiegel::default()
            .bereid_voor(volledig)
            .unwrap()
            .unwrap();
        let antwoord = spiegel.bereid_voor(a).unwrap().unwrap();
        assert_eq!(
            antwoord.resultaat.delta, verwacht.resultaat.delta,
            "Delta op stap {stap}"
        );
        assert_eq!(
            serde_json::to_value(&antwoord.resultaat.caret).unwrap(),
            serde_json::to_value(&verwacht.resultaat.caret).unwrap()
        );
        assert_eq!(antwoord.bronvector, verwacht.bronvector);
        vorige_vector = Some(STANDARD.decode(&antwoord.bronvector).unwrap());
        let delta = STANDARD.decode(&antwoord.resultaat.delta).unwrap();
        doc.apply_update_v1(&delta).unwrap();
        vorig_voorstel = Some(delta);
        basis = Some(antwoord.basis);
    }
}
