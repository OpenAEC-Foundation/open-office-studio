//! Houd na bronherstel dezelfde pagina vast, of val binnen hetzelfde boek terug.
use super::*;
#[derive(Debug, Clone)]
struct Onderdeel {
    id: Option<String>,
    index: usize,
}
#[derive(Debug, Clone)]
pub struct Anker {
    boek: Onderdeel,
    sectie: Onderdeel,
    pagina: Onderdeel,
}
fn onderdeel(v: &Value, index: usize) -> Onderdeel {
    Onderdeel {
        id: v["id"].as_str().map(str::to_owned),
        index,
    }
}
pub(crate) fn anker(d: &Value, deel: usize) -> Option<Anker> {
    let pad = pad(d, deel).ok()?;
    let n: Vec<usize> = pad.split('/').filter_map(|s| s.parse().ok()).collect();
    let boek = &d["boeken"][n[0]];
    let sectie = &boek["secties"][n[1]];
    Some(Anker {
        boek: onderdeel(boek, n[0]),
        sectie: onderdeel(sectie, n[1]),
        pagina: onderdeel(&sectie["paginas"][n[2]], n[2]),
    })
}
fn zoek(lijst: &[Value], doel: &Onderdeel) -> Option<usize> {
    match &doel.id {
        Some(id) => lijst.iter().position(|v| v["id"] == *id),
        None => (doel.index < lijst.len()).then_some(doel.index),
    }
}
pub(crate) fn herstel(d: &Value, anker: Option<&Anker>) -> usize {
    let alle = paginas(d);
    let vind = |prefix: &str| {
        alle.iter()
            .position(|(pad, _, _)| {
                pad.starts_with(prefix) && d.pointer(pad).is_some_and(|p| p["verwijderd"] != true)
            })
            .or_else(|| alle.iter().position(|(pad, _, _)| pad.starts_with(prefix)))
    };
    if let Some(a) = anker
        && let Some(boeken) = d["boeken"].as_array()
        && let Some(b) = zoek(boeken, &a.boek)
    {
        let boekpad = format!("/boeken/{b}/");
        if let Some(secties) = boeken[b]["secties"].as_array()
            && let Some(s) = zoek(secties, &a.sectie)
        {
            let sectiepad = format!("{boekpad}secties/{s}/paginas/");
            if let Some(paginas) = secties[s]["paginas"].as_array()
                && let Some(p) = zoek(paginas, &a.pagina)
                && let Some(n) = alle.iter().position(|v| v.0 == format!("{sectiepad}{p}"))
            {
                return n;
            }
            if let Some(n) = vind(&sectiepad) {
                return n;
            }
        }
        if let Some(n) = vind(&boekpad) {
            return n;
        }
    }
    vind("/boeken/").unwrap_or(0)
}
