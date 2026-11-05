//! Pagina-instelling van de sectie waartoe de gekozen body-alinea behoort.
//! Bewerk alleen aangewezen eigenschappen; geërfde kop-/voettekst blijft geërfd.
use crate::document::{Fout, Resultaat};
use betteroffice_docx::SectionProperties;
use betteroffice_docx::{self as docx, BlockContent as B};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Papier {
    A3,
    A4,
    A5,
    Letter,
    Legal,
}
impl Papier {
    pub const ALLE: [Self; 5] = [Self::A3, Self::A4, Self::A5, Self::Letter, Self::Legal];
    pub fn naam(self) -> &'static str {
        match self {
            Self::A3 => "A3",
            Self::A4 => "A4",
            Self::A5 => "A5",
            Self::Letter => "Letter",
            Self::Legal => "Legal",
        }
    }
    fn twips(self) -> (f64, f64) {
        // Dezelfde afgeronde twips als de bestaande formaatcatalogus.
        match self {
            Self::A3 => (16838., 23811.),
            Self::A4 => (11906., 16838.),
            Self::A5 => (8391., 11906.),
            Self::Letter => (12240., 15840.),
            Self::Legal => (12240., 20160.),
        }
    }
}
impl std::fmt::Display for Papier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.naam())
    }
}
#[derive(Debug, Clone)]
pub enum PaginaActie {
    Papier(Papier),
    Liggend(bool),
    Marges {
        boven: f64,
        onder: f64,
        links: f64,
        rechts: f64,
    },
    Kolommen {
        aantal: u8,
        tussenruimte: f64,
        lijn: bool,
    },
}
fn fout(s: &str) -> Fout {
    Fout::Document(s.into())
}
fn bevat(blok: &B, id: &str) -> bool {
    match blok {
        B::Paragraph(p) => p.para_id.as_deref() == Some(id),
        B::Table(t) => t
            .rows
            .iter()
            .flat_map(|r| &r.cells)
            .flat_map(|c| &c.content)
            .any(|b| bevat(b, id)),
        // Een inhoudsbesturing kan vergrendeld zijn: niet via deze route veranderen.
        _ => false,
    }
}
fn wijzig(p: &mut SectionProperties, effectief: &SectionProperties, actie: &PaginaActie) {
    let (w, h) = (
        effectief.page_width.unwrap_or(12240.),
        effectief.page_height.unwrap_or(15840.),
    );
    match *actie {
        PaginaActie::Papier(papier) => {
            let (a, b) = papier.twips();
            let liggend = effectief.orientation.as_deref() == Some("landscape")
                || (effectief.orientation.is_none() && w > h);
            p.page_width = Some(if liggend { b } else { a });
            p.page_height = Some(if liggend { a } else { b });
        }
        PaginaActie::Liggend(liggend) => {
            p.page_width = Some(if liggend { w.max(h) } else { w.min(h) });
            p.page_height = Some(if liggend { w.min(h) } else { w.max(h) });
            p.orientation = Some(if liggend { "landscape" } else { "portrait" }.into());
        }
        PaginaActie::Marges {
            boven,
            onder,
            links,
            rechts,
        } => {
            p.margin_top = Some(boven);
            p.margin_bottom = Some(onder);
            p.margin_left = Some(links);
            p.margin_right = Some(rechts);
        }
        PaginaActie::Kolommen {
            aantal,
            tussenruimte,
            lijn,
        } => {
            p.column_count = Some(f64::from(aantal));
            p.column_space = Some(tussenruimte);
            p.equal_width = Some(true);
            p.separator = Some(lijn);
            p.columns = None;
        }
    }
}
fn controleer(p: &SectionProperties, actie: &PaginaActie) -> Resultaat<()> {
    match *actie {
        PaginaActie::Marges {
            boven,
            onder,
            links,
            rechts,
        } if ![boven, onder, links, rechts]
            .iter()
            .all(|v| v.is_finite() && (0.0..=31680.).contains(v)) =>
        {
            return Err(fout("Ongeldige paginamarges"));
        }
        PaginaActie::Kolommen {
            aantal,
            tussenruimte,
            ..
        } if !(1..=3).contains(&aantal)
            || !tussenruimte.is_finite()
            || !(0.0..=14400.).contains(&tussenruimte) =>
        {
            return Err(fout("Ongeldige tekstkolommen"));
        }
        _ => {}
    }
    let getal = |v: Option<f64>, d| v.unwrap_or(d);
    let (w, h) = (getal(p.page_width, 12240.), getal(p.page_height, 15840.));
    let breedte =
        w - getal(p.margin_left, 1440.) - getal(p.margin_right, 1440.) - getal(p.gutter, 0.);
    let hoogte = h - getal(p.margin_top, 1440.) - getal(p.margin_bottom, 1440.);
    let n = getal(p.column_count, 1.);
    let kolombreedte = (breedte - (n - 1.) * getal(p.column_space, 720.)) / n;
    if ![w, h, breedte, hoogte, kolombreedte]
        .iter()
        .all(|v| v.is_finite() && *v > 0.)
        || kolombreedte < 144.
        || hoogte < 144.
    {
        return Err(fout(
            "Pagina of tekstkolommen laten onvoldoende schrijfruimte over",
        ));
    }
    Ok(())
}
pub fn pagina(d: &mut docx::Document, id: &str, actie: PaginaActie) -> Resultaat<()> {
    if d.model().settings.track_revisions == Some(true) {
        return Err(fout(
            "Pagina-instelling met wijzigingen bijhouden wordt nog niet ondersteund",
        ));
    }
    // Zoek de huidige sectie en de afsluitende eigenschapsalinea. Een alinea
    // met een sectie-einde behoort nog tot de voorgaande sectie.
    if d.paragraph(id).is_none() {
        return Err(fout("Selecteer een bestaande body-alinea"));
    }
    let mut index = 0;
    let mut gevonden = false;
    let mut afsluiter = None;
    for (n, blok) in d.body().content.iter().enumerate() {
        gevonden |= bevat(blok, id);
        if matches!(blok,B::Paragraph(p) if p.section_properties.is_some()) {
            if gevonden {
                afsluiter = Some(n);
                break;
            }
            index += 1;
        }
    }
    if !gevonden {
        return Err(fout(
            "Pagina-instelling van deze inhoudsbesturing wordt nog niet ondersteund",
        ));
    }
    let effectief = d
        .sections()
        .get(index)
        .ok_or_else(|| fout("Sectieweergave ontbreekt"))?
        .properties
        .clone();
    let mut controle = effectief.clone();
    wijzig(&mut controle, &effectief, &actie);
    controleer(&controle, &actie)?;
    let body = &mut d.model_mut().body;
    if let Some(n) = afsluiter {
        let B::Paragraph(p) = &mut body.content[n] else {
            unreachable!()
        };
        let p = Arc::make_mut(p);
        wijzig(
            p.section_properties.as_mut().expect("sectie-einde"),
            &effectief,
            &actie,
        );
        // De parser bewaart een tweede, gedeelde sectieweergave. Houd de
        // afsluitende alinea daarin gelijk aan de oorspronkelijke body-bron.
        if let Some(s) = body.sections.as_mut().and_then(|s| s.get_mut(index)) {
            for blok in &mut s.content {
                if let B::Paragraph(k) = blok
                    && k.para_id == p.para_id
                {
                    Arc::make_mut(k).section_properties = p.section_properties.clone();
                }
            }
            wijzig(&mut s.properties, &effectief, &actie);
        }
    } else {
        wijzig(
            body.final_section_properties
                .get_or_insert_with(SectionProperties::default),
            &effectief,
            &actie,
        );
        if let Some(s) = body.sections.as_mut().and_then(|s| s.get_mut(index)) {
            wijzig(&mut s.properties, &effectief, &actie);
        }
    }
    Ok(())
}

/// Het model bevat geen documentbeveiliging of geschiedenis van sectieopmaak.
/// Controleer daarom ook de oorspronkelijke bron voordat een sessie wijzigt.
pub(crate) fn controleer_bron(bron: &[u8]) -> Resultaat<()> {
    let delen = ooxml_opc::unzip_parts_where(bron, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |n| {
        n.eq_ignore_ascii_case("word/document.xml") || n.eq_ignore_ascii_case("word/settings.xml")
    })
    .map_err(|e| fout(&e))?;
    let limieten = docx_parse::xml::ParseLimits::default();
    for (naam, xml) in delen {
        let d = docx_parse::parse_xml(
            &xml,
            &naam,
            &mut docx_parse::xml::ParseBudget::new(&limieten),
        )
        .map_err(|e| fout(&e.to_string()))?;
        let mut lijst = d.root().into_iter().collect::<Vec<_>>();
        while let Some(n) = lijst.pop() {
            if n.local_name() == "sectPrChange" {
                return Err(fout(
                    "Pagina-instelling met bestaande sectierevisies wordt nog niet ondersteund",
                ));
            }
            if n.local_name() == "documentProtection"
                && n.attributes.iter().any(|(naam, waarde)| {
                    docx_parse::xml::local_name(naam) == "enforcement"
                        && docx_parse::xml::parse_on_off(waarde) == Some(true)
                })
            {
                return Err(fout(
                    "Pagina-instelling met actieve documentbeveiliging wordt nog niet ondersteund",
                ));
            }
            lijst.extend(n.child_elements());
        }
    }
    Ok(())
}
