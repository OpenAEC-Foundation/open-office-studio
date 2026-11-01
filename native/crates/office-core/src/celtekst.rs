//! Platte celtekst met tabgescheiden velden, geciteerde regels en expliciete grenzen.
pub const MAX_CELLEN: usize = 10_000;
pub const MAX_BYTES: usize = 4 * 1024 * 1024;
fn ongeldige_xmltekst(tekst: &str) -> bool {
    tekst.chars().any(|c| {
        (c < ' ' && !matches!(c, '\t' | '\n' | '\r')) || matches!(c, '\u{fffe}' | '\u{ffff}')
    })
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CelTekst {
    rijen: Vec<Vec<String>>,
}
impl CelTekst {
    pub fn nieuw(mut rijen: Vec<Vec<String>>) -> Result<Self, String> {
        let breedte = rijen.iter().map(Vec::len).max().unwrap_or(0);
        if breedte == 0
            || rijen
                .len()
                .checked_mul(breedte)
                .is_none_or(|n| n > MAX_CELLEN)
        {
            return Err("Het klembordbereik moet 1 tot 10.000 cellen bevatten".into());
        }
        let mut bytes = 0usize;
        for rij in &mut rijen {
            for cel in rij.iter() {
                bytes = bytes.saturating_add(cel.len());
                if bytes > MAX_BYTES || ongeldige_xmltekst(cel) {
                    return Err("De celtekst is te groot of bevat ongeldige XML-tekens".into());
                }
            }
            rij.resize(breedte, String::new());
        }
        Ok(Self { rijen })
    }
    pub fn rijen(&self) -> &[Vec<String>] {
        &self.rijen
    }
    pub fn hoogte(&self) -> usize {
        self.rijen.len()
    }
    pub fn breedte(&self) -> usize {
        self.rijen[0].len()
    }
    pub fn lees(tekst: &str) -> Result<Self, String> {
        if tekst.len() > MAX_BYTES || ongeldige_xmltekst(tekst) {
            return Err("De klembordtekst is te groot of bevat ongeldige XML-tekens".into());
        }
        let mut rijen = Vec::new();
        let mut breedte = 0usize;
        let mut rij = Vec::new();
        let mut veld = String::new();
        let mut tekens = tekst.chars().peekable();
        let (mut begin, mut geciteerd, mut gesloten, mut eindregel) = (true, false, false, false);
        while let Some(c) = tekens.next() {
            eindregel = false;
            if geciteerd {
                if c == '"' {
                    if tekens.peek() == Some(&'"') {
                        tekens.next();
                        veld.push('"');
                    } else {
                        geciteerd = false;
                        gesloten = true;
                    }
                } else {
                    veld.push(c);
                }
                continue;
            }
            if c == '"' && begin {
                begin = false;
                geciteerd = true;
                continue;
            }
            if c == '\t' || c == '\n' || c == '\r' {
                rij.push(std::mem::take(&mut veld));
                breedte = breedte.max(rij.len());
                if breedte
                    .checked_mul(rijen.len() + 1)
                    .is_none_or(|n| n > MAX_CELLEN)
                {
                    return Err("Het rechthoekige klembordbereik bevat te veel cellen".into());
                }
                begin = true;
                gesloten = false;
                if c != '\t' {
                    if c == '\r' && tekens.peek() == Some(&'\n') {
                        tekens.next();
                    }
                    rijen.push(std::mem::take(&mut rij));
                    if rijen.len() > MAX_CELLEN {
                        return Err("Te veel klembordrijen".into());
                    }
                    eindregel = true;
                }
            } else {
                if gesloten {
                    return Err("Onverwachte tekst na een geciteerd celveld".into());
                }
                begin = false;
                veld.push(c);
            }
        }
        if geciteerd {
            return Err("Een geciteerd celveld is niet afgesloten".into());
        }
        if !eindregel || rijen.is_empty() {
            rij.push(veld);
            rijen.push(rij);
        }
        Self::nieuw(rijen)
    }
    pub fn schrijf(&self) -> Result<String, String> {
        let mut uit = String::new();
        for (r, rij) in self.rijen.iter().enumerate() {
            if r > 0 {
                uit.push_str("\r\n");
            }
            for (k, cel) in rij.iter().enumerate() {
                if k > 0 {
                    uit.push('\t');
                }
                if cel.is_empty() || cel.contains(['\t', '\n', '\r', '"']) {
                    uit.push('"');
                    for c in cel.chars() {
                        uit.push(c);
                        if c == '"' {
                            uit.push('"');
                        }
                    }
                    uit.push('"');
                } else {
                    uit.push_str(cel);
                }
                if uit.len() > MAX_BYTES {
                    return Err("De geschreven klembordtekst is te groot".into());
                }
            }
        }
        Ok(uit)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn celtekst_geleende_tabellen_citaten_unicode_en_lege_randen() {
        let t = CelTekst::lees(
            "café\t\"regel één\nregel twee\"\t\"\"\r\n\"een \"\"citaat\"\"\"\t🏠\t\r\n",
        )
        .unwrap();
        assert_eq!(
            t.rijen(),
            &[
                vec![
                    "café".to_string(),
                    "regel één\nregel twee".into(),
                    "".into()
                ],
                vec!["een \"citaat\"".into(), "🏠".into(), "".into()]
            ]
        );
        assert_eq!(CelTekst::lees(&t.schrijf().unwrap()).unwrap(), t);
        assert_eq!(
            CelTekst::lees("a\tb\n1").unwrap().rijen(),
            &[
                vec!["a".to_string(), "b".into()],
                vec!["1".into(), "".into()]
            ]
        );
        assert_eq!(CelTekst::lees("\n\n").unwrap().hoogte(), 2);
        assert_eq!(CelTekst::lees("a\t").unwrap().breedte(), 2);
        assert_eq!(CelTekst::lees("").unwrap().rijen(), &[vec![String::new()]]);
        for rijen in [
            vec![vec!["a".into()], vec![String::new()]],
            vec![vec![String::new()], vec![String::new()]],
            vec![vec![String::new(); 2]; 2],
        ] {
            let t = CelTekst::nieuw(rijen).unwrap();
            assert_eq!(
                CelTekst::lees(&t.schrijf().unwrap()).unwrap(),
                t,
                "Lege laatste rij moet behouden blijven"
            );
        }
    }
    #[test]
    fn celtekst_onvolledige_quotes_nultekens_en_rechthoekbudget_worden_geweigerd() {
        for s in ["\"onafgesloten", "\"klaar\"erachter", "tekst\0rest"] {
            assert!(CelTekst::lees(s).is_err(), "{s:?}");
        }
        assert!(CelTekst::lees(&"a".repeat(MAX_BYTES + 1)).is_err());
        assert!(CelTekst::nieuw(vec![vec![String::new(); 100]; 101]).is_err());
        assert!(CelTekst::nieuw(vec![vec![String::new(); 100]; 100]).is_ok());
        assert!(CelTekst::nieuw(vec![]).is_err());
        assert!(CelTekst::lees(&format!("{}\n{}", "x\t".repeat(100), "\n".repeat(100))).is_err());
        let t = CelTekst::nieuw(vec![vec!["\"".repeat(MAX_BYTES)]]).unwrap();
        assert!(t.schrijf().is_err());
    }
}

#[cfg(test)]
mod aanvullende_proeven {
    use super::*;
    #[test]
    fn xmltekens_en_rechthoekbudget_worden_voor_opslaan_gecontroleerd() {
        for t in [
            "a\0b",
            "a\u{1}b",
            "a\u{b}b",
            "a\u{c}b",
            "a\u{1f}b",
            "a\u{fffe}b",
            "a\u{ffff}b",
        ] {
            assert!(CelTekst::lees(t).is_err());
            assert!(CelTekst::nieuw(vec![vec![t.into()]]).is_err());
        }
        let geldig = CelTekst::lees("\"regel\r\nregel\"\t\"🏠\twaarde\"").unwrap();
        assert_eq!(CelTekst::lees(&geldig.schrijf().unwrap()).unwrap(), geldig);
        let rij = "\t".repeat(99) + "\n";
        let t = CelTekst::lees(&rij.repeat(100)).unwrap();
        assert_eq!((t.hoogte(), t.breedte()), (100, 100));
        assert!(CelTekst::lees(&rij.repeat(101)).is_err());
    }
}
