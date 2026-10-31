//! Een bron in geheugen openen, weergeven, bewaren en opnieuw teruglezen.
//! Dit controleert één werkweergave, geen volledige functie- of pixelpariteit.
use office_core::{
    VERSIE,
    document::{Document, Module},
    opslag,
};
use serde_json::{Value, json};
use std::{path::PathBuf, time::Instant};

fn controleer(pad: PathBuf, fase: &mut &'static str) -> Result<Value, Box<dyn std::error::Error>> {
    let module = Module::van_extensie(pad.extension().and_then(|s| s.to_str()).unwrap_or(""))?;
    let start = Instant::now();
    *fase = "bron lezen";
    let (bytes, hash) = opslag::lees(&pad)?;
    *fase = "openen";
    let d = Document::open(module, &bytes)?;
    let open_ms = start.elapsed().as_millis();
    *fase = "eerste werkweergave";
    let beeld = d.weergave(0)?;
    let velden: Vec<_> = beeld.velden.iter().map(|v| (&v.naam, &v.tekst)).collect();
    let controlehash = opslag::hash(&serde_json::to_vec(&velden)?);
    let eerste_ms = start.elapsed().as_millis();
    *fase = "opslaan in geheugen";
    let bewaard = d.bytes()?;
    *fase = "opnieuw openen";
    let nieuw = Document::open(module, &bewaard)?;
    *fase = "teruggelezen werkweergave";
    let herlezen = nieuw.weergave(0)?;
    let velden: Vec<_> = herlezen
        .velden
        .iter()
        .map(|v| (&v.naam, &v.tekst))
        .collect();
    if opslag::hash(&serde_json::to_vec(&velden)?) != controlehash {
        return Ok(
            json!({"status":"rondgangverschil","fout":"Zichtbare tekstvelden wijken af na teruglezen"}),
        );
    }
    if beeld.onderdelen != herlezen.onderdelen {
        return Ok(
            json!({"status":"rondgangverschil","fout":"Onderdeelstructuur wijkt af na teruglezen"}),
        );
    }
    Ok(
        json!({"status":"geslaagd","module":module.naam(),"bron_sha256":hash,
        "bron_bytes":bytes.len(),"bewaard_bytes":bewaard.len(),"onderdelen":beeld.onderdelen.len(),
        "zichtbare_velden":beeld.velden.len(),"tekstcontrole_sha256":controlehash,
        "open_ms":open_ms,"eerste_weergave_ms":eerste_ms-open_ms,
        "totaal_ms":start.elapsed().as_millis(),"weergaves_getest":1}),
    )
}
fn main() {
    let profiel = if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    };
    let Some(pad) = std::env::args().nth(1) else {
        eprintln!("Gebruik: controleer-bestand <bronbestand> | --version");
        std::process::exit(2);
    };
    if pad == "--version" {
        println!("Open Office native bestandscontrole {VERSIE} ({profiel})");
        return;
    }
    let resultaat = std::thread::Builder::new()
        .name("office-bestandscontrole".into())
        .stack_size(64 * 1024 * 1024)
        .spawn(move || rapporteer(pad.into()))
        .and_then(|t| {
            t.join()
                .map_err(|_| std::io::Error::other("Bestandscontrole afgebroken"))
        });
    let mut v = resultaat.unwrap_or_else(
        |e| json!({"status":"enginepaniek","fase":"werkdraad","fout":e.to_string()}),
    );
    v["native_versie"] = json!(VERSIE);
    v["bouwprofiel"] = json!(profiel);
    v["omvang"] = json!(
        "Openen, eerste werkweergave, serialiseren en teruglezen; geen volledige functie-, inhouds-, stijl- of pixelcontrole"
    );
    println!("{v}");
}

fn rapporteer(pad: PathBuf) -> Value {
    let mut fase = "invoer";
    let resultaat =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| controleer(pad, &mut fase)));
    match resultaat {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => json!({"status":"geweigerd","fase":fase,"fout":e.to_string()}),
        Err(_) => json!({"status":"enginepaniek","fase":fase}),
    }
}
