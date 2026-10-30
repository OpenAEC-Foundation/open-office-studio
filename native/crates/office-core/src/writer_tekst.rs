//! Vervangt uitsluitend gewone tekst. Ongewijzigde tekstdelen houden hun
//! runopmaak; velden, revisies, afbeeldingen en links worden niet afgevlakt.
use crate::document::{Fout, Resultaat};
use betteroffice_docx::{self as docx, InlineNode as I, ParagraphContent as P, RunContent as R};
use std::sync::Arc;
fn fout() -> Fout {
    Fout::Document("Deze alinea bevat een object, veld, link of revisie die nog niet veilig native kan worden bewerkt".into())
}
pub fn ondersteund(p: &docx::Paragraph) -> bool {
    p.content.iter().all(|c| match c {
        P::Inline(I::Run(r)) => r.content.iter().all(|c| {
            matches!(
                c,
                R::Text { .. }
                    | R::Tab
                    | R::Break {
                        break_type: None,
                        clear: None
                    }
            )
        }),
        _ => false,
    })
}
fn tekst(r: &docx::Run) -> String {
    r.content
        .iter()
        .map(|c| match c {
            R::Text { text, .. } => text.as_str(),
            R::Tab => "\t",
            R::Break { .. } => "\n",
            _ => "",
        })
        .collect()
}
fn inhoud(s: &str) -> Vec<R> {
    let mut uit = Vec::new();
    let mut begin = 0;
    for (i, c) in s.char_indices() {
        if c == '\n' || c == '\t' {
            if begin < i {
                uit.push(R::Text {
                    text: s[begin..i].into(),
                    preserve_space: Some(true),
                });
            }
            uit.push(if c == '\n' {
                R::Break {
                    break_type: None,
                    clear: None,
                }
            } else {
                R::Tab
            });
            begin = i + c.len_utf8();
        }
    }
    if begin < s.len() {
        uit.push(R::Text {
            text: s[begin..].into(),
            preserve_space: Some(true),
        });
    }
    uit
}
pub fn vervang(d: &mut docx::Document, id: &str, nieuw: &str) -> Resultaat<()> {
    if nieuw.len() > 500_000 {
        return Err(Fout::Document(
            "Alinea groter dan de bewerkingslimiet".into(),
        ));
    }
    let mut p = d
        .paragraph(id)
        .ok_or_else(|| Fout::Document("Alinea bestaat niet".into()))?
        .clone();
    if !ondersteund(&p) {
        return Err(fout());
    }
    let oud = docx::get_paragraph_text(&p);
    let a: Vec<char> = oud.chars().collect();
    let b: Vec<char> = nieuw.chars().collect();
    let prefix = a.iter().zip(&b).take_while(|(a, b)| a == b).count();
    let suffix = a[prefix..]
        .iter()
        .rev()
        .zip(b[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let midden: String = b[prefix..b.len() - suffix].iter().collect();
    let mut runs: Vec<docx::Run> = p
        .content
        .iter()
        .filter_map(|c| {
            if let P::Inline(I::Run(r)) = c {
                Some(r.clone())
            } else {
                None
            }
        })
        .collect();
    if runs.is_empty() {
        runs.push(docx::Run {
            node_type: docx_parse::inline::RunType::Run,
            formatting: None,
            property_changes: None,
            content: vec![],
        });
    }
    let mut uit = Vec::new();
    let mut positie = 0;
    let mut ingevoegd = false;
    for run in runs {
        let t: Vec<char> = tekst(&run).chars().collect();
        let einde = positie + t.len();
        let voor = prefix.saturating_sub(positie).min(t.len());
        if voor > 0 {
            let mut r = run.clone();
            r.content = inhoud(&t[..voor].iter().collect::<String>());
            uit.push(P::Inline(I::Run(r)));
        }
        if !ingevoegd && einde >= prefix {
            if !midden.is_empty() {
                let mut r = run.clone();
                r.content = inhoud(&midden);
                uit.push(P::Inline(I::Run(r)));
            }
            ingevoegd = true;
        }
        let start = (a.len() - suffix)
            .saturating_sub(positie)
            .min(t.len())
            .max(voor);
        if start < t.len() {
            let mut r = run.clone();
            r.content = inhoud(&t[start..].iter().collect::<String>());
            uit.push(P::Inline(I::Run(r)));
        }
        positie = einde;
    }
    p.content = uit;
    fn pas_toe(blokken: &mut [docx::BlockContent], id: &str, p: &docx::Paragraph) {
        for blok in blokken {
            match blok {
                docx::BlockContent::Paragraph(alinea) if alinea.para_id.as_deref() == Some(id) => {
                    *alinea = Arc::new(p.clone())
                }
                docx::BlockContent::Table(t) => {
                    for rij in &mut Arc::make_mut(t).rows {
                        for cel in &mut rij.cells {
                            pas_toe(&mut cel.content, id, p);
                        }
                    }
                }
                docx::BlockContent::BlockSdt(s) => pas_toe(&mut Arc::make_mut(s).content, id, p),
                _ => {}
            }
        }
    }
    let model = d.model_mut();
    pas_toe(&mut model.body.content, id, &p);
    if let Some(secties) = &mut model.body.sections {
        for sectie in secties {
            pas_toe(&mut sectie.content, id, &p);
        }
    }
    Ok(())
}
