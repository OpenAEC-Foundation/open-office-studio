//! Regelkeuze en cursoraffiniteit gebruiken uitsluitend de gevormde displaylijst.
use crate::{
    document::{Fout, Resultaat},
    interactie::Rechthoek,
    writer_cursor::{AdresKaart, TekstPunt},
};
use docx_layout::{
    display_list::{DisplayList, DisplayPage, DocAttrs, Primitive},
    hit,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Richting {
    Omhoog,
    Omlaag,
    RegelBegin,
    RegelEinde,
}
#[derive(Debug, Clone, PartialEq)]
pub struct CursorDoel {
    pub pagina: usize,
    pub punt: TekstPunt,
    pub cursor: Rechthoek,
    /// De gevormde regel blijft onderscheidbaar wanneer haar einde dezelfde
    /// bronpositie heeft als het begin van een automatisch afgebroken regel.
    pub regel: Option<u64>,
    pub basislijn: f64,
    pub doel_x: Option<f64>,
}
#[derive(Clone)]
pub(crate) struct Kandidaat {
    pub pagina: usize,
    pub id: String,
    pub van: i64,
    pub tot: i64,
    pub regel: Option<u64>,
    pub basislijn: f64,
    pub cursor: Rechthoek,
}
pub(crate) struct Vraag<'a> {
    pub pagina: usize,
    pub id: &'a str,
    pub pos: i64,
    pub vorige: i64,
    pub richting: Richting,
    pub voorkeur: Option<&'a CursorDoel>,
    pub doel_x: Option<f64>,
}
fn fout(s: &str) -> Fout {
    Fout::Document(s.into())
}
fn tekst(p: &Primitive) -> Option<(&DocAttrs, f64)> {
    match p {
        Primitive::Text(t) => Some((&t.attrs, t.baseline_y.as_f64()?)),
        Primitive::GlyphRun(g) if !g.glyphs.is_empty() => Some((
            &g.attrs,
            g.glyphs
                .iter()
                .map(|g| g.y)
                .fold(f64::NEG_INFINITY, f64::max),
        )),
        _ => None,
    }
}
fn blad(p: &DisplayPage, primitives: Vec<Primitive>) -> DisplayPage {
    // Geen afbeeldingen, kop/voet, noten of andere grote payload kopiëren
    // voor een cursorvraag. De brongeometrie wordt niet veranderd.
    DisplayPage {
        page_index: p.page_index,
        width: p.width.clone(),
        height: p.height.clone(),
        content_bounds: p.content_bounds.clone(),
        column_bounds: p.column_bounds.clone(),
        section_id: p.section_id.clone(),
        section_index: p.section_index,
        section_page_index: p.section_page_index,
        section_page_number: p.section_page_number,
        page_label: p.page_label.clone(),
        primitives,
        watermark_primitive_count: None,
        background: None,
        page_borders: vec![],
        header: None,
        footer: None,
        note_areas: vec![],
        reservations: vec![],
        table_gridlines: vec![],
        unbuilt: p.unbuilt,
        position_span: p.position_span,
        hf_parts: None,
    }
}
pub(crate) fn kandidaten(dl: &DisplayList, id: &str, pos: i64) -> Resultaat<Vec<Kandidaat>> {
    let mut uit = Vec::new();
    for (pagina, p) in dl.pages.iter().enumerate() {
        for prim in &p.primitives {
            let Some((a, basislijn)) = tekst(prim) else {
                continue;
            };
            let (Some(van), Some(tot)) = (a.doc_start, a.doc_end) else {
                continue;
            };
            if a.para_id.as_deref() != Some(id) || pos < van || pos > tot {
                continue;
            }
            if !basislijn.is_finite() {
                return Err(fout("Ongeldige basislijn in de tekstgeometrie"));
            }
            let een = DisplayList {
                contract_version: dl.contract_version,
                pages: vec![blad(p, vec![prim.clone()])],
            };
            let Some(c) = hit::caret_rect(&een, pos) else {
                continue;
            };
            let waarden = [c.x as f32, c.y as f32, c.height as f32];
            if !waarden.iter().all(|n| n.is_finite()) || c.height <= 0. {
                return Err(fout("Ongeldig cursorvlak in de gevormde tekst"));
            }
            uit.push(Kandidaat {
                pagina,
                id: id.into(),
                van,
                tot,
                regel: a.line_index,
                basislijn,
                cursor: Rechthoek {
                    x: c.x as f32,
                    y: c.y as f32,
                    breedte: 1.5,
                    hoogte: c.height as f32,
                },
            });
            if uit.len() > 128 {
                return Err(fout(
                    "Te veel overlappende cursorposities; er wordt niet geschat",
                ));
            }
        }
    }
    Ok(uit)
}
fn zelfde_regel(a: &Kandidaat, b: &Kandidaat) -> bool {
    a.pagina == b.pagina
        && a.id == b.id
        && match (a.regel, b.regel) {
            (Some(a), Some(b)) => a == b,
            _ => a.basislijn == b.basislijn,
        }
}
pub(crate) fn kies(
    dl: &DisplayList,
    id: &str,
    pos: i64,
    pagina: usize,
    voorkeur: Option<&CursorDoel>,
) -> Resultaat<Kandidaat> {
    let kandidaten = kandidaten(dl, id, pos)?;
    if let Some(v) = voorkeur {
        return kandidaten
            .into_iter()
            .find(|k| {
                k.pagina == pagina
                    && k.regel == v.regel
                    && k.basislijn == v.basislijn
                    && k.cursor == v.cursor
            })
            .ok_or_else(|| fout("De voorkeurcursor hoort niet bij deze gevormde regel"));
    }
    let c = hit::caret_rect(dl, pos)
        .filter(|c| c.page_index == pagina)
        .ok_or_else(|| fout("Geen eenduidige cursor op deze pagina"))?;
    kandidaten
        .into_iter()
        .find(|k| {
            k.pagina == pagina
                && k.cursor.x == c.x as f32
                && k.cursor.y == c.y as f32
                && k.cursor.hoogte == c.height as f32
        })
        .ok_or_else(|| fout("De cursor past niet bij de brontekst"))
}
pub(crate) fn klik(dl: &DisplayList, id: &str, pos: i64, x: f64, y: f64) -> Resultaat<Kandidaat> {
    kandidaten(dl, id, pos)?
        .into_iter()
        .min_by(|a, b| {
            let afstand = |k: &Kandidaat| {
                let x = f64::from(k.cursor.x) - x;
                let top = f64::from(k.cursor.y);
                let onder = top + f64::from(k.cursor.hoogte);
                let dy = if y < top {
                    top - y
                } else if y > onder {
                    y - onder
                } else {
                    0.
                };
                // De klikregel weegt eerst; de caretstop binnen die regel daarna.
                (dy, x.abs())
            };
            let (a, b) = (afstand(a), afstand(b));
            a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1))
        })
        .ok_or_else(|| fout("Geen gevormde cursor voor dit klikpunt"))
}
pub(crate) fn verplaats(
    dl: &DisplayList,
    adressen: &AdresKaart,
    vraag: Vraag<'_>,
) -> Resultaat<(Kandidaat, i64, Option<f64>)> {
    let Vraag {
        pagina,
        id,
        pos,
        vorige,
        richting,
        voorkeur,
        doel_x,
    } = vraag;
    if doel_x.is_some_and(|x| !x.is_finite()) {
        return Err(fout("De doelkolom is geen eindig documentpunt"));
    }
    let start = kies(dl, id, pos, pagina, voorkeur)?;
    if matches!(richting, Richting::RegelBegin | Richting::RegelEinde) {
        let p = &dl.pages[pagina];
        let mut van = start.van;
        let mut tot = start.tot;
        for prim in &p.primitives {
            if let Some((a, basislijn)) = tekst(prim)
                && a.para_id.as_deref() == Some(id)
                && match (start.regel, a.line_index) {
                    (Some(x), Some(y)) => x == y,
                    _ => basislijn == start.basislijn,
                }
                && let (Some(a), Some(b)) = (a.doc_start, a.doc_end)
            {
                van = van.min(a);
                tot = tot.max(b);
            }
        }
        let doel = if richting == Richting::RegelBegin {
            van
        } else {
            tot
        };
        let k = kandidaten(dl, id, doel)?
            .into_iter()
            .filter(|k| zelfde_regel(k, &start))
            .max_by_key(|k| k.van <= doel && doel < k.tot)
            .ok_or_else(|| fout("Geen cursor aan de echte regelgrens"))?;
        return Ok((k, doel, None));
    }
    let eerste = pagina.saturating_sub(1);
    let laatste = (pagina + 2).min(dl.pages.len());
    let anker = if pos == start.tot && pos > start.van {
        vorige
    } else {
        pos
    };
    let mut aantal = 0usize;
    let pages = (eerste..laatste)
        .map(|n| {
            let p = &dl.pages[n];
            let primitives = p
                .primitives
                .iter()
                .filter(|prim| {
                    let Some((a, _)) = tekst(prim) else {
                        return false;
                    };
                    // Een herhaalde tabelkop op een andere pagina mag niet de
                    // vertrekcursor van de werkelijk zichtbare pagina overnemen.
                    !(n != pagina
                        && a.para_id.as_deref() == Some(id)
                        && a.doc_start.zip(a.doc_end).is_some_and(|(a, b)| {
                            (a == b && a == anker) || (a <= anker && anker < b)
                        }))
                })
                .cloned()
                .collect::<Vec<_>>();
            aantal += primitives.len();
            blad(p, primitives)
        })
        .collect();
    if aantal > 20_000 {
        return Err(fout("Het navigatievenster overschrijdt het tekstbudget"));
    }
    let dun = DisplayList {
        contract_version: dl.contract_version,
        pages,
    };
    let doel_x = doel_x.unwrap_or(f64::from(start.cursor.x));
    let d = match richting {
        Richting::Omhoog => hit::VerticalDirection::Up,
        _ => hit::VerticalDirection::Down,
    };
    let m = hit::vertical_move(&dun, anker, d, Some(doel_x))
        .ok_or_else(|| fout("Geen betrouwbare gevormde regelovergang"))?;
    let Some((doel_id, _)) = adressen.punt_voor_positie(m.position)? else {
        return Err(fout("De doelregel heeft geen betrouwbaar brontekstadres"));
    };
    let mut opties = kandidaten(&dun, &doel_id, m.position)?;
    for k in &mut opties {
        k.pagina += eerste;
    }
    opties.retain(|k| {
        !zelfde_regel(k, &start)
            && match richting {
                Richting::Omhoog => (k.pagina, k.basislijn) < (start.pagina, start.basislijn),
                _ => (k.pagina, k.basislijn) > (start.pagina, start.basislijn),
            }
    });
    opties.sort_by(|a, b| {
        a.pagina
            .cmp(&b.pagina)
            .then(a.basislijn.total_cmp(&b.basislijn))
    });
    let gekozen = if richting == Richting::Omhoog {
        opties.last()
    } else {
        opties.first()
    };
    let Some(gekozen) = gekozen.cloned() else {
        if m.position == anker {
            return Ok((start, pos, Some(doel_x)));
        }
        return Err(fout("De doelcursor ligt niet in de gevraagde richting"));
    };
    let k = opties
        .into_iter()
        .filter(|k| zelfde_regel(k, &gekozen))
        .max_by_key(|k| k.van <= m.position && m.position < k.tot)
        .unwrap();
    Ok((k, m.position, Some(doel_x)))
}
