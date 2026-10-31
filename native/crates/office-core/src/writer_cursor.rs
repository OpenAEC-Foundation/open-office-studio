//! Tekstposities en markeringen komen uit dezelfde gevormde layout als het beeld.
use crate::{
    document::{Fout, Resultaat},
    interactie::Rechthoek,
};
use docx_layout::{display_list::DisplayList, hit};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct TekstMarkering {
    pub pagina: usize,
    pub cursor: Option<Rechthoek>,
    pub rechthoeken: Vec<Rechthoek>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TekstPunt {
    pub id: String,
    /// Aantal scalaire Unicode-tekens vanaf het begin van de bronalinea.
    pub positie: usize,
}
struct Adres {
    id: String,
    van: i64,
    tot: i64,
}
pub(crate) struct AdresKaart {
    adressen: Vec<Adres>,
    ids: HashMap<String, usize>,
}
fn fout(tekst: &str) -> Fout {
    Fout::Document(tekst.into())
}
impl AdresKaart {
    pub(crate) fn nieuw(engine: &docx_edit::EngineSession) -> Resultaat<Self> {
        let docx_edit::GeometryRead::Value(omtrek) = engine.doc().geometry_position_outline("body")
        else {
            return Err(fout(
                "Deze bron heeft nog geen betrouwbare tekstpositiekaart",
            ));
        };
        let mut adressen = Vec::new();
        for verhaal in omtrek.values() {
            for p in &verhaal.paragraphs {
                if !p.controls.is_empty() {
                    continue;
                }
                let van = verhaal
                    .content_start
                    .checked_add(p.display_start)
                    .and_then(|n| n.checked_add(1))
                    .ok_or_else(|| fout("Tekstpositie te groot"))?;
                let tot = van
                    .checked_add(p.length)
                    .ok_or_else(|| fout("Tekstpositie te groot"))?;
                adressen.push(Adres {
                    id: p.para_id.clone(),
                    van: i64::try_from(van).map_err(|_| fout("Tekstpositie te groot"))?,
                    tot: i64::try_from(tot).map_err(|_| fout("Tekstpositie te groot"))?,
                });
                if adressen.len() > 100_000 {
                    return Err(fout(
                        "Te veel alinea’s voor een volledige tekstpositiekaart",
                    ));
                }
            }
        }
        adressen.sort_by_key(|a| a.van);
        let mut ids = HashMap::new();
        for (i, a) in adressen.iter().enumerate() {
            if ids.insert(a.id.clone(), i).is_some() || (i > 0 && adressen[i - 1].tot >= a.van) {
                return Err(fout(
                    "Dubbele of overlappende tekstadressen worden niet geschat",
                ));
            }
        }
        Ok(Self { adressen, ids })
    }
    pub(crate) fn markering(
        &self,
        dl: &DisplayList,
        pagina: usize,
        id: &str,
        begin: u32,
        einde: u32,
        lengte: u32,
    ) -> Resultaat<TekstMarkering> {
        let a = self
            .ids
            .get(id)
            .and_then(|&i| self.adressen.get(i))
            .ok_or_else(|| fout("Geen betrouwbaar tekstadres voor deze alinea"))?;
        if begin > einde || einde > lengte || a.tot - a.van != i64::from(lengte) {
            return Err(fout("Tekstpositiekaart en bronalinea komen niet overeen"));
        }
        if einde - begin > 8192 {
            return Err(fout(
                "De selectie overschrijdt het markeerbudget; zij wordt niet afgekapt",
            ));
        }
        let van = a.van + i64::from(begin);
        let tot = a.van + i64::from(einde);
        let rechthoeken = hit::range_rects_on_pages(dl, [pagina], van, tot);
        if rechthoeken.len() > 8192 {
            return Err(fout(
                "Te veel markeervlakken; de selectie wordt niet afgekapt",
            ));
        }
        let mut rechthoeken = rechthoeken
            .into_iter()
            .map(|r| rechthoek(r.x, r.y, r.width, r.height))
            .collect::<Resultaat<Vec<_>>>()?;
        // Samenliggende vlakken van dezelfde regel eenmaal tekenen voorkomt
        // een donkerdere overlap tussen aaneengesloten gevormde glyphs.
        rechthoeken.sort_by(|a, b| {
            a.y.total_cmp(&b.y)
                .then(a.hoogte.total_cmp(&b.hoogte))
                .then(a.x.total_cmp(&b.x))
        });
        let mut samen: Vec<Rechthoek> = Vec::new();
        for r in rechthoeken {
            if let Some(vorige) = samen.last_mut()
                && vorige.y == r.y
                && vorige.hoogte == r.hoogte
                && r.x <= vorige.x + vorige.breedte
            {
                vorige.breedte = (vorige.x + vorige.breedte).max(r.x + r.breedte) - vorige.x;
            } else {
                samen.push(r);
            }
        }
        let rechthoeken = samen;
        if begin != einde && rechthoeken.is_empty() {
            return Err(fout(
                "Deze selectie heeft geen zichtbare markering op deze pagina",
            ));
        }
        let cursor = hit::caret_rect(dl, tot)
            .filter(|c| c.page_index == pagina)
            .map(|c| rechthoek(c.x, c.y, 1.5, c.height))
            .transpose()?;
        if begin == einde && cursor.is_none() {
            return Err(fout(
                "Deze tekstpositie heeft geen zichtbare cursor op de gevraagde pagina",
            ));
        }
        Ok(TekstMarkering {
            pagina,
            cursor,
            rechthoeken,
        })
    }
    pub(crate) fn punt(
        &self,
        dl: &DisplayList,
        pagina: usize,
        x: f64,
        y: f64,
    ) -> Resultaat<Option<(String, u32)>> {
        let Some(h) = hit::hit_test_regions(dl, pagina, x, y) else {
            return Ok(None);
        };
        if h.region != hit::HitRegion::Body || h.target != hit::HoverTarget::Text {
            return Ok(None);
        }
        let Some(pos) = h.pos else { return Ok(None) };
        let i = self.adressen.partition_point(|a| a.van <= pos);
        let Some(a) = i
            .checked_sub(1)
            .and_then(|i| self.adressen.get(i))
            .filter(|a| pos <= a.tot)
        else {
            return Ok(None);
        };
        let offset = u32::try_from(pos - a.van).map_err(|_| fout("Tekstpositie te groot"))?;
        Ok(Some((a.id.clone(), offset)))
    }
}
fn rechthoek(x: f64, y: f64, breedte: f64, hoogte: f64) -> Resultaat<Rechthoek> {
    let waarden = [x as f32, y as f32, breedte as f32, hoogte as f32];
    if !waarden.iter().all(|n| n.is_finite()) || breedte < 0. || hoogte <= 0. {
        return Err(fout("Ongeldige tekstgeometrie uit de layout"));
    }
    Ok(Rechthoek {
        x: waarden[0],
        y: waarden[1],
        breedte: waarden[2],
        hoogte: waarden[3],
    })
}
pub(crate) fn scalar_naar_utf16(tekst: &str, positie: usize) -> Resultaat<u32> {
    let mut scalar = 0;
    let mut utf16 = 0u32;
    for c in tekst.chars() {
        if scalar == positie {
            return Ok(utf16);
        }
        utf16 = utf16
            .checked_add(c.len_utf16() as u32)
            .ok_or_else(|| fout("Tekstpositie te groot"))?;
        scalar += 1;
    }
    if scalar == positie {
        Ok(utf16)
    } else {
        Err(fout("Tekstpositie valt buiten de alinea"))
    }
}
pub(crate) fn utf16_naar_scalar(tekst: &str, positie: u32) -> Resultaat<usize> {
    let mut offset = 0u32;
    for (scalar, c) in tekst.chars().enumerate() {
        if offset == positie {
            return Ok(scalar);
        }
        offset = offset
            .checked_add(c.len_utf16() as u32)
            .ok_or_else(|| fout("Tekstpositie te groot"))?;
        if offset > positie {
            return Err(fout("Tekstpositie valt midden in een Unicode-teken"));
        }
    }
    if offset == positie {
        Ok(tekst.chars().count())
    } else {
        Err(fout("Tekstpositie valt buiten de alinea"))
    }
}

#[cfg(test)]
mod proeven {
    use super::*;
    #[test]
    fn scalaire_grenzen_accepteren_nooit_een_halve_surrogaat() {
        let tekst = "é🏠a\n";
        for (scalar, utf16) in [(0, 0), (1, 1), (2, 3), (3, 4), (4, 5)] {
            assert_eq!(scalar_naar_utf16(tekst, scalar).unwrap(), utf16);
            assert_eq!(utf16_naar_scalar(tekst, utf16).unwrap(), scalar);
        }
        assert!(utf16_naar_scalar(tekst, 2).is_err());
        assert!(utf16_naar_scalar(tekst, 6).is_err());
        assert!(scalar_naar_utf16(tekst, usize::MAX).is_err());
    }
}
