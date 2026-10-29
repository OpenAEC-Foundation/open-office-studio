//! Werkbestanden: het pad achter een geopend tabblad blijft aan Rust-zijde.
//!
//! Bij openen (bestandskiezer, bestandskoppeling, recente bestanden, slepen)
//! krijgt het pad een willekeurig **pad-token** dat aan het venster van het
//! tabblad gebonden is. De webview kent alleen de bestandsnaam en het token;
//! een token van een ander venster werkt niet. Bij Ctrl+S schrijft Rust
//! atomair (`schrijf_atomair`) naar hetzelfde pad, maar alleen als:
//!
//! - het formaat van de bytes gelijk is aan de extensie van het pad. Voor het
//!   eigen formaat (DOCX/XLSX/PPTX) is dat direct zo. Een geïmporteerd ODT, DOC
//!   enz. schrijft alleen terug als de webview de bytes eerst via de
//!   kantoorruntime in dat formaat heeft omgezet, na een eenmalige bevestiging
//!   met de verliesmelding (zie `src/werkbestand.ts`); zonder runtime of na
//!   weigeren volgt Opslaan als;
//! - het bestand sinds openen of het laatste opslaan niet buiten de app is
//!   gewijzigd (grootte, wijzigingstijd en SHA-256); anders vraagt Rust eerst;
//! - het bestand en de map beschrijfbaar zijn; anders volgt Opslaan als.
//!
//! Bij een losgemaakt venster verhuist het token mee (`herbind`, vanuit
//! `vensters::bevestig_overdracht`); sluit een venster, dan vervallen zijn tokens.
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};

/// Eigen bewerkbare formaten: alleen daarin schrijft Ctrl+S terug.
pub const EIGEN: [&str; 3] = ["docx", "xlsx", "pptx"];
/// Macroformaten die de webview zelf schrijft (met het VBA-project van het
/// geopende origineel, `src/import/macros.ts`); na Opslaan als blijven ze
/// het werkbestand, net als het eigen formaat.
pub const MACRO: [&str; 3] = ["docm", "xlsm", "pptm"];

#[derive(Clone, Debug, PartialEq)]
pub struct Stempel {
    grootte: u64,
    gewijzigd: Option<SystemTime>,
    hash: Vec<u8>,
}

struct Koppeling {
    pad: PathBuf,
    venster: String,
    /// Stand van het bestand bij het laatste lezen of schrijven.
    stempel: Option<Stempel>,
}

#[derive(Default)]
pub struct Werkbestanden {
    koppelingen: Mutex<HashMap<String, Koppeling>>,
}

#[derive(Debug, PartialEq)]
pub enum Toestand {
    Ongewijzigd,
    ExternGewijzigd,
    Ontbreekt,
}

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum Schrijfuitkomst {
    Opgeslagen { naam: String, pad: String },
    ExternGewijzigd,
    Ontbreekt,
    AlleenLezen,
    AnderFormaat,
}

/// Andere bewerkbare formaten waarin de runtime kan terugschrijven.
fn mag_terugschrijven(ext: &str) -> bool {
    !matches!(ext, "pdf" | "png" | "svg" | "html" | "htm" | "txt" | "csv" | "tsv" | "md")
        && crate::conversie::mag_bewaren(ext)
}

pub fn hash(bytes: &[u8]) -> Vec<u8> {
    ring::digest::digest(&ring::digest::SHA256, bytes)
        .as_ref()
        .to_vec()
}

fn stempel_van(pad: &Path, bytes: &[u8]) -> Option<Stempel> {
    let meta = std::fs::metadata(pad).ok()?;
    Some(Stempel {
        grootte: meta.len(),
        gewijzigd: meta.modified().ok(),
        hash: hash(bytes),
    })
}

/// Vergelijkt de huidige stand met de stempel; bij gelijke grootte maar
/// andere tijd beslist de inhoud (een `touch` is geen wijziging).
pub fn controleer(pad: &Path, stempel: &Stempel) -> Toestand {
    let Ok(meta) = std::fs::metadata(pad) else {
        return Toestand::Ontbreekt;
    };
    if meta.len() != stempel.grootte {
        return Toestand::ExternGewijzigd;
    }
    if meta.modified().ok() == stempel.gewijzigd {
        return Toestand::Ongewijzigd;
    }
    match std::fs::read(pad) {
        Ok(bytes) if hash(&bytes) == stempel.hash => Toestand::Ongewijzigd,
        Ok(_) => Toestand::ExternGewijzigd,
        Err(_) => Toestand::Ontbreekt,
    }
}

fn zelfde_pad(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

pub fn extensie(pad: &Path) -> String {
    pad.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
}

pub fn bestandsnaam(pad: &Path) -> String {
    pad.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn is_alleen_lezen(fout: &str) -> bool {
    let fout = fout.to_lowercase();
    fout.contains("permission denied")
        || fout.contains("access is denied")
        || fout.contains("toegang geweigerd")
        || fout.contains("read-only")
        || fout.contains("os error 5)")
        || fout.contains("os error 13)")
        || fout.contains("os error 30)")
}

impl Werkbestanden {
    /// Nieuw token voor een pad, gebonden aan het venster.
    pub fn registreer(&self, pad: PathBuf, venster: &str) -> String {
        let token = uuid::Uuid::new_v4().simple().to_string();
        if let Ok(mut k) = self.koppelingen.lock() {
            k.insert(
                token.clone(),
                Koppeling {
                    pad,
                    venster: venster.to_owned(),
                    stempel: None,
                },
            );
        }
        token
    }

    /// Het token en venster van een al geopend werkbestand met dit pad.
    pub fn zoek_pad(&self, pad: &Path) -> Option<(String, String)> {
        let k = self.koppelingen.lock().ok()?;
        k.iter()
            .find(|(_, v)| zelfde_pad(&v.pad, pad))
            .map(|(t, v)| (t.clone(), v.venster.clone()))
    }

    pub fn pad(&self, token: &str, venster: &str) -> Option<PathBuf> {
        let k = self.koppelingen.lock().ok()?;
        k.get(token)
            .filter(|v| v.venster == venster)
            .map(|v| v.pad.clone())
    }

    /// Leest het bestand (hooguit 100 MB) en onthoudt de stand.
    pub fn lees(&self, token: &str, venster: &str) -> Result<Vec<u8>, String> {
        let pad = self
            .pad(token, venster)
            .ok_or_else(|| crate::taal::t("errors.file.notThisWindow"))?;
        let bytes = crate::systeembestanden::lees_beperkt(&pad)?;
        let stempel = stempel_van(&pad, &bytes);
        if let Ok(mut k) = self.koppelingen.lock() {
            if let Some(v) = k.get_mut(token) {
                v.stempel = stempel;
            }
        }
        Ok(bytes)
    }

    /// Schrijft terug naar het pad van het token. `ext` is het formaat van de
    /// bytes; `forceer` slaat de controle op externe wijzigingen over.
    pub fn schrijf(
        &self,
        token: &str,
        venster: &str,
        ext: &str,
        bytes: &[u8],
        forceer: bool,
    ) -> Result<Schrijfuitkomst, String> {
        let (pad, stempel) = {
            let k = self.koppelingen.lock().map_err(|e| e.to_string())?;
            let v = k
                .get(token)
                .filter(|v| v.venster == venster)
                .ok_or_else(|| crate::taal::t("errors.file.notLinked"))?;
            (v.pad.clone(), v.stempel.clone())
        };
        let ext = ext.to_lowercase();
        if extensie(&pad) != ext || !(EIGEN.contains(&ext.as_str()) || mag_terugschrijven(&ext)) {
            return Ok(Schrijfuitkomst::AnderFormaat);
        }
        if !forceer {
            match stempel.as_ref().map(|s| controleer(&pad, s)) {
                Some(Toestand::ExternGewijzigd) => return Ok(Schrijfuitkomst::ExternGewijzigd),
                Some(Toestand::Ontbreekt) => return Ok(Schrijfuitkomst::Ontbreekt),
                None if !pad.exists() => return Ok(Schrijfuitkomst::Ontbreekt),
                _ => {}
            }
        }
        if std::fs::metadata(&pad).is_ok_and(|m| m.permissions().readonly()) {
            return Ok(Schrijfuitkomst::AlleenLezen);
        }
        if let Err(fout) = crate::schrijf_atomair(&pad, bytes) {
            if is_alleen_lezen(&fout) {
                return Ok(Schrijfuitkomst::AlleenLezen);
            }
            return Err(fout);
        }
        let stempel = stempel_van(&pad, bytes);
        if let Ok(mut k) = self.koppelingen.lock() {
            if let Some(v) = k.get_mut(token) {
                v.stempel = stempel;
            }
        }
        Ok(Schrijfuitkomst::Opgeslagen {
            naam: bestandsnaam(&pad),
            pad: pad.to_string_lossy().into_owned(),
        })
    }

    /// Een nieuw geschreven bestand (Opslaan als) als werkbestand registreren.
    pub fn registreer_geschreven(&self, pad: PathBuf, venster: &str, bytes: &[u8]) -> String {
        let stempel = stempel_van(&pad, bytes);
        let token = self.registreer(pad, venster);
        if let Ok(mut k) = self.koppelingen.lock() {
            if let Some(v) = k.get_mut(&token) {
                v.stempel = stempel;
            }
        }
        token
    }

    /// Verhuist een token naar een ander venster (losgemaakt tabblad).
    pub fn herbind(&self, token: &str, venster: &str) -> bool {
        let Ok(mut k) = self.koppelingen.lock() else {
            return false;
        };
        match k.get_mut(token) {
            Some(v) => {
                v.venster = venster.to_owned();
                true
            }
            None => false,
        }
    }

    /// Vergeet een token, maar alleen vanuit het venster dat het bezit.
    pub fn vergeet(&self, token: &str, venster: &str) -> bool {
        let Ok(mut k) = self.koppelingen.lock() else {
            return false;
        };
        if k.get(token).is_some_and(|v| v.venster == venster) {
            k.remove(token);
            return true;
        }
        false
    }

    pub fn vergeet_venster(&self, venster: &str) {
        if let Ok(mut k) = self.koppelingen.lock() {
            k.retain(|_, v| v.venster != venster);
        }
    }
}

/* ── Opdrachten ── */

fn kop(request: &tauri::ipc::Request<'_>, naam: &str) -> Option<String> {
    let waarde = request.headers().get(naam)?.to_str().ok()?;
    percent_encoding::percent_decode_str(waarde)
        .decode_utf8()
        .ok()
        .map(|s| s.into_owned())
}

/// Ctrl+S: schrijft het document terug naar zijn eigen pad.
///
/// Kopteksten: `x-office-token`, `x-office-ext` (formaat van de bytes).
/// Bij een externe wijziging of een verdwenen bestand vraagt Rust eerst:
/// Overschrijven, Opslaan als… of Annuleren.
#[tauri::command]
pub async fn bewaar_document(
    app: tauri::AppHandle,
    venster: tauri::Window,
    request: tauri::ipc::Request<'_>,
) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let token = kop(&request, "x-office-token").ok_or_else(|| crate::taal::t("errors.file.tokenMissing"))?;
    let ext = kop(&request, "x-office-ext").ok_or_else(|| crate::taal::t("errors.file.formatMissing"))?;
    let bytes = crate::lees_binaire_inhoud(request.body(), false)?;
    let label = venster.label().to_owned();
    let schrijf = |forceer: bool, bytes: Vec<u8>| {
        let app = app.clone();
        let token = token.clone();
        let label = label.clone();
        let ext = ext.clone();
        tauri::async_runtime::spawn_blocking(move || {
            app.state::<Werkbestanden>()
                .schrijf(&token, &label, &ext, &bytes, forceer)
        })
    };
    let mut uitkomst = schrijf(false, bytes.clone())
        .await
        .map_err(|e| e.to_string())??;
    if matches!(
        uitkomst,
        Schrijfuitkomst::ExternGewijzigd | Schrijfuitkomst::Ontbreekt
    ) {
        let naam = app
            .state::<Werkbestanden>()
            .pad(&token, &label)
            .map(|p| bestandsnaam(&p))
            .unwrap_or_default();
        let sleutel = if uitkomst == Schrijfuitkomst::Ontbreekt {
            "dialogs.fileChanged.missing"
        } else {
            "dialogs.fileChanged.changedExternally"
        };
        let tekst = crate::taal::t_met(sleutel, &[("name", &naam)]);
        let overschrijven = crate::taal::t("dialogs.fileChanged.overwrite");
        let opslaan_als = crate::taal::t("dialogs.saveAsEllipsis");
        let keuze = rfd::AsyncMessageDialog::new()
            .set_title(crate::taal::t("dialogs.fileChanged.title"))
            .set_description(tekst)
            .set_level(rfd::MessageLevel::Warning)
            .set_buttons(rfd::MessageButtons::YesNoCancelCustom(
                overschrijven.clone(),
                opslaan_als.clone(),
                crate::taal::t("dialogs.cancel"),
            ))
            .show()
            .await;
        match keuze {
            rfd::MessageDialogResult::Custom(k) if k == overschrijven => {
                uitkomst = schrijf(true, bytes).await.map_err(|e| e.to_string())??;
            }
            rfd::MessageDialogResult::Yes => {
                uitkomst = schrijf(true, bytes).await.map_err(|e| e.to_string())??;
            }
            rfd::MessageDialogResult::Custom(k) if k == opslaan_als => {
                return Ok(serde_json::json!({ "status": "opslaan-als" }));
            }
            rfd::MessageDialogResult::No => {
                return Ok(serde_json::json!({ "status": "opslaan-als" }));
            }
            _ => return Ok(serde_json::json!({ "status": "geannuleerd" })),
        }
    }
    if let Schrijfuitkomst::Opgeslagen { .. } = &uitkomst {
        if let Some(pad) = app.state::<Werkbestanden>().pad(&token, &label) {
            crate::recent::noteer(&app, &pad);
        }
    }
    serde_json::to_value(uitkomst).map_err(|e| e.to_string())
}

/// Opslaan als: native dialoog. In het eigen formaat wordt het gekozen pad het
/// nieuwe werkbestand van het tabblad (nieuw token, het oude vervalt); andere
/// formaten zijn een export en krijgen geen token.
///
/// Kopteksten: `x-office-naam` (voorgestelde naam met extensie), optioneel
/// `x-office-token` (huidig token van het tabblad).
#[tauri::command]
pub async fn bewaar_als(
    app: tauri::AppHandle,
    venster: tauri::Window,
    request: tauri::ipc::Request<'_>,
) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let (bestandsnaam, ext) = crate::bewaarnaam(&request)?;
    let bytes = crate::lees_binaire_inhoud(request.body(), ext == "md")?;
    let oud = kop(&request, "x-office-token");
    let label = venster.label().to_owned();
    let Some(pad) = crate::kies_opslagpad(&crate::taal::t("dialogs.saveAs"), &bestandsnaam, &ext).await? else {
        return Ok(serde_json::json!({ "status": "geannuleerd" }));
    };
    let werkbestanden = app.state::<Werkbestanden>();
    if let Some((token, _)) = werkbestanden.zoek_pad(&pad) {
        if Some(&token) != oud.as_ref() {
            return Err(crate::taal::t_met(
                "errors.file.openInOtherTab",
                &[("name", &bestandsnaam_van(&pad))],
            ));
        }
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(fout) = crate::schrijf_atomair(&pad, &bytes) {
            return Err(if is_alleen_lezen(&fout) {
                crate::taal::t_met("errors.file.readOnly", &[("path", &pad.display().to_string())])
            } else {
                fout
            });
        }
        crate::recent::noteer(&app2, &pad);
        let werkbestanden = app2.state::<Werkbestanden>();
        let token = (EIGEN.contains(&ext.as_str()) || MACRO.contains(&ext.as_str())).then(|| {
            if let Some(oud) = &oud {
                werkbestanden.vergeet(oud, &label);
            }
            werkbestanden.registreer_geschreven(pad.clone(), &label, &bytes)
        });
        Ok(serde_json::json!({
            "status": "opgeslagen",
            "naam": bestandsnaam_van(&pad),
            "pad": pad.to_string_lossy(),
            "token": token,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn bestandsnaam_van(pad: &Path) -> String {
    bestandsnaam(pad)
}

/// Tokens van een gesloten venster vervallen.
pub fn bij_venstergebeurtenis<R: tauri::Runtime>(
    venster: &tauri::Window<R>,
    gebeurtenis: &tauri::WindowEvent,
) {
    use tauri::Manager;
    if let tauri::WindowEvent::Destroyed = gebeurtenis {
        venster
            .state::<Werkbestanden>()
            .vergeet_venster(venster.label());
    }
}

/// Eenmalige vraag vóór terugschrijven in een niet-eigen formaat (ODT, DOC, …).
#[tauri::command]
pub async fn bevestig_formaat(naam: String, melding: Option<String>) -> String {
    let naam: String = naam.chars().take(200).collect();
    let ext = extensie(Path::new(&naam)).to_uppercase();
    let mut tekst = crate::taal::t_met(
        "dialogs.foreignFormat.message",
        &[("name", &naam), ("format", &ext)],
    );
    if let Some(melding) = melding.filter(|m| !m.trim().is_empty()) {
        tekst.push_str("\n\n");
        tekst.extend(melding.chars().take(1000));
    }
    tekst.push_str("\n\n");
    tekst.push_str(&crate::taal::t("dialogs.foreignFormat.hint"));
    let bijwerken = crate::taal::t_met("dialogs.foreignFormat.update", &[("format", &ext)]);
    let opslaan_als = crate::taal::t("dialogs.saveAsEllipsis");
    let keuze = rfd::AsyncMessageDialog::new()
        .set_title(crate::taal::t_met("dialogs.foreignFormat.title", &[("format", &ext)]))
        .set_description(tekst)
        .set_level(rfd::MessageLevel::Warning)
        .set_buttons(rfd::MessageButtons::YesNoCancelCustom(
            bijwerken.clone(),
            opslaan_als.clone(),
            crate::taal::t("dialogs.cancel"),
        ))
        .show()
        .await;
    match keuze {
        rfd::MessageDialogResult::Yes => "ja",
        rfd::MessageDialogResult::Custom(k) if k == bijwerken => "ja",
        rfd::MessageDialogResult::No => "opslaan-als",
        rfd::MessageDialogResult::Custom(k) if k == opslaan_als => "opslaan-als",
        _ => "annuleren",
    }
    .into()
}

/// Vergeet het token van een gesloten tabblad.
#[tauri::command]
pub fn vergeet_werkbestand(
    venster: tauri::Window,
    staat: tauri::State<Werkbestanden>,
    token: String,
) -> bool {
    staat.vergeet(&token, venster.label())
}

/// Native bestandskiezer; de gekozen paden gaan via de route van de systeembestanden.
#[tauri::command]
pub async fn kies_bestanden(
    app: tauri::AppHandle,
    venster: tauri::Window,
    extensies: Vec<String>,
) -> Result<usize, String> {
    let extensies: Vec<String> = extensies
        .into_iter()
        .map(|e| e.trim_start_matches('.').to_lowercase())
        .filter(|e| !e.is_empty() && e.len() <= 12 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .take(80)
        .collect();
    let mut dialoog = rfd::AsyncFileDialog::new().set_title(crate::taal::t("dialogs.openFile"));
    if !extensies.is_empty() {
        dialoog = dialoog.add_filter(crate::taal::t("dialogs.officeFiles"), &extensies);
    }
    let Some(bestanden) = dialoog.pick_files().await else {
        return Ok(0);
    };
    let paden: Vec<PathBuf> = bestanden
        .into_iter()
        .map(|b| b.path().to_path_buf())
        .filter(|p| p.is_file())
        .collect();
    Ok(crate::systeembestanden::ontvang_in(
        &app,
        venster.label(),
        paden,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bestand(map: &Path, naam: &str, inhoud: &[u8]) -> PathBuf {
        let pad = map.join(naam);
        std::fs::write(&pad, inhoud).unwrap();
        pad
    }

    #[test]
    fn token_hoort_bij_het_venster() {
        let map = tempfile::tempdir().unwrap();
        let pad = bestand(map.path(), "a.docx", b"PK oud");
        let w = Werkbestanden::default();
        let token = w.registreer(pad.clone(), "main");
        assert_eq!(token.len(), 32);
        assert!(w.lees(&token, "document-2").is_err());
        assert_eq!(w.lees(&token, "main").unwrap(), b"PK oud");
        assert!(w
            .schrijf(&token, "document-2", "docx", b"PK nieuw", false)
            .is_err());
        assert!(!w.vergeet(&token, "document-2"));
        assert!(w.herbind(&token, "document-2"));
        assert!(w.pad(&token, "main").is_none());
        assert_eq!(w.pad(&token, "document-2"), Some(pad));
        w.vergeet_venster("document-2");
        assert!(w.pad(&token, "document-2").is_none());
    }

    #[test]
    fn schrijft_atomair_terug_naar_hetzelfde_pad() {
        let map = tempfile::tempdir().unwrap();
        let pad = bestand(map.path(), "verslag.docx", b"PK oud en lang");
        let w = Werkbestanden::default();
        let token = w.registreer(pad.clone(), "main");
        w.lees(&token, "main").unwrap();
        let uitkomst = w.schrijf(&token, "main", "docx", b"PK nieuw", false).unwrap();
        assert!(matches!(uitkomst, Schrijfuitkomst::Opgeslagen { ref naam, .. } if naam == "verslag.docx"));
        assert_eq!(std::fs::read(&pad).unwrap(), b"PK nieuw");
        assert_eq!(std::fs::read_dir(map.path()).unwrap().count(), 1);
        // Opnieuw opslaan na eigen schrijven is geen externe wijziging.
        assert!(matches!(
            w.schrijf(&token, "main", "docx", b"PK derde", false).unwrap(),
            Schrijfuitkomst::Opgeslagen { .. }
        ));
    }

    #[test]
    fn externe_wijziging_wordt_herkend() {
        let map = tempfile::tempdir().unwrap();
        let pad = bestand(map.path(), "begroting.xlsx", b"PK origineel");
        let w = Werkbestanden::default();
        let token = w.registreer(pad.clone(), "main");
        w.lees(&token, "main").unwrap();
        std::fs::write(&pad, b"PK door iemand anders").unwrap();
        assert_eq!(
            w.schrijf(&token, "main", "xlsx", b"PK mijn versie", false)
                .unwrap(),
            Schrijfuitkomst::ExternGewijzigd
        );
        assert_eq!(std::fs::read(&pad).unwrap(), b"PK door iemand anders");
        // Bewust overschrijven mag.
        assert!(matches!(
            w.schrijf(&token, "main", "xlsx", b"PK mijn versie", true)
                .unwrap(),
            Schrijfuitkomst::Opgeslagen { .. }
        ));
        std::fs::remove_file(&pad).unwrap();
        assert_eq!(
            w.schrijf(&token, "main", "xlsx", b"PK", false).unwrap(),
            Schrijfuitkomst::Ontbreekt
        );
    }

    #[test]
    fn alleen_inhoud_telt_bij_gelijke_grootte() {
        let map = tempfile::tempdir().unwrap();
        let pad = bestand(map.path(), "a.pptx", b"PK1234");
        let stempel = Stempel {
            grootte: 6,
            gewijzigd: None,
            hash: hash(b"PK1234"),
        };
        assert_eq!(controleer(&pad, &stempel), Toestand::Ongewijzigd);
        std::fs::write(&pad, b"PK9999").unwrap();
        assert_eq!(controleer(&pad, &stempel), Toestand::ExternGewijzigd);
    }

    #[test]
    fn geimporteerd_formaat_alleen_in_het_eigen_formaat_van_het_pad() {
        let map = tempfile::tempdir().unwrap();
        let pad = bestand(map.path(), "notitie.odt", b"PK odt");
        let w = Werkbestanden::default();
        let token = w.registreer(pad.clone(), "main");
        w.lees(&token, "main").unwrap();
        // DOCX-bytes nooit in een .odt-bestand.
        assert_eq!(
            w.schrijf(&token, "main", "docx", b"PK docx", false).unwrap(),
            Schrijfuitkomst::AnderFormaat
        );
        assert_eq!(std::fs::read(&pad).unwrap(), b"PK odt");
        // Door de runtime omgezette ODT-bytes wel.
        assert!(matches!(
            w.schrijf(&token, "main", "odt", b"PK odt nieuw", false).unwrap(),
            Schrijfuitkomst::Opgeslagen { .. }
        ));
        assert_eq!(std::fs::read(&pad).unwrap(), b"PK odt nieuw");
        // Een export (PDF) schrijft nooit terug.
        let pdf = bestand(map.path(), "a.pdf", b"%PDF");
        let token = w.registreer(pdf.clone(), "main");
        assert_eq!(
            w.schrijf(&token, "main", "pdf", b"%PDF-nieuw", false).unwrap(),
            Schrijfuitkomst::AnderFormaat
        );
    }

    #[test]
    fn alleen_lezen_biedt_opslaan_als() {
        let map = tempfile::tempdir().unwrap();
        let pad = bestand(map.path(), "vast.docx", b"PK vast");
        let mut rechten = std::fs::metadata(&pad).unwrap().permissions();
        rechten.set_readonly(true);
        std::fs::set_permissions(&pad, rechten).unwrap();
        let w = Werkbestanden::default();
        let token = w.registreer(pad.clone(), "main");
        w.lees(&token, "main").unwrap();
        assert_eq!(
            w.schrijf(&token, "main", "docx", b"PK nieuw", false).unwrap(),
            Schrijfuitkomst::AlleenLezen
        );
        assert_eq!(std::fs::read(&pad).unwrap(), b"PK vast");
        let mut rechten = std::fs::metadata(&pad).unwrap().permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        rechten.set_readonly(false);
        std::fs::set_permissions(&pad, rechten).unwrap();
    }

    #[test]
    fn zelfde_bestand_wordt_herkend_op_pad() {
        let map = tempfile::tempdir().unwrap();
        let pad = bestand(map.path(), "a.docx", b"PK");
        let w = Werkbestanden::default();
        let token = w.registreer(pad.clone(), "document-4");
        let omweg = map.path().join(".").join("a.docx");
        assert_eq!(w.zoek_pad(&omweg), Some((token, "document-4".into())));
        assert_eq!(w.zoek_pad(&map.path().join("b.docx")), None);
    }
}
