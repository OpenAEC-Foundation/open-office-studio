//! Export maakt een afzonderlijk bestand. De vastgelegde bron en selectie
//! blijven onafhankelijk van later typen, tabwissels en het conversieproces.
use super::*;
use iced::widget::{checkbox, column, pick_list, row};
use office_conversie::conversie::{ExportFormaat, Opties};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub enum Bericht {
    Formaat(ExportFormaat),
    Scheiding(&'static str),
    Codering(&'static str),
    Blad(String),
    Pdfa(&'static str),
    Bereik(String),
    Bladwijzers(bool),
    Opslaan,
    Annuleer,
}
pub struct Exportblad {
    module: Module,
    bron: Arc<Vec<u8>>,
    naam: String,
    origineel: Option<PathBuf>,
    formaten: Vec<ExportFormaat>,
    keuze: ExportFormaat,
    scheiding: &'static str,
    codering: &'static str,
    blad: String,
    pdfa: &'static str,
    bereik: String,
    bladwijzers: bool,
}
#[derive(Clone)]
pub struct Plan {
    module: Module,
    bron: Arc<Vec<u8>>,
    origineel: Option<PathBuf>,
    pub naam: String,
    pub formaat: ExportFormaat,
    opties: Opties,
}
impl std::fmt::Debug for Plan {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Exportplan")
            .field("module", &self.module)
            .field("formaat", &self.formaat.extensie)
            .finish_non_exhaustive()
    }
}
impl Plan {
    pub fn schrijf(self, pad: PathBuf) -> Result<PathBuf, String> {
        if !pad
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case(&self.formaat.extensie))
        {
            return Err(format!(
                "Kies .{} voor dit exportformaat",
                self.formaat.extensie
            ));
        }
        if self.origineel.as_ref().is_some_and(|oud| {
            oud == &pad || matches!((oud.canonicalize(),pad.canonicalize()),(Ok(a),Ok(b)) if a==b)
        }) {
            return Err("Kies een ander bestand voor de export".into());
        }
        // Het doel wordt vóór conversie gelezen. Een wijziging tijdens de
        // conversie mag bij de uiteindelijke atomaire bewaring niet verdwijnen.
        let verwacht = doelhash(&pad)?;
        let bytes = office_conversie::conversie::converteer_met(
            &self.bron,
            self.module.extensie(),
            &self.formaat.extensie,
            self.module.extensie(),
            &self.opties,
            None,
        )?;
        opslag::schrijf(&pad, &bytes, verwacht.as_deref()).map_err(|e| e.to_string())?;
        Ok(pad)
    }
}
impl Exportblad {
    pub fn nieuw(t: &Tab) -> Result<Self, String> {
        let a = t
            .antwoord
            .as_ref()
            .ok_or("Wacht tot het document is geopend")?;
        if t.bezig || t.schrijft || t.concept {
            return Err(
                "Pas de huidige invoer eerst toe en wacht tot het document gereed is".into(),
            );
        }
        let module = a.beeld.module;
        let formaten = office_conversie::conversie::exportformaten(module.extensie());
        let keuze = formaat_pdf(&formaten)
            .ok_or("Geen conversie-export voor deze module")?
            .clone();
        Ok(Self {
            module,
            bron: a.bron.clone(),
            naam: t.naam.clone(),
            origineel: t.pad.clone(),
            formaten,
            keuze,
            scheiding: "Puntkomma",
            codering: "UTF-8",
            blad: (t.deel + 1).to_string(),
            pdfa: "Gewone PDF",
            bereik: String::new(),
            bladwijzers: true,
        })
    }
    pub fn update(&mut self, m: Bericht) {
        match m {
            Bericht::Formaat(f) if self.formaten.contains(&f) => self.keuze = f,
            Bericht::Scheiding(v) => self.scheiding = v,
            Bericht::Codering(v) => self.codering = v,
            Bericht::Blad(v) => self.blad = v,
            Bericht::Pdfa(v) => self.pdfa = v,
            Bericht::Bereik(v) => self.bereik = v,
            Bericht::Bladwijzers(v) => self.bladwijzers = v,
            _ => {}
        }
    }
    pub fn plan(&self) -> Result<Plan, String> {
        let waarde = if matches!(self.keuze.extensie.as_str(), "csv" | "tsv") {
            let scheiding = if self.keuze.extensie == "tsv" {
                "tab"
            } else {
                match self.scheiding {
                    "Puntkomma" => ";",
                    "Komma" => ",",
                    "Tab" => "tab",
                    "Verticale streep" => "|",
                    _ => return Err("Ongeldig scheidingsteken".into()),
                }
            };
            let codering = match self.codering {
                "UTF-8" => "utf8",
                "UTF-8 met BOM" => "utf8-bom",
                "Windows-1252" => "windows-1252",
                _ => return Err("Ongeldige codering".into()),
            };
            let blad = self
                .blad
                .trim()
                .parse::<u32>()
                .map_err(|_| "Kies een geldig bladnummer")?;
            serde_json::json!({"scheidingsteken":scheiding,"codering":codering,"blad":blad})
        } else if self.keuze.extensie == "pdf" {
            let mut v = serde_json::json!({"bladwijzers":self.bladwijzers});
            let pdfa = match self.pdfa {
                "Gewone PDF" => None,
                "PDF/A-1b" => Some(1),
                "PDF/A-2b" => Some(2),
                "PDF/A-3b" => Some(3),
                _ => return Err("Ongeldige PDF-keuze".into()),
            };
            if let Some(p) = pdfa {
                v["pdfa"] = serde_json::json!(p);
            }
            if !self.bereik.trim().is_empty() {
                v["bereik"] = serde_json::json!(self.bereik.trim());
            }
            v
        } else {
            serde_json::json!({})
        };
        let opties = Opties::uit_json(&waarde.to_string())?;
        let naam = PathBuf::from(&self.naam)
            .with_extension(&self.keuze.extensie)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        Ok(Plan {
            module: self.module,
            bron: self.bron.clone(),
            origineel: self.origineel.clone(),
            naam,
            formaat: self.keuze.clone(),
            opties,
        })
    }
    pub fn view(&self, l: Look) -> Element<'_, Bericht> {
        let keuze = openaec_ui::design::a11y::named(
            pick_list(
                self.formaten.as_slice(),
                Some(self.keuze.clone()),
                Bericht::Formaat,
            )
            .width(Length::Fill),
            openaec_ui::design::a11y::Role::ComboBox,
            "Exportformaat",
        );
        let mut velden = column![
            w::body(l, "Bestandsformaat"),
            keuze,
            w::secondary(l, &self.keuze.behoud)
        ]
        .spacing(10);
        if matches!(self.keuze.extensie.as_str(), "csv" | "tsv") {
            let lijst = |label: &'static str,
                         opties: Vec<&'static str>,
                         waarde,
                         bericht: fn(&'static str) -> Bericht| {
                column![
                    w::body(l, label),
                    openaec_ui::design::a11y::named(
                        pick_list(opties, Some(waarde), bericht).width(Length::Fill),
                        openaec_ui::design::a11y::Role::ComboBox,
                        label
                    )
                ]
                .spacing(6)
            };
            let scheiding: Element<_> = if self.keuze.extensie == "tsv" {
                column![w::body(l, "Scheidingsteken"), w::secondary(l, "Tab")]
                    .spacing(6)
                    .into()
            } else {
                lijst(
                    "Scheidingsteken",
                    vec!["Puntkomma", "Komma", "Tab", "Verticale streep"],
                    self.scheiding,
                    Bericht::Scheiding,
                )
                .into()
            };
            velden = velden.push(
                row![
                    scheiding,
                    lijst(
                        "Codering",
                        vec!["UTF-8", "UTF-8 met BOM", "Windows-1252"],
                        self.codering,
                        Bericht::Codering
                    )
                ]
                .spacing(14),
            );
            velden = velden.push(
                column![
                    w::body(l, "Bladnummer"),
                    openaec_ui::design::a11y::named(
                        text_input("1", &self.blad).on_input(Bericht::Blad),
                        openaec_ui::design::a11y::Role::TextField,
                        "Bladnummer"
                    )
                ]
                .spacing(6),
            );
        }
        if self.keuze.extensie == "pdf" {
            velden = velden.push(
                column![
                    w::body(l, "PDF-versie"),
                    openaec_ui::design::a11y::named(
                        pick_list(
                            vec!["Gewone PDF", "PDF/A-1b", "PDF/A-2b", "PDF/A-3b"],
                            Some(self.pdfa),
                            Bericht::Pdfa
                        )
                        .width(Length::Fill),
                        openaec_ui::design::a11y::Role::ComboBox,
                        "PDF-versie"
                    )
                ]
                .spacing(6),
            );
            velden = velden.push(
                column![
                    w::body(l, "Paginabereik (leeg is alles)"),
                    openaec_ui::design::a11y::named(
                        text_input("1-3,5", &self.bereik).on_input(Bericht::Bereik),
                        openaec_ui::design::a11y::Role::TextField,
                        "Paginabereik"
                    )
                ]
                .spacing(6),
            );
            velden = velden.push(openaec_ui::design::a11y::named(
                checkbox(self.bladwijzers)
                    .label("Bladwijzers meenemen")
                    .on_toggle(Bericht::Bladwijzers),
                openaec_ui::design::a11y::Role::CheckBox,
                "Bladwijzers meenemen",
            ));
        }
        velden = velden.push(w::secondary(
            l,
            "Gebruikt de geïnstalleerde kantoorruntime.",
        ));
        w::dialog(
            l,
            "Document exporteren",
            icoon(Icon::Close),
            Some(Bericht::Annuleer),
            velden.into(),
            None,
            vec![
                w::button(
                    l,
                    "Annuleren",
                    K::Quiet,
                    D::Regular,
                    None,
                    Some(Bericht::Annuleer),
                ),
                w::button(
                    l,
                    "Exporteren…",
                    K::Primary,
                    D::Regular,
                    Some(icoon(Icon::Export)),
                    self.plan().is_ok().then_some(Bericht::Opslaan),
                ),
            ],
            false,
        )
    }
}
fn formaat_pdf(formats: &[ExportFormaat]) -> Option<&ExportFormaat> {
    formats
        .iter()
        .find(|f| f.extensie == "pdf")
        .or_else(|| formats.first())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn blad(module: Module) -> (App, Exportblad) {
        let bytes = match module {
            Module::Writer => {
                include_bytes!("../../office-core/tests/fixtures/writer.docx").as_slice()
            }
            Module::Spreadsheet => {
                include_bytes!("../../office-core/tests/fixtures/spreadsheet.xlsx").as_slice()
            }
            _ => unreachable!(),
        };
        let app = crate::tests::app_met_document(module, bytes);
        let b = Exportblad::nieuw(app.tab().unwrap()).unwrap();
        (app, b)
    }
    #[test]
    fn csv_en_pdf_opties_worden_strikt_gecontroleerd() {
        let (_, mut b) = blad(Module::Spreadsheet);
        let csv = b
            .formaten
            .iter()
            .find(|f| f.extensie == "csv")
            .unwrap()
            .clone();
        b.update(Bericht::Formaat(csv));
        b.update(Bericht::Scheiding("Komma"));
        b.update(Bericht::Codering("UTF-8 met BOM"));
        b.update(Bericht::Blad("2".into()));
        let p = b.plan().unwrap();
        assert_eq!(p.opties.scheidingsteken, Some(','));
        assert_eq!(p.opties.blad, Some(2));
        assert_eq!(p.opties.codering.as_deref(), Some("utf8-bom"));
        b.update(Bericht::Blad("0".into()));
        assert!(b.plan().is_err());
        b.update(Bericht::Formaat(
            b.formaten
                .iter()
                .find(|f| f.extensie == "tsv")
                .unwrap()
                .clone(),
        ));
        b.update(Bericht::Blad("1".into()));
        assert_eq!(b.plan().unwrap().opties.scheidingsteken, Some('\t'));
        b.update(Bericht::Formaat(
            b.formaten
                .iter()
                .find(|f| f.extensie == "pdf")
                .unwrap()
                .clone(),
        ));
        b.update(Bericht::Pdfa("PDF/A-2b"));
        b.update(Bericht::Bereik("1-3,5".into()));
        let p = b.plan().unwrap();
        assert_eq!(p.opties.pdfa, Some(2));
        assert_eq!(p.opties.bereik.as_deref(), Some("1-3,5"));
        b.update(Bericht::Bereik("$(onjuist)".into()));
        assert!(b.plan().is_err());
    }
    #[test]
    fn export_legde_bron_vast_en_weigert_eigen_pad_of_andere_extensie() {
        let (mut app, mut b) = blad(Module::Writer);
        let pad = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../office-core/tests/fixtures/writer.docx");
        b.origineel = Some(pad.clone());
        let p = b.plan().unwrap();
        let bron = p.bron.clone();
        app.tab_mut().unwrap().antwoord.as_mut().unwrap().bron = Arc::new(vec![1, 2, 3]);
        assert_ne!(*bron, *app.tab().unwrap().antwoord.as_ref().unwrap().bron);
        assert!(p.clone().schrijf(pad).unwrap_err().contains(".pdf"));
        let mut eigen = p.clone();
        eigen.formaat.extensie = "docx".into();
        assert!(
            eigen
                .schrijf(b.origineel.clone().unwrap())
                .unwrap_err()
                .contains("ander bestand")
        );
        let map = std::env::temp_dir().join("native-export-ongeldige-extensie.exe");
        assert!(p.schrijf(map).is_err());
    }
}
