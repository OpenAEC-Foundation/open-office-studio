#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{io::Write, path::Path};
mod conversie;
mod database_export;
mod email;
mod herstel;
mod lettertypen;
mod recent;
mod systeembestanden;
mod vensters;
mod werkbestanden;
mod voorkeuren;

fn lees_bytes(request: &tauri::ipc::Request<'_>) -> Result<Vec<u8>, String> {
    lees_binaire_inhoud(request.body(), false)
}

fn lees_binaire_inhoud(
    inhoud: &tauri::ipc::InvokeBody,
    leeg_toegestaan: bool,
) -> Result<Vec<u8>, String> {
    match inhoud {
        tauri::ipc::InvokeBody::Raw(bytes)
            if (leeg_toegestaan || !bytes.is_empty()) && bytes.len() <= 100 * 1024 * 1024 =>
        {
            Ok(bytes.clone())
        }
        _ => Err(
            "Het bestand is leeg, groter dan 100 MB of niet als binaire gegevens verzonden.".into(),
        ),
    }
}

#[tauri::command]
async fn converteer_document(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<tauri::ipc::Response, String> {
    let bytes = lees_bytes(&request)?;
    let kop = |naam| {
        request
            .headers()
            .get(naam)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .ok_or_else(|| "De formaatinformatie ontbreekt.".to_owned())
    };
    let bron = kop("x-office-bron")?;
    let doel = kop("x-office-doel")?;
    let module = kop("x-office-module")?;
    // Optionele filteropties (CSV, PDF); Rust controleert en bouwt het filterargument zelf.
    let opties = match kop("x-office-opties") {
        Ok(tekst) => conversie::Opties::uit_json(&tekst)?,
        Err(_) => conversie::Opties::default(),
    };
    let instelling = conversie::lees_instelling(&app);
    tauri::async_runtime::spawn_blocking(move || {
        conversie::converteer_met(
            &bytes,
            &bron,
            &doel,
            &module,
            &opties,
            instelling.as_deref(),
        )
        .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn schrijf_atomair(pad: &Path, bytes: &[u8]) -> Result<(), String> {
    let map = pad.parent().ok_or("De doelmap ontbreekt.")?;
    // Eindigt op .tmp: synchronisatieclients (o.a. de OpenAEC SuperCloud) slaan
    // zulke bestanden over, zodat alleen het definitieve bestand wordt geüpload.
    let mut tijdelijk = tempfile::Builder::new()
        .prefix(".~oos-")
        .suffix(".tmp")
        .tempfile_in(map)
        .map_err(|e| e.to_string())?;
    tijdelijk.write_all(bytes).map_err(|e| e.to_string())?;
    tijdelijk.as_file().sync_all().map_err(|e| e.to_string())?;
    tijdelijk.persist(pad).map_err(|e| e.to_string())?;
    Ok(())
}

/// Bestandsnaam en extensie uit de kop `x-office-naam`; alleen bekende bewaarformaten.
fn bewaarnaam(request: &tauri::ipc::Request<'_>) -> Result<(String, String), String> {
    let naam = request
        .headers()
        .get("x-office-naam")
        .and_then(|v| v.to_str().ok())
        .ok_or("De bestandsnaam ontbreekt.")?;
    let naam = percent_encoding::percent_decode_str(naam)
        .decode_utf8()
        .map_err(|_| "De bestandsnaam bevat ongeldige tekens.")?
        .into_owned();
    let bestandsnaam = Path::new(&naam)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Naamloos.docx")
        .to_owned();
    let extensie = Path::new(&bestandsnaam)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if extensie != "openaec-notities" && !conversie::mag_bewaren(&extensie) {
        return Err("Niet-ondersteund bestandsformaat.".into());
    }
    Ok((bestandsnaam, extensie))
}

/// Native opslagdialoog; het doel komt uitsluitend uit die dialoog, nooit uit een frontendpad.
async fn kies_opslagpad(
    titel: &str,
    bestandsnaam: &str,
    extensie: &str,
) -> Result<Option<std::path::PathBuf>, String> {
    let bestand = rfd::AsyncFileDialog::new()
        .set_title(titel)
        .set_file_name(bestandsnaam)
        .add_filter("Kantoorbestand", &[extensie])
        .save_file()
        .await;
    let Some(bestand) = bestand else {
        return Ok(None);
    };
    let mut pad = bestand.path().to_path_buf();
    if pad.extension().is_none() {
        pad.set_extension(extensie);
    }
    if pad
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .as_deref()
        != Some(extensie)
    {
        return Err("De gekozen extensie past niet bij het document.".into());
    }
    if pad.exists() {
        let bevestiging = rfd::AsyncMessageDialog::new()
            .set_title("Bestand vervangen")
            .set_description(format!(
                "Het bestand {} bestaat al. Vervangen?",
                pad.display()
            ))
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            .await;
        if bevestiging != rfd::MessageDialogResult::Yes {
            return Ok(None);
        }
    }
    Ok(Some(pad))
}

#[tauri::command]
async fn bewaar_kopie(request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let (bestandsnaam, extensie) = bewaarnaam(&request)?;
    // Een lege Markdownpagina is een geldig tekstbestand; conversie en andere formaten blijven streng.
    let bytes = lees_binaire_inhoud(request.body(), extensie == "md")?;
    let Some(pad) = kies_opslagpad("Kopie opslaan", &bestandsnaam, &extensie).await? else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || {
        schrijf_atomair(&pad, &bytes)?;
        Ok(Some(pad.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        // Eerst registreren: een tweede instantie (dubbelklik terwijl de app al
        // draait) geeft haar bestanden door en stopt meteen.
        .plugin(tauri_plugin_single_instance::init(
            |app, argumenten, map| {
                let paden = systeembestanden::startpaden(
                    argumenten.into_iter().map(Into::into),
                    Some(std::path::Path::new(&map)),
                );
                systeembestanden::ontvang(app, paden);
            },
        ))
        .manage(vensters::Vensters::default())
        .manage(werkbestanden::Werkbestanden::default())
        .manage(recent::Recent::default())
        .manage(herstel::Herstel::default())
        .manage(email::EmailStaat::default())
        .manage(systeembestanden::Systeembestanden::bij_start(
            std::env::args_os(),
        ))
        .on_window_event(|venster, gebeurtenis| {
            systeembestanden::bij_venstergebeurtenis(venster, gebeurtenis);
            vensters::bij_venstergebeurtenis(venster, gebeurtenis);
            werkbestanden::bij_venstergebeurtenis(venster, gebeurtenis);
            herstel::bij_venstergebeurtenis(venster, gebeurtenis);
        })
        .invoke_handler(tauri::generate_handler![
            bewaar_kopie,
            lettertypen::systeemlettertypen,
            lettertypen::systeemlettertype,
            database_export::bewaar_database_export,
            vensters::wijzigingsstatus,
            vensters::bevestig_verlaten,
            vensters::bied_overdracht,
            vensters::neem_overdracht,
            vensters::bevestig_overdracht,
            vensters::weiger_overdracht,
            vensters::trek_overdracht_in,
            vensters::sluitverzoek_ontvangen,
            vensters::sluit_venster,
            vensters::meld_tabbladen,
            vensters::open_documenten,
            vensters::activeer_tabblad,
            converteer_document,
            systeembestanden::systeembestanden,
            systeembestanden::claim_systeembestand,
            systeembestanden::lees_werkbestand,
            werkbestanden::bewaar_document,
            werkbestanden::bewaar_als,
            werkbestanden::bevestig_formaat,
            werkbestanden::vergeet_werkbestand,
            werkbestanden::kies_bestanden,
            recent::recente_bestanden,
            recent::open_recent,
            recent::zet_recent_vast,
            recent::verwijder_recent,
            recent::wis_recente,
            herstel::herstel_start,
            herstel::herstel_bewaar,
            herstel::herstel_verwijder,
            herstel::herstel_lijst,
            herstel::herstel_lees,
            conversie::conversie_status,
            conversie::kies_conversieprogramma,
            conversie::wis_conversieprogramma,
            voorkeuren::lees_voorkeuren,
            voorkeuren::bewaar_voorkeuren,
            email::email_accounts,
            email::email_bewaar_account,
            email::email_verwijder_account,
            email::email_stel_configuratie_voor,
            email::email_test,
            email::email_mappen,
            email::email_maak_map,
            email::email_hernoem_map,
            email::email_verwijder_map,
            email::email_berichten,
            email::email_bericht,
            email::email_bijlage,
            email::email_bron,
            email::email_markeer,
            email::email_verplaats,
            email::email_verwijder,
            email::email_verstuur,
            email::email_bewaar_concept,
            email::email_contacten,
            email::email_oauth_status,
            email::email_meld_aan_met_oauth,
            email::email_annuleer_oauth,
            email::email_bewaar_oauth_client,
            email::email_zoek_servers,
            email::bestanden::email_bewaar_bestand,
            email::bestanden::email_open_extern,
            email::bestanden::email_externe_inhoud,
            email::bestanden::email_open_link
        ])
        .build(tauri::generate_context!())
        .expect("De kantooromgeving kon niet starten")
        .run(|_app, gebeurtenis| match gebeurtenis {
            // Tijdelijk geopende e-mailbijlagen opruimen bij afsluiten.
            tauri::RunEvent::Exit => email::bestanden::ruim_tijdelijk_op(),
            // macOS geeft gekoppelde bestanden als gebeurtenis, niet als argument.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            tauri::RunEvent::Opened { urls } => {
                let paden = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .filter(|pad| pad.is_file())
                    .collect();
                systeembestanden::ontvang(_app, paden);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bewaart_lege_markdown_zonder_oude_inhoud_achter_te_laten() {
        let invoer = tauri::ipc::InvokeBody::Raw(Vec::new());
        assert!(lees_binaire_inhoud(&invoer, false).is_err());
        let bytes = lees_binaire_inhoud(&invoer, true).unwrap();
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("lege-pagina.md");
        std::fs::write(&pad, b"oude inhoud").unwrap();
        schrijf_atomair(&pad, &bytes).unwrap();
        assert!(std::fs::read(&pad).unwrap().is_empty());
        assert!(lees_binaire_inhoud(
            &tauri::ipc::InvokeBody::Json(serde_json::json!("geen binaire inhoud")),
            true
        )
        .is_err());
    }
    #[test]
    fn vervangt_bestand_volledig() {
        let map = tempfile::tempdir().unwrap();
        let pad = map.path().join("test.docx");
        std::fs::write(&pad, b"oude langere inhoud").unwrap();
        schrijf_atomair(&pad, b"nieuw").unwrap();
        assert_eq!(std::fs::read(&pad).unwrap(), b"nieuw");
        assert_eq!(std::fs::read_dir(map.path()).unwrap().count(), 1);
    }
    #[test]
    fn tijdelijk_bestand_eindigt_op_tmp() {
        let map = tempfile::tempdir().unwrap();
        let tijdelijk = tempfile::Builder::new()
            .prefix(".~oos-")
            .suffix(".tmp")
            .tempfile_in(map.path())
            .unwrap();
        let naam = tijdelijk.path().file_name().unwrap().to_str().unwrap().to_owned();
        assert!(naam.starts_with(".~oos-") && naam.ends_with(".tmp"), "{naam}");
    }
    #[test]
    fn fout_laat_bestaande_inhoud_met_rust() {
        let map = tempfile::tempdir().unwrap();
        let origineel = map.path().join("origineel.docx");
        std::fs::write(&origineel, b"behouden").unwrap();
        assert!(schrijf_atomair(&map.path().join("ontbreekt/test.docx"), b"nieuw").is_err());
        assert_eq!(std::fs::read(origineel).unwrap(), b"behouden");
    }
}
