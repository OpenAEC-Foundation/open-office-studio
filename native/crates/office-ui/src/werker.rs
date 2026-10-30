//! Engines blijven op één werkdraad; geen documentmodel gaat door de interface.
use futures_channel::oneshot;
use office_core::document::{Bewerking, Module, Sessie, Weergave};
use std::{
    collections::HashMap,
    sync::{Arc, mpsc},
};
#[derive(Debug, Clone)]
pub struct Antwoord {
    pub beeld: Weergave,
    pub bron: Arc<Vec<u8>>,
    pub hash: String,
    pub terug: bool,
    pub vooruit: bool,
}
#[derive(Debug, Clone)]
pub enum Opdracht {
    Nieuw(Module),
    Open(Module, Vec<u8>),
    Deel(usize),
    Bewerk(usize, Bewerking),
    Terug,
    Vooruit,
    Markdown,
    Sluit,
}
type Resultaat = Result<Antwoord, String>;
struct Taak {
    id: u64,
    opdracht: Opdracht,
    antwoord: oneshot::Sender<Resultaat>,
}
#[derive(Clone)]
pub struct Werker {
    zender: mpsc::Sender<Taak>,
}
impl Werker {
    pub fn start() -> Self {
        let (zender, ontvanger) = mpsc::channel::<Taak>();
        std::thread::Builder::new()
            .name("office-documenten".into())
            .spawn(move || {
                let mut sessies = HashMap::<u64, (Sessie, usize)>::new();
                for taak in ontvanger {
                    let resultaat = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Resultaat {
                        match &taak.opdracht {
                            Opdracht::Nieuw(m) => {
                                sessies.insert(
                                    taak.id,
                                    (Sessie::nieuw(*m).map_err(|e| e.to_string())?, 0),
                                );
                            }
                            Opdracht::Open(m, b) => {
                                sessies.insert(
                                    taak.id,
                                    (Sessie::open(*m, b.clone()).map_err(|e| e.to_string())?, 0),
                                );
                            }
                            Opdracht::Sluit => {
                                sessies.remove(&taak.id);
                                return Err("Gesloten".into());
                            }
                            _ => {}
                        }
                        let (sessie, deel) = sessies
                            .get_mut(&taak.id)
                            .ok_or("Document niet meer geopend")?;
                        let mut beeld=None;
                        match taak.opdracht {
                            Opdracht::Deel(n) => {
                                beeld=Some(sessie.weergave(n).map_err(|e| e.to_string())?);
                                *deel = n;
                            }
                            Opdracht::Bewerk(n, b) => {
                                beeld=Some(sessie.bewerk_met_weergave(n, b).map_err(|e| e.to_string())?)
                            }
                            Opdracht::Terug => sessie.terug().map_err(|e| e.to_string())?,
                            Opdracht::Vooruit => sessie.vooruit().map_err(|e| e.to_string())?,
                            Opdracht::Markdown => {
                                let mut beeld =
                                    sessie.weergave(*deel).map_err(|e| e.to_string())?;
                                beeld.melding = sessie.markdown().map_err(|e| e.to_string())?;
                                return Ok(Antwoord {
                                    beeld,
                                    hash:sessie.bron_hash().into(),
                            bron: sessie.bron(),
                                    terug: sessie.kan_terug(),
                                    vooruit: sessie.kan_vooruit(),
                                });
                            }
                            _ => {}
                        }
                        Ok(Antwoord {
                            beeld: match beeld {Some(b)=>b,None=>sessie.weergave(*deel).map_err(|e| e.to_string())?},
                            hash:sessie.bron_hash().into(),
                            bron: sessie.bron(),
                            terug: sessie.kan_terug(),
                            vooruit: sessie.kan_vooruit(),
                        })
                    })).unwrap_or_else(|_|Err("De documentengine heeft de taak afgebroken; de interface blijft beschikbaar".into()));
                    let _ = taak.antwoord.send(resultaat);
                }
            })
            .expect("documentwerkdraad");
        Self { zender }
    }
    pub fn sluit(&self, id: u64) {
        let (antwoord, _) = oneshot::channel();
        let _ = self.zender.send(Taak {
            id,
            opdracht: Opdracht::Sluit,
            antwoord,
        });
    }
    pub async fn voer_uit(self, id: u64, opdracht: Opdracht) -> Resultaat {
        let (antwoord, ontvanger) = oneshot::channel();
        self.zender
            .send(Taak {
                id,
                opdracht,
                antwoord,
            })
            .map_err(|_| "Documentwerkdraad is gestopt")?;
        ontvanger
            .await
            .map_err(|_| "Documentwerkdraad is gestopt".to_string())?
    }
}
/// Bestands-I/O blokkeert ook nooit de vensterdraad.
pub async fn achtergrond<T: Send + 'static>(
    werk: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    let (zender, ontvanger) = oneshot::channel();
    std::thread::spawn(move || {
        let _ = zender.send(werk());
    });
    ontvanger
        .await
        .map_err(|_| "Achtergrondtaak is afgebroken".into())
}
