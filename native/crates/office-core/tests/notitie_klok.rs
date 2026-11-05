//! Eerst zonder nieuwe klok-API: de hardgecodeerde aanmaakdatum is een echte fout.
use office_core::document::{Module, Sessie};
#[test]
fn nieuwe_notities_hebben_de_werkelijke_aanmaakdatum() {
    let voor = chrono::Utc::now();
    let sessie = Sessie::nieuw(Module::Notition).unwrap();
    let na = chrono::Utc::now();
    let d: serde_json::Value = serde_json::from_slice(&sessie.bron()).unwrap();
    let tijd = chrono::DateTime::parse_from_rfc3339(
        d["boeken"][0]["secties"][0]["paginas"][0]["bijgewerkt"]
            .as_str()
            .unwrap(),
    )
    .unwrap()
    .with_timezone(&chrono::Utc);
    // De bron bewaart milliseconden; rond de ondergrens even ver naar beneden af.
    assert!(tijd.timestamp_millis() >= voor.timestamp_millis());
    assert!(tijd.timestamp_millis() <= na.timestamp_millis());
}

use office_core::{
    document::{Bewerking, Document},
    klok::{Klok, VasteKlok},
    notities::NotitieActie as N,
    opmaak::Opmaak,
};
use std::sync::{
    Arc,
    atomic::{AtomicI64, Ordering},
};
fn bron(s: &Sessie) -> serde_json::Value {
    serde_json::from_slice(&s.bron()).unwrap()
}
fn tijd(s: &Sessie) -> String {
    bron(s)["boeken"][0]["secties"][0]["paginas"][0]["bijgewerkt"]
        .as_str()
        .unwrap()
        .into()
}
fn vast(t: &str) -> Arc<dyn Klok> {
    Arc::new(VasteKlok::parseer(t).unwrap())
}
struct Stappen {
    teller: AtomicI64,
}
impl Klok for Stappen {
    fn nu(&self) -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339("2031-01-01T23:59:59Z")
            .unwrap()
            .with_timezone(&chrono::Utc)
            + chrono::Duration::seconds(self.teller.fetch_add(1, Ordering::SeqCst))
    }
}
fn voorbeeld(klok: Arc<dyn Klok>) -> Sessie {
    Sessie::open_met_klok(
        Module::Notition,
        include_bytes!("../../../../docs/voorbeelden/Notitieboek.json").to_vec(),
        klok,
    )
    .unwrap()
}
#[test]
fn notitieklok_opmaak_en_gelijke_brontransactie_gebruiken_een_moment_en_undo_bewaart_metadata() {
    let klok = Arc::new(Stappen {
        teller: AtomicI64::new(0),
    });
    let mut s = voorbeeld(klok.clone());
    let origineel = s.bron();
    let titel = "/boeken/0/secties/0/paginas/0/titel";
    let tekst = "/boeken/0/secties/0/paginas/0/vakken/0/blokken/0/tekst";
    s.bewerk(
        0,
        Bewerking::Notitie(N::Teksten(vec![
            (titel.into(), "Nieuwe titel".into()),
            (tekst.into(), "café 🏠".into()),
        ])),
    )
    .unwrap();
    assert_eq!(tijd(&s), "2031-01-01T23:59:59.000Z");
    assert_eq!(klok.teller.load(Ordering::SeqCst), 1);
    let eerste = s.bron();
    let _ = s.weergave(0).unwrap();
    assert_eq!(klok.teller.load(Ordering::SeqCst), 1);
    s.bewerk(
        0,
        Bewerking::Opmaak {
            id: tekst.into(),
            begin: 0,
            einde: 0,
            stijl: Opmaak::Vet(true),
        },
    )
    .unwrap();
    assert_eq!(tijd(&s), "2031-01-02T00:00:00.000Z");
    assert_eq!(klok.teller.load(Ordering::SeqCst), 2);
    let tweede = s.bron();
    s.bewerk(
        0,
        Bewerking::Notitie(N::Teksten(vec![
            (titel.into(), "Mag niet blijven".into()),
            ("/ongeldig".into(), "fout".into()),
        ])),
    )
    .unwrap_err();
    assert_eq!(s.bron(), tweede);
    s.terug().unwrap();
    assert_eq!(s.bron(), eerste);
    s.terug().unwrap();
    assert_eq!(s.bron(), origineel);
    s.vooruit().unwrap();
    assert_eq!(s.bron(), eerste);
    s.vooruit().unwrap();
    assert_eq!(s.bron(), tweede);
}
#[test]
fn notitieklok_nieuwe_pagina_sectie_en_boek_delen_geen_vaste_aanmaakdatum() {
    let klok = Arc::new(Stappen {
        teller: AtomicI64::new(0),
    });
    let mut s = Sessie::nieuw_met_klok(Module::Notition, klok.clone()).unwrap();
    assert_eq!(tijd(&s), "2031-01-01T23:59:59.000Z");
    let eerste = bron(&s)["boeken"][0]["secties"][0]["paginas"][0].clone();
    let p = s
        .bewerk_met_weergave(0, Bewerking::Notitie(N::NieuwePagina))
        .unwrap()
        .notitie
        .unwrap();
    assert_eq!(p.bijgewerkt, "2031-01-02T00:00:00.000Z");
    let p = s
        .bewerk_met_weergave(
            p.deel,
            Bewerking::Notitie(N::NieuweSectie { markdown: false }),
        )
        .unwrap()
        .notitie
        .unwrap();
    assert_eq!(p.bijgewerkt, "2031-01-02T00:00:01.000Z");
    let p = s
        .bewerk_met_weergave(p.deel, Bewerking::Notitie(N::NieuwBoek))
        .unwrap()
        .notitie
        .unwrap();
    assert_eq!(p.bijgewerkt, "2031-01-02T00:00:02.000Z");
    assert_eq!(bron(&s)["boeken"][0]["secties"][0]["paginas"][0], eerste);
    assert_eq!(klok.teller.load(Ordering::SeqCst), 4);
}
#[test]
fn notitieklok_eigen_sessies_op_twee_draden_blijven_gescheiden() {
    let draden = ["2030-01-01T00:00:00Z", "2040-12-31T23:59:59Z"].map(|t| {
        std::thread::spawn(move || {
            let mut s = voorbeeld(vast(t));
            let origineel = s.bron();
            for _ in 0..8 {
                s.bewerk(0, Bewerking::Notitie(N::Vastzetten(true)))
                    .unwrap();
                assert_eq!(tijd(&s), format!("{}.000Z", t.trim_end_matches('Z')));
                s.terug().unwrap();
                assert_eq!(s.bron(), origineel);
            }
        })
    });
    for d in draden {
        d.join().unwrap();
    }
}
#[test]
fn notitieklok_bestaande_bron_lezen_raadpleegt_geen_klok_en_behoudt_exacte_tijd() {
    struct NietLezen;
    impl Klok for NietLezen {
        fn nu(&self) -> chrono::DateTime<chrono::Utc> {
            panic!("Alleen lezen mag de klok niet raadplegen")
        }
    }
    let s = voorbeeld(Arc::new(NietLezen));
    let b = s.bron();
    let _ = s.weergave(0).unwrap();
    assert_eq!(s.bron(), b);
    assert!(!s.kan_terug());
}
#[test]
fn notitieklok_vaste_tijd_controleert_kalender_en_normaliseert_naar_utc() {
    for t in ["geen tijd", "2031-02-29T12:00:00Z", "2030-13-01T00:00:00Z"] {
        assert!(VasteKlok::parseer(t).is_err());
    }
    let k = VasteKlok::parseer("2030-02-28T23:30:00-02:00").unwrap();
    let d = Document::nieuw_met_klok(Module::Notition, &k).unwrap();
    let v: serde_json::Value = serde_json::from_slice(&d.bytes().unwrap()).unwrap();
    assert_eq!(
        v["boeken"][0]["secties"][0]["paginas"][0]["bijgewerkt"],
        "2030-03-01T01:30:00.000Z"
    );
}

#[test]
fn notitieklok_dagzone_gebruikt_een_geldige_kalenderdag_zonder_de_brontijd_te_wijzigen() {
    use office_core::klok::Dagzone;
    let bron = "2030-02-28T23:30:00Z";
    assert_eq!(Dagzone::Utc.kalenderdag(bron), Some((2030, 2, 28)));
    assert_eq!(
        Dagzone::vast(7200).unwrap().kalenderdag(bron),
        Some((2030, 3, 1))
    );
    assert_eq!(
        Dagzone::vast(-7200)
            .unwrap()
            .kalenderdag("2030-01-01T00:30:00Z"),
        Some((2029, 12, 31))
    );
    assert!(Dagzone::vast(86400).is_none());
    for t in ["geen datum", "2030-02-30T01:00:00Z", "2030-01-01"] {
        assert!(Dagzone::Utc.kalenderdag(t).is_none());
    }
}
