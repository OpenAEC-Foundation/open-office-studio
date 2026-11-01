//! Alineastructuur zonder tekstvakken, velden, revisies of celgrenzen af te vlakken.
use crate::document::{Fout, Resultaat};
use betteroffice_docx::{self as docx, BlockContent as B, InlineNode as I, ParagraphContent as P};
use std::sync::Arc;

/// De bronparser leest numerieke voorvoegsels. Nootnummers zijn gehele
/// verwijzingen: controleer de oorspronkelijke waarde vóór die interpretatie.
pub(crate) fn controleer_nootnummers(bytes: &[u8]) -> Resultaat<()> {
    let delen =
        ooxml_opc::unzip_parts_where(bytes, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |naam| {
            naam.eq_ignore_ascii_case("word/footnotes.xml")
                || naam.eq_ignore_ascii_case("word/endnotes.xml")
        })
        .map_err(|e| fout(&e))?;
    let limieten = docx_parse::xml::ParseLimits::default();
    for (naam, xml) in delen {
        let document = docx_parse::parse_xml(
            &xml,
            &naam,
            &mut docx_parse::xml::ParseBudget::new(&limieten),
        )
        .map_err(|e| fout(&e.to_string()))?;
        if let Some(root) = document.root() {
            for noot in root
                .child_elements()
                .filter(|n| matches!(n.local_name(), "footnote" | "endnote"))
            {
                let id = noot
                    .attribute(Some("w"), "id")
                    .and_then(|v| v.trim().parse::<i64>().ok())
                    .ok_or_else(|| fout("Ongeldig geheel voet- of eindnootnummer in de bron"))?;
                if id.unsigned_abs() > 9_007_199_254_740_991 {
                    return Err(fout(
                        "Voet- of eindnootnummer valt buiten het betrouwbare getalbereik",
                    ));
                }
            }
        }
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub enum AlineaActie {
    /// Positie telt Unicode-tekens, inclusief tabs en zachte regelovergangen.
    Splits {
        positie: usize,
    },
    /// Verwijder de Unicode-selectie en splits in dezelfde brontransactie.
    SplitsBereik {
        begin: usize,
        einde: usize,
    },
    VoegVolgendeSamen,
}

fn fout(tekst: &str) -> Fout {
    Fout::Document(tekst.into())
}
fn controleer(p: &docx::Paragraph) -> Resultaat<()> {
    if !crate::writer_tekst::ondersteund(p)
        || p.property_changes.is_some()
        || p.p_pr_ins.is_some()
        || p.p_pr_del.is_some()
        || p.content
            .iter()
            .any(|c| matches!(c, P::Inline(I::Run(r)) if r.property_changes.is_some()))
    {
        return Err(fout(
            "Deze alinea bevat inhoud of revisies die nog niet veilig kunnen worden gesplitst of samengevoegd",
        ));
    }
    Ok(())
}

/// Alleen aangrenzende alinea's binnen dezelfde body of dezelfde tabelcel.
/// Een inhoudsbesturing wordt niet doorkruist: die kan een eigen slot hebben.
fn zoek<'a>(blokken: &'a [B], id: &str) -> Option<(&'a [B], usize)> {
    for (i, blok) in blokken.iter().enumerate() {
        match blok {
            B::Paragraph(p) if p.para_id.as_deref() == Some(id) => return Some((blokken, i)),
            B::Table(t) => {
                for rij in &t.rows {
                    for cel in &rij.cells {
                        if let Some(gevonden) = zoek(&cel.content, id) {
                            return Some(gevonden);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    None
}

fn vervang(blokken: &mut Vec<B>, ids: &[String], nieuw: &[B]) -> bool {
    if let Some(i) = blokken.iter().position(|b| matches!(b, B::Paragraph(p) if p.para_id.as_ref() == Some(&ids[0])))
        && ids.iter().enumerate().all(|(n, id)| {
            matches!(blokken.get(i+n), Some(B::Paragraph(p)) if p.para_id.as_ref() == Some(id))
        })
    {
        blokken.splice(i..i + ids.len(), nieuw.iter().cloned());
        return true;
    }
    for blok in blokken {
        if let B::Table(t) = blok {
            for rij in &mut Arc::make_mut(t).rows {
                for cel in &mut rij.cells {
                    if vervang(&mut cel.content, ids, nieuw) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub fn alinea(d: &mut docx::Document, id: &str, actie: AlineaActie) -> Resultaat<()> {
    let actie = match actie {
        AlineaActie::Splits { positie } => AlineaActie::SplitsBereik {
            begin: positie,
            einde: positie,
        },
        a => a,
    };
    let (blokken, i) = zoek(&d.model().body.content, id)
        .ok_or_else(|| fout("Alinea ontbreekt of staat in een inhoudsbesturing"))?;
    let B::Paragraph(p) = &blokken[i] else {
        unreachable!()
    };
    controleer(p)?;
    let mut eerste = (**p).clone();
    let (ids, nieuw) = match actie {
        AlineaActie::Splits { .. } => unreachable!(),
        AlineaActie::SplitsBereik { begin, einde } => {
            let tekst = docx::get_paragraph_text(p);
            if begin > einde || einde > tekst.chars().count() {
                return Err(fout("Splitspositie valt buiten de alinea"));
            }
            let mut tweede = (**p).clone();
            let nieuw_id = loop {
                let bytes = *uuid::Uuid::new_v4().as_bytes();
                let n = u32::from_le_bytes(bytes[..4].try_into().unwrap()) & 0x7fff_ffff;
                let id = format!("{:08X}", n.max(1));
                if d.paragraph(&id).is_none() {
                    break id;
                }
            };
            tweede.para_id = Some(nieuw_id);
            tweede.repeated_para_id = None;
            tweede.para_id_attribute = None;
            tweede.source_ordinal = None;
            tweede.text_id = None;
            tweede.extra_attributes.clear();
            tweede.rendered_page_break_before = None;
            tweede.list_rendering = None;
            // Een voorafgaande paginaovergang hoort bij de eerste helft.
            tweede
                .formatting
                .get_or_insert_with(Default::default)
                .page_break_before = Some(false);
            // Een sectie-einde blijft achter de oorspronkelijke volledige tekst.
            eerste.section_properties = None;
            let (links, _) = crate::writer_tekst::splits_inhoud(p, begin);
            let (_, rechts) = crate::writer_tekst::splits_inhoud(p, einde);
            eerste.content = links;
            tweede.content = rechts;
            (
                vec![id.into()],
                vec![
                    B::Paragraph(Arc::new(eerste)),
                    B::Paragraph(Arc::new(tweede)),
                ],
            )
        }
        AlineaActie::VoegVolgendeSamen => {
            if eerste.section_properties.is_some() {
                return Err(fout("Samenvoegen over een sectie-einde is niet toegestaan"));
            }
            let Some(B::Paragraph(tweede)) = blokken.get(i + 1) else {
                return Err(fout(
                    "Er volgt geen alinea binnen dezelfde tekst of tabelcel",
                ));
            };
            controleer(tweede)?;
            if docx::get_paragraph_text(&eerste).len() + docx::get_paragraph_text(tweede).len()
                > 500_000
            {
                return Err(fout(
                    "Samengevoegde alinea overschrijdt de bewerkingslimiet",
                ));
            }
            let tweede_id = tweede
                .para_id
                .clone()
                .ok_or_else(|| fout("Volgende alinea mist een adres"))?;
            eerste.content.extend(tweede.content.iter().cloned());
            eerste.section_properties = tweede.section_properties.clone();
            (
                vec![id.into(), tweede_id],
                vec![B::Paragraph(Arc::new(eerste))],
            )
        }
    };
    let body = &mut d.model_mut().body;
    if !vervang(&mut body.content, &ids, &nieuw) {
        return Err(fout("Alineastructuur kon niet worden bijgewerkt"));
    }
    if let Some(secties) = &mut body.sections {
        for sectie in secties {
            vervang(&mut sectie.content, &ids, &nieuw);
        }
    }
    Ok(())
}

/// Alineagrenzen via toetsen; zachte regelovergangen blijven tekstinvoer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CursorActie {
    Splits,
    VorigeSamen,
    VolgendeSamen,
}
pub(crate) struct CursorPlan {
    id: String,
    actie: AlineaActie,
    doel: CursorNa,
}
enum CursorNa {
    NieuwNa(String),
    Bestaand(crate::writer_cursor::TekstPunt),
}
pub(crate) fn cursor_plan(
    d: &docx::Document,
    id: &str,
    begin: usize,
    einde: usize,
    actie: CursorActie,
) -> Resultaat<Option<CursorPlan>> {
    use crate::writer_cursor::TekstPunt;
    let (blokken, i) = zoek(&d.model().body.content, id)
        .ok_or_else(|| fout("Alinea ontbreekt of staat in een inhoudsbesturing"))?;
    let B::Paragraph(p) = &blokken[i] else {
        unreachable!()
    };
    controleer(p)?;
    let lengte = crate::writer_tekst::alinea_tekst(p).chars().count();
    if begin > einde || einde > lengte {
        return Err(fout("De alineacursor valt buiten de brontekst"));
    }
    let (id, bewerking, doel) = match actie {
        CursorActie::Splits => (
            id.into(),
            AlineaActie::SplitsBereik { begin, einde },
            CursorNa::NieuwNa(id.into()),
        ),
        CursorActie::VorigeSamen | CursorActie::VolgendeSamen => {
            if begin != einde
                || (actie == CursorActie::VorigeSamen && begin != 0)
                || (actie == CursorActie::VolgendeSamen && begin != lengte)
            {
                return Err(fout(
                    "Samenvoegen met een toets vraagt een cursor op de alineagrens zonder selectie",
                ));
            }
            let eerste = if actie == CursorActie::VorigeSamen {
                let Some(j) = i.checked_sub(1) else {
                    return Ok(None);
                };
                j
            } else {
                i
            };
            let (Some(B::Paragraph(a)), Some(B::Paragraph(_))) =
                (blokken.get(eerste), blokken.get(eerste + 1))
            else {
                return Ok(None);
            };
            let id = a
                .para_id
                .clone()
                .ok_or_else(|| fout("De aangrenzende alinea mist een adres"))?;
            let positie = crate::writer_tekst::alinea_tekst(a).chars().count();
            (
                id.clone(),
                AlineaActie::VoegVolgendeSamen,
                CursorNa::Bestaand(TekstPunt { id, positie }),
            )
        }
    };
    Ok(Some(CursorPlan {
        id,
        actie: bewerking,
        doel,
    }))
}
pub(crate) fn cursor_toepassen(
    d: &mut docx::Document,
    plan: CursorPlan,
) -> Resultaat<crate::writer_cursor::TekstPunt> {
    alinea(d, &plan.id, plan.actie)?;
    match plan.doel {
        CursorNa::Bestaand(p) => Ok(p),
        CursorNa::NieuwNa(id) => {
            let (blokken, i) = zoek(&d.model().body.content, &id)
                .ok_or_else(|| fout("De gesplitste bronalinea ontbreekt"))?;
            let Some(B::Paragraph(p)) = blokken.get(i + 1) else {
                return Err(fout(
                    "De nieuwe alinea ontbreekt binnen dezelfde tekst of tabelcel",
                ));
            };
            Ok(crate::writer_cursor::TekstPunt {
                id: p
                    .para_id
                    .clone()
                    .ok_or_else(|| fout("De nieuwe alinea mist een adres"))?,
                positie: 0,
            })
        }
    }
}
