//! Notitieboeken, pagina's en vrije tekstvakken. Onbekende bronvelden blijven behouden.
use crate::{
    document::{Fout, Resultaat, Veld, Weergave},
    interactie::Rechthoek,
    opmaak::{Opmaak, OpmaakStaat},
};
use serde_json::{Value, json};
fn fout(s: &str) -> Fout {
    Fout::Document(s.into())
}
fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn nu() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
#[derive(Debug, Clone)]
pub struct Vak {
    pub index: usize,
    pub grens: Rechthoek,
    pub velden: Vec<usize>,
}
#[derive(Debug, Clone)]
pub struct NotitiePagina {
    pub pad: String,
    pub titel: String,
    pub markdown: bool,
    pub vakken: Vec<Vak>,
}
#[derive(Debug, Clone)]
pub enum NotitieActie {
    NieuwVak {
        x: f32,
        y: f32,
    },
    Plaats {
        vak: usize,
        grens: Rechthoek,
    },
    VerwijderVak(usize),
    NieuwBlok(usize),
    Taak {
        vak: usize,
        blok: usize,
        klaar: bool,
    },
    NieuwePagina,
    NieuweSectie {
        markdown: bool,
    },
    NieuwBoek,
    Sectiesoort {
        markdown: bool,
    },
    Prullenbak(bool),
    Vastzetten(bool),
}
fn pagina() -> Value {
    json!({"id":id(),"titel":"Nieuwe pagina","bijgewerkt":nu(),"vastgezet":false,"verwijderd":false,"vakken":[],"markdown":""})
}
fn sectie(markdown: bool) -> Value {
    json!({"id":id(),"naam":"Nieuwe sectie","soort":if markdown{"markdown"}else{"canvas"},"paginas":[pagina()]})
}
fn boek() -> Value {
    json!({"id":id(),"naam":"Nieuw notitieboek","secties":[sectie(false)]})
}
fn blok() -> Value {
    json!({"id":id(),"soort":"tekst","tekst":"","vet":false,"cursief":false,"klaar":false})
}
fn vak(x: f32, y: f32) -> Value {
    json!({"id":id(),"x":x,"y":y,"breedte":560,"hoogte":160,"blokken":[blok()]})
}
fn grenzen(g: Rechthoek) -> Resultaat<()> {
    if ![g.x, g.y, g.breedte, g.hoogte]
        .iter()
        .all(|n| n.is_finite())
        || !(0.0..=10000.).contains(&g.x)
        || !(0.0..=20000.).contains(&g.y)
        || !(200.0..=2000.).contains(&g.breedte)
        || !(80.0..=5000.).contains(&g.hoogte)
    {
        return Err(fout("Ongeldige positie of afmeting van tekstvak"));
    }
    Ok(())
}
pub fn open(mut d: Value) -> Resultaat<Value> {
    let versie = d["versie"].as_u64().unwrap_or_default();
    if d["formaat"] != "openaec-notities" || !matches!(versie, 1..=3) || !d["boeken"].is_array() {
        return Err(fout("Geen ondersteund notitieboek"));
    }
    let boeken = d["boeken"].as_array().unwrap();
    if boeken.len() > 100 {
        return Err(fout("Te veel notitieboeken"));
    }
    let mut paginas = 0;
    for b in boeken {
        let secties = b["secties"]
            .as_array()
            .ok_or_else(|| fout("Secties ontbreken"))?;
        if secties.len() > 200 {
            return Err(fout("Te veel secties"));
        }
        for s in secties {
            let lijst = s["paginas"]
                .as_array()
                .ok_or_else(|| fout("Pagina's ontbreken"))?;
            if lijst.len() > 2000 {
                return Err(fout("Te veel pagina's in sectie"));
            }
            for p in lijst {
                if !p.is_object() {
                    return Err(fout("Ongeldige notitiepagina"));
                }
            }
            paginas += lijst.len();
        }
    }
    if paginas > 5000 {
        return Err(fout("Te veel notitiepagina's"));
    }
    if versie < 3 {
        for b in d["boeken"].as_array_mut().unwrap() {
            for s in b["secties"]
                .as_array_mut()
                .ok_or_else(|| fout("Secties ontbreken"))?
            {
                s["soort"] = json!("canvas");
                for p in s["paginas"]
                    .as_array_mut()
                    .ok_or_else(|| fout("Pagina's ontbreken"))?
                {
                    p["markdown"] = json!("");
                    if versie == 1 {
                        let mut v = vak(40., 32.);
                        v["blokken"] = p["blokken"].clone();
                        p["vakken"] = json!([v]);
                    }
                }
            }
        }
        d["versie"] = json!(3);
    }
    controleer(&d)?;
    Ok(d)
}
pub fn controleer(d: &Value) -> Resultaat<()> {
    if d["boeken"].as_array().is_none_or(|b| b.len() > 100) {
        return Err(fout("Ongeldig aantal notitieboeken"));
    }
    let mut totaal_paginas = 0;
    let mut blokken = 0;
    let mut ids = std::collections::HashSet::new();
    for boek in d["boeken"]
        .as_array()
        .ok_or_else(|| fout("Boeken ontbreken"))?
    {
        if boek["secties"].as_array().is_none_or(|s| s.len() > 200) {
            return Err(fout("Ongeldig aantal secties"));
        }
        for sectie in boek["secties"]
            .as_array()
            .ok_or_else(|| fout("Secties ontbreken"))?
        {
            if sectie["soort"].is_string()
                && sectie["soort"] != "canvas"
                && sectie["soort"] != "markdown"
            {
                return Err(fout("Onbekende sectiesoort"));
            }
            let paginas = sectie["paginas"]
                .as_array()
                .ok_or_else(|| fout("Pagina's ontbreken"))?;
            if paginas.len() > 2000 {
                return Err(fout("Te veel pagina's in sectie"));
            }
            totaal_paginas += paginas.len();
            if totaal_paginas > 5000 {
                return Err(fout("Te veel notitiepagina's"));
            }
            for p in paginas {
                for vlag in ["verwijderd", "vastgezet"] {
                    if p.get(vlag).is_some_and(|v| !v.is_boolean()) {
                        return Err(fout("Ongeldige paginavlag"));
                    }
                }
                let vakken = p["vakken"]
                    .as_array()
                    .ok_or_else(|| fout("Tekstvakken ontbreken"))?;
                if vakken.len() > 2000 {
                    return Err(fout("Te veel tekstvakken"));
                }
                let mut aantal = 0;
                for vak in vakken {
                    let n = |k: &str| {
                        vak[k]
                            .as_f64()
                            .map(|n| n as f32)
                            .ok_or_else(|| fout("Ongeldige positie of afmeting van tekstvak"))
                    };
                    grenzen(Rechthoek {
                        x: n("x")?,
                        y: n("y")?,
                        breedte: n("breedte")?,
                        hoogte: n("hoogte")?,
                    })?;
                    let lijst = vak["blokken"]
                        .as_array()
                        .ok_or_else(|| fout("Tekstblokken ontbreken"))?;
                    for blok in lijst {
                        if !blok["tekst"].is_string() {
                            return Err(fout("Ongeldige bloktekst"));
                        }
                        if let Some(id) = blok["id"].as_str()
                            && !ids.insert(id)
                        {
                            return Err(fout("Dubbel tekstblok-id"));
                        }
                    }
                    aantal += lijst.len();
                }
                if aantal > 2000 {
                    return Err(fout("Te veel tekstblokken op pagina"));
                }
                blokken += aantal;
            }
        }
    }
    if blokken > 30000 {
        return Err(fout("Te veel tekstblokken"));
    }
    Ok(())
}
fn paginas(d: &Value) -> Vec<(String, String, bool)> {
    let mut uit = vec![];
    for (b, boek) in d["boeken"].as_array().into_iter().flatten().enumerate() {
        for (s, sectie) in boek["secties"].as_array().into_iter().flatten().enumerate() {
            for (p, pagina) in sectie["paginas"]
                .as_array()
                .into_iter()
                .flatten()
                .enumerate()
            {
                // Verwijderde pagina's blijven beschikbaar en kunnen worden hersteld.
                uit.push((
                    format!("/boeken/{b}/secties/{s}/paginas/{p}"),
                    format!(
                        "{} / {} / {}{}",
                        boek["naam"].as_str().unwrap_or("Boek"),
                        sectie["naam"].as_str().unwrap_or("Sectie"),
                        if pagina["verwijderd"] == true {
                            "Prullenbak · "
                        } else {
                            ""
                        },
                        pagina["titel"].as_str().unwrap_or("Pagina")
                    ),
                    sectie["soort"] == "markdown",
                ));
            }
        }
    }
    uit
}
fn pad(d: &Value, deel: usize) -> Resultaat<String> {
    paginas(d)
        .get(deel)
        .map(|p| p.0.clone())
        .ok_or_else(|| fout("Notitiepagina bestaat niet"))
}
pub fn toon(d: &Value, deel: usize, beeld: &mut Weergave) -> Resultaat<()> {
    let alle = paginas(d);
    beeld.onderdelen = alle.iter().map(|p| p.1.clone()).collect();
    if alle.is_empty() {
        beeld.melding = "Leeg notitieboek · maak een boek aan".into();
        return Ok(());
    }
    let (pad, _, markdown) = alle
        .get(deel)
        .ok_or_else(|| fout("Notitiepagina bestaat niet"))?;
    let p = d.pointer(pad).unwrap();
    let mut veld = |naam: &str, achter: &str, tekst: String, staat: OpmaakStaat| {
        let n = beeld.velden.len();
        beeld.velden.push(Veld {
            id: format!("{pad}/{achter}"),
            naam: naam.into(),
            tekst,
            bewerkbaar: p["verwijderd"] != true,
            opmaak: staat,
        });
        n
    };
    veld(
        "Paginatitel",
        "titel",
        p["titel"].as_str().unwrap_or_default().into(),
        Default::default(),
    );
    let mut vakken = vec![];
    if *markdown {
        veld(
            "Markdown",
            "markdown",
            p["markdown"].as_str().unwrap_or_default().into(),
            Default::default(),
        );
    } else {
        for (v, vak) in p["vakken"].as_array().into_iter().flatten().enumerate() {
            let nummer =
                |k: &str, standaard: f32| vak[k].as_f64().map(|n| n as f32).unwrap_or(standaard);
            let grens = Rechthoek {
                x: nummer("x", 40.),
                y: nummer("y", 32.),
                breedte: nummer("breedte", 560.),
                hoogte: nummer("hoogte", 160.),
            };
            grenzen(grens)?;
            let mut velden = vec![];
            for (b, blok) in vak["blokken"].as_array().into_iter().flatten().enumerate() {
                let soort = blok["soort"].as_str().unwrap_or("tekst");
                velden.push(veld(
                    soort,
                    &format!("vakken/{v}/blokken/{b}/tekst"),
                    blok["tekst"].as_str().unwrap_or_default().into(),
                    OpmaakStaat {
                        vet: blok["vet"] == true,
                        cursief: blok["cursief"] == true,
                        ..Default::default()
                    },
                ));
            }
            vakken.push(Vak {
                index: v,
                grens,
                velden,
            });
        }
    }
    beeld.notitie = Some(NotitiePagina {
        pad: pad.clone(),
        titel: p["titel"].as_str().unwrap_or_default().into(),
        markdown: *markdown,
        vakken,
    });
    beeld.melding = format!(
        "{} · {} · {}",
        if *markdown { "Markdown" } else { "Vrij canvas" },
        if p["vastgezet"] == true {
            "vastgezet"
        } else {
            "notitiepagina"
        },
        if p["verwijderd"] == true {
            "in prullenbak"
        } else {
            "lokaal"
        }
    );
    Ok(())
}
pub fn bewerk(d: &mut Value, deel: usize, actie: NotitieActie) -> Resultaat<()> {
    if matches!(actie, NotitieActie::NieuwBoek) {
        let boeken = d["boeken"]
            .as_array_mut()
            .ok_or_else(|| fout("Boeken ontbreken"))?;
        if boeken.len() >= 100 {
            return Err(fout("Te veel notitieboeken"));
        }
        boeken.push(boek());
        return Ok(());
    }
    let pad = pad(d, deel)?;
    let sectiepad = pad.rsplit_once("/paginas/").unwrap().0;
    match actie {
        NotitieActie::NieuweSectie { markdown } => {
            let boekpad = sectiepad.rsplit_once("/secties/").unwrap().0;
            d.pointer_mut(&format!("{boekpad}/secties"))
                .and_then(Value::as_array_mut)
                .ok_or_else(|| fout("Secties ontbreken"))?
                .push(sectie(markdown));
            return Ok(());
        }
        NotitieActie::NieuwePagina => {
            d.pointer_mut(&format!("{sectiepad}/paginas"))
                .and_then(Value::as_array_mut)
                .ok_or_else(|| fout("Pagina's ontbreken"))?
                .push(pagina());
            return Ok(());
        }
        NotitieActie::Sectiesoort { markdown } => {
            *d.pointer_mut(&format!("{sectiepad}/soort"))
                .ok_or_else(|| fout("Sectiesoort ontbreekt"))? =
                json!(if markdown { "markdown" } else { "canvas" });
            return Ok(());
        }
        _ => {}
    }
    let p = d
        .pointer_mut(&pad)
        .ok_or_else(|| fout("Pagina bestaat niet"))?;
    if p["verwijderd"] == true && !matches!(actie, NotitieActie::Prullenbak(false)) {
        return Err(fout("Herstel de pagina eerst uit de prullenbak"));
    }
    match actie {
        NotitieActie::NieuwVak { x, y } => {
            grenzen(Rechthoek {
                x,
                y,
                breedte: 560.,
                hoogte: 160.,
            })?;
            let lijst = p["vakken"]
                .as_array_mut()
                .ok_or_else(|| fout("Tekstvakken ontbreken"))?;
            if lijst.len() >= 2000 {
                return Err(fout("Te veel tekstvakken"));
            }
            lijst.push(vak(x, y));
        }
        NotitieActie::Plaats { vak, grens } => {
            grenzen(grens)?;
            let v = p["vakken"]
                .get_mut(vak)
                .ok_or_else(|| fout("Tekstvak bestaat niet"))?;
            for (naam, n) in [
                ("x", grens.x),
                ("y", grens.y),
                ("breedte", grens.breedte),
                ("hoogte", grens.hoogte),
            ] {
                v[naam] = json!(n.round());
            }
        }
        NotitieActie::VerwijderVak(v) => {
            let lijst = p["vakken"]
                .as_array_mut()
                .ok_or_else(|| fout("Tekstvakken ontbreken"))?;
            if v >= lijst.len() {
                return Err(fout("Tekstvak bestaat niet"));
            }
            lijst.remove(v);
        }
        NotitieActie::NieuwBlok(v) => p["vakken"]
            .get_mut(v)
            .and_then(|v| v["blokken"].as_array_mut())
            .ok_or_else(|| fout("Tekstvak bestaat niet"))?
            .push(blok()),
        NotitieActie::Taak { vak, blok, klaar } => {
            let b = p["vakken"]
                .get_mut(vak)
                .and_then(|v| v["blokken"].get_mut(blok))
                .ok_or_else(|| fout("Blok bestaat niet"))?;
            b["soort"] = json!("taak");
            b["klaar"] = json!(klaar);
        }
        NotitieActie::Prullenbak(v) => p["verwijderd"] = json!(v),
        NotitieActie::Vastzetten(v) => p["vastgezet"] = json!(v),
        _ => return Err(fout("Onbekende notitieopdracht")),
    }
    p["bijgewerkt"] = json!(nu());
    Ok(())
}
pub fn opmaak(d: &mut Value, deel: usize, id: &str, stijl: &Opmaak) -> Resultaat<()> {
    let p = pad(d, deel)?;
    if !id.starts_with(&format!("{p}/vakken/"))
        || d.pointer(&p).is_some_and(|p| p["verwijderd"] == true)
    {
        return Err(fout("Selecteer een bewerkbaar tekstblok"));
    }
    let blok = id
        .strip_suffix("/tekst")
        .ok_or_else(|| fout("Selecteer een tekstblok"))?;
    let b = d
        .pointer_mut(blok)
        .ok_or_else(|| fout("Tekstblok bestaat niet"))?;
    match stijl {
        Opmaak::Vet(v) => b["vet"] = json!(v),
        Opmaak::Cursief(v) => b["cursief"] = json!(v),
        _ => return Err(fout("Deze blokopmaak wordt nog niet ondersteund")),
    }
    Ok(())
}

pub fn tekst(d: &mut Value, deel: usize, id: &str, tekst: &str) -> Resultaat<()> {
    if tekst.len() > 500_000 {
        return Err(fout("Notitietekst te lang"));
    }
    let p = pad(d, deel)?;
    if d.pointer(&p).is_some_and(|p| p["verwijderd"] == true) {
        return Err(fout("Herstel de pagina eerst uit de prullenbak"));
    }
    if !id.starts_with(&format!("{p}/"))
        || !(id == format!("{p}/titel")
            || id == format!("{p}/markdown")
            || (id.starts_with(&format!("{p}/vakken/")) && id.ends_with("/tekst")))
    {
        return Err(fout("Geen bewerkbaar tekstveld op deze pagina"));
    }
    let veld = d
        .pointer_mut(id)
        .ok_or_else(|| fout("Notitieveld bestaat niet"))?;
    if !veld.is_string() {
        return Err(fout("Geen tekstveld"));
    }
    *veld = json!(tekst);
    d.pointer_mut(&p).unwrap()["bijgewerkt"] = json!(nu());
    Ok(())
}
