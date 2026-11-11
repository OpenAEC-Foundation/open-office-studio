use super::*;

#[test]
fn standaard_blijft_uit_en_opening_is_expliciet() {
    let h = HostJournaal::default();
    assert_eq!(h.mogelijkheden()["standaardIngeschakeld"], false);
    assert_eq!(
        h.mogelijkheden()["beschikbaar"],
        cfg!(feature = "writer-bronjournaal")
    );
    assert_eq!(
        h.open("venster", json!({"documentId":"doc","optIn":false}))
            .unwrap_err()
            .soort,
        "uitgeschakeld"
    );
    assert_eq!(
        h.open("venster", json!({"documentId":"doc"}))
            .unwrap_err()
            .soort,
        "ongeldig"
    );
    assert_eq!(
        h.open(
            "venster",
            json!({"documentId":"doc","optIn":true,"eigenaar":"ander"})
        )
        .unwrap_err()
        .soort,
        "ongeldig"
    );
}
#[cfg(not(feature = "writer-bronjournaal"))]
#[test]
fn standaardbouw_weigert_ook_een_expliciete_aanvraag() {
    let h = HostJournaal::default();
    assert_eq!(
        h.open("venster", json!({"documentId":"doc","optIn":true}))
            .unwrap_err()
            .soort,
        "uitgeschakeld"
    );
    assert_eq!(
        h.bereid("venster", json!({"schema":3})).unwrap_err().soort,
        "uitgeschakeld"
    );
    assert_eq!(
        h.vergeet("venster", json!({"documentId":"doc","levensduur":"1"}))
            .unwrap_err()
            .soort,
        "uitgeschakeld"
    );
    h.vergeet_eigenaar("venster").unwrap();
}
#[cfg(feature = "writer-bronjournaal")]
mod ingeschakeld {
    use super::*;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    fn open(h: &HostJournaal, e: &str, d: &str) -> Value {
        h.open(e, json!({"documentId":d,"optIn":true})).unwrap()
    }
    fn opdracht(k: &Value, n: u64) -> Value {
        let d = docx_edit::EditingDoc::new(21);
        d.create_story_with_paragraph_id("body", "p0", "Begin", "Normal", "left")
            .unwrap();
        let bytes = d.encode_state_as_update_v1();
        json!({"koppeling":k,"volgnummer":n,"aanvraag":{
            "schema":3,"requestId":"eigen-proef","documentId":k["documentId"],
            "sourceVersion":"bron","sourceVector":STANDARD.encode(d.encode_state_vector_v1()),
            "snapshotSha256":crate::snapshot_sha256(&bytes),"snapshot":STANDARD.encode(bytes),
            "clientId":21,"position":{"story":"body","paraId":"p0","offset":5},"text":"x"}})
    }
    #[test]
    fn echte_bewerking_behoudt_wirebinding_en_bestaande_routes() {
        let h = HostJournaal::default();
        let k = open(&h, "eigen", "doc");
        assert!(k["levensduur"].is_string());
        assert!(k.get("eigenaar").is_none());
        let a = opdracht(&k, 1);
        let r = h.bereid("eigen", a.clone()).unwrap();
        assert_eq!(r["schema"], 3);
        assert_eq!(r["route"], "gereed");
        assert_eq!(r["levensduur"], k["levensduur"]);
        assert_eq!(r["volgnummer"], 1);
        for veld in [
            "requestId",
            "documentId",
            "sourceVersion",
            "snapshotSha256",
            "clientId",
        ] {
            assert_eq!(r[veld], a["aanvraag"][veld]);
        }
        assert!(r["delta"].as_str().unwrap().len() > 4);
        h.controleer_antwoord("eigen", &r).unwrap();
        h.vergeet("eigen", k).unwrap();
        assert_eq!(
            h.controleer_antwoord("eigen", &r).unwrap_err().soort,
            "verouderd"
        );
        // Onafhankelijke schema-2-route blijft beschikbaar.
        let mut oud = a["aanvraag"].clone();
        oud["schema"] = json!(2);
        assert!(
            crate::BronVoorraad::default()
                .bereid_voor("eigen", serde_json::from_value(oud).unwrap())
                .unwrap()
                .is_some()
        );
    }
    #[test]
    fn andere_vensters_en_oude_sluitberichten_krijgen_geen_toegang() {
        let h = HostJournaal::default();
        let k = open(&h, "eigen", "doc");
        assert_eq!(
            h.bereid("ander", opdracht(&k, 1)).unwrap_err().soort,
            "verouderd"
        );
        h.vergeet("ander", k.clone()).unwrap(); // Geen bijwerking op een andere eigenaar.
        let r = h.bereid("eigen", opdracht(&k, 1)).unwrap();
        h.vergeet("eigen", k.clone()).unwrap();
        let nieuw = open(&h, "eigen", "doc");
        assert_ne!(k["levensduur"], nieuw["levensduur"]);
        h.vergeet("eigen", k).unwrap();
        h.bereid("eigen", opdracht(&nieuw, 1)).unwrap();
        assert_eq!(
            h.controleer_antwoord("eigen", &r).unwrap_err().soort,
            "verouderd"
        );
    }
    #[test]
    fn venstersluiting_vergeet_uitsluitend_eigen_koppelingen() {
        let h = HostJournaal::default();
        let a = open(&h, "a", "doc");
        let b = open(&h, "b", "doc");
        h.vergeet_eigenaar("a").unwrap();
        assert_eq!(
            h.bereid("a", opdracht(&a, 1)).unwrap_err().soort,
            "verouderd"
        );
        h.bereid("b", opdracht(&b, 1)).unwrap();
    }
    #[test]
    fn ongeldige_en_onbekende_transportvelden_worden_voor_toelating_geweigerd() {
        let h = HostJournaal::default();
        let k = open(&h, "eigen", "doc");
        for v in [json!(0), json!(9_007_199_254_740_992_u64), json!("1")] {
            let mut a = opdracht(&k, 1);
            a["volgnummer"] = v;
            assert_eq!(h.bereid("eigen", a).unwrap_err().soort, "ongeldig");
        }
        for v in [
            json!(0),
            json!("0"),
            json!("01"),
            json!("+1"),
            json!("18446744073709551616"),
        ] {
            let mut a = opdracht(&k, 1);
            a["koppeling"]["levensduur"] = v;
            assert_eq!(h.bereid("eigen", a).unwrap_err().soort, "ongeldig");
        }
        for plek in ["envelop", "koppeling", "aanvraag"] {
            let mut a = opdracht(&k, 1);
            if plek == "envelop" {
                a["eigenaar"] = json!("ander");
            } else {
                a[plek]["eigenaar"] = json!("ander");
            }
            assert_eq!(h.bereid("eigen", a).unwrap_err().soort, "ongeldig");
        }
        h.bereid("eigen", opdracht(&k, 1)).unwrap();
    }
    #[test]
    fn volledig_u64_domein_blijft_exact_en_canoniek_op_de_draad() {
        let k: Koppeling =
            lees(json!({"documentId":"doc","levensduur":"18446744073709551615"})).unwrap();
        let b = binding("eigen", &k).unwrap();
        assert_eq!(b.levensduur, u64::MAX);
        assert_eq!(
            serde_json::to_value(k).unwrap()["levensduur"],
            u64::MAX.to_string()
        );
    }
    #[test]
    fn toegelaten_kernfout_verbruikt_volgnummer_zonder_stille_terugval() {
        let h = HostJournaal::default();
        let k = open(&h, "eigen", "doc");
        let mut a = opdracht(&k, 1);
        a["aanvraag"]["snapshotSha256"] = json!("0".repeat(64));
        assert_eq!(h.bereid("eigen", a).unwrap_err().soort, "ongeldig");
        assert_eq!(
            h.bereid("eigen", opdracht(&k, 1)).unwrap_err().soort,
            "volgorde"
        );
        h.bereid("eigen", opdracht(&k, 2)).unwrap();
    }
    #[test]
    fn bronverzoek_blijft_een_schema_drie_antwoord_met_eigen_binding() {
        let h = HostJournaal::default();
        let k = open(&h, "eigen", "doc");
        let mut a = opdracht(&k, 1);
        a["aanvraag"]["basis"] = json!("0".repeat(64));
        let r = h.bereid("eigen", a).unwrap();
        assert_eq!(r["schema"], 3);
        assert_eq!(r["route"], "volledigeBron");
        assert_eq!(r["retryFull"], true);
        assert_eq!(r["levensduur"], k["levensduur"]);
        assert_eq!(r["volgnummer"], 1);
        h.controleer_antwoord("eigen", &r).unwrap();
    }
    #[test]
    fn capaciteit_sluit_geen_andere_koppeling_en_heropent_niets() {
        let h = HostJournaal::default();
        let mut k = vec![];
        for i in 0..4 {
            k.push(open(&h, "eigen", &i.to_string()));
        }
        assert_eq!(
            h.open("eigen", json!({"documentId":"vijf","optIn":true}))
                .unwrap_err()
                .soort,
            "capaciteit"
        );
        for b in k {
            h.bereid("eigen", opdracht(&b, 1)).unwrap();
        }
    }
}
