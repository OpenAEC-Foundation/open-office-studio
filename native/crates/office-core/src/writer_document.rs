//! Writer-model met de oorspronkelijke beperking voor gewone bewerkingsopdrachten.
use crate::document::{Fout, Resultaat};
use betteroffice_docx::Document;
use std::ops::{Deref, DerefMut};

/// De modeltoegang blijft beschikbaar; de getypeerde documentopdrachten
/// controleren de uit de oorspronkelijke bron gelezen bewerkingsbeperking.
pub struct WriterDocument {
    document: Document,
    beperking: Option<String>,
}
impl WriterDocument {
    pub(crate) fn nieuw(document: Document, bron: &[u8]) -> Resultaat<Self> {
        Ok(Self {
            document,
            beperking: lees_beperking(bron)?,
        })
    }
    pub fn bewerkingsbeperking(&self) -> Option<&str> {
        self.beperking.as_deref()
    }
    pub(crate) fn controleer_bewerking(&self) -> Resultaat<()> {
        match &self.beperking {
            Some(reden) => Err(Fout::Document(reden.clone())),
            None => Ok(()),
        }
    }
}
impl Deref for WriterDocument {
    type Target = Document;
    fn deref(&self) -> &Self::Target {
        &self.document
    }
}
impl DerefMut for WriterDocument {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.document
    }
}

fn lees_beperking(bron: &[u8]) -> Resultaat<Option<String>> {
    let delen = ooxml_opc::unzip_parts_where(bron, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |n| {
        n.eq_ignore_ascii_case("word/settings.xml")
    })
    .map_err(|e| Fout::Document(e.to_string()))?;
    let limieten = docx_parse::xml::ParseLimits::default();
    for (naam, xml) in delen {
        let d = docx_parse::parse_xml(
            &xml,
            &naam,
            &mut docx_parse::xml::ParseBudget::new(&limieten),
        )
        .map_err(|e| Fout::Document(e.to_string()))?;
        let mut lijst = d.root().into_iter().collect::<Vec<_>>();
        while let Some(n) = lijst.pop() {
            if n.local_name() == "documentProtection" {
                for (naam, waarde) in &n.attributes {
                    if docx_parse::xml::local_name(naam) != "enforcement" {
                        continue;
                    }
                    match docx_parse::xml::parse_on_off(waarde) {
                        Some(false) => {},
                        Some(true) => return Ok(Some("Alleen lezen: actieve documentbeveiliging; deze bewerkingsvorm wordt nog niet ondersteund.".into())),
                        None => return Ok(Some("Alleen lezen: de waarde voor documentbeveiliging wordt niet herkend.".into())),
                    }
                }
            }
            lijst.extend(n.child_elements());
        }
    }
    Ok(None)
}
