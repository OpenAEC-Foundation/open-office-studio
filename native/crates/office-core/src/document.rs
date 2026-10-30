//! De native engines blijven eigenaar van het document. De interface ontvangt
//! uitsluitend een begrensde weergave; opslaan bouwt nooit een bestand uit die weergave.
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
}
#[derive(Debug, Clone)]
pub struct Weergave {
    pub module: Module,
    pub onderdelen: Vec<String>,
    pub velden: Vec<Veld>,
    pub afbeelding: Option<Vec<u8>>,
    pub melding: String,
}
#[derive(Debug, Clone)]
pub enum Bewerking {
    Tekst { id: String, tekst: String },
    DiaNotities(String),
}

pub enum Document {
    Writer(Box<docx::Document>),
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
                let mut d = docx::Document::open(bytes).map_err(fout)?;
                alinea_ids(&mut d);
                Self::Writer(Box::new(d))
            }
            Module::Spreadsheet => Self::Spreadsheet(Box::new(
                xlsx::Workbook::open_recalculated(bytes, xlsx::CalculationOptions::default())
                    .map_err(fout)?,
            )),
            Module::Presentation => {
                let mut doc = pptx::Presentation::open(bytes).map_err(fout)?;
                // Dezelfde meegeleverde basisletter als de native interface.
                doc.register_font(
                    "Inter",
                    false,
                    false,
                    include_bytes!("../../../vendor/openaec-ui/assets/fonts/Inter-Regular.ttf"),
                )
                .map_err(fout)?;
                Self::Presentation(Box::new(doc))
            }
            Module::Notition => {
                let waarde: serde_json::Value = serde_json::from_slice(bytes)?;
                if waarde["formaat"] != "openaec-notities"
                    || waarde["versie"] != 3
                    || !waarde["boeken"].is_array()
                {
                    return Err(fout("Geen ondersteund notitieboek (versie 3 vereist)"));
                }
                Self::Notition(waarde)
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
            Self::Notition(d) => Ok(serde_json::to_vec_pretty(d)?),
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
        match (self, bewerking) {
            (Self::Writer(d), Bewerking::Tekst { id, tekst }) => {
                crate::writer_tekst::vervang(d, &id, &tekst)?;
            }
            (Self::Spreadsheet(d), Bewerking::Tekst { id, tekst }) => {
                let adres = xlsx::CellRef::parse_a1(&id).map_err(fout)?;
                d.edit_cell(
                    xlsx::SheetId(deel as u32),
                    adres,
                    &tekst,
                    xlsx::CalculationOptions::default(),
                )
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
            (Self::Notition(d), Bewerking::Tekst { id, tekst }) => {
                let veld = d
                    .pointer_mut(&id)
                    .ok_or_else(|| fout("Notitieveld bestaat niet"))?;
                if !veld.is_string() {
                    return Err(fout("Geen tekstveld"));
                }
                if tekst.len() > 500_000 {
                    return Err(fout("Notitietekst te lang"));
                }
                *veld = tekst.into();
            }
            _ => return Err(fout("Deze bewerking is niet beschikbaar")),
        }
        Ok(())
    }
    pub fn weergave(&self, deel: usize) -> Resultaat<Weergave> {
        let mut beeld = Weergave {
            module: Module::Writer,
            onderdelen: vec![],
            velden: vec![],
            afbeelding: None,
            melding: String::new(),
        };
        match self {
            Self::Writer(d) => {
                let (png, paginas, overgeslagen) =
                    crate::writer_beeld::pagina(&d.save().map_err(fout)?, deel)?;
                beeld.afbeelding = Some(png);
                beeld.onderdelen = (0..paginas).map(|i| format!("Pagina {}", i + 1)).collect();
                for (i, p) in d.paragraphs().into_iter().take(2000).enumerate() {
                    beeld.velden.push(Veld {
                        id: p.para_id.clone().unwrap_or_default(),
                        naam: format!("Alinea {}", i + 1),
                        tekst: docx::get_paragraph_text(p),
                        bewerkbaar: p.para_id.is_some() && crate::writer_tekst::ondersteund(p),
                    });
                }
                let woorden = d
                    .paragraphs()
                    .iter()
                    .map(|p| docx::get_paragraph_text(p).split_whitespace().count())
                    .sum::<usize>();
                beeld.melding = format!(
                    "{woorden} woorden · {} tabellen · {paginas} pagina’s · {overgeslagen} afbeeldingen overgeslagen",
                    d.tables().len()
                );
            }
            Self::Spreadsheet(d) => {
                beeld.module = Module::Spreadsheet;
                beeld.onderdelen = d.model().sheets.iter().map(|s| s.name.clone()).collect();
                let sheet = xlsx::SheetId(deel as u32);
                for rij in 0..30 {
                    for kolom in 0..12 {
                        let cel = xlsx::CellRef::new(rij, kolom);
                        let inhoud = d.cell(sheet, cel).map_err(fout)?;
                        beeld.velden.push(Veld {
                            id: cel.to_a1(),
                            naam: cel.to_a1(),
                            tekst: inhoud.input,
                            bewerkbaar: true,
                        });
                    }
                }
                let opties = xlsx::RenderOptions {
                    range: Some(xlsx::CellRange::new(
                        xlsx::CellRef::new(0, 0),
                        xlsx::CellRef::new(29, 11),
                    )),
                    max_width: Some(1600),
                    max_height: Some(1400),
                    ..Default::default()
                };
                beeld.afbeelding = Some(d.render_sheet(sheet, &opties).map_err(fout)?.bytes);
                beeld.melding = "Berekening en opslag in Rust · bereik A1:L30".into();
            }
            Self::Presentation(d) => {
                beeld.module = Module::Presentation;
                let deck = d.snapshot().map_err(fout)?;
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
                            });
                        }
                        verzamel(&shape.children, velden);
                    }
                }
                verzamel(&dia.shapes, &mut beeld.velden);
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
                beeld.onderdelen = vec!["Notitieboek".into()];
                fn vind(v: &serde_json::Value, pad: &str, velden: &mut Vec<Veld>) {
                    match v {
                        serde_json::Value::Object(map) => {
                            for (naam, waarde) in map {
                                let p = format!("{pad}/{naam}");
                                if matches!(naam.as_str(), "markdown" | "tekst" | "titel" | "naam")
                                {
                                    if let Some(t) = waarde.as_str() {
                                        velden.push(Veld {
                                            id: p.clone(),
                                            naam: naam.clone(),
                                            tekst: t.into(),
                                            bewerkbaar: true,
                                        });
                                    }
                                } else {
                                    vind(waarde, &p, velden);
                                }
                            }
                        }
                        serde_json::Value::Array(lijst) => {
                            for (i, waarde) in lijst.iter().enumerate() {
                                vind(waarde, &format!("{pad}/{i}"), velden);
                            }
                        }
                        _ => {}
                    }
                }
                vind(d, "", &mut beeld.velden);
                beeld.melding =
                    "Notitieboek versie 3 · bronvelden en canvasposities blijven bewaard".into();
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
                    });
                }
                beeld.melding = format!(
                    "{} bijlagen · volledige oorspronkelijke MIME-bron bewaard",
                    bericht.attachments().count()
                );
            }
        }
        Ok(beeld)
    }
}

/// Een mislukte bewerking herstelt de vorige volledige bron, ook na een enginepanic.
/// De interface ziet een fout en een bruikbaar document, nooit een half resultaat.
pub struct Sessie {
    pub module: Module,
    document: Document,
    bron: std::sync::Arc<Vec<u8>>,
    bron_hash: String,
    beelden: std::cell::RefCell<Vec<(usize, Weergave)>>,
    terug: Vec<std::sync::Arc<Vec<u8>>>,
    vooruit: Vec<std::sync::Arc<Vec<u8>>>,
}
impl Sessie {
    pub fn open(module: Module, bytes: Vec<u8>) -> Resultaat<Self> {
        Ok(Self {
            document: Document::open(module, &bytes)?,
            module,
            bron_hash: crate::opslag::hash(&bytes),
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
        let beeld = self.document.weergave(deel)?;
        let mut cache = self.beelden.borrow_mut();
        if cache.len() >= 3 {
            cache.remove(0);
        }
        cache.push((deel, beeld.clone()));
        Ok(beeld)
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
        let resultaat = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.document.bewerk(deel, bewerking)?;
            let beeld = self.document.weergave(deel)?;
            Ok((self.document.bytes()?, beeld))
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
