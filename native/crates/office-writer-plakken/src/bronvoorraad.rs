//! Venstergebonden en begrensde bronspiegels; het globale slot blijft kort vast.
use crate::{BronSpiegel, IncrementeelAntwoord, IncrementeleTekstAanvraag};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, mpsc},
};

#[derive(Clone)]
pub struct BronVoorraad {
    binnen: Arc<Mutex<Voorraad>>,
}

struct Voorraad {
    bronnen: BTreeMap<(String, String), Slot>,
    tijd: u64,
    max_bronnen: usize,
    max_bytes: usize,
}
struct Slot {
    bron: Arc<DocumentWerker>,
    gebruikt: u64,
    bytes: usize,
}

type Uitkomst = (Result<Option<IncrementeelAntwoord>, String>, usize);
type Opdracht = (IncrementeleTekstAanvraag, mpsc::Sender<Uitkomst>);

/// Een EditingDoc en zijn observers steken nooit een threadgrens over. Alleen
/// gevalideerde aanvraag-/antwoordgegevens gaan door dit begrensde kanaal.
struct DocumentWerker {
    opdrachten: mpsc::SyncSender<Opdracht>,
}
impl DocumentWerker {
    fn nieuw() -> Result<Self, String> {
        let (opdrachten, ontvanger) = mpsc::sync_channel::<Opdracht>(1);
        std::thread::Builder::new()
            .name("writer-bron".into())
            .spawn(move || {
                let mut spiegel = BronSpiegel::default();
                while let Ok((aanvraag, antwoord)) = ontvanger.recv() {
                    let r = spiegel.bereid_voor(aanvraag);
                    let _ = antwoord.send((r, spiegel.bytes()));
                }
                // De laatste eigenaar is verdwenen: ook de threadgebonden bron en
                // het onbevestigde voorstel worden op deze eigen thread vrijgegeven.
            })
            .map_err(|e| format!("De Writer-documentwerker kan niet starten: {e}"))?;
        Ok(Self { opdrachten })
    }
    fn bereid_voor(&self, aanvraag: IncrementeleTekstAanvraag) -> Result<Uitkomst, String> {
        let (antwoord, ontvangst) = mpsc::channel();
        self.opdrachten
            .send((aanvraag, antwoord))
            .map_err(|_| "De Writer-documentwerker is gestopt")?;
        ontvangst
            .recv()
            .map_err(|_| "De Writer-documentwerker heeft geen antwoord gegeven".into())
    }
}

impl Default for BronVoorraad {
    fn default() -> Self {
        Self::met_grenzen(4, 64 * 1024 * 1024)
    }
}

impl BronVoorraad {
    fn met_grenzen(max_bronnen: usize, max_bytes: usize) -> Self {
        Self {
            binnen: Arc::new(Mutex::new(Voorraad {
                bronnen: BTreeMap::new(),
                tijd: 0,
                max_bronnen,
                max_bytes,
            })),
        }
    }

    pub fn bereid_voor(
        &self,
        eigenaar: &str,
        aanvraag: IncrementeleTekstAanvraag,
    ) -> Result<Option<IncrementeelAntwoord>, String> {
        if eigenaar.is_empty() || aanvraag.document_id.is_empty() {
            return Err("De eigenaar van de Writer-bron ontbreekt".into());
        }
        let sleutel = (eigenaar.to_owned(), aanvraag.document_id.clone());
        let bron = {
            let mut v = self
                .binnen
                .lock()
                .map_err(|_| "De Writer-bronvoorraad is niet beschikbaar")?;
            v.tijd = v.tijd.saturating_add(1);
            let tijd = v.tijd;
            if !v.bronnen.contains_key(&sleutel) {
                if aanvraag.basis.is_some() {
                    return Ok(None);
                }
                v.bronnen.insert(
                    sleutel.clone(),
                    Slot {
                        bron: Arc::new(DocumentWerker::nieuw()?),
                        gebruikt: tijd,
                        bytes: 0,
                    },
                );
            }
            let slot = v.bronnen.get_mut(&sleutel).unwrap();
            slot.gebruikt = tijd;
            let bron = slot.bron.clone();
            v.begrens();
            bron
        };
        // Alleen dit document wacht op zichzelf. Andere vensters en documenten
        // kunnen hun voorbereiding uitvoeren zonder het voorraadslot vast te houden.
        let uitkomst = bron.bereid_voor(aanvraag);
        if let Err(fout) = uitkomst {
            let mut v = self
                .binnen
                .lock()
                .map_err(|_| "De Writer-bronvoorraad is niet beschikbaar")?;
            if v.bronnen
                .get(&sleutel)
                .is_some_and(|s| Arc::ptr_eq(&s.bron, &bron))
            {
                v.bronnen.remove(&sleutel);
            }
            return Err(fout);
        }
        let (antwoord, bytes) = uitkomst?;
        let mut v = self
            .binnen
            .lock()
            .map_err(|_| "De Writer-bronvoorraad is niet beschikbaar")?;
        if let Some(slot) = v.bronnen.get_mut(&sleutel) {
            // Vergeten of verdrongen werk mag zich niet opnieuw registreren.
            if Arc::ptr_eq(&slot.bron, &bron) {
                slot.bytes = bytes;
            }
        }
        v.begrens();
        antwoord
    }

    pub fn vergeet_document(&self, eigenaar: &str, document: &str) -> Result<(), String> {
        self.binnen
            .lock()
            .map_err(|_| "De Writer-bronvoorraad is niet beschikbaar")?
            .bronnen
            .remove(&(eigenaar.into(), document.into()));
        Ok(())
    }

    pub fn vergeet_eigenaar(&self, eigenaar: &str) -> Result<(), String> {
        self.binnen
            .lock()
            .map_err(|_| "De Writer-bronvoorraad is niet beschikbaar")?
            .bronnen
            .retain(|(e, _), _| e != eigenaar);
        Ok(())
    }
}

impl Voorraad {
    fn begrens(&mut self) {
        while self.bronnen.len() > self.max_bronnen
            || self.bronnen.values().map(|s| s.bytes).sum::<usize>() > self.max_bytes
        {
            let Some(sleutel) = self
                .bronnen
                .iter()
                .min_by_key(|(_, s)| s.gebruikt)
                .map(|(k, _)| k.clone())
            else {
                break;
            };
            self.bronnen.remove(&sleutel);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use docx_edit::EditingDoc;

    fn aanvraag(document: &str, basis: Option<String>) -> IncrementeleTekstAanvraag {
        let doc = EditingDoc::new(21);
        doc.create_story_with_paragraph_id("body", "p0", "Bron", "Normal", "left")
            .unwrap();
        let bytes = if basis.is_none() {
            doc.encode_state_as_update_v1()
        } else {
            vec![0, 0]
        };
        IncrementeleTekstAanvraag {
            schema: 2,
            basis,
            request_id: "opdracht".into(),
            document_id: document.into(),
            source_version: "versie".into(),
            source_vector: STANDARD.encode(doc.encode_state_vector_v1()),
            snapshot_sha256: crate::snapshot_sha256(&bytes),
            snapshot: STANDARD.encode(bytes),
            client_id: 21,
            position: crate::Cursor {
                story: "body".into(),
                para_id: "p0".into(),
                offset: 4,
            },
            text: "!".into(),
            author: None,
        }
    }

    #[test]
    fn afzonderlijke_documentwerkers_blijven_overdraagbaar_en_fouten_geisoleerd() {
        fn overdraagbaar<T: Send + Sync>() {}
        overdraagbaar::<BronVoorraad>();
        let v = BronVoorraad::default();
        let mut taken = Vec::new();
        for n in 0..4 {
            let v = v.clone();
            taken.push(std::thread::spawn(move || {
                let eigenaar = format!("venster-{n}");
                let mut fout = aanvraag("document", None);
                fout.text = String::new();
                assert!(v.bereid_voor(&eigenaar, fout).is_err());
                let a = v
                    .bereid_voor(&eigenaar, aanvraag("document", None))
                    .unwrap()
                    .unwrap();
                assert!(
                    v.bereid_voor(&eigenaar, aanvraag("document", Some(a.basis)))
                        .unwrap()
                        .is_some()
                );
            }));
        }
        for taak in taken {
            taak.join().unwrap();
        }
        assert_eq!(v.binnen.lock().unwrap().bronnen.len(), 4);
    }

    #[test]
    fn bronnen_zijn_aan_het_werkelijke_venster_gebonden() {
        let v = BronVoorraad::default();
        let a = v
            .bereid_voor("venster-a", aanvraag("document", None))
            .unwrap()
            .unwrap();
        assert!(
            v.bereid_voor("venster-b", aanvraag("document", Some(a.basis.clone())))
                .unwrap()
                .is_none()
        );
        assert!(
            v.bereid_voor("venster-a", aanvraag("document", Some(a.basis)))
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn minst_gebruikte_bron_wordt_verdrongen_en_vraagt_een_volledige_bron() {
        let v = BronVoorraad::met_grenzen(2, usize::MAX);
        let a = v
            .bereid_voor("venster", aanvraag("a", None))
            .unwrap()
            .unwrap();
        let b = v
            .bereid_voor("venster", aanvraag("b", None))
            .unwrap()
            .unwrap();
        assert!(
            v.bereid_voor("venster", aanvraag("a", Some(a.basis.clone())))
                .unwrap()
                .is_some()
        );
        v.bereid_voor("venster", aanvraag("c", None))
            .unwrap()
            .unwrap();
        assert!(
            v.bereid_voor("venster", aanvraag("b", Some(b.basis)))
                .unwrap()
                .is_none()
        );
        assert!(
            v.bereid_voor("venster", aanvraag("a", Some(a.basis)))
                .unwrap()
                .is_some()
        );
        assert_eq!(v.binnen.lock().unwrap().bronnen.len(), 2);
    }

    #[test]
    fn ook_een_groot_nog_niet_overgenomen_voorstel_verdringt_de_replica() {
        let v = BronVoorraad::met_grenzen(4, 1024);
        let mut a = aanvraag("document", None);
        assert!(STANDARD.decode(&a.snapshot).unwrap().len() < 1024);
        a.text = "X".repeat(4096);
        let r = v.bereid_voor("venster", a).unwrap().unwrap();
        assert!(STANDARD.decode(&r.resultaat.delta).unwrap().len() > 1024);
        assert!(v.binnen.lock().unwrap().bronnen.is_empty());
        assert!(
            v.bereid_voor("venster", aanvraag("document", Some(r.basis)))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn een_bron_boven_het_geheugenbudget_blijft_niet_bewaard() {
        let v = BronVoorraad::met_grenzen(4, 1);
        let a = v
            .bereid_voor("venster", aanvraag("document", None))
            .unwrap()
            .unwrap();
        assert!(v.binnen.lock().unwrap().bronnen.is_empty());
        assert!(
            v.bereid_voor("venster", aanvraag("document", Some(a.basis)))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn sluiten_vergeet_alleen_de_eigen_documenten() {
        let v = BronVoorraad::default();
        v.bereid_voor("a", aanvraag("een", None)).unwrap();
        v.bereid_voor("a", aanvraag("twee", None)).unwrap();
        let ander = v.bereid_voor("b", aanvraag("een", None)).unwrap().unwrap();
        v.vergeet_document("a", "een").unwrap();
        assert_eq!(v.binnen.lock().unwrap().bronnen.len(), 2);
        v.vergeet_eigenaar("a").unwrap();
        assert_eq!(v.binnen.lock().unwrap().bronnen.len(), 1);
        assert!(
            v.bereid_voor("b", aanvraag("een", Some(ander.basis)))
                .unwrap()
                .is_some()
        );
    }
}
