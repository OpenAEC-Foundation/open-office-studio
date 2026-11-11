//! Alleen een testbrug op stdin/stdout; geen Tauri, bestanden of gebruikerssessie.
use office_writer_plakken::HostJournaal;
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
fn main() -> io::Result<()> {
    let host = HostJournaal::default();
    let mut uit = io::stdout().lock();
    for regel in io::stdin().lock().lines() {
        let regel = regel?;
        let resultaat = match serde_json::from_str::<Value>(&regel) {
            Ok(v) => {
                let gegevens = v["argumenten"]["gegevens"].clone();
                let r = match v["command"].as_str() {
                    Some("writer_journaal_mogelijkheden") => Ok(host.mogelijkheden()),
                    Some("writer_journaal_openen") => host.open("proefvenster", gegevens),
                    Some("writer_journaal_voorbereiden") => host.bereid("proefvenster", gegevens),
                    Some("writer_journaal_vergeten") => {
                        host.vergeet("proefvenster", gegevens).map(|_| Value::Null)
                    }
                    _ => {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidInput,
                            "Onbekende proefopdracht",
                        ));
                    }
                };
                match r {
                    Ok(r) => json!({"ok":r}),
                    Err(e) => json!({"fout":e}),
                }
            }
            Err(e) => json!({"fout":{"soort":"ongeldig","melding":e.to_string()}}),
        };
        serde_json::to_writer(&mut uit, &resultaat)?;
        writeln!(uit)?;
        uit.flush()?;
    }
    Ok(())
}
