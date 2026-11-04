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

/// Gewone invoer gebruikt dezelfde brongebonden kern, zonder Wasm-werkerbewerking.
#[tauri::command]
pub async fn writer_tekst_voorbereiden(
    aanvraag: office_writer_plakken::TekstAanvraag,
) -> Result<office_writer_plakken::Antwoord, String> {
    tauri::async_runtime::spawn_blocking(move || office_writer_plakken::bereid_tekst_voor(aanvraag))
        .await
        .map_err(|fout| format!("De Writer-tekstvoorbereiding is afgebroken: {fout}"))?
}
