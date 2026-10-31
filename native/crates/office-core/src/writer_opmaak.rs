//! Opmaakstatus uit dezelfde opgeloste runattributen als de tekenengine.
//! Geen tweede implementatie van stijl-, tabel- of thema-overerving.
use crate::{
    document::{Fout, Resultaat},
    opmaak::OpmaakStaat,
};
use std::collections::{BTreeMap, HashMap};
use yrs::Any;

#[derive(Debug, Clone)]
pub struct OpmaakBereik {
    /// Unicode-tekens binnen de eigen alinea, niet UTF-16-eenheden.
    pub begin: usize,
    pub einde: usize,
    pub opmaak: OpmaakStaat,
}
#[derive(Debug, Default)]
pub(crate) struct AlineaOpmaak {
    pub tekst: String,
    pub bereiken: Vec<OpmaakBereik>,
}
pub(crate) type Alineas = HashMap<String, AlineaOpmaak>;

fn staat(attrs: &BTreeMap<String, Any>) -> OpmaakStaat {
    let actief = |naam: &str| {
        attrs
            .get(naam)
            .is_some_and(|v| !matches!(v, Any::Null | Any::Undefined | Any::Bool(false)))
    };
    let veld = |naam: &str, sleutel: &str| match attrs.get(naam) {
        Some(Any::Map(m)) => m.get(sleutel),
        _ => None,
    };
    let familie =
        ["ascii", "hAnsi", "cs"]
            .iter()
            .find_map(|sleutel| match veld("fontFamily", sleutel) {
                Some(Any::String(v)) if !v.is_empty() => Some(v.to_string()),
                _ => None,
            });
    let grootte = ["size", "sizeCs"]
        .iter()
        .find_map(|sleutel| match veld("fontSize", sleutel) {
            Some(Any::Number(n)) if n.is_finite() && *n > 0. => Some(*n / 2.),
            _ => None,
        });
    OpmaakStaat {
        vet: actief("bold"),
        cursief: actief("italic"),
        onderstrepen: actief("underline"),
        doorhalen: actief("strike"),
        // Dit zijn dezelfde laatste terugvalwaarden als de native layoutaanvraag.
        grootte: if attrs.contains_key("fontSize") {
            grootte
        } else {
            Some(11.)
        },
        lettertype: if attrs.contains_key("fontFamily") {
            familie
        } else {
            Some("Calibri".into())
        },
    }
}

pub(crate) fn lees(doc: &docx_edit::EditingDoc) -> Resultaat<Alineas> {
    use docx_edit::SegmentContent as S;
    let mut uit = Alineas::new();
    for verhaal in doc.list_stories().stories {
        if verhaal.root != "body" {
            continue;
        }
        let mut alinea = AlineaOpmaak::default();
        let mut positie = 0;
        for segment in doc
            .story_segments(&verhaal.story)
            .map_err(|e| Fout::Document(e.to_string()))?
        {
            // De engine bewaart een zachte regelovergang als een break-embed.
            // Die telt in de gewone alinea-editor als één Unicode-teken; andere
            // objecten houden hun onbewerkbare vervangteken.
            let inhoud = match segment.content {
                S::OtherEmbed { kind, .. } if kind == "break" => S::Text("\n".into()),
                anders => anders,
            };
            match inhoud {
                S::Text(tekst) => {
                    let einde = positie + tekst.chars().count();
                    if einde > positie {
                        let opmaak = staat(&segment.attributes);
                        if let Some(vorig) = alinea.bereiken.last_mut()
                            && vorig.einde == positie
                            && vorig.opmaak == opmaak
                        {
                            vorig.einde = einde;
                        } else {
                            alinea.bereiken.push(OpmaakBereik {
                                begin: positie,
                                einde,
                                opmaak,
                            });
                        }
                    }
                    alinea.tekst.push_str(&tekst);
                    positie = einde;
                }
                S::Pilcrow(p) => {
                    // Dubbele identificaties mogen niet stil de opmaak van een
                    // andere alinea overnemen. Zulke bron is al niet bewerkbaar.
                    match uit.entry(p.para_id) {
                        std::collections::hash_map::Entry::Vacant(v) => {
                            v.insert(std::mem::take(&mut alinea));
                        }
                        std::collections::hash_map::Entry::Occupied(mut v) => {
                            *v.get_mut() = AlineaOpmaak::default();
                            alinea = AlineaOpmaak::default();
                        }
                    }
                    positie = 0;
                }
                S::OtherEmbed { .. } => {
                    // Inhoud met objecten of velden wordt niet via een gewone
                    // tekstrange bewerkt. De tekstvergelijking bij het aansluiten
                    // voorkomt dat afwijkende offsets bruikbaar lijken.
                    alinea.tekst.push('\u{fffc}');
                    positie += 1;
                }
            }
        }
    }
    Ok(uit)
}

/// Gehele alinea of expliciete selectie. Gemengde waarden geven geen actief
/// formaat; één druk op Vet maakt vervolgens het hele gekozen bereik vet.
pub fn selectie(bereiken: &[OpmaakBereik], begin: usize, einde: usize) -> Option<OpmaakStaat> {
    if begin >= einde {
        return None;
    }
    let mut gezien = begin;
    let mut uit: Option<OpmaakStaat> = None;
    for bereik in bereiken {
        if bereik.einde <= begin || bereik.begin >= einde {
            continue;
        }
        if bereik.begin > gezien {
            return None;
        }
        gezien = gezien.max(bereik.einde.min(einde));
        let staat = &bereik.opmaak;
        if let Some(uit) = &mut uit {
            uit.vet &= staat.vet;
            uit.cursief &= staat.cursief;
            uit.onderstrepen &= staat.onderstrepen;
            uit.doorhalen &= staat.doorhalen;
            if uit.grootte != staat.grootte {
                uit.grootte = None;
            }
            if uit.lettertype != staat.lettertype {
                uit.lettertype = None;
            }
        } else {
            uit = Some(staat.clone());
        }
    }
    if gezien < einde { None } else { uit }
}
