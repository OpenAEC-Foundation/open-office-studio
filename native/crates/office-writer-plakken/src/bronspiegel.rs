//! Bevestigde bronbytes en een strikt daarvan gescheiden, nog onbevestigd voorstel.
use crate::{Antwoord, MAX_SNAPSHOT_BYTES, snapshot_sha256};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncrementeleTekstAanvraag {
    /// Schema 2: snapshot is volledig zonder basis, anders een delta tegen die basis.
    pub schema: u8,
    pub basis: Option<String>,
    pub request_id: String,
    pub document_id: String,
    pub source_version: String,
    pub source_vector: String,
    pub snapshot_sha256: String,
    pub snapshot: String,
    pub client_id: u64,
    pub position: crate::Cursor,
    pub text: String,
    pub author: Option<crate::Auteur>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IncrementeelAntwoord {
    pub resultaat: Antwoord,
    /// Identificeert uitsluitend de geïmporteerde bron, vóór het voorstel.
    pub basis: String,
    pub bronvector: String,
}

/// Deze spiegel leeft uitsluitend op zijn eigen documentwerker. De nog
/// onbevestigde replica vervangt nooit de bewaarde bevestigde bronbytes.
#[derive(Default)]
pub struct BronSpiegel {
    bron: Option<BevestigdeBron>,
    voorstel: Option<docx_edit::PreparedClipboardReplica>,
    voorstel_bytes: usize,
    #[cfg(test)]
    hergebruikt: bool,
}

struct BevestigdeBron {
    document_id: String,
    client_id: u64,
    basis: String,
    snapshot: Vec<u8>,
}

impl BronSpiegel {
    pub fn bytes(&self) -> usize {
        self.bron
            .as_ref()
            .map_or(0, |b| b.snapshot.len())
            .saturating_add(if self.voorstel.is_some() {
                self.voorstel_bytes
            } else {
                0
            })
    }

    /// None vraagt expliciet om een volledige bron. Ongeldige of onvolledige
    /// gegevens en mislukte bewerkingen veranderen de bevestigde spiegel niet.
    pub fn bereid_voor(
        &mut self,
        a: IncrementeleTekstAanvraag,
    ) -> Result<Option<IncrementeelAntwoord>, String> {
        if a.schema != 2 {
            return Err("Onbekend schema voor incrementele Writer-invoer".into());
        }
        let p = a;
        if p.text.is_empty() || p.text.contains(['\r', '\n']) {
            return Err(
                "Gewone Writer-tekst moet niet leeg zijn en mag geen alineagrens bevatten".into(),
            );
        }
        if p.request_id.is_empty()
            || p.document_id.is_empty()
            || p.source_version.is_empty()
            || p.client_id > 9_007_199_254_740_991
        {
            return Err("De document- of bronbinding van de Writer-invoer ontbreekt".into());
        }
        if p.snapshot.len() > MAX_SNAPSHOT_BYTES.div_ceil(3) * 4 {
            return Err("De incrementele Writer-bron is te groot".into());
        }
        let bytes = STANDARD
            .decode(&p.snapshot)
            .map_err(|_| "De Writer-bron is geen geldige base64")?;
        if bytes.is_empty()
            || bytes.len() > MAX_SNAPSHOT_BYTES
            || snapshot_sha256(&bytes) != p.snapshot_sha256
        {
            return Err("De incrementele Writer-bron wijkt af van de opgegeven gegevens".into());
        }
        let oud = if let Some(basis) = p.basis {
            let Some(oud) = self.bron.as_ref().filter(|b| {
                b.basis == basis && b.document_id == p.document_id && b.client_id == p.client_id
            }) else {
                return Ok(None);
            };
            Some(oud.snapshot.as_slice())
        } else {
            None
        };
        let vector = STANDARD
            .decode(&p.source_vector)
            .map_err(|_| "De Writer-bronvector is geen geldige base64")?;
        let ctx = if let Some(auteur) = &p.author {
            docx_edit::EditCtx::local(&auteur.name, &auteur.date).suggesting()
        } else {
            docx_edit::EditCtx::local("", "")
        };
        let begin = std::time::Instant::now();
        let loc = docx_edit::Loc::new(&p.position.story, &p.position.para_id, p.position.offset);
        let r = docx_edit::prepare_confirmed_clipboard_fragment_cached(
            self.voorstel.take(),
            oud,
            &bytes,
            p.client_id,
            &vector,
            &docx_edit::LocRange {
                start: loc.clone(),
                end: loc,
            },
            &serde_json::json!({"paragraphs":[{"text":p.text}]}),
            &ctx,
            MAX_SNAPSHOT_BYTES,
        )
        .map_err(|e| e.to_string())?;
        #[cfg(test)]
        {
            self.hergebruikt = r.reused;
        }
        self.voorstel_bytes = r.batch.update.len();
        self.voorstel = Some(r.replica);
        let snapshot = r.snapshot;
        let basis = snapshot_sha256(&snapshot);
        let bronvector = p.source_vector;
        let resultaat = Antwoord {
            schema: 1,
            request_id: p.request_id,
            document_id: p.document_id.clone(),
            source_version: p.source_version,
            snapshot_sha256: p.snapshot_sha256,
            client_id: p.client_id,
            delta: STANDARD.encode(r.batch.update),
            caret: crate::Cursor {
                story: r.batch.caret.story,
                para_id: r.batch.caret.para,
                offset: r.batch.caret.offset,
            },
            preparation_ms: begin.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
        };
        self.bron = Some(BevestigdeBron {
            document_id: p.document_id,
            client_id: p.client_id,
            basis: basis.clone(),
            snapshot,
        });
        Ok(Some(IncrementeelAntwoord {
            resultaat,
            basis,
            bronvector,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use docx_edit::{EditCtx, EditingDoc, FormatPolicy, Position, StoryRange};

    fn bron() -> EditingDoc {
        let doc = EditingDoc::new(21);
        doc.keep_deleted();
        doc.create_story_with_paragraph_id("body", "p0", "Voor 😀 na", "Normal", "left")
            .unwrap();
        doc
    }

    fn aanvraag(bytes: Vec<u8>, basis: Option<String>, text: &str) -> IncrementeleTekstAanvraag {
        IncrementeleTekstAanvraag {
            schema: 2,
            basis,
            request_id: "aanvraag".into(),
            document_id: "document".into(),
            source_version: "frontend-versie".into(),
            source_vector: {
                let d = EditingDoc::new(99);
                d.apply_update_v1(&bytes).unwrap();
                STANDARD.encode(d.encode_state_vector_v1())
            },
            snapshot_sha256: snapshot_sha256(&bytes),
            snapshot: STANDARD.encode(bytes),
            client_id: 21,
            position: crate::Cursor {
                story: "body".into(),
                para_id: "p0".into(),
                offset: 7,
            },
            text: text.into(),
            author: None,
        }
    }

    fn tekst(doc: &EditingDoc) -> String {
        doc.paragraphs("body").unwrap()[0].text.clone()
    }

    fn vervolg(
        doc: &EditingDoc,
        vorig: &IncrementeelAntwoord,
        text: &str,
    ) -> IncrementeleTekstAanvraag {
        let bytes = doc
            .encode_diff_v1(&STANDARD.decode(&vorig.bronvector).unwrap())
            .unwrap();
        let mut a = aanvraag(bytes, Some(vorig.basis.clone()), text);
        a.source_vector = STANDARD.encode(doc.encode_state_vector_v1());
        a.position = vorig.resultaat.caret.clone();
        a
    }

    #[test]
    fn exact_bevestigde_voorstellen_zijn_gelijk_aan_steeds_volledig_reconstrueren() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let mut vorig = spiegel
            .bereid_voor(aanvraag(doc.encode_state_as_update_v1(), None, "X"))
            .unwrap()
            .unwrap();
        assert!(!spiegel.hergebruikt);
        for text in [" een", " volgende", " 😀", " tekst", "!"] {
            doc.apply_update_v1(&STANDARD.decode(&vorig.resultaat.delta).unwrap())
                .unwrap();
            let a = vervolg(&doc, &vorig, text);
            assert_eq!(a.snapshot, vorig.resultaat.delta);
            let mut volledig = a.clone();
            volledig.basis = None;
            let bytes = doc.encode_state_as_update_v1();
            volledig.snapshot_sha256 = snapshot_sha256(&bytes);
            volledig.snapshot = STANDARD.encode(bytes.clone());
            let referentie = BronSpiegel::default()
                .bereid_voor(volledig)
                .unwrap()
                .unwrap();
            let volgende = spiegel.bereid_voor(a).unwrap().unwrap();
            assert!(spiegel.hergebruikt);
            assert_eq!(volgende.resultaat.delta, referentie.resultaat.delta);
            assert_eq!(
                serde_json::to_value(&volgende.resultaat.caret).unwrap(),
                serde_json::to_value(&referentie.resultaat.caret).unwrap()
            );
            assert_eq!(spiegel.bron.as_ref().unwrap().snapshot, bytes);
            vorig = volgende;
        }
    }

    #[test]
    fn dezelfde_klokken_met_andere_tekst_bevestigen_geen_voorstel() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(doc.encode_state_as_update_v1(), None, "X"))
            .unwrap()
            .unwrap();
        let voorstel = EditingDoc::new(91);
        voorstel
            .apply_update_v1(&doc.encode_state_as_update_v1())
            .unwrap();
        voorstel
            .apply_update_v1(&STANDARD.decode(&eerste.resultaat.delta).unwrap())
            .unwrap();
        let index = doc
            .locate(&docx_edit::Loc::new("body", "p0", 7))
            .unwrap()
            .index;
        doc.insert_text(
            &EditCtx::local("", ""),
            Position::new("body", index),
            "Y",
            FormatPolicy::Inherit,
        )
        .unwrap();
        assert_eq!(
            doc.encode_state_vector_v1(),
            voorstel.encode_state_vector_v1()
        );
        let mut a = vervolg(&doc, &eerste, "Z");
        assert_ne!(a.snapshot, eerste.resultaat.delta);
        a.position.offset = 8;
        let tweede = spiegel.bereid_voor(a).unwrap().unwrap();
        assert!(!spiegel.hergebruikt);
        doc.apply_update_v1(&STANDARD.decode(tweede.resultaat.delta).unwrap())
            .unwrap();
        assert_eq!(tekst(&doc), "Voor 😀YZ na");
    }

    #[test]
    fn een_verkeerde_vector_promoveert_ook_een_exact_voorstel_niet() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(doc.encode_state_as_update_v1(), None, "X"))
            .unwrap()
            .unwrap();
        doc.apply_update_v1(&STANDARD.decode(&eerste.resultaat.delta).unwrap())
            .unwrap();
        let a = vervolg(&doc, &eerste, "Y");
        let bewaard = spiegel.bron.as_ref().unwrap().snapshot.clone();
        let mut fout = a.clone();
        fout.source_vector = STANDARD.encode([0]);
        assert!(spiegel.bereid_voor(fout).is_err());
        assert_eq!(spiegel.bron.as_ref().unwrap().snapshot, bewaard);
        let tweede = spiegel.bereid_voor(a).unwrap().unwrap();
        assert!(!spiegel.hergebruikt);
        doc.apply_update_v1(&STANDARD.decode(tweede.resultaat.delta).unwrap())
            .unwrap();
        assert_eq!(tekst(&doc), "Voor 😀XY na");
    }

    #[test]
    fn bewaart_de_bron_en_niet_het_voorstel() {
        let doc = bron();
        let voor = doc.encode_state_as_update_v1();
        let mut spiegel = BronSpiegel::default();
        let a = aanvraag(voor.clone(), None, " nieuw 😀");
        let antwoord = spiegel.bereid_voor(a.clone()).unwrap().unwrap();
        assert_eq!(doc.encode_state_as_update_v1(), voor);
        assert_eq!(spiegel.bron.as_ref().unwrap().snapshot, voor);
        assert_eq!(
            STANDARD.decode(&antwoord.bronvector).unwrap(),
            doc.encode_state_vector_v1()
        );
        assert_eq!(antwoord.resultaat.snapshot_sha256, a.snapshot_sha256);
        let bewaard = EditingDoc::new(31);
        bewaard
            .apply_update_v1(&spiegel.bron.as_ref().unwrap().snapshot)
            .unwrap();
        assert_eq!(tekst(&bewaard), "Voor 😀 na");
        doc.apply_update_v1(&STANDARD.decode(antwoord.resultaat.delta).unwrap())
            .unwrap();
        assert_eq!(tekst(&doc), "Voor 😀 nieuw 😀 na");
        assert_eq!(antwoord.basis, spiegel.bron.as_ref().unwrap().basis);
    }

    #[test]
    fn volgende_delta_bevat_alleen_werkelijk_overgenomen_invoer() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(
                doc.encode_state_as_update_v1(),
                None,
                " NIET OVERGENOMEN",
            ))
            .unwrap()
            .unwrap();
        // Het eerste voorstel wordt bewust niet overgenomen. Een andere lokale
        // edit is de enige bronwijziging voor de volgende opdracht.
        doc.insert_text(
            &EditCtx::local("", ""),
            Position::new("body", 0),
            "A",
            FormatPolicy::Inherit,
        )
        .unwrap();
        let delta = doc
            .encode_diff_v1(&STANDARD.decode(eerste.bronvector).unwrap())
            .unwrap();
        let mut a = aanvraag(delta, Some(eerste.basis), " WEL");
        a.source_vector = STANDARD.encode(doc.encode_state_vector_v1());
        a.position.offset = 8;
        let tweede = spiegel.bereid_voor(a).unwrap().unwrap();
        doc.apply_update_v1(&STANDARD.decode(tweede.resultaat.delta).unwrap())
            .unwrap();
        assert_eq!(tekst(&doc), "AVoor 😀 WEL na");
        assert!(!tekst(&doc).contains("NIET OVERGENOMEN"));
    }

    #[test]
    fn bevestigde_invoer_en_verwijdering_komen_met_een_kleine_delta_mee() {
        let doc = bron();
        let lang = " extra woorden".repeat(5000);
        doc.insert_text(
            &EditCtx::local("", ""),
            Position::new("body", 10),
            &lang,
            FormatPolicy::Inherit,
        )
        .unwrap();
        let volledig = doc.encode_state_as_update_v1();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(volledig.clone(), None, "X"))
            .unwrap()
            .unwrap();
        doc.apply_update_v1(&STANDARD.decode(eerste.resultaat.delta).unwrap())
            .unwrap();
        doc.delete_range(&EditCtx::local("", ""), StoryRange::new("body", 0, 5))
            .unwrap();
        let delta = doc
            .encode_diff_v1(&STANDARD.decode(eerste.bronvector).unwrap())
            .unwrap();
        assert!(delta.len() * 100 < volledig.len());
        let mut a = aanvraag(delta, Some(eerste.basis), "Y");
        a.source_vector = STANDARD.encode(doc.encode_state_vector_v1());
        a.position.offset = 3;
        let voor = tekst(&doc);
        let tweede = spiegel.bereid_voor(a).unwrap().unwrap();
        doc.apply_update_v1(&STANDARD.decode(tweede.resultaat.delta).unwrap())
            .unwrap();
        assert_eq!(tekst(&doc), voor.replacen("😀X", "😀XY", 1));
        assert_eq!(spiegel.bron.as_ref().unwrap().basis, tweede.basis);
    }

    #[test]
    fn onbekende_basis_of_een_andere_eigenaar_vraagt_een_volledige_bron() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(doc.encode_state_as_update_v1(), None, "X"))
            .unwrap()
            .unwrap();
        let bron = spiegel.bron.as_ref().unwrap().snapshot.clone();
        for veld in ["basis", "document", "client"] {
            let mut a = aanvraag(vec![0, 0], Some(eerste.basis.clone()), "Y");
            a.source_vector = eerste.bronvector.clone();
            match veld {
                "basis" => a.basis = Some("onbekend".into()),
                "document" => a.document_id = "ander document".into(),
                _ => a.client_id = 22,
            }
            assert!(spiegel.bereid_voor(a).unwrap().is_none());
            assert_eq!(spiegel.bron.as_ref().unwrap().snapshot, bron);
        }
    }

    #[test]
    fn geweigerde_bewerking_of_verkeerde_hash_verandert_de_spiegel_niet() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(doc.encode_state_as_update_v1(), None, "X"))
            .unwrap()
            .unwrap();
        let bron = spiegel.bron.as_ref().unwrap().snapshot.clone();
        for veld in ["hash", "tekst", "positie", "schema", "delta"] {
            let mut a = aanvraag(vec![0, 0], Some(eerste.basis.clone()), "Y");
            a.source_vector = eerste.bronvector.clone();
            match veld {
                "hash" => a.snapshot_sha256 = "0".repeat(64),
                "tekst" => a.text = "twee\nregels".into(),
                "positie" => a.position.para_id = "ontbreekt".into(),
                "schema" => a.schema = 1,
                _ => {
                    a.snapshot = STANDARD.encode([255]);
                    a.snapshot_sha256 = snapshot_sha256(&[255]);
                }
            }
            assert!(spiegel.bereid_voor(a).is_err(), "{veld}");
            assert_eq!(spiegel.bron.as_ref().unwrap().snapshot, bron);
        }
    }

    #[test]
    fn bericht_rondgang_is_streng_en_een_lege_spiegel_vraagt_hersynchronisatie() {
        let a = aanvraag(vec![0, 0], Some("niet-meer-aanwezig".into()), "Y");
        let json = serde_json::to_value(&a).unwrap();
        let terug: IncrementeleTekstAanvraag = serde_json::from_value(json.clone()).unwrap();
        assert!(BronSpiegel::default().bereid_voor(terug).unwrap().is_none());
        let mut fout = json;
        fout["onbekend"] = serde_json::json!(true);
        assert!(serde_json::from_value::<IncrementeleTekstAanvraag>(fout).is_err());
        assert_eq!(BronSpiegel::default().bytes(), 0);
    }

    #[test]
    fn verkeerde_of_misvormde_bronvector_wordt_niet_bevestigd() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(doc.encode_state_as_update_v1(), None, "X"))
            .unwrap()
            .unwrap();
        let oud = spiegel.bron.as_ref().unwrap().snapshot.clone();
        for vector in [
            STANDARD.encode([0]),
            STANDARD.encode([255]),
            "geen base64".into(),
        ] {
            let mut a = aanvraag(vec![0, 0], Some(eerste.basis.clone()), "Y");
            a.source_vector = vector;
            assert!(spiegel.bereid_voor(a).is_err());
            assert_eq!(spiegel.bron.as_ref().unwrap().snapshot, oud);
        }
    }

    #[test]
    fn synchronisatie_behoudt_meerdere_clientidentiteiten() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(
                doc.encode_state_as_update_v1(),
                None,
                "NIET OVERGENOMEN",
            ))
            .unwrap()
            .unwrap();
        let ander = EditingDoc::new(22);
        ander
            .apply_update_v1(&doc.encode_state_as_update_v1())
            .unwrap();
        ander
            .insert_text(
                &EditCtx::local("", ""),
                Position::new("body", 0),
                "A",
                FormatPolicy::Inherit,
            )
            .unwrap();
        doc.apply_update_v1(&ander.encode_state_as_update_v1())
            .unwrap();
        let delta = doc
            .encode_diff_v1(&STANDARD.decode(eerste.bronvector).unwrap())
            .unwrap();
        let mut a = aanvraag(delta, Some(eerste.basis), "Y");
        a.position.offset = 8;
        a.source_vector = STANDARD.encode(doc.encode_state_vector_v1());
        let antwoord = spiegel.bereid_voor(a).unwrap().unwrap();
        doc.apply_update_v1(&STANDARD.decode(antwoord.resultaat.delta).unwrap())
            .unwrap();
        assert_eq!(tekst(&doc), "AVoor 😀Y na");
    }

    #[test]
    fn bijgehouden_invoer_blijft_gelijk_aan_de_bestaande_volledige_route() {
        let doc = bron();
        let ctx = EditCtx::local("Voorbeeld", "2026-11-04T00:00:00Z").suggesting();
        doc.insert_text(
            &ctx,
            Position::new("body", 0),
            "Eerder ",
            FormatPolicy::Inherit,
        )
        .unwrap();
        let bytes = doc.encode_state_as_update_v1();
        let mut a = aanvraag(bytes.clone(), None, " nieuw");
        a.author = Some(crate::Auteur {
            name: "Voorbeeld".into(),
            date: "2026-11-04T01:00:00Z".into(),
        });
        let oud = crate::bereid_tekst_voor(crate::TekstAanvraag {
            schema: 1,
            request_id: a.request_id.clone(),
            document_id: a.document_id.clone(),
            source_version: a.source_version.clone(),
            snapshot_sha256: a.snapshot_sha256.clone(),
            snapshot: a.snapshot.clone(),
            client_id: a.client_id,
            position: a.position.clone(),
            text: a.text.clone(),
            author: a.author.clone(),
        })
        .unwrap();
        let nieuw = BronSpiegel::default().bereid_voor(a).unwrap().unwrap();
        assert_eq!(nieuw.resultaat.delta, oud.delta);
        assert_eq!(
            serde_json::to_value(nieuw.resultaat.caret).unwrap(),
            serde_json::to_value(oud.caret).unwrap()
        );
        assert_eq!(doc.encode_state_as_update_v1(), bytes);
    }

    #[test]
    fn een_delta_met_ontbrekende_voorganger_wordt_niet_bevestigd() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(doc.encode_state_as_update_v1(), None, "X"))
            .unwrap()
            .unwrap();
        let oud = spiegel.bron.as_ref().unwrap().snapshot.clone();
        doc.insert_text(
            &EditCtx::local("", ""),
            Position::new("body", 0),
            "A",
            FormatPolicy::Inherit,
        )
        .unwrap();
        let tussen = doc.encode_state_vector_v1();
        doc.insert_text(
            &EditCtx::local("", ""),
            Position::new("body", 0),
            "B",
            FormatPolicy::Inherit,
        )
        .unwrap();
        let alleen_b = doc.encode_diff_v1(&tussen).unwrap();
        let fout = spiegel
            .bereid_voor(aanvraag(alleen_b, Some(eerste.basis), "Y"))
            .unwrap_err();
        assert!(fout.contains("afhankelijkheden"));
        assert_eq!(spiegel.bron.as_ref().unwrap().snapshot, oud);
    }

    #[test]
    fn volledige_hersynchronisatie_vervangt_de_bron_zonder_oude_voorstellen() {
        let doc = bron();
        let mut spiegel = BronSpiegel::default();
        let eerste = spiegel
            .bereid_voor(aanvraag(
                doc.encode_state_as_update_v1(),
                None,
                "OUDE INVOER",
            ))
            .unwrap()
            .unwrap();
        let nieuw = EditingDoc::new(22);
        nieuw
            .create_story_with_paragraph_id("body", "p0", "Nieuw document", "Normal", "left")
            .unwrap();
        let mut a = aanvraag(nieuw.encode_state_as_update_v1(), None, "!");
        a.source_vector = STANDARD.encode(nieuw.encode_state_vector_v1());
        a.client_id = 22;
        a.position.offset = 14;
        let tweede = spiegel.bereid_voor(a).unwrap().unwrap();
        nieuw
            .apply_update_v1(&STANDARD.decode(tweede.resultaat.delta).unwrap())
            .unwrap();
        assert_eq!(tekst(&nieuw), "Nieuw document!");
        assert!(
            spiegel
                .bereid_voor(aanvraag(vec![0, 0], Some(eerste.basis), "LATE INVOER"))
                .unwrap()
                .is_none()
        );
        assert_eq!(spiegel.bron.as_ref().unwrap().basis, tweede.basis);
        assert_eq!(spiegel.bron.as_ref().unwrap().client_id, 22);
    }
}
