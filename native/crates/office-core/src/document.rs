//! De native engines blijven eigenaar van het document. De interface ontvangt
//! uitsluitend een begrensde weergave; opslaan bouwt nooit een bestand uit die weergave.
use crate::{
    interactie::{Pagina, RasterVenster},
    opmaak::{Opmaak, OpmaakStaat},
};
use betteroffice_docx as docx;
use betteroffice_pptx as pptx;
use betteroffice_xlsx as xlsx;
use serde::{Deserialize, Serialize};

pub type Resultaat<T> = std::result::Result<T, Fout>;
#[derive(Debug, thiserror::Error)]
pub enum Fout {
    #[error("{0}")]
    Document(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}
fn fout(e: impl std::fmt::Display) -> Fout {
    Fout::Document(e.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Module {
    Writer,
    Spreadsheet,
    Presentation,
    Notition,
    Email,
}
impl Module {
    pub const ALLE: [Self; 5] = [
        Self::Writer,
        Self::Spreadsheet,
        Self::Presentation,
        Self::Notition,
        Self::Email,
    ];
    pub fn naam(self) -> &'static str {
        match self {
            Self::Writer => "Writer",
            Self::Spreadsheet => "Spreadsheet",
            Self::Presentation => "Presentation",
            Self::Notition => "Notition",
            Self::Email => "Email",
        }
    }
    pub fn extensie(self) -> &'static str {
        match self {
            Self::Writer => "docx",
            Self::Spreadsheet => "xlsx",
            Self::Presentation => "pptx",
            Self::Notition => "json",
            Self::Email => "eml",
        }
    }
    pub fn van_extensie(ext: &str) -> Resultaat<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "docx" => Ok(Self::Writer),
            "xlsx" => Ok(Self::Spreadsheet),
            "pptx" => Ok(Self::Presentation),
            "json" | "openaec-notities" => Ok(Self::Notition),
            "eml" => Ok(Self::Email),
            _ => Err(fout(
                "Dit formaat is nog niet beschikbaar in de native versie",
            )),
        }
    }
}
#[derive(Debug, Clone)]
pub struct Veld {
    pub id: String,
    pub naam: String,
    pub tekst: String,
    pub bewerkbaar: bool,
    pub opmaak: OpmaakStaat,
}
#[derive(Debug, Clone)]
pub struct Weergave {
    pub module: Module,
    pub onderdelen: Vec<String>,
    pub velden: Vec<Veld>,
    pub afbeelding: Option<Vec<u8>>,
    pub melding: String,
    pub pagina: Pagina,
    pub notitie: Option<crate::notities::NotitiePagina>,
    pub voorkeursveld: Option<String>,
    pub bewerkingsbeperking: Option<String>,
    pub writer_opmaak:
        std::sync::Arc<std::collections::HashMap<String, Vec<crate::writer_opmaak::OpmaakBereik>>>,
}
#[derive(Debug, Clone)]
pub enum Bewerking {
    Tekst {
        id: String,
        tekst: String,
    },
    DiaNotities(String),
    Opmaak {
        id: String,
        begin: usize,
        einde: usize,
        stijl: Opmaak,
    },
    Structuur {
        adres: String,
        actie: crate::rekenblad::Structuur,
    },
    Dia(crate::presentatie::DiaActie),
    Pagina {
        id: String,
        actie: crate::writer_pagina::PaginaActie,
    },
    Alinea {
        id: String,
        actie: crate::writer::AlineaActie,
    },
    Notitie(crate::notities::NotitieActie),
}

pub enum Document {
    Writer(Box<crate::writer_document::WriterDocument>),
    Spreadsheet(Box<xlsx::Workbook>),
    Presentation(Box<pptx::Presentation>),
    Notition(serde_json::Value),
    Email(Vec<u8>),
}
impl Document {
    pub fn open(module: Module, bytes: &[u8]) -> Resultaat<Self> {
        if bytes.len() > 64 * 1024 * 1024 {
            return Err(fout("Bestand te groot"));
        }
        Ok(match module {
            Module::Writer => {
                crate::writer::controleer_nootnummers(bytes)?;
                let mut d = docx::Document::open(bytes).map_err(fout)?;
                alinea_ids(&mut d);
                Self::Writer(Box::new(crate::writer_document::WriterDocument::nieuw(
                    d, bytes,
                )?))
            }
            Module::Spreadsheet => Self::Spreadsheet(Box::new(
                xlsx::Workbook::open_recalculated(bytes, xlsx::CalculationOptions::default())
                    .map_err(fout)?,
            )),
            Module::Presentation => {
                let mut doc = pptx::Presentation::open(bytes).map_err(fout)?;
                // De oorspronkelijke families worden ook bij native rasteren gebruikt.
                // Grote CJK-letters laden alleen wanneer de presentatie die tekens bevat.
                let snapshot = doc.snapshot().map_err(fout)?;
                let tekst = serde_json::to_string(&snapshot)?;
                let cjk = tekst
                    .chars()
                    .any(|c| matches!(c as u32,0x2e80..=0x9fff|0xac00..=0xd7ff|0xf900..=0xfaff));
                for letter in crate::lettertypen::LETTERTYPEN
                    .iter()
                    .chain(std::iter::once(&crate::lettertypen::SYMBOLEN))
                {
                    if letter.bytes.len() > 2_000_000 && !cjk {
                        continue;
                    }
                    doc.register_font(letter.familie, letter.vet, letter.cursief, letter.bytes)
                        .map_err(fout)?;
                    if letter.alias != letter.familie {
                        doc.register_font(letter.alias, letter.vet, letter.cursief, letter.bytes)
                            .map_err(fout)?;
                    }
                }
                let symbolen = &crate::lettertypen::SYMBOLEN;
                doc.register_fallback_font(symbolen.familie, false, false, symbolen.bytes)
                    .map_err(fout)?;
                Self::Presentation(Box::new(doc))
            }
            Module::Notition => {
                let waarde: serde_json::Value = serde_json::from_slice(bytes)?;
                Self::Notition(crate::notities::open(waarde)?)
            }
            Module::Email => {
                if mail_parser::MessageParser::default().parse(bytes).is_none() {
                    return Err(fout("Geen leesbaar e-mailbericht"));
                }
                Self::Email(bytes.to_vec())
            }
        })
    }
    pub fn nieuw(module: Module) -> Resultaat<Self> {
        match module {
            Module::Writer=>Self::open(module,include_bytes!("../../../../public/templates/nieuw.docx")),
            Module::Spreadsheet=>Self::open(module,include_bytes!("../../../../public/templates/nieuw.xlsx")),
            Module::Presentation=>Self::open(module,include_bytes!("../../../../public/templates/nieuw.pptx")),
            Module::Notition=>Self::open(module,br##"{"formaat":"openaec-notities","versie":3,"boeken":[{"id":"boek1","naam":"Mijn notities","secties":[{"id":"sectie1","naam":"Notities","soort":"markdown","paginas":[{"id":"pagina1","titel":"Nieuwe pagina","bijgewerkt":"2026-10-30T00:00:00Z","vastgezet":false,"verwijderd":false,"vakken":[],"markdown":"# Nieuwe pagina\n\nSchrijf hier je notities."}]}]}]}"##),
            Module::Email=>Self::open(module,b"From: OpenAEC <voorbeeld@example.invalid>\r\nTo: lokaal@example.invalid\r\nSubject: Lokaal voorbeeld\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nBewaar complete e-mailbronnen, inclusief bijlagen.\r\n"),
        }
    }
    pub fn bytes(&self) -> Resultaat<Vec<u8>> {
        match self {
            Self::Writer(d) => d.save().map_err(fout),
            Self::Spreadsheet(d) => d.save().map_err(fout),
            Self::Presentation(d) => d.save().map_err(fout),
            Self::Notition(d) => {
                crate::notities::controleer(d)?;
                Ok(serde_json::to_vec_pretty(d)?)
            }
            Self::Email(d) => Ok(d.clone()),
        }
    }
    pub fn markdown(&self) -> Resultaat<String> {
        match self {
            Self::Writer(d) => {
                let md = d
                    .export_markdown(&docx::ExportOptions::new(docx::RevisionView::Accepted))
                    .map_err(fout)?;
                if md.truncated {
                    return Err(fout("Markdown-export overschrijdt de limiet"));
                }
                Ok(md.markdown)
            }
            _ => Err(fout("Markdown-export is beschikbaar voor Writer")),
        }
    }
    pub fn bewerk(&mut self, deel: usize, bewerking: Bewerking) -> Resultaat<()> {
        if let Self::Writer(d) = self {
            d.controleer_bewerking()?;
        }
        match (self, bewerking) {
            (Self::Writer(d), Bewerking::Pagina { id, actie }) => {
                crate::writer_pagina::pagina(d, &id, actie)?;
            }
            (Self::Writer(d), Bewerking::Alinea { id, actie }) => {
                crate::writer::alinea(d, &id, actie)?
            }
            (
                Self::Writer(d),
                Bewerking::Opmaak {
                    id,
                    begin,
                    einde,
                    stijl,
                },
            ) => crate::writer_tekst::opmaak(d, &id, begin, einde, &stijl)?,
            (Self::Spreadsheet(d), Bewerking::Opmaak { id, stijl, .. }) => {
                crate::rekenblad::opmaak(d, deel, &id, &stijl)?
            }
            (Self::Spreadsheet(d), Bewerking::Structuur { adres, actie }) => {
                crate::rekenblad::structuur(d, deel, &adres, actie)?
            }
            (
                Self::Presentation(d),
                Bewerking::Opmaak {
                    id,
                    begin,
                    einde,
                    stijl,
                },
            ) => crate::presentatie::opmaak(d, &id, begin, einde, &stijl)?,
            (Self::Presentation(d), Bewerking::Dia(actie)) => {
                crate::presentatie::actie(d, deel, actie)?
            }
            (Self::Writer(d), Bewerking::Tekst { id, tekst }) => {
                crate::writer_tekst::vervang(d, &id, &tekst)?;
            }
            (Self::Spreadsheet(d), Bewerking::Tekst { id, tekst }) => {
                let adres = crate::rekenblad::ankercel(
                    d,
                    deel,
                    xlsx::CellRef::parse_a1(&id).map_err(fout)?,
                )?;
                crate::rekenblad::controleer_invoer(d, deel, adres, &tekst)?;
                d.edit_cell(
                    xlsx::SheetId(deel as u32),
                    adres,
                    &tekst,
                    xlsx::CalculationOptions::default(),
                )
                .map_err(fout)?;
            }
            (Self::Presentation(d), Bewerking::Tekst { id, tekst }) if id == "__dia_notities" => {
                let ids = d.slide_ids().map_err(fout)?;
                let id = ids.get(deel).ok_or_else(|| fout("Dia bestaat niet"))?;
                d.set_slide_notes(&pptx::EditCtx::local("OpenAEC"), id, &tekst)
                    .map_err(fout)?;
            }
            (Self::Presentation(d), Bewerking::Tekst { id, tekst }) => {
                crate::presentatie_tekst::vervang(d, &id, &tekst)?;
            }
            (Self::Presentation(d), Bewerking::DiaNotities(tekst)) => {
                let ids = d.slide_ids().map_err(fout)?;
                let id = ids.get(deel).ok_or_else(|| fout("Dia bestaat niet"))?;
                d.set_slide_notes(&pptx::EditCtx::local("OpenAEC"), id, &tekst)
                    .map_err(fout)?;
            }
            (Self::Notition(d), Bewerking::Notitie(actie)) => {
                crate::notities::bewerk(d, deel, actie)?
            }
            (Self::Notition(d), Bewerking::Opmaak { id, stijl, .. }) => {
                crate::notities::opmaak(d, deel, &id, &stijl)?
            }
            (Self::Notition(d), Bewerking::Tekst { id, tekst }) => {
                crate::notities::tekst(d, deel, &id, &tekst)?
            }
            _ => return Err(fout("Deze bewerking is niet beschikbaar")),
        }
        Ok(())
    }
    pub fn weergave(&self, deel: usize) -> Resultaat<Weergave> {
        self.weergave_in(deel, RasterVenster::default())
    }
    fn weergave_in(&self, deel: usize, venster: RasterVenster) -> Resultaat<Weergave> {
        self.weergave_van_bron(deel, venster, None, None)
    }
    fn weergave_van_bron(
        &self,
        deel: usize,
        venster: RasterVenster,
        bron: Option<&[u8]>,
        eigenaar: Option<u64>,
    ) -> Resultaat<Weergave> {
        let mut beeld = Weergave {
            module: Module::Writer,
            onderdelen: vec![],
            velden: vec![],
            afbeelding: None,
            melding: String::new(),
            pagina: Pagina::default(),
            notitie: None,
            voorkeursveld: None,
            bewerkingsbeperking: None,
            writer_opmaak: Default::default(),
        };
        match self {
            Self::Writer(d) => {
                let bron = match bron {
                    Some(b) => std::borrow::Cow::Borrowed(b),
                    None => std::borrow::Cow::Owned(d.save().map_err(fout)?),
                };
                let (png, paginas, overgeslagen, pagina, opmaak) =
                    crate::writer_beeld::pagina_met_opmaak(&bron, deel, eigenaar)?;
                beeld.afbeelding = Some(png);
                beeld.pagina = pagina;
                beeld.onderdelen = (0..paginas).map(|i| format!("Pagina {}", i + 1)).collect();
                let mut bereiken = std::collections::HashMap::new();
                for (i, p) in d.paragraphs().into_iter().enumerate() {
                    let id = p.para_id.clone().unwrap_or_default();
                    let tekst = crate::writer_tekst::alinea_tekst(p);
                    let mut staat = crate::writer_tekst::staat(p);
                    if let Some(gevonden) = opmaak.get(&id)
                        && gevonden.tekst == tekst
                    {
                        if let Some(opmaak) = crate::writer_opmaak::selectie(
                            &gevonden.bereiken,
                            0,
                            tekst.chars().count(),
                        ) {
                            staat = opmaak;
                        }
                        bereiken.insert(id.clone(), gevonden.bereiken.clone());
                    }
                    beeld.velden.push(Veld {
                        id,
                        naam: format!("Alinea {}", i + 1),
                        tekst,
                        opmaak: staat,
                        bewerkbaar: p.para_id.is_some() && crate::writer_tekst::ondersteund(p),
                    });
                }
                beeld.writer_opmaak = std::sync::Arc::new(bereiken);
                let woorden = d
                    .paragraphs()
                    .iter()
                    .map(|p| {
                        crate::writer_tekst::alinea_tekst(p)
                            .split_whitespace()
                            .count()
                    })
                    .sum::<usize>();
                beeld.melding = format!(
                    "{woorden} woorden · {} tabellen · {paginas} pagina’s · {overgeslagen} afbeeldingen overgeslagen",
                    d.tables().len()
                );
            }
            Self::Spreadsheet(d) => {
                beeld.module = Module::Spreadsheet;
                beeld.onderdelen = d.model().sheets.iter().map(|s| s.name.clone()).collect();
                crate::rekenblad::toon(d, deel, venster, &mut beeld)?;
            }
            Self::Presentation(d) => {
                beeld.module = Module::Presentation;
                let deck = d.snapshot().map_err(fout)?;
                let deel = deel.min(deck.slides.len().saturating_sub(1));
                beeld.onderdelen = deck
                    .slides
                    .iter()
                    .enumerate()
                    .map(|(i, s)| {
                        s.title
                            .clone()
                            .filter(|s| !s.is_empty())
                            .unwrap_or(format!("Dia {}", i + 1))
                    })
                    .collect();
                let dia = deck
                    .slides
                    .get(deel)
                    .ok_or_else(|| fout("Dia bestaat niet"))?;
                fn verzamel(shapes: &[pptx::ShapeSnapshot], velden: &mut Vec<Veld>) {
                    for shape in shapes {
                        for story in &shape.text_stories {
                            velden.push(Veld {
                                id: story.id.clone(),
                                naam: shape.name.clone(),
                                tekst: story.plain_text(),
                                bewerkbaar: true,
                                opmaak: crate::presentatie::staat(story),
                            });
                        }
                        verzamel(&shape.children, velden);
                    }
                }
                verzamel(&dia.shapes, &mut beeld.velden);
                beeld.velden.push(Veld {
                    id: "__dia_notities".into(),
                    naam: "Sprekersnotities".into(),
                    tekst: dia.notes.clone(),
                    bewerkbaar: true,
                    opmaak: OpmaakStaat::default(),
                });
                beeld.pagina = crate::presentatie::geometrie(d, deel)?;
                let render = d
                    .render_png(deel, &pptx::RenderOptions::default())
                    .map_err(fout)?;
                beeld.melding = if render.skipped_images > 0 {
                    format!(
                        "{} afbeeldingen konden niet worden getoond",
                        render.skipped_images
                    )
                } else {
                    format!("Dia {} van {}", deel + 1, deck.slides.len())
                };
                beeld.afbeelding = Some(render.bytes);
            }
            Self::Notition(d) => {
                beeld.module = Module::Notition;
                crate::notities::toon(d, deel, &mut beeld)?;
            }
            Self::Email(bytes) => {
                beeld.module = Module::Email;
                beeld.onderdelen = vec!["Bericht".into()];
                let bericht = mail_parser::MessageParser::default()
                    .parse(bytes)
                    .ok_or_else(|| fout("Ongeldige e-mail"))?;
                for (id, naam, tekst) in [
                    (
                        "onderwerp",
                        "Onderwerp",
                        bericht.subject().unwrap_or_default().to_string(),
                    ),
                    (
                        "inhoud",
                        "Bericht",
                        bericht.body_text(0).unwrap_or_default().to_string(),
                    ),
                ] {
                    beeld.velden.push(Veld {
                        id: id.into(),
                        naam: naam.into(),
                        tekst,
                        bewerkbaar: false,
                        opmaak: OpmaakStaat::default(),
                    });
                }
                beeld.melding = format!(
                    "{} bijlagen · volledige oorspronkelijke MIME-bron bewaard",
                    bericht.attachments().count()
                );
            }
        }
        if let Self::Writer(d) = self {
            beeld.bewerkingsbeperking = d.bewerkingsbeperking().map(str::to_owned);
            if beeld.bewerkingsbeperking.is_some() {
                for veld in &mut beeld.velden {
                    veld.bewerkbaar = false;
                }
                beeld.melding.push_str(" · alleen lezen");
            }
        }
        Ok(beeld)
    }
}

/// Een mislukte bewerking herstelt de vorige volledige bron, ook na een enginepanic.
/// De interface ziet een fout en een bruikbaar document, nooit een half resultaat.
pub struct Sessie {
    pub module: Module,
    layout_eigenaar: u64,
    document: Document,
    bron: std::sync::Arc<Vec<u8>>,
    bron_hash: String,
    venster: RasterVenster,
    beelden: std::cell::RefCell<Vec<(usize, Weergave)>>,
    terug: Vec<std::sync::Arc<Vec<u8>>>,
    vooruit: Vec<std::sync::Arc<Vec<u8>>>,
}
static VOLGENDE_LAYOUT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
impl Drop for Sessie {
    fn drop(&mut self) {
        crate::writer_beeld::wis(self.layout_eigenaar);
    }
}
impl Sessie {
    pub fn open(module: Module, bytes: Vec<u8>) -> Resultaat<Self> {
        Ok(Self {
            document: Document::open(module, &bytes)?,
            module,
            layout_eigenaar: VOLGENDE_LAYOUT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            bron_hash: crate::opslag::hash(&bytes),
            venster: RasterVenster::default(),
            beelden: std::cell::RefCell::new(vec![]),
            bron: std::sync::Arc::new(bytes),
            terug: vec![],
            vooruit: vec![],
        })
    }
    pub fn nieuw(module: Module) -> Resultaat<Self> {
        let d = Document::nieuw(module)?;
        Self::open(module, d.bytes()?)
    }
    pub fn bron(&self) -> std::sync::Arc<Vec<u8>> {
        self.bron.clone()
    }
    pub fn bron_hash(&self) -> &str {
        &self.bron_hash
    }
    pub fn kan_terug(&self) -> bool {
        !self.terug.is_empty()
    }
    pub fn kan_vooruit(&self) -> bool {
        !self.vooruit.is_empty()
    }
    pub fn weergave(&self, deel: usize) -> Resultaat<Weergave> {
        if let Some((_, b)) = self.beelden.borrow().iter().find(|(n, _)| *n == deel) {
            return Ok(b.clone());
        }
        let beeld = self.document.weergave_van_bron(
            deel,
            self.venster,
            None,
            Some(self.layout_eigenaar),
        )?;
        let mut cache = self.beelden.borrow_mut();
        if cache.len() >= 3 {
            cache.remove(0);
        }
        cache.push((deel, beeld.clone()));
        Ok(beeld)
    }
    /// Verplaats alleen de weergave; een navigatie hoort niet in de bewerkingsgeschiedenis.
    pub fn naar_cel(&mut self, deel: usize, adres: &str) -> Resultaat<Weergave> {
        if self.module != Module::Spreadsheet {
            return Err(fout("Celadres hoort bij een rekenblad"));
        }
        let cel = crate::rekenblad::bereik(adres)?.start;
        let Document::Spreadsheet(d) = &self.document else {
            unreachable!()
        };
        let anker = crate::rekenblad::ankercel(d, deel, cel)?;
        let oud = self.venster;
        self.venster = RasterVenster {
            rij: cel.row.saturating_sub(3),
            kolom: cel.col.saturating_sub(2),
        };
        self.beelden.borrow_mut().clear();
        match self.weergave(deel) {
            Ok(mut b) => {
                b.voorkeursveld = Some(anker.to_a1());
                Ok(b)
            }
            Err(e) => {
                self.venster = oud;
                self.beelden.borrow_mut().clear();
                Err(e)
            }
        }
    }
    pub fn verplaats_cel(
        &mut self,
        deel: usize,
        adres: &str,
        richting: crate::rekenblad::Richting,
    ) -> Resultaat<Weergave> {
        let Document::Spreadsheet(d) = &self.document else {
            return Err(fout("Celnavigatie hoort bij een rekenblad"));
        };
        let doel = crate::rekenblad::volgende_cel(d, deel, adres, richting)?;
        let mut beeld = self.weergave(deel)?;
        if beeld.pagina.vlakken.iter().any(|v| v.id == doel) {
            beeld.voorkeursveld = Some(doel);
            Ok(beeld)
        } else {
            self.naar_cel(deel, &doel)
        }
    }
    pub fn markdown(&self) -> Resultaat<String> {
        self.document.markdown()
    }
    pub fn bewerk(&mut self, deel: usize, bewerking: Bewerking) -> Resultaat<()> {
        self.bewerk_met_weergave(deel, bewerking).map(|_| ())
    }
    pub fn bewerk_met_weergave(
        &mut self,
        deel: usize,
        bewerking: Bewerking,
    ) -> Resultaat<Weergave> {
        if matches!(bewerking, Bewerking::Pagina { .. }) {
            crate::writer_pagina::controleer_bron(&self.bron)?;
        }
        let resultaat = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.document.bewerk(deel, bewerking)?;
            // Serialiseer één keer; de renderer toont precies de te bewaren bron.
            let bytes = self.document.bytes()?;
            let beeld = self.document.weergave_van_bron(
                deel,
                self.venster,
                Some(&bytes),
                Some(self.layout_eigenaar),
            )?;
            Ok((bytes, beeld))
        }));
        match resultaat {
            Ok(Ok((bytes, beeld))) => {
                self.terug.push(self.bron.clone());
                // Maximaal 32 volledige bronnen en 64 MB geschiedenis per document.
                while self.terug.len() > 32
                    || self.terug.iter().map(|b| b.len()).sum::<usize>() > 64 * 1024 * 1024
                {
                    self.terug.remove(0);
                }
                self.vooruit.clear();
                self.bron_hash = crate::opslag::hash(&bytes);
                self.bron = std::sync::Arc::new(bytes);
                *self.beelden.borrow_mut() = vec![(deel, beeld.clone())];
                Ok(beeld)
            }
            foutresultaat => {
                self.document = Document::open(self.module, &self.bron)?;
                match foutresultaat {
                    Ok(Err(e)) => Err(e),
                    _ => Err(fout(
                        "De documentengine heeft deze bewerking afgebroken. De vorige bron is hersteld.",
                    )),
                }
            }
        }
    }
    pub fn terug(&mut self) -> Resultaat<()> {
        if let Some(bytes) = self.terug.last() {
            let d = Document::open(self.module, bytes)?;
            self.vooruit.push(self.bron.clone());
            self.document = d;
            self.bron = self.terug.pop().unwrap();
            self.bron_hash = crate::opslag::hash(&self.bron);
            self.beelden.borrow_mut().clear();
        }
        Ok(())
    }
    pub fn vooruit(&mut self) -> Resultaat<()> {
        if let Some(bytes) = self.vooruit.last() {
            let d = Document::open(self.module, bytes)?;
            self.terug.push(self.bron.clone());
            self.document = d;
            self.bron = self.vooruit.pop().unwrap();
            self.bron_hash = crate::opslag::hash(&self.bron);
            self.beelden.borrow_mut().clear();
        }
        Ok(())
    }
}

/// Niet iedere bron schrijft w14:paraId. Geef zulke alinea's een adres in het
/// model, inclusief dezelfde gedeelde alinea's in de afgeleide sectiebeelden.
/// De originele bronbytes blijven in Sessie behouden tot een echte bewerking.
fn alinea_ids(document: &mut docx::Document) {
    use std::{
        collections::{HashMap, HashSet},
        sync::Arc,
    };
    let mut gebruikt: HashSet<String> = document
        .paragraphs()
        .iter()
        .filter_map(|p| p.para_id.clone())
        .collect();
    let mut gedeeld = HashMap::<usize, Arc<docx::Paragraph>>::new();
    let mut teller = 1u32;
    fn bezoek(
        blokken: &mut [docx::BlockContent],
        gebruikt: &mut HashSet<String>,
        gedeeld: &mut HashMap<usize, Arc<docx::Paragraph>>,
        teller: &mut u32,
    ) {
        for blok in blokken {
            match blok {
                docx::BlockContent::Paragraph(p) => {
                    let sleutel = Arc::as_ptr(p) as usize;
                    if let Some(vervanging) = gedeeld.get(&sleutel) {
                        *p = vervanging.clone();
                    } else if p.para_id.is_none() {
                        let id = loop {
                            let id = format!("{teller:08X}");
                            *teller += 1;
                            if gebruikt.insert(id.clone()) {
                                break id;
                            }
                        };
                        Arc::make_mut(p).para_id = Some(id);
                        gedeeld.insert(sleutel, p.clone());
                    }
                }
                docx::BlockContent::Table(t) => {
                    for rij in &mut Arc::make_mut(t).rows {
                        for cel in &mut rij.cells {
                            bezoek(&mut cel.content, gebruikt, gedeeld, teller);
                        }
                    }
                }
                docx::BlockContent::BlockSdt(s) => {
                    bezoek(&mut Arc::make_mut(s).content, gebruikt, gedeeld, teller)
                }
                _ => {}
            }
        }
    }
    let model = document.model_mut();
    bezoek(
        &mut model.body.content,
        &mut gebruikt,
        &mut gedeeld,
        &mut teller,
    );
    if let Some(secties) = &mut model.body.sections {
        for sectie in secties {
            bezoek(
                &mut sectie.content,
                &mut gebruikt,
                &mut gedeeld,
                &mut teller,
            );
        }
    }
}
