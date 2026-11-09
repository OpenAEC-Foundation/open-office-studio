//! Bestandslinks openen via de bestaande documentroute, zonder shell of macro-uitvoering.
use std::path::{Path, PathBuf};

fn doelpad(adres: &str, bron: Option<&Path>) -> Result<PathBuf, String> {
    let adres = adres.trim();
    if adres.is_empty() || adres.len() > 4096 || adres.chars().any(char::is_control) {
        return Err("link-invalid".into());
    }
    let pad = if adres.get(..5).is_some_and(|s| s.eq_ignore_ascii_case("file:")) {
        tauri::Url::parse(adres).ok().and_then(|u| u.to_file_path().ok())
            .ok_or("link-invalid")?
    } else {
        let tekst = percent_encoding::percent_decode_str(adres).decode_utf8().map_err(|_| "link-invalid")?;
        if tekst.chars().any(char::is_control) { return Err("link-invalid".into()); }
        let pad = PathBuf::from(tekst.replace('\\', "/"));
        if !pad.is_absolute() && tekst.split(['/', '\\']).next().is_some_and(|s| s.contains(':')) {
            return Err("link-invalid".into());
        }
        if pad.is_absolute() { pad } else {
            bron.and_then(Path::parent).ok_or("link-relative-base")?.join(pad)
        }
    };
    if !crate::conversie::mag_openen(&crate::werkbestanden::extensie(&pad)) {
        return Err("link-unsupported".into());
    }
    let pad = pad.canonicalize().map_err(|_| "link-missing")?;
    if !crate::conversie::mag_openen(&crate::werkbestanden::extensie(&pad)) {
        return Err("link-unsupported".into());
    }
    let meta = std::fs::metadata(&pad).map_err(|_| "link-missing")?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > 100 * 1024 * 1024 {
        return Err("link-file-size".into());
    }
    Ok(pad)
}

#[tauri::command]
pub fn open_documentkoppeling(
    app: tauri::AppHandle,
    venster: tauri::Window,
    werkbestanden: tauri::State<'_, crate::werkbestanden::Werkbestanden>,
    adres: String,
    brontoken: Option<String>,
) -> Result<(), String> {
    let bron = match brontoken {
        Some(token) => Some(werkbestanden.pad(&token, venster.label()).ok_or("link-relative-base")?),
        None => None,
    };
    let pad = doelpad(&adres, bron.as_deref())?;
    crate::systeembestanden::ontvang_in(&app, venster.label(), vec![pad]);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn relatieve_en_file_uri_links_blijven_in_de_documentroute() {
        let map = tempfile::tempdir().unwrap();
        let bron = map.path().join("Bron.xlsx");
        let doel = map.path().join("Bijlage #1.xlsx");
        std::fs::write(&doel, b"test").unwrap();
        assert_eq!(doelpad("Bijlage #1.xlsx", Some(&bron)).unwrap(), doel.canonicalize().unwrap());
        assert_eq!(doelpad("Bijlage%20%231.xlsx", Some(&bron)).unwrap(), doel.canonicalize().unwrap());
        let uri = tauri::Url::from_file_path(&doel).unwrap().to_string();
        assert!(uri.contains("%23"));
        assert_eq!(doelpad(&uri, None).unwrap(), doel.canonicalize().unwrap());
        assert_eq!(doelpad("Bijlage.xlsx", None).unwrap_err(), "link-relative-base");
    }
    #[test]
    fn voert_geen_programmas_of_url_schemas_uit() {
        let map = tempfile::tempdir().unwrap();
        let bron = map.path().join("Bron.xlsx");
        let script = map.path().join("script.cmd"); std::fs::write(&script, b"exit 1").unwrap();
        assert_eq!(doelpad(script.to_str().unwrap(), Some(&bron)).unwrap_err(), "link-unsupported");
        for adres in ["javascript:alert(1)", "https://example.com/a.xlsx", "shell:AppsFolder", "file:\0bad.xlsx"] {
            assert_eq!(doelpad(adres, Some(&bron)).unwrap_err(), "link-invalid");
        }
        assert_eq!(doelpad("ontbreekt.xlsx", Some(&bron)).unwrap_err(), "link-missing");
    }
}
