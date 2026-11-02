//! Documenteigenaarschap blijft in Rust, ook bij vertraagde DOM-gebeurtenissen.
use office_core::{
    document::{Bewerking, Fout, Module, Resultaat, Sessie, Weergave},
    opslag,
};
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Doel {
    pub document: u64,
    pub deel: usize,
    generatie: u64,
}

pub struct Tabblad {
    pub id: u64,
    pub naam: String,
    pub sessie: Sessie,
    pub beeld: Weergave,
    pub deel: usize,
    pub pad: Option<PathBuf>,
    pub melding: String,
    schijf_hash: Option<String>,
    bewaard_hash: String,
    generatie: u64,
}
impl Tabblad {
    pub fn doel(&self) -> Doel {
        Doel {
            document: self.id,
            deel: self.deel,
            generatie: self.generatie,
        }
    }
    pub fn gewijzigd(&self) -> bool {
        self.sessie.bron_hash() != self.bewaard_hash
    }
}

#[derive(Default)]
pub struct Werkruimte {
    pub tabbladen: Vec<Tabblad>,
    pub actief: Option<u64>,
    pub donker: bool,
    pub bestand: bool,
    pub melding: String,
    pub venster_sluiten: bool,
    volgend: u64,
}
impl Werkruimte {
    pub fn tab(&self) -> Option<&Tabblad> {
        self.actief
            .and_then(|id| self.tabbladen.iter().find(|t| t.id == id))
    }
    pub fn voeg_toe(
        &mut self,
        sessie: Sessie,
        naam: String,
        pad: Option<PathBuf>,
        schijf_hash: Option<String>,
    ) -> Resultaat<u64> {
        let beeld = sessie.weergave(0)?;
        self.volgend = self
            .volgend
            .checked_add(1)
            .ok_or_else(|| Fout::Document("Te veel documentidentiteiten".into()))?;
        let id = self.volgend;
        let bewaard_hash = sessie.bron_hash().into();
        self.tabbladen.push(Tabblad {
            id,
            naam,
            sessie,
            beeld,
            deel: 0,
            pad,
            melding: String::new(),
            schijf_hash,
            bewaard_hash,
            generatie: 0,
        });
        self.actief = Some(id);
        self.bestand = false;
        Ok(id)
    }
    pub fn nieuw(&mut self, module: Module) -> Resultaat<u64> {
        self.voeg_toe(
            Sessie::nieuw(module)?,
            format!("Nieuw {}.{}", module.naam(), module.extensie()),
            None,
            None,
        )
    }
    pub fn open(&mut self, pad: &Path) -> Resultaat<u64> {
        let module =
            Module::van_extensie(pad.extension().and_then(|s| s.to_str()).unwrap_or_default())?;
        let (bytes, hash) = opslag::lees(pad)?;
        self.voeg_toe(
            Sessie::open(module, bytes)?,
            pad.file_name().unwrap_or_default().to_string_lossy().into(),
            Some(pad.into()),
            Some(hash),
        )
    }
    pub fn kies(&mut self, id: Option<u64>) {
        if id.is_none() || self.tabbladen.iter().any(|t| Some(t.id) == id) {
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
    pub fn bewerk(&mut self, doel: Doel, bewerking: Bewerking) -> Resultaat<()> {
        let t = self.eigenaar(doel)?;
        t.beeld = t.sessie.bewerk_met_weergave(t.deel, bewerking)?;
        if let Some(pagina) = &t.beeld.notitie
            && pagina.deel != t.deel
        {
            t.deel = pagina.deel;
            t.generatie += 1;
        }
        t.melding = "Niet opgeslagen".into();
        Ok(())
    }
    pub fn kies_deel(&mut self, doel: Doel, deel: usize) -> Resultaat<()> {
        let t = self.eigenaar(doel)?;
        let beeld = t.sessie.weergave(deel)?;
        t.beeld = beeld;
        t.deel = deel;
        t.generatie += 1;
        Ok(())
    }
    pub fn historie(&mut self, doel: Doel, vooruit: bool) -> Resultaat<()> {
        let t = self.eigenaar(doel)?;
        let anker = t.sessie.notitie_anker(t.deel);
        if vooruit {
            t.sessie.vooruit()?;
        } else {
            t.sessie.terug()?;
        }
        t.deel = t.sessie.notitiepositie(anker.as_ref(), t.deel);
        t.beeld = t.sessie.weergave(t.deel)?;
        t.generatie += 1;
        t.melding = if t.gewijzigd() {
            "Niet opgeslagen"
        } else {
            "Opgeslagen"
        }
        .into();
        Ok(())
    }
    pub fn bewaar(&mut self, doel: Doel, nieuw_pad: Option<&Path>) -> Resultaat<()> {
        let t = self.eigenaar(doel)?;
        let pad = nieuw_pad
            .or(t.pad.as_deref())
            .ok_or_else(|| Fout::Document("Kies eerst Opslaan als".into()))?
            .to_path_buf();
        let verwacht = if t.pad.as_deref() == Some(pad.as_path()) {
            t.schijf_hash.as_deref()
        } else {
            None
        };
        match opslag::schrijf(&pad, &t.sessie.bron(), verwacht) {
            Ok(hash) => {
                t.schijf_hash = Some(hash);
                t.bewaard_hash = t.sessie.bron_hash().into();
                t.naam = pad.file_name().unwrap_or_default().to_string_lossy().into();
                t.pad = Some(pad);
                t.melding = "Opgeslagen".into();
                Ok(())
            }
            Err(e) => {
                t.melding = e.to_string();
                Err(e)
            }
        }
    }
    pub fn sluit(&mut self, id: u64, verwerpen: bool) -> Resultaat<()> {
        let Some(t) = self.tabbladen.iter().find(|t| t.id == id) else {
            return Ok(());
        };
        if t.gewijzigd() && !verwerpen {
            return Err(Fout::Document(
                "Sla de wijzigingen op of kies Verwerpen".into(),
            ));
        }
        self.tabbladen.retain(|t| t.id != id);
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
