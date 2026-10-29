//! Voorkeuren uit het instellingenvenster, als klein JSON-bestand in de
//! configuratiemap van de app. De inhoud wordt in de frontend gecontroleerd;
//! hier alleen grootte en vorm (een JSON-object).
use std::{fs, path::PathBuf};
use tauri::Manager;

const BESTAND: &str = "voorkeuren.json";
const MAX_BYTES: usize = 64 * 1024;

fn bestand(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|map| map.join(BESTAND))
}

/// Een JSON-object van hooguit 64 kB; anders een foutmelding.
fn controleer(inhoud: &str) -> Result<(), String> {
    if inhoud.len() > MAX_BYTES {
        return Err(crate::taal::t("errors.preferences.tooLarge"));
    }
    match serde_json::from_str::<serde_json::Value>(inhoud) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        _ => Err(crate::taal::t("errors.preferences.invalid")),
    }
}

#[tauri::command]
pub fn lees_voorkeuren(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(pad) = bestand(&app) else {
        return Ok(None);
    };
    match fs::read_to_string(&pad) {
        // Een beschadigd bestand mag de app niet blokkeren: dan gelden de standaarden.
        Ok(inhoud) => Ok(controleer(&inhoud).ok().map(|_| inhoud)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn bewaar_voorkeuren(app: tauri::AppHandle, inhoud: String) -> Result<(), String> {
    controleer(&inhoud)?;
    let pad = bestand(&app).ok_or_else(|| crate::taal::t("errors.preferences.configDirUnavailable"))?;
    let map = pad
        .parent()
        .ok_or_else(|| crate::taal::t("errors.preferences.pathInvalid"))?;
    fs::create_dir_all(map).map_err(|e| e.to_string())?;
    // Eerst naast het doel schrijven en dan hernoemen: nooit een half bestand.
    let tijdelijk = pad.with_extension("json.tmp");
    fs::write(&tijdelijk, inhoud.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tijdelijk, &pad).map_err(|e| e.to_string())
}

/// Begintaal van de native teksten: de keuze `taal` uit het voorkeurenbestand
/// ("auto" of ontbrekend: de systeemtaal). De frontend meldt daarna de echte taal.
pub fn zet_begintaal(app: &tauri::AppHandle) {
    let inhoud = bestand(app).and_then(|pad| fs::read_to_string(pad).ok());
    let keuze = inhoud
        .as_deref()
        .and_then(|tekst| serde_json::from_str::<serde_json::Value>(tekst).ok())
        .and_then(|v| v.get("taal").and_then(|t| t.as_str()).map(str::to_owned));
    crate::taal::zet_keuze(keuze.as_deref());
}

#[cfg(test)]
mod tests {
    use super::controleer;

    #[test]
    fn alleen_kleine_json_objecten() {
        assert!(controleer(r#"{"thema":"light"}"#).is_ok());
        assert!(controleer("[]").is_err());
        assert!(controleer("geen json").is_err());
        assert!(controleer(&format!(r#"{{"x":"{}"}}"#, "a".repeat(70_000))).is_err());
    }
}
