//! Meet echte bestanden; rapporteert openen, eerste beeld en herhaald beeld.
use office_core::{
    document::{Module, Sessie},
    opslag,
};
use std::{path::PathBuf, time::Instant};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    for bestand in std::env::args_os().skip(1) {
        let pad = PathBuf::from(bestand);
        let module =
            Module::van_extensie(pad.extension().and_then(|s| s.to_str()).unwrap_or_default())?;
        let (bron, _) = opslag::lees(&pad)?;
        let start = Instant::now();
        let sessie = Sessie::open(module, bron)?;
        let openen = start.elapsed();
        let start = Instant::now();
        let beeld = sessie.weergave(0)?;
        let eerste = start.elapsed();
        let start = Instant::now();
        for _ in 0..10 {
            let _ = sessie.weergave(0)?;
        }
        let herhaald = start.elapsed() / 10;
        println!(
            "{}",
            serde_json::json!({"bestand":pad.file_name().unwrap_or_default().to_string_lossy(),"open_ms":openen.as_secs_f64()*1000.,"eerste_beeld_ms":eerste.as_secs_f64()*1000.,"herhaald_beeld_ms":herhaald.as_secs_f64()*1000.,"onderdelen":beeld.onderdelen.len()})
        );
    }
    Ok(())
}
