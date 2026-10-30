//! Venstering, bereikopmaak en structuurwijzigingen boven de native werkmap.
use crate::{
    document::{Fout, Resultaat, Veld, Weergave},
    interactie::{Pagina, Raakvlak, RasterVenster, Rechthoek},
    opmaak::{Opmaak, OpmaakStaat, Uitlijning},
};
use betteroffice_xlsx as x;
fn fout(e: impl std::fmt::Display) -> Fout {
    Fout::Document(e.to_string())
}

#[derive(Debug, Clone)]
pub enum Structuur {
    RijInvoegen,
    RijVerwijderen,
    KolomInvoegen,
    KolomVerwijderen,
    Samenvoegen,
    Splitsen,
    BladToevoegen(String),
    BladHernoemen(String),
}
pub fn bereik(adres: &str) -> Resultaat<x::CellRange> {
    let r = x::CellRange::parse_a1(&adres.trim().to_ascii_uppercase()).map_err(fout)?;
    if r.start.row > r.end.row
        || r.start.col > r.end.col
        || r.end.row >= x::MAX_ROWS
        || r.end.col >= x::MAX_COLS
    {
        return Err(fout("Ongeldig celbereik"));
    }
    if u64::from(r.end.row - r.start.row + 1) * u64::from(r.end.col - r.start.col + 1) > 10_000 {
        return Err(fout("Selecteer maximaal 10.000 cellen per bewerking"));
    }
    Ok(r)
}
pub fn ankercel(d: &x::Workbook, deel: usize, cel: x::CellRef) -> Resultaat<x::CellRef> {
    Ok(
        d.merged_ranges(x::SheetId(deel as u32), x::CellRange::new(cel, cel))
            .map_err(fout)?
            .first()
            .map(|m| m.start)
            .unwrap_or(cel),
    )
}
fn veld(d: &x::Workbook, sheet: x::SheetId, cel: x::CellRef) -> Resultaat<Veld> {
    let inhoud = d.cell(sheet, cel).map_err(fout)?;
    let staat = d
        .selection_formatting(sheet, x::CellRange::new(cel, cel))
        .map_err(fout)?;
    Ok(Veld {
        id: cel.to_a1(),
        naam: cel.to_a1(),
        tekst: inhoud.input,
        bewerkbaar: true,
        opmaak: OpmaakStaat {
            vet: staat.bold.unwrap_or(false),
            cursief: staat.italic.unwrap_or(false),
            doorhalen: staat.strikethrough.unwrap_or(false),
            grootte: staat.font_size,
            lettertype: staat.font_family,
            ..Default::default()
        },
    })
}
pub fn toon(
    d: &x::Workbook,
    deel: usize,
    venster: RasterVenster,
    beeld: &mut Weergave,
) -> Resultaat<()> {
    let sheet = x::SheetId(deel as u32);
    let einde = x::CellRef::new(
        (venster.rij + 29).min(x::MAX_ROWS - 1),
        (venster.kolom + 11).min(x::MAX_COLS - 1),
    );
    let range = x::CellRange::new(x::CellRef::new(venster.rij, venster.kolom), einde);
    let mut viewport =
        x::viewport_for_range(d.sheet(sheet).map_err(fout)?, &d.model().styles, range);
    viewport.width = viewport.width.clamp(1., 1600.);
    viewport.height = viewport.height.clamp(1., 1400.);
    let png = d.render_png_for(sheet, &viewport).map_err(fout)?;
    beeld.pagina = Pagina {
        inhoud: None,
        breedte: png.width as f32,
        hoogte: png.height as f32,
        vlakken: vec![],
    };
    let merges = d.merged_ranges(sheet, range).map_err(fout)?;
    let mut cellen = Vec::new();
    for rij in venster.rij..=einde.row {
        for kolom in venster.kolom..=einde.col {
            let cel = x::CellRef::new(rij, kolom);
            if merges.iter().any(|m| {
                rij >= m.start.row && rij <= m.end.row && kolom >= m.start.col && kolom <= m.end.col
            }) {
                continue;
            }
            cellen.push((cel, cel));
        }
    }
    // Een zichtbare samenvoeging heeft één canoniek tekstveld en raakvlak,
    // ook wanneer de ankercel boven of links buiten het werkvenster ligt.
    cellen.extend(merges.iter().map(|m| (m.start, m.end)));
    cellen.sort_by_key(|(cel, _)| (cel.row, cel.col));
    for (cel, einde) in cellen {
        beeld.velden.push(veld(d, sheet, cel)?);
        let mut rect = d.cell_rect(sheet, cel).map_err(fout)?;
        let eind = d.cell_rect(sheet, einde).map_err(fout)?;
        rect.w = eind.x + eind.w - rect.x;
        rect.h = eind.y + eind.h - rect.y;
        let x = (rect.x - viewport.x).max(0.);
        let y = (rect.y - viewport.y).max(0.);
        let rechts = (rect.x + rect.w - viewport.x).min(png.width as f32);
        let onder = (rect.y + rect.h - viewport.y).min(png.height as f32);
        if rechts > x && onder > y {
            beeld.pagina.vlakken.push(Raakvlak {
                id: cel.to_a1(),
                grens: Rechthoek {
                    x,
                    y,
                    breedte: rechts - x,
                    hoogte: onder - y,
                },
            });
        }
    }
    beeld.afbeelding = Some(png.bytes);
    beeld.melding = format!(
        "{}:{} · berekening en opslag in Rust",
        range.start.to_a1(),
        range.end.to_a1()
    );
    Ok(())
}
pub fn opmaak(d: &mut x::Workbook, deel: usize, adres: &str, stijl: &Opmaak) -> Resultaat<()> {
    stijl.controleer()?;
    let range = bereik(adres)?;
    let sheet = x::SheetId(deel as u32);
    let mut p = x::StylePatch::default();
    match stijl {
        Opmaak::Vet(v) => p.bold = Some(*v),
        Opmaak::Cursief(v) => p.italic = Some(*v),
        Opmaak::Doorhalen(v) => p.strikethrough = Some(*v),
        Opmaak::Lettergrootte(v) => p.font_size = Some(*v),
        Opmaak::Lettertype(v) => p.font_family = Some(v.clone()),
        Opmaak::Kleur(v) => p.text_color = Some(v.clone()),
        Opmaak::Achtergrond(v) => p.fill_color = Some(v.clone()),
        Opmaak::Uitlijning(v) => {
            p.horizontal_alignment = Some(match v {
                Uitlijning::Links => x::HorizontalAlignment::Left,
                Uitlijning::Midden => x::HorizontalAlignment::Center,
                Uitlijning::Rechts => x::HorizontalAlignment::Right,
                _ => return Err(fout("Uitvullen wordt voor cellen nog niet ondersteund")),
            })
        }
        Opmaak::Tekstterugloop(v) => {
            p.text_wrapping = Some(if *v {
                x::TextWrapping::Wrap
            } else {
                x::TextWrapping::Overflow
            })
        }
        Opmaak::Getal(v) => {
            d.set_range_number_format(
                sheet,
                range,
                x::NumberFormatMutation::Custom { pattern: v.clone() },
                Default::default(),
            )
            .map_err(fout)?;
            return Ok(());
        }
        _ => return Err(fout("Deze celopmaak wordt nog niet ondersteund")),
    }
    d.patch_range_style(sheet, range, p, Default::default())
        .map_err(fout)?;
    Ok(())
}
pub fn structuur(d: &mut x::Workbook, deel: usize, adres: &str, actie: Structuur) -> Resultaat<()> {
    let r = bereik(adres)?;
    let sheet = x::SheetId(deel as u32);
    let op = match actie {
        Structuur::RijInvoegen => x::Op::InsertRows {
            sheet,
            at: r.start.row,
            count: r.end.row - r.start.row + 1,
        },
        Structuur::RijVerwijderen => x::Op::DeleteRows {
            sheet,
            at: r.start.row,
            count: r.end.row - r.start.row + 1,
        },
        Structuur::KolomInvoegen => x::Op::InsertCols {
            sheet,
            at: r.start.col,
            count: r.end.col - r.start.col + 1,
        },
        Structuur::KolomVerwijderen => x::Op::DeleteCols {
            sheet,
            at: r.start.col,
            count: r.end.col - r.start.col + 1,
        },
        Structuur::Samenvoegen => x::Op::MergeCells { sheet, range: r },
        Structuur::Splitsen => x::Op::UnmergeCells { sheet, range: r },
        Structuur::BladToevoegen(name) => x::Op::AddSheet {
            index: d.sheet_count(),
            name,
        },
        Structuur::BladHernoemen(name) => x::Op::RenameSheet { sheet, name },
    };
    d.apply_ops(vec![op], Default::default()).map_err(fout)?;
    Ok(())
}
