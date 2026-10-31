//! Lokale celsprongen gebruiken de logische geometrie uit dezelfde engineweergave.
//! Een onbekend of onzichtbaar doel blijft een opdracht voor de werkmapkern.
use office_core::{
    document::{Module, Weergave},
    interactie::{RasterKop, RasterKoppen},
    rekenblad::{Richting, bereik},
};
type Cel = (u32, u32);
fn cel(adres: &str) -> Option<Cel> {
    let r = bereik(adres).ok()?;
    (r.start == r.end).then_some((r.start.row, r.start.col))
}
fn samenvoeging(koppen: &RasterKoppen, punt: Cel) -> Option<(Cel, Cel)> {
    let mut gevonden = None;
    for m in &koppen.samenvoegingen {
        let a = cel(&m.anker)?;
        let b = cel(&m.einde)?;
        if a.0 > b.0 || a.1 > b.1 {
            return None;
        }
        if a.0 <= punt.0 && punt.0 <= b.0 && a.1 <= punt.1 && punt.1 <= b.1 {
            if gevonden.is_some() {
                return None;
            }
            gevonden = Some((a, b));
        }
    }
    Some(gevonden.unwrap_or((punt, punt)))
}
fn zichtbaar(beeld: &Weergave, adres: &str) -> bool {
    if beeld.velden.iter().filter(|v| v.id == adres).count() != 1 {
        return false;
    }
    let mut vlakken = beeld.pagina.vlakken.iter().filter(|v| v.id == adres);
    let Some(v) = vlakken.next() else {
        return false;
    };
    let r = v.grens;
    vlakken.next().is_none()
        && [r.x, r.y, r.breedte, r.hoogte]
            .iter()
            .all(|v| v.is_finite())
        && r.breedte > 0.
        && r.hoogte > 0.
        && r.x >= 0.
        && r.y >= 0.
        && r.x < beeld.pagina.breedte
        && r.y < beeld.pagina.hoogte
}
fn geldige_as(koppen: &[RasterKop], begin: u32, einde: u32, maat: f32) -> bool {
    koppen.iter().all(|k| {
        k.index >= begin
            && k.index <= einde
            && k.begin.is_finite()
            && k.omvang.is_finite()
            && k.omvang > 0.
            && (k.begin + k.omvang).is_finite()
            && k.begin < maat
            && k.begin + k.omvang > 0.
    }) && koppen.windows(2).all(|k| k[0].index < k[1].index)
}
fn geldige_spans(spans: &[(u32, u32)], begin: u32, einde: u32) -> bool {
    spans
        .iter()
        .all(|(a, b)| begin <= *a && a <= b && *b <= einde)
        && spans.windows(2).all(|s| s[0].1 < s[1].0)
}
pub(super) fn volgende(beeld: &Weergave, van: &str, richting: Richting) -> Option<String> {
    if beeld.module != Module::Spreadsheet
        || !beeld.pagina.breedte.is_finite()
        || !beeld.pagina.hoogte.is_finite()
        || beeld.pagina.breedte <= 0.
        || beeld.pagina.hoogte <= 0.
        || !zichtbaar(beeld, van)
    {
        return None;
    }
    let koppen = beeld.raster.as_ref()?;
    let venster = bereik(&koppen.bereik).ok()?;
    if !geldige_as(
        &koppen.rijen,
        venster.start.row,
        venster.end.row,
        beeld.pagina.hoogte,
    ) || !geldige_as(
        &koppen.kolommen,
        venster.start.col,
        venster.end.col,
        beeld.pagina.breedte,
    ) {
        return None;
    }
    let start = cel(van)?;
    let (anker, einde) = samenvoeging(koppen, start)?;
    if anker != start {
        return None;
    }
    let (verticaal, vooruit, index) = match richting {
        Richting::Links => (false, false, anker.1.checked_sub(1)),
        Richting::Rechts => (false, true, einde.1.checked_add(1)),
        Richting::Boven => (true, false, anker.0.checked_sub(1)),
        Richting::Onder => (true, true, einde.0.checked_add(1)),
    };
    let Some(index) = index else {
        return Some(van.into());
    };
    let (as_koppen, spans, laag, hoog) = if verticaal {
        (
            &koppen.rijen,
            &koppen.verborgen_rijen,
            venster.start.row,
            venster.end.row,
        )
    } else {
        (
            &koppen.kolommen,
            &koppen.verborgen_kolommen,
            venster.start.col,
            venster.end.col,
        )
    };
    if index < laag || index > hoog || !geldige_spans(spans, laag, hoog) {
        return None;
    }
    let index = if let Some((a, b)) = spans.iter().find(|(a, b)| *a <= index && index <= *b) {
        if vooruit {
            b.checked_add(1)?
        } else {
            a.checked_sub(1)?
        }
    } else {
        index
    };
    if index < laag || index > hoog || !as_koppen.iter().any(|k| k.index == index) {
        return None;
    }
    let doel = if verticaal {
        (index, anker.1)
    } else {
        (anker.0, index)
    };
    let doel = samenvoeging(koppen, doel)?.0;
    let mut adres = bereik(van).ok()?.start;
    adres.row = doel.0;
    adres.col = doel.1;
    let adres = adres.to_a1();
    zichtbaar(beeld, &adres).then_some(adres)
}
