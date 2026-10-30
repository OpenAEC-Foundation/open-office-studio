//! Het eigen IFCX-bewaarprofiel 0.1.0-draft.1. Dit is bronarchivering,
//! geen claim dat de semantische Office-standaard al is vastgesteld.
use crate::{
    document::{Fout, Module, Resultaat},
    opslag::hash,
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
const COLLECTIE: &str = "openaec::office::collection";
const DOCUMENT: &str = "openaec::office::document";
const PAYLOAD: &str = "openaec::office::payload";
const PROFIEL: &str = "0.1.0-draft.1";
const MAX_BRON: usize = 12_000_000;
fn fout(tekst: &str) -> Fout {
    Fout::Document(tekst.into())
}
fn soort(module: Module) -> &'static str {
    match module {
        Module::Writer => "writer",
        Module::Spreadsheet => "spreadsheet",
        Module::Presentation => "presentation",
        Module::Notition => "notition",
        Module::Email => "email",
    }
}
fn media(module: Module) -> &'static str {
    match module {
        Module::Writer => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Module::Spreadsheet => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Module::Presentation => {
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        }
        Module::Notition => "application/json",
        Module::Email => "message/rfc822",
    }
}
pub fn maak(module: Module, naam: &str, bytes: &[u8]) -> Resultaat<Vec<u8>> {
    if bytes.len() > MAX_BRON {
        return Err(fout("Bron groter dan 12 MB voor dit IFCX-bewaarprofiel"));
    }
    let sha = hash(bytes);
    let bron = format!("/office/payload/{sha}");
    let waarde = json!({"header":{"id":format!("urn:openaec:office:{sha}"),"ifcxVersion":"ifcx_alpha","dataVersion":"1.0.0","author":"OpenAEC"},"imports":[],"schemas":serde_json::from_str::<Value>(include_str!("ifcx-schema.json"))?,"data":[
        {"path":"/office/voorbeeld","children":{"document":"/office/document/een"},"attributes":{COLLECTIE:{"profileVersion":PROFIEL,"title":naam}}},
        {"path":"/office/document/een","attributes":{DOCUMENT:{"kind":soort(module),"title":naam,"source":bron}}},
        {"path":bron,"attributes":{PAYLOAD:{"fileName":naam,"mediaType":media(module),"byteLength":bytes.len(),"sha256":sha,"encoding":"base64","content":STANDARD.encode(bytes)}}}
    ]});
    Ok(serde_json::to_vec_pretty(&waarde)?)
}
/// De native app opent één document per tab. Een dossier met meerdere bronnen
/// vraagt later een documentkiezer; stil het eerste kiezen zou inhoud verbergen.
pub fn lees(bytes: &[u8]) -> Resultaat<(Module, String, Vec<u8>)> {
    if bytes.len() > 20_000_000 {
        return Err(fout("IFCX-dossier te groot"));
    }
    let d: Value = serde_json::from_slice(bytes)?;
    if d["header"]["ifcxVersion"] != "ifcx_alpha" || d["imports"] != json!([]) {
        return Err(fout("Niet-ondersteunde IFCX-versie of imports"));
    }
    let schema: Value = serde_json::from_str(include_str!("ifcx-schema.json"))?;
    for (k, v) in schema.as_object().unwrap() {
        if d["schemas"][k] != *v {
            return Err(fout("Afwijkend IFCX-bewaarprofiel"));
        }
    }
    let nodes = d["data"]
        .as_array()
        .filter(|n| n.len() <= 1000)
        .ok_or_else(|| fout("Ongeldige IFCX-nodes"))?;
    let mut paden = std::collections::HashSet::new();
    for node in nodes {
        let pad = node["path"]
            .as_str()
            .ok_or_else(|| fout("Node zonder pad"))?;
        if !pad.starts_with("/office/")
            || !pad.chars().all(|c| c.is_ascii_alphanumeric() || c == '/')
            || !paden.insert(pad)
        {
            return Err(fout("Ongeldig of dubbel nodepad"));
        }
        if node
            .get("inherits")
            .is_some_and(|v| v.as_object().is_none_or(|o| !o.is_empty()))
        {
            return Err(fout("Overerving nog niet ondersteund"));
        }
    }
    let root: Vec<_> = nodes
        .iter()
        .filter(|n| n["attributes"].get(COLLECTIE).is_some())
        .collect();
    if root.len() != 1 || root[0]["attributes"][COLLECTIE]["profileVersion"] != PROFIEL {
        return Err(fout("Onbekende dossierroot of profielversie"));
    }
    let docs: Vec<_> = nodes
        .iter()
        .filter(|n| n["attributes"].get(DOCUMENT).is_some())
        .collect();
    if docs.len() != 1 {
        return Err(fout(
            "Deze native versie opent IFCX-dossiers met precies één document",
        ));
    }
    let children = root[0]["children"]
        .as_object()
        .ok_or_else(|| fout("Dossierroot zonder documenten"))?;
    if children.len() != 1 || children.values().next() != Some(&docs[0]["path"]) {
        return Err(fout("Document buiten dossierroot"));
    }
    let doc = &docs[0]["attributes"][DOCUMENT];
    let module = match doc["kind"].as_str() {
        Some("writer") => Module::Writer,
        Some("spreadsheet") => Module::Spreadsheet,
        Some("presentation") => Module::Presentation,
        Some("notition") => Module::Notition,
        Some("email") => Module::Email,
        _ => return Err(fout("Onbekende documentsoort")),
    };
    let node = nodes
        .iter()
        .find(|n| n["path"] == doc["source"])
        .ok_or_else(|| fout("Ontbrekende documentbron"))?;
    let bron = &node["attributes"][PAYLOAD];
    let inhoud = bron["content"]
        .as_str()
        .filter(|s| s.len() <= 16_000_000)
        .ok_or_else(|| fout("Broninhoud ontbreekt of is te groot"))?;
    if bron["encoding"] != "base64" || bron["mediaType"] != media(module) {
        return Err(fout("Onjuiste broncodering of mediatype"));
    }
    let bytes = STANDARD
        .decode(inhoud)
        .map_err(|_| fout("Ongeldige base64"))?;
    if STANDARD.encode(&bytes) != inhoud
        || bron["byteLength"].as_u64() != Some(bytes.len() as u64)
        || bron["sha256"] != hash(&bytes)
    {
        return Err(fout("De broncontrole komt niet overeen"));
    }
    let naam = bron["fileName"]
        .as_str()
        .ok_or_else(|| fout("Bronnaam ontbreekt"))?;
    if !doc["title"].is_string() {
        return Err(fout("Documenttitel ontbreekt"));
    }
    Ok((module, naam.into(), bytes))
}

/// Bewaart ook attributen en nodes die deze versie niet inhoudelijk bewerkt.
pub fn vervang(dossier: &[u8], bytes: &[u8]) -> Resultaat<Vec<u8>> {
    let _ = lees(dossier)?;
    if bytes.len() > MAX_BRON {
        return Err(fout("Bron te groot voor dit profiel"));
    }
    let mut d: Value = serde_json::from_slice(dossier)?;
    let nodes = d["data"].as_array_mut().unwrap();
    let doc = nodes
        .iter()
        .position(|n| n["attributes"].get(DOCUMENT).is_some())
        .unwrap();
    let oud = nodes[doc]["attributes"][DOCUMENT]["source"].clone();
    let index = nodes.iter().position(|n| n["path"] == oud).unwrap();
    let sha = hash(bytes);
    let nieuw = format!("/office/payload/{sha}");
    let payload = &mut nodes[index]["attributes"][PAYLOAD];
    payload["byteLength"] = json!(bytes.len());
    payload["sha256"] = json!(sha);
    payload["content"] = json!(STANDARD.encode(bytes));
    nodes[index]["path"] = json!(nieuw);
    nodes[doc]["attributes"][DOCUMENT]["source"] = json!(nieuw);
    let uit = serde_json::to_vec_pretty(&d)?;
    lees(&uit)?;
    Ok(uit)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn alle_modules_bewaren_exacte_bron() {
        for module in Module::ALLE {
            let bron = b"Alle bytes \0\xff\r\n";
            let d = maak(module, "voorbeeld", bron).unwrap();
            let (m, _, b) = lees(&d).unwrap();
            assert_eq!(m, module);
            assert_eq!(b, bron);
        }
    }
    #[test]
    fn beschadigde_bronnen_en_onbekende_profielen_worden_geweigerd() {
        let bron = maak(Module::Email, "bron.eml", b"Subject: Test\r\n\r\nInhoud").unwrap();
        let data: Value = serde_json::from_slice(&bron).unwrap();
        for (pad, waarde) in [
            (
                "/data/2/attributes/openaec::office::payload/sha256",
                json!("fout"),
            ),
            (
                "/data/2/attributes/openaec::office::payload/byteLength",
                json!(1),
            ),
            (
                "/data/2/attributes/openaec::office::payload/encoding",
                json!("tekst"),
            ),
            (
                "/data/0/attributes/openaec::office::collection/profileVersion",
                json!("later"),
            ),
            (
                "/data/1/attributes/openaec::office::document/source",
                json!("/ontbreekt"),
            ),
        ] {
            let mut d = data.clone();
            *d.pointer_mut(pad).unwrap() = waarde;
            assert!(lees(&serde_json::to_vec(&d).unwrap()).is_err(), "{pad}");
        }
    }
}
