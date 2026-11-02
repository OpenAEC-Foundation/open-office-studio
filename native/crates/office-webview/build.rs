//! De bestaande stijlbron wordt bij het bouwen ingebed, zonder ontwikkelserver.
use base64::{Engine, engine::general_purpose::STANDARD};
use std::{env, fs, path::Path};

fn css(pad: &Path) -> String {
    println!("cargo:rerun-if-changed={}", pad.display());
    let bron = fs::read_to_string(pad).expect("Office-stijlbron lezen");
    bron.lines()
        .map(|regel| {
            if let Some(import) = regel
                .trim()
                .strip_prefix("@import \"")
                .and_then(|s| s.strip_suffix("\";"))
            {
                css(&pad.parent().unwrap().join(import))
            } else {
                format!("{regel}\n")
            }
        })
        .collect()
}

fn main() {
    let basis = env::var("CARGO_MANIFEST_DIR").unwrap();
    let basis = Path::new(&basis);
    let repo = basis.join("../../..");
    let mut stijl = String::new();
    let assets = basis.join("assets");
    println!(
        "cargo:rerun-if-changed={}",
        assets.join("bron.json").display()
    );
    let letters: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(assets.join("bron.json")).unwrap())
            .expect("Letterbronlijst lezen");
    for naam in letters["letterstijlen"].as_array().unwrap() {
        let pad = assets.join(naam.as_str().unwrap());
        println!("cargo:rerun-if-changed={}", pad.display());
        let mut bron = fs::read_to_string(pad).expect("Oorspronkelijke letterstijl lezen");
        while let Some(begin) = bron.find("url(./files/") {
            let einde = begin + bron[begin..].find(')').expect("Geldige letter-URL");
            let naam = &bron[begin + 6..einde];
            let pad = assets.join(naam);
            println!("cargo:rerun-if-changed={}", pad.display());
            let soort = if naam.ends_with(".woff2") {
                "woff2"
            } else {
                "woff"
            };
            let data =
                STANDARD.encode(fs::read(pad).expect("Oorspronkelijk interfacelettertype lezen"));
            bron.replace_range(
                begin..=einde,
                &format!("url(data:font/{soort};base64,{data})"),
            );
        }
        stijl.push_str(&bron);
    }
    println!("cargo:rerun-if-changed=stijlbronnen.json");
    let bronnen: serde_json::Value =
        serde_json::from_str(include_str!("stijlbronnen.json")).expect("Stijlbronlijst lezen");
    for bestand in bronnen["stijl"].as_array().unwrap() {
        stijl.push_str(&css(&repo.join(bestand.as_str().unwrap())));
    }
    let uit = env::var("OUT_DIR").unwrap();
    fs::write(Path::new(&uit).join("office.css"), stijl).expect("Ingebedde Office-stijl schrijven");
}
