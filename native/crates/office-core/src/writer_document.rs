//! Writer-model met de oorspronkelijke beperking voor gewone bewerkingsopdrachten.
use crate::document::{Fout, Resultaat};
use betteroffice_docx::Document;
use std::ops::{Deref, DerefMut};

/// De modeltoegang blijft beschikbaar; de getypeerde documentopdrachten
/// controleren de uit de oorspronkelijke bron gelezen bewerkingsbeperking.
pub struct WriterDocument {
    document: Document,
    beperking: Option<String>,
    layoutbron: std::cell::OnceCell<std::sync::Arc<Vec<u8>>>,
}
impl WriterDocument {
    pub(crate) fn nieuw(document: Document, bron: &[u8]) -> Resultaat<Self> {
        Ok(Self {
            document,
            beperking: lees_beperking(bron)?,
            layoutbron: std::cell::OnceCell::new(),
        })
    }
    pub fn bewerkingsbeperking(&self) -> Option<&str> {
        self.beperking.as_deref()
    }
    /// Het model kan bij openen ID's normaliseren. Layout en tekstadressering
    /// delen daarom één canonieke bron, los van de ongewijzigde bewaarbron.
    pub(crate) fn layoutbron(&self) -> Resultaat<std::sync::Arc<Vec<u8>>> {
        if let Some(bron) = self.layoutbron.get() {
            return Ok(bron.clone());
        }
        let bron = std::sync::Arc::new(
            self.document
                .save()
                .map_err(|e| Fout::Document(e.to_string()))?,
        );
        // De cache houdt geen onbeperkte extra kopie van grote pakketten vast.
        if bron.len() <= 16 * 1024 * 1024 {
            let _ = self.layoutbron.set(bron.clone());
        }
        Ok(bron)
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
        // Iedere mutabele modeltoegang kan de bron veranderen, ook vanuit
        // een rechtstreekse document-API buiten de sessiegeschiedenis.
        self.layoutbron.take();
        &mut self.document
    }
}

fn lees_beperking(bron: &[u8]) -> Resultaat<Option<String>> {
    let delen = ooxml_opc::unzip_parts_where(bron, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |n| {
        n.eq_ignore_ascii_case("word/settings.xml") || n.eq_ignore_ascii_case("word/document.xml")
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
            if naam.eq_ignore_ascii_case("word/settings.xml") && n.local_name() == "trackRevisions"
            {
                let waarde = n
                    .attributes
                    .iter()
                    .find(|(naam, _)| docx_parse::xml::local_name(naam) == "val")
                    .map(|(_, v)| v.as_str());
                if waarde.is_none_or(|v| docx_parse::xml::parse_on_off(v) != Some(false)) {
                    return Ok(Some("Alleen lezen: wijzigingen bijhouden staat aan; nieuwe revisies worden nog niet veilig native gemaakt.".into()));
                }
            }
            if naam.eq_ignore_ascii_case("word/document.xml") && n.local_name() == "lock" {
                let waarde = n
                    .attributes
                    .iter()
                    .find(|(naam, _)| docx_parse::xml::local_name(naam) == "val")
                    .map(|(_, v)| v.as_str());
                if !matches!(waarde, Some("unlocked" | "sdtLocked")) {
                    return Ok(Some("Alleen lezen: vergrendelde of onbekende inhoudsbesturing. Bewerkbare uitzonderingen worden nog niet ondersteund.".into()));
                }
            }
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

#[cfg(test)]
mod layoutbron_proeven {
    use crate::document::{Bewerking, Document, Module};
    use std::sync::Arc;
    #[test]
    fn paginering_hergebruikt_canonieke_bron_en_alle_mutabele_toegang_ververst_haar() {
        let mut d = Document::open(
            Module::Writer,
            include_bytes!("../tests/fixtures/writer-structuur.docx"),
        )
        .unwrap();
        let bron = match &d {
            Document::Writer(w) => w.layoutbron().unwrap(),
            _ => unreachable!(),
        };
        let b = d.weergave(0).unwrap();
        let veld = b.velden.iter().find(|v| v.tekst == "Cel één").unwrap();
        for _ in 0..3 {
            let Document::Writer(w) = &d else {
                unreachable!()
            };
            assert!(Arc::ptr_eq(&bron, &w.layoutbron().unwrap()));
        }
        d.bewerk(
            0,
            Bewerking::Tekst {
                id: veld.id.clone(),
                tekst: "Nieuwe eigen celtekst 🏠".into(),
            },
        )
        .unwrap();
        let Document::Writer(w) = &mut d else {
            unreachable!()
        };
        let nieuw = w.layoutbron().unwrap();
        assert!(!Arc::ptr_eq(&bron, &nieuw));
        assert_ne!(*bron, *nieuw);
        let herlezen = Document::open(Module::Writer, &nieuw)
            .unwrap()
            .weergave(0)
            .unwrap();
        assert!(
            herlezen
                .velden
                .iter()
                .any(|v| v.tekst == "Nieuwe eigen celtekst 🏠")
        );
        // Ook gebruikers van de rechtstreeks doorgelaten model-API mogen
        // daarna geen al verouderde layoutbron terugkrijgen.
        let _ = w.model_mut();
        let na_toegang = w.layoutbron().unwrap();
        assert!(!Arc::ptr_eq(&nieuw, &na_toegang));
        assert_eq!(*nieuw, *na_toegang);
    }
}
