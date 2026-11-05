//! Een revisie van een auteur mag geen wijziging van een andere auteur verwijderen.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_edit::{ChangeTarget, EditCtx, EditingDoc};
use office_writer_plakken::{Auteur, Cursor, TekstAanvraag, bereid_tekst_voor, snapshot_sha256};

#[test]
fn koude_voorbereidingen_houden_revisies_van_twee_auteurs_gescheiden() {
    let doc = EditingDoc::new(21);
    doc.keep_deleted();
    doc.create_story_with_paragraph_id("body", "p-body", "Basis", "Normal", "left")
        .unwrap();
    doc.create_story_with_paragraph_id("cell:tabel/0/0", "p-cel", "Cel", "Normal", "left")
        .unwrap();
    for (stap, story, para, tekst, auteur) in [
        (0, "body", "p-body", "A ", "Auteur A"),
        (1, "cell:tabel/0/0", "p-cel", "B ", "Auteur B"),
    ] {
        let bron = doc.encode_state_as_update_v1();
        let antwoord = bereid_tekst_voor(TekstAanvraag {
            schema: 1,
            request_id: format!("revisie-{stap}"),
            document_id: "eigen-revisieproef".into(),
            source_version: format!("bron-{stap}"),
            snapshot_sha256: snapshot_sha256(&bron),
            snapshot: STANDARD.encode(&bron),
            client_id: 21,
            position: Cursor {
                story: story.into(),
                para_id: para.into(),
                offset: 0,
            },
            text: tekst.into(),
            author: Some(Auteur {
                name: auteur.into(),
                date: "2026-11-04T00:00:00Z".into(),
            }),
        })
        .unwrap();
        assert_eq!(
            doc.encode_state_as_update_v1(),
            bron,
            "Voorbereiding verandert de levende bron niet"
        );
        doc.apply_update_v1(&STANDARD.decode(antwoord.delta).unwrap())
            .unwrap();
    }
    assert_eq!(doc.paragraphs("body").unwrap()[0].text, "A Basis");
    assert_eq!(doc.paragraphs("cell:tabel/0/0").unwrap()[0].text, "B Cel");
    let a = doc.list_changes("body").unwrap()[0].revision_id.clone();
    let b = doc.list_changes("cell:tabel/0/0").unwrap()[0]
        .revision_id
        .clone();
    doc.reject_change(&EditCtx::local("", ""), &ChangeTarget::Revision(a.clone()))
        .unwrap();
    assert_eq!(doc.paragraphs("body").unwrap()[0].text, "Basis");
    assert_eq!(
        doc.paragraphs("cell:tabel/0/0").unwrap()[0].text,
        "B Cel",
        "Alleen auteur A verwerpen moet auteur B behouden; revisie-ID's: {a} / {b}"
    );
    assert_ne!(a, b);
    doc.reject_change(&EditCtx::local("", ""), &ChangeTarget::Revision(b))
        .unwrap();
    assert_eq!(doc.paragraphs("cell:tabel/0/0").unwrap()[0].text, "Cel");
}

fn native_invoer(doc: &EditingDoc, auteur: &str, tekst: &str, positie: u32) {
    let bron = doc.encode_state_as_update_v1();
    let antwoord = bereid_tekst_voor(TekstAanvraag {
        schema: 1,
        request_id: format!("opdracht-{auteur}-{positie}"),
        document_id: "eigen-revisieproef".into(),
        source_version: "bron".into(),
        snapshot_sha256: snapshot_sha256(&bron),
        snapshot: STANDARD.encode(&bron),
        client_id: 21,
        position: Cursor {
            story: "body".into(),
            para_id: "p-body".into(),
            offset: positie,
        },
        text: tekst.into(),
        author: Some(Auteur {
            name: auteur.into(),
            date: "2026-11-04T00:00:00Z".into(),
        }),
    })
    .unwrap();
    doc.apply_update_v1(&STANDARD.decode(antwoord.delta).unwrap())
        .unwrap();
}

#[test]
fn native_en_rechtstreekse_sdk_bewerking_gebruiken_verschillende_revisies() {
    let doc = EditingDoc::new(21);
    doc.keep_deleted();
    doc.create_story_with_paragraph_id("body", "p-body", "Basis", "Normal", "left")
        .unwrap();
    native_invoer(&doc, "Auteur A", "A ", 0);
    let begin = doc
        .locate(&docx_edit::Loc::new("body", "p-body", 7))
        .unwrap()
        .index;
    doc.insert_text(
        &EditCtx::local("Auteur B", "2026-11-04T01:00:00Z").suggesting(),
        docx_edit::Position::new("body", begin),
        "B ",
        docx_edit::FormatPolicy::Inherit,
    )
    .unwrap();
    let wijzigingen = doc.list_changes("body").unwrap();
    let a = wijzigingen
        .iter()
        .find(|r| r.author == "Auteur A")
        .unwrap()
        .revision_id
        .clone();
    let b = wijzigingen
        .iter()
        .find(|r| r.author == "Auteur B")
        .unwrap()
        .revision_id
        .clone();
    doc.reject_change(&EditCtx::local("", ""), &ChangeTarget::Revision(a.clone()))
        .unwrap();
    assert_eq!(doc.paragraphs("body").unwrap()[0].text, "BasisB ");
    assert_ne!(a, b);
}

#[test]
fn verwijderde_revisie_blijft_na_gc_en_volledige_reconstructie_gereserveerd() {
    // Zonder keep_deleted verzamelt de levende bron verwijderde inhoud.
    let doc = EditingDoc::new(21);
    doc.create_story_with_paragraph_id("body", "p-body", "Basis", "Normal", "left")
        .unwrap();
    native_invoer(&doc, "Auteur A", "A ", 0);
    let oud = doc.list_changes("body").unwrap()[0].revision_id.clone();
    doc.reject_change(
        &EditCtx::local("", ""),
        &ChangeTarget::Revision(oud.clone()),
    )
    .unwrap();
    assert!(doc.list_changes("body").unwrap().is_empty());
    native_invoer(&doc, "Auteur B", "B ", 0);
    let nieuw = doc.list_changes("body").unwrap()[0].revision_id.clone();
    assert_ne!(
        oud, nieuw,
        "Een opgeruimde revisie-identiteit mag niet terugkomen"
    );
    assert_eq!(doc.paragraphs("body").unwrap()[0].text, "B Basis");
}

#[test]
fn ongeldige_of_uitgeputte_revisieteller_geeft_geen_delta_of_bronmutatie() {
    use yrs::{Any, Doc, Map, ReadTxn, StateVector, Transact};
    for value in [
        Any::from("ongeldig"),
        Any::from("18446744073709551615"),
        Any::from(-1),
        Any::Bool(true),
    ] {
        let doc = EditingDoc::new(21);
        doc.create_story_with_paragraph_id("body", "p-body", "Basis", "Normal", "left")
            .unwrap();
        let bron = Doc::with_client_id(22);
        let map = bron.get_or_insert_map("openaec-native-revision-sequences-v1");
        map.insert(&mut bron.transact_mut(), "21", value);
        doc.apply_update_v1(
            &bron
                .transact()
                .encode_state_as_update_v1(&StateVector::default()),
        )
        .unwrap();
        let bytes = doc.encode_state_as_update_v1();
        let antwoord = bereid_tekst_voor(TekstAanvraag {
            schema: 1,
            request_id: "ongeldige-teller".into(),
            document_id: "eigen-revisieproef".into(),
            source_version: "bron".into(),
            snapshot_sha256: snapshot_sha256(&bytes),
            snapshot: STANDARD.encode(&bytes),
            client_id: 21,
            position: Cursor {
                story: "body".into(),
                para_id: "p-body".into(),
                offset: 0,
            },
            text: "A ".into(),
            author: Some(Auteur {
                name: "Auteur A".into(),
                date: "2026-11-04T00:00:00Z".into(),
            }),
        });
        assert!(antwoord.is_err());
        assert_eq!(doc.encode_state_as_update_v1(), bytes);
        assert_eq!(doc.paragraphs("body").unwrap()[0].text, "Basis");
    }
}
