/// Alle documentgegevens blijven eigendom van deze ene opdracht. De werker
/// krijgt geen verwijzing naar vensters, bestanden of de levende documentsessie.
#[tauri::command]
pub async fn writer_plakken_voorbereiden(
    aanvraag: office_writer_plakken::Aanvraag,
) -> Result<office_writer_plakken::Antwoord, String> {
    tauri::async_runtime::spawn_blocking(move || office_writer_plakken::bereid_voor(aanvraag))
        .await
        .map_err(|fout| format!("De Writer-plakvoorbereiding is afgebroken: {fout}"))?
}

/// Beide invoerprotocollen houden de daadwerkelijke voorbereiding buiten de UI.
#[tauri::command]
pub async fn writer_tekst_voorbereiden(
    venster: tauri::Window,
    voorraad: tauri::State<'_, office_writer_plakken::BronVoorraad>,
    aanvraag: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let eigenaar = venster.label().to_owned();
    let voorraad = voorraad.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        match aanvraag.get("schema").and_then(serde_json::Value::as_u64) {
            Some(1) => {
                let a = serde_json::from_value(aanvraag)
                    .map_err(|e| format!("Ongeldige Writer-invoer: {e}"))?;
                serde_json::to_value(office_writer_plakken::bereid_tekst_voor(a)?)
                    .map_err(|e| e.to_string())
            }
            Some(2) => {
                let a: office_writer_plakken::IncrementeleTekstAanvraag =
                    serde_json::from_value(aanvraag)
                        .map_err(|e| format!("Ongeldige incrementele Writer-invoer: {e}"))?;
                let binding = serde_json::json!({"schema":2,"requestId":a.request_id,
                    "documentId":a.document_id,"sourceVersion":a.source_version,
                    "snapshotSha256":a.snapshot_sha256,"clientId":a.client_id,"retryFull":true});
                match voorraad.bereid_voor(&eigenaar, a)? {
                    None => Ok(binding),
                    Some(r) => {
                        let mut antwoord =
                            serde_json::to_value(r.resultaat).map_err(|e| e.to_string())?;
                        let velden = antwoord.as_object_mut().ok_or("Ongeldig Writer-antwoord")?;
                        velden.insert("schema".into(), serde_json::json!(2));
                        velden.insert("basis".into(), serde_json::json!(r.basis));
                        velden.insert("bronvector".into(), serde_json::json!(r.bronvector));
                        Ok(antwoord)
                    }
                }
            }
            _ => Err("Onbekend schema voor Writer-invoer".into()),
        }
    })
    .await
    .map_err(|fout| format!("De Writer-tekstvoorbereiding is afgebroken: {fout}"))?
}

#[tauri::command]
pub fn writer_bron_vergeten(
    venster: tauri::Window,
    voorraad: tauri::State<'_, office_writer_plakken::BronVoorraad>,
    document_id: String,
) -> Result<(), String> {
    voorraad.vergeet_document(venster.label(), &document_id)
}

pub fn bij_venstergebeurtenis<R: tauri::Runtime>(
    venster: &tauri::Window<R>,
    gebeurtenis: &tauri::WindowEvent,
) {
    use tauri::Manager;
    if let tauri::WindowEvent::Destroyed = gebeurtenis {
        if let Err(fout) = venster
            .state::<office_writer_plakken::BronVoorraad>()
            .vergeet_eigenaar(venster.label())
        {
            eprintln!("{fout}");
        }
    }
}
