//! Een bron in geheugen openen, weergeven, bewaren en opnieuw teruglezen.
//! Dit controleert één werkweergave, geen volledige functie- of pixelpariteit.
use office_core::{
    VERSIE,
    document::{Document, Module, Sessie},
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
/// Meet paginawissels apart van de gewone onafhankelijke bestandsrondgang.
/// De twee modi draaien in afzonderlijke processen met dezelfde bron en volgorde.
fn meet_paginas(args: &[String]) -> Result<Value, Box<dyn std::error::Error>> {
    if args.len() != 3 || !matches!(args[0].as_str(), "sessie" | "vers") {
        return Err("Gebruik: --meet-paginas sessie|vers <docx> <nulgebaseerde pagina's, gescheiden door komma's>".into());
    }
    let paginas = paginavolgorde(&args[2])?;
    let pad = PathBuf::from(&args[1]);
    if Module::van_extensie(pad.extension().and_then(|s| s.to_str()).unwrap_or(""))?
        != Module::Writer
    {
        return Err("Deze paginameting is alleen voor Writer".into());
    }
    let start = Instant::now();
    let (bytes, hash) = opslag::lees(&pad)?;
    let (sessie, vers) = if args[0] == "sessie" {
        (Some(Sessie::open(Module::Writer, bytes)?), None)
    } else {
        (None, Some(Document::open(Module::Writer, &bytes)?))
    };
    let open_ms = start.elapsed().as_millis();
    let mut metingen = Vec::new();
    for pagina in paginas {
        let begin = Instant::now();
        let beeld = match (&sessie, &vers) {
            (Some(s), _) => s.weergave(pagina)?,
            (_, Some(d)) => d.weergave(pagina)?,
            _ => unreachable!(),
        };
        let weergave_ms = begin.elapsed().as_millis();
        if pagina >= beeld.onderdelen.len() {
            return Err("Een gevraagde pagina bestaat niet".into());
        }
        let p = &beeld.pagina;
        let vlak = |r: &office_core::interactie::Rechthoek| json!([r.x, r.y, r.breedte, r.hoogte]);
        let geometrie = json!({"breedte":p.breedte,"hoogte":p.hoogte,
            "inhoud":p.inhoud.as_ref().map(vlak),
            "vlakken":p.vlakken.iter().map(|v|json!({"id":v.id,"grens":vlak(&v.grens)})).collect::<Vec<_>>()});
        let velden: Vec<_> = beeld.velden.iter().map(|v| json!({"id":v.id,"naam":v.naam,"tekst":v.tekst,"bewerkbaar":v.bewerkbaar,"opmaak":format!("{:?}",v.opmaak)})).collect();
        let png = beeld.afbeelding.as_deref().ok_or("Geen paginabeeld")?;
        metingen.push(json!({"pagina":pagina,"weergave_ms":weergave_ms,
            "png_sha256":opslag::hash(png),"geometrie_sha256":opslag::hash(&serde_json::to_vec(&geometrie)?),
            "velden_sha256":opslag::hash(&serde_json::to_vec(&velden)?),"onderdelen":beeld.onderdelen.len(),"melding":beeld.melding}));
    }
    Ok(
        json!({"status":"geslaagd","modus":args[0],"bron_sha256":hash,"open_ms":open_ms,
        "totaal_ms":start.elapsed().as_millis(),"paginas":metingen,
        "omvang":"Paginawissels in dezelfde documentinstantie; PNG-, klikgeometrie- en zichtbare veldhashes. Geen volledige inhouds-, GUI- of pariteitscontrole."}),
    )
}
fn paginavolgorde(tekst: &str) -> Result<Vec<usize>, Box<dyn std::error::Error>> {
    let paginas = tekst
        .split(',')
        .map(str::parse::<usize>)
        .collect::<Result<Vec<_>, _>>()?;
    if paginas.is_empty() || paginas.len() > 32 || paginas.iter().any(|p| *p > 100_000) {
        return Err("Geef één tot 32 nulgebaseerde paginanummers, elk maximaal 100000".into());
    }
    Ok(paginas)
}

fn main() {
    let profiel = if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(pad) = args.first() else {
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
        .spawn(move || {
            if args[0] == "--meet-paginas" {
                meet_paginas(&args[1..]).unwrap_or_else(
                    |e| json!({"status":"geweigerd","fase":"paginameting","fout":e.to_string()}),
                )
            } else {
                rapporteer(args[0].clone().into())
            }
        })
        .and_then(|t| {
            t.join()
                .map_err(|_| std::io::Error::other("Bestandscontrole afgebroken"))
        });
    let mut v = resultaat.unwrap_or_else(
        |e| json!({"status":"enginepaniek","fase":"werkdraad","fout":e.to_string()}),
    );
    v["native_versie"] = json!(VERSIE);
    v["bouwprofiel"] = json!(profiel);
    if v.get("omvang").is_none() {
        v["omvang"] = json!(
            "Openen, eerste werkweergave, serialiseren en teruglezen; geen volledige functie-, inhouds-, stijl- of pixelcontrole"
        );
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paginameting_behoudt_volgorde_en_weigert_onbegrensde_of_ongeldige_invoer() {
        assert_eq!(
            paginavolgorde("0,1,2,3,4,0").unwrap(),
            vec![0, 1, 2, 3, 4, 0]
        );
        for fout in ["", "-1", "0,", "abc", "100001", &vec!["0"; 33].join(",")] {
            assert!(paginavolgorde(fout).is_err(), "{fout}");
        }
        assert!(meet_paginas(&[]).is_err());
        assert!(meet_paginas(&["onbekend".into(), "voorbeeld.docx".into(), "0".into()]).is_err());
        assert!(meet_paginas(&["sessie".into(), "voorbeeld.xlsx".into(), "0".into()]).is_err());
    }
}
