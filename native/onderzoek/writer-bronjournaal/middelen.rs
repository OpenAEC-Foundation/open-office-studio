//! Getypeerde capaciteitsafhandeling; geen aangesloten desktoproute.
mod journaal;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use docx_journal::EditingDoc;
use journaal::{Fout, Journaal, Middelengrens};
use office_writer_plakken::{BronSpiegel, IncrementeleTekstAanvraag as Vraag, MAX_SNAPSHOT_BYTES};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
fn vraag(v: &Value) -> Vraag {
    serde_json::from_value(v.clone()).unwrap()
}
fn hash(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect()
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let rows: Vec<Value> = serde_json::from_slice(&fs::read(
        std::env::args().nth(1).ok_or("Geef eigen reeks")?,
    )?)?;
    assert_eq!(MAX_SNAPSHOT_BYTES, 100 * 1024 * 1024);
    assert_eq!(Journaal::default().grens, 64 * 1024 * 1024);
    let mut eerste = rows[0]["aanvraag"].clone();
    eerste["schema"] = json!(3);
    let omvang = STANDARD.decode(eerste["snapshot"].as_str().unwrap())?.len();
    let mut krap = Journaal::default();
    krap.grens = omvang - 1;
    assert_eq!(
        krap.bereid_getypeerd(vraag(&eerste)),
        Err(Fout::BestaandeRouteNodig(Middelengrens::Bron))
    );
    assert!(krap.actuele_token().is_none());
    for (veld, waarde) in [
        ("snapshotSha256", json!("0".repeat(64))),
        ("snapshot", json!("!")),
        ("sourceVector", json!("!")),
        ("sourceVector", json!("/w==")),
        ("schema", json!(2)),
        ("documentId", json!("")),
    ] {
        let mut fout = eerste.clone();
        fout[veld] = waarde;
        assert!(
            matches!(krap.bereid_getypeerd(vraag(&fout)), Err(Fout::Ongeldig(_))),
            "Corruptie mag geen routekeuze zijn: {veld}"
        );
    }
    // Een kloppende transporthash bewijst geen geldig CRDT-document. Een
    // capaciteitsadvies mag die onafhankelijke afkeur nooit overslaan.
    let mut onleesbaar = eerste.clone();
    onleesbaar["snapshot"] = json!(STANDARD.encode([255u8, 255]));
    onleesbaar["snapshotSha256"] = json!(hash(&[255, 255]));
    krap.grens = 1;
    assert_eq!(
        krap.bereid_getypeerd(vraag(&onleesbaar)),
        Err(Fout::BestaandeRouteNodig(Middelengrens::Bron))
    );
    onleesbaar["schema"] = json!(2);
    assert!(
        BronSpiegel::default()
            .bereid_voor(vraag(&onleesbaar))
            .is_err()
    );
    let mut uitkomsten = vec![];
    for soort in 0..3 {
        let mut j = Journaal::default();
        let (a, reden, verwachte_rij) = if soort == 0 {
            j.grens = omvang - 1;
            (eerste.clone(), Middelengrens::Bron, 0)
        } else {
            j.bereid_getypeerd(vraag(&eerste))?
                .ok_or("Start ontbreekt")?;
            let mut a = rows[1]["aanvraag"].clone();
            a["schema"] = json!(3);
            a["basis"] = json!(j.actuele_token().unwrap());
            j.grens = if soort == 1 {
                j.bytes() - 1
            } else {
                j.bytes() + 1
            };
            (
                a,
                if soort == 1 {
                    Middelengrens::BevestigdJournaal
                } else {
                    Middelengrens::JournaalEnVoorstel
                },
                1,
            )
        };
        let oud = j.actuele_token().map(str::to_owned);
        if soort > 0 {
            let mut verkeerd = a.clone();
            verkeerd["basis"] = json!("onbekend");
            assert!(
                j.bereid_getypeerd(vraag(&verkeerd))?.is_none(),
                "Binding vraagt volledige bron, geen capaciteitsfallback"
            );
        }
        assert_eq!(
            j.bereid_getypeerd(vraag(&a)),
            Err(Fout::BestaandeRouteNodig(reden))
        );
        assert_eq!(j.actuele_token(), oud.as_deref());
        // Een routekeuze verleent geen bronvertrouwen: schema 2 krijgt de hele
        // actuele bron en valideert die zelf, zonder een schema-3-token.
        let doc = EditingDoc::new(eerste["clientId"].as_u64().unwrap());
        doc.keep_deleted();
        docx_journal::import_journal_source(
            &doc,
            &STANDARD.decode(eerste["snapshot"].as_str().unwrap())?,
        )?;
        if soort > 0 {
            docx_journal::import_journal_source(
                &doc,
                &STANDARD.decode(rows[0]["antwoord"]["delta"].as_str().unwrap())?,
            )?;
        }
        let bytes = doc.encode_state_as_update_v1();
        let mut volledig = a.clone();
        volledig["schema"] = json!(2);
        volledig["basis"] = Value::Null;
        volledig["snapshot"] = json!(STANDARD.encode(&bytes));
        volledig["snapshotSha256"] = json!(hash(&bytes));
        let r = BronSpiegel::default()
            .bereid_voor(vraag(&volledig))?
            .ok_or("Bestaande route weigert volledige bron")?;
        let r = serde_json::to_value(r.resultaat)?;
        assert_eq!(r["delta"], rows[verwachte_rij]["antwoord"]["delta"]);
        assert_eq!(r["caret"], rows[verwachte_rij]["antwoord"]["caret"]);
        j.grens = 64 * 1024 * 1024;
        let mut herstart = volledig.clone();
        herstart["schema"] = json!(3);
        let hersteld = j
            .bereid_getypeerd(vraag(&herstart))?
            .ok_or("Bronreset vraagt opnieuw bron")?;
        assert_eq!(hersteld["delta"], r["delta"]);
        assert_eq!(hersteld["caret"], r["caret"]);
        docx_journal::import_journal_source(&doc, &STANDARD.decode(r["delta"].as_str().unwrap())?)?;
        assert_eq!(j.laatste_bron()?, doc.encode_state_as_update_v1());
        let mut beschadigd = volledig;
        beschadigd["snapshotSha256"] = json!("0".repeat(64));
        assert!(
            BronSpiegel::default()
                .bereid_voor(vraag(&beschadigd))
                .is_err()
        );
        uitkomsten.push(json!({"route":soort,"getypeerde_grens":true,"bevestigde_token_behouden":true,"bestaande_route_delta_en_caret_exact":true,"bestaande_route_weigert_corruptie":true,"volledige_herstart_bron_bytegelijk":true}));
    }
    println!(
        "{}",
        serde_json::to_string_pretty(
            &json!({"gevallen":uitkomsten,"bestaande_limiet":MAX_SNAPSHOT_BYTES,"journaallimiet":Journaal::default().grens,"zes_corrupties_geen_fallback":true,"grens":"Verlaagde onderzoekscaps op bestaande documentreeks; geen werkelijke 64/100-MiB-heap-, desktop- of platformacceptatie."})
        )?
    );
    Ok(())
}
