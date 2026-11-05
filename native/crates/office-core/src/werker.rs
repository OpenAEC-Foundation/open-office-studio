//! Engines blijven op één werkdraad; geen documentmodel gaat door de interface.
use crate::document::{Bewerking, Module, Sessie, Weergave};
use futures_channel::oneshot;
use std::{
    collections::HashMap,
    sync::{Arc, mpsc},
};
#[derive(Debug, Clone)]
pub struct Antwoord {
    pub deel: usize,
    pub raster_selectie: Option<crate::rekenblad::CelSelectie>,
    pub writer_positie: Option<crate::writer_cursor::TekstPunt>,
    pub writer_cursor: Option<crate::writer_navigatie::CursorDoel>,
    pub writer_markering: Option<crate::writer_cursor::TekstMarkering>,
    pub beeld: Weergave,
    pub bron: Arc<Vec<u8>>,
    pub hash: String,
    pub terug: bool,
    pub vooruit: bool,
}
#[derive(Debug, Clone)]
pub enum Opdracht {
    WriterAlinea {
        deel: usize,
        hash: String,
        id: String,
        begin: usize,
        einde: usize,
        actie: crate::writer::CursorActie,
    },
    WriterCursor {
        deel: usize,
        hash: String,
        punt: crate::writer_cursor::TekstPunt,
        richting: crate::writer_navigatie::Richting,
        voorkeur: Option<crate::writer_navigatie::CursorDoel>,
        doel_x: Option<f64>,
    },
    Nieuw(Module),
    Open(Module, Vec<u8>),
    /// Een bronkopie en beeld van het huidige onderdeel, zonder te navigeren.
    Stand,
    Deel(usize),
    Cel(usize, String),
    VerplaatsCel(usize, String, crate::rekenblad::Richting),
    SelecteerCellen {
        deel: usize,
        anker: String,
        doel: String,
        richting: Option<crate::rekenblad::Richting>,
    },
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
        reeks: crate::document::TekstReeks,
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
enum Werk {
    Document(Taak),
    Miniatuur {
        id: u64,
        hash: String,
        deel: usize,
        antwoord: oneshot::Sender<Result<crate::presentatie::Miniatuur, String>>,
    },
    Celtekst {
        id: u64,
        deel: usize,
        adres: String,
        antwoord: oneshot::Sender<Result<String, String>>,
    },
}
#[derive(Clone)]
pub struct Werker {
    zender: mpsc::Sender<Werk>,
}
impl Werker {
    pub fn start() -> Self {
        Self::met_klok(Arc::new(crate::klok::SysteemKlok))
    }
    pub fn met_klok(klok: Arc<dyn crate::klok::Klok>) -> Self {
        let (zender, ontvanger) = mpsc::channel::<Werk>();
        std::thread::Builder::new()
            .name("office-documenten".into())
            // De gepinde parser gebruikt bij diepe veldbomen meer stapelruimte
            // dan een standaard Windows-werkdraad. Dit reserveert adresruimte;
            // alleen daadwerkelijk gebruikte stapelpagina's kosten geheugen.
            .stack_size(64 * 1024 * 1024)
            .spawn(move || {
                let mut sessies = HashMap::<u64, (Sessie, usize)>::new();
                for werk in ontvanger {
                    let taak=match werk {
                        Werk::Document(taak)=>taak,
                        Werk::Miniatuur{id,hash,deel,antwoord}=>{
                            let r=std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                sessies.get(&id).ok_or_else(||"Document niet meer geopend".to_string())?
                                    .0.dia_miniatuur(&hash,deel,128).map_err(|e|e.to_string())
                            })).unwrap_or_else(|_|Err("De documentengine heeft de miniatuur afgebroken".into()));
                            let _=antwoord.send(r);continue;
                        }
                        Werk::Celtekst{id,deel,adres,antwoord}=>{
                            let r=std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                sessies.get(&id).ok_or_else(||"Document niet meer geopend".to_string())?
                                    .0.celtekst(deel,&adres).map_err(|e|e.to_string())
                            })).unwrap_or_else(|_|Err("De documentengine heeft het kopiëren afgebroken".into()));
                            let _=antwoord.send(r);continue;
                        }
                    };
                    let resultaat = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Resultaat {
                        match &taak.opdracht {
                            Opdracht::Nieuw(m) => {
                                sessies.insert(
                                    taak.id,
                                    (Sessie::nieuw_met_klok(*m, klok.clone()).map_err(|e| e.to_string())?, 0),
                                );
                            }
                            Opdracht::Open(m, b) => {
                                sessies.insert(
                                    taak.id,
                                    (Sessie::open_met_klok(*m, b.clone(), klok.clone()).map_err(|e| e.to_string())?, 0),
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
                        let mut raster_selectie=None;
                        let mut writer_positie=None;
                        let mut writer_cursor=None;
                        match taak.opdracht {
                            Opdracht::WriterCursor {deel:n,hash,punt,richting,voorkeur,doel_x}=>{
                                let cursor=sessie.verplaats_cursor(n,&hash,&punt,richting,voorkeur.as_ref(),doel_x).map_err(|e|e.to_string())?;
                                let pagina=cursor.pagina;let mut beeld=sessie.weergave(pagina).map_err(|e|e.to_string())?;beeld.voorkeursveld=Some(cursor.punt.id.clone());
                                *deel=pagina;
                                return Ok(Antwoord {deel:pagina,raster_selectie:None,writer_cursor:Some(cursor),writer_positie:None,writer_markering:None,beeld,bron:sessie.bron(),hash:sessie.bron_hash().into(),terug:sessie.kan_terug(),vooruit:sessie.kan_vooruit()});
                            }
                            Opdracht::Deel(n) => {
                                let mut b=sessie.weergave(n).map_err(|e| e.to_string())?;
                                if b.notitie.is_some() {b.voorkeursveld=b.velden.first().map(|v|v.id.clone());}
                                *deel=b.notitie.as_ref().map(|p|p.deel).unwrap_or(n);
                                beeld=Some(b);
                            }
                            Opdracht::Cel(n,adres) => {beeld=Some(sessie.naar_cel(n,&adres).map_err(|e|e.to_string())?);*deel=n;}
                            Opdracht::VerplaatsCel(n,adres,richting) => {beeld=Some(sessie.verplaats_cel(n,&adres,richting).map_err(|e|e.to_string())?);*deel=n;}
                            Opdracht::SelecteerCellen {deel:n,anker,doel,richting} => {
                                let (b,s)=sessie.selecteer_cellen(n,&anker,&doel,richting).map_err(|e|e.to_string())?;
                                beeld=Some(b);raster_selectie=Some(s);*deel=n;
                            }
                            Opdracht::Bewerk(n, b) => {
                                let b=sessie.bewerk_met_weergave(n,b).map_err(|e|e.to_string())?;*deel=b.notitie.as_ref().map(|p|p.deel).unwrap_or(n.min(b.onderdelen.len().saturating_sub(1)));beeld=Some(b);
                            }
                            Opdracht::NaarTekst{id,hash,begin,einde} => {
                                let (pagina,mut beeld)=sessie.naar_tekstbereik(&id,&hash,begin,einde).map_err(|e|e.to_string())?;
                                let writer_markering=match sessie.tekstmarkering(pagina,&id,&hash,begin,einde) {
                                    Ok(m)=>Some(m),
                                    Err(e)=>{beeld.melding.push_str(&format!(" · Treffermarkering niet beschikbaar: {e}"));None},
                                };
                                // De interface accepteert het doel pas na haar versie-/focuscontrole.
                                // Een oud navigatieantwoord mag het werkdraaddeel niet verplaatsen.
                                return Ok(Antwoord{deel:pagina,raster_selectie:None,writer_markering,writer_positie:None,writer_cursor:None,beeld,bron:sessie.bron(),hash:sessie.bron_hash().into(),terug:sessie.kan_terug(),vooruit:sessie.kan_vooruit()});
                            }
                            Opdracht::WriterAlinea { deel:n, hash, id, begin, einde, actie } => {
                                let (mut b,punt)=sessie.bewerk_alinea_cursor(n,&hash,&id,begin,einde,actie).map_err(|e|e.to_string())?;
                                let mut pagina=n.min(b.onderdelen.len().saturating_sub(1));
                                let zichtbaar=b.writer_frame.as_ref().is_some_and(|f|f.cursordoel(&punt.id,punt.positie).is_ok());
                                if !zichtbaar {
                                    match sessie.naar_tekstbereik(&punt.id,sessie.bron_hash(),punt.positie,punt.positie) {
                                        Ok((p,nieuw))=>{pagina=p;b=nieuw;},
                                        Err(e)=>b.melding.push_str(&format!(" · Alinea toegepast; cursorplaatsing niet beschikbaar: {e}")),
                                    }
                                }
                                writer_cursor=b.writer_frame.as_ref().and_then(|f|f.cursordoel(&punt.id,punt.positie).ok());
                                b.voorkeursveld=Some(punt.id.clone());
                                writer_positie=Some(punt);
                                *deel=pagina;beeld=Some(b);
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
                            Opdracht::Terug(n) => {let anker=sessie.notitie_anker(n);sessie.terug().map_err(|e| e.to_string())?;*deel=sessie.notitiepositie(anker.as_ref(),n);},
                            Opdracht::Vooruit(n) => {let anker=sessie.notitie_anker(n);sessie.vooruit().map_err(|e| e.to_string())?;*deel=sessie.notitiepositie(anker.as_ref(),n);},
                            Opdracht::Markdown(n) => {
                                *deel=n;
                                let mut beeld =
                                    sessie.weergave(*deel).map_err(|e| e.to_string())?;
                                beeld.melding = sessie.markdown().map_err(|e| e.to_string())?;
                                return Ok(Antwoord {
                                    deel:*deel,
                                    raster_selectie:None,
                                    writer_positie:None,writer_markering:None,writer_cursor:None,
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
                            raster_selectie,
                            writer_positie,writer_markering:None,writer_cursor,
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
    pub async fn celtekst(self, id: u64, deel: usize, adres: String) -> Result<String, String> {
        let (antwoord, ontvanger) = oneshot::channel();
        self.zender
            .send(Werk::Celtekst {
                id,
                deel,
                adres,
                antwoord,
            })
            .map_err(|_| "Documentwerkdraad is gestopt")?;
        ontvanger
            .await
            .map_err(|_| "Documentwerkdraad is gestopt".to_string())?
    }
    pub fn sluit(&self, id: u64) {
        let (antwoord, _) = oneshot::channel();
        let _ = self.zender.send(Werk::Document(Taak {
            id,
            opdracht: Opdracht::Sluit,
            antwoord,
        }));
    }
    pub async fn miniatuur(
        self,
        id: u64,
        hash: String,
        deel: usize,
    ) -> Result<crate::presentatie::Miniatuur, String> {
        let (antwoord, ontvanger) = oneshot::channel();
        self.zender
            .send(Werk::Miniatuur {
                id,
                hash,
                deel,
                antwoord,
            })
            .map_err(|_| "Documentwerkdraad is gestopt")?;
        ontvanger
            .await
            .map_err(|_| "Documentwerkdraad is gestopt".to_string())?
    }
    /// Leg een geaccepteerde UI-opdracht vast vóór haar antwoord wordt afgewacht.
    /// Weggooien van het antwoord trekt een al toegelaten opdracht niet in.
    pub fn stuur(
        &self,
        id: u64,
        opdracht: Opdracht,
    ) -> impl std::future::Future<Output = Resultaat> + Send + 'static + use<> {
        let (antwoord, ontvanger) = oneshot::channel();
        let verzonden = self
            .zender
            .send(Werk::Document(Taak {
                id,
                opdracht,
                antwoord,
            }))
            .map_err(|_| "Documentwerkdraad is gestopt".to_string());
        async move {
            verzonden?;
            ontvanger
                .await
                .map_err(|_| "Documentwerkdraad is gestopt".to_string())?
        }
    }
    pub async fn voer_uit(self, id: u64, opdracht: Opdracht) -> Resultaat {
        self.stuur(id, opdracht).await
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
