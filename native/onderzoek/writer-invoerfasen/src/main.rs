//! Afzonderlijke regelgewijze proef; geen desktop- of gebruikersdocumenten openen.
use office_writer_plakken::{BronSpiegel, IncrementeleTekstAanvraag};
use std::io::{self, BufRead, Write};
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut spiegel = BronSpiegel::default();
    let mut uit = io::BufWriter::new(io::stdout().lock());
    for regel in io::stdin().lock().lines() {
        let regel = regel?;
        // Zelfde grens als de kern; ook de JSON-verpakking blijft begrensd.
        if regel.len() > 150 * 1024 * 1024 { return Err("Proefaanvraag te groot".into()); }
        let begin = Instant::now();
        let antwoord = match serde_json::from_str::<IncrementeleTekstAanvraag>(&regel) {
            Ok(a) => match spiegel.bereid_voor(a) {
                Ok(a) => serde_json::json!({"ok":true,"antwoord":a,"totaal_ns":begin.elapsed().as_nanos() as u64}),
                Err(fout) => serde_json::json!({"ok":false,"fout":fout}),
            },
            Err(fout) => serde_json::json!({"ok":false,"fout":fout.to_string()}),
        };
        serde_json::to_writer(&mut uit, &antwoord)?;
        writeln!(uit)?; uit.flush()?;
    }
    Ok(())
}
