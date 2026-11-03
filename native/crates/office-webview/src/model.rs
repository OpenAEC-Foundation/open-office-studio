//! Alleen bronkopieën en weergaven gaan naar de UI; sessies blijven op de werker.
use office_core::{
    document::{Bewerking, Fout, Module, Resultaat, Weergave},
    opslag,
    werker::{Antwoord, Opdracht, Werker},
};
use std::{
    collections::{BTreeMap, HashMap},
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::{Arc, Mutex},
};

type KernAntwoord = std::result::Result<Antwoord, String>;
type KernTaak = Pin<Box<dyn Future<Output = KernAntwoord> + Send>>;
struct Uitkomst {
    kern: KernAntwoord,
    schijf_hash: Option<String>,
}

/// De opdracht is al toegelaten. Alleen haar antwoord wordt nog afgewacht.
pub struct DocumentTaak {
    document: u64,
    volgnummer: u64,
    antwoord: Pin<Box<dyn Future<Output = Uitkomst> + Send>>,
}
pub struct DocumentAntwoord {
    document: u64,
    volgnummer: u64,
    uitkomst: Uitkomst,
}
impl DocumentTaak {
    pub fn document(&self) -> u64 {
        self.document
    }
    pub async fn uitvoeren(self) -> DocumentAntwoord {
        DocumentAntwoord {
            document: self.document,
            volgnummer: self.volgnummer,
            uitkomst: self.antwoord.await,
        }
    }
}

/// De momentopname staat achter eerdere toegelaten invoer in dezelfde werkrij.
pub struct BewaarTaak {
    document: u64,
    volgnummer: u64,
    pad: PathBuf,
    momentopname: KernTaak,
    verwacht: Option<String>,
    schrijfsleutel: Arc<Mutex<()>>,
}
pub struct BewaarAntwoord {
    document: u64,
    volgnummer: u64,
    pad: PathBuf,
    resultaat: Resultaat<(String, String)>,
}
impl BewaarTaak {
    pub async fn uitvoeren(self) -> BewaarAntwoord {
        let Self {
            document,
            volgnummer,
            pad,
            momentopname,
            verwacht,
            schrijfsleutel,
        } = self;
        let resultaat = async {
            let stand = momentopname.await.map_err(Fout::Document)?;
            let schrijfpad = pad.clone();
            let bron_hash = stand.hash;
            let hash = office_core::werker::achtergrond(move || {
                let _sleutel = schrijfsleutel
                    .lock()
                    .map_err(|_| Fout::Document("De bewaarwerker is afgebroken".into()))?;
                opslag::schrijf(&schrijfpad, &stand.bron, verwacht.as_deref())
            })
            .await
            .map_err(Fout::Document)??;
            Ok((hash, bron_hash))
        }
        .await;
        BewaarAntwoord {
            document,
            volgnummer,
            pad,
            resultaat,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Doel {
    pub document: u64,
    pub deel: usize,
    generatie: u64,
}
impl Doel {
    pub fn sleutel(self) -> String {
        format!("{}:{}:{}", self.document, self.deel, self.generatie)
    }
}

#[derive(Clone, Copy)]
struct Toelating {
    wijzigt: bool,
    barriere: bool,
    herstel: bool,
}

pub struct Tabblad {
    pub id: u64,
    pub naam: String,
    pub module: Module,
    pub beeld: Weergave,
    pub deel: usize,
    pub pad: Option<PathBuf>,
    pub melding: String,
    pub fout: Option<String>,
    bron: Arc<Vec<u8>>,
    bron_hash: String,
    terug: bool,
    vooruit: bool,
    schijf_hash: Option<String>,
    bewaard_hash: String,
    generatie: u64,
    bewaar_bezig: Option<u64>,
    volgende_opdracht: u64,
    voltooid: u64,
    uitstaand: BTreeMap<u64, Toelating>,
    ontvangen: BTreeMap<u64, KernAntwoord>,
    herstel_nodig: bool,
}
impl Tabblad {
    pub fn bron(&self) -> Arc<Vec<u8>> {
        self.bron.clone()
    }
    pub fn kan_terug(&self) -> bool {
        self.terug || self.uitstaand.values().any(|t| t.wijzigt)
    }
    pub fn kan_vooruit(&self) -> bool {
        self.vooruit
    }
    pub fn bezig(&self) -> bool {
        !self.uitstaand.is_empty()
    }
    pub fn geblokkeerd(&self) -> bool {
        self.herstel_nodig || self.uitstaand.values().any(|t| t.barriere)
    }
    pub fn tabnaam(&self) -> &str {
        if self.module == Module::Notition {
            "Notities"
        } else {
            &self.naam
        }
    }
    pub fn venstertitel(&self) -> String {
        let stip = if self.gewijzigd() { " •" } else { "" };
        if self.module == Module::Notition {
            format!("Open Office Studio (Notities){stip}")
        } else {
            format!(
                "{}{stip} — Open Office Studio ({})",
                self.naam,
                match self.module {
                    Module::Writer => "Tekst",
                    Module::Spreadsheet => "Rekenblad",
                    Module::Presentation => "Presentatie",
                    Module::Email => "E-mail",
                    Module::Notition => unreachable!(),
                }
            )
        }
    }
    pub fn doel(&self) -> Doel {
        Doel {
            document: self.id,
            deel: self.deel,
            generatie: self.generatie,
        }
    }
    pub fn gewijzigd(&self) -> bool {
        self.bewaar_bezig.is_some()
            || self.bron_hash != self.bewaard_hash
            || self.uitstaand.values().any(|t| t.wijzigt)
    }
}
struct Opening {
    module: Module,
    naam: String,
    pad: Option<PathBuf>,
    vorige: Option<u64>,
}

/// De tab houdt haar plaats al tijdens het lezen; voltooiing verplaatst geen tab.
pub struct TabInfo {
    pub id: u64,
    pub naam: String,
    pub gewijzigd: bool,
    pub module: Module,
    pub laden: bool,
}

pub struct Werkruimte {
    pub tabbladen: Vec<Tabblad>,
    pub actief: Option<u64>,
    pub donker: bool,
    pub bestand: bool,
    pub melding: String,
    pub venster_sluiten: bool,
    volgend: u64,
    volgende_bewaaractie: u64,
    schrijfsleutel: Arc<Mutex<()>>,
    werker: Werker,
    openingen: HashMap<u64, Opening>,
}
impl Default for Werkruimte {
    fn default() -> Self {
        Self::met_werker(Werker::start())
    }
}
impl Werkruimte {
    pub fn met_werker(werker: Werker) -> Self {
        Self {
            tabbladen: Vec::new(),
            actief: None,
            donker: false,
            bestand: false,
            melding: String::new(),
            venster_sluiten: false,
            volgend: 0,
            volgende_bewaaractie: 0,
            schrijfsleutel: Arc::default(),
            werker,
            openingen: HashMap::new(),
        }
    }
}
impl Werkruimte {
    pub fn tab(&self) -> Option<&Tabblad> {
        self.actief
            .and_then(|id| self.tabbladen.iter().find(|t| t.id == id))
    }
    pub fn tablijst(&self) -> Vec<TabInfo> {
        let mut tabs = self
            .tabbladen
            .iter()
            .map(|t| TabInfo {
                id: t.id,
                naam: t.tabnaam().into(),
                gewijzigd: t.gewijzigd(),
                module: t.module,
                laden: false,
            })
            .chain(self.openingen.iter().map(|(id, t)| TabInfo {
                id: *id,
                naam: if t.module == Module::Notition {
                    "Notities".into()
                } else {
                    t.naam.clone()
                },
                gewijzigd: false,
                module: t.module,
                laden: true,
            }))
            .collect::<Vec<_>>();
        tabs.sort_unstable_by_key(|t| t.id);
        tabs
    }
    pub fn opent(&self) -> bool {
        self.actief
            .is_some_and(|id| self.openingen.contains_key(&id))
    }
    fn reserveer(&mut self, module: Module, naam: String, pad: Option<PathBuf>) -> Resultaat<u64> {
        self.volgend = self
            .volgend
            .checked_add(1)
            .ok_or_else(|| Fout::Document("Te veel documentidentiteiten".into()))?;
        let id = self.volgend;
        self.openingen.insert(
            id,
            Opening {
                module,
                naam,
                pad,
                vorige: self.actief,
            },
        );
        self.actief = Some(id);
        self.bestand = false;
        self.melding.clear();
        Ok(id)
    }
    fn eenvoudige_taak(&self, document: u64, volgnummer: u64, opdracht: Opdracht) -> DocumentTaak {
        let antwoord = self.werker.stuur(document, opdracht);
        DocumentTaak {
            document,
            volgnummer,
            antwoord: Box::pin(async move {
                Uitkomst {
                    kern: antwoord.await,
                    schijf_hash: None,
                }
            }),
        }
    }
    pub fn nieuw(&mut self, module: Module) -> Resultaat<DocumentTaak> {
        let id = self.reserveer(
            module,
            format!("Nieuw {}.{}", module.naam(), module.extensie()),
            None,
        )?;
        Ok(self.eenvoudige_taak(id, 0, Opdracht::Nieuw(module)))
    }
    pub fn open_bytes(
        &mut self,
        module: Module,
        bytes: Vec<u8>,
        naam: String,
    ) -> Resultaat<DocumentTaak> {
        let id = self.reserveer(module, naam, None)?;
        Ok(self.eenvoudige_taak(id, 0, Opdracht::Open(module, bytes)))
    }
    pub fn open(&mut self, pad: &Path) -> Resultaat<DocumentTaak> {
        let module =
            Module::van_extensie(pad.extension().and_then(|s| s.to_str()).unwrap_or_default())?;
        let id = self.reserveer(
            module,
            pad.file_name().unwrap_or_default().to_string_lossy().into(),
            Some(pad.into()),
        )?;
        let pad = pad.to_path_buf();
        let werker = self.werker.clone();
        Ok(DocumentTaak {
            document: id,
            volgnummer: 0,
            antwoord: Box::pin(async move {
                let gelezen = office_core::werker::achtergrond(move || opslag::lees(&pad)).await;
                match gelezen {
                    Ok(Ok((bytes, hash))) => Uitkomst {
                        kern: werker.stuur(id, Opdracht::Open(module, bytes)).await,
                        schijf_hash: Some(hash),
                    },
                    Ok(Err(e)) => Uitkomst {
                        kern: Err(e.to_string()),
                        schijf_hash: None,
                    },
                    Err(e) => Uitkomst {
                        kern: Err(e),
                        schijf_hash: None,
                    },
                }
            }),
        })
    }
    pub fn kies(&mut self, id: Option<u64>) {
        if id.is_none()
            || self.tabbladen.iter().any(|t| Some(t.id) == id)
            || id.is_some_and(|id| self.openingen.contains_key(&id))
        {
            self.actief = id;
            self.bestand = false;
        }
    }
    fn eigenaar(&mut self, doel: Doel) -> Resultaat<&mut Tabblad> {
        self.tabbladen
            .iter_mut()
            .find(|t| t.doel() == doel)
            .ok_or_else(|| {
                Fout::Document("Deze bediening hoort bij een eerder documentonderdeel".into())
            })
    }
    fn toelaten(
        &mut self,
        doel: Doel,
        opdracht: Opdracht,
        toelating: Toelating,
    ) -> Resultaat<DocumentTaak> {
        let t = self.eigenaar(doel)?;
        if t.geblokkeerd() {
            return Err(Fout::Document(
                "Wacht tot de vorige documentactie is afgerond".into(),
            ));
        }
        t.volgende_opdracht = t
            .volgende_opdracht
            .checked_add(1)
            .ok_or_else(|| Fout::Document("Te veel documentopdrachten".into()))?;
        let volgnummer = t.volgende_opdracht;
        t.uitstaand.insert(volgnummer, toelating);
        if toelating.wijzigt {
            t.melding = "Niet opgeslagen".into();
        }
        Ok(self.eenvoudige_taak(doel.document, volgnummer, opdracht))
    }
    pub fn bewerk(&mut self, doel: Doel, bewerking: Bewerking) -> Resultaat<DocumentTaak> {
        let barriere = !matches!(bewerking, Bewerking::Tekst { .. });
        self.toelaten(
            doel,
            Opdracht::Bewerk(doel.deel, bewerking),
            Toelating {
                wijzigt: true,
                barriere,
                herstel: false,
            },
        )
    }
    pub fn kies_deel(&mut self, doel: Doel, deel: usize) -> Resultaat<DocumentTaak> {
        self.toelaten(
            doel,
            Opdracht::Deel(deel),
            Toelating {
                wijzigt: false,
                barriere: true,
                herstel: true,
            },
        )
    }
    pub fn historie(&mut self, doel: Doel, vooruit: bool) -> Resultaat<DocumentTaak> {
        self.toelaten(
            doel,
            if vooruit {
                Opdracht::Vooruit(doel.deel)
            } else {
                Opdracht::Terug(doel.deel)
            },
            Toelating {
                wijzigt: true,
                barriere: true,
                herstel: true,
            },
        )
    }
    /// Antwoorden worden per document in toelatingsvolgorde bevestigd. Een sneller
    /// afgewacht later antwoord kan nooit de bron van een eerdere fout overslaan.
    pub fn voltooi(&mut self, antwoord: DocumentAntwoord) -> Resultaat<bool> {
        let DocumentAntwoord {
            document,
            volgnummer,
            uitkomst,
        } = antwoord;
        if volgnummer == 0 {
            let Some(opening) = self.openingen.remove(&document) else {
                self.werker.sluit(document);
                return Ok(false);
            };
            match uitkomst.kern {
                Ok(a) => {
                    self.tabbladen.push(Tabblad {
                        id: document,
                        naam: opening.naam,
                        module: opening.module,
                        beeld: a.beeld,
                        deel: a.deel,
                        pad: opening.pad,
                        melding: String::new(),
                        fout: None,
                        bron: a.bron,
                        bron_hash: a.hash.clone(),
                        bewaard_hash: a.hash,
                        terug: a.terug,
                        vooruit: a.vooruit,
                        schijf_hash: uitkomst.schijf_hash,
                        generatie: 0,
                        bewaar_bezig: None,
                        volgende_opdracht: 0,
                        voltooid: 0,
                        uitstaand: BTreeMap::new(),
                        ontvangen: BTreeMap::new(),
                        herstel_nodig: false,
                    });
                    self.tabbladen.sort_unstable_by_key(|t| t.id);
                    Ok(true)
                }
                Err(e) => {
                    self.werker.sluit(document);
                    if self.actief == Some(document) {
                        self.actief = opening
                            .vorige
                            .filter(|id| {
                                self.tabbladen.iter().any(|t| t.id == *id)
                                    || self.openingen.contains_key(id)
                            })
                            .or_else(|| self.tabbladen.last().map(|t| t.id));
                    }
                    self.melding = format!("{}: {e}", opening.naam);
                    Err(Fout::Document(e))
                }
            }
        } else {
            let Some(t) = self.tabbladen.iter_mut().find(|t| t.id == document) else {
                self.werker.sluit(document);
                return Ok(false);
            };
            if !t.uitstaand.contains_key(&volgnummer) {
                return Ok(false);
            }
            t.ontvangen.insert(volgnummer, uitkomst.kern);
            let mut fout = None;
            while let Some(a) = t.ontvangen.remove(&(t.voltooid + 1)) {
                t.voltooid += 1;
                let toelating = t
                    .uitstaand
                    .remove(&t.voltooid)
                    .expect("Toegelaten opdracht");
                match a {
                    Ok(a) => {
                        if toelating.herstel || a.deel != t.deel {
                            t.herstel_nodig = true;
                        }
                        t.beeld = a.beeld;
                        t.deel = a.deel;
                        t.bron = a.bron;
                        t.bron_hash = a.hash;
                        t.terug = a.terug;
                        t.vooruit = a.vooruit;
                        t.fout = None;
                        t.melding = if t.bewaar_bezig.is_some() {
                            "Opslaan…"
                        } else if t.gewijzigd() {
                            "Niet opgeslagen"
                        } else {
                            "Opgeslagen"
                        }
                        .into();
                    }
                    Err(e) => {
                        t.herstel_nodig = true;
                        t.melding = e.clone();
                        t.fout = Some(e.clone());
                        fout = Some(e);
                    }
                }
            }
            if t.uitstaand.is_empty() && t.herstel_nodig {
                t.generatie += 1;
                t.herstel_nodig = false;
            }
            if let Some(e) = fout {
                Err(Fout::Document(e))
            } else {
                Ok(true)
            }
        }
    }
    pub fn voorbereid_bewaren(
        &mut self,
        doel: Doel,
        nieuw_pad: Option<&Path>,
    ) -> Resultaat<BewaarTaak> {
        let schrijfsleutel = self.schrijfsleutel.clone();
        self.volgende_bewaaractie = self
            .volgende_bewaaractie
            .checked_add(1)
            .ok_or_else(|| Fout::Document("Te veel bewaaracties".into()))?;
        let volgnummer = self.volgende_bewaaractie;
        let t = self.eigenaar(doel)?;
        if t.bewaar_bezig.is_some() {
            return Err(Fout::Document("Dit document wordt al opgeslagen".into()));
        }
        let pad = nieuw_pad
            .or(t.pad.as_deref())
            .ok_or_else(|| Fout::Document("Kies eerst Opslaan als".into()))?
            .to_path_buf();
        let verwacht = if t.pad.as_deref() == Some(pad.as_path()) {
            t.schijf_hash.clone()
        } else {
            None
        };
        t.bewaar_bezig = Some(volgnummer);
        t.melding = "Opslaan…".into();
        let momentopname = Box::pin(self.werker.stuur(doel.document, Opdracht::Stand));
        Ok(BewaarTaak {
            document: doel.document,
            volgnummer,
            pad,
            momentopname,
            verwacht,
            schrijfsleutel,
        })
    }
    pub fn voltooi_bewaren(&mut self, antwoord: BewaarAntwoord) -> Resultaat<bool> {
        let Some(t) = self
            .tabbladen
            .iter_mut()
            .find(|t| t.id == antwoord.document && t.bewaar_bezig == Some(antwoord.volgnummer))
        else {
            return Ok(false);
        };
        t.bewaar_bezig = None;
        match antwoord.resultaat {
            Ok((hash, bron_hash)) => {
                t.schijf_hash = Some(hash);
                t.bewaard_hash = bron_hash;
                t.naam = antwoord
                    .pad
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into();
                t.pad = Some(antwoord.pad);
                t.fout = None;
                t.melding = if t.gewijzigd() {
                    "Niet opgeslagen"
                } else {
                    "Opgeslagen"
                }
                .into();
                Ok(true)
            }
            Err(e) => {
                t.melding = e.to_string();
                t.fout = Some(e.to_string());
                Err(e)
            }
        }
    }
    pub fn sluit(&mut self, id: u64, verwerpen: bool) -> Resultaat<()> {
        if let Some(t) = self.tabbladen.iter().find(|t| t.id == id)
            && t.gewijzigd()
            && !verwerpen
        {
            return Err(Fout::Document(
                "Sla de wijzigingen op of kies Verwerpen".into(),
            ));
        }
        self.openingen.remove(&id);
        self.tabbladen.retain(|t| t.id != id);
        self.werker.sluit(id);
        if self.actief == Some(id) {
            self.actief = self.tabbladen.last().map(|t| t.id);
        }
        Ok(())
    }
    pub fn meld(&mut self, resultaat: Resultaat<()>) {
        if let Err(e) = resultaat {
            self.melding = e.to_string();
        }
    }
}
