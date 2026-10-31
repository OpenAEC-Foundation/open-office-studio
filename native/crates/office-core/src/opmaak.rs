//! Getypeerde opdrachten; een ongeldige waarde wordt vóór de mutatie geweigerd.
use crate::document::{Fout, Resultaat};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Uitlijning {
    Links,
    Midden,
    Rechts,
    Uitvullen,
}
#[derive(Debug, Clone)]
pub enum Opmaak {
    Vet(bool),
    Cursief(bool),
    Onderstrepen(bool),
    Doorhalen(bool),
    Lettergrootte(f64),
    Lettertype(String),
    Kleur(String),
    Achtergrond(String),
    Uitlijning(Uitlijning),
    Getal(String),
    Tekstterugloop(bool),
}
impl Opmaak {
    pub fn controleer(&self) -> Resultaat<()> {
        let geldig = match self {
            Self::Lettergrootte(n) => n.is_finite() && (1.0..=400.0).contains(n),
            Self::Lettertype(s) => {
                !s.trim().is_empty() && s.len() <= 128 && !s.chars().any(char::is_control)
            }
            Self::Kleur(s) | Self::Achtergrond(s) => {
                s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
            }
            Self::Getal(s) => !s.is_empty() && s.len() <= 256,
            _ => true,
        };
        if geldig {
            Ok(())
        } else {
            Err(Fout::Document("Ongeldige opmaakwaarde".into()))
        }
    }
}
#[derive(Debug, Clone, Default, PartialEq)]
pub struct OpmaakStaat {
    pub vet: bool,
    pub cursief: bool,
    pub onderstrepen: bool,
    pub doorhalen: bool,
    pub grootte: Option<f64>,
    pub lettertype: Option<String>,
}
