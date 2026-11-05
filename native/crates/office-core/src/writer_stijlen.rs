//! Alineastijlen uit de eigen bron; overerving blijft bij de documentengine.
use crate::document::{Fout, Resultaat};
use crate::writer_document::WriterDocument;
use docx_parse::styles::Style;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Alineastijl {
    pub id: String,
    pub naam: String,
}
impl std::fmt::Display for Alineastijl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.naam)
    }
}
#[derive(Debug, Clone, Default)]
pub struct Overzicht {
    pub keuzes: Vec<Alineastijl>,
    pub huidig: HashMap<String, String>,
}
struct Register<'a> {
    index: HashMap<&'a str, Option<&'a Style>>,
}
impl<'a> Register<'a> {
    fn nieuw(d: &'a WriterDocument) -> Self {
        let mut index = HashMap::new();
        if let Some(s) = &d.model().styles {
            for stijl in &s.styles {
                // Een dubbele identificatie is dubbelzinnig, ook als de eerste
                // definitie wel een alineastijl lijkt te zijn.
                index
                    .entry(stijl.style_id.as_str())
                    .and_modify(|s| *s = None)
                    .or_insert(Some(stijl));
            }
        }
        // De engine bewaart definities in een map en voegt dubbele ID’s samen.
        // De oorspronkelijke broncontrole voorkomt een willekeurige keuze.
        for id in d.dubbele_stijlen() {
            index.insert(id.as_str(), None);
        }
        Self { index }
    }
    fn geldig(&self, id: &str) -> bool {
        let mut gezien = HashSet::new();
        let mut huidig = id;
        // Begrens ook de ketencontrole van onbetrouwbare documentinvoer.
        // Overschrijden geeft geen gedeeltelijk toegepaste stijl.
        for _ in 0..128 {
            if !gezien.insert(huidig) {
                return false;
            }
            let Some(Some(s)) = self.index.get(huidig) else {
                return false;
            };
            if s.style_type != "paragraph"
                || s.style_id.is_empty()
                || s.style_id.len() > 512
                || s.style_id.chars().any(char::is_control)
            {
                return false;
            }
            match s.based_on.as_deref() {
                Some(basis) => huidig = basis,
                None => return true,
            }
        }
        false
    }
}
pub fn controleer(d: &WriterDocument, id: &str) -> Resultaat<()> {
    if Register::nieuw(d).geldig(id) {
        Ok(())
    } else {
        Err(Fout::Document(
            "Deze alineastijl ontbreekt of heeft geen eenduidige geldige stijlketen".into(),
        ))
    }
}
pub fn overzicht(d: &WriterDocument) -> Overzicht {
    let register = Register::nieuw(d);
    let mut stijlen: Vec<_> = register
        .index
        .iter()
        .filter_map(|(id, s)| s.filter(|_| register.geldig(id)))
        .collect();
    stijlen.sort_by(|a, b| {
        b.default
            .unwrap_or(false)
            .cmp(&a.default.unwrap_or(false))
            .then_with(|| {
                b.q_format
                    .unwrap_or(false)
                    .cmp(&a.q_format.unwrap_or(false))
            })
            .then_with(|| {
                a.ui_priority
                    .unwrap_or(99.)
                    .total_cmp(&b.ui_priority.unwrap_or(99.))
            })
            .then_with(|| {
                a.name
                    .as_deref()
                    .unwrap_or(&a.style_id)
                    .cmp(b.name.as_deref().unwrap_or(&b.style_id))
            })
            .then_with(|| a.style_id.cmp(&b.style_id))
    });
    let mut standaard = stijlen.iter().filter(|s| s.default == Some(true));
    let terugval = standaard
        .next()
        .map(|s| s.style_id.as_str())
        .filter(|_| standaard.next().is_none());
    let keuzes = stijlen
        .iter()
        .map(|s| {
            let naam: String = s
                .name
                .as_deref()
                .unwrap_or(&s.style_id)
                .chars()
                .filter(|c| !c.is_control())
                .collect();
            Alineastijl {
                id: s.style_id.clone(),
                naam: if naam.trim().is_empty() {
                    s.style_id.clone()
                } else {
                    naam
                },
            }
        })
        .collect();
    let huidig = d
        .paragraphs()
        .into_iter()
        .filter_map(|p| {
            let stijl = p
                .formatting
                .as_ref()
                .and_then(|f| f.style_id.as_deref())
                .or(terugval)?;
            Some((p.para_id.as_ref()?.clone(), stijl.to_owned()))
        })
        .collect();
    Overzicht { keuzes, huidig }
}

pub(crate) fn dubbele_ids(bron: &[u8]) -> Resultaat<HashSet<String>> {
    let delen = ooxml_opc::unzip_parts_where(bron, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |n| {
        n.eq_ignore_ascii_case("word/styles.xml")
    })
    .map_err(Fout::Document)?;
    let mut gezien = HashSet::new();
    let mut dubbel = HashSet::new();
    let limieten = docx_parse::xml::ParseLimits::default();
    for (naam, xml) in delen {
        let d = docx_parse::parse_xml(
            &xml,
            &naam,
            &mut docx_parse::xml::ParseBudget::new(&limieten),
        )
        .map_err(|e| Fout::Document(e.to_string()))?;
        if let Some(root) = d.root() {
            for stijl in root.children_named("w", "style") {
                if let Some(id) = stijl
                    .attribute(Some("w"), "styleId")
                    .filter(|s| !s.is_empty())
                    && !gezien.insert(id.to_owned())
                {
                    dubbel.insert(id.to_owned());
                }
            }
        }
    }
    Ok(dubbel)
}
