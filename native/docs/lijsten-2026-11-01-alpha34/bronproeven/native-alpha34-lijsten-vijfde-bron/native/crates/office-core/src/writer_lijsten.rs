//! Gewone lijsten; stijl- en nummeringsovererving blijven bij de documentengine.
use crate::{
    document::{Fout, Resultaat},
    opmaak::LijstSoort,
    writer_document::WriterDocument,
};
use docx_parse::{
    formatting::{NumberingProperties, ParagraphFormatting},
    numbering::{AbstractNumbering, ListLevel, NumberingInstance, NumberingMap},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LijstStaat {
    pub soort: LijstSoort,
    pub niveau: u8,
    pub nummer: u32,
}
pub(crate) fn heeft_lijst(
    d: &betteroffice_docx::Document,
    p: &betteroffice_docx::Paragraph,
) -> bool {
    let Some(n) = p.formatting.as_ref().and_then(|f| f.num_pr.as_ref()) else {
        return false;
    };
    if n.num_id.is_none_or(|n| n <= 0.) {
        return false;
    }
    // list_rendering op het mutabele bronmodel kan nog bij de vorige
    // alinea horen. Laat de engine de huidige getypeerde nummering oplossen.
    docx_parse::numbering::compute_list_rendering(
        n.num_id,
        n.ilvl,
        &NumberingMap {
            definitions: d.model().numbering.clone(),
        },
    )
    .is_some()
}

/// Alleen opgeloste metadata uit dezelfde alineamarkering als de tekenengine.
pub(crate) fn staat(waarden: &std::collections::BTreeMap<String, yrs::Any>) -> Option<LijstStaat> {
    use yrs::Any;
    let Any::Map(eigenschappen) = waarden.get("numPr")? else {
        return None;
    };
    let getal = |sleutel, standaard| match eigenschappen.get(sleutel) {
        Some(Any::Number(n)) if n.is_finite() && n.fract() == 0. => Some(*n),
        None => standaard,
        _ => None,
    };
    let nummer = getal("numId", None)?;
    let niveau = getal("ilvl", Some(0.))?;
    if !(1. ..=i32::MAX as f64).contains(&nummer) || !(0. ..=8.).contains(&niveau) {
        return None;
    }
    let Any::Bool(opsomming) = waarden.get("listIsBullet")? else {
        return None;
    };
    Some(LijstStaat {
        soort: if *opsomming {
            LijstSoort::Opsomming
        } else {
            LijstSoort::Nummering
        },
        niveau: niveau as u8,
        nummer: nummer as u32,
    })
}

fn definitie(soort: LijstSoort, id: f64) -> AbstractNumbering {
    let opsomming = soort == LijstSoort::Opsomming;
    AbstractNumbering {
        abstract_num_id: id,
        multi_level_type: Some("singleLevel".into()),
        num_style_link: None,
        style_link: None,
        name: Some(
            if opsomming {
                "OpenAEC-Opsomming"
            } else {
                "OpenAEC-Nummering"
            }
            .into(),
        ),
        levels: vec![ListLevel {
            ilvl: 0.,
            start: Some(1.),
            num_fmt: if opsomming { "bullet" } else { "decimal" }.into(),
            lvl_text: if opsomming { "•" } else { "%1." }.into(),
            lvl_jc: Some("left".into()),
            suffix: Some("tab".into()),
            p_pr: Some(ParagraphFormatting {
                indent_left: Some(720.),
                indent_first_line: Some(-360.),
                hanging_indent: Some(true),
                ..Default::default()
            }),
            r_pr: None,
            lvl_restart: None,
            is_lgl: None,
            legacy: None,
        }],
    }
}
fn volgende(ids: impl Iterator<Item = f64>) -> Resultaat<f64> {
    let n = ids.fold(0., f64::max) + 1.;
    if n <= i32::MAX as f64 {
        Ok(n)
    } else {
        Err(Fout::Document(
            "Geen veilige nieuwe lijstidentificatie beschikbaar".into(),
        ))
    }
}
/// Bestaande definities blijven onaangeraakt. Een aangrenzende gewone alinea
/// binnen dezelfde body of cel vervolgt een lijst van dezelfde soort.
pub(crate) fn toepassen(
    d: &mut WriterDocument,
    p: &mut betteroffice_docx::Paragraph,
    soort: Option<LijstSoort>,
) -> Resultaat<()> {
    let nummer = if let Some(soort) = soort {
        d.controleer_lijstaanvulling()?;
        let bron = &d.model().numbering;
        crate::writer_nummering::controleer_ids(bron)?;
        let kaart = NumberingMap {
            definitions: bron.clone(),
        };
        let vorige = p
            .para_id
            .as_deref()
            .and_then(|id| crate::writer::zoek(&d.model().body.content, id))
            .and_then(|(blokken, i)| i.checked_sub(1).and_then(|i| blokken.get(i)))
            .and_then(|b| match b {
                betteroffice_docx::BlockContent::Paragraph(p) => Some(p),
                _ => None,
            })
            .and_then(|p| p.formatting.as_ref())
            .and_then(|f| f.num_pr.as_ref().or(f.num_pr_from_style.as_ref()))
            .and_then(|n| docx_parse::numbering::compute_list_rendering(n.num_id, n.ilvl, &kaart))
            .filter(|r| r.is_bullet == (soort == LijstSoort::Opsomming));
        if let Some(vorige) = vorige {
            NumberingProperties {
                num_id: Some(vorige.num_id),
                ilvl: Some(vorige.level),
            }
        } else {
            let bestaande = bron
                .abstract_nums
                .iter()
                .find(|n| **n == definitie(soort, n.abstract_num_id));
            let nieuw = bestaande.is_none();
            let abstract_id = match bestaande {
                Some(n) => n.abstract_num_id,
                None => volgende(bron.abstract_nums.iter().map(|n| n.abstract_num_id))?,
            };
            let id = volgende(bron.nums.iter().map(|n| n.num_id))?;
            let model = d.model_mut();
            if nieuw {
                model
                    .numbering
                    .abstract_nums
                    .push(definitie(soort, abstract_id));
            }
            model.numbering.nums.push(NumberingInstance {
                num_id: id,
                abstract_num_id: abstract_id,
                level_overrides: None,
            });
            NumberingProperties {
                num_id: Some(id),
                ilvl: Some(0.),
            }
        }
    } else {
        // numId=0 onderdrukt ook een lijst uit de alineastijl. Alleen weglaten
        // zou bij heropenen de stijlgebonden lijst opnieuw activeren.
        NumberingProperties {
            num_id: Some(0.),
            ilvl: None,
        }
    };
    let f = p.formatting.get_or_insert_with(Default::default);
    f.num_pr = Some(nummer);
    f.num_pr_from_style = None;
    p.list_rendering = None;
    Ok(())
}
