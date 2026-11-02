//! Bestanden die het besturingssysteem meegeeft (bestandskoppeling, "Openen met").
//!
//! - Bij het starten staan ze in de opstartargumenten.
//! - Draait de app al, dan start Windows/Linux een tweede instantie; de
//!   single-instance-plugin geeft haar argumenten door aan de eerste en de
//!   tweede stopt meteen.
//! - Op macOS komen ze binnen als `RunEvent::Opened`.
//!
//! - Bestanden uit de eigen bestandskiezer, de lijst met recente bestanden en
//!   bestanden die op een venster worden gesleept, nemen dezelfde route.
//!
//! Elk pad krijgt een eenmalig nummer en een doelvenster. Dat venster haalt de
//! lijst op (`systeembestanden`) en claimt elk nummer precies één keer
//! (`claim_systeembestand`). Staat hetzelfde bestand al open, dan komt het
//! bestaande tabblad naar voren (ook in een ander venster); anders krijgt het
//! een pad-token (`werkbestanden.rs`) en leest het venster de inhoud met
//! `lees_werkbestand`. De webview kan zo alleen bestanden lezen die het
//! besturingssysteem of de gebruiker zelf heeft aangewezen, nooit een
//! willekeurig pad.
//!
//! Doelvenster: het hoofdvenster ("main"). Is dat gesloten terwijl losgemaakte
//! documentvensters nog openstaan, dan het laatst actieve venster. Zo landt een
//! dubbelklik voorspelbaar in één vast venster, en nooit in een venster dat al
//! weg is; wachtende bestanden van een venster dat sluit, verhuizen mee.
use std::{
    collections::BTreeMap,
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};

const HOOFDVENSTER: &str = "main";
/// Gebeurtenis voor het doelvenster: er staan nieuwe bestanden klaar.
const GEBEURTENIS: &str = "office-systeembestanden";
/// Gebeurtenis voor een venster: activeer het tabblad met dit pad-token.
pub const ACTIVEER: &str = "office-activeer-werkbestand";
const MAX_GROOTTE: u64 = 100 * 1024 * 1024;

struct Wachtend {
    pad: PathBuf,
    venster: String,
}

#[derive(Default)]
pub struct Systeembestanden {
    wachtrij: Mutex<BTreeMap<u64, Wachtend>>,
    teller: AtomicU64,
    laatst_actief: Mutex<Option<String>>,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Aangeboden {
    id: u64,
    naam: String,
}

impl Systeembestanden {
    /// Bestanden uit de opstartargumenten; ze gaan naar het hoofdvenster.
    pub fn bij_start(argumenten: impl Iterator<Item = OsString>) -> Self {
        let staat = Self::default();
        staat.voeg_toe(startpaden(argumenten, None), HOOFDVENSTER);
        staat
    }

    pub(crate) fn voeg_toe(&self, paden: Vec<PathBuf>, venster: &str) -> usize {
        let Ok(mut wachtrij) = self.wachtrij.lock() else {
            return 0;
        };
        let aantal = paden.len();
        for pad in paden {
            let id = self.teller.fetch_add(1, Ordering::SeqCst) + 1;
            wachtrij.insert(
                id,
                Wachtend {
                    pad,
                    venster: venster.to_owned(),
                },
            );
        }
        aantal
    }

    fn voor_venster(&self, venster: &str) -> Vec<Aangeboden> {
        let Ok(wachtrij) = self.wachtrij.lock() else {
            return Vec::new();
        };
        wachtrij
            .iter()
            .filter(|(_, w)| w.venster == venster)
            .map(|(id, w)| Aangeboden {
                id: *id,
                naam: w
                    .pad
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            })
            .collect()
    }

    fn neem(&self, id: u64, venster: &str) -> Option<PathBuf> {
        let mut wachtrij = self.wachtrij.lock().ok()?;
        if wachtrij.get(&id)?.venster != venster {
            return None;
        }
        wachtrij.remove(&id).map(|w| w.pad)
    }

    /// Verplaatst wachtende bestanden van een gesloten venster; waar als er iets verhuisde.
    fn verhuis(&self, van: &str, naar: &str) -> bool {
        let Ok(mut wachtrij) = self.wachtrij.lock() else {
            return false;
        };
        let mut verhuisd = false;
        for w in wachtrij.values_mut().filter(|w| w.venster == van) {
            w.venster = naar.to_owned();
            verhuisd = true;
        }
        verhuisd
    }
}

/// Alle bestaande bestanden na de programmanaam; relatieve paden ten opzichte van `map`.
pub fn startpaden(argumenten: impl Iterator<Item = OsString>, map: Option<&Path>) -> Vec<PathBuf> {
    argumenten
        .skip(1)
        .map(PathBuf::from)
        .map(|pad| match map {
            Some(map) if pad.is_relative() => map.join(pad),
            _ => pad,
        })
        .filter(|pad| pad.is_file())
        .collect()
}

pub fn lees_beperkt(pad: &Path) -> Result<Vec<u8>, String> {
    let grootte = std::fs::metadata(pad).map_err(|e| e.to_string())?.len();
    if grootte == 0 || grootte > MAX_GROOTTE {
        return Err("Het bestand is leeg of groter dan 100 MB.".into());
    }
    std::fs::read(pad).map_err(|e| e.to_string())
}

/// Het venster dat nieuwe bestanden krijgt: hoofdvenster, anders het laatst actieve.
fn doelvenster<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    if let Some(venster) = app.get_webview_window(HOOFDVENSTER) {
        return Some(venster);
    }
    let laatst = app
        .state::<Systeembestanden>()
        .laatst_actief
        .lock()
        .ok()
        .and_then(|l| l.clone());
    laatst
        .and_then(|label| app.get_webview_window(&label))
        .or_else(|| app.webview_windows().into_values().next())
}

fn naar_voren<R: tauri::Runtime>(venster: &tauri::WebviewWindow<R>) {
    let _ = venster.unminimize();
    let _ = venster.show();
    let _ = venster.set_focus();
}

/// Bestanden van een tweede instantie of van macOS: aanbieden aan het doelvenster.
pub fn ontvang<R: tauri::Runtime>(app: &tauri::AppHandle<R>, paden: Vec<PathBuf>) {
    let staat = app.state::<Systeembestanden>();
    let Some(venster) = doelvenster(app) else {
        // Nog geen venster (macOS kan vóór het eerste venster melden): het
        // hoofdvenster haalt de lijst op zodra het geladen is.
        staat.voeg_toe(paden, HOOFDVENSTER);
        return;
    };
    naar_voren(&venster);
    if staat.voeg_toe(paden, venster.label()) > 0 {
        let _ = app.emit_to(venster.label(), GEBEURTENIS, ());
    }
}

/// Bestanden voor een bepaald venster (bestandskiezer, recente lijst, slepen).
pub fn ontvang_in<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    paden: Vec<PathBuf>,
) -> usize {
    let aantal = app.state::<Systeembestanden>().voeg_toe(paden, label);
    if aantal > 0 {
        let _ = app.emit_to(label, GEBEURTENIS, ());
    }
    aantal
}

/// Houdt het laatst actieve venster bij en verhuist wachtende bestanden van een gesloten venster.
pub fn bij_venstergebeurtenis<R: tauri::Runtime>(
    venster: &tauri::Window<R>,
    gebeurtenis: &tauri::WindowEvent,
) {
    let staat = venster.state::<Systeembestanden>();
    match gebeurtenis {
        tauri::WindowEvent::Focused(true) => {
            if let Ok(mut laatst) = staat.laatst_actief.lock() {
                *laatst = Some(venster.label().to_owned());
            }
        }
        // Bestanden die op het venster worden gesleept: zelfde route als een
        // dubbelklik, maar naar dit venster. Mappen en dergelijke vallen af.
        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
            let paden = paths.iter().filter(|p| p.is_file()).cloned().collect();
            ontvang_in(venster.app_handle(), venster.label(), paden);
        }
        tauri::WindowEvent::Destroyed => {
            let app = venster.app_handle();
            if let Ok(mut laatst) = staat.laatst_actief.lock() {
                if laatst.as_deref() == Some(venster.label()) {
                    *laatst = None;
                }
            }
            let ander = app
                .webview_windows()
                .into_keys()
                .find(|label| label != venster.label());
            if let Some(ander) = ander {
                if staat.verhuis(venster.label(), &ander) {
                    let _ = app.emit_to(ander.as_str(), GEBEURTENIS, ());
                }
            }
        }
        _ => {}
    }
}

/// Bestanden die voor dit venster klaarstaan (naam en eenmalig nummer).
#[tauri::command]
pub fn systeembestanden(
    venster: tauri::Window,
    staat: tauri::State<Systeembestanden>,
) -> Vec<Aangeboden> {
    staat.voor_venster(venster.label())
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum Claim {
    /// Nieuw geopend: lees de inhoud met `lees_werkbestand`.
    Nieuw { token: String, naam: String },
    /// Staat al open in dit venster.
    Geopend { token: String },
    /// Staat al open in een ander venster; dat venster komt naar voren.
    Elders,
}

/// Claimt een aangeboden bestand één keer; daarna is het nummer verbruikt.
#[tauri::command]
pub fn claim_systeembestand(
    app: tauri::AppHandle,
    venster: tauri::Window,
    staat: tauri::State<'_, Systeembestanden>,
    werkbestanden: tauri::State<'_, crate::werkbestanden::Werkbestanden>,
    id: u64,
) -> Result<Claim, String> {
    let pad = staat
        .neem(id, venster.label())
        .ok_or("Dit bestand is al geopend of niet voor dit venster bedoeld.")?;
    Ok(claim(&app, &werkbestanden, pad, venster.label()))
}

fn claim<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    werkbestanden: &crate::werkbestanden::Werkbestanden,
    pad: PathBuf,
    label: &str,
) -> Claim {
    match werkbestanden.zoek_pad(&pad) {
        Some((token, eigenaar)) if eigenaar == label => Claim::Geopend { token },
        Some((token, eigenaar)) => match app.get_webview_window(&eigenaar) {
            Some(ander) => {
                naar_voren(&ander);
                let _ = app.emit_to(eigenaar.as_str(), ACTIVEER, token);
                Claim::Elders
            }
            // Venster bestaat niet meer: het token is verweesd.
            None => {
                werkbestanden.vergeet_venster(&eigenaar);
                nieuw(werkbestanden, pad, label)
            }
        },
        None => nieuw(werkbestanden, pad, label),
    }
}

fn nieuw(werkbestanden: &crate::werkbestanden::Werkbestanden, pad: PathBuf, label: &str) -> Claim {
    let naam = crate::werkbestanden::bestandsnaam(&pad);
    Claim::Nieuw {
        token: werkbestanden.registreer(pad, label),
        naam,
    }
}

/// Leest het bestand achter een pad-token van dit venster en zet het in de recente lijst.
#[tauri::command]
pub async fn lees_werkbestand(
    app: tauri::AppHandle,
    venster: tauri::Window,
    token: String,
) -> Result<tauri::ipc::Response, String> {
    let label = venster.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let werkbestanden = app.state::<crate::werkbestanden::Werkbestanden>();
        let bytes = werkbestanden.lees(&token, &label)?;
        if let Some(pad) = werkbestanden.pad(&token, &label) {
            crate::recent::noteer(&app, &pad);
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argumenten(rest: Vec<OsString>) -> impl Iterator<Item = OsString> {
        std::iter::once(OsString::from("open-office-studio.exe")).chain(rest)
    }

    #[test]
    fn startpad_neemt_alleen_een_bestaand_bestand() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("notitie.docx");
        std::fs::write(&pad, b"inhoud").unwrap();
        let ontbreekt = map.path().join("ontbreekt.docx");
        assert!(startpaden(argumenten(vec![]), None).is_empty());
        assert!(startpaden(argumenten(vec!["--vlag".into(), ontbreekt.into()]), None).is_empty());
        assert_eq!(
            startpaden(argumenten(vec!["--vlag".into(), pad.clone().into()]), None),
            vec![pad.clone()]
        );
        // Het programma zelf telt nooit mee als startbestand.
        assert!(startpaden(std::iter::once(pad.into_os_string()), None).is_empty());
    }

    #[test]
    fn relatieve_paden_van_een_tweede_instantie() {
        let map = tempfile::tempdir().unwrap();
        std::fs::write(map.path().join("a.xlsx"), b"PK").unwrap();
        std::fs::write(map.path().join("b.pptx"), b"PK").unwrap();
        assert_eq!(
            startpaden(
                argumenten(vec!["a.xlsx".into(), "b.pptx".into()]),
                Some(map.path())
            ),
            vec![map.path().join("a.xlsx"), map.path().join("b.pptx")]
        );
    }

    #[test]
    fn startbestand_lezen_weigert_leeg_bestand() {
        let map = tempfile::tempdir().unwrap();
        let leeg = map.path().join("leeg.xlsx");
        std::fs::write(&leeg, b"").unwrap();
        assert!(lees_beperkt(&leeg).is_err());
        let gevuld = map.path().join("gevuld.xlsx");
        std::fs::write(&gevuld, b"PK").unwrap();
        assert_eq!(lees_beperkt(&gevuld).unwrap(), b"PK");
    }

    #[test]
    fn elk_bestand_eenmalig_en_alleen_voor_het_doelvenster() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("begroting.xlsx");
        std::fs::write(&pad, b"PK").unwrap();
        let staat = Systeembestanden::bij_start(argumenten(vec![pad.clone().into()]));
        let aangeboden = staat.voor_venster("main");
        assert_eq!(
            aangeboden,
            vec![Aangeboden {
                id: 1,
                naam: "begroting.xlsx".into()
            }]
        );
        assert!(staat.voor_venster("document-2").is_empty());
        assert_eq!(staat.neem(1, "document-2"), None);
        assert_eq!(staat.neem(1, "main"), Some(pad));
        assert_eq!(staat.neem(1, "main"), None);
        assert!(staat.voor_venster("main").is_empty());
    }

    #[test]
    fn wachtende_bestanden_verhuizen_bij_sluiten() {
        let staat = Systeembestanden::default();
        staat.voeg_toe(vec![PathBuf::from("/x/a.docx")], "document-3");
        assert!(staat.verhuis("document-3", "main"));
        assert!(!staat.verhuis("document-3", "main"));
        assert_eq!(staat.voor_venster("main").len(), 1);
    }
}
