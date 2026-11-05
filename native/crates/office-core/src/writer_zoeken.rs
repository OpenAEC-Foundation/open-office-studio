//! Letterlijk zoeken in hoofdtekst en tabelalinea's; resultaten tellen Unicode-tekens.
//! De bronvelden komen uit de documentengine, nooit uit het zichtbare paginabeeld.
use crate::document::{Fout, Resultaat, TekstReeks, TekstStap, Veld};
use regex::{Regex, RegexBuilder};
use std::collections::BTreeMap;

pub const MAX_TREFFERS: usize = 4096;
const MAX_TEKST: usize = 16 * 1024 * 1024;
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Zoekopdracht {
    pub tekst: String,
    pub hoofdlettergevoelig: bool,
    pub hele_woorden: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Treffer {
    pub veld: usize,
    pub id: String,
    pub begin: usize,
    pub einde: usize,
    pub tekst: String,
    pub context: String,
}
fn fout(tekst: &str) -> Fout {
    Fout::Document(tekst.into())
}

pub fn zoek(velden: &[Veld], opdracht: &Zoekopdracht) -> Resultaat<Vec<Treffer>> {
    if opdracht.tekst.is_empty() {
        return Ok(Vec::new());
    }
    if opdracht.tekst.len() > 4096
        || velden
            .iter()
            .try_fold(0usize, |n, v| n.checked_add(v.tekst.len()))
            .is_none_or(|n| n > MAX_TEKST)
    {
        return Err(fout(
            "Zoekopdracht overschrijdt de tekstlimiet; verfijn de zoektekst",
        ));
    }
    let patroon = RegexBuilder::new(&regex::escape(&opdracht.tekst))
        .case_insensitive(!opdracht.hoofdlettergevoelig)
        .unicode(true)
        .size_limit(1024 * 1024)
        .build()
        .map_err(|_| fout("Zoektekst kan niet worden verwerkt"))?;
    // Unicode-letters, cijfers, combinatietekens en underscores blijven samen.
    static WOORD: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let woord = WOORD.get_or_init(|| Regex::new(r"\w").expect("vast Unicode-woordpatroon"));
    let is_woord = |c: Option<char>| c.is_some_and(|c| woord.is_match(c.encode_utf8(&mut [0; 4])));
    let mut uit = Vec::new();
    let mut trefferbytes = 0usize;
    for (veld, v) in velden.iter().enumerate() {
        let mut byte = 0;
        let mut teken = 0;
        for m in patroon.find_iter(&v.tekst) {
            if opdracht.hele_woorden
                && (is_woord(v.tekst[..m.start()].chars().next_back())
                    || is_woord(v.tekst[m.end()..].chars().next()))
            {
                continue;
            }
            let begin = teken + v.tekst[byte..m.start()].chars().count();
            let einde = begin + m.as_str().chars().count();
            byte = m.end();
            teken = einde;
            trefferbytes += m.len();
            if uit.len() == MAX_TREFFERS || trefferbytes > MAX_TEKST {
                return Err(fout(
                    "Te veel zoekresultaten; verfijn de zoektekst. Er wordt niets vervangen.",
                ));
            }
            let voor: String = v.tekst[..m.start()]
                .chars()
                .rev()
                .take(32)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            let na: String = v.tekst[m.end()..].chars().take(48).collect();
            uit.push(Treffer {
                veld,
                id: v.id.clone(),
                begin,
                einde,
                tekst: m.as_str().into(),
                context: format!("{voor}{}{na}", m.as_str()),
            });
        }
    }
    Ok(uit)
}

/// Bouw één concept per geraakte alinea, met vervangingen van achter naar voren.
/// De documentkern controleert alle concepten opnieuw vóór enig schrijven.
pub fn vervangplan(
    velden: &[Veld],
    treffers: &[Treffer],
    tekst: &str,
) -> Resultaat<Vec<TekstReeks>> {
    if treffers.is_empty() || treffers.len() > MAX_TREFFERS || tekst.len() > 500_000 {
        return Err(fout(
            "Geen bruikbare vervangopdracht of vervanglimiet overschreden",
        ));
    }
    let mut groepen: BTreeMap<usize, Vec<&Treffer>> = BTreeMap::new();
    for t in treffers {
        if t.tekst != tekst {
            groepen.entry(t.veld).or_default().push(t);
        }
    }
    if groepen.is_empty() {
        return Err(fout("De vervanging verandert geen tekst"));
    }
    let mut uit = Vec::new();
    let mut totaal = 0usize;
    let mut werk = 0usize;
    for (index, mut groep) in groepen {
        let veld = velden
            .get(index)
            .ok_or_else(|| fout("Het zoekresultaat is verouderd"))?;
        if !veld.bewerkbaar {
            return Err(fout(
                "Een zoekresultaat staat in inhoud die alleen gelezen kan worden. Er wordt niets vervangen.",
            ));
        }
        if veld.tekst.len() > 500_000 {
            return Err(fout("Alinea overschrijdt de vervanglimiet"));
        }
        werk = werk
            .checked_add(
                veld.tekst
                    .len()
                    .checked_mul(groep.len())
                    .ok_or_else(|| fout("Vervanglimiet overschreden"))?,
            )
            .ok_or_else(|| fout("Vervanglimiet overschreden"))?;
        if werk > 32 * 1024 * 1024 {
            return Err(fout("Vervangopdracht is te groot; verfijn de zoektekst"));
        }
        groep.sort_by_key(|t| t.begin);
        let chars: Vec<_> = veld.tekst.chars().collect();
        let mut cursor = 0;
        let mut resultaat = String::new();
        let mut stappen = Vec::new();
        for t in groep {
            if t.id != veld.id
                || t.begin < cursor
                || t.begin >= t.einde
                || t.einde > chars.len()
                || chars[t.begin..t.einde].iter().collect::<String>() != t.tekst
            {
                return Err(fout(
                    "Het zoekresultaat past niet bij de huidige alineatekst",
                ));
            }
            resultaat.extend(chars[cursor..t.begin].iter());
            resultaat.push_str(tekst);
            cursor = t.einde;
            if resultaat.len() > 500_000 {
                return Err(fout("Vervanging maakt de alinea te groot"));
            }
            stappen.push(TekstStap {
                begin: t.begin,
                einde: t.einde,
                verwacht: t.tekst.clone(),
                tekst: tekst.into(),
            });
        }
        resultaat.extend(chars[cursor..].iter());
        totaal = totaal
            .checked_add(veld.tekst.len())
            .and_then(|n| n.checked_add(resultaat.len()))
            .ok_or_else(|| fout("Vervanglimiet overschreden"))?;
        if resultaat.len() > 500_000 || totaal > MAX_TEKST {
            return Err(fout("Vervanging overschrijdt de tekstlimiet"));
        }
        stappen.reverse();
        uit.push(TekstReeks {
            id: veld.id.clone(),
            bron: veld.tekst.clone(),
            tekst: resultaat,
            stappen,
        });
    }
    Ok(uit)
}
