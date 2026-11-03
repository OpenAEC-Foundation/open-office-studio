//! Dezelfde documentwerker moet zonder een vensterbibliotheek bruikbaar blijven.
use office_core::{
    document::{Bewerking, Module},
    werker::{Opdracht, Werker, achtergrond},
};
use std::{
    future::Future,
    sync::{Arc, mpsc},
    task::{Context, Poll, Wake, Waker},
    thread,
    time::{Duration, Instant},
};

fn wacht<T>(taak: impl Future<Output = T>) -> T {
    struct Wek(thread::Thread);
    impl Wake for Wek {
        fn wake(self: Arc<Self>) {
            self.0.unpark();
        }
    }
    let wekker = Waker::from(Arc::new(Wek(thread::current())));
    let mut context = Context::from_waker(&wekker);
    let mut taak = std::pin::pin!(taak);
    let einde = Instant::now() + Duration::from_secs(30);
    loop {
        if let Poll::Ready(uitkomst) = taak.as_mut().poll(&mut context) {
            return uitkomst;
        }
        assert!(Instant::now() < einde, "Documentwerker antwoordt niet");
        thread::park_timeout(einde.saturating_duration_since(Instant::now()));
    }
}

#[test]
fn sessies_en_sluiten_blijven_aan_hun_eigen_document_gebonden() {
    let w = Werker::start();
    let eerste = wacht(w.clone().voer_uit(1, Opdracht::Nieuw(Module::Notition))).unwrap();
    let tweede = wacht(w.clone().voer_uit(2, Opdracht::Nieuw(Module::Notition))).unwrap();
    let gewijzigd = wacht(w.clone().voer_uit(
        1,
        Opdracht::Bewerk(
            0,
            Bewerking::Tekst {
                id: eerste.beeld.velden[0].id.clone(),
                tekst: "Bewaarde notitietitel".into(),
            },
        ),
    ))
    .unwrap();
    assert_eq!(gewijzigd.beeld.velden[0].tekst, "Bewaarde notitietitel");
    assert_ne!(gewijzigd.hash, eerste.hash);
    assert_eq!(
        wacht(w.clone().voer_uit(2, Opdracht::Deel(0)))
            .unwrap()
            .bron,
        tweede.bron
    );
    // Sluiten wordt vóór de volgende opdracht in dezelfde rij geplaatst.
    w.sluit(1);
    assert!(wacht(w.clone().voer_uit(1, Opdracht::Deel(0))).is_err());
    assert_eq!(
        wacht(w.voer_uit(2, Opdracht::Deel(0))).unwrap().hash,
        tweede.hash
    );
}

#[test]
fn een_geweigerde_bewerking_laat_bron_en_vervolgbewerking_beschikbaar() {
    let w = Werker::start();
    let begin = wacht(w.clone().voer_uit(3, Opdracht::Nieuw(Module::Notition))).unwrap();
    assert!(
        wacht(w.clone().voer_uit(
            3,
            Opdracht::Bewerk(
                0,
                Bewerking::Tekst {
                    id: "onbekend-veld".into(),
                    tekst: "Mag nergens terechtkomen".into(),
                }
            )
        ))
        .is_err()
    );
    assert_eq!(
        wacht(w.clone().voer_uit(3, Opdracht::Deel(0)))
            .unwrap()
            .bron,
        begin.bron
    );
    let goed = wacht(w.voer_uit(
        3,
        Opdracht::Bewerk(
            0,
            Bewerking::Tekst {
                id: begin.beeld.velden[0].id.clone(),
                tekst: "Vervolgbewerking".into(),
            },
        ),
    ))
    .unwrap();
    assert_eq!(goed.beeld.velden[0].tekst, "Vervolgbewerking");
}

#[test]
fn documentaanmaak_draait_werkelijk_buiten_de_aanroepende_draad() {
    struct ControleKlok(mpsc::Sender<thread::ThreadId>);
    impl office_core::klok::Klok for ControleKlok {
        fn nu(&self) -> chrono::DateTime<chrono::Utc> {
            let _ = self.0.send(thread::current().id());
            "2026-11-03T00:00:00Z".parse().unwrap()
        }
    }
    let (zender, ontvanger) = mpsc::channel();
    let w = Werker::met_klok(Arc::new(ControleKlok(zender)));
    wacht(w.voer_uit(4, Opdracht::Nieuw(Module::Notition))).unwrap();
    let draad = ontvanger.recv_timeout(Duration::from_secs(1)).unwrap();
    assert_ne!(draad, thread::current().id());
    assert!(ontvanger.try_iter().all(|id| id == draad));
}

#[test]
fn bestandswerk_geeft_zijn_resultaat_vanaf_een_afzonderlijke_draad_terug() {
    let huidig = thread::current().id();
    let (draad, waarde) = wacht(achtergrond(|| (thread::current().id(), 42))).unwrap();
    assert_ne!(draad, huidig);
    assert_eq!(waarde, 42);
}

#[test]
fn stuur_leg_de_volgorde_vast_voordat_een_interface_het_antwoord_afwacht() {
    let w = Werker::start();
    let nieuw = w.stuur(90, Opdracht::Nieuw(Module::Notition));
    let beeld = w.stuur(90, Opdracht::Deel(0));
    // Een executor mag een later antwoord eerder pollen. De toelating tot de
    // werker moet dan toch vóór de afbeeldingsvraag zijn gebeurd.
    let antwoord = wacht(beeld).expect("Het eerder aangemaakte document moet bestaan");
    assert_eq!(antwoord.hash, wacht(nieuw).unwrap().hash);
}

#[test]
fn stuur_behoudt_een_toegelaten_bewerking_als_de_bediening_verdwijnt() {
    let w = Werker::start();
    let begin = wacht(w.clone().voer_uit(91, Opdracht::Nieuw(Module::Notition))).unwrap();
    let bewerking = w.stuur(
        91,
        Opdracht::Bewerk(
            0,
            Bewerking::Tekst {
                id: begin.beeld.velden[0].id.clone(),
                tekst: "Geaccepteerde invoer".into(),
            },
        ),
    );
    // Het antwoord is niet de opdracht. Een verdwenen tabbediening mag de
    // al toegelaten invoer niet geruisloos uit de werker laten verdwijnen.
    drop(bewerking);
    let bewaard = wacht(w.stuur(91, Opdracht::Deel(0))).unwrap();
    assert_eq!(bewaard.beeld.velden[0].tekst, "Geaccepteerde invoer");
    assert_ne!(bewaard.hash, begin.hash);
}

#[test]
fn stuur_bewaart_de_invoervolgorde_bij_omgekeerd_afwachten() {
    let w = Werker::start();
    let begin = wacht(w.clone().voer_uit(92, Opdracht::Nieuw(Module::Notition))).unwrap();
    let tekst = |s: &str| {
        Opdracht::Bewerk(
            0,
            Bewerking::Tekst {
                id: begin.beeld.velden[0].id.clone(),
                tekst: s.into(),
            },
        )
    };
    let eerste = w.stuur(92, tekst("Eerste concept"));
    let tweede = w.stuur(92, tekst("Tweede concept"));
    assert_eq!(
        wacht(tweede).unwrap().beeld.velden[0].tekst,
        "Tweede concept"
    );
    assert_eq!(
        wacht(eerste).unwrap().beeld.velden[0].tekst,
        "Eerste concept"
    );
    assert_eq!(
        wacht(w.stuur(92, Opdracht::Deel(0))).unwrap().beeld.velden[0].tekst,
        "Tweede concept"
    );
}

#[test]
fn momentopname_bewaart_het_huidige_onderdeel_bron_en_geschiedenis() {
    use office_core::notities::NotitieActie as N;
    let w = Werker::start();
    wacht(w.clone().voer_uit(93, Opdracht::Nieuw(Module::Notition))).unwrap();
    let gewijzigd = wacht(
        w.clone()
            .voer_uit(93, Opdracht::Bewerk(0, Bewerking::Notitie(N::NieuwePagina))),
    )
    .unwrap();
    assert_eq!(gewijzigd.deel, 1);
    let kopie = wacht(w.stuur(93, Opdracht::Stand)).unwrap();
    assert_eq!(kopie.deel, gewijzigd.deel);
    assert_eq!(kopie.hash, gewijzigd.hash);
    assert_eq!(kopie.bron, gewijzigd.bron);
    assert_eq!(kopie.terug, gewijzigd.terug);
    assert_eq!(kopie.vooruit, gewijzigd.vooruit);
}
