//! Experimentele documentwerker met één wachtende opdracht.
use super::adapter::{Adapter, AdapterFout, Binding};
use crate::IncrementeleTekstAanvraag as Vraag;
use serde_json::Value;
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicUsize, Ordering},
    mpsc,
};

#[derive(Debug, PartialEq, Eq)]
pub enum WerkerFout {
    Verouderd,
    Gestopt,
    Adapter(AdapterFout),
}
type Uitkomst = Result<Value, WerkerFout>;
enum Opdracht {
    Bereid(u64, Box<Vraag>, mpsc::Sender<Uitkomst>),
    Stop,
}
struct Binnen {
    zender: mpsc::SyncSender<Opdracht>,
    actief: Arc<AtomicBool>,
    geannuleerd: Arc<AtomicBool>,
    #[cfg(test)]
    proef: Option<Arc<Proef>>,
    bytes: Arc<AtomicUsize>,
    afgerond: Arc<AtomicBool>,
}
impl Drop for Binnen {
    fn drop(&mut self) {
        self.geannuleerd.store(true, Ordering::Release);
        self.actief.store(false, Ordering::Release);
        let _ = self.zender.try_send(Opdracht::Stop);
    }
}
#[derive(Clone)]
pub struct Werker {
    binnen: Arc<Binnen>,
    binding: Binding,
}
#[cfg(test)]
#[derive(Default)]
pub struct Proef {
    pub start: Option<mpsc::Sender<u64>>,
    pub toegelaten: Option<mpsc::Sender<u64>>,
    pub eerste_wacht: std::sync::Mutex<Option<mpsc::Receiver<()>>>,
    pub klaar: Option<mpsc::Sender<()>>,
    pub verzonden: Option<mpsc::Sender<u64>>,
    pub berekend: Option<mpsc::Sender<u64>>,
    pub na_bereid_wacht: std::sync::Mutex<Option<mpsc::Receiver<()>>>,
    pub paniek: AtomicBool,
}
impl Werker {
    pub fn nieuw(ingeschakeld: bool, binding: Binding) -> Result<Self, WerkerFout> {
        Self::start(
            ingeschakeld,
            binding,
            #[cfg(test)]
            None,
        )
    }
    #[cfg(test)]
    pub fn met_proef(binding: Binding, proef: Arc<Proef>) -> Result<Self, WerkerFout> {
        Self::start(true, binding, Some(proef))
    }
    fn start(
        ingeschakeld: bool,
        binding: Binding,
        #[cfg(test)] proef: Option<Arc<Proef>>,
    ) -> Result<Self, WerkerFout> {
        // Deze validatie maakt geen EditingDoc; de adapter zelf ontstaat op de werker.
        if !ingeschakeld {
            return Err(WerkerFout::Adapter(AdapterFout::Uitgeschakeld));
        }
        if binding.eigenaar.is_empty() || binding.document.is_empty() || binding.levensduur == 0 {
            return Err(WerkerFout::Adapter(AdapterFout::Ongeldig(
                "Ongeldige levensduurbinding".into(),
            )));
        }
        let (zender, ontvanger) = mpsc::sync_channel::<Opdracht>(1);
        let actief = Arc::new(AtomicBool::new(true));
        let bytes = Arc::new(AtomicUsize::new(0));
        let geannuleerd = Arc::new(AtomicBool::new(false));
        let afgerond = Arc::new(AtomicBool::new(false));
        let eigen_afgerond = afgerond.clone();
        let eigen_actief = actief.clone();
        let eigen_bytes = bytes.clone();
        let eigen_binding = binding.clone();
        #[cfg(test)]
        let proef_thread = proef.clone();
        std::thread::Builder::new()
            .name("writer-journaal-proef".into())
            .spawn(move || {
                struct Opruimen(
                    Arc<AtomicBool>,
                    Arc<AtomicUsize>,
                    Arc<AtomicBool>,
                    #[cfg(test)] Option<Arc<Proef>>,
                );
                impl Drop for Opruimen {
                    fn drop(&mut self) {
                        self.0.store(false, Ordering::Release);
                        self.1.store(0, Ordering::Release);
                        self.2.store(true, Ordering::Release);
                        #[cfg(test)]
                        if let Some(p) = &self.3 {
                            if let Some(k) = &p.klaar {
                                let _ = k.send(());
                            }
                        }
                    }
                }
                // Bewust vóór de adapter aangemaakt: ook bij panic wordt de kern
                // eerst op deze thread vernietigd en pas daarna opruiming gemeld.
                let _opruimen = Opruimen(
                    eigen_actief.clone(),
                    eigen_bytes.clone(),
                    eigen_afgerond,
                    #[cfg(test)]
                    proef_thread.clone(),
                );
                let mut adapter = match Adapter::nieuw(true, eigen_binding.clone()) {
                    Ok(a) => a,
                    Err(_) => return,
                };
                while eigen_actief.load(Ordering::Acquire) {
                    let Ok(Opdracht::Bereid(n, a, antwoord)) = ontvanger.recv() else {
                        break;
                    };
                    if !eigen_actief.load(Ordering::Acquire) {
                        let _ = antwoord.send(Err(WerkerFout::Verouderd));
                        break;
                    }
                    #[cfg(test)]
                    if let Some(p) = &proef_thread {
                        if let Some(k) = &p.start {
                            let _ = k.send(n);
                        }
                        if p.paniek.swap(false, Ordering::AcqRel) {
                            panic!("Opzettelijke eigen werkerproef")
                        }
                        let wacht = p.eerste_wacht.lock().unwrap().take();
                        if let Some(w) = wacht {
                            let _ = w.recv();
                        }
                    }
                    // Tijdens de proefpoort kan vergeten zijn uitgevoerd.
                    if !eigen_actief.load(Ordering::Acquire) {
                        let _ = antwoord.send(Err(WerkerFout::Verouderd));
                        break;
                    }
                    let r = adapter
                        .bereid(&eigen_binding, n, *a)
                        .map_err(WerkerFout::Adapter);
                    eigen_bytes.store(adapter.opgeslagen_bytes(), Ordering::Release);
                    #[cfg(test)]
                    if let Some(p) = &proef_thread {
                        if let Some(k) = &p.berekend {
                            let _ = k.send(n);
                        }
                        let wacht = p.na_bereid_wacht.lock().unwrap().take();
                        if let Some(w) = wacht {
                            let _ = w.recv();
                        }
                    }
                    if eigen_actief.load(Ordering::Acquire) {
                        let _ = antwoord.send(r);
                    } else {
                        let _ = antwoord.send(Err(WerkerFout::Verouderd));
                    }
                    #[cfg(test)]
                    if let Some(p) = &proef_thread {
                        if let Some(k) = &p.verzonden {
                            let _ = k.send(n);
                        }
                    }
                }
                adapter.vergeet();
            })
            .map_err(|_| WerkerFout::Gestopt)?;
        Ok(Self {
            binnen: Arc::new(Binnen {
                zender,
                actief,
                geannuleerd,
                #[cfg(test)]
                proef,
                bytes,
                afgerond,
            }),
            binding,
        })
    }
    pub fn binding(&self) -> &Binding {
        &self.binding
    }
    pub fn afgerond(&self) -> bool {
        self.binnen.afgerond.load(Ordering::Acquire)
    }
    pub fn bytes(&self) -> usize {
        self.binnen.bytes.load(Ordering::Acquire)
    }
    fn gestopt(&self) -> WerkerFout {
        if self.binnen.geannuleerd.load(Ordering::Acquire) {
            WerkerFout::Verouderd
        } else {
            WerkerFout::Gestopt
        }
    }
    /// Dit kan wachten op de volle wachtrij; uitsluitend buiten de UI aanroepen.
    /// Zelfde documentopdrachten moeten al in invoervolgorde worden aangeboden.
    pub fn stuur(&self, n: u64, a: Vraag) -> Result<mpsc::Receiver<Uitkomst>, WerkerFout> {
        if !self.binnen.actief.load(Ordering::Acquire) {
            return Err(self.gestopt());
        }
        let (tx, rx) = mpsc::channel();
        self.binnen
            .zender
            .send(Opdracht::Bereid(n, Box::new(a), tx))
            .map_err(|_| self.gestopt())?;
        #[cfg(test)]
        if let Some(p) = &self.binnen.proef {
            if let Some(k) = &p.toegelaten {
                let _ = k.send(n);
            }
        }
        Ok(rx)
    }
    pub fn ontvang(&self, rx: mpsc::Receiver<Uitkomst>) -> Uitkomst {
        let r = rx.recv().map_err(|_| self.gestopt())?;
        if !self.binnen.actief.load(Ordering::Acquire) {
            return Err(self.gestopt());
        }
        r
    }
    pub fn bereid(&self, n: u64, a: Vraag) -> Uitkomst {
        self.ontvang(self.stuur(n, a)?)
    }
    pub fn vergeet(&self) {
        self.binnen.geannuleerd.store(true, Ordering::Release);
        self.binnen.actief.store(false, Ordering::Release);
        let _ = self.binnen.zender.try_send(Opdracht::Stop);
    }
}
