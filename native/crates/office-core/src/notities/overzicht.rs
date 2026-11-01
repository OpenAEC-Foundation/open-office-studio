//! Namen blijven losse bronvelden; navigatie gebruikt de werkelijke pagina-index.
use super::*;

#[derive(Debug, Clone)]
pub struct NotitieOverzicht {
    pub boek: usize,
    pub sectie: usize,
    pub boeken: Vec<BoekOverzicht>,
}
#[derive(Debug, Clone)]
pub struct BoekOverzicht {
    pub naam: String,
    pub secties: Vec<SectieOverzicht>,
}
#[derive(Debug, Clone)]
pub struct SectieOverzicht {
    pub naam: String,
    pub markdown: bool,
    pub paginas: Vec<PaginaOverzicht>,
}
#[derive(Debug, Clone)]
pub struct PaginaOverzicht {
    pub deel: usize,
    pub titel: String,
    pub voorbeeld: String,
    pub bijgewerkt: String,
    pub verwijderd: bool,
    pub vastgezet: bool,
}

pub(super) fn teksten(p: &Value, markdown: bool) -> Vec<&str> {
    if markdown {
        return vec![p["markdown"].as_str().unwrap_or_default()];
    }
    let mut vakken: Vec<_> = p["vakken"].as_array().into_iter().flatten().collect();
    let getal = |v: &Value, k: &str| v[k].as_f64().unwrap_or(0.);
    vakken.sort_by(|a, b| {
        getal(a, "y")
            .total_cmp(&getal(b, "y"))
            .then_with(|| getal(a, "x").total_cmp(&getal(b, "x")))
    });
    vakken
        .into_iter()
        .flat_map(|v| v["blokken"].as_array().into_iter().flatten())
        .map(|b| b["tekst"].as_str().unwrap_or_default())
        .collect()
}

fn voorbeeld(p: &Value, markdown: bool) -> String {
    let mut uit = String::new();
    let mut over = 90;
    // De oorspronkelijke kaart toont hoogstens 90 UTF-16-eenheden. Breek een
    // Rust-teken niet doormidden en kopieer geen volledige grote paginabody.
    'tekst: for tekst in teksten(p, markdown) {
        for c in std::iter::once(' ').chain(tekst.chars()) {
            let c = if c.is_whitespace() { ' ' } else { c };
            if c == ' ' && (uit.is_empty() || uit.ends_with(' ')) {
                continue;
            }
            if c.len_utf16() > over {
                break 'tekst;
            }
            uit.push(c);
            over -= c.len_utf16();
        }
    }
    uit.trim_end().into()
}

pub(super) fn bouw(d: &Value, actief: usize) -> Resultaat<NotitieOverzicht> {
    let mut deel = 0;
    let mut gekozen = None;
    let mut boeken = Vec::new();
    for (bi, b) in d["boeken"].as_array().into_iter().flatten().enumerate() {
        let mut secties = Vec::new();
        for (si, s) in b["secties"].as_array().into_iter().flatten().enumerate() {
            let markdown = s["soort"] == "markdown";
            let mut paginas = Vec::new();
            for p in s["paginas"].as_array().into_iter().flatten() {
                if deel == actief {
                    gekozen = Some((bi, si));
                }
                paginas.push(PaginaOverzicht {
                    deel,
                    titel: p["titel"].as_str().unwrap_or_default().into(),
                    voorbeeld: voorbeeld(p, markdown),
                    bijgewerkt: p["bijgewerkt"].as_str().unwrap_or_default().into(),
                    verwijderd: p["verwijderd"] == true,
                    vastgezet: p["vastgezet"] == true,
                });
                deel += 1;
            }
            secties.push(SectieOverzicht {
                naam: s["naam"].as_str().unwrap_or_default().into(),
                markdown,
                paginas,
            });
        }
        boeken.push(BoekOverzicht {
            naam: b["naam"].as_str().unwrap_or_default().into(),
            secties,
        });
    }
    let (boek, sectie) = gekozen.ok_or_else(|| fout("Notitiepagina ontbreekt in het overzicht"))?;
    Ok(NotitieOverzicht {
        boek,
        sectie,
        boeken,
    })
}

#[cfg(test)]
mod tests {
    use crate::document::{Module, Sessie};
    use serde_json::json;
    #[test]
    fn notitie_overzicht_bewaart_identiteit_lege_delen_en_verwijderde_pagina_indices() {
        let pagina = |id: &str| json!({"id":id,"titel":"Dubbele / paginanaam","bijgewerkt":"2026-10-31T00:00:00.000Z","vastgezet":false,"verwijderd":id=="p1","vakken":[],"markdown":""});
        let bron=serde_json::to_vec(&json!({"formaat":"openaec-notities","versie":3,"boeken":[
            {"id":"b0","naam":"Dubbel / boek","secties":[{"id":"s0","naam":"Dubbele / sectie","soort":"canvas","paginas":[pagina("p0"),pagina("p1"),pagina("p2")]},{"id":"s1","naam":"Lege sectie","soort":"markdown","paginas":[]}]},
            {"id":"b1","naam":"Dubbel / boek","secties":[{"id":"s2","naam":"Dubbele / sectie","soort":"markdown","paginas":[pagina("p3")]}]},
            {"id":"b2","naam":"Leeg boek","secties":[]}],"uitbreiding":{"blijft":42}})).unwrap();
        let s = Sessie::open(Module::Notition, bron.clone()).unwrap();
        for (deel, boek, sectie) in [(0, 0, 0), (1, 0, 0), (2, 0, 0), (3, 1, 0)] {
            let p = s.weergave(deel).unwrap().notitie.unwrap();
            let o = &p.overzicht;
            assert_eq!((o.boek, o.sectie), (boek, sectie));
            assert_eq!(o.boeken.len(), 3);
            assert!(o.boeken[2].secties.is_empty());
            assert!(o.boeken[0].secties[1].paginas.is_empty());
            assert_eq!(o.boeken[0].naam, o.boeken[1].naam);
            assert_eq!(
                o.boeken[0].secties[0]
                    .paginas
                    .iter()
                    .map(|p| p.deel)
                    .collect::<Vec<_>>(),
                vec![0, 1, 2]
            );
            assert!(o.boeken[0].secties[0].paginas[1].verwijderd);
            assert_eq!(o.boeken[1].secties[0].paginas[0].deel, 3);
            assert_eq!(s.bron().as_slice(), bron);
            assert!(!s.kan_terug());
        }
    }
    #[test]
    fn notitie_overzicht_voorbeeld_volgt_canvasvolgorde_en_scheidt_geen_unicode_teken() {
        let mut bron: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../../../../docs/voorbeelden/Notitieboek.json"
        ))
        .unwrap();
        let vakken = bron["boeken"][0]["secties"][0]["paginas"][0]["vakken"]
            .as_array_mut()
            .unwrap();
        vakken[0]["y"] = json!(500);
        vakken[1]["blokken"][0]["tekst"] = json!(format!("{} einde", "🏠".repeat(45)));
        let bron = serde_json::to_vec(&bron).unwrap();
        let s = Sessie::open(Module::Notition, bron.clone()).unwrap();
        let p = s.weergave(0).unwrap().notitie.unwrap();
        assert_eq!(p.woorden, 5);
        let kaart = &p.overzicht.boeken[0].secties[0].paginas[0];
        assert_eq!(kaart.voorbeeld, "🏠".repeat(45));
        assert_eq!(kaart.voorbeeld.encode_utf16().count(), 90);
        assert_eq!(kaart.bijgewerkt, "2026-10-31T00:00:00.000Z");
        assert_eq!(s.bron().as_slice(), bron);
        assert!(!s.kan_terug());
    }
}
