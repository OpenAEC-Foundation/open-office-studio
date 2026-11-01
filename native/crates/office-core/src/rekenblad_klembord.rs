//! Platte tabellen: opgemaakte waarden kopiëren en celinvoer gezamenlijk plakken.
//! Geen rijke opmaakoverdracht, formuleverschuiving of verplaatsing van broncellen.
use crate::{
    celtekst::CelTekst,
    document::{Fout, Resultaat},
    rekenblad,
};
use betteroffice_xlsx as x;
fn fout(e: impl std::fmt::Display) -> Fout {
    Fout::Document(e.to_string())
}
fn blad(d: &x::Workbook, deel: usize) -> Resultaat<x::SheetId> {
    if deel >= d.sheet_count() {
        return Err(fout("Dit werkblad bestaat niet"));
    }
    Ok(x::SheetId(deel as u32))
}
pub fn doel(adres: &str, t: &CelTekst) -> Resultaat<x::CellRange> {
    let r = rekenblad::bereik(adres)?;
    let (hoog, breed) = (
        (r.end.row - r.start.row + 1) as usize,
        (r.end.col - r.start.col + 1) as usize,
    );
    if hoog == 1 && breed == 1 {
        let einde = x::CellRef::new(
            r.start
                .row
                .checked_add((t.hoogte() - 1) as u32)
                .ok_or_else(|| fout("Het plakbereik valt buiten het werkblad"))?,
            r.start
                .col
                .checked_add((t.breedte() - 1) as u32)
                .ok_or_else(|| fout("Het plakbereik valt buiten het werkblad"))?,
        );
        return rekenblad::bereik(&format!("{}:{}", r.start.to_a1(), einde.to_a1()));
    }
    if !hoog.is_multiple_of(t.hoogte()) || !breed.is_multiple_of(t.breedte()) {
        return Err(fout(
            "De geselecteerde afmetingen passen niet bij het klembordbereik",
        ));
    }
    Ok(r)
}
pub fn kopieer(d: &x::Workbook, deel: usize, adres: &str) -> Resultaat<String> {
    let sheet = blad(d, deel)?;
    let r = rekenblad::bereik(adres)?;
    let gesloten = rekenblad::selectie(d, deel, &r.start.to_a1(), &r.end.to_a1())?;
    let r = rekenblad::bereik(&gesloten.adres)?;
    let merges = d.merged_ranges(sheet, r).map_err(fout)?;
    let mut gedekt = std::collections::HashSet::new();
    let mut werk = 0usize;
    for m in merges {
        for rij in m.start.row..=m.end.row {
            for kolom in m.start.col..=m.end.col {
                werk += 1;
                if werk > crate::celtekst::MAX_CELLEN {
                    return Err(fout(
                        "Overlappende samenvoegingen passen niet in het klembordbereik",
                    ));
                }
                if x::CellRef::new(rij, kolom) != m.start {
                    gedekt.insert((rij, kolom));
                }
            }
        }
    }
    let mut rijen = Vec::new();
    let mut bytes = 0usize;
    for rij in r.start.row..=r.end.row {
        let mut cellen = Vec::new();
        for kolom in r.start.col..=r.end.col {
            let tekst = if gedekt.contains(&(rij, kolom)) {
                String::new()
            } else {
                d.sheet(sheet)
                    .map_err(fout)?
                    .cell(x::CellRef::new(rij, kolom))
                    .map(|cel| {
                        xlsx_render::display_text(&d.model().styles, d.model().date_system, cel)
                    })
                    .unwrap_or_default()
            };
            bytes = bytes.saturating_add(tekst.len());
            if bytes > crate::celtekst::MAX_BYTES {
                return Err(fout(
                    "De geselecteerde celinvoer is te groot voor het klembord",
                ));
            }
            cellen.push(tekst);
        }
        rijen.push(cellen);
    }
    CelTekst::nieuw(rijen)
        .map_err(fout)?
        .schrijf()
        .map_err(fout)
}
pub fn plak(d: &mut x::Workbook, deel: usize, adres: &str, t: &CelTekst) -> Resultaat<()> {
    let sheet = blad(d, deel)?;
    let mut r = doel(adres, t)?;
    let enkel = t.hoogte() == 1 && t.breedte() == 1;
    if enkel && r.start == r.end {
        let anker = rekenblad::ankercel(d, deel, r.start)?;
        r = d
            .merged_ranges(sheet, x::CellRange::new(anker, anker))
            .map_err(fout)?
            .into_iter()
            .next()
            .unwrap_or(x::CellRange::new(anker, anker));
        rekenblad::bereik(&format!("{}:{}", r.start.to_a1(), r.end.to_a1()))?;
    }
    let merges = d.merged_ranges(sheet, r).map_err(fout)?;
    let wissen = enkel && t.rijen()[0][0].is_empty();
    let gehele_merge = merges.len() == 1 && merges[0] == r;
    for m in &merges {
        let geheel = m.start.row >= r.start.row
            && m.end.row <= r.end.row
            && m.start.col >= r.start.col
            && m.end.col <= r.end.col;
        if !geheel || !(wissen || enkel && gehele_merge) {
            return Err(fout(
                "Plak eerst in gewone cellen; gedeeltelijke of meervoudige samenvoegingen worden niet overschreven",
            ));
        }
    }
    if d.sheet(sheet)
        .map_err(fout)?
        .array_formulas()
        .any(|(_, a)| {
            a.start.row <= r.end.row
                && a.end.row >= r.start.row
                && a.start.col <= r.end.col
                && a.end.col >= r.start.col
        })
    {
        return Err(fout(
            "Een bestaande matrixformule wordt niet via het klembord gewijzigd",
        ));
    }
    // Volledige controle vóór de ene gezamenlijke enginebewerking. Een late
    // ongeldige formule mag geen eerdere cel uit hetzelfde plakblok bewaren.
    let mut edits = Vec::new();
    let mut bytes = 0usize;
    for rij in r.start.row..=r.end.row {
        for kolom in r.start.col..=r.end.col {
            let cel = x::CellRef::new(rij, kolom);
            if gehele_merge && !wissen && cel != r.start {
                continue;
            }
            let tekst = &t.rijen()[(rij - r.start.row) as usize % t.hoogte()]
                [(kolom - r.start.col) as usize % t.breedte()];
            bytes = bytes.saturating_add(tekst.len());
            if bytes > crate::celtekst::MAX_BYTES {
                return Err(fout("De uitgezette celinvoer is te groot"));
            }
            rekenblad::controleer_invoer(d, deel, cel, tekst)?;
            edits.push(x::CellInput {
                cell: cel,
                input: tekst.clone(),
            });
        }
    }
    d.edit_cells(sheet, &edits, x::CalculationOptions::default())
        .map_err(fout)?;
    Ok(())
}
