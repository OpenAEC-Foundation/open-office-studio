//! Recente bestanden: hooguit 20 paden in `recent.json` in de app-gegevensmap.
//!
//! Alleen paden en tijdstippen, nooit inhoud. De webview krijgt per bestand
//! een id (afgeleid van het pad), de naam, de map, de extensie, de datum,
//! of het is vastgezet en of het nog bestaat. Openen gaat met het id via de
//! route van de systeembestanden; zo leest de webview nooit een willekeurig pad.
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

pub const MAX: usize = 20;
const BESTAND: &str = "recent.json";
/// Gebeurtenis voor alle vensters: de lijst is veranderd.
const GEBEURTENIS: &str = "office-recent";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Item {
    pub pad: PathBuf,
    /// Laatst geopend of opgeslagen, in milliseconden sinds 1970.
    pub datum: u64,
    #[serde(default)]
    pub vast: bool,
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Weergave {
    id: String,
    naam: String,
    map: String,
    ext: String,
    datum: u64,
    vast: bool,
    bestaat: bool,
}

#[derive(Default)]
pub struct Recent {
    /// None tot de lijst voor het eerst van schijf is gelezen.
    lijst: Mutex<Option<Vec<Item>>>,
}

pub fn id(pad: &Path) -> String {
    let hash = crate::werkbestanden::hash(pad.to_string_lossy().as_bytes());
    hash[..8].iter().map(|b| format!("{b:02x}")).collect()
}

fn nu() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn zelfde(a: &Path, b: &Path) -> bool {
    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// Vastgezet eerst, daarna nieuwste eerst.
pub fn sorteer(lijst: &mut [Item]) {
    lijst.sort_by(|a, b| b.vast.cmp(&a.vast).then(b.datum.cmp(&a.datum)));
}

/// Zet een pad bovenaan; vastgezette bestanden blijven altijd staan, de rest
/// wordt ingekort tot samen hooguit `MAX`.
pub fn voeg_toe(lijst: &mut Vec<Item>, pad: PathBuf, datum: u64) {
    let vast = lijst
        .iter()
        .find(|i| zelfde(&i.pad, &pad))
        .is_some_and(|i| i.vast);
    lijst.retain(|i| !zelfde(&i.pad, &pad));
    lijst.push(Item { pad, datum, vast });
    sorteer(lijst);
    let vastgezet = lijst.iter().filter(|i| i.vast).count();
    let ruimte = MAX.saturating_sub(vastgezet);
    let mut los = 0;
    lijst.retain(|i| {
        if i.vast {
            return true;
        }
        los += 1;
        los <= ruimte
    });
}

pub fn weergave(lijst: &[Item]) -> Vec<Weergave> {
    lijst
        .iter()
        .map(|i| Weergave {
            id: id(&i.pad),
            naam: crate::werkbestanden::bestandsnaam(&i.pad),
            map: i
                .pad
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default(),
            ext: crate::werkbestanden::extensie(&i.pad),
            datum: i.datum,
            vast: i.vast,
            bestaat: i.pad.is_file(),
        })
        .collect()
}

fn bestand<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|m| m.join(BESTAND))
}

fn lees_van(pad: &Path) -> Vec<Item> {
    let mut lijst: Vec<Item> = std::fs::read(pad)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    sorteer(&mut lijst);
    lijst
}

impl Recent {
    /// Voert `f` uit op de lijst; bij `bewaar` daarna naar schijf en een melding aan alle vensters.
    fn met<R: tauri::Runtime, T>(
        &self,
        app: &tauri::AppHandle<R>,
        bewaar: bool,
        f: impl FnOnce(&mut Vec<Item>) -> T,
    ) -> T {
        let pad = bestand(app);
        let mut slot = self.lijst.lock().unwrap_or_else(|e| e.into_inner());
        let lijst = slot.get_or_insert_with(|| pad.as_deref().map(lees_van).unwrap_or_default());
        let uit = f(lijst);
        if bewaar {
            if let Some(pad) = &pad {
                if let Some(map) = pad.parent() {
                    let _ = std::fs::create_dir_all(map);
                }
                if let Ok(json) = serde_json::to_vec_pretty(lijst) {
                    let _ = crate::schrijf_atomair(pad, &json);
                }
            }
            let _ = app.emit(GEBEURTENIS, ());
        }
        uit
    }
}

/// Een geopend of opgeslagen bestand bovenaan de lijst zetten.
pub fn noteer<R: tauri::Runtime>(app: &tauri::AppHandle<R>, pad: &Path) {
    if !crate::conversie::mag_openen(&crate::werkbestanden::extensie(pad)) {
        return;
    }
    // Op Windows geeft canonicalize een \\?\-pad; daar volstaat het pad zelf.
    let pad = if cfg!(windows) {
        pad.to_path_buf()
    } else {
        pad.canonicalize().unwrap_or_else(|_| pad.to_path_buf())
    };
    app.state::<Recent>()
        .met(app, true, |lijst| voeg_toe(lijst, pad, nu()));
}

#[tauri::command]
pub fn recente_bestanden(app: tauri::AppHandle, staat: tauri::State<Recent>) -> Vec<Weergave> {
    staat.met(&app, false, |lijst| weergave(lijst))
}

/// Opent een recent bestand in dit venster; onwaar als het niet meer bestaat.
#[tauri::command]
pub fn open_recent(
    app: tauri::AppHandle,
    venster: tauri::Window,
    staat: tauri::State<Recent>,
    id: String,
) -> Result<bool, String> {
    let pad = staat
        .met(&app, false, |lijst| {
            lijst.iter().find(|i| self::id(&i.pad) == id).map(|i| i.pad.clone())
        })
        .ok_or_else(|| crate::taal::t("errors.file.notInRecentList"))?;
    if !pad.is_file() {
        return Ok(false);
    }
    crate::systeembestanden::ontvang_in(&app, venster.label(), vec![pad]);
    Ok(true)
}

#[tauri::command]
pub fn zet_recent_vast(app: tauri::AppHandle, staat: tauri::State<Recent>, id: String, vast: bool) {
    staat.met(&app, true, |lijst| {
        for i in lijst.iter_mut().filter(|i| self::id(&i.pad) == id) {
            i.vast = vast;
        }
        sorteer(lijst);
    });
}

#[tauri::command]
pub fn verwijder_recent(app: tauri::AppHandle, staat: tauri::State<Recent>, id: String) {
    staat.met(&app, true, |lijst| lijst.retain(|i| self::id(&i.pad) != id));
}

/// Wist de lijst; vastgezette bestanden blijven staan.
#[tauri::command]
pub fn wis_recente(app: tauri::AppHandle, staat: tauri::State<Recent>) {
    staat.met(&app, true, |lijst| lijst.retain(|i| i.vast));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nieuwste_bovenaan_zonder_dubbelen() {
        let mut l = Vec::new();
        voeg_toe(&mut l, "/a.docx".into(), 1);
        voeg_toe(&mut l, "/b.xlsx".into(), 2);
        voeg_toe(&mut l, "/a.docx".into(), 3);
        assert_eq!(
            l.iter().map(|i| i.pad.to_str().unwrap()).collect::<Vec<_>>(),
            ["/a.docx", "/b.xlsx"]
        );
    }

    #[test]
    fn hooguit_twintig_en_vastgezette_blijven() {
        let mut l = Vec::new();
        voeg_toe(&mut l, "/vast.docx".into(), 0);
        l[0].vast = true;
        for n in 1..=30 {
            voeg_toe(&mut l, format!("/{n}.docx").into(), n);
        }
        assert_eq!(l.len(), MAX);
        assert_eq!(l[0].pad, PathBuf::from("/vast.docx"));
        assert_eq!(l[1].pad, PathBuf::from("/30.docx"));
        assert!(!l.iter().any(|i| i.pad == PathBuf::from("/11.docx")));
        // Opnieuw openen houdt het vastzetten vast.
        voeg_toe(&mut l, "/vast.docx".into(), 99);
        assert!(l[0].vast);
    }

    #[test]
    fn weergave_meldt_ontbrekende_bestanden() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("Plan.PPTX");
        std::fs::write(&pad, b"PK").unwrap();
        let l = vec![
            Item { pad: pad.clone(), datum: 5, vast: false },
            Item { pad: map.path().join("weg.docx"), datum: 4, vast: false },
        ];
        let w = weergave(&l);
        assert_eq!(w[0].naam, "Plan.PPTX");
        assert_eq!(w[0].ext, "pptx");
        assert_eq!(w[0].map, map.path().to_string_lossy());
        assert!(w[0].bestaat);
        assert!(!w[1].bestaat);
        assert_eq!(w[0].id, id(&pad));
        assert_eq!(w[0].id.len(), 16);
        assert_ne!(w[0].id, w[1].id);
    }

    #[test]
    fn leest_een_bewaarde_lijst_terug() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join(BESTAND);
        let l = vec![
            Item { pad: "/oud.docx".into(), datum: 1, vast: false },
            Item { pad: "/vast.xlsx".into(), datum: 0, vast: true },
        ];
        std::fs::write(&pad, serde_json::to_vec(&l).unwrap()).unwrap();
        let terug = lees_van(&pad);
        assert_eq!(terug[0].pad, PathBuf::from("/vast.xlsx"));
        std::fs::write(&pad, b"kapot").unwrap();
        assert!(lees_van(&pad).is_empty());
    }
}
