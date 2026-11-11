//! Expliciete, begrensde werkerkoppelingen; geen host-tabregistratie of Tauri.
use super::adapter::Binding;
use super::werker::{Werker, WerkerFout};
use crate::IncrementeleTekstAanvraag as Vraag;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
static LEVENSDUUR: AtomicU64 = AtomicU64::new(0);
#[derive(Debug, PartialEq, Eq)]
pub enum VoorraadFout {
    Uitgeschakeld,
    Ongeldig,
    Verouderd,
    Capaciteit,
    NietBeschikbaar,
    Werker(WerkerFout),
}
struct Binnen {
    actief: BTreeMap<(String, String), Werker>,
    verlaten: Vec<Werker>,
    max_werkers: usize,
    max_bytes: usize,
}
impl Binnen {
    fn ruim_op(&mut self) {
        self.verlaten.retain(|w| !w.afgerond())
    }
    fn bytes(&self) -> usize {
        self.actief
            .values()
            .chain(self.verlaten.iter())
            .map(Werker::bytes)
            .fold(0, usize::saturating_add)
    }
    fn trek_in(&mut self, sleutel: &(String, String)) {
        if let Some(w) = self.actief.remove(sleutel) {
            w.vergeet();
            self.verlaten.push(w)
        }
    }
}
impl Drop for Binnen {
    fn drop(&mut self) {
        for w in self.actief.values().chain(self.verlaten.iter()) {
            w.vergeet()
        }
    }
}
#[derive(Clone)]
pub struct Voorraad {
    binnen: Arc<Mutex<Binnen>>,
    #[cfg(test)]
    proef: Option<Arc<VoorraadProef>>,
}
#[cfg(test)]
pub struct VoorraadProef {
    pub binnen: std::sync::mpsc::Sender<()>,
    pub wacht: Mutex<Option<std::sync::mpsc::Receiver<()>>>,
}
impl Voorraad {
    pub fn nieuw(
        ingeschakeld: bool,
        max_werkers: usize,
        max_bytes: usize,
    ) -> Result<Self, VoorraadFout> {
        if !ingeschakeld {
            return Err(VoorraadFout::Uitgeschakeld);
        }
        if max_werkers == 0 || max_bytes == 0 {
            return Err(VoorraadFout::Ongeldig);
        }
        Ok(Self {
            binnen: Arc::new(Mutex::new(Binnen {
                actief: BTreeMap::new(),
                verlaten: vec![],
                max_werkers,
                max_bytes,
            })),
            #[cfg(test)]
            proef: None,
        })
    }
    #[cfg(test)]
    pub fn met_antwoordpoort(mut self, p: Arc<VoorraadProef>) -> Self {
        self.proef = Some(p);
        self
    }
    pub fn open(&self, eigenaar: &str, document: &str) -> Result<Binding, VoorraadFout> {
        self.maak(
            eigenaar,
            document,
            #[cfg(test)]
            None,
        )
    }
    #[cfg(test)]
    pub fn met_proef(
        &self,
        eigenaar: &str,
        document: &str,
        proef: Arc<super::werker::Proef>,
    ) -> Result<Binding, VoorraadFout> {
        self.maak(eigenaar, document, Some(proef))
    }
    fn maak(
        &self,
        eigenaar: &str,
        document: &str,
        #[cfg(test)] proef: Option<Arc<super::werker::Proef>>,
    ) -> Result<Binding, VoorraadFout> {
        if eigenaar.is_empty() || document.is_empty() {
            return Err(VoorraadFout::Ongeldig);
        }
        let mut v = self
            .binnen
            .lock()
            .map_err(|_| VoorraadFout::NietBeschikbaar)?;
        v.ruim_op();
        let sleutel = (eigenaar.to_owned(), document.to_owned());
        if v.actief.contains_key(&sleutel) {
            return Err(VoorraadFout::Ongeldig);
        }
        // Verwijderde maar nog levende werkers tellen ook mee. Geen wachten
        // onder dit slot en geen stilzwijgende verdringing van een ander document.
        if v.actief.len() + v.verlaten.len() >= v.max_werkers || v.bytes() >= v.max_bytes {
            return Err(VoorraadFout::Capaciteit);
        }
        let levensduur = volgende_levensduur(&LEVENSDUUR)?;
        let b = Binding {
            eigenaar: eigenaar.into(),
            document: document.into(),
            levensduur,
        };
        #[cfg(test)]
        let w = if let Some(p) = proef {
            Werker::met_proef(b.clone(), p)
        } else {
            Werker::nieuw(true, b.clone())
        }
        .map_err(VoorraadFout::Werker)?;
        #[cfg(not(test))]
        let w = Werker::nieuw(true, b.clone()).map_err(VoorraadFout::Werker)?;
        v.actief.insert(sleutel, w);
        Ok(b)
    }
    pub fn bereid(
        &self,
        eigenaar: &str,
        b: &Binding,
        n: u64,
        a: Vraag,
    ) -> Result<Value, VoorraadFout> {
        if eigenaar != b.eigenaar {
            return Err(VoorraadFout::Verouderd);
        }
        let sleutel = (eigenaar.to_owned(), b.document.clone());
        let w = {
            let mut v = self
                .binnen
                .lock()
                .map_err(|_| VoorraadFout::NietBeschikbaar)?;
            v.ruim_op();
            v.actief
                .get(&sleutel)
                .filter(|w| w.binding() == b)
                .ok_or(VoorraadFout::Verouderd)?
                .clone()
        };
        // Het globale slot is hier vrij; ook een volle documentwachtrij houdt
        // andere documenten, intrekking en opruiming niet tegen.
        let r = w.bereid(n, a);
        #[cfg(test)]
        if let Some(p) = &self.proef {
            let _ = p.binnen.send(());
            let wacht = p.wacht.lock().unwrap().take();
            if let Some(w) = wacht {
                let _ = w.recv();
            }
        }
        let mut v = self
            .binnen
            .lock()
            .map_err(|_| VoorraadFout::NietBeschikbaar)?;
        v.ruim_op();
        if !v.actief.get(&sleutel).is_some_and(|w| w.binding() == b) {
            return Err(VoorraadFout::Verouderd);
        }
        if matches!(&r, Err(WerkerFout::Gestopt)) {
            v.trek_in(&sleutel);
            return r.map_err(VoorraadFout::Werker);
        }
        // Retentiegrens na voorbereiding, geen harde piek-/heapgarantie. Het
        // voorstel wordt bij overschrijding niet toegepast of automatisch herhaald.
        if v.bytes() > v.max_bytes {
            v.trek_in(&sleutel);
            return Err(VoorraadFout::Capaciteit);
        }
        r.map_err(VoorraadFout::Werker)
    }
    /// Host beslist expliciet over sluiten/verdringen. Een oud sluitbericht
    /// mag een nieuw geopende koppeling met dezelfde namen niet verwijderen.
    pub fn vergeet(&self, eigenaar: &str, b: &Binding) -> Result<(), VoorraadFout> {
        if eigenaar != b.eigenaar {
            return Err(VoorraadFout::Verouderd);
        }
        let mut v = self
            .binnen
            .lock()
            .map_err(|_| VoorraadFout::NietBeschikbaar)?;
        v.ruim_op();
        let sleutel = (eigenaar.to_owned(), b.document.clone());
        if v.actief.get(&sleutel).is_some_and(|w| w.binding() == b) {
            v.trek_in(&sleutel)
        }
        Ok(())
    }
    pub fn vergeet_eigenaar(&self, eigenaar: &str) -> Result<(), VoorraadFout> {
        let mut v = self
            .binnen
            .lock()
            .map_err(|_| VoorraadFout::NietBeschikbaar)?;
        let sleutels: Vec<_> = v
            .actief
            .keys()
            .filter(|(e, _)| e == eigenaar)
            .cloned()
            .collect();
        for sleutel in sleutels {
            v.trek_in(&sleutel)
        }
        v.ruim_op();
        Ok(())
    }
    pub fn stand(&self) -> Result<(usize, usize, usize), VoorraadFout> {
        let mut v = self
            .binnen
            .lock()
            .map_err(|_| VoorraadFout::NietBeschikbaar)?;
        v.ruim_op();
        Ok((v.actief.len(), v.verlaten.len(), v.bytes()))
    }
}

// Dezelfde begrensde atomaire verhoging op de minimale en actuele toolchain.
// Bij uitputting nooit een oude koppeling opnieuw geldig maken.
fn volgende_levensduur(teller: &AtomicU64) -> Result<u64, VoorraadFout> {
    let mut huidig = teller.load(Ordering::Acquire);
    loop {
        let volgend = huidig.checked_add(1).ok_or(VoorraadFout::NietBeschikbaar)?;
        match teller.compare_exchange_weak(huidig, volgend, Ordering::AcqRel, Ordering::Acquire) {
            Ok(_) => return Ok(volgend),
            Err(actueel) => huidig = actueel,
        }
    }
}

#[cfg(test)]
mod levensduurproef {
    use super::*;

    #[test]
    fn uitputting_behoudt_de_laatste_levensduur() {
        let teller = AtomicU64::new(u64::MAX - 1);
        assert_eq!(volgende_levensduur(&teller), Ok(u64::MAX));
        for _ in 0..2 {
            assert_eq!(
                volgende_levensduur(&teller),
                Err(VoorraadFout::NietBeschikbaar)
            );
        }
        assert_eq!(teller.load(Ordering::Acquire), u64::MAX);
    }

    #[test]
    fn gelijktijdige_koppelingen_krijgen_unieke_levensduren() {
        let teller = AtomicU64::new(0);
        let mut waarden = std::thread::scope(|s| {
            let werkers: Vec<_> = (0..8)
                .map(|_| {
                    s.spawn(|| {
                        (0..128)
                            .map(|_| volgende_levensduur(&teller).unwrap())
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            werkers
                .into_iter()
                .flat_map(|w| w.join().unwrap())
                .collect::<Vec<_>>()
        });
        waarden.sort_unstable();
        assert_eq!(waarden, (1..=1024).collect::<Vec<_>>());
    }
}
