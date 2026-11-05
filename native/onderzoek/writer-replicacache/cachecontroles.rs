#[cfg(test)]
mod encodercachecontroles {
    use super::*;
    use docx_edit::EditingDoc;
    fn aanvraag(doc:&EditingDoc)->IncrementeleTekstAanvraag {
        let bytes=doc.encode_state_as_update_v1();
        IncrementeleTekstAanvraag {schema:2,basis:None,request_id:"eigen".into(),document_id:"eigen".into(),source_version:"eigen".into(),source_vector:STANDARD.encode(doc.encode_state_vector_v1()),snapshot_sha256:snapshot_sha256(&bytes),snapshot:STANDARD.encode(bytes),client_id:21,position:crate::Cursor{story:"body".into(),para_id:"p0".into(),offset:0},text:"toe".into(),author:None}
    }
    #[test]
    fn cachegewicht_wordt_geteld_en_na_afgekeurde_vector_vrijgegeven() {
        let doc=EditingDoc::new(21);doc.keep_deleted();doc.create_story_with_paragraph_id("body","p0","eigen woorden","Normal","left").unwrap();
        let mut spiegel=BronSpiegel::default();let eerste=spiegel.bereid_voor(aanvraag(&doc)).unwrap().unwrap();
        let bronbytes=spiegel.bron.as_ref().unwrap().snapshot.len();
        let cachebytes=spiegel.voorstel.as_ref().unwrap().encoding_cache_bytes();
        assert!(cachebytes>0 && cachebytes<=32*1024*1024);
        assert_eq!(spiegel.bytes(),bronbytes+spiegel.voorstel_bytes+cachebytes);
        doc.apply_update_v1(&STANDARD.decode(&eerste.resultaat.delta).unwrap()).unwrap();
        let mut vervolg=aanvraag(&doc);vervolg.basis=Some(eerste.basis.clone());vervolg.snapshot=eerste.resultaat.delta.clone();vervolg.snapshot_sha256=snapshot_sha256(&STANDARD.decode(&vervolg.snapshot).unwrap());
        let goed=vervolg.clone();vervolg.source_vector=STANDARD.encode([0]);
        assert!(spiegel.bereid_voor(vervolg).is_err());assert!(spiegel.voorstel.is_none());assert_eq!(spiegel.bytes(),bronbytes);
        let tweede=spiegel.bereid_voor(goed).unwrap().unwrap();assert!(!spiegel.hergebruikt);
        assert_ne!(tweede.basis,eerste.basis);assert!(spiegel.voorstel.as_ref().unwrap().encoding_cache_bytes()>0);
    }
}
