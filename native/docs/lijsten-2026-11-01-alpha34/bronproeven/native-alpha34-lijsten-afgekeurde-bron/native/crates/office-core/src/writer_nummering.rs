//! Nieuwe lijstdefinities invoegen zonder de oorspronkelijke XML te herschrijven.
use crate::document::{Fout, Resultaat};
use docx_parse::numbering::NumberingDefinitions;
use quick_xml::{events::Event, name::ResolveResult, reader::NsReader};
use std::collections::HashSet;
const WOORD: &[u8] = b"http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const PAD: &str = "word/numbering.xml";
fn fout(tekst: &str) -> Fout {
    Fout::Document(tekst.into())
}

pub(crate) struct Nummerbron {
    oorspronkelijk: NumberingDefinitions,
    xml: Option<Vec<u8>>,
    onduidelijk: bool,
}
impl Nummerbron {
    pub(crate) fn controleer_aanvulling(&self) -> Resultaat<()> {
        if self.onduidelijk {
            return Err(fout("De nummeringsbron is niet eenduidig"));
        }
        controleer_ids(&self.oorspronkelijk)?;
        if let Some(xml) = &self.xml {
            let s = lees(xml)?;
            for (tag, aantal) in [
                ("abstractNum", self.oorspronkelijk.abstract_nums.len()),
                ("num", self.oorspronkelijk.nums.len()),
            ] {
                if s.kinderen.iter().filter(|k| k.soort == tag).count() != aantal {
                    return Err(fout("De nummeringsbron bevat onbegrepen definities"));
                }
            }
        }
        Ok(())
    }
    pub fn nieuw(d: &betteroffice_docx::Document, bron: &[u8]) -> Resultaat<Self> {
        let delen =
            ooxml_opc::unzip_parts_where(bron, ooxml_opc::MAX_TOTAL_UNCOMPRESSED_BYTES, |n| {
                n.eq_ignore_ascii_case(PAD)
            })
            .map_err(Fout::Document)?;
        let onduidelijk = delen.len() > 1 || delen.first().is_some_and(|(n, _)| n != PAD);
        let xml = delen.into_iter().next().map(|(_, b)| b);
        Ok(Self {
            oorspronkelijk: d.model().numbering.clone(),
            xml,
            onduidelijk,
        })
    }
    pub fn bewaren(&self, d: &betteroffice_docx::Document) -> Resultaat<Vec<u8>> {
        let nieuw = &d.model().numbering;
        if nieuw == &self.oorspronkelijk {
            return d.save().map_err(|e| fout(&e.to_string()));
        }
        if self.onduidelijk {
            return Err(fout(
                "De nummeringsbron is niet eenduidig; de lijstwijziging is niet bewaard",
            ));
        }
        let oud = &self.oorspronkelijk;
        if nieuw.abstract_nums.len() < oud.abstract_nums.len()
            || nieuw.nums.len() < oud.nums.len()
            || nieuw.abstract_nums[..oud.abstract_nums.len()] != oud.abstract_nums
            || nieuw.nums[..oud.nums.len()] != oud.nums
        {
            return Err(fout(
                "Bestaande lijstdefinities wijzigen of verwijderen wordt nog niet veilig ondersteund",
            ));
        }
        controleer_ids(nieuw)?;
        let extra = NumberingDefinitions {
            abstract_nums: nieuw.abstract_nums[oud.abstract_nums.len()..].to_vec(),
            nums: nieuw.nums[oud.nums.len()..].to_vec(),
        };
        let Some(bron) = &self.xml else {
            return d.save().map_err(|e| fout(&e.to_string()));
        };
        let structuur = lees(bron)?;
        if structuur
            .kinderen
            .iter()
            .filter(|k| k.soort == "abstractNum")
            .count()
            != oud.abstract_nums.len()
            || structuur
                .kinderen
                .iter()
                .filter(|k| k.soort == "num")
                .count()
                != oud.nums.len()
        {
            return Err(fout(
                "De nummeringsbron bevat onbegrepen definities; de lijstwijziging is niet bewaard",
            ));
        }
        let nummering = voeg_toe(bron, &structuur, &extra)?;
        let bytes = d.save().map_err(|e| fout(&e.to_string()))?;
        let mut delen = ooxml_opc::unzip_parts(&bytes).map_err(Fout::Document)?;
        let mut gevonden = 0;
        for (naam, inhoud) in &mut delen {
            if naam == PAD {
                *inhoud = nummering.clone();
                gevonden += 1;
            }
        }
        if gevonden != 1 {
            return Err(fout("Het bewaarde nummeringsonderdeel is niet eenduidig"));
        }
        ooxml_opc::rezip_parts(&delen).map_err(Fout::Document)
    }
}
fn geheel(id: f64) -> Resultaat<i64> {
    if !id.is_finite() || id < 0. || id.fract() != 0. || id > i32::MAX as f64 {
        return Err(fout(
            "Een lijstidentificatie is geen ondersteund geheel getal",
        ));
    }
    Ok(id as i64)
}
pub(crate) fn controleer_ids(d: &NumberingDefinitions) -> Resultaat<()> {
    let mut abstracte = HashSet::new();
    let mut nummers = HashSet::new();
    for n in &d.abstract_nums {
        if !abstracte.insert(geheel(n.abstract_num_id)?) {
            return Err(fout("Dubbele abstracte lijstidentificatie"));
        }
    }
    for n in &d.nums {
        if !nummers.insert(geheel(n.num_id)?) {
            return Err(fout("Dubbele lijstidentificatie"));
        }
        if !abstracte.contains(&geheel(n.abstract_num_id)?) {
            return Err(fout("De abstracte lijstdefinitie ontbreekt"));
        }
    }
    Ok(())
}
struct Kind {
    soort: String,
    begin: usize,
    einde: usize,
}
struct Structuur {
    naam: Vec<u8>,
    begin: usize,
    open_einde: usize,
    sluit: usize,
    leeg: bool,
    kinderen: Vec<Kind>,
}
fn lees(xml: &[u8]) -> Resultaat<Structuur> {
    let mut reader = NsReader::from_reader(xml);
    let mut diepte = 0usize;
    let mut structuur: Option<Structuur> = None;
    let mut actief: Option<(String, usize)> = None;
    let mut klaar = false;
    let mut fase = 0;
    loop {
        let begin = reader.buffer_position() as usize;
        let (ruimte, event) = reader
            .read_resolved_event()
            .map_err(|e| fout(&format!("Ongeldige nummeringsbron: {e}")))?;
        let woord = matches!(ruimte,ResolveResult::Bound(ns) if ns.as_ref()==WOORD);
        let einde = reader.buffer_position() as usize;
        let leeg = matches!(&event, Event::Empty(_));
        match event {
            Event::Start(n) | Event::Empty(n) => {
                let lokaal = String::from_utf8_lossy(n.local_name().as_ref()).into_owned();
                if diepte == 0 {
                    if structuur.is_some() || klaar || !woord || lokaal != "numbering" {
                        return Err(fout("Geen eenduidige nummeringswortel"));
                    }
                    structuur = Some(Structuur {
                        naam: n.name().as_ref().to_vec(),
                        begin,
                        open_einde: einde,
                        sluit: begin,
                        leeg,
                        kinderen: vec![],
                    });
                    if leeg {
                        klaar = true;
                    } else {
                        diepte = 1;
                    }
                    continue;
                }
                if diepte == 1 {
                    let soort = if woord { lokaal } else { String::new() };
                    let rang = match soort.as_str() {
                        "numPicBullet" => Some(0),
                        "abstractNum" => Some(1),
                        "num" => Some(2),
                        "numIdMacAtCleanup" => Some(3),
                        _ => None,
                    };
                    if let Some(rang) = rang {
                        if rang < fase {
                            return Err(fout(
                                "De lijstonderdelen hebben geen ondersteunde volgorde",
                            ));
                        }
                        fase = rang;
                    }
                    if leeg {
                        structuur.as_mut().unwrap().kinderen.push(Kind {
                            soort,
                            begin,
                            einde,
                        });
                    } else {
                        actief = Some((soort, begin));
                    }
                } else if woord && matches!(lokaal.as_str(), "abstractNum" | "num") {
                    return Err(fout(
                        "Geneste of alternatieve lijstdefinities worden nog niet veilig aangevuld",
                    ));
                }
                if !leeg {
                    diepte += 1;
                }
            }
            Event::End(_) => {
                if diepte == 0 {
                    return Err(fout("Onverwacht einde in nummeringsbron"));
                }
                if diepte == 2 {
                    let (soort, begin) = actief
                        .take()
                        .ok_or_else(|| fout("Onvolledig lijstonderdeel"))?;
                    structuur.as_mut().unwrap().kinderen.push(Kind {
                        soort,
                        begin,
                        einde,
                    });
                } else if diepte == 1 {
                    structuur.as_mut().unwrap().sluit = begin;
                    klaar = true;
                }
                diepte -= 1;
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if diepte != 0 || !klaar {
        return Err(fout("Onvolledige nummeringsbron"));
    }
    structuur.ok_or_else(|| fout("Nummeringswortel ontbreekt"))
}
fn voeg_toe(bron: &[u8], s: &Structuur, extra: &NumberingDefinitions) -> Resultaat<Vec<u8>> {
    let gegenereerd = docx_parse::serializer::serialize_numbering_xml(extra);
    let nieuw = lees(gegenereerd.as_bytes())?;
    let mut abstracte = Vec::new();
    let mut nummers = Vec::new();
    for kind in nieuw.kinderen {
        let mut tekst = gegenereerd[kind.begin..kind.einde].to_owned();
        let grens = tekst
            .find([' ', '>', '/'])
            .ok_or_else(|| fout("Onvolledige nieuwe lijstdefinitie"))?;
        // De bestaande bron mag een andere prefix of standaardnaamruimte hebben.
        // Iedere nieuwe wortel krijgt daarom haar eigen bekende w-naamruimte.
        tekst.insert_str(
            grens,
            &format!(" xmlns:w=\"{}\"", std::str::from_utf8(WOORD).unwrap()),
        );
        match kind.soort.as_str() {
            "abstractNum" => abstracte.extend_from_slice(tekst.as_bytes()),
            "num" => nummers.extend_from_slice(tekst.as_bytes()),
            _ => return Err(fout("Onverwacht nieuw lijstonderdeel")),
        }
    }
    if s.leeg {
        if !bron[s.begin..s.open_einde].ends_with(b"/>") {
            return Err(fout("Onverwachte lege nummeringswortel"));
        }
        let mut uit = bron[..s.open_einde - 2].to_vec();
        uit.push(b'>');
        uit.extend(abstracte);
        uit.extend(nummers);
        uit.extend_from_slice(b"</");
        uit.extend_from_slice(&s.naam);
        uit.push(b'>');
        uit.extend_from_slice(&bron[s.open_einde..]);
        return Ok(uit);
    }
    let eind = s
        .kinderen
        .iter()
        .find(|k| k.soort == "numIdMacAtCleanup")
        .map_or(s.sluit, |k| k.begin);
    let begin = s
        .kinderen
        .iter()
        .find(|k| k.soort == "num")
        .map_or(eind, |k| k.begin);
    if begin > eind {
        return Err(fout("Onjuiste invoegplaatsen voor lijstdefinities"));
    }
    let mut uit = Vec::with_capacity(bron.len() + abstracte.len() + nummers.len());
    uit.extend_from_slice(&bron[..begin]);
    uit.extend(abstracte);
    uit.extend_from_slice(&bron[begin..eind]);
    uit.extend(nummers);
    uit.extend_from_slice(&bron[eind..]);
    Ok(uit)
}

#[cfg(test)]
mod proeven {
    use super::*;
    fn extra() -> NumberingDefinitions {
        let d = betteroffice_docx::Document::open(include_bytes!(
            "../tests/fixtures/writer-structuur.docx"
        ))
        .unwrap();
        let mut abstracte = d.model().numbering.abstract_nums[0].clone();
        abstracte.abstract_num_id = 99.;
        let mut nummer = d.model().numbering.nums[0].clone();
        nummer.num_id = 100.;
        nummer.abstract_num_id = 99.;
        nummer.level_overrides = None;
        NumberingDefinitions {
            abstract_nums: vec![abstracte],
            nums: vec![nummer],
        }
    }
    fn controleer_parse(xml: &[u8], aantal: usize) {
        let grenzen = docx_parse::xml::ParseLimits::default();
        let d = docx_parse::numbering::parse_numbering(
            Some(xml),
            PAD,
            &mut docx_parse::xml::ParseBudget::new(&grenzen),
        )
        .unwrap();
        assert_eq!(d.definitions.abstract_nums.len(), aantal);
        assert_eq!(d.definitions.nums.len(), aantal);
        assert!(
            d.definitions
                .nums
                .iter()
                .any(|n| n.num_id == 100. && n.abstract_num_id == 99.)
        );
    }
    #[test]
    fn writer_lijst_lege_wortel_met_andere_prefix_en_eigen_kenmerken_blijft_geldig() {
        let bron=br#"<?xml version="1.0"?>
<p:numbering xmlns:p="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:e="urn:bewaar" e:kenmerk="waarde" />
"#;
        let uit = voeg_toe(bron, &lees(bron).unwrap(), &extra()).unwrap();
        controleer_parse(&uit, 1);
        let tekst = std::str::from_utf8(&uit).unwrap();
        assert!(tekst.contains("xmlns:e=\"urn:bewaar\" e:kenmerk=\"waarde\" >"));
        assert!(tekst.ends_with("</p:numbering>\n"));
    }
    #[test]
    fn writer_lijst_onbekende_kenmerken_plaatjes_en_opruimmarker_blijven_bytegelijk() {
        let bron=br#"<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:e="urn:bewaar">
<!-- bewaar ook dit commentaar -->
<w:numPicBullet w:numPicBulletId="7"><w:pict><e:plaatje bron="eigen"/></w:pict></w:numPicBullet>
<w:abstractNum w:abstractNumId="1"><w:nsid w:val="12345678"/><e:abstract kenmerk="blijft"/></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/><e:instantie kenmerk="blijft"/></w:num>
<w:numIdMacAtCleanup w:val="27"/>
</w:numbering>"#;
        let uit = voeg_toe(bron, &lees(bron).unwrap(), &extra()).unwrap();
        controleer_parse(&uit, 2);
        let s = lees(&uit).unwrap();
        assert_eq!(
            s.kinderen
                .iter()
                .map(|k| k.soort.as_str())
                .collect::<Vec<_>>(),
            vec![
                "numPicBullet",
                "abstractNum",
                "abstractNum",
                "num",
                "num",
                "numIdMacAtCleanup"
            ]
        );
        let weg = [&s.kinderen[2], &s.kinderen[4]];
        let mut herstel = vec![];
        let mut begin = 0;
        for k in weg {
            herstel.extend_from_slice(&uit[begin..k.begin]);
            begin = k.einde;
        }
        herstel.extend_from_slice(&uit[begin..]);
        assert_eq!(herstel, bron);
    }
    #[test]
    fn writer_lijst_dubbelzinnige_volgorde_en_geneste_definities_worden_geweigerd() {
        for inhoud in [
            "<w:num w:numId=\"1\"/><w:abstractNum w:abstractNumId=\"1\"/>",
            "<e:alternatief><w:num w:numId=\"1\"/></e:alternatief>",
        ] {
            let bron = format!(
                "<w:numbering xmlns:w=\"{}\" xmlns:e=\"urn:bewaar\">{inhoud}</w:numbering>",
                std::str::from_utf8(WOORD).unwrap()
            );
            assert!(lees(bron.as_bytes()).is_err());
        }
    }
}
