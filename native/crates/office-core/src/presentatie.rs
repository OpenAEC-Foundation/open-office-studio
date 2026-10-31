//! Native tekstopmaak en diabeheer met behoud van de overige presentatie-inhoud.
use crate::{
    document::{Fout, Resultaat},
    interactie::{Pagina, Raakvlak, Rechthoek},
    opmaak::{Opmaak, OpmaakStaat, Uitlijning},
};
use betteroffice_pptx as p;
fn fout(e: impl std::fmt::Display) -> Fout {
    Fout::Document(e.to_string())
}
#[derive(Debug, Clone)]
pub enum DiaActie {
    Toevoegen,
    Verwijderen,
    Tekstvak,
    Verplaatsen(usize),
}
pub fn opmaak(
    d: &p::Presentation,
    id: &str,
    begin: usize,
    einde: usize,
    stijl: &Opmaak,
) -> Resultaat<()> {
    stijl.controleer()?;
    let story = d.story(id).map_err(fout)?;
    let tekst = story.plain_text();
    if begin > einde || einde > tekst.chars().count() {
        return Err(fout("Ongeldige tekstselectie"));
    }
    let start = tekst
        .chars()
        .take(begin)
        .map(|c| c.len_utf16() as u32)
        .sum();
    let end = tekst
        .chars()
        .take(einde)
        .map(|c| c.len_utf16() as u32)
        .sum();
    let ctx = p::EditCtx::local("OpenAEC");
    if let Opmaak::Uitlijning(a) = stijl {
        d.set_paragraph_alignment(
            &ctx,
            id,
            start,
            end,
            Some(match a {
                Uitlijning::Links => "l",
                Uitlijning::Midden => "ctr",
                Uitlijning::Rechts => "r",
                Uitlijning::Uitvullen => "just",
            }),
        )
        .map_err(fout)?;
    } else {
        if begin == einde {
            return Err(fout("Selecteer tekst om de opmaak te wijzigen"));
        }
        let mut patch = p::TextStylePatch::default();
        match stijl {
            Opmaak::Vet(v) => patch.bold = Some(*v),
            Opmaak::Cursief(v) => patch.italic = Some(*v),
            Opmaak::Onderstrepen(v) => {
                patch.underline = Some(if *v { "sng" } else { "none" }.into())
            }
            Opmaak::Lettergrootte(v) => patch.font_size_pt = Some(*v),
            Opmaak::Lettertype(v) => patch.font_family = Some(v.clone()),
            Opmaak::Kleur(v) => patch.color = Some(v.clone()),
            _ => return Err(fout("Deze diatekstopmaak wordt nog niet ondersteund")),
        }
        d.format_text(&ctx, id, start, end, &patch).map_err(fout)?;
    }
    Ok(())
}
pub fn staat(story: &p::StorySnapshot) -> OpmaakStaat {
    let f = story
        .paragraphs
        .iter()
        .flat_map(|p| &p.runs)
        .next()
        .map(|r| &r.style);
    OpmaakStaat {
        vet: f.and_then(|f| f.bold).unwrap_or(false),
        cursief: f.and_then(|f| f.italic).unwrap_or(false),
        onderstrepen: f
            .and_then(|f| f.underline.as_deref())
            .is_some_and(|v| v != "none"),
        grootte: f.and_then(|f| f.font_size_pt),
        lettertype: f.and_then(|f| f.font_family.clone()),
        ..Default::default()
    }
}
pub fn actie(d: &p::Presentation, deel: usize, actie: DiaActie) -> Resultaat<()> {
    let deck = d.snapshot().map_err(fout)?;
    let dia = deck
        .slides
        .get(deel)
        .ok_or_else(|| fout("Dia bestaat niet"))?;
    let ctx = p::EditCtx::local("OpenAEC");
    match actie {
        DiaActie::Toevoegen => {
            d.insert_slide(&ctx, (deel + 1) as u32, None)
                .map_err(fout)?;
        }
        DiaActie::Verwijderen => {
            if deck.slides.len() == 1 {
                return Err(fout("Bewaar ten minste één dia"));
            }
            d.delete_slide(&ctx, &dia.id).map_err(fout)?;
        }
        DiaActie::Verplaatsen(n) => {
            if n >= deck.slides.len() {
                return Err(fout("Ongeldige diapositie"));
            }
            d.move_slide(&ctx, &dia.id, n as u32).map_err(fout)?;
        }
        DiaActie::Tekstvak => {
            d.add_text_box(
                &ctx,
                &dia.id,
                &p::ShapeDraft {
                    name: "Tekstvak".into(),
                    rect: p::ShapeRect {
                        x: deck.width_emu / 10,
                        y: deck.height_emu / 3,
                        width: deck.width_emu * 4 / 5,
                        height: deck.height_emu / 5,
                    },
                    text: "Nieuwe tekst".into(),
                    style: p::TextStyle {
                        font_size_pt: Some(24.),
                        font_family: Some("Inter".into()),
                        ..Default::default()
                    },
                },
            )
            .map_err(fout)?;
        }
    }
    Ok(())
}
pub fn geometrie(d: &p::Presentation, deel: usize) -> Resultaat<Pagina> {
    use p::Primitive;
    let render = d.render_slide(deel).map_err(fout)?;
    let dl = render.display_list;
    fn bezoek(primitieven: &[Primitive], vlakken: &mut Vec<Raakvlak>) {
        for primitief in primitieven {
            match primitief {
                Primitive::TextBox {
                    story_id: Some(id),
                    x,
                    y,
                    w,
                    h,
                    transform,
                    ..
                } if transform.is_identity() => vlakken.push(Raakvlak {
                    id: id.clone(),
                    grens: Rechthoek {
                        x: *x,
                        y: *y,
                        breedte: *w,
                        hoogte: *h,
                    },
                }),
                Primitive::Table { primitives, .. } | Primitive::Chart { primitives, .. } => {
                    bezoek(primitives, vlakken)
                }
                _ => {}
            }
        }
    }
    let mut pagina = Pagina {
        inhoud: None,
        breedte: dl.width,
        hoogte: dl.height,
        vlakken: vec![],
    };
    bezoek(&dl.primitives, &mut pagina.vlakken);
    Ok(pagina)
}
