//! Automatisch herstel: herstelkopieën van gewijzigde documenten.
//!
//! Elk venster start een sessie (`herstel_start`) en bewaart periodiek per
//! gewijzigd tabblad een kopie in `<app-gegevens>/herstel/<sessie>/`. Een
//! kopie verdwijnt na normaal opslaan of sluiten (`herstel_verwijder`), en de
//! hele sessiemap verdwijnt als het venster netjes sluit. Na een crash of
//! stroomstoring blijven de mappen staan; bij de volgende start zijn het
//! "wezen" (niet van een draaiend venster) en biedt het hoofdvenster ze aan
//! (`herstel_lijst`, `herstel_lees`). Herstel opent een kopie altijd als nieuw,
//! niet-opgeslagen tabblad en schrijft nooit naar het originele bestand.
//!
//! Grenzen: hooguit 512 MB in totaal; wezen ouder dan 30 dagen worden opgeruimd.
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime},
};
use tauri::Manager;

pub const MAX_TOTAAL: u64 = 512 * 1024 * 1024;
const MAX_LEEFTIJD: Duration = Duration::from_secs(30 * 24 * 3600);

#[derive(Default)]
pub struct Herstel {
    /// Actieve sessie → vensterlabel.
    sessies: Mutex<HashMap<String, String>>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub naam: String,
    pub soort: String,
    pub export_formaat: String,
    /// Milliseconden sinds 1970.
    pub datum: u64,
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Item {
    sessie: String,
    sleutel: String,
    #[serde(flatten)]
    meta: Meta,
    grootte: u64,
}

fn geldig(naam: &str) -> bool {
    (1..=64).contains(&naam.len())
        && naam
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn controleer(sessie: &str, sleutel: &str) -> Result<(), String> {
    if geldig(sessie) && geldig(sleutel) {
        Ok(())
    } else {
        Err(crate::taal::t("errors.recovery.keyInvalid"))
    }
}

fn mapgrootte(map: &Path) -> u64 {
    let Ok(lijst) = std::fs::read_dir(map) else {
        return 0;
    };
    lijst
        .flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => mapgrootte(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

pub fn bewaar(
    basis: &Path,
    sessie: &str,
    sleutel: &str,
    meta: &Meta,
    bytes: &[u8],
) -> Result<(), String> {
    bewaar_binnen(basis, sessie, sleutel, meta, bytes, MAX_TOTAAL)
}

fn bewaar_binnen(
    basis: &Path,
    sessie: &str,
    sleutel: &str,
    meta: &Meta,
    bytes: &[u8],
    grens: u64,
) -> Result<(), String> {
    controleer(sessie, sleutel)?;
    let map = basis.join(sessie);
    let bin = map.join(format!("{sleutel}.bin"));
    let vorige = std::fs::metadata(&bin).map(|m| m.len()).unwrap_or(0);
    if mapgrootte(basis).saturating_sub(vorige) + bytes.len() as u64 > grens {
        return Err(crate::taal::t("errors.recovery.spaceFull"));
    }
    std::fs::create_dir_all(&map).map_err(|e| e.to_string())?;
    crate::schrijf_atomair(&bin, bytes)?;
    let json = serde_json::to_vec(meta).map_err(|e| e.to_string())?;
    crate::schrijf_atomair(&map.join(format!("{sleutel}.json")), &json)
}

pub fn verwijder(basis: &Path, sessie: &str, sleutel: &str) -> Result<(), String> {
    controleer(sessie, sleutel)?;
    let map = basis.join(sessie);
    let _ = std::fs::remove_file(map.join(format!("{sleutel}.bin")));
    let _ = std::fs::remove_file(map.join(format!("{sleutel}.json")));
    // Een lege sessiemap ruimen we meteen op.
    let _ = std::fs::remove_dir(&map);
    Ok(())
}

pub fn verwijder_sessie(basis: &Path, sessie: &str) {
    if geldig(sessie) {
        let _ = std::fs::remove_dir_all(basis.join(sessie));
    }
}

/// Kopieën van sessies die niet (meer) draaien; oude wezen worden opgeruimd.
pub fn wezen(basis: &Path, actief: &HashSet<String>) -> Vec<Item> {
    let mut uit = Vec::new();
    let Ok(mappen) = std::fs::read_dir(basis) else {
        return uit;
    };
    for map in mappen.flatten() {
        let sessie = map.file_name().to_string_lossy().into_owned();
        if !geldig(&sessie) || actief.contains(&sessie) || !map.path().is_dir() {
            continue;
        }
        let oud = map
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| SystemTime::now().duration_since(t).ok())
            .is_some_and(|leeftijd| leeftijd > MAX_LEEFTIJD);
        if oud {
            verwijder_sessie(basis, &sessie);
            continue;
        }
        let Ok(bestanden) = std::fs::read_dir(map.path()) else {
            continue;
        };
        for bestand in bestanden.flatten() {
            let pad = bestand.path();
            if pad.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Some(sleutel) = pad.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let bin = pad.with_extension("bin");
            let (Ok(json), Ok(m)) = (std::fs::read(&pad), std::fs::metadata(&bin)) else {
                continue;
            };
            if let Ok(meta) = serde_json::from_slice::<Meta>(&json) {
                if geldig(sleutel) && m.len() > 0 {
                    uit.push(Item {
                        sessie: sessie.clone(),
                        sleutel: sleutel.to_owned(),
                        meta,
                        grootte: m.len(),
                    });
                }
            }
        }
    }
    uit.sort_by(|a, b| b.meta.datum.cmp(&a.meta.datum));
    uit
}

pub fn lees(basis: &Path, sessie: &str, sleutel: &str) -> Result<Vec<u8>, String> {
    controleer(sessie, sleutel)?;
    crate::systeembestanden::lees_beperkt(&basis.join(sessie).join(format!("{sleutel}.bin")))
}

fn basis<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|m| m.join("herstel"))
        .map_err(|e| e.to_string())
}

impl Herstel {
    fn actief(&self) -> HashSet<String> {
        self.sessies
            .lock()
            .map(|s| s.keys().cloned().collect())
            .unwrap_or_default()
    }

    fn eigenaar(&self, sessie: &str) -> Option<String> {
        self.sessies.lock().ok()?.get(sessie).cloned()
    }
}

fn kop(request: &tauri::ipc::Request<'_>, naam: &str) -> Option<String> {
    let waarde = request.headers().get(naam)?.to_str().ok()?;
    percent_encoding::percent_decode_str(waarde)
        .decode_utf8()
        .ok()
        .map(|s| s.into_owned())
}

/// Registreert de sessie van dit venster. Een eerdere sessie van hetzelfde
/// venster (na herladen) wordt een wees, zodat haar kopieën worden aangeboden.
#[tauri::command]
pub fn herstel_start(
    venster: tauri::Window,
    staat: tauri::State<Herstel>,
    sessie: String,
) -> Result<(), String> {
    controleer(&sessie, "x")?;
    let mut sessies = staat.sessies.lock().map_err(|e| e.to_string())?;
    sessies.retain(|_, label| label != venster.label());
    sessies.insert(sessie, venster.label().to_owned());
    Ok(())
}

/// Kopteksten: `x-office-sessie`, `x-office-sleutel`, `x-office-meta` (JSON).
#[tauri::command]
pub async fn herstel_bewaar(
    app: tauri::AppHandle,
    venster: tauri::Window,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let sessie = kop(&request, "x-office-sessie").ok_or_else(|| crate::taal::t("errors.recovery.sessionMissing"))?;
    let sleutel = kop(&request, "x-office-sleutel").ok_or_else(|| crate::taal::t("errors.recovery.keyMissing"))?;
    let mut meta: Meta = serde_json::from_str(&kop(&request, "x-office-meta").unwrap_or_default())
        .map_err(|_| crate::taal::t("errors.recovery.dataInvalid"))?;
    meta.naam = meta.naam.chars().take(255).collect();
    if !matches!(meta.soort.as_str(), "docx" | "xlsx" | "pptx") {
        return Err(crate::taal::t("errors.recovery.unknownDocumentType"));
    }
    if app.state::<Herstel>().eigenaar(&sessie).as_deref() != Some(venster.label()) {
        return Err(crate::taal::t("errors.recovery.sessionNotThisWindow"));
    }
    let bytes = crate::lees_binaire_inhoud(request.body(), false)?;
    let basis = basis(&app)?;
    tauri::async_runtime::spawn_blocking(move || bewaar(&basis, &sessie, &sleutel, &meta, &bytes))
        .await
        .map_err(|e| e.to_string())?
}

/// Verwijdert een kopie van de eigen sessie of een wees (na herstellen of weggooien).
#[tauri::command]
pub fn herstel_verwijder(
    app: tauri::AppHandle,
    venster: tauri::Window,
    staat: tauri::State<Herstel>,
    sessie: String,
    sleutel: String,
) -> Result<(), String> {
    match staat.eigenaar(&sessie) {
        Some(label) if label != venster.label() => {
            Err(crate::taal::t("errors.recovery.sessionOtherWindow"))
        }
        _ => verwijder(&basis(&app)?, &sessie, &sleutel),
    }
}

#[tauri::command]
pub fn herstel_lijst(app: tauri::AppHandle, staat: tauri::State<Herstel>) -> Vec<Item> {
    basis(&app)
        .map(|b| wezen(&b, &staat.actief()))
        .unwrap_or_default()
}

/// Leest een herstelkopie; alleen van sessies die niet meer draaien.
#[tauri::command]
pub async fn herstel_lees(
    app: tauri::AppHandle,
    sessie: String,
    sleutel: String,
) -> Result<tauri::ipc::Response, String> {
    if app.state::<Herstel>().eigenaar(&sessie).is_some() {
        return Err(crate::taal::t("errors.recovery.sessionStillRunning"));
    }
    let basis = basis(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        lees(&basis, &sessie, &sleutel).map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Een venster dat netjes sluit, neemt zijn herstelkopieën mee.
pub fn bij_venstergebeurtenis<R: tauri::Runtime>(
    venster: &tauri::Window<R>,
    gebeurtenis: &tauri::WindowEvent,
) {
    if let tauri::WindowEvent::Destroyed = gebeurtenis {
        let app = venster.app_handle();
        let staat = app.state::<Herstel>();
        let weg: Vec<String> = {
            let Ok(mut sessies) = staat.sessies.lock() else {
                return;
            };
            let weg = sessies
                .iter()
                .filter(|(_, label)| *label == venster.label())
                .map(|(s, _)| s.clone())
                .collect();
            sessies.retain(|_, label| label != venster.label());
            weg
        };
        if let Ok(basis) = basis(app) {
            for sessie in weg {
                verwijder_sessie(&basis, &sessie);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(naam: &str) -> Meta {
        Meta {
            naam: naam.into(),
            soort: "docx".into(),
            export_formaat: "docx".into(),
            datum: 7,
        }
    }

    #[test]
    fn kopie_overleeft_een_crash_en_wordt_aangeboden() {
        let basis = tempfile::tempdir().unwrap();
        let b = basis.path();
        bewaar(b, "sessie-1", "tab-3", &meta("Verslag.docx"), b"PK eerste").unwrap();
        bewaar(b, "sessie-1", "tab-3", &meta("Verslag.docx"), b"PK tweede").unwrap();
        bewaar(b, "sessie-2", "tab-1", &meta("Ander.docx"), b"PK").unwrap();
        // Sessie 2 draait nog; sessie 1 is na een crash een wees.
        let actief = HashSet::from(["sessie-2".to_owned()]);
        let w = wezen(b, &actief);
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].sleutel, "tab-3");
        assert_eq!(w[0].meta.naam, "Verslag.docx");
        assert_eq!(lees(b, "sessie-1", "tab-3").unwrap(), b"PK tweede");
        verwijder(b, "sessie-1", "tab-3").unwrap();
        assert!(wezen(b, &actief).is_empty());
        assert!(!b.join("sessie-1").exists());
    }

    #[test]
    fn netjes_sluiten_ruimt_de_sessie_op() {
        let basis = tempfile::tempdir().unwrap();
        let b = basis.path();
        bewaar(b, "s", "a", &meta("a.docx"), b"PK").unwrap();
        bewaar(b, "s", "b", &meta("b.docx"), b"PK").unwrap();
        verwijder_sessie(b, "s");
        assert!(wezen(b, &HashSet::new()).is_empty());
    }

    #[test]
    fn weigert_vreemde_namen_en_te_veel_ruimte() {
        let basis = tempfile::tempdir().unwrap();
        let b = basis.path();
        assert!(bewaar(b, "../uit", "a", &meta("a"), b"PK").is_err());
        assert!(bewaar(b, "s", "A/B", &meta("a"), b"PK").is_err());
        assert!(lees(b, "s", "..").is_err());
        let groot = vec![0u8; 600];
        bewaar_binnen(b, "s", "een", &meta("a"), &groot, 1000).unwrap();
        // Dezelfde kopie vervangen mag; een tweede even grote niet.
        bewaar_binnen(b, "s", "een", &meta("a"), &groot, 1000).unwrap();
        assert!(bewaar_binnen(b, "s", "twee", &meta("b"), &groot, 1000).is_err());
    }

    #[test]
    fn half_geschreven_kopie_telt_niet() {
        let basis = tempfile::tempdir().unwrap();
        let b = basis.path();
        std::fs::create_dir_all(b.join("s")).unwrap();
        std::fs::write(b.join("s/x.json"), serde_json::to_vec(&meta("x")).unwrap()).unwrap();
        assert!(wezen(b, &HashSet::new()).is_empty());
    }
}
