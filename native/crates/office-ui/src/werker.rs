//! Engines blijven op één werkdraad; geen documentmodel gaat door de interface.
use futures_channel::oneshot;
use office_core::document::{Bewerking, Module, Sessie, Weergave};
use std::{
    collections::HashMap,
    sync::{Arc, mpsc},
};
#[derive(Debug, Clone)]
pub struct Antwoord {
    pub deel: usize,
    pub writer_cursor: Option<office_core::writer_navigatie::CursorDoel>,
    pub writer_markering: Option<office_core::writer_cursor::TekstMarkering>,
    pub beeld: Weergave,
    pub bron: Arc<Vec<u8>>,
    pub hash: String,
    pub terug: bool,
    pub vooruit: bool,
}
#[derive(Debug, Clone)]
pub enum Opdracht {
    WriterCursor {
        deel: usize,
        hash: String,
        punt: office_core::writer_cursor::TekstPunt,
        richting: office_core::writer_navigatie::Richting,
        voorkeur: Option<office_core::writer_navigatie::CursorDoel>,
        doel_x: Option<f64>,
    },
    Nieuw(Module),
    Open(Module, Vec<u8>),
    Deel(usize),
    Cel(usize, String),
    VerplaatsCel(usize, String, office_core::rekenblad::Richting),
    Bewerk(usize, Bewerking),
    Terug(usize),
    Vooruit(usize),
    Markdown(usize),
    NaarTekst {
        id: String,
        hash: String,
        begin: usize,
        einde: usize,
    },
    WriterInvoer {
        deel: usize,
        hash: String,
        groep: u64,
        reeks: office_core::document::TekstReeks,
        positie: usize,
    },
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
            // De gepinde parser gebruikt bij diepe veldbomen meer stapelruimte
            // dan een standaard Windows-werkdraad. Dit reserveert adresruimte;
            // alleen daadwerkelijk gebruikte stapelpagina's kosten geheugen.
            .stack_size(64 * 1024 * 1024)
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
                            Opdracht::WriterCursor {deel:n,hash,punt,richting,voorkeur,doel_x}=>{
                                let cursor=sessie.verplaats_cursor(n,&hash,&punt,richting,voorkeur.as_ref(),doel_x).map_err(|e|e.to_string())?;
                                let pagina=cursor.pagina;let mut beeld=sessie.weergave(pagina).map_err(|e|e.to_string())?;beeld.voorkeursveld=Some(cursor.punt.id.clone());
                                *deel=pagina;
                                return Ok(Antwoord {deel:pagina,writer_cursor:Some(cursor),writer_markering:None,beeld,bron:sessie.bron(),hash:sessie.bron_hash().into(),terug:sessie.kan_terug(),vooruit:sessie.kan_vooruit()});
                            }
                            Opdracht::Deel(n) => {
                                beeld=Some(sessie.weergave(n).map_err(|e| e.to_string())?);
                                *deel = n;
                            }
                            Opdracht::Cel(n,adres) => {beeld=Some(sessie.naar_cel(n,&adres).map_err(|e|e.to_string())?);*deel=n;}
                            Opdracht::VerplaatsCel(n,adres,richting) => {beeld=Some(sessie.verplaats_cel(n,&adres,richting).map_err(|e|e.to_string())?);*deel=n;}
                            Opdracht::Bewerk(n, b) => {
                                let b=sessie.bewerk_met_weergave(n,b).map_err(|e|e.to_string())?;*deel=n.min(b.onderdelen.len().saturating_sub(1));beeld=Some(b);
                            }
                            Opdracht::NaarTekst{id,hash,begin,einde} => {
                                let (pagina,mut beeld)=sessie.naar_tekstbereik(&id,&hash,begin,einde).map_err(|e|e.to_string())?;
                                let writer_markering=match sessie.tekstmarkering(pagina,&id,&hash,begin,einde) {
                                    Ok(m)=>Some(m),
                                    Err(e)=>{beeld.melding.push_str(&format!(" · Treffermarkering niet beschikbaar: {e}"));None},
                                };
                                // De interface accepteert het doel pas na haar versie-/focuscontrole.
                                // Een oud navigatieantwoord mag het werkdraaddeel niet verplaatsen.
                                return Ok(Antwoord{deel:pagina,writer_markering,writer_cursor:None,beeld,bron:sessie.bron(),hash:sessie.bron_hash().into(),terug:sessie.kan_terug(),vooruit:sessie.kan_vooruit()});
                            }
                            Opdracht::WriterInvoer {deel:n,hash,groep,reeks,positie} => {
                                if hash!=sessie.bron_hash() {return Err("Deze invoer hoort bij een verouderde documentversie".into());}
                                if positie>reeks.tekst.chars().count() {return Err("De invoercursor valt buiten de nieuwe alinea".into());}
                                let id=reeks.id.clone();
                                let mut b=sessie.bewerk_tekstgroep(n,groep,reeks).map_err(|e|e.to_string())?;
                                let mut pagina=n.min(b.onderdelen.len().saturating_sub(1));
                                let zichtbaar=b.writer_frame.as_ref().is_some_and(|f| f.markering(&id,positie,positie).is_ok());
                                if !zichtbaar {
                                    match sessie.naar_tekstbereik(&id,sessie.bron_hash(),positie,positie) {
                                        Ok((p,nieuw))=>{pagina=p;b=nieuw;},
                                        Err(e)=>b.melding.push_str(&format!(" · Tekst toegepast; cursorplaatsing niet beschikbaar: {e}")),
                                    }
                                }
                                b.voorkeursveld=Some(id);
                                *deel=pagina;beeld=Some(b);
                            }
                            Opdracht::Terug(n) => {sessie.terug().map_err(|e| e.to_string())?;*deel=n;},
                            Opdracht::Vooruit(n) => {sessie.vooruit().map_err(|e| e.to_string())?;*deel=n;},
                            Opdracht::Markdown(n) => {
                                *deel=n;
                                let mut beeld =
                                    sessie.weergave(*deel).map_err(|e| e.to_string())?;
                                beeld.melding = sessie.markdown().map_err(|e| e.to_string())?;
                                return Ok(Antwoord {
                                    deel:*deel,
                                    writer_markering:None,writer_cursor:None,
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
                            deel:*deel,
                            writer_markering:None,writer_cursor:None,
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
