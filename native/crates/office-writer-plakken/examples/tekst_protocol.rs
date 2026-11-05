//! De echte desktopcodec voor onafhankelijke tekstinvoer-/DOCX-proeven.
use std::{fs, path::Path};
fn voer() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Gebruik aanvraag.json antwoord.json".into());
    }
    let aanvraag: office_writer_plakken::TekstAanvraag =
        serde_json::from_slice(&fs::read(&args[1]).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let antwoord = office_writer_plakken::bereid_tekst_voor(aanvraag)?;
    fs::write(
        Path::new(&args[2]),
        serde_json::to_vec(&antwoord).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
fn main() {
    if let Err(e) = voer() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
