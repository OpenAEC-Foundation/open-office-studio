//! Wijzig uitsluitend het tekstverschil, zodat onveranderde tekst zijn
//! oorspronkelijke runopmaak houdt. Alineamarkeringen zijn aparte engineposities.
use crate::document::{Fout, Resultaat};
use betteroffice_pptx::{EditCtx, Presentation, TextStyle};
fn fout(e: impl std::fmt::Display) -> Fout {
    Fout::Document(e.to_string())
}
pub fn vervang(d: &Presentation, id: &str, nieuw: &str) -> Resultaat<()> {
    if nieuw.len() > 500_000 {
        return Err(Fout::Document(
            "Tekstveld groter dan de bewerkingslimiet".into(),
        ));
    }
    let verhaal = d.story(id).map_err(fout)?;
    let oud = verhaal.plain_text();
    let a: Vec<char> = oud.chars().collect();
    let b: Vec<char> = nieuw.chars().collect();
    let prefix = a.iter().zip(&b).take_while(|(a, b)| a == b).count();
    let suffix = a[prefix..]
        .iter()
        .rev()
        .zip(b[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let begin = a[..prefix]
        .iter()
        .map(|c| c.len_utf16() as u32)
        .sum::<u32>();
    let einde = a[..a.len() - suffix]
        .iter()
        .map(|c| c.len_utf16() as u32)
        .sum::<u32>();
    let midden: String = b[prefix..b.len() - suffix].iter().collect();
    let mut offset = 0;
    let mut grenzen = Vec::new();
    let mut stijl = TextStyle::default();
    let mut gevonden = false;
    for (i, p) in verhaal.paragraphs.iter().enumerate() {
        let start = offset;
        for run in &p.runs {
            let lengte = run.text.encode_utf16().count() as u32;
            if !gevonden {
                stijl = run.style.clone();
                if begin < offset + lengte {
                    gevonden = true;
                }
            }
            offset += lengte;
        }
        grenzen.push((start, offset, i + 1 < verhaal.paragraphs.len()));
        offset += 1;
    }
    let ctx = EditCtx::local("OpenAEC");
    d.add_undo_barrier();
    for (start, eind, volgende) in grenzen.into_iter().rev() {
        if volgende && begin <= eind && eind < einde {
            d.delete_paragraph_break(&ctx, id, eind).map_err(fout)?;
        }
        let links = begin.max(start);
        let rechts = einde.min(eind);
        if links < rechts {
            d.delete_text(&ctx, id, links, rechts).map_err(fout)?;
        }
    }
    let regels: Vec<_> = midden.split('\n').collect();
    let mut positie = begin;
    for (i, regel) in regels.iter().enumerate() {
        if !regel.is_empty() {
            d.insert_text(&ctx, id, positie, regel, &stijl)
                .map_err(fout)?;
        }
        positie += regel.encode_utf16().count() as u32;
        if i + 1 < regels.len() {
            d.insert_paragraph_break(&ctx, id, positie).map_err(fout)?;
            positie += 1;
        }
    }
    Ok(())
}
