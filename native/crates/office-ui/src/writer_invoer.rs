//! Bewaar de precieze invoergrenzen; leid geen grote vervanging af uit het eindresultaat.
use super::*;
use office_core::document::TekstStap;

impl Tab {
    pub fn tekst_opdracht(&self) -> Bewerking {
        let v = self.veld().expect("Bewerking vereist een actief veld");
        if self.antwoord.as_ref().unwrap().beeld.module == Module::Writer {
            Bewerking::TekstReeks {
                id: v.id.clone(),
                bron: v.tekst.clone(),
                tekst: self.editor.text(),
                stappen: self.writer_stappen.clone(),
            }
        } else {
            Bewerking::Tekst {
                id: v.id.clone(),
                tekst: self.editor.text(),
            }
        }
    }
}
pub fn voer_uit(t: &mut Tab, actie: text_editor::Action) -> Result<(), String> {
    if !actie.is_edit()
        || !t
            .antwoord
            .as_ref()
            .is_some_and(|a| a.beeld.module == Module::Writer)
    {
        t.editor.perform(actie);
        return Ok(());
    }
    let voor = t.editor.text();
    let cursor = t.editor.cursor();
    let positie = lint::tekenoffset(&t.editor, cursor.position);
    let anker = cursor
        .selection
        .map(|p| lint::tekenoffset(&t.editor, p))
        .unwrap_or(positie);
    let begin = positie.min(anker);
    let einde = positie.max(anker);
    t.editor.perform(actie.clone());
    let na = t.editor.text();
    let resultaat = (|| {
        if na.len() > 500_000 {
            return Err("Alinea groter dan de bewerkingslimiet".to_owned());
        }
        let a: Vec<_> = voor.chars().collect();
        let b: Vec<_> = na.chars().collect();
        let mut stappen = Vec::new();
        if a != b {
            let (begin, einde) = match actie {
                text_editor::Action::Edit(text_editor::Edit::Backspace) if begin == einde => (
                    lint::tekenoffset(&t.editor, t.editor.cursor().position),
                    einde,
                ),
                text_editor::Action::Edit(text_editor::Edit::Delete) if begin == einde => (
                    begin,
                    begin
                        + a.len()
                            .checked_sub(b.len())
                            .ok_or("Onverwachte verwijdergrens")?,
                ),
                text_editor::Action::Edit(
                    text_editor::Edit::Indent | text_editor::Edit::Unindent,
                ) => {
                    // De editor wijzigt alleen de inspringing van de betrokken regels.
                    // Registreer die per regel en van achter naar voren: tussenliggende
                    // tekst houdt haar eigen opmaak en de oorspronkelijke coördinaten.
                    let al: Vec<_> = voor.split('\n').collect();
                    let bl: Vec<_> = na.split('\n').collect();
                    if al.len() != bl.len() {
                        return Err("Onverwachte regelwijziging bij inspringen".into());
                    }
                    let mut offset = 0;
                    for (a, b) in al.into_iter().zip(bl) {
                        if a != b {
                            let av = a.trim_start_matches([' ', '\t']);
                            let bv = b.trim_start_matches([' ', '\t']);
                            if av != bv {
                                return Err("Inspringing zou andere tekst wijzigen".into());
                            }
                            let oud = &a[..a.len() - av.len()];
                            let nieuw = &b[..b.len() - bv.len()];
                            stappen.push(TekstStap {
                                begin: offset,
                                einde: offset + oud.chars().count(),
                                verwacht: oud.into(),
                                tekst: nieuw.into(),
                            });
                        }
                        offset += a.chars().count() + 1;
                    }
                    stappen.reverse();
                    return Ok(stappen);
                }
                _ => (begin, einde),
            };
            if begin > einde || einde > a.len() {
                return Err("Ongeldige Unicode-invoergrens".into());
            }
            let rest = a.len() - (einde - begin);
            let aantal = b
                .len()
                .checked_sub(rest)
                .ok_or("Invoer past niet in het geselecteerde bereik")?;
            if a[..begin] != b[..begin] || a[einde..] != b[begin + aantal..] {
                return Err("Invoer wijzigde tekst buiten het geselecteerde bereik".into());
            }
            stappen.push(TekstStap {
                begin,
                einde,
                verwacht: a[begin..einde].iter().collect(),
                tekst: b[begin..begin + aantal].iter().collect(),
            });
        }
        Ok(stappen)
    })();
    match resultaat {
        Ok(stappen)
            if t.writer_stappen.len() + stappen.len() <= 4096
                && t.writer_stappen
                    .iter()
                    .chain(&stappen)
                    .map(|s| s.tekst.len() + s.verwacht.len())
                    .sum::<usize>()
                    <= 16 * 1024 * 1024 =>
        {
            t.writer_stappen.extend(stappen);
            Ok(())
        }
        anders => {
            t.editor = text_editor::Content::with_text(&voor);
            t.editor.move_to(cursor);
            Err(anders.err().unwrap_or_else(|| {
                "Tekstconcept overschrijdt de bewerkingslimiet; pas eerst de huidige invoer toe"
                    .into()
            }))
        }
    }
}
