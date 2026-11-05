//! Bewerkingsbeperking uit de oorspronkelijke spreadsheetbron; geen impliciet opheffen.
use crate::document::{Fout, Resultaat};
use betteroffice_xlsx::Workbook;
use std::ops::{Deref, DerefMut};
pub struct RekenbladDocument {
    document: Workbook,
    beperking: Option<String>,
}
impl RekenbladDocument {
    pub(crate) fn nieuw(document: Workbook, bron: &[u8]) -> Resultaat<Self> {
        Ok(Self {
            document,
            beperking: lees_beperking(bron)?,
        })
    }
    pub fn bewerkingsbeperking(&self) -> Option<&str> {
        self.beperking.as_deref()
    }
    pub(crate) fn controleer_deel(&self, deel: usize) -> Resultaat<()> {
        if deel >= self.document.sheet_count() {
            return Err(Fout::Document("Dit werkblad bestaat niet".into()));
        }
        Ok(())
    }
    pub(crate) fn controleer_bewerking(&self) -> Resultaat<()> {
        match &self.beperking {
            Some(r) => Err(Fout::Document(r.clone())),
            None => Ok(()),
        }
    }
}
impl Deref for RekenbladDocument {
    type Target = Workbook;
    fn deref(&self) -> &Workbook {
        &self.document
    }
}
impl DerefMut for RekenbladDocument {
    fn deref_mut(&mut self) -> &mut Workbook {
        &mut self.document
    }
}
fn xml(naam: &str, bytes: &[u8]) -> Resultaat<docx_parse::xml::XmlDocument> {
    let limieten = docx_parse::xml::ParseLimits::default();
    docx_parse::parse_xml(
        bytes,
        naam,
        &mut docx_parse::xml::ParseBudget::new(&limieten),
    )
    .map_err(|e| Fout::Document(e.to_string()))
}
fn attribuut<'a>(n: &'a docx_parse::xml::XmlElement, sleutel: &str) -> Option<&'a str> {
    n.attributes
        .iter()
        .find(|(k, _)| docx_parse::xml::local_name(k) == sleutel)
        .map(|(_, v)| v.as_str())
}
struct Relatie {
    doel: String,
    soort: Option<String>,
    buiten: bool,
}
fn doelpad(doel: &str) -> String {
    if doel.starts_with('/') {
        return doel.trim_start_matches('/').to_owned();
    }
    let mut delen = vec!["xl"];
    for deel in doel.split('/') {
        match deel {
            "" | "." => {}
            ".." => {
                delen.pop();
            }
            d => delen.push(d),
        }
    }
    delen.join("/")
}
fn lees_beperking(bron: &[u8]) -> Resultaat<Option<String>> {
    use std::collections::{HashMap, HashSet};
    let metadata =
        ooxml_opc::unzip_parts_where(bron, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |n| {
            matches!(
                n.to_ascii_lowercase().as_str(),
                "xl/workbook.xml" | "xl/_rels/workbook.xml.rels"
            )
        })
        .map_err(|e| Fout::Document(e.to_string()))?;
    let boek = metadata
        .iter()
        .find(|(n, _)| n.eq_ignore_ascii_case("xl/workbook.xml"))
        .ok_or_else(|| Fout::Document("De werkmapbron ontbreekt".into()))?;
    let boek = xml(&boek.0, &boek.1)?;
    if let Some(r) = beperking(&boek)? {
        return Ok(Some(r));
    }
    let ids = boek
        .root()
        .into_iter()
        .flat_map(|r| r.child_elements())
        .filter(|n| n.local_name() == "sheets")
        .flat_map(|n| n.child_elements())
        .filter(|n| n.local_name() == "sheet")
        .map(|n| attribuut(n, "id").map(str::to_owned))
        .collect::<Vec<_>>();
    let mut relaties = HashMap::new();
    if let Some((naam, bytes)) = metadata
        .iter()
        .find(|(n, _)| n.eq_ignore_ascii_case("xl/_rels/workbook.xml.rels"))
    {
        let d = xml(naam, bytes)?;
        for n in d
            .root()
            .into_iter()
            .flat_map(|n| n.child_elements())
            .filter(|n| n.local_name() == "Relationship")
        {
            if let (Some(id), Some(doel)) = (attribuut(n, "Id"), attribuut(n, "Target")) {
                relaties.insert(
                    id.to_owned(),
                    Relatie {
                        doel: doel.into(),
                        soort: attribuut(n, "Type").map(str::to_owned),
                        buiten: attribuut(n, "TargetMode")
                            .is_some_and(|v| v.eq_ignore_ascii_case("external")),
                    },
                );
            }
        }
    }
    let mut paden = HashSet::new();
    for (i, id) in ids.into_iter().enumerate() {
        let relatie = id.as_ref().and_then(|id| relaties.get(id));
        // Dezelfde deelkeuze als de engine: niet-werkbladtypen blijven aparte
        // brononderdelen; ontbrekende/externe relaties krijgen het standaardpad.
        if relatie.is_some_and(|r| {
            r.soort
                .as_ref()
                .is_some_and(|s| s.rsplit('/').next() != Some("worksheet"))
        }) {
            continue;
        }
        let pad = relatie
            .filter(|r| !r.buiten)
            .map(|r| doelpad(&r.doel))
            .unwrap_or_else(|| format!("xl/worksheets/sheet{}.xml", i + 1));
        paden.insert(pad.to_ascii_lowercase());
    }
    let delen = ooxml_opc::unzip_parts_where(bron, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |n| {
        paden.contains(&n.to_ascii_lowercase())
    })
    .map_err(|e| Fout::Document(e.to_string()))?;
    if delen.len() != paden.len() {
        return Ok(Some("Alleen lezen: de beveiliging van de werkbladdelen kan niet betrouwbaar worden vastgesteld.".into()));
    }
    for (naam, bytes) in delen {
        if let Some(r) = blad_beperking(&naam, &bytes)? {
            return Ok(Some(r));
        }
    }
    Ok(None)
}
fn beperking(d: &docx_parse::xml::XmlDocument) -> Resultaat<Option<String>> {
    let Some(root) = d.root() else {
        return Ok(None);
    };
    for n in root.child_elements() {
        let waarden = |naam: &str| {
            n.attributes
                .iter()
                .filter(|(k, _)| docx_parse::xml::local_name(k) == naam)
                .map(|(_, v)| v.as_str())
                .collect::<Vec<_>>()
        };
        let actief = match n.local_name() {
            // Onbekende of ontbrekende bladstatus wordt niet stil als
            // bewerkbaar geïnterpreteerd. Uitzonderingen volgen afzonderlijk.
            "sheetProtection" if root.local_name() == "worksheet" => {
                let v = waarden("sheet");
                v.is_empty()
                    || v.into_iter()
                        .any(|v| docx_parse::xml::parse_on_off(v) != Some(false))
            }
            "workbookProtection" if root.local_name() == "workbook" => {
                ["lockStructure", "lockWindows", "lockRevision"]
                    .iter()
                    .any(|k| {
                        waarden(k)
                            .into_iter()
                            .any(|v| docx_parse::xml::parse_on_off(v) != Some(false))
                    })
            }
            _ => false,
        };
        if actief {
            return Ok(Some("Alleen lezen: deze werkmap bevat actieve of onbekende blad-/werkmapbeveiliging. Bewerkbare uitzonderingen zijn nog niet overgezet.".into()));
        }
    }
    Ok(None)
}

/// Alleen directe beveiligingskenmerken lezen. De bestaande parser blijft
/// eigenaar van cellen, waarden en stijlen; hier komt geen tweede tekstboom.
fn blad_beperking(naam: &str, bytes: &[u8]) -> Resultaat<Option<String>> {
    use quick_xml::events::Event;
    let mut lezer = quick_xml::Reader::from_reader(bytes);
    lezer.config_mut().check_end_names = true;
    let mut diepte = 0usize;
    let mut werkblad = false;
    loop {
        let event = lezer
            .read_event()
            .map_err(|e| Fout::Document(format!("{naam}: {e}")))?;
        let leeg = matches!(event, Event::Empty(_));
        match event {
            Event::Start(n) | Event::Empty(n) => {
                if diepte == 0 {
                    werkblad = n.name().local_name().as_ref() == b"worksheet";
                }
                if werkblad && diepte == 1 && n.name().local_name().as_ref() == b"sheetProtection" {
                    let mut gevonden = false;
                    let mut actief = false;
                    for a in n.attributes() {
                        let a = a.map_err(|e| Fout::Document(format!("{naam}: {e}")))?;
                        if a.key.local_name().as_ref() == b"sheet" {
                            gevonden = true;
                            let v = a
                                .normalized_value(quick_xml::XmlVersion::Implicit1_0)
                                .map_err(|e| Fout::Document(format!("{naam}: {e}")))?;
                            actief |= docx_parse::xml::parse_on_off(&v) != Some(false);
                        }
                    }
                    if !gevonden || actief {
                        return Ok(Some("Alleen lezen: deze werkmap bevat actieve of onbekende blad-/werkmapbeveiliging. Bewerkbare uitzonderingen zijn nog niet overgezet.".into()));
                    }
                }
                if !leeg {
                    diepte += 1;
                    if diepte > 256 {
                        return Err(Fout::Document(
                            "De XML van het werkblad is te diep genest".into(),
                        ));
                    }
                }
            }
            Event::End(_) => diepte = diepte.saturating_sub(1),
            Event::DocType(_) => {
                return Err(Fout::Document(
                    "DTD in de werkbladbron wordt niet ondersteund".into(),
                ));
            }
            Event::Eof => {
                if diepte != 0 {
                    return Err(Fout::Document(format!("{naam}: onvolledig werkblad-XML")));
                }
                if !werkblad {
                    return Ok(Some(
                        "Alleen lezen: het werkbladdeel heeft een onbekende structuur.".into(),
                    ));
                }
                break;
            }
            _ => {}
        }
    }
    Ok(None)
}

#[cfg(test)]
mod proeven {
    use super::*;
    #[test]
    fn bladbeveiliging_streamende_scan_leest_groot_blad_zonder_tweede_celboom() {
        let mut bron = String::from("<worksheet><sheetData>");
        for r in 1..=50_000 {
            bron.push_str(&format!("<row r=\"{r}\"><c r=\"A{r}\" t=\"inlineStr\"><is><t>Eigen celtekst 🏠</t></is></c></row>"));
        }
        bron.push_str("</sheetData><sheetProtection sheet=\"false\"/></worksheet>");
        assert!(
            blad_beperking("eigen-blad.xml", bron.as_bytes())
                .unwrap()
                .is_none()
        );
        let actief = bron.replace("sheet=\"false\"", "sheet=\"true\"");
        assert!(
            blad_beperking("eigen-blad.xml", actief.as_bytes())
                .unwrap()
                .is_some()
        );
        assert!(blad_beperking("eigen-blad.xml", b"<worksheet><sheetData>").is_err());
    }
}
