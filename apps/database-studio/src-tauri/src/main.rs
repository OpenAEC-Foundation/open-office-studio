#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{io::Write, path::Path};

fn exportnaam(naam: &str, bytes: &[u8]) -> Result<(String, String), String> {
    if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 || std::str::from_utf8(bytes).is_err() {
        return Err("De export is leeg, ongeldig of groter dan 100 MB.".into());
    }
    let naam = Path::new(naam)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Bestandsnaam ontbreekt.")?
        .to_owned();
    let extensie = Path::new(&naam)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["csv", "sql", "bas"].contains(&extensie.as_str()) {
        return Err(
            "Alleen CSV- en bronexports zijn toegestaan. Databases worden niet overschreven."
                .into(),
        );
    }
    Ok((naam, extensie))
}

fn schrijf_atomair(pad: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tijdelijk =
        tempfile::NamedTempFile::new_in(pad.parent().ok_or("De doelmap ontbreekt.")?)
            .map_err(|e| e.to_string())?;
    tijdelijk.write_all(bytes).map_err(|e| e.to_string())?;
    tijdelijk.as_file().sync_all().map_err(|e| e.to_string())?;
    tijdelijk.persist(pad).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn bewaar_database_export(
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= 100 * 1024 * 1024 => bytes.clone(),
        _ => return Err("Stuur de export als binaire gegevens van maximaal 100 MB.".into()),
    };
    let kop = request
        .headers()
        .get("x-database-naam")
        .and_then(|n| n.to_str().ok())
        .ok_or("Bestandsnaam ontbreekt.")?;
    let naam = percent_encoding::percent_decode_str(kop)
        .decode_utf8()
        .map_err(|_| "Ongeldige bestandsnaam.")?;
    let (naam, extensie) = exportnaam(&naam, &bytes)?;
    let bestand = rfd::AsyncFileDialog::new()
        .set_title("Database-export opslaan")
        .set_file_name(&naam)
        .add_filter("Database-export", &[&extensie])
        .save_file()
        .await;
    let Some(bestand) = bestand else {
        return Ok(None);
    };
    let mut pad = bestand.path().to_path_buf();
    if pad.extension().is_none() {
        pad.set_extension(&extensie);
    }
    if pad
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        != Some(extensie)
    {
        return Err("De gekozen extensie past niet bij de export.".into());
    }
    if pad.exists()
        && rfd::AsyncMessageDialog::new()
            .set_title("Export vervangen")
            .set_description("Dit exportbestand bestaat al. Vervangen?")
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            .await
            != rfd::MessageDialogResult::Yes
    {
        return Ok(None);
    }
    tauri::async_runtime::spawn_blocking(move || {
        schrijf_atomair(&pad, &bytes)?;
        Ok(Some(pad.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![bewaar_database_export])
        .run(tauri::generate_context!())
        .expect("Open Database Studio kon niet starten");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn database_en_ongeldige_inhoud_worden_geweigerd() {
        assert!(exportnaam("bron.mdb", b"tekst").is_err());
        assert!(exportnaam("bron.accdb", b"tekst").is_err());
        assert!(exportnaam("pagina.csv", b"").is_err());
        assert!(exportnaam("pagina.csv", &[255]).is_err());
        assert_eq!(
            exportnaam("../pagina.csv", b"tekst").unwrap().0,
            "pagina.csv"
        );
    }
    #[test]
    fn export_wordt_volledig_en_atomair_bewaard() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("pagina.csv");
        std::fs::write(&pad, b"oud").unwrap();
        schrijf_atomair(&pad, "Materiaal;Aantal\nHout;12\n".as_bytes()).unwrap();
        assert_eq!(
            std::fs::read_to_string(&pad).unwrap(),
            "Materiaal;Aantal\nHout;12\n"
        );
        assert_eq!(std::fs::read_dir(map.path()).unwrap().count(), 1);
    }
}
